import { findStation, type World } from "../world";

export interface DockVisit { stationId: string; startedAt: number; settled: boolean }

// A completed approach, rescue or liner arrival starts a visit explicitly.
export function beginDockVisit(w: World, stationId: string): boolean {
  const found = findStation(w, stationId);
  if (!found || found.sys.id !== w.player.systemId) return false;
  w.player.dockedAt = stationId;
  w.player.dockVisit = { stationId, startedAt: w.time, settled: false };
  return true;
}

export function currentDockVisit(w: World): DockVisit | null {
  const p = w.player, found = findStation(w, p.dockedAt ?? "");
  if (!found || found.sys.id !== p.systemId) return null;
  // Older docked saves have already paid for arrival. Loading is not a new trip.
  if (!p.dockVisit || p.dockVisit.stationId !== p.dockedAt) p.dockVisit = { stationId: found.st.id, startedAt: w.time, settled: true };
  return p.dockVisit;
}
