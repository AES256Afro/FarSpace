import type { Game, Scene } from "../game";
import { VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { commodity } from "../data/data";
import { MATERIALS, MATERIAL_CAP } from "../data/engineering";
import { cargoUsed, logEntry, type WreckDef } from "../world";
import { prepareWreck } from "../core/derelicts";
import { CUT_FUEL, CUT_SECONDS, cutSalvage, prepareSalvage, salvageReason, type SalvagePart } from "../core/salvage";
import { sfx } from "../core/sfx";
import { attachRecoveryTow, detachRecoveryTow, recoveryReason, hullSalePrice } from "../core/shiprecovery";
import { hull } from "../data/hulls";
import type { FlightScene } from "./flight/index";
import type { WreckScene } from "./wreck";
import { wrap } from "./encounter";

const LEFT = 176, TOP = 56, ROW = 32;
const fit = (text: string, width: number): string => {
  if (textWidth(text) <= width) return text;
  while (textWidth(text + "...") > width && text.length) text = text.slice(0, -1);
  return text + "...";
};
export const salvageResourceName = (part: SalvagePart): string => (part.store === "cargo"
  ? commodity(part.resource).name : MATERIALS.find(m => m.id === part.resource)!.name).toUpperCase();

export class SalvageScene implements Scene {
  touchMode = "menu" as const;
  wreck!: WreckDef;
  parts: SalvagePart[] = [];
  cursor = 0;
  active: SalvagePart | null = null;
  message = "";
  time = 0;
  confirmCut: SalvagePart | null = null;
  rowHeight(): number { return this.wreck.recovery ? 27 : ROW; }
  selectedPart(): SalvagePart | undefined { return this.parts[this.cursor - (this.wreck.recovery ? 2 : 1)]; }

  enter(g: Game): void {
    if (!g.wreckTarget) { this.leave(g); return; }
    this.wreck = g.wreckTarget;
    prepareWreck(this.wreck, g.world.seed);
    this.parts = prepareSalvage(this.wreck, g.world.seed).parts;
    this.cursor = 0; this.active = null; this.message = ""; this.time = 0;
    this.confirmCut = null;
  }
  onSceneLeave(): void { this.active = null; }
  leave(g: Game): void {
    this.active = null;
    (g.scenes.flight as FlightScene).resumeNext = true;
    g.setScene("flight"); g.autosave();
  }
  board(g: Game): void {
    this.active = null;
    if (this.wreck.looted) { this.message = "THE INTERIOR HAS BEEN CLEARED. EXTERIOR SALVAGE REMAINS."; return; }
    (g.scenes.wreck as WreckScene).returnToSalvage = true;
    g.setScene("wreck");
  }
  choose(g: Game): void {
    if (this.cursor === 0) { this.board(g); return; }
    if (this.cursor === 1 && this.wreck.recovery) {
      this.active = null; this.confirmCut = null;
      if (this.wreck.recovery.status === "towing") {
        detachRecoveryTow(g.world); this.message = "TOW LINE DETACHED. THE HULL REMAINS HERE."; g.autosave(); return;
      }
      this.message = attachRecoveryTow(g.world, this.wreck, !!(g.scenes.flight as FlightScene).towing) ?? "";
      if (!this.message) { this.leave(g); g.toast("HULL IN TOW. DOCK AT A STATION, THEN SHIPS TO KEEP OR SELL."); }
      return;
    }
    const part = this.selectedPart();
    if (!part) return;
    if (this.active === part) { this.active = null; this.message = "CUTTER PAUSED. WORK WILL STAY HERE."; return; }
    this.active = null;
    this.message = salvageReason(this.wreck, part, g.world.player) ?? "";
    if (!this.message) {
      if (this.wreck.recovery?.status === "adrift" && this.confirmCut !== part) {
        this.confirmCut = part; this.message = "CUTTING PREVENTS WHOLE HULL RECOVERY. CHOOSE THIS SECTION AGAIN TO CONFIRM."; return;
      }
      this.confirmCut = null; this.active = part; sfx.select();
    }
  }
  update(g: Game, dt: number): void {
    this.time += dt;
    const inp = g.input;
    if (inp.wasPressed("Escape") || (inp.mousePressed && inp.mouseY >= 248 && inp.mouseX >= 385)) { this.leave(g); return; }
    if (inp.wasPressed("F5")) g.save();
    if (inp.wasPressed("b")) { this.board(g); return; }
    const before = this.cursor, count = this.parts.length + (this.wreck.recovery ? 2 : 1), rowHeight = this.rowHeight();
    if (inp.wasPressed("ArrowDown") || inp.wasPressed("s") || inp.wheel > 0) this.cursor = (this.cursor + 1) % count;
    if (inp.wasPressed("ArrowUp") || inp.wasPressed("w") || inp.wheel < 0) this.cursor = (this.cursor + count - 1) % count;
    const row = Math.floor((inp.mouseY - TOP) / rowHeight);
    const click = inp.mousePressed && inp.mouseX >= LEFT && inp.mouseX < VW - 12 && row >= 0 && row < count && inp.mouseY < TOP + count * rowHeight;
    if (click) this.cursor = row;
    if (before !== this.cursor) { this.active = null; this.message = ""; this.confirmCut = null; }
    if (click || inp.wasPressed("Enter") || inp.wasPressed("e") || inp.wasPressed(" ")) {
      this.choose(g); return;
    }
    if (!this.active) return;
    const part = this.active, result = cutSalvage(this.wreck, g.world.seed, part, g.world.player, dt);
    if (result.reason) { this.message = result.reason; this.active = null; }
    if (result.recovered) {
      this.message = `RECOVERED 1 ${salvageResourceName(part)}. ${part.remaining} REMAIN.`;
      sfx.pickup();
      if (!part.remaining) {
        this.active = null;
        this.message = `${part.name} STRIPPED.`;
        logEntry(g.world, `Salvaged ${part.total} ${salvageResourceName(part).toLowerCase()} from ${this.wreck.name}`);
        g.autosave();
      }
    }
  }
  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    const p = g.world.player, boarding = this.wreck.boarding!;
    ctx.fillStyle = "#070d17"; ctx.fillRect(0, 0, VW, VH);
    drawText(ctx, this.wreck.recovery ? "DISABLED SHIP" : "WRECK SALVAGE", 12, 10, PAL.ui);
    drawText(ctx, fit(this.wreck.name.toUpperCase(), 340), 12, 23, PAL.white);
    drawText(ctx, `HOLD ${cargoUsed(p)}/${p.cargoMax}`, 354, 10, PAL.gold);
    drawText(ctx, `FUEL ${p.fuel.toFixed(1)}`, 354, 23, p.fuel < 5 ? PAL.warn : PAL.grey);
    ctx.fillStyle = "#132435"; ctx.fillRect(12, 39, VW - 24, 1);
    this.drawHull(ctx);
    const survivor = boarding.survivor && !boarding.rescued;
    const details = survivor ? ["LIFE SIGN DETECTED", "BOARD TO EVACUATE", "CUTTER LOCKED"] : ["NO ONE LEFT ABOARD", this.wreck.looted ? "INTERIOR CLEARED" : "INTERIOR ACCESSIBLE", "UNFINISHED WORK SAVED"];
    details.forEach((line, i) => drawText(ctx, line, 16, 167 + i * 11, survivor ? PAL.warn : PAL.grey));
    const recovery = this.wreck.recovery;
    drawText(ctx, recovery ? fit(hull(recovery.hullId).name.toUpperCase(), 145) : `${CUT_FUEL} FUEL PER UNIT`, 16, 207, PAL.gold);
    const seconds = p.crew.some(c => c.role === "engineer" && !c.sick) ? CUT_SECONDS * 0.7 : CUT_SECONDS;
    drawText(ctx, recovery ? recovery.status === "dismantled" ? "SALVAGE ONLY" : `HULL ${Math.round(recovery.hull / hull(recovery.hullId).hullMax * 100)}% / SALE ${hullSalePrice(recovery)}CR` : `${seconds} SECONDS PER UNIT`, 16, 218, PAL.grey);
    const labels = ["BOARD THE WRECK", ...(recovery ? [recovery.status === "towing" ? "DETACH TOW LINE" : "RECOVER THE HULL"] : []), ...this.parts.map(part => part.name)];
    const rowHeight = this.rowHeight();
    labels.forEach((label, i) => {
      const y = TOP + i * rowHeight, selected = this.cursor === i, recoveryRow = !!recovery && i === 1, part = this.parts[i - (recovery ? 2 : 1)];
      ctx.fillStyle = selected ? "#193542" : "#101b2a"; ctx.fillRect(LEFT, y, VW - LEFT - 12, rowHeight - 3);
      if (selected) { ctx.fillStyle = PAL.ui; ctx.fillRect(LEFT, y, 2, rowHeight - 3); }
      drawText(ctx, label, LEFT + 8, y + 5, part?.remaining === 0 ? PAL.greyDark : selected ? PAL.white : PAL.grey);
      const detail = recoveryRow ? (recovery!.status === "dismantled" ? "UNAVAILABLE / CUTTING HAS STARTED" : "TOW TO A STATION / KEEP OR SELL")
        : !part ? (this.wreck.looted ? "INTERIOR CLEARED" : "CARGO / FUEL / RECORDER / RESCUE")
        : part.remaining ? `${part.remaining}/${part.total} ${salvageResourceName(part)} / ${part.store === "cargo" ? "HOLD" : "MATERIALS"}` : "STRIPPED";
      drawText(ctx, detail, LEFT + 8, y + 16, part?.remaining === 0 ? PAL.greyDark : PAL.grey);
      if (part) {
        const status = this.active === part ? "PAUSE" : part.progress ? `${Math.floor(part.progress * 100)}% / CUT` : part.remaining ? "CUT" : "DONE";
        drawText(ctx, status, VW - textWidth(status) - 20, y + 5, this.active === part ? PAL.gold : PAL.ui);
        ctx.fillStyle = PAL.gold; ctx.fillRect(LEFT + 2, y + rowHeight - 5, (VW - LEFT - 16) * part.progress, 2);
      }
    });
    const part = this.selectedPart();
    const reason = recovery && this.cursor === 1 && recovery.status !== "towing" ? recoveryReason(g.world, this.wreck, !!(g.scenes.flight as FlightScene).towing) : part && salvageReason(this.wreck, part, p);
    const note = this.message || reason || (recovery && this.cursor === 1 ? "CONTENTS LEFT ABOARD GO TO THE YARD WITH THE HULL. RECOVER CARGO FIRST."
      : recovery && part ? `CUT: ${seconds}S / 0.5 FUEL PER UNIT. CUTTING PREVENTS WHOLE HULL RECOVERY.`
      : part?.store === "materials"
      ? `MATERIAL STORAGE: ${p.materials?.[part.resource] ?? 0}/${MATERIAL_CAP}. NO HOLD SPACE NEEDED.`
      : "CUTTING CONTINUES UNTIL PAUSED, FULL OR OUT OF FUEL.");
    wrap(note, 112).slice(0, 2).forEach((line, i) => drawText(ctx, line, 12, 235 + i * 8, reason ? PAL.warn : PAL.grey));
    drawText(ctx, "ARROWS CHOOSE / ENTER CUT OR PAUSE / B BOARD", 12, 258, PAL.ui);
    drawText(ctx, "ESC FLIGHT", 422, 258, PAL.grey);
  }
  drawHull(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#0d1928"; ctx.fillRect(12, 51, 152, 106);
    ctx.strokeStyle = "#1d3043";
    for (let x = 24; x < 164; x += 16) { ctx.beginPath(); ctx.moveTo(x, 52); ctx.lineTo(x, 156); ctx.stroke(); }
    for (let y = 60; y < 157; y += 16) { ctx.beginPath(); ctx.moveTo(12, y); ctx.lineTo(163, y); ctx.stroke(); }
    const blocks = [[36, 79, 20, 48], [102, 84, 22, 15], [60, 70, 36, 67], [100, 110, 26, 22]];
    ctx.strokeStyle = "#58758a"; ctx.strokeRect(57, 64, 74, 79);
    blocks.forEach(([x, y, w, h], i) => {
      const part = this.parts[i], stripped = !part?.remaining, selected = this.cursor === i + (this.wreck.recovery ? 2 : 1);
      ctx.fillStyle = stripped ? "#14202e" : selected ? "#477b88" : "#304956"; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = selected ? PAL.ui : "#59727a"; ctx.strokeRect(x, y, w, h);
      if (part) {
        ctx.fillStyle = stripped ? PAL.greyDark : PAL.gold;
        ctx.fillRect(x + 3, y + h - 5, (w - 6) * (part.total ? part.remaining / part.total : 0), 2);
      }
      if (this.active === part && Math.floor(this.time * 8) % 2) {
        ctx.fillStyle = PAL.white; ctx.fillRect(x + w - 2, y + 4, 4, 2);
        ctx.fillStyle = PAL.gold; ctx.fillRect(x + w + 3, y + 8, 2, 2);
      }
    });
    drawText(ctx, "EXTERIOR SCAN", 20, 57, PAL.grey);
  }
}
