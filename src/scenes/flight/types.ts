// Live (non-persisted) entities that exist while flying a system.

export interface Bullet {
  x: number; y: number; vx: number; vy: number;
  life: number; hostile: boolean; dmg: number;
  fromPlayer?: boolean;
}

export type NpcKind = "pirate" | "trader" | "patrol" | "fighter" | "drone";

export interface Npc {
  kind: NpcKind;
  x: number; y: number; vx: number; vy: number; angle: number;
  hull: number; hullMax: number;
  fireCd: number;
  targetIdx: number;              // traders: destination station; fighters: home station
  cargo?: { id: string; qty: number }; // traders haul real goods; dropped on death
  originStationId?: string;
}

export interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; color: string;
}

// Defense platform: armed satellite anchored to a station, gate, or planet.
export interface Platform {
  anchor: "station" | "gate" | "planet";
  anchorIdx: number;
  orbitR: number;
  orbitAngle: number;
  orbitSpeed: number;
  x: number; y: number;
  fireCd: number;
  hostileToPlayer: boolean;
}

export interface Loot {
  x: number; y: number; commodityId: string; qty: number; life: number;
}

export interface Sos {
  trader: Npc; pirates: Npc[]; reward: number; ttl: number;
}

export const BULLET_SPEED = 420;
