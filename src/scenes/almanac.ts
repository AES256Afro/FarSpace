// The handbook: a scrollable page for every system in the game.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { ALMANAC } from "../data/almanac";

export class AlmanacScene implements Scene {
  touchMode = "menu" as const;
  scroll = 0;
  enter(): void { this.scroll = 0; }
  update(g: Game, dt: number): void {
    void dt;
    if (g.input.wasPressed("Escape") || g.input.wasPressed("Enter") || g.input.mousePressed) { const back = g.settingsReturn; g.settingsReturn = "title"; g.setScene(back); return; }
    const total = ALMANAC.reduce((a, [, lines]) => a + 9 + lines.length * 8 + 6, 0);
    const max = Math.max(0, total - (VH - 44));
    if (g.input.wasPressed("ArrowDown")) this.scroll = Math.min(max, this.scroll + 24);
    if (g.input.wasPressed("ArrowUp")) this.scroll = Math.max(0, this.scroll - 24);
    if (g.input.wheel) this.scroll = Math.max(0, Math.min(max, this.scroll + g.input.wheel * 24));
  }
  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    void g;
    ctx.fillStyle = PAL.uiPanel; ctx.fillRect(0, 0, VW, VH);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 18, VW, VH - 34); ctx.clip();
    let y = 24 - this.scroll;
    for (const [title, lines] of ALMANAC) {
      if (y > VH) break;
      if (y + 9 + lines.length * 8 > 18) {
        drawText(ctx, title, 12, y, PAL.ui);
        lines.forEach((l, i) => drawText(ctx, l, 12, y + 9 + i * 8, PAL.grey));
      }
      y += 9 + lines.length * 8 + 6;
    }
    ctx.restore();
    ctx.fillStyle = PAL.uiPanel; ctx.fillRect(0, 0, VW, 18); ctx.fillRect(0, VH - 16, VW, 16);
    drawText(ctx, "HANDBOOK - UP/DOWN OR WHEEL TO SCROLL", 12, 8, PAL.white);
    drawText(ctx, "ESC BACK", VW - textWidth("ESC BACK") - 12, 8, PAL.greyDark);
    drawText(ctx, "THE FULL GUIDE IS DOCS/PLAYING.MD IN THE REPOSITORY", 12, VH - 12, PAL.greyDark);
  }
}
