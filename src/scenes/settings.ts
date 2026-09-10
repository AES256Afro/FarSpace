// Settings: aim mode, difficulty for new games, key bindings, music, fullscreen.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { settings, saveSettings, ACTIONS, keyLabel, toggleFullscreen } from "../core/settings";
import { music } from "../core/music";
import { sfx } from "../core/sfx";

export class SettingsScene implements Scene {
  touchMode = "menu" as const;
  cursor = 0;
  binding: string | null = null; // action key waiting for a physical key
  rowBoxes: [number, number][] = [];

  rows(): { label: string; value: string; act: () => void }[] {
    const s = settings();
    const rows: { label: string; value: string; act: () => void }[] = [
      { label: "AIM", value: s.aim === "mouse" ? "MOUSE TURRET" : "KEYBOARD (A/D)", act: () => saveSettings({ aim: s.aim === "mouse" ? "keys" : "mouse" }) },
      { label: "DIFFICULTY (NEW GAMES)", value: s.hardcore ? "HARDCORE - DESTRUCTION ERASES THE SAVE" : "STANDARD", act: () => saveSettings({ hardcore: !s.hardcore }) },
      { label: "MUSIC", value: music.isMuted() ? "OFF" : "ON", act: () => { music.toggle(); } },
      { label: "FULLSCREEN", value: document.fullscreenElement ? "ON" : "OFF", act: () => toggleFullscreen(document.getElementById("game")!) },
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
    if (inp.wasPressed("Escape")) { g.setScene("title"); return; }
    const rows = this.rows();
    if (inp.wasPressed("ArrowUp")) { this.cursor = (this.cursor + rows.length - 1) % rows.length; sfx.blip(); }
    if (inp.wasPressed("ArrowDown")) { this.cursor = (this.cursor + 1) % rows.length; sfx.blip(); }
    const row = this.rowBoxes.findIndex(([y0, y1]) => inp.mouseY >= y0 && inp.mouseY <= y1);
    if (row >= 0 && inp.mouseX > 40 && inp.mouseX < VW - 40) this.cursor = row;
    if (inp.wasPressed("Enter") || (inp.mousePressed && row >= 0)) { rows[this.cursor].act(); sfx.select(); inp.lastRawKey = null; }
    void dt;
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    this.rowBoxes = [];
    ctx.fillStyle = PAL.uiPanel;
    ctx.fillRect(0, 0, VW, VH);
    drawText(ctx, "SETTINGS", 12, 8, PAL.white);
    drawText(ctx, "ARROWS/CLICK - ENTER CHANGE - ESC BACK", VW - textWidth("ARROWS/CLICK - ENTER CHANGE - ESC BACK") - 12, 8, PAL.greyDark);
    const rows = this.rows();
    let y = 24;
    rows.forEach((r, i) => {
      if (i === 4) { drawText(ctx, "KEY BINDINGS (FLIGHT)", 12, y, PAL.greyDark); y += 10; }
      this.rowBoxes.push([y - 2, y + 8]);
      if (i === this.cursor) { ctx.fillStyle = "#13203a"; ctx.fillRect(8, y - 2, VW - 16, 10); }
      drawText(ctx, r.label, 12, y, i === this.cursor ? PAL.white : PAL.grey);
      drawText(ctx, r.value, i < 4 ? 190 : 150, y, this.binding && r.value.startsWith("PRESS") ? PAL.gold : PAL.ui);
      y += i < 3 ? 11 : 9;
    });
    if (g.toastTimer > 0) drawText(ctx, g.toastMsg, VW / 2 - textWidth(g.toastMsg) / 2, VH - 10, PAL.ui);
  }
}
