import type { Input } from "../core/input";
import { ListView } from "../core/listview";
import { clippedText, contains, mapButton } from "../core/mapview";
import { wrapText } from "../core/text";
import { drawText } from "../gfx/font";
import { PAL } from "../gfx/palette";

export interface OfficeAction { id: string; label: string; detail: string; run: () => string }
const ROWS = { x: 230, y: 43, w: 238, h: 144 }, ROW = 24;
const PREV = { x: 230, y: 192, w: 62, h: 17 }, NEXT = { x: 406, y: 192, w: 62, h: 17 };
const RUN = { x: 230, y: 214, w: 112, h: 17 }, INFO = { x: 350, y: 214, w: 118, h: 17 };
const RECORD = { x: 12, y: 214, w: 202, h: 17 };

export class OfficeMenu {
  view = new ListView<string>(6);
  private drawn: string[] = [];

  update(rows: readonly OfficeAction[], input: Input): "run" | "details" | "record" | undefined {
    const previous = this.view.selected, ids = rows.map(row => row.id);
    this.view.sync(ids);
    const removed = previous !== undefined && !ids.includes(previous);
    const click = (rect: typeof PREV) => input.mousePressed && contains(rect, input.mouseX, input.mouseY);
    if (input.wasPressed("ArrowUp")) this.view.move(-1);
    if (input.wasPressed("ArrowDown")) this.view.move(1);
    if (input.wheel) this.view.move(Math.sign(input.wheel) * 3);
    if (input.wasPressed("PageUp") || click(PREV)) this.view.page(-1);
    if (input.wasPressed("PageDown") || click(NEXT)) this.view.page(1);
    if (input.wasPressed("Home")) this.view.select(0);
    if (input.wasPressed("End")) this.view.select(ids.length - 1);
    if (input.mousePressed && contains(ROWS, input.mouseX, input.mouseY)) {
      const id = this.drawn[Math.floor((input.mouseY - ROWS.y) / ROW)];
      const index = id === undefined ? -1 : ids.indexOf(id);
      if (index >= 0) this.view.select(index);
      return;
    }
    if (input.wasPressed("o") || click(RECORD)) return "record";
    if (removed || this.view.selected === undefined) return;
    if (input.wasPressed("i") || click(INFO)) return "details";
    if (input.wasPressed("Enter") || input.wasPressed(" ") || click(RUN)) return "run";
  }

  draw(ctx: CanvasRenderingContext2D, rows: readonly OfficeAction[], message: string): void {
    this.drawn = this.view.keys.slice(this.view.offset, this.view.end);
    this.drawn.forEach((id, index) => {
      const row = rows.find(row => row.id === id); if (!row) return;
      const selected = id === this.view.selected, y = ROWS.y + index * ROW;
      if (selected) { ctx.fillStyle = "#203446"; ctx.fillRect(ROWS.x, y, ROWS.w, ROW - 2); }
      drawText(ctx, clippedText(row.label, ROWS.w - 8), ROWS.x + 4, y + 4, selected ? PAL.gold : PAL.white);
      drawText(ctx, clippedText(row.detail, ROWS.w - 8), ROWS.x + 4, y + 14, PAL.grey);
    });
    if (!rows.length) drawText(ctx, "NO ACTIONS AVAILABLE", ROWS.x + 4, ROWS.y + 5, PAL.grey);
    mapButton(ctx, PREV, "PAGE UP"); mapButton(ctx, NEXT, "PAGE DOWN");
    drawText(ctx, `${rows.length ? this.view.offset + 1 : 0}-${this.view.end} OF ${rows.length}`, 312, 198, PAL.grey);
    mapButton(ctx, RUN, "ENTER DO THIS"); mapButton(ctx, INFO, "I FULL DETAILS"); mapButton(ctx, RECORD, "O OFFICE RECORD AND REPLY");
    const selected = rows.find(row => row.id === this.view.selected);
    wrapText(message || selected?.detail || "", 112).slice(0, 2).forEach((line, i) => drawText(ctx, line, 12, 238 + i * 8, message ? PAL.ui : PAL.grey));
    drawText(ctx, "ARROWS/WHEEL SELECT  HOME/END FIRST/LAST  ESC DECK  F5 SAVE", 12, 259, PAL.greyDark);
  }
}
