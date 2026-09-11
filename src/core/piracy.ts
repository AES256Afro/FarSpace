import { logEntry, type World } from "../world";

export const PIRATE_PASSAGE_SECONDS = 180;

export function piratePassageRemaining(w: World): number {
  return Math.max(0, w.player.piratePassage?.[w.player.systemId] ?? 0);
}

export function piratesPeaceful(w: World): boolean {
  return (w.player.rep.vex ?? 0) >= 40 || piratePassageRemaining(w) > 0;
}

export function grantPiratePassage(w: World): void {
  (w.player.piratePassage ??= {})[w.player.systemId] = PIRATE_PASSAGE_SECONDS;
  logEntry(w, `Corsairs granted three flight minutes of safe passage in ${w.systems[w.player.systemId].name}.`);
}

export function breakPiratePassage(w: World): boolean {
  if (!piratePassageRemaining(w)) return false;
  delete w.player.piratePassage![w.player.systemId];
  logEntry(w, "Safe passage ended after our weapons struck a corsair.");
  return true;
}

// Flight time counts in every system; docking and menus do not consume passage.
export function tickPiratePassage(w: World, dt: number): boolean {
  if (!Number.isFinite(dt) || dt <= 0) return false;
  const before = piratePassageRemaining(w);
  for (const [id, remaining] of Object.entries(w.player.piratePassage ?? {})) {
    const next = Math.max(0, remaining - Math.min(dt, 1));
    if (next > 1e-8) w.player.piratePassage![id] = next;
    else delete w.player.piratePassage![id];
  }
  return before > 0 && piratePassageRemaining(w) === 0;
}
