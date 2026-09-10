// Encounters: short choice cards that interrupt flight or a drive. Each option
// applies real effects and returns the line the player reads afterwards.

import type { Game } from "../game";
import { addCargo, removeCargo, adjustRep, hasIllegalCargo, cargoUsed, genCrewCandidate, adjustSynRep, passengersAboard, berthsUsed } from "../world";
import { hull } from "./hulls";
import { RNG } from "../core/rng";
import { addMaterials } from "./engineering";
import { commodity } from "./data";

export interface EncounterOption {
  label: string;
  hint?: string;
  requires?: (g: Game) => boolean;
  result: (g: Game, rng: RNG) => string;
}
export interface Encounter {
  id: string;
  where: "space" | "ground";
  title: string;
  text: string;
  weight: number;
  when?: (g: Game) => boolean;
  options: EncounterOption[];
}

const p = (g: Game) => g.world.player;
const sys = (g: Game) => g.world.systems[g.world.player.systemId];
const lawful = (g: Game) => sys(g).factionId !== "vex";
const mats = (g: Game, m: Record<string, number>) => { addMaterials(p(g), m); return Object.entries(m).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(", "); };

export const ENCOUNTERS: Encounter[] = [
  {
    id: "pod", where: "space", weight: 3, title: "DRIFTING ESCAPE POD",
    text: "A pod tumbles past on a slow spin, beacon chirping on the emergency band. Someone inside is alive. Nobody else is answering.",
    options: [
      { label: "BRING THEM ABOARD", hint: "A berth, or a grateful stranger", result: (g, rng) => {
        const c = genCrewCandidate(rng);
        if (p(g).crew.length < hull(p(g).hullId).crewSlots) { p(g).crew.push(c); return `${c.name.toUpperCase()} (${c.role.toUpperCase()}) SIGNS ON OUT OF GRATITUDE. NO WAGES ASKED FOR A MONTH.`; }
        p(g).credits += 350; adjustRep(g.world, sys(g).factionId, 4);
        return `${c.name.toUpperCase()} HAS NO BERTH TO TAKE, BUT WIRES YOU 350CR FROM THE NEXT STATION. STANDING UP.`;
      } },
      { label: "SELL THE POD TO THE VEIL", hint: "Contraband, and a stain", requires: (g) => cargoUsed(p(g)) + 2 <= p(g).cargoMax, result: (g) => {
        addCargo(p(g), "contra", 2); adjustRep(g.world, "vex", 6); adjustRep(g.world, sys(g).factionId, -8);
        return "A VEIL CUTTER TAKES THE POD WITHOUT A WORD AND LEAVES TWO CRATES. YOU DON'T ASK WHAT HAPPENS NEXT.";
      } },
      { label: "LOG THE BEACON AND MOVE ON", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 20; return "YOU FORWARD THE BEACON TO THE NEAREST STATION. SOMEONE ELSE'S PROBLEM NOW. +20 DATA."; } },
    ],
  },
  {
    id: "smuggler", where: "space", weight: 2, title: "A QUIET OFFER",
    text: "A blacked-out cutter matches your vector. 'Four crates. Half what the fences pay. No questions, no scans, no names.'",
    options: [
      { label: "BUY THE CRATES (400CR)", requires: (g) => p(g).credits >= 400 && cargoUsed(p(g)) + 4 <= p(g).cargoMax, result: (g) => { p(g).credits -= 400; addCargo(p(g), "contra", 4); return "FOUR CRATES OF CONTRABAND SLIDE INTO YOUR HOLD. GATE SCANS WILL NOT LIKE THEM."; } },
      { label: "DECLINE", result: () => "THE CUTTER PEELS OFF WITHOUT A WORD." },
      { label: "REPORT THEM TO PATROL", hint: "Standing with the law", result: (g) => { adjustRep(g.world, sys(g).factionId, lawful(g) ? 6 : -6); adjustSynRep(g.world, "VULT", -4); return lawful(g) ? "PATROL THANKS YOU ON AN OPEN CHANNEL. THE CUTTER HEARS IT TOO." : "THERE IS NO PATROL HERE. THE VEIL HEARS YOU, THOUGH."; } },
    ],
  },
  {
    id: "customs", where: "space", weight: 2, title: "CUSTOMS INSPECTION", when: (g) => lawful(g),
    text: "'Vessel, cut thrust and open your manifest.' A customs corvette slides alongside, scanner already warming up.",
    options: [
      { label: "COMPLY", result: (g) => {
        if (hasIllegalCargo(p(g))) { for (const id of Object.keys(p(g).cargo)) if (commodity(id).illegal) delete p(g).cargo[id]; const fine = Math.min(p(g).credits, 300); p(g).credits -= fine; adjustRep(g.world, sys(g).factionId, -6); return `THEY FIND IT. CONTRABAND SEIZED, ${fine}CR FINE, STANDING DOWN.`; }
        adjustRep(g.world, sys(g).factionId, 2); return "CLEAN. THE OFFICER WISHES YOU SAFE TRANSIT AND MEANS IT. STANDING UP.";
      } },
      { label: "OFFER 150CR TO SKIP THE SCAN", requires: (g) => p(g).credits >= 150, result: (g, rng) => { p(g).credits -= 150; if (rng.chance(0.55)) return "THE OFFICER POCKETS IT. 'MOVE ALONG.'"; adjustRep(g.world, sys(g).factionId, -10); p(g).wanted = Math.min(1, (p(g).wanted ?? 0) + 0.15); return "THE OFFICER TAKES THE CREDITS AND FILES A BRIBERY REPORT. YOU ARE NOW A PERSON OF INTEREST."; } },
      { label: "PUNCH IT", hint: "Wanted, and worse", result: (g) => { p(g).wanted = Math.min(1, (p(g).wanted ?? 0) + 0.3); adjustRep(g.world, sys(g).factionId, -12); return "YOU RUN. THE CORVETTE LOGS YOUR HULL. PATROLS WILL BE LOOKING."; } },
    ],
  },
  {
    id: "derelict", where: "space", weight: 3, title: "SILENT FREIGHTER",
    text: "A freighter drifts dark, cargo doors half open. No beacon, no heat. Either everyone left in a hurry, or nobody left at all.",
    options: [
      { label: "BOARD AND STRIP IT", result: (g, rng) => {
        if (rng.chance(0.65)) { addCargo(p(g), "metals", 3); addCargo(p(g), "parts", 2); return `THE HOLD IS HALF FULL. +3 METALS, +2 PARTS, ${mats(g, { iron: 2, germanium: rng.chance(0.5) ? 1 : 0 })}.`; }
        p(g).hull = Math.max(1, p(g).hull - 20); return "A RIGGED CHARGE GOES OFF IN THE AIRLOCK. HULL -20. THE HOLD WAS EMPTY ANYWAY.";
      } },
      { label: "SCAN IT AND SELL THE FIX", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 60; return "YOU LOG THE WRECK FOR THE SALVAGE GUILDS. +60 EXPLORATION DATA."; } },
      { label: "LEAVE IT", result: () => "SOME DOORS ARE HALF OPEN FOR A REASON." },
    ],
  },
  {
    id: "refugees", where: "space", weight: 2, title: "REFUGEE CONVOY",
    text: "Three battered haulers, crammed with people, low on everything. 'We'll make the gate. Probably. We haven't eaten since the last one.'",
    options: [
      { label: "GIVE THEM 3 PROVISIONS", requires: (g) => (p(g).cargo.food ?? 0) >= 3, result: (g) => { removeCargo(p(g), "food", 3); adjustRep(g.world, sys(g).factionId, 5); adjustRep(g.world, "ora", 5); (p(g).flags ??= {}).samaritan = true; return "THEY TAKE THE CRATES LIKE THEY'RE GOLD. WORD OF THIS WILL TRAVEL. STANDING UP."; } },
      { label: "GIVE THEM 20 FUEL", requires: (g) => p(g).fuel >= 30, result: (g) => { p(g).fuel -= 20; adjustRep(g.world, sys(g).factionId, 4); return "THE LEAD HAULER'S ENGINES STEADY. THEY WILL MAKE THE GATE NOW."; } },
      { label: "WISH THEM LUCK", result: () => "THE CONVOY LIMPS ON. YOU DON'T LOOK BACK." },
    ],
  },
  {
    id: "tip", where: "space", weight: 2, title: "PROSPECTOR'S TIP", when: (g) => sys(g).asteroids.length > 0,
    text: "An old prospector hails you, voice like gravel. 'Motherlode in this belt. I'm too old to crack it. Two hundred and it's yours.'",
    options: [
      { label: "PAY 200CR", requires: (g) => p(g).credits >= 200, result: (g, rng) => { p(g).credits -= 200; const a = rng.pick(sys(g).asteroids.filter((x) => x.ore > 0)); if (!a) return "THE COORDINATES POINT AT EMPTY SPACE. YOU'VE BEEN HAD."; a.rich = true; a.core = true; a.ore = Math.max(a.ore, 8); return "THE COORDINATES CHECK OUT: A CORE ROCK, GLINTING GOLD. PROSPECTOR LIMPETS WILL SHOW IT. BRING A SEISMIC CHARGE."; } },
      { label: "DECLINE", result: () => "'YOUR LOSS,' HE SAYS, AND HE MIGHT BE RIGHT." },
    ],
  },
  {
    id: "stranded", where: "space", weight: 2, title: "DRY TANKS",
    text: "'Any vessel, any vessel. Tanks are dry, life support on batteries. I can pay. Later. I swear I can pay later.'",
    options: [
      { label: "TRANSFER 15 FUEL", requires: (g) => p(g).fuel >= 25, result: (g) => { p(g).fuel -= 15; (p(g).ious ??= []).push({ credits: 400, text: "THE PILOT YOU REFUELLED PAID UP: +400CR" }); adjustRep(g.world, sys(g).factionId, 3); return "THEIR ENGINES CATCH. 'I'LL FIND YOU AT A STATION. I PAY MY DEBTS.'"; } },
      { label: "GIVE THEM THE PATROL FREQUENCY", result: () => "YOU RELAY THE CALL. SOMEONE WILL COME. PROBABLY." },
    ],
  },
  {
    id: "ghost", where: "space", weight: 1, title: "GHOST SIGNAL",
    text: "A transmission on no known band: a slow pulse, then a voice reading numbers in a language your computer half recognises. It's coming from the star.",
    options: [
      { label: "RECORD IT", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 90; (p(g).codex ??= {})["signal:the numbers"] = ((p(g).codex ?? {})["signal:the numbers"] ?? 0) + 1; return "YOU RECORD ELEVEN MINUTES BEFORE IT STOPS. THE NUMBERS ARE COORDINATES, OR A DATE, OR NOTHING. +90 DATA, CODEX ENTRY."; } },
      { label: "TRIANGULATE", hint: "Closer to the star", result: (g) => { p(g).heat = Math.min(140, (p(g).heat ?? 0) + 60); p(g).expData = (p(g).expData ?? 0) + 140; return "YOU DIVE TOWARD THE SOURCE. THE HULL COOKS. THE SIGNAL SHARPENS TO A SINGLE WORD YOU CAN'T READ. +140 DATA. WATCH THE HEAT."; } },
      { label: "KILL THE RECEIVER", result: () => "SILENCE. YOU DON'T TURN IT BACK ON FOR A WHILE." },
    ],
  },
  {
    id: "hunter", where: "space", weight: 2, title: "BOUNTY HUNTER", when: (g) => (p(g).wanted ?? 0) > 0.3,
    text: "A gunship hails on a private channel. 'There's paper on you. Not much. Enough. Make it worth my while to have missed you.'",
    options: [
      { label: "PAY 500CR", requires: (g) => p(g).credits >= 500, result: (g) => { p(g).credits -= 500; p(g).wanted = Math.max(0, (p(g).wanted ?? 0) - 0.4); return "'PLEASURE.' THE GUNSHIP FILES A REPORT THAT YOU WERE NEVER HERE. WANTED LEVEL DOWN."; } },
      { label: "TELL THEM TO TRY", hint: "A named captain", result: (g) => { (g.scenes?.flight as unknown as { spawnHunter?: (g: Game) => void } | undefined)?.spawnHunter?.(g); return "THE GUNSHIP'S WEAPONS COME ONLINE."; } },
    ],
  },
  {
    id: "emissary", where: "space", weight: 1, title: "VEIL EMISSARY", when: (g) => (p(g).rep.vex ?? 0) > -20,
    text: "A sleek, wrong-looking ship keeps pace with no visible drive. 'The Veil remembers pilots who carry for us. Once. No questions.'",
    options: [
      { label: "ACCEPT THE FAVOUR", requires: (g) => cargoUsed(p(g)) + 2 <= p(g).cargoMax, result: (g) => { addCargo(p(g), "bio", 2); adjustRep(g.world, "vex", 10); adjustRep(g.world, "tsc", -4); return "TWO SEALED CRATES OF BIO SAMPLES. THE VEIL PAYS WELL FOR THEM AT THEIR STATIONS. THE COMPACT WOULD NOT APPROVE."; } },
      { label: "REFUSE", result: (g) => { adjustRep(g.world, "vex", -3); return "THE SHIP IS GONE BEFORE YOU FINISH THE SENTENCE."; } },
    ],
  },
  // ---- ground ----
  {
    id: "camp", where: "ground", weight: 3, title: "ABANDONED CAMP",
    text: "A collapsed shelter, a dead heater, tracks that end at nothing. Somebody left in a hurry, or didn't leave at all.",
    options: [
      { label: "SEARCH IT", result: (g, rng) => rng.chance(0.7) ? `SUPPLY CACHE UNDER THE FLOOR: ${mats(g, { iron: 2, carbon: 2, germanium: rng.chance(0.4) ? 1 : 0 })}. AND A JOURNAL YOU DON'T FINISH.` : "THE FLOOR GIVES WAY. ROVER INTEGRITY -20. NOTHING UNDER IT BUT MORE FLOOR." },
      { label: "LEAVE IT BE", result: () => "YOU MARK IT ON THE MAP AND DRIVE ON." },
    ],
  },
  {
    id: "fauna", where: "ground", weight: 3, title: "SOMETHING MOVES",
    text: "A shape the size of the rover unfolds from the rocks: plated, slow, curious. It has no eyes you can find. It is definitely looking at you.",
    options: [
      { label: "OBSERVE AND LOG IT", result: (g, rng) => { const n = rng.pick(["PLATE STRIDER", "GLASS HOUND", "DUNE MAW", "FROST SLOTH", "VEIN CRAWLER"]); const key = `fauna:${n}`; const first = !(p(g).codex ?? {})[key]; (p(g).codex ??= {})[key] = ((p(g).codex ?? {})[key] ?? 0) + 1; p(g).expData = (p(g).expData ?? 0) + (first ? 150 : 50); return `${n}. IT WATCHES YOU FOR A LONG MINUTE, THEN FOLDS BACK INTO THE ROCK. ${first ? "NEW SPECIES +150" : "+50"} DATA.`; } },
      { label: "FIRE THE FLARE", result: () => "IT LEAVES WITHOUT HURRYING. YOU HAVE THE FEELING IT LET YOU WIN." },
      { label: "REVERSE, SLOWLY", result: () => "YOU BACK OFF. IT DOESN'T FOLLOW. YOUR HANDS TAKE A WHILE TO STOP SHAKING." },
    ],
  },
  {
    id: "prospector", where: "ground", weight: 2, title: "LOST PROSPECTOR",
    text: "A suited figure waves both arms from a ridge. Their rover is a smoking wreck. 'Regulator's shot. I've got two hours of air and a claim worth more than your ship.'",
    options: [
      { label: "GIVE THEM SPARE PARTS", requires: (g) => (p(g).cargo.parts ?? 0) >= 1, result: (g) => { removeCargo(p(g), "parts", 1); p(g).credits += 350; adjustRep(g.world, sys(g).factionId, 4); (p(g).flags ??= {}).samaritan = true; return "THEY PATCH THE REGULATOR AND WIRE YOU 350CR ON THE SPOT. 'THE CLAIM'S MINE. THE THANKS ARE YOURS.'"; } },
      { label: "OFFER A LIFT TO THE LANDER", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 40; return "ON THE WAY THEY TALK. YOU LEARN MORE ABOUT THIS ROCK THAN THE SURVEY EVER SAID. +40 DATA."; } },
      { label: "DRIVE ON", result: (g) => { adjustRep(g.world, sys(g).factionId, -3); return "YOU DRIVE ON. THE WAVING STOPS BEFORE YOU'RE OUT OF SIGHT."; } },
    ],
  },
  {
    id: "stowaway", where: "space", weight: 2, title: "STOWAWAY", when: (g) => cargoUsed(p(g)) >= 4 || passengersAboard(p(g)).length > 0,
    text: "A noise in the hold that isn't the hold. Behind the crates: a kid, maybe nineteen, with a bag and a rehearsed speech about how they can work.",
    options: [
      { label: "PUT THEM TO WORK", hint: "A berth, if you have one", result: (g, rng) => {
        const c = genCrewCandidate(rng); c.skill = 1; c.wage = Math.round(c.wage * 0.6); c.morale = 90; c.loyalty = 2;
        if (berthsUsed(p(g)) < hull(p(g).hullId).crewSlots) { c.home = p(g).lastDockedAt ?? undefined; p(g).crew.push(c); return `${c.name.toUpperCase()} SIGNS ON AS A ${c.role.toUpperCase()} AT SIXTY PERCENT WAGES AND MEANS EVERY WORD OF IT.`; }
        return "NO BERTH. THEY SLEEP IN THE HOLD TO THE NEXT STATION AND LEAVE A NOTE THAT SAYS THANK YOU IN THREE LANGUAGES.";
      } },
      { label: "HAND THEM TO STATION SECURITY AT THE NEXT DOCK", result: (g) => { adjustRep(g.world, sys(g).factionId, 3); for (const m of passengersAboard(p(g))) m.mood = Math.max(0, (m.mood ?? 60) - 10); return "THEY DON'T ARGUE. YOUR PASSENGERS WATCH IT HAPPEN AND THINK LESS OF THE SHIP. STANDING UP, A LITTLE."; } },
      { label: "LET THEM RIDE", result: (g) => { for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 4); return "THE CREW ADOPT THEM BY DINNER. THEY'RE GONE AT THE NEXT DOCK WITH A FULL STOMACH AND YOUR SPARE JACKET. MORALE UP."; } },
    ],
  },
  {
    id: "shipmate", where: "space", weight: 2, title: "AN OLD SHIPMATE", when: (g) => (p(g).alumni ?? []).length > 0,
    text: "A hauler hails on a private band. The voice is one you know: someone who served on this ship, once, and went home. They've got a small boat of their own now.",
    options: [
      { label: "CATCH UP", result: (g, rng) => { const a = rng.pick(p(g).alumni ?? []) ?? { name: "An old hand" }; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 6); p(g).expData = (p(g).expData ?? 0) + 60; return `${a.name.toUpperCase()} TALKS FOR TWENTY MINUTES ABOUT ROUTES AND OLD JOKES. THE CREW LISTEN IN. +60 DATA, MORALE UP.`; } },
      { label: "ASK FOR A FAVOUR", result: (g, rng) => { const a = rng.pick(p(g).alumni ?? []) ?? { name: "An old hand" }; if (rng.chance(0.6)) { addCargo(p(g), "parts", 2); return `${a.name.toUpperCase()} MATCHES SPEED AND PASSES OVER TWO SPARE PARTS. 'YOU NEVER KEPT ENOUGH.'`; } p(g).credits += 250; return `${a.name.toUpperCase()} WIRES 250CR. 'FOR THE TOUR. I NEVER SAID THANKS PROPERLY.'`; } },
      { label: "WAVE AND FLY ON", result: (g, rng) => `${(rng.pick(p(g).alumni ?? []) ?? { name: "An old hand" }).name.toUpperCase()} FLASHES THEIR RUNNING LIGHTS TWICE, THE WAY YOU USED TO. THEN THEY'RE GONE.` },
    ],
  },
  {
    id: "lighthouse", where: "space", weight: 2, title: "A LIGHT IN THE DARK", when: (g) => (g.world.infra ?? []).length > 0,
    text: "A freighter on the band, hoarse with relief: 'That your beacon back there, in the dead system? We'd have run dry without it. What do we owe you?'",
    options: [
      { label: "NOTHING. PASS IT ON.", result: (g) => { adjustRep(g.world, sys(g).factionId, 5); for (const m of passengersAboard(p(g))) m.mood = Math.min(100, (m.mood ?? 60) + 8); return "THEY SAY THEY WILL. YOUR PASSENGERS HEARD ALL OF IT. STANDING UP."; } },
      { label: "A FAIR TOLL", result: (g, rng) => { const c = rng.int(150, 400); p(g).credits += c; p(g).infraEarned = (p(g).infraEarned ?? 0) + c; return `${c}CR LANDS IN YOUR ACCOUNT BEFORE THEY'VE FINISHED THANKING YOU.`; } },
      { label: "SPARE PARTS, IF YOU HAVE ANY", result: (g, rng) => { if (rng.chance(0.7)) { addCargo(p(g), "parts", 2); return "TWO CRATES OF PARTS COME OVER ON A LINE. 'KEEP THE LIGHT ON.'"; } return "THEY'RE OUT OF PARTS THEMSELVES. THEY OFFER A SONG INSTEAD. IT'S NOT A GOOD SONG."; } },
    ],
  },
  {
    id: "pilgrims", where: "space", weight: 2, title: "PILGRIM CONVOY",
    text: "Six old hulls in a loose line, running lights dimmed, a chant on the open band. Pilgrims bound for a star they name and you've never heard of. Their lead ship asks, politely, for provisions.",
    options: [
      { label: "GIVE THEM FOOD", requires: (g) => (p(g).cargo.food ?? 0) >= 2, result: (g, rng) => { removeCargo(p(g), "food", 2); adjustRep(g.world, sys(g).factionId, 3); for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 5); return rng.chance(0.5) ? "THEY BLESS THE SHIP BY NAME. THE CREW PRETEND NOT TO BE MOVED. MORALE UP." : `THEY BLESS THE SHIP AND LEAVE A CARVED STONE ON THE AIRLOCK SILL. ${mats(g, { iron: 1, vanadium: 1 })}.`; } },
      { label: "SELL THEM FOOD AT A FAIR PRICE", requires: (g) => (p(g).cargo.food ?? 0) >= 2, result: (g) => { removeCargo(p(g), "food", 2); p(g).credits += 90; return "THEY PAY WITHOUT HAGGLING AND THANK YOU TWICE. +90CR."; } },
      { label: "KEEP YOUR DISTANCE", result: () => "THE CHANT FADES AS THE CONVOY DRIFTS PAST. YOU FIND YOURSELF HUMMING IT AN HOUR LATER." },
    ],
  },
  {
    id: "claimjumper", where: "ground", weight: 2, title: "CLAIM JUMPER", when: (g) => (p(g).homesteads ?? []).length > 0,
    text: "Fresh rover tracks cross the ridge toward a claim marker that has your name on it. Somebody's been working your ground. Their rig is still there, engine warm.",
    options: [
      { label: "CONFRONT THEM", result: (g, rng) => { if (rng.chance(0.65)) { const h = rng.pick(p(g).homesteads ?? []); if (h) h.stock = Math.min(30, h.stock + 6); return "THEY BLUSTER, THEN FOLD. THEY LEAVE WHAT THEY DUG. YOUR CLAIM IS SIX UNITS RICHER."; } adjustRep(g.world, sys(g).factionId, -2); return "IT GETS LOUD. THEY LEAVE, BUT A COMPLAINT GOES IN TO THE SURVEY OFFICE WITH YOUR NAME SPELLED RIGHT."; } },
      { label: "LET THEM WORK IT FOR A CUT", result: (g) => { p(g).credits += 200; return "YOU SHAKE ON A THIRD. THEY WIRE 200CR ON THE SPOT AND PROMISE MORE. YOU'LL SEE."; } },
      { label: "LOG THE RIG AND MOVE ON", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 30; return "THEIR REGISTRATION GOES IN THE LOG. +30 DATA. SOMEONE ELSE'S PROBLEM, FOR NOW."; } },
    ],
  },
  {
    id: "duststorm", where: "ground", weight: 2, title: "THE WALL",
    text: "The horizon goes brown, then black. A dust front a kilometre high is coming in faster than the rover can run. There's a rock overhang to the left. Maybe.",
    options: [
      { label: "SHELTER UNDER THE ROCK", result: (g, rng) => { const key = "biome:STORM COUNTRY"; (p(g).codex ??= {})[key] = ((p(g).codex ?? {})[key] ?? 0) + 1; p(g).expData = (p(g).expData ?? 0) + 40; return rng.chance(0.5) ? "TWO HOURS OF NOISE. WHEN IT CLEARS THE ROCK HAS A NEW FACE, AND SO DOES THE MAP. +40 DATA." : `TWO HOURS OF NOISE. THE STORM SCOURED SOMETHING LOOSE. ${mats(g, { nickel: 2, iron: 2 })}. +40 DATA.`; } },
      { label: "RUN FOR THE LANDER", result: (g, rng) => rng.chance(0.5) ? "YOU MAKE IT WITH THE FRONT ON YOUR BUMPER. THE LANDER'S HULL SANDBLASTED TO BARE METAL. IT LOOKS BETTER, HONESTLY." : "THE STORM CATCHES YOU. AN HOUR BLIND, CRAWLING BY THE COMPASS. THE ROVER NEEDS A PATCH AND SO DO YOUR NERVES." },
    ],
  },
  {
    id: "meteorite", where: "ground", weight: 2, title: "METEORITE FALL",
    text: "A streak, a thump you feel through the seat, and a new crater steaming two hundred metres off. Something in it is still glowing.",
    options: [
      { label: "GRAB IT WHILE IT'S HOT", result: (g, rng) => rng.chance(0.75) ? `THE FRAGMENT IS HEAVY AND STRANGE. ${mats(g, { vanadium: 2, polonium: rng.chance(0.6) ? 1 : 0 })}.` : "IT SPLITS AS YOU LIFT IT AND VENTS SOMETHING SHARP. ROVER INTEGRITY -25." },
      { label: "LET IT COOL", result: (g) => `${mats(g, { iron: 3, nickel: 2 })} FROM THE COOLED FRAGMENT. SLOW AND SAFE.` },
    ],
  },
];

// Pick one for the place, weighting down anything seen recently
export function pickEncounter(g: Game, where: "space" | "ground", rng: RNG): Encounter | null {
  const seen = g.world.player.encounters ?? {};
  let pool = ENCOUNTERS.filter((e) => e.where === where && (!e.when || e.when(g)));
  // anything seen four times steps aside while there is something fresher
  const fresh = pool.filter((e) => (seen[e.id] ?? 0) < 4);
  if (fresh.length) pool = fresh;
  const weights = pool.map((e) => e.weight / (1 + (seen[e.id] ?? 0) * 2));
  const total = weights.reduce((a, b) => a + b, 0);
  if (!total) return null;
  let r = rng.next() * total;
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}
