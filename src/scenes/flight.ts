// Flight scene: top-down Newtonian flight inside a star system.
// Also hosts the Tab system-map overlay and jump/dock interactions.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { RNG } from "../core/rng";
import { clamp, TAU, angDiff, dist } from "../core/mathx";
import { SYSTEM_SIZE, hasIllegalCargo, addCargo, findStation } from "../world";
import { faction, commodity } from "../data/data";

interface Bullet {
  x: number; y: number; vx: number; vy: number;
  life: number; hostile: boolean; dmg: number;
}

interface Npc {
  kind: "pirate" | "trader" | "patrol";
  x: number; y: number; vx: number; vy: number; angle: number;
  hull: number; hullMax: number;
  fireCd: number;
  targetIdx: number; // for traders: which station they head to
}

interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; color: string;
}

interface Loot {
  x: number; y: number; commodityId: string; qty: number; life: number;
}

const ACCEL = 90;
const ROT_SPEED = 3.4;
const MAX_SPEED = 260;
const BULLET_SPEED = 340;

export class FlightScene implements Scene {
  bullets: Bullet[] = [];
  npcs: Npc[] = [];
  particles: Particle[] = [];
  loot: Loot[] = [];
  fireCd = 0;
  mapOpen = false;
  zoom = 1;
  scanTimer = 0;
  scanMsg = "";
  spawnTimer = 4;
  camShake = 0;

  enter(g: Game): void {
    this.bullets = [];
    this.npcs = [];
    this.particles = [];
    this.loot = [];
    this.mapOpen = false;
    this.populate(g);
  }

  populate(g: Game): void {
    const sys = g.world.systems[g.world.player.systemId];
    const rng = new RNG((g.world.seed ^ g.world.time * 1000) >>> 0 || 1);
    const nPirates = Math.round(sys.pirateActivity * 5);
    for (let i = 0; i < nPirates; i++) this.spawnNpc(g, "pirate", rng);
    for (let i = 0; i < sys.stations.length; i++) this.spawnNpc(g, "trader", rng);
    if (sys.factionId !== "vex") this.spawnNpc(g, "patrol", rng);
  }

  spawnNpc(g: Game, kind: Npc["kind"], rng: RNG): void {
    const p = g.world.player;
    const a = rng.range(0, TAU);
    const r = rng.range(500, 1500);
    this.npcs.push({
      kind,
      x: p.x + Math.cos(a) * r,
      y: p.y + Math.sin(a) * r,
      vx: 0, vy: 0, angle: rng.range(0, TAU),
      hull: kind === "pirate" ? 40 : kind === "patrol" ? 80 : 50,
      hullMax: kind === "pirate" ? 40 : kind === "patrol" ? 80 : 50,
      fireCd: 0,
      targetIdx: rng.int(0, 10),
    });
  }

  // ---------- Update ----------

  update(g: Game, dt: number): void {
    const w = g.world;
    const p = w.player;
    const sys = w.systems[p.systemId];
    w.time += dt;

    // global keys
    if (g.input.wasPressed("Tab")) this.mapOpen = !this.mapOpen;
    if (g.input.wasPressed("g")) { g.setScene("galaxy"); return; }
    if (g.input.wasPressed("i")) { g.setScene("interior"); return; }
    if (g.input.wasPressed("F5")) g.save();
    if (g.input.wasPressed("F9")) g.load();
    this.zoom = clamp(this.zoom * (1 - g.input.wheel * 0.15), 0.25, 2);

    if (this.mapOpen) return; // paused while map overlay is up

    // orbital motion
    for (const pl of sys.planets) pl.angle += pl.speed * dt;
    for (const st of sys.stations) st.angle += st.speed * dt;

    // engine effectiveness scales with engine system health
    const engineSys = p.systems.find((s) => s.id === "engines")!;
    const lifeSys = p.systems.find((s) => s.id === "life")!;
    const weaponsSys = p.systems.find((s) => s.id === "weapons")!;
    const engineFactor = 0.3 + 0.7 * (engineSys.health / 100);

    // oxygen drains if scrubbers are damaged
    if (lifeSys.health < 50) {
      p.oxygen = Math.max(0, p.oxygen - dt * (50 - lifeSys.health) * 0.02);
      if (p.oxygen <= 0) {
        p.hull = Math.max(1, p.hull - dt * 2); // slow suffocation damage, never quite kills
      }
    } else {
      p.oxygen = Math.min(p.oxygenMax, p.oxygen + dt * 0.5);
    }

    // rotation
    if (g.input.isDown("a")) p.angle -= ROT_SPEED * dt;
    if (g.input.isDown("d")) p.angle += ROT_SPEED * dt;

    // thrust (burns fuel)
    const thrusting = g.input.isDown("w") && p.fuel > 0;
    const retro = g.input.isDown("s") && p.fuel > 0;
    if (thrusting) {
      p.vx += Math.cos(p.angle) * ACCEL * engineFactor * dt;
      p.vy += Math.sin(p.angle) * ACCEL * engineFactor * dt;
      p.fuel = Math.max(0, p.fuel - dt * 0.55);
      this.exhaust(g, p.x, p.y, p.angle + Math.PI, PAL.thrust);
    }
    if (retro) {
      p.vx -= Math.cos(p.angle) * ACCEL * 0.5 * engineFactor * dt;
      p.vy -= Math.sin(p.angle) * ACCEL * 0.5 * engineFactor * dt;
      p.fuel = Math.max(0, p.fuel - dt * 0.3);
    }
    // brake assist: auto flip-and-burn
    if (g.input.isDown("x") && p.fuel > 0) {
      const spd = Math.hypot(p.vx, p.vy);
      if (spd > 4) {
        const retroAngle = Math.atan2(-p.vy, -p.vx);
        const d = angDiff(p.angle, retroAngle);
        p.angle += clamp(d, -ROT_SPEED * dt, ROT_SPEED * dt);
        if (Math.abs(d) < 0.4) {
          p.vx += Math.cos(p.angle) * ACCEL * engineFactor * dt;
          p.vy += Math.sin(p.angle) * ACCEL * engineFactor * dt;
          p.fuel = Math.max(0, p.fuel - dt * 0.55);
          this.exhaust(g, p.x, p.y, p.angle + Math.PI, PAL.thrust);
        }
      } else { p.vx = 0; p.vy = 0; }
    }
    // clamp speed
    const spd = Math.hypot(p.vx, p.vy);
    if (spd > MAX_SPEED) {
      p.vx = (p.vx / spd) * MAX_SPEED;
      p.vy = (p.vy / spd) * MAX_SPEED;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // shield regen
    p.shield = Math.min(p.shieldMax, p.shield + dt * 2);

    // firing
    this.fireCd -= dt;
    if (g.input.isDown(" ") && this.fireCd <= 0 && weaponsSys.health > 5) {
      this.fireCd = 0.22;
      this.bullets.push({
        x: p.x + Math.cos(p.angle) * 12,
        y: p.y + Math.sin(p.angle) * 12,
        vx: p.vx + Math.cos(p.angle) * BULLET_SPEED,
        vy: p.vy + Math.sin(p.angle) * BULLET_SPEED,
        life: 1.4, hostile: false, dmg: 10 * (0.4 + 0.6 * weaponsSys.health / 100),
      });
    }

    // mining laser
    if (g.input.isDown("m")) this.mine(g, dt);

    this.updateBullets(g, dt);
    this.updateNpcs(g, dt);
    this.updateParticles(dt);
    this.updateLoot(g, dt);

    // pirate respawn pressure
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 20 + Math.random() * 25;
      const alive = this.npcs.filter((n) => n.kind === "pirate").length;
      if (alive < sys.pirateActivity * 6) this.spawnNpc(g, "pirate", new RNG((Math.random() * 1e9) >>> 0));
    }

    // interactions: dock / jump
    if (this.scanTimer > 0) {
      this.scanTimer -= dt;
      if (this.scanTimer <= 0) this.scanMsg = "";
    }
    if (g.input.wasPressed("e")) this.tryInteract(g);

    this.camShake = Math.max(0, this.camShake - dt * 30);

    // death
    if (p.hull <= 0) this.destroyed(g);
  }

  exhaust(g: Game, x: number, y: number, ang: number, color: string): void {
    for (let i = 0; i < 2; i++) {
      const a = ang + (Math.random() - 0.5) * 0.5;
      const s = 40 + Math.random() * 50;
      this.particles.push({
        x: x + Math.cos(ang) * 10, y: y + Math.sin(ang) * 10,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.35 + Math.random() * 0.25, color,
      });
    }
  }

  boom(x: number, y: number, n: number, color: string): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = 20 + Math.random() * 90;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.6, color });
    }
  }

  mine(g: Game, dt: number): void {
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    for (const a of sys.asteroids) {
      if (a.ore <= 0) continue;
      const d = dist(p.x, p.y, a.x, a.y);
      if (d < 90) {
        // must roughly face it
        const ang = Math.atan2(a.y - p.y, a.x - p.x);
        if (Math.abs(angDiff(p.angle, ang)) < 0.5) {
          a.ore -= dt * 1.2;
          if (Math.random() < dt * 6) {
            this.particles.push({
              x: a.x + (Math.random() - 0.5) * a.radius, y: a.y + (Math.random() - 0.5) * a.radius,
              vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30,
              life: 0.5, color: PAL.mining,
            });
          }
          if (a.ore <= 0) {
            const qty = a.rich ? 3 : 1;
            this.loot.push({ x: a.x, y: a.y, commodityId: "ore", qty, life: 60 });
            if (a.rich && Math.random() < 0.25) {
              this.loot.push({ x: a.x + 8, y: a.y + 4, commodityId: "metals", qty: 1, life: 60 });
            }
            this.boom(a.x, a.y, 12, PAL.mining);
            g.toast("ASTEROID CRACKED");
          }
          return; // one beam target at a time
        }
      }
    }
  }

  updateBullets(g: Game, dt: number): void {
    const p = g.world.player;
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      if (b.hostile) {
        if (dist(b.x, b.y, p.x, p.y) < 10) {
          b.life = 0;
          this.damagePlayer(g, b.dmg);
        }
      } else {
        for (const n of this.npcs) {
          if (n.hull <= 0) continue;
          if (dist(b.x, b.y, n.x, n.y) < 10) {
            b.life = 0;
            n.hull -= b.dmg;
            this.boom(b.x, b.y, 3, PAL.danger);
            if (n.hull <= 0) this.npcKilled(g, n);
            // shooting non-pirates raises heat
            if (n.kind !== "pirate") g.world.player.wanted = Math.min(1, g.world.player.wanted + 0.15);
            break;
          }
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  damagePlayer(g: Game, dmg: number): void {
    const p = g.world.player;
    this.camShake = 4;
    if (p.shield > 0) {
      const absorbed = Math.min(p.shield, dmg);
      p.shield -= absorbed;
      dmg -= absorbed;
    }
    if (dmg > 0) {
      p.hull -= dmg;
      // chance of system damage — ships are places, damage is physical
      if (Math.random() < 0.4) {
        const sys = p.systems[Math.floor(Math.random() * p.systems.length)];
        sys.health = Math.max(0, sys.health - dmg * (1.5 + Math.random()));
        g.toast(`${sys.name.toUpperCase()} DAMAGED`);
      }
      this.boom(p.x, p.y, 5, PAL.danger);
    }
  }

  npcKilled(g: Game, n: Npc): void {
    this.boom(n.x, n.y, 20, PAL.thrust);
    if (n.kind === "pirate") {
      g.world.player.kills++;
      // progress bounty missions in this system
      for (const m of g.world.player.missions) {
        if (m.kind === "bounty" && m.accepted && !m.done && m.targetSystemId === g.world.player.systemId) {
          m.kills = (m.kills ?? 0) + 1;
          g.toast(`BOUNTY ${m.kills}/${m.killsNeeded}`);
        }
      }
      // pirates drop loot
      if (Math.random() < 0.7) {
        const pool = ["metals", "fuel", "parts", "contra", "lux"];
        const id = pool[Math.floor(Math.random() * pool.length)];
        this.loot.push({ x: n.x, y: n.y, commodityId: id, qty: 1 + Math.floor(Math.random() * 3), life: 60 });
      }
    } else {
      g.world.player.wanted = Math.min(1, g.world.player.wanted + 0.4);
      g.toast("WARRANT ISSUED - PATROLS ALERTED");
    }
  }

  updateNpcs(g: Game, dt: number): void {
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    for (const n of this.npcs) {
      if (n.hull <= 0) continue;
      n.fireCd -= dt;
      let tx = n.x, ty = n.y, wantFire = false, speed = 60;
      if (n.kind === "pirate") {
        const d = dist(n.x, n.y, p.x, p.y);
        if (d < 700) { tx = p.x; ty = p.y; wantFire = d < 260; speed = 95; }
        else { tx = n.x + Math.cos(n.angle) * 100; ty = n.y + Math.sin(n.angle) * 100; }
      } else if (n.kind === "trader") {
        const st = sys.stations[n.targetIdx % Math.max(1, sys.stations.length)];
        if (st) {
          tx = Math.cos(st.angle) * st.orbit; ty = Math.sin(st.angle) * st.orbit;
          if (dist(n.x, n.y, tx, ty) < 60) n.targetIdx++;
        }
        // flee pirates
        for (const o of this.npcs) {
          if (o.kind === "pirate" && o.hull > 0 && dist(n.x, n.y, o.x, o.y) < 200) {
            tx = n.x - (o.x - n.x); ty = n.y - (o.y - n.y); speed = 110;
          }
        }
      } else { // patrol
        speed = 100;
        let target: { x: number; y: number } | null = null;
        // hunt pirates, or the player if wanted
        if (p.wanted > 0.5) {
          const d = dist(n.x, n.y, p.x, p.y);
          if (d < 900) { target = p; wantFire = d < 260; }
        }
        if (!target) {
          for (const o of this.npcs) {
            if (o.kind === "pirate" && o.hull > 0 && dist(n.x, n.y, o.x, o.y) < 900) { target = o; break; }
          }
          if (target && dist(n.x, n.y, target.x, target.y) < 260) wantFire = true;
        }
        if (target) { tx = target.x; ty = target.y; }
        else { tx = n.x + Math.cos(n.angle) * 100; ty = n.y + Math.sin(n.angle) * 100; }
      }
      const want = Math.atan2(ty - n.y, tx - n.x);
      n.angle += clamp(angDiff(n.angle, want), -2.2 * dt, 2.2 * dt);
      n.vx += Math.cos(n.angle) * speed * dt;
      n.vy += Math.sin(n.angle) * speed * dt;
      const s = Math.hypot(n.vx, n.vy);
      const maxs = n.kind === "pirate" ? 160 : 130;
      if (s > maxs) { n.vx = (n.vx / s) * maxs; n.vy = (n.vy / s) * maxs; }
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      if (wantFire && n.fireCd <= 0) {
        n.fireCd = n.kind === "patrol" ? 0.5 : 0.7;
        const aim = Math.atan2((n.kind === "patrol" && p.wanted > 0.5 ? p.y : ty) - n.y, tx - n.x);
        this.bullets.push({
          x: n.x + Math.cos(aim) * 10, y: n.y + Math.sin(aim) * 10,
          vx: n.vx + Math.cos(aim) * 300, vy: n.vy + Math.sin(aim) * 300,
          life: 1.3, hostile: true, dmg: n.kind === "patrol" ? 8 : 6,
        });
      }
    }
    this.npcs = this.npcs.filter((n) => n.hull > 0);
  }

  updateParticles(dt: number): void {
    for (const pt of this.particles) {
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
  }

  updateLoot(g: Game, dt: number): void {
    const p = g.world.player;
    for (const l of this.loot) {
      l.life -= dt;
      if (dist(l.x, l.y, p.x, p.y) < 16) {
        if (addCargo(p, l.commodityId, l.qty)) {
          g.toast(`+${l.qty} ${commodity(l.commodityId).name.toUpperCase()}`);
          l.life = 0;
        }
      }
    }
    this.loot = this.loot.filter((l) => l.life > 0);
  }

  tryInteract(g: Game): void {
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    // dock?
    for (const st of sys.stations) {
      const sx = Math.cos(st.angle) * st.orbit;
      const sy = Math.sin(st.angle) * st.orbit;
      if (dist(p.x, p.y, sx, sy) < 60) {
        p.dockedAt = st.id;
        p.vx = 0; p.vy = 0;
        g.setScene("station");
        return;
      }
    }
    // jump?
    for (const jp of sys.jumpPoints) {
      if (dist(p.x, p.y, jp.x, jp.y) < 70) {
        this.doJump(g, jp.targetSystemId, jp.guarded);
        return;
      }
    }
    g.toast("NOTHING IN RANGE");
  }

  doJump(g: Game, targetId: string, guarded: boolean): void {
    const p = g.world.player;
    if (p.fuel < 10) { g.toast("NEED 10 FUEL TO JUMP"); return; }
    // gate security scan
    if (guarded) {
      const fac = faction(g.world.systems[p.systemId].factionId);
      if (hasIllegalCargo(p)) {
        if (Math.random() < 0.6) {
          // caught: confiscate + fine
          let seized = 0;
          for (const id of ["contra", "bio"]) {
            seized += p.cargo[id] ?? 0;
            delete p.cargo[id];
          }
          const fine = 100 + seized * 60;
          p.credits = Math.max(0, p.credits - fine);
          p.wanted = Math.min(1, p.wanted + 0.2);
          this.scanMsg = `${fac.name.toUpperCase()} SCAN: CONTRABAND SEIZED, ${fine}CR FINE`;
          this.scanTimer = 4;
        } else {
          this.scanMsg = "GATE SCAN PASSED... BARELY";
          this.scanTimer = 3;
        }
      } else if (p.wanted > 0.7) {
        this.scanMsg = `${fac.name.toUpperCase()}: WARRANT FLAGGED - PATROLS NOTIFIED`;
        this.scanTimer = 4;
      } else {
        this.scanMsg = "ROUTINE SCAN CLEAR - SAFE TRANSIT";
        this.scanTimer = 2.5;
      }
    }
    p.fuel -= 10;
    const fromId = p.systemId;
    p.systemId = targetId;
    // arrive at the gate on the far side that points back where we came from
    const tsys = g.world.systems[targetId];
    const use = tsys.jumpPoints.find((j) => j.targetSystemId === fromId) ?? tsys.jumpPoints[0];
    if (use) { p.x = use.x + 60; p.y = use.y + 60; }
    else { p.x = 0; p.y = -800; }
    p.vx = 0; p.vy = 0;
    this.bullets = [];
    this.npcs = [];
    this.loot = [];
    this.populate(g);
    g.toast(`JUMPED TO ${tsys.name.toUpperCase()}`);
  }

  destroyed(g: Game): void {
    const p = g.world.player;
    // respawn at nearest friendly station with penalties, keep the save honest
    g.toast("SHIP DESTROYED - EMERGENCY BEACON RECOVERED YOU");
    p.hull = Math.round(p.hullMax * 0.5);
    p.shield = 0;
    p.fuel = Math.max(20, p.fuel * 0.5);
    p.credits = Math.round(p.credits * 0.85);
    p.cargo = {};
    for (const s of p.systems) s.health = Math.max(30, s.health);
    // move to a station system
    const sys = g.world.systems[p.systemId];
    const st = sys.stations[0];
    if (st) {
      p.dockedAt = st.id;
      g.setScene("station");
    } else {
      p.x = 0; p.y = -600; p.vx = 0; p.vy = 0;
    }
  }

  // ---------- Draw ----------

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, VW, VH);

    const shx = this.camShake > 0 ? (Math.random() - 0.5) * this.camShake : 0;
    const shy = this.camShake > 0 ? (Math.random() - 0.5) * this.camShake : 0;
    const z = this.zoom;
    const camX = p.x - (VW / 2) / z + shx;
    const camY = p.y - (VH / 2) / z + shy;
    const toScreen = (wx: number, wy: number): [number, number] => [
      Math.round((wx - camX) * z),
      Math.round((wy - camY) * z),
    ];

    // parallax starfield (3 layers, deterministic hash)
    this.drawStars(ctx, camX, camY, z);

    // sun
    const sunSpr = g.sunSprite(sys.id, sys.sunRadius, sys.sunColor);
    {
      const [sx, sy] = toScreen(0, 0);
      const s = sunSpr.width * z;
      ctx.drawImage(sunSpr, sx - s / 2, sy - s / 2, s, s);
    }

    // orbit rings (faint)
    ctx.strokeStyle = "#141a2e";
    for (const pl of sys.planets) {
      ctx.beginPath();
      const [ox, oy] = toScreen(0, 0);
      ctx.arc(ox, oy, pl.orbit * z, 0, TAU);
      ctx.stroke();
    }

    // planets
    sys.planets.forEach((pl, i) => {
      const px = Math.cos(pl.angle) * pl.orbit;
      const py = Math.sin(pl.angle) * pl.orbit;
      const spr = g.planetSprite(sys.id, i, pl.radius, pl.palette);
      const [sx, sy] = toScreen(px, py);
      const s = spr.width * z;
      if (sx > -s && sx < VW + s && sy > -s && sy < VH + s) {
        ctx.drawImage(spr, sx - s / 2, sy - s / 2, s, s);
      }
    });

    // stations
    for (const st of sys.stations) {
      const sx0 = Math.cos(st.angle) * st.orbit;
      const sy0 = Math.sin(st.angle) * st.orbit;
      const spr = g.stationSprite(st.id, st.military);
      const [sx, sy] = toScreen(sx0, sy0);
      const s = spr.width * z;
      if (sx > -s && sx < VW + s && sy > -s && sy < VH + s) {
        ctx.drawImage(spr, sx - s / 2, sy - s / 2, s, s);
        if (dist(p.x, p.y, sx0, sy0) < 200) {
          drawText(ctx, st.name, sx - textWidth(st.name) / 2, sy - s / 2 - 8, PAL.ui);
          if (dist(p.x, p.y, sx0, sy0) < 60) {
            drawText(ctx, "[E] DOCK", sx - 16, sy + s / 2 + 3, PAL.gold);
          }
        }
      }
    }

    // jump points
    const gateSpr = g.gateSprite();
    for (const jp of sys.jumpPoints) {
      const [sx, sy] = toScreen(jp.x, jp.y);
      const s = gateSpr.width * z;
      if (sx > -s && sx < VW + s && sy > -s && sy < VH + s) {
        ctx.drawImage(gateSpr, sx - s / 2, sy - s / 2, s, s);
        const tname = g.world.systems[jp.targetSystemId].name;
        drawText(ctx, `GATE: ${tname}`, sx - textWidth(`GATE: ${tname}`) / 2, sy - s / 2 - 8, PAL.info);
        if (dist(p.x, p.y, jp.x, jp.y) < 70) {
          drawText(ctx, "[E] JUMP (10 FUEL)", sx - 36, sy + s / 2 + 3, PAL.gold);
        }
      }
    }

    // asteroids
    for (const a of sys.asteroids) {
      if (a.ore <= 0) continue;
      const [sx, sy] = toScreen(a.x, a.y);
      if (sx < -30 || sx > VW + 30 || sy < -30 || sy > VH + 30) continue;
      const spr = g.asteroidSprite(a.spriteSeed, a.radius, a.rich);
      const s = spr.width * z;
      ctx.drawImage(spr, sx - s / 2, sy - s / 2, s, s);
    }

    // mining beam
    if (g.input.isDown("m")) {
      for (const a of sys.asteroids) {
        if (a.ore <= 0) continue;
        if (dist(p.x, p.y, a.x, a.y) < 90 && Math.abs(angDiff(p.angle, Math.atan2(a.y - p.y, a.x - p.x))) < 0.5) {
          const [x1, y1] = toScreen(p.x, p.y);
          const [x2, y2] = toScreen(a.x, a.y);
          ctx.strokeStyle = PAL.mining;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          break;
        }
      }
    }

    // loot
    for (const l of this.loot) {
      const [sx, sy] = toScreen(l.x, l.y);
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
      ctx.fillStyle = PAL.white;
      ctx.fillRect(sx - 1, sy - 1, 2, 2);
    }

    // npcs
    for (const n of this.npcs) {
      const spr = n.kind === "pirate" ? g.pirateShip() : n.kind === "patrol" ? g.patrolShip() : g.traderShip();
      const [sx, sy] = toScreen(n.x, n.y);
      if (sx < -40 || sx > VW + 40 || sy < -40 || sy > VH + 40) continue;
      this.drawRotated(ctx, spr, sx, sy, n.angle, z);
      const col = n.kind === "pirate" ? PAL.danger : n.kind === "patrol" ? PAL.info : PAL.gold;
      ctx.fillStyle = col;
      ctx.fillRect(sx - 6, sy - 12, Math.round(12 * (n.hull / n.hullMax)), 1);
    }

    // bullets
    for (const b of this.bullets) {
      const [sx, sy] = toScreen(b.x, b.y);
      ctx.fillStyle = b.hostile ? PAL.danger : PAL.ui;
      ctx.fillRect(sx - 1, sy - 1, 2, 2);
    }

    // particles
    for (const pt of this.particles) {
      const [sx, sy] = toScreen(pt.x, pt.y);
      ctx.globalAlpha = Math.min(1, pt.life * 2);
      ctx.fillStyle = pt.color;
      ctx.fillRect(sx, sy, 1, 1);
      ctx.globalAlpha = 1;
    }

    // player ship
    {
      const [sx, sy] = toScreen(p.x, p.y);
      this.drawRotated(ctx, g.playerShip(), sx, sy, p.angle, z);
    }

    this.drawHud(g, ctx);
    if (this.mapOpen) this.drawSystemMap(g, ctx);
  }

  drawRotated(ctx: CanvasRenderingContext2D, spr: HTMLCanvasElement, x: number, y: number, ang: number, z: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.scale(z, z);
    ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
    ctx.restore();
  }

  drawStars(ctx: CanvasRenderingContext2D, camX: number, camY: number, z: number): void {
    const layers = [
      { p: 0.2, col: PAL.starDim, n: 40 },
      { p: 0.5, col: PAL.starMid, n: 30 },
      { p: 0.9, col: PAL.starBright, n: 14 },
    ];
    for (const layer of layers) {
      const ox = camX * layer.p * z;
      const oy = camY * layer.p * z;
      ctx.fillStyle = layer.col;
      for (let i = 0; i < layer.n; i++) {
        // deterministic pseudo-random star positions tiled over the viewport
        const hx = Math.imul(i + 1, 2654435761) >>> 0;
        const hy = Math.imul(i + 7, 1597334677) >>> 0;
        let x = ((hx % VW) - (ox % VW) + VW * 2) % VW;
        let y = ((hy % VH) - (oy % VH) + VH * 2) % VH;
        ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
      }
    }
  }

  drawHud(g: Game, ctx: CanvasRenderingContext2D): void {
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    // bottom bar
    ctx.fillStyle = "rgba(8,12,22,0.85)";
    ctx.fillRect(0, VH - 22, VW, 22);
    ctx.fillStyle = PAL.uiBorder;
    ctx.fillRect(0, VH - 23, VW, 1);

    const bar = (x: number, label: string, v: number, max: number, col: string) => {
      drawText(ctx, label, x, VH - 19, PAL.grey);
      ctx.fillStyle = PAL.greyDark;
      ctx.fillRect(x, VH - 11, 40, 4);
      ctx.fillStyle = col;
      ctx.fillRect(x, VH - 11, Math.round(40 * clamp(v / max, 0, 1)), 4);
    };
    bar(6, "HULL", p.hull, p.hullMax, p.hull < 30 ? PAL.danger : PAL.good);
    bar(56, "SHLD", p.shield, p.shieldMax, PAL.shield);
    bar(106, "FUEL", p.fuel, p.fuelMax, p.fuel < 15 ? PAL.danger : PAL.thrust);
    bar(156, "O2", p.oxygen, p.oxygenMax, p.oxygen < 40 ? PAL.danger : PAL.info);

    drawText(ctx, `${p.credits}CR`, 210, VH - 19, PAL.gold);
    const spd = Math.round(Math.hypot(p.vx, p.vy));
    drawText(ctx, `${spd} M/S`, 210, VH - 11, PAL.grey);

    const fac = faction(sys.factionId);
    drawText(ctx, sys.name, 270, VH - 19, fac.color);
    drawText(ctx, fac.name, 270, VH - 11, PAL.greyDark);
    if (p.wanted > 0.3) drawText(ctx, "WANTED", VW - 76, VH - 19, PAL.danger);
    drawText(ctx, "TAB MAP", VW - 36, VH - 19, PAL.greyDark);
    drawText(ctx, "I SHIP", VW - 36, VH - 11, PAL.greyDark);

    // damaged system warnings
    let wy = 4;
    for (const s of p.systems) {
      if (s.health < 50) {
        drawText(ctx, `! ${s.name.toUpperCase()} ${Math.round(s.health)}%`, 4, wy, s.health < 25 ? PAL.danger : PAL.warn);
        wy += 8;
      }
    }

    // scan / toast messages
    if (this.scanMsg) {
      drawText(ctx, this.scanMsg, VW / 2 - textWidth(this.scanMsg) / 2, 30, PAL.warn);
    }
    if (g.toastTimer > 0) {
      drawText(ctx, g.toastMsg, VW / 2 - textWidth(g.toastMsg) / 2, 40, PAL.ui);
    }

    // active mission tracker
    const active = p.missions.filter((m) => m.accepted && !m.done);
    let my = 4;
    for (const m of active.slice(0, 3)) {
      const prog = m.kind === "bounty" ? ` ${m.kills}/${m.killsNeeded}` : "";
      drawText(ctx, `> ${m.title}${prog}`, VW - textWidth(`> ${m.title}${prog}`) - 4, my, PAL.uiDim);
      my += 8;
    }
  }

  drawSystemMap(g: Game, ctx: CanvasRenderingContext2D): void {
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    ctx.fillStyle = "rgba(5,6,10,0.92)";
    ctx.fillRect(0, 0, VW, VH);
    const cx = VW / 2, cy = VH / 2;
    const sc = (VH / 2 - 20) / SYSTEM_SIZE;
    drawText(ctx, `SYSTEM MAP: ${sys.name.toUpperCase()}`, cx - textWidth(`SYSTEM MAP: ${sys.name.toUpperCase()}`) / 2, 6, PAL.ui);
    // sun
    ctx.fillStyle = sys.sunColor;
    ctx.fillRect(cx - 2, cy - 2, 4, 4);
    // orbits + planets
    ctx.strokeStyle = PAL.uiBorder;
    for (const pl of sys.planets) {
      ctx.beginPath();
      ctx.arc(cx, cy, pl.orbit * sc, 0, TAU);
      ctx.stroke();
      const px = cx + Math.cos(pl.angle) * pl.orbit * sc;
      const py = cy + Math.sin(pl.angle) * pl.orbit * sc;
      ctx.fillStyle = PAL.grey;
      ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 3, 3);
      drawText(ctx, pl.name, px + 4, py - 2, PAL.greyDark);
    }
    // stations
    for (const st of sys.stations) {
      const sx = cx + Math.cos(st.angle) * st.orbit * sc;
      const sy = cy + Math.sin(st.angle) * st.orbit * sc;
      ctx.fillStyle = st.military ? PAL.danger : PAL.ui;
      ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 3, 3);
      drawText(ctx, st.name, sx + 4, sy - 2, st.military ? PAL.danger : PAL.ui);
    }
    // gates
    for (const jp of sys.jumpPoints) {
      const gx = cx + jp.x * sc, gy = cy + jp.y * sc;
      ctx.fillStyle = PAL.info;
      ctx.fillRect(Math.round(gx) - 1, Math.round(gy) - 1, 3, 3);
      drawText(ctx, g.world.systems[jp.targetSystemId].name, gx + 4, gy - 2, PAL.info);
    }
    // player
    const px = cx + p.x * sc, py = cy + p.y * sc;
    ctx.fillStyle = PAL.white;
    ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 3, 3);
    drawText(ctx, "YOU", px + 4, py - 2, PAL.white);
    drawText(ctx, "TAB CLOSE - G GALAXY MAP", cx - textWidth("TAB CLOSE - G GALAXY MAP") / 2, VH - 10, PAL.greyDark);
  }
}
