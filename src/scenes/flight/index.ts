// Flight scene: player controls, interactions (dock/jump/orbit/board), law.
// Simulation lives in ./ai, rendering in ./render.

import { ask, confirmBox } from "../../core/dialog";
import { Game, Scene } from "../../game";
import { PAL } from "../../gfx/palette";
import { clamp, angDiff, dist } from "../../core/mathx";
import { hasIllegalCargo, adjustRep, lawLevelFor, jumpFuelCost, crewBonus, tickWorld, logSystem, navRoute, permitDenied, addCargo, removeCargo, galaxyEventAt, logEntry, jumpWear, wearThrust, wearFault, logSight, passengersAboard, crewXp, stormBlind, ledger, systemLore, wondersIn, seeWonder, WONDER_RANGE, helpCaptain, captainByName, isFriend, isRival, rivalryLine, rivalBeatsYouTo, RIDE_ALONG_DOCKS, canUpgradeInfra, upgradeInfra, WAYSTATION_CREDITS, WAYSTATION_PARTS, infraAt, canBuildInfra, buildInfra, collectInfra, repairInfra, stockDepot, drawDepot, INFRA_KITS, DEPOT_CAP, Infra, raceCourse, racePar, racePrize, recordRace, beatHolder, captainNickname, leaveWreck, addWireWrecks, enterRegatta, regattaProgress, hasSpecialty, maydayAnswered, watchIndex, onWatch, raceHolder } from "../../world";
import { COMMODITIES, commodity } from "../../data/data";
import { faction as factionDef } from "../../data/data";
import { hasModule } from "../../data/modules";
import { genCrewCandidate } from "../../world";
import { engGrade } from "../../data/engineering";
import { gainMaterials } from "../../core/materials";
import { damagePlayer } from "./ai";
import { flag } from "../../core/achievements";
import { faction } from "../../data/data";
import { hull } from "../../data/hulls";
import { sfx } from "../../core/sfx";
import { settings, toggleFullscreen } from "../../core/settings";
import { touch } from "../../core/touch";
import { VW, VH } from "../../game";
import { music } from "../../core/music";
import * as wire from "../../core/wire";
import { presence } from "../../core/presence";
import { pickEncounter, ENCOUNTERS } from "../../data/encounters";
import { pickChatter } from "../../core/chatter";
import { spawnGhost, spawnMayday } from "./ai";
import { voteMods } from "../../data/votes";
import { passengerChatter } from "../../data/chatter";
import { pickShipLine } from "../../core/shipvoice";
import { keeperScan, KEEPER_OWNER } from "../../core/keeper";
import { isOccasion } from "../../data/occasions";
import type { EncounterScene } from "../encounter";
import { RNG } from "../../core/rng";
import type { Bullet, Npc, Particle, Platform, Loot, Sos, RepairJob } from "./types";
import type { Encounter } from "../../data/encounters";
import { addCargo as addCargoW } from "../../world";
import type { StationDef } from "../../world";
import { BULLET_SPEED } from "./types";
import {
  populate, spawnPirateNearBelt, spawnDrones, exhaust, mine, updateBullets, updateNpcs,
  updatePlatforms, updateParticles, updateLoot, updateSos, boom, spawnNpc, spawnTrader,
} from "./ai";
import { drawFlight } from "./render";
import type { Torpedo, Floater, Comms } from "./types";
import { fireTorpedo, updateTorpedoes, updateFloaters, updateSmoke, updateComms, escortLine } from "./combat";

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
  ghostsSeen = new Set<string>();
  camShake = 0;
  sosTimer = 45;
  sos: Sos | null = null;
  escort: { trader: Npc; missionId: string } | null = null;
  race: { gates: { x: number; y: number }[]; idx: number; t: number; stationId: string; started: boolean; idle: number; par: number; pacerT: number; pacerName: string } | null = null;
  convoy: { ships: Npc[]; reward: number; lost: number } | null = null;
  scanCharge = 0;      // deep-scan charge 0..1 (hold V)
  aim = 0;             // gun/laser direction; equals heading in keyboard mode
  mouseAim = false;
  torps: Torpedo[] = [];
  floaters: Floater[] = [];
  comms: Comms[] = [];
  hitFlash = 0;
  pursuitTimer = 0;    // time the law has been chasing us this system

  resumeNext = false; // set by overlays (encounter cards, repairs) so coming back doesn't repopulate the system
  enter(g: Game): void {
    if (this.resumeNext) { this.resumeNext = false; this.mapOpen = false; return; }
    this.bullets = [];
    this.npcs = [];
    this.particles = [];
    this.loot = [];
    this.mapOpen = false;
    this.cruise = false; this.autopilot = false;
    this.escort = null;
    this.race = null;
    this.convoy = null;
    this.scanCharge = 0;
    this.torps = [];
    this.floaters = [];
    this.comms = [];
    this.wonderSeen.clear();
    this.docking = null;
    if (g.world.realGalaxy) { void wire.fetchWire(); void wire.fetchLights().then(() => { if (g.sceneName === "flight") { const here = wire.lightsAt(g.world.systems[g.world.player.systemId].name); const n = addWireWrecks(g.world, here); if (n) this.comms.push({ from: "CHART", text: `${n} WRECK${n > 1 ? "S" : ""} ON THE CHART HERE THAT ANOTHER PILOT LEFT. SALVAGE RIGHTS ARE WHOEVER GETS THERE.`, life: 9, color: PAL.greyDark }); for (const l of here.filter((x) => x.kind === "mayday")) { if (!this.npcs.some((x) => x.mayday && x.name === l.callsign)) { spawnMayday(this, g, l.callsign); this.comms.push({ from: l.callsign, text: `MAYDAY, MAYDAY. THIS IS ${l.callsign}. TANKS ARE DRY. ANYONE WITH TEN UNITS TO SPARE, I'LL OWE YOU ONE.`, life: 12, color: PAL.danger }); } } } }); }
    { const sysNow = g.world.systems[g.world.player.systemId]; if (!this.loreSeen.has(sysNow.id)) { this.loreSeen.add(sysNow.id); this.comms.push({ from: "CHART", text: systemLore(g.world, sysNow).toUpperCase(), life: 9, color: PAL.greyDark }); } }
    if (g.justUndocked) {
      // launch sequence: out of the bay along your nose, control on the band
      g.justUndocked = false;
      const p = g.world.player;
      this.startRace(g);
      if (!p.racePending && !this.race && Math.random() < 0.12 && g.world.systems[p.systemId].jumpPoints.length) { const enc = ENCOUNTERS.find((e) => e.id === "walkus"); if (enc) setTimeout(() => { if (g.sceneName === "flight") (g.scenes["encounter"] as EncounterScene).open(g, enc, "flight", false); }, 2500); }
      const st = g.world.systems[p.systemId].stations.find((s) => dist(p.x, p.y, Math.cos(s.angle) * s.orbit, Math.sin(s.angle) * s.orbit) < 120);
      if (st) {
        const sx = Math.cos(st.angle) * st.orbit, sy = Math.sin(st.angle) * st.orbit;
        const a = Math.atan2(p.y - sy, p.x - sx) || p.angle;
        p.angle = a; p.vx = Math.cos(a) * 70; p.vy = Math.sin(a) * 70;
        this.launching = 1.2;
        this.comms.push({ from: `${st.name.toUpperCase()} CONTROL`, text: `BAY ${g.lastBay || 1} RELEASING. MIND THE TRAFFIC.`, life: 5, color: PAL.ui });
      }
    }
    populate(this, g);
    this.spawnDrifters(g);
    this.launchDrones(g);
    if (g.world.player.companion) {
      const p = g.world.player; const c = p.companion!;
      this.npcs.push({ kind: "drone", x: p.x - Math.cos(p.angle) * 50, y: p.y - Math.sin(p.angle) * 50, vx: p.vx, vy: p.vy, angle: p.angle, hull: 90, hullMax: 90, fireCd: 0, targetIdx: 1, name: c.name, companion: true });
      this.comms.push({ from: `${c.name.toUpperCase()}, ${c.ship.toUpperCase()}`, text: ["RIGHT BEHIND YOU.", "STILL HERE. PICK A HEADING.", "LAST STOP BEFORE I TURN FOR HOME. MAKE IT A GOOD ONE."][Math.max(0, RIDE_ALONG_DOCKS - c.docks)] ?? "RIGHT BEHIND YOU.", life: 6, color: PAL.gold });
    }
    this.startEscortIfNeeded(g);
    {
      const p = g.world.player;
      const ev = galaxyEventAt(g.world, p.systemId);
      if (ev?.kind === "storm") { this.scanMsg = stormBlind(g.world, p.systemId) ? "ION STORM - RADAR AND CHARTS BLIND. FLY BY EYE." : "ION STORM - THE BEACON HOLDS THE PICTURE"; this.scanTimer = 5; sfx.alarm(); }
      if (ev?.kind === "comet" && logSight(p, "comet", `the comet over ${g.world.systems[p.systemId].name}`, p.systemId)) g.toast("THE COMET FILLS THE VIEWPORT. YOUR PASSENGERS WON'T FORGET THIS ONE.");
    }
  }

  pauseOptions(g: Game): { label: string; act: () => void }[] {
    return [
      { label: "RESUME", act: () => { this.paused = false; } },
      { label: "SAVE (F5)", act: () => { g.save(); this.paused = false; } },
      { label: "SETTINGS", act: () => { this.paused = false; g.settingsReturn = "flight"; this.resumeNext = true; g.setScene("settings"); } },
      { label: "HANDBOOK", act: () => { this.paused = false; g.settingsReturn = "flight"; this.resumeNext = true; g.setScene("almanac"); } },
      { label: "THE CHRONICLE", act: () => { this.paused = false; g.settingsReturn = "flight"; this.resumeNext = true; g.setScene("chronicle"); } },
      { label: "THE ROSTER", act: () => { this.paused = false; g.settingsReturn = "flight"; this.resumeNext = true; g.setScene("roster"); } },
      ...(() => {
        const p = g.world.player; const sys = g.world.systems[p.systemId];
        const near = g.world.realGalaxy && wire.getCallsign() ? wondersIn(g.world, sys.id).find((wd) => dist(p.x, p.y, wd.x, wd.y) <= WONDER_RANGE) : undefined;
        return near ? [{ label: `LEAVE A NOTE AT ${near.name.toUpperCase()}`, act: () => { this.paused = false; const text = ask(`A line tied to ${near.name} for whoever comes next (72 characters, sixty days):`, ""); if (!text || text.trim().length < 3) return; void wire.postNote(sys.name, near.name, text.trim().slice(0, 72)).then((ok) => g.toast(ok ? `YOUR NOTE IS TIED TO ${near.name.toUpperCase()}. SIXTY DAYS, OR UNTIL YOU WRITE ANOTHER HERE.` : "THE WIRE DIDN'T TAKE IT. TRY AGAIN IN A MOMENT.")); if (text) { flag(g, "note"); logEntry(g.world, `Left a note at ${near.name}: "${text.trim().slice(0, 72)}"`); } } }] : [];
      })(),
      { label: "SAVE AND QUIT TO TITLE", act: () => { g.save(); this.paused = false; g.setScene("title"); } },
    ];
  }

  // Collect the till, patch the structure, stock or draw on a depot.
  tendInfra(g: Game, inf: Infra): void {
    const p = g.world.player;
    if (inf.owner === KEEPER_OWNER) {
      // not yours: patch it, nothing more; the campaign takes it from there
      if (inf.health < 100) { if (repairInfra(inf, p)) { g.toast(`THE KEEPER'S BEACON: PATCHED TO ${inf.health}%${inf.health >= 30 ? " - IT'S LIT" : " - STILL DARK, MORE PARTS"}`); sfx.repair(); } else g.toast(`THE KEEPER'S BEACON: ${inf.health}% - BRING SPARE PARTS`); }
      else g.toast("THE KEEPER'S BEACON BURNS STEADY. IT ISN'T YOURS TO EMPTY.");
      return;
    }
    if (inf.upgraded) { p.vx = 0; p.vy = 0; g.infraTarget = inf; g.setScene("waystation"); return; }
    if (!canUpgradeInfra(inf, p) && confirmBox(`Build a waystation here? ${WAYSTATION_CREDITS}cr and ${WAYSTATION_PARTS} spare parts: a deck, a bar, a bunk. Tolls rise, the bar earns, and the regulars stop by.`)) {
      if (upgradeInfra(inf, p)) { g.toast("THE WAYSTATION GOES UP OVER A LONG SHIFT. THERE'S A BAR. THERE'S A BUNK. IT'S YOURS."); logEntry(g.world, `Built a waystation in ${g.world.systems[p.systemId].name}`); flag(g, "waystation"); sfx.dock(); void wire.post("discover", `opened a waystation in ${g.world.systems[p.systemId].name}`, g.world.systems[p.systemId].name); if (g.world.realGalaxy) void wire.postLight(g.world.systems[p.systemId].name, inf.kind, true); return; }
    }
    const name = inf.kind.toUpperCase();
    const c = collectInfra(inf, p);
    const lines: string[] = [];
    if (c > 0) { lines.push(`TILL EMPTIED: +${c}CR`); sfx.pickup(); }
    if (inf.health < 100) { if (repairInfra(inf, p)) lines.push(`PATCHED WITH A SPARE PART: ${inf.health}%`); else lines.push(`${inf.health}% - BRING SPARE PARTS`); }
    if (inf.kind === "depot") {
      if (p.fuel < p.fuelMax * 0.5 && inf.stock > 0) { const n = drawDepot(inf, p); if (n) lines.push(`DREW ${n} FUEL FROM YOUR OWN DEPOT`); }
      else { const n = stockDepot(inf, p, 40); if (n) lines.push(`STOCKED ${n} FUEL CELLS (${inf.stock}/${DEPOT_CAP})`); else lines.push(`STOCK ${inf.stock}/${DEPOT_CAP} - FUEL CELLS IN THE HOLD RESTOCK IT`); }
    }
    g.toast(`${name}: ${lines.join(" - ")}`.slice(0, 110));
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

    if (this.updateDocking(g, dt)) { this.updateAmbient(g, dt); return; }
    if (this.launching > 0) {
      // the launch: the bay spits you out along your nose; controls come back in a second
      this.launching -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      this.updateAmbient(g, dt);
      if (this.launching <= 0) { this.comms.push({ from: "CONTROL", text: "YOU'RE CLEAR. SAFE FLYING.", life: 5, color: PAL.ui }); }
      return;
    }
    this.recordComms(w.time);
    // pause: the galaxy holds its breath; save, settings, the handbook, or home
    if (g.input.wasPressed("Escape") && !this.logOpen && !this.mapOpen && !this.docking) { this.paused = !this.paused; this.pauseCursor = 0; sfx.blip(); }
    if (this.paused) {
      w.time -= dt; // undo this frame's clock; nothing moves while paused
      const opts = this.pauseOptions(g);
      if (g.input.wasPressed("ArrowUp")) { this.pauseCursor = (this.pauseCursor + opts.length - 1) % opts.length; sfx.blip(); }
      if (g.input.wasPressed("ArrowDown")) { this.pauseCursor = (this.pauseCursor + 1) % opts.length; sfx.blip(); }
      for (let i = 0; i < opts.length; i++) { const y = 110 + i * 12; if (g.input.mouseY >= y - 3 && g.input.mouseY < y + 9 && g.input.mouseX > VW / 2 - 80 && g.input.mouseX < VW / 2 + 80) { this.pauseCursor = i; if (g.input.mousePressed) { sfx.select(); opts[i].act(); return; } } }
      if (g.input.wasPressed("Enter") || g.input.wasPressed(" ")) { sfx.select(); opts[this.pauseCursor].act(); }
      return;
    }
    if (g.input.wasPressed("l")) { this.logOpen = !this.logOpen; sfx.blip(); }
    if (this.logOpen) { if (g.input.wasPressed("Escape")) this.logOpen = false; this.updateAmbient(g, dt); return; }
    if (g.input.wasPressed("Tab")) this.mapOpen = !this.mapOpen;
    if (g.input.wasPressed("g")) { g.setScene("galaxy"); return; }
    if (g.input.wasPressed("i")) { g.setScene("interior"); return; }
    if (g.input.wasPressed("F5")) g.save();
    if (g.input.wasPressed("F9")) g.load();
    if (g.input.wasPressed("f")) toggleFullscreen(g.canvas);
    this.zoom = clamp(this.zoom * (1 - g.input.wheel * 0.15), 0.25, 2);
    if (this.mapOpen) return;

    for (const pl of sys.planets) pl.angle += pl.speed * dt;
    for (const st of sys.stations) st.angle += st.speed * dt;

    const h = hull(p.hullId);
    const engineSys = p.systems.find((s) => s.id === "engines")!;
    const lifeSys = p.systems.find((s) => s.id === "life")!;
    const weaponsSys = p.systems.find((s) => s.id === "weapons")!;
    const engineFactor = 0.3 + 0.7 * (engineSys.health / 100);
    const pilot = 1 + crewBonus(p, "pilot") * 0.15 + (p.skills?.piloting ?? 0) * 0.02 + (hasSpecialty(p, "helmsman") ? 0.1 : 0);
    const tuned = (hasModule(p, "thrusters") ? 1.15 : 1) * (1 + 0.06 * engGrade(p, "drives"));
    // cruise: the long-haul drive. Fast, blind, and it drops the moment anything big is near.
    if (g.input.wasPressed("j")) this.toggleCruise(g);
    if (this.cruise && this.massLocked(g)) { this.cruise = false; this.scanMsg = "MASS LOCK - DROPPED FROM CRUISE"; this.scanTimer = 2; sfx.alarm(); }
    if (this.towing && this.cruise) { this.cruise = false; g.toast("CAN'T CRUISE WITH A TOW LINE"); }
    const cruiseMul = this.cruise ? 4.5 : this.towing ? 0.55 : 1;
    const ACCEL = h.accel * pilot * tuned * wearThrust(p) * (this.cruise ? 3 : 1);
    const ROT = h.rotSpeed * pilot * (this.cruise ? 0.6 : 1);
    const MAXS = h.maxSpeed * tuned * cruiseMul;
    this.updateAutopilot(g, dt);

    if (lifeSys.health < 50) {
      p.oxygen = Math.max(0, p.oxygen - dt * (50 - lifeSys.health) * 0.02);
      if (p.oxygen <= 0) p.hull = Math.max(1, p.hull - dt * 2);
    } else {
      p.oxygen = Math.min(p.oxygenMax, p.oxygen + dt * 0.5);
    }

    if (g.input.isDown("a")) p.angle -= ROT * dt;
    if (g.input.isDown("d")) p.angle += ROT * dt;
    if (this.autopilot) {
      const d = angDiff(p.angle, this.apAngle);
      p.angle += clamp(d, -ROT * dt, ROT * dt);
    }

    // aim: the turret follows the cursor in mouse mode (ship sits at screen centre)
    this.mouseAim = settings().aim === "mouse" && !touch.enabled;
    this.aim = this.mouseAim ? Math.atan2(g.input.mouseY - VH / 2, g.input.mouseX - VW / 2) : p.angle;

    const thrusting = (g.input.isDown("w") || (this.autopilot && this.apThrust)) && p.fuel > 0;
    const retro = (g.input.isDown("s") || (this.autopilot && this.apBrake)) && p.fuel > 0;
    if (this.cruise && Math.random() < dt * 40) {
      // star streaks past the canopy
      const back = Math.atan2(-p.vy, -p.vx);
      this.particles.push({ x: p.x + (Math.random() - 0.5) * 160, y: p.y + (Math.random() - 0.5) * 100, vx: Math.cos(back) * 700, vy: Math.sin(back) * 700, life: 0.25, color: PAL.starMid });
    }
    sfx.thrust(thrusting || retro || (g.input.isDown("x") && p.fuel > 0 && Math.hypot(p.vx, p.vy) > 4));
    if (thrusting) {
      p.vx += Math.cos(p.angle) * ACCEL * engineFactor * dt;
      p.vy += Math.sin(p.angle) * ACCEL * engineFactor * dt;
      p.fuel = Math.max(0, p.fuel - dt * 0.55 * (h.fuelEff ?? 1));
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
          p.fuel = Math.max(0, p.fuel - dt * 0.55 * (h.fuelEff ?? 1));
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
    const firing = !this.cruise && (g.input.isDown(" ") || (this.mouseAim && g.input.mouseDown));
    if (firing && this.fireCd <= 0 && weaponsSys.health > 5) {
      this.fireCd = h.fireRate;
      sfx.laser();
      const dmg = h.weaponDmg * (0.4 + 0.6 * weaponsSys.health / 100) * (1 + crewBonus(p, "gunner") * 0.2) * (hasSpecialty(p, "marksman") ? 1.15 : 1);
      const a = this.aim;
      this.bullets.push({
        x: p.x + Math.cos(a) * 12, y: p.y + Math.sin(a) * 12,
        vx: p.vx + Math.cos(a) * BULLET_SPEED, vy: p.vy + Math.sin(a) * BULLET_SPEED,
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

    if (g.input.wasPressed("r") && weaponsSys.health > 5) fireTorpedo(this, g);
    this.mining = g.input.isDown("m") || (this.mouseAim && g.input.mouseRight);
    if (this.cruise) this.mining = false;
    if (this.mining) mine(this, g, dt, h.miningRate * (1 + 0.2 * engGrade(p, "mining")), this.aim);
    if (g.input.wasPressed("c")) this.plantCharge(g);
    this.updateCharges(g, dt);

    // deep scan: hold V to charge; reveals anomalies within 900
    if (g.input.isDown("v")) {
      this.scanCharge = Math.min(1, this.scanCharge + dt * 0.5);
      if (this.scanCharge >= 1) {
        this.scanCharge = 0;
        for (const d of this.drifters) if (!d.logged && dist(p.x, p.y, d.x, d.y) < 400) this.scanDrifter(g, d);
        let found = 0;
        for (const an of sys.anomalies) {
          if (!an.discovered && dist(an.x, an.y, p.x, p.y) < (galaxyEventAt(g.world, sys.id)?.kind === "flare" ? 450 : stormBlind(g.world, sys.id) ? 300 : 900)) { an.discovered = true; found++; }
        }
        keeperScan(g);
        const logged = logSystem(p, sys, 2);
        g.toast(found ? `SCAN: ${found} ANOMALY SIGNAL${found > 1 ? "S" : ""} LOCATED${logged ? ` - SYSTEM LOGGED +${logged} DATA` : ""}` : logged ? `SCAN: SYSTEM LOGGED +${logged} EXPLORATION DATA` : "SCAN: NOTHING WITHIN RANGE");
        sfx.select();
        if (found) g.showHint("anomaly", "ANOMALY FOUND - FLY TO THE MARKER AND PRESS E");
      }
    } else {
      this.scanCharge = 0;
    }

    this.updateHeat(g, dt);
    this.updateDockingComputer(g, dt);
    this.updateEncounters(g, dt);
    this.updateRepairJob(g, dt);
    this.updateTow(g, dt);
    this.updateAmbient(g, dt);
    this.updateDrifters(g, dt);
    // other pilots in this system
    presence.tick(p, sys.name);
    this.drainRoomEvents(g);
    this.maydays = this.maydays.filter((m) => Date.now() - m.t < 30_000);
    if (p.hull < p.hullMax * 0.25 && presence.ghosts.size && Date.now() - this.lastMayday > 30_000) {
      this.lastMayday = Date.now();
      presence.send({ t: "wing", kind: "mayday", x: p.x, y: p.y });
      this.comms.push({ from: "SHIP", text: "MAYDAY SENT TO PILOTS IN THIS SYSTEM", life: 6, color: PAL.warn });
      if (this.comms.length > 5) this.comms.shift();
    }
    while (presence.chat.length) {
      const c = presence.chat.shift()!;
      this.comms.push({ from: c.squad ? `[${wire.getSquadron() ?? "SQ"}] ${c.from}` : c.from, text: c.text, life: 10, color: c.squad ? PAL.gold : c.from === wire.getCallsign() ? PAL.ui : PAL.info });
      if (this.comms.length > 5) this.comms.shift();
      if (c.from !== wire.getCallsign()) sfx.blip();
    }
    if (g.input.wasPressed("t")) {
      if (!wire.getCallsign()) g.toast("CHOOSE A CALL SIGN ON THE TITLE SCREEN TO USE THE SYSTEM CHANNEL");
      else if (presence.status !== "on") g.toast("SYSTEM CHANNEL OFFLINE" + (settings().presence ? "" : " - FLEET PRESENCE IS OFF IN SETTINGS"));
      else {
        const raw = ask(`System channel - ${sys.name} (${presence.ghosts.size} other pilot${presence.ghosts.size === 1 ? "" : "s"} here).\n/give <qty> <goods> <callsign>   /pay <credits> <callsign>   (within 300m)${wire.getSquadron() ? `\n/s <message> to the [${wire.getSquadron()}] squadron channel` : ""}`, "");
        g.input.flush();
        if (raw && /^\/s\s+/i.test(raw.trim())) { if (!presence.saySquad(raw.trim().slice(2))) g.toast("SQUADRON CHANNEL OFFLINE"); }
        else if (raw && raw.trim().startsWith("/")) this.roomCommand(g, raw.trim());
        else if (raw && !presence.say(raw)) g.toast("CHANNEL DROPPED THE MESSAGE");
      }
    }
    if (!this.cruise && !this.autopilot && !p.hints?.["cruisehint"] && (p.tutorial ?? -1) < 0) {
      const nearest = Math.min(...sys.stations.map((st) => dist(p.x, p.y, Math.cos(st.angle) * st.orbit, Math.sin(st.angle) * st.orbit)), Infinity);
      if (nearest > 1800) g.showHint("cruisehint", "LONG WAY? J ENGAGES CRUISE - N FLIES YOUR PLOTTED COURSE");
    }
    if (this.arrivalLog) { this.arrivalTimer -= dt; if (this.arrivalTimer <= 0) this.arrivalLog = ""; }

    // soundtrack: faction pad, pulse rising with hostiles in weapons range
    {
      let threat = 0;
      for (const n of this.npcs) if (n.kind === "pirate") { const d = dist(n.x, n.y, p.x, p.y); if (d < 600) threat = Math.max(threat, 1 - d / 600); }
      if (this.lawLevel(g) >= 1) threat = Math.max(threat, 0.6);
      const awe = wondersIn(g.world, sys.id).some((wd) => dist(p.x, p.y, wd.x, wd.y) < 1400);
      music.setMood(awe ? "wonder" : sys.factionId, threat);
    }

    updateBullets(this, g, dt);
    updateNpcs(this, g, dt);
    updatePlatforms(this, g, dt);
    updateParticles(this, dt);
    updateLoot(this, g, dt);
    updateSos(this, g, dt);
    updateTorpedoes(this, g, dt);
    updateFloaters(this, dt);
    updateSmoke(this, g, dt);
    updateComms(this, g, dt);
    this.updateEscort(g, dt);
    this.updateRace(g, dt);
    this.updateConvoy(g, dt);
    this.updateLaw(g, dt);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 20 + Math.random() * 25;
      const alive = this.npcs.filter((n) => n.kind === "pirate").length;
      const lanes = settings().lanes ?? "normal";
      if (alive < sys.pirateActivity * 6 * voteMods(g.world, sys.factionId).patrol * (hasSpecialty(p, "watchkeeper") ? 0.75 : 1) * (lanes === "gentle" ? 0.5 : lanes === "rough" ? 1.5 : 1)) spawnPirateNearBelt(this, g);
      // somebody real was here lately: their ship is on the lanes
      if (g.world.realGalaxy && !this.npcs.some((n) => n.ghost) && Math.random() < 0.35) {
        const me = wire.getCallsign();
        const recent = wire.cachedWire().filter((e) => e.system.toLowerCase() === sys.name.toLowerCase() && e.callsign !== me && Date.now() - e.t < 48 * 3600_000 && !this.ghostsSeen.has(e.callsign));
        if (recent.length) { const ev = recent[Math.floor(Math.random() * recent.length)]; this.ghostsSeen.add(ev.callsign); spawnGhost(this, g, new RNG((g.world.seed ^ Math.floor(g.world.time * 3)) >>> 0), ev); }
      }
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
  mining = false;

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

  // ---------- The convoy: slow haulers who'd rather not cross the system alone ----------
  startConvoy(g: Game): void {
    const p = g.world.player;
    if (this.convoy) return;
    const n = 3; const ships: Npc[] = [];
    for (let i = 0; i < n; i++) {
      const a = p.angle + Math.PI + (i - 1) * 0.5;
      ships.push({ kind: "trader", x: p.x + Math.cos(a) * (90 + i * 30), y: p.y + Math.sin(a) * (90 + i * 30), vx: p.vx, vy: p.vy, angle: p.angle, hull: 60, hullMax: 60, fireCd: 0, targetIdx: 0, cargo: { id: "food", qty: 4 }, name: `CONVOY ${i + 1}`, convoy: true });
    }
    this.npcs.push(...ships);
    this.convoy = { ships, reward: 220 + Math.round(g.world.systems[p.systemId].pirateActivity * 300), lost: 0 };
    this.comms.push({ from: "CONVOY LEAD", text: "FORMING ON YOUR STERN. TAKE US TO ANY GATE AND JUMP; WE'LL FOLLOW YOU THROUGH. EASY ON THE THROTTLE.", life: 10, color: PAL.gold });
    g.showHint("convoy", "CONVOY: KEEP THEM WITHIN A FEW HUNDRED METRES AND JUMP AT ANY GATE. THEY PAY ON THE OTHER SIDE");
  }
  updateConvoy(g: Game, dt: number): void {
    const c = this.convoy; if (!c) return;
    const p = g.world.player;
    const alive = c.ships.filter((s) => s.hull > 0 && this.npcs.includes(s));
    if (!alive.length) { this.convoy = null; this.comms.push({ from: "CONVOY LEAD", text: "...WE'RE DONE. THANKS FOR NOTHING.", life: 7, color: PAL.grey }); return; }
    const far = alive.every((s) => dist(s.x, s.y, p.x, p.y) > 900);
    c.lost = far ? c.lost + dt : 0;
    if (c.lost > 40) { this.npcs = this.npcs.filter((s) => !s.convoy); this.convoy = null; this.comms.push({ from: "CONVOY LEAD", text: "WE'VE LOST YOU. WE'LL TAKE OUR CHANCES. NO HARD FEELINGS. SOME HARD FEELINGS.", life: 8, color: PAL.grey }); }
  }
  // At the gate: whoever kept up comes through with you and pays
  settleConvoy(g: Game): void {
    const c = this.convoy; if (!c) return;
    const p = g.world.player;
    const with_ = c.ships.filter((s) => s.hull > 0 && this.npcs.includes(s) && dist(s.x, s.y, p.x, p.y) < 700);
    this.npcs = this.npcs.filter((s) => !s.convoy); this.convoy = null;
    if (!with_.length) { g.toast("YOU JUMPED WITHOUT THE CONVOY. THEY'LL REMEMBER THAT TOO."); adjustRep(g.world, g.world.systems[p.systemId].factionId, -2); return; }
    const pay = Math.round(c.reward * with_.length / c.ships.length);
    p.credits += pay; ledger(p, "contracts", pay); adjustRep(g.world, g.world.systems[p.systemId].factionId, 3);
    p.convoys = (p.convoys ?? 0) + 1; flag(g, "convoy");
    { const up = crewXp(p, "pilot"); if (up) g.toast(up); }
    g.toast(`${with_.length}/${c.ships.length} OF THE CONVOY CAME THROUGH WITH YOU. +${pay}CR, STANDING UP`);
    void wire.post("trade", `walked a convoy of ${with_.length} through the gate`, g.world.systems[p.systemId].name);
  }

  // ---------- The ring race ----------
  startRace(g: Game): void {
    const p = g.world.player;
    if (!p.racePending) return;
    const st = g.world.systems[p.systemId].stations.find((s) => s.id === p.racePending);
    p.racePending = null;
    if (!st) return;
    const gates = raceCourse(st, g.world.seed ^ Math.floor(g.world.time / 600));
    const holder = raceHolder(g.world, st);
    const best = p.raceBest?.[st.id];
    this.race = { gates, idx: 0, t: 0, stationId: st.id, started: false, idle: 0, par: racePar(gates), pacerT: best !== undefined && best < holder.t ? best : holder.t, pacerName: best !== undefined && best < holder.t ? "YOUR BEST" : holder.name.toUpperCase() };
    this.comms.push({ from: "MARSHAL", text: `RINGS ARE LIT. RING ONE STARTS YOUR CLOCK. PAR ${this.race.par}S.`, life: 9, color: PAL.gold });
  }
  updateRace(g: Game, dt: number): void {
    const r = this.race; if (!r) return;
    const p = g.world.player;
    if (r.started) { r.t += dt; r.idle += dt; }
    if (r.idle > 60) { this.race = null; this.comms.push({ from: "MARSHAL", text: "CLOCK STOPPED. COME BACK WHEN YOU MEAN IT.", life: 7, color: PAL.grey }); return; }
    const gate = r.gates[r.idx];
    if (dist(p.x, p.y, gate.x, gate.y) > 26) return;
    r.idx++; r.idle = 0; sfx.blip();
    if (!r.started) { r.started = true; r.t = 0; }
    if (r.idx < r.gates.length) return;
    // the finish
    const prize = racePrize(r.t, r.par);
    p.credits += prize; ledger(p, "races", prize);
    const best = recordRace(p, r.stationId, r.t);
    if (r.t <= r.par) p.racesUnderPar = (p.racesUnderPar ?? 0) + 1;
    const st = g.world.systems[p.systemId].stations.find((s) => s.id === r.stationId);
    g.toast(`RACE DONE IN ${r.t.toFixed(1)}S (PAR ${r.par}S) - ${prize}CR${best ? " - YOUR BEST HERE" : ""}`);
    this.comms.push({ from: "MARSHAL", text: r.t <= r.par ? "UNDER PAR. THE BAR WILL HEAR ABOUT THAT." : "OVER PAR, BUT CLEAN. THE PRIZE STANDS.", life: 8, color: PAL.gold });
    { const up = crewXp(p, "pilot"); if (up) g.toast(up); }
    flag(g, "raced"); sfx.pickup();
    const beat = st ? beatHolder(g.world, st, r.t) : null;
    if (beat) { this.comms.push({ from: "MARSHAL", text: "THAT'S THE COURSE RECORD. THE BAR WILL HEAR.", life: 8, color: PAL.gold }); this.comms.push({ from: "BAND", text: beat, life: 9, color: PAL.gold }); }
    if (st) {
      const entered = enterRegatta(g.world, st.id);
      if (entered) this.comms.push({ from: "MARSHAL", text: entered, life: 10, color: PAL.gold });
      const prog = entered ? null : regattaProgress(g.world, st.id, r.t, r.par, !!beat || (p.raceBeaten?.[st.id] ?? false));
      if (prog) { g.toast(prog); this.comms.push({ from: "MARSHAL", text: prog, life: 10, color: PAL.gold }); if (p.regatta === 3) { flag(g, "regatta"); void wire.post("race", "won the regatta: three courses, three stations", g.world.systems[p.systemId].name); } }
    }
    if (beat || r.t <= r.par) void wire.post("race", `${beat ? "took the course record" : "ran under par"} at ${st?.name ?? "a station"}: ${r.t.toFixed(1)}s`, g.world.systems[p.systemId].name);
    if (g.world.realGalaxy && st) void wire.postRaceTime(st.name, g.world.systems[p.systemId].name, r.t).then((res) => { if (res?.improved && res.rank === 1) g.toast("THE WIRE HAS YOU AT THE TOP OF THE BOARD FOR THIS COURSE"); });
    this.race = null;
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
      { const l = helpCaptain(g.world, t.name, "escort", new RNG((g.world.seed ^ Math.floor(g.world.time * 47)) >>> 0)); if (l) g.toast(l); }
      escortLine(this);
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

  dockAt(g: Game, st: StationDef): boolean {
    const p = g.world.player;
    const rep = p.rep?.[st.factionId] ?? 0;
    if (st.military && rep < -20) { g.toast("DOCKING DENIED - YOUR RECORD PRECEDES YOU"); return false; }
    if (rep < -60) { g.toast("DOCKING DENIED - PERSONA NON GRATA"); return false; }
    if (this.docking) return true;
    // the approach: control talks you in, the ship glides to the bay, then the deck
    const bay = 1 + (st.id.length * 7 + Math.floor(g.world.time)) % 6;
    const sx = Math.cos(st.angle) * st.orbit, sy = Math.sin(st.angle) * st.orbit;
    const traffic = this.npcs.filter((n) => n.kind === "trader" && n.hull > 0 && dist(n.x, n.y, sx, sy) < 320).length;
    const hold = traffic > 0 || Math.random() < 0.15 ? 3 + Math.random() * 4 : 0;
    this.docking = { st, t: 0, x0: p.x, y0: p.y, bay, hold: hold || undefined };
    g.lastBay = bay;
    this.cruise = false; this.autopilot = false;
    if (hold) { this.comms.push({ from: `${st.name.toUpperCase()} CONTROL`, text: `${(p.shipName ?? "VESSEL").toUpperCase()}, HOLD SHORT OF THE BAY. ${traffic ? "TRAFFIC ON THE APPROACH" : "BAY IS CYCLING"}. WE'LL CALL YOU IN.`, life: 8, color: PAL.warn }); sfx.blip(); return true; }
    this.comms.push({ from: `${st.name.toUpperCase()} CONTROL`, text: `${(p.shipName ?? "VESSEL").toUpperCase()}, CLEARED FOR BAY ${bay}. FOLLOW THE LIGHTS, WE HAVE YOU.`, life: 6, color: PAL.ui });
    sfx.blip();
    return true;
  }
  updateDocking(g: Game, dt: number): boolean {
    const d = this.docking; if (!d) return false;
    const p = g.world.player;
    if (d.hold && d.hold > 0) {
      // holding short: sit off the bay with the engines idling while control works the traffic
      d.hold -= dt; p.vx *= 1 - Math.min(1, dt * 2); p.vy *= 1 - Math.min(1, dt * 2); p.x += p.vx * dt; p.y += p.vy * dt;
      if (d.hold <= 0) { d.hold = undefined; d.x0 = p.x; d.y0 = p.y; d.t = 0; this.comms.push({ from: `${d.st.name.toUpperCase()} CONTROL`, text: `${(p.shipName ?? "VESSEL").toUpperCase()}, THANKS FOR HOLDING. CLEARED FOR BAY ${d.bay}. FOLLOW THE LIGHTS.`, life: 8, color: PAL.info }); sfx.blip(); }
      return true;
    }
    d.t += dt;
    const k = Math.min(1, d.t / 1.6);
    const ease = k * k * (3 - 2 * k);
    const tx = Math.cos(d.st.angle) * d.st.orbit, ty = Math.sin(d.st.angle) * d.st.orbit;
    p.x = d.x0 + (tx - d.x0) * ease; p.y = d.y0 + (ty - d.y0) * ease;
    p.vx = (tx - d.x0) / 1.6 * (1 - k); p.vy = (ty - d.y0) / 1.6 * (1 - k);
    p.angle += angDiff(p.angle, Math.atan2(ty - d.y0, tx - d.x0)) * Math.min(1, dt * 4);
    if (k >= 1) {
      this.docking = null;
      p.dockedAt = d.st.id; p.vx = 0; p.vy = 0;
      sfx.dock();
      g.setScene("station");
    }
    return true;
  }

  // Docking computer: sit still near a bay and it takes you in.
  dockTimer = 0;
  updateDockingComputer(g: Game, dt: number): void {
    const p = g.world.player;
    if (!hasModule(p, "dock") || Math.hypot(p.vx, p.vy) > 45) { this.dockTimer = 0; return; }
    const sys = g.world.systems[p.systemId];
    const st = sys.stations.find((s) => dist(p.x, p.y, Math.cos(s.angle) * s.orbit, Math.sin(s.angle) * s.orbit) < 150);
    if (!st) { this.dockTimer = 0; return; }
    this.dockTimer += dt;
    if (this.dockTimer > 2.5) {
      this.dockTimer = 0;
      if (this.dockAt(g, st)) g.toast(`DOCKING COMPUTER: AUTO-DOCKED AT ${st.name.toUpperCase()}`);
      else this.dockTimer = -30; // denied: don't nag for a while
    }
  }

  arrivalLog = "";
  arrivalTimer = 0;
  raidBase: { tag: string; stationIdx: number; repelled: boolean; by?: string } | null = null;
  maydays: { from: string; x: number; y: number; t: number }[] = [];
  lastMayday = 0;
  // First discovery: the wire remembers who logged a system first.
  async claimFirst(g: Game, sys: { id: string; name: string }): Promise<void> {
    const p = g.world.player;
    p.firsts ??= {};
    if (p.firsts[sys.id] || !wire.getCallsign()) return;
    const r = await wire.discover(sys.name);
    if (!r) return;
    p.firsts[sys.id] = r.by;
    if (r.first) {
      g.toast(`FIRST DISCOVERY: ${sys.name.toUpperCase()} - TAGGED ${r.by}`);
      p.expData = (p.expData ?? 0) + 250;
      flag(g, "first");
      sfx.pickup();
    }
  }

  // ---------- Pilots: transfers and wing shares ----------

  roomCommand(g: Game, raw: string): void {
    const p = g.world.player;
    const parts = raw.slice(1).split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const target = parts[parts.length - 1]?.toUpperCase();
    const ghost = target ? presence.ghosts.get(target) : undefined;
    if (cmd !== "give" && cmd !== "pay") { g.toast("COMMANDS: /GIVE <QTY> <GOODS> <CALLSIGN>  /PAY <CREDITS> <CALLSIGN>"); return; }
    if (!ghost) { g.toast(`NO PILOT "${target ?? ""}" IN THIS SYSTEM`); return; }
    const gp = presence.at(ghost);
    if (dist(p.x, p.y, gp.x, gp.y) > 300) { g.toast(`${target} IS TOO FAR - CLOSE TO WITHIN 300M`); return; }
    if (cmd === "pay") {
      const amt = Math.floor(Number(parts[1]));
      if (!Number.isFinite(amt) || amt <= 0) { g.toast("/PAY <CREDITS> <CALLSIGN>"); return; }
      if (p.credits < amt) { g.toast("NOT ENOUGH CREDITS"); return; }
      if (!presence.send({ t: "xfer", to: target, kind: "credits", id: "cr", qty: amt })) { g.toast("CHANNEL OFFLINE"); return; }
      p.credits -= amt;
      g.toast(`PAID ${amt}CR TO ${target}`);
      sfx.pickup();
      return;
    }
    const qty = Math.floor(Number(parts[1]));
    const name = parts.slice(2, -1).join(" ").toLowerCase();
    const com = COMMODITIES.find((c) => c.id === name || c.name.toLowerCase() === name);
    if (!com || !Number.isFinite(qty) || qty <= 0) { g.toast("/GIVE <QTY> <GOODS> <CALLSIGN>  E.G. /GIVE 5 ORE ALPHA"); return; }
    if ((p.cargo[com.id] ?? 0) < qty) { g.toast(`YOU DON'T HAVE ${qty} ${com.name.toUpperCase()}`); return; }
    if (!presence.send({ t: "xfer", to: target, kind: "cargo", id: com.id, qty })) { g.toast("CHANNEL OFFLINE"); return; }
    removeCargo(p, com.id, qty);
    g.toast(`JETTISONED ${qty} ${com.name.toUpperCase()} TO ${target}`);
    sfx.pickup();
  }

  drainRoomEvents(g: Game): void {
    const p = g.world.player;
    const me = wire.getCallsign();
    while (presence.events.length) {
      const e = presence.events.shift()!;
      if (e.t === "xfer") {
        if (e.to !== me || !e.qty) continue;
        if (e.kind === "credits") { p.credits += e.qty; g.toast(`${e.from} PAID YOU ${e.qty}CR`); sfx.pickup(); flag(g, "wingmate"); }
        else if (e.kind === "cargo" && e.id && commodity(e.id)) {
          if (addCargo(p, e.id, e.qty)) { g.toast(`${e.from} SENT YOU ${e.qty} ${commodity(e.id).name.toUpperCase()}`); sfx.pickup(); flag(g, "wingmate"); }
          else { this.loot.push({ x: p.x + 30, y: p.y, commodityId: e.id, qty: e.qty, life: 120 }); g.toast(`${e.from} JETTISONED ${e.qty} ${commodity(e.id).name.toUpperCase()} BESIDE YOU - HOLD IS FULL`); }
        }
      } else if (e.t === "wing" && e.kind === "mayday") {
        if (!this.maydays.some((m) => m.from === e.from)) this.comms.push({ from: "MAYDAY", text: `${e.from} IS GOING DOWN - MARKER ON YOUR HUD`, life: 10, color: PAL.danger });
        this.maydays = this.maydays.filter((m) => m.from !== e.from);
        this.maydays.push({ from: e.from, x: e.x ?? 0, y: e.y ?? 0, t: Date.now() });
        if (this.comms.length > 5) this.comms.shift();
        sfx.alarm();
      } else if (e.t === "wing" && e.kind === "kill") {
        if (dist(p.x, p.y, e.x ?? 0, e.y ?? 0) > 700) continue;
        const share = e.tag === "captain" ? 200 : 60;
        p.credits += share;
        for (const m of p.missions) if (m.kind === "bounty" && m.accepted && !m.done && m.targetSystemId === p.systemId) m.kills = (m.kills ?? 0) + 1;
        this.comms.push({ from: "WING", text: `${e.from} SCORED A KILL - SHARE +${share}CR, BOUNTIES CREDITED`, life: 8, color: PAL.gold });
        if (this.comms.length > 5) this.comms.shift();
        flag(g, "wingmate");
        sfx.pickup();
      }
    }
  }

  // ---------- Helping ships ----------
  repairJob: RepairJob | null = null;
  towing: Npc | null = null;

  updateTow(g: Game, dt: number): void {
    const n = this.towing;
    if (!n) return;
    const p = g.world.player;
    if (n.hull <= 0 || !this.npcs.includes(n)) { this.towing = null; g.toast("TOW LINE GOES SLACK - THE FREIGHTER IS GONE"); return; }
    const d = dist(p.x, p.y, n.x, n.y);
    if (d > 420) { this.towing = null; g.toast("TOW LINE SNAPPED - TOO FAST"); sfx.hit(); return; }
    // the line: pull the freighter along behind you
    const ang = Math.atan2(n.y - p.y, n.x - p.x);
    const wantX = p.x + Math.cos(ang) * 70, wantY = p.y + Math.sin(ang) * 70;
    n.vx = (wantX - n.x) * 3; n.vy = (wantY - n.y) * 3;
    n.x += n.vx * dt; n.y += n.vy * dt;
    n.angle = Math.atan2(p.y - n.y, p.x - n.x);
    void d;
  }

  offerHelp(g: Game, n: Npc): void {
    const p = g.world.player;
    const eng = p.crew.find((c) => c.role === "engineer");
    const who = n.tag ? `[${n.tag}] CONVOY` : "FREIGHTER";
    const opts: Encounter["options"] = [];
    const medic = p.crew.find((c) => c.role === "medic");
    if (n.casualties) {
      if (medic) opts.push({ label: `SEND ${medic.name.toUpperCase()} ACROSS (MEDIC ${medic.skill})`, hint: "Triage takes a while; stay close", result: () => { this.repairJob = { npc: n, crewName: medic.name, progress: 0, need: 30 / (0.6 + 0.4 * medic.skill), wave: 9, kind: "medic" }; return `${medic.name.toUpperCase()} GRABS THE KIT AND CROSSES.`; } });
      else opts.push({ label: "NO MEDIC ABOARD TO SEND", hint: "Hire one at a station bar", requires: () => false, result: () => "" });
      opts.push({ label: "TRANSFER 2 MED SUPPLIES", hint: "They treat their own", requires: (g2) => (g2.world.player.cargo.med ?? 0) >= 2, result: (g2) => { removeCargo(g2.world.player, "med", 2); n.casualties = false; this.thankYou(g2, n, 160); g2.world.player.lives = (g2.world.player.lives ?? 0) + 2; return "THE CRATES GO ACROSS ON A LINE. 'THAT'LL DO IT. THANK YOU. TRULY.'"; } });
      if (!p.evacuees) opts.push({ label: "TAKE THE WOUNDED ABOARD", hint: medic ? "Your medic keeps them alive to dock" : "Without a medic, not all of them will make it", result: (g2, rng) => { const n2 = 2; g2.world.player.evacuees = { n: medic ? n2 : (rng.chance(0.3) ? 1 : 2), from: "wounded" }; n.casualties = false; return medic ? "TWO STRETCHERS COME ACROSS. YOUR MEDIC TAKES OVER. DOCK SOON." : "TWO STRETCHERS COME ACROSS. NOBODY ABOARD KNOWS WHAT THEY'RE DOING. DOCK FAST."; } });
      opts.push({ label: "LEAVE THEM", result: () => "YOU BREAK OFF. THE CHANNEL STAYS OPEN A WHILE, THEN CLOSES." });
      const enc: Encounter = { id: "help-med", where: "space", title: `MEDICAL - ${who}`, weight: 0, text: "'WE HIT SOMETHING ON THE JUMP. THREE DOWN, ONE BAD. OUR MEDKIT IS A BOX OF PLASTERS. IS THERE A DOCTOR ON THAT SHIP?'", options: opts };
      (g.scenes["encounter"] as import("../encounter").EncounterScene).open(g, enc, "flight", true);
      return;
    }
    if (n.mayday) {
      opts.push({ label: "PASS TEN UNITS OF FUEL ON A LINE", hint: "The Pilots' Fund pays 300cr for an answered mayday", requires: (g2) => g2.world.player.fuel >= 15, result: (g2) => {
        const p2 = g2.world.player; p2.fuel -= 10; p2.credits += 300; ledger(p2, "rescues", 300); p2.rescues = (p2.rescues ?? 0) + 1; adjustRep(g2.world, g2.world.systems[p2.systemId].factionId, 3);
        void wire.post("rescue", `answered ${n.name}'s mayday with fuel`, g2.world.systems[p2.systemId].name); flag(g2, "fuelrat"); logEntry(g2.world, `Answered ${n.name}'s mayday with fuel`);
        this.npcs = this.npcs.filter((x) => x !== n);
        return `${(n.name ?? "THE PILOT").toUpperCase()}: 'YOU BEAUTIFUL PEOPLE. I'M NOT CRYING, IT'S THE RECYCLED AIR.' THE FUND WIRES 300CR. THEIR DRIVE LIGHTS UP AND THEY'RE GONE.`; } });
      opts.push({ label: "LEAVE THEM", result: () => "YOU BREAK OFF. THE MAYDAY STAYS ON THE WIRE FOR SOMEBODY ELSE." });
      const enc: Encounter = { id: "help-mayday", where: "space", title: `MAYDAY - ${(n.name ?? "PILOT").toUpperCase()} (ON THE WIRE)`, weight: 0, text: `'THIS IS ${(n.name ?? "A PILOT").toUpperCase()}. TANKS ARE DRY, DRIFTING, LIFE SUPPORT'S FINE FOR NOW. TEN UNITS WOULD GET ME TO THE STATION. I'LL OWE YOU ONE. I MEAN IT.'`, options: opts };
      (g.scenes["encounter"] as import("../encounter").EncounterScene).open(g, enc, "flight", true);
      return;
    }
    if (n.disabled) {
      opts.push({ label: "BOARD AND REPAIR IT YOURSELF", hint: "Three dead systems, a suit clock, maybe a fire", result: (g2) => { g2.repairTarget = n; setTimeout(() => g2.setScene("repair"), 0); return ""; } });
      if (eng) opts.push({ label: `SEND ${eng.name.toUpperCase()} ACROSS (ENGINEER ${eng.skill})`, hint: g.world.systems[p.systemId].pirateActivity > 0.4 ? "You stand guard; corsairs work this system" : "You stand guard; it's usually quiet out here", result: () => { this.repairJob = { npc: n, crewName: eng.name, progress: 0, need: 45 / (0.6 + 0.4 * eng.skill), wave: 0, kind: "repair" }; return `${eng.name.toUpperCase()} SUITS UP AND CROSSES. KEEP THEM SAFE.`; } });
      else opts.push({ label: "NO ENGINEER ABOARD TO SEND", hint: "Hire one at a station bar", requires: () => false, result: () => "" });
      opts.push({ label: "TOW THEM TO A STATION", hint: "They follow you; top speed drops; dock anywhere", result: () => { this.towing = n; n.disabled = true; return "TOW LINE ATTACHED. TAKE IT SLOW - THE LINE WON'T SURVIVE A JUMP OR A FIREFIGHT AT SPEED."; } });
      if (!p.evacuees) opts.push({ label: "TAKE THEIR CREW ABOARD", hint: "Three survivors, paid out at your next dock", result: (g2) => { g2.world.player.evacuees = { n: 3, from: who.toLowerCase() }; this.npcs = this.npcs.filter((x) => x !== n); if (this.sos?.trader === n) this.sos = null; return "THREE OF THEM CROSS IN SUITS AND CRAM INTO THE GALLEY. THE FREIGHTER STAYS DARK BEHIND YOU."; } });
    } else {
      opts.push({ label: "PASS THEM A SPARE PART", hint: "Patches their hull; they remember", requires: (g2) => (g2.world.player.cargo.parts ?? 0) >= 1, result: (g2) => { g2.world.player.cargo.parts!--; if (!g2.world.player.cargo.parts) delete g2.world.player.cargo.parts; n.hull = n.hullMax; this.thankYou(g2, n, 120); const l = helpCaptain(g2.world, n.name, "part", new RNG((g2.world.seed ^ Math.floor(g2.world.time * 53)) >>> 0)); if (l) g2.toast(l); return `THEY TAKE THE PART AND PATCH THE BREACH. '${who}, WE OWE YOU ONE.'`; } });
    }
    opts.push({ label: "LEAVE THEM", result: () => "YOU BREAK OFF. THE CHANNEL STAYS OPEN A WHILE, THEN CLOSES." });
    const enc: Encounter = { id: "help-ship", where: "space", title: n.disabled ? `MAYDAY - ${who} DISABLED` : `${who} - HULL ${Math.round(n.hull / n.hullMax * 100)}%`, weight: 0,
      text: n.disabled ? "'ENGINES ARE DEAD, LIFE SUPPORT IS ON BATTERIES, AND THE REACTOR IS MAKING A NOISE I DON'T LIKE. WE CAN'T FIX IT FROM IN HERE. CAN YOU?'" : "'WE TOOK A HIT COMING THROUGH THE BELT. HULL'S HOLDING, JUST. IF YOU'VE GOT A SPARE PART, WE'D PAY FOR IT.'",
      options: opts };
    (g.scenes["encounter"] as import("../encounter").EncounterScene).open(g, enc, "flight", true);
  }

  updateRepairJob(g: Game, dt: number): void {
    const job = this.repairJob;
    if (!job) return;
    const p = g.world.player;
    if (job.npc.hull <= 0 || !this.npcs.includes(job.npc)) {
      this.repairJob = null;
      const c = p.crew.find((x) => x.name === job.crewName);
      if (c) c.morale = Math.max(0, c.morale - 15);
      g.toast(`THE FREIGHTER IS GONE. ${job.crewName.toUpperCase()} GETS BACK IN A LIFEPOD, SHAKEN.`);
      return;
    }
    job.progress += dt / job.need;
    // corsairs are a risk of standing still in rough space, not a certainty
    const piracy = g.world.systems[p.systemId].pirateActivity;
    if (job.wave === 0 && job.progress > 0.3) { job.wave = 1; if (Math.random() < 0.15 + piracy * 0.5) { this.spawnRaidersNearPlayer(g, 2); g.toast("CORSAIRS ON THE SCOPE - THEY WANT THE FREIGHTER"); } }
    if (job.wave === 1 && job.progress > 0.7) { job.wave = 2; if (Math.random() < 0.1 + piracy * 0.4) this.spawnRaidersNearPlayer(g, 2); }
    if (job.progress >= 1) {
      this.repairJob = null;
      const c = p.crew.find((x) => x.name === job.crewName);
      if (c) { c.morale = Math.min(100, c.morale + 10); c.loyalty = (c.loyalty ?? 0) + 1; }
      if (job.kind === "medic") this.finishMedic(g, job.npc, job.crewName); else this.finishRepair(g, job.npc, job.crewName);
    }
  }

  spawnRaidersNearPlayer(g: Game, n: number): void {
    const rng = new RNG((g.world.seed ^ Math.floor(g.world.time * 31)) >>> 0);
    const p = g.world.player;
    for (let i = 0; i < n; i++) { const e = spawnNpc(this, g, "pirate", rng); const a = rng.range(0, Math.PI * 2); e.x = p.x + Math.cos(a) * 520; e.y = p.y + Math.sin(a) * 520; }
  }

  thankYou(g: Game, n: Npc, credits: number): void {
    const p = g.world.player;
    p.credits += credits; ledger(p, "rescues", credits);
    const sys = g.world.systems[p.systemId];
    adjustRep(g.world, sys.factionId, 3);
    if (n.tag) { const sy = g.world.syndicates?.find((x) => x.tag === n.tag); if (sy) { p.synRep ??= {}; p.synRep[sy.tag] = Math.min(100, (p.synRep[sy.tag] ?? 0) + 5); } }
    sfx.pickup();
  }

  finishMedic(g: Game, n: Npc, by: string): void {
    const p = g.world.player;
    n.casualties = false;
    const reward = (this.sos && this.sos.trader === n ? this.sos.reward : 250) + Math.floor(Math.random() * 150);
    this.thankYou(g, n, reward);
    { const l = helpCaptain(g.world, n.kind === "trader" ? n.name : undefined, "medic", new RNG((g.world.seed ^ Math.floor(g.world.time * 43)) >>> 0)); if (l) g.toast(l); }
    p.lives = (p.lives ?? 0) + 3;
    { const up = crewXp(p, "medic", 4); if (up) g.toast(up); }
    flag(g, "fieldMedic");
    if ((p.lives ?? 0) >= 12) flag(g, "surgeon");
    const sys = g.world.systems[p.systemId];
    this.comms.push({ from: n.tag ? `[${n.tag}] CONVOY` : "FREIGHTER", text: `ALL THREE STABLE. ${by.toUpperCase()} IS WELCOME ABOARD ANY TIME. +${reward}CR`, life: 12, color: PAL.gold });
    if (this.comms.length > 5) this.comms.shift();
    g.toast(`CASUALTIES STABILISED +${reward}CR`);
    void wire.post("rescue", `sent ${by} across to a freighter with casualties and saved three lives`, sys.name);
    if (this.sos && this.sos.trader === n) this.sos = null;
    logEntry(g.world, `${by} stabilised three casualties aboard a freighter in ${sys.name}`);
  }

  // A ship brought back to life, by you or by your engineer
  finishRepair(g: Game, n: Npc, by: string): void {
    const p = g.world.player;
    n.disabled = false; n.hull = n.hullMax;
    const reward = (this.sos && this.sos.trader === n ? this.sos.reward : 300) + Math.floor(Math.random() * 200);
    this.thankYou(g, n, reward);
    { const l = helpCaptain(g.world, n.kind === "trader" ? n.name : undefined, "repair", new RNG((g.world.seed ^ Math.floor(g.world.time * 41)) >>> 0)); if (l) g.toast(l); }
    p.repairs = (p.repairs ?? 0) + 1;
    if (by !== "you") { const up = crewXp(p, "engineer", 4); if (up) g.toast(up); }
    flag(g, "shipwright1");
    if ((p.repairs ?? 0) >= 5) flag(g, "shipwright5");
    const sys = g.world.systems[p.systemId];
    const rng = new RNG((g.world.seed ^ Math.floor(g.world.time * 17)) >>> 0);
    let extra = "";
    if (rng.chance(0.3)) { addCargoW(p, "parts", 2); extra = " THEY THROW IN TWO SPARE PARTS."; }
    else if (rng.chance(0.3)) { const c = genCrewCandidate(rng); if (p.crew.length < hull(p.hullId).crewSlots) { p.crew.push(c); extra = ` THEIR ${c.role.toUpperCase()} ${c.name.toUpperCase()} ASKS FOR A BERTH WITH YOU INSTEAD, AND GETS ONE.`; } }
    this.comms.push({ from: n.tag ? `[${n.tag}] CONVOY` : "FREIGHTER", text: `ENGINES LIT. ${by === "you" ? "WE WON'T FORGET THIS" : `TELL ${by.toUpperCase()} THEY'RE A WIZARD`}. +${reward}CR${extra}`, life: 12, color: PAL.gold });
    if (this.comms.length > 5) this.comms.shift();
    g.toast(`FREIGHTER REPAIRED +${reward}CR${extra ? " - " + extra.trim() : ""}`);
    g.world.events.push({ t: g.world.time, kind: "rescue", systemId: p.systemId, text: `A disabled freighter was repaired and sent on its way by an independent pilot` });
    void wire.post("rescue", by === "you" ? "boarded a disabled freighter and brought its engines back" : `sent ${by} across to fix a disabled freighter`, sys.name);
    if (this.sos && this.sos.trader === n) this.sos = null;
    logEntry(g.world, `Brought a disabled freighter back to life (${by === "you" ? "by hand" : by}) in ${sys.name}`);
  }

  // ---------- Ambient life ----------
  drifters: { x: number; y: number; vx: number; vy: number; angle: number; phase: number; logged: boolean }[] = [];
  spawnDrifters(g: Game): void {
    this.drifters = [];
    const sys = g.world.systems[g.world.player.systemId];
    const rng = new RNG((g.world.seed ^ sys.id.length * 977) >>> 0);
    sys.planets.forEach((pl) => {
      if (pl.palette < 6 || !rng.chance(0.5)) return; // gas giants only, and not always
      const n = rng.int(1, 3);
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, Math.PI * 2);
        const r = pl.radius + rng.range(120, 260);
        const px = Math.cos(pl.angle) * pl.orbit + Math.cos(a) * r, py = Math.sin(pl.angle) * pl.orbit + Math.sin(a) * r;
        const ang = a + Math.PI / 2;
        this.drifters.push({ x: px, y: py, vx: Math.cos(ang) * 9, vy: Math.sin(ang) * 9, angle: ang, phase: rng.range(0, 6), logged: !!g.world.player.codex?.["fauna:VOID DRIFTER"] });
      }
    });
  }
  songTimer = 0;
  updateDrifters(g: Game, dt: number): void {
    const p = g.world.player;
    this.songTimer -= dt;
    if (this.songTimer <= 0) { this.songTimer = 6 + Math.random() * 8; if (this.drifters.some((d) => dist(p.x, p.y, d.x, d.y) < 500)) sfx.drifterSong(); }
    for (const d of this.drifters) {
      d.x += d.vx * dt; d.y += d.vy * dt;
      d.angle += Math.sin(g.world.time * 0.3 + d.phase) * 0.002;
      d.vx = Math.cos(d.angle) * 9; d.vy = Math.sin(d.angle) * 9;
    }
  }
  scanDrifter(g: Game, d: { logged: boolean }): void {
    const p = g.world.player;
    d.logged = true;
    p.codex ??= {};
    const first = !p.codex["fauna:VOID DRIFTER"];
    p.codex["fauna:VOID DRIFTER"] = (p.codex["fauna:VOID DRIFTER"] ?? 0) + 1;
    {
      const near = g.world.systems[p.systemId].planets.map((pl, idx) => ({ pl, idx })).filter((x) => x.pl.palette >= 6).sort((a, b) => dist(Math.cos(a.pl.angle) * a.pl.orbit, Math.sin(a.pl.angle) * a.pl.orbit, p.x, p.y) - dist(Math.cos(b.pl.angle) * b.pl.orbit, Math.sin(b.pl.angle) * b.pl.orbit, p.x, p.y))[0];
      if (logSight(p, "drifter", "the void drifters", p.systemId, near?.idx)) g.toast("YOUR PASSENGERS GO QUIET AT THE VIEWPORT. THAT ONE'S WORTH THE FARE.");
    }
    p.expData = (p.expData ?? 0) + (first ? 200 : 60);
    p.discoveries += 1;
    g.toast(first ? "NEW SPECIES: VOID DRIFTER. IT DOESN'T SEEM TO MIND YOU. +200 DATA" : "VOID DRIFTER LOGGED +60 DATA");
    flag(g, "drifter");
    logEntry(g.world, `Logged a void drifter off a gas giant in ${g.world.systems[p.systemId].name}`);
  }
  faultTimer = 40;
  wonderSeen = new Set<string>();
  loreSeen = new Set<string>();
  docking: { st: StationDef; t: number; x0: number; y0: number; bay: number; hold?: number } | null = null;
  launching = 0;
  // the comms log: everything said on the band this session, L to read back
  paused = false;
  pauseCursor = 0;
  wonderSfx = 1;
  commsLog: { from: string; text: string; t: number }[] = [];
  logged = new WeakSet<object>();
  logOpen = false;
  recordComms(now: number): void {
    for (const c of this.comms) { if (this.logged.has(c)) continue; this.logged.add(c); this.commsLog.push({ from: c.from, text: c.text, t: now }); if (this.commsLog.length > 60) this.commsLog.shift(); }
  }
  chatterTimer = 25;
  trafficTimer = 40;
  maydayCheck = 20;
  lastWatch = -1;
  loungeT = 40;
  updateMayday(g: Game, dt: number): void {
    const p = g.world.player; const sys = g.world.systems[p.systemId];
    if (!g.world.realGalaxy || !wire.getCallsign()) return;
    // dry tanks: put it on the wire, once per system
    if (p.fuel < p.fuelMax * 0.06 && !this.docking && !(p.mayday && p.mayday.system === sys.name)) {
      p.mayday = { system: sys.name, t: Date.now() - 60_000 };
      void wire.postLight(sys.name, "mayday", false);
      this.comms.push({ from: (p.shipName ?? "SHIP").toUpperCase(), text: "MAYDAY ON THE WIRE. TANKS DRY. IF ANY OTHER PILOT IS OUT THIS WAY, THEY'LL SEE IT.", life: 10, color: PAL.danger });
      g.showHint("mayday-wire", "YOUR MAYDAY IS ON THE WIRE FOR SIX HOURS. A DEPOT, A SCOOP, OR ANOTHER PILOT CAN GET YOU HOME");
    }
    if (!p.mayday) return;
    this.maydayCheck -= dt; if (this.maydayCheck > 0) return; this.maydayCheck = 45;
    const me = wire.getCallsign()!; const since = p.mayday.t;
    void wire.fetchWire(true).then((evs) => {
      const who = maydayAnswered(evs, me, since);
      if (!who || !p.mayday) return;
      p.fuel = Math.min(p.fuelMax, p.fuel + 20); p.mayday = null;
      g.toast(`${who} ANSWERED YOUR MAYDAY. TWENTY UNITS ON THE LINE. YOU OWE THEM ONE.`);
      logEntry(g.world, `${who} answered the mayday with fuel`); sfx.pickup();
    });
  }
  updateAmbient(g: Game, dt: number): void {
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    this.updateMayday(g, dt);
    // the ship's bell: the watch changes, and the lounge has something to say now and then
    { const wi = watchIndex(g.world.time); if (this.lastWatch < 0) this.lastWatch = wi; else if (wi !== this.lastWatch) { this.lastWatch = wi; if (p.crew.length >= 2) { const on = p.crew.filter((c, i) => onWatch(p, i, g.world.time) && !c.sick).map((c) => c.name.split(" ")[0].toUpperCase()); this.comms.push({ from: (p.shipName ?? "SHIP").toUpperCase(), text: `WATCH CHANGE. ${on.length ? on.join(" AND ") + " ON DECK." : "EVERYONE'S IN THEIR BUNK."}`, life: 7, color: PAL.uiDim }); sfx.blip(); } } }
    this.loungeT -= dt;
    if (this.loungeT <= 0) { this.loungeT = 60 + Math.random() * 60; const pax = passengersAboard(p); const c = p.crew.find((x) => !x.sick); if (pax.length && c && this.comms.length < 3) { const m = pax[Math.floor(Math.random() * pax.length)]; const q = passengerChatter(m, c, new RNG((Math.random() * 1e9) >>> 0)); this.comms.push({ from: `${(m.passengerName ?? "PASSENGER").toUpperCase()} (LOUNGE)`, text: q.ask, life: 7, color: "#b28fe0" }); this.comms.push({ from: c.name.split(" ")[0].toUpperCase(), text: q.reply, life: 7, color: PAL.grey }); } }
    // comms chatter when the channel is quiet
    if (g.world.infraNews?.length) { for (const line of g.world.infraNews) g.toast(line); g.world.infraNews = []; }
    // a passenger has heard about a wonder nearby and asks for a detour
    if (g.sceneName === "flight" && !this.docking && !this.launching) {
      const fare = passengersAboard(p).find((m) => !m.detourAsked && (m.passengerKind === "tourist" || m.passengerKind === "vip") && !m.sightSeen);
      if (fare) {
        const here = sys; const cand = [here, ...here.links.map((l) => g.world.systems[l]).filter(Boolean)].flatMap((s2) => wondersIn(g.world, s2.id).map((wd) => ({ s2, wd }))).filter((x) => !x.wd.seen)[0];
        if (cand && Math.random() < 0.02) {
          fare.detourAsked = true;
          const name = (fare.passengerName ?? "YOUR PASSENGER").toUpperCase();
          const bonus = Math.round(fare.reward * 0.4);
          const enc: Encounter = { id: "detour", where: "space", title: `${name} - A REQUEST`, weight: 0, text: `${name} HAS BEEN TALKING TO THE CREW. 'THEY SAY THERE'S SOMETHING OUT IN ${cand.s2.name.toUpperCase()} CALLED ${cand.wd.name.toUpperCase()}. I'D PAY ${bonus}CR MORE TO SEE IT ON THE WAY. I MAY NEVER BE OUT HERE AGAIN.'`, options: [
            { label: `DETOUR TO ${cand.wd.name.toUpperCase()} (+${bonus}CR)`, result: () => { fare.sightKind = "wonder"; fare.sightSystemId = cand.s2.id; fare.sightSeen = false; fare.reward += bonus; fare.mood = Math.min(100, (fare.mood ?? 60) + 10); return `${name} SITS DOWN AGAIN, PLEASED. THE CREW EXCHANGE A LOOK THAT MEANS 'WE'RE GOING TOO'.`; } },
            { label: "STRAIGHT THERE, AS BOOKED", result: () => { fare.mood = Math.max(0, (fare.mood ?? 60) - 6); return `${name} NODS. 'ANOTHER TIME, THEN.' THERE PROBABLY WON'T BE.`; } },
          ] };
          (g.scenes["encounter"] as EncounterScene).open(g, enc, "flight", false);
          return;
        }
      }
    }
    // other real pilots' ships hail once with what they posted
    for (const n of this.npcs) {
      if (!n.ghost || n.hailed || n.hull <= 0 || dist(p.x, p.y, n.x, n.y) > 360) continue;
      n.hailed = true;
      this.comms.push({ from: n.name ?? "PILOT", text: `${(n.name ?? "PILOT").toUpperCase()} HERE. STILL OUT THIS WAY. LAST I ${n.ghost.toUpperCase().slice(0, 70)}. SAFE LANES.`, life: 9, color: PAL.info });
    }
    // the regulars hail you when they pass close; friends have more to say
    for (const n of this.npcs) {
      if (n.kind !== "trader" || !n.name || n.hailed || n.hull <= 0 || dist(p.x, p.y, n.x, n.y) > 320) continue;
      const cap = captainByName(g.world, n.name);
      if (!cap) continue;
      n.hailed = true;
      const line = isRival(cap) ? rivalryLine(g.world, cap, new RNG((g.world.seed ^ Math.floor(g.world.time * 61)) >>> 0))
        : isFriend(cap) ? ([`GOOD TO SEE THAT HULL${captainNickname(g.world) ? `, ${captainNickname(g.world)}` : ""}. STILL OWE YOU.`, "IF YOU'RE HEADING MY WAY, THERE'S A DRINK WITH YOUR NAME ON IT.", "KEEP FLYING LIKE THAT AND I'LL HAVE TO START PAYING YOU."][cap.met % 3])
        : cap.helped > 0 ? "THAT YOU? I HAVEN'T FORGOTTEN." : cap.met > 3 ? "WE KEEP CROSSING PATHS. SMALL GALAXY." : "CLEAR SKIES, STRANGER.";
      this.comms.push({ from: `${cap.name.toUpperCase()}, ${cap.ship.toUpperCase()}`, text: line, life: 7, color: isRival(cap) ? PAL.danger : isFriend(cap) ? PAL.gold : PAL.info });
    }
    // the wonders have voices: a pulsar ticks, the cathedral hums
    this.wonderSfx -= dt;
    if (this.wonderSfx <= 0) {
      this.wonderSfx = 1;
      for (const wd of wondersIn(g.world, sys.id)) {
        const d = dist(p.x, p.y, wd.x, wd.y);
        if (d > 1600) continue;
        if (wd.kind === "pulsar") sfx.tick(1 - d / 1600);
        else if (wd.kind === "clock") { if (Math.floor(g.world.time) % 5 === 0) sfx.tick(0.5 * (1 - d / 1600)); }
        else if (wd.kind === "cathedral" || wd.kind === "twins" || wd.kind === "choir") { if (Math.floor(g.world.time) % (wd.kind === "choir" ? 2 : 4) === 0) sfx.choir(1 - d / 1600); }
      }
    }
    // a wonder within sight: the codex, the data, the tourists
    for (const wd of wondersIn(g.world, sys.id)) {
      if (dist(p.x, p.y, wd.x, wd.y) > WONDER_RANGE) continue;
      if (this.wonderSeen.has(wd.id)) continue;
      this.wonderSeen.add(wd.id);
      if (rivalBeatsYouTo(g.world, wd, new RNG((g.world.seed ^ Math.floor(g.world.time * 67)) >>> 0))) g.toast(`${(wd.seenBy ?? "SOMEONE").toUpperCase()} LOGGED ${wd.name.toUpperCase()} FIRST AND LEFT A MARKER BUOY WITH THEIR NAME ON IT.`);
      const r = seeWonder(g.world, wd, wire.getCallsign() ?? p.captainName ?? "an independent pilot");
      g.toast(r.first ? `${wd.name.toUpperCase()}. ${wd.desc.toUpperCase()} +${r.data} DATA` : `${wd.name.toUpperCase()} AGAIN. IT DOESN'T GET SMALLER. +${r.data} DATA`);
      // notes tied here by whoever came before
      if (g.world.realGalaxy) void wire.fetchNotes(sys.name).then((notes) => { const me = wire.getCallsign(); for (const n of notes.filter((x) => x.callsign !== me && (!x.wonder || x.wonder === wd.name)).slice(0, 2)) this.comms.push({ from: n.callsign, text: `(A NOTE TIED HERE) '${n.text.toUpperCase()}'`, life: 12, color: PAL.gold }); });
      if (r.first) {
        flag(g, "wonder"); void wire.post("discover", `saw ${wd.name} in ${sys.name}`, sys.name); sfx.pickup();
        // the shared sky: in the real galaxy the same wonder can be first-seen by any pilot, once
        if (g.world.realGalaxy && wire.getCallsign()) void wire.discover(`wonder:${wd.name}@${sys.name}`).then((d) => { if (!d) return; (p.firsts ??= {})[`wonder:${wd.id}`] = d.by; if (d.first) { g.toast(`FIRST PILOT TO LOG ${wd.name.toUpperCase()}: ${d.by}. THE CHART CARRIES YOUR NAME.`); p.expData = (p.expData ?? 0) + 200; } else if (d.by !== wire.getCallsign()) g.toast(`${d.by} LOGGED ${wd.name.toUpperCase()} BEFORE YOU. THEIR NAME IS ON THE CHART.`); });
      }
      if (logSight(p, "wonder", wd.name, sys.id)) g.toast("YOUR PASSENGERS ARE SILENT AT THE VIEWPORT. THAT'S THE ONE THEY CAME FOR.");
    }
    // a worn ship throws faults now and then; the engineer keeps the interval long
    this.faultTimer -= dt;
    if (this.faultTimer <= 0) {
      this.faultTimer = 45 + Math.random() * 30;
      const msg = wearFault(p, new RNG((g.world.seed ^ Math.floor(g.world.time * 7)) >>> 0));
      if (msg) { g.toast(msg); sfx.alarm(); }
    }
    this.chatterTimer -= dt;
    if (this.chatterTimer <= 0) {
      this.chatterTimer = (35 + Math.random() * 40) * ((settings().chatter ?? "normal") === "quiet" ? 2 : (settings().chatter ?? "normal") === "busy" ? 0.5 : 1);
      if (this.comms.length < 2) {
        const vrng = new RNG((g.world.seed ^ Math.floor(g.world.time * 5)) >>> 0);
        const shipLine = (settings().voice ?? true) && vrng.chance(isOccasion("silence") ? 0.5 : 0.18) ? pickShipLine(g, vrng) : null;
        if (!shipLine && isOccasion("silence") && vrng.chance(0.6)) return;
        if (shipLine) { this.comms.push({ from: (p.shipName ?? "SHIP").toUpperCase(), text: shipLine, life: 9, color: PAL.uiDim }); return; }
        const line = pickChatter(g, new RNG((g.world.seed ^ Math.floor(g.world.time * 3)) >>> 0));
        if (line) { this.comms.push({ from: line.from, text: line.text, life: 9, color: PAL.greyDark }); }
      }
    }
    // launches: now and then a hauler clears a bay
    if (Math.random() < dt * 0.02 && sys.stations.length) {
      const rng = new RNG((g.world.seed ^ Math.floor(g.world.time * 5)) >>> 0);
      const st = rng.pick(sys.stations);
      const sx = Math.cos(st.angle) * st.orbit, sy = Math.sin(st.angle) * st.orbit;
      spawnTrader(this, g, rng);
      const n = this.npcs[this.npcs.length - 1];
      const a = rng.range(0, Math.PI * 2);
      n.x = sx + Math.cos(a) * 70; n.y = sy + Math.sin(a) * 70; n.angle = a;
      boom(this, n.x, n.y, 6, PAL.thrust);
      if (dist(p.x, p.y, sx, sy) < 700 && this.comms.length < 3) this.comms.push({ from: `${st.name.toUpperCase()} CONTROL`, text: `${rng.pick(["HAULER", "SHUTTLE", "TENDER"])} DEPARTING BAY ${rng.int(1, 9)}, CLEAR THE APPROACH`, life: 5, color: PAL.greyDark });
    }
    // gate traffic: ships arrive with a flash and leave the same way
    this.trafficTimer -= dt;
    if (this.trafficTimer <= 0 && sys.jumpPoints.length) {
      this.trafficTimer = 30 + Math.random() * 50;
      const rng = new RNG((g.world.seed ^ Math.floor(g.world.time * 7)) >>> 0);
      const jp = rng.pick(sys.jumpPoints);
      if (rng.chance(0.6)) {
        // arrival
        spawnTrader(this, g, rng);
        const n = this.npcs[this.npcs.length - 1];
        n.x = jp.x + rng.range(-30, 30); n.y = jp.y + rng.range(-30, 30);
        boom(this, jp.x, jp.y, 10, PAL.info);
        if (dist(p.x, p.y, jp.x, jp.y) < 900) { this.comms.push({ from: "GATE", text: `ARRIVAL FROM ${g.world.systems[jp.targetSystemId].name.toUpperCase()}`, life: 5, color: PAL.greyDark }); sfx.gateCrack(); }
      } else {
        // departure: the trader nearest a gate lights out
        const t = this.npcs.filter((n) => n.kind === "trader" && !n.tag && !n.disabled && !n.casualties && n !== this.towing && n !== this.sos?.trader).sort((a, b) => dist(a.x, a.y, jp.x, jp.y) - dist(b.x, b.y, jp.x, jp.y))[0];
        if (t && dist(t.x, t.y, jp.x, jp.y) < 700) { boom(this, t.x, t.y, 10, PAL.info); this.npcs = this.npcs.filter((n) => n !== t); if (dist(p.x, p.y, t.x, t.y) < 900) this.comms.push({ from: "GATE", text: `DEPARTURE TO ${g.world.systems[jp.targetSystemId].name.toUpperCase()}`, life: 5, color: PAL.greyDark }); }
      }
      if (this.comms.length > 5) this.comms.shift();
    }
  }

  // ---------- Encounters ----------
  encounterTimer = 90;
  updateEncounters(g: Game, dt: number): void {
    const p = g.world.player;
    if ((p.tutorial ?? -1) >= 0) return;
    this.encounterTimer -= dt;
    if (this.encounterTimer > 0) return;
    this.encounterTimer = 110 + Math.random() * 90;
    if (this.cruise || this.autopilot) return;
    if (this.npcs.some((n) => n.kind === "pirate" && n.hull > 0 && dist(n.x, n.y, p.x, p.y) < 500)) return;
    const rng = new RNG((g.world.seed ^ Math.floor(g.world.time)) >>> 0);
    const enc = pickEncounter(g, "space", rng);
    if (!enc) return;
    sfx.thrust(false);
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "flight");
  }
  // the campaign's finale: a warship with no faction and one purpose
  spawnHerald(g: Game): void {
    const rng = new RNG((g.world.seed ^ 0x4e4a1d) >>> 0);
    const n = spawnNpc(this, g, "pirate", rng);
    const p = g.world.player;
    const a = rng.range(0, Math.PI * 2);
    n.x = p.x + Math.cos(a) * 380; n.y = p.y + Math.sin(a) * 380;
    n.variant = "captain"; n.name = "THE HERALD"; n.tag = "HERALD";
    n.hullMax = n.hull = 520;
    g.toast("THE HERALD IS HERE");
  }
  // a bounty hunter who took the hard answer
  spawnHunter(g: Game): void {
    const rng = new RNG((g.world.seed ^ Math.floor(g.world.time * 13)) >>> 0);
    const n = spawnNpc(this, g, "pirate", rng);
    const p = g.world.player;
    const a = rng.range(0, Math.PI * 2);
    n.x = p.x + Math.cos(a) * 260; n.y = p.y + Math.sin(a) * 260;
    n.variant = "captain"; n.name = rng.pick(["HUNTER VASK", "MARSHAL OKONKWO", "THE COLLECTOR", "CAPTAIN LIRRA"]);
    n.hullMax = n.hull = 140;
  }

  // ---------- Cruise & autopilot ----------
  cruise = false;
  autopilot = false;
  apAngle = 0; apThrust = false; apBrake = false; apLabel = "";

  massLocked(g: Game): boolean {
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    for (const st of sys.stations) if (dist(p.x, p.y, Math.cos(st.angle) * st.orbit, Math.sin(st.angle) * st.orbit) < 260) return true;
    for (const pl of sys.planets) if (dist(p.x, p.y, Math.cos(pl.angle) * pl.orbit, Math.sin(pl.angle) * pl.orbit) < pl.radius + 200) return true;
    if (Math.hypot(p.x, p.y) < sys.sunRadius + 400) return true;
    return false;
  }

  toggleCruise(g: Game): void {
    if (this.cruise) { this.cruise = false; g.toast("CRUISE DISENGAGED"); sfx.select(); return; }
    if (this.massLocked(g)) { g.toast("MASS LOCKED - GET CLEAR OF STATIONS, WORLDS AND THE STAR"); return; }
    if (g.world.player.fuel < 5) { g.toast("NOT ENOUGH FUEL FOR CRUISE"); return; }
    this.cruise = true;
    g.toast("CRUISE ENGAGED - WEAPONS AND LASERS OFFLINE");
    sfx.jump();
    g.showHint("cruise", "CRUISE (J) CROSSES A SYSTEM FAST; ANYTHING BIG NEARBY DROPS YOU OUT");
  }

  // Autopilot flies to the next gate on your course (or the nearest station),
  // engaging cruise for the long middle and braking at the end.
  apTarget(g: Game): { x: number; y: number; label: string } | null {
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    if (p.navTarget && p.navTarget !== p.systemId) {
      const route = navRoute(g.world, p.systemId, p.navTarget);
      const next = route && route[1];
      const jp = next ? sys.jumpPoints.find((j) => j.targetSystemId === next) : null;
      if (jp) return { x: jp.x, y: jp.y, label: `GATE ${g.world.systems[jp.targetSystemId].name.toUpperCase()}` };
    }
    let best: { x: number; y: number; label: string } | null = null; let bd = Infinity;
    for (const st of sys.stations) {
      const x = Math.cos(st.angle) * st.orbit, y = Math.sin(st.angle) * st.orbit;
      const d = dist(p.x, p.y, x, y);
      if (d < bd) { bd = d; best = { x, y, label: st.name.toUpperCase() }; }
    }
    return best;
  }

  updateAutopilot(g: Game, dt: number): void {
    void dt;
    const inp = g.input;
    if (inp.wasPressed("n")) {
      if (this.autopilot) { this.autopilot = false; g.toast("AUTOPILOT OFF"); }
      else {
        const t = this.apTarget(g);
        if (!t) { g.toast("AUTOPILOT: NOTHING TO FLY TO - PLOT A COURSE ON THE GALAXY MAP"); return; }
        this.autopilot = true; this.apLabel = t.label;
        g.toast(`AUTOPILOT: FLYING TO ${t.label} - TOUCH THE CONTROLS TO TAKE OVER`);
        sfx.select();
      }
    }
    if (!this.autopilot) return;
    if (inp.isDown("w") || inp.isDown("s") || inp.isDown("a") || inp.isDown("d") || inp.isDown("x")) { this.autopilot = false; g.toast("MANUAL CONTROL"); return; }
    const p = g.world.player;
    const t = this.apTarget(g);
    if (!t) { this.autopilot = false; return; }
    this.apLabel = t.label;
    const d = dist(p.x, p.y, t.x, t.y);
    const spd = Math.hypot(p.vx, p.vy);
    const toward = Math.atan2(t.y - p.y, t.x - p.x);
    this.apThrust = false; this.apBrake = false;
    if (d > 140) {
      // point along the desired velocity, correcting for drift
      const wantSpd = Math.min(d > 900 ? 2000 : 180, d * 0.9);
      const dvx = Math.cos(toward) * wantSpd - p.vx, dvy = Math.sin(toward) * wantSpd - p.vy;
      this.apAngle = Math.atan2(dvy, dvx);
      this.apThrust = Math.hypot(dvx, dvy) > 12 && Math.abs(angDiff(p.angle, this.apAngle)) < 0.5;
      if (d > 900 && !this.cruise && !this.massLocked(g) && p.fuel > 5 && Math.abs(angDiff(p.angle, toward)) < 0.3) { this.cruise = true; sfx.jump(); }
      if (d < 700 && this.cruise) this.cruise = false;
    } else {
      // arrival: kill velocity
      this.cruise = false;
      if (spd > 6) { this.apAngle = Math.atan2(-p.vy, -p.vx); this.apThrust = Math.abs(angDiff(p.angle, this.apAngle)) < 0.4; }
      else { p.vx = 0; p.vy = 0; this.autopilot = false; g.toast(`AUTOPILOT: ARRIVED AT ${t.label} - PRESS E`); sfx.dock(); }
    }
  }

  // Seismic charges: the only way into a core asteroid.
  charges: { ax: number; ay: number; t: number }[] = [];
  plantCharge(g: Game): void {
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    const a = sys.asteroids.find((x) => x.core && x.ore > 0 && dist(p.x, p.y, x.x, x.y) < 90);
    if (!a) { g.toast("NO CORE ROCK IN REACH - PROSPECT THE BELT FOR MOTHERLODES"); return; }
    if ((p.seismic ?? 0) <= 0) { g.toast("NO SEISMIC CHARGES - SHIPYARDS SELL THEM"); return; }
    if (this.charges.some((c) => c.ax === a.x && c.ay === a.y)) return;
    p.seismic = (p.seismic ?? 0) - 1;
    this.charges.push({ ax: a.x, ay: a.y, t: 4 });
    g.toast("CHARGE PLANTED - GET CLEAR");
    sfx.select();
  }
  updateCharges(g: Game, dt: number): void {
    if (!this.charges.length) return;
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    for (const c of this.charges) {
      c.t -= dt;
      if (c.t > 0) continue;
      const a = sys.asteroids.find((x) => x.x === c.ax && x.y === c.ay);
      boom(this, c.ax, c.ay, 36, PAL.gold);
      sfx.boom(true);
      if (a) {
        a.ore = 0;
        const ore = 6 + Math.floor(Math.random() * 4), metals = 2 + Math.floor(Math.random() * 3);
        this.loot.push({ x: a.x, y: a.y, commodityId: "ore", qty: ore, life: 90 });
        this.loot.push({ x: a.x + 14, y: a.y - 8, commodityId: "metals", qty: metals, life: 90 });
        if (Math.random() < 0.3) this.loot.push({ x: a.x - 12, y: a.y + 10, commodityId: "relics", qty: 1, life: 90 });
        p.mined = (p.mined ?? 0) + ore;
        gainMaterials(g, { vanadium: 1 + Math.floor(Math.random() * 2), polonium: Math.random() < 0.4 ? 1 : 0, germanium: Math.random() < 0.5 ? 1 : 0 });
        flag(g, "coreCutter");
      }
      if (dist(p.x, p.y, c.ax, c.ay) < 120) { damagePlayer(this, g, 28); this.hitFlash = 0.4; }
    }
    this.charges = this.charges.filter((c) => c.t > 0);
  }

  // Heat: stars cook you; a fuel scoop turns the corona into fuel.
  scooping = false;
  updateHeat(g: Game, dt: number): void {
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    p.heat ??= 0;
    const d = Math.hypot(p.x, p.y) - sys.sunRadius;
    const flare = galaxyEventAt(g.world, sys.id)?.kind === "flare";
    const scoopZone = d < 200;
    const hot = d < (flare ? 900 : 320);
    if (flare) p.heat += dt * 4;
    this.scooping = false;
    if (hot) p.heat += dt * 26 * (1 - Math.max(0, d) / 320);
    if (scoopZone && hasModule(p, "scoop") && p.fuel < p.fuelMax) {
      this.scooping = true;
      p.fuel = Math.min(p.fuelMax, p.fuel + dt * 7 * (1 + 0.3 * engGrade(p, "scoop")));
      p.heat += dt * 10;
      if (!p.flags?.scooped) { flag(g, "scooped"); g.showHint("scoop", "SCOOPING - THE HEAT BAR IS YOUR CLOCK"); }
    } else if (scoopZone && !hasModule(p, "scoop") && !p.hints?.["noscoop"]) {
      g.showHint("noscoop", "TOO CLOSE TO THE STAR - A FUEL SCOOP WOULD TURN THIS INTO FUEL");
    }
    p.heat = Math.max(0, p.heat - dt * (hasModule(p, "radiators") ? 24 : 12) * (1 + 0.25 * engGrade(p, "vents")) * (hasSpecialty(p, "coolant") ? 1.33 : 1));
    if (p.heat > 100) {
      p.heat = Math.min(140, p.heat);
      p.hull -= dt * 5;
      if (Math.random() < dt * 2) { this.scanMsg = "OVERHEATING - HULL TAKING DAMAGE"; this.scanTimer = 1; sfx.hit(); }
      if (p.hull <= 0) { p.hull = 0; this.destroyed(g); }
    }
  }

  tryInteract(g: Game): void {
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    // a ship that needs a hand
    const needy = this.npcs.find((n) => n.kind === "trader" && n.hull > 0 && dist(p.x, p.y, n.x, n.y) < 80 && (n.disabled || n.casualties || n.hull < n.hullMax * 0.5));
    if (needy && !this.repairJob) { this.offerHelp(g, needy); return; }
    for (const st of sys.stations) {
      const sx = Math.cos(st.angle) * st.orbit;
      const sy = Math.sin(st.angle) * st.orbit;
      if (dist(p.x, p.y, sx, sy) < 110) { this.dockAt(g, st); return; } // the glide covers the rest
    }
    for (const jp of sys.jumpPoints) {
      if (dist(p.x, p.y, jp.x, jp.y) < 70) { this.doJump(g, jp.targetSystemId, jp.guarded); return; }
    }
    for (const wd of wondersIn(g.world, sys.id)) {
      if (wd.kind !== "ark" || dist(p.x, p.y, wd.x, wd.y) > 160) continue;
      let wk = sys.wrecks.find((x) => x.id === `ark-${wd.id}`);
      if (!wk) { wk = { id: `ark-${wd.id}`, x: wd.x, y: wd.y, looted: false, loot: [{ id: "relics", qty: 3 }, { id: "data", qty: 2 }, { id: "parts", qty: 2 }], hazard: 0.2, name: wd.name }; sys.wrecks.push(wk); }
      if (wk.looted) { g.toast(`${wd.name.toUpperCase()}: YOU'VE WALKED ITS CORRIDORS ALREADY. IT TURNS ON, SLOWLY, WITHOUT YOU.`); return; }
      p.vx = 0; p.vy = 0; g.wreckTarget = wk; g.setScene("wreck"); return;
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
        gainMaterials(g, { polonium: 1, germanium: Math.random() < 0.6 ? 1 : 0 });
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
    // your lighthouse: tend it
    const inf = infraAt(g.world, sys.id).find((i) => dist(p.x, p.y, i.x, i.y) < 90);
    if (inf) { this.tendInfra(g, inf); return; }
    // a dead system and a kit aboard: build
    const kit = (["beacon", "depot"] as const).find((k) => ((p.kits ?? {})[k] ?? 0) > 0);
    if (kit && !canBuildInfra(g.world, sys.id)) {
      if (dist(p.x, p.y, 0, 0) < 500) { g.toast("TOO CLOSE TO THE STAR TO PLANT ANYTHING - FLY OUT PAST 500M"); return; }
      if (confirmBox(`PLANT THE ${INFRA_KITS[kit].name.toUpperCase()} HERE, IN ${sys.name.toUpperCase()}?\n\n${INFRA_KITS[kit].desc}`)) {
        const r = buildInfra(g.world, kit, p.x, p.y, wire.getCallsign() ?? "YOU");
        if (typeof r === "string") g.toast(r);
        else { g.toast(`${INFRA_KITS[kit].name.toUpperCase()} DEPLOYED. ${sys.name.toUpperCase()} IS ON THE CHARTS NOW.`); logEntry(g.world, `Planted a ${kit} in ${sys.name}`); flag(g, "lighthouse"); sfx.repair(); void wire.post("discover", `lit a ${kit} in ${sys.name}`, sys.name); if (g.world.realGalaxy) void wire.postLight(sys.name, kit, false); populate(this, g); }
      }
      return;
    }
    g.toast("NOTHING IN RANGE");
  }

  doJump(g: Game, targetId: string, guarded: boolean): void {
    const p = g.world.player;
    const cost = this.jumpCost(g, targetId);
    if (p.fuel < cost) { g.toast(`NEED ${cost} FUEL TO JUMP`); return; }
    const denied = permitDenied(g.world, targetId);
    if (denied) { g.toast(`${g.world.systems[targetId].name.toUpperCase()} IS PERMIT SPACE - ALLIED STANDING WITH ${factionDef(denied).name.toUpperCase()} REQUIRED`); sfx.alarm(); return; }
    const facId = g.world.systems[p.systemId].factionId;
    if (this.convoy) this.settleConvoy(g);
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
    p.jumpStreak = (p.jumpStreak ?? 0) + 1;
    jumpWear(p);
    { const up = crewXp(p, "pilot"); if (up) g.toast(up); }
    sfx.jump();
    if (this.towing) { this.towing = null; g.toast("THE TOW LINE DOESN'T SURVIVE THE JUMP"); }
    const fromId = p.systemId;
    p.systemId = targetId;
    const tsys = g.world.systems[targetId];
    this.dockTimer = 0;
    if (tsys.permit) flag(g, "permit");
    {
      const fss = hasModule(p, "fss") || !!hull(p.hullId).scanner;
      const gained = logSystem(p, tsys, fss ? 2 : 1);
      if (fss) for (const an of tsys.anomalies) an.discovered = true;
      if (gained) { this.arrivalLog = `${fss ? "DISCOVERY SCANNER" : "NAV LOG"}: ${tsys.name.toUpperCase()} LOGGED +${gained} EXPLORATION DATA`; this.arrivalTimer = 6; }
      void this.claimFirst(g, tsys);
    }
    const use = tsys.jumpPoints.find((j) => j.targetSystemId === fromId) ?? tsys.jumpPoints[0];
    if (use) { p.x = use.x + 60; p.y = use.y + 60; } else { p.x = 0; p.y = -800; }
    p.vx = 0; p.vy = 0;
    this.bullets = [];
    this.npcs = [];
    this.loot = [];
    this.torps = [];
    this.comms = [];
    this.escort = null;
    this.pursuitTimer = 0;
    populate(this, g);
    this.spawnDrifters(g);
    this.launchDrones(g);
    this.startEscortIfNeeded(g);
    g.autosave();
    g.toast(`JUMPED TO ${tsys.name.toUpperCase()}`);
    g.showHint("jump", "PRESS G FOR THE GALAXY MAP - CLICK A SYSTEM TWICE TO PLOT A COURSE");
  }

  destroyed(g: Game): void {
    const p = g.world.player;
    if (g.world.hardcore) {
      // cold void: no beacon, no second chance
      boom(this, p.x, p.y, 40, PAL.thrust);
      void wire.post("hull", `was lost with all hands in ${g.world.systems[p.systemId].name} (hardcore)`, g.world.systems[p.systemId].name);
      if (g.world.realGalaxy) void wire.postLight(g.world.systems[p.systemId].name, "wreck", false); // a memorial on the chart for whoever passes
      g.eraseSave();
      g.setScene("title");
      g.toast("SHIP LOST WITH ALL HANDS. THE VOID KEEPS WHAT IT TAKES.");
      return;
    }
    g.toast("SHIP DESTROYED - EMERGENCY BEACON RECOVERED YOU");
    boom(this, p.x, p.y, 30, PAL.thrust);
    p.hull = Math.round(p.hullMax * 0.5);
    p.shield = 0;
    p.fuel = Math.max(20, p.fuel * 0.5);
    p.credits = Math.round(p.credits * 0.85);
    for (const s of p.systems) s.health = Math.max(30, s.health);
    let lostCrew: { name: string; role: string } | null = null;
    if (p.crew && p.crew.length && Math.random() < 0.5) {
      const lost = p.crew.splice(Math.floor(Math.random() * p.crew.length), 1)[0];
      lostCrew = { name: lost.name, role: lost.role };
      g.toast(`${lost.name.toUpperCase()} DIDN'T MAKE IT TO THE POD`);
    }
    leaveWreck(g.world, p.x, p.y, lostCrew); // takes half the hold with it
    p.cargo = {};
    const sys = g.world.systems[p.systemId];
    if (g.world.realGalaxy) void wire.postLight(sys.name, "wreck", false);
    const st = sys.stations[0];
    if (st) { p.dockedAt = st.id; g.setScene("station"); }
    else { p.x = 0; p.y = -600; p.vx = 0; p.vy = 0; }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    drawFlight(this, g, ctx);
  }
}
