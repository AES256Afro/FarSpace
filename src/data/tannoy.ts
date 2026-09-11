// Station hours and the tannoy. Every station keeps its own clock, offset from
// the real one, so somewhere it is always the night shift. The tannoy says what
// a station says: bay calls, lost property, last calls, and the odd kindness.

import type { World, StationDef } from "../world";
import { crisisAt, galaxyEventAt, findStation, captainNickname, borderContest, weekKey, berthedCaptains, isRival, isBeltStation } from "../world";
import { hull } from "./hulls";
import { commodity, faction } from "./data";
const facName = (id: string) => faction(id).name;
import { RNG, hashStr } from "../core/rng";
import { isOccasion } from "./occasions";
import { voteMods } from "./votes";

export function stationHour(st: StationDef, now = Date.now()): { h: number; m: number; label: string; night: boolean } {
  const d = new Date(now);
  const h = (d.getUTCHours() + (hashStr(`clock:${st.id}`) % 24)) % 24;
  const m = d.getUTCMinutes();
  const label = h < 5 ? "NIGHT SHIFT" : h < 11 ? "MORNING" : h < 17 ? "DAY SHIFT" : h < 22 ? "EVENING" : "NIGHT SHIFT";
  return { h, m, label, night: h < 5 || h >= 22 };
}
// Station hours matter: the yard charges a night rate, the early shift is keen, and the lounge fills after dark.
export function hoursRate(st: StationDef, now = Date.now()): { mul: number; label: string; lounge: number } {
  const t = stationHour(st, now);
  if (t.night) return { mul: 1.15, label: "NIGHT RATE", lounge: 0.75 };
  if (t.h < 11) return { mul: 0.9, label: "EARLY SHIFT", lounge: 0.35 };
  if (t.h >= 17) return { mul: 1, label: "", lounge: 0.75 };
  return { mul: 1, label: "", lounge: 0.5 };
}
export function clockText(t: { h: number; m: number }): string { return `${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}`; }

export function tannoyLines(w: World, st: StationDef, rng: RNG, now = Date.now()): string[] {
  const p = w.player; const sys = findStation(w, st.id)?.sys ?? w.systems[p.systemId];
  const t = stationHour(st, now);
  const pool: string[] = [
    `BAY ${rng.int(1, 9)} IS CLEAR FOR DEPARTURE. MIND THE TRAFFIC.`,
    `WOULD THE OWNER OF THE ${rng.pick(["FREIGHTER", "SCOUT", "PROSPECTOR", "SHUTTLE"])} IN BAY ${rng.int(1, 9)} RETURN TO THEIR SHIP. IT IS LEAKING.`,
    `LOST: ONE CAT, ${rng.pick(["GINGER", "GREY", "BLACK AND WHITE"])}, ANSWERS TO NOTHING. TRY THE GALLEY DECK.`,
    "THE OBSERVATION DECK IS OPEN. THE VIEW IS FREE. THE COFFEE IS NOT.",
    `${st.name.toUpperCase()} REMINDS ALL CREWS THAT THE PROMENADE IS A NO-THRUST ZONE. THIS MEANS YOU.`,
    "SHIFT CHANGE IN TEN MINUTES. CLEAR THE AIRLOCK CORRIDOR.",
    "THE RING RACE MARSHAL IS TAKING ENTRIES IN THE LOUNGE. PAR IS PAR. NOBODY ARGUES WITH PAR.",
    "THE POST OFFICE THANKS THE CAPTAINS WHO CARRY THE BAG. THE REST OF YOU KNOW WHO YOU ARE.",
    "A REMINDER THAT THE GUESTBOOK IN THE LOUNGE IS FOR PASSENGERS. NOT FOR POETRY. NOT AGAIN.",
    "WOULD THE CREW SINGING IN BAY SIX PLEASE STOP, OR AT LEAST AGREE ON A KEY.",
    "THE VOTE CLOSES MONDAY. THE HOUSE HAS AN OPINION. THE HOUSE ALWAYS HAS AN OPINION.",
    "MESS IS SERVED ON THE CREW DECK. IT IS WHAT IT IS. THERE ARE SECONDS.",
    "A HAULER HAS DOCKED WITH A CRATE THAT SAYS 'CAT'. THE CRATE IS PURRING. OWNER TO BAY THREE.",
    "CONVOYS FORMING FOR THE GATE SHOULD FORM UP PROPERLY. THAT WAS NOT A CONVOY. THAT WAS A CROWD.",
  ];
  const links = sys.links.map((l) => w.systems[l]).filter(Boolean);
  if (links.length) pool.push(`LAST CALL FOR THE LINER TO ${rng.pick(links).name.toUpperCase()}. BAY ${rng.int(1, 9)}. LAST CALL.`);
  if (isOccasion("lanes", now)) pool.push("RACE DAY. THE MARSHAL PAYS HALF AGAIN AT THE RINGS. NO, HE DOESN'T KNOW WHY EITHER.");
  if (isBeltStation(st)) pool.push("WATER RATION IS WATER RATION. THE BAR DOES NOT COUNT. THE BAR NEVER COUNTS.", "INNER-SYSTEM CREWS ARE REMINDED THAT THE SPIN HERE IS LOW AND THE CEILINGS ARE NOT. MIND YOUR HEADS.", "SCRUBBER FILTERS ARE ON THE BOARD AT COST. NOBODY GOES SHORT OF AIR ON THIS ROCK. NOBODY.", p.flags?.belt ? "THE CAPTAIN WHO SHARED AIR OUT ON THE LANE IS IN. THE YARD KNOWS. THE YARD REMEMBERS." : "A HOPPER CAME IN ON HALF A TANK LAST WEEK. IF YOU'RE THE ONE WHO SHARED, THE BELT'S BUYING.");
  if (t.night) pool.push("NIGHT SHIFT. KEEP THE NOISE DOWN ON THE PROMENADE. THE DAY CREW ARE ASLEEP ABOVE YOU.", "THE BAR IS OPEN. NOTHING ELSE IS. GOODNIGHT.");
  else if (t.h < 11) pool.push("GOOD MORNING. THE WATER RATION IS NORMAL. THE COFFEE RATION IS NOT.");
  else if (t.h >= 17) pool.push("EVENING. THE MARKET CLOSES IN AN HOUR. THE BAR DOES NOT.");
  const cr = crisisAt(w, st.id);
  if (cr) pool.push(`ANY SHIP CARRYING ${commodity(cr.commodityId).name.toUpperCase()}: REPORT TO THE HARBOURMASTER. THE STATION IS GRATEFUL IN ADVANCE.`);
  const ev = galaxyEventAt(w, sys.id);
  if (ev?.kind === "festival" && ev.stationId === st.id) pool.push("THE FESTIVAL CONTINUES ON THE UPPER RING. LOST CHILDREN TO THE HARBOUR OFFICE. LOST PARENTS TO THE BAR.");
  if (ev?.kind === "flare") pool.push("SOLAR FLARE IN PROGRESS. DEPARTURES SUNWARD ARE AT YOUR OWN RISK.");
  if (ev?.kind === "strike" && ev.stationId === st.id) pool.push("YARD SERVICES ARE SUSPENDED. THE MANAGEMENT REGRETS. THE PICKET DOES NOT.");
  if (t.night && voteMods(w, st.factionId).curfew) pool.push("CURFEW IS IN FORCE ON THE PROMENADE. THE BAR IS EXEMPT. THE BAR IS ALWAYS EXEMPT.");
  { const bc = borderContest(w); if (bc && bc.systemId === sys.id) pool.push(`${st.name.toUpperCase()} REMINDS ALL CREWS THAT ${sys.name.toUpperCase()} IS, AND REMAINS, ${facName(bc.incumbent).toUpperCase()} SPACE. SUPPLY RUNS ARE POSTED ON THE BOARD.`); }
  if (p.regatta === 3 && p.dockedAt === st.id) pool.push("THE REGATTA CHAMPION IS ON THE STATION. THE MARSHAL ASKS THAT NOBODY MAKE A FUSS. THE MARSHAL IS MAKING A FUSS.");
  const nick = captainNickname(w);
  if (nick) pool.push(`${st.name.toUpperCase()} WISHES ${nick} A SAFE LANE. THAT'S NOT A STANDARD ANNOUNCEMENT. SOMEBODY IN CONTROL LIKES YOU.`);
  for (const c of berthedCaptains(w, st.id, now)) pool.push(isRival(c) ? `THE ${c.ship.toUpperCase()} IS BERTHED IN BAY 2. CONTROL ASKS THAT NOBODY START ANYTHING ON THE PROMENADE. AGAIN.` : `THE ${c.ship.toUpperCase()} IS BERTHED IN BAY 2. ${c.name.split(" ")[0].toUpperCase()} SENDS REGARDS TO ANYONE WHO KNOWS THEM. THE BAR KNOWS THEM.`);
  const shipName = (p.shipName ?? hull(p.hullId).name).toUpperCase().replace(/^THE /, "");
  if (p.dockedAt === st.id) pool.push(`THE ${shipName} IS BERTHED IN BAY 4. CREW SHORE LEAVE ENDS WHEN THE CAPTAIN SAYS SO.`);
  if ((p.shoreCrew ?? []).some((s) => s.stationId === st.id)) pool.push("WOULD CREW ON SHORE LEAVE PLEASE STOP SLEEPING IN THE OBSERVATION LOUNGE. THERE ARE BUNKS FOR THAT.");
  // PAGING: the station knows who is aboard and what they have left undone. These go in twice so they come round sooner.
  if (p.dockedAt === st.id) {
    const ship = shipName;
    const page: string[] = [];
    if ((p.mail ?? []).some((m) => !m.replied && w.time - m.dueT < 1800)) page.push(`WOULD THE CAPTAIN OF THE ${ship} COLLECT THEIR MAIL FROM THE HARBOUR OFFICE. IT HAS BEEN THERE A WHILE. IT IS HANDWRITTEN.`);
    if (p.cat && p.catAway === st.id) page.push(`WOULD THE OWNER OF ${p.cat.name.toUpperCase()} COLLECT THEM FROM THE PROMENADE. THE HARBOUR OFFICE IS OUT OF FISH AND PATIENCE.`);
    const waiting = p.crew.find((c) => c.home === st.id && !c.sick && !(p.flags ?? {})[`family:${st.id}:${c.name}:${weekKey(now)}`]);
    if (waiting) page.push(`A MESSAGE FOR THE CAPTAIN OF THE ${ship}: ${waiting.name.split(" ")[0].toUpperCase()}'S PEOPLE ARE ON THE PROMENADE. THEY HAVE BEEN WAITING ALL WEEK.`);
    const due = p.missions.find((m) => m.accepted && !m.done && m.targetStationId === st.id && (m.kind === "delivery" || m.kind === "post" || m.kind === "passenger"));
    if (due) page.push(due.kind === "passenger" ? `WOULD THE ${ship} PLEASE LET ITS PASSENGERS OFF. THEY CAN SEE THE PROMENADE FROM THE PORTHOLE. IT IS CRUEL.` : `THE HARBOURMASTER IS EXPECTING A CONSIGNMENT FROM THE ${ship}. ANY TIME NOW WOULD BE FINE. ANY TIME AT ALL.`);
    if (p.hull < p.hullMax * 0.4) page.push(`THE ${ship} IN BAY 4 IS TRAILING SOMETHING. THE YARD HAS BEEN INFORMED. THE YARD IS NOT HAPPY, BUT THE YARD IS OPEN.`);
    if (p.fuel < p.fuelMax * 0.15) page.push(`THE ${ship} IN BAY 4 CAME IN ON FUMES. CONTROL WOULD LIKE A WORD. CONTROL WOULD ALSO LIKE YOU TO BUY FUEL.`);
    for (const l of page) pool.push(l, l);
  }
  return pool;
}
