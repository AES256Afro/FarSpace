// The chronicle room: the whole career as a scrollable page, in-game. The same
// text the X key exports, wrapped to the screen.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { chronicleText } from "../world";
import * as wire from "../core/wire";

function wrap(line: string, max = 90): string[] {
  if (line.length <= max) return [line];
  const out: string[] = []; let cur = "";
  for (const wd of line.split(" ")) { if ((cur + " " + wd).trim().length > max) { out.push(cur.trim()); cur = "  " + wd; } else cur = cur ? cur + " " + wd : wd; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export class ChronicleScene implements Scene {
  touchMode = "menu" as const;
  scroll = 0;
  lines: string[] = [];
  enter(g: Game): void {
    this.scroll = 0;
    this.lines = chronicleText(g.world, wire.getCallsign()).split("\n").flatMap((l) => wrap(l.toUpperCase()));
  }
  update(g: Game, dt: number): void {
    void dt;
    if (g.input.wasPressed("Escape") || g.input.wasPressed("Enter") || g.input.mousePressed) { const back = g.settingsReturn; g.settingsReturn = "title"; if (back === "flight") (g.scenes.flight as unknown as { resumeNext: boolean }).resumeNext = true; g.setScene(back); return; }
    const max = Math.max(0, this.lines.length * 8 - (VH - 44));
    if (g.input.wasPressed("ArrowDown")) this.scroll = Math.min(max, this.scroll + 24);
    if (g.input.wasPressed("ArrowUp")) this.scroll = Math.max(0, this.scroll - 24);
    if (g.input.wheel) this.scroll = Math.max(0, Math.min(max, this.scroll + g.input.wheel * 24));
  }
  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    void g;
    ctx.fillStyle = PAL.uiPanel; ctx.fillRect(0, 0, VW, VH);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 18, VW, VH - 34); ctx.clip();
    this.lines.forEach((l, i) => { const y = 24 + i * 8 - this.scroll; if (y > 10 && y < VH) drawText(ctx, l, 12, y, i === 0 ? PAL.white : l.endsWith(":") ? PAL.ui : PAL.grey); });
    ctx.restore();
    ctx.fillStyle = PAL.uiPanel; ctx.fillRect(0, 0, VW, 18); ctx.fillRect(0, VH - 16, VW, 16);
    drawText(ctx, "THE CHRONICLE - UP/DOWN OR WHEEL TO SCROLL", 12, 8, PAL.white);
    drawText(ctx, "ESC BACK", VW - textWidth("ESC BACK") - 12, 8, PAL.greyDark);
    drawText(ctx, "X ON THE RECORD TAB SAVES THIS AS A TEXT FILE", 12, VH - 12, PAL.greyDark);
  }
}
