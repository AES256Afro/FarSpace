import { Game, Scene, VW, VH } from "../game";
import { AWAY_CAPACITY, awayBenefit, awayCrew, awayRole } from "../core/awayteam";
import { sfx } from "../core/sfx";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import type { SurfaceScene } from "./surface";

const PAGE = 6, TOP = 64, ROW = 24;

export class AwayTeamScene implements Scene {
  touchMode = "menu" as const;
  selected: string[] = [];
  original: string[] = [];
  cursor = 0;
  message = "";

  open(g: Game, names: string[]): void {
    this.selected = awayCrew(g.world.player.crew, names).map((c) => c.name);
    this.original = [...this.selected];
    this.cursor = 0; this.message = "";
    g.setScene("awayteam");
  }

  finish(g: Game, names: string[]): void {
    (g.scenes.surface as SurfaceScene).setAwayTeam(g, names);
    g.setScene("surface");
    sfx.select();
  }

  update(g: Game): void {
    const inp = g.input;
    const crew = g.world.player.crew.filter((c) => !c.sick);
    const total = crew.length + 1;
    if (inp.wasPressed("Escape")) { this.finish(g, this.original); return; }
    if (inp.mousePressed && inp.mouseY >= 234 && inp.mouseY < 249 && inp.mouseX >= 24 && inp.mouseX < 235) {
      this.finish(g, this.selected); return;
    }
    if (inp.mousePressed && inp.mouseY >= 211 && inp.mouseY < 227) {
      if (inp.mouseX >= 340 && inp.mouseX < 393) this.cursor = Math.max(0, (Math.floor(this.cursor / PAGE) - 1) * PAGE);
      if (inp.mouseX >= 396 && inp.mouseX < 456) this.cursor = Math.min(total - 1, (Math.floor(this.cursor / PAGE) + 1) * PAGE);
    }
    if (inp.wasPressed("ArrowUp") || inp.wheel < 0) this.cursor = (this.cursor + total - 1) % total;
    if (inp.wasPressed("ArrowDown") || inp.wheel > 0) this.cursor = (this.cursor + 1) % total;
    const start = Math.floor(this.cursor / PAGE) * PAGE;
    const row = Math.floor((inp.mouseY - TOP) / ROW);
    const clicked = inp.mousePressed && inp.mouseX >= 24 && inp.mouseX < VW - 24 && row >= 0 && row < PAGE && start + row < total;
    if (clicked) this.cursor = start + row;
    if (inp.wasPressed("Enter") || inp.wasPressed(" ") || clicked) {
      if (this.cursor === crew.length) { this.finish(g, this.selected); return; }
      const name = crew[this.cursor]?.name;
      if (!name) return;
      if (this.selected.includes(name)) this.selected = this.selected.filter((n) => n !== name);
      else if (this.selected.length < AWAY_CAPACITY) this.selected.push(name);
      else { this.message = "TWO SEATS. TAKE SOMEONE OFF THE LIST FIRST."; sfx.blip(); return; }
      this.message = ""; sfx.blip();
    }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#080c16"; ctx.fillRect(0, 0, VW, VH);
    drawText(ctx, "WHO COMES DOWN?", 24, 18, PAL.gold);
    drawText(ctx, "UP TO TWO FIT CREW. THE ROVER HAS FOLDING SEATS.", 24, 32, PAL.white);
    drawText(ctx, "THE ENGINEER HAS AN OPINION ABOUT WHO INSTALLED THEM.", 24, 42, PAL.grey);
    const crew = g.world.player.crew.filter((c) => !c.sick);
    const start = Math.floor(this.cursor / PAGE) * PAGE;
    for (let i = start; i < Math.min(crew.length + 1, start + PAGE); i++) {
      const y = TOP + (i - start) * ROW;
      if (i === this.cursor) { ctx.fillStyle = "#17243b"; ctx.fillRect(24, y, VW - 48, ROW - 2); }
      if (i === crew.length) {
        drawText(ctx, `> ${this.selected.length ? "BACK TO THE ROVER" : "GO ALONE"}`, 30, y + 4, PAL.gold);
        drawText(ctx, "CONFIRM THIS TEAM", 42, y + 13, PAL.grey);
      } else {
        const c = crew[i], selected = this.selected.includes(c.name);
        drawText(ctx, `${selected ? "[X]" : "[ ]"} ${c.name.toUpperCase()} (${awayRole(c)})`.slice(0, 78), 30, y + 4, selected ? PAL.ui : PAL.white);
        drawText(ctx, awayBenefit(c).toUpperCase(), 48, y + 13, PAL.grey);
      }
    }
    drawText(ctx, `${this.selected.length}/${AWAY_CAPACITY} SELECTED    PAGE ${Math.floor(start / PAGE) + 1}/${Math.ceil((crew.length + 1) / PAGE)}`, 24, 216, PAL.ui);
    drawText(ctx, "< PREV     NEXT >", 340, 216, PAL.grey);
    ctx.fillStyle = "#17243b"; ctx.fillRect(24, 234, 211, 15);
    drawText(ctx, this.selected.length ? "BACK TO THE ROVER" : "GO ALONE", 30, 238, PAL.gold);
    if (this.message) drawText(ctx, "TWO SEATS. REMOVE SOMEONE FIRST.", 240, 238, PAL.warn);
    const help = "ARROWS / WHEEL MOVE   ENTER / CLICK SELECT   ESC CANCEL";
    drawText(ctx, help, VW / 2 - textWidth(help) / 2, VH - 14, PAL.grey);
  }
}
