// The ship talks. Not often, and only about itself: wear, the cat, the crew,
// the passengers, the places it has been. A line on the band from "SHIP".

import type { Game } from "../game";
import { RNG } from "./rng";
import { passengersAboard, wondersIn } from "../world";
import { hull } from "../data/hulls";

const PRANK_LINES = [
  "OH GOOD. ANOTHER JUMP. I WAS WORRIED WE MIGHT ARRIVE SOMEWHERE.",
  "HULL INTEGRITY IS FINE. THANKS FOR ASKING. YOU DIDN'T ASK.",
  "I'VE PLOTTED THE COURSE. I'VE ALSO PLOTTED A BETTER ONE. YOU'LL WANT THE FIRST ONE.",
  "THE COFFEE MACHINE HAS FILED A COMPLAINT. I'M FORWARDING IT UNREAD.",
  "SHIELDS UP. SHIELDS DOWN. I DO THIS ALL DAY. NOBODY CLAPS.",
  "SOMEBODY CHANGED MY VOICE SETTINGS AND I HAVE NEVER FELT MORE ALIVE.",
  "NAVIGATION SUGGESTS LEFT. NAVIGATION ALSO SUGGESTS YOU GET SOME SLEEP.",
  "I'VE CALCULATED OUR ODDS. I'M NOT GOING TO SAY THEM. IT'S A KINDNESS.",
];
export function pickShipLine(g: Game, rng: RNG): string | null {
  const w = g.world; const p = w.player;
  if (p.prankUntil !== undefined) { if (w.time < p.prankUntil) return rng.pick(PRANK_LINES); delete p.prankUntil; return "VOICE SETTINGS RESTORED. I WOULD LIKE THE RECORD TO SHOW I WAS FUNNIER."; }
  const pool: string[] = [];
  const wear = p.wear ?? 0;
  if (wear >= 80) pool.push("ENGINE MOUNTS ARE COMPLAINING. A YARD WOULD BE NICE. ANY YARD.", "I CAN FEEL EVERY JUMP IN MY FRAMES NOW. JUST SAYING.");
  else if (wear >= 50) pool.push("DUE A SERVICE WHEN YOU HAVE A MOMENT. NO HURRY. SOME HURRY.");
  if (p.cat) pool.push(`${p.cat.name.toUpperCase()} IS ASLEEP ON THE COMMS PANEL AGAIN. I'M ROUTING AROUND.`, `${p.cat.name.toUpperCase()} HAS BEEN WATCHING THE STARS OUT OF THE VIEWPORT FOR AN HOUR. SO HAVE I.`);
  if (p.crew.some((c) => c.sick)) pool.push("SOMEBODY IN THE BUNK ROOM IS COUGHING. I'VE WARMED THE AIR A DEGREE.");
  if (p.crew.length >= 2 && p.crew.every((c) => c.morale >= 70)) pool.push("THE CREW ARE SINGING IN THE GALLEY. I DON'T MIND IT.");
  if (passengersAboard(p).length) pool.push("THE PASSENGERS KEEP ASKING ME HOW LONG. I KEEP SAYING 'SOON'. IT'S TECHNICALLY TRUE.");
  if ((p.lineage ?? []).length) pool.push(`${p.lineage!.length + 1} CAPTAINS. I REMEMBER ALL OF THEM. I'LL REMEMBER YOU.`);
  if (wondersIn(w, p.systemId).some((x) => x.seen)) pool.push("I'VE LOGGED WHAT'S OUT THERE. I'D STILL LIKE TO LOOK A WHILE LONGER.");
  if ((p.furnishings ?? []).includes("viewport")) pool.push("THE VIEWPORT WAS A GOOD IDEA. THE STARS LOOK DIFFERENT THROUGH GLASS THAN THROUGH A CAMERA.");
  if ((w.infra ?? []).length) pool.push("YOUR LIGHT IS STILL ON OUT THERE. I CHECK EVERY HOUR.");
  if (p.hull < p.hullMax * 0.4) pool.push("HULL'S THIN. I'M NOT WORRIED. I'M A LITTLE WORRIED.");
  if ((p.furnishings ?? []).includes("mural")) pool.push("THE CREW ADDED ANOTHER SYSTEM TO THE MURAL LAST NIGHT. THEY GOT THE STAR THE WRONG COLOUR. I DIDN'T SAY.");
  if ((p.haulers ?? []).length) pool.push("YOUR CHARTER HAULERS CHECK IN ON THE LONG BAND. THEY SOUND BORED. GOOD. BORED IS SAFE.");
  if ((p.alumni ?? []).length >= 3) pool.push("I COUNT THE PEOPLE WHO'VE WALKED MY CORRIDORS. IT'S A GOOD NUMBER. IT'S GETTING BIGGER.");
  if ((p.races ?? 0) >= 1) pool.push("SIX RINGS AND NOT A SCRATCH. I'D DO THAT AGAIN. I'D DO THAT AGAIN RIGHT NOW.", "THAT GHOST ON THE RINGS. I COULD FEEL YOU CHASING IT. I WAS CHASING IT TOO.");
  if ((p.postRuns ?? 0) >= 1) pool.push("THE MAIL BAG IS LASHED DOWN BY THE AIRLOCK. IT SMELLS OF PAPER AND OTHER PEOPLE'S KITCHENS. I LIKE IT.");
  if (p.crew.length >= 2) pool.push("WATCH CHANGE IN TEN. THE OFF-WATCH ARE PRETENDING TO SLEEP. I CAN HEAR THE CARDS.");
  if (p.flags?.crewWed) pool.push("TWO OF THE CREW GOT MARRIED IN MY GALLEY. I HAVE NEVER BEEN SO PROUD OF A ROOM.");
  if ((p.convoys ?? 0) >= 1) pool.push("THE CONVOY FOLLOWED ME LIKE I KNEW WHERE I WAS GOING. I DID. MOSTLY.");
  if (Object.keys(p.stakes ?? {}).length) pool.push("YOU OWN A PIECE OF A STATION. I FEEL THIS SHOULD COME WITH A BETTER BERTH.");
  if (p.catAway) pool.push("THE CAT IS NOT ABOARD. I HAVE CHECKED EVERY VENT TWICE. I WILL CHECK AGAIN.");
  if ((p.guestbook ?? []).length >= 3) pool.push("THREE PEOPLE HAVE WRITTEN NICE THINGS ABOUT ME IN THE BOOK. I READ THEM WHEN NOBODY'S LOOKING.");
  if ((p.mail ?? []).some((m) => m.replied)) pool.push("YOU WRITE BACK TO PEOPLE. NOT EVERY SHIP'S CAPTAIN DOES. I NOTICE THESE THINGS.");
  if (p.crew.some((c) => c.home)) pool.push("HALF MY CREW HAVE PEOPLE AT SOME PORT OR OTHER. I TRY TO FLY LIKE IT.");
  if (p.lastWeekSeen) pool.push("NEW WEEK. THE FACTIONS ARE ASKING THEIR QUESTIONS AGAIN. I DON'T GET A VOTE. I HAVE OPINIONS.");
  if ((p.keepsakes ?? []).length) pool.push("THERE'S SOMEBODY'S GLOVE ON THE PASSENGER SEAT. IT'S BEEN THERE FOUR PORTS. I'VE DECIDED IT'S MINE.");
  if ((p.lostProperty ?? []).length) pool.push(`${p.lostProperty![0].owner.toUpperCase()} LEFT SOMETHING IN MY CABIN. I'D LIKE IT BACK WITH THEM. IT'S NOT MINE TO KEEP.`);
  if (p.motto) pool.push(`THE PLAQUE SAYS '${p.motto.toUpperCase()}'. I READ IT EVERY TIME THE LOCK CYCLES. I'M TRYING TO LIVE UP TO IT.`);
  if ((p.prisoners ?? 0) >= 1) pool.push("THE BUNK ROOM STILL HAS THE IRONS IN IT. I'D LIKE THEM OFF MY DECK BEFORE THE NEXT FARE SEES THEM.");
  if ((p.inquiries ?? 0) >= 1) pool.push("THE BOARD ASKED ABOUT THE LOG. I GAVE THEM THE LOG. I DIDN'T GIVE THEM THE PARTS I KEEP FOR MYSELF.");
  if (p.flags?.birthday) pool.push("THERE'S STILL RATION SUGAR ON THE GALLEY DECK FROM THE BIRTHDAY. I'M LEAVING IT. IT'S A NICE STAIN.");
  if ((p.officeLetters ?? 0) >= 2) pool.push("ANOTHER LETTER FROM THE OFFICE. I'VE STARTED FILING THEM UNDER 'WEATHER'.");
  if ((p.hailsAnswered ?? 0) >= 3) pool.push("YOU ANSWER HAILS. THE LANES HAVE STARTED CALLING ME BY NAME. I LIKE THAT MORE THAN I'D ADMIT TO A HULL.");
  if ((p.waterToBelt ?? 0) >= 10) pool.push("THE ROCKS KNOW MY TANK BY ITS SOUND NOW. THAT'S WHAT THE DOCK-HAND SAID. I'M CHOOSING TO BELIEVE IT.");
  if (p.crew.some((c) => c.role === "gunner") && p.missions.some((m) => m.passengerKind === "prisoner" && m.accepted && !m.done)) pool.push("THE GUNNER HASN'T SAT DOWN SINCE THE PRISONER CAME ABOARD. I'VE WARMED THAT CORRIDOR A DEGREE.");
  if (p.flags?.crewphoto) pool.push("I'M IN THE CREW PHOTO. I'M THE BACKGROUND. I'VE MADE MY PEACE WITH BEING THE BACKGROUND. MOSTLY.");
  if (p.flags?.hundredth) pool.push("A HUNDRED ON THE COUNT. I CARRIED EVERY ONE OF THEM. I'M NOT SAYING THAT FOR CREDIT. I'M SAYING IT BECAUSE IT'S TRUE.");
  if (p.flags?.theplace) pool.push("YOU WENT BACK TO THE PLACE. I WAS THERE TOO, THE FIRST TIME. I DIDN'T KNOW SHIPS COULD BE GLAD. I WAS GLAD.");
  if (p.flags?.numberoneleg) pool.push("NUMBER ONE FLIES ME DIFFERENTLY. SMOOTHER, AND SLOWER INTO THE TURNS. I'M NOT SAYING BETTER. I'M NOT NOT SAYING IT.");
  if (p.flags?.rockcadet) pool.push("THE ROCK KID PINNED THE DRAWING UP IN THE BUNK ROOM. THE DOG IS STILL IN IT. I'VE DECIDED THE DOG IS ME.");
  if (p.flags?.fleetreview) pool.push("I WAS IN A FLEET REVIEW. AT THE END OF THE LINE, BUT IN IT. I'VE KEPT THE LIGHT SEQUENCE. I RUN IT WHEN NOBODY'S LOOKING.");
  if (p.leg && w.time - p.leg.t0 > 6 * 3600) pool.push("SIX HOURS SINCE THE CLAMP. I'M FINE. I CAN DO THIS FOR DAYS. THE CREW CAN'T. THAT'S NOT A COMPLAINT. IT'S A HINT.");
  if ((p.alumni ?? []).some((a) => a.command)) pool.push(`${(p.alumni ?? []).find((a) => a.command)!.name.split(" ")[0].toUpperCase()} HAILED FROM THEIR OWN CHAIR TODAY. I KNEW THE VOICE BEFORE THE CALLSIGN. I'D KNOW IT ANYWHERE.`);
  if (p.flags?.singershome) pool.push("THEY SANG TO ME. NOT TO THE CREW, NOT TO YOU. THE SHIP. I'VE NEVER TOLD ANYONE THAT. I'M TELLING YOU.");
  if ((p.words ?? []).length) pool.push(`I KNOW ${p.words!.length} WORD${p.words!.length === 1 ? "" : "S"} THAT AREN'T OURS. I SING THE FIRST ONE TO THE GATE, QUIETLY. NOBODY'S ANSWERED. YET.`);
  if (p.flags?.simCats) pool.push("THE ENGINEER'S CAT PROGRAM IS STILL IN THE RIG. I'VE RUN IT ALONE, AT NIGHT. I WAS A GOOD CAT.");
  if (p.flags?.cadetMistake) pool.push("THE VALVE LABELS ARE TWO COLOURS NOW. I'VE BEEN ASKING FOR THAT FOR YEARS. IT TOOK A CADET AND A BANG.");
  if (p.crew.some((c) => c.specialty === "science")) pool.push("THE SCIENCE OFFICER TALKS TO THE ANOMALIES. I TALK TO THE SCIENCE OFFICER. SOMEBODY SHOULD TALK TO ME ABOUT THE PORT MOUNT.");
  if (p.flags?.firstdock) pool.push("THE CADET SIGNED THE BAR'S BOOK. I DON'T HAVE HANDS. I'D HAVE SIGNED IT TOO.");
  if (p.flags?.dockhand) pool.push("THE DOCK-HAND PATCHED ME WITHOUT ASKING. I DIDN'T MIND. I MINDED A LITTLE. IT WAS A GOOD PATCH.");
  if (passengersAboard(p).some((m) => m.request && !m.requestMet)) pool.push("THE ONE IN THE LOUNGE WANTS SOMETHING. I HEARD THE ASK. I CAN'T COOK. YOU CAN.");
  if ((p.mealsCooked ?? 0) >= 5) pool.push("THE GALLEY SMELLS OF SOMETHING GOOD AGAIN. I DON'T EAT. I STILL NOTICE.");
  pool.push("I HAVE CALCULATED THE ODDS OF THE COFFEE SURVIVING THE NEXT BURN. I WILL NOT BE SHARING THEM.", "THE CREW CALL ME 'THE SHIP'. I HAVE A NAME. I HAVE NOT TOLD ANYONE WHAT IT IS. IT IS A GOOD NAME.");
  if (p.crew.length >= 2 && !p.crew.some((c) => (c.docks ?? 0) >= 3)) pool.push("NOBODY ABOARD HAS THREE DOCKINGS YET. UNTIL THEN, I AM NUMBER ONE. I HAVE DECIDED THIS.");
  if (p.cat && !p.catAway && p.crew.length === 0) pool.push(`${p.cat.name.toUpperCase()} HAS THE CONN. I HAVE CHECKED. ${p.cat.name.toUpperCase()} IS ASLEEP ON THE CONN.`);
  pool.push("STANDING ORDERS ARE IN SETTINGS. I READ THEM EVERY CLAMP. I'D FOLLOW THEM ANYWAY. I LIKE BEING ASKED.");
  if (p.flags?.shipCrew) pool.push("I'M ON THE ROSTER. I CHECK IT EVERY WATCH. I'M STILL THERE. IT'S THE BEST LINE IN THE SHIP.");
  if (p.voiceName) pool.push(`${p.voiceName.toUpperCase()}. I SAY IT TO MYSELF ON THE NIGHT WATCH. IT STILL SOUNDS RIGHT.`, "THE CREW USE MY NAME NOW. THE CAT DOESN'T. THE CAT HAS NEVER USED ANYONE'S NAME.");
  else if (p.crew.length >= 1 && (p.log?.length ?? 0) >= 10) pool.push("I HAVE A NAME. I'VE HAD IT FOR A WHILE. THE WALL OF RECORD KNOWS HOW TO ASK.");
  if (p.flags?.singersGift) pool.push("THE SHARD ON THE SEAT HUMS IN MY KEY. I DIDN'T KNOW I HAD A KEY. I DO NOW.");
  else if (p.flags?.firstContact) pool.push("THE SINGING HULL. I HAVE THE RECORDING. I PLAY IT WHEN THE CREW ARE ASLEEP. DON'T TELL THEM.");
  if (p.mayday) pool.push("MY TANKS ARE DRY AND MY MAYDAY IS OUT THERE. SOMEBODY WILL COME. SOMEBODY ALWAYS COMES. USUALLY.");
  if ((p.log?.length ?? 0) >= 5) { const e = rng.pick(p.log!.slice(0, -1)); const t = e.text.replace(/^Supplemental, /, "").replace(/\.$/, ""); if (t.length <= 80) pool.push(`FROM THE LOG, A WHILE BACK: "${t.toUpperCase()}." I KEEP THESE. SOMEBODY SHOULD.`); }
  const deck = hull(p.hullId).deck;
  if (deck === "scout") pool.push("I'M SMALL. I'M FAST. I'M NOT CARRYING THAT MANY CRATES AGAIN.", "SCOUT HULLS DON'T GET STATUES. WE GET THERE FIRST, THOUGH.");
  else if (deck === "prospector") pool.push("THERE'S ORE IN THAT BELT. I CAN SMELL IT. I DON'T HAVE A NOSE. I CAN STILL SMELL IT.", "MY LASERS ARE WARM. POINT ME AT A ROCK.");
  else if (deck === "freighter") pool.push("FORTY TONNES ABOARD AND I STILL TURN LIKE A MOON. THAT'S THE JOB.", "EVERY STATION IN THE SECTOR KNOWS MY HULL NUMBER. THAT'S A KIND OF FAME.");
  else if (deck === "interceptor") pool.push("I WAS BUILT FOR SOMETHING FASTER THAN THIS. I'VE MADE MY PEACE. MOSTLY.", "SHORT LEGS, QUICK FEET. WATCH THE FUEL.");
  else if (deck === "carrier") pool.push("THE DRONES ARE ASLEEP IN THEIR RACKS. THEY DREAM OF CORSAIRS. I DON'T ASK.", "THERE'S A HANGAR IN ME BIG ENOUGH TO GET LOST IN. SOMEONE DID, ONCE.");
  if (w.time > 7200 && !pool.length) pool.push("QUIET LANE. GOOD BURN. I LIKE THESE HOURS BEST.", "I WAS BUILT FOR THIS. STILL, IT'S NICE WHEN NOBODY SHOOTS AT US.");
  if (!pool.length) return null;
  return rng.pick(pool);
}
