import { activeSlot, decodeSave, saveKeyFor, SAVE_VERSION } from "../save";
import type { World } from "../world";

export interface SavePreview {
  slot: number; raw: string | null; world: World | null; error: string | null;
  present: boolean; recovery: boolean;
}
export type SaveOperation = { ok: true } | { ok: false; error: string };
export const recoveryKeyFor = (slot: number): string => `${saveKeyFor(slot)}-recovery`;
export function readSavePreview(slot = activeSlot(), recoveryCopy = false): SavePreview {
  try {
    const raw = localStorage.getItem(recoveryCopy ? recoveryKeyFor(slot) : saveKeyFor(slot)), recovery = !!localStorage.getItem(recoveryKeyFor(slot));
    return { slot, raw, present: raw !== null, recovery, ...(raw ? decodeSave(raw) : { world: null, error: null }) };
  } catch { return { slot, raw: null, world: null, present: false, recovery: false, error: "Browser storage is unavailable. Save tools cannot read this slot." }; }
}
export function preserveSlot(slot: number): SaveOperation {
  try {
    const raw = localStorage.getItem(saveKeyFor(slot));
    if (raw !== null) localStorage.setItem(recoveryKeyFor(slot), raw);
    return { ok: true };
  } catch { return { ok: false, error: "The recovery copy could not be stored. The current save was kept. Export it or free browser storage before replacing it." }; }
}
export function replaceSlot(slot: number, raw: string): SaveOperation {
  const parsed = decodeSave(raw); if (!parsed.world) return { ok: false, error: parsed.error! };
  const backup = preserveSlot(slot); if (!backup.ok) return backup;
  try { localStorage.setItem(saveKeyFor(slot), raw); return { ok: true }; }
  catch { return { ok: false, error: "The new save could not be stored. The previous save and recovery copy remain available." }; }
}
export function storeImportedWorld(slot: number, world: World): SaveOperation {
  const parsed = decodeSave(JSON.stringify(world));
  if (!parsed.world) return { ok: false, error: parsed.error! };
  return replaceSlot(slot, JSON.stringify({ ...world, version: SAVE_VERSION, savedAt: Date.now() }));
}
export function clearSavedSlot(slot: number): SaveOperation {
  const backup = preserveSlot(slot); if (!backup.ok) return backup;
  try { localStorage.removeItem(saveKeyFor(slot)); return { ok: true }; }
  catch { return { ok: false, error: "This slot could not be cleared. Its save was kept." }; }
}
export function restoreSlot(slot: number): SaveOperation {
  try {
    const raw = localStorage.getItem(recoveryKeyFor(slot));
    if (!raw) return { ok: false, error: "No recovery copy is available for this slot." };
    return replaceSlot(slot, raw);
  } catch { return { ok: false, error: "The recovery copy could not be read. The current save was kept." }; }
}
