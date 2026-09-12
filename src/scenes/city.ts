// City district: land at a city POI for a bigger walkable street with a market,
// a bar that hires crew, a contracts office, and residents who talk.

import { Game, Scene, VW } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { settlementLine, berthsUsed, ledger } from "../world";
import { RNG, hashStr } from "../core/rng";
import { addCargo, removeCargo, cargoUsed, Poi, Region, Mission, genCrewCandidate, missionDeliverable, adjustRep, genMissionsFor, findStation } from "../world";
import { commodity, faction, genPersonName } from "../data/data";
import { CrewMember, ROLE_INFO } from "../data/crew";
import { hull } from "../data/hulls";
import { sfx } from "../core/sfx";
import { music } from "../core/music";
import { DeskMenu, deskClick, DESK_ACTION, DESK_SELL, DESK_INFO, DESK_CLOSE } from "./deskmenu";
import { mapButton } from "../core/mapview";
import { ReaderOverlay } from "./reader";
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
  get touchMode(): "walk" | "menu" { return this.panel !== "none" || this.info ? "menu" : "walk"; }
  // Stand beside the solid landing kiosk with the full walking hitbox on floor.
  px = 31 * T + T / 2; py = 7 * T + 5;
  poi!: Poi; region!: Region;
  residents: Resident[] = [];
  panel: Panel = "none";
  market = new DeskMenu<string>();
  bar = new DeskMenu<CrewMember>();
  contracts = new DeskMenu<string>();
  info?: ReaderOverlay;
  get pausesVoyage(): boolean { return !!this.info; }
  rows: { id: string; buy: number; sell: number }[] = [];
  candidates: CrewMember[] = [];
  board: Mission[] = [];
  msg = ""; msgTimer = 0;

  enter(g: Game): void {
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    const surf = sys.planets[g.orbitPlanetIdx].surface!;
    const poi = surf.pois.find((x) => x.id === g.landedPoiId);
    if (!poi) { g.setScene(g.surfaceReturn ? "surface" : "orbit"); return; }
    this.poi = poi;
    this.region = surf.regions[poi.regionIdx];
    this.px = 31 * T + T / 2; this.py = 7 * T + 5;
    this.panel = "none";
    this.onSceneLeave(); this.market = new DeskMenu(); this.bar = new DeskMenu(); this.contracts = new DeskMenu();
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
    if (this.info) { this.info.update(g); return; }
    if (this.panel !== "none") { this.updatePanel(g); return; }
    if (inp.wasPressed("Escape")) { g.setScene(g.surfaceReturn ? "surface" : "orbit"); return; }
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
      if (near?.ch === "T") { this.panel = "market"; this.market.view.sync(this.rows.map(r => r.id)); sfx.select(); }
      else if (near?.ch === "R") { this.panel = "bar"; this.bar.view.sync(this.candidates); sfx.select(); }
      else if (near?.ch === "B") { this.panel = "board"; this.contracts.view.sync(this.contractRows(g).map(r => r.key)); sfx.select(); }
      else if (near?.ch === "A") { g.setScene(g.surfaceReturn ? "surface" : "orbit"); return; }
      else if (res) this.say(`${res.name.toUpperCase()}: ${res.line}`);
    }
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.msg = ""; }
    void p;
  }

  onSceneLeave(): void { this.info?.onSceneLeave(); this.info = undefined; }

  contractRows(g: Game): { key: string; mission: Mission; ready: boolean }[] {
    const fake = { id: this.poi.id } as unknown as Parameters<typeof missionDeliverable>[2];
    return [
      ...g.world.player.missions.filter(m => missionDeliverable(g.world, m, fake)).map(mission => ({ key: `turnin:${mission.id}`, mission, ready: true })),
      ...this.board.filter(m => !m.accepted && !m.done).map(mission => ({ key: `accept:${mission.id}`, mission, ready: false })),
    ];
  }

  read(title: string, lines: string[]): void {
    this.info = new ReaderOverlay("DESK DETAILS", [[title, lines]], () => { this.info = undefined; });
  }

  updatePanel(g: Game): void {
    const inp = g.input, p = g.world.player;
    if (inp.wasPressed("Escape") || deskClick(inp, DESK_CLOSE)) { this.panel = "none"; return; }
    const enter = inp.wasPressed("Enter") || deskClick(inp, DESK_ACTION);
    const details = inp.wasPressed("i") || deskClick(inp, DESK_INFO);
    if (this.panel === "market") {
      const fresh = this.market.update(this.rows.map(r => r.id), inp);
      const r = this.rows.find(r => r.id === this.market.view.selected);
      if (!r || !fresh) return;
      if (details) { this.read(commodity(r.id).name, [`BUY ONE: ${r.buy}CR. SELL ONE: ${r.sell}CR.`, `HELD: ${p.cargo[r.id] ?? 0}. CARGO: ${cargoUsed(p)}/${p.cargoMax}.`, "BUY ADDS ONE UNIT TO CARGO. SELL REMOVES ONE UNIT FROM CARGO."]); return; }
      if (enter || inp.wasPressed("b")) {
        if (p.credits < r.buy) g.toast("NOT ENOUGH CREDITS");
        else if (!addCargo(p, r.id, 1)) g.toast("CARGO FULL");
        else { p.credits -= r.buy; ledger(p, "settlements", -r.buy); sfx.select(); g.autosave(); }
      } else if (inp.wasPressed("s") || deskClick(inp, DESK_SELL)) {
        if (!removeCargo(p, r.id, 1)) g.toast("NONE IN CARGO");
        else { p.credits += r.sell; ledger(p, "settlements", r.sell); sfx.select(); g.autosave(); }
      }
    } else if (this.panel === "bar") {
      const fresh = this.bar.update(this.candidates, inp), c = this.bar.view.selected;
      if (!c || !fresh) return;
      if (details) { this.read(c.name, [`${ROLE_INFO[c.role].label}. SKILL ${c.skill}.`, ROLE_INFO[c.role].effect, `WAGE: ${c.wage}CR EACH DOCKING. SIGNING BONUS: ${c.wage * 3}CR.`, c.trait ?? "", `BERTHS USED: ${berthsUsed(p)}/${hull(p.hullId).crewSlots}. CREW ON LEAVE KEEP THEIR BERTHS.`]); return; }
      if (enter) {
        const slots = hull(p.hullId).crewSlots, cost = c.wage * 3;
        if (berthsUsed(p) >= slots) g.toast(`NO BERTHS LEFT (${slots}, INCLUDING CREW ON LEAVE)`);
        else if (p.credits < cost) g.toast(`SIGNING BONUS ${cost}CR. NOT ENOUGH CREDITS`);
        else {
          p.credits -= cost; ledger(p, "crew", -cost); p.crew.push({ ...c });
          this.candidates = this.candidates.filter(x => x !== c); this.bar.view.sync(this.candidates);
          g.toast(`${c.name.toUpperCase()} SIGNED ON`); sfx.pickup(); g.autosave();
        }
      }
    } else if (this.panel === "board") {
      const rows = this.contractRows(g), fresh = this.contracts.update(rows.map(r => r.key), inp);
      const selected = rows.find(r => r.key === this.contracts.view.selected);
      if (!selected || !fresh) return;
      const { mission: m, ready } = selected;
      if (details) { this.read(m.title, [ready ? "READY TO TURN IN HERE." : "AVAILABLE CONTRACT.", m.desc, `REWARD: ${m.reward}CR.`, ...(m.commodityId && m.qty ? [`REQUIRED: ${m.qty} ${commodity(m.commodityId).name}.`] : []), "ESC CLOSES THESE DETAILS. USE THE DESK ACTION TO ACCEPT OR TURN IN."]); return; }
      if (enter) {
        if (ready) {
          if (m.commodityId && m.qty && m.kind !== "research" && !removeCargo(p, m.commodityId, m.qty)) { g.toast("REQUIRED CARGO IS MISSING"); return; }
          m.done = true; p.credits += m.reward; ledger(p, "contracts", m.reward);
          if (this.region.factionId) adjustRep(g.world, this.region.factionId, m.repReward ?? 3);
          p.missions = p.missions.filter(x => !x.done);
          g.toast(`CONTRACT COMPLETE +${m.reward}CR`); sfx.pickup(); g.autosave();
        } else if (p.missions.filter(x => x.accepted && !x.done).length >= 5) g.toast("MISSION LOG FULL");
        else { m.accepted = true; p.missions.push(m); g.toast("CONTRACT ACCEPTED"); sfx.select(); g.autosave(); }
        this.contracts.view.sync(this.contractRows(g).map(r => r.key));
      }
    }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    if (this.info) { this.info.draw(g, ctx); return; }
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
    { const line = settlementLine(g.world, this.poi, this.region); drawText(ctx, line.toUpperCase().slice(0, 112), 8, 24, PAL.greyDark); }
    drawText(ctx, `${p.credits}CR  CARGO ${cargoUsed(p)}/${p.cargoMax}  CREW ${p.crew.length}/${hull(p.hullId).crewSlots}`, VW - 150, 6, PAL.gold);
    drawText(ctx, "ESC ORBIT", VW - textWidth("ESC ORBIT") - 6, 15, PAL.greyDark);
    footer(ctx, g, this.msg);
    if (this.panel !== "none") this.drawPanel(g, ctx);
  }

  drawPanel(g: Game, ctx: CanvasRenderingContext2D): void {
    const p = g.world.player, status = `${p.credits}CR   CARGO ${cargoUsed(p)}/${p.cargoMax}   BERTHS ${berthsUsed(p)}/${hull(p.hullId).crewSlots}`;
    if (this.panel === "market") {
      this.market.draw(ctx, "STREET MARKET", status, id => {
        const r = this.rows.find(r => r.id === id)!;
        return { title: commodity(id).name, right: `BUY ${r.buy} / SELL ${r.sell}CR`, detail: `HELD ${p.cargo[id] ?? 0}` };
      }, "NO GOODS AVAILABLE.");
      mapButton(ctx, DESK_ACTION, "ENTER/B BUY 1"); mapButton(ctx, DESK_SELL, "S SELL 1");
    } else if (this.panel === "bar") {
      this.bar.draw(ctx, "CANTINA", status, c => ({ title: c.name, right: `SIGN ${c.wage * 3}CR`, detail: `${ROLE_INFO[c.role].label} ${"*".repeat(c.skill)} / WAGE ${c.wage}CR / ${ROLE_INFO[c.role].effect}` }), "NOBODY IS LOOKING FOR A BERTH TONIGHT.");
      mapButton(ctx, DESK_ACTION, "ENTER HIRE");
    } else {
      const rows = this.contractRows(g);
      this.contracts.draw(ctx, "CONTRACTS OFFICE", status, key => {
        const r = rows.find(r => r.key === key)!;
        return { title: r.mission.title, right: `+${r.mission.reward}CR`, detail: `${r.ready ? "TURN IN" : "AVAILABLE"}: ${r.mission.desc}` };
      }, "NO CONTRACTS POSTED.");
      mapButton(ctx, DESK_ACTION, rows.find(r => r.key === this.contracts.view.selected)?.ready ? "ENTER TURN IN" : "ENTER ACCEPT");
    }
    mapButton(ctx, DESK_INFO, "I FULL DETAILS");
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
