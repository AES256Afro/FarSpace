// The roster: everyone aboard, how they're doing, and a bonus when they've
// earned one. Reached with R aboard or in the lounge, or from the pause menu.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { ROLE_INFO, XP_STEPS_LABEL } from "../data/crew";
import { bond, bondLabel, findStation, ledger, XP_STEPS, onWatch, captainNickname } from "../world";
import { arcObjective } from "../core/crewarcs";
import { sfx } from "../core/sfx";

export class RosterScene implements Scene {
  touchMode = "menu" as const;
  cursor = 0;
  enter(): void { this.cursor = 0; }
  update(g: Game, dt: number): void {
    void dt;
    const p = g.world.player;
    if (g.input.wasPressed("Escape") || g.input.wasPressed("r")) { const back = g.settingsReturn; g.settingsReturn = "title"; if (back === "flight") (g.scenes.flight as unknown as { resumeNext: boolean }).resumeNext = true; g.setScene(back); return; }
    const n = p.crew.length;
    if (!n) return;
    if (g.input.wasPressed("ArrowDown")) { this.cursor = (this.cursor + 1) % n; sfx.blip(); }
    if (g.input.wasPressed("ArrowUp")) { this.cursor = (this.cursor + n - 1) % n; sfx.blip(); }
    if (g.input.wasPressed("Enter")) {
      const c = p.crew[this.cursor];
      if (p.credits < 100) { g.toast("NOT ENOUGH CREDITS FOR A BONUS"); return; }
      p.credits -= 100; ledger(p, "crew", -100); c.morale = Math.min(100, c.morale + 15); c.loyalty = (c.loyalty ?? 0) + (c.morale >= 100 ? 0 : 0.5);
      g.toast(`${c.name.toUpperCase()} POCKETS 100CR. MORALE UP.`); sfx.pickup();
    }
  }
  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    const p = g.world.player; const w = g.world;
    ctx.fillStyle = PAL.uiPanel; ctx.fillRect(0, 0, VW, VH);
    drawText(ctx, `THE ROSTER - ${p.crew.length} ABOARD${(p.shoreCrew ?? []).length ? `, ${(p.shoreCrew ?? []).length} ON LEAVE` : ""} - ENTER: 100CR BONUS - ESC BACK`, 12, 8, PAL.white);
    if (!p.crew.length) { drawText(ctx, "NOBODY ABOARD BUT YOU. THE LOUNGE AT ANY STATION HAS PEOPLE LOOKING FOR A BERTH.", 12, 30, PAL.greyDark); }
    let y = 24;
    p.crew.forEach((c, i) => {
      const sel = i === this.cursor;
      if (sel) { ctx.fillStyle = "#13203a"; ctx.fillRect(6, y - 3, VW - 12, 40); }
      const home = c.home ? (findStation(w, c.home)?.st.name ?? "?") : "no home port";
      drawText(ctx, `${c.name.toUpperCase()} - ${ROLE_INFO[c.role].label} ${"*".repeat(c.skill)}${c.sick ? " - LAID UP (" + c.sick.kind.toUpperCase() + ")" : p.crew.length >= 2 ? (onWatch(p, i, w.time) ? " - ON WATCH" : " - OFF WATCH") : ""}`, 12, y, sel ? PAL.white : PAL.ui);
      drawText(ctx, `MORALE ${Math.round(c.morale)}   LOYALTY ${(c.loyalty ?? 0).toFixed(0)}   WAGE ${c.wage}CR   ${c.docks ?? 0} DOCKINGS   HOME ${home.toUpperCase()}`, 12, y + 9, PAL.grey);
      const xp = c.xp ?? 0, need = c.skill < 3 ? XP_STEPS[c.skill] : 0;
      ctx.fillStyle = PAL.greyDark; ctx.fillRect(300, y + 1, 80, 3); ctx.fillStyle = c.morale >= 65 ? PAL.good : c.morale >= 30 ? PAL.warn : PAL.danger; ctx.fillRect(300, y + 1, Math.round(c.morale * 0.8), 3); drawText(ctx, "MORALE", 384, y - 1, PAL.greyDark);
      if (need) { ctx.fillStyle = PAL.greyDark; ctx.fillRect(300, y + 10, 80, 3); ctx.fillStyle = PAL.info; ctx.fillRect(300, y + 10, Math.round(80 * Math.min(1, xp / need)), 3); drawText(ctx, `${XP_STEPS_LABEL} ${xp}/${need}`, 384, y + 8, PAL.greyDark); }
      else drawText(ctx, "AT THEIR BEST", 384, y + 8, PAL.gold);
      const rel = p.crew.filter((o) => o !== c && bond(c, o) !== 0).map((o) => `${o.name} ${bondLabel(bond(c, o)).toLowerCase()}`).join(", ");
      const arc = arcObjective(w, c);
      drawText(ctx, `${c.trait ? c.trait.toUpperCase() + ". " : ""}${rel ? rel.toUpperCase() + ". " : ""}${c.request ? "HAS AN ASK. " : ""}${c.arc?.done ? "STORY TOLD." : arc ? arc.split(": ").slice(1).join(": ").slice(0, 50) : ""}`.slice(0, 112), 12, y + 18, PAL.greyDark);
      y += 44;
    });
    for (const s of p.shoreCrew ?? []) { drawText(ctx, `${s.member.name.toUpperCase()} - ON LEAVE AT ${(findStation(w, s.stationId)?.st.name ?? "?").toUpperCase()} (${s.docks} DOCKINGS SO FAR)`, 12, y, PAL.gold); y += 10; }
    drawText(ctx, `CREDITS ${p.credits}   CAT ${p.cat ? p.cat.name.toUpperCase() : "NONE"}   BERTHS ${p.crew.length + (p.shoreCrew ?? []).length}${captainNickname(w) ? `   THE LANES CALL YOU ${captainNickname(w)}` : ""}`, 12, VH - 12, PAL.greyDark);
    void textWidth;
  }
}
