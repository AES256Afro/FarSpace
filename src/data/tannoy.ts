// Station hours and the tannoy. Every station keeps its own clock, offset from
// the real one, so somewhere it is always the night shift. The tannoy says what
// a station says: bay calls, lost property, last calls, and the odd kindness.

import type { World, StationDef } from "../world";
import { crisisAt, galaxyEventAt, findStation, captainNickname, borderContest } from "../world";
import { hull } from "./hulls";
import { commodity, faction } from "./data";
const facName = (id: string) => faction(id).name;
import { RNG, hashStr } from "../core/rng";
import { voteMods } from "./votes";

export function stationHour(st: StationDef, now = Date.now()): { h: number; m: number; label: string; night: boolean } {
  const d = new Date(now);
  const h = (d.getUTCHours() + (hashStr(`clock:${st.id}`) % 24)) % 24;
  const m = d.getUTCMinutes();
  const label = h < 5 ? "NIGHT SHIFT" : h < 11 ? "MORNING" : h < 17 ? "DAY SHIFT" : h < 22 ? "EVENING" : "NIGHT SHIFT";
  return { h, m, label, night: h < 5 || h >= 22 };
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
  const nick = captainNickname(w);
  if (nick) pool.push(`${st.name.toUpperCase()} WISHES ${nick} A SAFE LANE. THAT'S NOT A STANDARD ANNOUNCEMENT. SOMEBODY IN CONTROL LIKES YOU.`);
  if (p.dockedAt === st.id) pool.push(`THE ${(p.shipName ?? hull(p.hullId).name).toUpperCase()} IS BERTHED IN BAY 4. CREW SHORE LEAVE ENDS WHEN THE CAPTAIN SAYS SO.`);
  if ((p.shoreCrew ?? []).some((s) => s.stationId === st.id)) pool.push("WOULD CREW ON SHORE LEAVE PLEASE STOP SLEEPING IN THE OBSERVATION LOUNGE. THERE ARE BUNKS FOR THAT.");
  return pool;
}
