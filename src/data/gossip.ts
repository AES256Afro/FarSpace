// Concourse gossip: what the crowd on a station promenade says to each other.
// Built from the state of the world, so a war, a crisis, a wonder next door or
// your own reputation all end up in somebody's mouth.

import type { World, StationDef } from "../world";
import { crisisAt, galaxyEventAt, wondersIn, dockingsAt, friendsAt, rivalOf, isHome, infraAt, findStation, captainNickname, borderContest } from "../world";
import { commodity, faction } from "./data";
import { RNG } from "../core/rng";
import { stationHour } from "./tannoy";
import { weeklyIssue, voteResult } from "./votes";

const STATION_LIFE: Record<string, string[]> = {
  trade: ["'BERTH FEES UP AGAIN. THEY'LL CHARGE FOR AIR NEXT.'", "'THE THIRD RING SMELLS OF FISH. NOBODY SELLS FISH.'", "'MY COUSIN GOT A JOB ON A HAULER. GOOD MONEY. NEVER HOME.'"],
  mining: ["'DAY SHIFT PULLED TWICE WHAT NIGHT SHIFT DID. AGAIN.'", "'THE DUST GETS INTO EVERYTHING. I FOUND SOME IN THE COFFEE.'", "'ANOTHER DRILL HEAD GONE. THEY'LL DOCK IT FROM SOMEBODY.'"],
  research: ["'THEY'VE HAD THAT SAMPLE UNDER GLASS FOR A YEAR. IT HASN'T DONE ANYTHING.'", "'DON'T GO IN LAB FOUR. NOBODY GOES IN LAB FOUR.'", "'THE DIRECTOR'S BACK. LOOK BUSY.'"],
  agri: ["'THE TOMATOES CAME IN. ACTUAL TOMATOES. THERE WAS A QUEUE.'", "'IF THE LAMPS FAIL AGAIN WE LOSE THE WHOLE TIER.'", "'YOU CAN TELL A FARM STATION BY THE SMELL. GOOD SMELL.'"],
  shipyard: ["'SHE CAME IN ON ONE ENGINE AND THE CAPTAIN WANTED IT DONE BY MORNING.'", "'THREE HULLS IN THE YARD AND ONE WELDER. DO THE SUMS.'", "'I SAW A FREIGHTER GO OUT WITH THE PAINT STILL WET.'"],
  outpost: ["'SUPPLY SHIP'S LATE. SUPPLY SHIP'S ALWAYS LATE.'", "'IF YOU'RE STAYING, THERE'S A BUNK. IF YOU'RE LEAVING, TAKE A LETTER.'", "'QUIET HERE. YOU GET USED TO IT. OR YOU LEAVE.'"],
};

export function concourseGossip(w: World, st: StationDef, rng: RNG): string[] {
  const p = w.player; const sys = findStation(w, st.id)?.sys ?? w.systems[p.systemId];
  const pool: string[] = [...(STATION_LIFE[st.type] ?? STATION_LIFE.trade)];
  pool.push("'YOU HEAR THE DOCKING CHIME LAST NIGHT? THREE IN THE MORNING. SOMEBODY IN A HURRY.'", "'THE BAR'S CHANGED THE MUSIC AGAIN. I LIKED THE OLD MUSIC.'", "'MY BROTHER SAYS THE GATE HUMS IN A DIFFERENT KEY WHEN IT'S GOING TO STORM.'",
    "'THE MARSHAL'S PAINTED THE RINGS AGAIN. GOLD. HE THINKS IT'S CLASSY.'", "'A LINER CAME THROUGH WITH A WEDDING ON BOARD. WHOLE PROMENADE HEARD ABOUT IT.'", "'THEY'VE PUT A GUESTBOOK IN THE LOUNGE. PEOPLE WRITE THE STRANGEST THINGS.'",
    "'THE MAIL'S LATE. THE MAIL'S ALWAYS LATE. THEN ONE DAY IT ISN'T AND YOU DON'T KNOW WHAT TO DO.'", "'I VOTED. FIRST TIME. DIDN'T FEEL LIKE MUCH. THEN THE PATROLS DOUBLED.'", "'SOMEBODY'S CAT WAS ON THE PROMENADE FOR TWO DAYS. ATE BETTER THAN I DID.'",
    "'THE NIGHT SHIFT SEES THE STRANGEST SHIPS DOCK. NEVER ASKS. THAT'S THE JOB.'", "'MY COUSIN CREWS A HAULER SOMEBODY PARKED HERE AND PUT TO WORK. NEVER MET THE OWNER.'", "'THERE'S A NOTE TIED TO THE WONDER PAST THE GATE. A CALL SIGN, AND 'WAIT FOR THE LIGHT'.'");
  const cr = crisisAt(w, st.id);
  if (cr) pool.push(`'${cr.kind.toUpperCase()}. THEY'RE SAYING ${cr.need - cr.delivered} MORE CRATES OF ${commodity(cr.commodityId).name.toUpperCase()} AND WE'RE THROUGH IT.'`, "'ANY SHIP THAT BRINGS IT IN GETS THEIR NAME ON THE BOARD. AND PAID.'");
  const ev = galaxyEventAt(w, sys.id);
  if (ev?.kind === "flare") pool.push("'DON'T FLY SUNWARD TODAY. THE FLARE'S COOKING HULLS OUT THERE.'");
  if (ev?.kind === "storm") pool.push("'RADAR'S GONE TO SOUP. THE ION STORM. PILOTS ARE FLYING BY EYE.'");
  if (ev?.kind === "comet") pool.push("'THE COMET'S UP. GO OUT TO THE OBSERVATION DECK, IT'S WORTH IT.'");
  if (w.synWar && w.time < w.synWar.until) pool.push(`'THE ${w.synWar.attacker} AND THE ${w.synWar.defender} ARE AT IT AGAIN. STAY OUT OF THE LANES OUT THERE.'`);
  const wd = wondersIn(w, sys.id)[0];
  if (wd) pool.push(wd.seen ? `'SAW A SHIP GO OUT TO ${wd.name.toUpperCase()} LAST WEEK. CAME BACK QUIET.'` : `'NOBODY'S BEEN OUT TO ${wd.name.toUpperCase()} IN AN AGE. IT'S STILL THERE. I CHECKED.'`);
  { const nick = captainNickname(w); if (nick) pool.push(`'SEE THAT CAPTAIN? ${nick}. THAT'S WHAT THEY CALL THEM OUT ON THE LANES.'`); }
  if ((p.races ?? 0) >= 1) pool.push("'SOMEBODY RAN THE RINGS UNDER PAR LAST WEEK. THE MARSHAL'S STILL TALKING ABOUT IT.'");
  if (p.raceBeaten?.[st.id]) pool.push("'THE COURSE RECORD HERE FELL. NEW NAME ON THE BOARD IN THE BAR.'");
  if ((p.postRuns ?? 0) >= 3) pool.push("'THE MAIL CAME EARLY. I DIDN'T KNOW WHAT TO DO WITH MYSELF.'");
  { const bc = borderContest(w); if (bc && bc.systemId === sys.id) pool.push(`'THE ${faction(bc.challenger).name.toUpperCase()} WANT THIS SYSTEM. LET THEM TRY. OR DON'T. DEPENDS WHO PAYS BETTER.'`, "'CONTESTED WEEK. EVERY CRATE THAT LANDS HERE COUNTS FOR SOMEBODY.'"); }
  if ((p.stakes?.[st.id] ?? 0) >= 10) pool.push("'THAT CAPTAIN OWNS A PIECE OF THIS PLACE. MIND WHAT YOU SAY ABOUT THE BERTH FEES.'");
  const docks = dockingsAt(p, st.id);
  if (docks >= 6) pool.push("'THAT'S THE ONE WHO'S ALWAYS IN. THE REGULAR. HARBOURMASTER LIKES THEM.'");
  if ((p.rescues ?? 0) >= 3) pool.push("'THAT CAPTAIN OVER THERE? PULLED A FREIGHTER OUT OF A FIGHT. I SAW THE WIRE.'");
  if ((p.discoveries ?? 0) >= 3) pool.push("'THEY'VE LOGGED SYSTEMS NOBODY HAD NAMES FOR. YOU CAN SEE IT ON THE MAP.'");
  if (isHome(p, st.id)) pool.push("'THAT'S ONE OF OURS. HOME PORT HERE. DON'T OVERCHARGE THEM.'");
  if ((p.wanted ?? 0) > 0.3) pool.push("'DON'T LOOK. THAT ONE'S GOT A WARRANT SOMEWHERE. I'D BET ON IT.'");
  if (st.museum?.length) pool.push(`'THE MUSEUM'S GOT A NEW PIECE. ${(st.museum[st.museum.length - 1].by || "SOMEBODY").toUpperCase()} GAVE IT. IMAGINE GIVING THAT AWAY.'`);
  const fr = friendsAt(w, st.id)[0];
  if (fr) pool.push(`'${fr.name.toUpperCase()} OF THE ${fr.ship.toUpperCase()} WAS ASKING AFTER A CAPTAIN. FRIEND OF THEIRS, APPARENTLY.'`);
  const rv = rivalOf(w);
  if (rv) pool.push(`'${rv.name.toUpperCase()} WAS IN THE BAR COMPLAINING ABOUT SOME CAPTAIN AGAIN. LOUDLY.'`);
  const inf = infraAt(w, sys.id)[0];
  if (inf) pool.push(inf.owner !== "THE KEEPER" ? "'SOMEBODY PUT A LIGHT OUT IN THE DARK. HAULERS TALK ABOUT IT LIKE IT'S A SAINT.'" : `'THERE'S A ${inf.kind.toUpperCase()} OUT PAST THE GATE NOW. SOMEBODY'S MAKING MONEY.'`);
  if (sys.pirateActivity > 0.5) pool.push("'TWO SHIPS LOST ON THE INNER LANE THIS MONTH. NOBODY'S SAYING PIRATES. EVERYBODY MEANS PIRATES.'");
  const hi = Object.keys(st.prices).map((id) => ({ id, r: (st.prices[id] ?? 0) / (commodity(id).base || 1) })).sort((a, b) => b.r - a.r)[0];
  if (hi && hi.r > 1.3) pool.push(`'${commodity(hi.id).name.toUpperCase()} IS THROUGH THE ROOF HERE. IF YOU'VE GOT ANY, NOW'S THE TIME.'`);
  const lo = Object.keys(st.prices).map((id) => ({ id, r: (st.prices[id] ?? 0) / (commodity(id).base || 1) })).sort((a, b) => a.r - b.r)[0];
  if (lo && lo.r < 0.8) pool.push(`'THEY CAN'T GIVE ${commodity(lo.id).name.toUpperCase()} AWAY. THE WAREHOUSE IS FULL OF IT.'`);
  if (st.factionId) pool.push(`'${faction(st.factionId).name.toUpperCase()} PATROL WAS THROUGH. CHECKED EVERY MANIFEST. TOOK ALL DAY.'`);
  const local = p.crew.find((c) => c.home === st.id);
  if (local) pool.push(`'THAT'S ${local.name.split(" ")[0].toUpperCase()}'S SHIP. LOCAL KID. WENT OFF TO THE LANES AND CAME BACK WITH A CAPTAIN.'`);
  const shore = (p.shoreCrew ?? []).find((s) => s.stationId === st.id);
  if (shore) pool.push(`'${shore.member.name.toUpperCase()} FROM THAT SHIP IS ON LEAVE HERE. GOOD COMPANY. TERRIBLE AT CARDS.'`);
  const home = p.homePort && p.homePort !== st.id ? findStation(w, p.homePort)?.st.name : null;
  if (home) pool.push(`'THAT CAPTAIN'S FROM ${home.toUpperCase()}, THEY SAY. LONG WAY FROM HOME.'`);
  if (st.factionId !== "vex") { const issue = weeklyIssue(w, st.factionId); const r = voteResult(w, st.factionId); pool.push(`'${issue.title}? ${r.passed ? "IT'LL PASS. THE HOUSE WANTS IT." : "IT'LL FAIL. NOBODY WANTS TO PAY FOR IT."} HAVE YOU VOTED?'`); }
  const hr = stationHour(st);
  if (hr.night) pool.push("'NIGHT SHIFT. YOU GET THE GOOD SILENCE AND THE BAD COFFEE.'", "'WHO DOCKS AT THIS HOUR? SOMEBODY WHO DOESN'T WANT TO BE SEEN DOCKING.'");
  else if (hr.h < 11) pool.push("'MORNING. DON'T TALK TO ME UNTIL THE SECOND CUP.'");
  const line = rng.pick(pool);
  return [line, ...pool.filter((l) => l !== line)];
}
