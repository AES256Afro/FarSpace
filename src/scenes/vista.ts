// The viewport: look out of your own ship. The sun, the planets, the station,
// the gate, whatever vast thing is out there, laid along the window by bearing.
// A/D turn your head. Passengers and crew come to look too.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { wondersIn, infraAt, galaxyEventAt, systemLore, planetLore, passengersAboard } from "../world";
import { drawStars } from "./flight/render";
import { hashStr } from "../core/rng";
import { dist } from "../core/mathx";

const wrapAngle = (a: number): number => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
const FIELD = Math.PI * 0.55; // half the field of view

export class VistaScene implements Scene {
  touchMode = "menu" as const;
  look = 0;
  credited = new Set<string>();
  enter(g: Game): void {
    this.look = 0;
    const p = g.world.player;
    p.vistaViews = (p.vistaViews ?? 0) + 1;
    if (!this.credited.has(p.systemId)) {
      this.credited.add(p.systemId);
      for (const c of p.crew) c.morale = Math.min(100, c.morale + 1);
      for (const m of passengersAboard(p)) m.mood = Math.min(100, (m.mood ?? 60) + 2);
    }
  }
  update(g: Game, dt: number): void {
    const inp = g.input;
    if (inp.wasPressed("Escape") || inp.wasPressed("v")) { g.setScene("interior"); return; }
    if (inp.isDown("a") || inp.isDown("ArrowLeft")) this.look -= dt * 1.4;
    if (inp.isDown("d") || inp.isDown("ArrowRight")) this.look += dt * 1.4;
  }
  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    const w = g.world; const p = w.player; const sys = w.systems[p.systemId];
    const heading = p.angle + this.look;
    ctx.fillStyle = "#05070f"; ctx.fillRect(0, 0, VW, VH);
    drawStars(ctx, heading * 420, p.y * 0.05 + 300, 1);
    type Obj = { x: number; y: number; d: number; draw: (sx: number, sy: number) => void; label?: string; lore?: string; key: string };
    const objs: Obj[] = [];
    const place = (x: number, y: number, key: string, draw: (sx: number, sy: number, app: number) => void, base: number, k: number, max: number, label?: string, lore?: string) => {
      const d = Math.max(1, dist(p.x, p.y, x, y));
      const app = Math.max(2, Math.min(max, base * k / d));
      objs.push({ x, y, d, key, label, lore, draw: (sx, sy) => draw(sx, sy, app) });
    };
    { const spr = g.sunSprite(sys.id, sys.sunRadius, sys.sunColor); place(0, 0, "sun", (sx, sy, app) => { ctx.drawImage(spr, sx - app / 2, sy - app / 2, app, app); }, spr.width, 1400, 220, undefined, systemLore(w, sys)); }
    sys.planets.forEach((pl, i) => { const spr = g.planetSprite(sys.id, i, pl.radius, pl.palette); place(Math.cos(pl.angle) * pl.orbit, Math.sin(pl.angle) * pl.orbit, `pl${i}`, (sx, sy, app) => { ctx.drawImage(spr, sx - app / 2, sy - app / 2, app, app); }, spr.width, 700, 150, pl.name.toUpperCase(), planetLore(w, sys, i)); });
    for (const st of sys.stations) { const spr = g.stationSprite(st.id, st.military); place(Math.cos(st.angle) * st.orbit, Math.sin(st.angle) * st.orbit, st.id, (sx, sy, app) => { ctx.drawImage(spr, sx - app / 2, sy - app / 2, app, app); }, spr.width, 420, 70, st.name.toUpperCase(), `${st.name.toUpperCase()}: ${st.military ? "A NAVAL STATION. THEY WATCH YOU BACK." : "DOCKING LIGHTS, SLOW TRAFFIC, SOMEBODY'S HOME."}`); }
    for (const jp of sys.jumpPoints) { const spr = g.gateSprite(); place(jp.x, jp.y, `gate${jp.targetSystemId}`, (sx, sy, app) => { ctx.drawImage(spr, sx - app / 2, sy - app / 2, app, app); }, spr.width, 380, 50, `GATE TO ${(w.systems[jp.targetSystemId]?.name ?? "?").toUpperCase()}`, "THE GATE. A RING OF SOMETHING OLDER THAN ANY OF US, HOLDING A DOOR OPEN."); }
    for (const wd of wondersIn(w, sys.id)) place(wd.x, wd.y, wd.id, (sx, sy, app) => { ctx.globalAlpha = 0.35; ctx.fillStyle = wd.kind === "pulsar" || wd.kind === "glass" ? "#8ec9f0" : wd.kind === "lantern" || wd.kind === "twins" || wd.kind === "choir" ? "#ffb347" : wd.kind === "loom" ? "#b28fe0" : "#9aa5bd"; ctx.beginPath(); ctx.arc(sx, sy, app, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = "#f2f4ff"; ctx.fillRect(sx - 1, sy - 1, 2, 2); }, 60, 900, 80, wd.seen ? wd.name.toUpperCase() : "SOMETHING VAST", wd.desc.toUpperCase());
    for (const inf of infraAt(w, sys.id)) place(inf.x, inf.y, inf.id, (sx, sy) => { ctx.fillStyle = Math.floor(w.time * 2) % 2 ? "#ffd75a" : "#7a5a1a"; ctx.fillRect(sx - 1, sy - 1, 2, 2); }, 4, 200, 4, inf.kind === "beacon" ? "A LIGHT" : "A DEPOT", "A LIGHT IN THE DARK. SOMEBODY PUT IT THERE ON PURPOSE.");
    objs.sort((a, b) => b.d - a.d);
    let nearest: Obj | null = null;
    for (const o of objs) {
      const rel = wrapAngle(Math.atan2(o.y - p.y, o.x - p.x) - heading);
      if (Math.abs(rel) > FIELD) continue;
      const sx = Math.round(VW / 2 + (rel / FIELD) * (VW / 2 + 30));
      const sy = Math.round(VH / 2 - 14 + ((hashStr(o.key) % 50) - 25));
      o.draw(sx, sy);
      if (o.label && o.d < 2600) drawText(ctx, o.label, sx - textWidth(o.label) / 2, sy + 12 + Math.min(40, (hashStr(o.key + "l") % 30)), PAL.greyDark);
      if (!nearest || o.d < nearest.d) nearest = o;
    }
    // the comet, if one's in the sky
    if (galaxyEventAt(w, sys.id)?.kind === "comet") { const cx = Math.round(VW * 0.7 + Math.sin(w.time * 0.1) * 40), cy = 40; ctx.fillStyle = "#f2f4ff"; ctx.fillRect(cx, cy, 3, 3); ctx.globalAlpha = 0.5; ctx.fillStyle = "#8ec9f0"; ctx.fillRect(cx + 3, cy + 1, 70, 1); ctx.fillRect(cx + 3, cy, 40, 1); ctx.globalAlpha = 1; drawText(ctx, "THE COMET", cx - 10, cy + 8, PAL.greyDark); }
    // the window frame
    ctx.fillStyle = "#1a2036"; ctx.fillRect(0, 0, VW, 14); ctx.fillRect(0, VH - 40, VW, 40);
    ctx.fillStyle = "#232a3d"; ctx.fillRect(Math.round(VW / 3) - 2, 0, 4, VH - 40); ctx.fillRect(Math.round(VW * 2 / 3) - 2, 0, 4, VH - 40);
    ctx.fillStyle = "#2c3550"; ctx.fillRect(0, 14, VW, 1); ctx.fillRect(0, VH - 41, VW, 1);
    drawText(ctx, "THE VIEWPORT - A/D LOOK AROUND - ESC BACK", 8, 4, PAL.grey);
    const relSun = wrapAngle(Math.atan2(-p.y, -p.x) - heading);
    const where = Math.abs(relSun) < 0.5 ? "SUNWARD" : Math.abs(relSun) > 2.6 ? "SUN ASTERN, THE DARK AHEAD" : "ACROSS THE SYSTEM";
    drawText(ctx, `${sys.name.toUpperCase()} - LOOKING ${where}`, 8, VH - 36, PAL.white);
    const lore = nearest?.lore ?? systemLore(w, sys);
    const words = lore.toUpperCase().split(" "); let line = ""; let ly = VH - 27; const lines: string[] = [];
    for (const wd of words) { if (textWidth(line + " " + wd) > VW - 16) { lines.push(line); line = wd; } else line = line ? line + " " + wd : wd; }
    lines.push(line);
    for (const l of lines.slice(0, 2)) { drawText(ctx, l, 8, ly, PAL.grey); ly += 8; }
    const pax = passengersAboard(p)[0];
    const company = pax ? `${(pax.passengerName ?? "YOUR PASSENGER").toUpperCase()} PRESSES UP AGAINST THE GLASS BESIDE YOU.` : p.crew.length ? `${p.crew[Math.floor(w.time / 30) % p.crew.length].name.toUpperCase()} LEANS IN THE HATCHWAY, LOOKING TOO.` : p.cat ? `${p.cat.name.toUpperCase()} SITS ON THE SILL AND WATCHES THE STARS WITH YOU.` : "NOBODY ELSE ABOARD TO SHOW IT TO.";
    drawText(ctx, company, 8, VH - 10, PAL.greyDark);
  }
}
