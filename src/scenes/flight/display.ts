import { focusedObjective, objectiveDetails } from "../../core/journey";
import type { Game } from "../../game";
import type { FlightScene } from "./index";
import { bearing, flightDirections } from "../../core/flightdirections";
import { flightContacts, contactLawTerms } from "./contacts";
import { flightInteraction } from "./interaction";
import { resolveLocalTarget } from "../systemmap";
import { findStation, repLabel } from "../../world";
import { faction } from "../../data/data";
import { inSafeZone } from "./ai";
import { presence } from "../../core/presence";
import { aimedRock } from "../../core/mining";
import { piratePassageRemaining } from "../../core/piracy";
import { recoveryTow } from "../../core/shiprecovery";
import { questLocations } from "../../core/questlocations";
import { STEPS, tutorialStage, tutorialText, tutorialDetails } from "../../core/tutorial";
import { hull } from "../../data/hulls";
import { systemLabel, infraLit, ALERT_NAME, firstOfficer, patientDeadline } from "../../world";
import * as wire from "../../core/wire";
import { PAL } from "../../gfx/palette";

export const FLIGHT_RECORD = { x: 418, y: 14, w: 58, h: 13 };
export interface FlightNotice { text: string; color: string; priority: number }
const degrees = (a: number) => { const b = bearing(a); return `${String(b.degrees).padStart(3, "0")} ${b.compass}`; };

// Presentation only. Navigation, law and encounter state remain their owners' responsibility.
export function flightDisplay(fs: FlightScene, g: Game) {
  const p = g.world.player, sys = g.world.systems[p.systemId];
  const notices: FlightNotice[] = [], activity: FlightNotice[] = [];
  const note = (text: string, priority = 20, color: string = PAL.warn) => notices.push({ text, priority, color });
  const task = (text: string, priority = 20, color: string = PAL.gold) => activity.push({ text, priority, color });
  const nearbyCharge = fs.charges.find(c => Math.hypot(c.ax - p.x, c.ay - p.y) < 120);
  if (nearbyCharge) note(`SEISMIC CHARGE: ${Math.ceil(nearbyCharge.t)}S / GET CLEAR`, 120, PAL.danger);
  if (p.hull < 30) note(`HULL CRITICAL: ${Math.ceil(p.hull)}/${p.hullMax}`, 100, PAL.danger);
  if (p.oxygen < 40) note(`OXYGEN LOW: ${Math.ceil(p.oxygen)}/${p.oxygenMax}`, 95, PAL.danger);
  if ((p.heat ?? 0) > 100) note(`OVERHEAT: ${Math.round(p.heat!)}% / LEAVE THE STAR`, 100, PAL.danger);
  if (p.fuel < 15) note(`LOW FUEL: ${Math.ceil(p.fuel)}/${p.fuelMax} / REFUEL BEFORE DEPARTURE`, 80, PAL.danger);
  const law = fs.lawStatus(g);
  if (law) note(law, 110, PAL.danger);
  if (fs.alert > 0) note(ALERT_NAME[fs.alert], fs.alert === 2 ? 90 : 40, fs.alert === 2 ? PAL.danger : PAL.warn);
  if (fs.raidBase && !fs.raidBase.repelled) note(`RAIDERS AT THE [${fs.raidBase.tag}] BASE`, 90, PAL.danger);
  if (fs.scanMsg) note(fs.scanMsg, 70);
  const passage = piratePassageRemaining(g.world);
  if (passage > 0) note(`CORSAIR PASSAGE: ${Math.ceil(passage)}S / HITS END TRUCE`, 65, PAL.good);
  for (const s of p.systems) if (s.health < 50) note(`${systemLabel(p, s)}: ${Math.round(s.health)}%`, s.health < 25 ? 85 : 40, s.health < 25 ? PAL.danger : PAL.warn);
  if (p.crew.some(c => c.morale < 30)) note("CREW MORALE LOW / A PORT OR A MEAL MAY HELP", 20);
  const sick = p.crew.filter(c => c.sick).length;
  if (sick) note(`${sick} CREW LAID UP`, 25);
  if ((p.wear ?? 0) >= 70) note(`WEAR ${Math.round(p.wear!)}% / YARD SERVICE DUE`, p.wear! >= 90 ? 75 : 20);
  if ((p.heat ?? 0) > 4 && p.heat! <= 100) note(`${fs.scooping ? "SCOOP" : "HEAT"}: ${Math.round(p.heat!)}%`, p.heat! > 70 ? 75 : 10, PAL.thrust);
  const structures = (g.world.infra ?? []).filter(i => i.owner === (wire.getCallsign() ?? "YOU"));
  const dark = structures.filter(i => !infraLit(i)).length, till = structures.reduce((n, i) => n + i.till, 0);
  if (dark) note(`${dark} STRUCTURES DARK / BRING PARTS`, 20);
  if (till >= 200) note(`STRUCTURE TILL: ${Math.round(till)}CR`, 5, PAL.gold);
  const war = g.world.synWar;
  if (war?.systemId === p.systemId) note(`SYNDICATE WAR: [${war.attacker}] VS [${war.defender}] / FRONT ${war.score}`, 45);
  if (fs.repairJob) task(`${fs.repairJob.crewName}: ${fs.repairJob.kind === "medic" ? "TREATING CASUALTIES" : "REPAIRING FREIGHTER"} ${Math.round(Math.min(1, fs.repairJob.progress) * 100)}% / STAY CLOSE`, 100, PAL.good);
  const tow = fs.towing ?? recoveryTow(g.world);
  if (tow) task("TOWING / DOCK AT A STATION / NO CRUISE OR JUMPS / LINE LIMIT 420M", 90);
  if (p.evacuees) task(`${p.evacuees.n} SURVIVORS ABOARD / DOCK TO HAND THEM OVER`, 80, PAL.good);
  const needy = fs.npcs.find(n => n.kind === "trader" && n.hull > 0 && (n.disabled || n.casualties || n.hull < n.hullMax * .5) && Math.hypot(n.x - p.x, n.y - p.y) < 1200);
  if (needy && !fs.repairJob) task(`${needy.name ?? "FREIGHTER"} NEEDS HELP / ${Math.round(Math.hypot(needy.x - p.x, needy.y - p.y))}M`, 70, PAL.good);
  if (fs.docking?.hold) task(`HOLD SHORT OF BAY ${fs.docking.bay} / WAIT FOR CONTROL`, 110);
  else if (fs.docking || fs.dockTimer > .2) task("DOCKING COMPUTER / APPROACH IN PROGRESS", 105, PAL.info);
  if (fs.launching > 0) task("LAUNCH IN PROGRESS / WAIT FOR BAY CLEARANCE", 110, PAL.info);
  if (fs.convoy && !fs.race) {
    const alive = fs.convoy.ships.filter(n => n.hull > 0 && fs.npcs.includes(n));
    task(`CONVOY: ${alive.filter(n => Math.hypot(n.x - p.x, n.y - p.y) < 700).length}/${alive.length} WITH YOU / JUMP THROUGH A GATE`, 30);
  }
  if (fs.race) task(fs.race.started ? `RING RACE ${fs.race.idx}/${fs.race.gates.length} / ${fs.race.t.toFixed(1)}S / PAR ${fs.race.par}S` : "RING RACE / FLY THROUGH RING 1 TO START", 60);
  const fo = firstOfficer(p);
  if (p.numberOneLeg && fo) task(`ACTING CAPTAIN: ${fo.name}`, 10);
  else if (fs.autopilot && fo) task(`CONN: ${fo.name}`, 10);
  if (p.leg && p.crew.length && g.world.time - p.leg.t0 > 21600) note(`LONG LEG: ${Math.floor((g.world.time - p.leg.t0) / 3600)}H`, 10);
  if (fs.alert === 2) {
    const gunner = p.crew.find(c => c.role === "gunner" && !c.sick), engineer = p.crew.find(c => c.role === "engineer" && !c.sick);
    if (gunner) task(`TACTICAL: ${gunner.name}`, 10);
    if (engineer && p.systems.some(s => s.health < 100)) task(`DAMAGE CONTROL: ${engineer.name}`, 15);
  }
  if (fs.arrivalLog) task(fs.arrivalLog, 5, PAL.info);
  notices.sort((a, b) => b.priority - a.priority); activity.sort((a, b) => b.priority - a.priority);
  const urgent = notices.some(n => n.priority >= 70) || activity.some(n => n.priority >= 70);
  const local = resolveLocalTarget(g, fs.localTarget);
  const assignedStation = p.navStationId ? findStation(g.world, p.navStationId) : null;
  const station = assignedStation && assignedStation.sys.id === p.systemId && !p.singersCourse && (!p.navTarget || p.navTarget === assignedStation.sys.id) ? assignedStation.st : null;
  let destination = "NO COURSE / TAB SYSTEM MAP / G GALAXY";
  if (fs.localTarget) destination = local ? `${local.name} / ${Math.round(Math.hypot(local.x - p.x, local.y - p.y))}M` : "LOCAL DESTINATION UNAVAILABLE / TAB CHOOSE ANOTHER";
  else if (station) destination = `${station.name} / ${Math.round(Math.hypot(Math.cos(station.angle) * station.orbit - p.x, Math.sin(station.angle) * station.orbit - p.y))}M`;
  else if (p.navTarget) destination = g.world.systems[p.navTarget]?.name ?? "DESTINATION UNAVAILABLE";
  else if (fs.autopilot && fs.apLabel) destination = fs.apLabel;
  const route = destination.startsWith("NO COURSE") ? destination : `${fs.autopilot ? "AUTO" : fs.cruise ? "CRUISE" : "COURSE"}: ${destination}`;
  const interaction = flightInteraction(fs, g);
  const rock = aimedRock(sys.asteroids, p, fs.aim);
  const mining = rock ? fs.cruise ? "J EXIT CRUISE TO MINE" : Math.hypot(rock.x - p.x, rock.y - p.y) >= 90 ? "APPROACH WITHIN 90M TO MINE" : rock.core ? (p.seismic ?? 0) > 0 ? "C PLACE SEISMIC CHARGE AT CORE ASTEROID" : "F2 WORKSHOP / BUILD A SEISMIC CHARGE FOR THIS CORE" : "HOLD M TO MINE THE AIMED ASTEROID" : null;
  const action = fs.launching > 0 || fs.docking ? "WAIT FOR FLIGHT CONTROL" : nearbyCharge ? "FLY BEYOND 120M FROM THE CHARGE BEFORE IT DETONATES" : interaction?.prompt ?? (fs.autopilot ? "N OR MANUAL FLIGHT CANCELS AUTOPILOT" : mining ?? "TAB CHOOSE A DESTINATION / G GALAXY MAP");
  const security = fs.lawLevel(g) >= 2 ? "SHOOT ON SIGHT" : fs.lawLevel(g) === 1 ? "WANTED" : inSafeZone(fs, g, p.x, p.y) ? "PROTECTED SPACE" : "OPEN SPACE";
  const channel = presence.status === "on" ? `SYSTEM CHANNEL / ${presence.ghosts.size} PILOTS / T HAIL` : "";
  const standing = `${faction(sys.factionId).name} / ${repLabel(p.rep?.[sys.factionId] ?? 0)}`;
  const directions = flightDirections(p.angle, p.vx, p.vy, hull(p.hullId).spriteSize, fs.zoom);
  const chosen = focusedObjective(g.world);
  const focus = chosen ? `CHOSEN: ${chosen.title} / ${g.world.systems[chosen.systemId].name} / ${chosen.action} / F4 VOYAGE` : null;
  const objectives = questLocations(g.world).map(q => `${q.title}: ${g.world.systems[q.systemId]?.name ?? q.systemId} / ${q.action}`);
  const missions = p.missions.filter(m => m.accepted && !m.done).map(m => {
    const progress = m.kind === "patrol" || m.kind === "observe" ? `${Math.floor(m.patrolT ?? 0)}/${m.patrolNeed ?? 90}S${m.observeBlown ? " / OBSERVATION SEEN" : ""}` : m.kind === "emergency" && m.byT !== undefined ? (g.world.time > m.byT ? "LATE / HALF PAY" : `${Math.ceil((m.byT - g.world.time) / 60)}M LEFT`) : m.kind === "bounty" ? `${m.kills ?? 0}/${m.killsNeeded ?? 0}` : m.kind === "ground" ? `${m.groundDone ?? 0}/${m.groundNeed ?? 1}` : m.shipTotal ? `${(m.shipDone ?? 0) + 1}/${m.shipTotal}` : "";
    const patient = m.passengerKind === "patient" ? (m.docksAboard ?? 0) >= patientDeadline(p, m) ? "CRITICAL / NEXT DOCK" : "STABLE" : "";
    const custody = m.passengerKind === "prisoner" ? p.crew.some(c => c.role === "gunner" && !c.sick) ? "IN IRONS / GUARDED" : "IN IRONS / NO GUARD" : "";
    const treaty = m.treaty ? m.tookFire ? "TREATY: SHOT AT" : (m.docksAboard ?? 0) >= (m.patience ?? 2) ? "TREATY: LAST DOCKING" : "TREATY: CLEAN SO FAR" : "";
    const request = m.request && !m.requestSettled ? `${m.request}: ${m.requestMet ? "DONE" : m.tookFire && m.request === "quiet" ? "BROKEN" : "PENDING"}` : "";
    return `${m.title}: ${[progress, patient, custody, treaty, request, m.desc].filter(Boolean).join(" / ")}`;
  });
  const stage = tutorialStage(g), tutorial = stage >= 0 && stage < STEPS.length ? `FLIGHT SCHOOL ${stage + 1}/${STEPS.length}: ${tutorialText(g)} / K SKIP` : null;
  return { focus, contacts: flightContacts(fs, g), ship: (p.shipName ?? hull(p.hullId).name).toUpperCase(), system: sys.name, security, channel, standing, nose: degrees(p.angle), drift: directions.drift ? degrees(directions.drift.angle) : directions.speed >= .05 ? "<2 M/S" : "STOPPED", aim: degrees(fs.mouseAim ? fs.aim : p.angle), speed: Math.round(directions.speed), route, notices, activity, urgent, action, objectives, missions, tutorial };
}

export function flightRecordSections(fs: FlightScene, g: Game): [string, string[]][] {
  const d = flightDisplay(fs, g), p = g.world.player;
  return [
    [d.ship, [`SYSTEM: ${d.system}`, d.security, d.standing, d.channel, `NOSE ${d.nose} / DRIFT ${d.drift} / AIM ${d.aim} / ${d.speed} M/S`, d.route, d.action, `HULL ${Math.ceil(p.hull)}/${p.hullMax} / SHIELD ${Math.ceil(p.shield)}/${p.shieldMax} / FUEL ${Math.ceil(p.fuel)}/${p.fuelMax} / OXYGEN ${Math.ceil(p.oxygen)}/${p.oxygenMax}`, `TORPEDOES ${p.torpedoes ?? 0} / SEISMIC CHARGES ${p.seismic ?? 0}${p.focus ? ` / FOCUS ${p.focus}` : ""}${fs.hardBurn ? " / HARD BURN" : ""}`]],
    ["CONTACT AND PASSAGE TERMS", contactLawTerms(fs, g)],
    ...d.contacts.map(c => [`${c.primary ? "CURRENT ACTION: " : "CONTACT: "}${c.name}`, [`${c.relationship} / ${Math.round(c.distance)}m`, c.intent, ...c.details]] as [string, string[]]),
    ["CURRENT STATUS", [...d.notices, ...d.activity].map(n => n.text)],
    ...(d.tutorial ? [["FLIGHT SCHOOL", [d.tutorial, ...tutorialDetails(g)]] as [string, string[]]] : []),
    ["CHOSEN OBJECTIVE / F4 TO CHOOSE", focusedObjective(g.world) ? objectiveDetails(g.world, focusedObjective(g.world)!) : ["No objective chosen. F4 opens your voyage briefing."]],
    ["OBJECTIVES", d.objectives.length ? d.objectives : ["No active quest locations."]],
    ["CONTRACT TERMS", d.missions.length ? d.missions : ["No active contracts."]],
    ...fs.commsLog.map(c => [`${Math.floor(c.t / 3600)}H${String(Math.floor(c.t % 3600 / 60)).padStart(2, "0")} ${c.from}`, [c.text]] as [string, string[]]),
  ];
}
