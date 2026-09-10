// Runtime side of achievements: unlock, announce, post to the wire.

import type { Game } from "../game";
import { ACHIEVEMENTS } from "../data/achievements";
import { sfx } from "./sfx";
import * as wire from "./wire";

let tick = 0;

export function checkAchievements(g: Game): void {
  if (++tick % 30 !== 0) return; // twice a second is plenty
  const p = g.world.player;
  p.achievements ??= [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements.includes(a.id)) continue;
    if (!a.check(g.world)) continue;
    p.achievements.push(a.id);
    g.toast(`ACHIEVEMENT: ${a.title}`);
    sfx.pickup();
    void wire.post("achievement", `earned ${a.title}`, g.world.systems[p.systemId].name);
  }
}

export function flag(g: Game, name: string): void {
  const p = g.world.player;
  p.flags ??= {};
  p.flags[name] = true;
}
