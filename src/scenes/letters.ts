import type { Game, Scene } from "../game";
import { VW, VH } from "../game";
import { clamp } from "../core/mathx";
import { drawText } from "../gfx/font";
import { PAL } from "../gfx/palette";
import type { Letter } from "../world";
import type { StationScene } from "./station";
import { wrap } from "./encounter";

const VISIBLE_LINES = 18;

export class LettersScene implements Scene {
  touchMode = "menu" as const;
  mail: Letter[] = [];
  cursor = 0;
  scroll = 0;
  returnTab = 0;
  returnTo: "flight" | "stationwalk" = "flight";

  open(g: Game, index = 0): void {
    const station = g.scenes.station as StationScene;
    this.returnTab = station.tab; this.returnTo = station.returnTo;
    this.cursor = index;
    g.setScene("letters");
  }

  enter(g: Game): void {
    this.mail = [...(g.world.player.mail ?? [])].reverse();
    this.cursor = clamp(this.cursor, 0, Math.max(0, this.mail.length - 1));
    this.scroll = 0; this.markRead(g);
  }

  markRead(g: Game): void {
    const letter = this.mail[this.cursor];
    if (letter && !letter.read) { letter.read = true; g.autosave(); }
  }

  lines(): string[] { return wrap(this.mail[this.cursor]?.text.toUpperCase() ?? "NO LETTERS HAVE ARRIVED.", 108); }
  maxScroll(): number { return Math.max(0, this.lines().length - VISIBLE_LINES); }

  leave(g: Game): void {
    g.setScene("station");
    const station = g.scenes.station as StationScene;
    station.tab = this.returnTab; station.returnTo = this.returnTo;
  }

  update(g: Game): void {
    const inp = g.input;
    const click = (x0: number, x1: number) => inp.mousePressed && inp.mouseX >= x0 && inp.mouseX < x1 && inp.mouseY >= 236 && inp.mouseY < 251;
    if (inp.wasPressed("Escape") || inp.wasPressed("l") || click(370, 468)) { this.leave(g); return; }
    if (inp.wasPressed("F5")) g.save();
    if (inp.wasPressed("F9")) { g.load(); return; }
    const delta = Number(inp.wasPressed("ArrowRight") || click(108, 200)) - Number(inp.wasPressed("ArrowLeft") || click(12, 104));
    if (delta) {
      const next = clamp(this.cursor + delta, 0, Math.max(0, this.mail.length - 1));
      if (next !== this.cursor) { this.cursor = next; this.scroll = 0; this.markRead(g); }
    }
    const scroll = Number(inp.wasPressed("ArrowDown") || click(287, 366)) - Number(inp.wasPressed("ArrowUp") || click(204, 283))
      + (Number(inp.wasPressed("PageDown")) - Number(inp.wasPressed("PageUp"))) * VISIBLE_LINES
      + Math.sign(inp.wheel) * 3;
    this.scroll = clamp(this.scroll + scroll, 0, this.maxScroll());
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = PAL.uiPanel; ctx.fillRect(0, 0, VW, VH);
    const letter = this.mail[this.cursor];
    drawText(ctx, this.mail.length ? `LETTERS - ${this.cursor + 1}/${this.mail.length} - NEWEST FIRST` : "LETTERS", 12, 9, PAL.gold);
    for (const [i, line] of wrap(`FROM: ${letter?.from.toUpperCase() ?? "THE POST IS QUIET"}`, 108).slice(0, 2).entries()) drawText(ctx, line, 12, 23 + i * 9, PAL.white);
    ctx.fillStyle = PAL.uiBorder; ctx.fillRect(12, 46, VW - 24, 1);
    const lines = this.lines();
    for (const [i, line] of lines.slice(this.scroll, this.scroll + VISIBLE_LINES).entries()) drawText(ctx, line, 12, 55 + i * 9, PAL.grey);
    drawText(ctx, this.maxScroll() ? `LINES ${this.scroll + 1}-${Math.min(lines.length, this.scroll + VISIBLE_LINES)}/${lines.length} - UP/DOWN OR WHEEL SCROLL` : "END OF LETTER", 12, 224, PAL.greyDark);
    const buttons: [number, string, boolean][] = [[12, "[ NEWER ]", this.cursor > 0], [108, "[ OLDER ]", this.cursor < this.mail.length - 1], [204, "[ UP ]", this.scroll > 0], [287, "[ DOWN ]", this.scroll < this.maxScroll()], [370, "[ CLOSE ]", true]];
    for (const [x, label, enabled] of buttons) drawText(ctx, label, x, 240, enabled ? PAL.ui : PAL.greyDark);
    drawText(ctx, "LEFT/RIGHT: LETTER   UP/DOWN: SCROLL   ESC: NEWS", 12, 258, PAL.greyDark);
    void g;
  }
}
