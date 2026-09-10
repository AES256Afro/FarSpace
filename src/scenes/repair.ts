// Aboard a disabled ship: three dead systems, a suit clock, and the odd fire.
// Hold E beside a system to bring it back. Spare parts make it quicker.

import { Game, Scene, VW } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { RNG } from "../core/rng";
import { crewBonus } from "../world";
import { sfx } from "../core/sfx";
import { T, moveWalker, deckOrigin, drawTiles, drawPerson, nearestTile, tooltip, footer } from "./walkbase";
import type { FlightScene } from "./flight/index";

const BASE = [
  "########################",
  "#A.........#...........#",
  "#..........D...........#",
  "#....####..#....####...#",
  "#....#..#..D....#..#...#",
  "#....#..D.......D..#...#",
  "#....####.......####...#",
  "#......................#",
  "########################",
];
const SYSTEMS: { ch: string; name: string; tx: number; ty: number }[] = [
  { ch: "E", name: "ENGINES", tx: 6, ty: 4 },
  { ch: "L", name: "LIFE SUPPORT", tx: 17, ty: 4 },
  { ch: "R", name: "REACTOR", tx: 20, ty: 1 },
];

export class RepairScene implements Scene {
  touchMode = "walk" as const;
  px = 2 * T; py = T + 5;
  deck: string[] = [];
  health: Record<string, number> = {};
  fires: { tx: number; ty: number }[] = [];
  o2 = 100;
  msg = ""; msgTimer = 0;
  hurtCd = 0;
  rng = new RNG(1);

  tender = false; // fixing a station's plant, not a ship
  enter(g: Game): void {
    this.tender = !!g.tenderMission;
    if (!g.repairTarget && !this.tender) { g.setScene("flight"); return; }
    this.deck = BASE.map((r) => r);
    this.rng = new RNG((g.world.seed ^ Math.floor(g.world.time)) >>> 0);
    this.px = 2 * T; this.py = T + 5;
    this.o2 = 100;
    this.health = {};
    for (const s of SYSTEMS) this.health[s.ch] = this.rng.int(0, 25);
    this.fires = [];
    this.say(this.tender ? "THE YARD CHIEF POINTS AT THREE RED PANELS AND LEAVES. HOLD E AT EACH." : "ENGINES DEAD, AIR THIN, REACTOR TICKING. HOLD E AT EACH SYSTEM.");
    sfx.alarm();
  }

  say(m: string): void { this.msg = m; this.msgTimer = 3; }
  solid(tx: number, ty: number): boolean {
    if (ty < 0 || ty >= this.deck.length || tx < 0 || tx >= this.deck[0].length) return true;
    if (this.deck[ty][tx] === "#") return true;
    return SYSTEMS.some((s) => s.tx === tx && s.ty === ty);
  }
  done(): boolean { return SYSTEMS.every((s) => this.health[s.ch] >= 100); }

  leave(g: Game, success: boolean): void {
    if (this.tender) {
      const m = g.tenderMission;
      g.tenderMission = null;
      if (m && success) { m.tenderDone = true; g.toast("PLANT BACK ONLINE - COLLECT THE TENDER ON THE MISSIONS TAB"); g.world.player.skills.engineering = Math.min(20, (g.world.player.skills.engineering ?? 0) + 1); }
      else g.toast("YOU LEAVE THE JOB HALF DONE. THE TENDER STAYS OPEN.");
      g.setScene("station");
      return;
    }
    const fs = g.scenes.flight as FlightScene;
    if (success && g.repairTarget) fs.finishRepair(g, g.repairTarget, "you");
    else if (g.repairTarget) g.toast("YOU LEAVE THE FREIGHTER STILL DARK. IT WILL WAIT, IF THE CORSAIRS DON'T FIND IT FIRST.");
    g.repairTarget = null;
    fs.resumeNext = true;
    g.setScene("flight");
    if (success && Math.random() < 0.1 + g.world.systems[g.world.player.systemId].pirateActivity * 0.4) { fs.spawnRaidersNearPlayer(g, 2); g.toast("CORSAIRS ARRIVED WHILE YOU WERE ABOARD"); }
  }

  update(g: Game, dt: number): void {
    const inp = g.input;
    const p = g.world.player;
    if (inp.wasPressed("Escape")) { this.leave(g, this.done()); return; }
    moveWalker(g, this, dt, (tx, ty) => this.solid(tx, ty));
    const ptx = Math.floor(this.px / T), pty = Math.floor(this.py / T);
    this.o2 = Math.max(0, this.o2 - dt * (this.health.L >= 100 ? 0.3 : 1.3));
    if (this.o2 <= 0) { g.toast("SUIT O2 EXHAUSTED - BACK TO YOUR SHIP"); this.leave(g, this.done()); return; }
    // fires near a sick reactor
    if (this.health.R < 60 && Math.random() < dt * 0.06 && this.fires.length < 4) {
      const f = { tx: 18 + this.rng.int(0, 3), ty: 1 + this.rng.int(0, 1) };
      if (!this.solid(f.tx, f.ty) && !this.fires.some((x) => x.tx === f.tx && x.ty === f.ty)) { this.fires.push(f); this.say("FIRE NEAR THE REACTOR"); }
    }
    this.hurtCd -= dt;
    if (this.fires.some((f) => f.tx === ptx && f.ty === pty) && this.hurtCd <= 0) { this.hurtCd = 0.5; p.hull = Math.max(1, p.hull - 3); sfx.hit(); this.say("BURNING! MOVE!"); }
    const fire = this.fires.find((f) => Math.hypot(f.tx * T + T / 2 - this.px, f.ty * T + T / 2 - this.py) < 16);
    const sys = SYSTEMS.find((s) => Math.hypot(s.tx * T + T / 2 - this.px, s.ty * T + T / 2 - this.py) < 18);
    if (fire && inp.wasPressed("e")) { this.fires = this.fires.filter((f) => f !== fire); this.say("FIRE OUT"); sfx.repair(); }
    else if (sys && inp.isDown("e") && this.health[sys.ch] < 100) {
      let rate = 22 * (1 + 0.35 * crewBonus(p, "engineer") + 0.15 * (p.skills?.engineering ?? 0));
      if ((p.cargo.parts ?? 0) > 0 && this.health[sys.ch] < 5) { p.cargo.parts--; if (!p.cargo.parts) delete p.cargo.parts; this.health[sys.ch] = 40; this.say(`SPARE PART FITTED TO THE ${sys.name}`); sfx.repair(); }
      this.health[sys.ch] = Math.min(100, this.health[sys.ch] + rate * dt);
      if (this.health[sys.ch] >= 100) { this.say(`${sys.name} BACK ONLINE`); sfx.repair(); p.skills.engineering = Math.min(20, (p.skills.engineering ?? 0) + 0.5); }
      void rate;
    }
    const air = nearestTile(this.deck, this.px, this.py, "A");
    if (air && inp.wasPressed("e")) { this.leave(g, this.done()); return; }
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.msg = ""; }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, VW, 270);
    const [ox, oy] = deckOrigin(this.deck, 12);
    drawTiles(ctx, this.deck, ox, oy, (ch, x, y) => {
      if (ch === "A") { ctx.fillStyle = "#2c3550"; ctx.fillRect(x, y + 2, T, T - 2); ctx.fillStyle = PAL.warn; ctx.fillRect(x + 2, y + 4, T - 4, 3); }
      return true;
    });
    for (const s of SYSTEMS) {
      const x = ox + s.tx * T, y = oy + s.ty * T;
      const h = this.health[s.ch];
      ctx.fillStyle = "#3a4468"; ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
      ctx.fillStyle = h >= 100 ? PAL.good : h > 40 ? PAL.warn : PAL.danger; ctx.fillRect(x + 3, y + 3, T - 6, T - 6);
      if (h < 100 && Math.floor(g.world.time * 4) % 2 === 0) { ctx.fillStyle = "#111"; ctx.fillRect(x + 4, y + 4, 2, 2); }
      ctx.fillStyle = PAL.greyDark; ctx.fillRect(x - 2, y - 4, T + 4, 2);
      ctx.fillStyle = h >= 100 ? PAL.good : PAL.warn; ctx.fillRect(x - 2, y - 4, Math.round((T + 4) * h / 100), 2);
    }
    for (const f of this.fires) {
      const x = ox + f.tx * T, y = oy + f.ty * T;
      const fl = Math.floor(g.world.time * 8 + f.tx) % 3;
      ctx.fillStyle = fl === 0 ? "#ff5a5a" : fl === 1 ? "#ffb347" : "#ffd75a";
      ctx.fillRect(x + 2, y + 3 + fl, T - 4, T - 4 - fl);
    }
    drawPerson(ctx, Math.round(ox + this.px), Math.round(oy + this.py), "#e8b48c", "#3a6ea5");
    const sys = SYSTEMS.find((s) => Math.hypot(s.tx * T + T / 2 - this.px, s.ty * T + T / 2 - this.py) < 18);
    const fire = this.fires.find((f) => Math.hypot(f.tx * T + T / 2 - this.px, f.ty * T + T / 2 - this.py) < 16);
    if (fire) tooltip(ctx, ox, oy, fire.tx, fire.ty, "FIRE", "[E] EXTINGUISH", PAL.danger);
    else if (sys) tooltip(ctx, ox, oy, sys.tx, sys.ty, `${sys.name} ${Math.round(this.health[sys.ch])}%`, this.health[sys.ch] >= 100 ? "ONLINE" : "[E] HOLD TO REPAIR", this.health[sys.ch] >= 100 ? PAL.good : PAL.warn);
    else { const air = nearestTile(this.deck, this.px, this.py, "A"); if (air) tooltip(ctx, ox, oy, air.tx, air.ty, "AIRLOCK", this.done() ? "[E] RETURN - REPAIRS DONE" : "[E] RETURN (UNFINISHED)", this.done() ? PAL.good : PAL.warn); }
    drawText(ctx, this.tender ? "STATION PLANT - ENGINEERING TENDER" : "ABOARD THE DISABLED FREIGHTER", 8, 6, PAL.white);
    drawText(ctx, `SUIT O2 ${Math.round(this.o2)}%   PARTS ${g.world.player.cargo.parts ?? 0}   ${SYSTEMS.map((s) => `${s.ch} ${Math.round(this.health[s.ch])}%`).join("  ")}`, 8, 15, this.o2 < 30 ? PAL.danger : PAL.grey);
    drawText(ctx, "ESC LEAVE", VW - textWidth("ESC LEAVE") - 6, 6, PAL.greyDark);
    footer(ctx, g, this.msg);
  }
}
