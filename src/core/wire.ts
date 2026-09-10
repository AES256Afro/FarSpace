// Fleet Wire: the shared event feed and leaderboards every player sees.
// Posting needs a call sign (chosen once, kept in localStorage). Everything is
// best-effort and never blocks play.

import { cloudBase } from "./cloud";
import type { World } from "../world";

const CALLSIGN_KEY = "farspace-callsign";
const SQUAD_KEY = "farspace-squadron";

export interface WireEvent { t: number; callsign: string; kind: string; text: string; system: string; tag?: string }
export interface BoardEntry { callsign: string; score: number; t: number; tag?: string }

export function getCallsign(): string | null {
  try { return localStorage.getItem(CALLSIGN_KEY); } catch { return null; }
}

export function setCallsign(c: string | null): void {
  try { if (c) localStorage.setItem(CALLSIGN_KEY, c); else localStorage.removeItem(CALLSIGN_KEY); } catch { /* ignore */ }
}

export function getSquadron(): string | null {
  try { return localStorage.getItem(SQUAD_KEY); } catch { return null; }
}
export function setSquadron(tag: string | null): void {
  try { if (tag) localStorage.setItem(SQUAD_KEY, tag); else localStorage.removeItem(SQUAD_KEY); } catch { /* ignore */ }
}
export function validSquadron(t: string): boolean {
  return /^[A-Z0-9]{2,5}$/.test(t);
}
export interface Squadron { tag: string; members: number; credits: number; discoveries: number; kills: number; score: number; standing?: Record<string, number> }
let squadCache: { at: number; squadrons: Squadron[]; patrons: Record<string, string> } | null = null;
export async function fetchSquadrons(force = false): Promise<Squadron[]> {
  return (await fetchSquadronData(force)).squadrons;
}
export async function fetchSquadronData(force = false): Promise<{ squadrons: Squadron[]; patrons: Record<string, string> }> {
  if (!force && squadCache && Date.now() - squadCache.at < 120_000) return squadCache;
  try {
    const r = await fetch(`${cloudBase()}/api/squadrons`);
    if (!r.ok) return squadCache ?? { squadrons: [], patrons: {} };
    const j = (await r.json()) as { squadrons: Squadron[]; patrons: Record<string, string> };
    squadCache = { at: Date.now(), squadrons: j.squadrons, patrons: j.patrons ?? {} };
    return squadCache;
  } catch { return squadCache ?? { squadrons: [], patrons: {} }; }
}
// Patron squadron of a faction, from the last fetch (null until one has happened)
export function patronOf(factionId: string): string | null {
  return squadCache?.patrons[factionId] ?? null;
}
export async function postSquadRep(w: World): Promise<void> {
  const callsign = getCallsign(), tag = getSquadron();
  if (!callsign || !tag) return;
  try {
    await fetch(`${cloudBase()}/api/squad`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ callsign, tag, rep: w.player.rep }),
    });
  } catch { /* offline */ }
}

export function validCallsign(c: string): boolean {
  return /^[A-Z0-9][A-Z0-9 _-]{1,15}$/.test(c);
}

let cache: { events: WireEvent[]; at: number } | null = null;

export async function fetchWire(force = false): Promise<WireEvent[]> {
  if (!force && cache && Date.now() - cache.at < 30_000) return cache.events;
  try {
    const r = await fetch(`${cloudBase()}/api/wire`);
    if (!r.ok) return cache?.events ?? [];
    const j = (await r.json()) as { events: WireEvent[] };
    cache = { events: j.events.slice().reverse(), at: Date.now() };
    return cache.events;
  } catch {
    return cache?.events ?? [];
  }
}

// Posts are silently dropped without a call sign; the title screen offers one.
export async function post(kind: string, text: string, system: string): Promise<void> {
  const callsign = getCallsign();
  if (!callsign) return;
  try {
    await fetch(`${cloudBase()}/api/wire`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ callsign, kind, text: text.slice(0, 140), system: system.slice(0, 32), tag: getSquadron() ?? "" }),
    });
    cache = null;
  } catch { /* offline: fine */ }
}

export async function fetchBoard(name: string): Promise<BoardEntry[]> {
  try {
    const r = await fetch(`${cloudBase()}/api/board/${name}`);
    if (!r.ok) return [];
    return ((await r.json()) as { entries: BoardEntry[] }).entries;
  } catch { return []; }
}

export async function postScore(name: string, score: number): Promise<void> {
  const callsign = getCallsign();
  if (!callsign) return;
  try {
    await fetch(`${cloudBase()}/api/board/${name}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ callsign, score: Math.round(score), tag: getSquadron() ?? "" }),
    });
  } catch { /* offline */ }
}

// Called on save: push the scores the boards track
export function syncScores(w: World): void {
  const p = w.player;
  void postScore("discoveries", p.discoveries);
  void postScore("arcs", Object.values(p.arcs).reduce((a, b) => a + b, 0));
  void postScore("credits", p.credits);
  void postScore("kills", p.kills);
  void postScore("explorers", Math.round(p.expSold ?? 0));
  void postScore("traders", Math.round(p.tradeRevenue ?? 0));
  void postSquadRep(w);
}

export function ageLabel(t: number): string {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "NOW";
  if (s < 3600) return `${Math.floor(s / 60)}M`;
  if (s < 86400) return `${Math.floor(s / 3600)}H`;
  return `${Math.floor(s / 86400)}D`;
}

// First discovery: the edge remembers who logged a system first. Null when
// there is no call sign or the wire is unreachable (nothing is lost; retried on
// the next arrival).
export async function discover(system: string): Promise<{ first: boolean; by: string } | null> {
  const callsign = getCallsign();
  if (!callsign) return null;
  try {
    const r = await fetch(`${cloudBase()}/api/discover`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ system, callsign }),
    });
    if (!r.ok) return null;
    return (await r.json()) as { first: boolean; by: string };
  } catch { return null; }
}

export interface GoalState { id: string; progress: number; top: { callsign: string; amount: number }[] }

export async function fetchGoal(id: string): Promise<GoalState | null> {
  try {
    const r = await fetch(`${cloudBase()}/api/goal?id=${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    return (await r.json()) as GoalState;
  } catch { return null; }
}

export async function contributeGoal(id: string, amount: number): Promise<GoalState | null> {
  const callsign = getCallsign();
  try {
    const r = await fetch(`${cloudBase()}/api/goal`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, amount, callsign: callsign ?? "ANONYMOUS" }),
    });
    if (!r.ok) return null;
    return (await r.json()) as GoalState;
  } catch { return null; }
}

export interface RoomCount { system: string; count: number }
let roomsCache: { at: number; rooms: RoomCount[]; pilots: number } | null = null;
export async function fetchRooms(force = false): Promise<{ rooms: RoomCount[]; pilots: number }> {
  if (!force && roomsCache && Date.now() - roomsCache.at < 30_000) return roomsCache;
  try {
    const r = await fetch(`${cloudBase()}/api/rooms`);
    if (!r.ok) return roomsCache ?? { rooms: [], pilots: 0 };
    const j = (await r.json()) as { rooms: RoomCount[]; pilots: number };
    roomsCache = { at: Date.now(), rooms: j.rooms, pilots: j.pilots };
    return roomsCache;
  } catch { return roomsCache ?? { rooms: [], pilots: 0 }; }
}

// ---------- Squadron bases ----------
export interface BaseRec { stationId: string | null; stationName: string | null; systemName: string | null; treasury: number; vault: Record<string, number>; upgrades: string[]; founded: number; log: { t: number; callsign: string; text: string }[] }
export interface BaseSummary { tag: string; stationId: string; stationName: string; systemName: string; upgrades: string[] }
export const BASE_UPGRADES: { id: string; name: string; cost: number; desc: string }[] = [
  { id: "defense", name: "Defense Grid", cost: 8000, desc: "Three extra platforms and fighters guard the base for everyone" },
  { id: "depot", name: "Fuel Depot", cost: 5000, desc: "Members refuel and repair here for free" },
  { id: "market", name: "Market Stake", cost: 6000, desc: "Members sell here at +8%" },
  { id: "vault", name: "Deep Vault", cost: 4000, desc: "Shared vault holds 600 instead of 200" },
];
let basesCache: { at: number; bases: BaseSummary[] } | null = null;
export async function fetchBases(force = false): Promise<BaseSummary[]> {
  if (!force && basesCache && Date.now() - basesCache.at < 120_000) return basesCache.bases;
  try {
    const r = await fetch(`${cloudBase()}/api/bases`);
    if (!r.ok) return basesCache?.bases ?? [];
    basesCache = { at: Date.now(), bases: ((await r.json()) as { bases: BaseSummary[] }).bases };
    return basesCache.bases;
  } catch { return basesCache?.bases ?? []; }
}
export function baseAt(stationId: string): BaseSummary | null {
  return basesCache?.bases.find((b) => b.stationId === stationId) ?? null;
}
export async function fetchBase(tag: string): Promise<BaseRec | null> {
  try {
    const r = await fetch(`${cloudBase()}/api/base?tag=${encodeURIComponent(tag)}`);
    if (!r.ok) return null;
    return ((await r.json()) as { base: BaseRec | null }).base;
  } catch { return null; }
}
export async function baseAction(action: string, payload: Record<string, unknown>): Promise<{ ok: boolean; base?: BaseRec; error?: string; short?: number }> {
  const callsign = getCallsign(), tag = getSquadron();
  if (!callsign || !tag) return { ok: false, error: "no squadron" };
  try {
    const r = await fetch(`${cloudBase()}/api/base`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, callsign, tag, ...payload }),
    });
    const j = (await r.json()) as { ok?: boolean; base?: BaseRec; error?: string; short?: number };
    if (j.base && j.ok) basesCache = null;
    return { ok: !!j.ok, base: j.base, error: j.error, short: j.short };
  } catch { return { ok: false, error: "offline" }; }
}
export function basePrice(stationType: string, military: boolean): number {
  if (military) return 0;
  const f: Record<string, number> = { trade: 1.5, research: 1.4, refinery: 1.3, mining: 1, agri: 1 };
  return Math.round(15000 * (f[stationType] ?? 1));
}
