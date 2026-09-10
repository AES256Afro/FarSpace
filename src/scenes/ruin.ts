// Ruins: a procedurally generated dungeon under a ruin POI. Rooms and corridors,
// dormant sentries that wake when you cross their line of sight, gas pockets that
// eat suit O2, and relic caches worth the risk. One way out.

import { Game, Scene, VW } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { RNG, hashStr } from "../core/rng";
import { addCargo, Poi, pushEvent, adjustRep } from "../world";
import { commodity } from "../data/data";
import { sfx } from "../core/sfx";
import { music } from "../core/music";
import * as wire from "../core/wire";
import { flag } from "../core/achievements";
import { T, moveWalker, deckOrigin, drawTiles, drawPerson, tooltip, footer } from "./walkbase";

const W = 44, H = 20;

interface Crate { tx: number; ty: number; id: string; qty: number; taken: boolean }
interface Sentry { tx: number; ty: number; hp: number; cd: number; awake: boolean }
interface Shot { x: number; y: number; vx: number; vy: number; life: number }

export class RuinScene implements Scene {
  touchMode = "walk" as const;
  px = 0; py = 0;
  deck: string[] = [];
  crates: Crate[] = [];
  sentries: Sentry[] = [];
  gas = new Set<number>();
  shots: Shot[] = [];
  o2 = 100;
  poi!: Poi;
  msg = ""; msgTimer = 0;
  hurtCd = 0;
  exit = { tx: 1, ty: 1 };
  disarm: { s: Sentry; t: number } | null = null;

  enter(g: Game): void {
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    const surf = sys.planets[g.orbitPlanetIdx].surface!;
    const poi = surf.pois.find((x) => x.id === g.landedPoiId);
    if (!poi) { g.setScene("orbit"); return; }
    this.poi = poi;
    const rng = new RNG(hashStr(poi.id) ^ g.world.seed);
    this.generate(rng, !!poi.looted);
    this.o2 = 100;
    this.shots = [];
    this.disarm = null;
    this.msg = poi.looted ? "THE RUINS ARE PICKED CLEAN. STILL DANGEROUS." : "RUINS - SENTRIES ARE DORMANT UNTIL THEY SEE YOU";
    this.msgTimer = 4;
    music.setMood("void", 0.3);
    sfx.alarm();
    g.showHint("ruin", "GAS DRAINS O2 - SENTRIES SHOOT DOWN CORRIDORS - HOLD E BESIDE ONE TO DISARM IT");
  }

  generate(rng: RNG, looted: boolean): void {
    const grid: string[][] = Array.from({ length: H }, () => Array(W).fill("#"));
    const rooms: { x: number; y: number; w: number; h: number }[] = [];
    for (let tries = 0; tries < 60 && rooms.length < 8; tries++) {
      const w = rng.int(4, 8), h = rng.int(3, 5);
      const x = rng.int(1, W - w - 2), y = rng.int(1, H - h - 2);
      if (rooms.some((r) => x < r.x + r.w + 1 && x + w + 1 > r.x && y < r.y + r.h + 1 && y + h + 1 > r.y)) continue;
      rooms.push({ x, y, w, h });
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[yy][xx] = ".";
    }
    rooms.sort((a, b) => a.x - b.x);
    for (let i = 0; i < rooms.length - 1; i++) {
      const a = rooms[i], b = rooms[i + 1];
      let x = Math.floor(a.x + a.w / 2), y = Math.floor(a.y + a.h / 2);
      const tx = Math.floor(b.x + b.w / 2), ty = Math.floor(b.y + b.h / 2);
      while (x !== tx) { grid[y][x] = grid[y][x] === "#" ? "." : grid[y][x]; x += Math.sign(tx - x); }
      while (y !== ty) { grid[y][x] = grid[y][x] === "#" ? "." : grid[y][x]; y += Math.sign(ty - y); }
    }
    const first = rooms[0];
    this.exit = { tx: first.x, ty: first.y };
    grid[first.y][first.x] = "A";
    this.px = (first.x + 1) * T + T / 2; this.py = (first.y + 1) * T + T / 2;
    this.crates = []; this.sentries = []; this.gas.clear();
    const deep = rooms.slice(1);
    for (const r of deep) {
      const cx = r.x + rng.int(0, r.w - 1), cy = r.y + rng.int(0, r.h - 1);
      if (!looted && rng.chance(0.75)) this.crates.push({ tx: cx, ty: cy, id: rng.chance(0.7) ? "relics" : rng.pick(["data", "bio", "parts"]), qty: rng.int(1, 3), taken: false });
      if (rng.chance(0.6)) { const sx = r.x + rng.int(0, r.w - 1), sy = r.y + rng.int(0, r.h - 1); if (grid[sy][sx] === ".") { grid[sy][sx] = "S"; this.sentries.push({ tx: sx, ty: sy, hp: 2, cd: 0, awake: false }); } }
      if (rng.chance(0.5)) for (let k = 0; k < 4; k++) { const gx = r.x + rng.int(0, r.w - 1), gy = r.y + rng.int(0, r.h - 1); if (grid[gy][gx] === ".") this.gas.add(gy * W + gx); }
    }
    this.deck = grid.map((row) => row.join(""));
  }

  solid(tx: number, ty: number): boolean {
    if (ty < 0 || ty >= H || tx < 0 || tx >= W) return true;
    const ch = this.deck[ty][tx];
    if (ch === "#" || ch === "S") return true;
    return this.crates.some((c) => !c.taken && c.tx === tx && c.ty === ty);
  }

  say(m: string): void { this.msg = m; this.msgTimer = 3; }

  leave(g: Game): void {
    if (this.crates.length && this.crates.every((c) => c.taken)) this.poi.looted = true;
    g.setScene("orbit");
  }

  update(g: Game, dt: number): void {
    const inp = g.input;
    const p = g.world.player;
    if (inp.wasPressed("Escape")) { this.leave(g); return; }
    moveWalker(g, this, dt, (tx, ty) => this.solid(tx, ty), 50);
    const ptx = Math.floor(this.px / T), pty = Math.floor(this.py / T);
    // gas
    const inGas = this.gas.has(pty * W + ptx);
    this.o2 = Math.max(0, this.o2 - dt * (inGas ? 6 : 0.8));
    if (this.o2 <= 0) { g.toast("SUIT O2 EXHAUSTED - YOU STAGGER BACK TO THE PAD"); p.hull = Math.max(1, p.hull - 10); this.leave(g); return; }
    // sentries: line of sight along a row or column within 7 tiles, no wall between
    this.hurtCd -= dt;
    for (const s of this.sentries) {
      if (s.hp <= 0) continue;
      s.cd -= dt;
      const sameRow = s.ty === pty && Math.abs(s.tx - ptx) <= 7, sameCol = s.tx === ptx && Math.abs(s.ty - pty) <= 7;
      let sees = false;
      if (sameRow || sameCol) {
        sees = true;
        const dx = Math.sign(ptx - s.tx), dy = Math.sign(pty - s.ty);
        let x = s.tx + dx, y = s.ty + dy;
        while (x !== ptx || y !== pty) { if (this.deck[y][x] === "#") { sees = false; break; } x += dx; y += dy; }
      }
      if (sees) s.awake = true;
      if (s.awake && sees && s.cd <= 0) {
        s.cd = 1.3;
        const ang = Math.atan2(this.py - (s.ty * T + T / 2), this.px - (s.tx * T + T / 2));
        this.shots.push({ x: s.tx * T + T / 2, y: s.ty * T + T / 2, vx: Math.cos(ang) * 90, vy: Math.sin(ang) * 90, life: 1.5 });
        sfx.enemyLaser();
      }
    }
    for (const sh of this.shots) {
      sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.life -= dt;
      const tx = Math.floor(sh.x / T), ty = Math.floor(sh.y / T);
      if (this.deck[ty]?.[tx] === "#") sh.life = 0;
      if (sh.life > 0 && Math.hypot(sh.x - this.px, sh.y - this.py) < 5 && this.hurtCd <= 0) {
        sh.life = 0; this.hurtCd = 0.3; p.hull = Math.max(1, p.hull - 6); sfx.hit(); this.say("HIT! GET OUT OF ITS LINE");
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
    // disarm: hold E adjacent to a sentry
    const adj = this.sentries.find((s) => s.hp > 0 && Math.hypot(s.tx * T + T / 2 - this.px, s.ty * T + T / 2 - this.py) < 16);
    if (adj && inp.isDown("e")) {
      if (!this.disarm || this.disarm.s !== adj) this.disarm = { s: adj, t: 0 };
      this.disarm.t += dt;
      if (this.disarm.t >= 1.5) { adj.hp = 0; this.disarm = null; this.say("SENTRY DISARMED"); sfx.repair(); const row = this.deck[adj.ty].split(""); row[adj.tx] = "."; this.deck[adj.ty] = row.join(""); }
    } else this.disarm = null;
    // loot
    const crate = this.crates.find((c) => !c.taken && Math.hypot(c.tx * T + T / 2 - this.px, c.ty * T + T / 2 - this.py) < 16);
    if (crate && inp.wasPressed("e")) {
      if (addCargo(p, crate.id, crate.qty)) {
        crate.taken = true; g.toast(`+${crate.qty} ${commodity(crate.id).name.toUpperCase()}`); sfx.pickup();
        if (crate.id === "relics") { p.discoveries += 1; if (this.crates.filter((c) => c.id === "relics").every((c) => c.taken)) { pushEvent(g.world, { t: g.world.time, kind: "discovery", systemId: p.systemId, text: `Relics recovered from ${this.poi.name} by an independent pilot` }); const sys = g.world.systems[p.systemId]; adjustRep(g.world, sys.factionId, 3); void wire.post("relics", `cleared the ruins at ${this.poi.name} of relics`, sys.name); flag(g, "ruinCleared"); } }
      } else g.toast("CARGO FULL");
    }
    const atExit = Math.hypot(this.exit.tx * T + T / 2 - this.px, this.exit.ty * T + T / 2 - this.py) < 14;
    if (atExit && inp.wasPressed("e")) { this.leave(g); return; }
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.msg = ""; }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#07060a";
    ctx.fillRect(0, 0, VW, 270);
    const [ox, oy] = deckOrigin(this.deck, 10);
    const ptx = Math.floor(this.px / T), pty = Math.floor(this.py / T);
    drawTiles(ctx, this.deck, ox, oy, (ch, x, y, tx, ty) => {
      if (ch === "A") { ctx.fillStyle = "#2c3550"; ctx.fillRect(x, y + 2, T, T - 2); ctx.fillStyle = PAL.warn; ctx.fillRect(x + 2, y + 4, T - 4, 3); }
      if (ch === "S") {
        const s = this.sentries.find((q) => q.tx === tx && q.ty === ty);
        ctx.fillStyle = "#3a3f52"; ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
        ctx.fillStyle = s?.awake ? PAL.danger : PAL.greyDark; ctx.fillRect(x + 4, y + 4, 2, 2);
      }
      return true;
    });
    // fog: only tiles within 6 of the player are lit; ruins are dark
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      const d = Math.hypot(tx - ptx, ty - pty);
      if (d > 6) { ctx.fillStyle = "rgba(7,6,10,0.85)"; ctx.fillRect(ox + tx * T, oy + ty * T, T, T); }
      else if (this.gas.has(ty * W + tx)) { ctx.fillStyle = "rgba(99,242,120,0.22)"; ctx.fillRect(ox + tx * T, oy + ty * T, T, T); }
    }
    for (const c of this.crates) {
      if (c.taken || Math.hypot(c.tx - ptx, c.ty - pty) > 6) continue;
      const x = ox + c.tx * T, y = oy + c.ty * T;
      ctx.fillStyle = "#5d6680"; ctx.fillRect(x + 1, y + 2, T - 2, T - 3);
      ctx.fillStyle = c.id === "relics" ? "#b28fe0" : PAL.gold; ctx.fillRect(x + 3, y + 4, T - 6, 2);
    }
    for (const sh of this.shots) { ctx.fillStyle = PAL.danger; ctx.fillRect(Math.round(ox + sh.x) - 1, Math.round(oy + sh.y) - 1, 2, 2); }
    drawPerson(ctx, Math.round(ox + this.px), Math.round(oy + this.py), "#e8b48c", "#3a6ea5");
    const crate = this.crates.find((c) => !c.taken && Math.hypot(c.tx * T + T / 2 - this.px, c.ty * T + T / 2 - this.py) < 16);
    const adj = this.sentries.find((s) => s.hp > 0 && Math.hypot(s.tx * T + T / 2 - this.px, s.ty * T + T / 2 - this.py) < 16);
    if (adj) tooltip(ctx, ox, oy, adj.tx, adj.ty, adj.awake ? "SENTRY (ACTIVE)" : "SENTRY (DORMANT)", "[HOLD E] DISARM", PAL.danger);
    else if (crate) tooltip(ctx, ox, oy, crate.tx, crate.ty, `${commodity(crate.id).name.toUpperCase()} x${crate.qty}`, "[E] TAKE", crate.id === "relics" ? "#b28fe0" : PAL.gold);
    else if (Math.hypot(this.exit.tx * T + T / 2 - this.px, this.exit.ty * T + T / 2 - this.py) < 14) tooltip(ctx, ox, oy, this.exit.tx, this.exit.ty, "SURFACE", "[E] LEAVE", PAL.warn);
    if (this.disarm) { const px = Math.round(ox + this.px), py = Math.round(oy + this.py); ctx.fillStyle = PAL.greyDark; ctx.fillRect(px - 10, py - 10, 20, 3); ctx.fillStyle = PAL.good; ctx.fillRect(px - 10, py - 10, Math.round(20 * Math.min(1, this.disarm.t / 1.5)), 3); }
    drawText(ctx, `RUINS: ${this.poi.name.toUpperCase()}`, 8, 6, PAL.white);
    drawText(ctx, `SUIT O2 ${Math.round(this.o2)}%   HULL ${Math.round(g.world.player.hull)}   RELICS ${g.world.player.cargo.relics ?? 0}`, 8, 15, this.o2 < 30 ? PAL.danger : PAL.grey);
    drawText(ctx, "ESC LEAVE", VW - textWidth("ESC LEAVE") - 6, 6, PAL.greyDark);
    footer(ctx, g, this.msg);
    if (g.hint) drawText(ctx, g.hint, VW / 2 - textWidth(g.hint) / 2, 24, PAL.gold);
  }
}
