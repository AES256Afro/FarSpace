import { type AsteroidDef, type PlayerState, cargoUsed } from "../world";
import { RNG } from "./rng";
import { addMaterials } from "../data/engineering";
import { hasModule } from "../data/modules";

export interface MiningRemains { cargo: Record<string, number>; materials: Record<string, number> }
export function rockMaterials(a: AsteroidDef): Record<string, number> {
  const rng = new RNG(a.spriteSeed ^ 0x731e);
  if (a.core) {
    const gains: Record<string, number> = { vanadium: rng.int(1, 2) };
    if (rng.chance(0.4)) gains.polonium = 1;
    if (rng.chance(0.5)) gains.germanium = 1;
    return gains;
  }
  const gains: Record<string, number> = { iron: a.rich ? 2 : 1 };
  gains[rng.chance(0.5) ? "nickel" : "carbon"] = a.rich ? 2 : 1;
  if (rng.chance(0.2)) gains.germanium = 1;
  if (a.rich) gains.vanadium = 1;
  return gains;
}
export function hasMiningRemains(a: AsteroidDef): boolean {
  return !!a.miningRemains && [...Object.values(a.miningRemains.cargo), ...Object.values(a.miningRemains.materials)].some(n => n > 0);
}
export function crackRock(p: PlayerState, a: AsteroidDef): void {
  const remain = a.miningRemains ??= { cargo: {}, materials: {} };
  const rng = new RNG(a.spriteSeed ^ 0xc03e);
  const qty = a.core ? rng.int(6, 9) : a.rich ? 3 : 1, refined = !a.core && hasModule(p, "refinery") ? 1 : 0;
  remain.cargo.ore = (remain.cargo.ore ?? 0) + qty - refined;
  if (refined) remain.cargo.metals = (remain.cargo.metals ?? 0) + refined;
  if (a.core) {
    remain.cargo.metals = (remain.cargo.metals ?? 0) + rng.int(2, 4);
    if (rng.chance(0.3)) remain.cargo.relics = (remain.cargo.relics ?? 0) + 1;
  }
  for (const [id, n] of Object.entries(rockMaterials(a))) remain.materials[id] = (remain.materials[id] ?? 0) + n;
  p.mined = (p.mined ?? 0) + qty; a.ore = 0; delete a.miningInitial;
}
export function collectRock(p: PlayerState, a: AsteroidDef): { cargo: number; materials: number } {
  const out = { cargo: 0, materials: 0 }, remain = a.miningRemains;
  if (!remain) return out;
  const d = Math.hypot(p.x - a.x, p.y - a.y);
  if (d >= (hasModule(p, "collector") ? 240 : 90)) return out;
  const got = addMaterials(p, remain.materials);
  for (const [id, n] of Object.entries(got)) { remain.materials[id] -= n; out.materials += n; }
  if (d < (hasModule(p, "collector") ? 240 : 35)) {
    for (const [id, n] of Object.entries(remain.cargo)) {
      const take = Math.min(n, Math.max(0, Math.floor(p.cargoMax - cargoUsed(p))));
      if (take > 0) { p.cargo[id] = (p.cargo[id] ?? 0) + take; remain.cargo[id] -= take; out.cargo += take; }
    }
  }
  if (!hasMiningRemains(a)) delete a.miningRemains;
  return out;
}
export function aimedRock(rocks: AsteroidDef[], p: PlayerState, aim: number, range = 220): AsteroidDef | null {
  let best: AsteroidDef | null = null, nearest = range;
  for (const a of rocks) {
    if (a.ore <= 0) continue;
    const d = Math.hypot(a.x - p.x, a.y - p.y), angle = Math.atan2(a.y - p.y, a.x - p.x) - aim;
    if (d < nearest && Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) < 0.5) { best = a; nearest = d; }
  }
  return best;
}
