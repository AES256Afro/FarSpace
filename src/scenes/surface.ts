// Groundside: drive a rover across a region of a world. Outcrops give
// materials, flora gives exploration data, geysers and hazards cost integrity,
// and the region's sites are doors into the outpost / city / ruin scenes.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { clamp } from "../core/mathx";
import { sfx } from "../core/sfx";
import { music } from "../core/music";
import { pickEncounter } from "../data/encounters";
import type { EncounterScene } from "./encounter";
import { RNG } from "../core/rng";
import * as wire from "../core/wire";
import { flag } from "../core/achievements";
import { gainMaterials } from "../core/materials";
import { GW, GH, GT, WATER, PLAIN, HILLS, MOUNTAIN, HAZARD, SAND, BIOMES, genGround, groundKey, passable, GroundMap, GroundNode } from "../ground";
import { adjustRep, addCargo, groundProgress, GroundState, HOMESTEAD_PRICE, homesteadYield, settleHomestead } from "../world";
import { commodity } from "../data/data";
import { engGrade } from "../data/engineering";
import { faction } from "../data/data";

const COLORS: Record<number, { water: string; plain: string; plain2: string; hills: string; mountain: string; hazard: string; sand: string }> = {
  0: { water: "#1f4f8c", plain: "#3f7a4a", plain2: "#38703f", hills: "#6b7a4a", mountain: "#9aa5bd", hazard: "#000", sand: "#c9b77a" },
  1: { water: "#3a6ea5", plain: "#c08a4a", plain2: "#b37e40", hills: "#8a5a30", mountain: "#5a3a20", hazard: "#000", sand: "#e0b070" },
  2: { water: "#2a6aa5", plain: "#3aa55e", plain2: "#329450", hills: "#2d7a44", mountain: "#8a93ab", hazard: "#000", sand: "#c9c07a" },
  3: { water: "#5a3aa5", plain: "#7a5aa5", plain2: "#6d4f96", hills: "#9a74c7", mountain: "#d0c8e8", hazard: "#e060ff", sand: "#b28fe0" },
  4: { water: "#5a2a2a", plain: "#4a3030", plain2: "#402a2a", hills: "#6a4040", mountain: "#2a1a1a", hazard: "#ff6a2a", sand: "#7a5050" },
  5: { water: "#3a5a8c", plain: "#d0d8e8", plain2: "#c4cde0", hills: "#a8b2c8", mountain: "#e8eef8", hazard: "#1a2a4a", sand: "#e4eaf4" },
  6: { water: "#a08040", plain: "#c7a54a", plain2: "#ba9a44", hills: "#e0c063", mountain: "#fff0c0", hazard: "#6a5020", sand: "#d8b860" },
  7: { water: "#2a5a6a", plain: "#4a7c8c", plain2: "#437280", hills: "#5a97a8", mountain: "#8ed0e0", hazard: "#1a3040", sand: "#6fb3c4" },
};

export class SurfaceScene implements Scene {
  touchMode = "walk" as const;
  map!: GroundMap;
  state!: GroundState;
  px = 0; py = 0; // rover, pixels
  vx = 0; vy = 0;
  facing = 0;
  seen = new Uint8Array(GW * GH);
  power = 100;
  integrity = 100;
  scan = 0;
  scanTarget: GroundNode | null = null;
  msg = ""; msgTimer = 0;
  storm = 0; stormTimer = 0;
  regionName = ""; planetName = ""; biome = 0;
  hurtCd = 0;
  encounterTimer = 60;
  mini: HTMLCanvasElement | null = null; // cached minimap, redrawn a few times a second
  miniAt = 0;

  enter(g: Game): void {
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    const pl = sys.planets[g.orbitPlanetIdx];
    const surf = pl.surface!;
    const ridx = g.landedRegionIdx;
    const region = surf.regions[ridx];
    if (!region) { g.setScene("orbit"); return; }
    const key = groundKey(sys.id, g.orbitPlanetIdx, ridx);
    if (!this.map || this.map.key !== key) {
      this.map = genGround(key, pl.palette, surf.pois.filter((x) => x.regionIdx === ridx), region.resource);
      this.seen = new Uint8Array(GW * GH);
      this.mini = null;
      this.power = 100; this.integrity = 100;
      this.storm = 0; this.stormTimer = 45 + Math.random() * 60;
      this.px = this.map.lander.x * GT + GT / 2 + 12; this.py = this.map.lander.y * GT + GT / 2;
    }
    p.ground ??= {};
    this.state = p.ground[key] ??= { taken: [], charted: false, scanned: [] };
    this.regionName = region.name; this.planetName = pl.name; this.biome = pl.palette;
    this.vx = 0; this.vy = 0;
    if (g.surfaceFresh) {
      g.surfaceFresh = false;
      this.say(`TOUCHDOWN: ${region.name.toUpperCase()}, ${pl.name.toUpperCase()} - ${BIOMES[this.biome % BIOMES.length].name}`);
      sfx.dock();
      if (!this.state.charted) {
        this.state.charted = true;
        p.discoveries += 1;
        p.expData = (p.expData ?? 0) + 80;
        g.toast("REGION CHARTED +80 EXPLORATION DATA");
        flag(g, "groundside");
        p.codex ??= {};
        const bk = `biome:${BIOMES[this.biome % BIOMES.length].name}`;
        if (!p.codex[bk]) { p.codex[bk] = 0; p.expData = (p.expData ?? 0) + 120; g.toast(`NEW BIOME IN THE CODEX: ${BIOMES[this.biome % BIOMES.length].name} +120 DATA`); }
        p.codex[bk]++;
        const charted = Object.values(p.ground).filter((s) => s.charted).length;
        if (charted >= 5) flag(g, "surveyor5");
        if (charted === 1) void wire.post("discovery", `set a rover down on ${pl.name}, ${region.name}`, sys.name);
        if (region.factionId) adjustRep(g.world, region.factionId, 1);
      }
      g.showHint("rover", "WASD DRIVE - E TAKE/ENTER - HOLD V SCAN FLORA - RETURN TO THE LANDER TO RECHARGE OR LIFT OFF");
    }
    g.surfaceReturn = true;
    // encounter outcomes that hurt the rover say so in their text
    const enc = g.scenes["encounter"] as EncounterScene | undefined;
    const out = enc?.outcome ?? "";
    if (enc && enc.returnTo === "surface" && out) {
      const m = out.match(/ROVER INTEGRITY -(\d+)/);
      if (m) { this.integrity = Math.max(1, this.integrity - Number(m[1])); sfx.hit(); }
      enc.outcome = null;
    }
  }

  say(m: string): void { this.msg = m; this.msgTimer = 4; }

  tile(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= GW || ty >= GH) return MOUNTAIN;
    return this.map.tiles[ty * GW + tx];
  }

  nodeIdxAt(tx: number, ty: number, r = 1): number {
    return this.map.nodes.findIndex((n, i) => !this.state.taken.includes(i) && Math.abs(n.x - tx) <= r && Math.abs(n.y - ty) <= r);
  }

  leave(g: Game): void {
    g.surfaceReturn = false;
    sfx.rover(false);
    g.setScene("orbit");
  }

  update(g: Game, dt: number): void {
    const inp = g.input;
    const p = g.world.player;
    if (inp.wasPressed("Escape")) { this.say("LIFT-OFF IS FROM THE LANDER (E BESIDE IT)"); }
    const tx = Math.floor(this.px / GT), ty = Math.floor(this.py / GT);
    const here = this.tile(tx, ty);
    // drive
    let ax = 0, ay = 0;
    if (inp.isDown("w")) ay -= 1;
    if (inp.isDown("s")) ay += 1;
    if (inp.isDown("a")) ax -= 1;
    if (inp.isDown("d")) ax += 1;
    const powered = this.power > 0;
    const top = (here === HILLS ? 50 : here === SAND ? 70 : 95) * (powered ? 1 : 0.35) * (this.storm > 0 ? 0.7 : 1) * (1 + 0.12 * engGrade(p, "rover"));
    sfx.rover(!!(ax || ay) && powered);
    if (ax || ay) {
      this.encounterTimer -= dt;
      if (this.encounterTimer <= 0) {
        this.encounterTimer = 75 + Math.random() * 60;
        const enc = pickEncounter(g, "ground", new RNG((g.world.seed ^ Math.floor(g.world.time)) >>> 0));
        if (enc) { sfx.rover(false); this.vx = 0; this.vy = 0; (g.scenes["encounter"] as EncounterScene).open(g, enc, "surface"); return; }
      }
    }
    music.setMood(this.storm > 0 ? "storm" : this.biome === 1 ? "desert" : this.biome === 5 ? "ice" : this.biome === 4 ? "volcanic" : "ground", 0);
    if (ax || ay) {
      const l = Math.hypot(ax, ay); ax /= l; ay /= l;
      this.vx += ax * 320 * dt; this.vy += ay * 320 * dt;
      this.facing = Math.atan2(ay, ax);
      this.power = Math.max(0, this.power - dt * (this.storm > 0 ? 0.7 : 0.35) * (1 - 0.2 * engGrade(p, "battery")));
    } else { this.vx *= Math.pow(0.02, dt); this.vy *= Math.pow(0.02, dt); }
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > top) { this.vx *= top / spd; this.vy *= top / spd; }
    const tryMove = (nx: number, ny: number): boolean => {
      const c = [[-3, -3], [3, -3], [-3, 3], [3, 3]];
      return c.every(([ox, oy]) => passable(this.tile(Math.floor((nx + ox) / GT), Math.floor((ny + oy) / GT))));
    };
    const nx = this.px + this.vx * dt, ny = this.py + this.vy * dt;
    if (tryMove(nx, this.py)) this.px = nx; else this.vx = 0;
    if (tryMove(this.px, ny)) this.py = ny; else this.vy = 0;
    // reveal
    for (let y = -6; y <= 6; y++) for (let x = -8; x <= 8; x++) {
      const sx = tx + x, sy = ty + y;
      if (sx >= 0 && sy >= 0 && sx < GW && sy < GH && x * x + y * y <= 50) this.seen[sy * GW + sx] = 1;
    }
    // hazards
    this.hurtCd -= dt;
    const nearHazard = [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]].some(([ox, oy]) => this.tile(tx + ox, ty + oy) === HAZARD);
    const gi = this.map.nodes.findIndex((n) => n.kind === "geyser" && Math.abs(n.x - tx) <= 1 && Math.abs(n.y - ty) <= 1);
    if ((nearHazard || gi >= 0) && this.hurtCd <= 0) {
      this.hurtCd = 0.6;
      this.integrity = Math.max(0, this.integrity - (gi >= 0 ? 6 : 4));
      this.say(gi >= 0 ? "GEYSER BLAST - ROVER INTEGRITY FALLING" : `${BIOMES[this.biome % BIOMES.length].hazardName || "HAZARD"} - BACK OFF`);
      sfx.hit();
    }
    if (this.integrity <= 0) {
      g.toast("ROVER WRECKED - EMERGENCY RECOVERY TO ORBIT. HULL SCUFFED.");
      p.hull = Math.max(1, p.hull - 10);
      this.integrity = 60; this.power = 60;
      this.px = this.map.lander.x * GT + GT / 2 + 12; this.py = this.map.lander.y * GT + GT / 2;
      this.leave(g);
      return;
    }
    // storms
    this.stormTimer -= dt;
    if (this.stormTimer <= 0) {
      if (this.storm > 0) { this.storm = 0; this.stormTimer = 60 + Math.random() * 90; this.say("STORM PASSING"); }
      else { this.storm = 1; this.stormTimer = 12 + Math.random() * 10; this.say(this.biome === 1 ? "SANDSTORM - VISIBILITY DROPPING" : this.biome === 5 ? "WHITEOUT - VISIBILITY DROPPING" : "STORM FRONT - VISIBILITY DROPPING"); sfx.alarm(); }
    }
    // lander
    const nearLander = Math.hypot(this.px - (this.map.lander.x * GT + GT / 2), this.py - (this.map.lander.y * GT + GT / 2)) < 22;
    const home = (p.homesteads ?? []).find((h) => h.key === this.map.key);
    if (nearLander) {
      this.power = Math.min(100, this.power + dt * (home ? 30 : 12));
      if (home && this.integrity < 100) this.integrity = Math.min(100, this.integrity + dt * 4);
      if (inp.wasPressed("h")) {
        if (home) {
          settleHomestead(home, g.world.time);
          const n = Math.floor(home.stock);
          if (n <= 0) this.say("THE CLAIM HAS NOTHING STOCKPILED YET. COME BACK LATER.");
          else if (addCargo(p, home.resource, n)) { home.stock -= n; this.say(`COLLECTED ${n} ${commodity(home.resource).name.toUpperCase()} FROM THE CLAIM`); sfx.pickup(); p.mined = (p.mined ?? 0) + n; }
          else this.say("CARGO FULL");
        } else if (!this.state.charted) this.say("CHART THE REGION FIRST");
        else if ((p.homesteads ?? []).length >= 3) this.say("THREE CLAIMS IS THE LEGAL LIMIT");
        else if (p.credits < HOMESTEAD_PRICE) this.say(`A CLAIM COSTS ${HOMESTEAD_PRICE}CR`);
        else {
          p.credits -= HOMESTEAD_PRICE;
          const sys = g.world.systems[p.systemId];
          const region = sys.planets[g.orbitPlanetIdx].surface!.regions[g.landedRegionIdx];
          (p.homesteads ??= []).push({ key: this.map.key, systemId: sys.id, planetIdx: g.orbitPlanetIdx, regionIdx: g.landedRegionIdx, resource: region.resource, stock: 0, lastT: g.world.time, name: `${region.name} Claim` });
          this.say(`CLAIM STAKED: ${region.name.toUpperCase()} WORKS ${commodity(region.resource).name.toUpperCase()} WHILE YOU'RE AWAY`);
          flag(g, "homesteader");
          sfx.dock();
          void wire.post("discovery", `staked a claim on ${sys.planets[g.orbitPlanetIdx].name}, ${region.name}`, sys.name);
        }
      }
      if (this.integrity < 100 && (p.cargo["parts"] ?? 0) > 0 && inp.wasPressed("r")) { p.cargo["parts"]--; this.integrity = Math.min(100, this.integrity + 40); this.say("ROVER PATCHED (-1 SPARE PARTS)"); sfx.repair(); }
      if (inp.wasPressed("e")) { this.leave(g); return; }
    }
    // interactions
    const ni = this.nodeIdxAt(tx, ty);
    const node = ni >= 0 ? this.map.nodes[ni] : null;
    const ent = this.map.entrances.find((e) => Math.abs(e.x - tx) <= 1 && Math.abs(e.y - ty) <= 1);
    if (inp.wasPressed("e") && !nearLander) {
      if (ent) {
        if (ent.kind === "defense") this.say("MILITARY SITE - THE GATE STAYS SHUT");
        else {
          g.landedPoiId = ent.poiId;
          sfx.rover(false);
          sfx.select();
          g.setScene(ent.kind === "city" ? "city" : ent.kind === "ruin" ? "ruin" : "outpost");
          return;
        }
      } else if (node) this.take(g, ni, node);
    }
    // flora scan: hold V
    if (node && node.kind === "flora" && inp.isDown("v")) {
      this.scanTarget = node;
      this.scan = Math.min(1, this.scan + dt * 0.5);
      if (this.scan >= 1) {
        this.scan = 0;
        this.state.taken.push(ni);
        this.state.scanned.push(ni);
        p.codex ??= {};
        const sk = `flora:${node.label}`;
        const first = !p.codex[sk];
        p.codex[sk] = (p.codex[sk] ?? 0) + 1;
        p.expData = (p.expData ?? 0) + (first ? 120 : 45);
        p.discoveries += 1;
        gainMaterials(g, { carbon: 1 + Math.floor(Math.random() * 2) });
        g.toast(first ? `NEW SPECIES: ${node.label} +120 EXPLORATION DATA` : `${node.label} LOGGED +45 EXPLORATION DATA`);
        this.contract(g, "flora");
        flag(g, "exobio");
        sfx.pickup();
      }
    } else { this.scan = 0; this.scanTarget = null; }
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.msg = ""; }
    if (this.map.nodes.every((_, i) => this.state.taken.includes(i) || this.map.nodes[i].kind === "geyser") && !this.state.taken.includes(-1)) {
      this.state.taken.push(-1); // sentinel: region fully worked
      p.expData = (p.expData ?? 0) + 150;
      g.toast("REGION FULLY SURVEYED +150 EXPLORATION DATA");
      sfx.pickup();
    }
  }

  contract(g: Game, goal: "flora" | "probe" | "outcrop"): void {
    const m = groundProgress(g.world, g.orbitPlanetIdx, goal);
    if (!m) return;
    const done = (m.groundDone ?? 0) >= (m.groundNeed ?? 1);
    this.say(done ? `CONTRACT COMPLETE: ${m.title.toUpperCase()} - REPORT BACK` : `CONTRACT: ${m.groundDone}/${m.groundNeed} - ${m.title.toUpperCase()}`);
  }

  take(g: Game, i: number, node: GroundNode): void {
    const p = g.world.player;
    switch (node.kind) {
      case "outcrop":
        this.state.taken.push(i);
        gainMaterials(g, { [node.material!]: 2 + Math.floor(Math.random() * 3) });
        sfx.mine();
        this.contract(g, "outcrop");
        break;
      case "flora":
        this.say("HOLD V TO SCAN IT - DON'T PICK IT");
        break;
      case "geyser":
        this.say("IT'S A GEYSER. NO.");
        break;
      case "probe":
        this.state.taken.push(i);
        if (addCargo(p, "data", 1)) g.toast("+1 DATA CORES FROM THE PROBE"); else g.toast("CARGO FULL - PROBE CORE LEFT BEHIND");
        p.expData = (p.expData ?? 0) + 30;
        sfx.pickup();
        this.contract(g, "probe");
        break;
      case "wreck":
        this.state.taken.push(i);
        if (addCargo(p, "parts", 2)) g.toast("+2 SPARE PARTS STRIPPED FROM THE WRECK"); else g.toast("CARGO FULL");
        gainMaterials(g, { iron: 2, nickel: 1 });
        sfx.repair();
        break;
      case "cache": {
        this.state.taken.push(i);
        const res = node.label.split(" ")[0].toLowerCase();
        if (addCargo(p, res, 3)) g.toast(`+3 ${res.toUpperCase()} FROM THE CACHE`); else g.toast("CARGO FULL");
        sfx.pickup();
        break;
      }
    }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    const c = COLORS[this.biome % 8];
    const camX = clamp(this.px - VW / 2, 0, GW * GT - VW), camY = clamp(this.py - VH / 2 + 10, 0, GH * GT - VH + 22);
    ctx.fillStyle = c.mountain; ctx.fillRect(0, 0, VW, VH);
    const x0 = Math.floor(camX / GT), y0 = Math.floor(camY / GT);
    const tx = Math.floor(this.px / GT), ty = Math.floor(this.py / GT);
    for (let y = y0; y <= y0 + VH / GT + 1; y++) for (let x = x0; x <= x0 + VW / GT + 1; x++) {
      if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
      const t = this.map.tiles[y * GW + x];
      const sx = Math.round(x * GT - camX), sy = Math.round(y * GT - camY);
      const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      let col = t === WATER ? c.water : t === PLAIN ? ((h & 3) === 0 ? c.plain2 : c.plain) : t === HILLS ? c.hills : t === SAND ? c.sand : t === HAZARD ? c.hazard : c.mountain;
      if (t === HAZARD && this.biome === 4) col = (Math.floor(g.world.time * 3 + x + y) % 2 === 0) ? "#ff6a2a" : "#ff9a3a";
      ctx.fillStyle = col;
      ctx.fillRect(sx, sy, GT, GT);
      if (t === HILLS && (h & 7) === 0) { ctx.fillStyle = c.mountain; ctx.fillRect(sx + 3, sy + 2, 2, 1); }
      if (t === PLAIN && (h & 15) === 1) { ctx.fillStyle = c.hills; ctx.fillRect(sx + (h >> 4 & 3), sy + 2 + (h >> 6 & 3), 1, 2); ctx.fillRect(sx + 4 + (h >> 8 & 3), sy + 1 + (h >> 10 & 3), 1, 2); }
      if (t === PLAIN && (h & 31) === 2) { ctx.fillStyle = c.mountain; ctx.fillRect(sx + 2 + (h >> 5 & 3), sy + 3 + (h >> 7 & 3), 2, 1); }
      if (t === SAND && (h & 7) === 3) { ctx.fillStyle = c.plain2; ctx.fillRect(sx + (h >> 3 & 7), sy + (h >> 6 & 7), 1, 1); }
      if (t === MOUNTAIN) {
        const below = this.tile(x, y + 1);
        if (below !== MOUNTAIN) { ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(sx, sy + GT - 2, GT, 2); }
        if ((h & 7) === 0) { ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(sx + 1 + (h >> 3 & 3), sy + 1 + (h >> 5 & 3), 2, 1); }
      }
      if (t === WATER && ((h + Math.floor(g.world.time)) & 15) === 0) { ctx.fillStyle = "#ffffff"; ctx.globalAlpha = 0.25; ctx.fillRect(sx + 2, sy + 4, 3, 1); ctx.globalAlpha = 1; }
      if (!this.seen[y * GW + x]) { ctx.fillStyle = "#05060a"; ctx.globalAlpha = 0.82; ctx.fillRect(sx, sy, GT, GT); ctx.globalAlpha = 1; }
    }
    // lander
    {
      const lx = Math.round(this.map.lander.x * GT + GT / 2 - camX), ly = Math.round(this.map.lander.y * GT + GT / 2 - camY);
      ctx.fillStyle = PAL.hullDark; ctx.fillRect(lx - 7, ly - 4, 14, 8);
      ctx.fillStyle = PAL.hull; ctx.fillRect(lx - 5, ly - 6, 10, 4);
      ctx.fillStyle = PAL.ui; ctx.fillRect(lx - 1, ly - 7, 2, 1);
      drawText(ctx, "LANDER", lx - 12, ly - 15, PAL.grey);
      if ((g.world.player.homesteads ?? []).some((h) => h.key === this.map.key)) {
        ctx.fillStyle = "#3a4468"; ctx.fillRect(lx + 12, ly - 8, 16, 12);
        ctx.fillStyle = PAL.hull; ctx.fillRect(lx + 14, ly - 6, 12, 8);
        ctx.fillStyle = PAL.gold; ctx.fillRect(lx + 19, ly - 10, 2, 2);
        ctx.fillStyle = PAL.ui; ctx.fillRect(lx + 16, ly - 3, 2, 2);
        drawText(ctx, "CLAIM", lx + 32, ly - 8, PAL.gold);
      }
    }
    // entrances
    for (const e of this.map.entrances) {
      if (!this.seen[e.y * GW + e.x]) continue;
      const ex = Math.round(e.x * GT + GT / 2 - camX), ey = Math.round(e.y * GT + GT / 2 - camY);
      const col = e.kind === "city" ? PAL.info : e.kind === "ruin" ? PAL.warn : e.kind === "defense" ? PAL.danger : e.kind === "mine" ? PAL.gold : PAL.ui;
      ctx.fillStyle = "#1a2030"; ctx.fillRect(ex - 6, ey - 5, 12, 10);
      ctx.fillStyle = col; ctx.fillRect(ex - 4, ey - 3, 8, 6);
      ctx.fillStyle = "#1a2030"; ctx.fillRect(ex - 1, ey, 2, 3);
      if (Math.hypot(e.x - tx, e.y - ty) < 10) drawText(ctx, `${e.kind.toUpperCase()}: ${e.name.toUpperCase()}`.slice(0, 30), ex - 30, ey - 14, col);
    }
    // nodes
    this.map.nodes.forEach((n, i) => {
      if (this.state.taken.includes(i) || !this.seen[n.y * GW + n.x]) return;
      const nx = Math.round(n.x * GT + GT / 2 - camX), ny = Math.round(n.y * GT + GT / 2 - camY);
      switch (n.kind) {
        case "outcrop": ctx.fillStyle = "#c8ccd8"; ctx.fillRect(nx - 3, ny - 2, 6, 4); ctx.fillStyle = PAL.gold; ctx.fillRect(nx - 1, ny - 3, 2, 2); break;
        case "flora": ctx.fillStyle = this.biome === 3 ? "#e060ff" : "#63f2c8"; ctx.fillRect(nx - 1, ny - 4, 2, 6); ctx.fillRect(nx - 3, ny - 2, 6, 2); break;
        case "geyser": { const puff = Math.floor(g.world.time * 4 + i) % 4; ctx.fillStyle = "#3a4468"; ctx.fillRect(nx - 3, ny - 1, 6, 3); ctx.fillStyle = "#e8ecff"; ctx.globalAlpha = 0.6; ctx.fillRect(nx - 1, ny - 3 - puff, 2, 2 + puff); ctx.globalAlpha = 1; break; }
        case "probe": ctx.fillStyle = "#8a93ab"; ctx.fillRect(nx - 2, ny - 3, 4, 6); ctx.fillStyle = PAL.danger; if (Math.floor(g.world.time * 2) % 2 === 0) ctx.fillRect(nx - 1, ny - 4, 2, 1); break;
        case "wreck": ctx.fillStyle = "#5d6680"; ctx.fillRect(nx - 4, ny - 2, 8, 4); ctx.fillStyle = "#2a2f3a"; ctx.fillRect(nx - 3, ny + 1, 2, 2); ctx.fillRect(nx + 1, ny + 1, 2, 2); break;
        case "cache": ctx.fillStyle = "#5d6680"; ctx.fillRect(nx - 3, ny - 2, 6, 5); ctx.fillStyle = PAL.gold; ctx.fillRect(nx - 2, ny - 1, 4, 1); break;
      }
    });
    // rover
    {
      const rx = Math.round(this.px - camX), ry = Math.round(this.py - camY);
      ctx.save(); ctx.translate(rx, ry); ctx.rotate(this.facing);
      ctx.fillStyle = "#2a2f3a"; ctx.fillRect(-5, -4, 10, 8);
      ctx.fillStyle = PAL.hull; ctx.fillRect(-4, -3, 8, 6);
      ctx.fillStyle = PAL.ui; ctx.fillRect(2, -1, 2, 2);
      ctx.fillStyle = "#111"; ctx.fillRect(-4, -5, 2, 1); ctx.fillRect(2, -5, 2, 1); ctx.fillRect(-4, 4, 2, 1); ctx.fillRect(2, 4, 2, 1);
      ctx.restore();
      if (this.scan > 0 && this.scanTarget) {
        const sx = Math.round(this.scanTarget.x * GT + GT / 2 - camX), sy = Math.round(this.scanTarget.y * GT + GT / 2 - camY);
        ctx.strokeStyle = PAL.info; ctx.beginPath(); ctx.arc(sx, sy, 4 + this.scan * 10, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = PAL.greyDark; ctx.fillRect(sx - 10, sy - 12, 20, 3); ctx.fillStyle = PAL.info; ctx.fillRect(sx - 10, sy - 12, Math.round(20 * this.scan), 3);
      }
    }
    // night + storm
    const day = (Math.sin(g.world.time * 0.02 + this.biome) + 1) / 2;
    if (day < 0.45) {
      ctx.fillStyle = "#05060a"; ctx.globalAlpha = (0.45 - day) * 1.3;
      ctx.fillRect(0, 0, VW, VH);
      ctx.globalAlpha = 1;
      // headlights
      const rx = Math.round(this.px - camX), ry = Math.round(this.py - camY);
      const grad = ctx.createRadialGradient(rx, ry, 4, rx, ry, 70);
      grad.addColorStop(0, "rgba(255,240,200,0.28)"); grad.addColorStop(1, "rgba(255,240,200,0)");
      ctx.fillStyle = grad; ctx.fillRect(rx - 70, ry - 70, 140, 140);
    }
    if (this.storm > 0) {
      ctx.fillStyle = this.biome === 1 ? "#c08a4a" : this.biome === 5 ? "#e4eaf4" : "#3a4468"; ctx.globalAlpha = 0.45; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1;
      for (let i = 0; i < 40; i++) { const x = ((i * 97 + g.world.time * 400) % VW), y = (i * 53 + g.world.time * 60) % VH; ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(x, y, 3, 1); }
    }
    // minimap (terrain cached; only the rover dot is live)
    {
      const mx = VW - GW - 6, my = 24;
      if (!this.mini || g.world.time - this.miniAt > 0.4) {
        this.miniAt = g.world.time;
        if (!this.mini) { this.mini = document.createElement("canvas"); this.mini.width = GW + 4; this.mini.height = GH + 4; }
        const m = this.mini.getContext("2d")!;
        m.clearRect(0, 0, GW + 4, GH + 4);
        m.fillStyle = "rgba(8,12,22,0.85)"; m.fillRect(0, 0, GW + 4, GH + 4);
        const img = m.createImageData(GW, GH);
        const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
        const cols: Record<number, [number, number, number]> = { [WATER]: hex(c.water), [MOUNTAIN]: hex(c.mountain), [HAZARD]: hex(c.hazard), [HILLS]: hex(c.hills), [PLAIN]: hex(c.plain), [SAND]: hex(c.sand) };
        for (let i = 0; i < GW * GH; i++) {
          if (!this.seen[i]) continue;
          const [r, gg, b] = cols[this.map.tiles[i]] ?? cols[PLAIN];
          img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
        }
        m.putImageData(img, 2, 2);
        for (const e of this.map.entrances) if (this.seen[e.y * GW + e.x]) { m.fillStyle = PAL.info; m.fillRect(2 + e.x - 1, 2 + e.y - 1, 3, 3); }
        m.fillStyle = PAL.gold; m.fillRect(2 + this.map.lander.x - 1, 2 + this.map.lander.y - 1, 3, 3);
      }
      ctx.drawImage(this.mini, mx - 2, my - 2);
      ctx.fillStyle = PAL.white; ctx.fillRect(mx + tx, my + ty, 2, 2);
    }
    // HUD
    ctx.fillStyle = "rgba(8,12,22,0.85)"; ctx.fillRect(0, 0, VW, 20);
    drawText(ctx, `${this.planetName.toUpperCase()} - ${this.regionName.toUpperCase()} - ${BIOMES[this.biome % BIOMES.length].name}`, 6, 4, PAL.white);
    const left = this.map.nodes.filter((n, i) => n.kind !== "geyser" && !this.state.taken.includes(i)).length;
    drawText(ctx, `SITES LEFT ${left}   ${day < 0.45 ? "NIGHT" : "DAY"}${this.storm > 0 ? "   STORM" : ""}`, 6, 12, PAL.grey);
    const bar = (x: number, label: string, v: number, col: string) => { drawText(ctx, label, x, 4, PAL.grey); ctx.fillStyle = PAL.greyDark; ctx.fillRect(x, 12, 40, 4); ctx.fillStyle = col; ctx.fillRect(x, 12, Math.round(40 * v / 100), 4); };
    bar(250, "POWER", this.power, this.power < 25 ? PAL.danger : PAL.thrust);
    bar(300, "ROVER", this.integrity, this.integrity < 35 ? PAL.danger : PAL.good);
    // prompts
    const ni = this.nodeIdxAt(tx, ty);
    const node = ni >= 0 ? this.map.nodes[ni] : null;
    const ent = this.map.entrances.find((e) => Math.abs(e.x - tx) <= 1 && Math.abs(e.y - ty) <= 1);
    const nearLander = Math.hypot(this.px - (this.map.lander.x * GT + GT / 2), this.py - (this.map.lander.y * GT + GT / 2)) < 22;
    let prompt = "";
    if (nearLander) {
      const home = (g.world.player.homesteads ?? []).find((h) => h.key === this.map.key);
      const claim = home ? `   [H] COLLECT ${Math.floor(homesteadYield(home, g.world.time))} ${commodity(home.resource).name.toUpperCase()}` : this.state.charted && (g.world.player.homesteads ?? []).length < 3 ? `   [H] STAKE A CLAIM (${HOMESTEAD_PRICE}CR)` : "";
      prompt = `[E] LIFT OFF${this.integrity < 100 && (g.world.player.cargo["parts"] ?? 0) > 0 ? "   [R] PATCH (1 PARTS)" : ""}${claim}   ${home ? "HOMESTEAD: FAST RECHARGE + REPAIR" : "RECHARGING"}`;
    }
    else if (ent) prompt = ent.kind === "defense" ? `${ent.name.toUpperCase()}: MILITARY - NO ENTRY` : `[E] ENTER ${ent.name.toUpperCase()}`;
    else if (node) prompt = node.kind === "flora" ? `${node.label}: HOLD V TO SCAN` : node.kind === "geyser" ? `${node.label}: KEEP CLEAR` : `[E] ${node.kind === "outcrop" ? "MINE" : node.kind === "probe" ? "RECOVER" : "SALVAGE"} ${node.label}`;
    if (prompt) drawText(ctx, prompt, VW / 2 - textWidth(prompt) / 2, VH - 22, PAL.gold);
    if (this.power <= 0) drawText(ctx, "POWER EXHAUSTED - CRAWLING. GET BACK TO THE LANDER.", VW / 2 - textWidth("POWER EXHAUSTED - CRAWLING. GET BACK TO THE LANDER.") / 2, VH - 32, PAL.danger);
    if (this.msg) drawText(ctx, this.msg, VW / 2 - textWidth(this.msg) / 2, VH - 12, PAL.ui);
    if (g.toastTimer > 0) drawText(ctx, g.toastMsg, VW / 2 - textWidth(g.toastMsg) / 2, VH - 42, PAL.ui);
    if (g.hint) drawText(ctx, g.hint, clamp(VW / 2 - textWidth(g.hint) / 2, 2, VW), 26, PAL.gold);
    void faction;
  }
}
