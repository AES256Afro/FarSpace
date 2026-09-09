// Title screen.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { genPlanet } from "../gfx/sprites";
import { RNG } from "../core/rng";
import { sfx } from "../core/sfx";
import * as cloud from "../core/cloud";
import { music } from "../core/music";

export class TitleScene implements Scene {
  touchMode = "menu" as const;
  t = 0;
  cursor = 0;

  options(g: Game): { label: string; sub: string; act: () => void }[] {
    const opts: { label: string; sub: string; act: () => void }[] = [];
    const code = cloud.getCode();
    if (g.hasSave()) opts.push({ label: "CONTINUE", sub: code ? "Loads whichever of local / cloud is newer" : "Pick up where you left off", act: () => { void g.continueGame(); } });
    opts.push({ label: "NEW GAME - SOL NEIGHBOURHOOD", sub: "The real stars within 20 light-years", act: () => { g.newGame(true); g.setScene("flight"); } });
    opts.push({ label: "NEW GAME - UNCHARTED", sub: "A procedural galaxy", act: () => { g.newGame(false); g.setScene("flight"); } });
    if (code) {
      opts.push({ label: `CLOUD: ${code}`, sub: "F5 in game saves here too. Enter this code on another device to link it", act: () => { g.toast(`YOUR CODE: ${code}`); } });
      opts.push({ label: "CLOUD: DOWNLOAD LATEST", sub: "Replace the local save with the cloud copy", act: () => { void this.download(g, code); } });
      opts.push({ label: "CLOUD: UNLINK THIS DEVICE", sub: "Forget the code here; the cloud copy stays", act: () => { cloud.setCode(null); g.toast("UNLINKED"); this.cursor = 0; } });
    } else {
      opts.push({ label: "CLOUD: CREATE SAVE CODE", sub: "Get a code; your saves then follow you between devices", act: () => { const c = cloud.newCode(); g.toast(`CODE ${c} - SAVE (F5) TO UPLOAD`); } });
      opts.push({ label: "CLOUD: LINK WITH A CODE", sub: "Enter a code from another device", act: () => { void this.link(g); } });
    }
    opts.push({ label: "EXPORT SAVE FILE", sub: "Download the current save as JSON", act: () => { cloud.exportFile(g.world); g.toast("SAVE FILE DOWNLOADED"); } });
    opts.push({ label: "IMPORT SAVE FILE", sub: "Load a save JSON from this device", act: () => { void this.importFile(g); } });
    return opts;
  }

  async link(g: Game): Promise<void> {
    const raw = window.prompt("Enter your FarSpace cloud code:");
    if (!raw) return;
    const code = raw.trim().toUpperCase();
    if (!cloud.validCode(code)) { g.toast("THAT DOESN'T LOOK LIKE A CODE"); return; }
    g.toast("LOOKING UP...");
    const r = await cloud.pull(code);
    if (!r) { g.toast("NO SAVE FOUND FOR THAT CODE"); return; }
    cloud.setCode(code);
    g.toast("LINKED - LOADING CLOUD SAVE");
    g.adoptWorld(r.world);
  }

  async download(g: Game, code: string): Promise<void> {
    g.toast("DOWNLOADING...");
    const r = await cloud.pull(code);
    if (!r) { g.toast("NOTHING IN THE CLOUD YET - PRESS F5 IN GAME TO UPLOAD"); return; }
    g.adoptWorld(r.world);
  }

  async importFile(g: Game): Promise<void> {
    const w = await cloud.importFile();
    if (!w) { g.toast("NO VALID SAVE FILE CHOSEN"); return; }
    g.toast("SAVE FILE LOADED");
    g.adoptWorld(w);
  }

  update(g: Game, dt: number): void {
    this.t += dt;
    music.setMood("title", 0);
    const opts = this.options(g);
    if (g.input.wasPressed("ArrowUp")) { this.cursor = (this.cursor + opts.length - 1) % opts.length; sfx.blip(); }
    if (g.input.wasPressed("ArrowDown")) { this.cursor = (this.cursor + 1) % opts.length; sfx.blip(); }
    let clicked = false;
    for (let i = 0; i < opts.length; i++) {
      const y = 112 + i * 13;
      if (g.input.mouseY >= y - 3 && g.input.mouseY < y + 10) {
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
    const tag = "FLY - TRADE - MINE - FIGHT";
    drawText(ctx, tag, VW / 2 - textWidth(tag) / 2, 98, PAL.grey);

    const opts = this.options(g);
    opts.forEach((o, i) => {
      const y = 112 + i * 13;
      const sel = i === this.cursor;
      if (sel && Math.floor(this.t * 3) % 2 === 0) drawText(ctx, ">", VW / 2 - textWidth(o.label) / 2 - 10, y, PAL.gold);
      drawText(ctx, o.label, VW / 2 - textWidth(o.label) / 2, y, sel ? PAL.white : PAL.greyDark);
    });
    const sub = opts[this.cursor]?.sub ?? "";
    drawText(ctx, sub, VW / 2 - textWidth(sub) / 2, 112 + opts.length * 13 + 4, PAL.uiDim);
    const ver = `V0.7${g.input.padConnected ? " - GAMEPAD CONNECTED" : ""}`;
    drawText(ctx, ver, VW / 2 - textWidth(ver) / 2, VH - 26, PAL.greyDark);
    const keys = "WSAD FLY - SPACE FIRE - M MINE - E DOCK/JUMP - TAB MAP - H MUSIC - TOUCH + GAMEPAD";
    drawText(ctx, keys, VW / 2 - textWidth(keys) / 2, VH - 14, PAL.uiDim);
  }
}
