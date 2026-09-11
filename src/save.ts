// Save schema versioning. Every model change bumps SAVE_VERSION and adds a
// migration step so no player loses a game to an update.

import type { World, SystemDef } from "./world";
import { assignRares, assignSyndicates, assignWonders, assignCaptains, assignNotables } from "./world";
import { RNG } from "./core/rng";
import { HULLS, SERVICE_CUTTER } from "./data/hulls";

export const SAVE_VERSION = 15;
export const SAVE_KEY = "farspace-save";
export const SLOTS = 3;
const SLOT_KEY = "farspace-slot";

// Save slots: slot 0 keeps the historic key so existing saves stay where they are.
export function activeSlot(): number {
  try { const n = Number(localStorage.getItem(SLOT_KEY)); return Number.isInteger(n) && n >= 0 && n < SLOTS ? n : 0; } catch { return 0; }
}
export function setActiveSlot(n: number): boolean {
  if (!Number.isInteger(n) || n < 0 || n >= SLOTS) return false;
  try { localStorage.setItem(SLOT_KEY, String(n)); return true; } catch { return false; }
}
export function saveKeyFor(slot: number): string {
  return slot === 0 ? SAVE_KEY : `${SAVE_KEY}-${slot}`;
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

MIGRATIONS[14] = () => {
  // 14 → 15: recovery ownership is optional for existing voyages. Older clients
  // must reject new saves so they cannot salvage a hull after it was delivered.
};

export function migrateSave(raw: unknown): World | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Record<string, unknown>;
  if (!w.player || !w.systems) return null;
  let v = typeof w.version === "number" ? w.version : 0;
  if (!Number.isInteger(v) || v < 0 || v > SAVE_VERSION) return null;
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
    return decodeSave(raw).world;
  } catch {
    return null;
  }
}

export interface SaveRead { world: World | null; error: string | null }
// Validate the required playable shape after migration, before preview or adoption.
export function decodeSave(raw: string): SaveRead {
  const invalid = { world: null, error: "This save is incomplete or damaged. Keep the original file and choose another save." };
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.version === "number" && parsed.version > SAVE_VERSION)
      return { world: null, error: "This save was made by a newer FarSpace version. Update the game before loading it." };
    const w = migrateSave(parsed), p = w?.player;
    if (!w || !p || (![...HULLS, SERVICE_CUTTER].some(h => h.id === p.hullId)) || !w.systems?.[p.systemId]) return invalid;
    if (![w.seed, w.time, w.econTick, w.shockTick, w.warTick, w.missionCounter,
      p.x, p.y, p.vx, p.vy, p.angle, p.credits, p.hull, p.hullMax, p.shield, p.shieldMax,
      p.fuel, p.fuelMax, p.oxygen, p.oxygenMax, p.cargoMax].every(Number.isFinite)) return invalid;
    if (![w.news, w.events, w.wars, p.crew, p.systems, p.missions, p.breaches, p.fires].every(Array.isArray)) return invalid;
    if (![p.cargo, p.rep, p.hints, p.skills, p.storage, p.arcs].every(o => o && typeof o === "object" && !Array.isArray(o))) return invalid;
    if (p.shipName !== undefined && typeof p.shipName !== "string") return invalid;
    if (p.paint !== undefined && (typeof p.paint !== "string" || !/^#[\da-f]{6}$/i.test(p.paint))) return invalid;
    for (const sys of Object.values(w.systems)) {
      if (!sys || typeof sys.name !== "string" || ![sys.planets, sys.stations, sys.jumpPoints, sys.asteroids, sys.wrecks, sys.anomalies].every(Array.isArray)) return invalid;
    }
    if (p.dockedAt && !w.systems[p.systemId].stations.some(st => st.id === p.dockedAt)) return invalid;
    return { world: w, error: null };
  } catch { return invalid; }
}

export function writeSave(world: World, slot = activeSlot()): void {
  world.version = SAVE_VERSION;
  world.savedAt = Date.now();
  localStorage.setItem(saveKeyFor(slot), JSON.stringify(world));
}
