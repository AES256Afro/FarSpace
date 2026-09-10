// Save schema versioning. Every model change bumps SAVE_VERSION and adds a
// migration step so no player loses a game to an update.

import type { World, SystemDef } from "./world";
import { assignRares } from "./world";
import { RNG } from "./core/rng";

export const SAVE_VERSION = 8;
export const SAVE_KEY = "farspace-save";

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

export function loadSave(): World | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return migrateSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeSave(world: World): void {
  world.version = SAVE_VERSION;
  world.savedAt = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(world));
}
