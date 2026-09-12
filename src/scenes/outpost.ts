// Surface outpost: a small walkable landing site with a trade desk, a survey
// office, a bunk, and the pad back to orbit.

import { Game, Scene, VW } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { settlementLine, settlementNeeds, SETTLEMENT_PREMIUM, missionDeliverable, growSettlement, settlementTierLabel, GROWTH_TOWN, GROWTH_CITY, logEntry, PROJECTS, canFundProject, fundProject, ledger } from "../world";
import * as wire from "../core/wire";
import { flag } from "../core/achievements";
import type { Encounter } from "../data/encounters";
import type { EncounterScene } from "./encounter";
import { RNG, hashStr } from "../core/rng";
import { addCargo, removeCargo, cargoUsed, adjustRep, Poi, Region, type World } from "../world";
import { commodity, faction, genPersonName } from "../data/data";
import { sfx } from "../core/sfx";
import { DeskMenu, deskClick, DESK_ACTION, DESK_SELL, DESK_INFO, DESK_CLOSE } from "./deskmenu";
import { mapButton } from "../core/mapview";
import { ReaderOverlay } from "./reader";
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
  get touchMode(): "walk" | "menu" { return this.trade.open || this.info ? "menu" : "walk"; }
  px = 11 * T; py = 5 * T + 5;
  poi!: Poi; region!: Region;
  npcs: Npc[] = [];
  trade: { open: boolean; rows: { id: string; buy: number; sell: number }[] } = { open: false, rows: [] };
  needs: string[] = [];
  msg = ""; msgTimer = 0;
  market = new DeskMenu<string>();
  info?: ReaderOverlay;
  resumeNext = false;
  private world?: World;

  enter(g: Game): void {
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    const pl = sys.planets[g.orbitPlanetIdx];
    const surf = pl.surface!;
    const poi = surf.pois.find((x) => x.id === g.landedPoiId);
    if (!poi) { g.setScene(g.surfaceReturn ? "surface" : "orbit"); return; }
    const resume = this.resumeNext && this.world === g.world && this.poi === poi;
    this.resumeNext = false; this.world = g.world;
    this.poi = poi;
    this.region = surf.regions[poi.regionIdx];
    if (!resume) { this.px = 11 * T; this.py = 5 * T + 5; this.market = new DeskMenu(); }
    this.trade.open = false; this.onSceneLeave();
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
    // trade desk: the region's resource sells cheap; food/med/parts buy dear; a town wants luxuries too
    const res = this.region.resource;
    const rows = [
      { id: res, buy: Math.round(commodity(res).base * 0.55), sell: Math.round(commodity(res).base * 0.4) },
      { id: "food", buy: Math.round(commodity("food").base * 1.5), sell: Math.round(commodity("food").base * 1.3) },
      { id: "med", buy: Math.round(commodity("med").base * 1.4), sell: Math.round(commodity("med").base * 1.25) },
      { id: "parts", buy: Math.round(commodity("parts").base * 1.4), sell: Math.round(commodity("parts").base * 1.2) },
      ...((poi.tier ?? 0) >= 1 ? [{ id: "lux", buy: 0, sell: Math.round(commodity("lux").base * 1.1) }] : []),
    ];
    if (!resume && (poi.projects ?? []).includes("clinic")) { const sick = p.crew.filter((c) => c.sick); if (sick.length) { for (const c of sick) c.sick = null; g.toast(`THE CLINIC AT ${poi.name.toUpperCase()} TREATS ${sick.map((c) => c.name.toUpperCase()).join(" AND ")}. NO CHARGE. YOU BUILT IT.`); } }
    if (!resume && (poi.projects ?? []).includes("chapel")) for (const c of p.crew) c.morale = Math.min(100, c.morale + 5);
    if ((poi.projects ?? []).includes("pad")) { rows.push({ id: "water", buy: Math.round(commodity("water").base * 1.2), sell: Math.round(commodity("water").base * 0.9) }); this.npcs.push({ x: rng.int(3, 18) * T, y: rng.int(2, 5) * T + 5, name: genPersonName(rng), skin: "#c78a5a", suit: "#3a6ea5", line: "Second pad's busy all day now. You did that. Thanks." }); }
    for (let i = 0; i < (poi.tier ?? 0); i++) this.npcs.push({ x: rng.int(3, 18) * T, y: rng.int(2, 5) * T + 5, name: genPersonName(rng), skin: rng.pick(["#e8b48c", "#c78a5a"]), suit: "#7a5aa5", line: rng.pick(["New here. Came for the work. Stayed for the sky.", `They say ${poi.patron ?? "some captain"} built half this place out of a cargo hold.`, "There's a school now. Two rooms. It's something."]) });
    this.trade.rows = rows.filter((r, i, a) => a.findIndex((x) => x.id === r.id) === i);
    {
      // this week's needs: sell here at a premium, added to the desk if missing
      const needs = settlementNeeds(g.world, poi);
      for (const id of needs) {
        const r = this.trade.rows.find((x) => x.id === id);
        if (r) r.sell = Math.round(r.sell * (1 + SETTLEMENT_PREMIUM));
        else this.trade.rows.push({ id, buy: 0, sell: Math.round(commodity(id).base * 0.92 * (1 + SETTLEMENT_PREMIUM)) });
      }
      this.needs = needs;
    }
    // jobs done for this settlement pay out on arrival
    for (const m of [...p.missions]) {
      if (!m.accepted || m.done || m.targetStationId !== poi.id) continue;
      const ok = (m.kind === "ground" && (m.groundDone ?? 0) >= (m.groundNeed ?? 1)) || (m.kind === "repair" && m.tenderDone);
      if (!ok) continue;
      m.done = true; p.credits += m.reward; if (this.region.factionId) adjustRep(g.world, this.region.factionId, 3);
      g.toast(`FOREMAN PAYS OUT: ${m.title.toUpperCase()} +${m.reward}CR`); sfx.pickup();
      { const line = growSettlement(g.world, poi, m.kind === "repair" ? 25 : 15, this.who(g)); if (line) { g.toast(line); logEntry(g.world, line.toLowerCase()); flag(g, "founder"); } }
    }
    this.market.view.sync(this.trade.rows.map(r => r.id));
    if (!resume) { this.msg = `LANDED: ${poi.name.toUpperCase()}`; this.msgTimer = 3; p.oxygen = p.oxygenMax; }
  }

  solid(tx: number, ty: number): boolean {
    if (ty < 0 || ty >= DECK.length || tx < 0 || tx >= DECK[0].length) return true;
    const ch = DECK[ty][tx];
    return ch !== "." && ch !== "D";
  }

  // The foreman's board: ground jobs for this settlement, a plant to fix
  foreman(g: Game): void {
    const world = g.world, p = world.player;
    const poi = this.poi;
    const has = (kind: string) => p.missions.some((m) => m.accepted && !m.done && m.targetStationId === poi.id && (m.kind === kind));
    const opts: Encounter["options"] = [];
    if (!has("ground")) {
      opts.push({ label: "SAMPLE RUN: SCAN 2 FLORA ON THIS WORLD (300CR)", result: (g2) => { g2.world.player.missions.push({ id: `fore-${Date.now() % 1e7}`, kind: "ground", accepted: true, done: false, tier: 0, title: `Sample run for ${poi.name}`, desc: "Scan two flora anywhere on this world and come back.", fromStationId: poi.id, targetSystemId: g2.world.player.systemId, targetStationId: poi.id, groundPlanetIdx: g2.orbitPlanetIdx, groundGoal: "flora", groundNeed: 2, groundDone: 0, reward: 300, repReward: 3 }); return "'TWO GOOD SCANS. THE LAB'S BEEN WAITING A MONTH.'"; } });
      opts.push({ label: "OUTCROP RUN: MINE 3 OUTCROPS ON THIS WORLD (350CR)", result: (g2) => { g2.world.player.missions.push({ id: `fore-${Date.now() % 1e7 + 1}`, kind: "ground", accepted: true, done: false, tier: 0, title: `Outcrop run for ${poi.name}`, desc: "Work three outcrops anywhere on this world and report back.", fromStationId: poi.id, targetSystemId: g2.world.player.systemId, targetStationId: poi.id, groundPlanetIdx: g2.orbitPlanetIdx, groundGoal: "outcrop", groundNeed: 3, groundDone: 0, reward: 350, repReward: 3 }); return "'THE RIGS ARE DOWN. YOUR ROVER ISN'T. GO ON.'"; } });
    }
    if (!has("repair")) opts.push({ label: "FIX THE PLANT (400CR, RIGHT NOW)", hint: "Three systems, your hands", result: (g2) => { const m = { id: `fore-${Date.now() % 1e7 + 2}`, kind: "repair" as const, accepted: true, done: false, tier: 0, title: `Plant repair at ${poi.name}`, desc: "Bring the settlement's plant back online.", fromStationId: poi.id, targetSystemId: g2.world.player.systemId, targetStationId: poi.id, reward: 400, repReward: 4 }; g2.world.player.missions.push(m); g2.tenderMission = m; g2.tenderReturn = "outpost"; setTimeout(() => { if (g2.world !== world || g2.tenderMission !== m) return; this.resumeNext = true; g2.setScene("repair"); }, 0); return ""; } });
    if ((poi.tier ?? 0) >= 1) {
      for (const pr of PROJECTS) {
        if ((poi.projects ?? []).includes(pr.id)) continue;
        const why = canFundProject(p, poi, pr.id);
        opts.push({ label: `FUND ${pr.name.toUpperCase()} (${pr.credits}CR + ${pr.goods.qty} ${commodity(pr.goods.id).name.toUpperCase()})`, hint: why ?? pr.desc, requires: (g2) => !canFundProject(g2.world.player, poi, pr.id), result: (g2) => fundProject(g2.world, poi, pr.id, this.who(g2)) ?? "" });
      }
    }
    opts.push({ label: "NOT TODAY", result: () => "'SUIT YOURSELF. THE WORK'LL KEEP.'" });
    const needs = this.needs.map((id) => commodity(id).name.toUpperCase()).join(" AND ");
    const enc: Encounter = { id: "foreman", where: "ground", title: `${poi.name.toUpperCase()} - FOREMAN`, weight: 0, text: `THE FOREMAN LOOKS UP FROM A CLIPBOARD OLDER THAN THE OUTPOST. 'WE'RE SHORT ON ${needs || "EVERYTHING"} THIS WEEK, IF YOU'RE HAULING. AND THERE'S WORK, IF YOU'RE NOT.'`, options: opts };
    this.resumeNext = true;
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "outpost", true);
  }

  say(m: string): void { this.msg = m; this.msgTimer = 3; }
  who(g: Game): string { return g.world.player.captainName ?? wire.getCallsign() ?? (g.world.player.shipName ? `the ${g.world.player.shipName}` : "an independent captain"); }

  onSceneLeave(): void { this.info?.onSceneLeave(); this.info = undefined; }

  update(g: Game, dt: number): void {
    if (this.info) { this.info.update(g); return; }
    const inp = g.input;
    const p = g.world.player;
    if (this.trade.open) {
      if (inp.wasPressed("Escape") || deskClick(inp, DESK_CLOSE)) { this.trade.open = false; return; }
      const fresh = this.market.update(this.trade.rows.map(r => r.id), inp);
      const r = this.trade.rows.find(r => r.id === this.market.view.selected);
      if (!r || !fresh) return;
      if (inp.wasPressed("i") || deskClick(inp, DESK_INFO)) {
        this.info = new ReaderOverlay("TRADE DETAILS", [[commodity(r.id).name, [
          r.buy > 0 ? `BUY ONE: ${r.buy}CR.` : "THE DESK ONLY BUYS THIS GOOD FROM YOU.",
          `SELL ONE: ${r.sell}CR. HELD: ${p.cargo[r.id] ?? 0}. CARGO: ${cargoUsed(p)}/${p.cargoMax}.`,
          this.needs.includes(r.id) ? "WANTED THIS WEEK. THE DISPLAYED SELL PRICE INCLUDES THE PREMIUM. EACH DELIVERY CONTRIBUTES EXTRA SETTLEMENT GROWTH." : "SELLING GOODS CONTRIBUTES TO SETTLEMENT GROWTH.",
        ]]], () => { this.info = undefined; }); return;
      }
      if (inp.wasPressed("Enter") || inp.wasPressed("b") || deskClick(inp, DESK_ACTION)) {
        if (r.buy <= 0) g.toast("THIS DESK ONLY BUYS THAT GOOD FROM YOU");
        else if (p.credits < r.buy) g.toast("NOT ENOUGH CREDITS");
        else if (!addCargo(p, r.id, 1)) g.toast("CARGO FULL");
        else { p.credits -= r.buy; ledger(p, "settlements", -r.buy); sfx.select(); g.autosave(); }
      } else if (inp.wasPressed("s") || deskClick(inp, DESK_SELL)) {
        if (!removeCargo(p, r.id, 1)) g.toast("NONE IN CARGO");
        else { p.credits += r.sell; ledger(p, "settlements", r.sell); sfx.select(); const line = growSettlement(g.world, this.poi, this.needs.includes(r.id) ? 6 : 2, this.who(g)); if (line) { g.toast(line); logEntry(g.world, line.toLowerCase()); flag(g, "founder"); } g.autosave(); }
      }
      return;
    }
    if (inp.wasPressed("Escape")) { g.setScene(g.surfaceReturn ? "surface" : "orbit"); return; }
    moveWalker(g, this, dt, (tx, ty) => this.solid(tx, ty));
    const near = nearestTile(DECK, this.px, this.py, "TSBA");
    const npc = this.npcs.find((n) => Math.hypot(n.x - this.px, n.y - this.py) < 16);
    if (inp.wasPressed("e")) {
      if (near?.ch === "T") { this.trade.open = true; this.market.view.sync(this.trade.rows.map(r => r.id)); sfx.select(); }
      else if (near?.ch === "S") {
        const sys = g.world.systems[p.systemId];
        const surf = sys.planets[g.orbitPlanetIdx].surface!;
        if (!surf.scanned) this.say("SURVEY OFFICE: SCAN THE PLANET FROM ORBIT FIRST (HOLD V)");
        else if (!surf.surveyFiled) {
          // one-time bonus for filing the survey here
          const pay = 60 * surf.pois.length;
          p.credits += pay;
          surf.surveyFiled = true;
          { const line = growSettlement(g.world, this.poi, 10, this.who(g)); if (line) g.toast(line); }
          this.say(`SURVEY FILED +${pay}CR`);
          if (this.region.factionId) adjustRep(g.world, this.region.factionId, 4);
          sfx.pickup();
        } else this.foreman(g);
      }
      else if (near?.ch === "B") { p.hull = Math.min(p.hullMax, p.hull + 15); p.shield = p.shieldMax; this.say("YOU REST UNDER A REAL SKY. +15 HULL"); }
      else if (near?.ch === "A") { g.setScene(g.surfaceReturn ? "surface" : "orbit"); return; }
      else if (npc) { this.say(`${npc.name.toUpperCase()}: ${npc.line}`); }
    }
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.msg = ""; }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    if (this.info) { this.info.draw(g, ctx); return; }
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
    (this.poi.projects ?? []).forEach((id, i) => {
      const x = ox + (14 + i * 2) * T, y = oy + 2 * T;
      if (id === "school") { ctx.fillStyle = "#c7a54a"; ctx.fillRect(x + 1, y + 3, 8, 6); ctx.fillStyle = "#0b1020"; ctx.fillRect(x + 3, y + 5, 2, 2); ctx.fillRect(x + 6, y + 5, 2, 2); }
      else if (id === "clinic") { ctx.fillStyle = "#f2f4ff"; ctx.fillRect(x + 1, y + 3, 8, 6); ctx.fillStyle = "#a53a3a"; ctx.fillRect(x + 4, y + 4, 2, 4); ctx.fillRect(x + 3, y + 5, 4, 2); }
      else if (id === "pad") { ctx.fillStyle = "#5d6680"; ctx.fillRect(x, y + 4, 10, 5); ctx.fillStyle = Math.floor(g.world.time * 2) % 2 ? "#ffd75a" : "#3a4a6c"; ctx.fillRect(x + 4, y + 6, 2, 2); }
      else if (id === "chapel") { ctx.fillStyle = "#7a5aa5"; ctx.fillRect(x + 2, y + 4, 6, 5); ctx.fillRect(x + 4, y + 1, 2, 3); ctx.fillStyle = "#ffe9a0"; ctx.fillRect(x + 4, y + 6, 2, 1); }
    });
    for (const n of this.npcs) drawPerson(ctx, Math.round(ox + n.x), Math.round(oy + n.y), n.skin, n.suit);
    drawPerson(ctx, Math.round(ox + this.px), Math.round(oy + this.py), "#e8b48c", "#3a6ea5");
    const near = nearestTile(DECK, this.px, this.py, "TSBA");
    if (near) {
      const label = near.ch === "T" ? "TRADE DESK" : near.ch === "S" ? "SURVEY OFFICE / FOREMAN" : near.ch === "B" ? "BUNKHOUSE" : "LANDING PAD";
      tooltip(ctx, ox, oy, near.tx, near.ty, label, near.ch === "A" ? "[E] RETURN TO ORBIT" : "[E] USE");
    }
    const npc = this.npcs.find((n) => Math.hypot(n.x - this.px, n.y - this.py) < 16);
    if (npc) drawText(ctx, `${npc.name} [E]`, ox + npc.x - textWidth(npc.name) / 2, oy + npc.y - 12, PAL.grey);
    const fac = this.region.factionId ? faction(this.region.factionId) : null;
    drawText(ctx, `${this.poi.name.toUpperCase()} - ${settlementTierLabel(this.poi)} - ${pl.name.toUpperCase()}`, 8, 6, PAL.white);
    if ((this.poi.tier ?? 0) < 2 && (this.poi.growth ?? 0) > 0) { const need = (this.poi.tier ?? 0) < 1 ? GROWTH_TOWN : GROWTH_CITY; const gw = Math.min(1, (this.poi.growth ?? 0) / need); ctx.fillStyle = PAL.greyDark; ctx.fillRect(VW - 110, 24, 100, 3); ctx.fillStyle = PAL.gold; ctx.fillRect(VW - 110, 24, Math.round(100 * gw), 3); drawText(ctx, `GROWTH ${Math.round(this.poi.growth ?? 0)}/${need}`, VW - 110, 28, PAL.greyDark); }
    drawText(ctx, `${this.region.name} - ${fac ? fac.name : "UNCLAIMED"} - YIELDS ${this.region.resource.toUpperCase()}`, 8, 15, fac ? fac.color : PAL.grey);
    { const line = settlementLine(g.world, this.poi, this.region); drawText(ctx, line.toUpperCase().slice(0, 112), 8, 24, PAL.greyDark); }
    drawText(ctx, `${p.credits}CR  CARGO ${cargoUsed(p)}/${p.cargoMax}`, VW - 110, 6, PAL.gold);
    drawText(ctx, "ESC ORBIT", VW - textWidth("ESC ORBIT") - 6, 15, PAL.greyDark);
    footer(ctx, g, this.msg);

    if (this.trade.open) {
      this.market.draw(ctx, "OUTPOST TRADE DESK", `${p.credits}CR   CARGO ${cargoUsed(p)}/${p.cargoMax}`, id => {
        const r = this.trade.rows.find(r => r.id === id)!;
        return { title: commodity(id).name, right: `BUY ${r.buy > 0 ? r.buy : "N/A"} / SELL ${r.sell}CR`, detail: `HELD ${p.cargo[id] ?? 0}${this.needs.includes(id) ? " / WANTED THIS WEEK. PREMIUM INCLUDED." : ""}` };
      }, "NO GOODS AVAILABLE.");
      mapButton(ctx, DESK_ACTION, "ENTER/B BUY 1"); mapButton(ctx, DESK_SELL, "S SELL 1"); mapButton(ctx, DESK_INFO, "I FULL DETAILS");
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
