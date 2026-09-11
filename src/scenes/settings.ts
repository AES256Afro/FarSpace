// Settings: aim mode, difficulty for new games, key bindings, music, fullscreen.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { settings, saveSettings, ACTIONS, keyLabel, toggleFullscreen } from "../core/settings";
import { music } from "../core/music";
import { sfx, applySfxVolume } from "../core/sfx";

interface Row { label: string; value: string; act: () => void; adj?: (dir: number) => void }

const FIXED = 6; // rows before the key-binding list

export class SettingsScene implements Scene {
  touchMode = "menu" as const;
  cursor = 0;
  binding: string | null = null; // action key waiting for a physical key
  rowBoxes: [number, number][] = [];

  rows(): Row[] {
    const s = settings();
    const bar = (v: number) => "[" + "#".repeat(Math.round(v * 10)) + ".".repeat(10 - Math.round(v * 10)) + "]";
    const vol = (key: "music" | "sfx", dir: number) => {
      const v = Math.round(Math.max(0, Math.min(1, s[key] + dir * 0.1)) * 10) / 10;
      saveSettings({ [key]: v });
      if (key === "music") music.applyVolume(); else { applySfxVolume(); sfx.blip(); }
    };
    const rows: Row[] = [
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
    ];
    for (const a of ACTIONS) {
      const physical = Object.entries(s.keymap).find(([, v]) => v === a.key)?.[0] ?? a.key;
      rows.push({ label: a.label, value: this.binding === a.key ? "PRESS A KEY..." : keyLabel(physical), act: () => { this.binding = a.key; } });
    }
    rows.push({ label: "RESET KEY BINDINGS", value: "", act: () => saveSettings({ keymap: {} }) });
    return rows;
  }

  update(g: Game, dt: number): void {
    const inp = g.input;
    if (this.binding) {
      const raw = inp.lastRawKey;
      if (raw && raw !== "Escape") {
        const map = { ...settings().keymap };
        for (const k of Object.keys(map)) if (map[k] === this.binding) delete map[k];
        if (raw !== this.binding) map[raw] = this.binding;
        saveSettings({ keymap: map });
        this.binding = null;
        inp.lastRawKey = null;
        inp.flush();
        sfx.select();
      } else if (raw === "Escape") { this.binding = null; inp.lastRawKey = null; }
      return;
    }
    if (inp.wasPressed("Escape")) { const back = g.settingsReturn; g.settingsReturn = "title"; g.setScene(back); return; }
    const rows = this.rows();
    if (inp.wasPressed("ArrowUp")) { this.cursor = (this.cursor + rows.length - 1) % rows.length; sfx.blip(); }
    if (inp.wasPressed("ArrowDown")) { this.cursor = (this.cursor + 1) % rows.length; sfx.blip(); }
    const row = this.rowBoxes.findIndex(([y0, y1]) => inp.mouseY >= y0 && inp.mouseY <= y1);
    if (row >= 0 && inp.mouseX > 40 && inp.mouseX < VW - 40) this.cursor = row;
    const adj = rows[this.cursor].adj;
    if (adj && inp.wasPressed("ArrowLeft")) adj(-1);
    if (adj && inp.wasPressed("ArrowRight")) adj(1);
    if (inp.wasPressed("Enter") || (inp.mousePressed && row >= 0)) { rows[this.cursor].act(); sfx.select(); inp.lastRawKey = null; }
    void dt;
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    this.rowBoxes = [];
    ctx.fillStyle = PAL.uiPanel;
    ctx.fillRect(0, 0, VW, VH);
    drawText(ctx, "SETTINGS", 12, 8, PAL.white);
    const help = "UP/DOWN OR CLICK - ENTER CHANGE - LEFT/RIGHT VOLUME - ESC BACK";
    drawText(ctx, help, VW - textWidth(help) - 12, 8, PAL.greyDark);
    const rows = this.rows();
    let y = 24;
    rows.forEach((r, i) => {
      if (i === FIXED) { drawText(ctx, "KEY BINDINGS (FLIGHT)", 12, y, PAL.greyDark); y += 10; }
      this.rowBoxes.push([y - 2, y + 8]);
      if (i === this.cursor) { ctx.fillStyle = "#13203a"; ctx.fillRect(8, y - 2, VW - 16, 10); }
      drawText(ctx, r.label, 12, y, i === this.cursor ? PAL.white : PAL.grey);
      drawText(ctx, r.value, i < FIXED ? 190 : 150, y, this.binding && r.value.startsWith("PRESS") ? PAL.gold : PAL.ui);
      y += i < FIXED - 1 ? 11 : 9;
    });
    if (g.toastTimer > 0) drawText(ctx, g.toastMsg, VW / 2 - textWidth(g.toastMsg) / 2, VH - 10, PAL.ui);
  }
}
