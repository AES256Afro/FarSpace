// Material pickups with a single combined toast.

import type { Game } from "../game";
import { addMaterials, MATERIALS } from "../data/engineering";

export function gainMaterials(g: Game, gains: Record<string, number>): void {
  const got = addMaterials(g.world.player, gains);
  const parts = Object.entries(got).map(([id, n]) => `+${n} ${(MATERIALS.find((m) => m.id === id)?.name ?? id).toUpperCase()}`);
  if (parts.length) g.toast(`MATERIALS: ${parts.join(", ")}`);
}
