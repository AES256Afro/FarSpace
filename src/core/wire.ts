// Fleet Wire: the shared event feed and leaderboards every player sees.
// Posting needs a call sign (chosen once, kept in localStorage). Everything is
// best-effort and never blocks play.

import { cloudBase } from "./cloud";
import type { World } from "../world";

const CALLSIGN_KEY = "farspace-callsign";

export interface WireEvent { t: number; callsign: string; kind: string; text: string; system: string }
export interface BoardEntry { callsign: string; score: number; t: number }

export function getCallsign(): string | null {
  try { return localStorage.getItem(CALLSIGN_KEY); } catch { return null; }
}

export function setCallsign(c: string | null): void {
  try { if (c) localStorage.setItem(CALLSIGN_KEY, c); else localStorage.removeItem(CALLSIGN_KEY); } catch { /* ignore */ }
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
      body: JSON.stringify({ callsign, kind, text: text.slice(0, 140), system: system.slice(0, 32) }),
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
      body: JSON.stringify({ callsign, score: Math.round(score) }),
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
