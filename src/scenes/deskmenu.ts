import type { Input } from "../core/input";
import { ListView } from "../core/listview";
import { clippedText, contains, mapButton, type Rect } from "../core/mapview";
import { drawText } from "../gfx/font";
import { PAL } from "../gfx/palette";

const ROWS = { x: 48, y: 70, width: 384, rowHeight: 20 };
const PREV = { x: 48, y: 195, w: 68, h: 17 }, NEXT = { x: 364, y: 195, w: 68, h: 17 };
export const DESK_ACTION = { x: 48, y: 219, w: 120, h: 17 };
export const DESK_SELL = { x: 176, y: 219, w: 120, h: 17 };
export const DESK_INFO = { x: 304, y: 219, w: 128, h: 17 };
export const DESK_CLOSE = { x: 356, y: 42, w: 76, h: 17 };
export const deskClick = (input: Input, rect: Rect): boolean => input.mousePressed && contains(rect, input.mouseX, input.mouseY);

// This component owns list geometry and input. Its caller owns every action.
export class DeskMenu<K> {
  view = new ListView<K>(6);
  private drawn: K[] = [];

  update(keys: readonly K[], input: Input): boolean {
    const previous = this.view.selected;
    this.view.sync(keys);
    const removed = previous !== undefined && !keys.includes(previous);
    if (input.wasPressed("ArrowUp")) this.view.move(-1);
    if (input.wasPressed("ArrowDown")) this.view.move(1);
    if (input.wheel) this.view.move(Math.sign(input.wheel) * 3);
    if (input.wasPressed("PageUp") || deskClick(input, PREV)) this.view.page(-1);
    if (input.wasPressed("PageDown") || deskClick(input, NEXT)) this.view.page(1);
    if (input.wasPressed("Home")) this.view.select(0);
    if (input.wasPressed("End")) this.view.select(keys.length - 1);
    if (input.mousePressed && contains({ x: ROWS.x, y: ROWS.y, w: ROWS.width, h: ROWS.rowHeight * this.view.pageSize }, input.mouseX, input.mouseY)) {
      const key = this.drawn[Math.floor((input.mouseY - ROWS.y) / ROWS.rowHeight)];
      const index = key === undefined ? -1 : keys.indexOf(key);
      if (index >= 0) this.view.select(index);
      return false;
    }
    return !removed;
  }

  draw(ctx: CanvasRenderingContext2D, title: string, status: string, row: (key: K) => { title: string; detail: string; right?: string }, empty: string): void {
    ctx.fillStyle = "rgba(8,12,22,0.98)"; ctx.fillRect(40, 36, 400, 220);
    ctx.strokeStyle = PAL.uiBorder; ctx.strokeRect(40.5, 36.5, 399, 219);
    drawText(ctx, clippedText(title, 300), 48, 47, PAL.white);
    mapButton(ctx, DESK_CLOSE, "ESC CLOSE");
    drawText(ctx, clippedText(status, 384), 48, 61, PAL.gold);
    this.drawn = this.view.keys.slice(this.view.offset, this.view.end);
    this.drawn.forEach((key, index) => {
      const y = ROWS.y + index * ROWS.rowHeight, item = row(key);
      if (key === this.view.selected) { ctx.fillStyle = "#132b43"; ctx.fillRect(ROWS.x, y, ROWS.width, ROWS.rowHeight); }
      drawText(ctx, clippedText(item.title, item.right ? 202 : 376), 52, y + 3, key === this.view.selected ? PAL.white : PAL.ui);
      if (item.right) drawText(ctx, clippedText(item.right, 172), 256, y + 3, PAL.gold);
      drawText(ctx, clippedText(item.detail, 376), 52, y + 12, PAL.grey);
    });
    if (!this.drawn.length) drawText(ctx, clippedText(empty, 376), 52, 78, PAL.grey);
    mapButton(ctx, PREV, "PAGE UP"); mapButton(ctx, NEXT, "PAGE DOWN");
    drawText(ctx, `${this.view.keys.length ? this.view.offset + 1 : 0}-${this.view.end} OF ${this.view.keys.length}`, 190, 201, PAL.grey);
    drawText(ctx, "UP/DOWN OR WHEEL: SELECT   HOME/END: FIRST/LAST", 48, 244, PAL.greyDark);
  }
}
