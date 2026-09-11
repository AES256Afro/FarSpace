import type { CrewMember } from "../data/crew";
import { RETIRE_DOCKS } from "../data/crew";
import { hashStr } from "./rng";
import { findStation, ledger, logEntry, navRoute, permitDenied, retireCrew } from "../world";
import type { World } from "../world";

// A last journey is a crew promise. It has no time or docking limit.
export function lastLegDestination(w: World, c: CrewMember) {
  if (!w.player.crew.includes(c) || (c.docks ?? 0) < RETIRE_DOCKS || c.lastLeg) return null;
  const candidates = Object.values(w.systems).filter(sys => !permitDenied(w, sys.id)
    && navRoute(w, w.player.systemId, sys.id)).flatMap(sys => sys.stations
    .filter(st => st.id !== w.player.dockedAt).map(st => ({ sys, st })));
  const home = candidates.find(x => x.st.id === c.home);
  if (home) return home;
  const civil = candidates.filter(x => !x.st.military);
  const pool = (civil.length ? civil : candidates).sort((a, b) => a.st.id.localeCompare(b.st.id));
  return pool.length ? pool[hashStr(`${w.seed}:${c.name}:last-leg`) % pool.length] : null;
}

export function plotLastLeg(w: World, c: CrewMember): boolean {
  if (!w.player.crew.includes(c) || !c.lastLeg) return false;
  const dest = findStation(w, c.lastLeg.stationId);
  if (!dest || permitDenied(w, dest.sys.id) || !navRoute(w, w.player.systemId, dest.sys.id)) return false;
  w.player.navTarget = dest.sys.id;
  w.player.navStationId = dest.st.id;
  w.player.singersCourse = false;
  return true;
}

export function stationCourseTarget(w: World): { x: number; y: number; label: string } | null {
  const p = w.player;
  if (!p.navStationId) return null;
  const dest = findStation(w, p.navStationId);
  if (!dest || p.singersCourse || (p.navTarget && p.navTarget !== dest.sys.id)) {
    delete p.navStationId; return null;
  }
  if (dest.sys.id !== p.systemId) return null;
  return { x: Math.cos(dest.st.angle) * dest.st.orbit, y: Math.sin(dest.st.angle) * dest.st.orbit,
    label: dest.st.name.toUpperCase() };
}

export function beginLastLeg(w: World, c: CrewMember, stationId: string): boolean {
  const dest = lastLegDestination(w, c);
  if (!dest || dest.st.id !== stationId) return false;
  c.lastLeg = { stationId, startedAt: w.time };
  c.retireAsked = true;
  c.request = null;
  c.loyalty = (c.loyalty ?? 0) + 0.5;
  plotLastLeg(w, c);
  logEntry(w, `Promised ${c.name} a final journey to ${dest.st.name}, ${dest.sys.name}`);
  return true;
}

export function lastLegAtPort(w: World, c: CrewMember): boolean {
  const dest = c.lastLeg && findStation(w, c.lastLeg.stationId);
  return w.player.crew.includes(c) && !!dest && w.player.dockedAt === dest.st.id
    && w.player.systemId === dest.sys.id;
}

export function lastLegObjective(w: World, c: CrewMember): string | null {
  if (!w.player.crew.includes(c) || !c.lastLeg) return null;
  const dest = findStation(w, c.lastLeg.stationId);
  if (!dest) return "LAST JOURNEY: THE PORT IS MISSING FROM THE CHART";
  return lastLegAtPort(w, c) ? `FAREWELL ON ${dest.st.name.toUpperCase()}'S DECK (P FROM SERVICES)`
    : `LAST JOURNEY: ${dest.st.name.toUpperCase()}, ${dest.sys.name.toUpperCase()}`;
}

export function lastLegTalk(w: World, c: CrewMember): string | null {
  if (!c.lastLeg || !w.player.crew.includes(c)) return null;
  const dest = findStation(w, c.lastLeg.stationId);
  if (!dest) return `${c.name.toUpperCase()}: THE CHART HAS LOST MY PORT. I'M STILL HERE.`;
  return lastLegAtPort(w, c)
    ? `${c.name.toUpperCase()}: THIS IS IT. I'LL MEET YOU ON THE STATION DECK. I'D RATHER NOT SAY GOODBYE TO A CONSOLE.`
    : `${c.name.toUpperCase()}: ${dest.st.name.toUpperCase()}, WHEN WE GET THERE. NO HURRY. I'VE STILL GOT A WATCH TO FINISH.`;
}

export function finishLastLeg(w: World, c: CrewMember, bonus: boolean): string | null {
  if (!lastLegAtPort(w, c) || (bonus && w.player.credits < 300)) return null;
  const p = w.player, dest = findStation(w, c.lastLeg!.stationId)!;
  if (bonus) { p.credits -= 300; ledger(p, "crew", -300); }
  const alumnus = retireCrew(p, c, dest.st.id, w.time);
  alumnus.finalJourney = true;
  if (p.numberOne === c.name) delete p.numberOne;
  if (p.navStationId === dest.st.id) { delete p.navStationId; p.navTarget = null; }
  for (const other of p.crew) {
    other.morale = Math.min(100, other.morale + (bonus ? 8 : 5));
    other.loyalty = (other.loyalty ?? 0) + (bonus ? 0.5 : 0.3);
  }
  const keepsake = `${c.name}'s watch tally, folded inside an old route chart`;
  (p.keepsakes ??= []).push(keepsake);
  if (p.keepsakes.length > 8) p.keepsakes.shift();
  const work = c.role === "engineer" ? "The yard hired me to listen to an engine. I found the fault before they found the paperwork."
    : c.role === "medic" ? "The clinic has a window. I keep checking it for hull cracks. The patients find this reassuring."
    : c.role === "pilot" ? "I fly the harbour tug twice a week. It has one throttle and a kettle. I have stopped trying to improve either."
    : "They asked me to teach at the range. The first lesson is when to leave the weapon alone. Nobody expected that.";
  (w.mailQueue ??= []).push({ dueT: w.time + 600, from: `${c.name}, settled at ${dest.st.name}`,
    text: `The bag is unpacked. ${work} I still wake for our watch. It is quieter here than I remembered, which turns out to be what I wanted. You brought me to the place I chose. I have tried writing a longer thank-you and this is the one that fits. Come by when the route allows. There is a chair.`,
  });
  logEntry(w, `${c.name}'s final journey ended at ${dest.st.name}; the crew said goodbye on the deck${bonus ? " with 300 credits for the road" : ""}`);
  return `${c.name.toUpperCase()} HANDS YOU AN OLD ROUTE CHART. THE WATCH TALLY IS FOLDED INSIDE. 'YOU KEEP THE COUNT NOW.' THE BAG GOES OVER ONE SHOULDER. THEY TAKE THREE STEPS, TURN, AND WAVE. THEIR BUNK IS FREE. THEIR NAME STAYS WITH THE SHIP.${bonus ? " 300CR FOR THE ROAD." : ""}`;
}
