// The dock-hand: whoever meets your ship at the clamp. They see the hull before you do,
// and they say so. Regulars get a small favour on the house, once a week.

import { isBeltStation } from "../world";
import type { World, StationDef } from "../world";
import { dockingsAt, hasIllegalCargo, cargoUsed, passengersAboard, weekKey, logEntry } from "../world";
import { hull } from "./hulls";
import { RNG } from "../core/rng";
import { stationHour } from "./tannoy";

export const DOCKHAND_REGULAR_AT = 5;

export function dockhandLines(w: World, st: StationDef, rng: RNG, now = Date.now()): string[] {
  const p = w.player;
  const ship = (p.shipName ?? hull(p.hullId).name).replace(/^The /, "");
  const docks = dockingsAt(p, st.id);
  const pool: string[] = [];
  if (p.hull < p.hullMax * 0.5) pool.push(`'What did you hit? No, don't tell me. I'll see it in the yard's invoice.'`, `'She's holed forward. I've put a bucket under it. That's a joke. Mostly.'`);
  if (p.hull < p.hullMax * 0.75 && p.hull >= p.hullMax * 0.5) pool.push(`'The hull with the dent. That's what the lanes call you. I could take the dent out. You'd lose the name.'`);
  if (p.flags?.singershome) pool.push(`'Heard you went to the singers' home. Heard they sang. My grandmother said they were a story. I'll tell her she was half right.'`);
  if (p.motto) pool.push(`'Read your plaque while I was under her. "${p.motto}". Don't see many that mean it. Yours might.'`);
  if (p.flags?.freeman && isBeltStation(st)) pool.push(`'Freeman's hull. Yard rate's fifteen under and I've already taken it off. Don't thank me. Thank the rock.'`);
  if (p.flags?.rockkid) pool.push(`'My kid's got your ship on the wall. With a dog. You don't have a dog, do you? ... Thought not.'`);
  if (p.flags?.recorder) pool.push(`'Heard you brought a recorder home off a wreck. Good. Somebody should. Nobody brought mine.'`);
  if ((p.prisoners ?? 0) > 0) pool.push(`'Marines were at your clamp last time. Prisoner run? ... Fed them, I heard. That gets round.'`);
  if (p.systemNicks && Object.keys(p.systemNicks).length) pool.push(`'Your engineer told me the reactor's called ${Object.values(p.systemNicks)[0]}. I've written it on the work order. The yard'll love that.'`);
  if ((p.wear ?? 0) >= 40) pool.push(`'She rattles on the clamp. That's hours, not damage. Book her a service before she books herself one.'`);
  if (p.fuel < p.fuelMax * 0.2) pool.push(`'Came in on fumes, did we? The pump's that way. So's the bar. Pump first.'`);
  if (hasIllegalCargo(p)) pool.push(`'I didn't look in your hold. I never look in anyone's hold. That's why they keep me on.'`);
  if (cargoUsed(p) >= p.cargoMax && p.cargoMax > 0) pool.push(`'Full to the seals. Mind the clamp rail on the way out, she'll sit low.'`);
  if (passengersAboard(p).length) pool.push(`'Fares aboard? They looked green coming down the gangway. Smooth flying, or better sick bags.'`);
  if (p.cat) pool.push(`'${p.cat.name} came to the airlock to look at me. Judged and found wanting, I think.'`);
  if ((p.modules ?? []).includes("scoop")) pool.push(`'Scoop intake's scorched. You've been kissing stars. Rinse it or it'll clog.'`);
  if (p.crew.length === 0) pool.push(`'Flying her alone? Brave. Or nobody will sign on. I don't ask which.'`);
  if (docks >= DOCKHAND_REGULAR_AT) pool.push(`'${ship}. Back again. Bay's warm, clamp's greased. Go on, the deck's yours.'`, `'I know that hull by the sound of her thrusters now. That's either a compliment or a warning.'`);
  else pool.push(`'New face. ${ship}, is it? I'll remember the hull if not the name.'`);
  if (stationHour(st, now).night) pool.push(`'Night shift. Just me and the clamps. Keep your boots quiet on the deck, the day crew are above us.'`);
  pool.push(`'Clamp's on. She's not going anywhere without me, and I'm not going anywhere without coffee.'`, `'Every ship that docks here tells me something. Yours says she's been places.'`);
  return pool;
}

// Once a week, a regular gets a small favour on the house: a patch, a splash of fuel, or a greased clamp.
export function dockhandFavour(w: World, st: StationDef, rng: RNG, now = Date.now()): string | null {
  const p = w.player;
  if (dockingsAt(p, st.id) < DOCKHAND_REGULAR_AT) return null;
  const key = `dockhand:${st.id}:${weekKey(now)}`;
  if ((p.flags ?? {})[key]) return null;
  (p.flags ??= {})[key] = true;
  const kinds: string[] = [];
  if (p.hull < p.hullMax) kinds.push("patch");
  if (p.fuel < p.fuelMax) kinds.push("fuel");
  if ((p.wear ?? 0) > 5) kinds.push("wear");
  if (!kinds.length) return `THE DOCK-HAND LOOKS HER OVER AND FINDS NOTHING TO DO. "THAT'S A FIRST. GO ON, THEN."`;
  const k = rng.pick(kinds);
  logEntry(w, `The dock-hand at ${st.name} did a small job on the house`);
  if (k === "patch") { const n = Math.min(8, p.hullMax - p.hull); p.hull += n; return `THE DOCK-HAND PUTS A PLATE OVER THE WORST OF IT. +${n} HULL, ON THE HOUSE. "DON'T TELL THE YARD."`; }
  if (k === "fuel") { const n = Math.min(5, p.fuelMax - p.fuel); p.fuel += n; return `THE DOCK-HAND SPLASHES A LITTLE IN THE TANK. +${n} FUEL, ON THE HOUSE. "IT WAS GOING SPARE."`; }
  p.wear = Math.max(0, (p.wear ?? 0) - 8); return `THE DOCK-HAND GREASES WHAT RATTLES. WEAR -8, ON THE HOUSE. "SHE'LL STOP COMPLAINING FOR A WEEK."`;
}
