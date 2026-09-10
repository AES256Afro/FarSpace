// The ship talks. Not often, and only about itself: wear, the cat, the crew,
// the passengers, the places it has been. A line on the band from "SHIP".

import type { Game } from "../game";
import { RNG } from "./rng";
import { passengersAboard, wondersIn } from "../world";

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
  if (w.time > 7200 && !pool.length) pool.push("QUIET LANE. GOOD BURN. I LIKE THESE HOURS BEST.", "I WAS BUILT FOR THIS. STILL, IT'S NICE WHEN NOBODY SHOOTS AT US.");
  if (!pool.length) return null;
  return rng.pick(pool);
}
