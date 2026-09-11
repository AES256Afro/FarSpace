// Passing hails: the unnamed traffic has manners, and opinions. A patrol is formal, a hauler is
// belt or business, a liner is smug, and everybody has something to say about the cat.

import type { World } from "../world";
import type { Npc } from "../scenes/flight/types";
import { captainNickname, isBeltStation, commandRank, droughtAt, fleetReviewAt } from "../world";
import { hull } from "./hulls";
import { RNG, hashStr } from "../core/rng";
import { stationHour } from "./tannoy";

export function hailCallsign(n: Npc, kind: string): string {
  const h = hashStr(`${kind}:${Math.round(n.x)}:${Math.round(n.y)}`);
  return `${kind === "patrol" ? "PATROL" : kind === "liner" ? "LINER" : "HAULER"} ${String.fromCharCode(65 + (h % 26))}-${(h % 90) + 10}`;
}

export function passingHail(w: World, n: Npc, alert: number, rng: RNG): { from: string; text: string } | null {
  const p = w.player; const sys = w.systems[p.systemId]; if (!sys) return null;
  const belt = sys.stations.length > 0 && sys.stations.filter(isBeltStation).length * 2 >= sys.stations.length;
  const night = sys.stations[0] ? stationHour(sys.stations[0]).night : false;
  const ship = p.hull < p.hullMax * 0.75 && rng.chance(0.4) ? "THE HULL WITH THE DENT" : (p.shipName ?? hull(p.hullId).name).toUpperCase();
  const nick = captainNickname(w);
  const pool: string[] = [];
  let kind = n.kind === "patrol" ? "patrol" : rng.chance(0.25) ? "liner" : "hauler";
  if (kind === "patrol") {
    pool.push(`THIS IS ${hailCallsign(n, kind)}. YOUR TRANSPONDER IS IN ORDER, ${ship}. CARRY ON, CAPTAIN. WELCOME TO ${sys.name.toUpperCase()}.`, `${hailCallsign(n, kind)} ON STATION. IF ANYTHING OUT HERE SO MUCH AS SNEEZES, WE'LL HEAR IT. FLY SAFE.`, `${hailCallsign(n, kind)}: ROUTINE SWEEP. NOTHING TO REPORT, WHICH IS HOW WE LIKE IT. GOOD DAY, ${ship}.`);
    if (alert === 2) pool.push(`${hailCallsign(n, kind)}: WE READ YOU AT RED ALERT, ${ship}. IS THERE SOMETHING WE SHOULD KNOW? ... NO? THEN STAND DOWN, CAPTAIN. YOU'RE SCARING THE HAULERS.`);
    { const rk = commandRank(p); if (rk === "COMMODORE" || rk === "ADMIRAL") pool.push(`${hailCallsign(n, kind)}: ${rk} ABOARD THE ${ship}. WE'LL, UH, HOLD OUR COURSE THEN. CARRY ON, ${rk}.`); }
    if (nick) pool.push(`${hailCallsign(n, kind)}: THAT'S ${nick}, ISN'T IT. THE ONE FROM THE WIRE. WE DON'T SALUTE CIVILIANS. CONSIDER THIS THE EXCEPTION.`);
  } else if (kind === "liner") {
    pool.push(`${hailCallsign(n, kind)}: GOOD ${night ? "EVENING" : "MORNING"}, CAPTAIN. TEA IS BEING SERVED IN THE FORWARD LOUNGE. NOT YOURS. OURS. DO MIND THE WAKE.`, `${hailCallsign(n, kind)}: OUR PASSENGERS ARE WAVING AT YOUR SHIP. THEY THINK IT'S QUAINT. I'VE TOLD THEM IT'S A ${hull(p.hullId).name.toUpperCase()}. THEY STILL THINK IT'S QUAINT.`, `${hailCallsign(n, kind)}: WE ARE ON SCHEDULE. WE ARE ALWAYS ON SCHEDULE. IT IS THE ONLY THING WE HAVE. GOOD DAY.`);
  } else {
    if (belt) pool.push(`${hailCallsign(n, kind)}: WATER AND FILTERS TO THE ROCK, INNER. MIND THE SPIN ON THE APPROACH, IT'LL SURPRISE YOU.`, `${hailCallsign(n, kind)}: YOU'RE A LONG WAY OUT FOR A ${hull(p.hullId).name.toUpperCase()}. BELT'S FRIENDLY IF YOU ARE. MOSTLY.`, p.flags?.belt ? `${hailCallsign(n, kind)}: THAT'S THE ONE WHO SHARED AIR. HEY. HEY. WE OWE YOU A DRINK ON THE ROCK. WE DON'T FORGET.` : `${hailCallsign(n, kind)}: AIR, WATER, AND PATIENCE. THAT'S THE BELT. BRING TWO OF THE THREE.`);
    else pool.push(`${hailCallsign(n, kind)}: ${ship}, YOU'RE ON MY LANE. NO, IT'S FINE. IT'S FINE. I'LL GO AROUND. I ALWAYS GO AROUND.`, `${hailCallsign(n, kind)}: RUNNING ORE TO THE REFINERY AND OPINIONS TO ANYONE WHO'LL TAKE THEM. WANT SOME? NO? FAIR.`, `${hailCallsign(n, kind)}: IS THAT A ${hull(p.hullId).name.toUpperCase()}? MY FIRST SHIP WAS A ${hull(p.hullId).name.toUpperCase()}. SHE'S STILL OUT THERE. PROBABLY. SAFE LANES.`);
    if (p.cat) pool.push(`${hailCallsign(n, kind)}: IS THAT A CAT ON YOUR COMMS PANEL? ... NO, DON'T MOVE IT. OURS IS ON OURS. IT'S HOW YOU KNOW A SHIP'S A HOME.`);
    if (night) pool.push(`${hailCallsign(n, kind)}: NIGHT SHIFT OUT HERE TOO. WHOEVER'S AWAKE ON YOUR BRIDGE, THIS ONE'S FOR YOU: YOU'RE DOING FINE.`);
    if (alert === 2) pool.push(`${hailCallsign(n, kind)}: WHY ARE YOU AT RED ALERT. ... OH NO. WHY ARE YOU AT RED ALERT.`);
  }
  { const dry = sys.stations.find((st) => droughtAt(w, st.id)); if (dry) pool.push(`${hailCallsign(n, kind)}: IF YOU'VE WATER IN THE HOLD, ${dry.name.toUpperCase()} IS ON RATION. THEY'LL REMEMBER THE HULL THAT BROUGHT IT. WE'RE CARRYING NONE. DON'T ASK.`); }
  { const rev = sys.stations.find((st) => fleetReviewAt(w, st.id)); if (rev) pool.push(`${hailCallsign(n, kind)}: FLEET REVIEW OFF ${rev.name.toUpperCase()}. STAY CLEAR OF THE LINE UNLESS YOU'RE IN IT, ${ship}. THEY'RE VERY PARTICULAR ABOUT THE LINE.`); }
  if (p.flags?.longship && !p.flags?.longshipLeft && sys.stations.some(isBeltStation)) pool.push(`THE LONG SHIP, SCAFFOLD WATCH: YOUR PLATE'S STILL IN, ${ship}. STILL NOBODY READING IT. THAT'S THE POINT. FLY SAFE.`);
  if (p.flags?.freeman && belt) pool.push(`${hailCallsign(n, kind)}: THAT'S THE FREEMAN'S HULL. KEEP THE WATER COLD, ${ship}. THE ROCK SAYS HELLO. THE ROCK DOESN'T SAY THAT TO INNERS.`);
  if (!pool.length) return null;
  return { from: hailCallsign(n, kind), text: rng.pick(pool).replace(/^(THIS IS )?(PATROL|LINER|HAULER) [A-Z]-\d+[:.] ?/, "") };
}
