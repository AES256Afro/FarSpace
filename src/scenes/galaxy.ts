// Galaxy map: systems, territories, wars, links with distances, fuel-aware
// course plotting with refuel stops highlighted.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { faction, commodity } from "../data/data";
import { dist } from "../core/mathx";
import { navRoute, routeFuel, jumpFuelCost, repLabel, permitDenied, syndicateAt, findStation } from "../world";
import { sfx } from "../core/sfx";
import * as wire from "../core/wire";

const OX = 90;
const OY = 30;

export class GalaxyScene implements Scene {
  touchMode = "menu" as const;
  selected: string | null = null;
  rooms: Record<string, number> = {};
  pilots = 0;

  enter(g: Game): void {
    this.selected = g.world.player.systemId;
    void wire.fetchSquadronData();
    void wire.fetchBases();
    void wire.fetchRooms().then((r) => { this.rooms = Object.fromEntries(r.rooms.map((x) => [x.system.toLowerCase(), x.count])); this.pilots = r.pilots; });
  }

  update(g: Game, dt: number): void {
    const inp = g.input;
    if (inp.wasPressed("Escape") || inp.wasPressed("g")) { g.setScene("flight"); return; }
    if (inp.wasPressed("F5")) g.save();
    if (inp.wasPressed("F9")) g.load();
    if (inp.mousePressed) {
      let best: string | null = null;
      let bestD = 14;
      for (const [id, sys] of Object.entries(g.world.systems)) {
        const d = dist(inp.mouseX, inp.mouseY, OX + sys.gx, OY + sys.gy);
        if (d < bestD) { bestD = d; best = id; }
      }
      if (best) {
        if (this.selected === best && best !== g.world.player.systemId) {
          const p = g.world.player;
          p.navTarget = p.navTarget === best ? null : best;
          sfx.select();
        }
        this.selected = best;
      }
    }
    if (inp.wasPressed("b") && this.selected) {
      const p = g.world.player;
      p.bookmarks ??= [];
      const i = p.bookmarks.indexOf(this.selected);
      if (i >= 0) p.bookmarks.splice(i, 1); else p.bookmarks.push(this.selected);
      sfx.blip();
    }
    if (inp.wasPressed("n") && this.selected) {
      const p = g.world.player;
      p.navTarget = p.navTarget === this.selected ? null : this.selected;
      sfx.select();
    }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, VW, VH);
    for (let i = 0; i < 80; i++) {
      const hx = (Math.imul(i + 3, 2654435761) >>> 0) % VW;
      const hy = (Math.imul(i + 11, 1597334677) >>> 0) % VH;
      ctx.fillStyle = i % 7 === 0 ? PAL.starMid : PAL.starDim;
      ctx.fillRect(hx, hy, 1, 1);
    }
    const w = g.world;
    const title = w.realGalaxy ? `SOL NEIGHBOURHOOD - ${w.galaxyLy ?? 20} LY` : "GALAXY MAP";
    drawText(ctx, title, VW / 2 - textWidth(title) / 2, 6, PAL.ui);
    if (this.pilots) drawText(ctx, `${this.pilots} PILOT${this.pilots === 1 ? "" : "S"} FLYING NOW`, VW / 2 - textWidth(`${this.pilots} PILOTS FLYING NOW`) / 2, 15, PAL.info);

    ctx.strokeStyle = PAL.uiBorder;
    for (const sys of Object.values(w.systems)) {
      for (const l of sys.links) {
        const o = w.systems[l];
        if (sys.id < l) {
          ctx.beginPath(); ctx.moveTo(OX + sys.gx, OY + sys.gy); ctx.lineTo(OX + o.gx, OY + o.gy); ctx.stroke();
        }
      }
    }
    const cur = w.systems[w.player.systemId];
    ctx.strokeStyle = PAL.uiDim;
    for (const l of cur.links) {
      const o = w.systems[l];
      ctx.beginPath(); ctx.moveTo(OX + cur.gx, OY + cur.gy); ctx.lineTo(OX + o.gx, OY + o.gy); ctx.stroke();
      const mx = (cur.gx + o.gx) / 2 + OX, my = (cur.gy + o.gy) / 2 + OY;
      const cost = jumpFuelCost(w, cur.id, l);
      drawText(ctx, `${cost}F`, mx - 4, my - 3, cost > w.player.fuel ? PAL.danger : PAL.greyDark);
    }
    // your trade runs of the last week, and the selected syndicate's partner lanes
    {
      const week = Date.now() - 7 * 86400_000;
      ctx.globalAlpha = 0.5; ctx.strokeStyle = PAL.gold;
      for (const r of (w.player.routes ?? []).filter((x) => x.t > week)) {
        const a = findStation(w, r.from)?.sys, b = findStation(w, r.to)?.sys;
        if (!a || !b || a === b) continue;
        ctx.beginPath(); ctx.moveTo(OX + a.gx, OY + a.gy); ctx.lineTo(OX + b.gx, OY + b.gy); ctx.stroke();
      }
      const selSys = this.selected ? w.systems[this.selected] : null;
      const sy = selSys ? (w.syndicates ?? []).find((x) => x.systemId === selSys.id) : null;
      if (sy) {
        ctx.strokeStyle = sy.color;
        for (const pid of sy.partners) { const b = findStation(w, pid)?.sys; if (b) { ctx.beginPath(); ctx.moveTo(OX + selSys!.gx, OY + selSys!.gy); ctx.lineTo(OX + b.gx, OY + b.gy); ctx.stroke(); } }
      }
      ctx.globalAlpha = 1;
    }
    let route: string[] | null = null;
    if (w.player.navTarget) {
      route = navRoute(w, w.player.systemId, w.player.navTarget);
      if (route && route.length > 1) {
        ctx.strokeStyle = PAL.gold;
        for (let i = 0; i < route.length - 1; i++) {
          const a = w.systems[route[i]], b = w.systems[route[i + 1]];
          ctx.beginPath(); ctx.moveTo(OX + a.gx, OY + a.gy); ctx.lineTo(OX + b.gx, OY + b.gy); ctx.stroke();
        }
      }
    }
    for (const sys of Object.values(w.systems)) {
      const fac = faction(sys.factionId);
      const x = OX + sys.gx, y = OY + sys.gy;
      const war = w.wars.find((ww) => ww.systemId === sys.id);
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = war ? PAL.danger : fac.color;
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = sys.sunColor;
      ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
      ctx.fillStyle = fac.color;
      ctx.fillRect(Math.round(x) - 1, Math.round(y) + 3, 3, 1);
      drawText(ctx, sys.name, x - textWidth(sys.name) / 2, y + 6, sys.id === this.selected ? PAL.white : PAL.grey);
      if (war && Math.floor(w.time * 2) % 2 === 0) drawText(ctx, "WAR", x - 6, y - 12, PAL.danger);
      if (w.crisis && w.crisis.systemId === sys.id && w.crisis.delivered < w.crisis.need && w.time < w.crisis.until && Math.floor(w.time * 2) % 2 === 1) drawText(ctx, "CRISIS", x - 12, y - 12, PAL.danger);
      if (sys.permit) { ctx.strokeStyle = permitDenied(w, sys.id) ? PAL.warn : PAL.good; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke(); }
      { const st = w.player.story ?? 0; const here = (st === 2 && w.player.storyTarget?.systemId === sys.id) || (st === 4 && w.player.storyVeil === sys.id) || (st === 5 && w.player.storyOrigin === sys.id); if (here && Math.floor(w.time * 2) % 2 === 0) drawText(ctx, "SIGNAL", x - 12, y - 12, PAL.info); }
      if (route && route.includes(sys.id) && sys.stations.length && sys.id !== w.player.systemId) {
        ctx.fillStyle = PAL.gold; ctx.fillRect(Math.round(x) + 4, Math.round(y) - 4, 2, 2);
      }
      if (w.player.bookmarks?.includes(sys.id)) { ctx.fillStyle = PAL.gold; ctx.fillRect(Math.round(x) - 6, Math.round(y) - 6, 2, 2); ctx.fillRect(Math.round(x) + 4, Math.round(y) - 6, 2, 2); }
      const here = this.rooms[sys.name.toLowerCase()];
      if (here) { ctx.fillStyle = PAL.info; ctx.fillRect(Math.round(x) + 4, Math.round(y) - 1, 2, 2); drawText(ctx, `${here}`, x + 7, y - 4, PAL.info); }
      if (sys.id === w.player.systemId) { ctx.strokeStyle = PAL.white; ctx.strokeRect(Math.round(x) - 4.5, Math.round(y) - 4.5, 9, 9); }
      if (sys.id === this.selected) { ctx.strokeStyle = PAL.ui; ctx.strokeRect(Math.round(x) - 6.5, Math.round(y) - 6.5, 13, 13); }
    }
    if (this.selected) {
      const sys = w.systems[this.selected];
      const fac = faction(sys.factionId);
      const px = VW - 122, py = 24;
      ctx.fillStyle = "#0c1220"; ctx.fillRect(px, py, 116, 176);
      ctx.strokeStyle = PAL.uiBorder; ctx.strokeRect(px + 0.5, py + 0.5, 115, 175);
      let y = py + 6;
      drawText(ctx, sys.name.toUpperCase(), px + 6, y, PAL.white); y += 9;
      if (sys.starClass) { drawText(ctx, `CLASS ${sys.starClass}`, px + 6, y, PAL.grey); y += 9; }
      drawText(ctx, fac.name.slice(0, 26), px + 6, y, fac.color); y += 9;
      drawText(ctx, `STANDING: ${repLabel(w.player.rep[sys.factionId] ?? 0)}`, px + 6, y, PAL.grey); y += 11;
      drawText(ctx, `PLANETS ${sys.planets.length}  STATIONS ${sys.stations.length}`, px + 6, y, PAL.grey); y += 9;
      drawText(ctx, `WRECKS ${sys.wrecks.filter((x) => !x.looted).length}  SIGNALS ${sys.anomalies.filter((a) => !a.claimed).length}`, px + 6, y, PAL.grey); y += 9;
      const pir = sys.pirateActivity;
      drawText(ctx, `PIRACY: ${pir > 0.6 ? "SEVERE" : pir > 0.3 ? "MODERATE" : "LOW"}`, px + 6, y, pir > 0.6 ? PAL.danger : pir > 0.3 ? PAL.warn : PAL.good); y += 9;
      if (w.wars.some((ww) => ww.systemId === sys.id)) { drawText(ctx, "ACTIVE WAR ZONE", px + 6, y, PAL.danger); y += 9; }
      if (sys.permit) { drawText(ctx, permitDenied(w, sys.id) ? "PERMIT SPACE: ALLIED ONLY" : "PERMIT SPACE: YOU'RE CLEARED", px + 6, y, permitDenied(w, sys.id) ? PAL.warn : PAL.good); y += 9; }
      if (w.synWar && w.synWar.systemId === sys.id) { drawText(ctx, `SYNDICATE WAR: [${w.synWar.attacker}] VS [${w.synWar.defender}]`, px + 6, y, PAL.danger); y += 9; }
      if (w.crisis && w.crisis.systemId === sys.id && w.crisis.delivered < w.crisis.need && w.time < w.crisis.until) { drawText(ctx, `CRISIS: ${w.crisis.need - w.crisis.delivered} ${commodity(w.crisis.commodityId).name.toUpperCase()} NEEDED`, px + 6, y, PAL.danger); y += 9; }
      { const st = w.player.story ?? 0; const t = w.player.storyTarget; if (st === 2 && t?.systemId === sys.id) { drawText(ctx, "THE SIGNAL: THE RUIN IS HERE", px + 6, y, PAL.info); y += 9; } if (st === 4 && w.player.storyVeil === sys.id) { drawText(ctx, "THE SIGNAL: THE VEIL LISTEN HERE", px + 6, y, PAL.info); y += 9; } if (st === 5 && w.player.storyOrigin === sys.id) { drawText(ctx, "THE SIGNAL: THE COUNT ENDS HERE", px + 6, y, PAL.info); y += 9; } }
      const lvl = w.player.expLog?.[sys.id] ?? 0;
      drawText(ctx, lvl === 2 ? "LOGGED: DETAILED" : lvl === 1 ? "LOGGED: BASIC" : "UNLOGGED", px + 6, y, lvl ? PAL.grey : PAL.greyDark); y += 9;
      const homes = (w.player.homesteads ?? []).filter((h) => h.systemId === sys.id);
      if (homes.length) { drawText(ctx, `HOMESTEAD: ${homes.map((h) => sys.planets[h.planetIdx].name).join(", ")}`.slice(0, 27), px + 6, y, PAL.gold); y += 9; }
      const first = w.player.firsts?.[sys.id];
      if (first) { drawText(ctx, `FIRST: ${first}`.slice(0, 27), px + 6, y, PAL.gold); y += 9; }
      if (w.player.bookmarks?.includes(sys.id)) { drawText(ctx, "BOOKMARKED (B)", px + 6, y, PAL.gold); y += 9; }
      const n = this.rooms[sys.name.toLowerCase()];
      if (n) { drawText(ctx, `${n} PILOT${n === 1 ? "" : "S"} HERE NOW`, px + 6, y, PAL.info); y += 9; }
      const patron = wire.patronOf(sys.factionId);
      if (patron) { drawText(ctx, `FACTION PATRON: [${patron}]`, px + 6, y, patron === wire.getSquadron() ? PAL.gold : PAL.info); y += 9; }
      const rares = sys.stations.filter((st) => st.rare && (w.player.marketMemory?.[st.id])).map((st) => commodity(st.rare!).name);
      if (rares.length) { drawText(ctx, `RARE: ${rares.join(", ")}`.slice(0, 27), px + 6, y, PAL.gold); y += 9; }
      y += 3;
      drawText(ctx, "STATIONS:", px + 6, y, PAL.greyDark); y += 9;
      for (const st of sys.stations) { const b = wire.baseAt(st.id); const sy = syndicateAt(w, st.id); drawText(ctx, `${st.military ? "*" : "-"} ${st.name}${b ? ` [${b.tag}]` : sy ? ` [${sy.tag}] AI` : ""}`.slice(0, 27), px + 6, y, b ? PAL.gold : sy ? sy.color : st.military ? PAL.danger : PAL.ui); y += 8; }
      y += 3;
      drawText(ctx, "LINKS:", px + 6, y, PAL.greyDark); y += 9;
      for (const l of sys.links) { drawText(ctx, `> ${w.systems[l].name} ${sys.ly[l] ?? "?"}LY`.slice(0, 27), px + 6, y, PAL.info); y += 8; }
    }
    if (route && route.length > 1 && w.player.navTarget) {
      const dst = w.systems[w.player.navTarget];
      const fuel = routeFuel(w, route);
      const ok = fuel <= w.player.fuel;
      drawText(ctx, `COURSE: ${dst.name} - ${route.length - 1} JUMPS - ${fuel} FUEL (${Math.round(w.player.fuel)} ABOARD)`, OX, VH - 30, ok ? PAL.gold : PAL.warn);
      if (!ok) drawText(ctx, "NOT ENOUGH FUEL: REFUEL AT THE MARKED STATIONS ALONG THE ROUTE", OX, VH - 21, PAL.warn);
    }
    const help = "CLICK: INTEL - CLICK AGAIN/N: PLOT COURSE - B: BOOKMARK - ESC BACK";
    drawText(ctx, help, VW / 2 - textWidth(help) / 2, VH - 10, PAL.greyDark);
  }
}
