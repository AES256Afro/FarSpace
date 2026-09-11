// Ambient comms: the system talks to itself. Station control, traders, patrols,
// the odd prospector. Lines are picked from what is actually happening.

import type { Game } from "../game";
import { faction } from "../data/data";
import { commodity } from "../data/data";
import { findStation, galaxyEventAt, captainNickname, borderContest } from "../world";
import * as wire from "./wire";
import { RNG } from "./rng";

export interface ChatterLine { from: string; text: string }

export function pickChatter(g: Game, rng: RNG): ChatterLine | null {
  const w = g.world;
  const p = w.player;
  const sys = w.systems[p.systemId];
  const fac = faction(sys.factionId);
  const st = sys.stations.length ? rng.pick(sys.stations) : null;
  const other = sys.stations.length > 1 ? rng.pick(sys.stations.filter((x) => x !== st)) : null;
  const pool: ChatterLine[] = [];
  if (st) {
    pool.push({ from: `${st.name.toUpperCase()} CONTROL`, text: rng.pick([`INBOUND TRAFFIC, HOLD AT ${rng.int(2, 9)} HUNDRED, BAY ${rng.int(1, 9)} IS CYCLING`, "ALL VESSELS, KEEP YOUR TRANSPONDERS LIT INSIDE THE APPROACH LANE", `DEPARTING ${rng.pick(["HAULER", "SHUTTLE", "TENDER"])} CLEAR TO BURN, WATCH THE BELT`, "NO WEAPONS DISCHARGE WITHIN THE SAFE ZONE. WE MEAN IT."]) });
    pool.push({ from: rng.pick(["HAULER MARGIT", "FREIGHTER OKONKWO", "SHUTTLE 7", "TENDER BLUE-4", "PROSPECTOR VASK"]), text: rng.pick([`${st.name.toUpperCase()}, REQUESTING A BAY, ${rng.int(6, 40)} TONNES OF ${commodity(rng.pick(Object.keys(st.prices))).name.toUpperCase()} ABOARD`, "ANYONE GOT A PRICE ON PARTS OUT HERE? DON'T ALL ANSWER AT ONCE.", `RUNNING LATE, TELL THE ${rng.pick(["FOREMAN", "QUARTERMASTER", "BUYER"])} I'M STILL COMING`, "THAT BELT IS PICKED CLEAN. SOMEBODY BEAT ME TO IT AGAIN."]) });
  }
  if (other && st) pool.push({ from: `${other.name.toUpperCase()} CONTROL`, text: `${st.name.toUpperCase()}, ${other.name.toUpperCase()}: WE HAVE YOUR ${rng.pick(["SHUTTLE", "COURIER", "OVERDUE HAULER"])} ON THE SCOPE, HANDING OVER` });
  if (sys.factionId !== "vex") pool.push({ from: `${fac.name.split(" ")[0].toUpperCase()} PATROL`, text: rng.pick(["SWEEP COMPLETE, NOTHING ON THE LANES", `ROUTINE SCANS AT THE ${rng.pick(["INNER", "OUTER"])} GATE THIS SHIFT, KEEP YOUR MANIFESTS HANDY`, "REPORTS OF CORSAIR ACTIVITY NEAR THE BELT. STAY IN THE LANES.", "UNKNOWN CONTACT, IDENTIFY YOURSELF. ... COPY, SAFE TRANSIT."]) });
  else pool.push({ from: "UNKNOWN", text: rng.pick(["THE VEIL SEES YOU.", "THIS IS NOT YOUR SPACE.", "...", "TURN BACK OR PAY THE TOLL. THERE IS NO TOLL. TURN BACK."]) });
  const c = w.crisis;
  if (c && c.delivered < c.need && w.time < c.until) { const f = findStation(w, c.stationId); if (f) pool.push({ from: `${f.st.name.toUpperCase()} MEDICAL`, text: `ANY VESSEL WITH ${commodity(c.commodityId).name.toUpperCase()}: WE ARE PAYING ${c.kind === "outbreak" ? "AND WE ARE RUNNING OUT OF BEDS" : "AND WE ARE RUNNING OUT OF TIME"}` }); }
  const ev = galaxyEventAt(w, sys.id);
  if (ev) pool.push({ from: ev.kind === "comet" ? "PROSPECTOR VASK" : ev.kind === "flare" ? `${fac.name.split(" ")[0].toUpperCase()} WEATHER` : st ? `${st.name.toUpperCase()} CONTROL` : "GALNET", text: ev.kind === "comet" ? "EVERY ROCK OUT HERE IS GLITTERING. I'VE NEVER SEEN A BELT LIKE IT." : ev.kind === "flare" ? "FLARE WARNING REMAINS IN EFFECT. SCOOPS AND LONG SCANS NOT ADVISED." : ev.kind === "festival" ? "FESTIVAL TRAFFIC IS HEAVY. TOURISTS, PLEASE STOP HAILING CONTROL FOR DIRECTIONS." : "DOCKERS ARE STILL OUT. NO YARD SERVICES AT STANDARD RATES. DON'T ARGUE WITH THE PICKET." });
  { const bc = borderContest(w); if (bc && bc.systemId === sys.id) pool.push({ from: `${fac.name.split(" ")[0].toUpperCase()} CONTROL`, text: rng.pick([`ALL TRAFFIC: ${sys.name.toUpperCase()} REMAINS ${fac.name.toUpperCase()} SPACE. SUPPLY RUNS WELCOME. RALLY ON THE BOARD.`, "WE'RE COUNTING MANIFESTS THIS WEEK. EVERY CRATE LANDED HERE IS A VOTE, OF A KIND."]) }); }
  if (Math.random() < 0.5) pool.push({ from: rng.pick(["HAULER MARGIT", "TENDER BLUE-4", "FREIGHTER OKONKWO"]), text: rng.pick(["CONVOY FORMING FOR THE GATE IN TEN. ANYBODY WITH A HULL TO SPARE, WE'LL PAY FOR THE COMPANY.", "THREE OF US, NO GUNS, AND A LONG WAY TO THE GATE. LEAD AND WE FOLLOW."]) });
  if (w.realGalaxy && wire.lightsAt(sys.name).some((l) => l.kind === "mayday")) pool.push({ from: `${fac.name.split(" ")[0].toUpperCase()} CONTROL`, text: "A MAYDAY IS ON THE WIRE FOR THIS SYSTEM. ANY VESSEL WITH FUEL TO SPARE, YOU KNOW WHAT TO DO." });
  const war = w.synWar;
  if (war && war.systemId === sys.id) pool.push({ from: `[${war.defender}] CONVOY`, text: rng.pick([`[${war.attacker}] RAIDERS AT THE ${rng.pick(["GATE", "BELT", "OUTER LANE"])}. ANYONE FRIENDLY, WE'D TAKE THE HELP.`, "HOLD FORMATION. THEY WANT THE CARGO, NOT US. PROBABLY."]) });
  for (const sy of w.syndicates ?? []) if (sy.systemId === sys.id) pool.push({ from: `[${sy.tag}] DISPATCH`, text: rng.pick([`CONVOY ${rng.int(2, 19)} DEPARTING FOR ${(findStation(w, sy.partners[0] ?? "")?.st.name ?? "THE PARTNERS").toUpperCase()}, ESCORT ON STATION`, "ALL [${sy.tag}] HULLS: TREASURY SAYS NO OVERTIME THIS CYCLE. GRIN AND BEAR IT.".replace("${sy.tag}", sy.tag), `INDEPENDENTS WELCOME AT THE BASE. WORK ON THE BOARD. DON'T TOUCH THE CONVOYS.`]) });
  if (p.wanted > 0.4 && sys.factionId !== "vex") pool.push({ from: `${fac.name.split(" ")[0].toUpperCase()} PATROL`, text: "BE ADVISED: A FLAGGED HULL IS TRANSITING THIS SYSTEM. PATROLS ARE AWARE." });
  // fame: the lanes remember what this ship has done
  const ship = (p.shipName ?? "").toUpperCase();
  if (ship && st) {
    const famous: string[] = [];
    if ((p.rescues ?? 0) >= 3) famous.push(`THAT'S THE ${ship}. ANSWERED ${p.rescues} MAYDAYS THAT I KNOW OF. GIVE THEM THE LANE.`);
    if ((p.repairs ?? 0) >= 3) famous.push(`${ship} ON THE SCOPE. THEIR ENGINEER PUT MY COUSIN'S FREIGHTER BACK TOGETHER OFF ${sys.name.toUpperCase()}.`);
    if ((p.fares ?? 0) >= 5) famous.push(`${ship}? THE LINER? MY SISTER RODE WITH THEM. SAID THE CAT SAT ON HER LAP THE WHOLE WAY.`);
    if ((w.infra ?? []).some((i) => i.owner === (p.captainName ?? "YOU") || i.owner)) famous.push(`${ship} KEEPS THE LIGHT ON OUT PAST THE GATES. IF YOU'VE EVER LIMPED HOME BY THAT BEACON, YOU OWE THEM A DRINK.`);
    if ((p.lineage ?? []).length) famous.push(`${ship}, STILL FLYING. ${p.lineage!.length + 1} CAPTAINS NOW. SOME HULLS JUST DON'T KNOW HOW TO STOP.`);
    { const nick = captainNickname(w); if (nick) famous.push(`${ship} ON APPROACH. THAT'S ${nick}, THAT IS. MIND YOUR MANNERS ON THE BAND.`); }
    if ((p.races ?? 0) >= 1) famous.push(`${ship} RAN THE RINGS AT ${rng.pick(sys.stations)?.name.toUpperCase() ?? "THE STATION"}. ${(p.raceBeaten && Object.keys(p.raceBeaten).length) ? "TOOK THE RECORD, TOO." : "CLEAN RUN, THEY SAY."}`);
    if ((p.postRuns ?? 0) >= 3) famous.push(`${ship} CARRIES THE POST. MY LETTERS GOT THERE FOR ONCE.`);
    if ((p.alumni ?? []).length >= 2) famous.push(`HALF THE GOOD HANDS ON THIS STATION SERVED ON THE ${ship} ONCE. THEY ALL TELL THE SAME STORIES.`);
    if ((p.kills ?? 0) >= 40 && (p.rescues ?? 0) < 1) famous.push(`${ship} INBOUND. KEEP YOUR HEADS DOWN, THAT ONE SHOOTS FIRST.`);
    if (famous.length) pool.push({ from: rng.pick(["HAULER MARGIT", "FREIGHTER OKONKWO", `${st.name.toUpperCase()} CONTROL`, "TENDER BLUE-4"]), text: rng.pick(famous) });
  }
  if (!pool.length) return null;
  return rng.pick(pool);
}
