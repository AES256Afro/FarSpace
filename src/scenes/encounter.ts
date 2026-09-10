// Encounter card: pauses the world, shows a situation and two or three choices,
// then the outcome. Returns to whatever scene raised it.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { sfx } from "../core/sfx";
import { RNG } from "../core/rng";
import type { Encounter } from "../data/encounters";

export function wrap(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      if ((line + " " + word).trim().length > maxChars) { out.push(line.trim()); line = word; }
      else line = (line + " " + word).trim();
    }
    if (line) out.push(line);
  }
  return out;
}

export class EncounterScene implements Scene {
  touchMode = "menu" as const;
  enc!: Encounter;
  returnTo = "flight";
  cursor = 0;
  outcome: string | null = null;
  rowBoxes: [number, number][] = [];

  story = false;
  open(g: Game, enc: Encounter, returnTo: string, story = false): void {
    this.enc = enc; this.returnTo = returnTo; this.cursor = 0; this.outcome = null; this.story = story;
    const p = g.world.player;
    if (!story) { p.encounters ??= {}; p.encounters[enc.id] = (p.encounters[enc.id] ?? 0) + 1; }
    g.setScene("encounter");
    sfx.alarm();
  }

  options(g: Game) { return this.enc.options.filter((o) => !o.requires || o.requires(g)); }

  update(g: Game, dt: number): void {
    void dt;
    const inp = g.input;
    if (this.outcome !== null) {
      if (inp.wasPressed("Enter") || inp.wasPressed("Escape") || inp.wasPressed(" ") || inp.mousePressed) { g.setScene(this.returnTo); }
      return;
    }
    const opts = this.options(g);
    if (inp.wasPressed("ArrowUp")) { this.cursor = (this.cursor + opts.length - 1) % opts.length; sfx.blip(); }
    if (inp.wasPressed("ArrowDown")) { this.cursor = (this.cursor + 1) % opts.length; sfx.blip(); }
    const row = this.rowBoxes.findIndex(([y0, y1]) => inp.mouseY >= y0 && inp.mouseY <= y1);
    if (row >= 0 && inp.mouseX > 40 && inp.mouseX < VW - 40) this.cursor = row;
    if (inp.wasPressed("Enter") || (inp.mousePressed && row >= 0)) {
      const o = opts[this.cursor];
      if (!o) return;
      const rng = new RNG((g.world.seed ^ Math.floor(g.world.time * 7) ^ this.enc.id.length) >>> 0);
      const out = o.result(g, rng);
      sfx.select();
      if (!out) { g.setScene(this.returnTo); return; } // a plain CONTINUE
      this.outcome = out;
    }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    // keep the world visible underneath, dimmed
    const under = g.scenes[this.returnTo];
    if (under) under.draw(g, ctx);
    ctx.fillStyle = "rgba(5,6,10,0.72)"; ctx.fillRect(0, 0, VW, VH);
    const w = 380, x = VW / 2 - w / 2;
    const body = wrap(this.enc.text, 72);
    const opts = this.options(g);
    const h = 30 + body.length * 9 + (this.outcome !== null ? wrap(this.outcome, 72).length * 9 + 22 : opts.length * 18 + 8);
    const y = Math.max(20, VH / 2 - h / 2);
    ctx.fillStyle = "#0c1220"; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = PAL.uiBorder; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    drawText(ctx, this.enc.title, x + 10, y + 8, this.story ? PAL.info : PAL.gold);
    let yy = y + 22;
    for (const l of body) { drawText(ctx, l, x + 10, yy, PAL.grey); yy += 9; }
    yy += 6;
    this.rowBoxes = [];
    if (this.outcome !== null) {
      for (const l of wrap(this.outcome, 72)) { drawText(ctx, l, x + 10, yy, PAL.white); yy += 9; }
      drawText(ctx, "ENTER TO CONTINUE", x + w - textWidth("ENTER TO CONTINUE") - 10, yy + 6, PAL.greyDark);
      return;
    }
    opts.forEach((o, i) => {
      this.rowBoxes.push([yy - 2, yy + 14]);
      if (i === this.cursor) { ctx.fillStyle = "#13203a"; ctx.fillRect(x + 6, yy - 2, w - 12, 16); }
      drawText(ctx, `${i === this.cursor ? ">" : " "} ${o.label}`, x + 10, yy, i === this.cursor ? PAL.white : PAL.ui);
      if (o.hint) drawText(ctx, o.hint.toUpperCase(), x + 18, yy + 8, PAL.greyDark);
      yy += 18;
    });
  }
}
