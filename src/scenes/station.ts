// Station scene: docked services — market, shipyard, ships, missions, bar (crew), storage, news.

import { ask, confirmBox } from "../core/dialog";
import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth, CHAR_H } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { RNG } from "../core/rng";
import { clamp } from "../core/mathx";
import { commodity, faction } from "../data/data";
import { HULLS, hull } from "../data/hulls";
import { ROLE_INFO, CrewMember, RETIRE_DOCKS, LEAVE_DOCKS, roleLabel } from "../data/crew";
import {
  StationDef, StoredShip, Mission, genMissionsFor, cargoUsed, addCargo, removeCargo, findStation,
  buyPrice, sellPrice, rareSellPrice, refreshPrices, missionDeliverable, adjustRep, repLabel, missionTier,
  crewWages, genCrewCandidate, applyHull, crewRecover, crewTreat, crewFallsIll, collectShoreCrew, retireCrew, sendOnLeave, berthsUsed, servicePrice, serviceHull, WEAR_SERVICE_FROM, crewBonus, genFares, settlePassengers, logSight, passengerPay, passengersAboard, passengerCap, INFRA_KITS, restAtDock, adoptCat, CAT_NAMES, FURNISHINGS, tickBonds, feuds, shiftBond, chronicleText, collectCharters, tickMail, friendsAt, helpCaptain, rivalTakesFare, askRideAlong, tickRideAlong, RIDE_ALONG_DOCKS, setHomePort, isHome, donateRelic, hullHistoryFor, notableOutcome, hireCharter, releaseCharter, CHARTER_PRICE, CHARTER_CAP, CHARTER_CUT, pushEvent, ARCS, dailyContract, dailyKey, rankOf, rankValue, RANK_TITLES, communityGoal, blackMarket, syndicateAt, synStanding, synStandingLabel, adjustSynRep, syndicateByTag, baseDemand, ROUTE_PREMIUM, effectiveSynStanding, shiftRelation, synAllies, synRelation, warContribute, backWar, crisisAt, CRISIS_PREMIUM, logEntry, galaxyEventAt, rescuePoints, stationProfile, stationBulletin, embargoed, hasCharter,
} from "../world";
import { ACHIEVEMENTS } from "../data/achievements";
import { MODULES, hasModule, moduleDef } from "../data/modules";
import { BLUEPRINTS, MATERIALS, engGrade, nextCost, canAfford, upgrade } from "../data/engineering";
import { flag } from "../core/achievements";
import { presence } from "../core/presence";
import type { Encounter } from "../data/encounters";
import type { EncounterScene } from "./encounter";
import { CREW_LINES } from "../data/crew";
import { storyObjective } from "../core/story";
import { arcFor, offerArc, arcObjective } from "../core/crewarcs";
import { serialMissionFor, serialRecruitFor, serialPremium, serialLines } from "../data/serials";
import { isOccasion, occasionFor } from "../data/occasions";
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
  fares: Mission[] = [];
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
    { const sm = serialMissionFor(g.world, this.station.id); if (sm) this.boardMissions.unshift(sm); }
    this.candidates = [];
    for (let i = 0; i < rng.int(1, 3); i++) this.candidates.push(genCrewCandidate(rng.fork(i + 1)));
    { const role = serialRecruitFor(g.world, this.station.id); if (role && !p.flags?.[`serialHire:${this.station.id}`]) { const c = genCrewCandidate(rng.fork(99)); c.role = role; c.skill = 3; c.loyalty = 2; c.wage = ROLE_INFO[role].baseWage * 3; c.trait = "tells stories about the Steady Hand"; this.candidates.unshift(c); } }
    this.fares = genFares(g.world, this.station, rng.fork(77));
    { const line = rivalTakesFare(g.world, this.fares, rng.fork(78)); if (line) g.toast(line); }
    for (const fr of friendsAt(g.world, this.station.id)) if (!this.station.barPatrons.includes(fr.name)) this.station.barPatrons = [fr.name, ...this.station.barPatrons].slice(0, 4);
    this.barLine = "";
    if (isOccasion("market") && (p.flags ?? {})[`marketday:${this.station.id}:${dailyKey()}`] !== true) { (p.flags ??= {})[`marketday:${this.station.id}:${dailyKey()}`] = true; for (const id of Object.keys(this.station.stock)) if (!id.startsWith("r_")) this.station.stock[id] = Math.round((this.station.stock[id] ?? 0) * 1.25); }
    refreshPrices(this.station);
    void wire.fetchSquadronData();
    if (p.ious?.length) { for (const iou of p.ious) { p.credits += iou.credits; g.toast(iou.text); } p.ious = []; sfx.pickup(); }

    if (p.evacuees && p.evacuees.n > 0) { const pay = p.evacuees.n * (p.evacuees.from === "wounded" ? 200 : 150); if (p.evacuees.from === "wounded") p.lives = (p.lives ?? 0) + p.evacuees.n; logEntry(g.world, `Handed ${p.evacuees.n} survivors over at ${this.station.name}`); p.credits += pay; adjustRep(g.world, this.station.factionId, 4); g.toast(`${p.evacuees.n} SURVIVORS FROM THE ${p.evacuees.from.toUpperCase()} HANDED OVER +${pay}CR`); p.evacuees = null; flag(g, "lifeboat"); sfx.pickup(); }
    if (g.scenes.flight && (g.scenes.flight as unknown as { towing: unknown }).towing) {
      const fs = g.scenes.flight as unknown as { towing: { x: number; y: number; hull: number } | null };
      const st = this.station; const sx = Math.cos(st.angle) * st.orbit, sy = Math.sin(st.angle) * st.orbit;
      if (fs.towing && fs.towing.hull > 0 && Math.hypot(fs.towing.x - sx, fs.towing.y - sy) < 260) { p.credits += 550; adjustRep(g.world, st.factionId, 6); p.tows = (p.tows ?? 0) + 1; { const l = helpCaptain(g.world, (fs.towing as { name?: string }).name, "tow", new RNG((g.world.seed ^ Math.floor(g.world.time * 59)) >>> 0)); if (l) g.toast(l); } g.toast("TOW COMPLETE - THE YARD TAKES THE FREIGHTER +550CR"); flag(g, "tug"); void wire.post("rescue", "towed a disabled freighter into dock", g.world.systems[p.systemId].name); }
      fs.towing = null;
    }
    this.base = null; this.baseLoaded = false;
    if (p.warPayout && p.warPayout.value > 0) {
      const wp = p.warPayout; p.warPayout = null;
      void wire.baseActionFor(wp.tag, "war", { value: wp.value }).then((ok) => { if (ok) g.toast(`WAR SPOILS: +${wp.value}CR TO THE [${wp.tag}] TREASURY`); });
    }
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
    const bay = g.lastBay || (1 + (this.station.id.length * 7 + Math.floor(g.world.time)) % 6);
    const title = isHome(p, this.station.id) ? "WELCOME HOME" : rankOf(p, "rescuer").idx >= 3 ? rankOf(p, "rescuer").title : hasCharter(g.world, this.station.factionId) ? "CHARTERED" : (p.lineage ?? []).length ? "OF THE LINE" : "";
    g.toast(`${this.station.name.toUpperCase()} CONTROL: ${p.shipName ? p.shipName + ", " : ""}${title ? title + ", " : ""}CLEARANCE GRANTED, BAY ${bay}`);
    { const c = collectCharters(p); for (const l of c.lines) g.toast(l); if (c.total !== 0) sfx.pickup(); }
    { const m = tickMail(g.world); for (const l of m) g.toast(l); if (m.length) sfx.letter(); }
    { const fr = friendsAt(g.world, this.station.id); if (fr.length && Math.random() < 0.5) g.toast(`${fr[0].name.toUpperCase()} IS IN THE LOUNGE AND WAVING YOU OVER`); }
  }

  settleCrew(g: Game): void {
    const p = g.world.player;
    if (!p.crew.length) {
      for (const line of settlePassengers(p)) g.toast(line);
      const ev0 = galaxyEventAt(g.world, p.systemId);
      if (ev0?.kind === "festival" && ev0.stationId === this.station.id && logSight(p, "festival", `the festival at ${this.station.name}`, p.systemId)) g.toast("YOUR PASSENGERS ARE OFF INTO THE FESTIVAL CROWD. THEY'LL REMEMBER THIS ONE.");
      return;
    }
    if (p.flags?.owedLeave) { delete p.flags.owedLeave; for (const c of p.crew) c.morale = Math.min(100, c.morale + 15); g.toast("SHORE LEAVE, AS PROMISED. CREW MORALE UP."); }
    const wages = crewWages(p);
    if (p.credits >= wages) { p.credits -= wages; g.toast(`CREW WAGES PAID -${wages}CR`); }
    else { for (const c of p.crew) c.morale = Math.max(0, c.morale - 20); g.toast("CAN'T PAY WAGES - CREW MORALE DROPS"); }
    for (const c of p.crew) {
      if ((p.cargo.food ?? 0) > 0) { removeCargo(p, "food", 1); c.morale = Math.min(100, c.morale + 8); }
      else c.morale = Math.max(0, c.morale - 15);
      if (p.cat) c.morale = Math.min(100, c.morale + 2);
      c.morale = Math.min(100, c.morale + Math.min(3, (p.furnishings ?? []).length) + ((p.modules ?? []).includes("greenhouse") ? 1 : 0));
    }
    for (const m of passengersAboard(p)) m.mood = Math.min(100, (m.mood ?? 60) + Math.min(6, (p.furnishings ?? []).length * 2));
    const quitters = p.crew.filter((c) => c.morale <= 5 && (c.loyalty ?? 0) < 3);
    for (const q of quitters) g.toast(`${q.name.toUpperCase()} WALKED OFF THE SHIP`);
    for (const c of p.crew) if (c.morale <= 5 && (c.loyalty ?? 0) >= 3) { c.morale = 20; c.loyalty = (c.loyalty ?? 0) - 1; g.toast(`${c.name.toUpperCase()} STAYS OUT OF LOYALTY. DON'T PUSH IT.`); }
    p.crew = p.crew.filter((c) => c.morale > 5 || (c.loyalty ?? 0) >= 2);
    const now = g.world.time;
    const rng = new RNG((g.world.seed ^ Math.floor(now) ^ 0x5ea) >>> 0);
    for (const c of p.crew) c.docks = (c.docks ?? 0) + 1;
    p.jumpStreak = 0;
    // pending asks: honoured here, or wearing thin
    for (const c of p.crew) {
      if (!c.request) continue;
      const r = c.request;
      const name = c.name.toUpperCase();
      if (r.kind === "visit" && r.stationId === this.station.id) {
        c.request = null; c.morale = Math.min(100, c.morale + 30); c.loyalty = (c.loyalty ?? 0) + 1; c.skill = Math.min(3, c.skill + 1);
        g.toast(`${name} COMES BACK ABOARD STEADIER, AND SHARPER. SKILL ${c.skill}.`);
      } else if (r.kind === "goods" && (p.cargo[r.commodityId] ?? 0) >= r.qty) {
        removeCargo(p, r.commodityId, r.qty); c.request = null; c.morale = Math.min(100, c.morale + 25); c.loyalty = (c.loyalty ?? 0) + 1;
        g.toast(`${name} TAKES THE ${commodity(r.commodityId).name.toUpperCase()} WITH BOTH HANDS. MORALE UP.`);
        logEntry(g.world, `${c.name} got the ${commodity(r.commodityId).name} they asked for`);
      } else if (r.kind === "letter" && r.stationId === this.station.id) {
        c.request = null; c.morale = Math.min(100, c.morale + 15); c.loyalty = (c.loyalty ?? 0) + 1; p.credits += 120;
        g.toast(`${name}'S LETTER IS DELIVERED. THE FAMILY SENDS 120CR FOR THE TROUBLE.`);
      } else if (++r.docks >= 5) { c.request = null; c.morale = Math.max(0, c.morale - 20); g.toast(`${name} STOPS ASKING. MORALE DOWN.`); }
    }
    // illness runs its course, or med supplies cut it short; new cases show up at the dock
    for (const c of p.crew) {
      const name = c.name.toUpperCase();
      if (crewRecover(c, now)) g.toast(`${name} IS BACK ON DUTY`);
      else if (c.sick && crewTreat(p, c)) g.toast(`MED SUPPLIES: ${name} IS OVER THE WORST OF IT. BACK ON DUTY.`);
      else if (!c.sick) { const kind = crewFallsIll(p, c, now, rng); if (kind) g.toast(`${name} HAS COME DOWN WITH ${kind.toUpperCase()}${crewBonus(p, "medic") > 0 ? " - THE MEDIC HAS IT IN HAND" : " - MED SUPPLIES WOULD HELP"}`); }
    }
    // shore leave: whoever waited here comes back aboard; whoever waited too long elsewhere is gone
    const berths = hull(p.hullId).crewSlots;
    const { back, gone } = collectShoreCrew(p, this.station.id, berths);
    for (const c of back) g.toast(`${c.name.toUpperCase()} COMES BACK ABOARD FROM LEAVE, RESTED.`);
    for (const c of gone) { retireCrew(p, c, this.station.id, now); logEntry(g.world, `${c.name} took another berth after waiting ${LEAVE_DOCKS} dockings on leave`); g.toast(`WORD FROM THE WIRE: ${c.name.toUpperCase()} GAVE UP WAITING AND SIGNED ON ELSEWHERE.`); }
    // old shipmates
    const alum = (p.alumni ?? []).filter((a) => a.stationId === this.station.id);
    if (alum.length && rng.chance(0.4)) { const a = rng.pick(alum); g.toast(`${a.name.toUpperCase()} WAVES FROM THE LOUNGE. ${roleLabel(a.role)}, RETIRED. ${a.docks} DOCKINGS WITH YOU.`); }
    for (const line of tickBonds(p, rng)) g.toast(line);
    { const l = tickRideAlong(p); if (l) g.toast(l); }
    if (isOccasion("founders")) for (const c of p.crew) c.morale = Math.min(100, c.morale + 5);
    if (isHome(p, this.station.id)) for (const c of p.crew) c.morale = Math.min(100, c.morale + 2);
    for (const line of settlePassengers(p)) g.toast(line);
    const evHere = galaxyEventAt(g.world, p.systemId);
    if (evHere?.kind === "festival" && evHere.stationId === this.station.id && logSight(p, "festival", `the festival at ${this.station.name}`, p.systemId)) g.toast("YOUR PASSENGERS ARE OFF INTO THE FESTIVAL CROWD. THEY'LL REMEMBER THIS ONE.");
    this.crewRequest(g);
    if (g.sceneName !== "encounter" && (p.tutorial ?? -1) < 0) { const cand = p.crew.find((c) => (c.loyalty ?? 0) >= 2 && !c.arc && arcFor(c.role)); if (cand && rng.chance(0.35)) offerArc(g, cand, "station"); }
    if (g.sceneName !== "encounter") this.retirement(g, rng);
    if (g.sceneName !== "encounter") this.envoy(g);
  }

  // Two of yours aren't speaking. The captain's table is where that gets settled, or doesn't.
  mediate(g: Game, a: CrewMember, b: CrewMember): void {
    const A = a.name.toUpperCase(), B = b.name.toUpperCase();
    const text = `${A} AND ${B} HAVEN'T SPOKEN IN THREE DOCKINGS. THE CORRIDOR GOES QUIET WHEN THEY PASS. ${A}: 'IT'S ${B}'S ${["SNORING", "OPINIONS", "COOKING", "MUSIC", "TIMEKEEPING"][a.name.length % 5]}.' ${B}: 'IT'S ${A}. FULL STOP.'`;
    const opts: Encounter["options"] = [];
    opts.push({ label: "SIT THEM DOWN WITH A BOTTLE", requires: (g2) => g2.world.player.credits >= 80, result: (g2) => { g2.world.player.credits -= 80; shiftBond(a, b, 3); a.morale = Math.min(100, a.morale + 5); b.morale = Math.min(100, b.morale + 5); return `TWO HOURS AND ONE BOTTLE LATER THEY'RE ARGUING ABOUT SOMETHING ELSE, TOGETHER. THAT'LL DO.`; } });
    opts.push({ label: "SPLIT THEIR SHIFTS", result: () => { shiftBond(a, b, 1); return `THEY DON'T HAVE TO LIKE EACH OTHER. THEY JUST HAVE TO NOT BE IN THE SAME ROOM. IT HELPS, A LITTLE.`; } });
    opts.push({ label: "LET THEM SORT IT OUT", result: (g2) => { const rng = new RNG((g2.world.seed ^ Math.floor(g2.world.time)) >>> 0); if (rng.chance(0.4)) { shiftBond(a, b, 2); return `THEY SORT IT OUT. NOBODY SAYS HOW. THE CORRIDOR IS LOUD AGAIN.`; } a.morale = Math.max(0, a.morale - 8); b.morale = Math.max(0, b.morale - 8); return `THEY DON'T SORT IT OUT. MORALE DOWN FOR BOTH. THE REST OF THE CREW TAKE SIDES.`; } });
    const enc: Encounter = { id: "crew-feud", where: "space", title: `${A} AND ${B}`, text, weight: 0, options: opts };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "station", true);
  }

  // After a long tour, someone wants to go home. How you part matters to the rest of the crew.
  retirement(g: Game, rng: RNG): void {
    const p = g.world.player;
    if ((p.tutorial ?? -1) >= 0) return;
    const c = p.crew.find((x) => (x.docks ?? 0) >= RETIRE_DOCKS && !x.retireAsked && rng.chance(0.2));
    if (!c) return;
    c.retireAsked = true;
    const name = c.name.toUpperCase();
    const stId = this.station.id;
    const text = `${name} FINDS YOU AT THE AIRLOCK, KIT BAG PACKED. '${c.docks} DOCKINGS, CAPTAIN. I'VE BEEN COUNTING. THIS IS A GOOD PORT TO STOP AT. I'D LIKE TO GO HOME WHILE I STILL REMEMBER WHAT IT LOOKS LIKE.'`;
    const opts: Encounter["options"] = [];
    opts.push({ label: "GO WELL. TAKE 300CR FOR THE ROAD.", requires: (g2) => g2.world.player.credits >= 300, result: (g2) => {
      const p2 = g2.world.player; p2.credits -= 300; retireCrew(p2, c, stId, g2.world.time);
      for (const o of p2.crew) { o.morale = Math.min(100, o.morale + 8); o.loyalty = (o.loyalty ?? 0) + 1; }
      logEntry(g2.world, `${c.name} retired at ${this.station.name} after ${c.docks} dockings, with a bonus`); flag(g2, "goodShip");
      return `${name} SHAKES YOUR HAND TWICE. THE CREW WATCH FROM THE CORRIDOR. THEY'LL REMEMBER HOW THIS WENT.`; } });
    opts.push({ label: "ONE MORE TOUR? I NEED YOU.", hint: "Loyal crew might", result: (g2) => {
      if ((c.loyalty ?? 0) >= 3) { c.docks = Math.max(0, (c.docks ?? 0) - 15); c.loyalty = (c.loyalty ?? 0) - 1; c.morale = Math.min(100, c.morale + 5); return `${name} LOOKS AT THE BAG, THEN AT THE SHIP. 'ONE MORE. AND YOU OWE ME.'`; }
      retireCrew(g2.world.player, c, stId, g2.world.time); logEntry(g2.world, `${c.name} left at ${this.station.name} after ${c.docks} dockings`);
      return `${name} SMILES, SHAKES YOUR HAND ONCE, AND GOES. YOU DIDN'T GIVE ENOUGH REASONS OVER THE YEARS.`; } });
    opts.push({ label: "CLEAR YOUR BERTH, THEN.", result: (g2) => {
      const p2 = g2.world.player; retireCrew(p2, c, stId, g2.world.time);
      for (const o of p2.crew) o.morale = Math.max(0, o.morale - 6);
      logEntry(g2.world, `${c.name} left at ${this.station.name} after ${c.docks} dockings`);
      return `${name} NODS. THE CORRIDOR IS QUIET AFTER. THE OTHERS NOTICED.`; } });
    const enc: Encounter = { id: "crew-retire", where: "space", title: `${name} - ${ROLE_INFO[c.role].label}`, text, weight: 0, options: opts };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "station", true);
  }

  // Faction envoys: the powers notice you. Amnesties, charters, warnings.
  envoy(g: Game): void {
    const p = g.world.player;
    const st = this.station;
    if ((p.tutorial ?? -1) >= 0 || st.factionId === "vex") return;
    const fid = st.factionId;
    const fac = faction(fid);
    const rep = p.rep[fid] ?? 0;
    p.envoySeen ??= {};
    if (g.world.time - (p.envoySeen[fid] ?? -1e9) < 600) return;
    const name = fac.name.toUpperCase();
    let text = ""; const opts: Encounter["options"] = [];
    if (p.wanted > 0.5 && rep > -20 && p.credits >= 800) {
      text = `A ${name} ENVOY MEETS YOU AT THE AIRLOCK. 'YOUR RECORD IS... BUSY. WE CAN MAKE IT LESS BUSY. ${Math.round(1200 + p.wanted * 1500)} CREDITS AND THE PATROLS FORGET YOUR HULL.'`;
      const price = Math.round(1200 + p.wanted * 1500);
      opts.push({ label: `PAY ${price}CR FOR AMNESTY`, requires: (g2) => g2.world.player.credits >= price, result: (g2) => { g2.world.player.credits -= price; g2.world.player.wanted = 0; logEntry(g2.world, `Bought an amnesty from the ${fac.name}`); return "THE ENVOY SIGNS SOMETHING. SOMEWHERE A FILE CLOSES. YOU ARE NOBODY AGAIN."; } });
      opts.push({ label: "KEEP MY RECORD, THANKS", result: () => "'AS YOU LIKE. THE PATROLS HAVE LONG MEMORIES.'" });
    } else if (rep >= 75 && !hasCharter(g.world, fid)) {
      text = `A ${name} ENVOY, IN DRESS GREYS. 'THE ${name} RECOGNISES ITS FRIENDS. A CHARTER: OUR CONTRACTS PAY YOU FIFTEEN PERCENT MORE, AND OUR YARDS WORK AT COST. WE ASK ONLY THAT YOU KEEP FLYING THE WAY YOU FLY.'`;
      opts.push({ label: "ACCEPT THE CHARTER", result: (g2) => { (g2.world.player.charters ??= []).push(fid); flag(g2, "charter"); logEntry(g2.world, `Chartered by the ${fac.name}`); void wire.post("arc", `was chartered by the ${fac.name}`, g2.world.systems[g2.world.player.systemId].name); return "A SEAL ON YOUR MANIFEST, A LINE IN THEIR LEDGER. DOORS OPEN A LITTLE WIDER FROM HERE."; } });
      opts.push({ label: "DECLINE, POLITELY", result: () => "'THE OFFER STANDS. IT USUALLY DOES.'" });
    } else if (rep <= -40 && rep > -60) {
      text = `A ${name} CUSTOMS OFFICER, NOT AN ENVOY. 'YOU'RE UNDER EMBARGO. FUEL AND REPAIRS ONLY. FIX YOUR STANDING OR FIND ANOTHER FLAG TO FLY UNDER.'`;
      opts.push({ label: "ASK WHAT IT WOULD TAKE", result: () => "'RUN OUR CONTRACTS. ANSWER OUR DISTRESS CALLS. STOP SHOOTING OUR PATROLS. IN THAT ORDER.'" });
      opts.push({ label: "SAY NOTHING", result: () => "THE OFFICER MAKES A NOTE. YOU SUSPECT IT IS NOT A KIND ONE." });
    } else return;
    p.envoySeen[fid] = g.world.time;
    const enc: Encounter = { id: `envoy-${fid}`, where: "space", title: `${name} - ENVOY`, text, weight: 0, options: opts };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "station", true);
  }

  // Now and then somebody wants something. A card, a choice, a consequence.
  crewRequest(g: Game): void {
    const p = g.world.player;
    if (!p.crew.length || (p.tutorial ?? -1) >= 0) return;
    const rng = new RNG((g.world.seed ^ Math.floor(g.world.time) ^ 0xc4e) >>> 0);
    if (!rng.chance(0.22)) return;
    const c = rng.pick(p.crew.filter((x) => !x.request));
    if (!c) return;
    const name = c.name.toUpperCase();
    const kinds = ["leave", "visit", "training", "family", "shore", "goods", "letter"] as const;
    const feud = feuds(p)[0];
    if (feud && rng.chance(0.5)) { this.mediate(g, feud[0], feud[1]); return; }
    const kind = c.morale < 30 ? "leave" : rng.pick(kinds);
    const opts: Encounter["options"] = [];
    let text = "";
    if (kind === "leave") {
      text = `${name} CORNERS YOU IN THE CORRIDOR. '${CREW_LINES[c.role].low[0]} I'VE GOT AN OFFER ON THIS STATION. GIVE ME A REASON TO STAY.'`;
      opts.push({ label: "A 150CR BONUS", requires: (g2) => g2.world.player.credits >= 150, result: (g2) => { g2.world.player.credits -= 150; c.morale = Math.min(100, c.morale + 35); c.loyalty = (c.loyalty ?? 0) + 1; return `${name} POCKETS IT AND ALMOST SMILES. MORALE UP.`; } });
      opts.push({ label: "PROMISE SHORE LEAVE NEXT DOCK", result: (g2) => { c.morale = Math.min(100, c.morale + 10); (g2.world.player.flags ??= {}).owedLeave = true; return `${name} NODS. YOU'LL BE HELD TO THAT.`; } });
      opts.push({ label: "TAKE THE OFFER, THEN", result: (g2) => { g2.world.player.crew = g2.world.player.crew.filter((x) => x !== c); return `${name} PACKS IN TEN MINUTES. THE BERTH IS EMPTY BY THE TIME YOU UNDOCK.`; } });
    } else if (kind === "visit") {
      const linked = g.world.systems[p.systemId].links.map((l) => g.world.systems[l]).filter((s) => s.stations.length);
      const target = linked.length ? rng.pick(linked) : null;
      const st = target ? rng.pick(target.stations) : null;
      if (!st) return;
      text = `${name} ASKS FOR A WORD. 'MY PEOPLE ARE ON ${st.name.toUpperCase()}, ${target!.name.toUpperCase()}. I HAVEN'T SEEN THEM IN A YEAR. IF WE'RE EVER PASSING...'`;
      opts.push({ label: "WE'LL MAKE THE STOP", hint: "Dock there within a few dockings", result: () => { c.request = { kind: "visit", stationId: st.id, docks: 0 }; return `${name} STANDS A LITTLE STRAIGHTER. ${st.name.toUpperCase()} IS ON THE LOG.`; } });
      opts.push({ label: "NOT THIS RUN", result: () => { c.morale = Math.max(0, c.morale - 8); return `${name} SAYS IT'S FINE. IT ISN'T.`; } });
    } else if (kind === "shore") {
      if (p.crew.length < 2) return;
      text = `${name} ASKS FOR SHORE LEAVE. 'MONTHS WITHOUT A DAY OFF THE DECK. LEAVE ME HERE. PICK ME UP NEXT TIME YOU'RE THROUGH. I'LL KEEP MY BERTH.'`;
      opts.push({ label: "TAKE YOUR LEAVE", hint: `They wait ${LEAVE_DOCKS} dockings; the berth stays theirs`, result: (g2) => { sendOnLeave(g2.world.player, c, this.station.id); return `${name} IS DOWN THE RAMP BEFORE YOU FINISH THE SENTENCE. ${this.station.name.toUpperCase()} HAS THEM UNTIL YOU'RE BACK.`; } });
      opts.push({ label: "NOT THIS RUN", result: () => { c.morale = Math.max(0, c.morale - 10); return `${name} SAYS FINE. THE WORD HAS EDGES.`; } });
    } else if (kind === "goods") {
      const wants = rng.pick([["lux", 2], ["food", 4], ["med", 1], ["metals", 3]] as const);
      text = `${name} HAS A LIST. '${wants[1]} ${commodity(wants[0]).name.toUpperCase()}, NEXT TIME WE'RE SOMEWHERE THAT SELLS IT. FOR THE ${rng.pick(["ANNIVERSARY", "GALLEY", "BUNK ROOM", "CREW", "MED BAY"])}. I'LL SQUARE IT WITH YOU.'`;
      opts.push({ label: "I'LL FIND IT", hint: "Dock with it aboard within five dockings", result: () => { c.request = { kind: "goods", commodityId: wants[0], qty: wants[1], docks: 0 }; return `${name} PINS THE LIST BY THE AIRLOCK.`; } });
      opts.push({ label: "BUY YOUR OWN", result: () => { c.morale = Math.max(0, c.morale - 6); return `${name} TAKES THE LIST BACK.`; } });
    } else if (kind === "letter") {
      const home = c.home ? findStation(g.world, c.home) : null;
      if (!home || home.st.id === this.station.id) return;
      text = `${name} HANDS YOU A SEALED LETTER. 'FOR MY PEOPLE ON ${home.st.name.toUpperCase()}, ${home.sys.name.toUpperCase()}. THE WIRE'S FINE FOR NEWS. THIS ISN'T NEWS.'`;
      opts.push({ label: "I'LL CARRY IT", hint: "Dock there within five dockings", result: () => { c.request = { kind: "letter", stationId: home.st.id, docks: 0 }; return `THE LETTER GOES IN THE CAPTAIN'S LOCKER. ${home.st.name.toUpperCase()} IS ON THE LOG.`; } });
      opts.push({ label: "SEND IT ON THE WIRE", result: () => { c.morale = Math.max(0, c.morale - 5); return `${name} PUTS THE LETTER AWAY AGAIN.`; } });
    } else if (kind === "training") {
      if (c.skill >= 3) return;
      text = `${name} HAS FOUND A COURSE ON THE STATION. '${ROLE_INFO[c.role].label} CERTIFICATION. THREE HUNDRED, AND I COME BACK BETTER AT THIS.'`;
      opts.push({ label: "PAY 300CR FOR THE COURSE", requires: (g2) => g2.world.player.credits >= 300, result: (g2) => { g2.world.player.credits -= 300; c.skill = Math.min(3, c.skill + 1); c.loyalty = (c.loyalty ?? 0) + 1; return `${name} RETURNS WITH A CERTIFICATE AND OPINIONS. SKILL ${c.skill}.`; } });
      opts.push({ label: "MAYBE NEXT TIME", result: () => { c.morale = Math.max(0, c.morale - 5); return `${name} SHRUGS. THE COURSE RUNS AGAIN SOMEWHERE.`; } });
    } else {
      text = `${name} WON'T QUITE MEET YOUR EYE. 'FAMILY TROUBLE BACK HOME. TWO HUNDRED WOULD FIX IT. I'D TAKE IT OFF MY WAGES.'`;
      opts.push({ label: "SEND 200CR, NO STRINGS", requires: (g2) => g2.world.player.credits >= 200, result: (g2) => { g2.world.player.credits -= 200; c.morale = Math.min(100, c.morale + 25); c.loyalty = (c.loyalty ?? 0) + 2; return `${name} DOESN'T SAY THANK YOU. ${name} DOESN'T HAVE TO.`; } });
      opts.push({ label: "ADVANCE IT AGAINST WAGES", requires: (g2) => g2.world.player.credits >= 200, result: (g2) => { g2.world.player.credits -= 200; c.wage += 10; c.morale = Math.min(100, c.morale + 10); return `${name} AGREES TO THE TERMS. WAGE +10 UNTIL IT'S SQUARE.`; } });
      opts.push({ label: "CAN'T RIGHT NOW", result: () => { c.morale = Math.max(0, c.morale - 12); return `${name} NODS AND GOES BACK TO WORK. QUIETER THAN BEFORE.`; } });
    }
    const enc: Encounter = { id: `crew-${kind}`, where: "space", title: `${name} - ${ROLE_INFO[c.role].label}`, text, weight: 0, options: opts };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "station", true);
  }

  paTimer = 20;
  update(g: Game, dt: number): void {
    const inp = g.input;
    music.setMood(this.station.factionId, 0);
    this.paTimer -= dt;
    if (this.paTimer <= 0) { this.paTimer = 25 + Math.random() * 35; sfx.pa(); }
    presence.tick(g.world.player, g.world.systems[g.world.player.systemId].name); // still "here" while docked
    if (inp.wasPressed("Escape")) {
      this.flushGoal();
      g.world.player.lastDockedAt = this.station.id;
      if (this.routeShare > 0 && this.baseOwner) { const v = Math.min(5000, this.routeShare); this.routeShare = 0; void wire.baseActionFor(this.baseOwner, "route", { value: v }); }
      if (this.returnTo === "stationwalk") g.setScene("stationwalk");
      else { g.world.player.dockedAt = null; g.justUndocked = true; g.setScene("flight"); g.toast("UNDOCKED"); }
      return;
    }
    if (inp.wasPressed("p")) { g.setScene("stationwalk"); return; }
    if (inp.wasPressed("F5")) g.save();
    if (inp.wasPressed("ArrowLeft") || inp.wasPressed("q")) { this.tab = (this.tab + TABS.length - 1) % TABS.length; this.cursor = 0; }
    if (inp.wasPressed("ArrowRight") || inp.wasPressed("e")) { this.tab = (this.tab + 1) % TABS.length; this.cursor = 0; }
    if (inp.wasPressed("ArrowUp")) { this.cursor--; sfx.blip(); }
    if (inp.wasPressed("ArrowDown")) { this.cursor++; sfx.blip(); }
    if (inp.wheel) this.cursor += Math.sign(inp.wheel);

    let clickedRow = false, rightClickedRow = false; // right-click on a market row always buys
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
      if (row >= 0) { this.cursor = row; if (inp.mousePressed) clickedRow = true; if (inp.mouseRightPressed) rightClickedRow = true; }
    }

    const p = g.world.player;
    const st = this.station;
    const patron = wire.patronOf(st.factionId);
    const synHere = syndicateAt(g.world, st.id);
    const treaty = this.baseOwner && wire.getSquadron() && this.baseOwner !== wire.getSquadron() ? wire.treatyBetween(wire.getSquadron()!, this.baseOwner) : null;
    const rep = (p.rep[st.factionId] ?? 0) + (patron && patron === wire.getSquadron() ? 25 : 0) + (synHere && effectiveSynStanding(g.world, synHere.tag) >= 30 ? 25 : 0) - (treaty === "rivalry" ? 50 : 0); // patrons and affiliates (or partners of allies) trade like allies; rivals pay more
    const enter = inp.wasPressed("Enter") || inp.wasPressed(" ") || clickedRow;
    if (enter) sfx.select();

    switch (TABS[this.tab]) {
      case "MARKET": {
        const rows = this.marketRows(g);
        this.cursor = clamp(this.cursor, 0, rows.length - 1);
        const id = rows[this.cursor];
        if (embargoed(g.world, st.factionId)) { if (enter || inp.wasPressed("b") || inp.wasPressed("s")) g.toast("EMBARGO - THIS MARKET WON'T TRADE WITH YOU"); break; }
        // Enter and click sell what you hold; they buy only when your hold is empty of it. B and S stay explicit.
        const holding = (p.cargo[id] ?? 0) > 0;
        const wantSell = inp.wasPressed("s") || inp.wasPressed("Backspace") || (enter && holding);
        const wantBuy = inp.wasPressed("b") || rightClickedRow || (enter && !holding);
        // Shift trades in bulk: a stack of ten bought, or the whole hold of it sold. Prices move with every unit.
        const bulk = inp.isDown("Shift");
        const buyQty = wantBuy ? (bulk ? 10 : 1) : 0;
        const sellQty = wantSell ? (bulk ? (p.cargo[id] ?? 0) : 1) : 0;
        let bought = 0, spent = 0;
        for (let k = 0; k < buyQty; k++) {
          const price = buyPrice(st, id, rep);
          if ((st.stock[id] ?? 0) <= 0) { g.toast("OUT OF STOCK"); break; }
          if (p.credits < price) { g.toast("NOT ENOUGH CREDITS"); break; }
          if (!addCargo(p, id, 1)) { g.toast("CARGO FULL"); break; }
          p.credits -= price; st.stock[id]--; spent += price; bought++; refreshPrices(st);
          g.showHint("trade", "PRICES MOVE: BUY WHERE STOCK IS HIGH, SELL WHERE IT'S LOW");
        }
        if (bought > 1) g.toast(`BOUGHT ${bought} ${commodity(id).name.toUpperCase()} FOR ${spent}CR`);
        let sold = 0, earned = 0;
        for (let k = 0; k < sellQty; k++) {
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
            const dem = this.demandHere(g);
            const sy = syndicateAt(g.world, st.id);
            const synBonus = sy ? (synStanding(g.world, sy.tag) >= 60 ? 0.1 : 0) : 0;
            const routeHit = !!dem && dem.goods.includes(id);
            const crisis = crisisAt(g.world, st.id);
            const crisisHit = !!crisis && crisis.commodityId === id;
            const serialMult = serialPremium(g.world, st.id, id);
            const paid = Math.round(price * (goalHit ? 1 + this.goal.premium : 1) * (this.baseHas("market") ? 1.08 : 1) * (treaty === "pact" ? 1.05 : 1) * (routeHit ? 1 + ROUTE_PREMIUM + synBonus : 1) * (crisisHit ? CRISIS_PREMIUM : 1) * serialMult);
            if (serialMult > 1 && !p.flags?.serialSale) { flag(g, "serialSale"); g.toast(`THE STORY PAYS: ${commodity(id).name.toUpperCase()} AT x${serialMult} HERE WHILE IT LASTS`); }
            if (crisisHit && crisis) {
              crisis.delivered++;
              if (crisis.delivered >= crisis.need) {
                p.credits += 800; adjustRep(g.world, st.factionId, 12); flag(g, "lifeline"); p.rescues = (p.rescues ?? 0) + 2;
                logEntry(g.world, `Broke the ${crisis.kind} at ${st.name}`);
                g.toast(`CRISIS OVER - ${st.name.toUpperCase()} THANKS YOU. +800CR, STANDING UP.`);
                pushEvent(g.world, { t: g.world.time, kind: "rescue", systemId: p.systemId, text: `${st.name}'s ${crisis.kind} is over: an independent pilot brought the last of the ${commodity(id).name}` });
                void wire.post("rescue", `broke the ${crisis.kind} at ${st.name} with ${crisis.need} ${commodity(id).name}`, g.world.systems[p.systemId].name);
              }
            }
            if (routeHit) {
              p.routes = [...(p.routes ?? []).slice(-29), { from: p.lastDockedAt ?? st.id, to: st.id, commodityId: id, t: Date.now() }];
              if (sy) { sy.treasury += Math.round(paid * 0.1); if (Math.random() < 0.34) adjustSynRep(g.world, sy.tag, 1); }
              else this.routeShare += Math.round(paid * 0.1);
              if ((p.routes ?? []).length >= 10) flag(g, "routeRunner");
            }
            if (goalHit) { this.goalPending++; p.goalContrib ??= {}; p.goalContrib[this.goal.id] = (p.goalContrib[this.goal.id] ?? 0) + 1; if ((p.goalContrib[this.goal.id] ?? 0) >= 20) flag(g, "communal"); }
            p.credits += paid; p.tradeRevenue = (p.tradeRevenue ?? 0) + paid; sold++; earned += paid;
            if (!rare || st.rare === id) { st.stock[id] = (st.stock[id] ?? 0) + 1; refreshPrices(st); }
            if (rare && st.rare !== id) { p.rareRevenue = (p.rareRevenue ?? 0) + price; if (!p.flags?.rareRun) flag(g, "rareRun"); }
          }
        }
        if (sold > 1) g.toast(`SOLD ${sold} ${commodity(id).name.toUpperCase()} FOR ${earned}CR`);
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
        if (inp.wasPressed("r") && (p.haulers ?? []).length) {
          const c = p.haulers![p.haulers!.length - 1];
          if (confirmBox(`Release ${c.name} from the charter? The till (${Math.round(c.till)}cr) pays out now; the crew find other work.`)) { p.credits += Math.round(c.till); releaseCharter(p, c); g.toast(`${c.name.toUpperCase()} RELEASED. THE CREW WAVE FROM THE BAY.`); }
          inp.flush();
        }
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
        const rows = st.barPatrons.length + this.candidates.length + this.fares.length;
        this.cursor = clamp(this.cursor, 0, Math.max(0, rows - 1));
        if (enter) {
          if (this.cursor < st.barPatrons.length) {
            const rng = new RNG((g.world.seed ^ (this.cursor * 7727) ^ Math.floor(g.world.time / 20)) >>> 0);
            const fr = friendsAt(g.world, st.id).find((c) => c.name === st.barPatrons[this.cursor]);
            if (fr && !p.companion) {
              const enc: Encounter = { id: "ride", where: "space", title: `${fr.name.toUpperCase()} - ${fr.ship.toUpperCase()}`, weight: 0, text: `${fr.name.toUpperCase()} PUSHES A GLASS ACROSS. 'I'VE GOT A FEW DAYS. IF YOU WANT COMPANY ON THE LANES, THE ${fr.ship.toUpperCase()} FLIES WELL ENOUGH, AND I DON'T MIND CORSAIRS.'`, options: [
                { label: `ASK THEM TO RIDE ALONG (${RIDE_ALONG_DOCKS} DOCKINGS)`, result: (g2) => { flag(g2, "rideAlong"); return askRideAlong(g2.world.player, fr); } },
                { label: "JUST TALK", result: (g2) => rng.pick(BAR_LINES)(g2, this.station).toUpperCase() },
              ] };
              (g.scenes["encounter"] as EncounterScene).open(g, enc, "station", true);
            } else this.barLine = rng.pick(BAR_LINES)(g, this.station);
          } else if (this.cursor < st.barPatrons.length + this.candidates.length) {
            const c = this.candidates[this.cursor - st.barPatrons.length];
            if (c) this.hire(g, c);
          } else {
            const f = this.fares[this.cursor - st.barPatrons.length - this.candidates.length];
            if (f) this.acceptMission(g, f);
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
        if (inp.wasPressed("c")) { this.surveyView = this.surveyView === "codex" ? "data" : "codex"; sfx.blip(); }
        if (enter && this.surveyView === "data") this.sellExploration(g);
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
          } else if (row.kind === "back") {
            if (backWar(g.world, row.id!, tag)) {
              g.toast(`[${tag}] DECLARES FOR [${row.id}] - THE FRONT MOVES`);
              sfx.alarm();
              void wire.post("base", `squadron [${tag}] declared for [${row.id}] in the syndicate war at ${g.world.systems[g.world.synWar!.systemId].name}`, g.world.systems[p2.systemId].name);
            } else g.toast("THE WAR IS OVER OR A SIDE IS ALREADY BACKED");
          } else if (row.kind === "treaty") {
            void this.baseDo(g, "treaty", { with: row.id, kind: row.treaty }, () => { g.toast(row.treaty === "none" ? `TREATY WITH [${row.id}] ENDED` : row.treaty === "pact" ? `PACT OFFERED TO [${row.id}] - IT COUNTS WHEN THEY SIGN TOO` : `[${row.id}] IS NOW A RIVAL OF [${tag}]`); sfx.select(); void wire.fetchBases(true); });
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
        if (inp.wasPressed("l")) { this.recordView = this.recordView === "log" ? "achievements" : "log"; this.cursor = 0; sfx.blip(); }
        if (inp.wasPressed("x")) {
          try {
            const text = chronicleText(g.world, wire.getCallsign());
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
            a.download = `farspace-chronicle-${(p.shipName ?? "ship").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.txt`;
            document.body.appendChild(a); a.click(); a.remove();
            g.toast("CHRONICLE SAVED AS A TEXT FILE"); sfx.pickup(); flag(g, "chronicle");
          } catch { g.toast("CHRONICLE EXPORT FAILED"); }
        }
        this.cursor = clamp(this.cursor, 0, this.recordView === "log" ? Math.max(0, (p.log?.length ?? 0) - 16) : Math.max(0, Math.ceil(ACHIEVEMENTS.length / 2) - 12));
        break;
    }
  }

  squadrons: wire.Squadron[] = [];
  patrons: Record<string, string> = {};
  recordView: "achievements" | "log" = "achievements";
  surveyView: "data" | "codex" = "data";
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
    if (m.kind !== "passenger" && p.missions.filter((x) => x.accepted && !x.done && x.kind !== "passenger").length >= 5) { g.toast("MISSION LOG FULL"); return; }
    if (m.kind === "passenger" && passengersAboard(p).length >= passengerCap(p)) { g.toast(passengerCap(p) === 1 ? "ONE PASSENGER WITHOUT CABINS - FIT PASSENGER CABINS AT A SHIPYARD" : `ALL ${passengerCap(p)} CABINS TAKEN`); return; }
    if (m.tier && m.tier > missionTier(p.rep[st.factionId] ?? 0)) { g.toast("YOUR STANDING ISN'T HIGH ENOUGH"); return; }
    if ((m.kind === "delivery" || (m.kind === "arc" && m.commodityId && m.arcStage !== undefined && ARCS[m.arcFaction!].stages[m.arcStage].kind === "delivery")) && m.commodityId && m.qty) {
      if (!addCargo(p, m.commodityId, m.qty)) { g.toast("NOT ENOUGH CARGO SPACE"); return; }
    }
    m.accepted = true;
    p.missions.push(m);
    this.fares = this.fares.filter((f) => f !== m);
    if (m.kind === "passenger" && m.demand) g.toast(`${(m.passengerName ?? "").toUpperCase()} MENTIONS THEY'D APPRECIATE ${commodity(m.demand).name.toUpperCase()} ABOARD`);
    if (m.kind === "repair") { g.tenderMission = m; g.toast("SUITING UP - THE PLANT IS THROUGH THE YARD DOOR"); sfx.repair(); g.setScene("repair"); return; }
    g.toast("MISSION ACCEPTED");
    if (m.kind === "escort") g.showHint("escort", "THE FREIGHTER LAUNCHES WHEN YOU UNDOCK - STAY CLOSE");
    if (m.kind === "research") g.showHint("research", "IN THE TARGET SYSTEM, HOLD V TO DEEP-SCAN FOR THE SIGNAL");
    if (m.kind === "passenger") g.showHint("passenger", "YOUR PASSENGER IS IN THE BUNK ROOM - TALK TO THEM ABOARD (I)");
  }

  completeMission(g: Game, m: Mission): void {
    const p = g.world.player;
    const st = this.station;
    if (m.commodityId && m.qty && m.kind !== "research") removeCargo(p, m.commodityId, m.qty);
    if (m.shipTotal) {
      // one shipment of a standing order: pay the instalment, keep the contract open until the last
      m.shipDone = (m.shipDone ?? 0) + 1;
      const pay = Math.round(m.reward * (1 + 0.2 * (m.shipDone - 1)));
      p.credits += pay; p.tradeRevenue = (p.tradeRevenue ?? 0) + pay;
      adjustRep(g.world, st.factionId, m.repReward ?? 2);
      if (m.shipDone < m.shipTotal) { g.toast(`SHIPMENT ${m.shipDone}/${m.shipTotal} +${pay}CR - NEXT PAYS MORE`); sfx.pickup(); return; }
      g.toast(`STANDING ORDER COMPLETE +${pay}CR`); flag(g, "standingOrder");
      m.done = true; sfx.pickup(); return;
    }
    m.done = true;
    const fest = m.kind === "passenger" && galaxyEventAt(g.world, p.systemId)?.kind === "festival" && galaxyEventAt(g.world, p.systemId)?.stationId === st.id;
    const charter = hasCharter(g.world, st.factionId) && !m.syndicate ? 1.15 : 1;
    const base = Math.round((m.kind === "passenger" && m.mood !== undefined ? passengerPay(m) : m.reward) * (m.kind === "passenger" && isOccasion("founders") ? 1.5 : 1));
    p.credits += Math.round((fest ? base * 2 : base) * charter);
    if (fest) g.toast("FESTIVAL WEEK - YOUR PASSENGERS PAID DOUBLE");
    if (m.kind === "passenger" && m.notable) { const line = notableOutcome(g.world, m); if (line) { g.toast(line); logEntry(g.world, line.toLowerCase().slice(0, 100)); flag(g, "notable"); } }
    if (m.kind === "passenger" && m.mood !== undefined) {
      const mood = m.mood;
      const name = (m.passengerName ?? "YOUR PASSENGER").toUpperCase();
      if (mood >= 80) { const tip = m.passengerKind === "vip" ? 200 : m.passengerKind === "refugee" ? 0 : 80; p.credits += tip; adjustRep(g.world, st.factionId, 1); g.toast(`${name} STEPS OFF SMILING. ${tip ? `A ${tip}CR TIP AND ` : ""}A WORD IN THE RIGHT EAR. +${base}CR`); p.fares = (p.fares ?? 0) + 1; if (mood >= 95) flag(g, "fiveStar"); }
      else if (mood < 25) { adjustRep(g.world, st.factionId, -2); g.toast(`${name} LEAVES WITHOUT A WORD AND FILES A COMPLAINT. +${base}CR, STANDING DOWN`); }
      else g.toast(`${name} DISEMBARKS. +${base}CR${(m.sights?.length ?? 0) > 1 ? ` (${m.sights!.length} SIGHTS)` : ""}`);
      p.fares = (p.fares ?? 0) + (mood >= 80 ? 0 : 1);
    }
    adjustRep(g.world, st.factionId, m.repReward ?? 3);
    if (m.kind === "passenger" && m.passengerKind === "tourist") flag(g, "tourist");
    if (m.syndicate) {
      const before = synStanding(g.world, m.syndicate);
      adjustSynRep(g.world, m.syndicate, 8);
      if (m.kind === "delivery" && g.world.synWar && (g.world.synWar.attacker === m.syndicate || g.world.synWar.defender === m.syndicate)) {
        const w2 = warContribute(g.world, m.syndicate, 10);
        if (w2) g.toast(`WAR SUPPLY RUN FOR [${m.syndicate}] - FRONT ${w2.score > 0 ? "+" : ""}${w2.score}`);
      }
      if (m.syndicateTarget) {
        adjustSynRep(g.world, m.syndicateTarget, -6);
        const r = shiftRelation(g.world, m.syndicate, m.syndicateTarget, -6);
        if (synStanding(g.world, m.syndicateTarget) <= -20) g.toast(`[${m.syndicateTarget}] HAS MARKED YOU - EXPECT THEIR RAIDERS`);
        void r;
      } else {
        // honest work for A warms A toward whoever you've also worked for
        for (const [t, v] of Object.entries(g.world.player.synRep ?? {})) if (t !== m.syndicate && v >= 30) shiftRelation(g.world, m.syndicate, t, 2);
      }
      const after = synStanding(g.world, m.syndicate);
      if (before < 30 && after >= 30) { g.toast(`[${m.syndicate}] NOW CALLS YOU AN AFFILIATE - THEIR BASE TRADES CHEAPER FOR YOU`); flag(g, "affiliate"); }
      else if (before < 60 && after >= 60) { g.toast(`[${m.syndicate}] PARTNER STATUS - THEIR MARKET PAYS YOU MORE`); }
      else g.toast(`[${m.syndicate}] STANDING ${after} (${synStandingLabel(after)})`);
    }
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
    if (!(m.kind === "passenger" && m.mood !== undefined)) g.toast(`MISSION COMPLETE +${m.reward}CR`);
    sfx.pickup();
    if (m.kind === "bounty" && (m.killsNeeded ?? 0) >= 4) void wire.post("bounty", `collected a ${m.killsNeeded}-corsair bounty`, g.world.systems[p.systemId].name);
    p.missions = p.missions.filter((x) => !x.done);
    p.hints.firstMission ||= true;
  }

  hire(g: Game, c: CrewMember): void {
    const p = g.world.player;
    const slots = hull(p.hullId).crewSlots;
    const cost = c.wage * 3;
    if (berthsUsed(p) >= slots) { g.toast(`NO BERTHS LEFT (${slots} ON THIS HULL${(p.shoreCrew ?? []).length ? ", ONE KEPT FOR CREW ON LEAVE" : ""})`); return; }
    if (p.credits < cost) { g.toast(`SIGNING BONUS ${cost}CR - NOT ENOUGH`); return; }
    p.credits -= cost;
    p.crew.push({ ...c, home: this.station.id, docks: 0 });
    if (c.trait === "tells stories about the Steady Hand") flag(g, `serialHire:${this.station.id}`);
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
    p.hullHistory = hullHistoryFor(g.world, new RNG((g.world.seed ^ Math.floor(g.world.time * 71)) >>> 0));
    g.toast(keepOld ? `WELCOME ABOARD THE ${h.name.toUpperCase()} - YOUR OLD HULL IS PARKED HERE` : `WELCOME ABOARD THE ${h.name.toUpperCase()}`);
    if (p.hullHistory) { logEntry(g.world, `Took on a hull once flown by ${p.hullHistory.previous}: ${p.hullHistory.quirk}`); setTimeout(() => g.toast(`SHE WAS ${p.hullHistory!.previous.toUpperCase()}'S BEFORE YOU. THERE'S ${p.hullHistory!.quirk.toUpperCase()}.`), 2600); }
    sfx.dock();
    void wire.post("hull", `took delivery of a ${h.name}`, g.world.systems[p.systemId].name);
  }

  shipyardOptions(g: Game): { label: string; sub: string; action: () => void }[] {
    const p = g.world.player;
    const st = this.station;
    const opts: { label: string; sub: string; action: () => void }[] = [];
    // patron squadrons keep their faction's yards half price for members
    const patronHere = (!!wire.getSquadron() && wire.patronOf(st.factionId) === wire.getSquadron()) || this.myBaseHere() || hasCharter(g.world, st.factionId);
    const depot = this.baseHas("depot");
    const homeMul = (isHome(p, st.id) ? 0.85 : 1) * (isOccasion("yard") ? 0.8 : 1);
    const fuelPrice = depot ? 0 : Math.max(1, Math.round((patronHere ? Math.max(1, Math.round(st.fuelPrice / 2)) : st.fuelPrice) * homeMul));
    const repairPrice = depot ? 0 : Math.max(1, Math.round((patronHere ? Math.max(1, Math.round(st.repairPrice / 2)) : st.repairPrice) * homeMul));
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
    if ((p.wear ?? 0) >= WEAR_SERVICE_FROM) {
      const price = servicePrice(p, patronHere ? 0.7 : 1);
      opts.push({ label: `YARD SERVICE (WEAR ${Math.round(p.wear ?? 0)}%)${patronHere ? " - PATRON RATE" : ""}`, sub: `${price}CR`, action: () => {
        if (p.credits < price) { g.toast("NOT ENOUGH CREDITS"); return; }
        p.credits -= price; serviceHull(p, st.id, g.world.time, price);
        logEntry(g.world, `Yard service at ${st.name}, ${price}cr, signed`);
        g.toast(`SERVICED AND SIGNED IN THE BERTH LOG. SHE'LL FLY LIKE NEW.`); sfx.repair();
      } });
    }
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
    for (const f of FURNISHINGS) {
      if ((p.furnishings ?? []).includes(f.id)) continue;
      opts.push({ label: `FOR THE DECK: ${f.name.toUpperCase()}`, sub: `${f.price}CR - ${f.desc.toUpperCase()}`, action: () => {
        if (p.credits < f.price) return g.toast("NOT ENOUGH CREDITS");
        p.credits -= f.price; (p.furnishings ??= []).push(f.id);
        g.toast(`${f.name.toUpperCase()} CARRIED ABOARD. ${f.desc.toUpperCase()}`); sfx.pickup();
        if ((p.furnishings ?? []).length >= 4) flag(g, "homely");
      } });
    }
    {
      const best = this.bestRoute(g);
      const toId = best ? Object.keys(p.marketMemory ?? {}).find((id) => findStation(g.world, id)?.st.name === best.station) : null;
      if (best && toId && (p.haulers ?? []).length < CHARTER_CAP) {
        opts.push({ label: `CHARTER A HAULER: ${commodity(best.id).name.toUpperCase()} TO ${best.station.toUpperCase()} (${(p.haulers ?? []).length}/${CHARTER_CAP})`, sub: `${CHARTER_PRICE}CR - RUNS YOUR BEST KNOWN ROUTE WHILE YOU FLY, ${Math.round(CHARTER_CUT * 100)}% OF THE MARGIN IS YOURS, PAID WHEN YOU DOCK`, action: () => {
          const r = hireCharter(g.world, st.id, toId, best.id, new RNG((g.world.seed ^ Math.floor(g.world.time * 29)) >>> 0));
          if (typeof r === "string") return g.toast(r);
          g.toast(`${r.name.toUpperCase()} SIGNED ON THE ${st.name.toUpperCase()} - ${best.station.toUpperCase()} RUN. FIRST TRIP IN ${Math.round(r.tripSecs / 60)} MINUTES.`); sfx.dock();
          logEntry(g.world, `Chartered ${r.name} on the ${st.name} - ${best.station} run`); flag(g, "shippingLine");
          void wire.post("trade", `chartered ${r.name} on the ${st.name} - ${best.station} run`, g.world.systems[p.systemId].name);
        } });
      } else if (!best && (p.haulers ?? []).length < CHARTER_CAP) {
        opts.push({ label: "CHARTER A HAULER", sub: "VISIT ANOTHER MARKET FIRST: A CHARTER RUNS YOUR BEST KNOWN ROUTE FROM HERE", action: () => g.toast("NO KNOWN RUN FROM HERE YET - DOCK AT ANOTHER STATION AND COME BACK") });
      }
    }
    if (!isHome(p, st.id)) opts.push({ label: "MAKE THIS YOUR HOME PORT", sub: `YARD PRICES -15% HERE, CREW SETTLE, THE CHRONICLE NAMES IT${p.homePort ? " (REPLACES " + (findStation(g.world, p.homePort)?.st.name.toUpperCase() ?? "?") + ")" : ""}`, action: () => { setHomePort(p, st.id); logEntry(g.world, `${st.name} is home port now`); g.toast(`${st.name.toUpperCase()} IS HOME. THE HARBOURMASTER WRITES IT DOWN.`); sfx.select(); flag(g, "homePort"); } });
    if (st.type === "research" && (p.cargo.relics ?? 0) > 0) opts.push({ label: "DONATE A RELIC TO THE MUSEUM", sub: "STANDING UP, A CARD WITH YOUR NAME UNDER THE GLASS", action: () => { const l = donateRelic(g.world, st, p.captainName ?? wire.getCallsign() ?? (p.shipName ? `the ${p.shipName}` : "an independent captain")); if (l) { g.toast(l); sfx.pickup(); flag(g, "donor"); } } });
    opts.push({ label: "REST A WHILE (TEN MINUTES OF SHIP TIME)", sub: "MARKETS BREATHE, TILLS FILL, THE SICK MEND, CREW SETTLE", action: () => {
      const lines = restAtDock(g.world);
      g.toast(lines[0] ?? "TEN MINUTES PASS. THE DECK HUMS. NOTHING BROKE."); for (const l of lines.slice(1)) g.toast(l);
      refreshPrices(st); g.autosave();
    } });
    if (!p.cat && st.type === "agri") {
      opts.push({ label: "ADOPT THE YARD CAT", sub: "150CR - CREW MORALE, AND SOMEONE TO TALK TO ABOARD", action: () => {
        if (p.credits < 150) return g.toast("NOT ENOUGH CREDITS");
        p.credits -= 150; const name = CAT_NAMES[(g.world.seed + st.id.length) % CAT_NAMES.length]; adoptCat(p, name, g.world.time);
        logEntry(g.world, `${name} came aboard at ${st.name}`); flag(g, "shipsCat");
        g.toast(`${name.toUpperCase()} WALKS UP THE RAMP AS IF IT WERE THEIRS. IT IS NOW.`); sfx.pickup();
      } });
    }
    for (const k of ["beacon", "depot"] as const) {
      const kit = INFRA_KITS[k];
      opts.push({ label: `${kit.name.toUpperCase()} (ABOARD ${(p.kits ?? {})[k] ?? 0})`, sub: `${kit.price}CR`, action: () => {
        if (p.credits < kit.price) return g.toast("NOT ENOUGH CREDITS");
        p.credits -= kit.price; (p.kits ??= {})[k] = ((p.kits ?? {})[k] ?? 0) + 1;
        g.toast(`${kit.name.toUpperCase()} CRATED. FLY TO A SYSTEM WITH NO STATION AND PRESS E TO PLANT IT.`);
        g.showHint("lighthouse", "DEAD SYSTEMS ONLY: NO STATION. TRAFFIC PAYS TOLLS; FLY BACK TO EMPTY THE TILL");
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
    const gev = galaxyEventAt(g.world, p.systemId);
    if (embargoed(g.world, this.station.factionId)) { const t = "EMBARGO - FUEL AND REPAIRS ONLY"; drawText(ctx, t, VW - textWidth(t) - 6, 26, PAL.danger); }
    else if (hasCharter(g.world, this.station.factionId)) { const t = `${faction(this.station.factionId).name.toUpperCase()} CHARTER - CONTRACTS +15%, YARD AT COST`; drawText(ctx, t, VW - textWidth(t) - 6, 26, PAL.gold); }
    else if (gev && (gev.kind === "festival" || gev.kind === "strike") && gev.stationId === this.station.id) { const t = gev.kind === "festival" ? "FESTIVAL WEEK - LUXURIES DEAR, TOURISTS PAY DOUBLE" : "DOCK STRIKE - FUEL AND REPAIRS COST DOUBLE"; drawText(ctx, t, VW - textWidth(t) - 6, 26, gev.kind === "festival" ? PAL.gold : PAL.warn); }
    else if (war) drawText(ctx, "SYSTEM AT WAR - PRICES UNSTABLE", VW - textWidth("SYSTEM AT WAR - PRICES UNSTABLE") - 6, 26, PAL.warn);
    else if (this.baseOwner) { const t = `[${this.baseOwner}] SQUADRON BASE${this.baseOwner === wire.getSquadron() ? " - HOME" : ""}`; drawText(ctx, t, VW - textWidth(t) - 6, 26, this.baseOwner === wire.getSquadron() ? PAL.gold : PAL.info); }
    else if (syndicateAt(g.world, this.station.id)) { const sy = syndicateAt(g.world, this.station.id)!; const t = `[${sy.tag}] ${sy.name.toUpperCase()} BASE (AI) - ${synStandingLabel(effectiveSynStanding(g.world, sy.tag))}`; drawText(ctx, t, VW - textWidth(t) - 6, 26, sy.color); }
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

  // What this base pays a premium for this week (syndicate or squadron base)
  demandHere(g: Game): { key: string; goods: string[]; label: string } | null {
    const sy = syndicateAt(g.world, this.station.id);
    if (sy) return { key: `syn:${sy.tag}`, goods: baseDemand(`syn:${sy.tag}`), label: `[${sy.tag}]` };
    if (this.baseOwner) return { key: `base:${this.baseOwner}`, goods: baseDemand(`base:${this.baseOwner}`), label: `[${this.baseOwner}]` };
    return null;
  }
  routeShare = 0; // credits owed to a squadron base treasury, flushed on undock

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
    const synHere = syndicateAt(g.world, st.id);
    const rep = (p.rep[st.factionId] ?? 0) + (patron && patron === wire.getSquadron() ? 25 : 0) + (synHere && effectiveSynStanding(g.world, synHere.tag) >= 30 ? 25 : 0);
    drawText(ctx, "COMMODITY", 8, top, PAL.greyDark);
    drawText(ctx, "BUY", 150, top, PAL.greyDark);
    drawText(ctx, "SELL", 190, top, PAL.greyDark);
    drawText(ctx, "STOCK", 235, top, PAL.greyDark);
    drawText(ctx, "HELD", 280, top, PAL.greyDark);
    drawText(ctx, "TREND", 320, top, PAL.greyDark);
    // the hint follows the cursor: what Enter will do to the highlighted row
    const selId = this.marketRows(g)[clamp(this.cursor, 0, Math.max(0, this.marketRows(g).length - 1))];
    const selHeld = selId ? (p.cargo[selId] ?? 0) : 0;
    drawText(ctx, selHeld > 0 ? "ENTER SELLS  SHIFT ALL" : "ENTER BUYS  SHIFT X10", 366, top, selHeld > 0 ? PAL.gold : PAL.greyDark);
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
      const heldN = p.cargo[id] ?? 0;
      drawText(ctx, `${heldN}`, 280, y, heldN > 0 ? PAL.gold : PAL.ui); // gold: Enter sells this
      const demHere = this.demandHere(g);
      const cr = crisisAt(g.world, st.id);
      if (cr && cr.commodityId === id) drawText(ctx, `CRISIS x${CRISIS_PREMIUM}`, 320, y, PAL.danger);
      else if (serialPremium(g.world, st.id, id) > 1) drawText(ctx, `GALNET x${serialPremium(g.world, st.id, id)}`, 320, y, PAL.gold);
      else if (demHere && demHere.goods.includes(id)) drawText(ctx, `WANTED +${Math.round(ROUTE_PREMIUM * 100)}%`, 320, y, PAL.gold);
      else if (c.rare) drawText(ctx, st.rare === id ? "ORIGIN" : "RARE", 320, y, st.rare === id ? PAL.info : PAL.gold);
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
      else { const dem = this.demandHere(g); if (dem) drawText(ctx, `${dem.label} BASE WANTS THIS WEEK: ${dem.goods.map((d) => commodity(d).name.toUpperCase()).join(", ")} AT +${Math.round(ROUTE_PREMIUM * 100)}% - A SHARE FEEDS THEIR TREASURY`, 8, ny + 27, PAL.gold); }
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
    { const spr = g.playerShip(); ctx.drawImage(spr, VW - 8 - spr.width, top + 9); } // the hull as she'll look, trim and all
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
      y += 9;
    }
    for (const c of p.haulers ?? []) {
      const a = findStation(g.world, c.from)?.st.name ?? "?", b = findStation(g.world, c.to)?.st.name ?? "?";
      drawText(ctx, `CHARTER ${c.name.toUpperCase()}: ${commodity(c.commodityId).name.toUpperCase()} ${a.toUpperCase()} > ${b.toUpperCase()} - ${c.trips} TRIPS, ${c.earned}CR EARNED, TILL ${Math.round(c.till)}CR, HULL ${c.health}%${c.raided ? `, RAIDED x${c.raided}` : ""} - R RELEASES`.slice(0, 118), 8, y, c.health < 40 ? PAL.warn : PAL.gold);
      y += 9;
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
      const so = storyObjective(g.world);
      if (so && (p.tutorial ?? -1) < 0) { drawText(ctx, `${(p.story ?? 0) < 7 ? "THE SIGNAL" : "THE MISSING CONVOY"} - ${so}`.slice(0, 100), 8, y, PAL.info); y += 10; }
      const cr = g.world.crisis;
      if (cr && cr.delivered < cr.need && g.world.time < cr.until) { const f = findStation(g.world, cr.stationId); drawText(ctx, `CRISIS: ${(f?.st.name ?? "?").toUpperCase()}, ${(f?.sys.name ?? "?").toUpperCase()} NEEDS ${cr.need - cr.delivered} ${commodity(cr.commodityId).name.toUpperCase()} - ${Math.max(0, Math.round((cr.until - g.world.time) / 60))}M LEFT, PAYS x${CRISIS_PREMIUM}`.slice(0, 104), 8, y, PAL.danger); y += 10; }
    }
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
    for (const c of p.crew) { const ao = arcObjective(g.world, c); if (ao) { drawText(ctx, `> ${ao}`.slice(0, 112), 12, y, PAL.gold); y += 9; } }
    const log = p.missions.filter((m) => m.accepted && !m.done);
    if (!log.length && !p.crew.some((c) => arcObjective(g.world, c))) drawText(ctx, "EMPTY", 12, y, PAL.greyDark);
    for (const m of log.slice(0, 4)) {
      const prog = m.killsNeeded ? ` (${m.kills}/${m.killsNeeded})` : m.kind === "ground" ? ` (${m.groundDone ?? 0}/${m.groundNeed ?? 1})` : m.shipTotal ? ` (SHIPMENT ${(m.shipDone ?? 0) + 1}/${m.shipTotal})` : m.escortDone ? " (DONE - RETURN)" : m.kind === "passenger" && m.mood !== undefined ? ` (MOOD ${Math.round(m.mood)}${m.passengerKind === "tourist" ? `, ${m.sightSeen ? "SIGHT SEEN" : "SIGHT PENDING"}` : ""}${m.demand ? ", WANTS " + commodity(m.demand).name.toUpperCase() : ""})` : "";
      drawText(ctx, `> ${m.title}${prog} - ${g.world.systems[m.targetSystemId].name}`, 12, y, PAL.uiDim);
      y += 9;
    }
  }

  drawBar(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const st = this.station;
    const p = g.world.player;
    drawText(ctx, "THE LOUNGE - TALK (ENTER) OR HIRE", 8, top, PAL.greyDark);
    const leaveHere = (p.shoreCrew ?? []).filter((s) => s.stationId === st.id);
    if (leaveHere.length) drawText(ctx, `ON LEAVE HERE: ${leaveHere.map((s) => s.member.name.toUpperCase()).join(", ")} (BACK ABOARD WHEN BERTHS ALLOW)`, 200, top, PAL.gold);
    let y = top + 12;
    let idx = 0;
    st.barPatrons.forEach((name, i) => {
      this.row(ctx, y + 2, idx === this.cursor);
      ctx.drawImage(g.portrait(name), 10, y - 2, 12, 12);
      const fr = friendsAt(g.world, st.id).find((c) => c.name === name);
      drawText(ctx, name + (fr ? " - FRIEND" : ""), 28, y, fr ? PAL.gold : PAL.white);
      drawText(ctx, fr ? `CAPTAIN OF THE ${fr.ship.toUpperCase()}, HELPED ${fr.helped} TIMES` : ["HAULER", "ENGINEER", "OFF-DUTY SECURITY", "PROSPECTOR", "DRIFTER"][i % 5], 28, y + 8, PAL.greyDark);
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
    if (this.fares.length) {
      drawText(ctx, `FARES (CABINS ${passengersAboard(p).length}/${passengerCap(p)}):`, 8, y, PAL.greyDark); y += 10;
      for (const f of this.fares) {
        const sel = idx === this.cursor;
        this.row(ctx, y, sel);
        drawText(ctx, `${f.notable ? "* " : ""}${f.title.toUpperCase()}  -  ${g.world.systems[f.targetSystemId].name.toUpperCase()}${f.demand ? "  (WANTS " + commodity(f.demand).name.toUpperCase() + ")" : ""}`, 12, y, f.notable ? PAL.gold : f.passengerKind === "fugitive" ? PAL.danger : PAL.ui);
        drawText(ctx, `+${f.reward}CR`, VW - textWidth(`+${f.reward}CR`) - 8, y, PAL.gold);
        y += 9;
        if (sel) { drawText(ctx, f.desc.toUpperCase().slice(0, 112), 12, y, PAL.greyDark); y += 9; }
        idx++;
      }
      y += 2;
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

  baseRows(g: Game): { kind: "fund" | "buy" | "upgrade" | "deposit" | "withdraw" | "info" | "back" | "treaty"; id?: string; treaty?: "pact" | "rivalry" | "none"; label: string; sub: string }[] {
    const p = g.world.player;
    const st = this.station;
    const tag = wire.getSquadron();
    const rows: { kind: "fund" | "buy" | "upgrade" | "deposit" | "withdraw" | "info" | "back" | "treaty"; id?: string; treaty?: "pact" | "rivalry" | "none"; label: string; sub: string }[] = [];
    if (!tag) return rows;
    const b = this.base;
    const war = g.world.synWar;
    if (b && b.stationId && war && !war.backed) {
      for (const side of [war.attacker, war.defender]) rows.push({ kind: "back", id: side, label: `DECLARE FOR [${side}] IN THE WAR AT ${g.world.systems[war.systemId].name.toUpperCase()}`, sub: "FRONT +10, YOUR WORK COUNTS 1.5X, SPOILS TO THE TREASURY" });
    }
    if (b && b.stationId) {
      if (b.stationId !== st.id) return rows;
      for (const u of wire.BASE_UPGRADES) {
        const have = b.upgrades.includes(u.id);
        rows.push({ kind: "upgrade", id: u.id, label: `${have ? "FITTED: " : "FIT "}${u.name.toUpperCase()}`, sub: have ? u.desc.toUpperCase() : `${u.cost}CR - ${u.desc.toUpperCase()}` });
      }
      rows.push({ kind: "fund", label: "FUND THE TREASURY", sub: `NOW ${b.treasury}CR` });
      // treaties with the other squadrons that hold a base
      for (const o of wire.allBases()) {
        if (o.tag === tag) continue;
        const mine = b.treaties?.[o.tag];
        const between = wire.treatyBetween(tag, o.tag);
        const state = between === "pact" ? "PACT" : between === "rivalry" ? "RIVALRY" : between === "offered" ? (mine === "pact" ? "PACT OFFERED" : "THEY OFFER A PACT") : "NO TREATY";
        if (mine) rows.push({ kind: "treaty", id: o.tag, treaty: "none", label: `END ${mine.toUpperCase()} WITH [${o.tag}]`, sub: `${state} - ${o.stationName.toUpperCase()}, ${o.systemName.toUpperCase()}` });
        else {
          rows.push({ kind: "treaty", id: o.tag, treaty: "pact", label: `OFFER [${o.tag}] A PACT`, sub: `${state} - BOTH SIDES SIGN: SELL AT +5% AT EACH OTHER'S BASE, THEIR WANTED GOODS PAY YOU TOO` });
          rows.push({ kind: "treaty", id: o.tag, treaty: "rivalry", label: `DECLARE [${o.tag}] A RIVAL`, sub: `${state} - THEIR BASE CHARGES YOUR MEMBERS +10%; EVERY WIRE HEARS IT` });
        }
      }
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
    const syn = syndicateAt(g.world, st.id);
    if (syn) {
      const standing = synStanding(g.world, syn.tag);
      drawText(ctx, `[${syn.tag}] ${syn.name.toUpperCase()} - AI SYNDICATE BASE`, 8, top, syn.color);
      const eff = effectiveSynStanding(g.world, syn.tag);
      drawText(ctx, `STYLE ${syn.style.toUpperCase()}   TREASURY ${syn.treasury}CR   YOUR STANDING ${standing} (${synStandingLabel(eff)}${eff > standing ? " VIA ALLY" : ""})`, 8, top + 10, PAL.grey);
      drawText(ctx, "AFFILIATE (30): BUY HERE LIKE AN ALLY.  PARTNER (60): +10% ON THEIR WANTED GOODS.  CONTRACTS ON THE MISSIONS TAB.", 8, top + 19, PAL.greyDark);
      const dem = baseDemand(`syn:${syn.tag}`);
      drawText(ctx, `WANTED THIS WEEK (+${Math.round(ROUTE_PREMIUM * 100)}%): ${dem.map((d) => commodity(d).name.toUpperCase()).join(", ")}`, 8, top + 31, PAL.gold);
      const partners = syn.partners.map((pid) => findStation(g.world, pid)).filter((x) => !!x).map((f) => `${f!.st.name.toUpperCase()} (${f!.sys.name.toUpperCase()})`);
      const holds = (syn.holdings ?? []).map((h) => findStation(g.world, h)).filter((x) => !!x).map((f) => f!.st.name.toUpperCase());
      drawText(ctx, `TRADE PARTNERS: ${partners.join(", ") || "NONE"}${holds.length ? `   HOLDINGS: ${holds.join(", ")}` : ""}${syn.stationId !== st.id ? "   (THIS IS A HOLDING; HOME IS " + (findStation(g.world, syn.stationId)?.st.name.toUpperCase() ?? "?") + ")" : ""}`.slice(0, 118), 8, top + 40, PAL.info);
      const rivals = syn.rivals.map((t) => syndicateByTag(g.world, t)).filter((x) => !!x).map((r) => `[${r!.tag}] ${r!.name.toUpperCase()}`);
      drawText(ctx, `FEUDS: ${rivals.join(", ") || "NONE"}`, 8, top + 49, PAL.danger);
      const allies = synAllies(g.world, syn.tag);
      const rel = (g.world.syndicates ?? []).filter((o) => o.tag !== syn.tag).map((o) => `[${o.tag}] ${synRelation(g.world, syn.tag, o.tag) >= 0 ? "+" : ""}${synRelation(g.world, syn.tag, o.tag)}`).join("  ");
      drawText(ctx, `ALLIES: ${allies.length ? allies.map((t) => `[${t}]`).join(" ") : "NONE"}   RELATIONS: ${rel}`, 8, top + 58, allies.length ? PAL.good : PAL.grey);
      drawText(ctx, "YOUR CONTRACTS MOVE THESE: BOUNTIES SOUR THEIR TARGET, HONEST RUNS WARM SYNDICATES YOU ALREADY WORK FOR.", 8, top + 70, PAL.greyDark);
      drawText(ctx, "AI SYNDICATES ARE PART OF THE GALAXY, NOT PLAYERS. THEY NEVER APPEAR ON THE PILOT BOARDS.", 8, top + 82, PAL.greyDark);
      return;
    }
    if (this.baseOwner && this.baseOwner !== tag) {
      drawText(ctx, `${st.name.toUpperCase()} IS THE [${this.baseOwner}] SQUADRON BASE`, 8, top, PAL.info);
      drawText(ctx, "SQUADRON BASES BELONG TO THE PILOTS WHO POOLED THE CREDITS. FIND YOUR OWN, OR JOIN THEIRS.", 8, top + 12, PAL.greyDark);
      { const t = tag ? wire.treatyBetween(tag, this.baseOwner!) : null; if (t) drawText(ctx, t === "pact" ? `[${tag}] AND [${this.baseOwner}] HOLD A PACT: YOU SELL HERE AT +5%` : t === "rivalry" ? `[${tag}] AND [${this.baseOwner}] ARE RIVALS: THEY CHARGE YOU MORE HERE` : `A PACT IS ON THE TABLE BETWEEN [${tag}] AND [${this.baseOwner}]`, 8, top + 24, t === "pact" ? PAL.good : t === "rivalry" ? PAL.danger : PAL.gold); }
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
      { const tr = Object.entries(b.treaties ?? {}); const incoming = wire.allBases().filter((o) => o.tag !== tag && o.treaties?.[tag] && !b.treaties?.[o.tag]).map((o) => `[${o.tag}] ${o.treaties![tag] === "pact" ? "OFFERS A PACT" : "CALLS YOU RIVALS"}`); if (tr.length || incoming.length) drawText(ctx, `TREATIES: ${tr.map(([t, k]) => `[${t}] ${k.toUpperCase()}${wire.treatyBetween(tag, t) === "pact" ? " (SIGNED)" : k === "pact" ? " (OFFERED)" : ""}`).join("  ")}${incoming.length ? "   " + incoming.join("  ") : ""}`.slice(0, 118), 8, top + 21, PAL.gold); }
      drawText(ctx, "DOCK THERE TO USE THE VAULT AND FIT UPGRADES.", 8, top + 30, PAL.greyDark);
      const war = g.world.synWar;
      if (war) {
        drawText(ctx, war.backed ? `WAR AT ${g.world.systems[war.systemId].name.toUpperCase()}: [${war.backedBy}] BACKS [${war.backed}] - FRONT ${war.score > 0 ? "+" : ""}${war.score}` : `SYNDICATE WAR AT ${g.world.systems[war.systemId].name.toUpperCase()} - DECLARE A SIDE BELOW`, 8, top + 33, PAL.warn);
        rows.forEach((r, i) => { const y = top + 45 + i * 18; this.row(ctx, y, i === this.cursor); drawText(ctx, r.label, 8, y, PAL.white); drawText(ctx, r.sub, 8, y + 9, PAL.greyDark); });
      }
      return;
    }
    drawText(ctx, b && b.stationId ? `[${tag}] SQUADRON BASE - ${st.name.toUpperCase()}` : `FOUND A [${tag}] BASE`, 8, top, PAL.gold);
    drawText(ctx, b && b.stationId ? `TREASURY ${b.treasury}CR   VAULT ${Object.values(b.vault).reduce((a, v) => a + v, 0)}/${b.upgrades.includes("vault") ? 600 : 200}   HALF-PRICE SERVICES FOR MEMBERS` : `POOL CREDITS, THEN BUY A CIVILIAN STATION. THIS ONE: ${wire.basePrice(st.type, st.military) ? wire.basePrice(st.type, st.military) + "CR" : "MILITARY, NOT FOR SALE"}`, 8, top + 10, PAL.grey);
    if (b && b.stationId === st.id && g.world.synWar) { const war = g.world.synWar; drawText(ctx, war.backed ? `WAR: [${war.backedBy}] BACKS [${war.backed}] AT ${g.world.systems[war.systemId].name.toUpperCase()} - FRONT ${war.score > 0 ? "+" : ""}${war.score}` : `SYNDICATE WAR AT ${g.world.systems[war.systemId].name.toUpperCase()} - DECLARE A SIDE (ROWS ABOVE)`, 8, VH - 93, PAL.warn); }
    if (b && b.stationId === st.id) drawText(ctx, `WANTED THIS WEEK (+${Math.round(ROUTE_PREMIUM * 100)}%, 10% TO THE TREASURY): ${baseDemand(`base:${tag}`).map((d) => commodity(d).name.toUpperCase()).join(", ")}`, 8, VH - 84, PAL.gold);
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

  drawCodex(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const p = g.world.player;
    const cx = Object.entries(p.codex ?? {});
    drawText(ctx, `CODEX (${cx.length} ENTRIES) - C FOR CARTOGRAPHICS`, 8, top, PAL.info);
    const groups: [string, string, string][] = [["flora:", "FLORA", "SCANNED WITH THE ROVER (HOLD V). EACH NEW SPECIES PAYS 120 DATA."], ["fauna:", "FAUNA", "MET ON THE GROUND. WATCH, DON'T POKE."], ["biome:", "BIOMES", "WORLDS DRIVEN ON. A NEW BIOME PAYS 120 DATA."], ["signal:", "SIGNALS", "HEARD ON NO KNOWN BAND."], ["wonder:", "WONDERS", "SEEN WITH YOUR OWN EYES. A FIRST SIGHT PAYS 400 DATA."]];
    let y = top + 12;
    for (const [prefix, title, blurb] of groups) {
      const items = cx.filter(([k]) => k.startsWith(prefix));
      drawText(ctx, `${title} (${items.length})`, 8, y, PAL.ui);
      drawText(ctx, blurb, 110, y, PAL.greyDark); y += 9;
      if (!items.length) { drawText(ctx, "- NONE YET", 14, y, PAL.greyDark); y += 9; }
      items.slice(0, 6).forEach(([k, n], i) => { drawText(ctx, `${k.slice(prefix.length).toUpperCase()} x${n}`, 14 + (i % 3) * 156, y + Math.floor(i / 3) * 9, PAL.grey); });
      y += 9 * Math.max(1, Math.ceil(Math.min(6, items.length) / 3)) + 4;
      if (items.length > 6) { drawText(ctx, `+${items.length - 6} MORE`, 14, y - 4, PAL.greyDark); }
    }
    const firsts = Object.values(p.firsts ?? {}).filter((c) => c === wire.getCallsign()).length;
    drawText(ctx, `FIRST DISCOVERIES ${firsts}   REGIONS CHARTED ${Object.values(p.ground ?? {}).filter((s) => s.charted).length}   ENCOUNTERS ${Object.values(p.encounters ?? {}).reduce((a, b) => a + b, 0)}   LIVES SAVED ${p.lives ?? 0}`, 8, y + 2, PAL.gold);
  }

  drawSurvey(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    if (this.surveyView === "codex") { this.drawCodex(g, ctx, top); return; }
    const p = g.world.player;
    const w = g.world;
    const st = this.station;
    drawText(ctx, "UNIVERSAL CARTOGRAPHICS - C FOR THE CODEX", 8, top, PAL.info);
    const worth = Math.round(p.expData ?? 0);
    this.row(ctx, top + 12, true);
    drawText(ctx, `SELL EXPLORATION DATA: ${worth}CR${st.type === "research" ? " x1.25 HERE" : ""}`, 8, top + 12, worth > 0 ? PAL.white : PAL.grey);
    drawText(ctx, "ENTER", VW - textWidth("ENTER") - 8, top + 12, PAL.gold);
    let y = top + 28;
    drawText(ctx, "CAREERS:", 8, y, PAL.greyDark); y += 10;
    for (const kind of ["explorer", "trader", "miner", "rescuer"] as const) {
      const r = rankOf(p, kind);
      const v = rankValue(p, kind);
      const unit = kind === "miner" ? " UNITS" : kind === "rescuer" ? " PTS" : "CR";
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

  drawLog(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const p = g.world.player;
    const log = [...(p.log ?? [])].reverse();
    drawText(ctx, `CAPTAIN'S LOG (${log.length}) - L FOR ACHIEVEMENTS - X EXPORTS THE CHRONICLE - UP/DOWN TO SCROLL`, 8, top, PAL.info);
    if (!log.length) { drawText(ctx, "NOTHING WORTH WRITING DOWN YET. FLY SOMEWHERE. HELP SOMEONE.", 8, top + 12, PAL.greyDark); return; }
    const first = Math.min(this.cursor, Math.max(0, log.length - 16));
    log.slice(first, first + 16).forEach((e, i) => {
      const y = top + 12 + i * 10;
      drawText(ctx, `T+${Math.floor(e.t / 60)}M`, 8, y, PAL.greyDark);
      drawText(ctx, e.text.toUpperCase().slice(0, 100), 44, y, i === 0 && first === 0 ? PAL.white : PAL.grey);
    });
  }

  drawRecord(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    if (this.recordView === "log") { this.drawLog(g, ctx, top); return; }
    const p = g.world.player;
    const w = g.world;
    const have = new Set(p.achievements ?? []);
    drawText(ctx, `SERVICE RECORD${w.hardcore ? " - HARDCORE" : ""} - L FOR THE CAPTAIN'S LOG - X EXPORTS THE CHRONICLE`, 8, top, PAL.info);
    const stats = [
      `KILLS ${p.kills}`, `DISCOVERIES ${p.discoveries}`, `ARCS ${Object.values(p.arcs).reduce((a, b) => a + b, 0)}/15`,
      `CREDITS ${p.credits}`, `CREW ${p.crew.length}`, `HULL ${hull(p.hullId).name.toUpperCase()}`,
      `TIME ${Math.floor(w.time / 60)}M`, `ACHIEVEMENTS ${have.size}/${ACHIEVEMENTS.length}`,
      `EXPLORER ${rankOf(p, "explorer").title}`, `TRADER ${rankOf(p, "trader").title}`, `MINER ${rankOf(p, "miner").title}`, `RESCUER ${rankOf(p, "rescuer").title} (${rescuePoints(p)})`,
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
    {
      const pr = stationProfile(g.world, this.station);
      drawText(ctx, `${this.station.name.toUpperCase()} - POP. ${pr.population.toLocaleString()} - FOUNDED ${pr.founded}`, 8, top, PAL.grey);
      drawText(ctx, `KNOWN FOR ${pr.knownFor.toUpperCase()}. ALSO: ${pr.quirk.toUpperCase()}.`.slice(0, 112), 8, top + 9, PAL.greyDark);
      const bl = stationBulletin(g.world, this.station);
      drawText(ctx, "LOCAL BULLETIN", 8, top + 20, PAL.greyDark);
      bl.slice(0, 4).forEach((l, i) => drawText(ctx, l.toUpperCase().slice(0, 112), 8, top + 29 + i * 8, l.startsWith("URGENT") || l.startsWith("STRIKE") ? PAL.danger : l.startsWith("FESTIVAL") ? PAL.gold : PAL.grey));
      top += 29 + Math.min(4, bl.length) * 8 + 6;
    }
    { const oc = occasionFor(); drawText(ctx, `TODAY: ${oc.name} - ${oc.effect}`, 8, top, PAL.gold); top += 9; }
    if (this.station.museum?.length) { const m = this.station.museum[this.station.museum.length - 1]; drawText(ctx, `MUSEUM: ${this.station.museum.length} PIECE${this.station.museum.length > 1 ? "S" : ""} - LATEST ${m.item.toUpperCase()}, DONATED BY ${m.by.toUpperCase()}`.slice(0, 112), 8, top, PAL.gold); top += 9; }
    const mail = g.world.player.mail ?? [];
    if (mail.length) {
      drawText(ctx, `LETTERS (${mail.length})`, 8, top, PAL.gold);
      let ly = top + 9;
      for (const m of mail.slice(-2).reverse()) { drawText(ctx, `FROM ${m.from.toUpperCase()}: ${m.text.toUpperCase()}`.slice(0, 112), 8, ly, PAL.grey); ly += 8; }
      top = ly + 4;
    }
    const serial = serialLines(g.world);
    if (serial) {
      drawText(ctx, `GALNET SERIAL: ${serial.title} - ${serial.where.toUpperCase()}`, 8, top, PAL.gold);
      let sy = top + 9;
      const parts = serial.parts.length ? serial.parts : ["(THE FIRST PART IS ON ITS WAY)"];
      parts.forEach((l, i) => { drawText(ctx, `${i + 1}. ${l.toUpperCase()}`.slice(0, 112), 8, sy, PAL.grey); sy += 8; });
      if (serial.hook) { drawText(ctx, `> ${serial.hook.toUpperCase()}`.slice(0, 112), 8, sy, PAL.gold); sy += 8; }
      top = sy + 5;
    }
    drawText(ctx, "GALNET NEWS FEED", 8, top, PAL.info);
    let y = top + 14;
    for (const n of g.world.news.slice(0, serial ? 3 : 7)) {
      drawText(ctx, n.headline.slice(0, 60), 8, y, PAL.white); y += 9;
      drawText(ctx, n.body.slice(0, 112), 8, y, PAL.greyDark); y += 13;
    }
  }
}

import * as spriteMod from "../gfx/sprites";

const BAR_LINES: ((g: Game, st: StationDef) => string)[] = [
  (g, st) => {
    const fr = friendsAt(g.world, st.id)[0];
    if (fr) {
      const unseen = (g.world.wonders ?? []).filter((x) => !x.seen)[0];
      if (unseen && Math.random() < 0.5) { (g.world.player.flags ??= {})[`rumour:${unseen.id}`] = true; return `${fr.name}: 'Between us? ${unseen.name}, out in ${g.world.systems[unseen.systemId]?.name ?? "the dark"}. Go before the tour ships find it.'`; }
      return `${fr.name}: 'The ${fr.ship} flies again because of you. Sit. This one's on me. And if you ever need a berth for a night, mine's open.'`;
    }
    const c = g.world.crisis;
    if (c && c.delivered < c.need && g.world.time < c.until) { const f = findStation(g.world, c.stationId); return `${f?.st.name ?? "Some station"} in ${f?.sys.name ?? "the dark"} is begging for ${commodity(c.commodityId).name.toLowerCase()}. Paying stupid money. Someone should go.`; }
    const e = g.world.galaxyEvent;
    if (e) { const sys = g.world.systems[e.systemId]; return e.kind === "comet" ? `Comet's crossing ${sys.name}. Every rock in that belt is lit up. Prospectors are already fighting over it.` : e.kind === "flare" ? `Don't take a scoop into ${sys.name} this week. The star's throwing a tantrum.` : e.kind === "festival" ? `Festival at ${findStation(g.world, e.stationId ?? "")?.st.name ?? sys.name}. Take the tourists, take the luxuries, take the money.` : `Dockers are out at ${findStation(g.world, e.stationId ?? "")?.st.name ?? sys.name}. Fill up before you go.`; }
    const war = g.world.synWar;
    if (war) return `The [${war.attacker}] and [${war.defender}] are shooting at each other over ${g.world.systems[war.systemId].name}. Both sides pay for help. Both sides remember.`;
    const sy = g.world.syndicates?.[0];
    return sy ? `[${sy.tag}] ${sy.name} run their convoys out of ${g.world.systems[sy.systemId].name}. Decent work, if you don't mind who you work for.` : "Quiet cycle.";
  },
  (g, st) => {
    const sys = Object.values(g.world.systems).find((s) => s.stations.includes(st))!;
    const link = sys.links[0] ? g.world.systems[sys.links[0]].name : "the next system";
    return `Word is the corsairs are thick around ${link} lately. Fly armed or fly fast.`;
  },
  (g) => {
    const unseen = (g.world.wonders ?? []).filter((x) => !x.seen);
    const wd = unseen.length ? unseen[Math.floor(g.world.time / 20) % unseen.length] : null;
    if (wd) { (g.world.player.flags ??= {})[`rumour:${wd.id}`] = true; return `A prospector swears there's something out in ${g.world.systems[wd.systemId]?.name ?? "the dark"} you have to see with your own eyes. Calls it ${wd.name}. Won't say more. Won't stop grinning.`; }
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
