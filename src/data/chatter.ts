// Corridor talk: what the crew say to each other when you're not in the
// conversation. Lines come from who they are, who they're talking to, and
// the state of the ship. Read over their shoulder aboard.

import type { World, Mission } from "../world";
import type { CrewMember } from "./crew";
import { bond, passengersAboard, captainNickname, firstOfficer } from "../world";
import { RNG } from "../core/rng";

const ROLE_TALK: Record<string, string[]> = {
  engineer: ["SHE'S RUNNING WARM ON THE PORT SIDE.", "IF THE COOLANT GOES, WE GO. SO I WATCH THE COOLANT.", "DON'T LEAN ON THAT PANEL. I MEAN IT.", "I CAN HEAR A BEARING. NOBODY ELSE CAN. IT'S THERE."],
  gunner: ["QUIET OUT THERE. TOO QUIET, PROBABLY.", "I CLEANED THE TURRET TWICE. IT'S A LONG WATCH.", "IF IT'S RED ON THE SCOPE IT'S MINE. IF IT'S GREEN, DON'T LET ME NEAR IT.", "I'D RATHER BE BORED THAN BUSY. MOSTLY."],
  pilot: ["I'D HAVE TAKEN THAT GATE WIDER.", "THE SKIPPER FLIES LIKE THE FUEL'S FREE.", "YOU FEEL THAT YAW ON THE LAST BURN? NO? JUST ME.", "THERE'S A LANE OUT OF HERE NOBODY USES. I'M SAVING IT."],
  medic: ["DRINK MORE WATER. ALL OF YOU.", "IF YOU'RE COUGHING, YOU'RE COMING TO SEE ME. NO ARGUMENT.", "THE FIRST-AID KIT IS NOT A TOOLBOX. PUT THE SPANNER BACK.", "EVERYBODY'S FINE. THAT WORRIES ME."],
};

export function crewChatter(w: World, a: CrewMember, b: CrewMember, rng: RNG): string {
  const p = w.player; const sys = w.systems[p.systemId];
  const B = (b.name.split(" ")[0] ?? b.name).toUpperCase();
  const pool: string[] = [...ROLE_TALK[a.role] ?? []];
  const bd = bond(a, b);
  if (bd >= 2) pool.push(`${B}, YOU STILL OWE ME A DRINK.`, `SAME WATCH TOMORROW, ${B}?`, `I SAVED YOU THE GOOD BUNK, ${B}.`, "REMEMBER THAT GATE? I STILL DREAM ABOUT IT.", `IF THE SKIPPER GOES, I GO WHERE YOU GO, ${B}.`);
  else if (bd <= -2) pool.push(`STAY OUT OF MY SECTION, ${B}.`, "YOU LEFT THE SCRUBBER FILTER OUT AGAIN.", "I DON'T NEED THE HELP. I SAID I DON'T NEED THE HELP.", "WE'LL TALK WHEN THE SKIPPER'S NOT LISTENING.");
  else pool.push(`EVER BEEN TO ${sys.name.toUpperCase()} BEFORE, ${B}? NO? SAME.`, "WHAT'S THE WORD ON PAY THIS MONTH?", "YOU HEAR THAT? ... NO, IT'S GONE.",
    `${B}, YOU'RE ON THE GALLEY ROTA. NO, I CHECKED. YOU ARE.`, "THE SKIPPER TALKS TO THE SHIP. THE SHIP TALKS BACK. I'M NOT SAYING IT'S WRONG.", "WHEN WE'RE RICH I'M BUYING A STAKE IN SOMEWHERE WITH REAL COFFEE.",
    "I HAD A DREAM THE RINGS WERE ON FIRE AND WE STILL WENT UNDER PAR.", `THE CAT SLEPT ON YOUR BUNK, ${B}. I'M NOT MOVING HER. YOU MOVE HER.`, "WATCH CHANGE IN TEN. PRETEND TO BE ASLEEP UNTIL THEN.");
  if (p.hull < p.hullMax * 0.5) pool.push("THAT LAST HIT WENT RIGHT THROUGH THE FRAME. YOU CAN SEE STARS FROM THE HEAD.");
  if (p.fuel < p.fuelMax * 0.25) pool.push("ANYONE ASKED THE SKIPPER ABOUT FUEL? NO? THOUGHT NOT.");
  if ((p.wear ?? 0) > 60) pool.push("SHE NEEDS A YARD. LISTEN TO THAT BEARING. THAT'S NOT A NOISE SHE MAKES.");
  if (p.credits > 20000) pool.push("HEARD THE ACCOUNT'S HEALTHY. BONUS SEASON, YOU'D THINK.");
  if (p.credits < 300) pool.push("PAYDAY'S GOING TO BE INTERESTING.");
  if (p.cat && p.catAway) pool.push(`WHERE'S ${p.cat.name.toUpperCase()}? ... WE LEFT HER? WE LEFT HER. THE SKIPPER LEFT THE CAT.`, `THE SHIP'S WRONG WITHOUT ${p.cat.name.toUpperCase()}. WE'RE GOING BACK FOR HER, RIGHT?`);
  else if (p.cat) pool.push(`${p.cat.name.toUpperCase()} WAS IN THE VENTS AGAIN.`, `WHO'S FEEDING ${p.cat.name.toUpperCase()}? NOT ME. I FED HER TWICE.`);
  if (passengersAboard(p).length) pool.push("KEEP IT DOWN, WE'VE GOT PAYING PEOPLE ABOARD.", "THE ONE IN THE LOUNGE ASKED IF WE HAVE A POOL.");
  const t = a.trait ?? "";
  if (t.includes("litres")) pool.push("YOU LEFT THE TAP RUNNING. I COUNTED. THAT'S TWO LITRES. TWO. LITRES.");
  if (t.includes("spin")) pool.push("THIS STATION'S SPIN IS WRONG. DON'T TELL ME IT ISN'T. MY INNER EAR HAS OPINIONS.");
  if (t.includes("rock")) pool.push("ON THE ROCK WE'D HAVE CALLED THIS A HOLIDAY. AIR, WATER, AND NOBODY SHOOTING. HOLIDAY.");
  if (t.includes("inner-born")) pool.push("I'M NOT SAYING GRAVITY IS BETTER WHERE I'M FROM. I'M SAYING IT EXISTS.");
  if (t.includes("cooks")) pool.push("I'M DOING SOMETHING WITH THE RATION BARS TONIGHT. DON'T ASK.");
  if (t.includes("cards")) pool.push("CARDS AFTER WATCH? MATCHSTICKS ONLY, THIS TIME.");
  if (t.includes("plant")) pool.push("THE PLANT'S GOT A NEW LEAF. DON'T TOUCH IT.");
  if (t.includes("letters")) pool.push("I'LL POST IT AT THE NEXT DOCK. IF THERE IS A NEXT DOCK.");
  if (t.includes("laps")) pool.push("THREE LAPS BEFORE THE JUMP. YOU COMING?");
  if (t.includes("bird")) pool.push("DON'T OPEN THE BOX. JUST DON'T.");
  if (t.includes("tally")) pool.push("THAT'S ANOTHER MARK FOR THE BULKHEAD.");
  if (t.includes("stamps")) pool.push("THEY'VE GOT A NEW STAMP AT THE NEXT PORT. I CHECKED.");
  if (t.includes("song") || t.includes("hymns")) pool.push("I'VE GOT A SONG FOR THIS GATE. YOU'LL HEAR IT WHETHER YOU LIKE IT OR NOT.");
  { const nick = captainNickname(w); if (nick) pool.push(`THEY CALLED THE SKIPPER ${nick} AT THE LAST PORT. DON'T LET ON WE HEARD.`); }
  if ((p.races ?? 0) >= 1) pool.push("THAT LAST RING. I HAD MY EYES SHUT. DID WE WIN?", "NEXT TIME THE SKIPPER RACES, STRAP THE CAT DOWN.");
  if ((p.postRuns ?? 0) >= 1) pool.push("THERE'S A LETTER IN THE BAG FOR SOMEBODY CALLED 'DAD'. NO ADDRESS. I HOPE IT GETS THERE.");
  if ((p.convoys ?? 0) >= 1) pool.push("THOSE HAULERS FOLLOWING US TO THE GATE. LIKE DUCKLINGS. I NEARLY CRIED.");
  if (Object.keys(p.stakes ?? {}).length) pool.push("THE SKIPPER OWNS PART OF A STATION NOW. DOES THAT MAKE US MANAGEMENT?");
  if ((p.keepsakes ?? []).length) { const k = p.keepsakes![p.keepsakes!.length - 1].split(",")[0].toUpperCase(); pool.push(`WHOSE IS ${k}? ... OURS NOW, APPARENTLY. THE SKIPPER KEPT IT.`, `I MOVED ${k} OFF THE SEAT. IT'S BACK ON THE SEAT. I'M NOT ASKING.`); }
  if ((p.lostProperty ?? []).length) { const it = p.lostProperty![0]; pool.push(`${it.owner.toUpperCase()} LEFT ${it.name.toUpperCase().split(",")[0]} IN THE CABIN. SOMEBODY HAND IT IN BEFORE I GET ATTACHED.`); }
  if ((p.mealsCooked ?? 0) >= 3) pool.push("REMEMBER THE DINNER WITH THE LUXURIES? I THINK ABOUT IT ON EVERY RATION BAR.", "WHO'S ON GALLEY TONIGHT? IF IT'S THE SKIPPER, I'M EATING EARLY.");
  if (p.flags?.dockhand) pool.push("THE DOCK-HAND AT THE LAST PORT PATCHED US FOR NOTHING. DON'T TELL THE YARD, THEY SAID. WHO'D TELL THE YARD?");
  if (p.flags?.neighbour) pool.push("SAW A CAPTAIN THE SKIPPER KNOWS ON THE PROMENADE. THEY HUGGED. I DIDN'T KNOW THE SKIPPER HUGGED.");
  if (passengersAboard(p).some((m) => m.request && !m.requestMet)) pool.push("THE ONE IN THE LOUNGE ASKED FOR SOMETHING. A MEAL, A VIEW, QUIET. WE COULD MANAGE ONE OF THOSE.");
  pool.push("I'M NOT SAYING THE SKIPPER'S BAD AT PARKING. THE DOCK-HAND IS SAYING IT. I'M JUST AGREEING.", "IF WE DIE OUT HERE I'M HAUNTING YOU FIRST. THEN THE SKIPPER. THEN THE CAT.", "WHO PUT 'TALENT NIGHT' ON THE WHITEBOARD? ... IT WAS YOU. IT'S ALWAYS YOU.", "THE SIM RIG'S GOT A NEW PROGRAM. IT'S A BEACH. THE BEACH HAS A HORSE. NOBODY KNOWS WHY.", "BRIDGE RULE: NO SINGING BEFORE THE SECOND COFFEE. I DON'T MAKE THE RULES. I MADE THAT ONE.");
  { const fo = firstOfficer(p); if (fo && fo !== a && fo !== b) pool.push(`${fo.name.split(" ")[0].toUpperCase()} IS 'NUMBER ONE' NOW. THEY'VE STARTED SAYING 'CARRY ON'. TO THE CAT.`, `ASK NUMBER ONE. NUMBER ONE KNOWS WHERE THE SKIPPER KEEPS THE GOOD COFFEE.`); else if (fo === a || fo === b) pool.push(`${(fo === a ? B : a.name.split(" ")[0].toUpperCase())}, NUMBER ONE HAS THE DECK. WHICH MEANS I HAVE THE DECK. WHICH MEANS COFFEE.`); }
  if (p.dockedAt) pool.push("NIGHT RATE AT THE YARD IF WE STAY TILL THE SHIFT TURNS. TELL THE SKIPPER. OR DON'T, IT'S THEIR MONEY.");
  if (p.regatta === 3) pool.push("WE'RE THE CHAMPIONS. I KEEP SAYING IT OUT LOUD TO SEE IF IT SOUNDS REAL. IT DOESN'T YET.");
  if (p.flags?.crewWed) pool.push("STILL CAN'T BELIEVE THE SKIPPER DID THE WEDDING IN THE GALLEY. WITH THE CAT ON THE TABLE.");
  if (a.morale < 30) pool.push("I'M THINKING ABOUT GOING HOME.", "SOME SHIPS PAY ON TIME, YOU KNOW.");
  if (a.morale > 80) pool.push("BEST SHIP I'VE BEEN ON. DON'T TELL THE SKIPPER.", "I'D FOLLOW THIS ONE ANYWHERE. QUIETLY.");
  if (a.arc && !a.arc.done) pool.push("I'VE GOT SOMETHING I NEED TO SORT OUT. LATER. NOT NOW.");
  if (a.request) pool.push("I'VE ASKED THE SKIPPER FOR SOMETHING. WE'LL SEE.");
  return rng.pick(pool);
}

// Alone, they keep themselves company
export function soloChatter(a: CrewMember): string | null {
  const t = a.trait ?? "";
  if (t.includes("hums") || t.includes("song") || t.includes("whistles")) return "*HUMMING*";
  if (t.includes("cards")) return "*SHUFFLING CARDS*";
  if (t.includes("plant") || t.includes("sprouts")) return "*WATERING THE PLANT*";
  if (t.includes("sketches")) return "*SKETCHING*";
  if (t.includes("reads")) return "*READING*";
  if (t.includes("talks to the ship")) return "GOOD GIRL. KEEP IT UP.";
  if (t.includes("tally")) return "*COUNTING MARKS*";
  if (t.includes("boots")) return "*MENDING A BOOT*";
  return null;
}

// Around the galley table with the skipper present
export const MESS_LINES = ["SKIPPER'S EATING WITH US. SIT, SIT.", "PASS THE... WHATEVER THAT IS. THANKS.", "TO THE SHIP. AND TO WHOEVER'S COOKING.", "NOBODY TALK SHOP. NOBODY."];

// Passengers talk to whoever's nearest. Crew answer in character.
const PAX_TO_ROLE: Record<string, Record<string, string[]>> = {
  envoy: {
    pilot: ["HOW LONG TO THE TALKS? BE HONEST. I CAN TELL WHEN A PILOT ROUNDS DOWN."],
    engineer: ["DOES IT ALWAYS MAKE THAT NOISE? ... IT DOES. ALL RIGHT."],
    medic: ["I DON'T SLEEP BEFORE A TREATY. IS THAT NORMAL? DON'T ANSWER THAT."],
    gunner: ["IF WE'RE FIRED ON, DO NOT FIRE BACK. THAT'S NOT A REQUEST. IT'S A TREATY."],
  },
  patient: {
    pilot: ["SMOOTH, PLEASE. I FELT THAT ONE IN THE STITCHES."],
    engineer: ["IS THE AIR SUPPOSED TO TASTE LIKE THAT? ... YOU'D TELL ME."],
    medic: ["YOU'RE NOT A DOCTOR. ... NO, YOU'LL DO. YOU HAVE THE HANDS."],
    gunner: ["DON'T LET THEM SHOOT THE PART OF THE SHIP I'M IN. THAT'S ALL. THAT'S THE WHOLE ASK."],
  },
  tourist: { pilot: ["IS IT TRUE YOU CAN SEE THE GATE FROM HERE?", "HOW FAST ARE WE GOING? IN REAL NUMBERS.", "DO YOU DO THE RING RACE? MY NEPHEW SAYS YOU DO THE RING RACE."], engineer: ["WHAT DOES THAT NOISE MEAN? THE HUMMING ONE.", "IS THE CAT ALLOWED IN THERE?"], medic: ["IS THE WATER SAFE? IT TASTES OF PIPE.", "IS THERE A GUESTBOOK? I'D LIKE TO WRITE SOMETHING NICE."], gunner: ["HAVE YOU EVER... YOU KNOW. FIRED IT?", "WHAT'S THE WORST THING YOU'VE SEEN OUT HERE? NO, TELL ME."] },
  vip: { pilot: ["SMOOTHER, IF YOU PLEASE."], engineer: ["IS THAT SUPPOSED TO DRIP?"], medic: ["I HAVE A HEADACHE. DO SOMETHING."], gunner: ["I ASSUME WE ARE ADEQUATELY DEFENDED."] },
  refugee: { pilot: ["IS THERE WORK WHERE WE'RE GOING?"], engineer: ["MY CHILDREN LIKE THE ENGINE NOISE. IT MEANS WE'RE MOVING."], medic: ["THANK YOU. FOR THE BERTH. FOR ALL OF IT."], gunner: ["WILL THEY STOP US AT THE GATE?"] },
  fugitive: { pilot: ["HOW LONG TO THE GATE?"], engineer: ["YOU DIDN'T SEE ME."], medic: ["I'M FINE. I'M ALWAYS FINE."], gunner: ["IF IT COMES TO IT, I CAN SHOOT."] },
  courier: { pilot: ["WHAT'S OUR ETA. ROUGHLY."], engineer: ["CAN THIS THING GO ANY FASTER?"], medic: ["I'LL BE IN MY SEAT. WORKING."], gunner: ["NOBODY'S FOLLOWING US, ARE THEY?"] },
};
const ROLE_REPLY: Record<string, string[]> = {
  pilot: ["ALL PART OF THE SERVICE.", "SIT BACK. I'VE DONE THIS BEFORE."], engineer: ["IT'S SUPPOSED TO DO THAT.", "DON'T TOUCH THAT AND WE'LL BE FINE."],
  medic: ["DRINK SOME WATER.", "YOU'LL LIVE. THAT'S MY PROFESSIONAL OPINION."], gunner: ["ADEQUATELY.", "NOBODY'S SHOOTING. THAT'S THE PLAN."],
};
export function passengerChatter(m: Mission, c: CrewMember, rng: RNG): { ask: string; reply: string } {
  const kind = m.passengerKind ?? "vip";
  const pool = [...(PAX_TO_ROLE[kind]?.[c.role] ?? PAX_TO_ROLE.vip[c.role] ?? ["HOW LONG NOW?"])];
  const mood = m.mood ?? 60;
  if (mood < 35) pool.push("THIS IS NOT WHAT I PAID FOR.");
  if (mood > 80) pool.push("BEST CREW I'VE FLOWN WITH. I'LL SAY SO.");
  return { ask: rng.pick(pool), reply: rng.pick(ROLE_REPLY[c.role] ?? ["MM."]) };
}
