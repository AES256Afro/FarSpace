import { RNG } from "../core/rng";

// ---------- Factions ----------

export interface Faction {
  id: string;
  name: string;
  color: string;
  hostile: boolean; // hostile to civilians (pirates)
  military: number; // 0..1 how militarized their stations are
}

export const FACTIONS: Faction[] = [
  { id: "tsc", name: "Terran Stellar Compact", color: "#5ab3ff", hostile: false, military: 0.6 },
  { id: "fdm", name: "Free Drift Mining Guild", color: "#ffd75a", hostile: false, military: 0.2 },
  { id: "hex", name: "Hexagon Combine", color: "#b28fe0", hostile: false, military: 0.4 },
  { id: "ora", name: "Outer Ring Autonomy", color: "#63f2c8", hostile: false, military: 0.35 },
  { id: "vex", name: "Veil Corsairs", color: "#ff5a5a", hostile: true, military: 0.8 },
];

export function faction(id: string): Faction {
  return FACTIONS.find((f) => f.id === id)!;
}

// ---------- Commodities ----------

export interface Commodity {
  id: string;
  name: string;
  base: number; // base price
  illegal?: boolean;
}

export const COMMODITIES: Commodity[] = [
  { id: "ore", name: "Raw Ore", base: 14 },
  { id: "metals", name: "Refined Metals", base: 38 },
  { id: "fuel", name: "Fuel Cells", base: 22 },
  { id: "food", name: "Provisions", base: 18 },
  { id: "water", name: "Water Ice", base: 9 },
  { id: "med", name: "Med Supplies", base: 55 },
  { id: "parts", name: "Spare Parts", base: 42 },
  { id: "lux", name: "Luxuries", base: 88 },
  { id: "data", name: "Data Cores", base: 120 },
  { id: "bio", name: "Bio Samples", base: 150, illegal: true },
  { id: "contra", name: "Contraband", base: 200, illegal: true },
];

export function commodity(id: string): Commodity {
  return COMMODITIES.find((c) => c.id === id)!;
}

// ---------- Station economy types ----------

export type StationType = "mining" | "agri" | "refinery" | "research" | "trade" | "military";

// price multiplier: <1 produces (sells cheap), >1 consumes (buys dear)
export const ECONOMY: Record<StationType, Record<string, number>> = {
  mining:   { ore: 0.55, water: 0.8, metals: 1.1, food: 1.35, med: 1.2, parts: 1.25, fuel: 1.1, lux: 1.4, data: 1.0, bio: 1.0, contra: 1.0 },
  agri:     { food: 0.55, water: 0.7, ore: 1.1, metals: 1.15, med: 1.1, parts: 1.2, fuel: 1.05, lux: 1.25, data: 1.0, bio: 0.9, contra: 1.0 },
  refinery: { metals: 0.65, fuel: 0.7, ore: 1.45, water: 1.1, food: 1.2, med: 1.1, parts: 0.9, lux: 1.2, data: 1.0, bio: 1.0, contra: 1.0 },
  research: { data: 0.7, med: 0.8, bio: 1.6, food: 1.25, water: 1.15, metals: 1.1, parts: 1.1, fuel: 1.1, ore: 1.0, lux: 1.3, contra: 1.0 },
  trade:    { lux: 0.8, parts: 0.95, food: 1.0, water: 1.0, ore: 1.05, metals: 1.0, med: 1.0, fuel: 0.95, data: 1.15, bio: 1.2, contra: 1.3 },
  military: { parts: 1.2, fuel: 1.15, food: 1.2, med: 1.25, metals: 1.05, ore: 1.0, water: 1.05, lux: 1.1, data: 1.3, bio: 1.1, contra: 0.0 },
};

// ---------- Name generation ----------

const SYS_A = ["Ker", "Vol", "Tau", "Nyx", "Ori", "Cyg", "Lyr", "Ara", "Dra", "Vel", "Pyx", "Cru", "Hyd", "Peg", "Aur", "Cas", "Eri", "Zel", "Mar", "Thal"];
const SYS_B = ["anis", "urna", "os", "ith", "era", "on", "ax", "ium", "eia", "ara", "un", "esh", "ol", "ir", "ys"];
const SYS_C = ["Prime", "Reach", "Verge", "Deep", "Gate", "Haven", "Drift", "Cross", "Fall", "Rise"];

export function genSystemName(rng: RNG): string {
  const n = rng.pick(SYS_A) + rng.pick(SYS_B);
  return rng.chance(0.35) ? `${n} ${rng.pick(SYS_C)}` : n;
}

const STA_A = ["Port", "Anchor", "Haven", "Depot", "Hub", "Post", "Point", "Rest", "Watch", "Spire"];
const STA_B = ["Meridian", "Kepler", "Halcyon", "Ferrous", "Cinder", "Aurora", "Bastion", "Corona", "Tycho", "Vesper", "Ballad", "Sable", "Onyx", "Juniper", "Calypso"];

export function genStationName(rng: RNG, military: boolean): string {
  if (military) return `${rng.pick(["Fort", "Bastion", "Garrison", "Citadel"])} ${rng.pick(STA_B)}`;
  return rng.chance(0.5) ? `${rng.pick(STA_B)} ${rng.pick(STA_A)}` : `${rng.pick(STA_A)} ${rng.pick(STA_B)}`;
}

const FIRST = ["Ada", "Rin", "Kai", "Mora", "Jax", "Suri", "Odo", "Lena", "Bram", "Nia", "Cole", "Vera", "Dax", "Ines", "Rook", "Mika", "Thorn", "Elba", "Nyko", "Sasha"];
const LAST = ["Voss", "Okafor", "Reyes", "Tanaka", "Iqbal", "Sørensen", "Achebe", "Marlow", "Ito", "Castellan", "Bright", "Kwan", "Ferro", "Halloran", "Mbeki", "Duarte"];

export function genPersonName(rng: RNG): string {
  return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
}

const PLANET_SUFFIX = ["I", "II", "III", "IV", "V", "VI"];
export function planetName(sysName: string, idx: number): string {
  return `${sysName.split(" ")[0]} ${PLANET_SUFFIX[idx] ?? idx + 1}`;
}
