// Flight scene: player controls, interactions (dock/jump/orbit/board), law.
// Simulation lives in ./ai, rendering in ./render.

import { Game, Scene } from "../../game";
import { PAL } from "../../gfx/palette";
import { clamp, angDiff, dist } from "../../core/mathx";
import { hasIllegalCargo, adjustRep, lawLevelFor, jumpFuelCost, crewBonus, tickWorld } from "../../world";
import { faction } from "../../data/data";
import { hull } from "../../data/hulls";
import { sfx } from "../../core/sfx";
import { music } from "../../core/music";
import * as wire from "../../core/wire";
import type { Bullet, Npc, Particle, Platform, Loot, Sos } from "./types";
import { BULLET_SPEED } from "./types";
import {
  populate, spawnPirateNearBelt, spawnDrones, exhaust, mine, updateBullets, updateNpcs,
  updatePlatforms, updateParticles, updateLoot, updateSos, boom,
} from "./ai";
import { drawFlight } from "./render";

export class FlightScene implements Scene {
  touchMode = "flight" as const;
  bullets: Bullet[] = [];
  npcs: Npc[] = [];
  particles: Particle[] = [];
  loot: Loot[] = [];
  platforms: Platform[] = [];
  fireCd = 0;
  mapOpen = false;
  zoom = 1;
  scanTimer = 0;
  scanMsg = "";
  spawnTimer = 4;
  camShake = 0;
  sosTimer = 45;
  sos: Sos | null = null;
  escort: { trader: Npc; missionId: string } | null = null;
  scanCharge = 0;      // deep-scan charge 0..1 (hold V)
  pursuitTimer = 0;    // time the law has been chasing us this system

  enter(g: Game): void {
    this.bullets = [];
    this.npcs = [];
    this.particles = [];
    this.loot = [];
    this.mapOpen = false;
    this.escort = null;
    this.scanCharge = 0;
    populate(this, g);
    this.launchDrones(g);
    this.startEscortIfNeeded(g);
  }

  launchDrones(g: Game): void {
    const n = hull(g.world.player.hullId).drones ?? 0;
    if (n > 0) spawnDrones(this, g, n);
  }

  // 0 = clear, 1 = wanted (patrols pursue), 2 = shoot on sight (platforms too)
  lawLevel(g: Game): number {
    return lawLevelFor(g.world, g.world.player.systemId);
  }

  // In corsair space with good Veil rep, pirates leave you alone
  piratesFriendly(g: Game): boolean {
    return (g.world.player.rep?.["vex"] ?? 0) >= 40;
  }

  jumpCost(g: Game, targetId: string): number {
    return jumpFuelCost(g.world, g.world.player.systemId, targetId);
  }

  // ---------- Update ----------

  update(g: Game, dt: number): void {
    const w = g.world;
    const p = w.player;
    const sys = w.systems[p.systemId];
    w.time += dt;
    tickWorld(w, dt);

    if (g.input.wasPressed("Tab")) this.mapOpen = !this.mapOpen;
    if (g.input.wasPressed("g")) { g.setScene("galaxy"); return; }
    if (g.input.wasPressed("i")) { g.setScene("interior"); return; }
    if (g.input.wasPressed("F5")) g.save();
    if (g.input.wasPressed("F9")) g.load();
    this.zoom = clamp(this.zoom * (1 - g.input.wheel * 0.15), 0.25, 2);
    if (this.mapOpen) return;

    for (const pl of sys.planets) pl.angle += pl.speed * dt;
    for (const st of sys.stations) st.angle += st.speed * dt;

    const h = hull(p.hullId);
    const engineSys = p.systems.find((s) => s.id === "engines")!;
    const lifeSys = p.systems.find((s) => s.id === "life")!;
    const weaponsSys = p.systems.find((s) => s.id === "weapons")!;
    const engineFactor = 0.3 + 0.7 * (engineSys.health / 100);
    const pilot = 1 + crewBonus(p, "pilot") * 0.15 + (p.skills?.piloting ?? 0) * 0.02;
    const ACCEL = h.accel * pilot;
    const ROT = h.rotSpeed * pilot;
    const MAXS = h.maxSpeed;

    if (lifeSys.health < 50) {
      p.oxygen = Math.max(0, p.oxygen - dt * (50 - lifeSys.health) * 0.02);
      if (p.oxygen <= 0) p.hull = Math.max(1, p.hull - dt * 2);
    } else {
      p.oxygen = Math.min(p.oxygenMax, p.oxygen + dt * 0.5);
    }

    if (g.input.isDown("a")) p.angle -= ROT * dt;
    if (g.input.isDown("d")) p.angle += ROT * dt;

    const thrusting = g.input.isDown("w") && p.fuel > 0;
    const retro = g.input.isDown("s") && p.fuel > 0;
    if (thrusting) {
      p.vx += Math.cos(p.angle) * ACCEL * engineFactor * dt;
      p.vy += Math.sin(p.angle) * ACCEL * engineFactor * dt;
      p.fuel = Math.max(0, p.fuel - dt * 0.55);
      exhaust(this, p.x, p.y, p.angle + Math.PI, PAL.thrust);
    }
    if (retro) {
      p.vx -= Math.cos(p.angle) * ACCEL * 0.5 * engineFactor * dt;
      p.vy -= Math.sin(p.angle) * ACCEL * 0.5 * engineFactor * dt;
      p.fuel = Math.max(0, p.fuel - dt * 0.3);
    }
    if (g.input.isDown("x") && p.fuel > 0) {
      const spd = Math.hypot(p.vx, p.vy);
      if (spd > 4) {
        const retroAngle = Math.atan2(-p.vy, -p.vx);
        const d = angDiff(p.angle, retroAngle);
        p.angle += clamp(d, -ROT * dt, ROT * dt);
        if (Math.abs(d) < 0.4) {
          p.vx += Math.cos(p.angle) * ACCEL * engineFactor * dt;
          p.vy += Math.sin(p.angle) * ACCEL * engineFactor * dt;
          p.fuel = Math.max(0, p.fuel - dt * 0.55);
          exhaust(this, p.x, p.y, p.angle + Math.PI, PAL.thrust);
        }
      } else { p.vx = 0; p.vy = 0; }
    }
    const spd = Math.hypot(p.vx, p.vy);
    if (spd > MAXS) { p.vx = (p.vx / spd) * MAXS; p.vy = (p.vy / spd) * MAXS; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    p.shield = Math.min(p.shieldMax, p.shield + dt * 2);
    if (p.fuel < 20) p.fuel = Math.min(20, p.fuel + dt * 0.4);
    // medic slowly patches the hull between fights
    if (crewBonus(p, "medic") > 0 && p.hull < p.hullMax) p.hull = Math.min(p.hullMax, p.hull + dt * 0.5);

    // firing
    this.fireCd -= dt;
    if (g.input.isDown(" ") && this.fireCd <= 0 && weaponsSys.health > 5) {
      this.fireCd = h.fireRate;
      sfx.laser();
      const dmg = h.weaponDmg * (0.4 + 0.6 * weaponsSys.health / 100) * (1 + crewBonus(p, "gunner") * 0.2);
      this.bullets.push({
        x: p.x + Math.cos(p.angle) * 12, y: p.y + Math.sin(p.angle) * 12,
        vx: p.vx + Math.cos(p.angle) * BULLET_SPEED, vy: p.vy + Math.sin(p.angle) * BULLET_SPEED,
        life: 1.4, hostile: false, dmg, fromPlayer: true,
      });
    }
    // gunner crew: auto-turret at nearest pirate
    if (crewBonus(p, "gunner") > 0 && weaponsSys.health > 5) {
      this.turretCd = (this.turretCd ?? 0) - dt;
      if (this.turretCd <= 0) {
        const t = this.npcs.find((n) => n.kind === "pirate" && dist(n.x, n.y, p.x, p.y) < 300);
        if (t) {
          this.turretCd = 0.9;
          const aim = Math.atan2(t.y - p.y, t.x - p.x);
          this.bullets.push({
            x: p.x + Math.cos(aim) * 12, y: p.y + Math.sin(aim) * 12,
            vx: p.vx + Math.cos(aim) * BULLET_SPEED, vy: p.vy + Math.sin(aim) * BULLET_SPEED,
            life: 1.2, hostile: false, dmg: h.weaponDmg * 0.6, fromPlayer: true,
          });
        }
      }
    }

    if (g.input.isDown("m")) mine(this, g, dt, h.miningRate);

    // deep scan: hold V to charge; reveals anomalies within 900
    if (g.input.isDown("v")) {
      this.scanCharge = Math.min(1, this.scanCharge + dt * 0.5);
      if (this.scanCharge >= 1) {
        this.scanCharge = 0;
        let found = 0;
        for (const an of sys.anomalies) {
          if (!an.discovered && dist(an.x, an.y, p.x, p.y) < 900) { an.discovered = true; found++; }
        }
        g.toast(found ? `SCAN: ${found} ANOMALY SIGNAL${found > 1 ? "S" : ""} LOCATED` : "SCAN: NOTHING WITHIN RANGE");
        sfx.select();
        if (found) g.showHint("anomaly", "ANOMALY FOUND - FLY TO THE MARKER AND PRESS E");
      }
    } else {
      this.scanCharge = 0;
    }

    // soundtrack: faction pad, pulse rising with hostiles in weapons range
    {
      let threat = 0;
      for (const n of this.npcs) if (n.kind === "pirate") { const d = dist(n.x, n.y, p.x, p.y); if (d < 600) threat = Math.max(threat, 1 - d / 600); }
      if (this.lawLevel(g) >= 1) threat = Math.max(threat, 0.6);
      music.setMood(sys.factionId, threat);
    }

    updateBullets(this, g, dt);
    updateNpcs(this, g, dt);
    updatePlatforms(this, g, dt);
    updateParticles(this, dt);
    updateLoot(this, g, dt);
    updateSos(this, g, dt);
    this.updateEscort(g, dt);
    this.updateLaw(g, dt);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 20 + Math.random() * 25;
      const alive = this.npcs.filter((n) => n.kind === "pirate").length;
      if (alive < sys.pirateActivity * 6) spawnPirateNearBelt(this, g);
    }

    if (this.scanTimer > 0) {
      this.scanTimer -= dt;
      if (this.scanTimer <= 0) this.scanMsg = "";
    }
    if (g.input.wasPressed("e")) this.tryInteract(g);

    this.camShake = Math.max(0, this.camShake - dt * 30);
    if (p.hull <= 0) this.destroyed(g);

    // contextual hints
    if (!p.hints?.dock) {
      for (const st of sys.stations) {
        if (dist(p.x, p.y, Math.cos(st.angle) * st.orbit, Math.sin(st.angle) * st.orbit) < 200) {
          g.showHint("dock", "FLY CLOSE TO THE STATION AND PRESS E TO DOCK");
        }
      }
    }
    if (!p.hints?.fly && w.time > 3) g.showHint("fly", "W THRUST - A/D TURN - X BRAKE - YOU DRIFT: MOMENTUM IS REAL");
  }
  turretCd?: number;

  // Law escalation: 1 = wanted, patrols hunt; 2 = shoot on sight after prolonged pursuit / very low rep
  updateLaw(g: Game, dt: number): void {
    const p = g.world.player;
    const level = this.lawLevel(g);
    if (level >= 1) {
      this.pursuitTimer += dt;
      if (this.pursuitTimer > 60 && level === 1 && !this.scanMsg) {
        const facId = g.world.systems[p.systemId].factionId;
        adjustRep(g.world, facId, -5);
        this.scanMsg = "PURSUIT ESCALATED - LETHAL FORCE AUTHORIZED";
        this.scanTimer = 4;
        this.pursuitTimer = 0;
      }
    } else {
      this.pursuitTimer = 0;
      // heat cools slowly while you behave
      p.wanted = Math.max(0, p.wanted - dt * 0.004);
    }
  }

  // ---------- Escort missions ----------

  startEscortIfNeeded(g: Game): void {
    const p = g.world.player;
    const m = p.missions.find((x) => x.kind === "escort" && x.accepted && !x.done && x.targetSystemId === p.systemId && !x.escortDone);
    if (!m) return;
    const sys = g.world.systems[p.systemId];
    const dest = sys.stations.find((s) => s.id === m.targetStationId);
    if (!dest) return;
    const trader: Npc = {
      kind: "trader", x: p.x + 80, y: p.y + 40, vx: 0, vy: 0, angle: 0,
      hull: 50, hullMax: 50, fireCd: 0, targetIdx: sys.stations.indexOf(dest),
      cargo: { id: "lux", qty: 4 },
    };
    this.npcs.push(trader);
    this.escort = { trader, missionId: m.id };
    g.toast("ESCORT: KEEP THE FREIGHTER ALIVE UNTIL IT DOCKS");
  }

  updateEscort(g: Game, dt: number): void {
    if (!this.escort) return;
    const p = g.world.player;
    const m = p.missions.find((x) => x.id === this.escort!.missionId);
    const t = this.escort.trader;
    if (!m) { this.escort = null; return; }
    if (t.hull <= 0 || !this.npcs.includes(t)) {
      g.toast("ESCORT FAILED - FREIGHTER LOST");
      m.done = true;
      p.missions = p.missions.filter((x) => x !== m);
      adjustRep(g.world, g.world.systems[p.systemId].factionId, -5);
      this.escort = null;
      return;
    }
    const sys = g.world.systems[p.systemId];
    const dest = sys.stations.find((s) => s.id === m.targetStationId);
    if (dest && dist(t.x, t.y, Math.cos(dest.angle) * dest.orbit, Math.sin(dest.angle) * dest.orbit) < 80) {
      m.escortDone = true;
      g.toast("FREIGHTER DOCKED - COLLECT PAYMENT AT THE STATION");
      this.npcs = this.npcs.filter((n) => n !== t);
      this.escort = null;
    }
    // pirates are drawn to the escort
    if (Math.random() < dt * 0.05) {
      const pir: Npc = { kind: "pirate", x: t.x + 500, y: t.y - 300, vx: 0, vy: 0, angle: 0, hull: 40, hullMax: 40, fireCd: 1, targetIdx: 0 };
      this.npcs.push(pir);
    }
  }

  // ---------- Interactions ----------

  tryInteract(g: Game): void {
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    for (const st of sys.stations) {
      const sx = Math.cos(st.angle) * st.orbit;
      const sy = Math.sin(st.angle) * st.orbit;
      if (dist(p.x, p.y, sx, sy) < 60) {
        const rep = p.rep?.[st.factionId] ?? 0;
        if (st.military && rep < -20) { g.toast("DOCKING DENIED - YOUR RECORD PRECEDES YOU"); return; }
        if (rep < -60) { g.toast("DOCKING DENIED - PERSONA NON GRATA"); return; }
        p.dockedAt = st.id;
        p.vx = 0; p.vy = 0;
        sfx.dock();
        g.setScene("station");
        return;
      }
    }
    for (const jp of sys.jumpPoints) {
      if (dist(p.x, p.y, jp.x, jp.y) < 70) { this.doJump(g, jp.targetSystemId, jp.guarded); return; }
    }
    for (const w of sys.wrecks) {
      if (!w.looted && dist(p.x, p.y, w.x, w.y) < 60) {
        p.vx = 0; p.vy = 0;
        g.wreckTarget = w;
        g.setScene("wreck");
        return;
      }
    }
    for (const an of sys.anomalies) {
      if (an.discovered && !an.claimed && dist(p.x, p.y, an.x, an.y) < 60) {
        an.claimed = true;
        const reward = an.reward;
        if (an.kind === "data") {
          g.toast(`${an.name}: DATA CORE RECOVERED`);
          this.loot.push({ x: an.x, y: an.y, commodityId: "data", qty: 2, life: 60 });
        } else if (an.kind === "derelict") {
          g.toast(`${an.name}: SALVAGE CACHE`);
          this.loot.push({ x: an.x, y: an.y, commodityId: "parts", qty: 3, life: 60 });
          this.loot.push({ x: an.x + 10, y: an.y, commodityId: "metals", qty: 3, life: 60 });
        } else {
          p.credits += reward;
          g.toast(`${an.name}: SURVEY BOUNTY +${reward}CR`);
        }
        adjustRep(g.world, sys.factionId, 2);
        g.world.events.push({ t: g.world.time, kind: "discovery", systemId: p.systemId, text: `An anomaly (${an.name}) was surveyed by an independent pilot` });
        g.world.player.discoveries = (g.world.player.discoveries ?? 0) + 1;
        sfx.pickup();
        void wire.post("discovery", `surveyed anomaly ${an.name}`, sys.name);
        return;
      }
    }
    for (const pl of sys.planets) {
      const px = Math.cos(pl.angle) * pl.orbit, py = Math.sin(pl.angle) * pl.orbit;
      if (dist(p.x, p.y, px, py) < pl.radius + 90) {
        p.vx = 0; p.vy = 0;
        g.orbitPlanetIdx = sys.planets.indexOf(pl);
        g.setScene("orbit");
        return;
      }
    }
    g.toast("NOTHING IN RANGE");
  }

  doJump(g: Game, targetId: string, guarded: boolean): void {
    const p = g.world.player;
    const cost = this.jumpCost(g, targetId);
    if (p.fuel < cost) { g.toast(`NEED ${cost} FUEL TO JUMP`); return; }
    const facId = g.world.systems[p.systemId].factionId;
    if (guarded) {
      const fac = faction(facId);
      const rep = p.rep?.[facId] ?? 0;
      if (hasIllegalCargo(p)) {
        // good standing means a lazier scan
        const catchChance = rep > 40 ? 0.3 : rep < -20 ? 0.85 : 0.6;
        if (Math.random() < catchChance) {
          let seized = 0;
          for (const id of ["contra", "bio"]) { seized += p.cargo[id] ?? 0; delete p.cargo[id]; }
          const fine = 100 + seized * 60;
          p.credits = Math.max(0, p.credits - fine);
          p.wanted = Math.min(1, p.wanted + 0.2);
          adjustRep(g.world, facId, -10);
          this.scanMsg = `${fac.name.toUpperCase()} SCAN: CONTRABAND SEIZED, ${fine}CR FINE`;
          this.scanTimer = 4;
          g.world.events.push({ t: g.world.time, kind: "seizure", systemId: p.systemId, text: `Customs at the ${g.world.systems[p.systemId].name} gate seized ${seized} units of contraband` });
        } else {
          this.scanMsg = "GATE SCAN PASSED... BARELY";
          this.scanTimer = 3;
        }
      } else if (this.lawLevel(g) >= 1) {
        this.scanMsg = `${fac.name.toUpperCase()}: WARRANT FLAGGED - PATROLS NOTIFIED`;
        this.scanTimer = 4;
      } else {
        this.scanMsg = "ROUTINE SCAN CLEAR - SAFE TRANSIT";
        this.scanTimer = 2.5;
      }
    }
    p.fuel -= cost;
    sfx.jump();
    const fromId = p.systemId;
    p.systemId = targetId;
    const tsys = g.world.systems[targetId];
    const use = tsys.jumpPoints.find((j) => j.targetSystemId === fromId) ?? tsys.jumpPoints[0];
    if (use) { p.x = use.x + 60; p.y = use.y + 60; } else { p.x = 0; p.y = -800; }
    p.vx = 0; p.vy = 0;
    this.bullets = [];
    this.npcs = [];
    this.loot = [];
    this.escort = null;
    this.pursuitTimer = 0;
    populate(this, g);
    this.launchDrones(g);
    this.startEscortIfNeeded(g);
    g.autosave();
    g.toast(`JUMPED TO ${tsys.name.toUpperCase()}`);
    g.showHint("jump", "PRESS G FOR THE GALAXY MAP - CLICK A SYSTEM TWICE TO PLOT A COURSE");
  }

  destroyed(g: Game): void {
    const p = g.world.player;
    g.toast("SHIP DESTROYED - EMERGENCY BEACON RECOVERED YOU");
    boom(this, p.x, p.y, 30, PAL.thrust);
    p.hull = Math.round(p.hullMax * 0.5);
    p.shield = 0;
    p.fuel = Math.max(20, p.fuel * 0.5);
    p.credits = Math.round(p.credits * 0.85);
    p.cargo = {};
    for (const s of p.systems) s.health = Math.max(30, s.health);
    if (p.crew && p.crew.length && Math.random() < 0.5) {
      const lost = p.crew.splice(Math.floor(Math.random() * p.crew.length), 1)[0];
      g.toast(`${lost.name.toUpperCase()} DIDN'T MAKE IT TO THE POD`);
    }
    const sys = g.world.systems[p.systemId];
    const st = sys.stations[0];
    if (st) { p.dockedAt = st.id; g.setScene("station"); }
    else { p.x = 0; p.y = -600; p.vx = 0; p.vy = 0; }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    drawFlight(this, g, ctx);
  }
}
