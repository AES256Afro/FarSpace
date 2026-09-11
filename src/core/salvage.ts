import { RNG, hashStr } from "./rng";
import { prepareWreck } from "./derelicts";
import { addCargo, cargoUsed, type PlayerState, type WreckDef } from "../world";
import { addMaterials, MATERIAL_CAP } from "../data/engineering";

export interface SalvagePart {
  id: "drive" | "electronics" | "plating" | "alloys";
  name: string;
  resource: string;
  store: "cargo" | "materials";
  total: number;
  remaining: number;
  progress: number;
}
export interface WreckSalvage { parts: SalvagePart[] }

export const CUT_FUEL = 0.5;
export const CUT_SECONDS = 4;

export function prepareSalvage(wreck: WreckDef, seed: number): WreckSalvage {
  if (wreck.salvage) return wreck.salvage;
  // Cleared saves and occupied arks do not acquire a new stock of scrap.
  if (wreck.looted || wreck.id.startsWith("ark-")) return wreck.salvage = { parts: [] };
  const rng = new RNG(hashStr(`${seed}:salvage:${wreck.id}`));
  const condition = 1 - Math.min(1, Math.max(0, wreck.hazard));
  const part = (id: SalvagePart["id"], name: string, resource: string, store: SalvagePart["store"], total: number): SalvagePart =>
    ({ id, name, resource, store, total, remaining: total, progress: 0 });
  return wreck.salvage = { parts: [
    part("drive", "DRIVE ASSEMBLY", "parts", "cargo", rng.int(2, 4) + Math.floor(condition * 2)),
    part("electronics", "CONTROL CIRCUITS", "germanium", "materials", rng.int(1, 3)),
    part("plating", "HULL PLATING", "metals", "cargo", rng.int(4, 7) + Math.floor(condition * 3)),
    part("alloys", "REACTOR SHIELDING", rng.pick(["nickel", "vanadium", "carbon"]), "materials", rng.int(2, 4)),
  ] };
}

export function wreckAvailable(wreck: WreckDef): boolean {
  if (wreck.recovery?.status === "delivered") return false;
  if (wreck.recovery?.status === "adrift" || wreck.recovery?.status === "towing") return true;
  return !wreck.looted || !!wreck.salvage?.parts.some(p => p.remaining > 0);
}

export function contestedWreck(wreck: WreckDef): boolean {
  return !wreck.id.startsWith("wreck-mine") && !wreck.id.startsWith("ark-")
    && !wreck.looted && !wreck.boarding?.claimResolved && new RNG(hashStr(wreck.id)).chance(0.3);
}

export function shareSalvage(wreck: WreckDef, seed: number, all = false): void {
  for (const part of prepareSalvage(wreck, seed).parts) {
    const removed = all ? part.remaining : Math.floor(part.remaining / 2);
    part.remaining -= removed; part.total -= removed;
    if (!part.remaining) part.progress = 0;
  }
}

export function salvageReason(wreck: WreckDef, part: SalvagePart, p: PlayerState): string | null {
  if (wreck.recovery?.status === "towing") return "DETACH THE TOW LINE BEFORE CUTTING.";
  if (wreck.recovery?.status === "delivered") return "THIS HULL HAS ALREADY BEEN RECOVERED.";
  if (!wreck.salvage?.parts.includes(part) || wreck.id.startsWith("ark-")) return "THIS HULL CANNOT BE CUT.";
  if (part.remaining <= 0) return "THIS SECTION IS STRIPPED.";
  if (wreck.boarding?.survivor && !wreck.boarding.rescued) return "SURVIVOR ABOARD. BOARD AND EVACUATE BEFORE CUTTING.";
  if (contestedWreck(wreck)) return "ANOTHER CREW HAS A CLAIM. BOARD TO SETTLE SALVAGE RIGHTS.";
  if (part.store === "cargo" && cargoUsed(p) + 1 > p.cargoMax) return "HOLD FULL. UNLOAD AND RETURN FOR THE REST.";
  if (part.store === "materials" && (p.materials?.[part.resource] ?? 0) + 1 > MATERIAL_CAP) return "MATERIAL STORAGE FULL. THIS SECTION WILL STAY HERE.";
  if (p.fuel <= 0) return "NO CUTTER FUEL. REFUEL AND RETURN TO FINISH.";
  return null;
}

export function cutSalvage(wreck: WreckDef, seed: number, part: SalvagePart, p: PlayerState, dt: number): { recovered: boolean; reason: string | null } {
  if (!wreck.boarding) prepareWreck(wreck, seed);
  const reason = salvageReason(wreck, part, p);
  if (reason || !Number.isFinite(dt) || dt <= 0) return { recovered: false, reason };
  const engineer = p.crew.some(c => c.role === "engineer" && !c.sick);
  const seconds = engineer ? CUT_SECONDS * 0.7 : CUT_SECONDS;
  const work = Math.min(1 - part.progress, Math.min(dt, 0.25) / seconds, p.fuel / CUT_FUEL);
  if (work > 0 && wreck.recovery) wreck.recovery.status = "dismantled";
  part.progress += work;
  p.fuel = Math.max(0, p.fuel - work * CUT_FUEL);
  if (part.progress < 1 - 1e-9) return { recovered: false, reason: p.fuel <= 0 ? "NO CUTTER FUEL. WORK SAVED." : null };
  if (part.store === "cargo") addCargo(p, part.resource, 1);
  else addMaterials(p, { [part.resource]: 1 });
  part.remaining--; part.progress = 0;
  return { recovered: true, reason: null };
}
