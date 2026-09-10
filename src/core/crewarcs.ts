// Crew arcs: one personal story per role, three beats each, offered to crew who
// trust you and advanced by real play, the way the campaigns are. The last beat
// makes them the best they will ever be, and puts a line on the wall.

import type { Game } from "../game";
import type { World, PlayerState } from "../world";
import { findStation, removeCargo, logEntry, pushEvent } from "../world";
import type { CrewMember, CrewRole } from "../data/crew";
import type { Encounter } from "../data/encounters";
import type { EncounterScene } from "../scenes/encounter";
import { RNG, hashStr } from "../core/rng";
import { flag } from "../core/achievements";

export interface CrewArc { id: string; stage: number; targetStationId?: string; targetSystemId?: string; wreckId?: string; planetIdx?: number; baseline?: number; done?: boolean }
interface ArcStage { objective: (w: World, c: CrewMember) => string; check: (g: Game, c: CrewMember) => boolean; card: (g: Game, c: CrewMember) => string }
interface ArcDef { role: CrewRole; title: string; ask: (w: World, c: CrewMember) => string; setup: (w: World, c: CrewMember, rng: RNG) => CrewArc; stages: ArcStage[]; finale: (g: Game, c: CrewMember) => string }

const stName = (w: World, id?: string) => (findStation(w, id ?? "")?.st.name ?? "a station").toUpperCase();
const sysName = (w: World, id?: string) => (w.systems[id ?? ""]?.name ?? "a system").toUpperCase();
const linkedWithStations = (w: World, rng: RNG) => { const sys = w.systems[w.player.systemId]; const pool = sys.links.map((l) => w.systems[l]).filter((s) => s && s.stations.length); return pool.length ? rng.pick(pool) : sys; };

export const CREW_ARCS: ArcDef[] = [
  {
    role: "engineer", title: "THE SHIP THAT BURNED",
    ask: (w, c) => `${c.name.toUpperCase()} WAITS UNTIL THE OTHERS HAVE GONE. 'THERE'S A WRECK I NEED TO SEE. THE SHIP I LEARNED ON. IT BURNED WITH MY TEACHER ABOARD AND I NEVER WENT BACK. IT'S NOT FAR.'`,
    setup: (w, c, rng) => { const sys = linkedWithStations(w, rng); const id = `arc-${hashStr(c.name)}`; if (!sys.wrecks.some((x) => x.id === id)) sys.wrecks.push({ id, x: rng.range(-2500, 2500), y: rng.range(-2500, 2500), looted: false, loot: [{ id: "parts", qty: 2 }, { id: "relics", qty: 1 }], hazard: 0.3, name: `ISV ${["Tallow", "Kindling", "Ember Row", "Firebrand"][hashStr(c.name) % 4]}` }); return { id: "engineer", stage: 0, targetSystemId: sys.id, wreckId: id, targetStationId: c.home }; },
    stages: [
      { objective: (w, c) => `WALK THE WRECK OF ${c.name.toUpperCase()}'S OLD SHIP IN ${sysName(w, c.arc?.targetSystemId)} (E BESIDE IT)`, check: (g, c) => !!g.world.systems[c.arc?.targetSystemId ?? ""]?.wrecks.find((x) => x.id === c.arc?.wreckId)?.looted, card: (g, c) => `${c.name.toUpperCase()} STANDS A LONG TIME IN THE ENGINE ROOM. THE REACTOR HOUSING IS SCORCHED IN THE SHAPE OF A HAND. 'SHE WOULD HAVE WANTED THE PARTS USED. TAKE THEM.'\n\nTHEY WANT TO TAKE SOMETHING HOME: DOCK AT ${stName(g.world, c.arc?.targetStationId)} WITH TWO SPARE PARTS ABOARD.` },
      { objective: (w, c) => `DOCK AT ${stName(w, c.arc?.targetStationId)} WITH 2 SPARE PARTS FOR ${c.name.toUpperCase()}`, check: (g, c) => g.world.player.dockedAt === c.arc?.targetStationId && (g.world.player.cargo.parts ?? 0) >= 2, card: (g, c) => { removeCargo(g.world.player, "parts", 2); return `${c.name.toUpperCase()} BUILDS A SMALL THING OUT OF THE TWO PARTS AND LEAVES IT AT THE YARD CHAPEL. NOBODY ASKS WHAT IT IS. THEY COME BACK ABOARD LIGHTER.`; } },
    ],
    finale: (g, c) => `${c.name.toUpperCase()} RETUNES THE REACTOR THAT NIGHT UNTIL IT HUMS LIKE THE ONE THEY LEARNED ON. IT HAS NEVER RUN BETTER.`,
  },
  {
    role: "medic", title: "THE PATIENT",
    ask: (w, c) => `${c.name.toUpperCase()} HAS A LETTER, OLD AND SOFT AT THE FOLDS. 'SOMEONE I COULDN'T SAVE HAD A DAUGHTER. SHE RUNS A CLINIC NOW, OUT ON THE LANES. I'D LIKE TO SEND HER WHAT I COULDN'T SEND HER MOTHER.'`,
    setup: (w, c, rng) => { const sys = linkedWithStations(w, rng); const st = rng.pick(sys.stations); return { id: "medic", stage: 0, targetSystemId: sys.id, targetStationId: st.id, baseline: w.player.fares ?? 0 }; },
    stages: [
      { objective: (w, c) => `DOCK AT ${stName(w, c.arc?.targetStationId)} WITH 3 MED SUPPLIES FOR ${c.name.toUpperCase()}'S CLINIC`, check: (g, c) => g.world.player.dockedAt === c.arc?.targetStationId && (g.world.player.cargo.med ?? 0) >= 3, card: (g, c) => { removeCargo(g.world.player, "med", 3); return `THE CLINIC IS TWO ROOMS AND A WAITING LIST. THE DAUGHTER READS THE LETTER TWICE AND DOESN'T CRY UNTIL ${c.name.toUpperCase()} HAS GONE. THE MED SUPPLIES ARE ON THE SHELF BEFORE YOU'VE UNDOCKED.\n\nSHE ASKS ONE THING: TAKE SOMEONE FROM THIS STATION WHERE THEY NEED TO GO. ANY FARE FROM THE LOUNGE.`; } },
      { objective: (w, c) => `CARRY A FARE TO THEIR DESTINATION (ANY FARE, FROM ANY LOUNGE)`, check: (g, c) => (g.world.player.fares ?? 0) > (c.arc?.baseline ?? 0), card: (g, c) => `${c.name.toUpperCase()} WATCHES THE PASSENGER WALK DOWN THE RAMP. 'THAT'S ALL MEDICINE IS, MOSTLY. GETTING PEOPLE WHERE THEY NEED TO BE.'` },
    ],
    finale: (g, c) => `${c.name.toUpperCase()} PUTS THE LETTER IN THE MED BAY DRAWER AND STOPS CARRYING IT. THE MED BAY HAS NEVER BEEN BETTER RUN.`,
  },
  {
    role: "pilot", title: "THE LONG BURN",
    ask: (w, c) => `${c.name.toUpperCase()} IS DRAWING GATES ON A NAPKIN. 'THERE'S A RUN I NEVER FINISHED. THREE GATES WITHOUT A DOCK, THEN THE VIEW FROM ORBIT AT THE END OF IT. I HAD A COPILOT THEN. I'D LIKE TO FINISH IT WITH YOU.'`,
    setup: (w, c, rng) => { const sys = linkedWithStations(w, rng); const idx = sys.planets.length ? rng.int(0, sys.planets.length - 1) : 0; return { id: "pilot", stage: 0, targetSystemId: sys.id, planetIdx: idx }; },
    stages: [
      { objective: () => `JUMP THROUGH THREE GATES IN A ROW WITHOUT DOCKING`, check: (g) => (g.world.player.jumpStreak ?? 0) >= 3, card: (g, c) => `THREE GATES, NO DOCK, AND ${c.name.toUpperCase()} HASN'T SAT DOWN ONCE. 'NOW THE VIEW. ${sysName(g.world, c.arc?.targetSystemId)}, ${(g.world.systems[c.arc?.targetSystemId ?? ""]?.planets[c.arc?.planetIdx ?? 0]?.name ?? "THE WORLD").toUpperCase()}. FROM ORBIT.'` },
      { objective: (w, c) => `ORBIT ${(w.systems[c.arc?.targetSystemId ?? ""]?.planets[c.arc?.planetIdx ?? 0]?.name ?? "THE WORLD").toUpperCase()} IN ${sysName(w, c.arc?.targetSystemId)}`, check: (g, c) => g.world.player.lastOrbit?.systemId === c.arc?.targetSystemId && g.world.player.lastOrbit?.planetIdx === c.arc?.planetIdx, card: (g, c) => `${c.name.toUpperCase()} DOESN'T SAY ANYTHING FOR A WHOLE ORBIT. THEN: 'THAT'S THE ONE. THAT'S THE VIEW.'` },
    ],
    finale: (g, c) => `${c.name.toUpperCase()} FOLDS THE NAPKIN INTO THE CONSOLE TRIM. THE SHIP TURNS TIGHTER THAN IT HAS ANY RIGHT TO.`,
  },
  {
    role: "gunner", title: "THE OLD CREW",
    ask: (w, c) => `${c.name.toUpperCase()} CLEANS THE TURRET THAT DOESN'T NEED CLEANING. 'MY OLD CREW DRINK AT A PLACE ON THE LANES. I WALKED OUT ON THEM. I'D LIKE TO WALK BACK IN, AND BUY A ROUND, AND SEE WHAT HAPPENS.'`,
    setup: (w, c, rng) => { const sys = linkedWithStations(w, rng); const st = rng.pick(sys.stations); return { id: "gunner", stage: 0, targetSystemId: sys.id, targetStationId: st.id }; },
    stages: [
      { objective: (w, c) => `DOCK AT ${stName(w, c.arc?.targetStationId)}, WHERE ${c.name.toUpperCase()}'S OLD CREW DRINK`, check: (g, c) => g.world.player.dockedAt === c.arc?.targetStationId, card: (g, c) => `THE LOUNGE GOES QUIET WHEN ${c.name.toUpperCase()} WALKS IN. THEN SOMEBODY LAUGHS, AND IT'S THE RIGHT KIND OF LAUGH.\n\nTHE ROUND IS ON YOU: COME BACK WITH TWO LUXURIES ABOARD.` },
      { objective: (w, c) => `DOCK AT ${stName(w, c.arc?.targetStationId)} WITH 2 LUXURIES FOR THE ROUND`, check: (g, c) => g.world.player.dockedAt === c.arc?.targetStationId && (g.world.player.cargo.lux ?? 0) >= 2, card: (g, c) => { removeCargo(g.world.player, "lux", 2); return `TWO CRATES OF THE GOOD STUFF ON THE BAR AND AN HOUR OF STORIES YOU WEREN'T THERE FOR. ${c.name.toUpperCase()} COMES BACK ABOARD AT THREE, SINGING.`; } },
    ],
    finale: (g, c) => `${c.name.toUpperCase()} STOPS CLEANING THE TURRET EVERY NIGHT. THEIR AIM, SOMEHOW, GETS BETTER.`,
  },
];

export function arcFor(role: CrewRole): ArcDef | undefined { return CREW_ARCS.find((a) => a.role === role); }
export function arcObjective(w: World, c: CrewMember): string | null {
  const def = arcFor(c.role); const a = c.arc;
  if (!def || !a || a.done || a.stage >= def.stages.length) return null;
  return `${c.name.toUpperCase()} - ${def.title}: ${def.stages[a.stage].objective(w, c)}`;
}
// At a dock: a loyal crew member without a story asks for one
export function offerArc(g: Game, c: CrewMember, returnTo: string): boolean {
  const def = arcFor(c.role);
  if (!def || c.arc) return false;
  const w = g.world;
  const opts: Encounter["options"] = [
    { label: "WE'LL DO IT", result: (g2) => { c.arc = def.setup(g2.world, c, new RNG(hashStr(`${c.name}:${g2.world.seed}`))); c.loyalty = (c.loyalty ?? 0) + 1; return `${c.name.toUpperCase()} NODS ONCE. IT'S ON THE LOG.`; } },
    { label: "NOT NOW", result: () => { c.morale = Math.max(0, c.morale - 4); return `${c.name.toUpperCase()} SAYS IT'LL KEEP. IT WILL. IT HAS.`; } },
  ];
  const enc: Encounter = { id: `arc-ask-${c.role}`, where: "space", title: `${c.name.toUpperCase()} - ${def.title}`, text: def.ask(w, c), weight: 0, options: opts };
  (g.scenes["encounter"] as EncounterScene).open(g, enc, returnTo, true);
  return true;
}
// Every frame, like the campaigns: a beat that checks out shows its card and moves on
export function crewArcUpdate(g: Game): void {
  if (g.sceneName === "encounter") return;
  const p: PlayerState = g.world.player;
  for (const c of p.crew) {
    const def = arcFor(c.role); const a = c.arc;
    if (!def || !a || a.done) continue;
    if (a.stage >= def.stages.length) continue;
    const st = def.stages[a.stage];
    if (!st.check(g, c)) continue;
    const text = st.card(g, c);
    a.stage++;
    let body = text;
    if (a.stage >= def.stages.length) {
      a.done = true;
      c.loyalty = Math.max(c.loyalty ?? 0, 3); c.skill = 3; c.morale = 100;
      body += `\n\n${def.finale(g, c)}`;
      logEntry(g.world, `${c.name} finished ${def.title.toLowerCase()}`);
      pushEvent(g.world, { t: g.world.time, kind: "arc", systemId: p.systemId, text: `${c.name}, ${c.role} aboard ${p.shipName ?? "an independent ship"}, closed an old chapter` });
      flag(g, "crewArc");
    }
    const returnTo = g.sceneName === "flight" ? "flight" : g.sceneName;
    const enc: Encounter = { id: `arc-${c.role}-${a.stage}`, where: "space", title: `${c.name.toUpperCase()} - ${def.title}`, text: body, weight: 0, options: [{ label: "CONTINUE", result: () => "" }] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, returnTo, true);
    return; // one card at a time
  }
}
