// The ship talks. Not often, and only about itself: wear, the cat, the crew,
// the passengers, the places it has been. A line on the band from "SHIP".

import type { Game } from "../game";
import { RNG } from "./rng";
import { passengersAboard, wondersIn } from "../world";
import { hull } from "../data/hulls";

export function pickShipLine(g: Game, rng: RNG): string | null {
  const w = g.world; const p = w.player;
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
  if (p.mayday) pool.push("MY TANKS ARE DRY AND MY MAYDAY IS OUT THERE. SOMEBODY WILL COME. SOMEBODY ALWAYS COMES. USUALLY.");
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
