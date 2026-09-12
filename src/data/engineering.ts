// Materials and engineering: raw stuff you pick up while mining, salvaging and
// surveying, spent at engineers on permanent ship upgrades.

import { refreshFittedStats, rememberYardFittings, type PlayerState } from "../world";

export interface MaterialDef { id: string; name: string; rarity: "common" | "uncommon" | "rare" }
export const MATERIALS: MaterialDef[] = [
  { id: "iron", name: "Iron", rarity: "common" },
  { id: "nickel", name: "Nickel", rarity: "common" },
  { id: "carbon", name: "Carbon", rarity: "common" },
  { id: "germanium", name: "Germanium", rarity: "uncommon" },
  { id: "vanadium", name: "Vanadium", rarity: "uncommon" },
  { id: "polonium", name: "Polonium", rarity: "rare" },
];
export const MATERIAL_CAP = 60;
export function materialCap(p: PlayerState): number { return p.workshop?.research.includes("storage") ? 120 : MATERIAL_CAP; }

export interface Blueprint {
  id: string;
  name: string;
  desc: string;            // per-grade effect
  grades: Record<string, number>[]; // materials per grade (index 0 = grade 1)
}

export const BLUEPRINTS: Blueprint[] = [
  { id: "fsd", name: "Jump Drive Tuning", desc: "-8% jump fuel per grade",
    grades: [{ iron: 4, carbon: 2 }, { nickel: 6, germanium: 2 }, { germanium: 4, vanadium: 2, polonium: 1 }] },
  { id: "drives", name: "Dirty Drives", desc: "+6% thrust and top speed per grade",
    grades: [{ iron: 5, nickel: 2 }, { carbon: 6, vanadium: 2 }, { vanadium: 4, polonium: 1 }] },
  { id: "scoop", name: "Scoop Intake", desc: "+30% scoop rate per grade",
    grades: [{ carbon: 4, iron: 2 }, { germanium: 3, nickel: 4 }, { germanium: 5, polonium: 1 }] },
  { id: "mining", name: "Mining Laser Focus", desc: "+20% mining rate per grade",
    grades: [{ nickel: 4, carbon: 2 }, { iron: 6, germanium: 2 }, { vanadium: 4, germanium: 2 }] },
  { id: "cargo", name: "Lightweight Racks", desc: "+5 cargo per grade",
    grades: [{ iron: 4, nickel: 4 }, { carbon: 6, germanium: 2 }, { vanadium: 3, germanium: 3 }] },
  { id: "shields", name: "Reinforced Shields", desc: "+10% shield capacity per grade",
    grades: [{ nickel: 5, carbon: 3 }, { germanium: 4, iron: 4 }, { polonium: 1, vanadium: 4 }] },
  { id: "vents", name: "Heat Vents", desc: "+25% heat dissipation per grade",
    grades: [{ carbon: 5, iron: 3 }, { vanadium: 3, nickel: 4 }, { polonium: 1, germanium: 4 }] },
  { id: "rover", name: "Rover Suspension", desc: "+12% rover speed per grade",
    grades: [{ iron: 4, carbon: 3 }, { nickel: 5, germanium: 1 }, { vanadium: 3, germanium: 2 }] },
  { id: "battery", name: "Rover Battery", desc: "-20% rover power drain per grade",
    grades: [{ carbon: 5, nickel: 2 }, { germanium: 3, carbon: 4 }, { polonium: 1, vanadium: 3 }] },
];

export function engGrade(p: PlayerState, id: string): number {
  return p.engineering?.[id] ?? 0;
}

export function blueprint(id: string): Blueprint | undefined {
  return BLUEPRINTS.find((b) => b.id === id);
}

export function nextCost(p: PlayerState, bp: Blueprint): Record<string, number> | null {
  const g = engGrade(p, bp.id);
  return g < bp.grades.length ? bp.grades[g] : null;
}

export function canAfford(p: PlayerState, cost: Record<string, number>): boolean {
  return Object.entries(cost).every(([id, n]) => (p.materials?.[id] ?? 0) >= n);
}

// Spend the materials and raise the grade; returns false if unaffordable or maxed
export function upgrade(p: PlayerState, bp: Blueprint): boolean {
  const cost = nextCost(p, bp);
  if (!cost || !canAfford(p, cost)) return false;
  rememberYardFittings(p);
  p.materials ??= {};
  for (const [id, n] of Object.entries(cost)) p.materials[id] -= n;
  p.engineering ??= {};
  p.engineering[bp.id] = engGrade(p, bp.id) + 1;
  refreshFittedStats(p);
  if (bp.id === "shields") p.shield = p.shieldMax;
  return true;
}

export function addMaterials(p: PlayerState, gains: Record<string, number>): Record<string, number> {
  p.materials ??= {};
  const got: Record<string, number> = {};
  for (const [id, n] of Object.entries(gains)) {
    if (n <= 0) continue;
    const before = p.materials[id] ?? 0;
    const after = Math.min(materialCap(p), before + n);
    if (after > before) { p.materials[id] = after; got[id] = after - before; }
  }
  return got;
}
