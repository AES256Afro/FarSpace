// Save schema versioning. Every model change bumps SAVE_VERSION and adds a
// migration step so no player loses a game to an update.

import type { World, SystemDef } from "./world";
import { assignRares, assignSyndicates, assignWonders, assignCaptains, assignNotables } from "./world";
import { RNG } from "./core/rng";

export const SAVE_VERSION = 14;
export const SAVE_KEY = "farspace-save";
export const SLOTS = 3;
const SLOT_KEY = "farspace-slot";

// Save slots: slot 0 keeps the historic key so existing saves stay where they are.
export function activeSlot(): number {
  try { const n = Number(localStorage.getItem(SLOT_KEY)); return n >= 0 && n < SLOTS ? n : 0; } catch { return 0; }
}
export function setActiveSlot(n: number): void {
  try { localStorage.setItem(SLOT_KEY, String(Math.max(0, Math.min(SLOTS - 1, n)))); } catch { /* ignore */ }
}
export function saveKeyFor(slot: number): string {
  return slot === 0 ? SAVE_KEY : `${SAVE_KEY}-${slot}`;
}
export interface SlotSummary { slot: number; empty: boolean; credits?: number; hullId?: string; systemName?: string; savedAt?: number; hardcore?: boolean; discoveries?: number; bytes?: number }
export function slotSummaries(): SlotSummary[] {
  const out: SlotSummary[] = [];
  for (let i = 0; i < SLOTS; i++) {
    try {
      const raw = localStorage.getItem(saveKeyFor(i));
      if (!raw) { out.push({ slot: i, empty: true }); continue; }
      const w = JSON.parse(raw) as { player?: { credits?: number; hullId?: string; systemId?: string; discoveries?: number }; systems?: Record<string, { name?: string }>; savedAt?: number; hardcore?: boolean };
      out.push({ slot: i, empty: false, credits: w.player?.credits, hullId: w.player?.hullId, systemName: w.systems?.[w.player?.systemId ?? ""]?.name, savedAt: w.savedAt, hardcore: w.hardcore, discoveries: w.player?.discoveries, bytes: raw.length });
    } catch { out.push({ slot: i, empty: true }); }
  }
  return out;
}
export function deleteSlot(slot: number): void {
  try { localStorage.removeItem(saveKeyFor(slot)); } catch { /* ignore */ }
}
export function copySlot(from: number, to: number): boolean {
  try { const raw = localStorage.getItem(saveKeyFor(from)); if (!raw) return false; localStorage.setItem(saveKeyFor(to), raw); return true; } catch { return false; }
}

type Migration = (w: Record<string, unknown>) => void;

// Each entry upgrades from version N to N+1 (index = from-version).
const MIGRATIONS: Record<number, Migration> = {
  // 0 → 1: Milestone 1 saves had no version. Add rep/hull/hints/events scaffolding.
  0: (w) => {
    const p = w.player as Record<string, unknown>;
    p.rep ??= {};
    p.hullId ??= "scout";
    p.hints ??= {};
    w.events ??= [];
    w.econTick ??= 0;
    w.realGalaxy ??= false;
    w.wars ??= [];
    const systems = w.systems as Record<string, Record<string, unknown>>;
    for (const sys of Object.values(systems)) {
      sys.wrecks ??= [];
      sys.anomalies ??= [];
      for (const pl of sys.planets as Record<string, unknown>[]) pl.surface ??= null;
    }
  },
  // 1 → 2: crew, skills, storage, passengers
  1: (w) => {
    const p = w.player as Record<string, unknown>;
    p.crew ??= [];
    p.skills ??= { piloting: 0, engineering: 0 };
    p.storage ??= {};
    p.discoveries ??= 0;
    p.breaches ??= [];
    p.fires ??= [];
  },
  // 2 → 3: narrative arcs
  2: (w) => {
    const p = w.player as Record<string, unknown>;
    p.arcs ??= {};
  },
  // 3 → 4: system distances for fuel-range routing
  3: (w) => {
    const systems = w.systems as Record<string, Record<string, unknown>>;
    for (const sys of Object.values(systems)) sys.ly ??= {};
  },
  // 4 → 5: flight school exists; veterans don't get sent back to it
  4: (w) => {
    const p = w.player as Record<string, unknown>;
    p.tutorial ??= -1;
  },
  // 5 → 6: modules, heat, exploration data, career ranks
  5: (w) => {
    const p = w.player as Record<string, unknown>;
    p.modules ??= [];
    p.heat ??= 0;
    p.expData ??= 0;
    p.expLog ??= {};
    p.expSold ??= 0;
    p.tradeRevenue ??= 0;
    p.mined ??= 0;
  },
  // 6 → 7: rare goods get origins in existing galaxies; market memory, bookmarks
  6: (w) => {
    const p = w.player as Record<string, unknown>;
    p.marketMemory ??= {};
    p.bookmarks ??= [];
    if (!w.rareOrigin) {
      const seed = typeof w.seed === "number" ? w.seed : 1;
      w.rareOrigin = assignRares(w.systems as Record<string, SystemDef>, new RNG((seed ^ 0x5a5e) >>> 0));
    }
  },
  // 7 → 8: materials, engineering, seismic charges
  7: (w) => {
    const p = w.player as Record<string, unknown>;
    p.materials ??= {};
    p.engineering ??= {};
    p.seismic ??= 0;
  },
  // 8 → 9: AI syndicates in existing galaxies
  8: (w) => {
    const p = w.player as Record<string, unknown>;
    p.synRep ??= {};
    p.routes ??= [];
    if (!w.syndicates) {
      const seed = typeof w.seed === "number" ? w.seed : 1;
      const startId = String((w.player as { systemId?: string }).systemId ?? Object.keys(w.systems as object)[0]);
      w.syndicates = assignSyndicates(w.systems as Record<string, SystemDef>, startId, new RNG((seed ^ 0x51d1) >>> 0));
    }
  },
};

MIGRATIONS[9] = (w) => {
  // 9 → 10: a life aboard — wear, berth log, crew on leave, alumni, crew service counts
  const p = w.player as Record<string, unknown>;
  p.wear ??= 0;
  p.berthLog ??= [];
  p.shoreCrew ??= [];
  p.alumni ??= [];
  for (const c of (p.crew as Record<string, unknown>[]) ?? []) { c.docks ??= 0; c.sick ??= null; }
};

MIGRATIONS[10] = (w) => {
  // 10 → 11: the liner trade and the lighthouse
  const p = w.player as Record<string, unknown>;
  p.kits ??= {};
  p.fares ??= 0;
  w.infra ??= [];
};

MIGRATIONS[11] = (w) => {
  // 11 → 12: wonders for galaxies that were generated without them
  if (!w.wonders) {
    const seed = typeof w.seed === "number" ? w.seed : 1;
    const startId = String((w.player as { systemId?: string }).systemId ?? Object.keys(w.systems as object)[0]);
    w.wonders = assignWonders(w.systems as Record<string, SystemDef>, startId, new RNG((seed ^ 0x77d3) >>> 0));
  }
};

MIGRATIONS[12] = (w) => {
  // 12 → 13: the regular captains, and the post
  if (!w.captains) {
    const seed = typeof w.seed === "number" ? w.seed : 1;
    w.captains = assignCaptains(w.systems as Record<string, SystemDef>, new RNG((seed ^ 0xc4b7) >>> 0));
  }
  w.mailQueue ??= [];
  (w.player as Record<string, unknown>).mail ??= [];
};

MIGRATIONS[13] = (w) => {
  // 13 → 14: notables
  if (!w.notables) {
    const seed = typeof w.seed === "number" ? w.seed : 1;
    w.notables = assignNotables(w as unknown as { systems: Record<string, SystemDef>; syndicates?: import("./world").Syndicate[] }, new RNG((seed ^ 0x9b1e) >>> 0));
  }
};

export function migrateSave(raw: unknown): World | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Record<string, unknown>;
  if (!w.player || !w.systems) return null;
  let v = typeof w.version === "number" ? w.version : 0;
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) return null; // unknown gap: refuse rather than corrupt
    step(w);
    v++;
    w.version = v;
  }
  return w as unknown as World;
}

export function loadSave(slot = activeSlot()): World | null {
  try {
    const raw = localStorage.getItem(saveKeyFor(slot));
    if (!raw) return null;
    return migrateSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeSave(world: World, slot = activeSlot()): void {
  world.version = SAVE_VERSION;
  world.savedAt = Date.now();
  localStorage.setItem(saveKeyFor(slot), JSON.stringify(world));
}
