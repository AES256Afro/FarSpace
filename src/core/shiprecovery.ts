import { hull } from "../data/hulls";
import { adjustRep, logEntry, type World, type WreckDef, type StoredShip } from "../world";
import type { Npc } from "../scenes/flight/types";
import { prepareWreck } from "./derelicts";
import { recordOffence } from "./law";

export interface HullRecovery {
  hullId: string;
  hull: number;
  angle: number;
  status: "adrift" | "towing" | "dismantled" | "delivered";
  stationId?: string;
}
export interface RecoveryTow { systemId: string; wreckId: string }
export type CombatWeapon = "gun" | "torpedo";
export const DISABLE_CHANCE = { gun: 0.35, torpedo: 0.1 } as const;

// Story targets, escorts and other pilots keep their existing encounter rules.
export function canDisable(n: Npc): boolean {
  return n.kind !== "drone" && !n.disabled && !n.disabledWreckId && !n.docked
    && !n.ghost && !n.companion && !n.convoy && !n.naval && !n.tag && n.name !== "THE HERALD";
}

export function disableCombatShip(w: World, n: Npc, weapon: CombatWeapon, roll: number): WreckDef | null {
  if (n.hull > 0 || !canDisable(n) || !Number.isFinite(roll) || roll < 0 || roll >= DISABLE_CHANCE[weapon]) return null;
  const sys = w.systems[w.player.systemId];
  const hullId = n.kind === "trader" ? "freighter" : n.variant === "cutter" ? "freighter" : "interceptor";
  const h = hull(hullId);
  let serial = sys.wrecks.length, id = `disabled:${sys.id}:${serial}`;
  while (sys.wrecks.some(x => x.id === id)) id = `disabled:${sys.id}:${++serial}`;
  const wreck: WreckDef = { id, name: n.name ?? h.name, x: n.x, y: n.y, looted: false,
    hazard: 0.65, loot: n.cargo ? [{ ...n.cargo }] : [{ id: "parts", qty: 2 }],
    recovery: { hullId, hull: Math.round(h.hullMax * 0.2), angle: n.angle, status: "adrift" } };
  const boarding = prepareWreck(wreck, w.seed).state;
  boarding.survivor = true; boarding.claimResolved = true;
  sys.wrecks.push(wreck);
  // The persistent disabled hull replaces this live combat entity.
  n.disabled = true; n.disabledWreckId = id; n.hull = 0; n.vx = 0; n.vy = 0;
  if (n.kind !== "pirate") {
    recordOffence(w, 0.4); adjustRep(w, sys.factionId, -10);
    logEntry(w, `Disabled ${wreck.name}. Authorities recorded an attack on a civilian or patrol ship`);
  } else logEntry(w, `Disabled ${wreck.name}. The hull can be salvaged or recovered`);
  return wreck;
}

export function recoveryTow(w: World): WreckDef | null {
  const ref = w.player.recoveryTow;
  if (!ref || ref.systemId !== w.player.systemId) return null;
  const wreck = w.systems[ref.systemId]?.wrecks.find(x => x.id === ref.wreckId);
  return wreck?.recovery?.status === "towing" ? wreck : null;
}

export function detachRecoveryTow(w: World): void {
  const ref = w.player.recoveryTow;
  const wreck = ref && w.systems[ref.systemId]?.wrecks.find(x => x.id === ref.wreckId);
  if (wreck?.recovery?.status === "towing") wreck.recovery.status = "adrift";
  delete w.player.recoveryTow;
}

export function recoveryReason(w: World, wreck: WreckDef, otherTow = false): string | null {
  const r = wreck.recovery, b = wreck.boarding, p = w.player;
  if (!r || r.status === "delivered") return "THIS HULL IS NOT AVAILABLE FOR RECOVERY.";
  if (r.status === "dismantled") return "CUTTING HAS STARTED. THIS HULL CAN ONLY BE SALVAGED.";
  if (!w.systems[p.systemId].wrecks.includes(wreck) || Math.hypot(p.x - wreck.x, p.y - wreck.y) >= 80) return "APPROACH WITHIN 80M TO ATTACH THE LINE.";
  if (b?.survivor && !b.rescued) return "BOARD AND EVACUATE THE SURVIVOR FIRST.";
  if (!b || b.power < 100) return "BOARD AND RESTORE EMERGENCY POWER FIRST.";
  if (b.breaches.length) return "SEAL ALL HULL BREACHES BEFORE TOWING.";
  if (otherTow || (p.recoveryTow && p.recoveryTow.wreckId !== wreck.id)) return "ONE TOW AT A TIME. FINISH OR DETACH THE OTHER LINE.";
  if (!w.systems[p.systemId].stations.length) return "NO SHIPYARD IN THIS SYSTEM. THE HULL CANNOT TAKE A JUMP.";
  return null;
}

export function attachRecoveryTow(w: World, wreck: WreckDef, otherTow = false): string | null {
  const reason = recoveryReason(w, wreck, otherTow);
  if (reason) return reason;
  wreck.recovery!.status = "towing";
  w.player.recoveryTow = { systemId: w.player.systemId, wreckId: wreck.id };
  return null;
}

export function updateRecoveryTow(w: World, dt: number): string | null {
  if (!w.player.recoveryTow) return null;
  const wreck = recoveryTow(w), p = w.player;
  if (!wreck) { detachRecoveryTow(w); return "RECOVERY LINE DETACHED. THE HULL STAYS WHERE IT WAS LEFT."; }
  if (Math.hypot(p.x - wreck.x, p.y - wreck.y) > 420) {
    detachRecoveryTow(w); return "RECOVERY LINE SNAPPED. THE HULL REMAINS ON THE MAP.";
  }
  if (!Number.isFinite(dt) || dt <= 0) return null;
  const a = Math.atan2(wreck.y - p.y, wreck.x - p.x), k = Math.min(1, dt * 3);
  wreck.x += (p.x + Math.cos(a) * 70 - wreck.x) * k;
  wreck.y += (p.y + Math.sin(a) * 70 - wreck.y) * k;
  wreck.recovery!.angle = a + Math.PI;
  return null;
}

export function deliverRecovery(w: World, stationId: string): StoredShip | null {
  const wreck = recoveryTow(w), p = w.player;
  const st = w.systems[p.systemId].stations.find(s => s.id === stationId);
  if (!wreck || !st || p.dockedAt !== st.id || Math.hypot(wreck.x - Math.cos(st.angle) * st.orbit, wreck.y - Math.sin(st.angle) * st.orbit) >= 260) return null;
  const r = wreck.recovery!;
  const ship: StoredShip = { hullId: r.hullId, stationId, name: wreck.name, hull: r.hull, torpedoes: 0, recoveredFrom: wreck.id };
  (p.fleet ??= []).push(ship);
  r.status = "delivered"; r.stationId = stationId; delete p.recoveryTow;
  // Remaining contents go with the hull. They cannot also be collected at the wreck.
  wreck.looted = true;
  for (const part of wreck.salvage?.parts ?? []) { part.remaining = 0; part.progress = 0; }
  logEntry(w, `Recovered ${wreck.name} at ${st.name}. The hull is parked in the shipyard`);
  return ship;
}

export function hullSalePrice(ship: Pick<StoredShip, "hullId" | "hull">): number {
  const h = hull(ship.hullId);
  return Math.max(150, Math.round(Math.max(h.price, 900) * 0.45 * Math.min(1, Math.max(0.2, ship.hull / h.hullMax))));
}
