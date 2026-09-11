// NPC / platform / projectile simulation for the flight scene.
// Every function takes the scene as explicit state so this file has no `this`.

import type { Game } from "../../game";
import type { FlightScene } from "./index";
import type { Npc, NpcKind, Platform } from "./types";
import { RNG, hashStr } from "../../core/rng";
import { clamp, TAU, angDiff, dist } from "../../core/mathx";
import { PAL } from "../../gfx/palette";
import { sfx } from "../../core/sfx";
import { addCargo, stationExports, adjustRep, passengersTookFire, noteLeg } from "../../world";
import { commodity } from "../../data/data";
import * as wire from "../../core/wire";
import { applyVariant, variantStats, fleeLine, captainDown } from "./combat";
import { flag } from "../../core/achievements";
import { hasModule } from "../../data/modules";
import { gainMaterials } from "../../core/materials";
import { presence } from "../../core/presence";
import { baseAt, fetchBases } from "../../core/wire";
import { syndicateAt, synAllies, syndicateByTag, warContribute, adjustSynRep, infraAt, infraLit, infraTraffic, Infra, crewXp, pickCaptainFor } from "../../world";

// ---------- Population ----------

export function populate(fs: FlightScene, g: Game): void {
  const sys = g.world.systems[g.world.player.systemId];
  const rng = new RNG((g.world.seed ^ g.world.time * 1000) >>> 0 || 1);
  const nPirates = Math.round(sys.pirateActivity * 5);
  for (let i = 0; i < nPirates; i++) spawnNpc(fs, g, "pirate", rng);
  for (let i = 0; i < sys.stations.length; i++) spawnTrader(fs, g, rng);
  // a lit beacon or a stocked depot pulls through-traffic into a dead system
  for (const inf of infraAt(g.world, sys.id)) {
    if (!infraLit(inf) || (inf.kind === "depot" && inf.stock <= 0)) continue;
    const n = Math.min(4, 1 + Math.floor(infraTraffic(g.world, sys.id) / 2));
    for (let k = 0; k < n; k++) spawnTransit(fs, g, rng, inf);
  }
  if (sys.factionId !== "vex") {
    spawnNpc(fs, g, "patrol", rng);
    sys.stations.forEach((st, i) => {
      const wing = st.military ? 3 : 2;
      for (let k = 0; k < wing; k++) {
        const sx = Math.cos(st.angle) * st.orbit;
        const sy = Math.sin(st.angle) * st.orbit;
        const a = rng.range(0, TAU);
        fs.npcs.push({
          kind: "fighter",
          x: sx + Math.cos(a) * 120, y: sy + Math.sin(a) * 120,
          vx: 0, vy: 0, angle: a,
          hull: 60, hullMax: 60,
          fireCd: rng.range(0, 0.5),
          targetIdx: i,
        });
      }
    });
  }

  // AI syndicates: convoys around their base, raiders in rival space
  for (const sy of g.world.syndicates ?? []) {
    if (sy.systemId === sys.id) {
      const home = sys.stations.findIndex((st) => st.id === sy.stationId);
      if (home >= 0) for (let k = 0; k < 2; k++) {
        spawnTrader(fs, g, rng);
        const n = fs.npcs[fs.npcs.length - 1];
        n.tag = sy.tag; n.targetIdx = home; n.hullMax = n.hull = 80;
        if (sy.style === "pirate") { n.kind = "pirate"; n.variant = "raider"; }
      }
    } else if (sy.style === "pirate" && ((g.world.syndicates ?? []).some((o) => sy.rivals.includes(o.tag) && o.systemId === sys.id) || (g.world.player.synRep?.[sy.tag] ?? 0) <= -20) && rng.chance(0.5)) {
      const n = spawnNpc(fs, g, "pirate", rng);
      n.tag = sy.tag; n.variant = "raider";
    } else if (sy.style !== "pirate" && synAllies(g.world, sy.tag).some((t) => (g.world.syndicates ?? []).find((o) => o.tag === t)?.systemId === sys.id) && rng.chance(0.6)) {
      spawnTrader(fs, g, rng);
      const n = fs.npcs[fs.npcs.length - 1];
      n.tag = sy.tag; n.hullMax = n.hull = 80;
    }
  }

  // a syndicate war in this system: attacker raiders and defender convoys
  const war = g.world.synWar;
  if (war && war.systemId === sys.id) {
    for (let k = 0; k < 3; k++) { const n = spawnNpc(fs, g, "pirate", rng); n.tag = war.attacker; n.variant = "raider"; }
    const home = sys.stations.findIndex((st) => st.id === syndicateByTag(g.world, war.defender)?.stationId);
    for (let k = 0; k < 2; k++) { spawnTrader(fs, g, rng); const n = fs.npcs[fs.npcs.length - 1]; n.tag = war.defender; if (home >= 0) n.targetIdx = home; n.hullMax = n.hull = 80; }
  }

  // squadron bases draw raiders unless a defense grid is up
  fs.raidBase = null;
  sys.stations.forEach((st, i) => {
    const b = baseAt(st.id);
    if (!b || b.upgrades.includes("defense") || sys.pirateActivity < 0.2) return;
    const sx = Math.cos(st.angle) * st.orbit, sy = Math.sin(st.angle) * st.orbit;
    // the raid is led by the pirate syndicate that likes you least
    const pirates = (g.world.syndicates ?? []).filter((x) => x.style === "pirate");
    const leader = pirates.sort((x, y) => (g.world.player.synRep?.[x.tag] ?? 0) - (g.world.player.synRep?.[y.tag] ?? 0))[0];
    for (let k = 0; k < 2; k++) {
      const n = spawnNpc(fs, g, "pirate", rng);
      const a = rng.range(0, TAU);
      n.x = sx + Math.cos(a) * 320; n.y = sy + Math.sin(a) * 320;
      if (leader) { n.tag = leader.tag; n.variant = "raider"; }
    }
    fs.raidBase = { tag: b.tag, stationIdx: i, repelled: false, by: leader?.tag };
  });

  fs.platforms = [];
  const hostile = sys.factionId === "vex";
  void fetchBases();
  sys.stations.forEach((st, i) => {
    const grid = (baseAt(st.id)?.upgrades.includes("defense") ? 3 : 0) + (syndicateAt(g.world, st.id) ? 2 : 0);
    const n = (st.military ? 4 : 2) + grid;
    for (let k = 0; k < n; k++) {
      fs.platforms.push({
        anchor: "station", anchorIdx: i,
        orbitR: 70 + (k % 2) * 20, orbitAngle: (k / n) * TAU, orbitSpeed: 0.25,
        x: 0, y: 0, fireCd: rng.range(0, 1), hostileToPlayer: hostile,
      });
    }
  });
  sys.jumpPoints.forEach((jp, i) => {
    if (!jp.guarded) return;
    for (let k = 0; k < 2; k++) {
      fs.platforms.push({
        anchor: "gate", anchorIdx: i,
        orbitR: 75, orbitAngle: k * Math.PI, orbitSpeed: 0.18,
        x: 0, y: 0, fireCd: rng.range(0, 1), hostileToPlayer: hostile,
      });
    }
  });
  if (!hostile) {
    sys.planets.forEach((pl, i) => {
      if (!rng.chance(0.7)) return;
      fs.platforms.push({
        anchor: "planet", anchorIdx: i,
        orbitR: pl.radius + 26, orbitAngle: rng.range(0, TAU), orbitSpeed: 0.5,
        x: 0, y: 0, fireCd: rng.range(0, 1), hostileToPlayer: false,
      });
    });
  }
}

export function spawnNpc(fs: FlightScene, g: Game, kind: NpcKind, rng: RNG): Npc {
  const p = g.world.player;
  const a = rng.range(0, TAU);
  const r = rng.range(500, 1500);
  const npc: Npc = {
    kind,
    x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r,
    vx: 0, vy: 0, angle: rng.range(0, TAU),
    hull: kind === "pirate" ? 40 : kind === "patrol" ? 80 : 50,
    hullMax: kind === "pirate" ? 40 : kind === "patrol" ? 80 : 50,
    fireCd: 0,
    targetIdx: rng.int(0, 10),
  };
  if (kind === "pirate") applyVariant(npc, rng, g.world.systems[p.systemId].pirateActivity);
  fs.npcs.push(npc);
  return npc;
}

// Traders leave a station carrying what it exports, bound for another.
export function spawnTrader(fs: FlightScene, g: Game, rng: RNG): void {
  const sys = g.world.systems[g.world.player.systemId];
  if (!sys.stations.length) return;
  const from = sys.stations[rng.int(0, sys.stations.length - 1)];
  const exports = stationExports(from);
  const id = exports.length ? rng.pick(exports) : "food";
  const sx = Math.cos(from.angle) * from.orbit, sy = Math.sin(from.angle) * from.orbit;
  const a = rng.range(0, TAU);
  const cap = pickCaptainFor(g.world, sys.id, rng);
  const p = g.world.player;
  if (dist(sx, sy, p.x, p.y) < 1400 && fs.comms.length < 4) fs.comms.push({ from: `${from.name.toUpperCase()} CONTROL`, text: `${(cap?.name ?? "HAULER").toUpperCase()} DEPARTING BAY ${rng.int(1, 6)}. TRAFFIC ON THE APPROACH, MIND YOUR SPACING.`, life: 6, color: PAL.greyDark });
  fs.npcs.push({
    kind: "trader",
    x: sx + Math.cos(a) * 200, y: sy + Math.sin(a) * 200,
    vx: 0, vy: 0, angle: a,
    hull: cap ? 70 : 50, hullMax: cap ? 70 : 50, fireCd: 0,
    targetIdx: (sys.stations.indexOf(from) + 1) % Math.max(1, sys.stations.length),
    cargo: { id, qty: rng.int(2, 6) },
    originStationId: from.id,
    name: cap?.name,
  });
}

// Ghosts on the lanes: a real pilot posted from this system lately; their ship is out here too.
// Not multiplayer. A hauler with their call sign on it, going about its business, hailing once.
export function spawnGhost(fs: FlightScene, g: Game, rng: RNG, ev: { callsign: string; text: string }): void {
  const sys = g.world.systems[g.world.player.systemId];
  if (!sys.stations.length) return;
  const from = rng.pick(sys.stations);
  const sx = Math.cos(from.angle) * from.orbit, sy = Math.sin(from.angle) * from.orbit;
  const a = rng.range(0, TAU);
  fs.npcs.push({
    kind: "trader", x: sx + Math.cos(a) * 320, y: sy + Math.sin(a) * 320, vx: 0, vy: 0, angle: a,
    hull: 80, hullMax: 80, fireCd: 0, targetIdx: (sys.stations.indexOf(from) + 1) % Math.max(1, sys.stations.length),
    cargo: { id: "parts", qty: 2 }, originStationId: from.id, name: ev.callsign, ghost: ev.text,
  });
}

// A real pilot's mayday from the wire: their ship, dead in the water off a station, waiting for fuel
export function spawnMayday(fs: FlightScene, g: Game, callsign: string): void {
  const sys = g.world.systems[g.world.player.systemId];
  const rng = new RNG(hashStr(`mayday:${callsign}:${sys.id}`));
  const from = sys.stations.length ? rng.pick(sys.stations) : null;
  const cx = from ? Math.cos(from.angle) * from.orbit : 0, cy = from ? Math.sin(from.angle) * from.orbit : 0;
  const a = rng.range(0, TAU), r = rng.int(500, 900);
  fs.npcs.push({ kind: "trader", x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, vx: 0, vy: 0, angle: a, hull: 60, hullMax: 60, fireCd: 0, targetIdx: 0, name: callsign, disabled: true, mayday: true, ghost: "stranded, tanks dry" });
}

// Through-traffic: a hauler comes in one gate, swings past the structure, and leaves by another.
export function spawnTransit(fs: FlightScene, g: Game, rng: RNG, inf: Infra): void {
  const sys = g.world.systems[g.world.player.systemId];
  if (sys.jumpPoints.length < 1) return;
  const from = rng.pick(sys.jumpPoints);
  const to = sys.jumpPoints.length > 1 ? rng.pick(sys.jumpPoints.filter((j) => j !== from)) : from;
  const t = rng.range(0, 1);
  fs.npcs.push({
    kind: "trader",
    x: from.x + (inf.x - from.x) * t + rng.range(-80, 80), y: from.y + (inf.y - from.y) * t + rng.range(-80, 80),
    vx: 0, vy: 0, angle: rng.range(0, TAU),
    hull: 50, hullMax: 50, fireCd: 0, targetIdx: 0,
    cargo: { id: rng.pick(["metals", "food", "parts", "lux"]), qty: rng.int(2, 5) },
    transit: t < 0.5 ? { tx: inf.x + rng.range(-60, 60), ty: inf.y + rng.range(-60, 60) } : { tx: to.x, ty: to.y },
  });
}

// Carrier hangar: escort drones that shadow the player and engage nearby corsairs.
export function spawnDrones(fs: FlightScene, g: Game, count: number): void {
  const p = g.world.player;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    fs.npcs.push({
      kind: "drone",
      x: p.x + Math.cos(a) * 60, y: p.y + Math.sin(a) * 60,
      vx: p.vx, vy: p.vy, angle: p.angle,
      hull: 45, hullMax: 45, fireCd: 0, targetIdx: i,
    });
  }
}

export function spawnPirateNearBelt(fs: FlightScene, g: Game): void {
  const sys = g.world.systems[g.world.player.systemId];
  const rng = new RNG((Math.random() * 1e9) >>> 0);
  const rock = sys.asteroids.length ? sys.asteroids[rng.int(0, sys.asteroids.length - 1)] : null;
  if (!rock) { spawnNpc(fs, g, "pirate", rng); return; }
  const npc: Npc = {
    kind: "pirate",
    x: rock.x + rng.range(-200, 200), y: rock.y + rng.range(-200, 200),
    vx: 0, vy: 0, angle: rng.range(0, TAU),
    hull: 40, hullMax: 40, fireCd: 0, targetIdx: 0,
  };
  applyVariant(npc, rng, sys.pirateActivity);
  fs.npcs.push(npc);
}

// ---------- Effects ----------

export function exhaust(fs: FlightScene, x: number, y: number, ang: number, color: string): void {
  for (let i = 0; i < 2; i++) {
    const a = ang + (Math.random() - 0.5) * 0.5;
    const s = 40 + Math.random() * 50;
    fs.particles.push({
      x: x + Math.cos(ang) * 10, y: y + Math.sin(ang) * 10,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.35 + Math.random() * 0.25, color,
    });
  }
}

export function boom(fs: FlightScene, x: number, y: number, n: number, color: string): void {
  if (n >= 12) sfx.boom(n >= 18);
  else sfx.hit();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const s = 20 + Math.random() * 90;
    fs.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.6, color });
  }
}

export function updateParticles(fs: FlightScene, dt: number): void {
  for (const pt of fs.particles) {
    pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt;
  }
  fs.particles = fs.particles.filter((pt) => pt.life > 0);
}

// ---------- Mining & loot ----------

export function mine(fs: FlightScene, g: Game, dt: number, rate: number, aim: number): void {
  const p = g.world.player;
  const sys = g.world.systems[p.systemId];
  for (const a of sys.asteroids) {
    if (a.ore <= 0) continue;
    if (dist(p.x, p.y, a.x, a.y) >= 90) continue;
    const ang = Math.atan2(a.y - p.y, a.x - p.x);
    if (Math.abs(angDiff(aim, ang)) >= 0.5) continue;
    if (a.core) {
      if (Math.random() < dt * 0.7) g.toast("CORE ROCK - LASERS WON'T CRACK IT - PLANT A SEISMIC CHARGE (C)");
      if (Math.random() < dt * 4) fs.particles.push({ x: a.x, y: a.y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0.3, color: PAL.gold });
      return;
    }
    a.ore -= dt * rate;
    if (Math.random() < dt * 8) sfx.mine();
    if (Math.random() < dt * 6) {
      fs.particles.push({
        x: a.x + (Math.random() - 0.5) * a.radius, y: a.y + (Math.random() - 0.5) * a.radius,
        vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30,
        life: 0.5, color: PAL.mining,
      });
    }
    if (a.ore <= 0) {
      const qty = a.rich ? 3 : 1;
      p.mined = (p.mined ?? 0) + qty;
      const refined = hasModule(p, "refinery") && Math.random() < 0.6 ? 1 : 0;
      if (qty - refined > 0) fs.loot.push({ x: a.x, y: a.y, commodityId: "ore", qty: qty - refined, life: 60 });
      if (refined) fs.loot.push({ x: a.x - 8, y: a.y + 6, commodityId: "metals", qty: 1, life: 60 });
      if (a.rich && Math.random() < 0.25) {
        fs.loot.push({ x: a.x + 8, y: a.y + 4, commodityId: "metals", qty: 1, life: 60 });
      }
      boom(fs, a.x, a.y, 12, PAL.mining);
      g.toast("ASTEROID CRACKED");
      const gains: Record<string, number> = {};
      if (Math.random() < 0.55) gains.iron = 1;
      if (Math.random() < 0.35) gains.nickel = 1;
      if (Math.random() < 0.3) gains.carbon = 1;
      if (Math.random() < 0.08) gains.germanium = 1;
      if (a.rich && Math.random() < 0.3) gains.vanadium = 1;
      if (Object.keys(gains).length) setTimeout(() => gainMaterials(g, gains), 900);
    }
    return;
  }
}

export function updateLoot(fs: FlightScene, g: Game, dt: number): void {
  const p = g.world.player;
  const collector = hasModule(p, "collector");
  for (const l of fs.loot) {
    l.life -= dt;
    if (collector) {
      const d = dist(l.x, l.y, p.x, p.y);
      if (d < 240 && d > 8) { l.x += ((p.x - l.x) / d) * 110 * dt; l.y += ((p.y - l.y) / d) * 110 * dt; }
    }
    if (dist(l.x, l.y, p.x, p.y) < 16) {
      if (addCargo(p, l.commodityId, l.qty)) {
        g.toast(`+${l.qty} ${commodity(l.commodityId).name.toUpperCase()}`);
        sfx.pickup();
        l.life = 0;
      }
    }
  }
  fs.loot = fs.loot.filter((l) => l.life > 0);
}

// ---------- Combat ----------

// Uniform grid over live NPCs so bullets only test their own and neighbouring
// cells instead of every ship in the system.
const CELL = 64;
function buildNpcGrid(npcs: Npc[]): Map<number, Npc[]> {
  const grid = new Map<number, Npc[]>();
  for (const n of npcs) {
    if (n.hull <= 0) continue;
    const key = cellKey(Math.floor(n.x / CELL), Math.floor(n.y / CELL));
    const bucket = grid.get(key);
    if (bucket) bucket.push(n); else grid.set(key, [n]);
  }
  return grid;
}
function cellKey(cx: number, cy: number): number {
  return ((cx + 0x8000) & 0xffff) * 0x10000 + ((cy + 0x8000) & 0xffff);
}
function nearby(grid: Map<number, Npc[]>, x: number, y: number, out: Npc[]): Npc[] {
  out.length = 0;
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const b = grid.get(cellKey(cx + dx, cy + dy));
    if (b) for (const n of b) out.push(n);
  }
  return out;
}

export function updateBullets(fs: FlightScene, g: Game, dt: number): void {
  const p = g.world.player;
  const grid = buildNpcGrid(fs.npcs);
  const scratch: Npc[] = [];
  for (const b of fs.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    if (b.hostile) {
      if (dist(b.x, b.y, p.x, p.y) < 12) {
        b.life = 0;
        damagePlayer(fs, g, b.dmg);
      }
    } else {
      for (const n of nearby(grid, b.x, b.y, scratch)) {
        if (n.hull <= 0) continue;
        if (dist(b.x, b.y, n.x, n.y) < 12) {
          b.life = 0;
          n.hull -= b.dmg;
          boom(fs, b.x, b.y, 3, PAL.danger);
          if (b.fromPlayer) fs.floaters.push({ x: n.x, y: n.y - 10, text: `${Math.round(b.dmg)}`, life: 0.8, color: PAL.white });
          if (n.hull <= 0) npcKilled(fs, g, n, b.fromPlayer === true);
          if (b.fromPlayer && n.kind !== "pirate") {
            p.wanted = Math.min(1, p.wanted + 0.15);
            adjustRep(g.world, g.world.systems[p.systemId].factionId, -3);
          }
          break;
        }
      }
    }
  }
  fs.bullets = fs.bullets.filter((b) => b.life > 0);
}

export function damagePlayer(fs: FlightScene, g: Game, dmg: number): void {
  if (g.world.hardcore) dmg *= 1.5; // cold void: everything hits harder
  const p = g.world.player;
  fs.camShake = 4;
  if (fs.cruise) { fs.cruise = false; g.toast("HIT - DROPPED FROM CRUISE"); }
  let absorbedTotal = 0;
  if (p.shield > 0) {
    const absorbed = Math.min(p.shield, dmg);
    p.shield -= absorbed;
    dmg -= absorbed;
    absorbedTotal = absorbed;
  }
  fs.hitFlash = 1;
  fs.floaters.push({ x: p.x, y: p.y - 12, text: `-${Math.round(dmg + Math.max(0, absorbedTotal))}`, life: 0.9, color: dmg > 0 ? PAL.danger : PAL.shield });
  if (dmg > 0) {
    p.hull -= dmg; passengersTookFire(p); noteLeg(p, "fights", g.world.time); fs.damageReport(g);
    if (Math.random() < 0.4) {
      const sys = p.systems[Math.floor(Math.random() * p.systems.length)];
      sys.health = Math.max(0, sys.health - dmg * (1.5 + Math.random()));
      g.toast(`${sys.name.toUpperCase()} DAMAGED`);
    }
    boom(fs, p.x, p.y, 5, PAL.danger);
  }
}

export function npcKilled(fs: FlightScene, g: Game, n: Npc, byPlayer: boolean): void {
  const p = g.world.player;
  const facId = g.world.systems[p.systemId].factionId;
  boom(fs, n.x, n.y, 20, PAL.thrust);
  if (n.kind === "pirate") {
    if (byPlayer && n.tag) {
      const war = g.world.synWar;
      if (war && war.systemId === p.systemId && n.tag === war.attacker) {
        const w2 = warContribute(g.world, war.defender, 8);
        adjustSynRep(g.world, war.defender, 2);
        if (w2) g.toast(`WAR: RAIDER DOWN FOR [${war.defender}] - FRONT ${w2.score > 0 ? "+" : ""}${w2.score}`);
      } else if (n.tag) adjustSynRep(g.world, n.tag, -2);
    }
    if (byPlayer && n.name === "THE HERALD") { p.flags = { ...(p.flags ?? {}), storyHerald: true }; boom(fs, n.x, n.y, 60, PAL.gold); g.toast("THE HERALD BREAKS APART"); }
    else if (byPlayer && n.variant === "captain") captainDown(fs, g, n);
    if (byPlayer) {
      p.kills++;
      { const up = crewXp(p, "gunner"); if (up) g.toast(up); }
      if (presence.ghosts.size) presence.send({ t: "wing", kind: "kill", x: n.x, y: n.y, tag: n.variant ?? "pirate" });
      if (fs.raidBase && !fs.raidBase.repelled) {
        const st = g.world.systems[p.systemId].stations[fs.raidBase.stationIdx];
        if (st && dist(n.x, n.y, Math.cos(st.angle) * st.orbit, Math.sin(st.angle) * st.orbit) < 600 && !fs.npcs.some((o) => o !== n && o.kind === "pirate" && o.hull > 0 && dist(o.x, o.y, Math.cos(st.angle) * st.orbit, Math.sin(st.angle) * st.orbit) < 600)) {
          fs.raidBase.repelled = true;
          g.toast(`RAID REPELLED - THE [${fs.raidBase.tag}] BASE IS CLEAR${fs.raidBase.by ? ` - [${fs.raidBase.by}] WILL REMEMBER` : ""}`);
          if (fs.raidBase.by) adjustSynRep(g.world, fs.raidBase.by, -3);
          void wire.post("base", `drove raiders off the [${fs.raidBase.tag}] base at ${st.name}`, g.world.systems[p.systemId].name);
          flag(g, "defender");
        }
      }
      if (facId !== "vex") adjustRep(g.world, facId, 2);
      else adjustRep(g.world, "vex", -4);
      for (const m of p.missions) {
        if (m.kind === "bounty" && m.accepted && !m.done && m.targetSystemId === p.systemId) {
          m.kills = (m.kills ?? 0) + 1;
          g.toast(`BOUNTY ${m.kills}/${m.killsNeeded}`);
        }
      }
    }
    if (Math.random() < 0.7) {
      const pool = ["metals", "fuel", "parts", "contra", "lux"];
      const id = pool[Math.floor(Math.random() * pool.length)];
      fs.loot.push({ x: n.x, y: n.y, commodityId: id, qty: 1 + Math.floor(Math.random() * 3), life: 60 });
    }
  } else if (n.kind === "drone") {
    if (n.companion) { g.toast(`${(n.name ?? "YOUR FRIEND").toUpperCase()} IS HIT AND BREAKS OFF FOR HOME. THEY'LL LIVE. THEY'LL REMEMBER.`); g.world.player.companion = null; }
    else g.toast("ESCORT DRONE LOST - RE-ARMS AT NEXT DOCK");
  } else {
    // traders drop what they were hauling, whoever killed them
    if (n.cargo) fs.loot.push({ x: n.x, y: n.y, commodityId: n.cargo.id, qty: n.cargo.qty, life: 60 });
    if (byPlayer) {
      p.wanted = Math.min(1, p.wanted + 0.4);
      adjustRep(g.world, facId, -15);
      adjustRep(g.world, "vex", 5);
      g.toast("WARRANT ISSUED - PATROLS ALERTED");
      g.world.events.push({ t: g.world.time, kind: "murder", systemId: p.systemId, text: `A ${n.kind} was destroyed by an unregistered vessel` });
    }
  }
}

// ---------- NPC steering ----------

export function updateNpcs(fs: FlightScene, g: Game, dt: number): void {
  const p = g.world.player;
  const sys = g.world.systems[p.systemId];
  const lawful = p.wanted > 0.5;
  for (const n of fs.npcs) {
    if (n.hull <= 0) continue;
    n.fireCd -= dt;
    let tx = n.x, ty = n.y, wantFire = false, speed = 60;
    let fireHostile = true;
    if (n.convoy) {
      // form on the player's stern, staggered, and keep station
      const idx = Math.max(0, fs.npcs.filter((o) => o.convoy && o.hull > 0).indexOf(n));
      const back = Math.atan2(p.vy, p.vx) + Math.PI; const side = back + Math.PI / 2;
      const behind = 70 + idx * 45, lateral = (idx % 2 ? 1 : -1) * (25 + 10 * Math.floor(idx / 2));
      tx = p.x + Math.cos(back) * behind + Math.cos(side) * lateral; ty = p.y + Math.sin(back) * behind + Math.sin(side) * lateral;
      speed = 160;
    } else if (n.kind === "pirate") {
      const vs = variantStats(n);
      // low hull: break off and run for the belt; despawn once well away
      if (!n.fleeing && n.variant !== "captain" && n.hull < n.hullMax * 0.3) { n.fleeing = true; fleeLine(fs, n); }
      if (n.fleeing) {
        const away = Math.atan2(n.y - p.y, n.x - p.x);
        tx = n.x + Math.cos(away) * 400; ty = n.y + Math.sin(away) * 400; speed = vs.speed * 1.2;
        if (dist(n.x, n.y, p.x, p.y) > 2600) n.hull = 0; // gone
      } else {
      let threat: Platform | null = null;
      for (const pf of fs.platforms) {
        if (dist(n.x, n.y, pf.x, pf.y) < 360) { threat = pf; break; }
      }
      const d = dist(n.x, n.y, p.x, p.y);
      if (threat) {
        tx = n.x - (threat.x - n.x); ty = n.y - (threat.y - n.y); speed = 110;
      } else if (d < 700 && !inSafeZone(fs, g, p.x, p.y) && !fs.piratesFriendly(g)) {
        tx = p.x; ty = p.y; wantFire = d < 260; speed = 95;
      } else {
        let prey: Npc | null = null;
        for (const o of fs.npcs) {
          if (o.kind === "trader" && o.hull > 0 && dist(n.x, n.y, o.x, o.y) < 500) { prey = o; break; }
        }
        if (prey) {
          tx = prey.x; ty = prey.y; speed = 95;
          if (dist(n.x, n.y, prey.x, prey.y) < 240) { wantFire = true; fireHostile = false; }
        } else {
          tx = n.x + Math.cos(n.angle) * 100; ty = n.y + Math.sin(n.angle) * 100;
        }
      }
      }
      if (!n.fleeing) speed = Math.max(speed, vs.speed * (wantFire ? 1 : 0.8));
    } else if (n.kind === "drone") {
      speed = 130;
      let target: Npc | null = null;
      for (const o of fs.npcs) {
        if (o.kind === "pirate" && o.hull > 0 && dist(p.x, p.y, o.x, o.y) < 450) { target = o; break; }
      }
      if (target) {
        tx = target.x; ty = target.y;
        wantFire = dist(n.x, n.y, target.x, target.y) < 260;
        fireHostile = false;
      } else {
        // formation slot beside the carrier
        const slot = n.targetIdx % 2 === 0 ? 1 : -1;
        tx = p.x + Math.cos(p.angle + slot * 2.2) * 45; ty = p.y + Math.sin(p.angle + slot * 2.2) * 45;
        speed = 160;
      }
    } else if (n.kind === "fighter") {
      speed = 110;
      const st = sys.stations[n.targetIdx % Math.max(1, sys.stations.length)];
      const hx = st ? Math.cos(st.angle) * st.orbit : 0;
      const hy = st ? Math.sin(st.angle) * st.orbit : 0;
      let target: Npc | null = null;
      for (const o of fs.npcs) {
        if (o.kind === "pirate" && o.hull > 0 && dist(hx, hy, o.x, o.y) < 800) { target = o; break; }
      }
      if (p.wanted > 0.6 && dist(hx, hy, p.x, p.y) < 500) {
        tx = p.x; ty = p.y; wantFire = dist(n.x, n.y, p.x, p.y) < 280; fireHostile = true;
      } else if (target) {
        tx = target.x; ty = target.y;
        wantFire = dist(n.x, n.y, target.x, target.y) < 280;
        fireHostile = false;
      } else {
        const a = Math.atan2(n.y - hy, n.x - hx) + 0.6;
        tx = hx + Math.cos(a) * 120; ty = hy + Math.sin(a) * 120;
        speed = 70;
      }
    } else if (n.kind === "trader" && n.disabled) {
      speed = 0; n.vx *= 0.9; n.vy *= 0.9; tx = n.x; ty = n.y;
    } else if (n.kind === "trader" && n.casualties) {
      speed = 0; n.vx *= 0.95; n.vy *= 0.95; tx = n.x; ty = n.y;
    } else if (n.kind === "trader" && n.transit) {
      tx = n.transit.tx; ty = n.transit.ty;
      if (dist(n.x, n.y, tx, ty) < 50) {
        const inf = infraAt(g.world, sys.id).find((i) => dist(i.x, i.y, tx, ty) < 90);
        if (inf && sys.jumpPoints.length) { const to = sys.jumpPoints[Math.floor(Math.random() * sys.jumpPoints.length)]; n.transit = { tx: to.x, ty: to.y }; }
        else { n.hull = 0; n.docked = true; }
      }
      for (const o of fs.npcs) {
        if (o.kind === "pirate" && o.hull > 0 && dist(n.x, n.y, o.x, o.y) < 200) { tx = n.x - (o.x - n.x); ty = n.y - (o.y - n.y); speed = 110; }
      }
    } else if (n.kind === "trader") {
      const st = sys.stations[n.targetIdx % Math.max(1, sys.stations.length)];
      if (st) {
        tx = Math.cos(st.angle) * st.orbit; ty = Math.sin(st.angle) * st.orbit;
        if (dist(n.x, n.y, tx, ty) < 60) {
          // control calls them in on the band, if you're close enough to hear it
          if (!n.announced && !n.convoy && !n.ghost && dist(n.x, n.y, p.x, p.y) < 1400 && fs.comms.length < 4) { n.announced = true; const bay = 1 + Math.abs(Math.round(n.x + n.y)) % 6; fs.comms.push({ from: `${st.name.toUpperCase()} CONTROL`, text: `${(n.name ?? (n.tag ? `[${n.tag}] CONVOY` : "HAULER")).toUpperCase()}, BAY ${bay} IS YOURS. ${["WELCOME IN.", "MIND THE TRAFFIC.", "WE HAVE YOU.", "GOOD TO SEE YOU BACK."][bay % 4]}`, life: 6, color: PAL.greyDark }); }
          // deliver: stock the station, pick up its exports, move on (or dock for a while)
          if (n.cargo) { st.stock[n.cargo.id] = (st.stock[n.cargo.id] ?? 0) + n.cargo.qty; }
          if (!n.tag && Math.random() < 0.3) { boom(fs, n.x, n.y, 6, PAL.info); n.hull = 0; n.docked = true; }
          const ex = stationExports(st);
          n.cargo = ex.length ? { id: ex[Math.floor(Math.random() * ex.length)], qty: 2 + Math.floor(Math.random() * 5) } : undefined;
          n.originStationId = st.id;
          n.targetIdx++;
        }
      }
      for (const o of fs.npcs) {
        if (o.kind === "pirate" && o.hull > 0 && dist(n.x, n.y, o.x, o.y) < 200) {
          tx = n.x - (o.x - n.x); ty = n.y - (o.y - n.y); speed = 110;
        }
      }
    } else { // patrol
      speed = 100;
      let target: { x: number; y: number } | null = null;
      if (lawful) {
        const d = dist(n.x, n.y, p.x, p.y);
        if (d < 900) { target = p; wantFire = d < 260; fireHostile = true; }
      }
      if (!target) {
        for (const o of fs.npcs) {
          if (o.kind === "pirate" && o.hull > 0 && dist(n.x, n.y, o.x, o.y) < 900) { target = o; break; }
        }
        if (target && dist(n.x, n.y, target.x, target.y) < 260) { wantFire = true; fireHostile = false; }
      }
      if (target) { tx = target.x; ty = target.y; }
      else { tx = n.x + Math.cos(n.angle) * 100; ty = n.y + Math.sin(n.angle) * 100; }
    }

    const maxs = n.convoy ? 190 : n.kind === "pirate" ? variantStats(n).maxs * (n.fleeing ? 1.25 : 1) : n.kind === "drone" ? 300 : 130;
    const dx = tx - n.x, dy = ty - n.y;
    const dd = Math.hypot(dx, dy) || 1;
    let desSpeed = Math.min(maxs, dd * 0.8);
    let dirX = dx / dd, dirY = dy / dd;
    const targetingPlayer = tx === p.x && ty === p.y;
    if (n.kind === "pirate" && dd < 140 && targetingPlayer) {
      dirX = -dy / dd; dirY = dx / dd;
      desSpeed = maxs * 0.4;
    }
    n.vx += clamp(dirX * desSpeed - n.vx, -speed * 2.5 * dt, speed * 2.5 * dt);
    n.vy += clamp(dirY * desSpeed - n.vy, -speed * 2.5 * dt, speed * 2.5 * dt);
    const want = Math.atan2(ty - n.y, tx - n.x);
    n.angle += clamp(angDiff(n.angle, want), -3 * dt, 3 * dt);
    n.x += n.vx * dt;
    n.y += n.vy * dt;
    // engines you can see: a puff now and then from anything under way, nearby only
    if (Math.hypot(n.vx, n.vy) > 25 && Math.random() < dt * 6 && dist(n.x, n.y, p.x, p.y) < 700) {
      const back = n.angle + Math.PI;
      fs.particles.push({ x: n.x + Math.cos(back) * 8, y: n.y + Math.sin(back) * 8, vx: n.vx * 0.2 + Math.cos(back) * 30, vy: n.vy * 0.2 + Math.sin(back) * 30, life: 0.3, color: n.kind === "pirate" ? "#ff8a5a" : PAL.thrust });
    }

    if (wantFire && n.fireCd <= 0 && !n.fleeing) {
      const pv = n.kind === "pirate" ? variantStats(n) : null;
      n.fireCd = pv ? pv.fireCd : 0.5;
      const tvx = targetingPlayer ? p.vx : 0;
      const tvy = targetingPlayer ? p.vy : 0;
      const bs = pv ? pv.bulletSpeed : 300;
      const tof = Math.hypot(tx - n.x, ty - n.y) / bs;
      const aim = Math.atan2(ty + (tvy - n.vy) * tof - n.y, tx + (tvx - n.vx) * tof - n.x);
      if (dist(n.x, n.y, p.x, p.y) < 450) sfx.enemyLaser();
      const dmg = pv ? pv.dmg : n.kind === "patrol" || n.kind === "fighter" ? 8 : 7;
      const shots = n.variant === "captain" ? [-0.12, 0.12] : [0];
      for (const spread of shots) {
        fs.bullets.push({
          x: n.x + Math.cos(aim + spread) * 10, y: n.y + Math.sin(aim + spread) * 10,
          vx: n.vx + Math.cos(aim + spread) * bs, vy: n.vy + Math.sin(aim + spread) * bs,
          life: 1.8, hostile: fireHostile, dmg,
        });
      }
    }
  }
  fs.npcs = fs.npcs.filter((n) => n.hull > 0);
}

// ---------- Platforms ----------

export function inSafeZone(fs: FlightScene, g: Game, x: number, y: number): boolean {
  if (g.world.systems[g.world.player.systemId].factionId === "vex") return false;
  for (const pf of fs.platforms) {
    if (dist(x, y, pf.x, pf.y) < 350) return true;
  }
  return false;
}

export function platformPos(g: Game, pf: Platform): [number, number] {
  const sys = g.world.systems[g.world.player.systemId];
  let cx = 0, cy = 0;
  if (pf.anchor === "station") {
    const st = sys.stations[pf.anchorIdx];
    if (!st) return [pf.x, pf.y];
    cx = Math.cos(st.angle) * st.orbit; cy = Math.sin(st.angle) * st.orbit;
  } else if (pf.anchor === "gate") {
    const jp = sys.jumpPoints[pf.anchorIdx];
    if (!jp) return [pf.x, pf.y];
    cx = jp.x; cy = jp.y;
  } else {
    const pl = sys.planets[pf.anchorIdx];
    if (!pl) return [pf.x, pf.y];
    cx = Math.cos(pl.angle) * pl.orbit; cy = Math.sin(pl.angle) * pl.orbit;
  }
  return [cx + Math.cos(pf.orbitAngle) * pf.orbitR, cy + Math.sin(pf.orbitAngle) * pf.orbitR];
}

export function updatePlatforms(fs: FlightScene, g: Game, dt: number): void {
  const p = g.world.player;
  const shootOnSight = fs.lawLevel(g) >= 2;
  for (const pf of fs.platforms) {
    pf.orbitAngle += pf.orbitSpeed * dt;
    const [x, y] = platformPos(g, pf);
    pf.x = x; pf.y = y;
    pf.fireCd -= dt;
    if (pf.fireCd > 0) continue;
    let tx: number | null = null, ty = 0, tvx = 0, tvy = 0, hostileShot = false;
    for (const n of fs.npcs) {
      if (n.kind === "pirate" && n.hull > 0 && dist(x, y, n.x, n.y) < 320) {
        tx = n.x; ty = n.y; tvx = n.vx; tvy = n.vy;
        break;
      }
    }
    if (tx === null && (pf.hostileToPlayer || shootOnSight) && dist(x, y, p.x, p.y) < 320) {
      tx = p.x; ty = p.y; tvx = p.vx; tvy = p.vy; hostileShot = true;
    }
    if (tx === null) continue;
    pf.fireCd = 0.65;
    const tof = dist(x, y, tx, ty) / 360;
    const aim = Math.atan2(ty + tvy * tof - y, tx + tvx * tof - x);
    if (dist(x, y, p.x, p.y) < 450) sfx.enemyLaser();
    fs.bullets.push({
      x: x + Math.cos(aim) * 8, y: y + Math.sin(aim) * 8,
      vx: Math.cos(aim) * 360, vy: Math.sin(aim) * 360,
      life: 1.2, hostile: hostileShot, dmg: 9,
    });
  }
}

// ---------- Distress calls ----------

export function updateSos(fs: FlightScene, g: Game, dt: number): void {
  const p = g.world.player;
  const sys = g.world.systems[p.systemId];
  if (fs.sos) {
    const s = fs.sos;
    s.ttl -= dt;
    const traderAlive = s.trader.hull > 0 && fs.npcs.includes(s.trader);
    const piratesAlive = s.pirates.filter((x) => x.hull > 0 && fs.npcs.includes(x));
    if (!traderAlive) {
      g.toast("DISTRESS CALL LOST - TRADER DESTROYED");
      fs.sos = null;
    } else if (s.kind === "casualties") {
      if (!s.trader.casualties) fs.sos = null; // treated
      else if (s.ttl <= 0) { fs.sos = null; g.toast("THE MEDICAL CALL GOES QUIET."); }
    } else if (s.kind === "disabled") {
      if (!s.trader.disabled) fs.sos = null; // repaired
      else if (s.ttl <= 0) { fs.sos = null; g.toast("THE MAYDAY GOES QUIET. SOMEONE ELSE GOT THERE, OR NOBODY DID."); }
    } else if (piratesAlive.length === 0) {
      p.credits += s.reward;
      adjustRep(g.world, sys.factionId, 4);
      g.toast(`TRADER SAVED +${s.reward}CR`);
      sfx.pickup();
      g.world.events.push({ t: g.world.time, kind: "rescue", systemId: p.systemId, text: "A freighter was rescued from corsairs by an independent pilot" });
      void wire.post("rescue", "answered a distress call and saved a freighter", sys.name);
      flag(g, "rescue");
      p.rescues = (p.rescues ?? 0) + 1;
      fs.sos = null;
    } else if (s.ttl <= 0) {
      fs.sos = null;
    }
    return;
  }
  fs.sosTimer -= dt;
  if (fs.sosTimer > 0) return;
  fs.sosTimer = 70 + Math.random() * 60;
  if (sys.pirateActivity < 0.1) return;
  const a = Math.random() * TAU;
  const r = 700 + Math.random() * 500;
  const tx = p.x + Math.cos(a) * r, ty = p.y + Math.sin(a) * r;
  const trader: Npc = { kind: "trader", x: tx, y: ty, vx: 0, vy: 0, angle: 0, hull: 50, hullMax: 50, fireCd: 0, targetIdx: 0, cargo: { id: "lux", qty: 3 } };
  if (Math.random() < 0.25) {
    // wounded aboard after a bad jump: a job for a medic
    trader.casualties = true; trader.hull = 45;
    fs.npcs.push(trader);
    fs.sos = { trader, pirates: [], reward: 220 + Math.floor(Math.random() * 250), ttl: 200, kind: "casualties" };
    g.toast("MEDICAL - FREIGHTER REPORTS CASUALTIES AFTER A BAD JUMP. FLY CLOSE AND PRESS E");
    sfx.alarm();
    return;
  }
  if (Math.random() < 0.45) {
    // engines dead, nobody shooting yet: a job for a wrench, not a gun
    trader.disabled = true; trader.hull = 30; trader.angle = a;
    fs.npcs.push(trader);
    fs.sos = { trader, pirates: [], reward: 250 + Math.floor(Math.random() * 300), ttl: 240, kind: "disabled" };
    g.toast("MAYDAY - FREIGHTER DISABLED, ENGINES DEAD. FLY CLOSE AND PRESS E");
    g.showHint("mayday", "DISABLED SHIPS CAN BE BOARDED AND FIXED, OR YOUR ENGINEER CAN GO OVER WHILE YOU STAND GUARD");
    sfx.alarm();
    return;
  }
  const pirates: Npc[] = [];
  for (let i = 0; i < 2; i++) {
    pirates.push({ kind: "pirate", x: tx + 120 * Math.cos(i * 3), y: ty + 120 * Math.sin(i * 3), vx: 0, vy: 0, angle: 0, hull: 40, hullMax: 40, fireCd: 1, targetIdx: 0 });
  }
  fs.npcs.push(trader, ...pirates);
  fs.sos = { trader, pirates, reward: 150 + Math.floor(Math.random() * 200), ttl: 90, kind: "attack" };
  g.toast("DISTRESS CALL - TRADER UNDER ATTACK");
  sfx.alarm();
}
