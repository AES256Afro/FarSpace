import { breakPiratePassage } from "../../core/piracy";
import { recordOffence } from "../../core/law";
// Combat feel: pirate variants, homing torpedoes, hit feedback, damage smoke,
// and comms chatter. Called from the flight scene each frame.

import type { Game } from "../../game";
import type { FlightScene } from "./index";
import type { Npc, Torpedo } from "./types";
import { RNG } from "../../core/rng";
import { clamp, TAU, angDiff, dist } from "../../core/mathx";
import { PAL } from "../../gfx/palette";
import { sfx } from "../../core/sfx";
import { adjustRep, pushEvent } from "../../world";
import { boom, npcKilled } from "./ai";
import * as wire from "../../core/wire";
import { flag } from "../../core/achievements";

const CAPTAINS = ["Red Skua", "Vasquez the Hollow", "Ennis Grey", "Mother Cinder", "Tallow Marr", "The Quiet Knife", "Oskar Vane", "Sable Ruth"];
const RAIDER_LINES = ["Nice hull. Shame about the pilot.", "Cargo or hull, your call.", "Another one for the belt.", "You're a long way from the gate, friend."];
const CUTTER_LINES = ["Heavy guns, light patience.", "Heave to. Or don't. I get paid either way.", "Corsair cutter on your six. Say your prayers."];
const CAPTAIN_LINES = ["I've killed better ships than yours before breakfast.", "The Veil sends its regards.", "Run, and I'll let the belt have you. Fight, and I will."];
const FLEE_LINES = ["Breaking off! Breaking off!", "This isn't worth the hull.", "Next time, pilot."];
const PATROL_LINES = ["Patrol vessel. Routine scan, hold your vector.", "You're clear. Fly safe.", "Compact patrol. Nothing to see, move along."];
const ESCORT_LINES = ["Freighter to escort: we owe you a drink.", "Docked and breathing. Thank you, pilot."];

export function applyVariant(n: Npc, rng: RNG, sysPiracy: number): void {
  const roll = rng.next();
  if (roll < 0.05 * (0.5 + sysPiracy)) {
    n.variant = "captain"; n.hull = n.hullMax = 150; n.name = rng.pick(CAPTAINS);
  } else if (roll < 0.25) {
    n.variant = "cutter"; n.hull = n.hullMax = 80;
  } else if (roll < 0.7) {
    n.variant = "raider"; n.hull = n.hullMax = 28;
  }
}

export function variantStats(n: Npc): { speed: number; maxs: number; dmg: number; fireCd: number; bulletSpeed: number } {
  switch (n.variant) {
    case "raider": return { speed: 130, maxs: 210, dmg: 5, fireCd: 0.55, bulletSpeed: 320 };
    case "cutter": return { speed: 70, maxs: 120, dmg: 11, fireCd: 1.0, bulletSpeed: 260 };
    case "captain": return { speed: 100, maxs: 150, dmg: 9, fireCd: 0.6, bulletSpeed: 300 };
    default: return { speed: 95, maxs: 160, dmg: 6, fireCd: 0.7, bulletSpeed: 300 };
  }
}

export function hail(fs: FlightScene, from: string, text: string, color: string = PAL.grey): void {
  fs.comms.unshift({ from, text, life: 6, color });
  if (fs.comms.length > 3) fs.comms.length = 3;
}

// Chatter triggers: pirates taunt when they start a pursuit, patrols announce scans, fleeing ships bail
export function updateComms(fs: FlightScene, g: Game, dt: number): void {
  const p = g.world.player;
  for (const c of fs.comms) c.life -= dt;
  fs.comms = fs.comms.filter((c) => c.life > 0);
  for (const n of fs.npcs) {
    if (n.hailed || n.hull <= 0) continue;
    const d = dist(n.x, n.y, p.x, p.y);
    if (n.kind === "pirate" && d < 420 && !n.fleeing && !fs.piratesFriendly(g)) {
      n.hailed = true;
      const line = n.variant === "captain" ? CAPTAIN_LINES : n.variant === "cutter" ? CUTTER_LINES : RAIDER_LINES;
      hail(fs, n.name ?? (n.variant === "cutter" ? "CORSAIR CUTTER" : "CORSAIR"), line[Math.floor(Math.random() * line.length)], PAL.danger);
    } else if (n.kind === "patrol" && d < 300 && fs.lawLevel(g) === 0) {
      n.hailed = true;
      hail(fs, "PATROL", PATROL_LINES[Math.floor(Math.random() * PATROL_LINES.length)], PAL.info);
    }
  }
}

export function fleeLine(fs: FlightScene, n: Npc): void {
  hail(fs, n.name ?? "CORSAIR", FLEE_LINES[Math.floor(Math.random() * FLEE_LINES.length)], PAL.warn);
}

export function escortLine(fs: FlightScene): void {
  hail(fs, "FREIGHTER", ESCORT_LINES[Math.floor(Math.random() * ESCORT_LINES.length)], PAL.gold);
}

// ---------- Torpedoes ----------

export function fireTorpedo(fs: FlightScene, g: Game): void {
  const p = g.world.player;
  if ((p.torpedoes ?? 0) <= 0) { g.toast("NO TORPEDOES - BUY THEM AT A SHIPYARD"); return; }
  // prefer a pirate near the aim line, else the nearest pirate in range
  let target: Npc | null = null;
  let best = Infinity;
  for (const n of fs.npcs) {
    if (n.kind !== "pirate" || n.hull <= 0 || n.fleeing || fs.piratesFriendly(g)) continue;
    const d = dist(n.x, n.y, p.x, p.y);
    if (d > 900) continue;
    const off = Math.abs(angDiff(fs.aim, Math.atan2(n.y - p.y, n.x - p.x)));
    const score = d * (off < 0.6 ? 0.4 : 1);
    if (score < best) { best = score; target = n; }
  }
  p.torpedoes = (p.torpedoes ?? 0) - 1;
  fs.torps.push({
    x: p.x + Math.cos(fs.aim) * 14, y: p.y + Math.sin(fs.aim) * 14,
    vx: p.vx + Math.cos(fs.aim) * 140, vy: p.vy + Math.sin(fs.aim) * 140,
    life: 5, target,
  });
  sfx.torpedo();
  g.toast(target ? `TORPEDO AWAY - TRACKING ${target.name ? target.name.toUpperCase() : "CORSAIR"}` : "TORPEDO AWAY - NO LOCK");
}

export function updateTorpedoes(fs: FlightScene, g: Game, dt: number): void {
  for (const t of fs.torps) {
    t.life -= dt;
    if (t.target && (t.target.hull <= 0 || !fs.npcs.includes(t.target))) t.target = null;
    const spd = Math.hypot(t.vx, t.vy) || 1;
    let heading = Math.atan2(t.vy, t.vx);
    if (t.target) {
      const want = Math.atan2(t.target.y - t.y, t.target.x - t.x);
      heading += clamp(angDiff(heading, want), -3.2 * dt, 3.2 * dt);
    }
    const ns = Math.min(300, spd + 160 * dt);
    t.vx = Math.cos(heading) * ns; t.vy = Math.sin(heading) * ns;
    t.x += t.vx * dt; t.y += t.vy * dt;
    if (Math.random() < dt * 40) fs.particles.push({ x: t.x, y: t.y, vx: -t.vx * 0.1, vy: -t.vy * 0.1, life: 0.3, color: PAL.thrust });
    for (const n of fs.npcs) {
      if (n.hull <= 0 || n.kind === "drone") continue;
      if (dist(t.x, t.y, n.x, n.y) < 14) {
        t.life = 0;
        if (n.kind === "pirate" && breakPiratePassage(g.world)) g.toast("CORSAIR SAFE PASSAGE ENDED - OUR TORPEDO HIT THEM");
        n.hull -= 45;
        boom(fs, t.x, t.y, 18, PAL.thrust);
        fs.floaters.push({ x: n.x, y: n.y - 10, text: "45", life: 1, color: PAL.gold });
        fs.camShake = Math.max(fs.camShake, 3);
        if (n.hull <= 0) { flag(g, "torpedoKill"); npcKilled(fs, g, n, true); }
        else if (n.kind !== "pirate") { recordOffence(g.world, 0.2); }
        break;
      }
    }
  }
  fs.torps = fs.torps.filter((t) => t.life > 0);
}

// ---------- Feedback ----------

export function updateFloaters(fs: FlightScene, dt: number): void {
  for (const f of fs.floaters) { f.y -= 14 * dt; f.life -= dt; }
  fs.floaters = fs.floaters.filter((f) => f.life > 0);
  fs.hitFlash = Math.max(0, fs.hitFlash - dt * 2);
}

// Smoke from anything below 40% hull, including you
export function updateSmoke(fs: FlightScene, g: Game, dt: number): void {
  const p = g.world.player;
  const puff = (x: number, y: number, vx: number, vy: number) => {
    fs.particles.push({ x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6, vx: vx * 0.3 + (Math.random() - 0.5) * 12, vy: vy * 0.3 + (Math.random() - 0.5) * 12 - 6, life: 0.8 + Math.random() * 0.6, color: "#6b7590" });
  };
  if (p.hull < p.hullMax * 0.4 && Math.random() < dt * 12) puff(p.x, p.y, p.vx, p.vy);
  for (const n of fs.npcs) if (n.hull < n.hullMax * 0.4 && Math.random() < dt * 8) puff(n.x, n.y, n.vx, n.vy);
}

// Captains are worth bragging about
export function captainDown(fs: FlightScene, g: Game, n: Npc): void {
  const p = g.world.player;
  const sys = g.world.systems[p.systemId];
  p.credits += 400;
  flag(g, "captain");
  if (wire.mySquadronHasBase()) void wire.baseAction("kill", {}); // counts toward the weekly squadron bounty
  adjustRep(g.world, sys.factionId === "vex" ? "vex" : sys.factionId, sys.factionId === "vex" ? -10 : 8);
  fs.loot.push({ x: n.x, y: n.y, commodityId: "relics", qty: 1, life: 60 });
  fs.loot.push({ x: n.x + 10, y: n.y - 6, commodityId: "contra", qty: 2, life: 60 });
  g.toast(`CORSAIR CAPTAIN ${n.name?.toUpperCase()} DESTROYED +400CR`);
  hail(fs, "GALNET", `Corsair captain ${n.name} confirmed destroyed in ${sys.name}.`, PAL.info);
  pushEvent(g.world, { t: g.world.time, kind: "raid", systemId: p.systemId, text: `Corsair captain ${n.name} was destroyed by an independent pilot` });
  void wire.post("bounty", `destroyed corsair captain ${n.name}`, sys.name);
}

export { TAU };
