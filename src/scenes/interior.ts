// Ship interior: walk your own deck, inspect and repair physical system panels.
// Damage taken in combat maps to these panels — fix them with spare parts.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { ShipSystemId, removeCargo, cargoUsed } from "../world";
import { clamp, dist } from "../core/mathx";
import { sfx } from "../core/sfx";

const T = 10; // tile size px

// Deck layout: # wall, . floor, C cockpit, E engines, L life support,
// W weapons, G cargo, R reactor, M comms, B bunk, K galley (kitchen)
const DECK = [
  "##############################",
  "#..........##........#....M..#",
  "#..B.......##...R....#.......#",
  "#..........D.........D....C..#",
  "#..K.......##........#.......#",
  "#..........##...L....#.......#",
  "######D#######D###############",
  "#........#..........#....W...#",
  "#..G.....D..........D........#",
  "#........#....E.....#........#",
  "#........#..........#........#",
  "##############################",
];

interface PanelDef {
  ch: string;
  sysId: ShipSystemId | null;
  label: string;
  desc: string;
}

const PANELS: PanelDef[] = [
  { ch: "C", sysId: null, label: "COCKPIT", desc: "Take the helm" },
  { ch: "E", sysId: "engines", label: "MAIN ENGINES", desc: "Thrust output" },
  { ch: "L", sysId: "life", label: "AIR SCRUBBERS", desc: "O2 recycling" },
  { ch: "R", sysId: "reactor", label: "REACTOR CORE", desc: "Ship power" },
  { ch: "W", sysId: "weapons", label: "WEAPON MOUNTS", desc: "Cannon feeds" },
  { ch: "G", sysId: "cargo", label: "CARGO BAY", desc: "Stowed goods" },
  { ch: "M", sysId: "comms", label: "COMMS ARRAY", desc: "Signals & nav" },
  { ch: "B", sysId: null, label: "BUNK", desc: "Rest a while" },
  { ch: "K", sysId: null, label: "GALLEY", desc: "Eat something" },
];

export class InteriorScene implements Scene {
  px = 3 * T; // player pos in interior pixels
  py = 3 * T;
  msg = "";
  msgTimer = 0;
  repairing: { sysId: ShipSystemId; progress: number } | null = null;

  enter(g: Game): void {
    // spawn near cockpit
    this.px = 26 * T;
    this.py = 3 * T + 4;
    this.msg = "YOUR SHIP. WASD WALK - E INTERACT";
    this.msgTimer = 4;
    this.repairing = null;
  }

  tileAt(tx: number, ty: number): string {
    if (ty < 0 || ty >= DECK.length || tx < 0 || tx >= DECK[0].length) return "#";
    return DECK[ty][tx];
  }

  solid(tx: number, ty: number): boolean {
    const ch = this.tileAt(tx, ty);
    return ch === "#" || (ch !== "." && ch !== "D" && PANELS.some((p) => p.ch === ch));
  }

  update(g: Game, dt: number): void {
    const inp = g.input;
    if (inp.wasPressed("Escape") || inp.wasPressed("i")) { g.setScene("flight"); return; }
    if (inp.wasPressed("F5")) g.save();

    const speed = 55;
    let dx = 0, dy = 0;
    if (inp.isDown("w")) dy -= 1;
    if (inp.isDown("s")) dy += 1;
    if (inp.isDown("a")) dx -= 1;
    if (inp.isDown("d")) dx += 1;
    if (dx && dy) { dx *= 0.707; dy *= 0.707; }
    const nx = this.px + dx * speed * dt;
    const ny = this.py + dy * speed * dt;
    // collision: check corners of a 6x6 hitbox
    const canX = !this.solid(Math.floor((nx - 3) / T), Math.floor((this.py - 3) / T)) &&
      !this.solid(Math.floor((nx + 3) / T), Math.floor((this.py - 3) / T)) &&
      !this.solid(Math.floor((nx - 3) / T), Math.floor((this.py + 3) / T)) &&
      !this.solid(Math.floor((nx + 3) / T), Math.floor((this.py + 3) / T));
    const canY = !this.solid(Math.floor((this.px - 3) / T), Math.floor((ny - 3) / T)) &&
      !this.solid(Math.floor((this.px + 3) / T), Math.floor((ny - 3) / T)) &&
      !this.solid(Math.floor((this.px - 3) / T), Math.floor((ny + 3) / T)) &&
      !this.solid(Math.floor((this.px + 3) / T), Math.floor((ny + 3) / T));
    if (canX) this.px = nx;
    if (canY) this.py = ny;
    if (dx || dy) this.repairing = null;

    // find nearest panel
    const near = this.nearestPanel();

    // continuous repair while holding E on a damaged panel with parts
    if (near && near.def.sysId && inp.isDown("e")) {
      const sys = g.world.player.systems.find((s) => s.id === near.def.sysId)!;
      if (sys.health < 100) {
        if ((g.world.player.cargo["parts"] ?? 0) > 0 || sys.health >= 60) {
          if (!this.repairing || this.repairing.sysId !== sys.id) {
            this.repairing = { sysId: sys.id, progress: 0 };
          }
          this.repairing.progress += dt;
          if (this.repairing.progress >= 1.2) {
            this.repairing.progress = 0;
            // below 60% needs a spare part per chunk; above that it's elbow grease
            if (sys.health < 60) {
              if (!removeCargo(g.world.player, "parts", 1)) {
                this.say("NEED SPARE PARTS (BUY AT STATIONS)");
                this.repairing = null;
                return;
              }
            }
            sys.health = Math.min(100, sys.health + 20);
            sfx.repair();
            this.say(`${sys.name.toUpperCase()} AT ${Math.round(sys.health)}%`);
          }
        } else {
          this.say("NEED SPARE PARTS FOR MAJOR REPAIRS");
        }
      }
    } else {
      this.repairing = null;
    }

    if (near && inp.wasPressed("e")) {
      const p = g.world.player;
      if (near.def.ch === "C") { g.setScene("flight"); return; }
      if (near.def.ch === "B") {
        p.oxygen = p.oxygenMax;
        p.shield = p.shieldMax;
        this.say("YOU REST. SHIELDS RECALIBRATED, O2 TOPPED UP");
        return;
      }
      if (near.def.ch === "K") {
        if ((p.cargo["food"] ?? 0) > 0) {
          removeCargo(p, "food", 1);
          p.hull = Math.min(p.hullMax, p.hull + 5);
          this.say("A HOT MEAL. YOU FEEL PATCHED TOGETHER (+5 HULL)");
        } else {
          this.say("GALLEY'S EMPTY. BUY PROVISIONS AT A STATION");
        }
        return;
      }
      if (near.def.sysId) {
        const sys = p.systems.find((s) => s.id === near.def.sysId)!;
        if (sys.health >= 100) this.say(`${sys.name.toUpperCase()}: NOMINAL`);
      }
    }

    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.msg = ""; }
  }

  say(m: string): void {
    this.msg = m;
    this.msgTimer = 3;
  }

  nearestPanel(): { def: PanelDef; tx: number; ty: number } | null {
    let best: { def: PanelDef; tx: number; ty: number } | null = null;
    let bestD = 18;
    for (let ty = 0; ty < DECK.length; ty++) {
      for (let tx = 0; tx < DECK[0].length; tx++) {
        const def = PANELS.find((p) => p.ch === DECK[ty][tx]);
        if (!def) continue;
        const d = dist(this.px, this.py, tx * T + T / 2, ty * T + T / 2);
        if (d < bestD) { bestD = d; best = { def, tx, ty }; }
      }
    }
    return best;
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, VW, VH);
    const ox = Math.round(VW / 2 - (DECK[0].length * T) / 2);
    const oy = Math.round(VH / 2 - (DECK.length * T) / 2) + 8;

    const p = g.world.player;
    for (let ty = 0; ty < DECK.length; ty++) {
      for (let tx = 0; tx < DECK[0].length; tx++) {
        const ch = DECK[ty][tx];
        const x = ox + tx * T, y = oy + ty * T;
        if (ch === "#") {
          ctx.fillStyle = "#232a3d";
          ctx.fillRect(x, y, T, T);
          ctx.fillStyle = "#2c3550";
          ctx.fillRect(x, y, T, 2);
        } else {
          // floor with subtle checker
          ctx.fillStyle = (tx + ty) % 2 === 0 ? "#11182b" : "#121a2e";
          ctx.fillRect(x, y, T, T);
          if (ch === "D") {
            ctx.fillStyle = "#1d2b47";
            ctx.fillRect(x + 1, y, T - 2, T);
          }
          const def = PANELS.find((pn) => pn.ch === ch);
          if (def) {
            // panel console
            let col: string = PAL.info;
            if (def.sysId) {
              const sys = p.systems.find((s) => s.id === def.sysId)!;
              col = sys.health > 70 ? PAL.good : sys.health > 35 ? PAL.warn : PAL.danger;
            } else if (def.ch === "C") col = PAL.ui;
            else col = "#7a5aa5";
            ctx.fillStyle = "#2c3550";
            ctx.fillRect(x, y + 2, T, T - 2);
            ctx.fillStyle = col;
            ctx.fillRect(x + 2, y + 4, T - 4, 3);
            // blinking damage light
            if (def.sysId) {
              const sys = p.systems.find((s) => s.id === def.sysId)!;
              if (sys.health < 50 && Math.floor(g.world.time * 3) % 2 === 0) {
                ctx.fillStyle = PAL.danger;
                ctx.fillRect(x + T - 3, y + 1, 2, 2);
              }
            }
          }
        }
      }
    }

    // player
    const px = Math.round(ox + this.px), py = Math.round(oy + this.py);
    ctx.fillStyle = "#e8b48c";
    ctx.fillRect(px - 2, py - 4, 4, 3); // head
    ctx.fillStyle = "#3a6ea5";
    ctx.fillRect(px - 3, py - 1, 6, 5); // suit

    // nearest panel tooltip
    const near = this.nearestPanel();
    if (near) {
      const sys = near.def.sysId ? p.systems.find((s) => s.id === near.def.sysId)! : null;
      const label = sys ? `${near.def.label} ${Math.round(sys.health)}%` : near.def.label;
      const tipX = ox + near.tx * T + T / 2 - textWidth(label) / 2;
      drawText(ctx, label, tipX, oy + near.ty * T - 8, sys && sys.health < 100 ? PAL.warn : PAL.ui);
      const hint = near.def.ch === "C" ? "[E] TAKE HELM"
        : sys && sys.health < 100 ? "[HOLD E] REPAIR" : `[E] ${near.def.desc.toUpperCase()}`;
      drawText(ctx, hint, ox + near.tx * T + T / 2 - textWidth(hint) / 2, oy + near.ty * T + T + 3, PAL.gold);
      if (this.repairing && sys && this.repairing.sysId === sys.id) {
        ctx.fillStyle = PAL.greyDark;
        ctx.fillRect(px - 10, py - 10, 20, 3);
        ctx.fillStyle = PAL.good;
        ctx.fillRect(px - 10, py - 10, Math.round(20 * clamp(this.repairing.progress / 1.2, 0, 1)), 3);
      }
    }

    // status header
    drawText(ctx, "SHIP INTERIOR", 8, 6, PAL.white);
    drawText(ctx, `PARTS: ${p.cargo["parts"] ?? 0}  FOOD: ${p.cargo["food"] ?? 0}  CARGO ${cargoUsed(p)}/${p.cargoMax}`, 8, 15, PAL.grey);
    drawText(ctx, "ESC/I RETURN TO FLIGHT", VW - textWidth("ESC/I RETURN TO FLIGHT") - 6, 6, PAL.greyDark);

    if (this.msg) {
      drawText(ctx, this.msg, VW / 2 - textWidth(this.msg) / 2, VH - 12, PAL.ui);
    }
  }
}
