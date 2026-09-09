// Title screen.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { genPlanet } from "../gfx/sprites";
import { RNG } from "../core/rng";
import { sfx } from "../core/sfx";

export class TitleScene implements Scene {
  touchMode = "menu" as const;
  t = 0;
  cursor = 0;

  options(g: Game): { label: string; sub: string; act: () => void }[] {
    const opts: { label: string; sub: string; act: () => void }[] = [];
    if (g.hasSave()) opts.push({ label: "CONTINUE", sub: "Pick up where you left off", act: () => g.setScene(g.world.player.dockedAt ? "station" : "flight") });
    opts.push({ label: "NEW GAME - SOL NEIGHBOURHOOD", sub: "The real stars within 20 light-years", act: () => { g.newGame(true); g.setScene("flight"); } });
    opts.push({ label: "NEW GAME - UNCHARTED", sub: "A procedural galaxy", act: () => { g.newGame(false); g.setScene("flight"); } });
    return opts;
  }

  update(g: Game, dt: number): void {
    this.t += dt;
    const opts = this.options(g);
    if (g.input.wasPressed("ArrowUp")) { this.cursor = (this.cursor + opts.length - 1) % opts.length; sfx.blip(); }
    if (g.input.wasPressed("ArrowDown")) { this.cursor = (this.cursor + 1) % opts.length; sfx.blip(); }
    let clicked = false;
    for (let i = 0; i < opts.length; i++) {
      const y = 136 + i * 18;
      if (g.input.mouseY >= y - 4 && g.input.mouseY < y + 12) {
        this.cursor = i;
        if (g.input.mousePressed) clicked = true;
      }
    }
    if (clicked || g.input.wasPressed("Enter") || g.input.wasPressed(" ")) {
      sfx.select();
      opts[this.cursor].act();
    }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(g.nebulaSprite("title"), 0, 0);
    ctx.globalAlpha = 1;
    for (let i = 0; i < 120; i++) {
      const hx = (Math.imul(i + 3, 2654435761) >>> 0) % VW;
      const hy = (Math.imul(i + 11, 1597334677) >>> 0) % VH;
      const tw = Math.sin(this.t * 2 + i) > 0.7;
      ctx.fillStyle = tw ? PAL.starBright : i % 5 === 0 ? PAL.starMid : PAL.starDim;
      ctx.fillRect(hx, hy, 1, 1);
    }
    {
      const pl = g.sprite("title-planet", () => genPlanet(new RNG(0x717713), 70, 0));
      ctx.drawImage(pl, VW - 110, VH - 110);
    }
    {
      const ship = g.playerShip();
      const sx = ((this.t * 14) % (VW + 80)) - 40;
      const sy = 44 + Math.sin(this.t * 0.6) * 6;
      ctx.drawImage(ship, Math.round(sx) - 12, Math.round(sy) - 12);
      if (Math.floor(this.t * 10) % 2 === 0) { ctx.fillStyle = PAL.thrust; ctx.fillRect(Math.round(sx) - 14, Math.round(sy), 2, 1); }
    }
    const title = "FARSPACE";
    const sc = 4;
    const tw = textWidth(title) * sc;
    ctx.save(); ctx.translate(VW / 2 - tw / 2 + 2, 62); ctx.scale(sc, sc); ctx.globalAlpha = 0.25; drawText(ctx, title, 0, 0, PAL.info); ctx.restore();
    ctx.save(); ctx.translate(VW / 2 - tw / 2, 60); ctx.scale(sc, sc); drawText(ctx, title, 0, 0, PAL.ui); ctx.restore();
    const sub = "FLY - TRADE - MINE - FIGHT";
    drawText(ctx, sub, VW / 2 - textWidth(sub) / 2, 100, PAL.grey);

    const opts = this.options(g);
    opts.forEach((o, i) => {
      const y = 136 + i * 18;
      const sel = i === this.cursor;
      if (sel && Math.floor(this.t * 3) % 2 === 0) drawText(ctx, ">", VW / 2 - textWidth(o.label) / 2 - 10, y, PAL.gold);
      drawText(ctx, o.label, VW / 2 - textWidth(o.label) / 2, y, sel ? PAL.white : PAL.greyDark);
      if (sel) drawText(ctx, o.sub, VW / 2 - textWidth(o.sub) / 2, y + 8, PAL.uiDim);
    });
    const ver = "V0.6 - MILESTONES 1-6";
    drawText(ctx, ver, VW / 2 - textWidth(ver) / 2, VH - 26, PAL.greyDark);
    const keys = "WSAD FLY - SPACE FIRE - M MINE - E DOCK/JUMP - TAB MAP - TOUCH SUPPORTED";
    drawText(ctx, keys, VW / 2 - textWidth(keys) / 2, VH - 14, PAL.uiDim);
  }
}
