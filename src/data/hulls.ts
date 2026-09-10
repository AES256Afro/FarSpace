// Ship hulls. Each is a real trade-off; the hull also picks the interior deck.

export interface HullDef {
  id: string;
  name: string;
  price: number;
  desc: string;
  hullMax: number;
  shieldMax: number;
  cargoMax: number;
  fuelMax: number;
  accel: number;      // thrust units/s²
  maxSpeed: number;
  rotSpeed: number;   // rad/s
  miningRate: number; // ore units/s
  weaponDmg: number;
  fireRate: number;   // seconds between shots
  spriteSize: number;
  color: string;
  accent: string;
  deck: "scout" | "prospector" | "freighter" | "interceptor" | "carrier";
  crewSlots: number;
  drones?: number; // escort drones launched from a hangar
  scanner?: boolean; // built-in discovery scanner
  fuelEff?: number;  // fuel burn multiplier for thrust and jumps (1 = normal)
}

export const HULLS: HullDef[] = [
  {
    id: "scout", name: "Wren Scout", price: 0,
    desc: "Starter hull. Balanced, unremarkable, yours.",
    hullMax: 100, shieldMax: 50, cargoMax: 40, fuelMax: 100,
    accel: 90, maxSpeed: 260, rotSpeed: 3.4, miningRate: 2.5, weaponDmg: 10, fireRate: 0.22,
    spriteSize: 24, color: "#9aa5bd", accent: "#63f2c8", deck: "scout", crewSlots: 1,
  },
  {
    id: "prospector", name: "Magpie Prospector", price: 3200,
    desc: "Twin mining lasers, big ore bay. Thin skin — stay near the belts' guns.",
    hullMax: 90, shieldMax: 40, cargoMax: 80, fuelMax: 110,
    accel: 75, maxSpeed: 220, rotSpeed: 3.0, miningRate: 6, weaponDmg: 7, fireRate: 0.3,
    spriteSize: 26, color: "#c7a54a", accent: "#ffd75a", deck: "prospector", crewSlots: 2,
  },
  {
    id: "freighter", name: "Bastion Freighter", price: 6500,
    desc: "Hauls three times the cargo. Turns like a moon. Hull plated for the long lanes.",
    hullMax: 180, shieldMax: 70, cargoMax: 140, fuelMax: 160,
    accel: 55, maxSpeed: 190, rotSpeed: 2.0, miningRate: 2, weaponDmg: 8, fireRate: 0.35,
    spriteSize: 32, color: "#7a8ca5", accent: "#5ab3ff", deck: "freighter", crewSlots: 3,
  },
  {
    id: "interceptor", name: "Kestrel Interceptor", price: 5800,
    desc: "Fast, vicious, and empty. Bounty hunter's hull. Don't try to trade in it.",
    hullMax: 110, shieldMax: 90, cargoMax: 25, fuelMax: 90,
    accel: 140, maxSpeed: 340, rotSpeed: 4.6, miningRate: 1, weaponDmg: 16, fireRate: 0.16,
    spriteSize: 22, color: "#6a7a9c", accent: "#ff5a5a", deck: "interceptor", crewSlots: 2,
  },
  {
    id: "explorer", name: "Albatross Explorer", price: 7800,
    desc: "Long legs and a cold hull: the biggest tank in the catalogue, sips fuel, and its sensors log a system on arrival like a discovery scanner.",
    hullMax: 120, shieldMax: 60, cargoMax: 45, fuelMax: 260,
    accel: 100, maxSpeed: 290, rotSpeed: 3.6, miningRate: 1.5, weaponDmg: 8, fireRate: 0.26,
    spriteSize: 28, color: "#b8c2d6", accent: "#63f2c8", deck: "scout", crewSlots: 2, scanner: true, fuelEff: 0.6,
  },
  {
    id: "barge", name: "Ox Mining Barge", price: 9200,
    desc: "Four mining heads and a refinery-grade hold. Cracks rocks twice as fast as a Magpie and carries what it cracks. Handles like the rock.",
    hullMax: 200, shieldMax: 50, cargoMax: 160, fuelMax: 140,
    accel: 50, maxSpeed: 180, rotSpeed: 1.8, miningRate: 10, weaponDmg: 6, fireRate: 0.4,
    spriteSize: 34, color: "#c7a54a", accent: "#ff9a3a", deck: "prospector", crewSlots: 3,
  },
  {
    id: "carrier", name: "Aegis Carrier", price: 14000,
    desc: "A hangar deck and two escort drones that fight for you and re-arm at dock. Slow, thick, and never alone.",
    hullMax: 260, shieldMax: 110, cargoMax: 90, fuelMax: 200,
    accel: 45, maxSpeed: 170, rotSpeed: 1.6, miningRate: 2, weaponDmg: 10, fireRate: 0.3,
    spriteSize: 40, color: "#8c95a8", accent: "#5ab3ff", deck: "carrier", crewSlots: 5, drones: 2,
  },
];

export function hull(id: string | undefined): HullDef {
  return HULLS.find((h) => h.id === id) ?? HULLS[0];
}
