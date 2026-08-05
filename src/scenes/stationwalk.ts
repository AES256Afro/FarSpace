// Station promenade: walk the station on foot. Kiosks open the service screens,
// NPCs wander the deck, the airlock takes you back to your ship.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { RNG, hashStr } from "../core/rng";
import { dist } from "../core/mathx";
import { StationDef, findStation } from "../world";
import { faction, genPersonName } from "../data/data";
import { StationScene } from "./station";

const T = 10;

// Promenade layout. # wall, . floor, A airlock, M market, Y shipyard,
// B mission board, R bar, N news terminal, ~ window strip (solid, shows space)
const DECK = [
  "########################################",
  "#~~~~#............................#~~~~#",
  "#....#..M.......................Y.#....#",
  "#....D............................D...A#",
  "#....#............................#....#",
  "######..........########..........######",
  "#...............#......#...............#",
  "#.....B.........#..RR..#.........N.....#",
  "#...............#......#...............#",
  "#~~~~~~~....................~~~~~~~~~~~#",
  "########################################",
];

interface Kiosk {
  ch: string;
  label: string;
  tab: number | null; // StationScene tab index; null = special
}

const KIOSKS: Kiosk[] = [
  { ch: "M", label: "COMMODITY MARKET", tab: 0 },
  { ch: "Y", label: "SHIPYARD DESK", tab: 1 },
  { ch: "B", label: "MISSION BOARD", tab: 2 },
  { ch: "R", label: "THE LOUNGE BAR", tab: 3 },
  { ch: "N", label: "GALNET TERMINAL", tab: 4 },
  { ch: "A", label: "AIRLOCK - YOUR SHIP", tab: null },
];

interface WalkerNpc {
  x: number; y: number;
  tx: number; ty: number;
  name: string;
  skin: string; suit: string;
  pause: number;
}

export class StationWalkScene implements Scene {
  px = 37 * T;
  py = 3 * T + 5;
  npcs: WalkerNpc[] = [];
  station!: StationDef;
  msg = "";
  msgTimer = 0;

  enter(g: Game): void {
    const found = findStation(g.world, g.world.player.dockedAt!);
    if (!found) { g.setScene("flight"); return; }
    this.station = found.st;
    // spawn at airlock
    this.px = 37 * T;
    this.py = 3 * T + 5;
    // NPC walkers seeded per station
    const rng = new RNG(hashStr(this.station.id) ^ 0x9a7b);
    this.npcs = [];
    const n = this.station.military ? 4 : 6;
    for (let i = 0; i < n; i++) {
      const spot = this.randomFloor(rng);
      this.npcs.push({
        x: spot.x, y: spot.y, tx: spot.x, ty: spot.y,
        name: i < this.station.barPatrons.length ? this.station.barPatrons[i] : genPersonName(rng),
        skin: rng.pick(["#e8b48c", "#c78a5a", "#8c5a3a", "#f0d0b0", "#a86f48"]),
        suit: this.station.military && i < 2 ? "#5d6680" : rng.pick(["#3a6ea5", "#7a5aa5", "#3aa55e", "#a53a3a", "#c7a54a"]),
        pause: rng.range(0, 3),
      });
    }
    this.msg = `${this.station.name.toUpperCase()} PROMENADE`;
    this.msgTimer = 3;
  }

  randomFloor(rng: RNG): { x: number; y: number } {
    for (let tries = 0; tries < 100; tries++) {
      const tx = rng.int(1, DECK[0].length - 2);
      const ty = rng.int(1, DECK.length - 2);
      if (DECK[ty][tx] === ".") return { x: tx * T + T / 2, y: ty * T + T / 2 };
    }
    return { x: 5 * T, y: 3 * T };
  }

  tileAt(tx: number, ty: number): string {
    if (ty < 0 || ty >= DECK.length || tx < 0 || tx >= DECK[0].length) return "#";
    return DECK[ty][tx];
  }

  solid(tx: number, ty: number): boolean {
    const ch = this.tileAt(tx, ty);
    return ch !== "." && ch !== "D";
  }

  update(g: Game, dt: number): void {
    const inp = g.input;
    if (inp.wasPressed("Escape")) {
      // back to the docked services screen
      g.setScene("station");
      return;
    }
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

    // NPC wandering
    for (const n of this.npcs) {
      if (n.pause > 0) { n.pause -= dt; continue; }
      const d = Math.hypot(n.tx - n.x, n.ty - n.y);
      if (d < 2) {
        const rng = new RNG((Math.random() * 1e9) >>> 0);
        if (rng.chance(0.5)) { n.pause = rng.range(1, 4); }
        const spot = this.randomFloor(rng);
        n.tx = spot.x; n.ty = spot.y;
      } else {
        // straight-line steps; promenade is open enough that this reads fine
        const step = 22 * dt;
        const vx = ((n.tx - n.x) / d) * step;
        const vy = ((n.ty - n.y) / d) * step;
        const ntx = Math.floor((n.x + vx) / T), nty = Math.floor((n.y + vy) / T);
        if (!this.solid(ntx, nty)) { n.x += vx; n.y += vy; }
        else { n.tx = n.x; n.ty = n.y; } // blocked: pick a new target next tick
      }
    }

    // kiosk interaction
    const near = this.nearestKiosk();
    if (near && inp.wasPressed("e")) {
      if (near.def.tab === null) {
        g.world.player.dockedAt = null;
        g.setScene("flight");
        g.toast("UNDOCKED");
        return;
      }
      const st = g.scenes["station"] as StationScene;
      st.enter(g);
      st.tab = near.def.tab;
      st.returnTo = "stationwalk";
      g.scene = st;
      return;
    }

    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.msg = ""; }
  }

  nearestKiosk(): { def: Kiosk; tx: number; ty: number } | null {
    let best: { def: Kiosk; tx: number; ty: number } | null = null;
    let bestD = 18;
    for (let ty = 0; ty < DECK.length; ty++) {
      for (let tx = 0; tx < DECK[0].length; tx++) {
        const def = KIOSKS.find((k) => k.ch === DECK[ty][tx]);
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
    const oy = Math.round(VH / 2 - (DECK.length * T) / 2) + 10;
    const fac = faction(this.station.factionId);

    for (let ty = 0; ty < DECK.length; ty++) {
      for (let tx = 0; tx < DECK[0].length; tx++) {
        const ch = DECK[ty][tx];
        const x = ox + tx * T, y = oy + ty * T;
        if (ch === "#") {
          ctx.fillStyle = "#232a3d";
          ctx.fillRect(x, y, T, T);
          ctx.fillStyle = "#2c3550";
          ctx.fillRect(x, y, T, 2);
        } else if (ch === "~") {
          // viewport window: space + stars
          ctx.fillStyle = "#05070f";
          ctx.fillRect(x, y, T, T);
          const h = (Math.imul(tx * 31 + ty * 7, 2654435761) >>> 0);
          if (h % 3 === 0) {
            ctx.fillStyle = PAL.starMid;
            ctx.fillRect(x + (h % T), y + ((h >> 4) % T), 1, 1);
          }
          ctx.fillStyle = "#2c3550";
          ctx.fillRect(x, y, T, 1);
          ctx.fillRect(x, y + T - 1, T, 1);
        } else {
          ctx.fillStyle = (tx + ty) % 2 === 0 ? "#11182b" : "#121a2e";
          ctx.fillRect(x, y, T, T);
          if (ch === "D") {
            ctx.fillStyle = "#1d2b47";
            ctx.fillRect(x + 1, y, T - 2, T);
          }
          const kiosk = KIOSKS.find((k) => k.ch === ch);
          if (kiosk) {
            ctx.fillStyle = "#2c3550";
            ctx.fillRect(x, y + 2, T, T - 2);
            const col = kiosk.ch === "A" ? PAL.warn
              : kiosk.ch === "R" ? "#c7a54a"
              : kiosk.ch === "M" ? PAL.gold
              : kiosk.ch === "Y" ? PAL.hull
              : kiosk.ch === "B" ? PAL.ui
              : PAL.info;
            ctx.fillStyle = col;
            ctx.fillRect(x + 2, y + 4, T - 4, 3);
            // sign glow
            if (Math.floor(g.world.time * 2 + x) % 3 !== 0) {
              ctx.fillRect(x + 3, y + 1, T - 6, 1);
            }
          }
        }
      }
    }

    // NPCs
    for (const n of this.npcs) {
      const x = Math.round(ox + n.x), y = Math.round(oy + n.y);
      ctx.fillStyle = n.skin;
      ctx.fillRect(x - 2, y - 4, 4, 3);
      ctx.fillStyle = n.suit;
      ctx.fillRect(x - 3, y - 1, 6, 5);
    }

    // player
    const px = Math.round(ox + this.px), py = Math.round(oy + this.py);
    ctx.fillStyle = "#e8b48c";
    ctx.fillRect(px - 2, py - 4, 4, 3);
    ctx.fillStyle = "#3a6ea5";
    ctx.fillRect(px - 3, py - 1, 6, 5);

    // NPC name on proximity
    for (const n of this.npcs) {
      if (dist(this.px, this.py, n.x, n.y) < 16) {
        const x = Math.round(ox + n.x), y = Math.round(oy + n.y);
        drawText(ctx, n.name, x - textWidth(n.name) / 2, y - 12, PAL.grey);
      }
    }

    // kiosk tooltip
    const near = this.nearestKiosk();
    if (near) {
      const kx = ox + near.tx * T + T / 2;
      drawText(ctx, near.def.label, kx - textWidth(near.def.label) / 2, oy + near.ty * T - 9, PAL.ui);
      const hint = near.def.tab === null ? "[E] BOARD SHIP + UNDOCK" : "[E] USE";
      drawText(ctx, hint, kx - textWidth(hint) / 2, oy + near.ty * T + T + 3, PAL.gold);
    }

    // header
    drawText(ctx, `${this.station.name.toUpperCase()} - PROMENADE`, 8, 6, PAL.white);
    drawText(ctx, `${fac.name}${this.station.military ? " - MILITARY" : ""}`, 8, 15, fac.color);
    drawText(ctx, "WASD WALK - E USE - ESC SERVICES MENU", VW - textWidth("WASD WALK - E USE - ESC SERVICES MENU") - 6, 6, PAL.greyDark);
    if (this.station.military) {
      drawText(ctx, "ARMED GUARDS WATCH THE DECK", VW - textWidth("ARMED GUARDS WATCH THE DECK") - 6, 15, PAL.danger);
    }

    if (this.msg) {
      drawText(ctx, this.msg, VW / 2 - textWidth(this.msg) / 2, VH - 12, PAL.ui);
    }
    if (g.toastTimer > 0) {
      drawText(ctx, g.toastMsg, VW / 2 - textWidth(g.toastMsg) / 2, VH - 22, PAL.ui);
    }
  }
}
