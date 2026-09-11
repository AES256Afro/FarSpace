import type { Input } from "./input";
import { clamp } from "./mathx";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";

export interface Rect { x: number; y: number; w: number; h: number }
export interface MapPoint { x: number; y: number }
export const MAP_RECT: Rect = { x: 8, y: 32, w: 296, h: 194 };
export const PANEL_RECT: Rect = { x: 312, y: 32, w: 160, h: 194 };
export function contains(r: Rect, x: number, y: number): boolean { return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }
export function overlaps(a: Rect, b: Rect): boolean { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
export function clippedText(text: string, width: number): string {
  if (textWidth(text) <= width) return text;
  while (text.length && textWidth(`${text}..`) > width) text = text.slice(0, -1);
  return `${text}..`;
}

export class MapCamera {
  x = 0; y = 0; scale = 1; baseScale = 1;
  dragging = false;
  private lastX = 0; private lastY = 0;
  fit(points: MapPoint[], rect = MAP_RECT): void {
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.min(...xs, 0), maxX = Math.max(...xs, 1), minY = Math.min(...ys, 0), maxY = Math.max(...ys, 1);
    this.x = (minX + maxX) / 2; this.y = (minY + maxY) / 2;
    this.scale = this.baseScale = Math.min((rect.w - 44) / Math.max(1, maxX - minX), (rect.h - 36) / Math.max(1, maxY - minY));
    this.dragging = false;
  }
  project(point: MapPoint, rect = MAP_RECT): MapPoint { return { x: rect.x + rect.w / 2 + (point.x - this.x) * this.scale, y: rect.y + rect.h / 2 + (point.y - this.y) * this.scale }; }
  unproject(point: MapPoint, rect = MAP_RECT): MapPoint { return { x: this.x + (point.x - rect.x - rect.w / 2) / this.scale, y: this.y + (point.y - rect.y - rect.h / 2) / this.scale }; }
  zoom(factor: number, anchor: MapPoint, rect = MAP_RECT): void {
    const before = this.unproject(anchor, rect);
    this.scale = clamp(this.scale * factor, this.baseScale * 0.6, this.baseScale * 12);
    const after = this.unproject(anchor, rect);
    this.x += before.x - after.x; this.y += before.y - after.y;
  }
  update(inp: Input, dt: number, rect = MAP_RECT): void {
    const inside = contains(rect, inp.mouseX, inp.mouseY);
    if (inside && inp.wheel) this.zoom(Math.pow(1.22, -inp.wheel), { x: inp.mouseX, y: inp.mouseY }, rect);
    if (inp.wasPressed("=") || inp.wasPressed("+")) this.zoom(1.3, { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, rect);
    if (inp.wasPressed("-")) this.zoom(1 / 1.3, { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, rect);
    if (inp.mouseRightPressed && inside) { this.dragging = true; this.lastX = inp.mouseX; this.lastY = inp.mouseY; }
    if (!inp.mouseRight) this.dragging = false;
    if (this.dragging) {
      this.x -= (inp.mouseX - this.lastX) / this.scale; this.y -= (inp.mouseY - this.lastY) / this.scale;
      this.lastX = inp.mouseX; this.lastY = inp.mouseY;
    }
    const step = 100 * dt / this.scale;
    if (inp.isDown("ArrowLeft")) this.x -= step;
    if (inp.isDown("ArrowRight")) this.x += step;
    if (inp.isDown("ArrowUp")) this.y -= step;
    if (inp.isDown("ArrowDown")) this.y += step;
  }
}

export interface MapLabel { id: string; text: string; x: number; y: number; color: string; priority: number }
export interface PlacedLabel extends MapLabel { box: Rect }
export function placeMapLabels(labels: MapLabel[], rect = MAP_RECT): PlacedLabel[] {
  const visible = labels.filter(l => contains(rect, l.x, l.y));
  const occupied: Rect[] = visible.map(l => ({ x: l.x - 4, y: l.y - 4, w: 8, h: 8 }));
  const placed: PlacedLabel[] = [];
  for (const l of [...visible].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
    const width = textWidth(l.text) + 4;
    const candidates = [
      { x: l.x + 7, y: l.y - 4 }, { x: l.x - width - 7, y: l.y - 4 },
      { x: l.x - width / 2, y: l.y + 7 }, { x: l.x - width / 2, y: l.y - 15 },
    ];
    const box = candidates.map(p => ({ ...p, w: width, h: 10 })).find(b => b.x >= rect.x + 1 && b.y >= rect.y + 1 && b.x + b.w <= rect.x + rect.w - 1 && b.y + b.h <= rect.y + rect.h - 1 && !occupied.some(o => overlaps(b, o)));
    if (!box) continue;
    occupied.push(box); placed.push({ ...l, box });
  }
  return placed;
}
export function drawMapLabels(ctx: CanvasRenderingContext2D, labels: MapLabel[]): PlacedLabel[] {
  const placed = placeMapLabels(labels);
  for (const l of placed) {
    ctx.fillStyle = "#080d17"; ctx.fillRect(l.box.x, l.box.y, l.box.w, l.box.h);
    drawText(ctx, l.text, l.box.x + 2, l.box.y + 2, l.color);
  }
  return placed;
}
export function mapFrame(ctx: CanvasRenderingContext2D, title: string, subtitle: string): void {
  ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, 480, 270);
  drawText(ctx, title, 10, 7, PAL.white); drawText(ctx, subtitle, 10, 19, PAL.grey);
  for (const rect of [MAP_RECT, PANEL_RECT]) {
    ctx.fillStyle = "#080d17"; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = PAL.uiBorder; ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  }
  ctx.strokeStyle = "#10192b";
  for (let x = MAP_RECT.x + 24; x < MAP_RECT.x + MAP_RECT.w; x += 24) { ctx.beginPath(); ctx.moveTo(x, MAP_RECT.y); ctx.lineTo(x, MAP_RECT.y + MAP_RECT.h); ctx.stroke(); }
  for (let y = MAP_RECT.y + 24; y < MAP_RECT.y + MAP_RECT.h; y += 24) { ctx.beginPath(); ctx.moveTo(MAP_RECT.x, y); ctx.lineTo(MAP_RECT.x + MAP_RECT.w, y); ctx.stroke(); }
}
export function mapButton(ctx: CanvasRenderingContext2D, rect: Rect, text: string, active = false): void {
  ctx.fillStyle = active ? "#244158" : "#142338"; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = active ? PAL.ui : PAL.uiBorder; ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  drawText(ctx, clippedText(text, rect.w - 8), rect.x + 4, rect.y + 4, active ? PAL.white : PAL.ui);
}
