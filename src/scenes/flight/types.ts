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
  variant?: "raider" | "cutter" | "captain"; // pirate flavours; undefined = standard
  name?: string;      // captains have names; they get hailed and mourned on the wire
  fleeing?: boolean;  // low hull: run for the belt
  hailed?: boolean;   // has said its line
  tag?: string;       // syndicate convoy or raider
  disabled?: boolean; // engines dead: drifting, waiting for help
  casualties?: boolean; // wounded aboard: a medic's job, not a wrench's
  docked?: boolean;   // slipped into a bay: removed quietly, not destroyed
  transit?: { tx: number; ty: number }; // through-traffic in a lit system: gate to gate, then gone
  companion?: boolean; // a friend's ship flying alongside
  ghost?: string;      // another real pilot's ship, spawned from what they posted on the wire from this system
  mayday?: boolean;    // a real pilot stranded here with dry tanks, from their mayday on the wire
  convoy?: boolean;    // a slow hauler following you to the gate for company
  naval?: boolean;     // a service cutter shadowing a commodore's hull for the leg
  announced?: boolean; // control has called this ship into a bay on the band
}

export interface Torpedo {
  x: number; y: number; vx: number; vy: number; life: number; target: Npc | null;
}

export interface Floater {
  x: number; y: number; text: string; life: number; color: string;
}

export interface Comms {
  from: string; text: string; life: number; color: string;
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
  trader: Npc; pirates: Npc[]; reward: number; ttl: number; kind: "attack" | "disabled" | "casualties";
}

export interface RepairJob { npc: Npc; crewName: string; progress: number; need: number; wave: number; kind: "repair" | "medic" }

export const BULLET_SPEED = 420;
