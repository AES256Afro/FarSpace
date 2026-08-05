// Title screen.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { genPlanet } from "../gfx/sprites";
import { RNG } from "../core/rng";

export class TitleScene implements Scene {
  t = 0;
  cursor = 0;

  update(g: Game, dt: number): void {
    this.t += dt;
    const hasSave = !!localStorage.getItem("farspace-save");
    const opts = hasSave ? 2 : 1;
    if (g.input.wasPressed("ArrowUp")) this.cursor = (this.cursor + opts - 1) % opts;
    if (g.input.wasPressed("ArrowDown")) this.cursor = (this.cursor + 1) % opts;
    // mouse: hover to select, click to activate
    let clicked = false;
    for (let i = 0; i < opts; i++) {
      const y = 140 + i * 14;
      if (g.input.mouseY >= y - 3 && g.input.mouseY < y + 9) {
        this.cursor = i;
        if (g.input.mousePressed) clicked = true;
      }
    }
    if (clicked || g.input.wasPressed("Enter") || g.input.wasPressed(" ")) {
      if (this.cursor === 0 && hasSave) {
        g.setScene(g.world.player.dockedAt ? "station" : "flight");
      } else {
        g.newGame();
        g.setScene("flight");
      }
    }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, VW, VH);
    // nebula wash
    ctx.globalAlpha = 0.5;
    ctx.drawImage(g.nebulaSprite("title"), 0, 0);
    ctx.globalAlpha = 1;
    // starfield
    for (let i = 0; i < 120; i++) {
      const hx = (Math.imul(i + 3, 2654435761) >>> 0) % VW;
      const hy = (Math.imul(i + 11, 1597334677) >>> 0) % VH;
      const tw = Math.sin(this.t * 2 + i) > 0.7;
      ctx.fillStyle = tw ? PAL.starBright : i % 5 === 0 ? PAL.starMid : PAL.starDim;
      ctx.fillRect(hx, hy, 1, 1);
    }
    // hero planet rising from the corner
    {
      const pl = g.sprite("title-planet", () => genPlanet(new RNG(0x717713), 70, 0));
      ctx.drawImage(pl, VW - 110, VH - 110);
    }
    // your ship, drifting across on patrol
    {
      const ship = g.playerShip();
      const sx = ((this.t * 14) % (VW + 80)) - 40;
      const sy = 44 + Math.sin(this.t * 0.6) * 6;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.drawImage(ship, -12, -12);
      ctx.restore();
      // engine sparkle
      if (Math.floor(this.t * 10) % 2 === 0) {
        ctx.fillStyle = PAL.thrust;
        ctx.fillRect(Math.round(sx) - 14, Math.round(sy), 2, 1);
      }
    }
    // big pixel logo
    const title = "FARSPACE";
    const sc = 4;
    const tw = textWidth(title) * sc;
    ctx.save();
    ctx.translate(VW / 2 - tw / 2, 60);
    ctx.scale(sc, sc);
    drawText(ctx, title, 0, 0, PAL.ui);
    ctx.restore();
    ctx.save();
    ctx.translate(VW / 2 - tw / 2 + 2, 62);
    ctx.scale(sc, sc);
    ctx.globalAlpha = 0.25;
    drawText(ctx, title, 0, 0, PAL.info);
    ctx.restore();

    const sub = "FLY - TRADE - MINE - FIGHT - WALK YOUR SHIP";
    drawText(ctx, sub, VW / 2 - textWidth(sub) / 2, 100, PAL.grey);

    const hasSave = !!localStorage.getItem("farspace-save");
    const opts = hasSave ? ["CONTINUE", "NEW GAME"] : ["NEW GAME"];
    opts.forEach((o, i) => {
      const y = 140 + i * 14;
      const sel = i === this.cursor;
      if (sel && Math.floor(this.t * 3) % 2 === 0) {
        drawText(ctx, ">", VW / 2 - textWidth(o) / 2 - 10, y, PAL.gold);
      }
      drawText(ctx, o, VW / 2 - textWidth(o) / 2, y, sel ? PAL.white : PAL.greyDark);
    });

    const ver = "V0.1 - MILESTONE 1 VERTICAL SLICE";
    drawText(ctx, ver, VW / 2 - textWidth(ver) / 2, VH - 26, PAL.greyDark);
    const keys = "WSAD FLY - SPACE FIRE - M MINE - E DOCK/JUMP - I BOARD SHIP - TAB MAP";
    drawText(ctx, keys, VW / 2 - textWidth(keys) / 2, VH - 14, PAL.uiDim);
  }
}
