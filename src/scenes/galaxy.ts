// Galaxy map: star systems, faction territories, jump links, nav info.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { faction } from "../data/data";
import { dist } from "../core/mathx";

const OX = 90; // map viewport offset
const OY = 30;

export class GalaxyScene implements Scene {
  selected: string | null = null;

  enter(g: Game): void {
    this.selected = g.world.player.systemId;
  }

  update(g: Game, dt: number): void {
    const inp = g.input;
    if (inp.wasPressed("Escape") || inp.wasPressed("g")) { g.setScene("flight"); return; }
    if (inp.wasPressed("F5")) g.save();
    if (inp.wasPressed("F9")) g.load();
    // click to select a system
    if (inp.mousePressed) {
      let best: string | null = null;
      let bestD = 14;
      for (const [id, sys] of Object.entries(g.world.systems)) {
        const d = dist(inp.mouseX, inp.mouseY, OX + sys.gx, OY + sys.gy);
        if (d < bestD) { bestD = d; best = id; }
      }
      if (best) this.selected = best;
    }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, VW, VH);
    // faint backdrop stars
    for (let i = 0; i < 80; i++) {
      const hx = (Math.imul(i + 3, 2654435761) >>> 0) % VW;
      const hy = (Math.imul(i + 11, 1597334677) >>> 0) % VH;
      ctx.fillStyle = i % 7 === 0 ? PAL.starMid : PAL.starDim;
      ctx.fillRect(hx, hy, 1, 1);
    }
    drawText(ctx, "GALAXY MAP", VW / 2 - textWidth("GALAXY MAP") / 2, 6, PAL.ui);

    const w = g.world;
    // links
    ctx.strokeStyle = PAL.uiBorder;
    for (const sys of Object.values(w.systems)) {
      for (const l of sys.links) {
        const o = w.systems[l];
        if (sys.id < l) {
          ctx.beginPath();
          ctx.moveTo(OX + sys.gx, OY + sys.gy);
          ctx.lineTo(OX + o.gx, OY + o.gy);
          ctx.stroke();
        }
      }
    }
    // highlight route: links from current system
    const cur = w.systems[w.player.systemId];
    ctx.strokeStyle = PAL.uiDim;
    for (const l of cur.links) {
      const o = w.systems[l];
      ctx.beginPath();
      ctx.moveTo(OX + cur.gx, OY + cur.gy);
      ctx.lineTo(OX + o.gx, OY + o.gy);
      ctx.stroke();
    }
    // systems
    for (const sys of Object.values(w.systems)) {
      const fac = faction(sys.factionId);
      const x = OX + sys.gx, y = OY + sys.gy;
      // territory glow
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = fac.color;
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = fac.color;
      ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
      drawText(ctx, sys.name, x - textWidth(sys.name) / 2, y + 6, sys.id === this.selected ? PAL.white : PAL.grey);
      if (sys.id === w.player.systemId) {
        ctx.strokeStyle = PAL.white;
        ctx.strokeRect(Math.round(x) - 4.5, Math.round(y) - 4.5, 9, 9);
      }
      if (sys.id === this.selected) {
        ctx.strokeStyle = PAL.ui;
        ctx.strokeRect(Math.round(x) - 6.5, Math.round(y) - 6.5, 13, 13);
      }
    }
    // info panel for selected system
    if (this.selected) {
      const sys = w.systems[this.selected];
      const fac = faction(sys.factionId);
      const px = VW - 118, py = 24;
      ctx.fillStyle = "#0c1220";
      ctx.fillRect(px, py, 112, 150);
      ctx.strokeStyle = PAL.uiBorder;
      ctx.strokeRect(px + 0.5, py + 0.5, 111, 149);
      let y = py + 6;
      drawText(ctx, sys.name.toUpperCase(), px + 6, y, PAL.white); y += 10;
      drawText(ctx, fac.name, px + 6, y, fac.color); y += 12;
      drawText(ctx, `PLANETS: ${sys.planets.length}`, px + 6, y, PAL.grey); y += 9;
      drawText(ctx, `STATIONS: ${sys.stations.length}`, px + 6, y, PAL.grey); y += 9;
      drawText(ctx, `BELT ROCKS: ${sys.asteroids.length}`, px + 6, y, PAL.grey); y += 9;
      const pir = sys.pirateActivity;
      drawText(ctx, `PIRACY: ${pir > 0.6 ? "SEVERE" : pir > 0.3 ? "MODERATE" : "LOW"}`, px + 6, y, pir > 0.6 ? PAL.danger : pir > 0.3 ? PAL.warn : PAL.good); y += 12;
      drawText(ctx, "STATIONS:", px + 6, y, PAL.greyDark); y += 9;
      for (const st of sys.stations) {
        drawText(ctx, `${st.military ? "*" : "-"} ${st.name}`.slice(0, 26), px + 6, y, st.military ? PAL.danger : PAL.ui);
        y += 8;
      }
      y += 4;
      drawText(ctx, "LINKS:", px + 6, y, PAL.greyDark); y += 9;
      for (const l of sys.links) {
        drawText(ctx, `> ${w.systems[l].name}`, px + 6, y, PAL.info);
        y += 8;
      }
    }
    drawText(ctx, "CLICK SYSTEM FOR INTEL - TRAVEL VIA JUMP GATES - ESC BACK", VW / 2 - textWidth("CLICK SYSTEM FOR INTEL - TRAVEL VIA JUMP GATES - ESC BACK") / 2, VH - 10, PAL.greyDark);
  }
}
