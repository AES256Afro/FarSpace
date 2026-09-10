// Orbit view: a spinning globe with territories, POIs to pin/target, orbital
// satellites, scanning, and landing at surface outposts.

import { logSight, settlementTierLabel, planetLore } from "../world";
import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { faction } from "../data/data";
import { Poi, adjustRep, pushEvent } from "../world";
import { sfx } from "../core/sfx";
import { music } from "../core/music";
import { hasModule } from "../data/modules";
import { clamp } from "../core/mathx";

const R = 64;
const GX = 130, GY = 140;

export class OrbitScene implements Scene {
  touchMode = "menu" as const;
  rot = 0;
  sel = 0;
  scan = 0;
  msg = ""; msgTimer = 0;
  rowBoxes: [number, number][] = [];
  regionRows: [number, number][] = [];
  regionSel: number | null = null; // territory picked for the rover; null = the selected site's region

  enter(g: Game): void {
    this.sel = 0;
    this.scan = 0;
    const sys = g.world.systems[g.world.player.systemId];
    const pl = sys.planets[g.orbitPlanetIdx];
    music.setMood(sys.factionId, 0);
    g.world.player.lastOrbit = { systemId: sys.id, planetIdx: g.orbitPlanetIdx };
    this.msg = `ORBIT ESTABLISHED: ${pl.name.toUpperCase()}`;
    this.msgTimer = 3;
    {
      const p = g.world.player;
      const before = p.missions.filter((m) => m.kind === "passenger" && m.accepted && !m.done && m.sightSeen).length;
      const any = logSight(p, "planet", `${pl.name} from orbit`, sys.id, g.orbitPlanetIdx);
      const after = p.missions.filter((m) => m.kind === "passenger" && m.accepted && !m.done && m.sightSeen).length;
      if (after > before) { const m = p.missions.find((x) => x.kind === "passenger" && x.accepted && !x.done && x.sightSeen && x.sightPlanetIdx === g.orbitPlanetIdx); g.toast(`${(m?.passengerName ?? "THE TOURISTS").toUpperCase()}: "WORTH EVERY CREDIT." - NOW TAKE THEM TO THEIR STATION`); sfx.pickup(); }
      else if (any) g.toast("YOUR PASSENGERS CROWD THE VIEWPORT. ANOTHER SIGHT FOR THE BILL.");
    }
    g.showHint("orbit", "ARROWS/CLICK TO TARGET A POI - E LANDS THERE - L DROPS THE ROVER IN ITS REGION - HOLD V TO SCAN");
  }

  // Project lat/lon onto the visible hemisphere; null if on the far side
  project(lat: number, lon: number): [number, number] | null {
    const la = (lat * Math.PI) / 180;
    const lo = (lon * Math.PI) / 180 - this.rot;
    const x = Math.cos(la) * Math.sin(lo);
    const z = Math.cos(la) * Math.cos(lo);
    const y = -Math.sin(la);
    if (z < 0.05) return null;
    return [GX + x * R, GY + y * R];
  }

  update(g: Game, dt: number): void {
    const inp = g.input;
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    const pl = sys.planets[g.orbitPlanetIdx];
    const surf = pl.surface!;
    this.rot += dt * 0.25;
    if (inp.wasPressed("Escape")) { g.setScene("flight"); return; }
    if (inp.wasPressed("F5")) g.save();
    const pois = surf.pois;
    if (inp.wasPressed("ArrowDown")) { this.sel = (this.sel + 1) % pois.length; sfx.blip(); }
    if (inp.wasPressed("ArrowUp")) { this.sel = (this.sel + pois.length - 1) % pois.length; sfx.blip(); }
    if (inp.mousePressed) {
      const rrow = this.regionRows.findIndex(([y0, y1]) => inp.mouseY >= y0 && inp.mouseY <= y1 && inp.mouseX > 240);
      if (rrow >= 0) { this.regionSel = this.regionSel === rrow ? null : rrow; sfx.blip(); }
      const row = this.rowBoxes.findIndex(([y0, y1]) => inp.mouseY >= y0 && inp.mouseY <= y1 && inp.mouseX > 240);
      if (row >= 0) { this.sel = row; sfx.blip(); }
      // click a marker on the globe
      pois.forEach((poi, i) => {
        const pr = this.project(poi.lat, poi.lon);
        if (pr && Math.hypot(pr[0] - inp.mouseX, pr[1] - inp.mouseY) < 6) this.sel = i;
      });
    }
    // scan: reveals unsurveyed POIs (each pays a small survey bounty once)
    if (inp.isDown("v")) {
      this.scan = Math.min(1, this.scan + dt * (hasModule(p, "dss") ? 1.4 : 0.45));
      if (this.scan >= 1) {
        this.scan = 0;
        const fresh = pois.filter((x) => !x.surveyed);
        for (const x of fresh) x.surveyed = true;
        surf.scanned = true;
        if (fresh.length) {
          const dss = hasModule(p, "dss");
          const pay = fresh.length * (dss ? 80 : 40);
          p.credits += pay;
          p.discoveries += fresh.length;
          p.expData = (p.expData ?? 0) + fresh.length * (dss ? 60 : 30);
          g.toast(`SURVEY COMPLETE: ${fresh.length} SITES +${pay}CR +${fresh.length * (dss ? 60 : 30)} DATA`);
          adjustRep(g.world, sys.factionId, 2);
          sfx.pickup();
        } else g.toast("ALREADY SURVEYED");
      }
    } else this.scan = 0;

    if (inp.wasPressed("[") || inp.wasPressed("]")) {
      const n = surf.regions.length;
      const cur = this.regionSel ?? pois[this.sel]?.regionIdx ?? 0;
      this.regionSel = (cur + (inp.wasPressed("]") ? 1 : n - 1)) % n;
      sfx.blip();
    }
    const poi = pois[this.sel];
    const roverRegion = this.regionSel ?? poi?.regionIdx ?? 0;
    if (inp.wasPressed("l") && surf.regions[roverRegion]) {
      const reg = surf.regions[roverRegion];
      const rep = reg.factionId ? (p.rep[reg.factionId] ?? 0) : 0;
      if (reg.factionId && rep < -40) g.toast("LANDING DENIED - REGION HOSTILE TO YOU");
      else {
        g.landedRegionIdx = roverRegion;
        g.surfaceFresh = true;
        g.surfaceReturn = false;
        sfx.dock();
        g.setScene("surface");
        return;
      }
    }
    if (poi && inp.wasPressed("e")) {
      const canLand = poi.landable || poi.kind === "ruin";
      if (!canLand) { g.toast(`${poi.name.toUpperCase()}: NO LANDING PAD`); }
      else {
        const reg = surf.regions[poi.regionIdx];
        const rep = reg.factionId ? (p.rep[reg.factionId] ?? 0) : 0;
        if (reg.factionId && rep < -40) g.toast("LANDING DENIED - REGION HOSTILE TO YOU");
        else if (poi.kind === "defense") g.toast("MILITARY SITE - CIVILIAN LANDING PROHIBITED");
        else {
          g.landedPoiId = poi.id;
          sfx.dock();
          g.setScene(poi.kind === "city" ? "city" : poi.kind === "ruin" ? "ruin" : "outpost");
          return;
        }
      }
    }
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.msg = ""; }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    this.rowBoxes = [];
    this.regionRows = [];
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    const pl = sys.planets[g.orbitPlanetIdx];
    const surf = pl.surface!;
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = 0.4;
    ctx.drawImage(g.nebulaSprite(sys.id), 0, 0);
    ctx.globalAlpha = 1;
    for (let i = 0; i < 60; i++) {
      const hx = (Math.imul(i + 5, 2654435761) >>> 0) % VW, hy = (Math.imul(i + 13, 1597334677) >>> 0) % VH;
      ctx.fillStyle = i % 6 === 0 ? PAL.starMid : PAL.starDim;
      ctx.fillRect(hx, hy, 1, 1);
    }
    // globe
    const globe = g.globeSprite(sys.id, g.orbitPlanetIdx, pl.palette, this.rot);
    ctx.drawImage(globe, GX - globe.width / 2, GY - globe.height / 2);
    // orbital shell: satellites + defense platforms circling
    for (let i = 0; i < surf.satellites; i++) {
      const a = g.world.time * (0.3 + i * 0.07) + i * 1.3;
      const rx = R + 12 + (i % 3) * 5;
      const x = GX + Math.cos(a) * rx, y = GY + Math.sin(a) * rx * 0.35;
      const front = Math.sin(a) > 0;
      if (!front) continue;
      ctx.fillStyle = i % 2 === 0 ? PAL.info : PAL.grey;
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    }
    // your ship in orbit
    ctx.drawImage(g.playerShip(), GX + R + 8, GY - 40);
    // POI markers
    surf.pois.forEach((poi, i) => {
      const pr = this.project(poi.lat, poi.lon);
      if (!pr) return;
      const col = this.poiColor(poi, surf.regions[poi.regionIdx].factionId);
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(pr[0]) - 1, Math.round(pr[1]) - 1, 3, 3);
      if (i === this.sel) {
        ctx.strokeStyle = PAL.gold;
        ctx.strokeRect(Math.round(pr[0]) - 4.5, Math.round(pr[1]) - 4.5, 9, 9);
      }
    });
    if (this.scan > 0) {
      ctx.strokeStyle = PAL.info;
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.arc(GX, GY, R * (0.3 + this.scan * 0.9), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // header
    drawText(ctx, `${pl.name.toUpperCase()} - ORBIT`, 8, 6, PAL.white);
    drawText(ctx, `${sys.name} - ${faction(sys.factionId).name}`, 8, 15, faction(sys.factionId).color);
    drawText(ctx, "ESC LEAVE ORBIT", VW - textWidth("ESC LEAVE ORBIT") - 6, 6, PAL.greyDark);

    // right panel: territories + POIs
    const px = 246;
    let y = 30;
    drawText(ctx, "TERRITORIES", px, y, PAL.greyDark); y += 9;
    const roverRegion = this.regionSel ?? surf.pois[this.sel]?.regionIdx ?? 0;
    surf.regions.forEach((r, ri) => {
      const fac = r.factionId ? faction(r.factionId) : null;
      this.regionRows.push([y - 1, y + 7]);
      if (ri === roverRegion) { ctx.fillStyle = "#13203a"; ctx.fillRect(px - 4, y - 2, VW - px, 10); }
      ctx.fillStyle = r.color; ctx.fillRect(px, y + 1, 4, 4);
      const charted = p.ground?.[`${sys.id}:${g.orbitPlanetIdx}:${ri}`]?.charted;
      const home = (p.homesteads ?? []).some((h) => h.systemId === sys.id && h.planetIdx === g.orbitPlanetIdx && h.regionIdx === ri);
      drawText(ctx, `${r.name}`.slice(0, 16) + (home ? " H" : charted ? " *" : ""), px + 7, y, home ? PAL.gold : ri === roverRegion ? PAL.white : PAL.grey);
      drawText(ctx, fac ? fac.name.split(" ")[0] : "UNCLAIMED", px + 76, y, fac ? fac.color : PAL.greyDark);
      drawText(ctx, r.resource.toUpperCase(), px + 176, y, PAL.gold);
      y += 8;
    });
    y += 6;
    drawText(ctx, "POINTS OF INTEREST", px, y, PAL.greyDark); y += 9;
    surf.pois.forEach((poi, i) => {
      this.rowBoxes.push([y - 1, y + 7]);
      if (i === this.sel) { ctx.fillStyle = "#13203a"; ctx.fillRect(px - 4, y - 2, VW - px, 10); }
      const col = this.poiColor(poi, surf.regions[poi.regionIdx].factionId);
      drawText(ctx, `${settlementTierLabel(poi).padEnd(8)} ${poi.name}`.slice(0, 34), px, y, i === this.sel ? PAL.white : col);
      drawText(ctx, poi.surveyed ? "OK" : "?", VW - 14, y, poi.surveyed ? PAL.good : PAL.greyDark);
      y += 9;
    });
    const poi = surf.pois[this.sel];
    if (poi) {
      y += 6;
      const reg = surf.regions[poi.regionIdx];
      drawText(ctx, `TARGET: ${poi.name.toUpperCase()}`, px, y, PAL.gold); y += 9;
      drawText(ctx, `${reg.name} - ${reg.factionId ? faction(reg.factionId).name : "unclaimed"}`, px, y, PAL.grey); y += 9;
      const canLand = poi.landable || poi.kind === "ruin";
      drawText(ctx, canLand ? (poi.kind === "city" ? "[E] LAND - CITY" : poi.kind === "ruin" ? `[E] LAND - RUINS${poi.looted ? " (LOOTED)" : ""}` : "[E] LAND") : "NO LANDING PAD", px, y, canLand ? PAL.gold : PAL.greyDark); y += 9;
    }
    {
      const rr = surf.regions[roverRegion];
      const gs = p.ground?.[`${sys.id}:${g.orbitPlanetIdx}:${roverRegion}`];
      y += 9;
      if (rr) drawText(ctx, `[L] DROP ROVER IN ${rr.name.toUpperCase()}${gs?.charted ? " (CHARTED)" : ""}  [ ] PICK REGION`, px, y, PAL.ui);
    }
    drawText(ctx, planetLore(g.world, sys, g.orbitPlanetIdx).toUpperCase().slice(0, 112), 8, VH - 31, PAL.greyDark);
    drawText(ctx, `SATELLITES: ${surf.satellites}   HOLD V: SURVEY SCAN   L: ROVER`, 8, VH - 22, PAL.greyDark);
    if (this.msg) drawText(ctx, this.msg, VW / 2 - textWidth(this.msg) / 2, VH - 12, PAL.ui);
    if (g.toastTimer > 0) drawText(ctx, g.toastMsg, VW / 2 - textWidth(g.toastMsg) / 2, VH - 32, PAL.ui);
    if (g.hint) drawText(ctx, g.hint, clamp(VW / 2 - textWidth(g.hint) / 2, 2, VW), 22, PAL.gold);
  }

  poiColor(poi: Poi, factionId: string | null): string {
    if (poi.kind === "defense") return PAL.danger;
    if (poi.kind === "city") return factionId ? faction(factionId).color : PAL.grey;
    if (poi.kind === "research") return PAL.info;
    if (poi.kind === "mine") return PAL.gold;
    if (poi.kind === "ruin") return PAL.grey;
    return PAL.ui;
  }
}

export { pushEvent };
