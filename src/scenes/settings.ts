// Settings: aim mode, difficulty for new games, key bindings, music, fullscreen.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { settings, saveSettings, displaySettings, ACTIONS, keyLabel, toggleFullscreen } from "../core/settings";
import { music } from "../core/music";
import { sfx, applySfxVolume } from "../core/sfx";

interface Row { label: string; value: string; act: () => void; adj?: (dir: number) => void; keyBinding?: boolean }

const PAGE_ROWS = 14;
const LIST_LEFT = 8, LIST_RIGHT = VW - 20;

export class SettingsScene implements Scene {
  touchMode = "menu" as const;
  readonly pausesVoyage = true;
  get capturesKeys(): boolean { return this.binding !== null; }
  cursor = 0;
  top = 0;
  binding: string | null = null; // action key waiting for a physical key
  rowBoxes: [number, number][] = [];

  enter(): void { this.binding = null; this.rowBoxes = []; }

  // Keep actual row indices for pointer actions, even when most rows are hidden.
  window(count: number): [number, number] {
    this.cursor = Math.max(0, Math.min(count - 1, this.cursor));
    this.top = Math.max(0, Math.min(this.top, this.cursor, count - PAGE_ROWS));
    if (this.cursor >= this.top + PAGE_ROWS) this.top = this.cursor - PAGE_ROWS + 1;
    return [this.top, Math.min(count, this.top + PAGE_ROWS)];
  }

  rows(g?: Game): Row[] {
    const s = settings();
    const display = displaySettings();
    const density = (dir: number) => {
      const modes = ["full", "compact", "minimal"] as const;
      saveSettings({ hudDensity: modes[(modes.indexOf(display.hudDensity) + dir + modes.length) % modes.length] });
    };
    const fit = () => { saveSettings({ screenFit: display.screenFit === "fit" ? "integer" : "fit" }); g?.resize(); };
    const opacity = (dir: number) => saveSettings({ hudOpacity: Math.max(30, Math.min(100, display.hudOpacity + dir * 10)) });
    const bar = (v: number) => "[" + "#".repeat(Math.round(v * 10)) + ".".repeat(10 - Math.round(v * 10)) + "]";
    const vol = (key: "music" | "sfx", dir: number) => {
      const v = Math.round(Math.max(0, Math.min(1, s[key] + dir * 0.1)) * 10) / 10;
      saveSettings({ [key]: v });
      if (key === "music") music.applyVolume(); else { applySfxVolume(); sfx.blip(); }
    };
    const rows: Row[] = [
      { label: "FLIGHT HUD", value: `${display.hudDensity.toUpperCase()} / L OPENS FULL RECORD`, act: () => density(1), adj: density },
      { label: "HUD BACKGROUND", value: `${display.hudOpacity}% / TEXT STAYS SOLID`, act: () => opacity(display.hudOpacity >= 100 ? -7 : 1), adj: opacity },
      { label: "SCREEN SIZE", value: display.screenFit === "fit" ? "FIT WINDOW" : "WHOLE PIXELS", act: fit, adj: fit },
      { label: "AIM", value: s.aim === "mouse" ? "MOUSE TURRET" : "KEYBOARD (A/D)", act: () => saveSettings({ aim: s.aim === "mouse" ? "keys" : "mouse" }) },
      { label: "DIFFICULTY (NEW GAMES)", value: s.hardcore ? "HARDCORE - DESTRUCTION ERASES THE SAVE" : "STANDARD", act: () => saveSettings({ hardcore: !s.hardcore }) },
      { label: "HUM", value: `${music.isMuted() ? "OFF" : "ON "} ${bar(s.music)} ${Math.round(s.music * 100)}%`, act: () => { music.toggle(); }, adj: (d) => vol("music", d) },
      { label: "EFFECTS", value: `${bar(s.sfx)} ${Math.round(s.sfx * 100)}%`, act: () => vol("sfx", s.sfx >= 1 ? -10 : 1), adj: (d) => vol("sfx", d) },
      { label: "FULLSCREEN", value: document.fullscreenElement ? "ON" : "OFF", act: () => toggleFullscreen(document.getElementById("game")!) },
      { label: "FLEET PRESENCE", value: s.presence ? "ON - OTHER PILOTS SEE YOUR SHIP" : "OFF - FLY UNSEEN", act: () => saveSettings({ presence: !s.presence }) },
      { label: "THE LANES", value: (s.lanes ?? "normal") === "gentle" ? "GENTLE - HALF THE CORSAIRS" : (s.lanes ?? "normal") === "rough" ? "ROUGH - HALF AGAIN AS MANY" : "NORMAL", act: () => saveSettings({ lanes: (s.lanes ?? "normal") === "normal" ? "gentle" : (s.lanes ?? "normal") === "gentle" ? "rough" : "normal" }) },
      { label: "COMMS BAND", value: (s.chatter ?? "normal") === "quiet" ? "QUIET - HALF THE CHATTER" : (s.chatter ?? "normal") === "busy" ? "BUSY - TWICE THE CHATTER" : "NORMAL", act: () => saveSettings({ chatter: (s.chatter ?? "normal") === "normal" ? "quiet" : (s.chatter ?? "normal") === "quiet" ? "busy" : "normal" }) },
      { label: "THE SHIP'S VOICE", value: (s.voice ?? true) ? "ON - SHE SPEAKS NOW AND THEN" : "OFF - SHE KEEPS IT TO HERSELF", act: () => saveSettings({ voice: !(s.voice ?? true) }) },
      { label: "ORDERS: LEAVE THE CLAMP AT", value: (s.alertOnUndock ?? "green") === "yellow" ? "YELLOW ALERT" : "GREEN", act: () => saveSettings({ alertOnUndock: (s.alertOnUndock ?? "green") === "yellow" ? "green" : "yellow" }) },
      { label: "ORDERS: NO. 1 ANSWERS HAILS", value: (s.numberOneHails ?? true) ? "ON (AUTOPILOT)" : "OFF", act: () => saveSettings({ numberOneHails: !(s.numberOneHails ?? true) }) },
      { label: "ORDERS: NO. 1 TAKES THE LEG AT 8H", value: (s.numberOneTakesLeg ?? false) ? "ON" : "OFF (ASKS)", act: () => saveSettings({ numberOneTakesLeg: !(s.numberOneTakesLeg ?? false) }) },
      { label: "ORDERS: NO. 1 OBJECTS TO LANDINGS", value: (s.objectsToLandings ?? true) ? "ONCE" : "NEVER", act: () => saveSettings({ objectsToLandings: !(s.objectsToLandings ?? true) }) },
      { label: "ORDERS: THE SHIP'S QUIET LEG", value: (s.keepQuietLeg ?? false) ? "ALWAYS YES" : "ASKS", act: () => saveSettings({ keepQuietLeg: !(s.keepQuietLeg ?? false) }) },
    ];
    for (const a of ACTIONS) {
      const physical = Object.entries(s.keymap).find(([, v]) => v === a.key)?.[0] ?? a.key;
      rows.push({ label: a.label, value: this.binding === a.key ? "PRESS A KEY..." : keyLabel(physical), keyBinding: true, act: () => { this.binding = a.key; } });
    }
    rows.push({ label: "RESET KEY BINDINGS", value: "", keyBinding: true, act: () => saveSettings({ keymap: {} }) });
    return rows;
  }

  update(g: Game, dt: number): void {
    const inp = g.input;
    const backClick = inp.mousePressed && inp.mouseX >= VW - 72 && inp.mouseX < VW - 8 && inp.mouseY >= 4 && inp.mouseY < 18;
    if (this.binding) {
      const raw = inp.lastRawKey;
      if (raw === "Escape" || backClick) {
        this.binding = null; inp.lastRawKey = null; inp.flush();
      } else if (raw) {
        const map = { ...settings().keymap };
        for (const k of Object.keys(map)) if (map[k] === this.binding) delete map[k];
        if (raw !== this.binding) map[raw] = this.binding;
        saveSettings({ keymap: map });
        this.binding = null;
        inp.lastRawKey = null;
        inp.flush();
        sfx.select();
      }
      return;
    }
    if (inp.wasPressed("Escape") || backClick) { const back = g.settingsReturn; g.settingsReturn = "title"; if (back === "flight" && g.scenes?.flight) (g.scenes.flight as unknown as { resumeNext: boolean }).resumeNext = true; g.setScene(back); return; }
    const rows = this.rows(g);
    this.window(rows.length);
    // Resolve clicks against the frame the player saw, before moving the window.
    const row = inp.mouseX >= LIST_LEFT && inp.mouseX < LIST_RIGHT
      ? this.rowBoxes.findIndex(([y0, y1]) => inp.mouseY >= y0 && inp.mouseY < y1) : -1;
    if (inp.wasPressed("ArrowUp")) { this.cursor = (this.cursor + rows.length - 1) % rows.length; sfx.blip(); }
    if (inp.wasPressed("ArrowDown")) { this.cursor = (this.cursor + 1) % rows.length; sfx.blip(); }
    if (inp.wheel) this.cursor = Math.max(0, Math.min(rows.length - 1, this.cursor + Math.sign(inp.wheel)));
    const footerClick = inp.mousePressed && inp.mouseY >= 236 && inp.mouseY < 252;
    const page = inp.wasPressed("PageUp") || (footerClick && inp.mouseX >= 12 && inp.mouseX < 76) ? -1
      : inp.wasPressed("PageDown") || (footerClick && inp.mouseX >= 84 && inp.mouseX < 148) ? 1 : 0;
    if (page) { this.cursor += page * PAGE_ROWS; this.top += page * PAGE_ROWS; }
    if (inp.wasPressed("Home")) this.cursor = 0;
    if (inp.wasPressed("End")) this.cursor = rows.length - 1;
    if (inp.mousePressed && row >= 0) this.cursor = row;
    this.window(rows.length);
    const adj = rows[this.cursor].adj;
    if (adj && inp.wasPressed("ArrowLeft")) adj(-1);
    if (adj && inp.wasPressed("ArrowRight")) adj(1);
    if (inp.wasPressed("Enter") || (inp.mousePressed && row >= 0)) { rows[this.cursor].act(); sfx.select(); inp.lastRawKey = null; }
    void dt;
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = PAL.uiPanel;
    ctx.fillRect(0, 0, VW, VH);
    drawText(ctx, "SETTINGS", 12, 8, PAL.white);
    ctx.fillStyle = "#13203a"; ctx.fillRect(VW - 72, 4, 64, 14);
    drawText(ctx, this.binding ? "ESC CANCEL" : "ESC BACK", VW - 66, 8, PAL.ui);
    drawText(ctx, this.binding ? "PRESS A KEY TO BIND - ESC OR CANCEL KEEPS THE CURRENT KEY"
      : "WHEEL/ARROWS SCROLL / ENTER/CLICK CHANGE / LEFT/RIGHT ADJUST", 12, 22, PAL.grey);
    const rows = this.rows(g);
    const [start, end] = this.window(rows.length);
    this.rowBoxes = rows.map(() => [NaN, NaN]);
    let y = 34;
    for (let i = start; i < end; i++) {
      const r = rows[i];
      if (i === start || r.keyBinding !== rows[i - 1].keyBinding) {
        drawText(ctx, r.keyBinding ? "KEY BINDINGS (FLIGHT)" : "SHIP & FLIGHT OPTIONS", 12, y, PAL.greyDark); y += 12;
      }
      this.rowBoxes[i] = [y, y + 11];
      if (i === this.cursor) { ctx.fillStyle = "#13203a"; ctx.fillRect(LIST_LEFT, y, LIST_RIGHT - LIST_LEFT, 11); }
      drawText(ctx, r.label, 12, y + 3, i === this.cursor ? PAL.white : PAL.grey);
      drawText(ctx, r.value, 190, y + 3, this.binding && r.value.startsWith("PRESS") ? PAL.gold : PAL.ui);
      y += 12;
    }
    ctx.fillStyle = "#13203a"; ctx.fillRect(VW - 12, 34, 3, 192);
    ctx.fillStyle = PAL.ui; ctx.fillRect(VW - 12, 34 + Math.round(192 * start / rows.length), 3, Math.max(6, Math.round(192 * (end - start) / rows.length)));
    for (const [x, label, enabled] of [[12, "PAGE UP", start > 0], [84, "PAGE DOWN", end < rows.length]] as const) {
      ctx.fillStyle = "#13203a"; ctx.fillRect(x, 236, 64, 16);
      drawText(ctx, label, x + 8, 242, enabled ? PAL.ui : PAL.greyDark);
    }
    drawText(ctx, `${start + 1}-${end} OF ${rows.length}  -  HOME/END FIRST/LAST`, 160, 242, PAL.grey);
    const footer = g.toastTimer > 0 ? g.toastMsg : "CHANGES SAVE AUTOMATICALLY";
    drawText(ctx, footer, VW / 2 - textWidth(footer) / 2, VH - 10, PAL.ui);
  }
}
