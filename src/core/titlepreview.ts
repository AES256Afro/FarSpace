import type { World } from "../world";
import { HULLS, hull } from "../data/hulls";
import { loadSave, activeSlot, saveKeyFor, SAVE_VERSION } from "../save";
export interface TitlePreview { world: World | null; present: boolean; error: string | null; slot: number; ship: string; location: string; savedAt: number | null }
export function titlePreview(): TitlePreview {
  const slot = activeSlot();
  const empty: TitlePreview = { world: null, present: false, error: null, slot, ship: "Wren Scout", location: "", savedAt: null };
  try {
    const raw = localStorage.getItem(saveKeyFor(slot));
    if (!raw) return empty;
    const w = loadSave(slot), p = w?.player;
    if (!w || !p || w.version > SAVE_VERSION || !Array.isArray(p.crew) || !HULLS.some(h => h.id === p.hullId)
      || !w.systems?.[p.systemId] || !Number.isFinite(w.time) || !Number.isFinite(w.seed)) {
      return { ...empty, present: true, error: "This slot could not be read. Keep the file and use another slot or import a valid save." };
    }
    return { world: w, present: true, error: null, slot, ship: p.shipName || hull(p.hullId).name,
      location: w.systems[p.systemId].name, savedAt: Number.isFinite(w.savedAt) ? w.savedAt! : null };
  } catch { return { ...empty, error: "Browser storage is unavailable. Save tools may not work in this session." }; }
}
export function saveAge(savedAt: number | null, now: number): string {
  if (savedAt === null) return "Save time unknown";
  const minutes = Math.max(0, Math.floor((now - savedAt) / 60000));
  return minutes < 1 ? "Saved just now" : minutes < 60 ? `Saved ${minutes}m ago` : minutes < 1440 ? `Saved ${Math.floor(minutes / 60)}h ago` : `Saved ${Math.floor(minutes / 1440)}d ago`;
}
