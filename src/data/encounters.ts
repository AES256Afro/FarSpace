// Encounters: short choice cards that interrupt flight or a drive. Each option
// applies real effects and returns the line the player reads afterwards.

import type { Game } from "../game";
import { addCargo, removeCargo, adjustRep, hasIllegalCargo, cargoUsed, genCrewCandidate, adjustSynRep, passengersAboard, berthsUsed, adoptCat, CAT_NAMES, shiftBond, logSight, crewXp, bond, logEntry, passengerCap, infraAt, infraLit, wondersIn } from "../world";
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
    id: "loop", where: "space", weight: 2, title: "THE SAME MINUTE, AGAIN", when: (g) => !p(g).flags?.loopDone,
    text: "The clock on the console reads a time it read a moment ago. The coffee is full again. Somebody on the band says the thing they just said, word for word, and then, seeing your face, says 'WHAT?' the same way. You have been here before. You will be here again unless something changes.",
    options: [
      { label: "DO SOMETHING DIFFERENT", hint: "Anything. The other chair. The other hand.", result: (g, rng) => { const n = ((p(g).flags?.loopCount as unknown as number) ?? 0); if (n >= 2 || rng.chance(0.35)) { (p(g).flags ??= {}).loopDone = true; p(g).expData = (p(g).expData ?? 0) + 100; logEntry(g.world, "Broke a loop in the lane by sitting in the other chair"); return "YOU SIT IN THE OTHER CHAIR. THE CLOCK TICKS FORWARD. THE COFFEE GOES DOWN. THE BAND SAYS SOMETHING NEW. +100 DATA FOR THE READINGS, AND NOBODY WILL EVER BELIEVE YOU."; } (p(g).flags ??= {} as any)["loopCount" as string] = (n + 1) as unknown as boolean; return "YOU TRY THE OTHER HAND. THE CLOCK READS THE SAME TIME AGAIN. THE COFFEE REFILLS. NOT THAT, THEN. YOU'LL BE BACK."; } },
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
      { label: "PASS WATER AND A FILTER (1 WATER, 1 PART)", requires: (g) => (p(g).cargo.water ?? 0) >= 1 && (p(g).cargo.parts ?? 0) >= 1, result: (g) => { removeCargo(p(g), "water", 1); removeCargo(p(g), "parts", 1); p(g).rescues = (p(g).rescues ?? 0) + 1; p(g).lives = (p(g).lives ?? 0) + 4; adjustRep(g.world, sys(g).factionId, 2); (p(g).flags ??= {}).belt = true; logEntry(g.world, "Passed water and a scrubber filter to a rock hopper family off the belt"); return "THE FILTER GOES ACROSS ON A LINE, THEN THE WATER. THE CHILD WAVES THROUGH THE PORT. 'WE SQUARE IT, INNER. THE BELT REMEMBERS.' FOUR LIVES."; } },
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
