// Title screen.

import { ask, confirmBox } from "../core/dialog";
import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { genPlanet } from "../gfx/sprites";
import { RNG } from "../core/rng";
import { sfx } from "../core/sfx";
import * as cloud from "../core/cloud";
import * as wire from "../core/wire";
import { settings, toggleFullscreen } from "../core/settings";
import { activeSlot } from "../save";
import { music } from "../core/music";

export class TitleScene implements Scene {
  pilots = 0;
  enter(): void { void wire.fetchRooms().then((r) => { this.pilots = r.pilots; }); }
  touchMode = "menu" as const;
  t = 0;
  cursor = 0;
  ticker: wire.WireEvent[] = [];
  tickerLoaded = false;

  options(g: Game): { label: string; sub: string; act: () => void }[] {
    const opts: { label: string; sub: string; act: () => void }[] = [];
    const code = cloud.getCode();
    if (g.hasSave()) opts.push({ label: "CONTINUE", sub: code ? "Loads whichever of local / cloud is newer" : "Pick up where you left off", act: () => { void g.continueGame(); } });
    const hc = settings().hardcore ? " (HARDCORE)" : "";
    opts.push({ label: `NEW GAME - SOL NEIGHBOURHOOD${hc}`, sub: "The real stars within 20 light-years", act: () => { g.newGame(true); g.setScene("flight"); } });
    opts.push({ label: `NEW GAME - SOL 50 LY${hc}`, sub: "A bigger neighbourhood: every catalogued star out to 50 light-years", act: () => { g.newGame(true, 50); g.setScene("flight"); } });
    opts.push({ label: `NEW GAME - UNCHARTED${hc}`, sub: "A procedural galaxy", act: () => { g.newGame(false); g.setScene("flight"); } });
    const cs = wire.getCallsign();
    opts.push({ label: cs ? `CALL SIGN: ${cs}` : "CHOOSE A CALL SIGN", sub: "Your name on the Fleet Wire and the leaderboards", act: () => { void this.callsign(g); } });
    if (cs) opts.push({ label: wire.getSquadron() ? `SQUADRON: [${wire.getSquadron()}]` : "JOIN A SQUADRON", sub: "A 2-5 letter tag shared with friends; squadrons rank together on the WIRE tab", act: () => { void this.squadron(g); } });
    if (code) {
      opts.push({ label: `CLOUD: ${code}`, sub: "F5 in game saves here too. Enter this code on another device to link it", act: () => { g.toast(`YOUR CODE: ${code}`); } });
      opts.push({ label: "CLOUD: DOWNLOAD LATEST", sub: "Replace the local save with the cloud copy", act: () => { void this.download(g, code); } });
      opts.push({ label: "CLOUD: UNLINK THIS DEVICE", sub: "Forget the code here; the cloud copy stays", act: () => { cloud.setCode(null); g.toast("UNLINKED"); this.cursor = 0; } });
    } else {
      opts.push({ label: "CLOUD: CREATE SAVE CODE", sub: "Get a code; your saves then follow you between devices", act: () => { const c = cloud.newCode(); g.toast(`CODE ${c} - SAVE (F5) TO UPLOAD`); } });
      opts.push({ label: "CLOUD: LINK WITH A CODE", sub: "Enter a code from another device", act: () => { void this.link(g); } });
    }
    opts.push({ label: `SAVE SLOTS (SLOT ${activeSlot() + 1})`, sub: "Three local games; switch, copy or delete", act: () => g.setScene("slots") });
    opts.push({ label: "SETTINGS", sub: "Aim mode, difficulty, key bindings, music, fullscreen, fleet presence", act: () => g.setScene("settings") });
    opts.push({ label: "CONTROLS", sub: "Every key, by where you are", act: () => g.setScene("help") });
    opts.push({ label: "WHAT'S NEW", sub: "Changes since you last flew", act: () => g.setScene("whatsnew") });
    opts.push({ label: "EXPORT SAVE FILE", sub: "Download the current save as JSON", act: () => { cloud.exportFile(g.world); g.toast("SAVE FILE DOWNLOADED"); } });
    opts.push({ label: "IMPORT SAVE FILE", sub: "Load a save JSON from this device", act: () => { void this.importFile(g); } });
    return opts;
  }

  async squadron(g: Game): Promise<void> {
    const raw = ask("Squadron tag (2-5 letters or digits; empty to leave):", wire.getSquadron() ?? "");
    if (raw === null) return;
    const t = raw.trim().toUpperCase();
    if (!t) { wire.setSquadron(null); g.toast("LEFT THE SQUADRON"); wire.syncScores(g.world); return; }
    if (!wire.validSquadron(t)) { g.toast("TAG NOT ACCEPTED - 2 TO 5 LETTERS OR DIGITS"); return; }
    wire.setSquadron(t);
    g.toast(`SQUADRON [${t}] - FLY WITH YOUR TAG`);
    wire.syncScores(g.world);
  }

  async callsign(g: Game): Promise<void> {
    const raw = ask("Choose a call sign (2-16 letters, digits, space, - or _):", wire.getCallsign() ?? "");
    if (raw === null) return;
    const c = raw.trim().toUpperCase();
    if (!wire.validCallsign(c)) { g.toast("CALL SIGN NOT ACCEPTED"); return; }
    wire.setCallsign(c);
    g.toast(`CALL SIGN SET: ${c}`);
  }

  async link(g: Game): Promise<void> {
    const raw = ask("Enter your FarSpace cloud code:");
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
    if (!this.tickerLoaded) { this.tickerLoaded = true; void wire.fetchWire().then((e) => { this.ticker = e; }); }
    const opts = this.options(g);
    if (g.input.wasPressed("f")) toggleFullscreen(g.canvas);
    if (g.input.wasPressed("ArrowUp")) { this.cursor = (this.cursor + opts.length - 1) % opts.length; sfx.blip(); }
    if (g.input.wasPressed("ArrowDown")) { this.cursor = (this.cursor + 1) % opts.length; sfx.blip(); }
    let clicked = false;
    for (let i = 0; i < opts.length; i++) {
      const y = 104 + i * (opts.length > 12 ? 8 : opts.length > 11 ? 9 : 10);
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
    drawText(ctx, tag, VW / 2 - textWidth(tag) / 2, 94, PAL.grey);

    const opts = this.options(g);
    opts.forEach((o, i) => {
      const y = 104 + i * (opts.length > 12 ? 8 : opts.length > 11 ? 9 : 10);
      const sel = i === this.cursor;
      if (sel && Math.floor(this.t * 3) % 2 === 0) drawText(ctx, ">", VW / 2 - textWidth(o.label) / 2 - 10, y, PAL.gold);
      drawText(ctx, o.label, VW / 2 - textWidth(o.label) / 2, y, sel ? PAL.white : PAL.greyDark);
    });
    const sub = opts[this.cursor]?.sub ?? "";
    drawText(ctx, sub, VW / 2 - textWidth(sub) / 2, 104 + opts.length * (opts.length > 12 ? 8 : opts.length > 11 ? 9 : 10) + 3, PAL.uiDim);
    {
      // alternate the shared wire with your own galaxy's news (syndicate wars, annexations)
      const local = g.world.events.slice(-6).reverse();
      const slot = Math.floor(this.t / 6);
      const useLocal = local.length && (!this.ticker.length || slot % 2 === 1);
      if (useLocal) {
        const e = local[Math.floor(slot / 2) % local.length];
        const line = `GALNET: ${e.text}`.slice(0, 110);
        drawText(ctx, line, VW / 2 - textWidth(line) / 2, VH - 38, PAL.grey);
      } else if (this.ticker.length) {
        const e = this.ticker[Math.floor(slot / 2) % this.ticker.length];
        const line = `FLEET WIRE: ${e.tag ? `[${e.tag}] ` : ""}${e.callsign} ${e.text} - ${e.system} (${wire.ageLabel(e.t)})`.slice(0, 110);
        drawText(ctx, line, VW / 2 - textWidth(line) / 2, VH - 38, PAL.info);
      }
    }
    const ver = `V0.17${g.input.padConnected ? " - GAMEPAD CONNECTED" : ""}${this.pilots ? ` - ${this.pilots} PILOT${this.pilots === 1 ? "" : "S"} FLYING NOW` : ""}`;
    drawText(ctx, ver, VW / 2 - textWidth(ver) / 2, VH - 26, PAL.greyDark);
    const keys = "WSAD FLY - MOUSE AIM + FIRE - E DOCK/JUMP - TAB MAP - F FULLSCREEN - REBIND IN SETTINGS";
    drawText(ctx, keys, VW / 2 - textWidth(keys) / 2, VH - 14, PAL.uiDim);
  }
}
