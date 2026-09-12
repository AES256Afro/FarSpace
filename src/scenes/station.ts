import { openJourney } from "./journey";
import { openWorkshop } from "./workshop";
import { ReaderOverlay, type ReaderScene } from "./reader";
import { stationRecords, type StationRecord } from "./stationrecords";
import { StationList } from "./stationlist";
import { clippedText, contains, mapButton, type Rect } from "../core/mapview";
import { deliverRecovery, hullSalePrice } from "../core/shiprecovery";
import { recordOffence, closeLawCases } from "../core/law";
import { loanHullChangeReason, loanReturnReason, loanSummary, plotLoanDepot, returnServiceCutter } from "../core/serviceloan";
import { beginDockVisit, currentDockVisit, type DockVisit } from "../core/docking";
import type { World, Charter } from "../world";
import { fittedHullStats, hullTransferReason, refreshFittedStats, rememberYardFittings } from "../world";
import { plotServiceOrder, recordServiceFareDelivery, serviceAudienceAt, serviceObjective, syncServiceFares } from "../core/service";
// Station scene: docked services — market, shipyard, ships, missions, bar (crew), storage, news.

import { ask, confirmBox } from "../core/dialog";
import { Game, Scene, VW, VH } from "../game";
import { singerBoardingReason } from "../core/singers";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { RNG, hashStr } from "../core/rng";
import { clamp } from "../core/mathx";
import { commodity, faction } from "../data/data";
import { HULLS, hull, SERVICE_CUTTER, type HullDef } from "../data/hulls";
import { ROLE_INFO, CrewMember, RETIRE_DOCKS, LEAVE_DOCKS, roleLabel } from "../data/crew";
import { councilAudienceAt, councilObjective, plotCouncilMandate } from "../core/council";
import { beginLastLeg, lastLegAtPort, lastLegDestination } from "../core/lastleg";
import type { LettersScene } from "./letters";
import {
  StationDef, StoredShip, Mission, genMissionsFor, cargoUsed, addCargo, removeCargo, findStation,
  buyPrice, sellPrice, rareSellPrice, refreshPrices, missionDeliverable, adjustRep, repLabel, missionTier,
  crewWages, genCrewCandidate, applyHull, crewRecover, crewTreat, crewFallsIll, collectShoreCrew, retireCrew, sendOnLeave, berthsUsed, servicePrice, serviceHull, WEAR_SERVICE_FROM, crewBonus, genFares, settlePassengers, logSight, passengerPay, passengersAboard, passengerCap, INFRA_KITS, restAtDock, adoptCat, CAT_NAMES, FURNISHINGS, tickBonds, feuds, shiftBond, chronicleText, collectCharters, tickMail, tickAlumniMail, catGift, friendsAt, helpCaptain, rivalTakesFare, askRideAlong, tickRideAlong, RIDE_ALONG_DOCKS, setHomePort, isHome, donateRelic, hullHistoryFor, notableOutcome, ledger, ledgerAround, LEDGER_LABELS, dockingsAt, OLD_HAND_AT, hireCharter, releaseCharter, CHARTER_PRICE, CHARTER_CAP, CHARTER_CUT, pushEvent, ARCS, dailyContract, dailyKey, rankOf, rankValue, RANK_TITLES, communityGoal, blackMarket, syndicateAt, synStanding, synStandingLabel, adjustSynRep, syndicateByTag, baseDemand, ROUTE_PREMIUM, effectiveSynStanding, shiftRelation, synAllies, synRelation, warContribute, backWar, crisisAt, CRISIS_PREMIUM, logEntry, galaxyEventAt, rescuePoints, stationProfile, stationBulletin, embargoed, hasCharter, RACE_GATES, raceHolder, postDelivered, captainNickname, charterRoute, tickWorld, signGuestbook, regattaObjective, buyStake, collectStake, stakeDividend, stakePrice, totalShares, hasSpecialty, crewOwnHull, OWN_HULL_CREW_FEE, favourFor, favourDone, resolveBorder, pushInfluence, weekKey, borderStanding, replyToLetter, borderContest, collectRemoteStakes, lanesReport, isFriend, isRival, hangPicture, leaveLostItem, tickLostProperty, berthedCaptains, stardate, envoyOutcome, patientOutcome, beltRate, isBeltStation, receptionDue, receptionHeld, legSummary, newLeg, commandRank, registry, grievanceDue, grievanceHeard, spinOutageDue, spinOutageSeen, crewXp, secessionAt, inspectionDue, inspectionScore, beltGain, BELT_FREEMAN_AT, inquiryDue, firstOfficer, birthdaysDue, prisonerOutcome, transferRequest, droughtAt, shipVoiceName, dedication, anniversaryDue, leavePair, fleetReviewAt, rivalOf, commandOffer } from "../world";
import { ACHIEVEMENTS } from "../data/achievements";
import { MODULES, hasModule, moduleDef } from "../data/modules";
import { BLUEPRINTS, MATERIALS, engGrade, nextCost, canAfford, upgrade } from "../data/engineering";
import { flag } from "../core/achievements";
import type { GalaxyEvent } from "../world";
import { presence } from "../core/presence";
import type { Encounter } from "../data/encounters";
import type { EncounterScene } from "./encounter";
import { wrap } from "./encounter";
import { CREW_LINES } from "../data/crew";
import { storyObjective } from "../core/story";
import { arcFor, offerArc, arcObjective } from "../core/crewarcs";
import { serialMissionFor, serialRecruitFor, serialPremium, serialLines } from "../data/serials";
import { isOccasion, occasionFor } from "../data/occasions";
import { sfx } from "../core/sfx";
import * as wire from "../core/wire";
import { stationHour, clockText, tannoyLines, hoursRate } from "../data/tannoy";
import { dockhandLines } from "../data/dockhand";
import { weeklyIssue, myVote, voteResult, castVote, voteMods } from "../data/votes";
import { schoolOffer, schoolAccepted } from "../core/flightschool";
import { drawTutorial, tutorialActive, tutorialText, tutorialDetails } from "../core/tutorial";
import { music } from "../core/music";

type ShipRow = { kind: "market"; hull: HullDef } | { kind: "parked"; ship: StoredShip } | { kind: "remote"; ship: StoredShip } | { kind: "working"; charter: Charter };

type YardOption = { id: string; label: string; sub: string; action: () => void };
const PREV = { x: 8, y: 227, w: 48, h: 15 }, NEXT = { x: 62, y: 227, w: 48, h: 15 };
const DETAILS = { x: 200, y: 227, w: 94, h: 15 }, WORKSHOP = { x: 300, y: 227, w: 174, h: 15 };
const RUN = { x: 8, y: 245, w: 132, h: 14 };
const SELL_DATA = { x: 8, y: 66, w: 464, h: 15 };
const LIST_PAGES: Record<string, number> = { MARKET: 12, SHIPYARD: 18, SHIPS: 7, MISSIONS: 7, BAR: 7, STORAGE: 12, ENGINEER: 9, BASE: 10, NEWS: 6, WIRE: 6, SURVEY: 6, RECORD: 6 };
const TABS = ["MARKET", "SHIPYARD", "SHIPS", "MISSIONS", "BAR", "SURVEY", "ENGINEER", "STORAGE", "BASE", "NEWS", "WIRE", "RECORD"] as const;

export class StationScene implements Scene {
  touchMode = "menu" as const;
  tab = 0;
  cursor = 0;
  list = new StationList();
  transactionList = this.list;
  documentLists = new Map<string, StationList>();
  documentIdentity = new StationList();
  activeDocument = "";
  info?: ReaderOverlay;
  get pausesVoyage(): boolean { return !!this.info; }
  boardMissions: Mission[] = [];
  barLine = "";
  candidates: CrewMember[] = [];
  fares: Mission[] = [];
  station!: StationDef;
  returnTo: "flight" | "stationwalk" = "flight";
  rowBoxes: [number, number][] = [];
  visit: DockVisit | null = null;
  visitWorld: World | null = null;
  wireEvents: wire.WireEvent[] = [];
  boards: Record<string, wire.BoardEntry[]> = {};
  wireLoaded = false;

  enter(g: Game): void {
    const found = findStation(g.world, g.world.player.dockedAt!);
    const visit = currentDockVisit(g.world);
    if (!found || !visit) { g.setScene("flight"); return; }
    if (this.visitWorld === g.world && this.visit === visit && this.station === found.st) {
      if (this.presentPortAudience(g)) g.autosave();
      return;
    }
    this.list = new StationList(); this.transactionList = this.list; this.documentLists.clear(); this.documentIdentity = new StationList(); this.activeDocument = ""; this.onSceneLeave();
    this.visitWorld = g.world; this.visit = visit;
    this.station = found.st;
    { const recovered = deliverRecovery(g.world, this.station.id); if (recovered) { g.toast(`HULL RECOVERED. SHIPS TAB: KEEP IT OR X TO SELL FOR ${hullSalePrice(recovered)}CR.`); g.autosave(); } }
    if (serviceAudienceAt(g.world, this.station.id)) g.showHint(`service-office:${this.station.id}`, "SERVICE LIAISON: P WALKS THE DECK; E AT THE HARBOURMASTER COLLECTS THE ACCOUNT.");
    if (this.station.military && this.station.factionId !== "vex") g.showHint("service-office", "SERVICE CAREERS: P WALKS THE DECK. THE SERVICE OFFICE IS BETWEEN MARKET AND HARBOURMASTER.");
    if (councilAudienceAt(g.world, this.station.id)) g.showHint(`council-office:${this.station.id}`, "THE COUNCIL'S INNER OFFICE. P WALKS THE DECK; E AT THE HARBOURMASTER PRESENTS THE REQUEST.");
    this.tab = 0;
    this.cursor = 0;
    this.returnTo = "flight";
    const p = g.world.player;
    const rng = new RNG((g.world.seed ^ this.station.id.length * 2711 ^ Math.floor(visit.startedAt / 60)) >>> 0);
    this.boardMissions = genMissionsFor(g.world, this.station, rng);
    // today's galaxy-wide contract, unless already done or already carried
    const daily = dailyContract(g.world);
    if (p.dailyDone !== dailyKey() && !p.missions.some((m) => m.id === daily.id)) this.boardMissions.unshift(daily);
    { const sm = serialMissionFor(g.world, this.station.id); if (sm) this.boardMissions.unshift(sm); }
    { const offer = schoolOffer(g.world, this.station.id); if (offer) this.boardMissions.unshift(offer); }
    this.candidates = [];
    for (let i = 0; i < rng.int(1, 3); i++) this.candidates.push(genCrewCandidate(rng.fork(i + 1)));
    { const role = serialRecruitFor(g.world, this.station.id); if (role && !p.flags?.[`serialHire:${this.station.id}`]) { const c = genCrewCandidate(rng.fork(99)); c.role = role; c.skill = 3; c.loyalty = 2; c.wage = ROLE_INFO[role].baseWage * 3; c.trait = "tells stories about the Steady Hand"; this.candidates.unshift(c); } }
    this.fares = genFares(g.world, this.station, rng.fork(77));
    if (!visit.settled) { const line = rivalTakesFare(g.world, this.fares, rng.fork(78)); if (line) g.toast(line); }
    for (const fr of friendsAt(g.world, this.station.id)) if (!this.station.barPatrons.includes(fr.name)) this.station.barPatrons = [fr.name, ...this.station.barPatrons].slice(0, 4);
    this.barLine = "";
    if (!visit.settled && isOccasion("market") && (p.flags ?? {})[`marketday:${this.station.id}:${dailyKey()}`] !== true) { (p.flags ??= {})[`marketday:${this.station.id}:${dailyKey()}`] = true; for (const id of Object.keys(this.station.stock)) if (!id.startsWith("r_")) this.station.stock[id] = Math.round((this.station.stock[id] ?? 0) * 1.25); }
    refreshPrices(this.station);
    void wire.fetchSquadronData();
    this.loadPortData(g);
    if (visit.settled) { if (this.presentPortAudience(g)) g.autosave(); return; }
    visit.settled = true; visit.portAudiencePending = true;
    if (p.ious?.length) { for (const iou of p.ious) { p.credits += iou.credits; g.toast(iou.text); } p.ious = []; sfx.pickup(); }
    { const bl = resolveBorder(g.world); if (bl) { g.toast(bl); sfx.select(); const last = (g.world.borderLog ?? []).slice(-1)[0]; if (last && last.yours > 0) void wire.post("politics", `${last.flipped ? "helped flip" : "helped hold"} ${g.world.systems[last.systemId]?.name ?? "a system"} on the border (push ${last.yours})`, g.world.systems[p.systemId].name); } }
    if (p.cat && p.catAway && p.catAway !== this.station.id && Math.random() < 0.3) { const from = findStation(g.world, p.catAway)?.st.name ?? "somewhere"; p.catAway = null; g.toast(`A HAULER OUT OF ${from.toUpperCase()} HANDS OVER A CRATE WITH AIR HOLES. ${p.cat.name.toUpperCase()} IS NOT SPEAKING TO YOU.`); logEntry(g.world, `${p.cat.name} came home in a crate from ${from}`); sfx.purr(); }
    { const d = collectStake(g.world, this.station); if (d) { g.toast(`DIVIDEND ON YOUR ${p.stakes?.[this.station.id]} SHARES IN ${this.station.name.toUpperCase()}: +${d}CR`); sfx.pickup(); } }
    { const r = collectRemoteStakes(g.world, this.station.id); if (r.total) { g.toast(`THE POST BRINGS DIVIDEND CHEQUES FROM ${r.n} OTHER STATION${r.n > 1 ? "S" : ""}: +${r.total}CR`); } }

    if (p.evacuees && p.evacuees.n > 0) { const pay = p.evacuees.n * (p.evacuees.from === "wounded" ? 200 : 150); if (p.evacuees.from === "wounded") p.lives = (p.lives ?? 0) + p.evacuees.n; logEntry(g.world, `Handed ${p.evacuees.n} survivors over at ${this.station.name}`); p.credits += pay; adjustRep(g.world, this.station.factionId, 4); g.toast(`${p.evacuees.n} SURVIVORS FROM THE ${p.evacuees.from.toUpperCase()} HANDED OVER +${pay}CR`); p.evacuees = null; flag(g, "lifeboat"); sfx.pickup(); }
    if (g.scenes.flight && (g.scenes.flight as unknown as { towing: unknown }).towing) {
      const fs = g.scenes.flight as unknown as { towing: { x: number; y: number; hull: number } | null };
      const st = this.station; const sx = Math.cos(st.angle) * st.orbit, sy = Math.sin(st.angle) * st.orbit;
      if (fs.towing && fs.towing.hull > 0 && Math.hypot(fs.towing.x - sx, fs.towing.y - sy) < 260) { p.credits += 550; adjustRep(g.world, st.factionId, 6); p.tows = (p.tows ?? 0) + 1; { const l = helpCaptain(g.world, (fs.towing as { name?: string }).name, "tow", new RNG((g.world.seed ^ Math.floor(g.world.time * 59)) >>> 0)); if (l) g.toast(l); } g.toast("TOW COMPLETE - THE YARD TAKES THE FREIGHTER +550CR"); flag(g, "tug"); void wire.post("rescue", "towed a disabled freighter into dock", g.world.systems[p.systemId].name); }
      fs.towing = null;
    }
    if (p.warPayout && p.warPayout.value > 0) {
      const wp = p.warPayout; p.warPayout = null;
      void wire.baseActionFor(wp.tag, "war", { value: wp.value }).then((ok) => { if (ok) g.toast(`WAR SPOILS: +${wp.value}CR TO THE [${wp.tag}] TREASURY`); });
    }
    {
      const rep0 = p.rep[this.station.factionId] ?? 0;
      const seen: Record<string, [number, number]> = {};
      for (const id of Object.keys(this.station.prices)) seen[id] = [buyPrice(this.station, id, rep0), sellPrice(this.station, id, rep0)];
      (p.marketMemory ??= {})[this.station.id] = { t: g.world.time, systemId: p.systemId, prices: seen };
    }
    p.oxygen = p.oxygenMax;
    this.settleCrew(g);
    g.showHint("station", "ARROWS/CLICK TO BROWSE - ENTER TO ACT - ESC UNDOCKS - P WALKS THE DECK");
    const bay = g.lastBay || (1 + (this.station.id.length * 7 + Math.floor(g.world.time)) % 6);
    const allElite = (["explorer", "trader", "miner", "rescuer"] as const).every((k) => rankOf(p, k).title === "ELITE");
    if (allElite && !p.flags?.master) { flag(g, "master"); logEntry(g.world, "Elite in every trade: master of the lanes"); void wire.post("achievement", "is Elite in every trade: master of the lanes", g.world.systems[p.systemId].name); }
    const title = allElite ? "MASTER OF THE LANES" : isHome(p, this.station.id) ? "WELCOME HOME" : dockingsAt(p, this.station.id) >= OLD_HAND_AT ? "GOOD TO HAVE YOU BACK" : rankOf(p, "rescuer").idx >= 3 ? rankOf(p, "rescuer").title : hasCharter(g.world, this.station.factionId) ? "CHARTERED" : (p.lineage ?? []).length ? "OF THE LINE" : (captainNickname(g.world) ?? "");
    if (stationHour(this.station).night) flag(g, "nightowl");
    { const rk = commandRank(p); const who = `${p.shipName ? p.shipName + ", " : ""}${registry(g.world)}, ${title ? title + ", " : rk !== "SKIPPER" ? rk + ", " : ""}${(p.ribbons ?? 0) >= 3 ? "RIBBONS AND ALL, " : ""}`; g.toast(stationHour(this.station).night ? `${this.station.name.toUpperCase()} NIGHT WATCH: ${who}BAY ${bay}. KEEP IT QUIET, THE DAY SHIFT IS ASLEEP` : `${this.station.name.toUpperCase()} CONTROL: ${who}CLEARANCE GRANTED, BAY ${bay}`); }
    { const wk = weekKey(); if (p.lastWeekSeen !== wk) { p.lastWeekSeen = wk; { const lr = lanesReport(g.world); if (lr) (g.world.mailQueue ??= []).push(lr); } const bc = borderContest(g.world); const issue = !this.station.military && this.station.factionId !== "vex" ? weeklyIssue(g.world, this.station.factionId) : null; g.toast(`NEW WEEK ON THE LANES${issue ? `: ${faction(this.station.factionId).name.split(" ")[0].toUpperCase()} ASKS ABOUT ${issue.title}` : ""}${bc ? ` - ${g.world.systems[bc.systemId]?.name.toUpperCase() ?? "?"} IS CONTESTED` : ""}`.slice(0, 96)); } }
    { const c = collectCharters(p); for (const l of c.lines) g.toast(l); if (c.total !== 0) sfx.pickup(); }
    tickAlumniMail(g.world, new RNG((g.world.seed ^ Math.floor(g.world.time * 73)) >>> 0));
    { const l = catGift(p, new RNG((g.world.seed ^ Math.floor(g.world.time * 79)) >>> 0)); if (l) g.toast(l); }
    { const m = tickMail(g.world); for (const l of m) g.toast(l); if (m.length) sfx.letter(); }
    { const kept = tickLostProperty(p); for (const l of kept) g.toast(l); if (kept.length) flag(g, "keepsake"); }
    if (p.focus || p.briefed) { p.focus = null; p.briefed = false; }
    for (const c of p.crew) c.counselled = false;
    p.simUsed = false;
    if (p.numberOneLeg) { const fo = firstOfficer(p); p.numberOneLeg = false; if (fo) { const l = p.leg; const rough = l && (l.fights > 0 || l.alerts > 0); fo.loyalty = (fo.loyalty ?? 0) + 0.2; logEntry(g.world, `${fo.name} brought the ship in from their leg${rough ? ", with some weather" : ", clean"}`); g.toast(`${fo.name.split(" ")[0].toUpperCase()}: "SHIP'S YOURS, CAPTAIN. ${rough ? "THERE WAS SOME WEATHER. IT'S IN THE LOG. NOBODY'S HURT." : "NOTHING TO REPORT, WHICH I'M TOLD IS THE HARD PART."}"`); } }
    if (p.shipAskedQuiet) { const l = p.leg; const quiet = !l || (!l.alerts && !l.fights); p.shipAskedQuiet = false; if (quiet) { p.wear = Math.max(0, (p.wear ?? 0) - 6); flag(g, "quietleg"); logEntry(g.world, "Gave the ship the quiet leg it asked for"); g.toast(`${shipVoiceName(p)}: THAT WAS A GOOD LEG. I'VE TIGHTENED SOMETHING IN THE MOUNTS MYSELF. DON'T ASK HOW. WEAR -6.`); } else g.toast(`${shipVoiceName(p)}: THAT WASN'T QUIET. I'M NOT ANGRY. I'M A SHIP. I'M NOTING IT.`); }
    { const l = legSummary(g.world); if (l) logEntry(g.world, l); newLeg(p, g.world.time); delete (p.flags ?? {}).counselledLeg; delete (p.flags ?? {}).longLegNoted; delete (p.flags ?? {}).longLegNudged; }
    for (const l of birthdaysDue(g.world)) g.toast(l);
    { const a = anniversaryDue(g.world); if (a) g.toast(a); }
    if (p.flags?.freeman && (p.beltStanding ?? 0) < BELT_FREEMAN_AT - 1) { delete p.flags.freeman; (p.flags ??= {}).freemanLost = true; logEntry(g.world, "The belt took the freeman's name back"); (g.world.mailQueue ??= []).push({ dueT: g.world.time + 300, from: "the rock's council, three rocks", text: "Three rocks say the name comes back. Three rocks are never wrong at once, and they weren't the first time either. Bring water. Answer hails. Don't tell the patrol things. The name's there to be earned twice. Most don't. You might." }); g.toast("THE ROCK'S COUNCIL: THE FREEMAN'S NAME COMES BACK TO THE BELT UNTIL IT'S EARNED AGAIN. THE YARD RATE IS THE INNERS' RATE FROM HERE."); }
    if (p.crewPick) { if (p.crewPick === this.station.id) { for (const c of p.crew) { c.morale = Math.min(100, c.morale + 6); c.loyalty = (c.loyalty ?? 0) + 0.1; } flag(g, "crewpick"); logEntry(g.world, `Took the crew's pick: ${this.station.name}`); g.toast("THE CREW'S PICK. THEY'RE DOWN THE GANGWAY BEFORE THE CLAMP'S DONE CLICKING. THE BAR DOES THE THING WITH THE EGGS. MORALE UP."); } else for (const c of p.crew) c.morale = Math.max(0, c.morale - 1); delete p.crewPick; }
    { const rv = rivalOf(g.world); if (rv && p.numberOne && !(p.flags ?? {}).rivalNumberOne) { (p.flags ??= {}).rivalNumberOne = true; (g.world.mailQueue ??= []).push({ dueT: g.world.time + 700, from: `${rv.ship}'s Number One, to ${p.numberOne}`, text: `From one Number One to another: our captains don't get on, and we both know whose fault that is, and it isn't ours. There's a bar at the next review where the seconds-in-command drink while the captains posture. First round's mine. Bring the stories you can't tell yours.` }); } }
    if (p.flags?.singershome && !p.flags?.officeLetterSingers) { (p.flags ??= {}).officeLetterSingers = true; (g.world.mailQueue ??= []).push({ dueT: g.world.time + 650, from: "the office of anomalous incidents", text: "Re: hundreds of ships singing. The office has no form for this. The office has looked. The office has drafted form 41-A ('Chorus, Unexplained') and been told it cannot issue a form for a thing that was, by all accounts, explained, in song, to you. Please describe the song. Please do not sing it. Please, if you must, sing it." }); (p.codex ??= {})["contact:THE OFFICE OF ANOMALOUS INCIDENTS"] = ((p.codex ?? {})["contact:THE OFFICE OF ANOMALOUS INCIDENTS"] ?? 0) + 1; }
    if (p.flags?.singershome && !p.flags?.ethicsLetterSingers) { (p.flags ??= {}).ethicsLetterSingers = true; (g.world.mailQueue ??= []).push({ dueT: g.world.time + 500, from: "the survey's board of ethics, on the roll-call", text: "The board notes that a population which had met exactly one ship has now sung to it. The board has no rule for this. The board has convened to write one and adjourned without writing it, twice. The board is not permitted to say 'well done'. The board has enclosed a grant instead, which is not the same thing, and is.", gift: { credits: 500, data: 40 } }); }
    if (p.flags?.directiveBroken && !p.flags?.ethicsLetter) { (p.flags ??= {}).ethicsLetter = true; (p.codex ??= {})["contact:THE BOARD OF ETHICS"] = ((p.codex ?? {})["contact:THE BOARD OF ETHICS"] ?? 0) + 1; (g.world.mailQueue ??= []).push({ dueT: g.world.time + 600, from: "the survey's board of ethics", text: "It has come to the board's attention that a rover from your hull made contact with a population that had not, until then, met a rover. The board does not say you were wrong. The board is not permitted to say anything. The board would like you to know that a child on that world has drawn your lander on a wall, and that the drawing is, by all accounts, quite good. Please find the enclosed guidance, which you will not read.", gift: { data: 20 } }); }
    if (p.flags?.directiveKept && !p.flags?.directiveKept2 && !p.flags?.ethicsLetterKept) { (p.flags ??= {}).ethicsLetterKept = true; (p.codex ??= {})["contact:THE BOARD OF ETHICS"] = ((p.codex ?? {})["contact:THE BOARD OF ETHICS"] ?? 0) + 1; (g.world.mailQueue ??= []).push({ dueT: g.world.time + 600, from: "the survey's board of ethics", text: "The board notes that your hull found a population the survey had filed under geology, and left it as it found it. The board is not permitted to thank you. The board has enclosed a survey grant, which is not thanks, and a note that the population has since invented the wheel, which is not your doing, and which the board finds it cannot stop thinking about.", gift: { credits: 250, data: 20 } }); }
    { const fr = friendsAt(g.world, this.station.id); if (fr.length && Math.random() < hoursRate(this.station).lounge) g.toast(`${fr[0].name.toUpperCase()} IS IN THE LOUNGE AND WAVING YOU OVER`); }
    this.presentPortAudience(g);
    g.autosave();
  }

  // Crew dialogue can already own the scene. Defer this visit's port audience
  // until that dialogue returns, without charging or resetting the arrival.
  presentPortAudience(g: Game): boolean {
    const visit = currentDockVisit(g.world);
    if (g.sceneName !== "station" || this.visitWorld !== g.world || this.visit !== visit ||
      !visit?.portAudiencePending || visit.stationId !== this.station.id) return false;
    delete visit.portAudiencePending;
    const p = g.world.player;
    if (inspectionDue(g.world, this.station)) this.inspection(g);
    else if (inquiryDue(g.world, this.station)) this.inquiry(g);
    else if (this.station.military && (p.ruleBroken ?? 0) > (p.hearings ?? 0)) this.hearing(g);
    else if ((p.officeLetters ?? 0) >= 3 && !(p.flags ?? {}).officeVisited) this.officeVisit(g);
    else if (this.station.military && transferRequest(g.world)) this.transfer(g, transferRequest(g.world)!);
    else if (this.station.military && commandOffer(g.world)) this.commandOfferScene(g, commandOffer(g.world)!);
    else if (leavePair(g.world)) this.leaveTogether(g, leavePair(g.world)!);
    else if (fleetReviewAt(g.world, this.station.id) && commandRank(p) !== "SKIPPER" && !(p.flags ?? {})[`review:${this.station.id}:${weekKey()}`]) this.fleetReview(g);
    else if (fleetReviewAt(g.world, this.station.id) && firstOfficer(p) && !(p.flags ?? {})[`secondsbar:${weekKey()}`]) this.secondsBar(g);
    else if (receptionDue(g.world, this.station)) this.reception(g);
    else if (grievanceDue(g.world)) this.grievance(g);
    else if (spinOutageDue(g.world, this.station)) this.spinOutage(g);
    else { const sec = secessionAt(g.world, this.station.id); if (sec && !(p.flags ?? {})[`register:${this.station.id}:${Math.round(sec.until)}`]) this.register(g, sec); else { const cr = crisisAt(g.world, this.station.id); if (cr && cr.commodityId === "med" && !(p.flags ?? {})[`overrun:${this.station.id}:${weekKey()}`]) this.overrun(g); } }
    return true;
  }

  loadPortData(g: Game): void {
    const world = g.world, visit = this.visit, station = this.station;
    const current = () => g.world === world && this.visitWorld === world && this.visit === visit && this.station === station;
    this.base = null; this.baseLoaded = false; this.baseOwner = null; this.raceRecords = null;
    if (world.realGalaxy && !station.military) void wire.fetchRaceRecords(station.name).then(r => { if (current()) this.raceRecords = r; });
    void wire.fetchBases().then(() => { if (current()) this.baseOwner = wire.baseAt(station.id)?.tag ?? null; });
    const squadron = wire.getSquadron();
    if (squadron) void wire.fetchBase(squadron).then(b => {
      if (!current()) return;
      this.base = b; this.baseLoaded = true;
      if (!b?.stationId && !station.military) g.showHint("base", "BASE TAB: POOL CREDITS WITH YOUR SQUADRON AND BUY A STATION AS YOUR BASE");
    });
    else this.baseLoaded = true;
  }

  settleCrew(g: Game): void {
    const p = g.world.player;
    const farewell = p.crew.find(c => lastLegAtPort(g.world, c));
    if (farewell) g.showHint(`last-journey:${farewell.name}`, `${farewell.name.toUpperCase()}'S CHOSEN PORT. P WALKS THE DECK; E BESIDE THEM SAYS GOODBYE.`);
    if (!p.crew.length) {
      (p.dockings ??= {})[this.station.id] = dockingsAt(p, this.station.id) + 1;
      for (const line of settlePassengers(p)) g.toast(line);
      const ev0 = galaxyEventAt(g.world, p.systemId);
      if (ev0?.kind === "festival" && ev0.stationId === this.station.id && logSight(p, "festival", `the festival at ${this.station.name}`, p.systemId)) g.toast("YOUR PASSENGERS ARE OFF INTO THE FESTIVAL CROWD. THEY'LL REMEMBER THIS ONE.");
      return;
    }
    if (p.flags?.owedLeave) { delete p.flags.owedLeave; for (const c of p.crew) c.morale = Math.min(100, c.morale + 15); g.toast("SHORE LEAVE, AS PROMISED. CREW MORALE UP."); }
    const wages = crewWages(p);
    if (p.credits >= wages) { p.credits -= wages; ledger(p, "crew", -wages); g.toast(`CREW WAGES PAID -${wages}CR`); }
    else { for (const c of p.crew) c.morale = Math.max(0, c.morale - 20); g.toast("CAN'T PAY WAGES - CREW MORALE DROPS"); }
    for (const c of p.crew) {
      if ((p.cargo.food ?? 0) > 0) { removeCargo(p, "food", 1); c.morale = Math.min(100, c.morale + 8); }
      else c.morale = Math.max(0, c.morale - 15);
      if (p.cat) c.morale = Math.min(100, c.morale + 2);
      c.morale = Math.min(100, c.morale + Math.min(3, (p.furnishings ?? []).length) + ((p.modules ?? []).includes("greenhouse") ? 1 : 0) + ((p.furnishings ?? []).includes("chair") ? 1 : 0));
    }
    for (const m of passengersAboard(p)) m.mood = Math.min(100, (m.mood ?? 60) + Math.min(6, (p.furnishings ?? []).length * 2));
    const quitters = p.crew.filter((c) => c.morale <= 5 && (c.loyalty ?? 0) < 3);
    for (const q of quitters) g.toast(`${q.name.toUpperCase()} WALKED OFF THE SHIP`);
    for (const c of p.crew) if (c.morale <= 5 && (c.loyalty ?? 0) >= 3) { c.morale = 20; c.loyalty = (c.loyalty ?? 0) - 1; g.toast(`${c.name.toUpperCase()} STAYS OUT OF LOYALTY. DON'T PUSH IT.`); }
    p.crew = p.crew.filter((c) => c.morale > 5 || (c.loyalty ?? 0) >= 2);
    const now = g.world.time;
    const rng = new RNG((g.world.seed ^ Math.floor(now) ^ 0x5ea) >>> 0);
    { const firsts = p.crew.filter((c) => (c.docks ?? 0) === 0); for (const c of p.crew) c.docks = (c.docks ?? 0) + 1; for (const c of p.crew) if (c.cadet && (c.docks ?? 0) >= 10) { c.cadet = false; c.wasCadet = true; c.skill = Math.min(10, c.skill + 1); c.wage = Math.round(c.wage / 0.6); c.loyalty = (c.loyalty ?? 0) + 0.3; flag(g, "cadetgrown"); logEntry(g.world, `${c.name}, cadet no longer: ten dockings`); g.toast(`${c.name.split(" ")[0].toUpperCase()}: TEN DOCKINGS. CADET NO LONGER. FULL WAGE, A SKILL UP, AND THE CREW STOP CALLING THEM THE NEW ONE. MOSTLY.`); } for (const c of firsts) { for (const o of p.crew) o.morale = Math.min(100, o.morale + 2); c.loyalty = (c.loyalty ?? 0) + 0.2; logEntry(g.world, `${c.name}'s first docking, at ${this.station.name}; the crew bought the drink`); flag(g, "firstdock"); if (c.cadet && c.home) (g.world.mailQueue ??= []).push({ dueT: g.world.time + 800, from: `${c.name.split(" ")[0]}'s mam, ${findStation(g.world, c.home)?.st.name ?? "home"}`, text: `${c.name.split(" ")[0]} wrote. First docking, they said, and the crew bought the drink, and they signed a book. I don't know what book. I cried anyway. Feed them. They don't eat when they're nervous and they're always nervous. Thank you for the seat.`, gift: { credits: 40 } }); g.toast(`${c.name.split(" ")[0].toUpperCase()}'S FIRST DOCKING. THE CREW BUY THE DRINK AND MAKE THEM SIGN THE BAR'S BOOK. THEY'RE ON THE ROSTER FOR REAL NOW.`); } }
    (p.dockings ??= {})[this.station.id] = dockingsAt(p, this.station.id) + 1;
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
    if (g.sceneName !== "encounter" && (p.tutorial ?? -1) < 0) { const cand = p.crew.find((c) => (c.loyalty ?? 0) >= 2 && !c.arc && !c.lastLeg && arcFor(c.role)); if (cand && rng.chance(0.35)) offerArc(g, cand, "station"); }
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
    const c = p.crew.find((x) => (x.docks ?? 0) >= RETIRE_DOCKS && !x.lastLeg && (!x.retireAsked || !x.lastLegOffered) && rng.chance(0.2));
    if (!c) return;
    c.retireAsked = true;
    c.lastLegOffered = true;
    const name = c.name.toUpperCase();
    const stId = this.station.id;
    const destination = lastLegDestination(g.world, c);
    const text = `${name} FINDS YOU AT THE AIRLOCK WITH AN OLD ROUTE CHART. '${c.docks} DOCKINGS, CAPTAIN. I'VE BEEN COUNTING. ${destination ? `I COULD STOP HERE. BUT IF YOU HAVE ONE MORE JOURNEY IN YOU, I'D CHOOSE ${destination.st.name.toUpperCase()}, IN ${destination.sys.name.toUpperCase()}. I'D LIKE THE LAST ENTRY TO BE SOMEWHERE I CHOSE.` : "THIS IS A GOOD PORT TO STOP AT. I'D LIKE TO GO HOME WHILE I STILL REMEMBER WHAT IT LOOKS LIKE."}'`;
    const opts: Encounter["options"] = [];
    if (destination) opts.push({ label: "ONE LAST LEG. WE'LL TAKE YOU THERE.", hint: `${destination.st.name.toUpperCase()}, ${destination.sys.name.toUpperCase()}. No deadline.`, result: (g2) => {
      if (!beginLastLeg(g2.world, c, destination.st.id)) return "THE JOURNEY COULDN'T BE ENTERED. CHECK THE CREW AND THE CHART.";
      g2.autosave();
      return `${name} MARKS THE PORT ON THE CHART. 'I'M STILL ON THE WATCH BILL UNTIL THEN.' COURSE SET FOR ${destination.st.name.toUpperCase()}. N FLIES THE ROUTE. THE ROSTER KEEPS THE DESTINATION. SAY GOODBYE ON THAT STATION'S DECK.`;
    } });
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
      opts.push({ label: `PAY ${price}CR FOR AMNESTY`, requires: (g2) => g2.world.player.credits >= price, result: (g2) => { g2.world.player.credits -= price; closeLawCases(g2.world); logEntry(g2.world, `Bought an amnesty from the ${fac.name}`); return "THE ENVOY SIGNS SOMETHING. SOMEWHERE A FILE CLOSES. YOU ARE NOBODY AGAIN."; } });
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
    const c = rng.pick(p.crew.filter((x) => !x.request && !x.lastLeg));
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

  onSceneLeave(): void { this.info?.onSceneLeave(); this.info = undefined; }

  listKeys(g: Game): string[] | null {
    const tab = TABS[this.tab];
    switch (tab) {
      case "MARKET": return this.marketRows(g);
      case "SHIPYARD": return this.shipyardOptions(g).map(row => row.id ?? row.label);
      case "SHIPS": return this.shipRows(g).map(row => row.kind === "market" ? `market:${row.hull.id}` : row.kind === "working" ? `working:${row.charter.id}` : `${row.kind}:${this.list.objectKey(row.ship)}`);
      case "MISSIONS": return this.missionRows(g).map(row => `${row.ready ? "turn-in" : "accept"}:${row.m.id}`);
      case "BAR": return this.barEntries(g).map(row => row.key);
      case "STORAGE": return this.storageRows(g).map(row => `${row.kind}:${row.id}`);
      case "ENGINEER": return BLUEPRINTS.map(row => row.id);
      case "BASE": return this.baseRows(g).map(row => `${row.kind}:${row.id ?? ""}:${row.treaty ?? ""}`);
      default: return this.documentKey() ? this.documentRows(g).map(row => row.id) : null;
    }
  }

  syncList(g: Game): boolean {
    const document = this.documentKey();
    if (document !== this.activeDocument) {
      if (this.activeDocument) this.documentLists.set(this.activeDocument, this.list);
      else this.transactionList = this.list;
      this.list = document ? this.documentLists.get(document) ?? new StationList() : this.transactionList;
      if (document) this.cursor = this.list.view.index;
      this.activeDocument = document;
    }
    const keys = this.listKeys(g);
    if (keys === null) { this.list.tab = -1; return false; }
    this.cursor = this.list.sync(this.tab, keys, this.cursor, LIST_PAGES[TABS[this.tab]]);
    return true;
  }

  prepareListDraw(g: Game): void { this.syncList(g); this.list.capture(); this.rowBoxes = []; }

  extraButtons(g: Game): { key: string; label: string; rect: Rect }[] {
    const p = g.world.player;
    if (this.documentKey()) return [{ key: "F3", label: "F3 READ ALL", rect: { x: 148, y: 245, w: 104, h: 14 } }];
    let buttons: [string, string][] = [];
    switch (TABS[this.tab]) {
      case "MARKET": buttons = [["b", "B BUY ONE"], ["s", "S SELL ONE"], ["v", "V BUY SHARE"]]; break;
      case "SHIPS": {
        const row = this.shipRows(g)[this.cursor];
        if (row?.kind === "market") buttons = [["k", "K KEEP OLD HULL"]];
        if (row?.kind === "parked") buttons = [["w", "W PUT TO WORK"], ["x", "X SELL HULL"]];
        if (row?.kind === "working") buttons = [["r", "R RELEASE"]];
        break;
      }
      case "MISSIONS": buttons = [["j", "J FULL LOG"], ...(p.service?.order ? [["u", "U SERVICE COURSE"] as [string, string]] : []), ...(p.council?.mandate ? [["c", "C COUNCIL COURSE"] as [string, string]] : [])]; break;
      case "BAR": buttons = [["r", "R ROSTER"], ["o", "O READ REPLY"]]; break;
    }
    return buttons.map(([key, label], i) => ({ key, label, rect: { x: 148 + i * 110, y: 245, w: 104, h: 14 } }));
  }

  actionLabel(g: Game): string {
    const p = g.world.player;
    if (this.documentKey()) return this.tab === 5 && this.surveyView === "data" ? "ENTER SELL DATA" : "ENTER READ ENTRY";
    switch (TABS[this.tab]) {
      case "MARKET": return (p.cargo[this.marketRows(g)[this.cursor]] ?? 0) > 0 ? "ENTER SELL ONE" : "ENTER BUY ONE";
      case "SHIPYARD": return "ENTER DO THIS";
      case "SHIPS": {
        const row = this.shipRows(g)[this.cursor];
        return row?.kind === "parked" ? "ENTER BOARD" : row?.kind === "remote" ? "ENTER LINER" : row?.kind === "working" ? "R RELEASE" : "ENTER TRADE IN";
      }
      case "MISSIONS": return this.missionRows(g)[this.cursor]?.ready ? "ENTER TURN IN" : "ENTER ACCEPT";
      case "STORAGE": return this.storageRows(g)[this.cursor]?.kind === "held" ? "ENTER STORE ONE" : "ENTER LOAD ONE";
      case "ENGINEER": return "ENTER UPGRADE";
      case "BAR": return "ENTER TALK / HIRE";
      default: return "ENTER DO THIS";
    }
  }

  drawListControls(g: Game, ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = PAL.uiPanel; ctx.fillRect(0, 223, VW, 47);
    mapButton(ctx, PREV, "PG UP"); mapButton(ctx, NEXT, "PG DN");
    drawText(ctx, `${this.list.view.keys.length ? this.cursor + 1 : 0}/${this.list.view.keys.length} HOME/END`, 116, 232, PAL.grey);
    mapButton(ctx, DETAILS, "I FULL DETAILS"); mapButton(ctx, WORKSHOP, "F2 WORKSHOP / MATERIALS");
    mapButton(ctx, RUN, this.actionLabel(g));
    for (const button of this.extraButtons(g)) mapButton(ctx, button.rect, button.label);
    const hint = TABS[this.tab] === "MARKET" ? "SHIFT: BUY TEN / SELL STACK  N: PLOT BEST KNOWN MARKET"
      : TABS[this.tab] === "SHIPS" ? "N NAME  O PAINT  ROWS SELECT; USE THE ACTION CONTROLS"
      : "ARROWS/WHEEL SELECT  PAGE UP/DOWN PAGE  HOME/END FIRST/LAST";
    const lesson = tutorialActive(g) ? `SCHOOL ${g.world.player.tutorial! + 1}: ${tutorialText(g)}  K SKIPS` : g.hint || hint;
    drawText(ctx, clippedText(g.toastTimer > 0 ? g.toastMsg : lesson, 464), 8, 262, g.toastTimer > 0 ? PAL.ui : PAL.greyDark);
  }

  openReply(): void {
    this.info = new ReaderOverlay("LOUNGE REPLY", [["LAST REPLY", [this.barLine || "No reply yet."]]], () => { this.info = undefined; });
  }

  barEntries(g: Game): { key: string; title: string; lines: string[]; portrait?: string }[] {
    const p = g.world.player, st = this.station;
    return [
      ...st.barPatrons.map((name, index) => {
        const friend = friendsAt(g.world, st.id).find(c => c.name === name);
        return { key: `patron:${name}:${st.barPatrons.slice(0, index).filter(n => n === name).length}`, title: name, portrait: name, lines: friend ? [`CAPTAIN OF THE ${friend.ship}. HELPED ${friend.helped} TIMES.`, "ENTER TO TALK."] : ["ENTER TO TALK."] };
      }),
      ...this.candidates.map(c => ({ key: `crew:${this.list.objectKey(c)}`, title: `FOR HIRE: ${c.name}`, portrait: c.name, lines: [
        `${ROLE_INFO[c.role].label}, SKILL ${c.skill}. ${ROLE_INFO[c.role].effect}.`, `WAGE ${c.wage}CR PER DOCKING. SIGNING BONUS ${c.wage * 3}CR.`, ...(c.trait ? [c.trait] : []),
        `BERTHS USED ${berthsUsed(p)}/${hull(p.hullId).crewSlots}. CREW ON LEAVE KEEP THEIR BERTHS.`,
      ] })),
      ...this.fares.map(m => ({ key: `fare:${this.list.objectKey(m)}`, title: m.title, lines: [m.desc,
        `DESTINATION: ${findStation(g.world, m.targetStationId ?? "")?.st.name ?? "SYSTEM OBJECTIVE"}, ${g.world.systems[m.targetSystemId]?.name ?? m.targetSystemId}.`,
        m.passengerKind === "singer" ? `REWARD ${m.lightReward ?? 25} LIGHT.` : `REWARD ${m.reward}CR.`,
        `CABINS ${passengersAboard(p).length}/${passengerCap(p)}.`, ...(m.demand ? [`REQUESTS ${commodity(m.demand).name}.`] : []),
      ] })),
      ...(st.military ? [] : [{ key: `race:${st.id}`, title: "THE RING RACE", lines: [
        `${RACE_GATES} RINGS ROUND THE STATION, AGAINST THE CLOCK. ENTER TO REGISTER.`,
        `LOCAL RECORD ${raceHolder(g.world, st).t.toFixed(1)}S, ${raceHolder(g.world, st).name}.`,
        `YOUR BEST: ${p.raceBest?.[st.id]?.toFixed(1) ?? "NO TIME"}. ${p.racePending === st.id ? "ALREADY ENTERED." : ""}`,
        ...(this.raceRecords?.[0] ? [`WIRE RECORD ${this.raceRecords[0].t.toFixed(1)}S BY ${this.raceRecords[0].callsign}.`] : []),
      ] }]),
    ];
  }

  openDetails(g: Game): void {
    if (this.documentKey()) { this.openDocument(g, false); return; }
    const p = g.world.player, st = this.station;
    let sections: [string, string[]][] = [];
    switch (TABS[this.tab]) {
      case "MARKET": {
        const id = this.marketRows(g)[this.cursor]; if (!id) break;
        const c = commodity(id), rep = p.rep[st.factionId] ?? 0, best = this.bestKnownSell(g, id), run = this.bestRoute(g);
        const lines = [
          `ABOARD ${p.cargo[id] ?? 0}. STATION STOCK ${st.stock[id] ?? 0}.`,
          `B BUYS ONE. S SELLS ONE. ENTER ${p.cargo[id] ? "SELLS" : "BUYS"} ONE. SHIFT BUYS TEN OR SELLS THE HELD STACK. PRICES CHANGE PER UNIT.`,
          ...(best ? [`BEST KNOWN SALE ${best.price}CR AT ${best.station}, ${best.system}. LAST SEEN ${Math.floor(best.ago / 60)} MINUTES AGO. N PLOTS THAT SYSTEM.`] : ["NO OTHER MARKET SEEN FOR THIS GOOD."]),
          ...(run ? [`BEST KNOWN RUN: ${commodity(run.id).name}, BUY ${run.buy}CR HERE, SELL ${run.sell}CR AT ${run.station}, ${run.system}.`] : []),
          c.rare ? `RARE GOOD. CURRENT SALE QUOTE ${rareSellPrice(g.world, st, id, rep)}CR; DISTANCE FROM ITS ORIGIN AFFECTS VALUE.` : `BASE SALE QUOTE ${sellPrice(st, id, rep)}CR BEFORE STATION BENEFITS AND PREMIUMS.`,
          c.illegal ? blackMarket(g.world, st) ? "BLACK MARKET: SALES RECEIVE A 30% PREMIUM." : "CUSTOMS CAN SEIZE AN ILLEGAL SALE WITHOUT PAYMENT." : "LEGAL GOODS.",
          ...(this.goal.stationType === st.type ? [`COMMUNITY GOAL: ${commodity(this.goal.commodityId).name} PAYS ${Math.round(this.goal.premium * 100)}% EXTRA HERE THIS WEEK.`] : []),
          ...(this.demandHere(g) ? [`WANTED GOODS: ${this.demandHere(g)!.goods.map(id => commodity(id).name).join(", ")}. PREMIUM ${Math.round(ROUTE_PREMIUM * 100)}%.`] : []),
          `V BUYS ONE STATION SHARE FOR ${stakePrice(g.world, st)}CR. SHIFT BUYS TEN. SHARES HERE ${p.stakes?.[st.id] ?? 0}. ESTIMATED DIVIDEND ${stakeDividend(g.world, st)}CR PER DOCKING.`,
        ];
        sections = [[c.name, lines]]; break;
      }
      case "SHIPYARD": {
        const row = this.shipyardOptions(g)[this.cursor]; if (!row) break;
        const module = MODULES.find(m => row.id === `module:${m.id}`), furnishing = FURNISHINGS.find(f => row.id === `furniture:${f.id}`);
        sections = [[row.label, [row.sub, ...(module ? [module.desc] : []), ...(furnishing ? [furnishing.desc] : [])]], ["SHIP SYSTEMS", p.systems.map(s => `${s.name}: ${Math.round(s.health)}%.`)]]; break;
      }
      case "SHIPS": {
        const row = this.shipRows(g)[this.cursor]; if (!row) break;
        const name = row.kind === "market" ? row.hull.name : row.kind === "working" ? row.charter.name : row.ship.name ?? hull(row.ship.hullId).name;
        sections = [[name, this.shipDetailLines(g, row)]]; break;
      }
      case "MISSIONS": {
        const m = this.missionRows(g)[this.cursor]?.m, section = this.missionSections(g).find(s => s.mission === m && !!m);
        if (section) sections = [[section.title, section.lines]]; break;
      }
      case "BAR": {
        const row = this.barEntries(g)[this.cursor]; if (row) sections = [[row.title, row.lines]];
        if (this.barLine) sections.push(["LAST REPLY", [this.barLine]]); break;
      }
      case "STORAGE": {
        const row = this.storageRows(g)[this.cursor]; if (row) sections = [[commodity(row.id).name, [
          `${row.qty} ${row.kind === "held" ? "ABOARD" : `STORED AT ${st.name}`}.`,
          row.kind === "held" ? "ENTER STORES ONE HERE." : "ENTER LOADS ONE INTO YOUR HOLD.",
          `CARGO ${cargoUsed(p)}/${p.cargoMax}. GOODS AT OTHER STATIONS STAY THERE.`,
        ]]]; break;
      }
      case "ENGINEER": {
        const bp = BLUEPRINTS[this.cursor]; if (!bp) break;
        const cost = nextCost(p, bp);
        sections = [[bp.name, [bp.desc, `CURRENT GRADE ${engGrade(p, bp.id)} OF ${bp.grades.length}.`, this.hasEngineer() ? "ENGINEER AVAILABLE HERE." : "VISIT A RESEARCH OR REFINERY STATION.",
          ...(cost ? Object.entries(cost).map(([id, qty]) => `${MATERIALS.find(m => m.id === id)?.name ?? id}: NEED ${qty}, HAVE ${p.materials?.[id] ?? 0}.`) : ["ALL GRADES FITTED."]),
        ]]]; break;
      }
      case "BASE": {
        const row = this.baseRows(g)[this.cursor]; if (row) sections = [[row.label, [row.sub]]];
        if (this.base) sections.push(["BASE RECORD", [`TREASURY ${this.base.treasury}CR.`, ...this.base.log.map(l => `${l.callsign}: ${l.text}`)]]); break;
      }
    }
    if (!sections.length) sections = [["NO SELECTION", ["No action is available in this list."]]];
    sections.push(["PORT", [st.name, `${st.type} station. ${faction(st.factionId).name}.`]]);
    if (g.hint) sections.push(["PORT NOTE", [g.hint]]);
    if (tutorialActive(g)) sections.push(["FLIGHT SCHOOL", tutorialDetails(g)]);
    this.info = new ReaderOverlay("STATION DETAILS", sections, () => { this.info = undefined; });
  }

  documentKey(): string {
    return this.tab === 5 ? `survey:${this.surveyView}` : this.tab === 11 ? `record:${this.recordView}` : this.tab === 9 ? "news" : this.tab === 10 ? "wire" : "";
  }

  documentRows(g: Game): StationRecord[] {
    return stationRecords(g, this, object => this.documentIdentity.objectKey(object));
  }

  documentButtons(): { key: string; label: string; rect: Rect }[] {
    if (this.tab === 5) return [{ key: "c", label: this.surveyView === "data" ? "C CODEX" : "C CARTOGRAPHICS", rect: { x: 300, y: 52, w: 174, h: 12 } }];
    const buttons: [string, string][] = this.tab === 9 ? [["l", "L LETTERS"], ["r", "R REPLY NEWEST"], ...(!this.station.military && this.station.factionId !== "vex" ? [["y", "Y VOTE FOR"], ["n", "N AGAINST"]] as [string, string][] : [])]
      : this.tab === 10 ? [["c", "C CALL SIGN"]]
      : this.tab === 11 ? [["l", "L LOG"], ["b", "B LEDGER"], ["p", "P GUESTBOOK"], ["w", "W WEEK"], ["o", "O HARBOUR"], ["c", "C CHRONICLE"], ["x", "X EXPORT"]] : [];
    const width = this.tab === 11 ? 66 : 116;
    return buttons.map(([key, label], i) => ({ key, label, rect: { x: 8 + i * width, y: 56, w: width - 4, h: 15 } }));
  }

  openDocument(g: Game, all: boolean): void {
    const rows = this.documentRows(g), selected = rows.find(row => row.id === this.list.view.selected);
    const sections = (all ? rows : selected ? [selected] : []).map(row => [row.title, row.lines.length ? row.lines : ["No entries yet."]] as [string, string[]]);
    if (!sections.length) return;
    this.info = new ReaderOverlay(all ? "STATION RECORDS" : "RECORD DETAILS", sections, () => { this.info = undefined; });
  }

  drawDocuments(g: Game, ctx: CanvasRenderingContext2D): void {
    this.prepareListDraw(g);
    for (const button of this.documentButtons()) mapButton(ctx, button.rect, button.label);
    if (this.tab === 5) {
      drawText(ctx, this.surveyView === "data" ? "UNIVERSAL CARTOGRAPHICS" : "CODEX", 8, 56, PAL.info);
      if (this.surveyView === "data") {
        const worth = Math.round(g.world.player.expData ?? 0), paid = Math.round(worth * (this.station.type === "research" ? 1.25 : 1));
        mapButton(ctx, SELL_DATA, `ENTER SELL DATA: ${paid}CR${this.station.type === "research" ? " INCLUDING BONUS" : ""}`, worth > 0);
      } else drawText(ctx, "EVERY RETAINED ENTRY IS AVAILABLE IN DETAILS", 8, 76, PAL.greyDark);
    } else drawText(ctx, `${this.documentKey().replace(":", " / ").toUpperCase()}   I READ ENTRY   F3 READ ALL AND SEARCH`, 8, 76, PAL.info);
    const rows = this.documentRows(g), offset = this.list.view.offset;
    rows.slice(offset, this.list.view.end).forEach((row, i) => {
      const index = offset + i, y = 92 + i * 21;
      this.row(ctx, y, index === this.cursor, index, 19);
      drawText(ctx, clippedText(row.title, 444), 12, y, index === this.cursor ? PAL.white : PAL.ui);
      drawText(ctx, clippedText(row.lines[0] || "No entries yet.", 444), 12, y + 9, PAL.grey);
    });
    if (!rows.length) drawText(ctx, "NO RECORDS HERE YET.", 12, 96, PAL.grey);
  }

  paTimer = 20;
  update(g: Game, dt: number): void {
    if (this.info) { this.info.update(g); return; }
    const inp = g.input;
    let pointerAction: string | undefined;
    const pressed = (key: string) => pointerAction === key || (!(key === "k" && tutorialActive(g)) && inp.wasPressed(key));
    const click = (rect: Rect) => inp.mousePressed && contains(rect, inp.mouseX, inp.mouseY);
    for (const button of this.documentButtons()) if (click(button.rect)) { pointerAction = button.key; break; }
    if (pressed("F4")) { openJourney(g); return; }
    if (pressed("F2") || click(WORKSHOP)) { openWorkshop(g); return; }
    music.setMood(this.station.factionId, 0);
    this.paTimer -= dt;
    if (this.paTimer <= 0) { this.paTimer = 25 + Math.random() * 35; sfx.pa(); }
    presence.tick(g.world.player, g.world.systems[g.world.player.systemId].name); // still "here" while docked
    if (pressed("Escape")) {
      this.flushGoal();
      g.world.player.lastDockedAt = this.station.id;
      if (this.routeShare > 0 && this.baseOwner) { const v = Math.min(5000, this.routeShare); this.routeShare = 0; void wire.baseActionFor(this.baseOwner, "route", { value: v }); }
      if (this.returnTo === "stationwalk") g.setScene("stationwalk");
      else { g.world.player.dockedAt = null; g.justUndocked = true; g.setScene("flight"); g.toast("UNDOCKED"); }
      return;
    }
    if (pressed("p") && TABS[this.tab] !== "RECORD") { g.setScene("stationwalk"); return; }
    if (pressed("F5")) g.save();
    if (pressed("F9")) { g.load(); return; }
    this.tannoyT -= dt;
    if (this.tannoyT <= 0) { if (this.tannoy) { this.tannoy = ""; this.tannoyT = 20 + Math.random() * 20; } else { const rng = new RNG((Math.random() * 1e9) >>> 0); this.tannoy = rng.pick(tannoyLines(g.world, this.station, rng)); this.tannoyT = this.tannoyDur = 5 + this.tannoy.length * 0.07; } }
    const oldTab = this.tab;
    if (pressed("ArrowLeft") || pressed("q")) { this.tab = (this.tab + TABS.length - 1) % TABS.length; this.cursor = 0; }
    if (pressed("ArrowRight") || pressed("e")) { this.tab = (this.tab + 1) % TABS.length; this.cursor = 0; }
    if (inp.mousePressed) {
      let tx = 8;
      for (let i = 0; i < TABS.length; i++) {
        const width = textWidth(TABS[i]) + 10;
        if (contains({ x: tx - 4, y: 36, w: width, h: 15 }, inp.mouseX, inp.mouseY)) { this.tab = i; this.cursor = 0; }
        tx += width;
      }
    }
    const hasList = this.syncList(g);
    if (oldTab !== this.tab) { this.rowBoxes = []; return; }
    const removed = hasList && this.list.takeRemoval();
    if (hasList) {
      if (pressed("ArrowUp")) this.list.view.move(-1);
      if (pressed("ArrowDown")) this.list.view.move(1);
      if (inp.wheel) this.list.view.move(Math.sign(inp.wheel));
      if (pressed("PageUp") || click(PREV)) this.list.view.page(-1);
      if (pressed("PageDown") || click(NEXT)) this.list.view.page(1);
      if (pressed("Home")) this.list.view.select(0);
      if (pressed("End")) this.list.view.select(this.list.view.keys.length - 1);
      this.cursor = this.list.view.index;
      if ((inp.mousePressed || inp.mouseRightPressed) && inp.mouseX >= 4 && inp.mouseX < (TABS[this.tab] === "SHIPS" ? 242 : TABS[this.tab] === "SHIPYARD" ? 290 : TABS[this.tab] === "ENGINEER" ? 284 : 476)) {
        const row = this.rowBoxes.findIndex(([y0, y1]) => inp.mouseY >= y0 && inp.mouseY < y1 && inp.mouseY < 223);
        if (row >= 0) {
          const index = this.list.drawnIndex(row);
          if (index >= 0) { this.list.view.select(index); this.cursor = this.list.view.index; }
          return;
        }
      }
      if (removed) return;
      if (this.documentKey() && (pressed("F3") || this.extraButtons(g).some(button => button.key === "F3" && click(button.rect)))) { this.openDocument(g, true); return; }
      if (pressed("i") || click(DETAILS)) { this.openDetails(g); return; }
      if (click(RUN) && this.list.view.selected !== undefined) pointerAction = TABS[this.tab] === "SHIPS" && this.shipRows(g)[this.cursor]?.kind === "working" ? "r" : "Enter";
      for (const button of this.extraButtons(g)) if (click(button.rect)) { pointerAction = button.key; break; }
    } else {
      if (pressed("ArrowUp")) this.cursor--;
      if (pressed("ArrowDown")) this.cursor++;
      if (inp.wheel) this.cursor += Math.sign(inp.wheel);
    }

    const p = g.world.player;
    const st = this.station;
    const patron = wire.patronOf(st.factionId);
    const synHere = syndicateAt(g.world, st.id);
    const treaty = this.baseOwner && wire.getSquadron() && this.baseOwner !== wire.getSquadron() ? wire.treatyBetween(wire.getSquadron()!, this.baseOwner) : null;
    const rep = (p.rep[st.factionId] ?? 0) + (patron && patron === wire.getSquadron() ? 25 : 0) + (synHere && effectiveSynStanding(g.world, synHere.tag) >= 30 ? 25 : 0) - (treaty === "rivalry" ? 50 : 0); // patrons and affiliates (or partners of allies) trade like allies; rivals pay more
    const enter = (pressed("Enter") || pressed(" ")) && (!hasList || this.list.view.selected !== undefined);
    if (enter) sfx.select();

    switch (TABS[this.tab]) {
      case "MARKET": {
        const rows = this.marketRows(g);
        this.cursor = clamp(this.cursor, 0, rows.length - 1);
        const id = rows[this.cursor];
        if (!id) break;
        if (embargoed(g.world, st.factionId)) { if (enter || pressed("b") || pressed("s")) g.toast("EMBARGO - THIS MARKET WON'T TRADE WITH YOU"); break; }
        if (pressed("n") && id) {
          const best = this.bestKnownSell(g, id);
          const target = best ? Object.values(g.world.systems).find((s2) => s2.name === best.system) : null;
          if (!best || !target) g.toast("NO OTHER MARKET SEEN FOR THAT YET");
          else if (target.id === p.systemId) g.toast(`${best.station.toUpperCase()} IS IN THIS SYSTEM - JUST FLY THERE`);
          else { p.navTarget = target.id; p.singersCourse = false; delete p.navStationId; g.toast(`COURSE PLOTTED FOR ${best.station.toUpperCase()}, ${best.system.toUpperCase()}: ${commodity(id).name.toUpperCase()} SELLS FOR ${best.price}CR THERE`); sfx.select(); }
        }
        if (pressed("v")) { const n = inp.isDown("Shift") ? 10 : 1; const line = buyStake(g.world, st, n); g.toast(line); if (line.includes("HELD")) { sfx.select(); if (totalShares(p) >= 25) flag(g, "shareholder"); } }
        // Enter follows the displayed action. B and S always buy and sell explicitly.
        const holding = (p.cargo[id] ?? 0) > 0;
        const wantSell = pressed("s") || pressed("Backspace") || (enter && holding);
        const wantBuy = pressed("b") || (enter && !holding);
        // Shift trades in bulk: a stack of ten bought, or the whole hold of it sold. Prices move with every unit.
        const bulk = inp.isDown("Shift");
        const buyQty = wantBuy ? (bulk ? 10 : 1) : 0;
        const sellQty = wantSell ? (bulk ? (p.cargo[id] ?? 0) : 1) : 0;
        let bought = 0, spent = 0;
        const creditsBefore = p.credits;
        for (let k = 0; k < buyQty; k++) {
          const price = buyPrice(st, id, rep);
          if ((st.stock[id] ?? 0) <= 0) { g.toast("OUT OF STOCK"); break; }
          if (p.credits < price) { g.toast("NOT ENOUGH CREDITS"); break; }
          if (!addCargo(p, id, 1)) { g.toast("CARGO FULL"); break; }
          p.credits -= price; st.stock[id]--; spent += price; bought++; refreshPrices(st);
          g.showHint("trade", "PRICES MOVE: BUY WHERE STOCK IS HIGH, SELL WHERE IT'S LOW");
        }
        if (bought > 1) g.toast(`BOUGHT ${bought} ${commodity(id).name.toUpperCase()} FOR ${spent}CR`);
        ledger(p, "buys", p.credits - creditsBefore);
        const sellBefore = p.credits;
        let sold = 0, earned = 0; let waterSold = 0;
        for (let k = 0; k < sellQty; k++) {
          const rare = commodity(id).rare;
          const illegal = commodity(id).illegal;
          const fence = illegal && blackMarket(g.world, st);
          const price = rare ? rareSellPrice(g.world, st, id, rep) : Math.round(sellPrice(st, id, rep) * (fence ? 1.3 : 1));
          if (!removeCargo(p, id, 1)) g.toast("NONE IN CARGO");
          else if (illegal && !fence && Math.random() < 0.12) {
            // customs sting: the crate is gone and so is some goodwill
            adjustRep(g.world, st.factionId, -5);
            recordOffence(g.world, 0.1, st.factionId);
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
            p.credits += paid; p.tradeRevenue = (p.tradeRevenue ?? 0) + paid; sold++; earned += paid; if (id === "water" && isBeltStation(st)) waterSold++;
            if (!rare || st.rare === id) { st.stock[id] = (st.stock[id] ?? 0) + 1; refreshPrices(st); }
            if (rare && st.rare !== id) { p.rareRevenue = (p.rareRevenue ?? 0) + price; if (!p.flags?.rareRun) flag(g, "rareRun"); }
          }
        }
        if (sold > 1) g.toast(`SOLD ${sold} ${commodity(id).name.toUpperCase()} FOR ${earned}CR`);
        if (waterSold > 0) { const dry = !!droughtAt(g.world, st.id); p.waterToBelt = (p.waterToBelt ?? 0) + waterSold * (dry ? 3 : 1); if (dry) { g.toast(`THE ROCK IS ON RATION AND YOUR TANK JUST CAME IN. ${waterSold} UNIT${waterSold > 1 ? "S" : ""}, AND EVERY DECK HEARD THE TANNOY SAY SO.`); flag(g, "tanker"); } const bl = beltGain(g.world, waterSold * (dry ? 0.3 : 0.1)); if (bl) g.toast(bl); else if (waterSold >= 5) g.toast("THE ROCK TAKES THE WATER AND SAYS SO ON THE TANNOY. THE BELT REMEMBERS WHO BRINGS IT."); if ((p.waterToBelt ?? 0) >= 50) flag(g, "waterbearer"); }
        ledger(p, "trade", p.credits - sellBefore);
        break;
      }
      case "SHIPYARD": {
        const options = this.shipyardOptions(g);
        this.cursor = clamp(this.cursor, 0, options.length - 1);
        if (enter && options[this.cursor]) ledgerAround(p, "yard", () => options[this.cursor].action());
        break;
      }
      case "SHIPS": {
        const rows = this.shipRows(g);
        this.cursor = clamp(this.cursor, 0, rows.length - 1);
        const row = rows[this.cursor];
        if (!row) break;
        if (enter) {
          if (row.kind === "market") this.buyHull(g, row.hull.id, false);
          else if (row.kind === "parked") this.swapShip(g, row.ship);
          else if (row.kind === "remote") { this.takeTheLiner(g, row.ship); return; }
        }
        if (pressed("k") && row.kind === "market") this.buyHull(g, row.hull.id, true);
        if (pressed("l") && row.kind === "remote") { this.takeTheLiner(g, row.ship); return; }
        if (pressed("w") && row.kind === "parked") this.putToWork(g, row.ship);
        if (pressed("x") && row.kind === "parked") this.scrapHull(g, row.ship);
        if (pressed("r") && row.kind === "working") { this.releaseWorkingShip(g, row.charter); inp.flush(); }
        if (pressed("o")) {
          const PAINTS = ["#63f2c8", "#ff5a5a", "#ffd75a", "#5ab3ff", "#e060ff", "#ff9a3a", "#f2f4ff", "#3aa55e"];
          const i = PAINTS.indexOf(p.paint ?? "");
          p.paint = PAINTS[(i + 1) % PAINTS.length];
          g.spriteCache.delete(`player-ship-${p.hullId}-${p.paint}`);
          g.toast(`PAINT: ${["TEAL", "RED", "GOLD", "BLUE", "VIOLET", "ORANGE", "WHITE", "GREEN"][PAINTS.indexOf(p.paint)]} TRIM`);
          sfx.blip();
        }
        if (pressed("n")) {
          const raw = ask("Name your ship (2-18 characters):", p.shipName ?? "");
          if (raw !== null) {
            const n = raw.trim().toUpperCase().replace(/[^A-Z0-9 '\-]/g, "").slice(0, 18);
            if (n.length >= 2) { p.shipName = n; g.toast(`REGISTERED: ${n}`); sfx.select(); } else g.toast("NAME NOT ACCEPTED");
          }
        }
        break;
      }
      case "MISSIONS": {
        if (pressed("j") || (inp.mousePressed && inp.mouseX >= 392 && inp.mouseX < 476 && inp.mouseY >= 54 && inp.mouseY < 67)) { this.openMissionLog(g); return; }
        if (pressed("u") && p.service?.order) { g.toast(plotServiceOrder(g.world) ? "SERVICE COURSE SET. N IN FLIGHT FOLLOWS THE ROUTE." : "THE SERVICE ROUTE IS CLOSED. THE ORDERS CAN WAIT."); g.autosave(); return; }
        if (pressed("c") && p.council?.mandate) { g.toast(plotCouncilMandate(g.world) ? "COUNCIL COURSE SET. N IN FLIGHT FOLLOWS THE ROUTE." : "THE COUNCIL ROUTE IS CLOSED. THE PAPERS CAN WAIT."); g.autosave(); return; }
        if (Date.now() - this.goalFetched > 60_000) { this.goalFetched = Date.now(); this.flushGoal(); void wire.fetchGoal(this.goal.id).then((st) => { if (st) this.goalState = st; }); }
        const rows = this.missionRows(g);
        this.cursor = clamp(this.cursor, 0, Math.max(0, rows.length - 1));
        if (enter) {
          const row = rows[this.cursor];
          if (row?.ready) this.completeMission(g, row.m);
          else if (row) this.acceptMission(g, row.m);
        }
        break;
      }
      case "BAR": {
        if (pressed("o")) { this.openReply(); return; }
        if (pressed("r")) { g.settingsReturn = "station"; g.setScene("roster"); return; }
        const raceRow = st.military ? 0 : 1;
        const rows = st.barPatrons.length + this.candidates.length + this.fares.length + raceRow;
        this.cursor = clamp(this.cursor, 0, Math.max(0, rows - 1));
        if (enter) {
          if (raceRow && this.cursor === rows - 1) {
            p.racePending = st.id;
            this.barLine = `THE MARSHAL: 'YOU'RE IN. LAUNCH WHEN YOU'RE READY. ${RACE_GATES} RINGS ROUND THE STATION, IN ORDER. THE FIRST ONE STARTS YOUR CLOCK, THE LAST ONE STOPS IT. PRIZE MONEY FOR A CLEAN RUN, MORE UNDER PAR.'`;
            sfx.select();
          } else if (this.cursor < st.barPatrons.length) {
            const rng = new RNG((g.world.seed ^ (this.cursor * 7727) ^ Math.floor(g.world.time / 20)) >>> 0);
            const fr = friendsAt(g.world, st.id).find((c) => c.name === st.barPatrons[this.cursor]);
            if (fr && !p.companion) {
              const enc: Encounter = { id: "ride", where: "space", title: `${fr.name.toUpperCase()} - ${fr.ship.toUpperCase()}`, weight: 0, text: `${fr.name.toUpperCase()} PUSHES A GLASS ACROSS. 'I'VE GOT A FEW DAYS. IF YOU WANT COMPANY ON THE LANES, THE ${fr.ship.toUpperCase()} FLIES WELL ENOUGH, AND I DON'T MIND CORSAIRS.'`, options: [
                { label: `ASK THEM TO RIDE ALONG (${RIDE_ALONG_DOCKS} DOCKINGS)`, result: (g2) => { flag(g2, "rideAlong"); return askRideAlong(g2.world.player, fr); } },
                { label: "JUST TALK", result: (g2) => rng.pick(BAR_LINES)(g2, this.station).toUpperCase() },
                ...(p.missions.some((m) => m.favourFor === fr.id && !m.done) ? [] : [{ label: "ANYTHING I CAN CARRY FOR YOU?", result: (g2: Game) => { const m = favourFor(g2.world, fr, this.station, rng); if (!m) return `${fr.name.toUpperCase()} SHAKES THEIR HEAD. 'NOT THIS TIME. BUT THANK YOU FOR ASKING.'`; if (g2.world.player.missions.filter((x: Mission) => x.accepted && !x.done && x.kind !== "passenger").length >= 5) return "YOUR MISSION LOG IS FULL. ASK AGAIN WHEN IT ISN'T."; m.accepted = true; g2.world.player.missions.push(m); return `${fr.name.toUpperCase()} SLIDES SOMETHING ACROSS THE TABLE. '${m.desc.split(". ")[0].toUpperCase()}. NO HURRY. SOME HURRY.'`; } }]),
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
        const rows = this.storageRows(g);
        this.cursor = clamp(this.cursor, 0, Math.max(0, rows.length - 1));
        const row = rows[this.cursor];
        if (enter && row) {
          const box = p.storage[st.id] ??= {};
          if (row.kind === "held") {
            if (removeCargo(p, row.id, 1)) box[row.id] = (box[row.id] ?? 0) + 1;
          } else if (box[row.id] > 0 && addCargo(p, row.id, 1)) {
            box[row.id]--; if (box[row.id] <= 0) delete box[row.id];
          } else g.toast("CARGO FULL");
          const next = this.storageRows(g), selected = next.findIndex(r => r.kind === row.kind && r.id === row.id);
          this.cursor = selected >= 0 ? selected : clamp(this.cursor, 0, Math.max(0, next.length - 1));
          this.list.view.sync(next.map(r => `${r.kind}:${r.id}`)); this.list.view.select(this.cursor);
        }
        break;
      }
      case "NEWS":
        if (enter) { this.openDocument(g, false); return; }
        if (pressed("l")) { (g.scenes.letters as LettersScene).open(g, 0); return; }
        if (!st.military && st.factionId !== "vex" && (pressed("y") || pressed("n"))) { g.toast(castVote(g.world, st.factionId, pressed("y"))); sfx.select(); }
        if (pressed("r")) { const m = [...(p.mail ?? [])].reverse().find((x) => !x.replied); if (!m) g.toast("NO LETTERS WAITING FOR AN ANSWER"); else { g.toast(replyToLetter(g.world, m)); sfx.letter(); } }
        break;
      case "WIRE":
        if (enter) { this.openDocument(g, false); return; }
        if (!this.wireLoaded) { this.wireLoaded = true; void this.loadWire(); }
        if (pressed("c")) { void this.chooseCallsign(g); }
        break;
      case "SURVEY":
        if (pressed("c")) { this.surveyView = this.surveyView === "codex" ? "data" : "codex"; sfx.blip(); }
        if ((enter || click(SELL_DATA)) && this.surveyView === "data") this.sellExploration(g);
        else if (enter) this.openDocument(g, false);
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
            flag(g, "engineer");
            g.toast(`${bp.name.toUpperCase()} GRADE ${engGrade(p, bp.id)} APPLIED`);
            sfx.repair();
          }
        }
        break;
      }
      case "RECORD":
        if (enter) { this.openDocument(g, false); return; }
        if (pressed("l")) { this.recordView = this.recordView === "log" ? "achievements" : "log"; this.cursor = 0; sfx.blip(); }
        if (pressed("b")) { this.recordView = this.recordView === "ledger" ? "achievements" : "ledger"; this.cursor = 0; sfx.blip(); }
        if (pressed("p")) { this.recordView = this.recordView === "guestbook" ? "achievements" : "guestbook"; this.cursor = 0; sfx.blip(); }
        if (pressed("w")) { this.recordView = this.recordView === "week" ? "achievements" : "week"; this.cursor = 0; sfx.blip(); }
        if (pressed("o")) { this.recordView = this.recordView === "harbour" ? "achievements" : "harbour"; this.cursor = 0; sfx.blip(); }
        if (pressed("c")) { g.settingsReturn = "station"; g.setScene("chronicle"); return; }
        if (pressed("x")) {
          try {
            const text = chronicleText(g.world, wire.getCallsign());
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
            a.download = `farspace-chronicle-${(p.shipName ?? "ship").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.txt`;
            document.body.appendChild(a); a.click(); a.remove();
            g.toast("CHRONICLE SAVED AS A TEXT FILE"); sfx.pickup(); flag(g, "chronicle");
          } catch { g.toast("CHRONICLE EXPORT FAILED"); }
        }
        break;
    }
  }

  squadrons: wire.Squadron[] = [];
  patrons: Record<string, string> = {};
  recordView: "achievements" | "log" | "ledger" | "guestbook" | "week" | "harbour" = "achievements";
  surveyView: "data" | "codex" = "data";
  raceRecords: wire.RaceRec[] | null = null; // the wire's course records for this station
  tannoy = ""; tannoyT = 4; tannoyDur = 8;
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
    if (m.accepted || m.done || p.missions.some(x => x.id === m.id)) { g.toast("ALREADY ON YOUR MISSION LOG"); return; }
    if (m.passengerKind === "singer") { const reason = singerBoardingReason(g.world, m, st.id); if (reason) { g.toast(reason); return; } }
    if (m.kind !== "passenger" && p.missions.filter((x) => x.accepted && !x.done && x.kind !== "passenger").length >= 5) { g.toast("MISSION LOG FULL"); return; }
    if (m.kind === "passenger" && passengersAboard(p).length >= passengerCap(p)) { g.toast(passengerCap(p) === 1 ? "ONE PASSENGER WITHOUT CABINS - FIT PASSENGER CABINS AT A SHIPYARD" : `ALL ${passengerCap(p)} CABINS TAKEN`); return; }
    if (m.tier && m.tier > missionTier(p.rep[st.factionId] ?? 0)) { g.toast("YOUR STANDING ISN'T HIGH ENOUGH"); return; }
    if (!m.rally && (m.kind === "delivery" || (m.kind === "arc" && m.commodityId && m.arcStage !== undefined && ARCS[m.arcFaction!].stages[m.arcStage].kind === "delivery")) && m.commodityId && m.qty) {
      if (!addCargo(p, m.commodityId, m.qty)) { g.toast("NOT ENOUGH CARGO SPACE"); return; }
    }
    m.accepted = true;
    let impressed = "";
    if (m.kind === "passenger" && m.mood !== undefined && p.raceBeaten?.[st.id]) { m.mood = Math.min(100, m.mood + 5); impressed = `${(m.passengerName ?? "YOUR FARE").toUpperCase()} HAS HEARD YOU HOLD THE RINGS HERE. THEY BOARD IMPRESSED.`; }
    p.missions.push(m);
    schoolAccepted(g.world, m);
    this.fares = this.fares.filter((f) => f !== m);
    if (m.passengerKind === "singer") {
      this.fares = this.fares.filter(f => f.passengerKind !== "singer");
      p.navTarget = m.targetSystemId; p.singersCourse = true; delete p.navStationId;
      g.toast(`${(m.passengerName ?? "THE SINGER").toUpperCase()} BOARDS. ${m.lightReward ?? 25} LIGHT AT HOME. COURSE PLOTTED.`);
      g.autosave(); return;
    }
    if (m.kind === "passenger" && m.demand) g.toast(`${(m.passengerName ?? "").toUpperCase()} MENTIONS THEY'D APPRECIATE ${commodity(m.demand).name.toUpperCase()} ABOARD`);
    if (m.kind === "repair") { g.tenderMission = m; g.toast("SUITING UP - THE PLANT IS THROUGH THE YARD DOOR"); sfx.repair(); g.setScene("repair"); return; }
    if (m.kind === "convoy") { p.convoyPending = m.id; g.toast("THE CONVOY LEAD NODS. 'WE LAUNCH WHEN YOU DO. DON'T LOSE US.'"); sfx.select(); return; }
    g.toast(impressed || "MISSION ACCEPTED");
    if (m.kind === "escort") g.showHint("escort", "THE FREIGHTER LAUNCHES WHEN YOU UNDOCK - STAY CLOSE");
    if (m.kind === "research") g.showHint("research", "IN THE TARGET SYSTEM, HOLD V TO DEEP-SCAN FOR THE SIGNAL");
    if (m.kind === "passenger") g.showHint("passenger", "YOUR PASSENGER IS IN THE BUNK ROOM - TALK TO THEM ABOARD (I)");
  }

  completeMission(g: Game, m: Mission): void {
    const p = g.world.player;
    const receiptDue = !m.done && p.missions.includes(m) && p.dockedAt === this.station.id && missionDeliverable(g.world, m, this.station);
    const schoolDelivery = p.flightSchool?.missionId === m.id && p.dockedAt === this.station.id && missionDeliverable(g.world, m, this.station);
    ledgerAround(p, m.kind === "passenger" ? "fares" : "contracts", () => this.completeMissionInner(g, m));
    if (receiptDue && m.done) p.lastContractReceipt = { id: m.id, title: m.title, time: g.world.time, stationId: this.station.id };
    if (schoolDelivery && m.done && p.flightSchool) p.flightSchool.delivered = true;
  }
  completeMissionInner(g: Game, m: Mission): void {
    if (m.done || m.passengerKind === "singer") return;
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
    if (m.kind === "emergency") { const late = m.byT !== undefined && g.world.time > m.byT; const eng = p.crew.find((c) => c.role === "engineer" && !c.sick); if (late) m.reward = Math.round(m.reward / 2); else flag(g, "emergency"); p.lives = (p.lives ?? 0) + (late ? 4 : 12); const x = eng ? crewXp(p, "engineer", 3) : null; if (x) g.toast(x); if (eng) { eng.morale = Math.min(100, eng.morale + 6); eng.loyalty = (eng.loyalty ?? 0) + 0.2; } logEntry(g.world, `Answered ${st.name}'s emergency with ${eng?.name ?? "an engineer"}${late ? ", late" : ", in time"}`); g.toast(late ? `${(eng?.name ?? "THE ENGINEER").toUpperCase()} GOES DOWN THE GANGWAY AT A RUN. LATE, BUT NOT TOO LATE. HALF PAY. FOUR LIVES.` : `${(eng?.name ?? "THE ENGINEER").toUpperCase()} GOES DOWN THE GANGWAY AT A RUN AND THE STATION'S LIGHTS STEADY AN HOUR LATER. TWELVE LIVES.`); }
    if (m.kind === "passenger" && m.treaty) { const o = envoyOutcome(g.world, m); for (const l of o.lines) g.toast(l); if (o.ok) { flag(g, "treaty"); (g.world.mailQueue ??= []).push({ dueT: g.world.time + 800, from: `${m.passengerName ?? "the envoy"}, after the signing`, text: `It's signed. Both sides think they won, which is how you know it's a good one. I've told the ministry which hull carried me and that the captain sat me at the top of the table, or didn't, and either way didn't shoot back. Enclosed: the pen. It only writes in one colour. That was the point of the treaty too.`, gift: { credits: 200 } }); (p.keepsakes ??= []).push(`the pen from ${m.passengerName ?? "an envoy"}'s treaty`); if (p.keepsakes.length > 8) p.keepsakes.shift(); } }
    if (m.kind === "passenger" && m.evac) { const n = m.party ?? 1; p.lives = (p.lives ?? 0) + n; p.evacuated = (p.evacuated ?? 0) + n; flag(g, "evac"); if ((p.evacuated ?? 0) >= 30) flag(g, "lifeboat"); logEntry(g.world, `Carried ${n} out of ${findStation(g.world, m.fromStationId)?.st.name ?? "a station"} to ${st.name}`); g.toast(`${n} PEOPLE DOWN THE GANGWAY WITH WHAT THEY COULD CARRY. ${n} LIVES. THE HARBOURMASTER COUNTS THEM TWICE.`); }
    if (m.kind === "passenger" && m.passengerKind === "prisoner") { const o = prisonerOutcome(g.world, m, new RNG((g.world.seed ^ Math.floor(g.world.time * 7)) >>> 0)); for (const l of o.lines) g.toast(l); if (o.ok) flag(g, "prisoner"); }
    if (m.kind === "passenger" && m.passengerKind === "patient") { const o = patientOutcome(g.world, m); for (const l of o.lines) g.toast(l); if (o.ok) flag(g, "medevac"); else m.reward = Math.round(m.reward / 2); }
    const fest = m.kind === "passenger" && galaxyEventAt(g.world, p.systemId)?.kind === "festival" && galaxyEventAt(g.world, p.systemId)?.stationId === st.id;
    const charter = hasCharter(g.world, st.factionId) && !m.syndicate ? 1.15 : 1;
    const base = Math.round((m.kind === "passenger" && m.mood !== undefined ? passengerPay(m) : m.reward) * (m.kind === "passenger" && isOccasion("founders") ? 1.5 : 1));
    p.credits += Math.round((fest ? base * 2 : base) * charter);
    if (fest) g.toast("FESTIVAL WEEK - YOUR PASSENGERS PAID DOUBLE");
    if (m.kind === "passenger" && m.mood !== undefined && hasSpecialty(p, "steward")) m.mood = Math.min(100, m.mood + 5);
    if (m.kind === "passenger" && m.mood !== undefined) (p.lastFareMood ??= {})[st.id] = m.mood;
    if (m.kind === "passenger" && m.mood !== undefined) { const e = signGuestbook(g.world, m, st.name, new RNG((g.world.seed ^ Math.floor(g.world.time * 19)) >>> 0)); if (m.returning) flag(g, "regular"); if (m.mood >= 75) g.toast(`${e.name.toUpperCase()} SIGNS THE GUESTBOOK: "${e.line.toUpperCase()}"`); }
    if (m.kind === "passenger" && m.requestMet && m.tip) flag(g, "tipped");
    if (m.kind === "delivery" && isBeltStation(st) && / run: /.test(m.title)) { const bl = beltGain(g.world, 0.5); if (bl) g.toast(bl); }
    { const l = leaveLostItem(p, m, st.id, g.world.time, new RNG((g.world.seed ^ Math.floor(g.world.time * 23)) >>> 0)); if (l) { g.toast(l); logEntry(g.world, l.toLowerCase().split(". ")[0]); } }
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
    if (m.rally) { pushInfluence(g.world, p.systemId, st.factionId, 4); g.toast(`RALLY DELIVERED. THE ${faction(st.factionId).name.toUpperCase()} COUNT IT: A BIG PUSH TO HOLD ${g.world.systems[p.systemId].name.toUpperCase()}.`); flag(g, "rally"); }
    else if (m.kind === "delivery" || m.kind === "post" || m.kind === "passenger") { if (pushInfluence(g.world, p.systemId, st.factionId, m.kind === "delivery" ? 2 : 1)) g.toast(`THE ${faction(st.factionId).name.toUpperCase()} NOTE WHO KEEPS ${st.name.toUpperCase()} SUPPLIED. YOUR PUSH IN THE BORDER CONTEST COUNTS.`); }
    if (m.kind === "photo") { const hung = hangPicture(g.world, st, m, wire.getCallsign() ?? p.captainName ?? "an independent pilot"); if (hung) g.toast(hung); }
    if (m.kind === "photo") { flag(g, "stringer"); void wire.post("discover", `sold a picture of ${m.photo?.label ?? "something"}`, g.world.systems[p.systemId].name); }
    if (m.kind === "post" && m.favourFor) { const line = favourDone(g.world, m, new RNG((g.world.seed ^ Math.floor(g.world.time * 23)) >>> 0)); if (line) g.toast(line); flag(g, "favour"); }
    else if (m.kind === "post") { const note = postDelivered(g.world, new RNG((g.world.seed ^ Math.floor(g.world.time * 13)) >>> 0)); if (note) g.toast(note); if ((p.postRuns ?? 0) >= 10) flag(g, "postman"); }
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
    recordServiceFareDelivery(g.world, m);
    { const line = syncServiceFares(g.world); if (line) g.toast(line); }
    p.missions = p.missions.filter((x) => !x.done);
    p.hints.firstMission ||= true;
  }

  hire(g: Game, c: CrewMember): void {
    const p = g.world.player;
    if (p.crew.length === 0) g.showHint("bridge", "A CREW MAKES A BRIDGE: Y CYCLES ALERT IN FLIGHT, E AT THE STUDY FOR THE BRIEFING, R FOR THE ROSTER, THE PAUSE MENU FOR THE READY ROOM");
    const slots = hull(p.hullId).crewSlots;
    const cost = c.wage * 3;
    if (berthsUsed(p) >= slots) { g.toast(`NO BERTHS LEFT (${slots} ON THIS HULL${(p.shoreCrew ?? []).length ? ", ONE KEPT FOR CREW ON LEAVE" : ""})`); return; }
    if (p.credits < cost) { g.toast(`SIGNING BONUS ${cost}CR - NOT ENOUGH`); return; }
    p.credits -= cost; ledger(p, "crew", -cost);
    p.crew.push({ ...c, home: this.station.id, docks: 0 });
    if (c.trait === "tells stories about the Steady Hand") flag(g, `serialHire:${this.station.id}`);
    this.candidates = this.candidates.filter((x) => x !== c);
    g.toast(`${c.name.toUpperCase()} SIGNED ON AS ${ROLE_INFO[c.role].label}`);
    g.showHint("crew", "CREW LIVE ABOARD - VISIT THEM WITH I - KEEP FOOD IN CARGO");
  }

  // Park the current hull here and take another one out of storage
  // The yard buys a parked hull for scrap and parts: less than a trade-in, but it's credits today
  scrapHull(g: Game, ship: StoredShip | undefined): void {
    if (!ship) return;
    const p = g.world.player; const h = hull(ship.hullId);
    if (!p.fleet?.includes(ship) || ship.stationId !== this.station.id || ship.hullId === SERVICE_CUTTER.id) { g.toast("THAT OWNED HULL IS NOT PARKED HERE"); return; }
    const price = hullSalePrice(ship);
    if (!confirmBox(`Sell ${ship.name ?? h.name} to this yard for ${price}cr? The ship will leave your fleet.`)) return;
    p.fleet = (p.fleet ?? []).filter((f) => f !== ship);
    p.credits += price; ledger(p, "yard", price);
    logEntry(g.world, `Sold ${ship.name ?? h.name} at ${this.station.name} for ${price}cr`); flag(g, "scrapped");
    g.toast(`SOLD ${(ship.name ?? h.name).toUpperCase()} FOR ${price}CR.`); sfx.select(); g.autosave();
  }
  // A parked hull of yours goes to work on your best known run from here, with a hired crew
  putToWork(g: Game, ship: StoredShip | undefined): void {
    if (!ship) return;
    const p = g.world.player; const st = this.station;
    if (!p.fleet?.includes(ship) || ship.stationId !== st.id || ship.hullId === SERVICE_CUTTER.id) { g.toast("THAT OWNED HULL IS NOT PARKED HERE"); return; }
    const best = this.bestRoute(g);
    const toId = best ? Object.keys(p.marketMemory ?? {}).find((id) => findStation(g.world, id)?.st.name === best.station) : null;
    if (!best || !toId) { g.toast("NO KNOWN RUN FROM HERE YET - DOCK AT ANOTHER STATION AND COME BACK"); return; }
    const h = hull(ship.hullId);
    if (!confirmBox(`Put the ${ship.name ?? h.name} to work on the ${st.name} - ${best.station} run (${commodity(best.id).name})? A crew costs ${OWN_HULL_CREW_FEE}cr; release her on the SHIPS tab (R) to get the hull back.`)) return;
    const r = crewOwnHull(g.world, ship, st.id, toId, best.id, new RNG((g.world.seed ^ Math.floor(g.world.time * 31)) >>> 0));
    if (typeof r === "string") { g.toast(r); return; }
    g.toast(`THE ${r.name.toUpperCase()} SAILS FOR ${best.station.toUpperCase()} WITH A HIRED CREW. FIRST TRIP IN ${Math.round(r.tripSecs / 60)} MINUTES.`); sfx.dock();
    logEntry(g.world, `Put the ${r.name} to work on the ${st.name} - ${best.station} run`); flag(g, "fleetAtWork");
  }
  // Passage on a liner to wherever your other ship is parked. This one stays here; the crew come with you.
  takeTheLiner(g: Game, selected?: StoredShip): void {
    const loanReason = loanHullChangeReason(g.world.player); if (loanReason) { g.toast(loanReason); return; }
    const p = g.world.player; const w = g.world;
    const elsewhere = (p.fleet ?? []).filter((f) => f.stationId !== this.station.id).map((f) => ({ f, hops: charterRoute(w, this.station.id, f.stationId).hops })).sort((a, b) => a.hops - b.hops);
    if (!elsewhere.length) { g.toast("NO SHIP OF YOURS PARKED ANYWHERE ELSE"); return; }
    if (passengersAboard(p).length) { g.toast("YOUR PASSENGERS BOOKED A SHIP, NOT A LINER. LAND THEM FIRST"); return; }
    const choice = selected ? elsewhere.find(row => row.f === selected) : elsewhere[0];
    if (!choice) { g.toast("THAT OWNED HULL IS NOT PARKED ELSEWHERE"); return; }
    const { f, hops } = choice;
    const dest = findStation(w, f.stationId); if (!dest) return;
    const h = hull(f.hullId);
    if (cargoUsed(p) > 0) { g.toast("THE LINER TAKES PEOPLE, NOT CARGO. STORE OR SELL YOUR HOLD FIRST"); return; }
    const transferReason = hullTransferReason(p, f.hullId); if (transferReason) { g.toast(transferReason); return; }
    const fare = (120 + 140 * hops) * (1 + p.crew.length);
    if (p.credits < fare) { g.toast(`PASSAGE FOR YOU AND ${p.crew.length} CREW IS ${fare}CR. YOU'RE SHORT`); return; }
    if (!confirmBox(`Take the liner to ${dest.st.name}, ${dest.sys.name} (${hops} jump${hops > 1 ? "s" : ""}) for ${fare}cr? The ${(p.shipName ?? hull(p.hullId).name)} stays parked here; you fly the ${f.name ?? h.name} from there.`)) return;
    p.credits -= fare; ledger(p, "yard", -fare);
    // park this one, board that one
    const parked: StoredShip = { hullId: p.hullId, stationId: this.station.id, name: p.shipName, hull: p.hull, torpedoes: p.torpedoes ?? 0 };
    p.fleet = (p.fleet ?? []).filter((x) => x !== f); p.fleet.push(parked);
    applyHull(p, f.hullId); this.commission(g); p.hull = Math.min(p.hullMax, f.hull); p.fuel = p.fuelMax * 0.5; p.torpedoes = f.torpedoes; p.shipName = f.name;
    g.spriteCache.delete(`player-ship-${p.hullId}`);
    // the journey: time passes, the crew rest
    const secs = 90 * hops;
    for (let i = 0; i < secs; i++) tickWorld(w, 1);
    w.time += secs;
    for (const c of p.crew) c.morale = Math.min(100, c.morale + 4);
    p.systemId = dest.sys.id; beginDockVisit(w, dest.st.id);
    p.x = Math.cos(dest.st.angle) * dest.st.orbit; p.y = Math.sin(dest.st.angle) * dest.st.orbit; p.vx = 0; p.vy = 0;
    logEntry(w, `Took the liner to ${dest.st.name} to pick up the ${f.name ?? h.name}`);
    flag(g, "liner");
    sfx.jump();
    g.toast(`${hops * 3} HOURS ON A LINER: BAD COFFEE, A GOOD VIEW. YOU WAKE UP AT ${dest.st.name.toUpperCase()}. THE ${(f.name ?? h.name).toUpperCase()} IS WAITING`);
    g.setScene("station");
  }
  swapShip(g: Game, ship: StoredShip | undefined): void {
    const loanReason = loanHullChangeReason(g.world.player); if (loanReason) { g.toast(loanReason); return; }
    if (!ship) return;
    const p = g.world.player;
    const h = hull(ship.hullId);
    if (!p.fleet?.includes(ship) || ship.stationId !== this.station.id || ship.hullId === SERVICE_CUTTER.id) { g.toast("THAT OWNED HULL IS NOT PARKED HERE"); return; }
    const transferReason = hullTransferReason(p, ship.hullId); if (transferReason) { g.toast(transferReason); return; }
    const parked: StoredShip = { hullId: p.hullId, stationId: this.station.id, name: p.shipName, hull: p.hull, torpedoes: p.torpedoes ?? 0 };
    p.fleet = (p.fleet ?? []).filter((f) => f !== ship);
    p.fleet.push(parked);
    const fuel = p.fuel;
    applyHull(p, ship.hullId); this.commission(g);
    p.hull = Math.min(p.hullMax, ship.hull);
    p.fuel = Math.min(p.fuelMax, fuel);
    p.torpedoes = ship.torpedoes;
    p.shipName = ship.name;
    g.spriteCache.delete(`player-ship-${p.hullId}`);
    g.toast(`SWAPPED TO THE ${(ship.name ?? h.name).toUpperCase()} - ${(parked.name ?? hull(parked.hullId).name).toUpperCase()} PARKED HERE`);
    sfx.dock();
  }

  buyHull(g: Game, id: string, keepOld: boolean): void {
    const loanReason = loanHullChangeReason(g.world.player); if (loanReason) { g.toast(loanReason); return; }
    if (!HULLS.some(h => h.id === id)) { g.toast("THAT HULL IS NOT OFFERED FOR SALE"); return; }
    const p = g.world.player;
    const h = hull(id);
    if (p.hullId === id) { g.toast("THIS IS YOUR CURRENT HULL"); return; }
    const tradeIn = keepOld ? 0 : Math.round(hull(p.hullId).price * 0.6);
    const cost = Math.max(0, h.price - tradeIn);
    if (p.credits < cost) { g.toast(keepOld ? `NEED ${cost}CR TO BUY WITHOUT TRADE-IN` : `NEED ${cost}CR AFTER TRADE-IN`); return; }
    const transferReason = hullTransferReason(p, id); if (transferReason) { g.toast(transferReason); return; }
    p.credits -= cost;
    if (keepOld) {
      (p.fleet ??= []).push({ hullId: p.hullId, stationId: this.station.id, name: p.shipName, hull: p.hull, torpedoes: p.torpedoes ?? 0 });
      p.shipName = undefined;
      p.torpedoes = 0;
      flag(g, "fleet");
    }
    applyHull(p, id); this.commission(g);
    g.spriteCache.delete(`player-ship-${p.hullId}`);
    p.hullHistory = hullHistoryFor(g.world, new RNG((g.world.seed ^ Math.floor(g.world.time * 71)) >>> 0));
    g.toast(keepOld ? `WELCOME ABOARD THE ${h.name.toUpperCase()} - YOUR OLD HULL IS PARKED HERE` : `WELCOME ABOARD THE ${h.name.toUpperCase()}`);
    if (p.hullHistory) { logEntry(g.world, `Took on a hull once flown by ${p.hullHistory.previous}: ${p.hullHistory.quirk}`); setTimeout(() => g.toast(`SHE WAS ${p.hullHistory!.previous.toUpperCase()}'S BEFORE YOU. THERE'S ${p.hullHistory!.quirk.toUpperCase()}.`), 2600); }
    sfx.dock();
    void wire.post("hull", `took delivery of a ${h.name}`, g.world.systems[p.systemId].name);
  }

  shipyardOptions(g: Game): YardOption[] {
    const p = g.world.player;
    const st = this.station;
    const opts: YardOption[] = [];
    if (p.service?.loan) {
      const loan = p.service.loan;
      opts.push({ id: "loan-return", label: "RETURN SERVICE CUTTER", sub: loanReturnReason(g.world) ?? "YOUR HELD SHIP IS READY. CURRENT CARGO AND CREW FIT. NO CHARGE.", action: () => { g.toast(returnServiceCutter(g.world, loan)); g.spriteCache.clear(); g.autosave(); } });
      opts.push({ id: "loan-depot", label: "PLOT SERVICE DEPOT", sub: loanSummary(g.world)!, action: () => { g.toast(plotLoanDepot(g.world) ? "DEPOT COURSE SET. N IN FLIGHT FOLLOWS IT." : "THE DEPOT ROUTE IS CLOSED. YOUR HELD SHIP CAN WAIT."); g.autosave(); } });
    }
    // patron squadrons keep their faction's yards half price for members
    const patronHere = (!!wire.getSquadron() && wire.patronOf(st.factionId) === wire.getSquadron()) || this.myBaseHere() || hasCharter(g.world, st.factionId);
    const depot = this.baseHas("depot");
    const hr = hoursRate(st);
    const homeMul = (isHome(p, st.id) ? 0.85 : 1) * (isOccasion("yard") ? 0.8 : 1) * (dockingsAt(p, st.id) >= OLD_HAND_AT ? 0.95 : 1) * hr.mul * beltRate(p, st);
    const hrTag = hr.label ? ` - ${hr.label}` : beltRate(p, st) < 1 ? " - BELT RATE" : "";
    const fuelPrice = depot ? 0 : Math.max(1, Math.round((patronHere ? Math.max(1, Math.round(st.fuelPrice / 2)) : st.fuelPrice) * homeMul / hr.mul));
    const repairPrice = depot ? 0 : Math.max(1, Math.round((patronHere ? Math.max(1, Math.round(st.repairPrice / 2)) : st.repairPrice) * homeMul));
    const fuelNeed = Math.ceil(p.fuelMax - p.fuel);
    opts.push({ id: "refuel", label: `REFUEL (${fuelNeed} UNITS)${patronHere ? " - PATRON RATE" : ""}`, sub: `${fuelNeed * fuelPrice}CR`, action: () => {
      if (fuelNeed <= 0) return g.toast("TANKS FULL");
      const afford = fuelPrice ? Math.min(fuelNeed, Math.floor(p.credits / fuelPrice)) : fuelNeed;
      p.fuel += afford; p.credits -= afford * fuelPrice;
      g.toast(afford < fuelNeed ? "PARTIAL REFUEL" : "REFUELED");
    } });
    const hullNeed = Math.ceil(p.hullMax - p.hull);
    opts.push({ id: "hull-repair", label: `HULL REPAIR (${hullNeed} PTS)${patronHere ? " - PATRON RATE" : hrTag}`, sub: `${hullNeed * repairPrice}CR`, action: () => {
      if (hullNeed <= 0) return g.toast("HULL INTACT");
      const afford = repairPrice ? Math.min(hullNeed, Math.floor(p.credits / repairPrice)) : hullNeed;
      p.hull += afford; p.credits -= afford * repairPrice;
      p.breaches = []; p.fires = [];
      g.toast(afford < hullNeed ? "PARTIAL REPAIR" : "HULL RESTORED");
    } });
    const sysDamaged = p.systems.filter((s) => s.health < 100);
    { const rk = commandRank(p); const reqKey = `requisition:${weekKey()}`; if (st.military && (rk === "COMMANDER" || rk === "CAPTAIN" || rk === "COMMODORE" || rk === "ADMIRAL") && !(p.flags ?? {})[reqKey]) {
      opts.push({ id: `requisition:${reqKey}`, label: `REQUISITION: FULL SERVICE ON THE WATCH (${rk}, ONCE A WEEK)`, sub: "0CR", action: () => {
        (p.flags ??= {})[reqKey] = true; p.hull = p.hullMax; p.breaches = []; p.fires = []; serviceHull(p, st.id, g.world.time, 0); for (const s of p.systems) s.health = 100; flag(g, "requisition");
        logEntry(g.world, `Requisitioned a full service at ${st.name} on the watch's account`);
        g.toast(`THE WATCH SIGNS FOR IT. HULL, SYSTEMS AND WEAR TO NEW. "COURTESY OF THE SERVICE, ${rk}. DON'T MAKE A HABIT OF IT."`); sfx.repair();
      } });
    } }
    if ((p.wear ?? 0) >= WEAR_SERVICE_FROM) {
      const price = servicePrice(p, (patronHere ? 0.7 : 1) * voteMods(g.world, st.factionId).yard * hr.mul);
      opts.push({ id: "wear-service", label: `YARD SERVICE (WEAR ${Math.round(p.wear ?? 0)}%)${patronHere ? " - PATRON RATE" : hrTag}`, sub: `${price}CR`, action: () => {
        if (p.credits < price) { g.toast("NOT ENOUGH CREDITS"); return; }
        p.credits -= price; serviceHull(p, st.id, g.world.time, price);
        logEntry(g.world, `Yard service at ${st.name}, ${price}cr, signed`);
        g.toast(`SERVICED AND SIGNED IN THE BERTH LOG. SHE'LL FLY LIKE NEW.`); sfx.repair();
      } });
    }
    opts.push({ id: "systems-service", label: `SERVICE ALL SYSTEMS (${sysDamaged.length})`, sub: `${sysDamaged.length * 60}CR`, action: () => {
      if (!sysDamaged.length) return g.toast("ALL SYSTEMS NOMINAL");
      const cost = sysDamaged.length * 60;
      if (p.credits < cost) return g.toast("NOT ENOUGH CREDITS");
      p.credits -= cost;
      for (const s of p.systems) s.health = 100;
      g.toast("SYSTEMS SERVICED");
    } });
    opts.push({ id: "parts", label: "BUY SPARE PARTS KIT", sub: `${st.prices["parts"] ?? 45}CR`, action: () => {
      const cost = st.prices["parts"] ?? 45;
      if (p.credits < cost) return g.toast("NOT ENOUGH CREDITS");
      if (!addCargo(p, "parts", 1)) return g.toast("CARGO FULL");
      p.credits -= cost; g.toast("PARTS STOWED IN CARGO");
    } });
    opts.push({ id: "seismic", label: `SEISMIC CHARGES x3 (NOW ${p.seismic ?? 0})`, sub: "300CR", action: () => {
      if (p.credits < 300) return g.toast("NOT ENOUGH CREDITS");
      p.credits -= 300; p.seismic = (p.seismic ?? 0) + 3; g.toast("CHARGES RACKED - PLANT ON A CORE ROCK WITH C");
    } });
    opts.push({ id: "torpedoes", label: `TORPEDOES x4 (NOW ${p.torpedoes ?? 0})`, sub: "240CR", action: () => {
      if (p.credits < 240) return g.toast("NOT ENOUGH CREDITS");
      p.credits -= 240; p.torpedoes = (p.torpedoes ?? 0) + 4; g.toast("TORPEDOES RACKED - FIRE WITH R");
    } });
    for (const m of MODULES) {
      if (hasModule(p, m.id)) continue;
      opts.push({ id: `module:${m.id}`, label: `FIT ${m.name.toUpperCase()}`, sub: `${m.price}CR`, action: () => {
        if (p.credits < m.price) return g.toast("NOT ENOUGH CREDITS");
        if (hasModule(p, m.id)) return g.toast("THIS MODULE IS ALREADY FITTED");
        rememberYardFittings(p);
        p.credits -= m.price;
        (p.modules ??= []).push(m.id);
        refreshFittedStats(p);
        if (m.shield) p.shield = p.shieldMax;
        flag(g, "outfitted");
        g.toast(`${m.name.toUpperCase()} FITTED - ${m.desc.toUpperCase()}`);
      } });
    }
    for (const f of FURNISHINGS) {
      if ((p.furnishings ?? []).includes(f.id)) continue;
      opts.push({ id: `furniture:${f.id}`, label: `FOR THE DECK: ${f.name.toUpperCase()}`, sub: `${f.price}CR`, action: () => {
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
        opts.push({ id: `charter:${best.id}:${toId}`, label: `CHARTER A HAULER: ${commodity(best.id).name.toUpperCase()} TO ${best.station.toUpperCase()} (${(p.haulers ?? []).length}/${CHARTER_CAP})`, sub: `${CHARTER_PRICE}CR - RUNS YOUR BEST KNOWN ROUTE WHILE YOU FLY, ${Math.round(CHARTER_CUT * 100)}% OF THE MARGIN IS YOURS, PAID WHEN YOU DOCK`, action: () => {
          const r = hireCharter(g.world, st.id, toId, best.id, new RNG((g.world.seed ^ Math.floor(g.world.time * 29)) >>> 0));
          if (typeof r === "string") return g.toast(r);
          g.toast(`${r.name.toUpperCase()} SIGNED ON THE ${st.name.toUpperCase()} - ${best.station.toUpperCase()} RUN. FIRST TRIP IN ${Math.round(r.tripSecs / 60)} MINUTES.`); sfx.dock();
          logEntry(g.world, `Chartered ${r.name} on the ${st.name} - ${best.station} run`); flag(g, "shippingLine");
          void wire.post("trade", `chartered ${r.name} on the ${st.name} - ${best.station} run`, g.world.systems[p.systemId].name);
        } });
      } else if (!best && (p.haulers ?? []).length < CHARTER_CAP) {
        opts.push({ id: "charter-unavailable", label: "CHARTER A HAULER", sub: "VISIT ANOTHER MARKET FIRST: A CHARTER RUNS YOUR BEST KNOWN ROUTE FROM HERE", action: () => g.toast("NO KNOWN RUN FROM HERE YET - DOCK AT ANOTHER STATION AND COME BACK") });
      }
    }
    if (!isHome(p, st.id)) opts.push({ id: "home-port", label: "MAKE THIS YOUR HOME PORT", sub: `YARD PRICES -15% HERE, CREW SETTLE, THE CHRONICLE NAMES IT${p.homePort ? " (REPLACES " + (findStation(g.world, p.homePort)?.st.name.toUpperCase() ?? "?") + ")" : ""}`, action: () => { setHomePort(p, st.id); logEntry(g.world, `${st.name} is home port now`); g.toast(`${st.name.toUpperCase()} IS HOME. THE HARBOURMASTER WRITES IT DOWN.`); sfx.select(); flag(g, "homePort"); } });
    if (st.type === "research" && (p.cargo.relics ?? 0) > 0) opts.push({ id: "donate-relic", label: "DONATE A RELIC TO THE MUSEUM", sub: "STANDING UP, A CARD WITH YOUR NAME UNDER THE GLASS", action: () => { const l = donateRelic(g.world, st, p.captainName ?? wire.getCallsign() ?? (p.shipName ? `the ${p.shipName}` : "an independent captain")); if (l) { g.toast(l); sfx.pickup(); flag(g, "donor"); } } });
    opts.push({ id: "rest", label: "REST A WHILE (TEN MINUTES OF SHIP TIME)", sub: "MARKETS BREATHE, TILLS FILL, THE SICK MEND, CREW SETTLE", action: () => {
      const lines = restAtDock(g.world);
      g.toast(lines[0] ?? "TEN MINUTES PASS. THE DECK HUMS. NOTHING BROKE."); for (const l of lines.slice(1)) g.toast(l);
      refreshPrices(st); g.autosave();
    } });
    if (!p.cat && st.type === "agri") {
      opts.push({ id: "cat", label: "ADOPT THE YARD CAT", sub: "150CR - CREW MORALE, AND SOMEONE TO TALK TO ABOARD", action: () => {
        if (p.credits < 150) return g.toast("NOT ENOUGH CREDITS");
        p.credits -= 150; const name = CAT_NAMES[(g.world.seed + st.id.length) % CAT_NAMES.length]; adoptCat(p, name, g.world.time);
        logEntry(g.world, `${name} came aboard at ${st.name}`); flag(g, "shipsCat");
        g.toast(`${name.toUpperCase()} WALKS UP THE RAMP AS IF IT WERE THEIRS. IT IS NOW.`); sfx.pickup();
      } });
    }
    for (const k of ["beacon", "depot"] as const) {
      const kit = INFRA_KITS[k];
      opts.push({ id: `kit:${k}`, label: `${kit.name.toUpperCase()} (ABOARD ${(p.kits ?? {})[k] ?? 0})`, sub: `${kit.price}CR`, action: () => {
        if (p.credits < kit.price) return g.toast("NOT ENOUGH CREDITS");
        p.credits -= kit.price; (p.kits ??= {})[k] = ((p.kits ?? {})[k] ?? 0) + 1;
        g.toast(`${kit.name.toUpperCase()} CRATED. FLY TO A SYSTEM WITH NO STATION AND PRESS E TO PLANT IT.`);
        g.showHint("lighthouse", "DEAD SYSTEMS ONLY: NO STATION. TRAFFIC PAYS TOLLS; FLY BACK TO EMPTY THE TILL");
      } });
    }
    opts.push({ id: "cargo-pod", label: `CARGO POD +10 (NOW ${p.cargoMax})`, sub: "500CR", action: () => {
      if (p.credits < 500) return g.toast("NOT ENOUGH CREDITS");
      rememberYardFittings(p); p.credits -= 500; p.yardFittings!.cargo += 10; refreshFittedStats(p); g.toast("CARGO POD FITTED. +10 CAPACITY; MOVES WITH YOUR FITTINGS.");
    } });
    opts.push({ id: "shield-booster", label: `SHIELD BOOSTER +25 (NOW ${p.shieldMax})`, sub: "800CR", action: () => {
      if (p.credits < 800) return g.toast("NOT ENOUGH CREDITS");
      rememberYardFittings(p); p.credits -= 800; p.yardFittings!.shield += 25; refreshFittedStats(p); g.toast("BOOSTER PLATE FITTED. +25 SHIELD CAPACITY; MOVES WITH YOUR FITTINGS.");
    } });
    if (p.wanted > 0 && !st.military) {
      const cost = Math.round(p.wanted * 1000);
      opts.push({ id: "settle-warrant", label: "BRIBE RECORDS CLERK (CLEAR WARRANT)", sub: `${cost}CR`, action: () => {
        if (p.credits < cost) return g.toast("NOT ENOUGH CREDITS");
        p.credits -= cost; closeLawCases(g.world); g.toast("RECORDS... MISPLACED");
      } });
    }
    const rep = p.rep[st.factionId] ?? 0;
    if (rep < 0 && !st.military) {
      const cost = Math.round(-rep * 30);
      opts.push({ id: "settle-standing", label: `CLEAN RECORD FEE (${faction(st.factionId).name.split(" ")[0]} REP → 0)`, sub: `${cost}CR`, action: () => {
        if (p.credits < cost) return g.toast("NOT ENOUGH CREDITS");
        p.credits -= cost; p.rep[st.factionId] = 0; g.toast("YOUR FILE IS CLEAN. FOR NOW.");
      } });
    }
    return opts;
  }

  // ---------- Draw ----------

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    if (this.info) { this.info.draw(g, ctx); return; }
    this.rowBoxes = [];
    const p = g.world.player;
    const st = this.station;
    const fac = faction(st.factionId);
    const rep = p.rep[st.factionId] ?? 0;
    ctx.fillStyle = PAL.uiPanel;
    ctx.fillRect(0, 0, VW, VH);
    ctx.drawImage(g.stationSprite(st.id, st.military), 8, 6, 28, 28);
    drawText(ctx, clippedText(st.name.toUpperCase(), 210), 42, 8, PAL.white);
    drawText(ctx, `${st.military ? "STAR BASE" : "STATION"} - ${st.type.toUpperCase()} - ${fac.name}`, 42, 17, fac.color);
    drawText(ctx, `${p.credits}CR   CARGO ${cargoUsed(p)}/${p.cargoMax}   REP ${repLabel(rep)} (${rep})`, 42, 26, PAL.gold);
    const walkLabel = TABS[this.tab] === "RECORD" ? "P GUESTBOOK" : "P WALK DECK";
    const escLabel = this.returnTo === "stationwalk" ? "ESC PROMENADE" : "ESC UNDOCK";
    drawText(ctx, `${walkLabel} - ${escLabel}`, VW - textWidth(`${walkLabel} - ${escLabel}`) - 6, 8, PAL.greyDark);
    if (this.tannoy) {
      // the tannoy has a window of its own on the right; what does not fit scrolls through it
      const tl = `TANNOY: ${this.tannoy}`; const tw = textWidth(tl); const WW = 230; const x0 = VW - 6 - WW;
      if (tw <= WW) drawText(ctx, tl, VW - tw - 6, 17, PAL.gold);
      else { const prog = Math.min(1, Math.max(0, 1 - this.tannoyT / this.tannoyDur)); ctx.save(); ctx.beginPath(); ctx.rect(x0, 15, WW, 9); ctx.clip(); drawText(ctx, tl, Math.round(x0 + WW - prog * (tw + WW)), 17, PAL.gold); ctx.restore(); }
    } else if (st.military) drawText(ctx, "SECURITY LEVEL: HIGH", VW - textWidth("SECURITY LEVEL: HIGH") - 6, 17, PAL.danger);
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

    const top = 56, hasList = LIST_PAGES[TABS[this.tab]] !== undefined;
    if (hasList) { ctx.save(); ctx.beginPath(); ctx.rect(0, 52, VW, 171); ctx.clip(); }
    switch (TABS[this.tab]) {
      case "MARKET": this.drawMarket(g, ctx, top); break;
      case "SHIPYARD": this.drawShipyard(g, ctx, top); break;
      case "SHIPS": this.drawShips(g, ctx, top); break;
      case "MISSIONS": this.drawMissions(g, ctx, top); break;
      case "BAR": this.drawBar(g, ctx, top); break;
      case "STORAGE": this.drawStorage(g, ctx, top); break;
      case "NEWS": this.drawDocuments(g, ctx); break;
      case "WIRE": this.drawDocuments(g, ctx); break;
      case "RECORD": this.drawDocuments(g, ctx); break;
      case "SURVEY": this.drawDocuments(g, ctx); break;
      case "ENGINEER": this.drawEngineer(g, ctx, top); break;
      case "BASE": this.drawBase(g, ctx, top); break;
    }
    if (hasList) { ctx.restore(); this.drawListControls(g, ctx); return; }
    ctx.fillStyle = "#193542"; ctx.fillRect(300, 227, 174, 15);
    drawText(ctx, "F2 WORKSHOP / MATERIALS & CRAFT", 306, 232, PAL.ui);
    if (g.toastTimer > 0) drawText(ctx, g.toastMsg, VW / 2 - textWidth(g.toastMsg) / 2, VH - 10, PAL.ui);
    if (g.hint) drawText(ctx, g.hint, VW / 2 - textWidth(g.hint) / 2, VH - 20, PAL.gold);
    drawTutorial(g, ctx, VH - 46);
  }

  row(ctx: CanvasRenderingContext2D, y: number, selected: boolean, index = this.rowBoxes.length, height = 9): void {
    while (this.rowBoxes.length <= index) this.rowBoxes.push([Infinity, -Infinity]);
    this.rowBoxes[index] = [y - 2, y - 2 + height];
    if (selected) { ctx.fillStyle = "#13203a"; ctx.fillRect(4, y - 2, TABS[this.tab] === "SHIPYARD" ? 286 : VW - 8, height); }
  }

  // Everything the station lists, plus any rare goods in the hold (sellable anywhere)
  marketRows(g: Game): string[] {
    const p = g.world.player;
    const rows = Object.keys(this.station.prices);
    for (const [id, q] of Object.entries(p.cargo)) if (q > 0 && commodity(id).rare && !rows.includes(id)) rows.push(id);
    return rows;
  }

  marketWindow(g: Game, top = 56): { id: string; index: number; y: number }[] {
    this.syncList(g);
    const rows = this.marketRows(g), count = 12, start = this.list.view.offset;
    return rows.slice(start, start + count).map((id, i) => ({ id, index: start + i, y: top + 12 + i * 9 }));
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
    this.prepareListDraw(g);
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
    drawText(ctx, "I FULL DETAILS", 366, top, PAL.greyDark);
    const rows = this.marketRows(g);
    const visible = this.marketWindow(g, top);
    this.rowBoxes = rows.map(() => [Infinity, -Infinity]);
    visible.forEach(({ id, index: i, y }) => {
      const c = commodity(id);
      const listed = id in st.prices;
      this.row(ctx, y, i === this.cursor, i);
      drawText(ctx, clippedText(c.name + (c.illegal ? " *" : c.rare ? " +" : ""), 134), 8, y, c.illegal ? PAL.danger : c.rare ? PAL.gold : PAL.white);
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
    const ny = top + 12 + visible.length * 9 + 16;
    const first = (visible[0]?.index ?? -1) + 1, last = (visible.at(-1)?.index ?? -1) + 1;
    drawText(ctx, `ROWS ${first}-${last}/${rows.length} - ARROWS/WHEEL BROWSE`, 8, ny - 10, PAL.greyDark);
    {
      const id = rows[this.cursor];
      const best = id ? this.bestKnownSell(g, id) : null;
      const line = best ? `${commodity(id).name.toUpperCase()} - BEST KNOWN SELL: ${best.price}CR AT ${best.station.toUpperCase()}, ${best.system.toUpperCase()} (${Math.floor(best.ago / 60)}M AGO)` : id ? `${commodity(id).name.toUpperCase()} - NO OTHER MARKET SEEN YET; PRICES ARE REMEMBERED WHEREVER YOU DOCK` : "";
      drawText(ctx, line, 8, ny + 9, PAL.info);
      const r = this.bestRoute(g);
      if (r) drawText(ctx, `BEST KNOWN RUN: BUY ${commodity(r.id).name.toUpperCase()} ${r.buy} - SELL ${r.sell} AT ${r.station.toUpperCase()}, ${r.system.toUpperCase()} (+${r.sell - r.buy}/UNIT)`.slice(0, 90), 8, ny + 18, PAL.gold);
      if (ny + 27 <= 217 && this.goal.stationType === st.type) drawText(ctx, `COMMUNITY GOAL: ${commodity(this.goal.commodityId).name.toUpperCase()} SELLS HERE AT +${Math.round(this.goal.premium * 100)}% THIS WEEK`, 8, ny + 27, PAL.info);
      else { const dem = this.demandHere(g); if (ny + 27 <= 217 && dem) drawText(ctx, `${dem.label} BASE WANTS THIS WEEK: ${dem.goods.map((d) => commodity(d).name.toUpperCase()).join(", ")} AT +${Math.round(ROUTE_PREMIUM * 100)}% - A SHARE FEEDS THEIR TREASURY`, 8, ny + 27, PAL.gold); }
    }
    drawText(ctx, blackMarket(g.world, st) ? "* BLACK MARKET HERE: ILLEGAL GOODS FENCE AT +30%, NO QUESTIONS.  + RARE - WORTH MORE FAR FROM ORIGIN." : "* ILLEGAL - CUSTOMS MAY SEIZE A SALE HERE; FENCE IT AT VEIL OR PIRATE-HEAVY HUBS.  + RARE - WORTH MORE FAR FROM ORIGIN.", 8, ny, blackMarket(g.world, st) ? PAL.gold : PAL.greyDark);
    if (!st.military && ny + 36 <= 217) { const held = p.stakes?.[st.id] ?? 0; drawText(ctx, `${held ? `YOUR STAKE: ${held} SHARES, ~${stakeDividend(g.world, st)}CR A DOCKING` : "NO STAKE HERE"} - V BUYS A SHARE AT ${stakePrice(g.world, st)}CR (SHIFT: TEN)`, 8, ny + 36, held ? PAL.gold : PAL.greyDark); }
  }

  drawShipyard(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    this.prepareListDraw(g);
    const opts = this.shipyardOptions(g);
    // the list is longer than the screen: a window of rows follows the cursor
    const maxRows = this.list.view.pageSize, off = this.list.view.offset;
    let longSub = "";
    opts.slice(off, off + maxRows).forEach((o, j) => {
      const i = off + j; const y = top + j * 9;
      this.row(ctx, y, i === this.cursor, i);
      drawText(ctx, clippedText(o.label, 274), 8, y, PAL.white);
      // a sub that would run into the label keeps its first part on the row; the rest goes to the info line when selected
      let s = o.sub;
      if (textWidth(o.label) + textWidth(s) > 268) {
        if (i === this.cursor) longSub = o.sub;
        s = s.split(" - ")[0];
        if (textWidth(o.label) + textWidth(s) > 268) s = s.split(", ")[0];
        if (textWidth(o.label) + textWidth(s) > 268) s = "";
      }
      drawText(ctx, s, 290 - textWidth(s) - 8, y, PAL.gold);
    });
    const p = g.world.player;
    const cur = opts[this.cursor];
    const mod = cur && MODULES.find((m) => cur.label === `FIT ${m.name.toUpperCase()}`);
    const furn = cur && FURNISHINGS.find((f) => cur.label === `FOR THE DECK: ${f.name.toUpperCase()}`);
    if (mod) drawText(ctx, mod.desc.toUpperCase().slice(0, 100), 8, VH - 32, PAL.info);
    else if (furn) drawText(ctx, furn.desc.toUpperCase().slice(0, 100), 8, VH - 32, PAL.info);
    else if (longSub) drawText(ctx, longSub.slice(0, 100), 8, VH - 32, PAL.info);
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

  shipRows(g: Game): ShipRow[] {
    const p = g.world.player;
    return [
      ...HULLS.map(h => ({ kind: "market" as const, hull: h })),
      ...(p.fleet ?? []).filter(f => f.stationId === this.station.id).map(ship => ({ kind: "parked" as const, ship })),
      ...(p.fleet ?? []).filter(f => f.stationId !== this.station.id).map(ship => ({ kind: "remote" as const, ship })),
      ...(p.haulers ?? []).map(charter => ({ kind: "working" as const, charter })),
    ];
  }

  shipWindow(g: Game, top = 56): { row: ShipRow; index: number; y: number }[] {
    this.syncList(g);
    const rows = this.shipRows(g), firstY = top + 27;
    const count = Math.max(1, Math.floor((VH - 40 - firstY) / 20));
    const start = this.list.view.offset;
    return rows.slice(start, start + count).map((row, i) => ({ row, index: start + i, y: firstY + i * 20 }));
  }

  releaseWorkingShip(g: Game, c: Charter): void {
    const p = g.world.player;
    if (!p.haulers?.includes(c)) { g.toast("THAT CHARTER HAS ALREADY CLOSED"); return; }
    const where = c.own ? ` Your hull returns to ${findStation(g.world, c.from)?.st.name ?? "its home depot"}.` : "";
    if (!confirmBox(`Release ${c.name} from the charter? The till (${Math.round(c.till)}cr) settles now; the crew find other work.${where}`)) return;
    const total = Math.round(c.till); p.credits += total; ledger(p, "charters", total); c.till = 0;
    releaseCharter(p, c);
    g.toast(`${c.name.toUpperCase()} RELEASED. ${total}CR SETTLED.${where.toUpperCase()}`);
    logEntry(g.world, `Released ${c.name} from its working charter; settled ${total}cr.`);
  }

  shipDetailLines(g: Game, selected: ShipRow): string[] {
    const p = g.world.player, tradeIn = Math.round(hull(p.hullId).price * 0.6), lines: string[] = [];
    const h = selected.kind === "market" ? selected.hull : selected.kind === "working" ? selected.charter.hullId ? hull(selected.charter.hullId) : null : hull(selected.ship.hullId);
    if (selected.kind === "working") {
      const c = selected.charter;
      lines.push(c.name.toUpperCase(), c.own ? "YOUR HULL, HIRED CREW" : "HIRED HULL AND CREW", "");
      lines.push(...wrap(`${commodity(c.commodityId).name.toUpperCase()}: ${findStation(g.world, c.from)?.st.name.toUpperCase() ?? "?"} TO ${findStation(g.world, c.to)?.st.name.toUpperCase() ?? "?"}`, 53));
      lines.push(`${c.trips} TRIPS / ${c.earned}CR EARNED`, `TILL ${Math.round(c.till)}CR / HULL ${c.health}%`, `RAIDS ${c.raided}`, "", "R: RELEASE THIS CHARTER");
      if (c.own) lines.push(...wrap(`HULL RETURNS TO ${findStation(g.world, c.from)?.st.name.toUpperCase() ?? "HOME DEPOT"}.`, 53));
    } else if (h) {
      const fitted = fittedHullStats(p, h.id);
      lines.push(h.name.toUpperCase(), `HULL ${fitted.hullMax} / SHIELD ${fitted.shieldMax}`, `CARGO ${fitted.cargoMax} / FUEL ${fitted.fuelMax}`, `THRUST ${h.accel} / TOP SPEED ${h.maxSpeed}`, `MINE X${h.miningRate} / GUNS ${h.weaponDmg}`, `CREW ${h.crewSlots}${h.drones ? ` / DRONES ${h.drones}` : ""}`, "");
      if (selected.kind === "market") {
        lines.push(...wrap(h.desc.toUpperCase(), 53), "", ...(h.id === p.hullId ? ["THIS HULL IS ALREADY ABOARD."] : [`ENTER: TRADE IN / PAY ${Math.max(0, h.price - tradeIn)}CR`, `K: KEEP OLD HULL / PAY ${h.price}CR`]));
      } else {
        lines.push(`STORED HULL ${Math.round(selected.ship.hull)}/${h.hullMax}`, `TORPEDOES ${selected.ship.torpedoes}`, "");
        if (selected.kind === "parked") lines.push("ENTER: BOARD THIS HULL", "W: HIRE A CREW FOR WORK", `X: SELL THIS HULL / ${hullSalePrice(selected.ship)}CR`);
        else { const dest = findStation(g.world, selected.ship.stationId); const hops = charterRoute(g.world, this.station.id, selected.ship.stationId).hops;
          lines.push(...wrap(`AT ${dest?.st.name.toUpperCase() ?? "?"}, ${dest?.sys.name.toUpperCase() ?? "?"}`, 53), `ENTER / L: LINER ${hops} JUMPS`, `FARE ${(120 + 140 * hops) * (1 + p.crew.length)}CR FOR YOUR PARTY`);
        }
      }
    }
    return lines;
  }

  drawShips(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    this.prepareListDraw(g);
    const p = g.world.player, rows = this.shipRows(g), selected = rows[this.cursor] ?? rows[0];
    const tradeIn = Math.round(hull(p.hullId).price * 0.6);
    drawText(ctx, `SHIPS AND FLEET - ${(p.shipName ?? hull(p.hullId).name).toUpperCase()} - N NAME / O PAINT`.slice(0, 96), 8, top, PAL.ui);
    drawText(ctx, p.service?.loan ? "CUTTER ON LOAN: RETURN THROUGH THE DEPOT OR SHIPYARD" : `TRADE-IN ${tradeIn}CR - SELECT A HULL FOR ITS PRICE, CAPACITY AND ACTIONS`, 8, top + 10, PAL.greyDark);
    this.rowBoxes = rows.map(() => [Infinity, -Infinity]);
    for (const { row, index, y } of this.shipWindow(g, top)) {
      this.rowBoxes[index] = [y - 2, y + 16];
      if (index === this.cursor) { ctx.fillStyle = "#13203a"; ctx.fillRect(4, y - 2, 237, 18); }
      const name = row.kind === "market" ? row.hull.name : row.kind === "working" ? row.charter.name : row.ship.name ?? hull(row.ship.hullId).name;
      drawText(ctx, `${row.kind.toUpperCase()}: ${name.toUpperCase()}`.slice(0, 57), 8, y, index === this.cursor ? PAL.white : row.kind === "market" ? PAL.grey : PAL.ui);
      const sub = row.kind === "market" ? row.hull.id === p.hullId ? "CURRENT HULL" : `${Math.max(0, row.hull.price - tradeIn)}CR WITH TRADE-IN`
        : row.kind === "parked" ? "HERE: ENTER SWAP / W WORK / X SELL"
        : row.kind === "remote" ? `${findStation(g.world, row.ship.stationId)?.st.name.toUpperCase() ?? "UNKNOWN PORT"}: L LINER`
        : `${row.charter.trips} TRIPS / TILL ${Math.round(row.charter.till)}CR / R RELEASE`;
      drawText(ctx, sub.slice(0, 57), 8, y + 8, PAL.greyDark);
    }
    ctx.fillStyle = PAL.uiBorder; ctx.fillRect(244, top + 24, 1, VH - top - 63);
    const x = 252, lines = selected ? this.shipDetailLines(g, selected) : [];
    const h = !selected ? null : selected.kind === "market" ? selected.hull : selected.kind === "working" ? selected.charter.hullId ? hull(selected.charter.hullId) : null : hull(selected.ship.hullId);
    if (h) {
      const spr = g.sprite(`hull-preview-${h.id}`, () => spriteMod.genShip(new RNG(g.world.seed ^ 0x51e9 ^ h.id.length), h.spriteSize, h.color, h.accent, h.id));
      ctx.drawImage(spr, VW - 8 - spr.width, top + 1);
    }
    lines.slice(0, 15).forEach((line, i) => drawText(ctx, line.slice(0, 53), x, top + 27 + i * 9, i === 0 ? PAL.white : PAL.grey));
    drawText(ctx, `UP/DOWN OR WHEEL: ${this.cursor + 1}/${rows.length} - CLICK A VISIBLE ROW`, 8, VH - 32, PAL.greyDark);
  }

  missionRows(g: Game): { m: Mission; ready: boolean }[] {
    return [
      ...g.world.player.missions.filter(m => missionDeliverable(g.world, m, this.station)).map(m => ({ m, ready: true })),
      ...this.boardMissions.filter(m => !m.accepted && !m.done).map(m => ({ m, ready: false })),
    ];
  }

  missionWindow(g: Game, top = 56) {
    this.syncList(g);
    const rows = this.missionRows(g), offset = this.list.view.offset;
    return rows.slice(offset, offset + 7).map((row, i) => ({ ...row, index: offset + i, y: top + 28 + i * 20 }));
  }

  missionSections(g: Game): { title: string; lines: string[]; mission?: Mission }[] {
    const w = g.world, p = w.player;
    const objectives = [storyObjective(w), regattaObjective(w), serviceObjective(w), councilObjective(w),
      ...p.crew.map(c => arcObjective(w, c))].filter((line): line is string => !!line);
    const cr = w.crisis;
    if (cr && cr.delivered < cr.need && w.time < cr.until) objectives.push(`CRISIS: ${findStation(w, cr.stationId)?.st.name ?? cr.stationId} NEEDS ${cr.need - cr.delivered} ${commodity(cr.commodityId).name}. ${Math.ceil((cr.until - w.time) / 60)} MINUTES LEFT. PAYS X${CRISIS_PREMIUM}.`);
    const sections: { title: string; lines: string[]; mission?: Mission }[] = [
      { title: "CURRENT OBJECTIVES", lines: objectives.length ? objectives : ["NO ADDITIONAL OBJECTIVES AT PRESENT."] },
      { title: "COMMUNITY GOAL", lines: [this.goal.title, this.goal.desc,
        this.goalState ? `${this.goalState.progress}/${this.goal.target} UNITS. ${this.goalState.progress >= this.goal.target ? "GOAL MET. PREMIUM STILL PAYS." : "GOAL IN PROGRESS."}` : "LIVE PROGRESS IS UNAVAILABLE.",
        `YOUR CONTRIBUTION: ${p.goalContrib?.[this.goal.id] ?? 0} UNITS.`,
        ...(this.goalState?.top.length ? [`TOP CONTRIBUTORS: ${this.goalState.top.map(t => `${t.callsign} ${t.amount}`).join("; ")}`] : []),
      ] },
    ];
    const active = p.missions.filter(m => m.accepted && !m.done), offered = this.boardMissions.filter(m => !m.accepted && !m.done);
    if (!active.length) sections.push({ title: "ACTIVE MISSIONS", lines: ["YOUR MISSION LOG IS EMPTY."] });
    for (const m of [...active, ...offered]) {
      const lines = [m.desc,
        `DESTINATION: ${m.passengerKind === "singer" ? "THE SINGERS' BERTH" : findStation(w, m.targetStationId ?? "")?.st.name ?? "SYSTEM OBJECTIVE"}, ${w.systems[m.targetSystemId]?.name ?? m.targetSystemId}.`,
        m.passengerKind === "singer" ? `REWARD: ${m.lightReward ?? 25} LIGHT AT HOME.` : `BASE REWARD: ${m.reward}CR. ORIGINAL MISSION CONDITIONS APPLY.`,
        `STATUS: ${m.accepted ? missionDeliverable(w, m, this.station) ? "READY TO TURN IN HERE" : "ACCEPTED" : (m.tier ?? 0) > missionTier(p.rep[this.station.factionId] ?? 0) ? "POSTED, HIGHER STANDING REQUIRED" : "POSTED, NOT ACCEPTED"}.`,
      ];
      if (m.commodityId && m.qty) lines.push(`CARGO: ${m.qty} ${commodity(m.commodityId).name}. ABOARD: ${p.cargo[m.commodityId] ?? 0}.`);
      if (m.killsNeeded) lines.push(`TARGETS: ${m.kills ?? 0}/${m.killsNeeded}.`);
      if (m.groundNeed) lines.push(`GROUND WORK: ${m.groundDone ?? 0}/${m.groundNeed}.`);
      if (m.shipTotal) lines.push(`SHIPMENTS COMPLETED: ${m.shipDone ?? 0}/${m.shipTotal}.`);
      if (m.escortDone) lines.push("ESCORT COMPLETE. RETURN TO THE ISSUING PORT.");
      if (m.kind === "passenger") {
        if (m.mood !== undefined) lines.push(`PASSENGER MOOD: ${Math.round(m.mood)}.`);
        if (m.demand) lines.push(`REQUESTED ABOARD: ${commodity(m.demand).name}.`);
        if (m.passengerKind === "tourist") lines.push(m.sightSeen ? "BOOKED SIGHT SEEN." : "BOOKED SIGHT STILL PENDING.");
      }
      sections.push({ title: `${g.world.player.objectiveFocusId === `mission:${m.id}` ? "CHOSEN / " : ""}${m.accepted ? "ACTIVE" : "POSTING"}: ${m.title}`, lines, mission: m });
    }
    return sections;
  }

  openMissionLog(g: Game): void {
    const reader = g.scenes.missionlog as ReaderScene, sections = this.missionSections(g);
    const selected = this.missionRows(g)[this.cursor]?.m;
    reader.sections.splice(0, reader.sections.length, ...sections.map(s => [s.title, s.lines] as [string, string[]]));
    g.settingsReturn = "station"; g.setScene("missionlog");
    const index = sections.findIndex(s => s.mission === selected && !!selected);
    if (index >= 0) reader.scroll = Math.min(reader.maxScroll(), reader.blocks[index].top);
  }

  drawMissions(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    this.prepareListDraw(g);
    const p = g.world.player, tier = missionTier(p.rep[this.station.factionId] ?? 0), rows = this.missionRows(g);
    drawText(ctx, `MISSION BOARD - ${["CIVILIAN", "TRUSTED", "MILITARY"][tier]}`, 8, top, PAL.grey);
    drawText(ctx, "F4 VOYAGE  J LOG", 400, top, PAL.ui);
    drawText(ctx, `${rows.filter(r => r.ready).length} READY HERE / ${rows.filter(r => !r.ready).length} POSTED / ${p.missions.filter(m => m.accepted && !m.done).length} ACTIVE`, 8, top + 12, PAL.greyDark);
    for (const { m, ready, index, y } of this.missionWindow(g, top)) {
      const locked = !ready && (m.tier ?? 0) > tier;
      this.row(ctx, y, index === this.cursor, index, 18);
      drawText(ctx, `${ready ? "TURN IN: " : locked ? "LOCKED: " : "POSTED: "}${m.title}`.slice(0, 91), 12, y, ready ? PAL.good : locked ? PAL.greyDark : PAL.white);
      const reward = m.passengerKind === "singer" ? `+${m.lightReward ?? 25} LIGHT` : `+${m.reward}CR`;
      drawText(ctx, reward, VW - textWidth(reward) - 8, y, PAL.gold);
      drawText(ctx, m.desc.slice(0, 112), 12, y + 8, PAL.greyDark);
    }
    if (!rows.length) drawText(ctx, "NO POSTINGS OR HAND-INS HERE. J READS YOUR CURRENT LOG.", 12, top + 30, PAL.greyDark);

  }

  drawBar(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    this.prepareListDraw(g);
    const rows = this.barEntries(g), p = g.world.player;
    drawText(ctx, `THE LOUNGE  BERTHS ${berthsUsed(p)}/${hull(p.hullId).crewSlots}  CABINS ${passengersAboard(p).length}/${passengerCap(p)}`, 8, top, PAL.grey);
    for (let i = this.list.view.offset; i < this.list.view.end; i++) {
      const row = rows[i], y = top + 15 + (i - this.list.view.offset) * 20;
      this.row(ctx, y, i === this.cursor, i, 18);
      if (row.portrait) ctx.drawImage(g.portrait(row.portrait), 10, y - 1, 16, 16);
      const x = row.portrait ? 32 : 12;
      drawText(ctx, clippedText(row.title, 468 - x), x, y, i === this.cursor ? PAL.white : PAL.ui);
      drawText(ctx, clippedText(row.lines[0], 468 - x), x, y + 9, PAL.grey);
    }
    if (!rows.length) drawText(ctx, "THE LOUNGE IS EMPTY.", 12, top + 15, PAL.grey);
    drawText(ctx, clippedText(this.barLine || "I READS TERMS. O READS THE LAST REPLY.", 456), 12, 216, this.barLine ? PAL.ui : PAL.greyDark);
  }

  storageRows(g: Game): { kind: "held" | "stored"; id: string; qty: number }[] {
    const p = g.world.player;
    return [
      ...Object.entries(p.cargo).filter(([, qty]) => qty > 0).map(([id, qty]) => ({ kind: "held" as const, id, qty })),
      ...Object.entries(p.storage[this.station.id] ?? {}).filter(([, qty]) => qty > 0).map(([id, qty]) => ({ kind: "stored" as const, id, qty })),
    ];
  }

  storageWindow(g: Game, top = 56) {
    this.syncList(g);
    const rows = this.storageRows(g), offset = this.list.view.offset;
    return rows.slice(offset, offset + 12).map((row, i) => ({ row, index: offset + i, y: top + 28 + i * 11 }));
  }

  drawStorage(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    this.prepareListDraw(g);
    const p = g.world.player, rows = this.storageRows(g), visible = this.storageWindow(g, top);
    drawText(ctx, "WAREHOUSE - ENTER MOVES ONE UNIT - ARROWS / WHEEL SCROLL", 8, top, PAL.greyDark);
    drawText(ctx, `HOLD ${cargoUsed(p)}/${p.cargoMax}   ${rows.filter(r => r.kind === "held").length} GOODS ABOARD / ${rows.filter(r => r.kind === "stored").length} STORED`, 8, top + 12, PAL.grey);
    for (const { row, index, y } of visible) {
      this.row(ctx, y, index === this.cursor, index, 10);
      drawText(ctx, `${row.kind === "held" ? "HOLD" : "WAREHOUSE"}: ${commodity(row.id).name.toUpperCase()}`, 12, y, row.kind === "held" ? PAL.white : PAL.ui);
      drawText(ctx, `X${row.qty}   ${row.kind === "held" ? "STORE" : "LOAD"}`, 324, y, PAL.gold);
    }
    if (!rows.length) drawText(ctx, "THE HOLD AND THIS STATION'S WAREHOUSE ARE EMPTY.", 12, top + 30, PAL.greyDark);
    const selected = rows[this.cursor];
    if (selected) {
      drawText(ctx, `${this.cursor + 1}/${rows.length} - ${commodity(selected.id).name.toUpperCase()}`, 8, 216, PAL.gold);
      drawText(ctx, selected.kind === "held" ? "STORE ONE HERE. STORED GOODS STAY AT THIS STATION." : cargoUsed(p) < p.cargoMax ? "LOAD ONE INTO YOUR HOLD. OTHER STATIONS KEEP THEIR OWN STOCK." : "HOLD FULL. STORE SOMETHING BEFORE LOADING MORE.", 8, 233, PAL.greyDark);
    }
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
    this.prepareListDraw(g);
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
    rows.slice(this.list.view.offset, this.list.view.end).forEach((r, j) => {
      const i = this.list.view.offset + j, y = top + 24 + j * 9;
      if (y > VH - 86) return;
      this.row(ctx, y, i === this.cursor, i);
      drawText(ctx, clippedText(r.label, 184), 8, y, r.kind === "upgrade" && r.label.startsWith("FITTED") ? PAL.good : PAL.white);
      drawText(ctx, clippedText(r.sub, 272), 200, y, PAL.grey);
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
    this.prepareListDraw(g);
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

  // The week: the strategy layer on one page. Votes, the border, the regatta, holdings, your name.
  // the harbour view: what this port knows about you and your ship right now, without walking the deck
  // the clinic is overrun: a medical crisis at the clamp, and a medic aboard is worth more than a crate
  overrun(g: Game): void {
    const st = this.station; const p = g.world.player;
    (p.flags ??= {})[`overrun:${st.id}:${weekKey()}`] = true;
    const medic = p.crew.find((c) => c.role === "medic" && !c.sick);
    const enc: Encounter = { id: "overrun", where: "space", title: "THE CLINIC IS OVERRUN", weight: 0,
      text: `The harbourmaster meets you at the clamp with a mask on and hands you one. ${st.name}'s clinic has more patients than cots and more cots than medicine: a fever off a hauler, three days in, half the promenade coughing. They'll take crates. They'd take a medic faster.`,
      options: [
        { label: "SEND THE MEDIC DOWN FOR A SHIFT", hint: "Rep +4, lives saved, the medic learns; the ship waits an hour", requires: () => !!medic, result: (g2) => { adjustRep(g2.world, st.factionId, 4); p.lives = (p.lives ?? 0) + 6; g2.world.time += 3600; const x = crewXp(p, "medic", 3); flag(g2, "overrun"); logEntry(g2.world, `${medic!.name} worked a shift in the overrun clinic at ${st.name}`); return `${medic!.name.toUpperCase()} GOES DOWN WITH A BAG AND COMES BACK AN HOUR LATER WITH NONE OF WHAT WAS IN IT AND SIX PEOPLE WHO'D HAVE DIED WITHOUT IT.${x ? " " + x : ""} REP UP. SIX LIVES.`; } },
        { label: "HAND OVER MED SUPPLIES (UP TO 4)", hint: "Rep and the crisis eased, a crate at a time", requires: () => (p.cargo.med ?? 0) >= 1, result: (g2) => { const n = Math.min(4, p.cargo.med ?? 0); removeCargo(p, "med", n); adjustRep(g2.world, st.factionId, n); p.lives = (p.lives ?? 0) + n; logEntry(g2.world, `Handed ${n} med supplies to the overrun clinic at ${st.name}`); return `${n} CRATE${n > 1 ? "S" : ""} GO DOWN THE GANGWAY ON A TROLLEY THAT SOMEBODY RUNS WITH. REP UP, ${n} LI${n > 1 ? "VES" : "FE"}. THE HARBOURMASTER DOESN'T TAKE THE MASK OFF TO THANK YOU.`; } },
        { label: "KEEP THE MASK AND GO ABOUT YOUR BUSINESS", result: () => "YOU KEEP THE MASK ON AND THE HOLD SHUT. THE PROMENADE COUGHS AROUND YOU. THE MARKET STILL PAYS FOR MEDICINE, IF YOU WANT TO SELL IT INSTEAD." },
      ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "station", true);
  }

  // the register: an independent rock for the week asks who's with it
  register(g: Game, sec: GalaxyEvent): void {
    const st = this.station; const p = g.world.player; const fac = faction(st.factionId);
    (p.flags ??= {})[`register:${st.id}:${Math.round(sec.until)}`] = true;
    const enc: Encounter = { id: "register", where: "space", title: "THE REGISTER", weight: 0,
      text: `A table by the clamp with a book on it and two people behind it who have not slept. ${st.name} has declared itself independent for the week: the water is the rock's, the air is the rock's, and the ${fac.name} can have their tithe back when they pay for the filters. The book is a register of ships that stand with the rock. There is a pen.`,
      options: [
        { label: "SIGN THE REGISTER", hint: `The rock pays 200cr and remembers; the ${fac.name} remember too`, result: (g2) => { p.credits += 200; adjustRep(g2.world, st.factionId, -3); const bl = beltGain(g2.world, 1); if (bl) g2.toast(bl); flag(g2, "register"); logEntry(g2.world, `Signed the register at ${st.name}, the week it went independent`); return `YOU SIGN. THE TWO BEHIND THE TABLE LOOK AT THE NAME, THEN AT YOU, THEN AT EACH OTHER. 200CR FROM THE ROCK'S COUNCIL, THE BELT RATE FROM HERE ON, AND A MARK AGAINST YOU WITH THE ${fac.name.toUpperCase()} THAT THEY WILL NOT FORGET EITHER.`; } },
        { label: "BUY THE WATER AND SAY NOTHING", hint: "Trade with an independent rock; the market pays", result: () => "YOU NOD AT THE TABLE AND GO ON TO THE MARKET, WHERE WATER, RATIONS AND MEDICINE SELL LIKE THEY'VE NEVER SOLD. THE BOOK STAYS OPEN. NOBODY MAKES YOU." },
        { label: "REPORT THE REGISTER TO THE FACTION", hint: `Rep +3 with the ${fac.name}; the belt hears`, result: (g2) => { adjustRep(g2.world, st.factionId, 3); for (const c of p.crew) if (c.trait?.includes("rock") || c.trait?.includes("litres")) c.morale = Math.max(0, c.morale - 6); logEntry(g2.world, `Reported the register at ${st.name} to the ${fac.name}`); return `YOU FILE THE NAMES IN THE BOOK WITH THE ${fac.name.toUpperCase()} ON THE NEXT BAND. REP UP. THE TABLE IS GONE BY THE TIME YOU'RE BACK FROM THE MARKET, AND SO IS THE PEN. THE BELT WILL HEAR.`; } },
      ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "station", true);
  }

  // the spin's gone: a belt rock without rotation for an hour, and a yard that would pay for a tool roll
  spinOutage(g: Game): void {
    const st = this.station; const p = g.world.player;
    spinOutageSeen(g.world, st);
    const eng = p.crew.find((c) => c.role === "engineer" && !c.sick);
    const enc: Encounter = { id: "spin", where: "space", title: "THE SPIN'S GONE", weight: 0,
      text: `The clamp takes you and then the floor doesn't. ${st.name}'s spin is down: bearing failure on the ring drive, the tannoy says, in the voice of somebody who has said it before. Everything on the promenade is very slowly drifting toward the ceiling. The yard is short-handed and says so on every band.`,
      options: [
        { label: "SEND THE ENGINEER TO THE RING DRIVE", hint: "Rep +3, the yard pays 150cr, the belt remembers", requires: () => !!eng, result: (g2) => { adjustRep(g2.world, st.factionId, 3); p.credits += 150; const bl = beltGain(g2.world, 1); if (bl) g2.toast(bl); flag(g2, "spinner"); const x = crewXp(p, "engineer", 2); logEntry(g2.world, `Helped restart the spin at ${st.name}`); return `${eng!.name.toUpperCase()} GOES UP THE SPOKE WITH A TOOL ROLL AND COMES BACK FOUR HOURS LATER WITH THE FLOOR BEHAVING. THE YARD PAYS 150CR AND SAYS THE THING THE BELT SAYS ABOUT REMEMBERING.${x ? " " + x : ""} REP UP.`; } },
        { label: "WAIT IT OUT ABOARD", hint: "Half an hour strapped in; the crew grumble", result: (g2) => { g2.world.time += 1800; for (const c of p.crew) c.morale = Math.max(0, c.morale - 2); return "YOU STAY IN THE CLAMP WITH THE STRAPS ON AND WATCH A MUG DRIFT PAST THE VIEWPORT. HALF AN HOUR LATER THE FLOOR COMES BACK WITH A LURCH. THE CREW GRUMBLE. THE MUG DOES NOT COME BACK."; } },
        { label: "THEY'LL SORT IT WITHOUT YOU", hint: "Rep -1", result: (g2) => { adjustRep(g2.world, st.factionId, -1); return "YOU GO ABOUT YOUR BUSINESS IN THE STRAPS AND THE HANDHOLDS. THE YARD NOTICES A SHIP WITH AN ENGINEER'S BERTH LIT AND NOBODY ON THE SPOKE. REP DOWN, A LITTLE."; } },
      ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "station", true);
  }

  // the crew want a word: a bonus, a night ashore, or your foot down
  // the seconds' bar: review week, and the Numbers One of every hull in the line drink while the captains posture
  secondsBar(g: Game): void {
    const st = this.station; const p = g.world.player; const fo = firstOfficer(p)!; (p.flags ??= {})[`secondsbar:${weekKey()}`] = true; const rv = rivalOf(g.world);
    const enc: Encounter = { id: "secondsbar", where: "space", title: "THE SECONDS' BAR", weight: 0,
      text: `Review week, and there's a bar on the lower ring with a hand-lettered sign: SECONDS IN COMMAND ONLY. ${fo.name.split(" ")[0]} is looking at it the way people look at a door they've been told about. ${rv ? `${rv.ship}'s Number One is already inside.` : "Half the fleet's Numbers One are already inside."}`,
      options: [
        { label: "GO ON. I'LL MANAGE THE POSTURING", hint: "Number One's loyalty and morale up; they come back with something", result: (g2, rng) => { fo.loyalty = (fo.loyalty ?? 0) + 0.3; fo.morale = Math.min(100, fo.morale + 10); if (rv) rv.disposition = Math.min(5, rv.disposition + 1); const intel = rng.pick(["THE ADMIRAL HATES THE LIGHT SEQUENCE TOO. EVERYBODY DOES. NOBODY SAYS.", `${rv ? rv.ship.toUpperCase() : "THE FLAGSHIP"}'S PORT MOUNT IS WORSE THAN OURS. I'VE STOPPED FEELING BAD ABOUT OURS.`, "EVERY NUMBER ONE IN THAT ROOM HAS THE SAME STORY ABOUT THEIR CAPTAIN AND THE COFFEE MACHINE. INCLUDING ME. SORRY."]); flag(g2, "secondsbar"); logEntry(g2.world, `${fo.name} drank at the seconds' bar during review week at ${st.name}`); return `${fo.name.split(" ")[0].toUpperCase()} COMES BACK THREE HOURS LATER, STEADY, WITH ONE THING TO REPORT: '${intel}' LOYALTY UP.${rv ? " THE RIVALRY IS A DEGREE WARMER, WHICH IS THE SECONDS' JOB." : ""}`; } },
        { label: "WE'VE A SCHEDULE", hint: "Morale down a little; the sign stays up all week", result: () => { fo.morale = Math.max(0, fo.morale - 4); return `${fo.name.split(" ")[0].toUpperCase()} NODS AND DOESN'T LOOK AT THE SIGN AGAIN, WHICH TAKES SOME DOING, BECAUSE IT'S RIGHT THERE.`; } },
      ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "station", true);
  }
  // fleet review: the service's hulls in line abreast, and a merchant with a rank expected among them
  fleetReview(g: Game): void {
    const st = this.station; const p = g.world.player; const fac = faction(st.factionId); (p.flags ??= {})[`review:${st.id}:${weekKey()}`] = true;
    const rk = commandRank(p);
    const enc: Encounter = { id: "fleetreview", where: "space", title: "FLEET REVIEW", weight: 0,
      text: `The ${fac.name} have their hulls in line abreast off the yard, paint fresh, running lights in sequence, and a signal on the band for every ship with a rank on the register: '${rk} ${(p.shipName ?? "").toUpperCase() || "MERCHANT"}, TAKE STATION AT THE END OF THE LINE.' The end of the line is where they put the ships that aren't theirs but might be, one day.`,
      options: [
        { label: "TAKE STATION. LIGHTS IN SEQUENCE", hint: "Rep +5, a ribbon, the crew stand to; the ship sits an hour", result: (g2) => { adjustRep(g2.world, st.factionId, 5); g2.world.time += 3600; for (const c of p.crew) { c.morale = Math.min(100, c.morale + 5); c.loyalty = (c.loyalty ?? 0) + 0.1; } const ribbon = `a ${fac.name} review ribbon, ${st.name}`; if (!(p.keepsakes ?? []).includes(ribbon)) { (p.keepsakes ??= []).push(ribbon); if (p.keepsakes.length > 8) p.keepsakes.shift(); p.ribbons = (p.ribbons ?? 0) + 1; } flag(g2, "fleetreview"); logEntry(g2.world, `Took station at the end of the line for the ${fac.name} fleet review at ${st.name}`); return "YOU TAKE STATION AT THE END OF THE LINE AND RUN THE LIGHTS IN SEQUENCE WITH EVERYONE ELSE, AND FOR AN HOUR A MERCHANT HULL IS PART OF A FLEET. THE CREW STAND TO AT THE VIEWPORT WITHOUT BEING ASKED. REP UP. A RIBBON."; } },
        { label: "FLY PAST AND DIP THE LIGHTS", hint: "Rep +2; no hour lost; the admiral notices anyway", result: (g2) => { adjustRep(g2.world, st.factionId, 2); logEntry(g2.world, `Dipped the lights past the ${fac.name} fleet review at ${st.name}`); return "YOU FLY THE LENGTH OF THE LINE AT A WALKING PACE WITH THE LIGHTS DIPPED, WHICH IS THE OLD COURTESY, AND SOMEBODY ON THE FLAGSHIP'S BAND SAYS 'NOTED, CAPTAIN' IN A VOICE THAT MEANS IT. REP UP."; } },
        { label: "I'M A MERCHANT. I HAVE A CLAMP TO MAKE", hint: "Rep -2; the end of the line remembers", result: (g2) => { adjustRep(g2.world, st.factionId, -2); return "YOU GO ROUND THE LINE TO THE CLAMP. THE END OF THE LINE, WHERE THEY'D HAVE PUT YOU, STAYS EMPTY THE WHOLE REVIEW, AND EVERYBODY CAN SEE IT."; } },
      ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "station", true);
  }
  // two of the crew, close, ask for the same leave
  leaveTogether(g: Game, pair: [CrewMember, CrewMember]): void {
    const st = this.station; const p = g.world.player; const [a, b] = pair; (p.flags ??= {})[`leavepair:${weekKey()}`] = true;
    const A = a.name.split(" ")[0].toUpperCase(), B = b.name.split(" ")[0].toUpperCase();
    const enc: Encounter = { id: "leavetogether", where: "space", title: "THE SAME LEAVE", weight: 0,
      text: `${a.name} and ${b.name} at the clamp together, which they've clearly rehearsed and are clearly bad at. They'd both like leave. Here. Now. The same leave. ${A} does the talking and ${B} does the standing there, and neither of them says why, and everybody on the gangway knows why.`,
      options: [
        { label: "GRANTED. BOTH OF YOU. GO", hint: "Two berths empty for a while; loyalty up, both, a lot", requires: () => berthsUsed(p) <= hull(p.hullId).crewSlots, result: (g2) => { sendOnLeave(p, a, st.id); sendOnLeave(p, b, st.id); a.loyalty = (a.loyalty ?? 0) + 0.4; b.loyalty = (b.loyalty ?? 0) + 0.4; shiftBond(a, b, 0.5); flag(g2, "sameleave"); logEntry(g2.world, `${a.name} and ${b.name} took the same leave at ${st.name}`); return `YOU SAY GO BEFORE ${A} FINISHES THE SENTENCE, AND THEY GO, AND ${B} LOOKS BACK ONCE FROM THE GANGWAY WITH A FACE YOU'LL REMEMBER. LOYALTY UP, BOTH. THE BUNK ROOM IS TWO QUIETER. COLLECT THEM HERE.`; } },
        { label: "ONE AT A TIME. THE SHIP NEEDS HANDS", hint: "Neither goes; morale down, both; the bond holds anyway", result: () => { a.morale = Math.max(0, a.morale - 5); b.morale = Math.max(0, b.morale - 5); return `${A} NODS. ${B} NODS. THEY GO BACK ABOARD SEPARATELY AND EAT TOGETHER ANYWAY, AND NOBODY SAYS ANYTHING, LOUDLY.`; } },
        { label: "GRANTED, AND THE SHIP'S CARD (120CR)", hint: "Leave and a dinner on the ship; loyalty up more", requires: () => p.credits >= 120 && berthsUsed(p) <= hull(p.hullId).crewSlots, result: (g2) => { p.credits -= 120; sendOnLeave(p, a, st.id); sendOnLeave(p, b, st.id); a.loyalty = (a.loyalty ?? 0) + 0.6; b.loyalty = (b.loyalty ?? 0) + 0.6; shiftBond(a, b, 0.6); for (const c of p.crew) c.morale = Math.min(100, c.morale + 2); flag(g2, "sameleave"); logEntry(g2.world, `${a.name} and ${b.name} took the same leave at ${st.name}, on the ship's card`); return `YOU HAND ${A} THE SHIP'S CARD AND SAY 'SOMEWHERE WITH TABLECLOTHS'. THE GANGWAY APPLAUDS. THE REST OF THE CREW WILL BE INSUFFERABLE ABOUT THIS FOR A WEEK, HAPPILY. LOYALTY UP, BOTH, A LOT.`; } },
      ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "station", true);
  }
  // commissioning: a new hull under you, a new stardate on the plaque, and the yard says so
  commission(g: Game): void {
    const p = g.world.player; p.commissionedAt = g.world.time; p.hullsCommissioned = (p.hullsCommissioned ?? 0) + 1;
    logEntry(g.world, `Commissioned ${(p.shipName ?? hull(p.hullId).name)} at ${this.station.name}, stardate ${stardate(g.world)}`);
    g.toast(`${dedication(g.world)}. THE YARD RINGS A BELL THEY KEEP FOR THIS. ONCE.`);
    if ((p.hullsCommissioned ?? 0) >= 3) flag(g, "commissioned3");
  }
  // the office sends someone, once, after the third letter
  officeVisit(g: Game): void {
    const st = this.station; const p = g.world.player; (p.flags ??= {}).officeVisited = true;
    const enc: Encounter = { id: "officevisit", where: "space", title: "A REPRESENTATIVE", weight: 0,
      text: `A person in a grey suit at the clamp with a folder that has your registry on it. 'I'm from the office. The letter said nobody would visit. The letter was written before the budget meeting. I have four questions and I have been told not to sit down.'`,
      options: [
        { label: "ANSWER ALL FOUR", hint: "Data +40; the file closes, more or less", result: (g2) => { p.expData = (p.expData ?? 0) + 40; flag(g2, "officevisit"); logEntry(g2.world, `The office sent a representative to ${st.name}; answered the questions`); return "YOU ANSWER. THEY WRITE. THE FOURTH QUESTION IS 'WOULD YOU DO IT AGAIN' AND THEY WRITE DOWN YOUR PAUSE. +40 DATA. 'THE FILE WILL BE MARKED CLOSED. THAT IS NOT THE SAME AS CLOSED.'"; } },
        { label: "ASK WHAT THE OFFICE ACTUALLY DOES", hint: "Morale up; they don't know either", result: (g2) => { for (const c of p.crew) c.morale = Math.min(100, c.morale + 4); flag(g2, "officevisit"); logEntry(g2.world, `The office sent a representative to ${st.name}; asked what the office does`); return "A LONG PAUSE. 'WE NOTE THINGS.' 'AND THEN?' 'THEN THEY HAVE BEEN NOTED.' THE CREW, LISTENING FROM THE LOCK, HAVE TO GO BELOW. MORALE UP. THE REPRESENTATIVE LEAVES A FORM."; } },
        { label: "NO COMMENT", hint: "The file gets a sticker", result: (g2) => { logEntry(g2.world, `The office sent a representative to ${st.name}; no comment`); return "'NOTED.' THEY PUT A SMALL RED STICKER ON THE FOLDER AND LEAVE. YOU WILL NEVER FIND OUT WHAT THE STICKER MEANS."; } },
      ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "station", true);
  }
  // a command of their own: the service offers Number One a ship, and Number One asks you first
  commandOfferScene(g: Game, fo: CrewMember): void {
    const st = this.station; const p = g.world.player; const fac = faction(st.factionId); (p.flags ??= {})[`offer:${fo.name}`] = true;
    const shipName = `${fo.name.split(" ")[0]}'s Word`;
    const enc: Encounter = { id: "commandoffer", where: "space", title: "A COMMAND OF THEIR OWN", weight: 0,
      text: `${fo.name} comes to the ready room with a sheet of paper and doesn't sit down. The ${fac.name} are offering them a cutter. Their own. They've read it four times. They haven't said yes. They wanted you to hear it from them first, and they'd like to know what you think, and they've already decided, and they haven't.`,
      options: [
        { label: "TAKE IT. THAT'S AN ORDER I CAN'T GIVE", hint: "They go; a captain of their own in the lanes who knows your hull; rep +4", result: (g2) => { const first = fo.name.split(" ")[0]; retireCrew(p, fo, st.id, g2.world.time); const al = (p.alumni ?? []).find((a) => a.name === fo.name); if (al) al.command = shipName; (g2.world.captains ??= []).push({ id: `no1-${fo.name.replace(/\s+/g, "-").toLowerCase()}`, name: fo.name, ship: shipName, homeStationId: st.id, disposition: 4, met: 1, helped: 0, lastSeen: g2.world.time }); adjustRep(g2.world, st.factionId, 4); (g2.world.mailQueue ??= []).push({ dueT: g2.world.time + 1200, from: `${fo.name}, ${shipName}`, text: `First week in the chair. I keep turning round to tell you something and there's a bulkhead. The cutter's called ${shipName}, which the yard thinks is a joke and isn't. I've put a plaque by the airlock. It says what yours says. Look me up. I'll buy. I'm a captain now; I can afford it, they tell me.`, gift: { credits: 150 } }); if (p.numberOne === fo.name) delete p.numberOne; flag(g2, "commandoffer"); logEntry(g2.world, `${fo.name} took a command of their own, ${shipName}, at ${st.name}`); return `YOU SAY THE THING YOU'VE BEEN AFRAID OF SAYING FOR TWENTY DOCKINGS, AND ${first.toUpperCase()} SAYS 'I KNOW' AND THEN 'THANK YOU' AND THEN NOTHING FOR A WHILE. THEY GO DOWN THE GANGWAY WITH ONE BAG. THE LANES HAVE A NEW CAPTAIN WHO KNOWS EVERY RATTLE IN THIS HULL. REP UP.`; } },
        { label: "'I'D RATHER YOU STAYED.' SAY IT PLAINLY", hint: "They stay, this time; loyalty up a lot; the offer will come again in a year", result: (g2) => { fo.loyalty = (fo.loyalty ?? 0) + 1; fo.morale = Math.min(100, fo.morale + 10); flag(g2, "stayed"); logEntry(g2.world, `${fo.name} turned down a command to stay aboard`); return `'THEN I'LL STAY.' NO PAUSE. THEY'D DECIDED THAT TOO. THE PAPER GOES IN A POCKET AND YOU DON'T SEE IT AGAIN, AND THE CREW, WHO KNEW, ARE VERY LOUD ABOUT NOTHING IN THE GALLEY THAT NIGHT. LOYALTY UP, A LOT.`; } },
        { label: "IT'S YOUR CALL. I WON'T MAKE IT FOR YOU", hint: "A coin: they go with less, or stay with less", result: (g2, rng) => { if (rng.chance(0.5)) { retireCrew(p, fo, st.id, g2.world.time); const al = (p.alumni ?? []).find((a) => a.name === fo.name); if (al) al.command = shipName; (g2.world.captains ??= []).push({ id: `no1-${fo.name.replace(/\s+/g, "-").toLowerCase()}`, name: fo.name, ship: shipName, homeStationId: st.id, disposition: 2, met: 1, helped: 0, lastSeen: g2.world.time }); if (p.numberOne === fo.name) delete p.numberOne; logEntry(g2.world, `${fo.name} took a command of their own after the captain wouldn't say`); return `THEY WANTED YOU TO SAY. YOU DIDN'T. THEY GO, AND THE GOING IS QUIETER THAN IT SHOULD BE, AND THE LANES HAVE A NEW CAPTAIN WHO'LL BE CIVIL ON THE BAND AND NOT MORE.`; } fo.loyalty = (fo.loyalty ?? 0) + 0.3; return "THEY WANTED YOU TO SAY. YOU DIDN'T. THEY STAY, AND YOU'LL NEVER KNOW IF THAT WAS THE ANSWER THEY WANTED, AND NEITHER WILL THEY."; } },
      ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "station", true);
  }
  // a transfer request: they've served long enough to ask, and they're unhappy enough to mean it
  transfer(g: Game, c: CrewMember): void {
    const st = this.station; const p = g.world.player; (p.flags ??= {})[`transfer:${c.name}`] = true;
    const enc: Encounter = { id: "transfer", where: "space", title: "A TRANSFER REQUEST", weight: 0,
      text: `${c.name} asks for a minute at the clamp, in the uniform they don't usually wear. The ${faction(st.factionId).name} have a posting ashore, and they've put in for it. They want to know if you'll sign the recommendation, or whether you'd rather they didn't go.`,
      options: [
        { label: "SIGN IT. GO WELL", hint: "They go, with a recommendation; rep +2; they'll write", result: (g2) => { retireCrew(p, c, st.id, g2.world.time); adjustRep(g2.world, st.factionId, 2); (g2.world.mailQueue ??= []).push({ dueT: g2.world.time + 900, from: `${c.name}, ashore at ${st.name}`, text: `The posting's a desk with a window and I hate it and I'm grateful. You signed it without a speech. I noticed. If you ever need a friend in the ${faction(st.factionId).name}, you've got one with a stamp.`, gift: { parts: 1 } }); flag(g2, "transfer"); logEntry(g2.world, `Signed ${c.name}'s transfer ashore at ${st.name}`); return `YOU SIGN IT WITHOUT A SPEECH. ${c.name.toUpperCase()} SALUTES, WHICH THEY'VE NEVER DONE, AND GOES DOWN THE GANGWAY WITH THEIR BAG. REP UP. THE BUNK ROOM IS QUIETER THAN IT WAS.`; } },
        { label: "TALK THEM ROUND", hint: "Usually works; morale and loyalty up if it does", result: (g2, rng) => { if (rng.chance(0.7)) { c.morale = Math.min(100, c.morale + 15); c.loyalty = (c.loyalty ?? 0) + 0.3; logEntry(g2.world, `Talked ${c.name} out of a transfer at ${st.name}`); return `YOU TELL THEM WHAT THE SHIP WOULD BE WITHOUT THEM, PLAINLY, AND THEY TEAR THE FORM IN HALF IN FRONT OF YOU. MORALE AND LOYALTY UP. YOU OWE THEM A BETTER LEG.`; } retireCrew(p, c, st.id, g2.world.time); logEntry(g2.world, `Tried to talk ${c.name} out of a transfer at ${st.name}; they went anyway`); return `YOU SAY THE THING AND IT ISN'T ENOUGH. ${c.name.toUpperCase()} GOES ANYWAY, WITHOUT THE RECOMMENDATION, WHICH IS WORSE FOR BOTH OF YOU.`; } },
        { label: "REFUSE", hint: "They stay; morale and loyalty down", result: () => { c.morale = Math.max(0, c.morale - 10); c.loyalty = (c.loyalty ?? 0) - 0.3; return `YOU DON'T SIGN. ${c.name.toUpperCase()} NODS AND GOES BACK ABOARD AND DOESN'T SAY ANYTHING ABOUT IT AGAIN, WHICH IS THE WORST WAY NOT TO SAY SOMETHING.`; } },
      ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "station", true);
  }
  // a hearing over the rule: the survey's board of ethics as witness, Number One as advocate if you have one
  hearing(g: Game): void {
    const st = this.station; const p = g.world.player; p.hearings = (p.hearings ?? 0) + 1; const fo = firstOfficer(p); const fac = faction(st.factionId);
    const fine = 400;
    const enc: Encounter = { id: "hearing", where: "space", title: "A HEARING", weight: 0,
      text: `A smaller room than the board's, with a window this time, and a representative of the survey's board of ethics at the far end who is not permitted to say anything and is saying it loudly with their face. The ${fac.name} chair: 'A population that had not met a ship has now met one, ${commandRank(p).toLowerCase()}. Yours. We're not here to punish. We're here to write down why.'`,
      options: [
        { label: "LET NUMBER ONE SPEAK", hint: "Rep +3; Number One's loyalty up; the room hears the version with the child in it", requires: () => !!fo, result: (g2) => { adjustRep(g2.world, st.factionId, 3); fo!.loyalty = (fo!.loyalty ?? 0) + 0.4; flag(g2, "hearing"); logEntry(g2.world, `A hearing at ${st.name} over the rule; ${fo!.name} spoke`); return `${fo!.name.toUpperCase()} STANDS AND TELLS IT WITH THE CHILD IN IT, AND THE FIRE, AND THE WHEEL THEY'VE SINCE INVENTED, AND THE REPRESENTATIVE'S FACE DOES SOMETHING IT'S NOT PERMITTED TO DO. 'NOTED. NO ACTION.' REP UP.`; } },
        { label: "SAY IT YOURSELF: I'D DO IT AGAIN", hint: "Rep -2 here, +3 with the survey's letter; the board of ethics writes", result: (g2) => { adjustRep(g2.world, st.factionId, -2); p.expData = (p.expData ?? 0) + 30; flag(g2, "hearing"); (g2.world.mailQueue ??= []).push({ dueT: g2.world.time + 600, from: "the survey's board of ethics, after the hearing", text: "The board is not permitted to say that 'I'd do it again' was the right answer. The board has said nothing. The board has enclosed thirty data's worth of nothing and would like you to keep flying the way you fly.", gift: { data: 30 } }); logEntry(g2.world, `A hearing at ${st.name} over the rule; said I'd do it again`); return "YOU SAY IT PLAINLY. THE CHAIR WRITES IT DOWN, WHICH WAS THE POINT OF THE ROOM. REP DOWN, HERE. THE REPRESENTATIVE LEAVES FIRST AND DOESN'T LOOK BACK, WHICH IS HOW THE BOARD SAYS THANK YOU."; } },
        { label: `PAY THE SURVEY'S FINE (${fine}CR)`, hint: "It goes away; the crew notice you paid for a kindness", requires: () => p.credits >= fine, result: (g2) => { p.credits -= fine; for (const c of p.crew) c.morale = Math.max(0, c.morale - 2); logEntry(g2.world, `A hearing at ${st.name} over the rule; paid the fine`); return "YOU PAY. THE ROOM EMPTIES. THE CREW, WHO WERE IN THE CORRIDOR, DON'T SAY THAT YOU PUT A PRICE ON THE VILLAGE. THEY DON'T HAVE TO."; } },
      ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "station", true);
  }
  // a board of inquiry: three officers, a table, and the name of somebody who didn't make it to the pod
  inquiry(g: Game): void {
    const st = this.station; const p = g.world.player;
    const idx = p.inquiries ?? 0; const lost = (p.lost ?? [])[idx]; p.inquiries = idx + 1;
    if (!lost) return;
    const one = firstOfficer(p);
    const enc: Encounter = { id: "inquiry", where: "space", title: "A BOARD OF INQUIRY", weight: 0,
      text: `Three officers at a table in a room with no window, and a file open in front of the middle one. '${lost.name}, ${lost.role}, lost off ${lost.where}.' The chair reads it flat, the way they read everything. 'The service convenes for every name, ${commandRank(p).toLowerCase()}. You know that. Tell us how it happened.'`,
      options: [
        { label: "TELL IT STRAIGHT", hint: "Rep +3, loyalty up; the board finds no fault", result: (g2) => { adjustRep(g2.world, st.factionId, 3); for (const c of p.crew) c.loyalty = (c.loyalty ?? 0) + 0.2; logEntry(g2.world, `A board of inquiry at ${st.name} for ${lost.name}; told it straight, no fault found`); flag(g2, "inquiry"); return `YOU TELL IT THE WAY THE LOG HAS IT, WHICH IS THE ONLY WAY THAT SURVIVES A ROOM LIKE THIS. THE CHAIR WRITES ONE LINE. 'NO FAULT. THE SERVICE THANKS THE SHIP.' REP UP. THE CREW HEARD, THROUGH THE DOOR. LOYALTY UP.`; } },
        { label: "LET NUMBER ONE SPEAK FOR THE SHIP", hint: "Rep +2; Number One's loyalty up, and they'll say the thing you couldn't", requires: () => !!one, result: (g2) => { adjustRep(g2.world, st.factionId, 2); one!.loyalty = (one!.loyalty ?? 0) + 0.5; one!.morale = Math.min(100, one!.morale + 5); logEntry(g2.world, `A board of inquiry at ${st.name} for ${lost.name}; ${one!.name} spoke for the ship`); flag(g2, "inquiry"); return `${one!.name.toUpperCase()} STANDS, AND SAYS THE THING YOU COULDN'T: THAT ${lost.name.toUpperCase().split(" ")[0]} WENT BACK FOR THE OTHERS. THE CHAIR PUTS THE PEN DOWN. 'NO FAULT.' REP UP. NUMBER ONE DOESN'T LOOK AT YOU ON THE WAY OUT, WHICH IS HOW YOU KNOW IT COST THEM.`; } },
        { label: "BLAME THE SHIP. OLD HULL, BAD LUCK", hint: "Half the time the board buys it; the crew always hear", result: (g2, rng) => { for (const c of p.crew) c.morale = Math.max(0, c.morale - 5); if (rng.chance(0.5)) { logEntry(g2.world, `A board of inquiry at ${st.name} for ${lost.name}; blamed the hull and the board took it`); return "THE BOARD TAKES IT. HULLS ARE EASIER TO BLAME THAN CAPTAINS, AND THE CHAIR HAS A HULL OF THEIR OWN. NO FAULT. THE CREW HEARD, THROUGH THE DOOR. MORALE DOWN."; } adjustRep(g2.world, st.factionId, -4); logEntry(g2.world, `A board of inquiry at ${st.name} for ${lost.name}; blamed the hull and the board didn't buy it`); return "THE CHAIR TURNS A PAGE. 'THE HULL WAS SERVICED THREE DOCKS BEFORE. WE HAVE THE STAMP.' A NOTE GOES IN THE FILE WITH YOUR NAME ON IT. REP DOWN. THE CREW HEARD, THROUGH THE DOOR. MORALE DOWN."; } },
        { label: "DECLINE TO ANSWER", hint: "Rep -5; the file stays open", result: (g2) => { adjustRep(g2.world, st.factionId, -5); logEntry(g2.world, `A board of inquiry at ${st.name} for ${lost.name}; declined to answer`); return "'NOTED.' THE FILE CLOSES WITHOUT THE LINE IN IT, WHICH IS WORSE THAN ANY LINE. REP DOWN. THE SERVICE REMEMBERS THE SHIPS THAT DIDN'T SPEAK."; } },
      ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "station", true);
  }

  grievance(g: Game): void {
    const st = this.station; const p = g.world.player;
    grievanceHeard(g.world);
    const spokesman = [...p.crew].sort((a, b) => a.morale - b.morale)[0];
    const fee = 150 * p.crew.length;
    const enc: Encounter = { id: "grievance", where: "space", title: "THE CREW WANT A WORD", weight: 0,
      text: `${spokesman.name} is waiting at the clamp with the others behind them, which is how you know it's been discussed. Nobody's shouting. That's worse. Too many alerts, too many burns, too long between ports, not enough of whatever it is that makes a ship worth staying on. They want to know what you're going to do about it.`,
      options: [
        { label: `A BONUS ROUND (${fee}CR)`, hint: "Morale +15 all round; they'll remember it was money", requires: () => p.credits >= fee, result: (g2) => { p.credits -= fee; for (const c of p.crew) c.morale = Math.min(100, c.morale + 15); logEntry(g2.world, `The crew wanted a word at ${st.name}; paid a bonus round`); sfx.pickup(); return "YOU PAY. THEY TAKE IT. IT HELPS, AND EVERYBODY KNOWS WHAT KIND OF HELP IT IS. MORALE UP. THE NEXT WORD WILL COST MORE."; } },
        { label: "A NIGHT ASHORE, ON YOU", hint: "Morale +10, loyalty up, the ship sits a while", result: (g2) => { for (const c of p.crew) { c.morale = Math.min(100, c.morale + 10); c.loyalty = (c.loyalty ?? 0) + 0.3; } p.wear = (p.wear ?? 0) + 2; g2.world.time += 1800; logEntry(g2.world, `The crew wanted a word at ${st.name}; gave them a night ashore`); flag(g2, "word"); return "YOU SEND THEM DOWN THE GANGWAY WITH THE SHIP'S CARD AND NO CURFEW. THE PROMENADE HEARS THEM COMING BACK. MORALE AND LOYALTY UP; THE SHIP SITS HALF AN HOUR LONGER THAN YOU MEANT."; } },
        { label: "PUT YOUR FOOT DOWN", hint: "Half the time they respect it. Half the time somebody walks.", result: (g2, rng) => { if (rng.chance(0.5)) { for (const c of p.crew) c.morale = Math.min(100, c.morale + 3); logEntry(g2.world, `The crew wanted a word at ${st.name}; put my foot down and they took it`); return "YOU TELL THEM WHAT THE SHIP IS FOR AND WHAT IT ISN'T, AND THAT ANYONE WHO WANTS THE GANGWAY KNOWS WHERE IT IS. NOBODY MOVES. SOMETHING SETTLES. MORALE UP, A LITTLE, FOR THE STRANGEST REASON."; } const c = spokesman; retireCrew(p, c, st.id, g2.world.time); logEntry(g2.world, `The crew wanted a word at ${st.name}; ${c.name} took the gangway`); return `YOU TELL THEM WHAT THE SHIP IS FOR. ${c.name.toUpperCase()} NODS, GOES BELOW FOR THEIR BAG, AND TAKES THE GANGWAY. THE OTHERS STAY. THEY DON'T LOOK AT YOU FOR A WATCH.`; } },
      ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "station", true);
  }

  // an inspection: at commodore and up, somebody with more braid than you walks your deck
  inspection(g: Game): void {
    const st = this.station; const fac = faction(st.factionId); const p = g.world.player;
    receptionHeld(g.world, st);
    const { score, notes } = inspectionScore(p);
    const enc: Encounter = { id: "inspection", where: "space", title: "AN INSPECTION", weight: 0,
      text: `The harbourmaster meets you at the clamp with somebody from the ${fac.name} who has more braid than you and a tablet, and says the word 'inspection' the way people say 'audit'. They would like to walk the deck. They have already started.`,
      options: [
        { label: "SHOW THEM THE SHIP", hint: "Wear, morale, the deck, the hull; four marks", result: (g2) => { if (score >= 3) { adjustRep(g2.world, st.factionId, 5); flag(g2, "inspection"); logEntry(g2.world, `Passed an inspection at ${st.name}, ${score} of 4`); (g2.world.mailQueue ??= []).push({ dueT: g2.world.time + 600, from: `the ${fac.name} inspectorate`, text: `A good ship, ${commandRank(p).toLowerCase()}. I don't write that often, and I don't write it to be nice. Two spares from the depot, on the service's account, because a good ship deserves a spare it didn't have to buy.`, gift: { parts: 2 } }); return `THEY WALK EVERY CORRIDOR, RUN A FINGER ALONG THE GALLEY SHELF, ASK THE CREW THREE QUESTIONS EACH, AND SIGN THE TABLET. ${score} OF 4. "A GOOD SHIP, ${commandRank(p)}." REP UP, A LOT.`; } if (score === 2) { adjustRep(g2.world, st.factionId, 2); return `THEY WALK THE DECK AND MAKE NOTES: ${notes.join(", ")}. 2 OF 4. "ADEQUATE." REP UP, A LITTLE. THE CREW EXHALE.`; } adjustRep(g2.world, st.factionId, -2); return `THEY WALK THE DECK AND STOP MAKING NOTES HALFWAY, WHICH IS WORSE. ${notes.join(", ")}. ${score} OF 4. "WE'LL BE IN TOUCH." REP DOWN.`; } },
        { label: "PLEAD A QUARANTINE", hint: "Nobody inspects a quarantined ship; nobody believes one either", result: (g2) => { adjustRep(g2.world, st.factionId, -1); return "YOU MENTION A COUGH IN THE BUNK ROOM. THE BRAID STOPS AT THE GANGWAY, SAYS 'OF COURSE', AND WRITES SOMETHING LONGER THAN 'OF COURSE'. REP DOWN, A LITTLE."; } },
      ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "station", true);
  }

  // a reception in your honour: a speech, a gift, or an early night
  reception(g: Game): void {
    const st = this.station; const fac = faction(st.factionId); const p = g.world.player;
    receptionHeld(g.world, st);
    const enc: Encounter = { id: "reception", where: "space", title: "A RECEPTION IN YOUR HONOUR", weight: 0,
      text: `The harbourmaster meets you at the clamp in a clean jacket. The ${fac.name} would like a word, and by a word they mean a room on the upper ring with a long table, a hundred people who know your name, and a glass in your hand before you've said anything. Somebody taps the glass.`,
      options: [
        { label: "MAKE A SPEECH", hint: "Short is good. Short is very good.", result: (g2, rng) => { if (rng.chance(0.65)) { adjustRep(g2.world, st.factionId, 3); for (const c of p.crew) c.morale = Math.min(100, c.morale + 4); flag(g2, "diplomat"); logEntry(g2.world, `A reception at ${st.name}; the speech landed`); { const ribbon = `a ${fac.name} ribbon, pinned on at ${st.name}`; if (!(p.keepsakes ?? []).includes(ribbon)) { (p.keepsakes ??= []).push(ribbon); if (p.keepsakes.length > 8) p.keepsakes.shift(); p.ribbons = (p.ribbons ?? 0) + 1; if ((p.ribbons ?? 0) >= 3) flag(g2, "ribbons"); g2.toast(`THE HARBOURMASTER PINS A ${fac.name.toUpperCase()} RIBBON ON YOUR JACKET, CROOKED. IT STAYS ABOARD.`); } } return `YOU KEEP IT SHORT: THE LANES, THE PEOPLE ON THEM, AND ONE JOKE ABOUT THE COFFEE. THEY LAUGH IN THE RIGHT PLACE. REP UP WITH THE ${fac.name.toUpperCase()}. THE CREW ARE INSUFFERABLE ABOUT IT FOR A DAY.`; } adjustRep(g2.world, st.factionId, 1); flag(g2, "diplomat"); logEntry(g2.world, `A reception at ${st.name}; the speech ran long`); return "YOU MEAN TO KEEP IT SHORT. IT IS NOT SHORT. SOMEWHERE IN THE FOURTH MINUTE YOU THANK THE CAT. THEY CLAP ANYWAY. REP UP, A LITTLE."; } },
        { label: "BRING A GIFT FROM THE HOLD (1 LUXURIES)", requires: () => (p.cargo.lux ?? 0) >= 1, result: (g2) => { removeCargo(p, "lux", 1); adjustRep(g2.world, st.factionId, 4); flag(g2, "diplomat"); logEntry(g2.world, `A reception at ${st.name}; brought a gift`); return `A CRATE FROM THE HOLD, OPENED AT THE TABLE. THE HOST IS DELIGHTED IN THE WAY OF SOMEBODY WHO OWNS SEVERAL ALREADY. REP UP WITH THE ${fac.name.toUpperCase()}. NOBODY ASKS YOU TO SPEAK.`; } },
        ...(() => { const best = [...p.crew].filter((c) => !c.sick).sort((a, b) => (b.docks ?? 0) - (a.docks ?? 0) || b.skill - a.skill)[0]; return best ? [{ label: `COMMEND ${best.name.toUpperCase()} BEFORE THE ROOM`, hint: "Loyalty and morale up, theirs most; the room applauds somebody else", result: (g2: Game) => { best.loyalty = (best.loyalty ?? 0) + 0.5; best.morale = Math.min(100, best.morale + 12); for (const c of p.crew) if (c !== best) c.morale = Math.min(100, c.morale + 3); const x = crewXp(p, best.role, 2); adjustRep(g2.world, st.factionId, 2); flag(g2, "commended"); logEntry(g2.world, `Commended ${best.name} before the room at ${st.name}`); return `YOU TAKE THE GLASS, AND THE ROOM, AND GIVE BOTH TO ${best.name.toUpperCase()}: ${best.docks ?? 0} DOCKINGS, EVERY ONE OF THEM ON WATCH. THE ROOM STANDS. THEY DON'T KNOW WHERE TO LOOK. LOYALTY UP.${x ? " " + x : ""}`; } }] : []; })(),
        { label: "DECLINE POLITELY", hint: "An early night; they'll remember", result: (g2) => { adjustRep(g2.world, st.factionId, -1); return "YOU PLEAD A LONG DAY, WHICH IS TRUE. THE HARBOURMASTER NODS THE WAY PEOPLE NOD WHEN THEY'LL MENTION IT LATER. REP DOWN, A LITTLE."; } },
      ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "station", true);
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
