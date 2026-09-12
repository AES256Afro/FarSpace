import { ListView } from "../core/listview";
import { wrapText } from "../core/text";
import { ReaderOverlay } from "./reader";
import { questLocations } from "../core/questlocations";
import { drawQuestMarker } from "../gfx/questmarkers";
import { wreckAvailable } from "../core/salvage";
import { Game, Scene } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { faction, commodity } from "../data/data";
import { navRoute, routeFuel, jumpFuelCost, repLabel, permitDenied, syndicateAt, findStation, galaxyEventAt, infraAt, infraLit, stormBlind, wondersIn, borderContest, borderStanding } from "../world";
import { plotServiceOrder } from "../core/service";
import { plotCouncilMandate } from "../core/council";
import { knowsSingersBerth } from "../core/singers";
import { MapCamera, MAP_RECT, PANEL_RECT, contains, drawMapLabels, mapFrame, mapButton, clippedText, type MapLabel, type PlacedLabel } from "../core/mapview";
import type { FlightScene } from "./flight/index";
import { sfx } from "../core/sfx";
import * as wire from "../core/wire";

const DETAILS = { x: 8, y: 36, w: 94, h: 15 }, OBJECTIVES = { x: 106, y: 36, w: 102, h: 15 };
const SEARCH_PREV = { x: 8, y: 231, w: 80, h: 15 }, SEARCH_NEXT = { x: 92, y: 231, w: 80, h: 15 };
const SEARCH_SELECT = { x: 312, y: 231, w: 104, h: 15 }, SEARCH_BACK = { x: 420, y: 231, w: 52, h: 15 };
const QUESTS = { x: 212, y: 36, w: 86, h: 15 };
const PLOT = { x: 312, y: 231, w: 104, h: 15 };
const MARK = { x: 420, y: 231, w: 52, h: 15 };
const FLY = { x: 202, y: 231, w: 100, h: 15 };
const FIT = { x: 8, y: 231, w: 48, h: 15 };
const FIND = { x: 60, y: 231, w: 58, h: 15 };
const LAYERS = { x: 122, y: 231, w: 72, h: 15 };

export class GalaxyScene implements Scene {
  touchMode = "menu" as const;
  selected: string | null = null;
  layers = false;
  questOnly = false;
  rooms: Record<string, number> = {};
  pilots = 0;
  camera = new MapCamera();
  infoScroll = 0;
  query = "";
  searching = false;
  search = new ListView<string>(12);
  get searchIndex(): number { return this.search.index; }
  set searchIndex(value: number) { this.search.select(value); }
  private drawnResults: string[] = [];
  private searchRemoved = false;
  private selectionRemoved = false;
  private knownSystems: string[] = [];
  info?: ReaderOverlay;
  get capturesKeys(): boolean { return this.searching || !!this.info?.closeSearchBox; }
  get pausesVoyage(): boolean { return this.searching || !!this.info; }
  onSceneLeave(): void { this.info?.onSceneLeave(); this.info = undefined; this.searching = false; }
  labels: PlacedLabel[] = [];

  fit(g: Game): void { this.camera.fit(Object.values(g.world.systems).map(s => ({ x: s.gx, y: s.gy }))); }
  enter(g: Game): void {
    this.onSceneLeave(); this.search = new ListView(12); this.drawnResults = []; this.searchRemoved = false; this.selectionRemoved = false; this.knownSystems = Object.keys(g.world.systems);
    this.selected = g.world.player.systemId; this.infoScroll = 0; this.searching = false; this.questOnly = false;
    this.fit(g);
    if (g.world.realGalaxy) void wire.fetchLights();
    void wire.fetchSquadronData(); void wire.fetchBases();
    void wire.fetchRooms().then(r => { this.rooms = Object.fromEntries(r.rooms.map(x => [x.system.toLowerCase(), x.count])); this.pilots = r.pilots; });
  }
  select(g: Game, id: string, center = false): void {
    if (!g.world.systems[id]) return;
    if (id !== this.selected) this.infoScroll = 0;
    this.selected = id; this.selectionRemoved = false;
    if (center) { const s = g.world.systems[id]; this.camera.x = s.gx; this.camera.y = s.gy; }
  }
  clearLocal(g: Game): void { const flight = g.scenes.flight as FlightScene | undefined; if (flight) { flight.localTarget = null; flight.autopilot = false; flight.autoRoute = false; } }
  plot(g: Game): void {
    const p = g.world.player, id = this.selected;
    if (!id || !g.world.systems[id]) { g.toast("SELECT AN AVAILABLE SYSTEM FIRST."); return; }
    if (id === p.systemId) { g.toast("YOU ARE ALREADY IN THIS SYSTEM."); return; }
    if (p.navTarget === id) { p.navTarget = null; p.singersCourse = false; delete p.navStationId; this.clearLocal(g); g.toast("COURSE CLEARED."); return; }
    const route = navRoute(g.world, p.systemId, id);
    if (!route || route.length < 2) { g.toast("NO OPEN ROUTE TO THIS SYSTEM."); return; }
    p.navTarget = id; p.singersCourse = false; delete p.navStationId;
    this.clearLocal(g);
    g.toast("COURSE SET. RETURN TO FLIGHT AND PRESS N."); sfx.select();
  }
  fly(g: Game): void {
    const p = g.world.player, id = this.selected;
    if (!id || !g.world.systems[id]) { g.toast("SELECT AN AVAILABLE SYSTEM FIRST."); return; }
    if (id === p.systemId) { g.toast("YOU ARE HERE. USE THE SYSTEM MAP FOR A LOCAL DESTINATION."); return; }
    const route = navRoute(g.world, p.systemId, id);
    if (!route || route.length < 2) { g.toast("NO OPEN ROUTE TO THIS SYSTEM."); return; }
    const fs = g.scenes.flight as FlightScene;
    if (routeFuel(g.world, route) > p.fuel) { g.toast("NOT ENOUGH FUEL FOR THIS ROUTE. REFUEL BEFORE DEPARTURE."); return; }
    p.navTarget = id; delete p.navStationId; p.singersCourse = false; fs.localTarget = null;
    if (fs.startAutopilot(g, true)) { fs.resumeNext = true; g.input.flush?.(); g.input.down?.clear(); g.setScene("flight"); }
  }
  results(g: Game) { const quests = new Set(questLocations(g.world).map(q=>q.systemId)); return Object.values(g.world.systems).filter(s => (!this.questOnly || quests.has(s.id)) && s.name.toLowerCase().includes((this.searching ? this.query : "").toLowerCase())).sort((a,b) => a.name.localeCompare(b.name)); }
  syncSelection(g: Game): void {
    const keys = Object.keys(g.world.systems);
    if (this.selected && !keys.includes(this.selected)) {
      const oldIndex = this.knownSystems.indexOf(this.selected);
      this.selected = keys[Math.min(Math.max(0, oldIndex), keys.length - 1)] ?? null;
      this.infoScroll = 0; this.selectionRemoved = true;
    }
    if (!this.selected) this.selected = keys.includes(g.world.player.systemId) ? g.world.player.systemId : keys[0] ?? null;
    this.knownSystems = keys;
  }
  syncSearch(g: Game) {
    const found = this.results(g), previous = this.search.selected;
    this.search.sync(found.map(s => s.id));
    if (previous && !this.search.keys.includes(previous)) this.searchRemoved = true;
    return found;
  }
  updateSearch(g: Game): void {
    const inp = g.input, click = (r: { x: number; y: number; w: number; h: number }) => inp.mousePressed && contains(r, inp.mouseX, inp.mouseY);
    if (inp.wasPressed("Escape") || click(SEARCH_BACK)) { this.searching = false; return; }
    const before = this.query;
    if (inp.wasPressed("Backspace")) this.query = this.query.slice(0, -1);
    for (const raw of inp.textEvents ?? []) if (/^[a-z0-9 .'-]$/i.test(raw) && this.query.length < 48) this.query += raw;
    if (before !== this.query) { this.search = new ListView(12); this.drawnResults = []; this.searchRemoved = false; }
    this.syncSearch(g);
    const removed = this.searchRemoved; this.searchRemoved = false;
    if (inp.wasPressed("ArrowDown")) this.search.move(1);
    if (inp.wasPressed("ArrowUp")) this.search.move(-1);
    if (inp.wheel && contains(PANEL_RECT, inp.mouseX, inp.mouseY)) this.search.move(Math.sign(inp.wheel));
    if (inp.wasPressed("PageDown") || click(SEARCH_NEXT)) this.search.page(1);
    if (inp.wasPressed("PageUp") || click(SEARCH_PREV)) this.search.page(-1);
    if (inp.wasPressed("Home")) this.search.select(0);
    if (inp.wasPressed("End")) this.search.select(this.search.keys.length - 1);
    if (click({ x: 318, y: 65, w: 148, h: 144 })) {
      const id = this.drawnResults[Math.floor((inp.mouseY - 65) / 12)], index = this.search.keys.indexOf(id);
      if (index >= 0) this.search.select(index);
      return;
    }
    if ((inp.wasPressed("Enter") || click(SEARCH_SELECT)) && !removed && this.search.selected) {
      this.select(g, this.search.selected, true); this.searching = false;
    }
  }
  openInfo(g: Game, all = false): void {
    const sys = g.world.systems[this.selected ?? g.world.player.systemId] ?? g.world.systems[g.world.player.systemId];
    if (!sys) return;
    const sections: [string, string[]][] = all ? questLocations(g.world).map(q => [`${q.focused ? "CHOSEN: " : ""}${q.title}`, [g.world.systems[q.systemId]?.name ?? q.systemId, q.source, q.action]])
      : [[sys.name, this.infoLines(g, null).map(line => line.text)]];
    this.info = new ReaderOverlay(all ? "GALAXY OBJECTIVES" : "SYSTEM DETAILS", sections.length ? sections : [["Objectives", ["No current quest locations."]]], () => { this.info = undefined; });
  }
  update(g: Game, dt: number): void {
    const inp = g.input, p = g.world.player;
    if (this.info) { this.info.update(g); return; }
    this.syncSelection(g);
    if (this.searching) { this.updateSearch(g); return; }
    const removed = this.selectionRemoved; this.selectionRemoved = false;
    if (removed && (inp.wasPressed("a") || inp.wasPressed("n") || inp.wasPressed("Enter") || inp.wasPressed("b") || (inp.mousePressed && (contains(FLY, inp.mouseX, inp.mouseY) || contains(PLOT, inp.mouseX, inp.mouseY) || contains(MARK, inp.mouseX, inp.mouseY))))) { g.toast("SYSTEM CHANGED. CHECK THE NEW SELECTION."); return; }
    if (inp.wasPressed("i") || (inp.mousePressed && contains(DETAILS, inp.mouseX, inp.mouseY))) { this.openInfo(g); return; }
    if (inp.wasPressed("o") || (inp.mousePressed && contains(OBJECTIVES, inp.mouseX, inp.mouseY))) { this.openInfo(g, true); return; }
    if (inp.wasPressed("Escape") || inp.wasPressed("g")) { (g.scenes.flight as FlightScene).resumeNext = true; g.setScene("flight"); return; }
    if (inp.wasPressed("F5")) g.save();
    if (inp.wasPressed("F9")) { g.load(); return; }
    if (inp.wasPressed("a") || (inp.mousePressed && contains(FLY, inp.mouseX, inp.mouseY))) { this.fly(g); return; }
    if (inp.wasPressed("f") || (inp.mousePressed && contains(FIND, inp.mouseX, inp.mouseY))) { this.searching = true; this.query = ""; this.search = new ListView(12); this.drawnResults = []; this.searchRemoved = false; this.syncSearch(g); return; }
    if (inp.wasPressed("u") && p.service?.order) {
      if (plotServiceOrder(g.world)) { this.select(g, p.navTarget!, true); this.clearLocal(g); g.autosave(); }
      else g.toast("NO OPEN ROUTE FOR YOUR SERVICE ORDERS.");
      return;
    }
    if (inp.wasPressed("c") && p.council?.mandate) {
      if (plotCouncilMandate(g.world)) { this.select(g, p.navTarget!, true); this.clearLocal(g); g.autosave(); }
      else g.toast("NO OPEN ROUTE FOR THE COUNCIL JOURNEY.");
      return;
    }
    if (inp.wasPressed("r") && knowsSingersBerth(p)) {
      this.select(g, p.singersHome!, true); p.navTarget = p.singersHome!; p.singersCourse = true; delete p.navStationId;
      this.clearLocal(g); return;
    }
    if (inp.wasPressed("q") || (inp.mousePressed && contains(QUESTS,inp.mouseX,inp.mouseY))) {
      this.questOnly = !this.questOnly; this.query = "";
      const found = this.results(g); if (this.questOnly && found.length && !found.some(s => s.id === this.selected)) this.select(g,found[0].id,true);
      if (this.questOnly && !found.length) g.toast("NO ACTIVE QUEST LOCATIONS."); return;
    }
    this.camera.update(inp, dt);
    if (inp.wasPressed("Home") || (inp.mousePressed && contains(FIT, inp.mouseX, inp.mouseY))) this.fit(g);
    if (inp.wasPressed("v") || (inp.mousePressed && contains(LAYERS, inp.mouseX, inp.mouseY))) this.layers = !this.layers;
    if (inp.wasPressed("b") || (inp.mousePressed && contains(MARK, inp.mouseX, inp.mouseY))) {
      if (this.selected) { p.bookmarks ??= []; const i = p.bookmarks.indexOf(this.selected); if (i < 0) p.bookmarks.push(this.selected); else p.bookmarks.splice(i,1); }
    }
    if (inp.wasPressed("n") || inp.wasPressed("Enter") || (inp.mousePressed && contains(PLOT, inp.mouseX, inp.mouseY))) this.plot(g);
    if (inp.wasPressed("[") || inp.wasPressed("]")) {
      const systems = this.results(g), i = systems.findIndex(s => s.id === this.selected);
      if (systems.length) this.select(g, systems[(i + (inp.wasPressed("]") ? 1 : systems.length - 1)) % systems.length].id, true);
    }
    if (inp.mousePressed && contains(MAP_RECT, inp.mouseX, inp.mouseY)) {
      const label = this.labels.find(l => contains(l.box, inp.mouseX, inp.mouseY));
      let best = label?.id ?? null, distance = label ? 0 : 9;
      for (const s of this.results(g)) {
        const at = this.camera.project({ x: s.gx, y: s.gy });
        const d = Math.hypot(at.x - inp.mouseX, at.y - inp.mouseY);
        if (d < distance) { best = s.id; distance = d; }
      }
      if (best && this.results(g).some(s => s.id === best)) this.select(g, best);
    }
    if (inp.wheel && contains(PANEL_RECT, inp.mouseX, inp.mouseY)) this.infoScroll += Math.sign(inp.wheel) * 3;
    if (inp.wasPressed("PageDown")) this.infoScroll += 12;
    if (inp.wasPressed("PageUp")) this.infoScroll -= 12;
    if (inp.wasPressed("End")) this.infoScroll = this.infoLines(g).length;
    this.infoScroll = Math.max(0, Math.min(Math.max(0, this.infoLines(g).length - 16), this.infoScroll));
  }
  infoLines(g: Game, columns: number | null = 36): { text: string; color: string }[] {
    const w = g.world, sys = w.systems[this.selected ?? w.player.systemId] ?? w.systems[w.player.systemId];
    if (!sys) return [{ text: "NO AVAILABLE SYSTEM", color: PAL.grey }];
    const fac = faction(sys.factionId);
    const lines: { text: string; color: string }[] = [];
    const line = (text: string, _x: number, _y: number, color: string) => {
      for (const part of columns === null ? [text] : wrapText(text, columns)) lines.push({ text: part, color });
    };
      let y = 0; const px = 0;
      line( sys.name.toUpperCase(), px + 6, y, PAL.white); y += 9;
      const quests = questLocations(w).filter(q=>q.systemId === sys.id).sort((a,b)=>Number(!!b.focused)-Number(!!a.focused));
      line(`QUEST OBJECTIVES: ${quests.length}`,px,y,PAL.gold);
      for (const q of quests) {
        line(`${q.focused ? "CHOSEN" : q.ready ? "READY" : q.source}: ${q.title.toUpperCase()}`,px,y,q.ready ? PAL.good : PAL.gold);
        const location=q.contactId?.startsWith("station:") ? findStation(w,q.contactId.slice(8))?.st.name : q.contactId?.startsWith("planet:") ? sys.planets[Number(q.contactId.slice(7))]?.name : q.contactId?.startsWith("wreck:") ? sys.wrecks.find(x=>`wreck:${x.id}`===q.contactId)?.name : undefined;
        if(location) line(`AT ${location.toUpperCase()}`,px,y,PAL.white);
        line(q.action.toUpperCase(),px,y,PAL.grey);
      }
      if (sys.starClass) { line( `CLASS ${sys.starClass}`, px + 6, y, PAL.grey); y += 9; }
      line( fac.name, px + 6, y, fac.color); y += 9;
      line( `STANDING: ${repLabel(w.player.rep[sys.factionId] ?? 0)}`, px + 6, y, PAL.grey); y += 11;
      line( `PLANETS ${sys.planets.length}  STATIONS ${sys.stations.length}`, px + 6, y, PAL.grey); y += 9;
      line( `WRECKS ${sys.wrecks.filter(wreckAvailable).length}  SIGNALS ${sys.anomalies.filter((a) => !a.claimed).length}`, px + 6, y, PAL.grey); y += 9;
      const pir = sys.pirateActivity;
      line( `PIRACY: ${pir > 0.6 ? "SEVERE" : pir > 0.3 ? "MODERATE" : "LOW"}`, px + 6, y, pir > 0.6 ? PAL.danger : pir > 0.3 ? PAL.warn : PAL.good); y += 9;
      if (w.wars.some((ww) => ww.systemId === sys.id)) { line( "ACTIVE WAR ZONE", px + 6, y, PAL.danger); y += 9; }
      { const bs = borderStanding(w); if (bs && bs.c.systemId === sys.id) { line( `CONTESTED THIS WEEK`, px + 6, y, PAL.warn); y += 9; line( `${faction(bs.c.incumbent).name.split(" ")[0].toUpperCase()} ${bs.inc} V ${faction(bs.c.challenger).name.split(" ")[0].toUpperCase()} ${bs.chal}`, px + 6, y, PAL.grey); y += 9; if (bs.yoursInc || bs.yoursChal) { line( `YOUR PUSH: ${bs.yoursInc ? `+${bs.yoursInc} HOLD` : ""}${bs.yoursInc && bs.yoursChal ? " " : ""}${bs.yoursChal ? `+${bs.yoursChal} FLIP` : ""}`, px + 6, y, PAL.gold); y += 9; } } }
      if (sys.permit) { line( permitDenied(w, sys.id) ? "PERMIT SPACE: ALLIED ONLY" : "PERMIT SPACE: YOU'RE CLEARED", px + 6, y, permitDenied(w, sys.id) ? PAL.warn : PAL.good); y += 9; }
      if (w.synWar && w.synWar.systemId === sys.id) { line( `SYNDICATE WAR: [${w.synWar.attacker}] VS [${w.synWar.defender}]`, px + 6, y, PAL.danger); y += 9; }
      if (w.crisis && w.crisis.systemId === sys.id && w.crisis.delivered < w.crisis.need && w.time < w.crisis.until) { line( `CRISIS: ${w.crisis.need - w.crisis.delivered} ${commodity(w.crisis.commodityId).name.toUpperCase()} NEEDED`, px + 6, y, PAL.danger); y += 9; }
      { const ev = galaxyEventAt(w, sys.id); if (ev) { line( ev.kind === "comet" ? "COMET: RICH BELT" : ev.kind === "flare" ? "SOLAR FLARE: HOT, SHORT SCANS" : ev.kind === "festival" ? "FESTIVAL WEEK" : ev.kind === "storm" ? (stormBlind(w, sys.id) ? "ION STORM: BLIND" : "ION STORM: BEACON HOLDS") : "DOCK STRIKE", px + 6, y, ev.kind === "flare" || ev.kind === "strike" || ev.kind === "storm" ? PAL.warn : PAL.gold); y += 9; } }
      { const st = w.player.story ?? 0; const t = w.player.storyTarget; if (st === 2 && t?.systemId === sys.id) { line( "THE SIGNAL: THE RUIN IS HERE", px + 6, y, PAL.info); y += 9; } if (st === 4 && w.player.storyVeil === sys.id) { line( "THE SIGNAL: THE VEIL LISTEN HERE", px + 6, y, PAL.info); y += 9; } if (st === 5 && w.player.storyOrigin === sys.id) { line( "THE SIGNAL: THE COUNT ENDS HERE", px + 6, y, PAL.info); y += 9; } }
      const lvl = w.player.expLog?.[sys.id] ?? 0;
      line( lvl === 2 ? "LOGGED: DETAILED" : lvl === 1 ? "LOGGED: BASIC" : "UNLOGGED", px + 6, y, lvl ? PAL.grey : PAL.greyDark); y += 9;
      const homes = (w.player.homesteads ?? []).filter((h) => h.systemId === sys.id);
      if (homes.length) { line( `HOMESTEAD: ${homes.map((h) => sys.planets[h.planetIdx].name).join(", ")}`, px + 6, y, PAL.gold); y += 9; }
      for (const wd of wondersIn(w, sys.id)) { if (wd.seen || w.player.flags?.[`rumour:${wd.id}`]) { line( `${wd.seen ? "WONDER" : "RUMOURED"}: ${wd.name.toUpperCase()}`, px + 6, y, PAL.gold); y += 9; const fb = w.player.firsts?.[`wonder:${wd.id}`]; if (fb) { line( `FIRST LOGGED BY ${fb}`, px + 6, y, PAL.gold); y += 9; } } }
      if (w.realGalaxy) for (const l of wire.lightsAt(sys.name)) { line( `${l.callsign}'S ${l.upgraded ? "WAYSTATION" : l.kind.toUpperCase()}`, px + 6, y, PAL.info); y += 9; }
      for (const inf of infraAt(w, sys.id)) { line( `${inf.kind.toUpperCase()}: ${infraLit(inf) ? `LIT, TILL ${Math.round(inf.till)}CR` : "DARK"}`, px + 6, y, infraLit(inf) ? PAL.gold : PAL.danger); y += 9; }
      if (!sys.stations.length && !infraAt(w, sys.id).length && ((w.player.kits?.beacon ?? 0) > 0 || (w.player.kits?.depot ?? 0) > 0)) { line( "DEAD SYSTEM: KIT DEPLOYABLE", px + 6, y, PAL.gold); y += 9; }
      const first = w.player.firsts?.[sys.id];
      if (first) { line( `FIRST: ${first}`, px + 6, y, PAL.gold); y += 9; }
      if (w.player.bookmarks?.includes(sys.id)) { line( "BOOKMARKED (B)", px + 6, y, PAL.gold); y += 9; }
      const n = this.rooms[sys.name.toLowerCase()];
      if (n) { line( `${n} PILOT${n === 1 ? "" : "S"} HERE NOW`, px + 6, y, PAL.info); y += 9; }
      const patron = wire.patronOf(sys.factionId);
      if (patron) { line( `FACTION PATRON: [${patron}]`, px + 6, y, patron === wire.getSquadron() ? PAL.gold : PAL.info); y += 9; }
      const rares = sys.stations.filter((st) => st.rare && (w.player.marketMemory?.[st.id])).map((st) => commodity(st.rare!).name);
      if (rares.length) { line( `RARE: ${rares.join(", ")}`, px + 6, y, PAL.gold); y += 9; }
      y += 3;
      line( "STATIONS:", px + 6, y, PAL.greyDark); y += 9;
      for (const st of sys.stations) { const b = wire.baseAt(st.id); const sy = syndicateAt(w, st.id); line( `${st.military ? "*" : "-"} ${st.name}${b ? ` [${b.tag}]` : sy ? ` [${sy.tag}] AI` : ""}`, px + 6, y, b ? PAL.gold : sy ? sy.color : st.military ? PAL.danger : PAL.ui); y += 8; }
      y += 3;
      line( "LINKS:", px + 6, y, PAL.greyDark); y += 9;
      for (const l of sys.links) { if (!w.systems[l]) continue; line( `> ${w.systems[l].name} ${sys.ly[l] ?? "?"}LY`, px + 6, y, PAL.info); y += 8; }
    return lines;
  }
  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    if (this.info) { this.info.draw(g, ctx); return; }
    this.syncSelection(g);
    const w = g.world, p = w.player, systems = Object.values(w.systems), cur = w.systems[p.systemId];
    const sys = w.systems[this.selected ?? p.systemId] ?? cur;
    if (!sys || !cur) { mapFrame(ctx, "GALAXY MAP", "NO AVAILABLE SYSTEM"); return; }
    const route = p.navTarget && w.systems[p.navTarget] ? navRoute(w, p.systemId, p.navTarget) : null;
    const planned = this.selected && this.selected !== p.systemId ? navRoute(w, p.systemId, this.selected) : null;
    const title = w.realGalaxy ? `SOL NEIGHBOURHOOD / ${w.galaxyLy ?? 20} LY` : "GALAXY MAP";
    const shortcuts = [knowsSingersBerth(p) ? "R SINGERS" : "", p.council?.mandate ? "C COUNCIL" : "", p.service?.order ? "U ORDERS" : ""].filter(Boolean).join(" / ");
    mapFrame(ctx, title, `CURRENT: ${cur.name.toUpperCase()}${shortcuts ? ` / ${shortcuts}` : ""}`);
    ctx.save(); ctx.beginPath(); ctx.rect(MAP_RECT.x + 1, MAP_RECT.y + 1, MAP_RECT.w - 2, MAP_RECT.h - 2); ctx.clip();
    const point = (s: typeof cur) => this.camera.project({ x: s.gx, y: s.gy });
    const edge = (a: typeof cur, b: typeof cur, color: string, alpha = 1) => { if (!a || !b) return; const x = point(a), y = point(b); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(x.x,x.y); ctx.lineTo(y.x,y.y); ctx.stroke(); ctx.globalAlpha = 1; };
    for (const a of systems) for (const id of a.links) {
      const b = w.systems[id]; if (!b || a.id > id) continue;
      if (a.id === sys.id || b.id === sys.id) edge(a,b,"#37536d");
      else if (a.id === cur.id || b.id === cur.id) edge(a,b,"#203b4e");
      else if (this.layers) edge(a,b,"#16243b",0.6);
    }
    if (this.layers) {
      for (const r of p.routes ?? []) { const a = findStation(w,r.from)?.sys, b = findStation(w,r.to)?.sys; if (a && b && a !== b && r.t > Date.now() - 7 * 86400_000) edge(a,b,PAL.gold,0.25); }
      for (const r of p.haulers ?? []) { const a = findStation(w,r.from)?.sys, b = findStation(w,r.to)?.sys; if (a && b && a !== b) { ctx.setLineDash([2,3]); edge(a,b,PAL.gold,0.45); ctx.setLineDash([]); } }
    }
    if (planned) { ctx.setLineDash([2,3]); for (let i=1;i<planned.length;i++) edge(w.systems[planned[i-1]],w.systems[planned[i]],PAL.ui,0.65); ctx.setLineDash([]); }
    if (route) for (let i=1;i<route.length;i++) edge(w.systems[route[i-1]],w.systems[route[i]],PAL.gold);
    const quests = questLocations(w);
    const labels: MapLabel[] = [];
    for (const s of systems) {
      const objectives=quests.filter(q=>q.systemId===s.id);
      if (this.questOnly && !objectives.length && s.id!==cur.id && s.id!==this.selected) continue;
      const at = point(s), selected = s.id === sys.id, current = s.id === cur.id;
      if (!contains(MAP_RECT,at.x,at.y)) continue;
      ctx.fillStyle = faction(s.factionId).color; ctx.globalAlpha = selected || current ? 0.25 : 0.10; ctx.beginPath(); ctx.arc(at.x,at.y,selected ? 10 : 5,0,Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = s.sunColor; ctx.fillRect(Math.round(at.x)-2,Math.round(at.y)-2,4,4);
      if (current || selected) { ctx.strokeStyle = current ? PAL.white : PAL.ui; ctx.strokeRect(Math.round(at.x)-5.5,Math.round(at.y)-5.5,11,11); }
      if (objectives.length) drawQuestMarker(ctx,at.x,at.y,objectives.some(q=>q.ready));
      if (p.bookmarks?.includes(s.id)) { ctx.fillStyle = PAL.gold; ctx.fillRect(at.x-2,at.y-9,3,2); }
      if (w.wars.some(war => war.systemId === s.id) || (w.crisis?.systemId === s.id && w.crisis.delivered < w.crisis.need && w.time < w.crisis.until)) { ctx.fillStyle = PAL.danger; ctx.fillRect(at.x+5,at.y-5,3,3); }
      if (s.permit && permitDenied(w,s.id)) { ctx.strokeStyle = PAL.warn; ctx.beginPath(); ctx.arc(at.x,at.y,7,0,Math.PI*2); ctx.stroke(); }
      if (this.layers && infraAt(w,s.id).length) { ctx.fillStyle = PAL.gold; ctx.fillRect(at.x+5,at.y+4,2,2); }
      labels.push({ id:s.id,text:`${objectives.some(q=>q.focused) ? "* " : objectives.length ? "Q " : ""}${s.name.toUpperCase()}`,...at,color:current ? PAL.white : selected ? PAL.ui : objectives.length ? PAL.gold : route?.includes(s.id) ? PAL.gold : PAL.grey,priority:objectives.some(q=>q.focused) ? 110 : selected ? 100 : current ? 90 : objectives.length ? 85 : route?.includes(s.id) ? 80 : p.bookmarks?.includes(s.id) ? 70 : sys.links.includes(s.id) ? 60 : 0 });
    }
    this.labels = drawMapLabels(ctx,labels); ctx.restore();
    drawText(ctx, `ZOOM ${(this.camera.scale/this.camera.baseScale).toFixed(1)}X`, MAP_RECT.x+5, MAP_RECT.y+5,PAL.greyDark);
    if (this.searching) {
      drawText(ctx,"FIND SYSTEM",318,39,PAL.ui); drawText(ctx,clippedText(`${this.query}_`,148),318,51,PAL.white);
      const found = this.syncSearch(g), start = this.search.offset; this.drawnResults = found.slice(start, start + 12).map(s => s.id);
      found.slice(start,start+12).forEach((s,i) => { if (start+i===this.searchIndex) { ctx.fillStyle="#20374b";ctx.fillRect(316,65+i*12,152,12); } drawText(ctx,clippedText(s.name.toUpperCase(),145),320,68+i*12,PAL.grey); });
      if (!found.length) drawText(ctx,"NO MATCHING SYSTEMS",318,69,PAL.grey);
      drawText(ctx,`${found.length ? this.searchIndex + 1 : 0}/${found.length}  ENTER SELECT`,318,214,PAL.greyDark);
    } else {
      drawText(ctx,clippedText(sys.name.toUpperCase(),148),318,39,PAL.white);
      const lines=this.infoLines(g).slice(1), start=Math.min(this.infoScroll,Math.max(0,lines.length-16));
      ctx.save();ctx.beginPath();ctx.rect(317,51,150,160);ctx.clip();
      lines.slice(start,start+16).forEach((line,i)=>drawText(ctx,clippedText(line.text,146),318,53+i*10,line.color));ctx.restore();
      drawText(ctx,`${start+1}..${Math.min(start+16,lines.length)} / ${lines.length}  SCROLL DETAILS`,318,215,PAL.greyDark);
    }
    if (this.searching) {
      mapButton(ctx, SEARCH_PREV, "PAGE UP"); mapButton(ctx, SEARCH_NEXT, "PAGE DOWN");
      mapButton(ctx, SEARCH_SELECT, "ENTER SELECT"); mapButton(ctx, SEARCH_BACK, "ESC BACK");
      drawText(ctx, "TYPE TO FIND / HOME/END FIRST/LAST / ROW CLICK SELECTS", 8, 250, PAL.grey);
      drawText(ctx, "SELECT INSPECTS A SYSTEM. PLOT OR FLY AFTER CLOSING SEARCH.", 8, 261, PAL.greyDark);
      return;
    }
    mapButton(ctx, DETAILS, "I FULL DETAILS"); mapButton(ctx, OBJECTIVES, "O ALL OBJECTIVES");
    mapButton(ctx,QUESTS,`Q QUESTS ${new Set(quests.map(q=>q.systemId)).size}`,this.questOnly);
    mapButton(ctx,FIT,"HOME FIT");mapButton(ctx,FIND,"F FIND");mapButton(ctx,LAYERS,`V LANES ${this.layers ? "ON" : "OFF"}`,this.layers);
    mapButton(ctx,PLOT,p.navTarget===this.selected ? "N CLEAR COURSE" : "N PLOT COURSE",p.navTarget===this.selected);
    mapButton(ctx,FLY,"A FLY THERE");
    mapButton(ctx,MARK,"B MARK",!!p.bookmarks?.includes(sys.id));
    const fuel = planned ? routeFuel(w,planned) : 0;
    const status = sys.id===cur.id ? "YOU ARE HERE" : !planned ? "NO OPEN ROUTE" : `${planned.length-1} JUMPS / ${fuel} FUEL / ${Math.round(p.fuel)} ABOARD${fuel>p.fuel ? " / REFUEL NEEDED" : ""}`;
    drawText(ctx,status,8,250,fuel>p.fuel ? PAL.warn : PAL.gold);
    drawText(ctx,"WHEEL ZOOM / RIGHT DRAG OR ARROWS PAN / [ ] SELECT / ESC BACK",8,261,PAL.greyDark);
  }
}
