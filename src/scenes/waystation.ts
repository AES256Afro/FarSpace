// Your waystation: a beacon or depot with a deck bolted on. A till, a bar the
// regulars drink at, a bunk, and the airlock back to your ship.

import { Game, Scene, VW } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { RNG, hashStr } from "../core/rng";
import { Infra, collectInfra, repairInfra, stockDepot, drawDepot, DEPOT_CAP, isFriend, findStation, infraTraffic, infraLit } from "../world";
import { genPersonName } from "../data/data";
import { sfx } from "../core/sfx";
import * as wire from "../core/wire";
import { T, moveWalker, deckOrigin, drawTiles, drawPerson, drawKiosk, nearestTile, tooltip, footer } from "./walkbase";

const DECK = [
  "####################",
  "#..T.....RR.......B#",
  "#..................#",
  "#..................#",
  "#........A.........#",
  "####################",
];

interface Npc { x: number; y: number; name: string; skin: string; suit: string; line: string; friend: boolean }

export class WaystationScene implements Scene {
  touchMode = "walk" as const;
  px = 9 * T; py = 3 * T + 5;
  inf!: Infra;
  npcs: Npc[] = [];
  msg = ""; msgTimer = 0;

  enter(g: Game): void {
    const inf = g.infraTarget;
    if (!inf) { g.setScene("flight"); return; }
    this.inf = inf;
    this.px = 9 * T; this.py = 3 * T + 5;
    const w = g.world;
    const rng = new RNG(hashStr(inf.id) ^ Math.floor(w.time / 120));
    this.npcs = [];
    // who's at the bar: friends first, then whoever is passing through
    const friends = (w.captains ?? []).filter(isFriend);
    const passing = (w.captains ?? []).filter((c) => !isFriend(c));
    const seats = Math.min(3, 1 + Math.floor(infraTraffic(w, inf.systemId) / 3));
    const picks = [...(friends.length ? [rng.pick(friends)] : []), ...Array.from({ length: seats }, () => rng.pick(passing))].filter((c, i, a) => c && a.indexOf(c) === i).slice(0, 3);
    for (const c of picks) {
      const home = findStation(w, c.homeStationId)?.st.name ?? "somewhere";
      const line = isFriend(c) ? rng.pick([`${c.name}: 'Your place now, is it? Good. The coffee's better than at ${home}.'`, `${c.name}: 'I tell everyone about this stop. Don't let it go dark.'`])
        : rng.pick([`${c.name}: 'Nice to have somewhere to stop out here. Whoever built this, I owe them a drink.'`, `${c.name}: 'Beacon saved my tank last week. Now there's a bar. Progress.'`, `${c.name}: 'The ${c.ship}'s outside. Don't scratch her.'`]);
      this.npcs.push({ x: rng.int(3, 16) * T, y: rng.int(1, 3) * T + 5, name: c.name, skin: rng.pick(["#e8b48c", "#c78a5a", "#f0d0b0"]), suit: isFriend(c) ? "#c7a54a" : rng.pick(["#3a6ea5", "#3aa55e", "#5d6680"]), line, friend: isFriend(c) });
    }
    if (!this.npcs.length) this.npcs.push({ x: 12 * T, y: 2 * T + 5, name: genPersonName(rng), skin: "#e8b48c", suit: "#5d6680", line: "'Quiet tonight. It's usually quiet. That's the point of it.'", friend: false });
    this.msg = `${inf.kind === "beacon" ? "BEACON" : "DEPOT"} WAYSTATION - ${w.systems[inf.systemId]?.name.toUpperCase() ?? ""}`;
    this.msgTimer = 3;
  }

  solid(tx: number, ty: number): boolean {
    if (ty < 0 || ty >= DECK.length || tx < 0 || tx >= DECK[0].length) return true;
    const ch = DECK[ty][tx];
    return ch !== ".";
  }
  say(m: string): void { this.msg = m; this.msgTimer = 4; }

  update(g: Game, dt: number): void {
    const inp = g.input;
    const p = g.world.player;
    if (inp.wasPressed("Escape")) { g.scenes.flight && ((g.scenes.flight as unknown as { resumeNext: boolean }).resumeNext = true); g.setScene("flight"); return; }
    moveWalker(g, this, dt, (tx, ty) => this.solid(tx, ty));
    const near = nearestTile(DECK, this.px, this.py, "TRBA");
    const npc = this.npcs.find((n) => Math.hypot(n.x - this.px, n.y - this.py) < 16);
    if (inp.wasPressed("e")) {
      const inf = this.inf;
      if (near?.ch === "T") {
        const c = collectInfra(inf, p); const lines: string[] = [];
        if (c > 0) { lines.push(`TILL +${c}CR`); sfx.pickup(); }
        if (inf.health < 100) lines.push(repairInfra(inf, p) ? `PATCHED: ${inf.health}%` : `${inf.health}% - BRING PARTS`);
        if (inf.kind === "depot") { if (p.fuel < p.fuelMax * 0.5 && inf.stock > 0) { const n = drawDepot(inf, p); if (n) lines.push(`DREW ${n} FUEL`); } else { const n = stockDepot(inf, p, 40); lines.push(n ? `STOCKED ${n} (${inf.stock}/${DEPOT_CAP})` : `STOCK ${inf.stock}/${DEPOT_CAP}`); } }
        this.say(lines.length ? lines.join(" - ") : "THE TILL IS EMPTY. TRAFFIC PAYS BY THE HOUR.");
      } else if (near?.ch === "R") {
        for (const c of p.crew) c.morale = Math.min(100, c.morale + 3);
        this.say(p.crew.length ? "A ROUND FOR THE CREW AT YOUR OWN BAR. MORALE UP." : "YOU POUR YOURSELF ONE. NOBODY CHARGES YOU.");
      } else if (near?.ch === "B") { p.hull = Math.min(p.hullMax, p.hull + 10); p.shield = p.shieldMax; p.oxygen = p.oxygenMax; this.say("YOU SLEEP IN YOUR OWN BUNK, IN YOUR OWN PLACE. +10 HULL."); }
      else if (near?.ch === "A") { (g.scenes.flight as unknown as { resumeNext: boolean }).resumeNext = true; g.setScene("flight"); return; }
      else if (npc) this.say(`${npc.name.toUpperCase()}: ${npc.line.replace(npc.name + ": ", "")}`);
    }
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.msg = ""; }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    const p = g.world.player;
    const inf = this.inf;
    ctx.fillStyle = "#0a0d18"; ctx.fillRect(0, 0, VW, 270);
    const [ox, oy] = deckOrigin(DECK, 14);
    drawTiles(ctx, DECK, ox, oy, (ch, x, y) => {
      if (ch === "T") drawKiosk(ctx, x, y, PAL.gold, true);
      else if (ch === "R") drawKiosk(ctx, x, y, "#7a5aa5", true);
      else if (ch === "B") drawKiosk(ctx, x, y, "#3a6ea5", false);
      else if (ch === "A") drawKiosk(ctx, x, y, PAL.warn, true);
      return true;
    });
    for (const n of this.npcs) { drawPerson(ctx, Math.round(ox + n.x), Math.round(oy + n.y), n.skin, n.suit); if (n.friend) { ctx.fillStyle = PAL.gold; ctx.fillRect(Math.round(ox + n.x) - 1, Math.round(oy + n.y) - 8, 2, 2); } }
    drawPerson(ctx, Math.round(ox + this.px), Math.round(oy + this.py), "#e8b48c", "#3a6ea5");
    const near = nearestTile(DECK, this.px, this.py, "TRBA");
    if (near) { const label = near.ch === "T" ? "THE TILL" : near.ch === "R" ? "YOUR BAR" : near.ch === "B" ? "YOUR BUNK" : "AIRLOCK"; tooltip(ctx, ox, oy, near.tx, near.ty, label, near.ch === "A" ? "[E] BACK TO THE SHIP" : "[E] USE"); }
    const npc = this.npcs.find((n) => Math.hypot(n.x - this.px, n.y - this.py) < 16);
    if (npc) drawText(ctx, `${npc.name}${npc.friend ? " - FRIEND" : ""} [E]`, ox + npc.x - textWidth(npc.name) / 2, oy + npc.y - 12, npc.friend ? PAL.gold : PAL.grey);
    drawText(ctx, `${(inf.owner === (wire.getCallsign() ?? "YOU") ? "YOUR" : inf.owner + "'S")} WAYSTATION - ${(g.world.systems[inf.systemId]?.name ?? "").toUpperCase()}`, 8, 6, PAL.white);
    drawText(ctx, `TILL ${Math.round(inf.till)}CR   EARNED ${inf.earned}CR   ${inf.health}%${infraLit(inf) ? "" : " DARK"}   TRAFFIC ${infraTraffic(g.world, inf.systemId)}${inf.kind === "depot" ? `   FUEL ${inf.stock}/${DEPOT_CAP}` : ""}`, 8, 15, PAL.gold);
    drawText(ctx, `${p.credits}CR  PARTS ${p.cargo.parts ?? 0}`, VW - 110, 6, PAL.grey);
    drawText(ctx, "ESC SHIP", VW - textWidth("ESC SHIP") - 6, 15, PAL.greyDark);
    footer(ctx, g, this.msg);
  }
}
