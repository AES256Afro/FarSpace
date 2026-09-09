// City district: land at a city POI for a bigger walkable street with a market,
// a bar that hires crew, a contracts office, and residents who talk.

import { Game, Scene, VW } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { RNG, hashStr } from "../core/rng";
import { addCargo, removeCargo, cargoUsed, Poi, Region, Mission, genCrewCandidate, missionDeliverable, adjustRep, genMissionsFor, findStation } from "../world";
import { commodity, faction, genPersonName } from "../data/data";
import { CrewMember, ROLE_INFO } from "../data/crew";
import { hull } from "../data/hulls";
import { sfx } from "../core/sfx";
import { music } from "../core/music";
import { T, moveWalker, deckOrigin, drawTiles, drawPerson, drawKiosk, nearestTile, tooltip, footer } from "./walkbase";

const DECK = [
  "############################################",
  "#~~~~~#..T.......#........#....R.....#~~~~~#",
  "#.....#..........D........D..........#.....#",
  "#.....D..........#........#..........D.....#",
  "#.....#..........#........#..........#.....#",
  "###D#########D############D########D#######",
  "#..........................................#",
  "#....B..........................A..........#",
  "#..........................................#",
  "#..~~~~~~....~~~~~~~~....~~~~~~~....~~~~~..#",
  "############################################",
];

interface Resident { x: number; y: number; tx: number; ty: number; name: string; skin: string; suit: string; line: string; pause: number }

type Panel = "none" | "market" | "bar" | "board";

export class CityScene implements Scene {
  touchMode = "walk" as const;
  px = 32 * T; py = 7 * T + 5;
  poi!: Poi; region!: Region;
  residents: Resident[] = [];
  panel: Panel = "none";
  cursor = 0;
  rowBoxes: [number, number][] = [];
  rows: { id: string; buy: number; sell: number }[] = [];
  candidates: CrewMember[] = [];
  board: Mission[] = [];
  msg = ""; msgTimer = 0;

  enter(g: Game): void {
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    const surf = sys.planets[g.orbitPlanetIdx].surface!;
    const poi = surf.pois.find((x) => x.id === g.landedPoiId);
    if (!poi) { g.setScene("orbit"); return; }
    this.poi = poi;
    this.region = surf.regions[poi.regionIdx];
    this.px = 32 * T; this.py = 7 * T + 5;
    this.panel = "none";
    const rng = new RNG(hashStr(poi.id) ^ g.world.seed ^ Math.floor(g.world.time / 120));
    this.residents = [];
    for (let i = 0; i < 6; i++) {
      const spot = this.randomFloor(rng);
      this.residents.push({
        x: spot.x, y: spot.y, tx: spot.x, ty: spot.y, pause: rng.range(0, 3),
        name: genPersonName(rng),
        skin: rng.pick(["#e8b48c", "#c78a5a", "#8c5a3a", "#f0d0b0", "#a86f48"]),
        suit: rng.pick(["#3a6ea5", "#7a5aa5", "#3aa55e", "#a53a3a", "#c7a54a", "#5d6680"]),
        line: rng.pick(CITY_LINES)(this.poi, this.region, g),
      });
    }
    const res = this.region.resource;
    const goods = [res, "food", "water", "med", "parts", "lux"].filter((v, i, a) => a.indexOf(v) === i);
    this.rows = goods.map((id) => {
      const c = commodity(id);
      const m = id === res ? 0.6 : id === "lux" ? 0.9 : 1.25;
      return { id, buy: Math.round(c.base * m), sell: Math.round(c.base * m * 0.85) };
    });
    this.candidates = [];
    for (let i = 0; i < rng.int(1, 2); i++) this.candidates.push(genCrewCandidate(rng.fork(i + 7)));
    // contracts: posted here, turned in here; use the system's first station as the economic anchor
    const anchor = sys.stations[0];
    this.board = anchor ? genMissionsFor(g.world, anchor, rng.fork(99)).filter((m) => m.kind === "bounty" || m.kind === "research" || m.kind === "mining").slice(0, 3) : [];
    for (const m of this.board) { m.fromStationId = poi.id; if (m.kind === "mining") m.targetStationId = poi.id; m.title = `City: ${m.title}`; }
    this.msg = `${poi.name.toUpperCase()} - ${this.region.name.toUpperCase()}`;
    this.msgTimer = 3;
    p.oxygen = p.oxygenMax;
    music.setMood(this.region.factionId ?? "void", 0);
    g.showHint("city", "CITIES HAVE A MARKET, A BAR THAT HIRES, AND A CONTRACTS OFFICE");
  }

  randomFloor(rng: RNG): { x: number; y: number } {
    for (let i = 0; i < 100; i++) {
      const tx = rng.int(1, DECK[0].length - 2), ty = rng.int(6, 8);
      if (DECK[ty][tx] === ".") return { x: tx * T + T / 2, y: ty * T + T / 2 };
    }
    return { x: 10 * T, y: 7 * T };
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
    if (this.panel !== "none") { this.updatePanel(g); return; }
    if (inp.wasPressed("Escape")) { g.setScene("orbit"); return; }
    if (inp.wasPressed("F5")) g.save();
    moveWalker(g, this, dt, (tx, ty) => this.solid(tx, ty));
    for (const r of this.residents) {
      if (r.pause > 0) { r.pause -= dt; continue; }
      const d = Math.hypot(r.tx - r.x, r.ty - r.y);
      if (d < 2) { const rng = new RNG((Math.random() * 1e9) >>> 0); r.pause = rng.range(1, 5); const s = this.randomFloor(rng); r.tx = s.x; r.ty = s.y; }
      else { const st = 20 * dt; r.x += ((r.tx - r.x) / d) * st; r.y += ((r.ty - r.y) / d) * st; }
    }
    const near = nearestTile(DECK, this.px, this.py, "TRBA");
    const res = this.residents.find((r) => Math.hypot(r.x - this.px, r.y - this.py) < 16);
    if (inp.wasPressed("e")) {
      if (near?.ch === "T") { this.panel = "market"; this.cursor = 0; sfx.select(); }
      else if (near?.ch === "R") { this.panel = "bar"; this.cursor = 0; sfx.select(); }
      else if (near?.ch === "B") { this.panel = "board"; this.cursor = 0; sfx.select(); }
      else if (near?.ch === "A") { g.setScene("orbit"); return; }
      else if (res) this.say(`${res.name.toUpperCase()}: ${res.line}`);
    }
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.msg = ""; }
    void p;
  }

  updatePanel(g: Game): void {
    const inp = g.input;
    const p = g.world.player;
    if (inp.wasPressed("Escape")) { this.panel = "none"; return; }
    if (inp.wasPressed("ArrowUp")) { this.cursor--; sfx.blip(); }
    if (inp.wasPressed("ArrowDown")) { this.cursor++; sfx.blip(); }
    const row = this.rowBoxes.findIndex(([y0, y1]) => inp.mouseY >= y0 && inp.mouseY <= y1);
    if (row >= 0 && inp.mouseX > 60 && inp.mouseX < 420) this.cursor = row;
    const enter = inp.wasPressed("Enter") || inp.wasPressed("b") || (inp.mousePressed && row >= 0);
    if (this.panel === "market") {
      const n = this.rows.length; this.cursor = ((this.cursor % n) + n) % n;
      const r = this.rows[this.cursor];
      if (enter) { if (p.credits < r.buy) g.toast("NOT ENOUGH CREDITS"); else if (!addCargo(p, r.id, 1)) g.toast("CARGO FULL"); else { p.credits -= r.buy; sfx.select(); } }
      if (inp.wasPressed("s")) { if (!removeCargo(p, r.id, 1)) g.toast("NONE IN CARGO"); else { p.credits += r.sell; sfx.select(); } }
    } else if (this.panel === "bar") {
      const n = Math.max(1, this.candidates.length); this.cursor = ((this.cursor % n) + n) % n;
      const c = this.candidates[this.cursor];
      if (enter && c) {
        const slots = hull(p.hullId).crewSlots, cost = c.wage * 3;
        if (p.crew.length >= slots) g.toast(`NO BERTHS LEFT (${slots})`);
        else if (p.credits < cost) g.toast(`SIGNING BONUS ${cost}CR - NOT ENOUGH`);
        else { p.credits -= cost; p.crew.push({ ...c }); this.candidates = this.candidates.filter((x) => x !== c); g.toast(`${c.name.toUpperCase()} SIGNED ON`); sfx.pickup(); }
      }
    } else if (this.panel === "board") {
      const fake = { id: this.poi.id } as unknown as Parameters<typeof missionDeliverable>[2];
      const ready = p.missions.filter((m) => missionDeliverable(g.world, m, fake));
      const avail = this.board.filter((m) => !m.accepted);
      const n = Math.max(1, ready.length + avail.length); this.cursor = ((this.cursor % n) + n) % n;
      if (enter) {
        if (this.cursor < ready.length) {
          const m = ready[this.cursor];
          if (m.commodityId && m.qty && m.kind !== "research") removeCargo(p, m.commodityId, m.qty);
          m.done = true; p.credits += m.reward;
          if (this.region.factionId) adjustRep(g.world, this.region.factionId, m.repReward ?? 3);
          p.missions = p.missions.filter((x) => !x.done);
          g.toast(`CONTRACT COMPLETE +${m.reward}CR`); sfx.pickup();
        } else {
          const m = avail[this.cursor - ready.length];
          if (m) {
            if (p.missions.filter((x) => x.accepted && !x.done).length >= 5) g.toast("MISSION LOG FULL");
            else { m.accepted = true; p.missions.push(m); g.toast("CONTRACT ACCEPTED"); sfx.select(); }
          }
        }
      }
    }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    this.rowBoxes = [];
    const p = g.world.player;
    const fac = this.region.factionId ? faction(this.region.factionId) : null;
    ctx.fillStyle = "#0a0d18";
    ctx.fillRect(0, 0, VW, 270);
    const [ox, oy] = deckOrigin(DECK, 12);
    ctx.fillStyle = this.region.color; ctx.globalAlpha = 0.2; ctx.fillRect(0, oy - 24, VW, 24); ctx.globalAlpha = 1;
    // skyline
    for (let i = 0; i < 40; i++) { const h = 6 + ((i * 7919) % 14); ctx.fillStyle = i % 3 ? "#141a2e" : "#1a2236"; ctx.fillRect(ox + i * 11, oy - h, 9, h); if (i % 2) { ctx.fillStyle = PAL.gold; ctx.fillRect(ox + i * 11 + 3, oy - h + 2, 1, 1); } }
    drawTiles(ctx, DECK, ox, oy, (ch, x, y) => {
      if (ch === "T") drawKiosk(ctx, x, y, PAL.gold, true);
      else if (ch === "R") drawKiosk(ctx, x, y, "#c7a54a", true);
      else if (ch === "B") drawKiosk(ctx, x, y, PAL.ui, true);
      else if (ch === "A") drawKiosk(ctx, x, y, PAL.warn, true);
      return true;
    });
    for (const r of this.residents) drawPerson(ctx, Math.round(ox + r.x), Math.round(oy + r.y), r.skin, r.suit);
    drawPerson(ctx, Math.round(ox + this.px), Math.round(oy + this.py), "#e8b48c", "#3a6ea5");
    const near = nearestTile(DECK, this.px, this.py, "TRBA");
    if (near) {
      const label = near.ch === "T" ? "STREET MARKET" : near.ch === "R" ? "CANTINA" : near.ch === "B" ? "CONTRACTS OFFICE" : "LANDING PAD";
      tooltip(ctx, ox, oy, near.tx, near.ty, label, near.ch === "A" ? "[E] RETURN TO ORBIT" : "[E] ENTER");
    }
    const res = this.residents.find((r) => Math.hypot(r.x - this.px, r.y - this.py) < 16);
    if (res) drawText(ctx, `${res.name} [E]`, ox + res.x - textWidth(res.name) / 2, oy + res.y - 12, PAL.grey);
    drawText(ctx, `${this.poi.name.toUpperCase()} - CITY`, 8, 6, PAL.white);
    drawText(ctx, `${this.region.name} - ${fac ? fac.name : "FREE CITY"}`, 8, 15, fac ? fac.color : PAL.grey);
    drawText(ctx, `${p.credits}CR  CARGO ${cargoUsed(p)}/${p.cargoMax}  CREW ${p.crew.length}/${hull(p.hullId).crewSlots}`, VW - 150, 6, PAL.gold);
    drawText(ctx, "ESC ORBIT", VW - textWidth("ESC ORBIT") - 6, 15, PAL.greyDark);
    footer(ctx, g, this.msg);
    if (this.panel !== "none") this.drawPanel(g, ctx);
  }

  drawPanel(g: Game, ctx: CanvasRenderingContext2D): void {
    const p = g.world.player;
    ctx.fillStyle = "rgba(8,12,22,0.95)"; ctx.fillRect(60, 40, 360, 180);
    ctx.strokeStyle = PAL.uiBorder; ctx.strokeRect(60.5, 40.5, 359, 179);
    let y = 48;
    const rowAt = (i: number) => { this.rowBoxes.push([y - 2, y + 8]); if (i === this.cursor) { ctx.fillStyle = "#13203a"; ctx.fillRect(64, y - 2, 352, 10); } };
    if (this.panel === "market") {
      drawText(ctx, "STREET MARKET - ENTER/B BUY  S SELL  ESC CLOSE", 68, y, PAL.greyDark); y += 12;
      drawText(ctx, "GOODS", 68, y, PAL.greyDark); drawText(ctx, "BUY", 220, y, PAL.greyDark); drawText(ctx, "SELL", 260, y, PAL.greyDark); drawText(ctx, "HELD", 310, y, PAL.greyDark); y += 10;
      this.rows.forEach((r, i) => { rowAt(i); const c = commodity(r.id); drawText(ctx, c.name, 68, y, PAL.white); drawText(ctx, `${r.buy}`, 220, y, PAL.gold); drawText(ctx, `${r.sell}`, 260, y, PAL.gold); drawText(ctx, `${p.cargo[r.id] ?? 0}`, 310, y, PAL.ui); y += 11; });
    } else if (this.panel === "bar") {
      drawText(ctx, "CANTINA - HIRE (ENTER)  ESC CLOSE", 68, y, PAL.greyDark); y += 12;
      if (!this.candidates.length) drawText(ctx, "NOBODY'S LOOKING FOR A BERTH TONIGHT.", 68, y, PAL.greyDark);
      this.candidates.forEach((c, i) => { rowAt(i); ctx.drawImage(g.portrait(c.name), 68, y - 2, 12, 12); drawText(ctx, `${c.name} - ${ROLE_INFO[c.role].label} ${"*".repeat(c.skill)}`, 84, y, PAL.ui); y += 9; drawText(ctx, `${ROLE_INFO[c.role].effect}. WAGE ${c.wage}CR, BONUS ${c.wage * 3}CR`, 84, y, PAL.greyDark); y += 12; });
    } else {
      const fake = { id: this.poi.id } as unknown as Parameters<typeof missionDeliverable>[2];
      const ready = p.missions.filter((m) => missionDeliverable(g.world, m, fake));
      const avail = this.board.filter((m) => !m.accepted);
      drawText(ctx, "CONTRACTS OFFICE - ENTER ACCEPT / TURN IN  ESC CLOSE", 68, y, PAL.greyDark); y += 12;
      let i = 0;
      for (const m of ready) { rowAt(i++); drawText(ctx, `TURN IN: ${m.title} +${m.reward}CR`, 68, y, PAL.gold); y += 11; }
      if (!avail.length && !ready.length) drawText(ctx, "NO CONTRACTS POSTED.", 68, y, PAL.greyDark);
      for (const m of avail) { rowAt(i++); drawText(ctx, m.title, 68, y, PAL.white); drawText(ctx, `+${m.reward}CR`, 380, y, PAL.gold); y += 8; drawText(ctx, m.desc.slice(0, 84), 68, y, PAL.greyDark); y += 12; }
    }
  }
}

const CITY_LINES: ((poi: Poi, r: Region, g: Game) => string)[] = [
  (poi) => `${poi.name}'s not much, but the air's real and the beer's cold.`,
  (_, r) => r.factionId ? `The ${faction(r.factionId).name.split(" ")[0]} runs the pad and the taxes. Everything else runs itself.` : "No faction here. Nobody to complain to, nobody to bail you out.",
  (_, r) => `Everyone here works the ${r.resource}. Or sells things to people who do.`,
  (_, __, g) => { const w = g.world.wars[0]; return w ? `Heard ${g.world.systems[w.systemId].name} is a war zone. Prices up there are mad.` : "Quiet cycle. I'll take quiet."; },
  () => "There are ruins past the ridge. People go in with empty bags and come out with relics. Or don't come out.",
  () => "Research posts pay a fortune for relics. Trade hubs pay well. Don't sell them to a miner.",
  (_, __, g) => { const st = findStation(g.world, g.world.player.dockedAt ?? "") ; return st ? `${st.st.name}'s a fine station.` : "Up the well, the stations only care about cargo. Down here we care about rain."; },
];
