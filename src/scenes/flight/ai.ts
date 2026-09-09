// NPC / platform / projectile simulation for the flight scene.
// Every function takes the scene as explicit state so this file has no `this`.

import type { Game } from "../../game";
import type { FlightScene } from "./index";
import type { Npc, NpcKind, Platform } from "./types";
import { RNG } from "../../core/rng";
import { clamp, TAU, angDiff, dist } from "../../core/mathx";
import { PAL } from "../../gfx/palette";
import { sfx } from "../../core/sfx";
import { addCargo, stationExports, adjustRep } from "../../world";
import { commodity } from "../../data/data";

// ---------- Population ----------

export function populate(fs: FlightScene, g: Game): void {
  const sys = g.world.systems[g.world.player.systemId];
  const rng = new RNG((g.world.seed ^ g.world.time * 1000) >>> 0 || 1);
  const nPirates = Math.round(sys.pirateActivity * 5);
  for (let i = 0; i < nPirates; i++) spawnNpc(fs, g, "pirate", rng);
  for (let i = 0; i < sys.stations.length; i++) spawnTrader(fs, g, rng);
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

  fs.platforms = [];
  const hostile = sys.factionId === "vex";
  sys.stations.forEach((st, i) => {
    const n = st.military ? 4 : 2;
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
  fs.npcs.push({
    kind: "trader",
    x: sx + Math.cos(a) * 200, y: sy + Math.sin(a) * 200,
    vx: 0, vy: 0, angle: a,
    hull: 50, hullMax: 50, fireCd: 0,
    targetIdx: (sys.stations.indexOf(from) + 1) % Math.max(1, sys.stations.length),
    cargo: { id, qty: rng.int(2, 6) },
    originStationId: from.id,
  });
}

export function spawnPirateNearBelt(fs: FlightScene, g: Game): void {
  const sys = g.world.systems[g.world.player.systemId];
  const rng = new RNG((Math.random() * 1e9) >>> 0);
  const rock = sys.asteroids.length ? sys.asteroids[rng.int(0, sys.asteroids.length - 1)] : null;
  if (!rock) { spawnNpc(fs, g, "pirate", rng); return; }
  fs.npcs.push({
    kind: "pirate",
    x: rock.x + rng.range(-200, 200), y: rock.y + rng.range(-200, 200),
    vx: 0, vy: 0, angle: rng.range(0, TAU),
    hull: 40, hullMax: 40, fireCd: 0, targetIdx: 0,
  });
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

export function mine(fs: FlightScene, g: Game, dt: number, rate: number): void {
  const p = g.world.player;
  const sys = g.world.systems[p.systemId];
  for (const a of sys.asteroids) {
    if (a.ore <= 0) continue;
    if (dist(p.x, p.y, a.x, a.y) >= 90) continue;
    const ang = Math.atan2(a.y - p.y, a.x - p.x);
    if (Math.abs(angDiff(p.angle, ang)) >= 0.5) continue;
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
      fs.loot.push({ x: a.x, y: a.y, commodityId: "ore", qty, life: 60 });
      if (a.rich && Math.random() < 0.25) {
        fs.loot.push({ x: a.x + 8, y: a.y + 4, commodityId: "metals", qty: 1, life: 60 });
      }
      boom(fs, a.x, a.y, 12, PAL.mining);
      g.toast("ASTEROID CRACKED");
    }
    return;
  }
}

export function updateLoot(fs: FlightScene, g: Game, dt: number): void {
  const p = g.world.player;
  for (const l of fs.loot) {
    l.life -= dt;
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
  const p = g.world.player;
  fs.camShake = 4;
  if (p.shield > 0) {
    const absorbed = Math.min(p.shield, dmg);
    p.shield -= absorbed;
    dmg -= absorbed;
  }
  if (dmg > 0) {
    p.hull -= dmg;
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
    if (byPlayer) {
      p.kills++;
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
    if (n.kind === "pirate") {
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
    } else if (n.kind === "trader") {
      const st = sys.stations[n.targetIdx % Math.max(1, sys.stations.length)];
      if (st) {
        tx = Math.cos(st.angle) * st.orbit; ty = Math.sin(st.angle) * st.orbit;
        if (dist(n.x, n.y, tx, ty) < 60) {
          // deliver: stock the station, pick up its exports, move on
          if (n.cargo) { st.stock[n.cargo.id] = (st.stock[n.cargo.id] ?? 0) + n.cargo.qty; }
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

    const maxs = n.kind === "pirate" ? 160 : 130;
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

    if (wantFire && n.fireCd <= 0) {
      n.fireCd = n.kind === "patrol" || n.kind === "fighter" ? 0.5 : 0.7;
      const tvx = targetingPlayer ? p.vx : 0;
      const tvy = targetingPlayer ? p.vy : 0;
      const tof = Math.hypot(tx - n.x, ty - n.y) / 300;
      const aim = Math.atan2(ty + (tvy - n.vy) * tof - n.y, tx + (tvx - n.vx) * tof - n.x);
      if (dist(n.x, n.y, p.x, p.y) < 450) sfx.enemyLaser();
      fs.bullets.push({
        x: n.x + Math.cos(aim) * 10, y: n.y + Math.sin(aim) * 10,
        vx: n.vx + Math.cos(aim) * 300, vy: n.vy + Math.sin(aim) * 300,
        life: 1.8, hostile: fireHostile, dmg: n.kind === "patrol" || n.kind === "fighter" ? 8 : 6,
      });
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
    } else if (piratesAlive.length === 0) {
      p.credits += s.reward;
      adjustRep(g.world, sys.factionId, 4);
      g.toast(`TRADER SAVED +${s.reward}CR`);
      sfx.pickup();
      g.world.events.push({ t: g.world.time, kind: "rescue", systemId: p.systemId, text: "A freighter was rescued from corsairs by an independent pilot" });
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
  const pirates: Npc[] = [];
  for (let i = 0; i < 2; i++) {
    pirates.push({ kind: "pirate", x: tx + 120 * Math.cos(i * 3), y: ty + 120 * Math.sin(i * 3), vx: 0, vy: 0, angle: 0, hull: 40, hullMax: 40, fireCd: 1, targetIdx: 0 });
  }
  fs.npcs.push(trader, ...pirates);
  fs.sos = { trader, pirates, reward: 150 + Math.floor(Math.random() * 200), ttl: 90 };
  g.toast("DISTRESS CALL - TRADER UNDER ATTACK");
  sfx.alarm();
}
