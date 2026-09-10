// Station scene: docked services — market, shipyard, ships, missions, bar (crew), storage, news.

import { ask, confirmBox } from "../core/dialog";
import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth, CHAR_H } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { RNG } from "../core/rng";
import { clamp } from "../core/mathx";
import { commodity, faction } from "../data/data";
import { HULLS, hull } from "../data/hulls";
import { ROLE_INFO, CrewMember } from "../data/crew";
import {
  StationDef, StoredShip, Mission, genMissionsFor, cargoUsed, addCargo, removeCargo, findStation,
  buyPrice, sellPrice, rareSellPrice, refreshPrices, missionDeliverable, adjustRep, repLabel, missionTier,
  crewWages, genCrewCandidate, applyHull, pushEvent, ARCS, dailyContract, dailyKey, rankOf, rankValue, RANK_TITLES, communityGoal, blackMarket,
} from "../world";
import { ACHIEVEMENTS } from "../data/achievements";
import { MODULES, hasModule, moduleDef } from "../data/modules";
import { BLUEPRINTS, MATERIALS, engGrade, nextCost, canAfford, upgrade } from "../data/engineering";
import { flag } from "../core/achievements";
import { presence } from "../core/presence";
import { sfx } from "../core/sfx";
import * as wire from "../core/wire";
import { drawTutorial } from "../core/tutorial";
import { music } from "../core/music";

const TABS = ["MARKET", "SHIPYARD", "SHIPS", "MISSIONS", "BAR", "SURVEY", "ENGINEER", "STORAGE", "BASE", "NEWS", "WIRE", "RECORD"] as const;

export class StationScene implements Scene {
  touchMode = "menu" as const;
  tab = 0;
  cursor = 0;
  boardMissions: Mission[] = [];
  barLine = "";
  candidates: CrewMember[] = [];
  station!: StationDef;
  returnTo: "flight" | "stationwalk" = "flight";
  rowBoxes: [number, number][] = [];
  arrivedOnce = "";
  wireEvents: wire.WireEvent[] = [];
  boards: Record<string, wire.BoardEntry[]> = {};
  wireLoaded = false;

  enter(g: Game): void {
    const found = findStation(g.world, g.world.player.dockedAt!);
    if (!found) { g.setScene("flight"); return; }
    this.station = found.st;
    this.tab = 0;
    this.cursor = 0;
    this.returnTo = "flight";
    const p = g.world.player;
    const rng = new RNG((g.world.seed ^ this.station.id.length * 2711 ^ Math.floor(g.world.time / 60)) >>> 0);
    this.boardMissions = genMissionsFor(g.world, this.station, rng);
    // today's galaxy-wide contract, unless already done or already carried
    const daily = dailyContract(g.world);
    if (p.dailyDone !== dailyKey() && !p.missions.some((m) => m.id === daily.id)) this.boardMissions.unshift(daily);
    this.candidates = [];
    for (let i = 0; i < rng.int(1, 3); i++) this.candidates.push(genCrewCandidate(rng.fork(i + 1)));
    this.barLine = "";
    refreshPrices(this.station);
    void wire.fetchSquadronData();
    this.base = null; this.baseLoaded = false;
    void wire.fetchBases().then(() => { this.baseOwner = wire.baseAt(this.station.id)?.tag ?? null; });
    if (wire.getSquadron()) { void wire.fetchBase(wire.getSquadron()!).then((b) => { this.base = b; this.baseLoaded = true; if (!b?.stationId && !this.station.military) g.showHint("base", "BASE TAB: POOL CREDITS WITH YOUR SQUADRON AND BUY A STATION AS YOUR BASE"); }); } else this.baseLoaded = true;
    {
      const rep0 = p.rep[this.station.factionId] ?? 0;
      const seen: Record<string, [number, number]> = {};
      for (const id of Object.keys(this.station.prices)) seen[id] = [buyPrice(this.station, id, rep0), sellPrice(this.station, id, rep0)];
      (p.marketMemory ??= {})[this.station.id] = { t: g.world.time, systemId: p.systemId, prices: seen };
    }
    p.oxygen = p.oxygenMax;
    // docking is where the crew gets paid and fed — once per docking event
    const dockKey = `${this.station.id}:${Math.floor(g.world.time)}`;
    if (this.arrivedOnce !== dockKey) {
      this.arrivedOnce = dockKey;
      this.settleCrew(g);
    }
    g.showHint("station", "ARROWS/CLICK TO BROWSE - ENTER TO ACT - ESC UNDOCKS - P WALKS THE DECK");
    g.autosave();
    const bay = 1 + (this.station.id.length * 7 + Math.floor(g.world.time)) % 6;
    g.toast(`${this.station.name.toUpperCase()} CONTROL: ${p.shipName ? p.shipName + ", " : ""}CLEARANCE GRANTED, BAY ${bay}`);
  }

  settleCrew(g: Game): void {
    const p = g.world.player;
    if (!p.crew.length) return;
    const wages = crewWages(p);
    if (p.credits >= wages) { p.credits -= wages; g.toast(`CREW WAGES PAID -${wages}CR`); }
    else { for (const c of p.crew) c.morale = Math.max(0, c.morale - 20); g.toast("CAN'T PAY WAGES - CREW MORALE DROPS"); }
    for (const c of p.crew) {
      if ((p.cargo.food ?? 0) > 0) { removeCargo(p, "food", 1); c.morale = Math.min(100, c.morale + 8); }
      else c.morale = Math.max(0, c.morale - 15);
    }
    const quitters = p.crew.filter((c) => c.morale <= 5);
    for (const q of quitters) g.toast(`${q.name.toUpperCase()} WALKED OFF THE SHIP`);
    p.crew = p.crew.filter((c) => c.morale > 5);
  }

  update(g: Game, dt: number): void {
    const inp = g.input;
    music.setMood(this.station.factionId, 0);
    presence.tick(g.world.player, g.world.systems[g.world.player.systemId].name); // still "here" while docked
    if (inp.wasPressed("Escape")) {
      this.flushGoal();
      if (this.returnTo === "stationwalk") g.setScene("stationwalk");
      else { g.world.player.dockedAt = null; g.setScene("flight"); g.toast("UNDOCKED"); }
      return;
    }
    if (inp.wasPressed("p")) { g.setScene("stationwalk"); return; }
    if (inp.wasPressed("F5")) g.save();
    if (inp.wasPressed("ArrowLeft") || inp.wasPressed("q")) { this.tab = (this.tab + TABS.length - 1) % TABS.length; this.cursor = 0; }
    if (inp.wasPressed("ArrowRight") || inp.wasPressed("e")) { this.tab = (this.tab + 1) % TABS.length; this.cursor = 0; }
    if (inp.wasPressed("ArrowUp")) { this.cursor--; sfx.blip(); }
    if (inp.wasPressed("ArrowDown")) { this.cursor++; sfx.blip(); }
    if (inp.wheel) this.cursor += Math.sign(inp.wheel);

    let clickedRow = false;
    if (inp.mousePressed) {
      let tx = 8;
      for (let i = 0; i < TABS.length; i++) {
        const w = textWidth(TABS[i]) + 10;
        if (inp.mouseY >= 36 && inp.mouseY <= 50 && inp.mouseX >= tx - 4 && inp.mouseX < tx + w - 4) { this.tab = i; this.cursor = 0; }
        tx += w;
      }
    }
    if (inp.mouseX > 4 && inp.mouseX < 476) {
      const row = this.rowBoxes.findIndex(([y0, y1]) => inp.mouseY >= y0 && inp.mouseY <= y1);
      if (row >= 0) { this.cursor = row; if (inp.mousePressed) clickedRow = true; }
    }

    const p = g.world.player;
    const st = this.station;
    const patron = wire.patronOf(st.factionId);
    const rep = (p.rep[st.factionId] ?? 0) + (patron && patron === wire.getSquadron() ? 25 : 0); // patrons trade like allies
    const enter = inp.wasPressed("Enter") || inp.wasPressed(" ") || clickedRow;
    if (enter) sfx.select();

    switch (TABS[this.tab]) {
      case "MARKET": {
        const rows = this.marketRows(g);
        this.cursor = clamp(this.cursor, 0, rows.length - 1);
        const id = rows[this.cursor];
        if (enter || inp.wasPressed("b")) {
          const price = buyPrice(st, id, rep);
          if ((st.stock[id] ?? 0) <= 0) g.toast("OUT OF STOCK");
          else if (p.credits < price) g.toast("NOT ENOUGH CREDITS");
          else if (!addCargo(p, id, 1)) g.toast("CARGO FULL");
          else { p.credits -= price; st.stock[id]--; refreshPrices(st); g.showHint("trade", "PRICES MOVE: BUY WHERE STOCK IS HIGH, SELL WHERE IT'S LOW"); }
        }
        if (inp.wasPressed("s") || inp.wasPressed("Backspace")) {
          const rare = commodity(id).rare;
          const illegal = commodity(id).illegal;
          const fence = illegal && blackMarket(g.world, st);
          const price = rare ? rareSellPrice(g.world, st, id, rep) : Math.round(sellPrice(st, id, rep) * (fence ? 1.3 : 1));
          if (!removeCargo(p, id, 1)) g.toast("NONE IN CARGO");
          else if (illegal && !fence && Math.random() < 0.12) {
            // customs sting: the crate is gone and so is some goodwill
            adjustRep(g.world, st.factionId, -5);
            p.wanted = Math.min(1, (p.wanted ?? 0) + 0.1);
            g.toast(`CUSTOMS STING - ${commodity(id).name.toUpperCase()} SEIZED, NO PAYMENT`);
            sfx.alarm();
          } else {
            if (fence) flag(g, "fence");
            const goalHit = id === this.goal.commodityId && st.type === this.goal.stationType;
            const paid = Math.round(price * (goalHit ? 1 + this.goal.premium : 1) * (this.baseHas("market") ? 1.08 : 1));
            if (goalHit) { this.goalPending++; p.goalContrib ??= {}; p.goalContrib[this.goal.id] = (p.goalContrib[this.goal.id] ?? 0) + 1; if ((p.goalContrib[this.goal.id] ?? 0) >= 20) flag(g, "communal"); }
            p.credits += paid; p.tradeRevenue = (p.tradeRevenue ?? 0) + paid;
            if (!rare || st.rare === id) { st.stock[id] = (st.stock[id] ?? 0) + 1; refreshPrices(st); }
            if (rare && st.rare !== id) { p.rareRevenue = (p.rareRevenue ?? 0) + price; if (!p.flags?.rareRun) flag(g, "rareRun"); }
          }
        }
        break;
      }
      case "SHIPYARD": {
        const options = this.shipyardOptions(g);
        this.cursor = clamp(this.cursor, 0, options.length - 1);
        if (enter) options[this.cursor].action();
        break;
      }
      case "SHIPS": {
        const stored = (p.fleet ?? []).filter((f) => f.stationId === st.id);
        this.cursor = clamp(this.cursor, 0, HULLS.length + stored.length - 1);
        if (enter) {
          if (this.cursor < HULLS.length) this.buyHull(g, HULLS[this.cursor].id, false);
          else this.swapShip(g, stored[this.cursor - HULLS.length]);
        }
        if (inp.wasPressed("k") && this.cursor < HULLS.length) this.buyHull(g, HULLS[this.cursor].id, true);
        if (inp.wasPressed("o")) {
          const PAINTS = ["#63f2c8", "#ff5a5a", "#ffd75a", "#5ab3ff", "#e060ff", "#ff9a3a", "#f2f4ff", "#3aa55e"];
          const i = PAINTS.indexOf(p.paint ?? "");
          p.paint = PAINTS[(i + 1) % PAINTS.length];
          g.spriteCache.delete(`player-ship-${p.hullId}-${p.paint}`);
          g.toast(`PAINT: ${["TEAL", "RED", "GOLD", "BLUE", "VIOLET", "ORANGE", "WHITE", "GREEN"][PAINTS.indexOf(p.paint)]} TRIM`);
          sfx.blip();
        }
        if (inp.wasPressed("n")) {
          const raw = ask("Name your ship (2-18 characters):", p.shipName ?? "");
          if (raw !== null) {
            const n = raw.trim().toUpperCase().replace(/[^A-Z0-9 '\-]/g, "").slice(0, 18);
            if (n.length >= 2) { p.shipName = n; g.toast(`REGISTERED: ${n}`); sfx.select(); } else g.toast("NAME NOT ACCEPTED");
          }
        }
        break;
      }
      case "MISSIONS": {
        if (Date.now() - this.goalFetched > 60_000) { this.goalFetched = Date.now(); this.flushGoal(); void wire.fetchGoal(this.goal.id).then((st) => { if (st) this.goalState = st; }); }
        const avail = this.boardMissions.filter((m) => !m.accepted);
        const deliverable = p.missions.filter((m) => missionDeliverable(g.world, m, st));
        const rows = deliverable.length + avail.length;
        this.cursor = clamp(this.cursor, 0, Math.max(0, rows - 1));
        if (enter) {
          if (this.cursor < deliverable.length) this.completeMission(g, deliverable[this.cursor]);
          else {
            const m = avail[this.cursor - deliverable.length];
            if (m) this.acceptMission(g, m);
          }
        }
        break;
      }
      case "BAR": {
        const rows = st.barPatrons.length + this.candidates.length;
        this.cursor = clamp(this.cursor, 0, Math.max(0, rows - 1));
        if (enter) {
          if (this.cursor < st.barPatrons.length) {
            const rng = new RNG((g.world.seed ^ (this.cursor * 7727) ^ Math.floor(g.world.time / 20)) >>> 0);
            this.barLine = rng.pick(BAR_LINES)(g, this.station);
          } else {
            const c = this.candidates[this.cursor - st.barPatrons.length];
            if (c) this.hire(g, c);
          }
        }
        break;
      }
      case "STORAGE": {
        const held = Object.keys(p.cargo);
        const stored = Object.keys(p.storage[st.id] ?? {});
        const rows = held.length + stored.length;
        this.cursor = clamp(this.cursor, 0, Math.max(0, rows - 1));
        if (enter && rows) {
          p.storage[st.id] ??= {};
          const box = p.storage[st.id];
          if (this.cursor < held.length) {
            const id = held[this.cursor];
            if (removeCargo(p, id, 1)) box[id] = (box[id] ?? 0) + 1;
          } else {
            const id = stored[this.cursor - held.length];
            if (box[id] > 0 && addCargo(p, id, 1)) { box[id]--; if (box[id] <= 0) delete box[id]; }
            else g.toast("CARGO FULL");
          }
        }
        break;
      }
      case "NEWS":
        this.cursor = clamp(this.cursor, 0, g.world.news.length - 1);
        break;
      case "WIRE":
        if (!this.wireLoaded) { this.wireLoaded = true; void this.loadWire(); }
        if (inp.wasPressed("c")) { void this.chooseCallsign(g); }
        break;
      case "SURVEY":
        this.cursor = 0;
        if (enter) this.sellExploration(g);
        break;
      case "BASE": {
        const p2 = g.world.player;
        const tag = wire.getSquadron();
        const rows = this.baseRows(g);
        this.cursor = clamp(this.cursor, 0, Math.max(0, rows.length - 1));
        const row = rows[this.cursor];
        if (enter && row && tag) {
          if (row.kind === "fund") {
            const raw = ask(`Fund the [${tag}] treasury. Credits to contribute (you have ${p2.credits}):`, "1000");
            inp.flush();
            const n = Math.floor(Number(raw));
            if (raw !== null && Number.isFinite(n) && n > 0) {
              if (n > p2.credits) g.toast("NOT ENOUGH CREDITS");
              else { p2.credits -= n; void this.baseDo(g, "fund", { credits: n }, (b) => { g.toast(`TREASURY NOW ${b.treasury}CR`); sfx.pickup(); flag(g, "baseFunder"); }); }
            }
          } else if (row.kind === "buy") {
            const price = wire.basePrice(st.type, st.military);
            void this.baseDo(g, "buy", { stationId: st.id, stationName: st.name, systemName: g.world.systems[p2.systemId].name, price }, (b) => {
              g.toast(`${st.name.toUpperCase()} IS NOW THE [${tag}] BASE`); sfx.dock(); flag(g, "baseFounder");
              void wire.post("base", `founded the [${tag}] squadron base at ${st.name}`, g.world.systems[p2.systemId].name);
              void b;
            });
          } else if (row.kind === "upgrade") {
            void this.baseDo(g, "upgrade", { upgrade: row.id }, () => { g.toast(`${row.label.toUpperCase()} FITTED`); sfx.repair(); });
          } else if (row.kind === "deposit") {
            if (removeCargo(p2, row.id!, 1)) void this.baseDo(g, "deposit", { id: row.id, qty: 1 }, () => sfx.pickup()).then((ok) => { if (!ok) addCargo(p2, row.id!, 1); });
          } else if (row.kind === "withdraw") {
            if (cargoUsed(p2) >= p2.cargoMax) g.toast("CARGO FULL");
            else void this.baseDo(g, "withdraw", { id: row.id, qty: 1 }, () => { addCargo(p2, row.id!, 1); sfx.pickup(); });
          }
        }
        break;
      }
      case "ENGINEER": {
        this.cursor = clamp(this.cursor, 0, BLUEPRINTS.length - 1);
        if (enter && this.hasEngineer()) {
          const bp = BLUEPRINTS[this.cursor];
          const cost = nextCost(p, bp);
          if (!cost) g.toast("ALREADY AT MAXIMUM GRADE");
          else if (!canAfford(p, cost)) g.toast("NOT ENOUGH MATERIALS - MINE, SALVAGE, SURVEY");
          else if (upgrade(p, bp)) {
            if (bp.id === "shields") { p.shieldMax = Math.round(p.shieldMax * 1.1); p.shield = p.shieldMax; }
            if (bp.id === "cargo") p.cargoMax += 5;
            flag(g, "engineer");
            g.toast(`${bp.name.toUpperCase()} GRADE ${engGrade(p, bp.id)} APPLIED`);
            sfx.repair();
          }
        }
        break;
      }
      case "RECORD":
        this.cursor = clamp(this.cursor, 0, Math.max(0, Math.ceil(ACHIEVEMENTS.length / 2) - 12));
        break;
    }
  }

  squadrons: wire.Squadron[] = [];
  patrons: Record<string, string> = {};
  base: wire.BaseRec | null = null;   // my squadron's base record
  baseLoaded = false;
  baseOwner: string | null = null;    // tag owning THIS station
  baseBusy = false;

  // Is this station my squadron's base?
  myBaseHere(): boolean {
    const tag = wire.getSquadron();
    return !!tag && !!this.base && this.base.stationId === this.station.id;
  }
  baseHas(up: string): boolean { return this.myBaseHere() && !!this.base?.upgrades.includes(up); }

  async baseDo(g: Game, action: string, payload: Record<string, unknown>, onOk?: (b: wire.BaseRec) => void): Promise<boolean> {
    if (this.baseBusy) return false;
    this.baseBusy = true;
    const r = await wire.baseAction(action, payload);
    this.baseBusy = false;
    if (r.ok && r.base) {
      this.base = r.base;
      if (this.base.stationId === this.station.id) this.baseOwner = wire.getSquadron();
      onOk?.(r.base);
      return true;
    }
    g.toast(`BASE: ${(r.error ?? "FAILED").toUpperCase()}${r.short ? ` (${r.short}CR SHORT)` : ""}`);
    return false;
  }
  async loadWire(): Promise<void> {
    this.wireEvents = await wire.fetchWire(true);
    const sd = await wire.fetchSquadronData(true);
    this.squadrons = sd.squadrons; this.patrons = sd.patrons;
    for (const b of ["discoveries", "arcs", "credits", "kills", "explorers", "traders"]) this.boards[b] = await wire.fetchBoard(b);
  }

  async chooseCallsign(g: Game): Promise<void> {
    const raw = ask("Choose a call sign (2-16 letters, digits, space, - or _):", wire.getCallsign() ?? "");
    if (raw === null) return;
    const c = raw.trim().toUpperCase();
    if (!wire.validCallsign(c)) { g.toast("CALL SIGN NOT ACCEPTED"); return; }
    wire.setCallsign(c);
    g.toast(`CALL SIGN SET: ${c}`);
    wire.syncScores(g.world);
    setTimeout(() => { void this.loadWire(); }, 800);
  }

  acceptMission(g: Game, m: Mission): void {
    const p = g.world.player;
    const st = this.station;
    if (p.missions.filter((x) => x.accepted && !x.done).length >= 5) { g.toast("MISSION LOG FULL"); return; }
    if (m.kind === "passenger" && p.missions.some((x) => x.kind === "passenger" && x.accepted && !x.done)) { g.toast("ONE PASSENGER AT A TIME"); return; }
    if (m.tier && m.tier > missionTier(p.rep[st.factionId] ?? 0)) { g.toast("YOUR STANDING ISN'T HIGH ENOUGH"); return; }
    if ((m.kind === "delivery" || (m.kind === "arc" && m.commodityId && m.arcStage !== undefined && ARCS[m.arcFaction!].stages[m.arcStage].kind === "delivery")) && m.commodityId && m.qty) {
      if (!addCargo(p, m.commodityId, m.qty)) { g.toast("NOT ENOUGH CARGO SPACE"); return; }
    }
    m.accepted = true;
    p.missions.push(m);
    g.toast("MISSION ACCEPTED");
    if (m.kind === "escort") g.showHint("escort", "THE FREIGHTER LAUNCHES WHEN YOU UNDOCK - STAY CLOSE");
    if (m.kind === "research") g.showHint("research", "IN THE TARGET SYSTEM, HOLD V TO DEEP-SCAN FOR THE SIGNAL");
    if (m.kind === "passenger") g.showHint("passenger", "YOUR PASSENGER IS IN THE BUNK ROOM - TALK TO THEM ABOARD (I)");
  }

  completeMission(g: Game, m: Mission): void {
    const p = g.world.player;
    const st = this.station;
    if (m.commodityId && m.qty && m.kind !== "research") removeCargo(p, m.commodityId, m.qty);
    m.done = true;
    p.credits += m.reward;
    adjustRep(g.world, st.factionId, m.repReward ?? 3);
    if (m.kind === "passenger" && m.passengerKind === "tourist") flag(g, "tourist");
    if (m.id.startsWith("daily-")) { p.dailyDone = dailyKey(); flag(g, "daily"); void wire.post("daily", `completed today's contract (${m.title.replace("Daily: ", "")})`, g.world.systems[p.systemId].name); }
    if (m.kind === "arc" && m.arcFaction !== undefined && m.arcStage !== undefined) {
      p.arcs[m.arcFaction] = m.arcStage + 1;
      const arc = ARCS[m.arcFaction];
      const finished = p.arcs[m.arcFaction] >= arc.stages.length;
      pushEvent(g.world, {
        t: g.world.time, kind: "arc", systemId: p.systemId,
        text: finished
          ? `${faction(m.arcFaction).name}: "${arc.title}" concludes — an independent pilot changed the balance in this region`
          : `${faction(m.arcFaction).name} moves on "${arc.title}" — sources credit a freelance captain`,
      });
      if (finished) { adjustRep(g.world, m.arcFaction, 25); g.toast(`ARC COMPLETE: ${arc.title.toUpperCase()}`); }
      void wire.post("arc", finished ? `completed "${arc.title}" for the ${faction(m.arcFaction).name}` : `advanced "${arc.title}" (stage ${m.arcStage + 1})`, g.world.systems[p.systemId].name);
    }
    g.toast(`MISSION COMPLETE +${m.reward}CR`);
    sfx.pickup();
    if (m.kind === "bounty" && (m.killsNeeded ?? 0) >= 4) void wire.post("bounty", `collected a ${m.killsNeeded}-corsair bounty`, g.world.systems[p.systemId].name);
    p.missions = p.missions.filter((x) => !x.done);
    p.hints.firstMission ||= true;
  }

  hire(g: Game, c: CrewMember): void {
    const p = g.world.player;
    const slots = hull(p.hullId).crewSlots;
    const cost = c.wage * 3;
    if (p.crew.length >= slots) { g.toast(`NO BERTHS LEFT (${slots} ON THIS HULL)`); return; }
    if (p.credits < cost) { g.toast(`SIGNING BONUS ${cost}CR - NOT ENOUGH`); return; }
    p.credits -= cost;
    p.crew.push({ ...c });
    this.candidates = this.candidates.filter((x) => x !== c);
    g.toast(`${c.name.toUpperCase()} SIGNED ON AS ${ROLE_INFO[c.role].label}`);
    g.showHint("crew", "CREW LIVE ABOARD - VISIT THEM WITH I - KEEP FOOD IN CARGO");
  }

  // Park the current hull here and take another one out of storage
  swapShip(g: Game, ship: StoredShip | undefined): void {
    if (!ship) return;
    const p = g.world.player;
    const h = hull(ship.hullId);
    if (cargoUsed(p) > h.cargoMax + 25 * ((p.modules ?? []).includes("rack") ? 1 : 0) + 5 * (p.engineering?.cargo ?? 0)) { g.toast(`CARGO WON'T FIT IN THE ${h.name.toUpperCase()} - STORE OR SELL FIRST`); return; }
    if (p.crew.length > h.crewSlots) { g.toast(`TOO MUCH CREW FOR ${h.crewSlots} BERTHS`); return; }
    const parked: StoredShip = { hullId: p.hullId, stationId: this.station.id, name: p.shipName, hull: p.hull, torpedoes: p.torpedoes ?? 0 };
    p.fleet = (p.fleet ?? []).filter((f) => f !== ship);
    p.fleet.push(parked);
    const fuel = p.fuel;
    applyHull(p, ship.hullId);
    p.hull = Math.min(p.hullMax, ship.hull);
    p.fuel = Math.min(p.fuelMax, fuel);
    p.torpedoes = ship.torpedoes;
    p.shipName = ship.name;
    g.spriteCache.delete(`player-ship-${p.hullId}`);
    g.toast(`SWAPPED TO THE ${(ship.name ?? h.name).toUpperCase()} - ${(parked.name ?? hull(parked.hullId).name).toUpperCase()} PARKED HERE`);
    sfx.dock();
  }

  buyHull(g: Game, id: string, keepOld: boolean): void {
    const p = g.world.player;
    const h = hull(id);
    if (p.hullId === id) { g.toast("THIS IS YOUR CURRENT HULL"); return; }
    const tradeIn = keepOld ? 0 : Math.round(hull(p.hullId).price * 0.6);
    const cost = Math.max(0, h.price - tradeIn);
    if (p.credits < cost) { g.toast(keepOld ? `NEED ${cost}CR TO BUY WITHOUT TRADE-IN` : `NEED ${cost}CR AFTER TRADE-IN`); return; }
    if (cargoUsed(p) > h.cargoMax) { g.toast(`CARGO WON'T FIT: ${cargoUsed(p)}/${h.cargoMax} - STORE OR SELL FIRST`); return; }
    if (p.crew.length > h.crewSlots) { g.toast(`TOO MUCH CREW FOR ${h.crewSlots} BERTHS`); return; }
    p.credits -= cost;
    if (keepOld) {
      (p.fleet ??= []).push({ hullId: p.hullId, stationId: this.station.id, name: p.shipName, hull: p.hull, torpedoes: p.torpedoes ?? 0 });
      p.shipName = undefined;
      p.torpedoes = 0;
      flag(g, "fleet");
    }
    applyHull(p, id);
    g.spriteCache.delete(`player-ship-${p.hullId}`);
    g.toast(keepOld ? `WELCOME ABOARD THE ${h.name.toUpperCase()} - YOUR OLD HULL IS PARKED HERE` : `WELCOME ABOARD THE ${h.name.toUpperCase()}`);
    sfx.dock();
    void wire.post("hull", `took delivery of a ${h.name}`, g.world.systems[p.systemId].name);
  }

  shipyardOptions(g: Game): { label: string; sub: string; action: () => void }[] {
    const p = g.world.player;
    const st = this.station;
    const opts: { label: string; sub: string; action: () => void }[] = [];
    // patron squadrons keep their faction's yards half price for members
    const patronHere = (!!wire.getSquadron() && wire.patronOf(st.factionId) === wire.getSquadron()) || this.myBaseHere();
    const depot = this.baseHas("depot");
    const fuelPrice = depot ? 0 : patronHere ? Math.max(1, Math.round(st.fuelPrice / 2)) : st.fuelPrice;
    const repairPrice = depot ? 0 : patronHere ? Math.max(1, Math.round(st.repairPrice / 2)) : st.repairPrice;
    const fuelNeed = Math.ceil(p.fuelMax - p.fuel);
    opts.push({ label: `REFUEL (${fuelNeed} UNITS)${patronHere ? " - PATRON RATE" : ""}`, sub: `${fuelNeed * fuelPrice}CR`, action: () => {
      if (fuelNeed <= 0) return g.toast("TANKS FULL");
      const afford = fuelPrice ? Math.min(fuelNeed, Math.floor(p.credits / fuelPrice)) : fuelNeed;
      p.fuel += afford; p.credits -= afford * fuelPrice;
      g.toast(afford < fuelNeed ? "PARTIAL REFUEL" : "REFUELED");
    } });
    const hullNeed = Math.ceil(p.hullMax - p.hull);
    opts.push({ label: `HULL REPAIR (${hullNeed} PTS)${patronHere ? " - PATRON RATE" : ""}`, sub: `${hullNeed * repairPrice}CR`, action: () => {
      if (hullNeed <= 0) return g.toast("HULL INTACT");
      const afford = repairPrice ? Math.min(hullNeed, Math.floor(p.credits / repairPrice)) : hullNeed;
      p.hull += afford; p.credits -= afford * repairPrice;
      p.breaches = []; p.fires = [];
      g.toast(afford < hullNeed ? "PARTIAL REPAIR" : "HULL RESTORED");
    } });
    const sysDamaged = p.systems.filter((s) => s.health < 100);
    opts.push({ label: `SERVICE ALL SYSTEMS (${sysDamaged.length})`, sub: `${sysDamaged.length * 60}CR`, action: () => {
      if (!sysDamaged.length) return g.toast("ALL SYSTEMS NOMINAL");
      const cost = sysDamaged.length * 60;
      if (p.credits < cost) return g.toast("NOT ENOUGH CREDITS");
      p.credits -= cost;
      for (const s of p.systems) s.health = 100;
      g.toast("SYSTEMS SERVICED");
    } });
    opts.push({ label: "BUY SPARE PARTS KIT", sub: `${st.prices["parts"] ?? 45}CR`, action: () => {
      const cost = st.prices["parts"] ?? 45;
      if (p.credits < cost) return g.toast("NOT ENOUGH CREDITS");
      if (!addCargo(p, "parts", 1)) return g.toast("CARGO FULL");
      p.credits -= cost; g.toast("PARTS STOWED IN CARGO");
    } });
    opts.push({ label: `SEISMIC CHARGES x3 (NOW ${p.seismic ?? 0})`, sub: "300CR", action: () => {
      if (p.credits < 300) return g.toast("NOT ENOUGH CREDITS");
      p.credits -= 300; p.seismic = (p.seismic ?? 0) + 3; g.toast("CHARGES RACKED - PLANT ON A CORE ROCK WITH C");
    } });
    opts.push({ label: `TORPEDOES x4 (NOW ${p.torpedoes ?? 0})`, sub: "240CR", action: () => {
      if (p.credits < 240) return g.toast("NOT ENOUGH CREDITS");
      p.credits -= 240; p.torpedoes = (p.torpedoes ?? 0) + 4; g.toast("TORPEDOES RACKED - FIRE WITH R");
    } });
    for (const m of MODULES) {
      if (hasModule(p, m.id)) continue;
      opts.push({ label: `FIT ${m.name.toUpperCase()}`, sub: `${m.price}CR`, action: () => {
        if (p.credits < m.price) return g.toast("NOT ENOUGH CREDITS");
        p.credits -= m.price;
        (p.modules ??= []).push(m.id);
        if (m.fuel) p.fuelMax += m.fuel;
        if (m.cargo) p.cargoMax += m.cargo;
        if (m.shield) { p.shieldMax = Math.round(p.shieldMax * (1 + m.shield)); p.shield = p.shieldMax; }
        flag(g, "outfitted");
        g.toast(`${m.name.toUpperCase()} FITTED - ${m.desc.toUpperCase()}`);
      } });
    }
    opts.push({ label: `CARGO POD +10 (NOW ${p.cargoMax})`, sub: "500CR", action: () => {
      if (p.credits < 500) return g.toast("NOT ENOUGH CREDITS");
      p.credits -= 500; p.cargoMax += 10; g.toast("CARGO EXPANDED");
    } });
    opts.push({ label: `SHIELD BOOSTER +25 (NOW ${p.shieldMax})`, sub: "800CR", action: () => {
      if (p.credits < 800) return g.toast("NOT ENOUGH CREDITS");
      p.credits -= 800; p.shieldMax += 25; g.toast("SHIELD CAPACITY UP");
    } });
    if (p.wanted > 0 && !st.military) {
      const cost = Math.round(p.wanted * 1000);
      opts.push({ label: "BRIBE RECORDS CLERK (CLEAR WARRANT)", sub: `${cost}CR`, action: () => {
        if (p.credits < cost) return g.toast("NOT ENOUGH CREDITS");
        p.credits -= cost; p.wanted = 0; g.toast("RECORDS... MISPLACED");
      } });
    }
    const rep = p.rep[st.factionId] ?? 0;
    if (rep < 0 && !st.military) {
      const cost = Math.round(-rep * 30);
      opts.push({ label: `CLEAN RECORD FEE (${faction(st.factionId).name.split(" ")[0]} REP → 0)`, sub: `${cost}CR`, action: () => {
        if (p.credits < cost) return g.toast("NOT ENOUGH CREDITS");
        p.credits -= cost; p.rep[st.factionId] = 0; g.toast("YOUR FILE IS CLEAN. FOR NOW.");
      } });
    }
    return opts;
  }

  // ---------- Draw ----------

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    this.rowBoxes = [];
    const p = g.world.player;
    const st = this.station;
    const fac = faction(st.factionId);
    const rep = p.rep[st.factionId] ?? 0;
    ctx.fillStyle = PAL.uiPanel;
    ctx.fillRect(0, 0, VW, VH);
    ctx.drawImage(g.stationSprite(st.id, st.military), 8, 6, 28, 28);
    drawText(ctx, st.name.toUpperCase(), 42, 8, PAL.white);
    drawText(ctx, `${st.military ? "STAR BASE" : "STATION"} - ${st.type.toUpperCase()} - ${fac.name}`, 42, 17, fac.color);
    drawText(ctx, `${p.credits}CR   CARGO ${cargoUsed(p)}/${p.cargoMax}   REP ${repLabel(rep)} (${rep})`, 42, 26, PAL.gold);
    const escLabel = this.returnTo === "stationwalk" ? "ESC PROMENADE" : "ESC UNDOCK";
    drawText(ctx, `P WALK DECK - ${escLabel}`, VW - textWidth(`P WALK DECK - ${escLabel}`) - 6, 8, PAL.greyDark);
    if (st.military) drawText(ctx, "SECURITY LEVEL: HIGH", VW - textWidth("SECURITY LEVEL: HIGH") - 6, 17, PAL.danger);
    const war = g.world.wars.find((w) => w.systemId === p.systemId);
    if (war) drawText(ctx, "SYSTEM AT WAR - PRICES UNSTABLE", VW - textWidth("SYSTEM AT WAR - PRICES UNSTABLE") - 6, 26, PAL.warn);
    else if (this.baseOwner) { const t = `[${this.baseOwner}] SQUADRON BASE${this.baseOwner === wire.getSquadron() ? " - HOME" : ""}`; drawText(ctx, t, VW - textWidth(t) - 6, 26, this.baseOwner === wire.getSquadron() ? PAL.gold : PAL.info); }
    else {
      const patron = wire.patronOf(this.station.factionId);
      if (patron) { const t = `PATRON SQUADRON: [${patron}]${patron === wire.getSquadron() ? " - YOURS, TRADE LIKE ALLIES" : ""}`; drawText(ctx, t, VW - textWidth(t) - 6, 26, patron === wire.getSquadron() ? PAL.gold : PAL.info); }
    }

    let tx = 8;
    TABS.forEach((t, i) => {
      const active = i === this.tab;
      if (active) { ctx.fillStyle = PAL.uiBorder; ctx.fillRect(tx - 2, 38, textWidth(t) + 4, 10); }
      drawText(ctx, t, tx, 40, active ? PAL.ui : PAL.greyDark);
      tx += textWidth(t) + 10;
    });
    ctx.fillStyle = PAL.uiBorder;
    ctx.fillRect(0, 50, VW, 1);

    const top = 56;
    switch (TABS[this.tab]) {
      case "MARKET": this.drawMarket(g, ctx, top); break;
      case "SHIPYARD": this.drawShipyard(g, ctx, top); break;
      case "SHIPS": this.drawShips(g, ctx, top); break;
      case "MISSIONS": this.drawMissions(g, ctx, top); break;
      case "BAR": this.drawBar(g, ctx, top); break;
      case "STORAGE": this.drawStorage(g, ctx, top); break;
      case "NEWS": this.drawNews(g, ctx, top); break;
      case "WIRE": this.drawWire(g, ctx, top); break;
      case "RECORD": this.drawRecord(g, ctx, top); break;
      case "SURVEY": this.drawSurvey(g, ctx, top); break;
      case "ENGINEER": this.drawEngineer(g, ctx, top); break;
      case "BASE": this.drawBase(g, ctx, top); break;
    }
    if (g.toastTimer > 0) drawText(ctx, g.toastMsg, VW / 2 - textWidth(g.toastMsg) / 2, VH - 10, PAL.ui);
    if (g.hint) drawText(ctx, g.hint, VW / 2 - textWidth(g.hint) / 2, VH - 20, PAL.gold);
    drawTutorial(g, ctx, VH - 46);
  }

  row(ctx: CanvasRenderingContext2D, y: number, selected: boolean): void {
    this.rowBoxes.push([y - 2, y + 8]);
    if (selected) { ctx.fillStyle = "#13203a"; ctx.fillRect(4, y - 2, VW - 8, 10); }
  }

  // Everything the station lists, plus any rare goods in the hold (sellable anywhere)
  marketRows(g: Game): string[] {
    const p = g.world.player;
    const rows = Object.keys(this.station.prices);
    for (const [id, q] of Object.entries(p.cargo)) if (q > 0 && commodity(id).rare && !rows.includes(id)) rows.push(id);
    return rows;
  }

  // Best buy-here/sell-there margin over everything we've seen
  bestRoute(g: Game): { id: string; buy: number; sell: number; station: string; system: string } | null {
    const p = g.world.player;
    const st = this.station;
    const rep = p.rep[st.factionId] ?? 0;
    let best: { id: string; buy: number; sell: number; station: string; system: string } | null = null;
    for (const id of Object.keys(st.prices)) {
      if ((st.stock[id] ?? 0) <= 0 || commodity(id).illegal) continue;
      const buy = buyPrice(st, id, rep);
      const b = this.bestKnownSell(g, id);
      if (b && b.price - buy > (best ? best.sell - best.buy : 0)) best = { id, buy, sell: b.price, station: b.station, system: b.system };
    }
    return best;
  }

  // Community goal: fetched when the MISSIONS tab opens, contributions batched until undock
  goal = communityGoal();
  goalState: wire.GoalState | null = null;
  goalFetched = 0;
  goalPending = 0;
  flushGoal(): void {
    if (this.goalPending <= 0) return;
    const n = Math.min(60, this.goalPending);
    this.goalPending -= n;
    void wire.contributeGoal(this.goal.id, n).then((st) => { if (st) this.goalState = st; });
  }

  // Best price for this commodity among stations we've actually visited
  bestKnownSell(g: Game, id: string): { price: number; station: string; system: string; ago: number } | null {
    const p = g.world.player;
    let best: { price: number; station: string; system: string; ago: number } | null = null;
    for (const [stId, mem] of Object.entries(p.marketMemory ?? {})) {
      if (stId === this.station.id) continue;
      const pr = mem.prices[id];
      if (!pr) continue;
      if (!best || pr[1] > best.price) {
        const f = findStation(g.world, stId);
        best = { price: pr[1], station: f?.st.name ?? stId, system: g.world.systems[mem.systemId]?.name ?? "?", ago: g.world.time - mem.t };
      }
    }
    return best;
  }

  drawMarket(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const p = g.world.player;
    const st = this.station;
    const patron = wire.patronOf(st.factionId);
    const rep = (p.rep[st.factionId] ?? 0) + (patron && patron === wire.getSquadron() ? 25 : 0);
    drawText(ctx, "COMMODITY", 8, top, PAL.greyDark);
    drawText(ctx, "BUY", 150, top, PAL.greyDark);
    drawText(ctx, "SELL", 190, top, PAL.greyDark);
    drawText(ctx, "STOCK", 235, top, PAL.greyDark);
    drawText(ctx, "HELD", 280, top, PAL.greyDark);
    drawText(ctx, "TREND", 320, top, PAL.greyDark);
    drawText(ctx, "ENTER/B BUY - S SELL", 370, top, PAL.greyDark);
    const rows = this.marketRows(g);
    const rowH = rows.length > 12 ? 9 : 11;
    rows.forEach((id, i) => {
      const y = top + 12 + i * rowH;
      const c = commodity(id);
      const listed = id in st.prices;
      this.row(ctx, y, i === this.cursor);
      drawText(ctx, c.name + (c.illegal ? " *" : c.rare ? " +" : ""), 8, y, c.illegal ? PAL.danger : c.rare ? PAL.gold : PAL.white);
      drawText(ctx, listed ? `${buyPrice(st, id, rep)}` : "-", 150, y, listed ? PAL.gold : PAL.greyDark);
      drawText(ctx, `${c.rare ? rareSellPrice(g.world, st, id, rep) : sellPrice(st, id, rep)}`, 190, y, c.rare && st.rare !== id ? PAL.gold : PAL.grey);
      drawText(ctx, listed ? `${st.stock[id] ?? 0}` : "-", 235, y, PAL.grey);
      drawText(ctx, `${p.cargo[id] ?? 0}`, 280, y, PAL.ui);
      if (c.rare) drawText(ctx, st.rare === id ? "ORIGIN" : "RARE", 320, y, st.rare === id ? PAL.info : PAL.gold);
      else if (c.illegal) drawText(ctx, blackMarket(g.world, st) ? "FENCE +30%" : "CUSTOMS", 320, y, blackMarket(g.world, st) ? PAL.gold : PAL.danger);
      else {
        const ratio = buyPrice(st, id, 0) / (c.base || 1);
        drawText(ctx, ratio > 1.3 ? "HIGH" : ratio < 0.8 ? "LOW" : "-", 320, y, ratio > 1.3 ? PAL.danger : ratio < 0.8 ? PAL.good : PAL.greyDark);
      }
    });
    const ny = top + 12 + rows.length * rowH + 6;
    {
      const id = rows[this.cursor];
      const best = id ? this.bestKnownSell(g, id) : null;
      const line = best ? `${commodity(id).name.toUpperCase()} - BEST KNOWN SELL: ${best.price}CR AT ${best.station.toUpperCase()}, ${best.system.toUpperCase()} (${Math.floor(best.ago / 60)}M AGO)` : id ? `${commodity(id).name.toUpperCase()} - NO OTHER MARKET SEEN YET; PRICES ARE REMEMBERED WHEREVER YOU DOCK` : "";
      drawText(ctx, line, 8, ny + 9, PAL.info);
      const r = this.bestRoute(g);
      if (r) drawText(ctx, `BEST KNOWN RUN: BUY ${commodity(r.id).name.toUpperCase()} ${r.buy} - SELL ${r.sell} AT ${r.station.toUpperCase()}, ${r.system.toUpperCase()} (+${r.sell - r.buy}/UNIT)`.slice(0, 90), 8, ny + 18, PAL.gold);
      if (this.goal.stationType === st.type) drawText(ctx, `COMMUNITY GOAL: ${commodity(this.goal.commodityId).name.toUpperCase()} SELLS HERE AT +${Math.round(this.goal.premium * 100)}% THIS WEEK`, 8, ny + 27, PAL.info);
    }
    drawText(ctx, blackMarket(g.world, st) ? "* BLACK MARKET HERE: ILLEGAL GOODS FENCE AT +30%, NO QUESTIONS.  + RARE - WORTH MORE FAR FROM ORIGIN." : "* ILLEGAL - CUSTOMS MAY SEIZE A SALE HERE; FENCE IT AT VEIL OR PIRATE-HEAVY HUBS.  + RARE - WORTH MORE FAR FROM ORIGIN.", 8, ny, blackMarket(g.world, st) ? PAL.gold : PAL.greyDark);
  }

  drawShipyard(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const opts = this.shipyardOptions(g);
    opts.forEach((o, i) => {
      const y = top + i * 9;
      this.row(ctx, y, i === this.cursor);
      drawText(ctx, o.label, 8, y, PAL.white);
      drawText(ctx, o.sub, 290 - textWidth(o.sub) - 8, y, PAL.gold);
    });
    const p = g.world.player;
    const cur = opts[this.cursor];
    const mod = cur && MODULES.find((m) => cur.label === `FIT ${m.name.toUpperCase()}`);
    if (mod) drawText(ctx, mod.desc.toUpperCase().slice(0, 100), 8, VH - 32, PAL.info);
    let y = top;
    const x = 300;
    drawText(ctx, `SHIP SYSTEMS (${hull(p.hullId).name.toUpperCase()}):`, x, y, PAL.greyDark);
    y += 10;
    for (const s of p.systems) {
      const col = s.health > 70 ? PAL.good : s.health > 35 ? PAL.warn : PAL.danger;
      drawText(ctx, s.name, x, y, PAL.grey);
      ctx.fillStyle = PAL.greyDark; ctx.fillRect(x + 100, y + 1, 50, 3);
      ctx.fillStyle = col; ctx.fillRect(x + 100, y + 1, Math.round(50 * s.health / 100), 3);
      y += 9;
    }
    y += 4;
    drawText(ctx, "FITTED MODULES:", x, y, PAL.greyDark); y += 10;
    const fitted = (p.modules ?? []).map((id) => moduleDef(id)?.name.toUpperCase() ?? id);
    if (!fitted.length) { drawText(ctx, "NONE - STOCK HULL", x, y, PAL.grey); y += 9; }
    for (const f of fitted) { drawText(ctx, f, x, y, PAL.ui); y += 9; }
  }

  drawShips(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const p = g.world.player;
    const nameLine = `${p.shipName ? `"${p.shipName}" - N RENAME` : "N NAME YOUR SHIP"} - O PAINT`;
    drawText(ctx, nameLine, VW - textWidth(nameLine) - 8, top, PAL.greyDark);
    const tradeIn = Math.round(hull(p.hullId).price * 0.6);
    drawText(ctx, `HULL MARKET - ENTER BUYS WITH TRADE-IN (${tradeIn}CR) - K BUYS AND PARKS YOUR ${hull(p.hullId).name.toUpperCase()} HERE`, 8, top, PAL.greyDark);
    const stored = (p.fleet ?? []).filter((f) => f.stationId === this.station.id);
    const elsewhere = (p.fleet ?? []).filter((f) => f.stationId !== this.station.id);
    const rowH = 26; // seven hulls have to fit above the parked list
    HULLS.forEach((h, i) => {
      const y = top + 12 + i * rowH;
      this.row(ctx, y, i === this.cursor);
      const own = h.id === p.hullId;
      drawText(ctx, h.name.toUpperCase() + (own ? "  (YOURS)" : ""), 8, y, own ? PAL.ui : PAL.white);
      const cost = Math.max(0, h.price - tradeIn);
      drawText(ctx, own ? "-" : `${cost}CR`, VW - textWidth(`${cost}CR`) - 8, y, PAL.gold);
      drawText(ctx, `HULL ${h.hullMax}  SHLD ${h.shieldMax}  CARGO ${h.cargoMax}  FUEL ${h.fuelMax}  THRUST ${h.accel}  TOP ${h.maxSpeed}  MINE x${h.miningRate}  GUNS ${h.weaponDmg}  CREW ${h.crewSlots}`, 8, y + 9, PAL.grey);
      if (!stored.length) drawText(ctx, h.desc.slice(0, 94), 8, y + 18, PAL.greyDark);
      // preview sprite
      const spr = g.sprite(`hull-preview-${h.id}`, () => {
        const { genShip } = spriteMod;
        return genShip(new RNG(g.world.seed ^ 0x51e9 ^ h.id.length), h.spriteSize, h.color, h.accent);
      });
      ctx.drawImage(spr, VW - 60, y);
    });
    let y = top + 12 + HULLS.length * rowH;
    if (stored.length) {
      drawText(ctx, "PARKED HERE - ENTER TO SWAP:", 8, y, PAL.greyDark); y += 10;
      stored.forEach((f, i) => {
        this.row(ctx, y, this.cursor === HULLS.length + i);
        drawText(ctx, `${(f.name ?? hull(f.hullId).name).toUpperCase()} (${hull(f.hullId).name.toUpperCase()})  HULL ${Math.round(f.hull)}/${hull(f.hullId).hullMax}`, 8, y, PAL.ui);
        y += 10;
      });
    }
    if (elsewhere.length) {
      drawText(ctx, `FLEET ELSEWHERE: ${elsewhere.map((f) => `${(f.name ?? hull(f.hullId).name).toUpperCase()} AT ${findStation(g.world, f.stationId)?.st.name.toUpperCase() ?? "?"}`).join("; ")}`.slice(0, 110), 8, y, PAL.greyDark);
    }
  }

  drawMissions(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const p = g.world.player;
    const st = this.station;
    const deliverable = p.missions.filter((m) => missionDeliverable(g.world, m, st));
    const avail = this.boardMissions.filter((m) => !m.accepted);
    const tier = missionTier(p.rep[st.factionId] ?? 0);
    let y = top;
    let idx = 0;
    {
      const gl = this.goal;
      const prog = this.goalState?.progress ?? 0;
      const mine = p.goalContrib?.[gl.id] ?? 0;
      drawText(ctx, gl.title.toUpperCase(), 8, y, PAL.info);
      const done = prog >= gl.target;
      drawText(ctx, done ? "GOAL MET - PREMIUM STILL PAYS" : `${prog}/${gl.target} UNITS`, 300, y, done ? PAL.good : PAL.grey);
      ctx.fillStyle = PAL.greyDark; ctx.fillRect(380, y + 1, 90, 4);
      ctx.fillStyle = done ? PAL.good : PAL.info; ctx.fillRect(380, y + 1, Math.round(90 * Math.min(1, prog / gl.target)), 4);
      y += 9;
      const top5 = this.goalState?.top.map((t) => `${t.callsign} ${t.amount}`).join("  ") ?? "";
      drawText(ctx, `${gl.desc.toUpperCase().slice(0, 88)}`, 8, y, PAL.greyDark); y += 9;
      drawText(ctx, `${mine ? `YOU: ${mine} UNITS.  ` : ""}${top5 ? `TOP: ${top5}` : this.goalState ? "NO CONTRIBUTIONS YET - BE FIRST" : "GOAL BOARD OFFLINE"}`, 8, y, mine ? PAL.gold : PAL.greyDark); y += 12;
    }
    if (deliverable.length) {
      drawText(ctx, "READY TO TURN IN:", 8, y, PAL.good); y += 10;
      for (const m of deliverable) {
        this.row(ctx, y, idx === this.cursor);
        drawText(ctx, `${m.title}  +${m.reward}CR`, 12, y, PAL.gold);
        y += 11; idx++;
      }
      y += 4;
    }
    drawText(ctx, `MISSION BOARD (YOUR TIER: ${["CIVILIAN", "TRUSTED", "MILITARY"][tier]}):`, 8, y, PAL.greyDark); y += 10;
    if (!avail.length) drawText(ctx, "NO POSTINGS. CHECK BACK LATER.", 12, y, PAL.greyDark);
    for (const m of avail) {
      const locked = (m.tier ?? 0) > tier;
      this.row(ctx, y, idx === this.cursor);
      drawText(ctx, (m.kind === "arc" ? "* " : "") + m.title + (locked ? "  [LOCKED]" : ""), 12, y, m.kind === "arc" ? PAL.gold : locked ? PAL.greyDark : PAL.white);
      drawText(ctx, `+${m.reward}CR`, VW - textWidth(`+${m.reward}CR`) - 8, y, PAL.gold);
      y += 8;
      drawText(ctx, m.desc.slice(0, 112), 12, y, PAL.greyDark);
      y += 12; idx++;
      if (y > VH - 50) break;
    }
    y += 2;
    drawText(ctx, "YOUR LOG:", 8, y, PAL.greyDark); y += 10;
    const log = p.missions.filter((m) => m.accepted && !m.done);
    if (!log.length) drawText(ctx, "EMPTY", 12, y, PAL.greyDark);
    for (const m of log.slice(0, 4)) {
      const prog = m.killsNeeded ? ` (${m.kills}/${m.killsNeeded})` : m.kind === "ground" ? ` (${m.groundDone ?? 0}/${m.groundNeed ?? 1})` : m.escortDone ? " (DONE - RETURN)" : "";
      drawText(ctx, `> ${m.title}${prog} - ${g.world.systems[m.targetSystemId].name}`, 12, y, PAL.uiDim);
      y += 9;
    }
  }

  drawBar(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const st = this.station;
    const p = g.world.player;
    drawText(ctx, "THE LOUNGE - TALK (ENTER) OR HIRE", 8, top, PAL.greyDark);
    let y = top + 12;
    let idx = 0;
    st.barPatrons.forEach((name, i) => {
      this.row(ctx, y + 2, idx === this.cursor);
      ctx.drawImage(g.portrait(name), 10, y - 2, 12, 12);
      drawText(ctx, name, 28, y, PAL.white);
      drawText(ctx, ["HAULER", "ENGINEER", "OFF-DUTY SECURITY", "PROSPECTOR", "DRIFTER"][i % 5], 28, y + 8, PAL.greyDark);
      y += 18; idx++;
    });
    if (this.candidates.length) {
      drawText(ctx, `FOR HIRE (BERTHS ${p.crew.length}/${hull(p.hullId).crewSlots}):`, 8, y, PAL.greyDark); y += 10;
      for (const c of this.candidates) {
        this.row(ctx, y + 2, idx === this.cursor);
        ctx.drawImage(g.portrait(c.name), 10, y - 2, 12, 12);
        drawText(ctx, `${c.name} - ${ROLE_INFO[c.role].label} ${"*".repeat(c.skill)}`, 28, y, PAL.ui);
        drawText(ctx, `${ROLE_INFO[c.role].effect}. WAGE ${c.wage}CR/DOCK, BONUS ${c.wage * 3}CR`, 28, y + 8, PAL.greyDark);
        y += 18; idx++;
      }
    }
    if (this.barLine) {
      ctx.fillStyle = "#0e1626"; ctx.fillRect(6, y, VW - 12, 28);
      ctx.strokeStyle = PAL.uiBorder; ctx.strokeRect(6.5, y + 0.5, VW - 13, 27);
      const words = this.barLine.split(" ");
      let line = "", ly = y + 4;
      for (const wd of words) {
        if (textWidth(line + " " + wd) > VW - 30) { drawText(ctx, line, 12, ly, PAL.ui); ly += CHAR_H + 2; line = wd; }
        else line = line ? line + " " + wd : wd;
      }
      drawText(ctx, line, 12, ly, PAL.ui);
    }
  }

  drawStorage(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const p = g.world.player;
    const st = this.station;
    const box = p.storage[st.id] ?? {};
    drawText(ctx, "STATION WAREHOUSE - ENTER MOVES ONE UNIT", 8, top, PAL.greyDark);
    let y = top + 12; let idx = 0;
    drawText(ctx, "IN YOUR HOLD:", 8, y, PAL.grey); y += 10;
    const held = Object.keys(p.cargo);
    if (!held.length) { drawText(ctx, "EMPTY", 12, y, PAL.greyDark); y += 10; }
    for (const id of held) { this.row(ctx, y, idx === this.cursor); drawText(ctx, `${commodity(id).name} x${p.cargo[id]}  → STORE`, 12, y, PAL.white); y += 11; idx++; }
    y += 6;
    drawText(ctx, `STORED AT ${st.name.toUpperCase()}:`, 8, y, PAL.grey); y += 10;
    const stored = Object.keys(box);
    if (!stored.length) { drawText(ctx, "EMPTY", 12, y, PAL.greyDark); }
    for (const id of stored) { this.row(ctx, y, idx === this.cursor); drawText(ctx, `${commodity(id).name} x${box[id]}  → LOAD`, 12, y, PAL.ui); y += 11; idx++; }
  }

  drawWire(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const cs = wire.getCallsign();
    drawText(ctx, `FLEET WIRE - EVERY PILOT, LIVE.  CALL SIGN: ${cs ?? "NONE (PRESS C)"}`, 8, top, PAL.info);
    let y = top + 12;
    if (!this.wireEvents.length) drawText(ctx, this.wireLoaded ? "NOTHING ON THE WIRE YET - BE THE FIRST." : "TUNING...", 8, y, PAL.greyDark);
    for (const e of this.wireEvents.slice(0, 9)) {
      drawText(ctx, `${wire.ageLabel(e.t).padStart(3)} ${e.callsign}`, 8, y, PAL.gold);
      drawText(ctx, `${e.tag ? `[${e.tag}] ` : ""}${e.text} - ${e.system}`.slice(0, 96), 84, y, PAL.grey);
      y += 9;
    }
    y = top + 12 + 9 * 9 + 6;
    drawText(ctx, "LEADERBOARDS", 8, y, PAL.greyDark); y += 9;
    const cols = [["discoveries", "DISCOVERIES"], ["arcs", "ARCS"], ["credits", "CREDITS"], ["kills", "KILLS"], ["explorers", "EXPLORERS"], ["traders", "TRADERS"]];
    cols.forEach(([id, label], ci) => {
      const x = 8 + ci * 79;
      drawText(ctx, label, x, y, PAL.ui);
      const rows = this.boards[id] ?? [];
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        const r = rows[i];
        drawText(ctx, `${i + 1}. ${r.callsign.slice(0, 8)}`, x, y + 9 + i * 8, r.callsign === cs ? PAL.gold : PAL.grey);
        drawText(ctx, `${r.score >= 100000 ? Math.round(r.score / 1000) + "K" : r.score}`, x + 52, y + 9 + i * 8, PAL.greyDark);
      }
      if (!rows.length) drawText(ctx, "-", x, y + 9, PAL.greyDark);
    });
    const sy = y + 9 + 5 * 8 + 4;
    const mine = wire.getSquadron();
    const nearby = [...presence.ghosts.values()].map((gh) => `${gh.tag ? `[${gh.tag}] ` : ""}${gh.callsign}`);
    drawText(ctx, nearby.length ? `IN THIS SYSTEM NOW: ${nearby.join(", ")}`.slice(0, 110) : presence.status === "on" ? "NO OTHER PILOTS IN THIS SYSTEM RIGHT NOW" : "", 8, sy - 10, PAL.info);
    drawText(ctx, `SQUADRONS${mine ? ` - YOURS: [${mine}]` : " - JOIN ONE ON THE TITLE SCREEN"}`, 8, sy, PAL.ui);
    if (!this.squadrons.length) drawText(ctx, "NONE RANKED YET", 8, sy + 9, PAL.greyDark);
    this.squadrons.slice(0, 6).forEach((sq, i) => {
      const x = 8 + (i % 3) * 158, yy = sy + 9 + Math.floor(i / 3) * 8;
      const top = Object.entries(sq.standing ?? {}).sort((a, b) => b[1] - a[1])[0];
      const patronOfs = Object.entries(this.patrons).filter(([, t]) => t === sq.tag).map(([f]) => f.toUpperCase());
      drawText(ctx, `${i + 1}. [${sq.tag}] ${sq.members} PILOT${sq.members === 1 ? "" : "S"}  ${sq.score} PTS${sq.base ? `  BASE ${sq.base.stationName.toUpperCase().slice(0, 12)} ${sq.base.treasury}CR` : patronOfs.length ? `  PATRON OF ${patronOfs.join("/")}` : top ? `  ${top[0].toUpperCase()} ${top[1] >= 0 ? "+" : ""}${top[1]}` : ""}`.slice(0, 52), x, yy, sq.tag === mine ? PAL.gold : PAL.grey);
    });
  }

  sellExploration(g: Game): void {
    const p = g.world.player;
    const st = this.station;
    const worth = Math.round(p.expData ?? 0);
    if (worth <= 0) { g.toast("NO UNSOLD EXPLORATION DATA - LOG SYSTEMS, SCAN, SURVEY WORLDS"); return; }
    const bonus = st.type === "research" ? 1.25 : 1;
    const paid = Math.round(worth * bonus);
    p.credits += paid;
    p.expSold = (p.expSold ?? 0) + paid;
    p.expData = 0;
    adjustRep(g.world, st.factionId, Math.min(8, 1 + Math.floor(paid / 400)));
    g.toast(`CARTOGRAPHICS PAID ${paid}CR${bonus > 1 ? " (RESEARCH POST BONUS)" : ""}`);
    sfx.pickup();
    if (paid >= 1000) void wire.post("discovery", `sold exploration data worth ${paid} CR`, g.world.systems[p.systemId].name);
  }

  baseRows(g: Game): { kind: "fund" | "buy" | "upgrade" | "deposit" | "withdraw" | "info"; id?: string; label: string; sub: string }[] {
    const p = g.world.player;
    const st = this.station;
    const tag = wire.getSquadron();
    const rows: { kind: "fund" | "buy" | "upgrade" | "deposit" | "withdraw" | "info"; id?: string; label: string; sub: string }[] = [];
    if (!tag) return rows;
    const b = this.base;
    if (b && b.stationId) {
      if (b.stationId !== st.id) return rows;
      for (const u of wire.BASE_UPGRADES) {
        const have = b.upgrades.includes(u.id);
        rows.push({ kind: "upgrade", id: u.id, label: `${have ? "FITTED: " : "FIT "}${u.name.toUpperCase()}`, sub: have ? u.desc.toUpperCase() : `${u.cost}CR - ${u.desc.toUpperCase()}` });
      }
      rows.push({ kind: "fund", label: "FUND THE TREASURY", sub: `NOW ${b.treasury}CR` });
      for (const [id, q] of Object.entries(p.cargo)) if (q > 0) rows.push({ kind: "deposit", id, label: `DEPOSIT 1 ${commodity(id).name.toUpperCase()}`, sub: `HOLD ${q}` });
      for (const [id, q] of Object.entries(b.vault)) if (q > 0) rows.push({ kind: "withdraw", id, label: `WITHDRAW 1 ${commodity(id).name.toUpperCase()}`, sub: `VAULT ${q}` });
      return rows;
    }
    // no base yet: fund, then buy this station
    const price = wire.basePrice(st.type, st.military);
    rows.push({ kind: "fund", label: "FUND THE TREASURY", sub: `NOW ${b?.treasury ?? 0}CR` });
    if (price > 0 && !this.baseOwner) rows.push({ kind: "buy", label: `BUY ${st.name.toUpperCase()} AS THE [${tag}] BASE`, sub: `${price}CR FROM THE TREASURY` });
    return rows;
  }

  drawBase(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const tag = wire.getSquadron();
    const st = this.station;
    if (this.baseOwner && this.baseOwner !== tag) {
      drawText(ctx, `${st.name.toUpperCase()} IS THE [${this.baseOwner}] SQUADRON BASE`, 8, top, PAL.info);
      drawText(ctx, "SQUADRON BASES BELONG TO THE PILOTS WHO POOLED THE CREDITS. FIND YOUR OWN, OR JOIN THEIRS.", 8, top + 12, PAL.greyDark);
      return;
    }
    if (!tag) {
      drawText(ctx, "SQUADRON BASES", 8, top, PAL.info);
      drawText(ctx, "JOIN A SQUADRON ON THE TITLE SCREEN. ITS MEMBERS POOL CREDITS TO BUY A STATION AS A BASE:", 8, top + 12, PAL.grey);
      drawText(ctx, "SHARED VAULT, FREE SERVICES, A DEFENSE GRID, AND YOUR TAG ON THE GALAXY MAP.", 8, top + 21, PAL.grey);
      return;
    }
    if (!this.baseLoaded) { drawText(ctx, "CONTACTING THE SQUADRON...", 8, top, PAL.greyDark); return; }
    const b = this.base;
    const rows = this.baseRows(g);
    if (b && b.stationId && b.stationId !== st.id) {
      drawText(ctx, `[${tag}] BASE: ${(b.stationName ?? "?").toUpperCase()}, ${(b.systemName ?? "?").toUpperCase()}`, 8, top, PAL.gold);
      drawText(ctx, `TREASURY ${b.treasury}CR   VAULT ${Object.values(b.vault).reduce((a, v) => a + v, 0)} UNITS   UPGRADES: ${b.upgrades.length ? b.upgrades.join(", ").toUpperCase() : "NONE"}`, 8, top + 12, PAL.grey);
      drawText(ctx, "DOCK THERE TO USE THE VAULT AND FIT UPGRADES.", 8, top + 21, PAL.greyDark);
      return;
    }
    drawText(ctx, b && b.stationId ? `[${tag}] SQUADRON BASE - ${st.name.toUpperCase()}` : `FOUND A [${tag}] BASE`, 8, top, PAL.gold);
    drawText(ctx, b && b.stationId ? `TREASURY ${b.treasury}CR   VAULT ${Object.values(b.vault).reduce((a, v) => a + v, 0)}/${b.upgrades.includes("vault") ? 600 : 200}   HALF-PRICE SERVICES FOR MEMBERS` : `POOL CREDITS, THEN BUY A CIVILIAN STATION. THIS ONE: ${wire.basePrice(st.type, st.military) ? wire.basePrice(st.type, st.military) + "CR" : "MILITARY, NOT FOR SALE"}`, 8, top + 10, PAL.grey);
    rows.forEach((r, i) => {
      const y = top + 24 + i * 9;
      if (y > VH - 86) return;
      this.row(ctx, y, i === this.cursor);
      drawText(ctx, r.label, 8, y, r.kind === "upgrade" && r.label.startsWith("FITTED") ? PAL.good : PAL.white);
      drawText(ctx, r.sub, 200, y, PAL.grey);
    });
    if (b && b.stationId) {
      const c = wire.baseContract(tag);
      const have = b.vault[c.commodityId] ?? 0;
      const paid = b.contractsPaid?.includes(c.id);
      const line = paid ? `WEEKLY BASE CONTRACT FILLED: +${c.reward}CR WENT TO THE TREASURY. NEXT ONE MONDAY.` : `WEEKLY BASE CONTRACT: STOCK ${c.need} ${commodity(c.commodityId).name.toUpperCase()} IN THE VAULT (${have}/${c.need}) FOR +${c.reward}CR TO THE TREASURY`;
      drawText(ctx, line, 8, VH - 66, paid ? PAL.good : PAL.gold);
      const bo = b.bounty && b.bounty.week === c.id.slice(3) ? b.bounty : null;
      const bline = bo?.paid ? `WEEKLY SQUADRON BOUNTY FILLED: +${wire.SQUAD_BOUNTY.reward}CR TO THE TREASURY.` : `WEEKLY SQUADRON BOUNTY: ${bo?.kills ?? 0}/${wire.SQUAD_BOUNTY.need} CORSAIR CAPTAINS BY ANY MEMBER FOR +${wire.SQUAD_BOUNTY.reward}CR`;
      drawText(ctx, bline, 8, VH - 75, bo?.paid ? PAL.good : PAL.gold);
    }
    if (b?.log.length) {
      const ly = VH - 56;
      drawText(ctx, "BASE LOG:", 8, ly, PAL.greyDark);
      b.log.slice(0, 2).forEach((l, i) => drawText(ctx, `${l.callsign} ${l.text} (${wire.ageLabel(l.t)})`.slice(0, 100), 8, ly + 9 + i * 8, PAL.greyDark));
    }
  }

  hasEngineer(): boolean {
    return this.station.type === "research" || this.station.type === "refinery";
  }

  drawEngineer(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const p = g.world.player;
    const here = this.hasEngineer();
    drawText(ctx, here ? `ENGINEERING BAY - ${this.station.name.toUpperCase()}` : "NO ENGINEER HERE - RESEARCH AND REFINERY STATIONS HAVE ONE", 8, top, here ? PAL.info : PAL.warn);
    BLUEPRINTS.forEach((bp, i) => {
      const y = top + 12 + i * 11;
      const grade = engGrade(p, bp.id);
      const cost = nextCost(p, bp);
      this.rowBoxes.push([y - 2, y + 8]);
      if (i === this.cursor) { ctx.fillStyle = "#13203a"; ctx.fillRect(4, y - 2, 280, 10); }
      drawText(ctx, `${bp.name.toUpperCase()} ${"*".repeat(grade)}${"-".repeat(3 - grade)}`, 8, y, grade >= 3 ? PAL.gold : PAL.white);
      drawText(ctx, bp.desc.toUpperCase(), 118, y, PAL.grey);
      if (i === this.cursor) {
        const line = cost ? `NEXT GRADE: ${Object.entries(cost).map(([id, n]) => `${n} ${id.toUpperCase()}`).join(", ")}${canAfford(p, cost) && here ? " - ENTER TO APPLY" : ""}` : "MAXED";
        drawText(ctx, line, 8, top + 12 + BLUEPRINTS.length * 11 + 6, cost && canAfford(p, cost) && here ? PAL.gold : PAL.greyDark);
      }
    });
    const mx = 300;
    drawText(ctx, "MATERIALS:", mx, top, PAL.greyDark);
    MATERIALS.forEach((m, i) => {
      const n = p.materials?.[m.id] ?? 0;
      drawText(ctx, `${m.name.toUpperCase()} ${n}`, mx + (i % 2) * 84, top + 12 + Math.floor(i / 2) * 9, n ? (m.rarity === "rare" ? PAL.gold : m.rarity === "uncommon" ? PAL.ui : PAL.grey) : PAL.greyDark);
    });
    drawText(ctx, "MINING: IRON, NICKEL, CARBON", mx, top + 44, PAL.greyDark);
    drawText(ctx, "RICH ROCKS: VANADIUM", mx, top + 53, PAL.greyDark);
    drawText(ctx, "CORES, SIGNALS: POLONIUM", mx, top + 62, PAL.greyDark);
    drawText(ctx, "DERELICTS: GERMANIUM", mx, top + 71, PAL.greyDark);
    drawText(ctx, "GRADES ARE YOURS, NOT THE HULL'S", mx, top + 84, PAL.greyDark);
  }

  drawSurvey(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const p = g.world.player;
    const w = g.world;
    const st = this.station;
    drawText(ctx, "UNIVERSAL CARTOGRAPHICS", 8, top, PAL.info);
    const worth = Math.round(p.expData ?? 0);
    this.row(ctx, top + 12, true);
    drawText(ctx, `SELL EXPLORATION DATA: ${worth}CR${st.type === "research" ? " x1.25 HERE" : ""}`, 8, top + 12, worth > 0 ? PAL.white : PAL.grey);
    drawText(ctx, "ENTER", VW - textWidth("ENTER") - 8, top + 12, PAL.gold);
    let y = top + 28;
    drawText(ctx, "CAREERS:", 8, y, PAL.greyDark); y += 10;
    for (const kind of ["explorer", "trader", "miner"] as const) {
      const r = rankOf(p, kind);
      const v = rankValue(p, kind);
      const unit = kind === "miner" ? " UNITS" : "CR";
      drawText(ctx, `${kind.toUpperCase()}`, 8, y, PAL.grey);
      drawText(ctx, r.title, 60, y, r.idx >= 8 ? PAL.gold : PAL.ui);
      drawText(ctx, r.next ? `${Math.round(v)}${unit} / NEXT ${r.next}${unit}` : `${Math.round(v)}${unit} - TOP OF THE LADDER`, 130, y, PAL.greyDark);
      y += 9;
    }
    y += 4;
    drawText(ctx, "HOW DATA IS EARNED: ARRIVE (NAV LOG) - HOLD V IN-SYSTEM (DETAILED) - SURVEY WORLDS FROM ORBIT - FIRST DISCOVERIES", 8, y, PAL.greyDark); y += 9;
    drawText(ctx, "DISCOVERY SCANNER LOGS FULLY ON ARRIVAL. SURFACE SCANNER DOUBLES SURVEY PAY. RESEARCH POSTS PAY 25% MORE.", 8, y, PAL.greyDark); y += 9;
    {
      const cx = Object.keys(p.codex ?? {});
      const species = cx.filter((k) => k.startsWith("flora:")).length, biomes = cx.filter((k) => k.startsWith("biome:")).length;
      const regions = Object.values(p.ground ?? {}).filter((s) => s.charted).length;
      const firsts = Object.values(p.firsts ?? {}).filter((c) => c === wire.getCallsign()).length;
      drawText(ctx, `CODEX: ${species} SPECIES, ${biomes} BIOMES, ${regions} REGIONS CHARTED, ${firsts} FIRST DISCOVERIES`, 8, y, PAL.gold); y += 12;
    }
    const log = Object.entries(p.expLog ?? {});
    drawText(ctx, `LOGGED SYSTEMS (${log.length}/${Object.keys(w.systems).length}):`, 8, y, PAL.greyDark); y += 10;
    const cols = 3;
    log.slice(0, 27).forEach(([id, lvl], i) => {
      const sys = w.systems[id];
        if (!sys) return;
      const first = p.firsts?.[id];
      const x = 8 + (i % cols) * 156;
      const yy = y + Math.floor(i / cols) * 9;
      drawText(ctx, `${sys.name.slice(0, 16)} ${lvl === 2 ? "DETAILED" : "BASIC"}`, x, yy, lvl === 2 ? PAL.ui : PAL.grey);
      if (first) drawText(ctx, `1ST ${first}`.slice(0, 20), x + 96, yy, first === wire.getCallsign() ? PAL.gold : PAL.greyDark);
    });
  }

  drawRecord(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const p = g.world.player;
    const w = g.world;
    const have = new Set(p.achievements ?? []);
    drawText(ctx, `SERVICE RECORD${w.hardcore ? " - HARDCORE" : ""}`, 8, top, PAL.info);
    const stats = [
      `KILLS ${p.kills}`, `DISCOVERIES ${p.discoveries}`, `ARCS ${Object.values(p.arcs).reduce((a, b) => a + b, 0)}/15`,
      `CREDITS ${p.credits}`, `CREW ${p.crew.length}`, `HULL ${hull(p.hullId).name.toUpperCase()}`,
      `TIME ${Math.floor(w.time / 60)}M`, `ACHIEVEMENTS ${have.size}/${ACHIEVEMENTS.length}`,
      `EXPLORER ${rankOf(p, "explorer").title}`, `TRADER ${rankOf(p, "trader").title}`, `MINER ${rankOf(p, "miner").title}`, `MODULES ${(p.modules ?? []).length}`,
    ];
    stats.forEach((t, i) => drawText(ctx, t, 8 + (i % 4) * 118, top + 12 + Math.floor(i / 4) * 9, PAL.grey));
    const rowsTotal = Math.ceil(ACHIEVEMENTS.length / 2);
    const first = Math.min(this.cursor, Math.max(0, rowsTotal - 12));
    let y = top + 45;
    ACHIEVEMENTS.forEach((a, i) => {
      const r = Math.floor(i / 2) - first;
      if (r < 0 || r >= 12) return;
      const x = 8 + (i % 2) * 236;
      const yy = y + r * 10;
      const got = have.has(a.id);
      drawText(ctx, (got ? "* " : "- ") + a.title, x, yy, got ? PAL.gold : PAL.greyDark);
      drawText(ctx, a.desc, x + 86, yy, got ? PAL.grey : PAL.greyDark);
    });
    if (rowsTotal > 12) drawText(ctx, `ROWS ${first + 1}-${Math.min(rowsTotal, first + 12)} OF ${rowsTotal} - UP/DOWN TO SCROLL`, 8, y + 12 * 10 + 2, PAL.greyDark);
    y += 12 * 10;
  }

  drawNews(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    drawText(ctx, "GALNET NEWS FEED", 8, top, PAL.info);
    let y = top + 14;
    for (const n of g.world.news.slice(0, 7)) {
      drawText(ctx, n.headline.slice(0, 60), 8, y, PAL.white); y += 9;
      drawText(ctx, n.body.slice(0, 112), 8, y, PAL.greyDark); y += 13;
    }
  }
}

import * as spriteMod from "../gfx/sprites";

const BAR_LINES: ((g: Game, st: StationDef) => string)[] = [
  (g, st) => {
    const sys = Object.values(g.world.systems).find((s) => s.stations.includes(st))!;
    const link = sys.links[0] ? g.world.systems[sys.links[0]].name : "the next system";
    return `Word is the corsairs are thick around ${link} lately. Fly armed or fly fast.`;
  },
  (g) => {
    const rich = Object.values(g.world.systems).find((s) => s.factionId === "fdm");
    return `A prospector swears the belts in ${rich?.name ?? "the Guild systems"} still glitter. Bring a mining laser and patience.`;
  },
  (g) => {
    const ev = g.world.events[g.world.events.length - 1];
    return ev ? `You hear about that? ${ev.text}. That's what the net says, anyway.` : "Quiet cycle. Too quiet for my taste.";
  },
  () => "Gate security's jumpy. If you're hauling anything... sensitive, weigh the odds. Good standing helps.",
  () => "Derelicts out past the belt still have cargo in them. And fires. Bring a suit with real O2.",
  () => "Research posts pay for anomaly surveys. Hold your scanner and fly toward whatever pings.",
  (g) => {
    const war = g.world.wars[0];
    return war ? `${g.world.systems[war.systemId].name} is a war zone this cycle. Prices are mad. So are the patrols.` : "You look like you can handle a bounty. Corsair scalps are worth good credits.";
  },
  () => "Planets have outposts if you bother to enter orbit. Cheap ore down the well, if you can lift it.",
];
