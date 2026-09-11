import { RNG, hashStr } from "./rng";
import { generateShipDeck, type DeckPoint, type ShipDeck } from "./shipdeck";
import type { WreckDef, AnomalyDef } from "../world";

export interface WreckBoarding {
  seed: number;
  crates: (DeckPoint & { id: string; qty: number; taken: boolean })[];
  fires: DeckPoint[];
  breaches: DeckPoint[];
  recorder: (DeckPoint & { taken: boolean }) | null;
  power: number;
  fuel: number;
  survivor: boolean;
  rescued: boolean;
  claimResolved: boolean;
}

export function prepareWreck(wreck: WreckDef, worldSeed: number): { layout: ShipDeck; state: WreckBoarding } {
  const seed = wreck.boarding?.seed ?? hashStr(`${worldSeed}:wreck:${wreck.id}`);
  const layout = generateShipDeck(seed);
  if (!wreck.boarding) {
    const rng = new RNG(seed ^ 0xf135);
    const spots = [...layout.cargoSpots];
    const crates = wreck.loot.map((l, i) => ({ ...spots[i % spots.length], ...l, taken: wreck.looted }));
    const hazards = spots.slice(crates.length, crates.length + Math.round(wreck.hazard * 5));
    const fires: DeckPoint[] = [], breaches: DeckPoint[] = [];
    for (const spot of hazards) (rng.chance(0.6) ? fires : breaches).push(spot);
    const old = wreck.looted || wreck.id.startsWith("wreck-mine");
    wreck.boarding = {
      seed, crates, fires, breaches,
      recorder: !old ? { ...layout.fixtures.recorder, taken: false } : null,
      power: 0, fuel: old ? 0 : rng.int(8, 20),
      survivor: !old && !wreck.id.startsWith("ark-") && rng.chance(0.45),
      rescued: false, claimResolved: old,
    };
  }
  return { layout, state: wreck.boarding };
}

export function wreckRecovered(state: WreckBoarding): boolean {
  return state.crates.every(c => c.taken) && (!state.recorder || state.recorder.taken)
    && state.fuel <= 0 && (!state.survivor || state.rescued);
}

export function wreckFromSignal(signal: AnomalyDef): WreckDef {
  return { id: `derelict:${signal.id}`, name: signal.name, x: signal.x, y: signal.y,
    looted: false, hazard: 0.35, loot: [{ id: "parts", qty: 3 }, { id: "metals", qty: 3 }] };
}
