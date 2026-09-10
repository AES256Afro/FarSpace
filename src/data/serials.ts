// GalNet serials: stories that develop over a few dockings and end in something
// you can act on: a contract on a board, a premium at a market, a name in a
// lounge. One runs at a time; the NEWS tab keeps every part so far.

import type { World, Mission, SystemDef, StationDef } from "../world";
import { findStation, pushEvent } from "../world";
import { genPersonName } from "./data";
import { RNG } from "../core/rng";

export interface SerialCtx { sys: SystemDef; st: StationDef; name: string; other: SystemDef }
export type SerialHook =
  | { kind: "mission"; mission: (w: World, c: SerialCtx) => Mission }
  | { kind: "premium"; commodityId: string; mult: number }
  | { kind: "recruit"; role: "engineer" | "gunner" | "pilot" | "medic" };
export interface SerialDef {
  id: string; title: string;
  parts: ((c: SerialCtx) => string)[];   // headlines with bodies, part by part
  hook: SerialHook;                       // what the last part leaves behind
  hookLine: (c: SerialCtx) => string;     // how the last part says it
}
export interface SerialState { id: string; stage: number; systemId: string; stationId: string; name: string; otherId: string; nextAt: number; startedAt: number; hookUntil: number; lines: string[] }
export const SERIAL_GAP = 300;      // ship seconds between parts
export const SERIAL_HOOK_TTL = 1800; // how long the hook stays on the board

export const SERIALS: SerialDef[] = [
  {
    id: "inquiry", title: "THE HALCYON INQUIRY",
    parts: [
      (c) => `Freighter Halcyon overdue at ${c.st.name}, ${c.sys.name}. Last contact was a routine gate call. The yard says the manifest was ordinary.`,
      (c) => `Halcyon's beacon found drifting in ${c.other.name}: no hull, no crew, no distress call. ${c.name} of the harbour office calls it "not an accident".`,
      (c) => `The Halcyon inquiry blames a rushed yard service at ${c.st.name}. The yard blames the route. A survey contract for the debris field is posted.`,
    ],
    hook: { kind: "mission", mission: (w, c) => ({ id: `serial-inquiry-${Math.floor(w.time)}`, kind: "research", title: "Inquiry: the Halcyon debris", desc: `Deep-scan ${c.other.name} for the Halcyon's black box. The inquiry pays for the truth.`, fromStationId: c.st.id, targetSystemId: c.other.id, reward: 1400, repReward: 5, accepted: false, done: false, tier: 0 }) },
    hookLine: (c) => `A research contract is on the board at ${c.st.name}.`,
  },
  {
    id: "watervote", title: "THE WATER VOTE",
    parts: [
      (c) => `${c.st.name} votes on water rationing after a recycler failure. ${c.name}, speaking for the lower decks: "We are not a mining colony. We are a town."`,
      (c) => `The vote at ${c.st.name} is deadlocked. Water is being trucked in from ${c.other.name} at a loss. Haulers are asked to help.`,
      (c) => `Rationing passes at ${c.st.name} by nine votes. Any water ice landed there this week pays double, by council order.`,
    ],
    hook: { kind: "premium", commodityId: "water", mult: 2 },
    hookLine: (c) => `Water ice sells at ${c.st.name} for double.`,
  },
  {
    id: "drifters", title: "THE DRIFTER QUESTION",
    parts: [
      (c) => `Research post ${c.st.name} publishes on the void drifters: "They orient toward gates. They may be listening." The Compact declines to comment.`,
      (c) => `${c.name}'s drifter paper is challenged from ${c.other.name}: "Correlation with gas giants, nothing more." The argument reaches the bars.`,
      (c) => `${c.st.name} offers a bounty on drifter scans to settle it. Independent pilots with a scanner and patience are asked to log every one they see.`,
    ],
    hook: { kind: "premium", commodityId: "data", mult: 1.6 },
    hookLine: (c) => `Data cores sell at ${c.st.name} for sixty percent more while the drifter question is open.`,
  },
  {
    id: "farewell", title: "A CAPTAIN'S FAREWELL",
    parts: [
      (c) => `${c.name}, forty years on the ${c.sys.name} run, has retired the freighter Steady Hand at ${c.st.name}. The crew are staying on for the party.`,
      (c) => `The Steady Hand has been sold for scrap. ${c.name}'s crew are drinking through the proceeds at ${c.st.name} and, reportedly, looking for a berth.`,
      (c) => `The Steady Hand's chief is done drinking. Skilled, loyal, and in the lounge at ${c.st.name} with a kit bag and opinions.`,
    ],
    hook: { kind: "recruit", role: "engineer" },
    hookLine: (c) => `A skilled engineer is for hire in the lounge at ${c.st.name}.`,
  },
  {
    id: "lightship", title: "THE LIGHTSHIP",
    parts: [
      (c) => `An unregistered beacon has been lit in a dead system off ${c.sys.name}. Nobody knows who planted it. Traffic is already rerouting.`,
      (c) => `The beacon off ${c.sys.name} went dark overnight. Corsairs, or a fault. ${c.name} of ${c.st.name} says the lane has "never been so busy, or so nervous".`,
      (c) => `${c.st.name} will pay for spare parts to relight the lane beacons. Haulers with parts in the hold are asked to land them this week.`,
    ],
    hook: { kind: "premium", commodityId: "parts", mult: 1.8 },
    hookLine: (c) => `Spare parts sell at ${c.st.name} for eighty percent more.`,
  },
  {
    id: "outbreak", title: "THE GREY FLU",
    parts: [
      (c) => `Cases of the grey flu reported aboard three ships out of ${c.st.name}. The station clinic asks crews to stay aboard and rest.`,
      (c) => `The grey flu reaches ${c.other.name}. ${c.name}, clinic chief at ${c.st.name}: "It's not dangerous. It's just everywhere."`,
      (c) => `${c.st.name} lifts its advisory and thanks the medics who flew through it. A courier contract for the vaccine run is posted.`,
    ],
    hook: { kind: "mission", mission: (w, c) => ({ id: `serial-outbreak-${Math.floor(w.time)}`, kind: "delivery", title: "Vaccine run", desc: `Carry four crates of med supplies from ${c.st.name} to ${c.other.stations[0]?.name ?? c.other.name}, ${c.other.name}. The clinic is paying.`, fromStationId: c.st.id, targetSystemId: c.other.id, targetStationId: c.other.stations[0]?.id, commodityId: "med", qty: 4, reward: 1100, repReward: 6, accepted: false, done: false, tier: 0 }) },
    hookLine: (c) => `A vaccine run is on the board at ${c.st.name}.`,
  },
];

export function serialDef(id: string): SerialDef | undefined { return SERIALS.find((s) => s.id === id); }

export function serialCtx(w: World, s: SerialState): SerialCtx | null {
  const f = findStation(w, s.stationId);
  const other = w.systems[s.otherId];
  if (!f || !other) return null;
  return { sys: f.sys, st: f.st, name: s.name, other };
}

// Start one, advance one, retire one. Called from the world tick.
export function tickSerial(w: World, rng: RNG): void {
  const s = w.serial;
  if (s) {
    const def = serialDef(s.id);
    const c = def ? serialCtx(w, s) : null;
    if (!def || !c) { w.serial = null; return; }
    if (s.stage < def.parts.length) {
      if (w.time < s.nextAt) return;
      const line = def.parts[s.stage](c);
      s.lines.push(line); s.stage++; s.nextAt = w.time + SERIAL_GAP;
      pushEvent(w, { t: w.time, kind: "arc", systemId: c.sys.id, text: `${def.title}, part ${s.stage}: ${line}` });
      if (s.stage === def.parts.length) { s.hookUntil = w.time + SERIAL_HOOK_TTL; pushEvent(w, { t: w.time, kind: "arc", systemId: c.sys.id, text: `${def.title}: ${def.hookLine(c)}` }); }
      return;
    }
    if (w.time >= s.hookUntil) w.serial = null; // the story is over; a new one can start
    return;
  }
  if (!rng.chance(0.25)) return;
  const stations = Object.values(w.systems).flatMap((sys) => sys.stations.filter((st) => !st.military).map((st) => ({ sys, st })));
  if (!stations.length) return;
  const recent = (w.serialsSeen ?? []).slice(-3);
  const pool = SERIALS.filter((d) => !recent.includes(d.id));
  const def = rng.pick(pool.length ? pool : SERIALS);
  const { sys, st } = rng.pick(stations);
  const others = sys.links.map((l) => w.systems[l]).filter((o) => o && o.stations.length);
  const other = others.length ? rng.pick(others) : sys;
  w.serial = { id: def.id, stage: 0, systemId: sys.id, stationId: st.id, name: genPersonName(rng), otherId: other.id, nextAt: w.time, startedAt: w.time, hookUntil: 0, lines: [] };
  (w.serialsSeen ??= []).push(def.id);
  if (w.serialsSeen.length > 12) w.serialsSeen.shift();
}

export function serialHookActive(w: World): boolean {
  const s = w.serial; const def = s ? serialDef(s.id) : null;
  return !!(s && def && s.stage >= def.parts.length && w.time < s.hookUntil);
}
// A market premium left behind by a story, at its station, while the hook lasts
export function serialPremium(w: World, stationId: string, commodityId: string): number {
  const s = w.serial; const def = s ? serialDef(s.id) : null;
  if (!s || !def || !serialHookActive(w) || s.stationId !== stationId) return 1;
  return def.hook.kind === "premium" && def.hook.commodityId === commodityId ? def.hook.mult : 1;
}
export function serialMissionFor(w: World, stationId: string): Mission | null {
  const s = w.serial; const def = s ? serialDef(s.id) : null;
  if (!s || !def || !serialHookActive(w) || s.stationId !== stationId || def.hook.kind !== "mission") return null;
  const c = serialCtx(w, s); if (!c) return null;
  if (w.player.missions.some((m) => m.id.startsWith(`serial-${def.id}-`) )) return null;
  return def.hook.mission(w, c);
}
export function serialRecruitFor(w: World, stationId: string): "engineer" | "gunner" | "pilot" | "medic" | null {
  const s = w.serial; const def = s ? serialDef(s.id) : null;
  if (!s || !def || !serialHookActive(w) || s.stationId !== stationId || def.hook.kind !== "recruit") return null;
  return def.hook.role;
}
// What the NEWS tab shows: the title, where, and every part so far
export function serialLines(w: World): { title: string; where: string; parts: string[]; hook: string | null } | null {
  const s = w.serial; const def = s ? serialDef(s.id) : null;
  if (!s || !def) return null;
  const c = serialCtx(w, s); if (!c) return null;
  return { title: def.title, where: `${c.st.name}, ${c.sys.name}`, parts: s.lines, hook: serialHookActive(w) ? def.hookLine(c) : s.stage >= def.parts.length ? "The story has run its course." : null };
}
