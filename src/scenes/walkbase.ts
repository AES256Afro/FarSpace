// Shared tile-walking machinery for interiors (ship, station, wreck, outpost).

import type { Game } from "../game";
import { VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { dist } from "../core/mathx";

export const T = 10;

export interface Walker {
  px: number; py: number;
}

export function moveWalker(g: Game, w: Walker, dt: number, solid: (tx: number, ty: number) => boolean, speed = 55): boolean {
  const inp = g.input;
  let dx = 0, dy = 0;
  if (inp.isDown("w")) dy -= 1;
  if (inp.isDown("s")) dy += 1;
  if (inp.isDown("a")) dx -= 1;
  if (inp.isDown("d")) dx += 1;
  if (dx && dy) { dx *= 0.707; dy *= 0.707; }
  const nx = w.px + dx * speed * dt;
  const ny = w.py + dy * speed * dt;
  const hit = (x: number, y: number) =>
    solid(Math.floor((x - 3) / T), Math.floor((y - 3) / T)) ||
    solid(Math.floor((x + 3) / T), Math.floor((y - 3) / T)) ||
    solid(Math.floor((x - 3) / T), Math.floor((y + 3) / T)) ||
    solid(Math.floor((x + 3) / T), Math.floor((y + 3) / T));
  if (!hit(nx, w.py)) w.px = nx;
  if (!hit(w.px, ny)) w.py = ny;
  return dx !== 0 || dy !== 0;
}

export function deckOrigin(deck: string[], yOff = 8): [number, number] {
  return [Math.round(VW / 2 - (deck[0].length * T) / 2), Math.round(VH / 2 - (deck.length * T) / 2) + yOff];
}

export function drawTiles(ctx: CanvasRenderingContext2D, deck: string[], ox: number, oy: number, special: (ch: string, x: number, y: number, tx: number, ty: number) => boolean): void {
  for (let ty = 0; ty < deck.length; ty++) {
    for (let tx = 0; tx < deck[0].length; tx++) {
      const ch = deck[ty][tx];
      const x = ox + tx * T, y = oy + ty * T;
      if (ch === "#") {
        ctx.fillStyle = "#232a3d";
        ctx.fillRect(x, y, T, T);
        ctx.fillStyle = "#2c3550";
        ctx.fillRect(x, y, T, 2);
        continue;
      }
      if (ch === "~") {
        ctx.fillStyle = "#05070f";
        ctx.fillRect(x, y, T, T);
        const h = Math.imul(tx * 31 + ty * 7, 2654435761) >>> 0;
        if (h % 3 === 0) { ctx.fillStyle = PAL.starMid; ctx.fillRect(x + (h % T), y + ((h >> 4) % T), 1, 1); }
        ctx.fillStyle = "#2c3550";
        ctx.fillRect(x, y, T, 1);
        ctx.fillRect(x, y + T - 1, T, 1);
        continue;
      }
      ctx.fillStyle = (tx + ty) % 2 === 0 ? "#11182b" : "#121a2e";
      ctx.fillRect(x, y, T, T);
      if (ch === "D") { ctx.fillStyle = "#1d2b47"; ctx.fillRect(x + 1, y, T - 2, T); continue; }
      if (ch !== ".") special(ch, x, y, tx, ty);
    }
  }
}

export function drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, skin: string, suit: string): void {
  ctx.fillStyle = skin;
  ctx.fillRect(x - 2, y - 4, 4, 3);
  ctx.fillStyle = suit;
  ctx.fillRect(x - 3, y - 1, 6, 5);
}

export function drawKiosk(ctx: CanvasRenderingContext2D, x: number, y: number, col: string, glow: boolean): void {
  ctx.fillStyle = "#2c3550";
  ctx.fillRect(x, y + 2, T, T - 2);
  ctx.fillStyle = col;
  ctx.fillRect(x + 2, y + 4, T - 4, 3);
  if (glow) ctx.fillRect(x + 3, y + 1, T - 6, 1);
}

export function nearestTile(deck: string[], px: number, py: number, chars: string, maxD = 18): { ch: string; tx: number; ty: number } | null {
  let best: { ch: string; tx: number; ty: number } | null = null;
  let bestD = maxD;
  for (let ty = 0; ty < deck.length; ty++) {
    for (let tx = 0; tx < deck[0].length; tx++) {
      const ch = deck[ty][tx];
      if (!chars.includes(ch)) continue;
      const d = dist(px, py, tx * T + T / 2, ty * T + T / 2);
      if (d < bestD) { bestD = d; best = { ch, tx, ty }; }
    }
  }
  return best;
}

export function tooltip(ctx: CanvasRenderingContext2D, ox: number, oy: number, tx: number, ty: number, label: string, hint: string, col: string = PAL.ui): void {
  const kx = ox + tx * T + T / 2;
  drawText(ctx, label, kx - textWidth(label) / 2, oy + ty * T - 9, col);
  drawText(ctx, hint, kx - textWidth(hint) / 2, oy + ty * T + T + 3, PAL.gold);
}

export function footer(ctx: CanvasRenderingContext2D, g: Game, msg: string): void {
  if (msg) drawText(ctx, msg, VW / 2 - textWidth(msg) / 2, VH - 12, PAL.ui);
  if (g.toastTimer > 0) drawText(ctx, g.toastMsg, VW / 2 - textWidth(g.toastMsg) / 2, VH - 22, PAL.ui);
}

// Flood-fill rooms on a deck (floor-ish tiles separated by walls and doors)
export function computeRooms(deck: string[], isFloor: (ch: string) => boolean): number[][] {
  const H = deck.length, W = deck[0].length;
  const room: number[][] = Array.from({ length: H }, () => Array(W).fill(-1));
  let n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (room[y][x] !== -1 || !isFloor(deck[y][x]) || deck[y][x] === "D") continue;
      const stack = [[x, y]];
      room[y][x] = n;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (room[ny][nx] !== -1 || !isFloor(deck[ny][nx]) || deck[ny][nx] === "D") continue;
          room[ny][nx] = n;
          stack.push([nx, ny]);
        }
      }
      n++;
    }
  }
  return room;
}
