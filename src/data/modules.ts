// Ship modules: optional fittings bought at any shipyard. Every one changes how
// a non-combat loop plays — scooping, hauling, mining, surveying, docking.

import type { PlayerState } from "../world";

export interface ModuleDef {
  id: string;
  name: string;
  price: number;
  desc: string;
  fuel?: number;    // fuelMax bonus
  cargo?: number;   // cargoMax bonus
  shield?: number;  // shieldMax multiplier bonus (0.3 = +30%)
}

export const MODULES: ModuleDef[] = [
  { id: "scoop", name: "Fuel Scoop", price: 1200, desc: "Skim a star's corona to refuel for free. Watch the heat." },
  { id: "translator", name: "Translator Core", price: 900, desc: "Finds the pattern in any signal. First contacts always land; the singers say more." },
  { id: "radiators", name: "Heat Radiators", price: 900, desc: "Sheds heat twice as fast: scoop longer, dive closer." },
  { id: "tank", name: "Auxiliary Tank", price: 700, desc: "+40 fuel. Longer legs for the deep routes.", fuel: 40 },
  { id: "rack", name: "Cargo Rack", price: 900, desc: "+25 cargo capacity bolted into the hold.", cargo: 25 },
  { id: "dock", name: "Docking Computer", price: 600, desc: "Hold near a bay at low speed and it brings you in." },
  { id: "collector", name: "Collector Limpets", price: 1500, desc: "Canisters and ore chunks within 240m drift into your hold." },
  { id: "prospector", name: "Prospector Limpets", price: 900, desc: "Aim at a rock to read its yield before you drill. Spots motherlodes." },
  { id: "refinery", name: "Refinery", price: 1400, desc: "Refines a share of every cracked rock into metals on the spot." },
  { id: "fss", name: "Discovery Scanner", price: 1100, desc: "Logs every system fully on arrival and marks its signals and derelicts." },
  { id: "dss", name: "Surface Scanner", price: 1600, desc: "Orbital surveys map a whole world in one pass and pay double." },
  { id: "thrusters", name: "Tuned Thrusters", price: 2200, desc: "+15% thrust and top speed." },
  { id: "booster", name: "Shield Capacitor", price: 1300, desc: "+30% hull shield capacity. Booster plates add their own flat capacity.", shield: 0.3 },
  { id: "greenhouse", name: "Greenhouse", price: 900, desc: "Grows a crate of provisions every five minutes under way. Crew eat better and know it." },
  { id: "cabins", name: "Passenger Cabins", price: 1300, desc: "Two cabins in the hold: carry three fares at once from any station lounge." },
];

export function moduleDef(id: string): ModuleDef | undefined {
  return MODULES.find((m) => m.id === id);
}

export function hasModule(p: PlayerState, id: string): boolean {
  return (p.modules ?? []).includes(id);
}
