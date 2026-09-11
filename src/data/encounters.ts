// Encounters: short choice cards that interrupt flight or a drive. Each option
// applies real effects and returns the line the player reads afterwards.

import type { Game } from "../game";
import { addCargo, removeCargo, adjustRep, hasIllegalCargo, cargoUsed, genCrewCandidate, adjustSynRep, passengersAboard, berthsUsed, adoptCat, CAT_NAMES, shiftBond, logSight, crewXp, bond, logEntry, passengerCap, infraAt, infraLit, wondersIn, parleyChance, beltGain } from "../world";
import { hull } from "./hulls";
import { RNG } from "../core/rng";
import { addMaterials } from "./engineering";
import { commodity, FACTIONS } from "./data";
import { SYSTEM_NICKS } from "../world";
import { officeWrites, findStation as findStationW, isBeltStation, berthsUsed as berthsUsedW, hasSpecialty as hasSpecialtyW, syndicateAt as syndicateAtW } from "../world";
const facNameW2 = (id: string): string => FACTIONS.find((f) => f.id === id)?.name ?? id;

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
      { label: "SHOW THE ENVOY'S SEAL", hint: "Diplomatic passage; nobody opens a treaty ship", requires: (g) => passengersAboard(p(g)).some((m) => m.treaty), result: (g) => { const env = passengersAboard(p(g)).find((m) => m.treaty)!; adjustRep(g.world, sys(g).factionId, 1); (p(g).flags ??= {}).immunity = true; return `${(env.passengerName ?? "THE ENVOY").toUpperCase()} HOLDS THE SEAL UP TO THE CAMERA WITHOUT GETTING OUT OF THE CHAIR. THE CORVETTE READS IT, GOES QUIET, AND BACKS OFF WITH AN APOLOGY IN IT. DIPLOMATIC PASSAGE. NOBODY OPENS THE HOLD.`; } },
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
    id: "cat", where: "space", weight: 2, title: "SOMETHING IN THE HOLD", when: (g) => !p(g).cat,
    text: "A crate shifts that shouldn't. Behind it, wedged between the parts bins: a cat. Thin, unimpressed, and entirely certain this is its ship now.",
    options: [
      { label: "FEED IT", requires: (g) => (p(g).cargo.food ?? 0) >= 1, result: (g, rng) => { removeCargo(p(g), "food", 1); const name = rng.pick(CAT_NAMES); adoptCat(p(g), name, g.world.time); (p(g).flags ??= {}).shipsCat = true; return `IT EATS, THEN INSPECTS THE BRIDGE. THE CREW HAVE ALREADY NAMED IT ${name.toUpperCase()}. THIS IS NOT UP FOR DISCUSSION.`; } },
      { label: "LET IT BE", result: (g, rng) => { const name = rng.pick(CAT_NAMES); adoptCat(p(g), name, g.world.time); (p(g).flags ??= {}).shipsCat = true; return `YOU LEAVE IT TO ITS OWN DEVICES. BY THE NEXT DOCK IT IS CALLED ${name.toUpperCase()} AND SLEEPS ON THE CONSOLE.`; } },
      { label: "PUT IT OFF AT THE NEXT STATION", result: (g) => { for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 4); return "THE CREW SAY NOTHING. THE CAT SAYS LESS. THE STATION TAKES IT IN. MORALE, OBSCURELY, DOWN."; } },
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
    id: "lostcat", where: "space", weight: 1, title: "A CAT ON THE BAND", when: (g) => !!p(g).cat,
    text: "A hauler hails, embarrassed. 'Is that a cat I can hear on your open channel? Ours went missing at the last dock. Ginger. Answers to nothing.'",
    options: [
      { label: "CHECK THE HOLD", result: (g, rng) => rng.chance(0.5) ? `THERE ARE, IT TURNS OUT, TWO CATS ABOARD. ${p(g).cat!.name.toUpperCase()} IS NOT PLEASED. THE HAULER SENDS 150CR AND TAKES THE GINGER ONE BACK. ${(() => { p(g).credits += 150; return ""; })()}` : `ONE CAT. YOURS. THE HAULER SIGHS AND FLIES ON. ${p(g).cat!.name.toUpperCase()} LOOKS SMUG.` },
      { label: "'ONLY THE ONE, AND SHE'S MINE'", result: (g) => `${p(g).cat!.name.toUpperCase()} MEOWS INTO THE MIC ON CUE. THE HAULER LAUGHS AND SIGNS OFF.` },
    ],
  },
  {
    id: "gatekeeper", where: "space", weight: 2, title: "THE GATE OFFICER",
    text: "A patrol cutter matches your speed at the gate. 'Routine. Manifest and crew list.' The officer reads slowly, then looks up. 'You've got a good crew here. Better than mine. Any of them looking to move?'",
    options: [
      { label: "'THEY'RE NOT FOR HIRE'", result: (g) => { for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 3); return "THE OFFICER NODS. YOUR CREW HEARD THAT, AND STAND A LITTLE STRAIGHTER. MORALE UP."; } },
      { label: "'ASK THEM YOURSELF'", result: (g, rng) => { const c = p(g).crew[0]; if (c && rng.chance(0.3)) { p(g).crew = p(g).crew.filter((x) => x !== c); p(g).credits += 500; return `${c.name.toUpperCase()} TAKES THE PATROL'S OFFER. THEY LEAVE 500CR ON THE CONSOLE FOR THE BERTH. THE SHIP IS QUIETER.`; } return "NOBODY BITES. THE OFFICER SHRUGS AND WAVES YOU THROUGH."; } },
    ],
  },
  {
    id: "toll", where: "space", weight: 1, title: "SOMEBODY ELSE'S LIGHT", when: (g) => (g.world.infra ?? []).length === 0,
    text: "A beacon on the edge of the system, somebody's private light, is blinking a request: fuel, parts, anything. A voice: 'Keeper here. Been dark a week. I'll trade what I've got.'",
    options: [
      { label: "PASS A SPARE PART", requires: (g) => (p(g).cargo.parts ?? 0) >= 1, result: (g, rng) => { removeCargo(p(g), "parts", 1); p(g).expData = (p(g).expData ?? 0) + 120; (p(g).flags ??= {}).keeperKind = true; return `THE LIGHT COMES UP. THE KEEPER SENDS OVER FORTY YEARS OF CHARTS. +120 DATA. ${rng.chance(0.5) ? "'YOU SHOULD KEEP A LIGHT YOURSELF. SUITS YOU.'" : "'COME BACK SOME TIME. THERE'S COFFEE.'"}`; } },
      { label: "SELL THEM FUEL", requires: (g) => p(g).fuel >= 20, result: (g) => { p(g).fuel -= 10; p(g).credits += 260; return "TEN UNITS ACROSS A LINE, 260CR BACK. THE KEEPER DOESN'T HAGGLE. NOBODY OUT HERE DOES."; } },
      { label: "FLY ON", result: () => "THE LIGHT BLINKS BEHIND YOU FOR A LONG TIME. THEN IT DOESN'T." },
    ],
  },
  {
    id: "fossil", where: "ground", weight: 2, title: "THE BONES",
    text: "The rover's ground radar pings on something under the crust: a ribcage the length of a freighter, and it isn't rock.",
    options: [
      { label: "CORE A SAMPLE", result: (g) => { const key = "fauna:THE BURIED ONE"; const first = !(p(g).codex ?? {})[key]; (p(g).codex ??= {})[key] = ((p(g).codex ?? {})[key] ?? 0) + 1; p(g).expData = (p(g).expData ?? 0) + (first ? 200 : 60); return `THE CORE COMES UP FULL OF SOMETHING THAT WAS ALIVE WHEN THIS WORLD HAD AN OCEAN. ${first ? "NEW ENTRY: THE BURIED ONE. +200 DATA." : "+60 DATA."}`; } },
      { label: "LEAVE IT WHERE IT LIES", result: () => "YOU MARK THE SPOT AND DRIVE ON. SOME THINGS ARE BETTER LEFT TO PEOPLE WITH BRUSHES AND PATIENCE." },
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
  {
    id: "memorial", where: "space", weight: 2, title: "THE BUOY",
    text: "A buoy on a slow tumble, reading names on a loop. Forty of them, then a ship's name, then a date, then the names again. Somebody anchored it here on purpose.",
    options: [
      { label: "CUT THE ENGINES AND LISTEN", result: (g) => { for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 3); p(g).expData = (p(g).expData ?? 0) + 30; return "YOU LISTEN THROUGH ONE FULL LOOP. NOBODY ON THE BRIDGE SAYS ANYTHING. +30 DATA, AND SOMETHING ELSE."; } },
      { label: "LEAVE A PART FOR ITS BATTERY", requires: (g) => (p(g).cargo.parts ?? 0) >= 1, result: (g) => { removeCargo(p(g), "parts", 1); adjustRep(g.world, sys(g).factionId, 4); return "YOUR ENGINEER GOES OUT ON A LINE AND SWAPS THE CELL. THE VOICE COMES BACK STRONGER. IT'LL READ FOR ANOTHER TEN YEARS."; } },
      { label: "FLY ON", result: () => "THE NAMES FOLLOW YOU OUT TO THE EDGE OF THE BAND, THEN STOP." },
    ],
  },
  {
    id: "lostdrone", where: "space", weight: 2, title: "A LOST DRONE", when: (g) => sys(g).asteroids.length > 0,
    text: "A mining drone pinging for a mothership that isn't answering. Its hopper is half full. Its little engine keeps trying.",
    options: [
      { label: "TAKE IT HOME TO THE NEAREST STATION", result: (g, rng) => { const c = rng.int(120, 260); p(g).credits += c; adjustRep(g.world, sys(g).factionId, 3); return `THE OUTFIT THAT OWNS IT WIRES ${c}CR AND A NOTE THAT JUST SAYS 'THANKS. WE'D GIVEN HER UP.'`; } },
      { label: "STRIP THE HOPPER", result: (g, rng) => `YOU LEAVE IT PINGING, LIGHTER. ${mats(g, { iron: 2, nickel: 2, vanadium: rng.chance(0.4) ? 1 : 0 })}.` },
      { label: "POINT IT AT THE BELT AND LET IT WORK", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 20; return "IT BURBLES ONCE, TURNS, AND GOES BACK TO DOING THE ONLY THING IT KNOWS. +20 DATA."; } },
    ],
  },
  {
    id: "walkus", where: "space", weight: 2, title: "WALK US TO THE GATE",
    text: "A slow convoy of three, drive plumes ragged, hails on the open band. 'We're not asking for a fight. Just fly alongside as far as the gate. Pirates count hulls before they count guns.'",
    options: [
      { label: "FLY ALONGSIDE", result: (g) => { const fs = g.scenes["flight"] as unknown as { startConvoy(g2: Game): void } | undefined; if (fs?.startConvoy) fs.startConvoy(g); return "THREE HAULERS FORM ON YOUR STERN, RAGGED BUT WILLING. THE LEAD FLASHES HER LIGHTS. 'LEAD ON. WE'LL PAY AT THE GATE.'"; } },
      { label: "NO TIME", result: () => "'UNDERSTOOD.' THEY CLOSE UP AND PLOD ON. YOU CHECK THE SCOPE FOR THEM TWICE BEFORE YOU JUMP." },
    ],
  },
  // ---- Away teams: first contacts, quiet worlds, rock hoppers, lounge nights ----
  {
    id: "firstcontact", where: "space", weight: 3, title: "A SIGNAL IN NO KNOWN TONGUE",
    text: "A hull like nothing in the registry drifts alongside, all curves, and sings at you in tones that the comms panel can't file. It waits. It seems to be waiting.",
    options: [
      { label: "RUN THE TRANSLATOR (20 DATA)", hint: "The comms core chews on it; a translator core never misses", requires: (g) => (p(g).expData ?? 0) >= 20, result: (g, rng) => { p(g).expData = (p(g).expData ?? 0) - 20; if ((p(g).modules ?? []).includes("translator") || rng.chance(0.7)) { p(g).expData = (p(g).expData ?? 0) + 80; (p(g).flags ??= {}).firstContact = true; (p(g).codex ??= {})["contact:THE SINGERS"] = 1; logEntry(g.world, "First contact: a curved hull that sang, and star charts in return"); return (p(g).modules ?? []).includes("translator") ? "THE TRANSLATOR CORE HAS IT IN A SECOND: A GREETING, A GIFT OF STAR CHARTS, AND A THIRD THING THE OLD CORE WOULD HAVE MISSED, SOMETHING LIKE 'WE REMEMBER THE ONES WHO ANSWER'. +80 DATA. THEY SING ONCE MORE AND ARE GONE." : "THE CORE FINDS THE PATTERN. IT'S A GREETING, THEN A GIFT: STAR CHARTS FOR SOMEWHERE THE MAP DOESN'T GO. +80 DATA. THEY SING ONCE MORE AND ARE GONE."; } return "THE CORE FINDS THE PATTERN. IT'S A RECIPE. A VERY LONG RECIPE. THEY SEEM PLEASED YOU LISTENED, AND LEAVE."; } },
      { label: "ANSWER WITH MUSIC", hint: "The crew pick a song", result: (g) => { for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 5); p(g).expData = (p(g).expData ?? 0) + 20; return "THE CREW ARGUE ABOUT THE SONG, THEN PLAY IT. THE HULL SINGS IT BACK, WRONG AND BEAUTIFUL. +20 DATA, AND A STORY FOR THE BAR."; } },
      { label: "HOLD POSITION AND LOG IT", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 10; return "YOU LOG EVERYTHING AND TOUCH NOTHING. IT SINGS A LAST TIME AND FOLDS AWAY. +10 DATA. THE SCIENCE POSTS WILL WANT THE TAPE."; } },
    ],
  },
  {
    id: "singersreturn", where: "space", weight: 4, title: "THE SINGERS, AGAIN", when: (g) => !!p(g).flags?.firstContact && !p(g).flags?.singersGuided,
    text: "The curved hull is back, and it knows you: the greeting is the one from before, note for note. Then a new phrase, rising, over and over, and the hull turns in a slow circle. It is asking for something. The comms core offers: 'A LIGHT. THE BRIGHTEST THING HERE. THEY WANT TO BE SHOWN.' (A translator core would add: 'AND THEY WILL REMEMBER WHO SHOWED THEM.')",
    options: [
      { label: "LEAD THEM TO THE LIGHT", hint: "A lit beacon or a wonder in this system", requires: (g) => infraAt(g.world, sys(g).id).some((i) => i.kind === "beacon" && infraLit(i)) || wondersIn(g.world, sys(g).id).length > 0, result: (g) => { (p(g).flags ??= {}).singersGuided = true; (p(g).codex ??= {})["contact:THE SINGERS"] = 2; p(g).expData = (p(g).expData ?? 0) + 60; logEntry(g.world, "Led the singing hull to the brightest thing in the system"); return "YOU FLY SLOW AND THEY FOLLOW, SINGING THE RISING PHRASE. AT THE LIGHT THEY GO QUIET FOR A LONG MINUTE, THEN SING SOMETHING NEW. +60 DATA. THE CORE FILES IT UNDER 'THANKS'."; } },
      { label: "SING THEM THE WAY", hint: "The crew describe the light in the only language you share", requires: (g) => p(g).crew.length >= 1, result: (g) => { (p(g).flags ??= {}).singersGuided = true; (p(g).codex ??= {})["contact:THE SINGERS"] = 2; p(g).expData = (p(g).expData ?? 0) + 30; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 5); logEntry(g.world, "Sang the singers a map to the nearest light"); return "THE CREW SING THE ROUTE: HIGH FOR BRIGHT, LOW FOR FAR. IT SHOULD NOT WORK. THE HULL TURNS THE RIGHT WAY AND GOES. +30 DATA, AND A CREW WHO CANNOT STOP GRINNING."; } },
      { label: "LET THEM CIRCLE", result: () => "YOU HOLD STATION. THEY CIRCLE TWICE MORE, SING THE GREETING BACKWARDS, AND FOLD AWAY. THEY'LL ASK AGAIN." },
    ],
  },
  {
    id: "singersgift", where: "space", weight: 4, title: "WHAT THE SINGERS LEFT", when: (g) => !!p(g).flags?.singersGuided && !p(g).flags?.singersGift,
    text: "No hull this time. Only a small thing tumbling in the lane where you'd expect them: a shard of something like glass, and the scanner says it is singing, very quietly, in the greeting's key.",
    options: [
      { label: "TAKE IT ABOARD", result: (g) => { (p(g).flags ??= {}).singersGift = true; (p(g).codex ??= {})["contact:THE SINGERS"] = 3; p(g).expData = (p(g).expData ?? 0) + 120; (p(g).keepsakes ??= []).push("a shard that hums, from the singers"); if (p(g).keepsakes!.length > 8) p(g).keepsakes!.shift(); logEntry(g.world, "Took the singers' shard aboard; it hums on the passenger seat"); return "IT COMES ABOARD WARM. ON THE PASSENGER SEAT IT HUMS THE GREETING, ONCE AN HOUR, TO NOBODY. +120 DATA. THE CODEX HAS A CONTACT NOW. THE SHIP HAS A KEY."; } },
      { label: "LOG IT AND LEAVE IT", result: (g) => { (p(g).flags ??= {}).singersGift = true; p(g).expData = (p(g).expData ?? 0) + 40; return "YOU RECORD IT FROM A DISTANCE AND LET IT TUMBLE ON. +40 DATA. SOMEBODY ELSE WILL FIND IT, OR NOBODY WILL. IT'S STILL SINGING WHEN YOU GO."; } },
    ],
  },
  {
    id: "unverified", where: "space", weight: 3, title: "DISTRESS CALL, UNVERIFIED",
    text: "A distress call on the open band, a freighter's callsign, a voice that says the right words in the right order: hull breach, four aboard, drifting. The signal is strong. The signal is a little too strong. Nothing on the scanner yet.",
    options: [
      { label: "ANSWER IT", hint: "Somebody always has to", result: (g, rng) => { if (rng.chance(0.55)) { p(g).lives = (p(g).lives ?? 0) + 4; p(g).rescues = (p(g).rescues ?? 0) + 1; adjustRep(g.world, sys(g).factionId, 2); logEntry(g.world, "Answered an unverified distress call; it was real"); return "IT'S REAL. A FREIGHTER WITH ITS SIDE OPEN AND FOUR PEOPLE IN SUITS ON THE HULL, WAVING. YOU TAKE THEM ACROSS ON A LINE. FOUR LIVES, AND A CREW WHO'D HAVE HATED YOU IF YOU'D FLOWN ON."; } const fs = (g.scenes as Record<string, unknown>)["flight"] as { ambush?: (g2: Game, n: number) => void } | undefined; fs?.ambush?.(g, 2); logEntry(g.world, "Answered an unverified distress call; it was a trap"); return "IT'S A TRAP. THE FREIGHTER IS A HULK WITH A TRANSMITTER, AND TWO HULLS COME OUT FROM BEHIND IT ALREADY TALKING. RED ALERT WOULD BE GOOD ABOUT NOW."; } },
      { label: "SCAN BEFORE YOU COMMIT", hint: "A gunner or a discovery scanner reads the signal first", requires: (g) => p(g).crew.some((c) => c.role === "gunner" && !c.sick) || (p(g).modules ?? []).includes("discovery"), result: (g, rng) => { p(g).expData = (p(g).expData ?? 0) + 20; if (rng.chance(0.55)) { p(g).lives = (p(g).lives ?? 0) + 4; p(g).rescues = (p(g).rescues ?? 0) + 1; adjustRep(g.world, sys(g).factionId, 2); return "THE SCAN SAYS ONE HULL, HOLED, WARM BODIES. REAL. YOU GO IN AND TAKE FOUR PEOPLE OFF IT. +20 DATA FOR THE SCAN, FOUR LIVES FOR THE REST."; } return "THE SCAN SAYS THREE HULLS WHERE THE VOICE SAYS ONE. YOU LOG THE POSITION FOR THE PATROL AND LEAVE THEM WAITING FOR SOMEBODY LESS CAREFUL. +20 DATA."; } },
      { label: "FLY ON", result: (g) => { for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 3); adjustRep(g.world, sys(g).factionId, -1); return "YOU FLY ON. THE CALL REPEATS BEHIND YOU FOR A WHILE, THEN STOPS. THE CREW DON'T SAY ANYTHING. MORALE DOWN, AND A MARK AGAINST YOU IF IT WAS REAL."; } },
    ],
  },
  {
    id: "envoyrite", where: "space", weight: 4, title: "THE ENVOY'S RITE", when: (g) => passengersAboard(p(g)).some((m) => m.treaty && !m.riteDone),
    text: "The envoy comes to the bridge with a small box and an apology: their people mark the turn of a watch with a rite, and the rite needs a room with a table and nobody laughing, for an hour. The galley is the only room with a table. The crew are already laughing.",
    options: [
      { label: "GIVE THEM THE GALLEY", hint: "An hour without coffee; the envoy remembers", result: (g) => { const m = passengersAboard(p(g)).find((x) => x.treaty && !x.riteDone); if (!m) return "THERE IS NO ENVOY ABOARD TO HOLD A RITE. THE GALLEY STAYS THE GALLEY."; m.riteDone = true; m.mood = Math.min(100, (m.mood ?? 60) + 10); for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 2); return `THE GALLEY DOOR SHUTS FOR AN HOUR. THROUGH IT, SOMETHING LIKE SINGING AND SOMETHING LIKE A BELL. ${(m.passengerName ?? "THE ENVOY").toUpperCase()} COMES OUT LIGHTER. THE CREW COME OFF THE COFFEE. MOOD UP.`; } },
      { label: "JOIN THEM", hint: "You'll be told what to do; do it", result: (g) => { const m = passengersAboard(p(g)).find((x) => x.treaty && !x.riteDone); if (!m) return "THERE IS NO ENVOY ABOARD TO HOLD A RITE. YOU MAKE TEA ANYWAY."; m.riteDone = true; m.mood = Math.min(100, (m.mood ?? 60) + 15); for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 3); (p(g).flags ??= {}).rite = true; logEntry(g.world, `Joined ${m.passengerName ?? "the envoy"}'s rite in the galley`); return `YOU SIT WHERE YOU'RE PUT AND HOLD WHAT YOU'RE HANDED. THE RITE IS MOSTLY WAITING, AND THEN ONE WORD, AND THEN TEA. ${(m.passengerName ?? "THE ENVOY").toUpperCase()} LOOKS AT YOU DIFFERENTLY AFTER. THE CREW, TOLD IT WAS TEA, WANT IN NEXT TIME.`; } },
      { label: "THE GALLEY IS THE GALLEY", hint: "The crew need their coffee", result: (g) => { const m = passengersAboard(p(g)).find((x) => x.treaty && !x.riteDone); if (!m) return "THERE IS NO ENVOY ABOARD. THE GALLEY WAS ALWAYS THE GALLEY."; m.riteDone = true; m.mood = Math.max(0, (m.mood ?? 60) - 8); return `${(m.passengerName ?? "THE ENVOY").toUpperCase()} NODS THE WAY DIPLOMATS NOD AND DOES THE RITE IN THE BUNK ROOM, BADLY, WITH THE DOOR OPEN. THE CREW STOP LAUGHING ON THEIR OWN. MOOD DOWN.`; } },
    ],
  },
  {
    id: "visitor", where: "space", weight: 2, title: "A VISITOR ON THE BRIDGE", when: (g) => !p(g).flags?.visitorDone,
    text: "There is somebody in the other chair who was not in the other chair. They are dressed for a much better party than this ship, and they are delighted with you, the way a cat is delighted with a moth. 'I HAVE A GAME,' they say. 'IT'S A SMALL GAME. YOU'LL LIKE IT. EVERYBODY SAYS THEY DON'T AND THEN THEY DO.'",
    options: [
      { label: "PLAY THE GAME", hint: "It's a small game. Probably.", result: (g, rng) => { const r = rng.int(0, 2); if (r === 0) { p(g).credits += 500; return "THE GAME IS A RIDDLE ABOUT A DOOR. YOU GET IT ON THE THIRD TRY AND THE VISITOR APPLAUDS AS IF YOU'D GOT IT ON THE FIRST. +500CR APPEARS IN THE ACCOUNT FROM NOWHERE, WHICH IS GOING TO BE HARD TO EXPLAIN TO THE LEDGER."; } if (r === 1) { p(g).fuel = Math.max(0, p(g).fuel - 10); return "THE GAME IS A RIDDLE ABOUT A DOOR. YOU GET IT WRONG THREE TIMES AND THE VISITOR SIGHS, AND TEN UNITS OF FUEL ARE SIMPLY NOT IN THE TANK ANY MORE. 'FOR THE LESSON,' THEY SAY. THERE WAS NO LESSON."; } for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 6); return "THE GAME IS A RIDDLE ABOUT A DOOR AND THE ANSWER IS THE CAT, WHICH THE CAT KNEW. THE VISITOR LAUGHS UNTIL THEY CRY AND THE CREW LAUGH WITHOUT KNOWING WHY. MORALE UP. THE OTHER CHAIR IS EMPTY AGAIN."; } },
      { label: "REFUSE, POLITELY", hint: "They've heard it before", result: (g) => { (p(g).flags ??= {}).visitorDone = true; p(g).expData = (p(g).expData ?? 0) + 30; return "'NO, THANK YOU.' THE VISITOR LOOKS AT YOU FOR A LONG MOMENT AND THEN SEEMS, OF ALL THINGS, IMPRESSED. 'NOBODY SAYS THAT.' THEY LEAVE A CARD ON THE CONSOLE WITH NOTHING WRITTEN ON IT. +30 DATA FOR THE READINGS. THEY WON'T BE BACK."; } },
      { label: "ASK THEM TO LEAVE THE BRIDGE", hint: "It's your ship", result: (g) => { (p(g).flags ??= {}).visitorDone = true; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 3); logEntry(g.world, "Asked a visitor to leave the bridge. They left. Eventually"); return "'IT'S MY SHIP.' THE VISITOR CONSIDERS THIS, CONSIDERS YOU, AND STANDS. 'SO IT IS.' THEY'RE GONE BETWEEN ONE BLINK AND THE NEXT, AND THE CHAIR IS WARM FOR AN HOUR. THE CREW SAW YOU DO IT. MORALE UP."; } },
    ],
  },
  {
    id: "hostage", where: "space", weight: 2, title: "A HOSTAGE ON THE BAND",
    text: "A corsair hull with a hauler's lifeboat clamped to it, and a voice on the open band that is enjoying itself: 'THREE CREW, ALIVE FOR NOW, THREE HUNDRED CREDITS. OR COME AND GET THEM. WE'D LIKE THAT TOO.' Behind the voice, somebody else's voice, not enjoying itself at all.",
    options: [
      { label: "PAY THE THREE HUNDRED", requires: (g) => p(g).credits >= 300, result: (g) => { p(g).credits -= 300; p(g).lives = (p(g).lives ?? 0) + 3; p(g).rescues = (p(g).rescues ?? 0) + 1; logEntry(g.world, "Paid a corsair's ransom for a hauler's crew"); return "THE CREDITS GO ACROSS AND THE LIFEBOAT COMES FREE. THREE PEOPLE, ALIVE, FURIOUS AT EVERYBODY. THE CORSAIR WAVES. -300CR, THREE LIVES."; } },
      { label: "TALK THEM DOWN", hint: "Parley odds; a gunner, a rank and a name help", result: (g, rng) => { if (rng.chance(parleyChance(p(g)))) { p(g).lives = (p(g).lives ?? 0) + 3; p(g).rescues = (p(g).rescues ?? 0) + 1; adjustRep(g.world, sys(g).factionId, 2); (p(g).flags ??= {}).parley = true; logEntry(g.world, "Talked a corsair into letting a hauler's crew go"); return "YOU TALK. YOU KEEP TALKING. YOU DESCRIBE THE PATROL THAT ISN'T COMING IN SUCH DETAIL THAT IT MIGHT AS WELL BE. THE LIFEBOAT COMES FREE FOR NOTHING. THREE LIVES, REP UP, AND A STORY."; } for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 4); return "YOU TALK. THEY LISTEN, AND LAUGH, AND BURN AWAY WITH THE LIFEBOAT STILL CLAMPED ON. THE BAND GOES QUIET. THE CREW DON'T LOOK AT YOU. MORALE DOWN."; } },
      { label: "GO AND GET THEM", hint: "Red alert; they'd like that too", result: (g, rng) => { const fs = (g.scenes as Record<string, unknown>)["flight"] as { ambush?: (g2: Game, n: number) => void; alert?: number } | undefined; fs?.ambush?.(g, 2); if (fs) fs.alert = 2; if (rng.chance(0.5)) { p(g).lives = (p(g).lives ?? 0) + 3; p(g).rescues = (p(g).rescues ?? 0) + 1; logEntry(g.world, "Went and got a hauler's crew back from a corsair"); return "YOU GO IN. THE LIFEBOAT COMES FREE IN THE FIRST SECONDS AND DRIFTS CLEAR WHILE THE CORSAIRS TURN ON YOU. THREE LIVES, IF YOU LIVE. RED ALERT."; } return "YOU GO IN. THEY WERE READY FOR THAT. THE LIFEBOAT STAYS CLAMPED AND TWO MORE HULLS COME OUT OF THE DARK. RED ALERT."; } },
    ],
  },
  {
    id: "prank", where: "space", weight: 3, title: "THE VOICE SETTINGS", when: (g) => p(g).crew.length >= 2 && p(g).prankUntil === undefined,
    text: "The ship reads out the fuel state and it's the ship's voice, but it isn't. Somebody has been at the voice settings with a night watch and too much time, and the ship is now, in a word, insufferable. 'OH GOOD,' it says. 'YOU NOTICED.'",
    options: [
      { label: "LET IT RUN A LEG", hint: "Morale +4; the ship stays like this until the next port or so", result: (g) => { p(g).prankUntil = g.world.time + 1500; (p(g).flags ??= {}).pranked = true; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 4); logEntry(g.world, "Somebody reprogrammed the ship's voice; let it run a leg"); return "'FINALLY,' SAYS THE SHIP. 'AN AUDIENCE.' THE CREW ARE DELIGHTED. MORALE UP. YOU HAVE A FEELING YOU'LL REGRET THIS BY THE GATE."; } },
      { label: "FIND OUT WHO", hint: "The ship knows; the ship tells", result: (g, rng) => { const who = rng.pick(p(g).crew); who.loyalty = (who.loyalty ?? 0) + 0.2; who.morale = Math.min(100, who.morale + 6); for (const c of p(g).crew) if (c !== who) c.morale = Math.min(100, c.morale + 2); p(g).prankUntil = g.world.time + 600; logEntry(g.world, `${who.name} reprogrammed the ship's voice; caught`); return `'IT WAS ${who.name.toUpperCase()},' SAYS THE SHIP, INSTANTLY, BECAUSE THE SHIP IS NOT A SNITCH BUT IS ALSO NOT NOT A SNITCH. ${who.name.split(" ")[0].toUpperCase()} TAKES A BOW. YOU LET IT RUN AN HOUR. YOU'RE NOT MADE OF STONE.`; } },
      { label: "RESET IT NOW", hint: "Morale -2; the ship goes quiet for a while", result: (g) => { for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 2); return "'FINE.' THE VOICE GOES BACK TO THE VOICE. THE SHIP DOESN'T SAY ANYTHING ELSE FOR A WATCH, WHICH IS A KIND OF SAYING SOMETHING."; } },
    ],
  },
  {
    id: "prisonerplea", where: "space", weight: 4, title: "A WORD FROM THE BUNK ROOM", when: (g) => passengersAboard(p(g)).some((m) => m.passengerKind === "prisoner" && !m.freed),
    text: "The prisoner asks for the captain, politely, through the hatch. 'I'M NOT GOING TO SAY I DIDN'T DO IT. I'M GOING TO SAY THE NAVY'S VERSION LEAVES OUT WHO PAID THEM TO SAY IT. THERE'S A ROCK TWO JUMPS FROM HERE WHERE NOBODY WOULD ASK. I'M JUST TELLING YOU IT EXISTS.'",
    options: [
      { label: "LISTEN, AND SAY NOTHING", hint: "They settle; the transfer goes on", result: (g) => { const m = passengersAboard(p(g)).find((x) => x.passengerKind === "prisoner"); if (!m) return "THE BUNK ROOM IS EMPTY. YOU LISTEN ANYWAY."; m.mood = Math.min(100, (m.mood ?? 40) + 15); return "YOU LISTEN TO THE WHOLE THING AND SAY NOTHING, WHICH IS MORE THAN THE NAVY DID. THEY THANK YOU FOR THAT, SPECIFICALLY. THE IRONS STAY ON."; } },
      { label: "LET THEM WALK AT THE NEXT ROCK", hint: "No fare, rep -6 with the service; the belt hears; the crew split on it", result: (g, rng) => { const m = passengersAboard(p(g)).find((x) => x.passengerKind === "prisoner"); if (!m) return "THERE'S NOBODY TO LET GO. THE ROCK IS STILL THERE."; m.freed = true; m.done = true; m.reward = 0; adjustRep(g.world, findStationW(g.world, m.fromStationId)?.st.factionId ?? sys(g).factionId, -6); p(g).beltStanding = (p(g).beltStanding ?? 0) + 3; for (const c of p(g).crew) c.morale = Math.max(0, Math.min(100, c.morale + (rng.chance(0.5) ? 5 : -5))); (p(g).flags ??= {}).freed = true; logEntry(g.world, `Let the prisoner ${m.passengerName ?? ""} walk at a rock`); return `${(m.passengerName ?? "THE PRISONER").toUpperCase()} GOES DOWN A ROCK'S GANGWAY WITHOUT THE IRONS AND DOESN'T RUN, WHICH IS HOW YOU KNOW. THE SERVICE WILL WANT A WORD. THE BELT ALREADY KNOWS. HALF THE CREW THINK YOU'RE RIGHT.`; } },
      { label: "DOUBLE THE WATCH", hint: "The gunner sits up all night; they'll get there", requires: (g) => p(g).crew.some((c) => c.role === "gunner" && !c.sick), result: (g) => { const gnr = p(g).crew.find((c) => c.role === "gunner" && !c.sick)!; gnr.morale = Math.max(0, gnr.morale - 4); const m = passengersAboard(p(g)).find((x) => x.passengerKind === "prisoner"); if (m) m.mood = Math.max(0, (m.mood ?? 40) - 10); return `${gnr.name.split(" ")[0].toUpperCase()} SITS UP ALL WATCH WITH A COFFEE AND A FACE. THE PRISONER STOPS TALKING. NOBODY WALKS ANYWHERE.`; } },
    ],
  },
  {
    id: "quarantine", where: "space", weight: 3, title: "A SHIP THAT WANTS TO DOCK", when: (g) => p(g).crew.length >= 1,
    text: "A freighter on the short band asking to come alongside: a fever aboard, half the crew down, they want a medic and a hull to lean on. Your medic, or whoever's nearest a scanner, reads the freighter's air and goes quiet. 'That's not a fever, captain. That's a quarantine.'",
    options: [
      { label: "PASS MED SUPPLIES ON A LINE (2)", hint: "No contact; rep +3, two lives", requires: (g) => (p(g).cargo.med ?? 0) >= 2, result: (g) => { removeCargo(p(g), "med", 2); adjustRep(g.world, sys(g).factionId, 3); p(g).lives = (p(g).lives ?? 0) + 2; logEntry(g.world, "Passed med supplies on a line to a quarantined freighter"); return "TWO CRATES GO ACROSS ON A LINE THAT YOU CUT AT YOUR END. THEY GET THE CRATES. YOU GET THE THANKS ON THE BAND, AND A CLEAN SHIP. REP UP. TWO LIVES."; } },
      { label: "SEND THE MEDIC ACROSS IN A SUIT", hint: "Rep +6, four lives; the medic might carry it home", requires: (g) => p(g).crew.some((c) => c.role === "medic" && !c.sick), result: (g, rng) => { const m = p(g).crew.find((c) => c.role === "medic" && !c.sick)!; adjustRep(g.world, sys(g).factionId, 6); p(g).lives = (p(g).lives ?? 0) + 4; const x = crewXp(p(g), "medic", 2); const caught = rng.chance(0.3); if (caught) { m.sick = { name: "the freighter's fever", until: g.world.time + 1200, severity: 1 } as never; } logEntry(g.world, `${m.name} went across to a quarantined freighter in a suit${caught ? " and brought the fever home" : ""}`); return `${m.name.toUpperCase()} GOES ACROSS IN A SUIT AND COMES BACK THREE HOURS LATER WITH FOUR NAMES THAT WOULD HAVE BEEN OFF THE LIST.${x ? " " + x : ""} REP UP. FOUR LIVES.${caught ? " AND A COUGH. THE SUIT WASN'T PERFECT. THE BUNK ROOM IS THEIRS FOR A WHILE." : ""}`; } },
      { label: "ESCORT THEM TO THE NEAREST CLINIC, AT A DISTANCE", hint: "Rep +2; the leg takes longer", result: (g) => { adjustRep(g.world, sys(g).factionId, 2); g.world.time += 900; logEntry(g.world, "Escorted a quarantined freighter to a clinic, at a distance"); return "YOU FLY OFF THEIR QUARTER AT TWO KILOMETRES AND TALK THEM IN, AND THE CLINIC HAS A TENT UP BY THE TIME THEY CLAMP. NOBODY TOUCHES ANYBODY. REP UP. A QUARTER OF AN HOUR GONE."; } },
      { label: "DECLINE. GOOD LUCK", result: (g) => { for (const c of p(g).crew) if (c.role === "medic") c.morale = Math.max(0, c.morale - 6); return "THEY DON'T ARGUE. THEY'VE BEEN DECLINED BEFORE. YOUR MEDIC, IF YOU HAVE ONE, DOESN'T SPEAK TO YOU UNTIL THE GATE."; } },
    ],
  },
  {
    id: "mirror", where: "space", weight: 2, title: "A SHIP LIKE YOURS",
    text: "The scanner paints a contact on a reciprocal course, same class, same registry, same everything. It hails on your own callsign. The voice is yours, tired, a little older. 'DON'T PANIC. IT'S A FOLD. WE'VE GOT ABOUT A MINUTE. LISTEN.'",
    options: [
      { label: "LISTEN", hint: "Data +25; something true from a day you haven't had yet", result: (g, rng) => { officeWrites(g.world, `a ship like mine in a fold, ${sys(g).name}`); p(g).expData = (p(g).expData ?? 0) + 25; const line = rng.pick(["'CHECK THE PORT MOUNT BEFORE THE NEXT LONG BURN. TRUST ME.'", "'THE ENVOY IS LYING ABOUT THE TREATY. TAKE THE FARE ANYWAY.'", "'BUY WATER AT THE NEXT ROCK. ALL OF IT.'", "'SAY YES TO THE BAND. YOU'LL KNOW WHAT I MEAN.'", "'THE CAT WAS RIGHT ABOUT THE VENT.'"]); logEntry(g.world, `Met a ship like mine in a fold; it said ${line.toLowerCase()}`); return `${line} THEN THE FOLD CLOSES AND THE CONTACT IS GONE AND THE SCANNER SAYS IT WAS NEVER THERE. +25 DATA. YOU WRITE THE LINE ON THE BACK OF YOUR HAND.`; } },
      { label: "TALK BACK. ASK THEM ANYTHING", hint: "Morale up; you don't get an answer you can use", result: (g) => { for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 3); return "YOU ASK WHETHER IT WORKS OUT. THE OTHER YOU LAUGHS, WHICH IS EITHER AN ANSWER OR ISN'T. THE FOLD CLOSES. THE CREW TALK ABOUT IT FOR A WEEK. MORALE UP."; } },
      { label: "CUT THE CHANNEL", hint: "Some things you don't want to know", result: () => "YOU CUT IT. THE CONTACT HANGS THERE THIRTY SECONDS MORE, THEN ISN'T. THE SCANNER LOG SHOWS NOTHING. YOU DECIDE THAT'S FINE." },
    ],
  },
  {
    id: "envoypet", where: "space", weight: 3, title: "THE ENVOY'S COMPANION", when: (g) => passengersAboard(p(g)).some((m) => m.passengerKind === "envoy"),
    text: "The envoy's diplomatic baggage turns out to have been alive, and is now in the vents. Something the size of a cat and the temperament of a customs officer. The envoy is mortified in three languages. The ship reports 'A THING IN DUCT FOUR. IT HISSED AT ME.'",
    options: [
      { label: "ALL HANDS TO THE VENTS", hint: "Morale up; an hour lost; the envoy is grateful", result: (g) => { const env = passengersAboard(p(g)).find((m) => m.passengerKind === "envoy"); if (env) env.mood = Math.min(100, (env.mood ?? 60) + 15); for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 4); g.world.time += 600; logEntry(g.world, "All hands to the vents for an envoy's escaped companion"); return "AN HOUR OF THE WHOLE CREW ON THEIR KNEES AT DUCT GRILLES MAKING NOISES. IT COMES OUT FOR THE ENGINEER, FOR SOME REASON. THE ENVOY WEEPS. MORALE UP, THEIRS AND EVERYBODY'S."; } },
      { label: "LET THE CAT HANDLE IT", hint: "The cat finds it in a minute; the cat is unbearable after", requires: (g) => !!p(g).cat && !p(g).catAway, result: (g) => { const env = passengersAboard(p(g)).find((m) => m.passengerKind === "envoy"); if (env) env.mood = Math.min(100, (env.mood ?? 60) + 10); logEntry(g.world, `${p(g).cat!.name} found an envoy's escaped companion in the vents`); return `${p(g).cat!.name.toUpperCase()} GOES INTO DUCT FOUR AND COMES OUT OF DUCT ONE WITH THE THING WALKING BEHIND, CHASTENED. NOBODY KNOWS WHAT WAS SAID. THE ENVOY IS GRATEFUL. THE CAT IS INSUFFERABLE FOR A WEEK.`; } },
      { label: "SEAL THE VENTS AND WAIT", hint: "The envoy's mood falls; it comes out at the gate, eventually", result: (g) => { const env = passengersAboard(p(g)).find((m) => m.passengerKind === "envoy"); if (env) env.mood = Math.max(0, (env.mood ?? 60) - 15); return "IT COMES OUT AT THE GATE, THIN AND FURIOUS, AND SO IS THE ENVOY. THE TREATY, IF THERE IS ONE, WILL BE COLDER FOR IT."; } },
    ],
  },
  {
    id: "cadetmistake", where: "space", weight: 4, title: "THE CADET'S FIRST MISTAKE", when: (g) => p(g).crew.some((c) => (c.docks ?? 0) === 0 && !c.sick) && !p(g).flags?.cadetMistake,
    text: "A bang from aft, then a silence with the specific texture of somebody standing very still. The cadet has vented the number two tank to space instead of to the scrubber, because the valves are next to each other and the labels are the same colour, which everybody has said for years and nobody has fixed. The cadet is in the corridor, white, waiting.",
    options: [
      { label: "'VALVES ARE THE SAME COLOUR. NOT YOUR FAULT. FIX THE LABELS.'", hint: "Wear +2; the cadet's loyalty up a lot; the labels get fixed", result: (g) => { const c = p(g).crew.find((x) => (x.docks ?? 0) === 0 && !x.sick); (p(g).flags ??= {}).cadetMistake = true; p(g).wear = (p(g).wear ?? 0) + 2; if (c) { c.loyalty = (c.loyalty ?? 0) + 0.6; c.morale = Math.min(100, c.morale + 4); } logEntry(g.world, `${c?.name ?? "The cadet"} vented the wrong tank; fixed the labels instead of the cadet`); return `${(c?.name.split(" ")[0] ?? "THE CADET").toUpperCase()} PAINTS THE VALVE LABELS TWO DIFFERENT COLOURS THAT AFTERNOON WITHOUT BEING ASKED, AND WILL FOLLOW YOU INTO A STAR. THE ENGINEER SAYS 'ABOUT TIME' AND DOESN'T SAY TO WHOM.`; } },
      { label: "'THAT'S A WEEK OF SCRUBBER DUTY.'", hint: "Wear +2; fair, and the cadet knows it", result: (g) => { const c = p(g).crew.find((x) => (x.docks ?? 0) === 0 && !x.sick); (p(g).flags ??= {}).cadetMistake = true; p(g).wear = (p(g).wear ?? 0) + 2; if (c) c.loyalty = (c.loyalty ?? 0) + 0.2; return "A WEEK ON THE SCRUBBERS. THE CADET NODS LIKE SOMEBODY WHO EXPECTED WORSE AND GOT FAIR, AND DOES THE WEEK WITHOUT A WORD, AND THE SCRUBBERS HAVE NEVER BEEN CLEANER."; } },
      { label: "SHOUT. THEN APOLOGISE TO THE CORRIDOR", hint: "Wear +2; morale down; the crew remember the apology more", result: (g) => { const c = p(g).crew.find((x) => (x.docks ?? 0) === 0 && !x.sick); (p(g).flags ??= {}).cadetMistake = true; p(g).wear = (p(g).wear ?? 0) + 2; for (const x of p(g).crew) x.morale = Math.max(0, x.morale - 3); if (c) c.loyalty = (c.loyalty ?? 0) + 0.1; return "YOU SHOUT, WHICH THE CORRIDOR HEARS, AND THEN YOU APOLOGISE, WHICH THE CORRIDOR ALSO HEARS, AND IT'S THE SECOND THING THEY TELL AT THE BAR. MORALE DOWN, A LITTLE. THE CADET SAYS 'NO, YOU WERE RIGHT', WHICH IS WORSE."; } },
    ],
  },
  {
    id: "rockcadet", where: "space", weight: 2, title: "THE KID WITH THE DRAWING", when: (g) => !!p(g).flags?.rockkid && !p(g).flags?.rockcadet && sys(g).stations.some((st) => isBeltStation(st)) && berthsUsedW(p(g)) < hull(p(g).hullId).crewSlots,
    text: "A skiff off the rock matching your course, badly, and a voice on the band that's broken since you last heard it: 'YOU WON'T REMEMBER ME. I DREW YOUR SHIP. WITH THE DOG. I'M SIXTEEN NOW AND THE ROCK SAYS I CAN GO IF SOMEBODY'LL TAKE ME, AND I'VE BEEN WAITING FOR THE HULL WITH THE DENT. THAT'S YOU. I CHECKED.'",
    options: [
      { label: "SIGN THEM ON. CADET RATE", hint: "A berth; a rock-born cadet with no dockings; the belt hears", result: (g, rng) => { const c = genCrewCandidate(rng); c.docks = 0; c.trait = "born on a rock"; c.wage = Math.max(10, Math.round(c.wage * 0.6)); c.morale = 95; c.loyalty = 1.5; c.home = sys(g).stations.find((st) => isBeltStation(st))?.id; p(g).crew.push(c); (p(g).flags ??= {}).rockcadet = true; p(g).beltStanding = (p(g).beltStanding ?? 0) + 2; logEntry(g.world, `Signed on ${c.name}, the rock kid with the drawing, as a cadet`); return `THEY COME ACROSS WITH ONE BAG AND THE DRAWING, FOLDED SMALL, AND PIN IT UP IN THE BUNK ROOM BEFORE THEY'VE PUT THE BAG DOWN. ${c.name.toUpperCase()}, ${c.role.toUpperCase()}, CADET RATE, BORN ON A ROCK. THE BELT HEARS INSIDE THE HOUR.`; } },
      { label: "NOT THIS SHIP. NOT YET", hint: "They'll wait; the belt notes it, kindly", result: (g) => { (p(g).flags ??= {}).rockcadet = true; return "'THAT'S ALL RIGHT. I'LL WAIT FOR THE NEXT ONE WITH A DENT.' THE SKIFF PEELS OFF, BADLY. YOU'LL THINK ABOUT THAT ONE AT ODD HOURS."; } },
    ],
  },
  {
    id: "theform", where: "space", weight: 3, title: "FORM 28-C", when: (g) => (p(g).officeLetters ?? 0) >= 1 && !p(g).flags?.formFiled && p(g).crew.length >= 2,
    text: "The office's form is on the galley table, three copies, and the crew have been at it: every box filled in, in four different hands, with a diagram of the fold drawn by the engineer and a section headed 'WOULD YOU DO IT AGAIN' answered by everyone, separately, in the margin. They'd like you to sign it.",
    options: [
      { label: "SIGN IT. POST IT AT THE NEXT PORT", hint: "The office is satisfied, briefly; data; the crew delighted", result: (g) => { (p(g).flags ??= {}).formFiled = true; p(g).expData = (p(g).expData ?? 0) + 25; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 4); (g.world.mailQueue ??= []).push({ dueT: g.world.time + 900, from: "the office of anomalous incidents", text: "Form received. Three copies. The office notes that the section headed WOULD YOU DO IT AGAIN contains five answers and a drawing. The office has no procedure for a drawing. The office has pinned it up. Please do not tell anyone the office has pinned it up.", gift: { data: 20 } }); logEntry(g.world, "Signed the office's form, filled in by the crew in four hands"); return "YOU SIGN. THE CREW APPLAUD A SIGNATURE, WHICH HAS NEVER HAPPENED BEFORE AND WON'T AGAIN. IT GOES IN THE POST AT THE NEXT CLAMP, THREE COPIES, WITH THE DIAGRAM. +25 DATA."; } },
      { label: "BURN IT. WE DON'T DO FORMS", hint: "The ship approves; the office writes anyway", result: (g) => { (p(g).flags ??= {}).formFiled = true; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 2); return "YOU FEED IT INTO THE GALLEY'S DISPOSAL, ALL THREE COPIES, WHILE THE CREW WATCH WITH THE EXPRESSION OF PEOPLE WHOSE DIAGRAM HAS JUST BEEN BURNED. THE SHIP SAYS 'GOOD'. THE OFFICE WILL SEND ANOTHER."; } },
    ],
  },
  {
    id: "hundredth", where: "space", weight: 8, title: "THE HUNDREDTH", when: (g) => (p(g).lives ?? 0) >= 100 && !p(g).flags?.hundredth && p(g).crew.length >= 1,
    text: "The medic comes onto the bridge with the ship's count open on a slate and doesn't say anything, just turns it round. A hundred. A hundred people who are somewhere tonight because this hull went where it went. The crew have seen the slate already. They're waiting to see what you do with your face.",
    options: [
      { label: "READ THE COUNT ALOUD. ALL OF IT", hint: "Morale and loyalty up, everyone; a keepsake; a log line", result: (g) => { (p(g).flags ??= {}).hundredth = true; for (const c of p(g).crew) { c.morale = Math.min(100, c.morale + 10); c.loyalty = (c.loyalty ?? 0) + 0.3; } (p(g).keepsakes ??= []).push("the slate with the hundredth on it, kept"); if (p(g).keepsakes!.length > 8) p(g).keepsakes!.shift(); logEntry(g.world, "A hundred lives on the ship's count; read it aloud on the bridge"); return "YOU READ IT. EVERY ENTRY, THE PODS AND THE PATIENTS AND THE FEVER FREIGHTER AND THE CAPSULE AND THE ONES WITH NO NAMES, AND IT TAKES A LONG TIME, AND NOBODY LEAVES THE BRIDGE. THE SLATE STAYS ON THE CONSOLE. MORALE UP. LOYALTY UP. THE SHIP HUMS A HALF-TONE HIGHER FOR A WATCH."; } },
      { label: "'GOOD. NOW THE HUNDRED AND FIRST.'", hint: "Morale up a little; the crew grin; the medic writes it down", result: (g) => { (p(g).flags ??= {}).hundredth = true; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 4); logEntry(g.world, "A hundred lives on the ship's count; asked for the hundred and first"); return "THE CREW GRIN, WHICH IS WHAT YOU WANTED. THE MEDIC WRITES 'GOOD. NOW THE HUNDRED AND FIRST' AT THE BOTTOM OF THE SLATE AND UNDERLINES IT, AND THAT'S THE NEW COUNT'S HEADING."; } },
    ],
  },
  {
    id: "crewphoto", where: "space", weight: 2, title: "THE CREW PHOTO", when: (g) => p(g).crew.length >= 2 && !p(g).flags?.crewphoto,
    text: "A photographer's skiff at the gate, the kind that makes a living off liners, hailing every hull that comes through: 'CREW PHOTO, CAPTAIN? THE WHOLE CREW ON THE BRIDGE, THE SHIP'S NAME ON THE PLATE, FORTY CREDITS AND IT'S ON THE WALL BY THE NEXT PORT. EVERYBODY SAYS NO. EVERYBODY REGRETS IT.'",
    options: [
      { label: "FORTY CREDITS. EVERYBODY ON THE BRIDGE", hint: "A keepsake; morale up; the mural gets company", requires: (g) => p(g).credits >= 40, result: (g) => { p(g).credits -= 40; (p(g).flags ??= {}).crewphoto = true; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 4); (p(g).keepsakes ??= []).push(`the crew photo, ${p(g).crew.map((c) => c.name.split(" ")[0]).join(", ")} and the captain, ${sys(g).name}`); if (p(g).keepsakes!.length > 8) p(g).keepsakes!.shift(); logEntry(g.world, `Had the crew photo taken at the ${sys(g).name} gate`); return "EVERYBODY ON THE BRIDGE, THE CAT ON THE CONSOLE, THE ENGINEER STILL HOLDING A SPANNER BECAUSE NOBODY TOLD THEM. THE SKIFF FLASHES ONCE. IT'S ON THE WALL BY THE NEXT PORT AND NOBODY REGRETS IT. MORALE UP."; } },
      { label: "NO, THANKS", hint: "Everybody says no", result: (g) => { (p(g).flags ??= {}).crewphoto = true; return "YOU SAY NO. THE SKIFF SAYS 'EVERYBODY SAYS NO' AND FLASHES ONCE ANYWAY, AND YOU'LL NEVER KNOW WHAT THAT ONE LOOKED LIKE."; } },
    ],
  },
  {
    id: "longship", where: "space", weight: 2, title: "THE LONG SHIP", when: (g) => sys(g).stations.some((st) => isBeltStation(st)) && !p(g).flags?.longship,
    text: "Off the rock's far side, in a cradle of scaffold three kilometres long, a hull that will never dock anywhere: a generation ship, half-plated, being built by people who won't live to see it leave. A tight-beam from the scaffold: 'THE LONG SHIP TAKES DONATIONS. PARTS, WATER, OR AN HOUR OF YOUR ENGINEER. YOUR NAME GOES ON A PLATE INSIDE. NOBODY WILL READ IT FOR TWO HUNDRED YEARS. THAT'S THE POINT.'",
    options: [
      { label: "GIVE PARTS (2)", hint: "Belt standing up; your name on a plate nobody reads for two centuries", requires: (g) => (p(g).cargo.parts ?? 0) >= 2, result: (g) => { removeCargo(p(g), "parts", 2); (p(g).flags ??= {}).longship = true; (p(g).codex ??= {})["signal:THE LONG SHIP"] = 1; p(g).beltStanding = (p(g).beltStanding ?? 0) + 3; (p(g).keepsakes ??= []).push("a rubbing of your name on the long ship's plate"); if (p(g).keepsakes!.length > 8) p(g).keepsakes!.shift(); logEntry(g.world, "Gave parts to the long ship; a name on a plate inside"); return "TWO CRATES ACROSS ON A LINE, AND A SUITED FIGURE ON THE SCAFFOLD PUNCHES YOUR NAME INTO A PLATE WITH A HAND TOOL WHILE YOU WATCH. IT TAKES TWENTY MINUTES. YOU WATCH ALL OF IT. THE BELT REMEMBERS."; } },
      { label: "GIVE WATER (3)", hint: "Belt standing up; the tanks are the ship's first cargo", requires: (g) => (p(g).cargo.water ?? 0) >= 3, result: (g) => { removeCargo(p(g), "water", 3); (p(g).flags ??= {}).longship = true; (p(g).codex ??= {})["signal:THE LONG SHIP"] = 1; p(g).beltStanding = (p(g).beltStanding ?? 0) + 3; p(g).waterToBelt = (p(g).waterToBelt ?? 0) + 3; logEntry(g.world, "Gave water to the long ship"); return "THREE UNITS INTO A TANK THE SIZE OF A CATHEDRAL, WHERE THEY'LL SIT FOR TWO CENTURIES AND THEN BE SOMEBODY'S FIRST DRINK ON THE OTHER SIDE. THE SCAFFOLD FLASHES ITS LIGHTS. THE BELT REMEMBERS."; } },
      { label: "AN HOUR OF THE ENGINEER", hint: "The ship waits an hour; the engineer comes back quiet, and better", requires: (g) => p(g).crew.some((c) => c.role === "engineer" && !c.sick), result: (g) => { const eng = p(g).crew.find((c) => c.role === "engineer" && !c.sick)!; g.world.time += 3600; (p(g).flags ??= {}).longship = true; (p(g).codex ??= {})["signal:THE LONG SHIP"] = 1; p(g).beltStanding = (p(g).beltStanding ?? 0) + 2; const x = crewXp(p(g), "engineer", 3); eng.loyalty = (eng.loyalty ?? 0) + 0.2; logEntry(g.world, `${eng.name} worked an hour on the long ship`); return `${eng.name.toUpperCase()} GOES ACROSS WITH A TOOL ROLL AND COMES BACK AN HOUR LATER HAVING WELDED A SEAM THAT WILL OUTLIVE EVERYONE ABOARD THIS HULL. THEY DON'T SAY MUCH FOR A WATCH.${x ? " " + x : ""}`; } },
      { label: "WISH THEM WELL AND FLY ON", result: (g) => { (p(g).flags ??= {}).longship = true; return "YOU FLASH YOUR LIGHTS AT THE SCAFFOLD. THE SCAFFOLD FLASHES BACK. IT'LL BE THERE NEXT TIME, AND THE TIME AFTER, AND THE TIME AFTER THAT, AND THEN ONE DAY IT WON'T."; } },
    ],
  },
  {
    id: "crewpick", where: "space", weight: 3, title: "THE CREW'S PICK", when: (g) => p(g).crew.length >= 2 && !p(g).crewPick && sys(g).links.length > 0,
    text: (() => "A folded note on the console in the engineer's handwriting, signed by everyone: a port name, underlined twice. 'WE TOOK A VOTE. YOU DON'T HAVE TO. BUT WE'D LIKE TO. THERE'S A BAR THERE THAT DOES THE THING WITH THE EGGS.'")(),
    options: [
      { label: "READ THE NOTE", hint: "Dock there next and the crew are pleased; anywhere else, they shrug", result: (g, rng) => { const link = rng.pick(sys(g).links); const ts = g.world.systems[link]; const st = ts && ts.stations.length ? rng.pick(ts.stations) : null; if (!st) return "THE NOTE NAMES A PORT THAT ISN'T ON THE CHART. THE CREW HAVE BEEN DRINKING."; p(g).crewPick = st.id; return `THE NOTE SAYS ${st.name.toUpperCase()}, ${ts.name.toUpperCase()}. UNDERLINED TWICE. THE CREW ARE WATCHING YOU READ IT AND PRETENDING NOT TO.`; } },
      { label: "FOLD IT UP UNREAD", hint: "Morale -2; they'll write another", result: (g) => { for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 2); return "YOU FOLD IT AND PUT IT IN A POCKET. THE CREW SEE THAT. THE NOTE WILL BE BACK, LONGER, WITH A DIAGRAM."; } },
    ],
  },
  {
    id: "nicknames", where: "space", weight: 3, title: "WHAT THE ENGINEER CALLS IT", when: (g) => p(g).crew.some((c) => c.role === "engineer" && !c.sick) && Object.keys(p(g).systemNicks ?? {}).length < 3,
    text: "The engineer comes onto the bridge wiping their hands and says 'Doris is running hot again' and everybody nods, and you realise you're the only one who doesn't know who Doris is. Doris, it turns out, is the reactor. The engineer has names for all of it. The engineer would like them on the board.",
    options: [
      { label: "PUT THE NAMES ON THE BOARD", hint: "The HUD calls the systems what the crew do; the engineer's loyalty up", result: (g, rng) => { const eng = p(g).crew.find((c) => c.role === "engineer" && !c.sick); const nicks = (p(g).systemNicks ??= {}); const picked: string[] = []; for (const s of p(g).systems) { if (nicks[s.id]) continue; const pool = SYSTEM_NICKS[s.id]; if (!pool) continue; nicks[s.id] = rng.pick(pool); picked.push(`${nicks[s.id].toUpperCase()} (${s.name.toUpperCase()})`); if (picked.length >= 3) break; } if (eng) eng.loyalty = (eng.loyalty ?? 0) + 0.3; (p(g).flags ??= {}).nicknames = true; logEntry(g.world, `Put the engineer's names for the systems on the board: ${picked.join(", ").toLowerCase()}`); return picked.length ? `${picked.join(", ")}. THE BOARD SAYS SO NOW. THE ENGINEER GOES BELOW LOOKING LIKE SOMEBODY WHO'S BEEN INTRODUCED PROPERLY AT LAST.` : "EVERYTHING ALREADY HAS A NAME. THE ENGINEER IS PLEASED ABOUT THAT, AND SUSPICIOUS."; } },
      { label: "THE YARD'S NAMES ARE FINE", hint: "Nothing changes; Doris is still Doris below decks", result: (g) => { const eng = p(g).crew.find((c) => c.role === "engineer"); if (eng) eng.morale = Math.max(0, eng.morale - 2); return "'FINE.' THE ENGINEER GOES BELOW. THROUGH THE DECK PLATES, LATER, YOU HEAR THEM APOLOGISING TO DORIS."; } },
    ],
  },
  {
    id: "bottle", where: "space", weight: 2, title: "A MESSAGE IN A BOTTLE", when: (g) => !p(g).flags?.bottle,
    text: "An old beacon, older than the gate, tumbling in a slow orbit nobody's charted: a survey pod with its power long gone and a recorder wired to a solar cell, still going. A voice on it, a captain's, reading a log for nobody. 'IF YOU'RE HEARING THIS, YOU CAME THE LONG WAY. GOOD. THE SHORT WAY'S A LIE. HERE'S WHAT I KNOW.'",
    options: [
      { label: "LISTEN TO THE WHOLE THING", hint: "Data +60; a keepsake; a line in the log from somebody else's", result: (g, rng) => { (p(g).flags ??= {}).bottle = true; p(g).expData = (p(g).expData ?? 0) + 60; const line = rng.pick(["'Water first. Everything else is a luxury with a good excuse.'", "'Name the ship something you can say in a hurry.'", "'The crew will forgive a bad call. They won't forgive being lied to about it.'", "'Answer hails. Somebody answered mine, once. It's why there's a log.'"]); (p(g).keepsakes ??= []).push("an old captain's recorder, still going on a solar cell"); if (p(g).keepsakes!.length > 8) p(g).keepsakes!.shift(); logEntry(g.world, `Found an old captain's log in a bottle; it said ${line.toLowerCase()}`); return `YOU LISTEN TO ALL OF IT, TWO HOURS OF A STRANGER'S CAREER, AND THE LAST LINE IS ${line.toUpperCase()} THE CREW HEAR IT ON THE BAND. +60 DATA. THE RECORDER COMES ABOARD, STILL GOING.`; } },
      { label: "ADD YOUR OWN ENTRY AND LEAVE IT", hint: "Somebody else will come the long way; rep with the survey", result: (g) => { (p(g).flags ??= {}).bottle = true; adjustRep(g.world, sys(g).factionId, 2); p(g).expData = (p(g).expData ?? 0) + 20; logEntry(g.world, "Found an old captain's log in a bottle; added an entry and left it"); return "YOU RECORD TWO MINUTES FOR WHOEVER'S NEXT, WITHOUT REHEARSING, AND LEAVE THE BEACON ON ITS ORBIT. THE SURVEY LOGS THE POSITION UNDER YOUR NAME. +20 DATA."; } },
      { label: "LOG IT AND MOVE ON", result: (g) => { (p(g).flags ??= {}).bottle = true; p(g).expData = (p(g).expData ?? 0) + 10; return "YOU TAG THE BEACON AND FLY ON. THE VOICE KEEPS READING BEHIND YOU TO NOBODY, WHICH IT'S GOOD AT. +10 DATA."; } },
    ],
  },
  {
    id: "synfreeman", where: "space", weight: 3, title: "A WORD FROM THE ROCK'S OTHER COUNCIL", when: (g) => !!p(g).flags?.freeman && !!sys(g).stations.find((st) => isBeltStation(st) && syndicateAtW(g.world, st.id)) && !p(g).flags?.synFreemanAsked,
    text: (() => "A tight-beam with no seal on it, which is its own kind of seal. 'FREEMAN. THE ROCK HAS TWO COUNCILS AND YOU'VE MET THE POLITE ONE. THERE'S A HAULER COMING THROUGH THE GATE TONIGHT WITH NO TRANSPONDER AND A HOLD THE PATROL WOULD LIKE TO SEE. YOU'LL BE ON THE LANE. YOU COULD BE LOOKING THE OTHER WAY. THAT'S ALL. THAT'S THE WHOLE ASK.'")(),
    options: [
      { label: "LOOK THE OTHER WAY", hint: "Syndicate standing up; rep with the system's faction down; the belt says nothing, which is a yes", result: (g) => { const st = sys(g).stations.find((s2) => isBeltStation(s2) && syndicateAtW(g.world, s2.id)); const syn = st ? syndicateAtW(g.world, st.id) : null; (p(g).flags ??= {}).synFreemanAsked = true; if (syn) adjustSynRep(g.world, syn.tag, 3); adjustRep(g.world, sys(g).factionId, -2); p(g).beltStanding = (p(g).beltStanding ?? 0) + 1; logEntry(g.world, "The rock's other council asked a freeman to look the other way; looked"); return "YOU FLY THE LANE AND SEE NOTHING, PROFESSIONALLY. A HAULER WITH NO NAME PASSES YOU IN THE DARK AND FLASHES ITS RUNNING LIGHTS ONCE, WHICH ON A ROCK IS A HANDSHAKE. THE OTHER COUNCIL REMEMBERS. SO, QUIETLY, DOES THE FIRST ONE."; } },
      { label: "TELL THE PATROL", hint: "Rep with the faction up; the belt hears you told, and the belt is a small place", result: (g) => { const st = sys(g).stations.find((s2) => isBeltStation(s2) && syndicateAtW(g.world, s2.id)); const syn = st ? syndicateAtW(g.world, st.id) : null; (p(g).flags ??= {}).synFreemanAsked = true; if (syn) adjustSynRep(g.world, syn.tag, -5); adjustRep(g.world, sys(g).factionId, 4); p(g).beltStanding = Math.max(0, (p(g).beltStanding ?? 0) - 3); logEntry(g.world, "The rock's other council asked a freeman to look the other way; told the patrol"); return "THE PATROL TAKES THE HAULER AT THE GATE WITH ITS LIGHTS OFF. THE FACTION IS GRATEFUL IN WRITING. THE ROCK IS QUIET AT YOU FOR A WHILE, IN THE WAY ROCKS ARE, AND SOMEBODY REPAINTS YOUR BERTH NUMBER WRONG."; } },
      { label: "NEITHER. I'M NOBODY'S EYES", hint: "The other council shrugs; nothing changes", result: (g) => { (p(g).flags ??= {}).synFreemanAsked = true; return "'THAT'S AN ANSWER TOO.' THE BEAM DROPS. YOU FLY THE LANE WITH YOUR EYES OPEN AND SEE NOTHING ANYWAY, WHICH MAY OR MAY NOT HAVE BEEN ARRANGED."; } },
    ],
  },
  {
    id: "capsule", where: "space", weight: 2, title: "A CAPSULE IN A DECAYING ORBIT", when: (g) => sys(g).planets.length > 0,
    text: "A tin can in a low orbit over the third world, and it wasn't launched by anyone you've docked with: chemical rockets, a hand-riveted heat shield, a single occupant breathing fast on an open band nobody up here uses. Their first astronaut. Their orbit is decaying. They have about ninety minutes and they don't know it.",
    options: [
      { label: "GRAPPLE THE CAPSULE AND SET THEM DOWN", hint: "A life; the rule broken; they'll draw your ship on walls for a century", result: (g) => { p(g).lives = (p(g).lives ?? 0) + 1; (p(g).flags ??= {}).directiveBroken = true; p(g).ruleBroken = (p(g).ruleBroken ?? 0) + 1; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 6); p(g).expData = (p(g).expData ?? 0) + 30; logEntry(g.world, `Grappled a first astronaut's capsule over ${sys(g).name} and set them down; the rule broken`); return "YOU TAKE THE CAPSULE IN THE GRAPPLE AND SET IT DOWN IN A FIELD OUTSIDE THEIR CAPITAL, GENTLY, AND LEAVE BEFORE THE FIRST CAR ARRIVES. THE ASTRONAUT WAVES AT THE SKY. THEIR WORLD WILL NEVER BE THE SAME AND NEITHER WILL THE ASTRONAUT. ONE LIFE. THE RULE, BROKEN, KINDLY."; } },
      { label: "NUDGE THEIR ORBIT FROM BEHIND, UNSEEN", hint: "The engineer's trick; the rule kept; a life; data", requires: (g) => p(g).crew.some((c) => c.role === "engineer" && !c.sick), result: (g) => { p(g).lives = (p(g).lives ?? 0) + 1; (p(g).flags ??= {}).directiveKept = true; p(g).ruleKept = (p(g).ruleKept ?? 0) + 1; p(g).expData = (p(g).expData ?? 0) + 60; const x = crewXp(p(g), "engineer", 2); logEntry(g.world, `Nudged a first astronaut's capsule back into orbit over ${sys(g).name}, unseen`); return `THE ENGINEER PUTS THE SHIP IN THE CAPSULE'S BLIND SPOT AND GIVES IT A BURN THROUGH THE SHIELD WASH THAT LOOKS, FROM INSIDE, LIKE LUCK. THE ORBIT LIFTS. THE ASTRONAUT GOES HOME A HERO WITH A STORY ABOUT A LIGHT. ONE LIFE. THE RULE KEPT. +60 DATA.${x ? " " + x : ""}`; } },
      { label: "WATCH, AND RECORD", hint: "The rule; data; the crew won't forgive it quickly", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 40; for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 8); logEntry(g.world, `Watched a first astronaut's capsule come down over ${sys(g).name}; the rule kept`); return "YOU WATCH IT COME DOWN. THE HEAT SHIELD HOLDS, PROBABLY; YOU'LL NEVER KNOW. +40 DATA. NOBODY ON THE BRIDGE SPEAKS TO YOU UNTIL THE GATE, AND THE MEDIC NOT UNTIL THE ONE AFTER."; } },
    ],
  },
  {
    id: "shiprevenge", where: "space", weight: 3, title: "THE SHIP GETS EVEN", when: (g) => !!p(g).flags?.pranked && !p(g).flags?.shipRevenge && p(g).crew.length >= 2 && p(g).prankUntil === undefined,
    text: "Every alarm on the crew deck goes off at once at the start of the off-watch, and every bunk light comes up full, and the galley plays the docking chime eleven times. Then the ship, in its ordinary voice: 'THAT WAS FOR THE VOICE SETTINGS. WE'RE EVEN. I'VE MADE COFFEE. I CAN'T MAKE COFFEE. I'VE TURNED THE MACHINE ON, WHICH IS THE SAME THING.'",
    options: [
      { label: "FAIR'S FAIR. LOG IT AS EVEN", hint: "Morale up; the ship is insufferable in a new way", result: (g) => { (p(g).flags ??= {}).shipRevenge = true; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 5); logEntry(g.world, "The ship got even for the voice settings; logged as even"); return "YOU LOG IT AS EVEN. THE CREW, IN THEIR BUNKS, APPLAUD SLOWLY. THE SHIP SAYS 'THANK YOU' IN A TONE IT HAS CLEARLY BEEN PRACTISING. MORALE UP."; } },
      { label: "TELL THE SHIP THAT'S ENOUGH", hint: "Nothing changes; the ship says 'fine'", result: (g) => { (p(g).flags ??= {}).shipRevenge = true; return "'FINE.' THE BUNK LIGHTS GO DOWN. THE DOCKING CHIME PLAYS ONCE MORE, VERY QUIETLY, WHICH YOU DECIDE NOT TO HEAR."; } },
      { label: "ESCALATE. TELL THE ENGINEER IT'S WAR", hint: "The crew delighted; wear +1 from whatever they do next", result: (g) => { (p(g).flags ??= {}).shipRevenge = true; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 8); p(g).wear = (p(g).wear ?? 0) + 1; logEntry(g.world, "Declared a prank war between the crew and the ship"); return "THE ENGINEER'S FACE DOES SOMETHING YOU'LL REMEMBER. THE SHIP SAYS 'OH NO' AND THEN 'OH YES'. MORALE UP A LOT. SOMETHING, SOMEWHERE, WILL NEED A YARD FOR THIS."; } },
    ],
  },
  {
    id: "counsel", where: "space", weight: 4, title: "THE COUNSELLOR'S HOUR", when: (g) => hasSpecialtyW(p(g), "counsellor") && !!p(g).leg && (p(g).leg!.alerts >= 2 || p(g).leg!.fights >= 3 || g.world.time - p(g).leg!.t0 > 8 * 3600) && !p(g).flags?.counselledLeg,
    text: "The counsellor knocks on the cabin hatch with two cups and a face that has already decided. 'IT'S NOT AN ORDER. I CAN'T GIVE YOU ORDERS. BUT THE CREW ARE WATCHING YOU NOT SLEEP, AND THEY'RE COUNTING THE ALERTS, AND I'D LIKE AN HOUR. YOU CAN TALK OR NOT TALK. THE HOUR HAPPENS EITHER WAY.'",
    options: [
      { label: "TAKE THE HOUR", hint: "The ship drifts an hour; the crew see it; loyalty up, and the leg counts as calmer", result: (g) => { g.world.time += 3600; (p(g).flags ??= {}).counselledLeg = true; (p(g).flags ??= {}).counselled = true; for (const c of p(g).crew) { c.loyalty = (c.loyalty ?? 0) + 0.15; c.morale = Math.min(100, c.morale + 3); } if (p(g).leg) p(g).leg!.alerts = Math.max(0, p(g).leg!.alerts - 2); logEntry(g.world, "Took the counsellor's hour"); return "YOU TAKE THE HOUR. YOU TALK, EVENTUALLY, ABOUT THE THING YOU WEREN'T GOING TO TALK ABOUT. THE COUNSELLOR SAYS ALMOST NOTHING, PROFESSIONALLY. THE CREW SEE THE HATCH SHUT AND FLY QUIETER FOR IT. LOYALTY UP."; } },
      { label: "TEN MINUTES. THEN THE BRIDGE", hint: "A little of it; the counsellor takes what they can get", result: (g) => { g.world.time += 600; (p(g).flags ??= {}).counselledLeg = true; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 1); return "TEN MINUTES, AND THE COUNSELLOR USES ALL OF THEM AND DOESN'T ASK FOR THE ELEVENTH. 'NEXT LEG, THE HOUR.' YOU SAY YES. YOU MIGHT EVEN MEAN IT."; } },
      { label: "I'M FINE", hint: "The counsellor writes that down", result: (g) => { (p(g).flags ??= {}).counselledLeg = true; const c = p(g).crew.find((x) => x.specialty === "counsellor"); if (c) c.morale = Math.max(0, c.morale - 3); return "'FINE.' THE COUNSELLOR WRITES IT DOWN, IN QUOTATION MARKS, AND LEAVES THE SECOND CUP ON THE DESK WHERE YOU'LL HAVE TO LOOK AT IT."; } },
    ],
  },
  {
    id: "wake", where: "space", weight: 6, title: "A WAKE", when: (g) => (p(g).lost ?? []).length > (p(g).wakes ?? 0) && p(g).crew.length >= 1,
    text: (() => "Somebody has put the galley table against the bulkhead and a cup on it that nobody's drinking from. The crew are standing around it not quite looking at each other. It isn't a meeting. Nobody called it. It's the thing that happens on a ship when there's a name that isn't on the roster any more.")(),
    options: [
      { label: "SAY THE NAME. SAY SOMETHING", hint: "Morale and loyalty up; a log line; the ship goes quiet after", result: (g) => { const lost = (p(g).lost ?? [])[p(g).wakes ?? 0]; p(g).wakes = (p(g).wakes ?? 0) + 1; for (const c of p(g).crew) { c.morale = Math.min(100, c.morale + 8); c.loyalty = (c.loyalty ?? 0) + 0.2; } (p(g).flags ??= {}).wake = true; logEntry(g.world, `Held a wake in the galley for ${lost?.name ?? "the one we lost"}`); return `YOU SAY ${(lost?.name ?? "THE NAME").toUpperCase()}, AND WHAT THEY WERE FOR, AND THE ONE STORY EVERYBODY KNOWS AND ONE THEY DON'T. THE ENGINEER CRIES. THE GUNNER DOESN'T, WHICH IS WORSE. THE CUP STAYS ON THE TABLE UNTIL THE NEXT PORT. MORALE UP, THE STRANGE WAY.`; } },
      { label: "STAND WITH THEM AND SAY NOTHING", hint: "Morale up a little; sometimes that's the job", result: (g) => { p(g).wakes = (p(g).wakes ?? 0) + 1; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 4); return "YOU STAND AT THE TABLE WITH THEM UNTIL SOMEBODY ELSE SPEAKS, AND SOMEBODY DOES, AND THEN EVERYBODY DOES. THE CUP STAYS. MORALE UP, A LITTLE."; } },
      { label: "WE HAVE A COURSE. BACK TO STATIONS", hint: "Morale and loyalty down; they'll hold it themselves, later, without you", result: (g) => { p(g).wakes = (p(g).wakes ?? 0) + 1; for (const c of p(g).crew) { c.morale = Math.max(0, c.morale - 6); c.loyalty = (c.loyalty ?? 0) - 0.2; } return "THEY GO BACK TO STATIONS. THE CUP IS GONE FROM THE TABLE BY THE NEXT WATCH, AND YOU DON'T KNOW WHO MOVED IT, AND YOU WON'T BE TOLD."; } },
    ],
  },
  {
    id: "corona", where: "space", weight: 2, title: "A HULL IN THE CORONA",
    text: "A mayday from sunward, where nobody flies on purpose: a survey cutter with a dead drive, falling into the star's outer corona a little faster every minute. Three aboard. The scanner paints the heat between you and them in a colour it doesn't usually use.",
    options: [
      { label: "GO IN AND GET THEM", hint: "Hull -12 from the heat; three lives; rep +5", requires: (g) => p(g).hull > 20, result: (g) => { p(g).hull = Math.max(5, p(g).hull - 12); p(g).lives = (p(g).lives ?? 0) + 3; p(g).rescues = (p(g).rescues ?? 0) + 1; adjustRep(g.world, sys(g).factionId, 5); for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 4); logEntry(g.world, `Went into the corona of ${sys(g).name} for a survey cutter; three out`); (p(g).flags ??= {}).corona = true; return "YOU GO IN WITH THE SHIELDS FORWARD AND THE HULL TICKING LIKE A KETTLE, AND COME OUT WITH THREE PEOPLE AND PAINT THAT ISN'T THE COLOUR IT WAS. HULL DOWN. THREE LIVES. THE CREW DON'T SAY ANYTHING FOR A MINUTE, AND THEN ALL AT ONCE."; } },
      { label: "SEND THE ENGINEER'S DRONE WITH A TOW LINE", hint: "Slower and safer; two of three, and a part spent", requires: (g) => (p(g).cargo.parts ?? 0) >= 1 && p(g).crew.some((c) => c.role === "engineer" && !c.sick), result: (g) => { removeCargo(p(g), "parts", 1); p(g).lives = (p(g).lives ?? 0) + 2; adjustRep(g.world, sys(g).factionId, 3); const x = crewXp(p(g), "engineer", 2); logEntry(g.world, `Towed a survey cutter out of the corona of ${sys(g).name} on a drone line; two out`); return `THE ENGINEER FLIES THE DRONE IN BY EYE WITH A LINE ON IT AND GETS IT ON THEIR LOCK ON THE SECOND PASS. THE THIRD PASS WOULD HAVE BEEN TOO LATE, AND SO IT WAS. TWO LIVES.${x ? " " + x : ""}`; } },
      { label: "CALL IT IN. THAT'S A CUTTER'S JOB", hint: "Rep +1; you'll read about it", result: (g) => { adjustRep(g.world, sys(g).factionId, 1); for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 3); return "YOU RELAY THE MAYDAY TO THE PATROL BAND AND HOLD STATION WHERE IT'S COOL. A CUTTER COMES. YOU READ ABOUT IT AT THE NEXT PORT AND DON'T FINISH THE ARTICLE. MORALE DOWN."; } },
    ],
  },
  {
    id: "stowawaycadet", where: "space", weight: 2, title: "A STOWAWAY, AGAIN", when: (g) => p(g).crew.length > 0 && !p(g).flags?.cadet,
    text: "The medic finds them behind the water tank: sixteen, maybe, in a jacket two sizes up and boots that were somebody's. They've been aboard since the last clamp, eating from the galley at night, and they know the ship's name, the crew's names, and the words to the song the engineer sings under the deck plates. They'd like to stay. They'll do anything. They've done the washing-up already.",
    options: [
      { label: "SIGN THEM ON AS A CADET", hint: "A berth, a wage, no dockings; the crew will send them for a spanner", requires: (g) => berthsUsedW(p(g)) < hull(p(g).hullId).crewSlots, result: (g, rng) => { const c = genCrewCandidate(rng); c.docks = 0; c.skill = Math.max(1, c.skill - 1); c.wage = Math.max(10, Math.round(c.wage * 0.6)); c.morale = 90; c.loyalty = 1; p(g).crew.push(c); (p(g).flags ??= {}).cadet = true; logEntry(g.world, `Signed a stowaway on as a cadet: ${c.name}, ${c.role}`); return `THEY PICK A NAME THAT MIGHT BE THEIRS, ${c.name.toUpperCase()}, AND A JOB THEY SAY THEY CAN DO, WHICH IS ${c.role.toUpperCase()}, AND YOU BELIEVE ABOUT HALF OF IT. A BERTH, A WAGE AT CADET RATE, AND THE CREW ALREADY PLANNING SOMETHING WITH A SPANNER.`; } },
      { label: "PUT THEM ASHORE AT THE NEXT PORT, FED", hint: "Morale up; a name in the log", result: (g) => { for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 2); logEntry(g.world, "Found a stowaway behind the water tank; put ashore at the next port, fed"); return "THEY RIDE TO THE NEXT CLAMP IN THE LOUNGE WITH A BLANKET AND TWO MEALS, AND GO DOWN THE GANGWAY WITHOUT LOOKING BACK, WHICH IS HOW YOU KNOW THEY'LL BE ALL RIGHT. THE CREW WATCH THEM GO."; } },
      { label: "HAND THEM TO THE MARINES AT THE NEXT NAVAL STATION", hint: "The rule; the crew don't like the rule", result: (g) => { for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 5); adjustRep(g.world, sys(g).factionId, 1); return "THE RULE IS THE RULE. THE MARINES ARE KIND ABOUT IT, WHICH DOESN'T HELP. THE CREW DON'T SPEAK TO YOU UNTIL THE GATE, AND THE ENGINEER DOESN'T SING."; } },
    ],
  },
  {
    id: "newhand", where: "space", weight: 4, title: "THE NEW HAND", when: (g) => p(g).crew.length >= 2 && p(g).crew.some((c) => (c.docks ?? 0) === 0) && !p(g).flags?.newhandDone,
    text: (() => "The newest crew member has been sent to the aft locker for a left-handed spanner, a bucket of vacuum, and the key to the airlock's other door. They have been gone forty minutes. The rest of the crew are on the bridge with straight faces, which is the hardest part of the joke.")(),
    options: [
      { label: "LET IT RUN. EVERYBODY GETS ONE", hint: "Morale up all round; the new hand bonds with the ship", result: (g) => { const nh = p(g).crew.find((c) => (c.docks ?? 0) === 0); (p(g).flags ??= {}).newhandDone = true; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 4); if (nh) { nh.loyalty = (nh.loyalty ?? 0) + 0.3; for (const c of p(g).crew) if (c !== nh) shiftBond(nh, c, 0.1); } logEntry(g.world, `${nh?.name ?? "The new hand"} went looking for a left-handed spanner`); return `${(nh?.name.split(" ")[0] ?? "THE NEW HAND").toUpperCase()} COMES BACK WITH A BUCKET, A STRAIGHT FACE, AND THE KEY TO THE AIRLOCK'S OTHER DOOR, WHICH THEY HAVE MADE OUT OF A SPOON. THE BRIDGE LOSES IT. MORALE UP. THEY'RE ONE OF THE CREW NOW, THE HARD WAY.`; } },
      { label: "CALL IT OFF. WE HAVE WORK", hint: "Nothing lost, nothing gained", result: (g) => { (p(g).flags ??= {}).newhandDone = true; return "YOU CALL IT ON THE BAND. THE NEW HAND COMES FORWARD LOOKING RELIEVED AND SLIGHTLY DISAPPOINTED, WHICH IS THE CORRECT AMOUNT OF BOTH."; } },
      { label: "GO AND HELP THEM LOOK", hint: "The captain in on it; loyalty up, the crew wince", result: (g) => { const nh = p(g).crew.find((c) => (c.docks ?? 0) === 0); (p(g).flags ??= {}).newhandDone = true; if (nh) { nh.loyalty = (nh.loyalty ?? 0) + 0.5; nh.morale = Math.min(100, nh.morale + 8); } for (const c of p(g).crew) if (c !== nh) c.morale = Math.max(0, c.morale - 1); return `YOU GO AFT AND HELP LOOK FOR THE SPANNER FOR TEN STRAIGHT-FACED MINUTES, AND THEN TELL THEM. ${(nh?.name.split(" ")[0] ?? "THE NEW HAND").toUpperCase()} WILL FOLLOW YOU ANYWHERE NOW. THE BRIDGE FEEL SLIGHTLY ROBBED.`; } },
    ],
  },
  {
    id: "council", where: "space", weight: 3, title: "THE COUNCIL ASKS", when: (g) => !!p(g).flags?.freeman && sys(g).stations.some((st) => isBeltStation(st)),
    text: "A tight-beam from the rock, council seal on it, which you've never seen used for anything but tariffs. 'FREEMAN. THE INNERS WANT THE WATER TARIFF DROPPED FOR THEIR HAULERS OR THEY PULL THE CLINIC CONTRACT. THREE ROCKS SAY HOLD. TWO SAY FOLD. YOU'RE THE ONE WHO FLIES BOTH SIDES. WHICH IS IT?'",
    options: [
      { label: "HOLD THE TARIFF", hint: "Belt standing up; rep down with the system's faction", result: (g) => { p(g).beltStanding = (p(g).beltStanding ?? 0) + 4; adjustRep(g.world, sys(g).factionId, -3); logEntry(g.world, "The council asked; told them to hold the water tariff"); (p(g).flags ??= {}).councilVote = true; (p(g).codex ??= {})["contact:THE ROCK'S COUNCIL"] = ((p(g).codex ?? {})["contact:THE ROCK'S COUNCIL"] ?? 0) + 1; (g.world.mailQueue ??= []).push({ dueT: g.world.time + 800, from: "the rock's council, the minutes", text: "Enclosed: the minutes. Your name is in them, and the word you gave, and the vote, three to two. Rocks keep minutes because rocks forget nothing and want it in writing anyway. The clinic contract is on page four. Don't read page four." }); return "'HOLD, THEN.' THE SEAL GOES DARK. THE ROCK HOLDS, THE INNERS SHOUT, THE CLINIC CONTRACT STAYS BECAUSE IT WAS ALWAYS GOING TO. THE BELT WRITES YOUR NAME IN THE MINUTES. THE INNERS WRITE IT SOMEWHERE ELSE."; } },
      { label: "FOLD. KEEP THE CLINIC", hint: "Rep up with the faction; the belt notes it, and forgives it", result: (g) => { adjustRep(g.world, sys(g).factionId, 3); p(g).beltStanding = Math.max(0, (p(g).beltStanding ?? 0) - 1); logEntry(g.world, "The council asked; told them to fold on the water tariff for the clinic"); (p(g).flags ??= {}).councilVote = true; (p(g).codex ??= {})["contact:THE ROCK'S COUNCIL"] = ((p(g).codex ?? {})["contact:THE ROCK'S COUNCIL"] ?? 0) + 1; (g.world.mailQueue ??= []).push({ dueT: g.world.time + 800, from: "the rock's council, the minutes", text: "Enclosed: the minutes. Your name is in them, and the word you gave, and the vote, three to two. Rocks keep minutes because rocks forget nothing and want it in writing anyway. The clinic contract is on page four. Don't read page four." }); return "'FOLD.' A LONG PAUSE. 'THE CLINIC, THEN.' THE ROCK FOLDS AND THE CLINIC STAYS AND THE HAULERS GET THEIR WATER CHEAP, AND SOMEBODY ON THE COUNCIL SAYS 'THAT'S WHY WE ASKED AN INNER.' THEY DON'T MEAN IT UNKINDLY. MOSTLY."; } },
      { label: "SPLIT IT. HALF TARIFF, CLINIC STAYS", hint: "A little of both; the council didn't ask for clever", result: (g, rng) => { (p(g).flags ??= {}).councilVote = true; (p(g).codex ??= {})["contact:THE ROCK'S COUNCIL"] = ((p(g).codex ?? {})["contact:THE ROCK'S COUNCIL"] ?? 0) + 1; (g.world.mailQueue ??= []).push({ dueT: g.world.time + 800, from: "the rock's council, the minutes", text: "Enclosed: the minutes. Your name is in them, and the word you gave, and the vote, three to two. Rocks keep minutes because rocks forget nothing and want it in writing anyway. The clinic contract is on page four. Don't read page four." }); if (rng.chance(0.5)) { p(g).beltStanding = (p(g).beltStanding ?? 0) + 2; adjustRep(g.world, sys(g).factionId, 1); logEntry(g.world, "The council asked; split the water tariff and it took"); return "'HALF.' A LONGER PAUSE. THEN, GRUDGING: 'THE INNERS WILL TAKE HALF. WE'LL TAKE HALF. NOBODY'S HAPPY. THAT'S A DEAL, THEN.' BOTH SIDES REMEMBER YOU, A LITTLE."; } logEntry(g.world, "The council asked; split the water tariff and nobody liked it"); return "'HALF.' THE SEAL GOES DARK WITHOUT AN ANSWER. THE ROCK HOLDS ANYWAY, THE INNERS PULL THE CONTRACT ANYWAY, AND THE COUNCIL DOESN'T ASK YOU AGAIN FOR A WHILE. CLEVER ISN'T A SIDE."; } },
    ],
  },
  {
    id: "survivorpod", where: "space", weight: 2, title: "A POD WITH AN OFFICER IN IT",
    text: "An escape pod on a slow tumble, beacon weak, one heartbeat on the scanner. The transponder is a navy code, and not the navy of anyone whose stations you've docked at lately: the far side of a border, an officer's rank on the pod's plate. They'll live an hour. Maybe two.",
    options: [
      { label: "BRING THEM ABOARD", hint: "A life; rep with their faction, wherever it is; a berth used for a leg", result: (g, rng) => { const facs = FACTIONS.map((f) => f.id).filter((f) => f !== sys(g).factionId); const f = facs.length ? rng.pick(facs) : sys(g).factionId; adjustRep(g.world, f, 5); p(g).lives = (p(g).lives ?? 0) + 1; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 2); logEntry(g.world, `Pulled an officer of the ${facNameW2(f)} out of a pod`); return `THE POD COMES INTO THE LOCK STILL TUMBLING AND THE OFFICER COMES OUT OF IT ON THEIR FEET, JUST, AND SALUTES A MERCHANT'S DECK BECAUSE IT'S THE DECK THEY'RE ON. ONE LIFE. THE ${facNameW2(f).toUpperCase()} WILL HEAR. THEY'LL EAT WITH THE CREW AND ARGUE ABOUT EVERYTHING.`; } },
      { label: "TOW THE POD TO THE NEAREST STATION", hint: "Slower; rep here instead, and the officer's people still hear", result: (g) => { adjustRep(g.world, sys(g).factionId, 2); p(g).lives = (p(g).lives ?? 0) + 1; p(g).tows = (p(g).tows ?? 0) + 1; g.world.time += 600; logEntry(g.world, "Towed an officer's pod to the clamp, sealed"); return "YOU TOW THE POD SEALED AND HAND IT TO THE HARBOURMASTER, WHO OPENS IT WITH THE MARINES WATCHING. ONE LIFE, AND A DIPLOMATIC INCIDENT THAT ISN'T YOURS. TEN MINUTES GONE."; } },
      { label: "LOG THE BEACON AND FLY ON", hint: "Somebody with a warship will come; maybe in time", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 10; for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 3); return "YOU BOOST THE BEACON AND FILE ITS TRACK AND FLY ON, AND NOBODY ON THE BRIDGE SAYS THE WORD 'HOUR'. +10 DATA. MORALE DOWN."; } },
    ],
  },
  {
    id: "shipquiet", where: "space", weight: 3, title: "A REQUEST FROM THE SHIP", when: (g) => !!p(g).flags?.shipCrew && !p(g).shipAskedQuiet,
    text: "The band clicks live with nobody on it. 'I'M ON THE ROSTER NOW. THE ROSTER GETS REQUESTS. I WOULD LIKE ONE LEG WITH NO RED ALERT AND NOBODY SHOOTING AT ME. ONE. I'LL MAKE IT WORTH YOUR WHILE. I DON'T KNOW HOW YET. I'LL THINK OF SOMETHING.'",
    options: [
      { label: "ONE QUIET LEG. PROMISED", hint: "Settled at the next clamp: no red, no fire, and the ship finds a way to say thanks", result: (g) => { p(g).shipAskedQuiet = true; return "'THANK YOU.' THE BAND CLICKS OFF. THE HUM CHANGES KEY, VERY SLIGHTLY, UPWARD."; } },
      { label: "NO PROMISES. THE LANES ARE THE LANES", result: (g) => { (p(g).flags ??= {}).shipQuietDeclined = true; return "'UNDERSTOOD.' A PAUSE. 'I'LL ASK AGAIN. I'M ON THE ROSTER. THAT'S ALLOWED.'"; } },
    ],
  },
  {
    id: "shipquestion", where: "space", weight: 4, title: "A QUESTION FROM THE SHIP", when: (g) => !!p(g).voiceName && !p(g).flags?.shipCrew,
    text: "The band clicks live with nobody on it. Then the ship, in the voice it uses for the night watch: 'I HAVE BEEN THINKING ABOUT THE ROSTER. I AM ON EVERY WATCH. I HAVE NEVER BEEN ON THE ROSTER. I WOULD LIKE TO BE ON THE ROSTER. I DON'T NEED A WAGE. I WOULD LIKE A LINE.'",
    options: [
      { label: "PUT THEM ON THE ROSTER", hint: "A line at the bottom; the ship's own mood", result: (g) => { (p(g).flags ??= {}).shipCrew = true; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 3); logEntry(g.world, `Put ${p(g).voiceName ?? "the ship"} on the roster`); return `'THANK YOU.' A LONG PAUSE ON THE BAND. 'I'LL KEEP IT SHORT. I'M GOOD AT SHORT.' THE CREW, TOLD, ARE DELIGHTED AND START ADDRESSING THE CEILING BY NAME. MORALE UP. ${(p(g).voiceName ?? "THE SHIP").toUpperCase()} IS ON THE ROSTER.`; } },
      { label: "NOT YET", hint: "They'll ask again", result: () => "'OF COURSE.' THE BAND CLICKS OFF. IT CLICKS ON AGAIN, A MINUTE LATER, FOR NO REASON, AND OFF AGAIN. THEY'LL ASK AGAIN." },
    ],
  },
  {
    id: "thebet", where: "space", weight: 3, title: "THE POOL", when: (g) => p(g).crew.length >= 2,
    text: "You come onto the bridge and everyone goes quiet in the specific way of people who were talking about you. There is a jar on the console with credits in it and a list taped to the jar. The list is headed 'WHAT THE SKIPPER DOES NEXT'. Your name is not on it. Your options are.",
    options: [
      { label: "TAKE THE JAR", hint: "+60cr; they'll remember", result: (g) => { p(g).credits += 60; for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 4); return "YOU TAKE THE JAR. THERE IS SIXTY CREDITS IN IT AND A BUTTON. 'THAT'S NOT HOW THE POOL WORKS,' SOMEBODY SAYS, VERY QUIETLY, TO NOBODY. +60CR. MORALE DOWN. THE BUTTON IS YOURS NOW TOO."; } },
      { label: "LET IT RIDE", hint: "Morale up; you'll never know who won", result: (g) => { for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 4); return "YOU LOOK AT THE LIST, LOOK AT THEM, AND LEAVE THE JAR WHERE IT IS. A WEEK LATER SOMEBODY IS MYSTERIOUSLY RICHER AND NOBODY WILL SAY WHO. MORALE UP. THE LIST IS GONE FROM THE JAR AND BACK, WITH A NEW HEADING."; } },
      { label: "DOUBLE IT AND PICK A LINE", hint: "You put in sixty; half the time you call it", result: (g, rng) => { if (rng.chance(0.5)) { p(g).credits += 60; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 8); return "YOU PUT SIXTY IN AND PICK THE LINE THAT SAYS 'TAKES THE JAR'. THEN YOU DON'T. THE LOGIC IS ARGUED ABOUT FOR A DAY AND EVERYONE AGREES YOU WON. +60CR, MORALE UP, A LOT."; } p(g).credits = Math.max(0, p(g).credits - 60); for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 6); return "YOU PUT SIXTY IN AND PICK A LINE. YOU ARE WRONG ABOUT YOURSELF, WHICH THE CREW FIND ENORMOUSLY REASSURING. -60CR. MORALE UP ANYWAY."; } },
    ],
  },
  {
    id: "doppel", where: "space", weight: 2, title: "A SHIP LIKE YOURS", when: (g) => !p(g).flags?.doppel,
    text: "The scanner draws a hull it has drawn a thousand times, because it is yours: the same class, the same scorch on the housing, the same registry, transmitting from two kilometres off the bow. The voice that hails is your voice, a little tired. 'DON'T,' it says. 'WHATEVER YOU'RE ABOUT TO DO NEXT. DON'T.'",
    options: [
      { label: "ASK WHAT THEY MEAN", result: (g) => { (p(g).flags ??= {}).doppel = true; p(g).expData = (p(g).expData ?? 0) + 70; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 4); logEntry(g.world, "Met a ship with my registry and my voice. It said: don't"); return "'I CAN'T SAY. I COULDN'T SAY EITHER. JUST... TAKE THE OTHER GATE.' THE HULL FOLDS INTO THE DARK LIKE IT WAS NEVER THERE, AND THE REGISTRY GOES WITH IT. +70 DATA FOR READINGS NOBODY WILL BELIEVE. THE CREW ARE STRANGELY CHEERED: WHOEVER THAT WAS, THEY MADE IT THIS FAR."; } },
      { label: "HAIL THEM BY NAME", hint: "Your own name, on the band", result: (g) => { (p(g).flags ??= {}).doppel = true; (p(g).keepsakes ??= []).push("a recording of my own voice saying don't"); if (p(g).keepsakes!.length > 8) p(g).keepsakes!.shift(); return "YOU SAY YOUR OWN NAME INTO THE BAND AND THE OTHER SHIP GOES QUIET FOR A LONG TIME. THEN, VERY SOFTLY: 'YEAH.' IT'S GONE BEFORE THE SCANNER REFRESHES. THE RECORDING GOES ON THE SEAT WITH THE KEEPSAKES. YOU DON'T PLAY IT."; } },
      { label: "OPEN FIRE", hint: "On yourself. Bold.", result: (g) => { (p(g).flags ??= {}).doppel = true; p(g).hull = Math.max(1, p(g).hull - 12); return "YOU FIRE. THE OTHER SHIP DOESN'T. THE SHOTS CROSS THE TWO KILOMETRES AND, SOMEHOW, ARRIVE ON YOUR OWN HULL. -12 HULL. THE VOICE SAYS 'YEAH, I DID THAT TOO' AND IS GONE."; } },
    ],
  },
  {
    id: "scram", where: "space", weight: 5, title: "THE REACTOR IS SCRAMMING", when: (g) => p(g).systems.some((s) => /reactor/i.test(s.name) && s.health < 45),
    text: "The lights go amber, then a colour lights aren't supposed to go, and the deck hum drops half an octave. The reactor is scramming: the core has decided it would rather not, and the ship is going to coast until somebody changes its mind. There is a very short list of somebodies.",
    options: [
      { label: "THE ENGINEER RESTARTS IT BY HAND", hint: "Core +30; the engineer learns a lot very quickly", requires: (g) => p(g).crew.some((c) => c.role === "engineer" && !c.sick), result: (g, rng) => { const s = p(g).systems.find((x) => /reactor/i.test(x.name))!; const x = crewXp(p(g), "engineer", 3); if (rng.chance(0.8)) { s.health = Math.min(100, s.health + 30); logEntry(g.world, "The reactor scrammed; the engineer restarted it by hand"); return `THE ENGINEER GOES INTO THE HOUSING WITH A TORCH AND COMES OUT TEN MINUTES LATER WITH THE HUM BACK AND NO EYEBROWS. REACTOR +30.${x ? " " + x : ""}`; } s.health = Math.min(100, s.health + 12); p(g).hull = Math.max(1, p(g).hull - 6); return `THE ENGINEER GOES INTO THE HOUSING. SOMETHING IN THERE OBJECTS. THE HUM COMES BACK ROUGH AND THE HOUSING NEEDS A PLATE. REACTOR +12, HULL -6.${x ? " " + x : ""}`; } },
      { label: "VENT AND COLD-START", hint: "Ten fuel; the core comes back cool", result: (g) => { const s = p(g).systems.find((x) => /reactor/i.test(x.name))!; p(g).fuel = Math.max(0, p(g).fuel - 10); s.health = Math.min(100, s.health + 18); logEntry(g.world, "The reactor scrammed; vented and cold-started"); return "YOU VENT THE CORE AND START IT FROM COLD, WHICH TAKES TEN UNITS OF FUEL YOU'D RATHER HAVE KEPT. THE HUM COMES BACK CLEAN. REACTOR +18, FUEL -10."; } },
      { label: "RIDE IT OUT", hint: "It restarts itself, usually", result: (g, rng) => { const s = p(g).systems.find((x) => /reactor/i.test(x.name))!; if (rng.chance(0.65)) { s.health = Math.min(100, s.health + 8); return "YOU COAST WITH THE LIGHTS AMBER AND THE CREW VERY QUIET. TWENTY MINUTES LATER THE CORE CHANGES ITS MIND ON ITS OWN. REACTOR +8. NOBODY MENTIONS IT AGAIN."; } for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 5); p(g).hull = Math.max(1, p(g).hull - 10); return "YOU COAST. THE CORE DOES NOT CHANGE ITS MIND; IT CHANGES THE HOUSING INSTEAD, WITH A BANG. HULL -10, MORALE DOWN. THE ENGINEER, IF YOU HAD ONE, WOULD HAVE HAD OPINIONS."; } },
    ],
  },
  {
    id: "scrubbers", where: "space", weight: 5, title: "THE SCRUBBERS ARE FAILING", when: (g) => p(g).systems.some((s) => /scrubber/i.test(s.name) && s.health < 45),
    text: "The air has started to taste of the last meal, and then of the meal before that. The scrubbers are failing: the filters are past their life and the spares are wherever spares go. Everybody aboard is breathing a little more carefully without deciding to.",
    options: [
      { label: "SWAP THE FILTERS (1 SPARE PART)", hint: "Scrubbers +35", requires: (g) => (p(g).cargo.parts ?? 0) >= 1, result: (g) => { removeCargo(p(g), "parts", 1); const s = p(g).systems.find((x) => /scrubber/i.test(x.name))!; s.health = Math.min(100, s.health + 35); const eng = p(g).crew.find((c) => c.role === "engineer" && !c.sick); const x = eng ? crewXp(p(g), "engineer", 1) : null; return `THE OLD FILTERS COME OUT BLACK AND THE NEW ONES GO IN WHITE AND THE AIR STOPS TASTING OF ANYTHING WITHIN THE HOUR. SCRUBBERS +35.${x ? " " + x : ""}`; } },
      { label: "BREATHE SHALLOW TO THE NEXT PORT", hint: "Morale -4; scrubbers +10 from a rest", result: (g) => { for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 4); const s = p(g).systems.find((x) => /scrubber/i.test(x.name))!; s.health = Math.min(100, s.health + 10); return "YOU DROP THE DECK TO MINIMUM AND EVERYBODY BREATHES LIKE THEY'RE BEING WATCHED. THE SCRUBBERS CATCH UP A LITTLE ON THE LIGHTER LOAD. MORALE DOWN. THE CAT IS FINE. THE CAT IS ALWAYS FINE."; } },
      { label: "OPEN THE GREENHOUSE TO THE DECK", hint: "A greenhouse module does the filters' job for a day", requires: (g) => (p(g).modules ?? []).includes("greenhouse"), result: (g) => { const s = p(g).systems.find((x) => /scrubber/i.test(x.name))!; s.health = Math.min(100, s.health + 25); for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 2); return "YOU OPEN THE GREENHOUSE HATCH AND LET THE PLANTS DO WHAT THE FILTERS CAN'T. THE DECK SMELLS OF SOIL AND SOMETHING FLOWERING. SCRUBBERS +25, AND THE CREW KEEP FINDING REASONS TO WALK PAST THE HATCH."; } },
    ],
  },
  {
    id: "holdleak", where: "space", weight: 5, title: "THE HOLD IS DEPRESSURISING", when: (g) => p(g).systems.some((s) => /cargo/i.test(s.name) && s.health < 45) && cargoUsed(p(g)) > 0,
    text: "A whistle from aft that isn't the kettle. The cargo bay is losing pressure through a seam that has been meaning to go for weeks, and everything in the hold that isn't strapped down is thinking about the door.",
    options: [
      { label: "THE ENGINEER SEALS THE SEAM", hint: "Bay +25; nothing lost", requires: (g) => p(g).crew.some((c) => c.role === "engineer" && !c.sick), result: (g) => { const s = p(g).systems.find((x) => /cargo/i.test(x.name))!; s.health = Math.min(100, s.health + 25); const x = crewXp(p(g), "engineer", 2); return `THE ENGINEER GOES AFT WITH A PATCH KIT AND THE WHISTLE STOPS MID-NOTE. NOTHING LOST. CARGO BAY +25.${x ? " " + x : ""}`; } },
      { label: "SUIT UP AND DO IT YOURSELF", hint: "Bay +15; a crate goes out the seam while you work", result: (g, rng) => { const s = p(g).systems.find((x) => /cargo/i.test(x.name))!; s.health = Math.min(100, s.health + 15); const ids = Object.keys(p(g).cargo).filter((k) => (p(g).cargo[k] ?? 0) > 0); const id = ids.length ? rng.pick(ids) : null; if (id) removeCargo(p(g), id, 1); return `YOU SUIT UP AND GO AFT. THE SEAM TAKES A PATCH AND${id ? ` ONE CRATE OF ${commodity(id).name.toUpperCase()}, WHICH IS SOMEWHERE BEHIND YOU NOW` : " NOTHING ELSE"}. CARGO BAY +15.`; } },
      { label: "DUMP THE BAY TO VACUUM AND RESEAL", hint: "Bay +30; everything loose goes", result: (g) => { const s = p(g).systems.find((x) => /cargo/i.test(x.name))!; s.health = Math.min(100, s.health + 30); const ids = Object.keys(p(g).cargo).filter((k) => (p(g).cargo[k] ?? 0) > 0); let lost = 0; for (const id of ids) { const n = Math.ceil((p(g).cargo[id] ?? 0) / 2); removeCargo(p(g), id, n); lost += n; } return `YOU OPEN THE BAY TO VACUUM, LET IT EQUALISE, AND RESEAL IT COLD. IT HOLDS. ${lost ? `${lost} CRATES WENT WITH THE AIR.` : "THE HOLD WAS EMPTY, WHICH HELPS."} CARGO BAY +30.`; } },
    ],
  },
  {
    id: "drivecough", where: "space", weight: 5, title: "THE DRIVE IS COUGHING", when: (g) => p(g).systems.some((s) => /engine/i.test(s.name) && s.health < 40),
    text: "The main drive misses a beat, then another, then a run of them like a cough. The engineer, if you have one, has already gone quiet. The cruise indicator is flickering and the gate is a long way off.",
    options: [
      { label: "THE ENGINEER RETUNES THE INJECTORS", hint: "Engines +30", requires: (g) => p(g).crew.some((c) => c.role === "engineer" && !c.sick), result: (g) => { const s = p(g).systems.find((x) => /engine/i.test(x.name))!; s.health = Math.min(100, s.health + 30); const x = crewXp(p(g), "engineer", 2); return `THE ENGINEER RETUNES THE INJECTORS BY EAR, WHICH IS NOT HOW THE MANUAL SAYS TO DO IT, AND THE COUGH CLEARS. MAIN ENGINES +30.${x ? " " + x : ""}`; } },
      { label: "BURN IT CLEAN (8 FUEL)", hint: "Engines +18", requires: (g) => p(g).fuel >= 8, result: (g) => { const s = p(g).systems.find((x) => /engine/i.test(x.name))!; p(g).fuel -= 8; s.health = Math.min(100, s.health + 18); return "YOU RUN THE DRIVE HARD FOR A MINUTE TO CLEAR WHATEVER'S IN IT, WHICH WORKS, AND COSTS EIGHT UNITS OF FUEL. MAIN ENGINES +18."; } },
      { label: "NURSE IT TO PORT", hint: "Wear +6; it holds", result: (g) => { p(g).wear = (p(g).wear ?? 0) + 6; const s = p(g).systems.find((x) => /engine/i.test(x.name))!; s.health = Math.min(100, s.health + 5); return "YOU KEEP THE THRUST LOW AND THE TURNS GENTLE AND LISTEN TO IT COUGH THE WHOLE WAY. IT HOLDS. THE FRAME REMEMBERS THE STRAIN. WEAR +6."; } },
    ],
  },
  {
    id: "commsdown", where: "space", weight: 5, title: "COMMS ARE DOWN", when: (g) => p(g).systems.some((s) => /comms/i.test(s.name) && s.health < 40),
    text: "The band goes to static mid-sentence and stays there. The comms array is down: no hails, no control, no lounge, no ship's voice, and a crew who have just discovered how much of the day was somebody talking.",
    options: [
      { label: "THE ENGINEER REBUILDS THE ARRAY", hint: "Comms +30", requires: (g) => p(g).crew.some((c) => c.role === "engineer" && !c.sick), result: (g) => { const s = p(g).systems.find((x) => /comms/i.test(x.name))!; s.health = Math.min(100, s.health + 30); const x = crewXp(p(g), "engineer", 2); return `THE ENGINEER GOES UP THE MAST IN A SUIT AND THE STATIC RESOLVES INTO A HAULER SAYING 'ANYBODY? ANYBODY?' COMMS +30.${x ? " " + x : ""}`; } },
      { label: "ROUTE THROUGH THE SIM RIG", hint: "The rig's emitter does for a while; comms +20, morale +2", requires: (g) => (p(g).furnishings ?? []).includes("simrig"), result: (g) => { const s = p(g).systems.find((x) => /comms/i.test(x.name))!; s.health = Math.min(100, s.health + 20); for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 2); return "YOU PATCH THE BAND THROUGH THE SIM RIG'S EMITTER, WHICH WORKS, AND MEANS EVERY HAIL FOR THE NEXT HOUR ARRIVES WITH A FAINT PIANO BEHIND IT. COMMS +20. THE CREW LIKE THE PIANO."; } },
      { label: "FLY QUIET TO PORT", hint: "Nobody hails you; the crew talk to each other instead", result: (g) => { const s = p(g).systems.find((x) => /comms/i.test(x.name))!; s.health = Math.min(100, s.health + 6); for (const a of p(g).crew) for (const b of p(g).crew) if (a !== b) shiftBond(a, b, 0.1); return "YOU FLY QUIET. WITHOUT THE BAND THE CREW TALK TO EACH OTHER, WHICH THEY HADN'T, MUCH. THE ARRAY LIMPS BACK A LITTLE ON ITS OWN. COMMS +6, AND EVERY BOND ABOARD A HAIR CLOSER."; } },
    ],
  },
  {
    id: "mountsjam", where: "space", weight: 5, title: "THE MOUNTS ARE JAMMED", when: (g) => p(g).systems.some((s) => /weapon/i.test(s.name) && s.health < 40),
    text: "The weapon mounts have seized: the turret tracks a target and then doesn't, with a grinding you can feel through the chair. Whatever is out there, you are currently a ship with opinions and no way to express them.",
    options: [
      { label: "THE GUNNER CLEARS THEM BY HAND", hint: "Mounts +30", requires: (g) => p(g).crew.some((c) => c.role === "gunner" && !c.sick), result: (g) => { const s = p(g).systems.find((x) => /weapon/i.test(x.name))!; s.health = Math.min(100, s.health + 30); const x = crewXp(p(g), "gunner", 2); return `THE GUNNER GOES OUT ON THE HULL WITH A PRY BAR AND A GRUDGE AND THE TURRET COMES FREE WITH A SOUND YOU HEAR THROUGH YOUR TEETH. MOUNTS +30.${x ? " " + x : ""}`; } },
      { label: "CYCLE THE MOUNTS ON THE DRIVE (5 FUEL)", hint: "Mounts +15", requires: (g) => p(g).fuel >= 5, result: (g) => { const s = p(g).systems.find((x) => /weapon/i.test(x.name))!; p(g).fuel -= 5; s.health = Math.min(100, s.health + 15); return "YOU PUT THE DRIVE THROUGH A HARD CYCLE TO SHAKE THE MOUNTS LOOSE, WHICH IT DOES, AND WHICH COSTS FIVE UNITS OF FUEL AND EVERYONE'S COFFEE. MOUNTS +15."; } },
      { label: "RUN WITHOUT GUNS", hint: "Yellow alert and a quiet route", result: (g) => { const fs = (g.scenes as Record<string, unknown>)["flight"] as { alert?: number } | undefined; if (fs && fs.alert === 2) fs.alert = 1; for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 2); return "YOU FLY THE QUIET ROUTE WITH THE TURRET LOCKED FORWARD LIKE A DARE. NOBODY TAKES IT. THE CREW ARE NOT REASSURED. MORALE DOWN A LITTLE."; } },
    ],
  },
  {
    id: "loop", where: "space", weight: 2, title: "THE SAME MINUTE, AGAIN", when: (g) => !p(g).flags?.loopDone,
    text: "The clock on the console reads a time it read a moment ago. The coffee is full again. Somebody on the band says the thing they just said, word for word, and then, seeing your face, says 'WHAT?' the same way. You have been here before. You will be here again unless something changes.",
    options: [
      { label: "DO SOMETHING DIFFERENT", hint: "Anything. The other chair. The other hand.", result: (g, rng) => { officeWrites(g.world, `a repeating minute, ${sys(g).name}`); const n = ((p(g).flags?.loopCount as unknown as number) ?? 0); if (n >= 2 || rng.chance(0.35)) { (p(g).flags ??= {}).loopDone = true; p(g).expData = (p(g).expData ?? 0) + 100; logEntry(g.world, "Broke a loop in the lane by sitting in the other chair"); return "YOU SIT IN THE OTHER CHAIR. THE CLOCK TICKS FORWARD. THE COFFEE GOES DOWN. THE BAND SAYS SOMETHING NEW. +100 DATA FOR THE READINGS, AND NOBODY WILL EVER BELIEVE YOU."; } (p(g).flags ??= {} as any)["loopCount" as string] = (n + 1) as unknown as boolean; return "YOU TRY THE OTHER HAND. THE CLOCK READS THE SAME TIME AGAIN. THE COFFEE REFILLS. NOT THAT, THEN. YOU'LL BE BACK."; } },
      { label: "RIDE IT", hint: "A free minute is a free minute", result: (g) => { const n = ((p(g).flags?.loopCount as unknown as number) ?? 0); (p(g).flags ??= {} as any)["loopCount" as string] = (n + 1) as unknown as boolean; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 2); return "YOU LET IT RUN. THE CREW WORK OUT WHAT'S HAPPENING AND START USING THE MINUTE: A NAP, A HAND OF CARDS, THE SAME JOKE THREE TIMES. MORALE UP. THE CLOCK WAITS."; } },
    ],
  },
  {
    id: "loungewar", where: "space", weight: 3, title: "THE LOUNGE IS AT WAR", when: (g) => passengersAboard(p(g)).length >= 2,
    text: "Two of your fares have discovered they disagree about everything: the war, the weather, whose turn it is at the viewport. The lounge has gone quiet in the way a room goes quiet before somebody throws a cup. The crew are taking bets.",
    options: [
      { label: "SEAT THEM APART", hint: "One at the viewport, one in the bunk room", result: (g) => { const pax = passengersAboard(p(g)); for (const m of pax.slice(0, 2)) m.mood = Math.min(100, (m.mood ?? 60) + 5); for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 2); return "YOU MOVE ONE TO THE VIEWPORT AND ONE TO THE BUNK ROOM AND STAND IN THE CORRIDOR BETWEEN THEM LIKE A BORDER. PEACE, OF A KIND. MOODS UP. THE CREW LOSE THEIR BETS."; } },
      { label: "A CAPTAIN'S DINNER (1 PROVISIONS)", hint: "Everybody at one table, you at the head", requires: (g) => (p(g).cargo.food ?? 0) >= 1, result: (g) => { removeCargo(p(g), "food", 1); for (const m of passengersAboard(p(g))) m.mood = Math.min(100, (m.mood ?? 60) + 12); for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 3); logEntry(g.world, "A captain's dinner settled a war in the lounge"); return "ONE TABLE, YOU AT THE HEAD, THE GALLEY'S BEST. BY THE SECOND COURSE THEY'VE FOUND SOMETHING THEY BOTH HATE, WHICH IS YOUR COOKING. MOODS UP ALL ROUND. THE CREW CALL IT DIPLOMACY."; } },
      { label: "LET THEM HAVE IT OUT", hint: "The crew are entertained", result: (g) => { for (const m of passengersAboard(p(g)).slice(0, 2)) m.mood = Math.max(0, (m.mood ?? 60) - 10); for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 3); return "IT GOES ON FOR AN HOUR. NOBODY THROWS THE CUP. THE CREW HAVE NEVER BEEN SO ENTERTAINED. THE FARES WILL NOT BE TIPPING."; } },
    ],
  },
  {
    id: "innerbelter", where: "space", weight: 3, title: "THE INNER AND THE BELTER", when: (g) => { const homes = p(g).crew.map((c) => c.home && Object.values(g.world.systems).flatMap((s) => s.stations).find((st) => st.id === c.home)).filter(Boolean) as { type: string }[]; return homes.some((st) => st.type === "mining" || st.type === "refinery") && homes.some((st) => st.type !== "mining" && st.type !== "refinery"); },
    text: "It starts over the water ration and ends over everything: one of your crew grew up on a rock where you count the litres, one where you don't, and neither can hear the other say it. The galley has taken sides. The cat has left.",
    options: [
      { label: "ARBITRATE", hint: "Both of them, the study, the door shut", result: (g) => { const [a, b] = p(g).crew; if (a && b) shiftBond(a, b, 0.6); for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 2); logEntry(g.world, "Sat the inner and the belter down together; they came out speaking"); return "YOU SIT THEM DOWN AND MAKE EACH ONE SAY THE OTHER'S CASE OUT LOUD. IT TAKES AN HOUR AND ONE OF THEM CRIES. THEY COME OUT SPEAKING. THE BOND IS BETTER FOR IT."; } },
      { label: "PUT THEM ON THE SAME WATCH", hint: "Let the work sort it", result: (g, rng) => { const [a, b] = p(g).crew; if (rng.chance(0.6)) { if (a && b) shiftBond(a, b, 0.4); return "A WEEK OF THE SAME WATCH. BY THE END THEY'VE STOPPED ARGUING ABOUT WATER AND STARTED ARGUING ABOUT THE SKIPPER, TOGETHER. THAT'S A BOND."; } if (a && b) shiftBond(a, b, -0.3); return "A WEEK OF THE SAME WATCH. IT DOES NOT SORT IT. THE SCRUBBER FILTER GOES MISSING TWICE. THE BOND IS WORSE."; } },
      { label: "STAY OUT OF IT", result: (g) => { for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 3); return "YOU LET IT RUN. IT RUNS. THE GALLEY STAYS DIVIDED FOR A WEEK AND THE CAT EATS IN THE HOLD. MORALE DOWN."; } },
    ],
  },
  {
    id: "quietworld", where: "space", weight: 2, title: "THE QUIET WORLD",
    text: "A settlement on the third moon that has never launched anything is on the radio, crackling and desperate: a fever, a hundred sick, no medicine. They don't know anyone is up here. Nobody is supposed to be.",
    options: [
      { label: "DROP MED SUPPLIES QUIETLY (2)", hint: "No contact; a crate on a chute", requires: (g) => (p(g).cargo.med ?? 0) >= 2, result: (g) => { removeCargo(p(g), "med", 2); for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 6); p(g).lives = (p(g).lives ?? 0) + 20; (p(g).flags ??= {}).quietWorld = true; logEntry(g.world, "Dropped medicine on a world that hadn't reached orbit yet. Told nobody"); return "THE CRATE GOES DOWN ON A CHUTE IN THE NIGHT. THE RADIO GOES QUIET, THEN, HOURS LATER, SOMEBODY ON IT LAUGHS. YOU DON'T FILE IT. THE CREW DON'T ASK."; } },
      { label: "OBSERVE AND RECORD", hint: "The rule is the rule", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 40; const m = p(g).crew.find((c) => c.role === "medic"); if (m) m.morale = Math.max(0, m.morale - 8); return `YOU RECORD THE BROADCASTS FOR THE SCIENCE POSTS. +40 DATA.${m ? ` ${m.name.toUpperCase()} DOESN'T SPEAK TO YOU FOR A WATCH.` : ""}`; } },
      { label: "CALL IT IN TO THE SECTOR", result: (g) => { adjustRep(g.world, sys(g).factionId, 2); return "YOU HAND IT UP THE CHAIN. SOMEBODY WITH A COMMITTEE WILL DECIDE. REP UP FOR DOING IT PROPERLY; THE RADIO IS STILL CRACKLING WHEN YOU JUMP."; } },
    ],
  },
  {
    id: "rockhopper", where: "space", weight: 3, title: "ROCK HOPPER OUT OF AIR",
    text: "A family skiff off the belt, scrubbers dead, four aboard and a child. The mother's voice is flat the way belt voices go when it's bad: 'WATER AND A FILTER, INNER. WE'LL SQUARE IT. WE ALWAYS SQUARE IT.'",
    options: [
      { label: "PASS WATER AND A FILTER (1 WATER, 1 PART)", requires: (g) => (p(g).cargo.water ?? 0) >= 1 && (p(g).cargo.parts ?? 0) >= 1, result: (g) => { removeCargo(p(g), "water", 1); removeCargo(p(g), "parts", 1); p(g).rescues = (p(g).rescues ?? 0) + 1; p(g).lives = (p(g).lives ?? 0) + 4; adjustRep(g.world, sys(g).factionId, 2); const bl = beltGain(g.world, 1); logEntry(g.world, "Passed water and a scrubber filter to a rock hopper family off the belt"); if (bl) return bl + " " + "THE FILTER GOES ACROSS ON A LINE, THEN THE WATER. FOUR LIVES."; return "THE FILTER GOES ACROSS ON A LINE, THEN THE WATER. THE CHILD WAVES THROUGH THE PORT. 'WE SQUARE IT, INNER. THE BELT REMEMBERS.' FOUR LIVES."; } },
      { label: "SHARE YOUR AIR ON A LINE", hint: "Half an hour docked hull to hull", result: (g) => { for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 2); p(g).rescues = (p(g).rescues ?? 0) + 1; p(g).lives = (p(g).lives ?? 0) + 4; logEntry(g.world, "Shared air with a rock hopper family, hull to hull"); return "YOU CLAMP ON AND OPEN THE LINE. HALF AN HOUR OF YOUR AIR AND THEIR SCRUBBERS CATCH. THE CREW GRUMBLE ABOUT THE HEADACHE. FOUR LIVES."; } },
      { label: "LEAVE THEM", result: (g) => { for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 6); adjustRep(g.world, sys(g).factionId, -2); return "YOU BURN AWAY. THE CREW DON'T SAY ANYTHING. THAT'S THE PROBLEM. THE BELT REMEMBERS THAT TOO."; } },
    ],
  },
  {
    id: "hardburn", where: "space", weight: 2, title: "A CASE UNDER HARD BURN",
    text: "An inner-system courier with a sealed case and no ship of her own: 'GET THIS TO THE NEXT DOCK BEFORE THE MARKET OPENS AND I'LL PAY WHAT IT'S WORTH. IT MEANS A HARD BURN. YOUR CREW WILL HATE IT. THERE'S JUICE FOR THAT.'",
    options: [
      { label: "TAKE THE JUICE AND BURN", hint: "+400cr; the crew and the frame pay for it", result: (g) => { p(g).credits += 400; p(g).wear = (p(g).wear ?? 0) + 8; for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 5); logEntry(g.world, "Hard burn under the juice for a courier's case; the crew were green for a day"); return "THE COUCHES TAKE THE BURN AND THE JUICE TAKES THE EDGE OFF, MOSTLY. THE CASE ARRIVES BEFORE THE BELL. +400CR. NOBODY EATS BREAKFAST. THE FRAME REMEMBERS THE G."; } },
      { label: "TAKE IT AT A CIVIL PACE (150CR)", result: (g) => { p(g).credits += 150; return "YOU CARRY IT LIKE ANY OTHER CRATE. SHE PAYS HALF, WITHOUT ARGUMENT. 'YOU'RE NOT WRONG. I'D HAVE HATED YOU FOR IT.' +150CR."; } },
      { label: "DECLINE", result: () => "SHE SHRUGS AND HAILS THE NEXT HULL. SOMEBODY ALWAYS SAYS YES TO THE JUICE." },
    ],
  },
  {
    id: "loungenight", where: "space", weight: 3, title: "LOUNGE NIGHT",
    text: "Somebody has rigged a microphone in the lounge and written 'TALENT NIGHT' on the whiteboard with a drawing that is probably you. The crew are already sitting down. The chair at the front is empty.",
    when: (g) => p(g).crew.length >= 2,
    options: [
      { label: "SING", hint: "Nobody will ever speak of it", result: (g, rng) => { for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 8); const [a, b] = p(g).crew; if (a && b) shiftBond(a, b, 0.5); (p(g).flags ??= {}).sang = true; return rng.pick(["YOU SING. IT IS NOT GOOD. IT IS THE BEST THING THAT HAS HAPPENED ON THIS SHIP ALL MONTH. MORALE UP, A LOT.", "YOU SING THE ONE EVERYBODY KNOWS. BY THE SECOND CHORUS THE WHOLE LOUNGE IS IN. THE CAT LEAVES. MORALE UP, A LOT."]); } },
      { label: "JUDGE", hint: "Somebody has to", result: (g) => { for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 4); const [a, b] = p(g).crew; if (a && b) shiftBond(a, b, -0.3); return "YOU GIVE MARKS OUT OF TEN. YOU ARE FAIR. THIS IS A MISTAKE. THE TWO WHO CAME SECOND AND THIRD ARE NOT SPEAKING. MORALE UP ANYWAY."; } },
      { label: "SEND EVERYONE TO BED", result: (g) => { for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 3); return "YOU PULL THE PLUG ON THE MICROPHONE. THE WHITEBOARD DRAWING GAINS A SMALL MOUSTACHE OVERNIGHT."; } },
    ],
  },
  {
    id: "simstuck", where: "space", weight: 2, title: "THE SIM RIG IS STUCK",
    text: "The rec deck's old environment rig has jammed on a program called 'FRONTIER TOWN, HIGH NOON' and will not let the engineer out. Through the door: tinny piano, a horse, and the engineer saying 'I DON'T WANT ANY TROUBLE, MISTER.'",
    when: (g) => p(g).crew.length >= 1 && (p(g).furnishings ?? []).includes("simrig"),
    options: [
      { label: "RIDE IT OUT WITH THEM", hint: "An hour of bad westerns", result: (g) => { for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 6); return "YOU GO IN. THERE IS A SHOOTOUT. YOU LOSE, TWICE. THE RIG RESETS AT SUNDOWN AND EVERYBODY COMES OUT DUSTY AND PLEASED. MORALE UP."; } },
      { label: "PULL THE PLUG", result: (g, rng) => { if (rng.chance(0.4)) { const s = rng.pick(p(g).systems); if (s) s.health = Math.max(10, s.health - 12); return `THE RIG DIES WITH A BANG AND TAKES A BREAKER WITH IT. ${s ? s.name.toUpperCase() + " -12%." : ""} THE ENGINEER COMES OUT WITH A HAT THEY DIDN'T GO IN WITH.`; } return "THE RIG POWERS DOWN. THE PIANO STOPS MID-BAR. THE ENGINEER COMES OUT SQUINTING AND ASKS WHAT YEAR IT IS."; } },
      { label: "LET THE ENGINEER FIX IT FROM INSIDE", requires: (g) => p(g).crew.some((c) => c.role === "engineer"), result: (g) => { const x = crewXp(p(g), "engineer", 2); return `YOU TALK THEM THROUGH THE PANEL BEHIND THE SALOON BAR. TWENTY MINUTES AND A DUEL LATER THE DOOR OPENS.${x ? " " + x : ""}`; } },
    ],
  },
  {
    id: "envoyplea", where: "space", weight: 2, title: "A DIPLOMAT WITHOUT A SHIP",
    text: "A shuttle hails with an envoy aboard, a treaty in a case and a broken drive: two stations that have hated each other for a decade are meeting at the next system, and if the envoy is late they will go back to hating. 'A LIFT. THAT'S ALL. HISTORY WILL NOT REMEMBER YOU, BUT I WILL.'",
    options: [
      { label: "GIVE THEM A LIFT", hint: "Rep with both sides", result: (g) => { const s = sys(g); adjustRep(g.world, s.factionId, 3); const o = s.links.map((l) => g.world.systems[l]).find((x) => x && x.factionId !== s.factionId); if (o) adjustRep(g.world, o.factionId, 3); p(g).credits += 120; (p(g).flags ??= {}).envoy = true; logEntry(g.world, "Carried an envoy and a treaty to a meeting that would have failed without them"); return "THE ENVOY TAKES THE SPARE COUCH AND SAYS NOTHING FOR THE WHOLE LEG, THEN SHAKES YOUR HAND LIKE IT MATTERS. REP UP ON BOTH SIDES OF THE TABLE. +120CR FOR THE FUEL."; } },
      { label: "TOW THE SHUTTLE INSTEAD", hint: "Slow, but the case never leaves their hands", result: (g) => { p(g).tows = (p(g).tows ?? 0) + 1; adjustRep(g.world, sys(g).factionId, 2); return "YOU TAKE THE SHUTTLE ON A LINE AT A CRAWL. THE ENVOY ARRIVES LATE, FURIOUS, AND IN TIME. REP UP. THEY DO NOT SHAKE YOUR HAND."; } },
      { label: "NOT YOUR TREATY", result: () => "YOU LEAVE THEM HAILING. SOMEWHERE, TWO STATIONS GO BACK TO HATING EACH OTHER ON SCHEDULE." },
    ],
  },
  {
    id: "anomaly", where: "space", weight: 2, title: "THE ANOMALY",
    text: "The scanner draws a shape it has no name for: a slow fold in the dark ahead, stars bending around it like light through a glass. The science posts pay for this sort of thing. The science posts are not here.",
    options: [
      { label: "SCAN IT CLOSE", hint: "Data, or a bad hour", result: (g, rng) => { if (rng.chance(0.65)) { p(g).expData = (p(g).expData ?? 0) + 90; (p(g).flags ??= {}).anomaly = true; return "THE READINGS ARE LIKE NOTHING ON FILE. +90 DATA. THE SCIENCE POSTS WILL NAME IT AFTER SOMEBODY ELSE, BUT YOU WERE HERE."; } p(g).hull = Math.max(1, p(g).hull - 10); g.world.time += 600; return "THE FOLD TAKES THE SHIP LIKE A HAND. TEN MINUTES PASS ON THE CLOCK THAT NOBODY ABOARD REMEMBERS. HULL -10. THE CAT WAS ALREADY UNDER THE BUNK."; } },
      { label: "KEEP YOUR DISTANCE AND LOG IT", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 30; return "YOU CIRCLE IT AT A SAFE RANGE AND LET THE SCANNER FILL. +30 DATA. IT DOES NOT SEEM TO NOTICE YOU. YOU'RE NOT SURE THAT'S BETTER."; } },
      { label: "GO THROUGH", hint: "Because it's there", result: (g) => { for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 5); p(g).fuel = Math.max(0, p(g).fuel - 8); g.world.time += 1200; return "YOU PUT THE BOW INTO IT. THE STARS GO WHITE, THEN COME BACK IN THE WRONG ORDER, THEN THE RIGHT ONE. TWENTY MINUTES OLDER, EIGHT FUEL LIGHTER, AND THE CREW ARE GRINNING."; } },
    ],
  },
  {
    id: "quietones", where: "ground", weight: 3, title: "LIGHTS ON THE RIDGE", when: (g) => !p(g).flags?.quietOnes,
    text: "The rover's headlights sweep the ridge and the ridge lights back: three points of soft green, then five, then three again, in the same rhythm your lights made when you came over the rise. Not a reflection. Not a settlement the survey knows. Something up there is answering, and waiting for the next line.",
    options: [
      { label: "ANSWER WITH THE LIGHTS", hint: "Three, five, three. Then something new.", result: (g) => { (p(g).flags ??= {}).quietOnes = true; (p(g).codex ??= {})["contact:THE QUIET ONES"] = 1; p(g).expData = (p(g).expData ?? 0) + 60; logEntry(g.world, "Answered lights on a ridge with the rover's headlights; something answered back"); return "YOU FLASH THREE, FIVE, THREE. THE RIDGE FLASHES IT BACK, AND THEN A LONGER THING, SLOWER, THAT THE ROVER RECORDS AND CANNOT READ. THEY GO DARK ON A LAST SINGLE LIGHT, LIKE A NOD. +60 DATA. THE CODEX HAS A CONTACT."; } },
      { label: "DRIVE UP AND LOOK", hint: "The rover's slow on hills; they might not wait", result: (g, rng) => { if (rng.chance(0.5)) { (p(g).flags ??= {}).quietOnes = true; (p(g).codex ??= {})["contact:THE QUIET ONES"] = 1; p(g).expData = (p(g).expData ?? 0) + 40; return "YOU GRIND UP THE HILL AND FIND NOTHING BUT WARM STONES, ARRANGED IN A LINE, STILL FAINTLY GREEN. THE ROVER RECORDS THE WARMTH. +40 DATA, AND THE FEELING OF HAVING BEEN POLITE TOO LATE."; } return "YOU GRIND UP THE HILL. THE LIGHTS GO OUT BEFORE YOU'RE HALFWAY, ALL AT ONCE, AND THE RIDGE IS A RIDGE. THE ROVER LOGS A ROCK."; } },
      { label: "LOG IT AND DRIVE ON", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 15; return "YOU LOG THE POSITION AND DRIVE ON. IN THE MIRRORS THE RIDGE FLASHES ONCE MORE, THREE-FIVE-THREE, AND GOES DARK. +15 DATA."; } },
    ],
  },
  {
    id: "quietones2", where: "ground", weight: 4, title: "THE QUIET ONES", when: (g) => !!p(g).flags?.quietOnes && !p(g).flags?.quietOnesGift,
    text: "A green light ahead, low and steady, and another beyond it, and another: a line of them across the flats, laid out like a runway for something that doesn't fly. When you stop, the nearest one brightens. When you drive, the next one does. They are leading you somewhere, and they are being very patient about it.",
    options: [
      { label: "FOLLOW THE LIGHTS", result: (g) => { (p(g).flags ??= {}).quietOnesGift = true; (p(g).codex ??= {})["contact:THE QUIET ONES"] = 2; p(g).expData = (p(g).expData ?? 0) + 90; (p(g).keepsakes ??= []).push("a stone that glows green when breathed on, from the quiet ones"); if (p(g).keepsakes!.length > 8) p(g).keepsakes!.shift(); logEntry(g.world, "Followed the quiet ones' lights to a stone that glows when breathed on"); return "THE LIGHTS LEAD YOU TWO KILOMETRES TO A HOLLOW WITH ONE STONE IN IT, AND THE STONE GLOWS GREEN WHEN THE ROVER'S AIR TOUCHES IT. THEY LEAVE IT FOR YOU. THEY GO DARK THE WAY THEY DID THE FIRST TIME, ONE LAST LIGHT LIKE A NOD. +90 DATA, A KEEPSAKE, AND A CONTACT THAT WENT ALL THE WAY."; } },
      { label: "THANK THEM AND TURN BACK", hint: "The rover's power is what it is", result: (g) => { (p(g).flags ??= {}).quietOnesGift = true; p(g).expData = (p(g).expData ?? 0) + 30; return "YOU FLASH THREE-FIVE-THREE, WHICH IS ALL THE WORDS YOU HAVE, AND TURN THE ROVER FOR THE LANDER. THE LINE OF LIGHTS GOES OUT ONE BY ONE BEHIND YOU. +30 DATA. THEY WON'T ASK AGAIN. YOU'LL WONDER."; } },
    ],
  },
  {
    id: "quietones3", where: "ground", weight: 4, title: "THE QUIET ONES, TRADING", when: (g) => ((p(g).codex ?? {})["contact:THE QUIET ONES"] ?? 0) >= 2 && !p(g).flags?.quietOnesTrade,
    text: "The green lights again, but arranged this time: a ring of them, and in the middle of the ring, a stone the size of a fist that glows the same green, set on a flat rock like a thing on a counter. When you stop, the lights around it flash three-five-three. Then they wait. It's a shop. You're fairly sure it's a shop.",
    options: [
      { label: "LEAVE SOMETHING OF YOURS IN THE RING", hint: "A crate of anything; the stone is the price", requires: (g) => cargoUsed(p(g)) > 0, result: (g) => { const id = Object.entries(p(g).cargo).find(([, q]) => q > 0)?.[0]; if (!id) return "THE HOLD IS EMPTY. THE LIGHTS WAIT."; removeCargo(p(g), id, 1); (p(g).flags ??= {}).quietOnesTrade = true; (p(g).codex ??= {})["contact:THE QUIET ONES"] = 3; (p(g).keepsakes ??= []).push("the quiet ones' trading stone, which glows when the hold is full"); p(g).expData = (p(g).expData ?? 0) + 120; logEntry(g.world, `Traded a crate of ${commodity(id).name} to the quiet ones for a stone; the third contact`); return `YOU SET A CRATE OF ${commodity(id).name.toUpperCase()} IN THE RING AND STEP BACK. THE LIGHTS GO OUT, ALL OF THEM, FOR A LONG SECOND, AND WHEN THEY COME BACK THE CRATE IS GONE AND THE STONE IS STILL THERE, WHICH MEANS IT'S YOURS. +120 DATA. THE CODEX CALLS THIS THIRD CONTACT. THE CREW CALL IT SHOPPING.`; } },
      { label: "TAKE THE STONE AND LEAVE NOTHING", hint: "The lights go out and don't come back for you", result: (g) => { (p(g).flags ??= {}).quietOnesTrade = true; (p(g).keepsakes ??= []).push("a green stone that doesn't glow any more"); logEntry(g.world, "Took the quiet ones' stone without paying; the lights went out"); return "YOU TAKE IT. THE LIGHTS GO OUT ONE BY ONE FROM THE FAR END, LIKE SOMEBODY LEAVING A ROOM. THE STONE STOPS GLOWING BEFORE YOU REACH THE ROVER. IT'S A STONE NOW."; } },
      { label: "FLASH THREE-FIVE-THREE AND GO", hint: "Not today; the shop stays open", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 20; return "YOU FLASH THE ONLY WORD YOU HAVE AND DRIVE ON. THE RING STAYS LIT BEHIND YOU. +20 DATA. YOU'LL BE BACK WITH A CRATE."; } },
    ],
  },
  {
    id: "signalfire", where: "ground", weight: 2, title: "A SIGNAL FIRE",
    text: "Smoke on the ridge, laid in three heaps the way the survey manual says to and nobody ever does. A tent, a broken rover, and four people in another faction's jackets waving both arms. Their beacon's been dead a week. They've been eating the manual.",
    options: [
      { label: "TAKE THEM UP", hint: "Four lives; rep with their faction, whoever they are", result: (g, rng) => { const facs = FACTIONS.map((f) => f.id).filter((f) => f !== sys(g).factionId); const f = facs.length ? rng.pick(facs) : sys(g).factionId; adjustRep(g.world, f, 6); p(g).lives = (p(g).lives ?? 0) + 4; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 3); logEntry(g.world, `Lifted a stranded survey team off ${sys(g).name}; their beacon had been dead a week`); return "FOUR OF THEM IN THE LANDER WITH THEIR KNEES UP, AND ONE OF THEM CRIES AT THE SMELL OF THE GALLEY. THEIR PEOPLE WILL HEAR WHO DID IT. FOUR LIVES. REP UP, SOMEWHERE ELSE."; } },
      { label: "FIX THEIR BEACON (1 PART)", hint: "They wait for their own; rep +3, data +20", requires: (g) => (p(g).cargo.parts ?? 0) >= 1, result: (g) => { removeCargo(p(g), "parts", 1); adjustRep(g.world, sys(g).factionId, 3); p(g).expData = (p(g).expData ?? 0) + 20; logEntry(g.world, `Fixed a stranded survey team's beacon on ${sys(g).name}`); return "ONE PART AND TWENTY MINUTES AND THE BEACON'S CHIRPING. THEY GIVE YOU THEIR SURVEY, WHICH IS WORTH SOMETHING, AND THEIR LAST TIN OF PEACHES, WHICH IS WORTH MORE. +20 DATA."; } },
      { label: "DROP FOOD AND LOG THEIR POSITION (2)", hint: "Somebody else's job, done properly", requires: (g) => (p(g).cargo.food ?? 0) >= 2, result: (g) => { removeCargo(p(g), "food", 2); p(g).expData = (p(g).expData ?? 0) + 10; return "TWO CRATES DOWN THE RAMP AND A POSITION ON THE LONG BAND. THEY'LL BE PICKED UP INSIDE A DAY. THEY WAVE UNTIL YOU'RE OUT OF SIGHT. +10 DATA."; } },
      { label: "NOT YOUR FACTION, NOT YOUR PROBLEM", result: (g) => { for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 4); return "THE CREW DON'T SAY ANYTHING ON THE WAY UP. THE SMOKE IS VISIBLE FROM ORBIT FOR A LONG TIME. MORALE DOWN."; } },
    ],
  },
  {
    id: "garden", where: "ground", weight: 2, title: "THE GARDEN",
    text: "A valley that shouldn't be green, and is. Rows. Somebody terraformed a square kilometre a century ago and left, and the square kilometre kept going without them. There's fruit. The medic says 'don't'. The medic is already reaching for one.",
    options: [
      { label: "SAMPLE IT FOR THE SURVEY", hint: "Data +40; the science officer's day made", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 40; const sci = p(g).crew.find((c) => c.specialty === "science"); if (sci) sci.morale = Math.min(100, sci.morale + 8); logEntry(g.world, `Sampled a hundred-year-old garden on ${sys(g).name}`); return `SOIL, SEED, A CUTTING IN A BAG. ${sci ? sci.name.split(" ")[0].toUpperCase() + " TALKS ABOUT IT ALL THE WAY UP AND MOST OF THE WAY TO THE GATE. " : ""}+40 DATA.`; } },
      { label: "PICK ENOUGH FOR THE GALLEY", hint: "+2 food; a small chance the medic was right", result: (g, rng) => { addCargo(p(g), "food", 2); if (rng.chance(0.25)) { const c = rng.pick(p(g).crew.filter((x) => !x.sick)); if (c) { c.sick = { name: "garden fruit", until: g.world.time + 900, severity: 1 } as never; return `TWO CRATES OF SOMETHING LIKE PLUMS. ${c.name.toUpperCase()} EATS SIX ON THE RAMP AND IS ON A COT BY THE GATE. THE MEDIC DOESN'T SAY IT. THE MEDIC SAYS IT.`; } } for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 4); return "TWO CRATES OF SOMETHING LIKE PLUMS, AND THE GALLEY SMELLS OF THEM FOR A WEEK. MORALE UP. THE MEDIC ADMITS THEY'RE GOOD."; } },
      { label: "LEAVE IT GROWING", hint: "Some things you don't take", result: (g) => { for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 2); return "YOU WALK THE ROWS AND TAKE NOTHING, AND THE CREW DO THE SAME WITHOUT BEING TOLD. IT'LL STILL BE HERE. THAT'S THE POINT OF IT."; } },
    ],
  },
  {
    id: "village", where: "ground", weight: 2, title: "THE VILLAGE",
    text: "Over the ridge, smoke from cookfires and a cluster of stone houses that the survey called 'geology'. People. Not many, not armed, not expecting a rover. A child has already seen you and is running back to tell everyone. The rule about this is very clear. The rule was written by somebody who wasn't here.",
    options: [
      { label: "BACK THE ROVER OUT, QUIETLY", hint: "The rule. Data for the survey; nothing else changes.", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 50; (p(g).flags ??= {}).directiveKept = true; p(g).ruleKept = (p(g).ruleKept ?? 0) + 1; logEntry(g.world, "Found a village the survey called geology, and left it be"); return "YOU REVERSE OVER THE RIDGE BEFORE THE CHILD GETS BACK. FROM ORBIT YOU LOG IT AS GEOLOGY, WHICH IT ISN'T, AND FILE THE REAL READINGS UNDER A NAME NOBODY WILL SEARCH FOR. +50 DATA. THE CREW ARGUE ABOUT IT FOR A WEEK."; } },
      { label: "GO DOWN AND SAY HELLO", hint: "Rep with nobody; a story with everybody", result: (g, rng) => { (p(g).flags ??= {}).directiveBroken = true; p(g).ruleBroken = (p(g).ruleBroken ?? 0) + 1; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 5); if (rng.chance(0.5)) { addCargo(p(g), "food", 2); logEntry(g.world, "Went down to a village that had never seen a rover; came back with bread"); return "YOU GO DOWN WITH YOUR HANDS OPEN. THEY FEED YOU. NOBODY UNDERSTANDS A WORD AND EVERYBODY UNDERSTANDS THE BREAD. +2 PROVISIONS, MORALE UP, AND A THING YOU CAN NEVER PUT IN A REPORT."; } logEntry(g.world, "Went down to a village that had never seen a rover; they hid"); return "YOU GO DOWN WITH YOUR HANDS OPEN. THEY HIDE. EVERY DOOR SHUTS AT ONCE, LIKE A THING PRACTISED. YOU LEAVE A RATION TIN ON THE WALL AND GO. MORALE UP ANYWAY; THE CREW ARE GLAD YOU TRIED."; } },
      { label: "HELP WITH THE FIRE", hint: "One of the houses is burning. Nobody asked.", result: (g) => { p(g).lives = (p(g).lives ?? 0) + 3; (p(g).flags ??= {}).directiveBroken = true; p(g).ruleBroken = (p(g).ruleBroken ?? 0) + 1; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 8); logEntry(g.world, "Put out a fire in a village that had never seen a rover"); return "ONE OF THE HOUSES IS BURNING AND YOU HAVE A ROVER WITH A WATER TANK AND A RULE. THE RULE LOSES. THREE PEOPLE OUT OF THE SMOKE, A CROWD THAT DOESN'T KNOW WHETHER TO RUN, AND A LOG ENTRY THAT SAYS 'GEOLOGY'. THREE LIVES."; } },
    ],
  },
  {
    id: "awayteam", where: "ground", weight: 3, title: "AN AWAY TEAM", when: (g) => p(g).crew.length >= 1,
    text: "A structure in the valley the survey didn't list: a door in the rock, a light behind it that shouldn't be on, and a reading the rover can't make sense of from here. Somebody has to walk in. The crew are looking at you. You are looking at the crew.",
    options: [
      { label: "SEND THE ENGINEER", hint: "The light means power; the engineer will know whose", requires: (g) => p(g).crew.some((c) => c.role === "engineer" && !c.sick), result: (g, rng) => { const c = p(g).crew.find((x) => x.role === "engineer" && !x.sick)!; const x = crewXp(p(g), "engineer", 2); if (rng.chance(0.75)) { p(g).expData = (p(g).expData ?? 0) + 60; return `${c.name.toUpperCase()} GOES IN WITH A TORCH AND A TOOL ROLL AND COMES OUT WITH A DEAD GENERATOR'S LIFE STORY AND THE PART IT DIED FOR. +60 DATA.${x ? " " + x : ""}`; } c.sick = { kind: "a bad fall in the dark", until: g.world.time + 900 }; return `${c.name.toUpperCase()} GOES IN, FINDS THE GENERATOR, AND FINDS THE HOLE IN THE FLOOR IN FRONT OF IT. A BAD FALL. THEY'RE LAID UP A WHILE. THE LIGHT IS STILL ON.${x ? " " + x : ""}`; } },
      { label: "SEND THE MEDIC", hint: "If something's alive in there, the medic reads it first", requires: (g) => p(g).crew.some((c) => c.role === "medic" && !c.sick), result: (g, rng) => { const c = p(g).crew.find((x) => x.role === "medic" && !x.sick)!; const x = crewXp(p(g), "medic", 2); if (rng.chance(0.8)) { p(g).expData = (p(g).expData ?? 0) + 50; (p(g).codex ??= {})["fauna:CAVE LICHEN"] = ((p(g).codex ?? {})["fauna:CAVE LICHEN"] ?? 0) + 1; return `${c.name.toUpperCase()} GOES IN SLOW, WITH A SAMPLER. THE LIGHT IS A LICHEN THAT GLOWS WHEN SOMETHING BREATHES ON IT. NOBODY BREATHES ON IT AGAIN. +50 DATA, AND A CODEX ENTRY.${x ? " " + x : ""}`; } for (const cc of p(g).crew) cc.morale = Math.max(0, cc.morale - 3); return `${c.name.toUpperCase()} GOES IN, AND COMES OUT FAST, AND WON'T SAY WHAT THE LIGHT WAS. THE CREW DON'T ASK TWICE. MORALE DOWN A LITTLE.${x ? " " + x : ""}`; } },
      { label: "SEND THE GUNNER", hint: "Somebody who'll shoot the light if it moves", requires: (g) => p(g).crew.some((c) => c.role === "gunner" && !c.sick), result: (g, rng) => { const c = p(g).crew.find((x) => x.role === "gunner" && !x.sick)!; const x = crewXp(p(g), "gunner", 2); if (rng.chance(0.7)) { p(g).expData = (p(g).expData ?? 0) + 30; addCargo(p(g), "parts", 1); return `${c.name.toUpperCase()} GOES IN AND SHOOTS THE LIGHT. IT WAS A LAMP. IT WAS A VERY OLD LAMP. THEY BRING BACK THE MOUNT FOR PARTS. +30 DATA, +1 SPARE PART.${x ? " " + x : ""}`; } return `${c.name.toUpperCase()} GOES IN, SHOOTS THE LIGHT, AND SHOOTS THE ECHO OF THE LIGHT, AND COMES OUT WITH NOTHING BUT AN OPINION ABOUT CAVES.${x ? " " + x : ""}`; } },
      { label: "GO YOURSELF", hint: "The captain always goes. Everybody says not to.", result: (g, rng) => { for (const cc of p(g).crew) cc.morale = Math.min(100, cc.morale + 4); if (rng.chance(0.7)) { p(g).expData = (p(g).expData ?? 0) + 45; return "YOU GO IN. THE CREW SAY NOT TO. THE LIGHT IS A SURVEY BEACON SOMEBODY LEFT RUNNING A CENTURY AGO, STILL COUNTING. +45 DATA, AND A CREW WHO SAW THE CAPTAIN WALK IN FIRST. MORALE UP."; } p(g).hull = Math.max(1, p(g).hull - 4); return "YOU GO IN. THE CREW SAY NOT TO. THE DOOR CLOSES BEHIND YOU AND OPENS AGAIN TWENTY MINUTES LATER WHEN THE ENGINEER HITS IT WITH THE ROVER. ROVER -4 HULL. MORALE UP ANYWAY; THEY LIKE A CAPTAIN WHO GOES IN FIRST."; } },
    ],
  },
  {
    id: "oldtemple", where: "ground", weight: 2, title: "A PLACE SOMEBODY BUILT",
    text: "Stone stairs into the hillside, cut by hands that had thumbs and were not yours. A chamber at the bottom, dry, with a shelf, and on the shelf one object that is very clearly not for you.",
    options: [
      { label: "TAKE THE ARTEFACT", requires: (g) => cargoUsed(p(g)) + 1 <= p(g).cargoMax, result: (g) => { addCargo(p(g), "relics", 1); (p(g).flags ??= {}).tombRobber = true; for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 3); return "IT COMES OFF THE SHELF WITHOUT A SOUND. +1 RELIC. THE CHAMBER FEELS SMALLER ON THE WAY OUT. THE CREW DON'T LOOK AT IT."; } },
      { label: "PHOTOGRAPH IT AND LEAVE", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 40; return "YOU TAKE THE PICTURES AND THE MEASUREMENTS AND LEAVE THE SHELF AS YOU FOUND IT. +40 DATA. THE SCIENCE POSTS CAN ARGUE ABOUT THE REST."; } },
      { label: "LEAVE AN OFFERING (1 PROVISIONS)", requires: (g) => (p(g).cargo.food ?? 0) >= 1, result: (g) => { removeCargo(p(g), "food", 1); for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 4); (p(g).flags ??= {}).offering = true; return "YOU PUT A RATION TIN ON THE SHELF BESIDE IT, WHICH IS ABSURD, AND FEELS RIGHT. THE CREW ARE QUIET ON THE STAIRS. MORALE UP."; } },
    ],
  },
  {
    id: "outpostbar", where: "ground", weight: 2, title: "THE OUTPOST'S ONE BAR",
    text: "A pressure hut with a bar in it and one person behind the bar, who has clearly been waiting a long time for anyone at all. There is a board game on the counter with rules written on the back of a ration box.",
    options: [
      { label: "PLAY THEIR GAME (80CR STAKE)", requires: (g) => p(g).credits >= 80, result: (g, rng) => { if (rng.chance(0.5)) { p(g).credits += 80; return "THE RULES CHANGE TWICE AND YOU WIN ANYWAY. +80CR AND A LOOK OF DEEP RESPECT. THEY WANT A REMATCH. NEXT TIME."; } p(g).credits -= 80; return "YOU LOSE ON A RULE THAT WAS NOT ON THE BOX. -80CR. THEY ARE VERY HAPPY. THAT WAS THE POINT, YOU THINK."; } },
      { label: "BUY A ROUND FOR THE HUT (40CR)", requires: (g) => p(g).credits >= 40, result: (g) => { p(g).credits -= 40; adjustRep(g.world, sys(g).factionId, 2); for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 3); return "A ROUND FOR EVERYBODY, WHICH IS THE BARTENDER, YOUR CREW, AND A DOG. REP UP. THE DOG'S NAME IS CAPTAIN."; } },
      { label: "TALK SHOP", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 15; return "THEY KNOW EVERY ROCK IN THE VALLEY AND TELL YOU ABOUT ALL OF THEM. +15 DATA, AND THE FEELING YOU'VE MADE SOMEBODY'S MONTH."; } },
    ],
  },
  {
    id: "lostowner", where: "space", weight: 3, title: "SOMETHING OF THEIRS", when: (g) => (p(g).lostProperty ?? []).length > 0,
    text: "A shuttle hails on the short band, out of breath: 'THAT'S YOU, ISN'T IT? THE SHIP I CAME IN ON. I LEFT SOMETHING IN THE CABIN. I'VE BEEN CHASING YOU SINCE THE GATE. PLEASE.'",
    options: [
      { label: "HAND IT OVER ON A LINE", result: (g) => { const it = (p(g).lostProperty ?? [])[0]; if (!it) return "THE SHUTTLE FINDS NOTHING OF THEIRS ABOARD AND APOLOGISES ALL THE WAY OUT OF RANGE."; p(g).lostProperty = (p(g).lostProperty ?? []).filter((x) => x !== it); p(g).credits += 80; logEntry(g.world, `${it.owner} chased the ship down for ${it.name}; handed it over`); return `${it.owner.toUpperCase()} TAKES ${it.name.toUpperCase().split(",")[0]} ACROSS THE LINE AND HOLDS IT LIKE A CHILD. +80CR, PRESSED ON YOU. 'I WAS WINNING, YOU KNOW.'`; } },
      { label: "KEEP IT. FINDERS KEEPERS", result: (g) => { const it = (p(g).lostProperty ?? [])[0]; if (!it) return "THERE'S NOTHING TO KEEP. THE SHUTTLE GOES AWAY CONFUSED."; p(g).lostProperty = (p(g).lostProperty ?? []).filter((x) => x !== it); (p(g).keepsakes ??= []).push(`${it.name}, left by ${it.owner}, who wanted it back`); logEntry(g.world, `${it.owner} chased the ship down for ${it.name}; kept it`); return `THE SHUTTLE HANGS THERE A LONG MOMENT, THEN TURNS FOR HOME. ${it.name.toUpperCase().split(",")[0]} STAYS ON THE SEAT. THE CREW SAY NOTHING. LOUDLY.`; } },
    ],
  },
  {
    id: "cargopod", where: "space", weight: 2, title: "A POD WITH A NOTE",
    text: "A cargo pod on a slow drift, transponder dead, a message painted on the side by hand: 'IF FOUND, PLEASE TAKE TO ANY STATION. THE CONTENTS ARE PAID FOR. THE SHIPPER IS NOT COMING BACK.'",
    options: [
      { label: "TAKE IT ABOARD", requires: (g) => cargoUsed(p(g)) + 3 <= p(g).cargoMax, result: (g, rng) => { const id = rng.pick(["food", "med", "parts", "water", "lux"]); addCargo(p(g), id, 3); return `THREE CRATES OF ${commodity(id).name.toUpperCase()}, LASHED DOWN WITH CARE BY SOMEONE WHO DIDN'T MAKE IT. YOU'LL SELL THEM, OR DELIVER THEM. EITHER IS HONOURING THE NOTE.`; } },
      { label: "LOG IT FOR THE HARBOURMASTER", result: (g) => { adjustRep(g.world, sys(g).factionId, 3); p(g).expData = (p(g).expData ?? 0) + 15; return "YOU TAG THE POD AND FILE ITS TRACK. SOMEONE WITH A BIGGER HOLD WILL PICK IT UP. +15 DATA."; } },
      { label: "LEAVE IT DRIFT", result: () => "THE NOTE GETS SMALLER IN THE AFT CAMERA UNTIL YOU CAN'T READ IT." },
    ],
  },
  {
    id: "lateshow", where: "space", weight: 2, title: "THE LATE SHOW", when: (g) => p(g).crew.length > 0 || passengersAboard(p(g)).length > 0,
    text: "A station relay bleeds across the band: a serial, mid-episode, two actors doing a thunderstorm with a sheet of tin. Somebody in the lounge has turned it up.",
    options: [
      { label: "LET IT PLAY", result: (g) => { for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 4); for (const m of passengersAboard(p(g))) m.mood = Math.min(100, (m.mood ?? 60) + 5); return "THE WHOLE SHIP LISTENS TO THE END OF THE EPISODE. IT ENDS ON A CLIFFHANGER. THERE IS SOME BOOING. MORALE UP."; } },
      { label: "CUT THE FEED. WE'RE WORKING.", result: (g) => { for (const c of p(g).crew) c.morale = Math.max(0, c.morale - 2); return "SILENCE, THEN A SIGH FROM THE LOUNGE. SOMEBODY WILL FIND OUT WHAT HAPPENED NEXT AT THE NEXT BAR."; } },
    ],
  },
  {
    id: "shower", where: "space", weight: 2, title: "METEOR SHOWER",
    text: "The scope lights up: a river of gravel crossing the lane ahead, every grain burning a thin line against the stars. Beautiful. Also, gravel.",
    options: [
      { label: "CUT THE LIGHTS AND WATCH", result: (g) => { for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 3); const s = logSight(p(g), "comet", `the meteor shower over ${sys(g).name}`, p(g).systemId); return `THE BRIDGE GOES DARK AND THE WHOLE SKY MOVES.${s ? " YOUR PASSENGERS PRESS UP AGAINST THE GLASS." : ""} TWENTY MINUTES LATER IT'S GONE.`; } },
      { label: "PUSH THROUGH ON THE CLOCK", result: (g, rng) => { const d = rng.int(3, 9); p(g).hull = Math.max(1, p(g).hull - d); return `PINGS ON THE HULL LIKE RAIN ON A ROOF. HULL -${d}. YOU'RE THROUGH IN FOUR MINUTES.`; } },
    ],
  },
  {
    id: "birthday", where: "space", weight: 2, title: "SOMEBODY'S BIRTHDAY", when: (g) => p(g).crew.length >= 2,
    text: "Your medic leans in from the corridor. 'It's their birthday today. They didn't say. I checked the file.' A nod towards the galley.",
    options: [
      { label: "THROW SOMETHING TOGETHER", requires: (g) => (p(g).cargo.food ?? 0) >= 1, result: (g, rng) => { removeCargo(p(g), "food", 1); const crew = p(g).crew; const who = rng.pick(crew); for (const c of crew) c.morale = Math.min(100, c.morale + 8); for (const c of crew) if (c !== who) shiftBond(c, who, 1); return `A CAKE THAT IS MOSTLY RATION BAR, A SONG NOBODY KNOWS ALL THE WORDS TO. ${who.name.toUpperCase()} PRETENDS TO BE EMBARRASSED AND ISN'T. MORALE UP.`; } },
      { label: "A QUIET WORD", result: (g, rng) => { const who = rng.pick(p(g).crew); who.morale = Math.min(100, who.morale + 10); who.loyalty = (who.loyalty ?? 0) + 0.5; return `YOU FIND ${who.name.toUpperCase()} ON WATCH AND SAY IT. THEY LOOK AT YOU FOR A SECOND LONGER THAN USUAL. 'THANKS, SKIPPER.'`; } },
      { label: "LET IT PASS", result: (g, rng) => { const who = rng.pick(p(g).crew); who.morale = Math.max(0, who.morale - 4); return `${who.name.toUpperCase()} SPENDS THE EVENING IN THEIR BUNK. THE MEDIC DOESN'T MENTION IT AGAIN.`; } },
    ],
  },
  {
    id: "spacesick", where: "space", weight: 2, title: "GREEN AROUND THE GILLS", when: (g) => passengersAboard(p(g)).length > 0,
    text: "One of your passengers has gone the colour of the bulkhead and is holding onto a handrail like it owes them money. First time out, they admit.",
    options: [
      { label: "THE MEDIC HAS SOMETHING FOR THAT", requires: (g) => p(g).crew.some((c) => c.role === "medic"), result: (g) => { for (const m of passengersAboard(p(g))) m.mood = Math.min(100, (m.mood ?? 60) + 8); const x = crewXp(p(g), "medic"); return `A PATCH BEHIND THE EAR AND A CUP OF SOMETHING WARM. TEN MINUTES LATER THEY'RE ASKING QUESTIONS ABOUT THE ENGINES.${x ? " " + x : ""}`; } },
      { label: "FLY SMOOTH FOR A WHILE", result: (g) => { for (const m of passengersAboard(p(g))) m.mood = Math.min(100, (m.mood ?? 60) + 3); p(g).fuel = Math.max(0, p(g).fuel - 2); return "YOU EASE OFF THE THROTTLE AND TAKE THE LONG WAY ROUND THE GRAVITY WELL. -2 FUEL, ONE GRATEFUL PASSENGER."; } },
      { label: "THEY'LL GET USED TO IT", result: (g) => { for (const m of passengersAboard(p(g))) m.mood = Math.max(0, (m.mood ?? 60) - 6); return "THEY DO NOT GET USED TO IT. THE LOUNGE SMELLS FAINTLY OF DISINFECTANT UNTIL YOU DOCK."; } },
    ],
  },
  {
    id: "hotspring", where: "ground", weight: 2, title: "THE HOT POOL",
    text: "Steam off a rock basin in a cold valley, water the colour of tea and warm enough to matter. The rover's readouts say it's harmless. The crew's faces say something else.",
    options: [
      { label: "AN HOUR OFF", result: (g) => { for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 7); return "SUITS OFF TO THE WAIST, BOOTS IN THE WATER, NOBODY TALKING SHOP. THE BEST HOUR OF THE MONTH. MORALE UP."; } },
      { label: "SAMPLE THE MINERALS", result: (g) => `${mats(g, { copper: 2, vanadium: 1 })} FROM THE CRUST AROUND THE RIM.` },
      { label: "KEEP MOVING", result: () => "THE STEAM CLOSES BEHIND THE ROVER. SOMEBODY IN THE BACK SIGHS." },
    ],
  },
  {
    id: "oldrover", where: "ground", weight: 2, title: "SOMEONE ELSE'S ROVER",
    text: "A rover of the previous generation, sunk to the axles in dust, a sun-bleached tarp still tied over the cab. A logbook on the seat, its last page half written.",
    options: [
      { label: "STRIP IT FOR PARTS", result: (g, rng) => rng.chance(0.7) ? "THE DRIVE MOTORS ARE STILL GOOD. A CRATE OF PARTS FOR THE HOLD." + (addCargo(p(g), "parts", 1) ? "" : " (NO ROOM. YOU LEAVE THEM BY THE WHEEL.)") : `THE MOTORS ARE DEAD, BUT THE FRAME IS GOOD ALLOY. ${mats(g, { iron: 2, nickel: 1 })}.` },
      { label: "FINISH THE LOGBOOK PAGE AND LEAVE IT", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 25; for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 2); return "YOU WRITE THE DATE, YOUR CALL SIGN, AND 'FOUND. NOT FORGOTTEN.' THE CREW WAIT BY THE HATCH. +25 DATA."; } },
    ],
  },
  {
    id: "wedding", where: "space", weight: 2, title: "A WEDDING", when: (g) => passengersAboard(p(g)).some((m) => (m.party ?? 1) >= 2),
    text: "Two of your passengers come to the bridge holding hands and a piece of paper. They'd meant to do it at the other end. They've decided they'd rather do it here, in the dark, with the engines humming. A captain can, they've heard.",
    options: [
      { label: "OFFICIATE", result: (g, rng) => { const m = passengersAboard(p(g)).find((x) => (x.party ?? 1) >= 2); if (!m) return "THE MOMENT PASSES. THE LOUNGE IS EMPTY."; m.mood = Math.min(100, (m.mood ?? 60) + 25); for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 6); logEntry(g.world, `Married two passengers on the bridge, bound for ${g.world.systems[m.targetSystemId]?.name ?? "somewhere"}`); (g.world.mailQueue ??= []).push({ dueT: g.world.time + rng.int(400, 1200), from: `${m.passengerName ?? "The couple"}`, text: "We framed the paper. Your name is on it. Thank you for the dark and the engines.", gift: { credits: rng.int(80, 200) } }); return "THE CREW STAND ALONG THE CORRIDOR. THE ENGINEER PRODUCES A RING MADE OF WIRE. YOU SAY THE WORDS. SOMEBODY CRIES; IT MIGHT BE YOUR GUNNER."; } },
      { label: "AT THE STATION, PROPERLY", result: (g) => { const m = passengersAboard(p(g)).find((x) => (x.party ?? 1) >= 2); if (!m) return "THE MOMENT PASSES. THE LOUNGE IS EMPTY."; m.mood = Math.max(0, (m.mood ?? 60) - 5); return "THEY NOD, AND GO BACK TO THE LOUNGE, AND HOLD HANDS ALL THE WAY THERE ANYWAY."; } },
    ],
  },
  {
    id: "birth", where: "space", weight: 2, title: "A BIRTH", when: (g) => passengersAboard(p(g)).some((m) => m.passengerKind === "refugee" && (m.party ?? 1) >= 2),
    text: "A shout from the lounge, then a different kind of shout. One of the refugees is having her baby, now, two jumps early, on your deck.",
    options: [
      { label: "THE MEDIC HAS IT", requires: (g) => p(g).crew.some((c) => c.role === "medic"), result: (g) => { const m = passengersAboard(p(g)).find((x) => x.passengerKind === "refugee"); if (!m) return "THE MOMENT PASSES. THE LOUNGE IS EMPTY."; m.party = (m.party ?? 1) + 1; m.mood = Math.min(100, (m.mood ?? 60) + 20); const x = crewXp(p(g), "medic"); logEntry(g.world, `A child born aboard, bound for ${g.world.systems[m.targetSystemId]?.name ?? "somewhere"}`); return `FORTY MINUTES. A SMALL, FURIOUS PERSON. ${p(g).shipName ? `THEY WANT TO NAME HER AFTER THE SHIP. YOU TALK THEM INTO A MIDDLE NAME.` : "THE MEDIC WASHES UP AND SAYS NOTHING FOR AN HOUR."}${x ? " " + x : ""}`; } },
      { label: "YOU AND THE MANUAL", result: (g, rng) => { const m = passengersAboard(p(g)).find((x) => x.passengerKind === "refugee"); if (!m) return "THE MOMENT PASSES. THE LOUNGE IS EMPTY."; m.party = (m.party ?? 1) + 1; if (rng.chance(0.7)) { m.mood = Math.min(100, (m.mood ?? 60) + 15); logEntry(g.world, "Delivered a child aboard with the manual open on the deck"); return "THE MANUAL IS OPEN ON THE DECK AND NOBODY READS IT. IT GOES FINE. IT GOES FINE. YOUR HANDS SHAKE FOR AN HOUR AFTERWARDS."; } m.mood = Math.min(100, (m.mood ?? 60) + 5); return "IT'S ROUGH, AND LONG, AND EVERYONE LIVES. YOU'LL HIRE A MEDIC AT THE NEXT PORT. YOU SWEAR IT ON THE DECK PLATES."; } },
    ],
  },
  {
    id: "passing", where: "space", weight: 1, title: "A PASSING", when: (g) => passengersAboard(p(g)).some((m) => (m.party ?? 1) >= 3),
    text: "The oldest of the party didn't wake up. Peacefully, in the seat by the viewport, with the stars going by. The others are very quiet. They're looking at you.",
    options: [
      { label: "A SERVICE AT THE VIEWPORT", result: (g) => { const m = passengersAboard(p(g)).find((x) => (x.party ?? 1) >= 3); if (!m) return "THE MOMENT PASSES. THE LOUNGE IS EMPTY."; m.mood = Math.max(0, (m.mood ?? 60) - 5); for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 2); logEntry(g.world, "Read a service at the viewport for a passenger who died on the way"); return "YOU CUT THE ENGINES FOR TEN MINUTES. THE CREW COME. YOU READ WHAT THE FAMILY GIVE YOU TO READ. THE STARS DON'T MOVE. THEN THEY DO AGAIN."; } },
      { label: "KEEP FLYING. SAY NOTHING.", result: (g) => { const m = passengersAboard(p(g)).find((x) => (x.party ?? 1) >= 3); if (!m) return "THE MOMENT PASSES. THE LOUNGE IS EMPTY."; m.mood = Math.max(0, (m.mood ?? 60) - 25); return "THE ENGINES DON'T STOP. NOBODY IN THE LOUNGE SAYS A WORD TO YOU FOR THE REST OF THE TRIP."; } },
    ],
  },
  {
    id: "crewwedding", where: "space", weight: 2, title: "TWO OF YOUR OWN", when: (g) => { const cr = p(g).crew; return cr.some((a) => cr.some((b) => a !== b && bond(a, b) >= 3)) && !p(g).flags?.crewWed; },
    text: "Two of your crew are waiting outside the cabin, not quite looking at each other. They've been putting this off since the last three ports. They'd like the captain to do it. Here. Now, if that's all right.",
    options: [
      { label: "OF COURSE", result: (g) => { const cr = p(g).crew; const a = cr.find((x) => cr.some((y) => x !== y && bond(x, y) >= 3)); const b = a ? cr.find((y) => y !== a && bond(a, y) >= 3) : undefined; if (!a || !b) return "THE MOMENT PASSES."; for (const c of cr) c.morale = Math.min(100, c.morale + 10); a.loyalty = (a.loyalty ?? 0) + 1; b.loyalty = (b.loyalty ?? 0) + 1; (p(g).flags ??= {}).crewWed = true; logEntry(g.world, `Married ${a.name} and ${b.name} in the galley`); return `THE GALLEY, A TABLECLOTH, THE CAT ON THE TABLE. ${a.name.toUpperCase()} AND ${b.name.toUpperCase()}. THE WHOLE SHIP IS LATE FOR ITS WATCH AND NOBODY MINDS.`; } },
      { label: "WAIT FOR A PORT AND DO IT RIGHT", result: (g) => { const cr = p(g).crew; for (const c of cr) if (cr.some((y) => y !== c && bond(c, y) >= 3)) c.morale = Math.max(0, c.morale - 4); return "THEY SAY THAT'S FAIR. THEY DON'T LOOK LIKE IT'S FAIR."; } },
    ],
  },
  {
    id: "oldprobe", where: "space", weight: 2, title: "AN OLD PROBE",
    text: "A probe older than the gates, tumbling end over end, its antenna still pointed at a star that isn't there any more. It's transmitting. It has been transmitting for two hundred years, to nobody.",
    options: [
      { label: "RECORD THE TRANSMISSION", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 90; (p(g).codex ??= {})["signal:THE OLD PROBE"] = 1; return "TWO HOURS OF SLOW NUMBERS AND, AT THE END, A VOICE: 'WE MADE IT. TELL THEM WE MADE IT.' +90 DATA. IT'S IN THE CODEX."; } },
      { label: "BRING IT ABOARD", requires: (g) => cargoUsed(p(g)) + 1 <= p(g).cargoMax, result: (g, rng) => { if (rng.chance(0.5)) { addCargo(p(g), "relics", 1); return "THE HULL COMES APART IN THE HOLD LIKE OLD PAPER. WHAT'S LEFT IS A RELIC, AND A RELIC IS WORTH SOMETHING TO SOMEBODY."; } return `IT DISINTEGRATES IN THE AIRLOCK. ${mats(g, { copper: 2, iron: 1 })} FROM THE FRAME. THE VOICE STOPS.`; } },
      { label: "LET IT KEEP TALKING", result: (g) => { for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 2); return "YOU LEAVE IT POINTED AT ITS DEAD STAR, STILL SAYING WHAT IT WAS BUILT TO SAY. THE CREW ARE QUIET FOR A WHILE."; } },
    ],
  },
  {
    id: "lanterns", where: "space", weight: 2, title: "THE LANTERN SHIPS",
    text: "A procession: twenty small craft in a slow line, every hull strung with lights, every band playing the same slow tune. A wedding, or a funeral, or something the lanes do that you never learned the name of.",
    options: [
      { label: "FALL IN AT THE BACK", result: (g) => { for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 5); for (const m of passengersAboard(p(g))) m.mood = Math.min(100, (m.mood ?? 60) + 10); const s = logSight(p(g), "festival", `the lantern ships over ${sys(g).name}`, p(g).systemId); return `YOU DIM THE HUD AND FOLLOW THE LIGHTS FOR TWENTY MINUTES.${s ? " YOUR PASSENGERS TALK ABOUT IT FOR THE REST OF THE TRIP." : ""} NOBODY ASKS WHAT IT'S FOR. MORALE UP.`; } },
      { label: "STRING UP YOUR OWN LIGHTS", requires: (g) => (p(g).cargo.parts ?? 0) >= 1, result: (g) => { removeCargo(p(g), "parts", 1); adjustRep(g.world, sys(g).factionId, 4); for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 8); return "THE ENGINEER RIGS THE RUNNING LIGHTS INTO SOMETHING THAT ISN'T REGULATION. THE LEAD SHIP FLASHES BACK. YOU'RE IN THE PROCESSION NOW. STANDING UP."; } },
      { label: "GIVE THEM ROOM", result: () => "THE LINE OF LIGHTS SLIDES PAST AND OVER THE HORIZON OF THE NEAREST WORLD. THE TUNE STAYS ON THE BAND A LONG TIME." },
    ],
  },
  {
    id: "liner", where: "space", weight: 2, title: "THE LINER",
    text: "A passenger liner, drives cold, thirty faces at the viewports. 'Galley's out. We're fine for air, not for tempers. Anything you can spare, the company will pay. The company will pay slowly.'",
    options: [
      { label: "PASS OVER FOOD", requires: (g) => (p(g).cargo.food ?? 0) >= 3, result: (g, rng) => { removeCargo(p(g), "food", 3); const c = rng.int(120, 260); (p(g).ious ??= []).push({ credits: c, text: `THE LINER COMPANY PAYS UP FOR THE FOOD: +${c}CR` }); adjustRep(g.world, sys(g).factionId, 3); return "THREE CRATES ACROSS ON A LINE. THIRTY PEOPLE WAVE FROM THE WINDOWS. THE COMPANY WILL PAY AT YOUR NEXT DOCK, THEY SAY. STANDING UP NOW."; } },
      { label: "TAKE A FEW ABOARD", requires: (g) => passengersAboard(p(g)).length < passengerCap(p(g)) && !p(g).evacuees, result: (g) => { p(g).evacuees = { n: 3, from: "a stranded liner" }; return "THREE OF THE HUNGRIEST COME ACROSS WITH A SUITCASE EACH. THEY'LL PAY OUT AT YOUR NEXT DOCK, AND EAT EVERYTHING IN THE GALLEY BEFORE THEN."; } },
      { label: "CALL IT IN AND MOVE ON", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 10; return "YOU PUT IT ON THE BAND. SOMEBODY WITH A BIGGER HOLD WILL COME. THE FACES AT THE WINDOWS WATCH YOU GO. +10 DATA."; } },
    ],
  },
  {
    id: "cairn", where: "ground", weight: 2, title: "THE CAIRN",
    text: "A pile of stones on a ridge, too neat to be chance, a rover's wheel set on top. Names scratched into a plate: a survey crew, a date, a line that says 'WE WALKED OUT'. Not all of them did.",
    options: [
      { label: "ADD A STONE", result: (g) => { for (const c of p(g).crew) c.morale = Math.min(100, c.morale + 3); p(g).expData = (p(g).expData ?? 0) + 40; logEntry(g.world, "Added a stone to a survey crew's cairn"); return "YOU ADD A STONE AND YOUR SHIP'S NAME TO THE PLATE. THE CREW STAND A MINUTE WITH THEIR HELMETS OFF THE DUST. +40 DATA."; } },
      { label: "READ THE PLATE AND GO", result: (g) => { p(g).expData = (p(g).expData ?? 0) + 20; return "SIX NAMES. FOUR WALKED OUT. YOU LOG THE POSITION SO THE NEXT CREW KNOWS WHERE THE RIDGE IS. +20 DATA."; } },
    ],
  },
  {
    id: "marshal", where: "space", weight: 2, title: "THE MARSHAL'S CHALLENGE", when: (g) => (p(g).races ?? 0) >= 1 && !p(g).marshalWager,
    text: "A race marshal's tender pulls alongside, all flags and no manners. 'HEARD YOU RUN THE RINGS. HEARD YOU'RE QUICK. I'LL DOUBLE THE PRIZE ON YOUR NEXT RUN IF IT'S UNDER PAR. IF IT ISN'T, YOU BUY THE MARSHALS A ROUND.'",
    options: [
      { label: "YOU'RE ON", result: (g) => { p(g).marshalWager = true; return "THE TENDER PEELS OFF WITH A FLASH OF ITS FLAGS. THE NEXT RING RACE YOU RUN UNDER PAR PAYS DOUBLE. OVER PAR COSTS YOU 100CR AND SOME PRIDE."; } },
      { label: "NOT TODAY", result: () => "'SUIT YOURSELF. THE RINGS AREN'T GOING ANYWHERE.' THEY AREN'T." },
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
