// Surface outpost: a small walkable landing site with a trade desk, a survey
// office, a bunk, and the pad back to orbit.

import { Game, Scene, VW } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { RNG, hashStr } from "../core/rng";
import { addCargo, removeCargo, cargoUsed, adjustRep, Poi, Region } from "../world";
import { commodity, faction, genPersonName } from "../data/data";
import { sfx } from "../core/sfx";
import { T, moveWalker, deckOrigin, drawTiles, drawPerson, drawKiosk, nearestTile, tooltip, footer } from "./walkbase";

const DECK = [
  "######################",
  "#~~~~~~~~~~~~~~~~~~~~#",
  "#....T..........S....#",
  "#....................#",
  "#..B.................#",
  "#....................#",
  "#..........A.........#",
  "######################",
];

interface Npc { x: number; y: number; name: string; skin: string; suit: string; line: string }

export class OutpostScene implements Scene {
  touchMode = "walk" as const;
  px = 11 * T; py = 5 * T + 5;
  poi!: Poi; region!: Region;
  npcs: Npc[] = [];
  trade: { open: boolean; cursor: number; rows: { id: string; buy: number; sell: number }[] } = { open: false, cursor: 0, rows: [] };
  msg = ""; msgTimer = 0;
  rowBoxes: [number, number][] = [];

  enter(g: Game): void {
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    const pl = sys.planets[g.orbitPlanetIdx];
    const surf = pl.surface!;
    const poi = surf.pois.find((x) => x.id === g.landedPoiId);
    if (!poi) { g.setScene("orbit"); return; }
    this.poi = poi;
    this.region = surf.regions[poi.regionIdx];
    this.px = 11 * T; this.py = 5 * T + 5;
    this.trade.open = false;
    const rng = new RNG(hashStr(poi.id) ^ g.world.seed);
    this.npcs = [];
    for (let i = 0; i < 3; i++) {
      this.npcs.push({
        x: rng.int(3, 18) * T, y: rng.int(2, 5) * T + 5,
        name: genPersonName(rng),
        skin: rng.pick(["#e8b48c", "#c78a5a", "#8c5a3a", "#f0d0b0"]),
        suit: rng.pick(["#3a6ea5", "#c7a54a", "#3aa55e", "#5d6680"]),
        line: rng.pick(OUTPOST_LINES)(this.poi, this.region),
      });
    }
    // trade desk: the region's resource sells cheap; food/med/parts buy dear
    const res = this.region.resource;
    const rows = [
      { id: res, buy: Math.round(commodity(res).base * 0.55), sell: Math.round(commodity(res).base * 0.4) },
      { id: "food", buy: Math.round(commodity("food").base * 1.5), sell: Math.round(commodity("food").base * 1.3) },
      { id: "med", buy: Math.round(commodity("med").base * 1.4), sell: Math.round(commodity("med").base * 1.25) },
      { id: "parts", buy: Math.round(commodity("parts").base * 1.4), sell: Math.round(commodity("parts").base * 1.2) },
    ];
    this.trade.rows = rows.filter((r, i, a) => a.findIndex((x) => x.id === r.id) === i);
    this.trade.cursor = 0;
    this.msg = `LANDED: ${poi.name.toUpperCase()}`;
    this.msgTimer = 3;
    p.oxygen = p.oxygenMax;
  }

  solid(tx: number, ty: number): boolean {
    if (ty < 0 || ty >= DECK.length || tx < 0 || tx >= DECK[0].length) return true;
    const ch = DECK[ty][tx];
    return ch !== "." && ch !== "D";
  }

  say(m: string): void { this.msg = m; this.msgTimer = 3; }

  update(g: Game, dt: number): void {
    const inp = g.input;
    const p = g.world.player;
    if (this.trade.open) {
      if (inp.wasPressed("Escape")) { this.trade.open = false; return; }
      if (inp.wasPressed("ArrowUp")) { this.trade.cursor--; sfx.blip(); }
      if (inp.wasPressed("ArrowDown")) { this.trade.cursor++; sfx.blip(); }
      const row = this.rowBoxes.findIndex(([y0, y1]) => inp.mouseY >= y0 && inp.mouseY <= y1);
      if (row >= 0 && inp.mouseX > 100 && inp.mouseX < 380) { this.trade.cursor = row; }
      const n = this.trade.rows.length;
      this.trade.cursor = ((this.trade.cursor % n) + n) % n;
      const r = this.trade.rows[this.trade.cursor];
      if (inp.wasPressed("Enter") || inp.wasPressed("b") || (inp.mousePressed && row >= 0)) {
        if (p.credits < r.buy) g.toast("NOT ENOUGH CREDITS");
        else if (!addCargo(p, r.id, 1)) g.toast("CARGO FULL");
        else { p.credits -= r.buy; sfx.select(); }
      }
      if (inp.wasPressed("s")) {
        if (!removeCargo(p, r.id, 1)) g.toast("NONE IN CARGO");
        else { p.credits += r.sell; sfx.select(); }
      }
      return;
    }
    if (inp.wasPressed("Escape")) { g.setScene("orbit"); return; }
    moveWalker(g, this, dt, (tx, ty) => this.solid(tx, ty));
    const near = nearestTile(DECK, this.px, this.py, "TSBA");
    const npc = this.npcs.find((n) => Math.hypot(n.x - this.px, n.y - this.py) < 16);
    if (inp.wasPressed("e")) {
      if (near?.ch === "T") { this.trade.open = true; sfx.select(); }
      else if (near?.ch === "S") {
        const sys = g.world.systems[p.systemId];
        const surf = sys.planets[g.orbitPlanetIdx].surface!;
        if (!surf.scanned) this.say("SURVEY OFFICE: SCAN THE PLANET FROM ORBIT FIRST (HOLD V)");
        else if (!surf.surveyFiled) {
          // one-time bonus for filing the survey here
          const pay = 60 * surf.pois.length;
          p.credits += pay;
          surf.surveyFiled = true;
          this.say(`SURVEY FILED +${pay}CR`);
          if (this.region.factionId) adjustRep(g.world, this.region.factionId, 4);
          sfx.pickup();
        } else this.say("SURVEY OFFICE: NOTHING NEW TO FILE");
      }
      else if (near?.ch === "B") { p.hull = Math.min(p.hullMax, p.hull + 15); p.shield = p.shieldMax; this.say("YOU REST UNDER A REAL SKY. +15 HULL"); }
      else if (near?.ch === "A") { g.setScene("orbit"); return; }
      else if (npc) { this.say(`${npc.name.toUpperCase()}: ${npc.line}`); }
    }
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.msg = ""; }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    this.rowBoxes = [];
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    const pl = sys.planets[g.orbitPlanetIdx];
    // sky: planet palette tint
    ctx.fillStyle = "#0a0d18";
    ctx.fillRect(0, 0, VW, 270);
    const [ox, oy] = deckOrigin(DECK, 14);
    // surface horizon strip
    ctx.fillStyle = this.region.color;
    ctx.globalAlpha = 0.25; ctx.fillRect(0, oy - 20, VW, 20); ctx.globalAlpha = 1;
    drawTiles(ctx, DECK, ox, oy, (ch, x, y) => {
      if (ch === "T") drawKiosk(ctx, x, y, PAL.gold, true);
      else if (ch === "S") drawKiosk(ctx, x, y, PAL.info, true);
      else if (ch === "B") drawKiosk(ctx, x, y, "#7a5aa5", false);
      else if (ch === "A") drawKiosk(ctx, x, y, PAL.warn, true);
      return true;
    });
    for (const n of this.npcs) drawPerson(ctx, Math.round(ox + n.x), Math.round(oy + n.y), n.skin, n.suit);
    drawPerson(ctx, Math.round(ox + this.px), Math.round(oy + this.py), "#e8b48c", "#3a6ea5");
    const near = nearestTile(DECK, this.px, this.py, "TSBA");
    if (near) {
      const label = near.ch === "T" ? "TRADE DESK" : near.ch === "S" ? "SURVEY OFFICE" : near.ch === "B" ? "BUNKHOUSE" : "LANDING PAD";
      tooltip(ctx, ox, oy, near.tx, near.ty, label, near.ch === "A" ? "[E] RETURN TO ORBIT" : "[E] USE");
    }
    const npc = this.npcs.find((n) => Math.hypot(n.x - this.px, n.y - this.py) < 16);
    if (npc) drawText(ctx, `${npc.name} [E]`, ox + npc.x - textWidth(npc.name) / 2, oy + npc.y - 12, PAL.grey);
    const fac = this.region.factionId ? faction(this.region.factionId) : null;
    drawText(ctx, `${this.poi.name.toUpperCase()} - ${pl.name.toUpperCase()}`, 8, 6, PAL.white);
    drawText(ctx, `${this.region.name} - ${fac ? fac.name : "UNCLAIMED"} - YIELDS ${this.region.resource.toUpperCase()}`, 8, 15, fac ? fac.color : PAL.grey);
    drawText(ctx, `${p.credits}CR  CARGO ${cargoUsed(p)}/${p.cargoMax}`, VW - 110, 6, PAL.gold);
    drawText(ctx, "ESC ORBIT", VW - textWidth("ESC ORBIT") - 6, 15, PAL.greyDark);
    footer(ctx, g, this.msg);

    if (this.trade.open) {
      ctx.fillStyle = "rgba(8,12,22,0.94)";
      ctx.fillRect(90, 60, 300, 130);
      ctx.strokeStyle = PAL.uiBorder; ctx.strokeRect(90.5, 60.5, 299, 129);
      drawText(ctx, "OUTPOST TRADE DESK  -  ENTER/B BUY   S SELL   ESC CLOSE", 98, 66, PAL.greyDark);
      drawText(ctx, "GOODS", 98, 80, PAL.greyDark); drawText(ctx, "BUY", 230, 80, PAL.greyDark); drawText(ctx, "SELL", 270, 80, PAL.greyDark); drawText(ctx, "HELD", 320, 80, PAL.greyDark);
      this.trade.rows.forEach((r, i) => {
        const y = 92 + i * 11;
        this.rowBoxes.push([y - 2, y + 8]);
        if (i === this.trade.cursor) { ctx.fillStyle = "#13203a"; ctx.fillRect(94, y - 2, 292, 10); }
        const c = commodity(r.id);
        drawText(ctx, c.name, 98, y, c.illegal ? PAL.danger : PAL.white);
        drawText(ctx, `${r.buy}`, 230, y, PAL.gold);
        drawText(ctx, `${r.sell}`, 270, y, PAL.gold);
        drawText(ctx, `${p.cargo[r.id] ?? 0}`, 320, y, PAL.ui);
      });
    }
  }
}

const OUTPOST_LINES: ((poi: Poi, r: Region) => string)[] = [
  (poi, r) => `We pull ${r.resource} out of the ${r.name} and ship it up the well. Not glamorous.`,
  (poi) => `${poi.kind === "ruin" ? "Nobody knows who built the ruins. Nobody asks twice." : "Dust storms every third day. You get used to it."}`,
  (_, r) => r.factionId ? `The ${r.factionId.toUpperCase()} flag's on the pad but they don't come down here much.` : "No flag on this pad. We like it that way.",
  () => "Orbit's crowded with satellites. Somebody up there is watching somebody.",
  () => "If you're heading back up, take our survey data to any station. They pay.",
];
