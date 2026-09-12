import { findStation, jumpFuelCost, navRoute, permitDenied, type World, type Mission } from "../world";

export interface FlightSchoolState {
  version: 1;
  homeStationId: string;
  paidSteps: number[];
  thrustSeen?: boolean;
  brakeSeen?: boolean;
  missionId?: string;
  destinationStationId?: string;
  delivered?: boolean;
  saved?: boolean;
}

export function validFlightSchool(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const s = value as FlightSchoolState;
  return s.version === 1 && typeof s.homeStationId === "string" && s.homeStationId.length > 0
    && Array.isArray(s.paidSteps) && s.paidSteps.every(n => Number.isInteger(n) && n >= 0 && n < 6)
    && [s.thrustSeen, s.brakeSeen, s.delivered, s.saved].every(v => v === undefined || typeof v === "boolean")
    && [s.missionId, s.destinationStationId].every(v => v === undefined || typeof v === "string");
}

export function schoolActive(w: World): boolean {
  const p = w.player;
  return !!p.flightSchool && (p.tutorial ?? -1) >= 0 && p.tutorial! < 6;
}

export function schoolDeliveryTarget(w: World) {
  const s = w.player.flightSchool, home = s && findStation(w, s.homeStationId);
  if (!home) return null;
  if (s?.destinationStationId) return findStation(w, s.destinationStationId);
  const candidates = [home.sys, ...home.sys.links.map(id => w.systems[id]).filter(Boolean)]
    .filter(sys => sys.factionId !== "vex" && !permitDenied(w, sys.id) && navRoute(w, home.sys.id, sys.id)
      && (sys.id === home.sys.id || jumpFuelCost(w, home.sys.id, sys.id) * 2 + 20 <= w.player.fuelMax))
    .flatMap(sys => sys.stations.filter(st => !st.military && st.id !== home.st.id && (w.player.rep[st.factionId] ?? 0) >= -20).map(st => ({ sys, st })));
  const localDistance = (st: typeof home.st) => Math.hypot(Math.cos(st.angle) * st.orbit - Math.cos(home.st.angle) * home.st.orbit, Math.sin(st.angle) * st.orbit - Math.sin(home.st.angle) * home.st.orbit);
  candidates.sort((a, b) => Number(a.sys.id !== home.sys.id) - Number(b.sys.id !== home.sys.id) || (a.sys.id === b.sys.id && a.sys.id === home.sys.id ? localDistance(a.st) - localDistance(b.st) : a.st.id.localeCompare(b.st.id)));
  return candidates[0] ?? null;
}

export function schoolOffer(w: World, stationId: string): Mission | null {
  const s = w.player.flightSchool;
  if (!schoolActive(w) || !s || s.homeStationId !== stationId || s.delivered || s.missionId) return null;
  const dest = schoolDeliveryTarget(w), home = findStation(w, stationId);
  if (!dest || !home) return null;
  const id = `school-post:${stationId}`;
  if (w.player.missions.some(m => m.id === id)) return null;
  const fuel = dest.sys.id === home.sys.id ? 0 : jumpFuelCost(w, home.sys.id, dest.sys.id);
  return { id, kind: "post", accepted: false, done: false, tier: 0,
    title: `First post: ${dest.st.name}`, desc: `Carry this mail bag to ${dest.st.name} in ${dest.sys.name}. It uses no cargo space and needs no crew. ${fuel ? `One jump each way; ${fuel} fuel per jump with your current ship. Keep fuel for the return.` : "Both ports are in this system. No jump is needed."} Dock there and collect 180cr in Missions, then return to ${home.st.name}.`,
    fromStationId: stationId, targetSystemId: dest.sys.id, targetStationId: dest.st.id, reward: 180, repReward: 2 };
}

export function schoolAccepted(w: World, m: Mission): void {
  const s = w.player.flightSchool;
  if (!schoolActive(w) || !s || !m.accepted || m.id !== `school-post:${s.homeStationId}`) return;
  s.missionId = m.id; s.destinationStationId = m.targetStationId;
}

export function schoolDestination(w: World) {
  const s = w.player.flightSchool;
  if (!schoolActive(w) || !s || w.player.tutorial === 0) return null;
  return findStation(w, w.player.tutorial === 3 ? s.destinationStationId ?? "" : s.homeStationId);
}
