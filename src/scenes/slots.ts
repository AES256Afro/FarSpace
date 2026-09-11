// Save slots: three local games. Switching a slot swaps the world in play.

import { ask, confirmBox } from "../core/dialog";
import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { SLOTS, activeSlot, setActiveSlot, slotSummaries, deleteSlot, copySlot, loadSave, writeSave, SlotSummary } from "../save";
import { hull } from "../data/hulls";
import { generateWorld } from "../world";
import { sfx } from "../core/sfx";
import * as wire from "../core/wire";

export class SlotsScene implements Scene {
  touchMode = "menu" as const;
  cursor = 0;
  rows: SlotSummary[] = [];
  boxes: [number, number][] = [];

  enter(): void { this.cursor = activeSlot(); this.rows = slotSummaries(); }

  update(g: Game, dt: number): void {
    void dt;
    const inp = g.input;
    if (inp.wasPressed("Escape")) { g.setScene("title"); return; }
    if (inp.wasPressed("ArrowUp")) { this.cursor = (this.cursor + SLOTS - 1) % SLOTS; sfx.blip(); }
    if (inp.wasPressed("ArrowDown")) { this.cursor = (this.cursor + 1) % SLOTS; sfx.blip(); }
    const row = this.boxes.findIndex(([y0, y1]) => inp.mouseY >= y0 && inp.mouseY <= y1);
    if (row >= 0) this.cursor = row;
    const cur = this.rows[this.cursor];
    if (inp.wasPressed("Enter") || (inp.mousePressed && row >= 0)) {
      if (this.cursor !== activeSlot()) { writeSave(g.world); } // park the current game in its own slot first
      setActiveSlot(this.cursor);
      const w = loadSave(this.cursor);
      if (w) { g.world = w; g.spriteCache.clear(); g.toast(`SLOT ${this.cursor + 1} ACTIVE - CONTINUE FROM THE TITLE`); }
      else { g.world = generateWorld(0xfa25face); g.toast(`SLOT ${this.cursor + 1} ACTIVE AND EMPTY - START A NEW GAME`); }
      wire.syncScores(g.world);
      sfx.select();
      this.rows = slotSummaries();
    }
    if (inp.wasPressed("d") && cur && !cur.empty) {
      if (confirmBox(`Delete the game in slot ${this.cursor + 1}? This cannot be undone.`)) {
        deleteSlot(this.cursor);
        if (this.cursor === activeSlot()) g.world = generateWorld(0xfa25face);
        this.rows = slotSummaries();
        g.toast(`SLOT ${this.cursor + 1} CLEARED`);
      }
      inp.flush();
    }
    if (inp.wasPressed("c") && this.cursor !== activeSlot()) {
      writeSave(g.world);
      if (copySlot(activeSlot(), this.cursor)) { this.rows = slotSummaries(); g.toast(`COPIED SLOT ${activeSlot() + 1} INTO SLOT ${this.cursor + 1}`); sfx.select(); }
    }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    void g;
    this.boxes = [];
    ctx.fillStyle = PAL.uiPanel; ctx.fillRect(0, 0, VW, VH);
    drawText(ctx, "SAVE SLOTS", 12, 8, PAL.white);
    drawText(ctx, "ENTER ACTIVATE - C COPY ACTIVE HERE - D DELETE - ESC BACK", VW - textWidth("ENTER ACTIVATE - C COPY ACTIVE HERE - D DELETE - ESC BACK") - 12, 8, PAL.greyDark);
    this.rows.forEach((r, i) => {
      const y = 30 + i * 50;
      this.boxes.push([y - 4, y + 40]);
      const active = i === activeSlot();
      if (i === this.cursor) { ctx.fillStyle = "#13203a"; ctx.fillRect(8, y - 4, VW - 16, 46); }
      ctx.strokeStyle = active ? PAL.ui : PAL.uiBorder; ctx.strokeRect(8.5, y - 3.5, VW - 17, 45);
      drawText(ctx, `SLOT ${i + 1}${active ? " - ACTIVE" : ""}`, 14, y, active ? PAL.ui : PAL.white);
      if (r.empty) { drawText(ctx, "EMPTY", 14, y + 10, PAL.greyDark); return; }
      const ago = r.savedAt ? wire.ageLabel(r.savedAt) : "?";
      drawText(ctx, `${hull(r.hullId).name.toUpperCase()}  ${r.credits ?? 0}CR  ${(r.systemName ?? "?").toUpperCase()}  ${r.discoveries ?? 0} DISCOVERIES${r.hardcore ? "  HARDCORE" : ""}`, 14, y + 10, PAL.grey);
      drawText(ctx, `${ago === "NOW" ? "SAVED JUST NOW" : `SAVED ${ago} AGO`}  ${Math.round((r.bytes ?? 0) / 1024)} KB`, 14, y + 19, PAL.greyDark);
      { const story = `${r.shipName ? `"${r.shipName.toUpperCase()}"` : "UNNAMED"}${r.captain ? `, CAPTAIN ${r.captain.toUpperCase()}` : ""}${r.nick ? ` (${r.nick})` : ""} - ${Math.floor(r.hours ?? 0)}H UNDER WAY - ${r.crew ?? 0} CREW${(r.captains ?? 1) > 1 ? ` - CAPTAIN ${r.captains} OF THE LINE` : ""}${r.cat ? ` - ${r.cat.toUpperCase()} ABOARD` : ""}`; drawText(ctx, story.slice(0, 100), 14, y + 28, PAL.uiDim); }
    });
    drawText(ctx, "EACH SLOT KEEPS ITS OWN CLOUD CODE. AUTOSAVE WRITES TO THE ACTIVE SLOT.", 12, VH - 14, PAL.greyDark);
  }
}
