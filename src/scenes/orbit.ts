import { questLocations } from "../core/questlocations";
import { drawQuestMarker } from "../gfx/questmarkers";
// Orbit view: a spinning globe with territories, POIs to pin/target, orbital
// satellites, scanning, and landing at surface outposts.

import { logSight, settlementTierLabel, planetLore } from "../world";
import type { FlightScene } from "./flight/index";
import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { faction } from "../data/data";
import { Poi, adjustRep, pushEvent } from "../world";
import { sfx } from "../core/sfx";
import { music } from "../core/music";
import { hasModule } from "../data/modules";
import { clamp } from "../core/mathx";
import { ListView } from "../core/listview";
import { wrapText } from "../core/text";
import { mapButton, clippedText, contains } from "../core/mapview";
import { ReaderOverlay } from "./reader";
import type { Planet, Region } from "../world";

const LIST = { x: 246, y: 56, width: 226, rowHeight: 22 };
const SITES = { x: 244, y: 32, w: 110, h: 17 }, REGIONS = { x: 358, y: 32, w: 114, h: 17 };
const PREV = { x: 244, y: 195, w: 68, h: 17 }, NEXT = { x: 404, y: 195, w: 68, h: 17 };
const LAND = { x: 244, y: 220, w: 72, h: 17 }, ROVER = { x: 320, y: 220, w: 72, h: 17 }, INFO = { x: 396, y: 220, w: 76, h: 17 };
const QUEST = { x: 8, y: 47, w: 104, h: 16 }, OBJECTIVES = { x: 116, y: 47, w: 116, h: 16 };

const R = 64;
const GX = 130, GY = 140;

export class OrbitScene implements Scene {
  touchMode = "menu" as const;
  rot = 0;
  questFocus = false;
  sites = new ListView<string>(6);
  regions = new ListView<Region>(6);
  pane: "sites" | "regions" = "sites";
  info?: ReaderOverlay;
  get pausesVoyage(): boolean { return !!this.info; }
  private planet?: Planet;
  private drawnRows: (string | Region)[] = [];
  private drawnPane: "sites" | "regions" = "sites";
  get sel(): number { return this.sites.index; }
  set sel(index: number) { this.sites.select(index); }
  get regionSel(): number | null { return this.pane === "regions" ? this.regions.index : null; }
  scan = 0;
  msg = ""; msgTimer = 0;

  sync(g: Game): void {
    const pl = g.world.systems[g.world.player.systemId].planets[g.orbitPlanetIdx];
    if (pl !== this.planet) {
      this.planet = pl; this.sites = new ListView<string>(6); this.regions = new ListView<Region>(6);
      this.pane = "sites"; this.questFocus = false; this.onSceneLeave();
    }
    const before = this.sites.selected;
    this.sites.sync(pl.surface!.pois.map(poi => poi.id)); this.regions.sync(pl.surface!.regions);
    if (before !== this.sites.selected) this.questFocus = false;
  }

  onSceneLeave(): void { this.info?.onSceneLeave(); this.info = undefined; }

  openInfo(g: Game, objectives = false): void {
    const sys = g.world.systems[g.world.player.systemId], pl = sys.planets[g.orbitPlanetIdx], surf = pl.surface!;
    const poi = this.pane === "sites" ? surf.pois[this.sel] : undefined;
    const region = surf.regions[this.regionSel ?? poi?.regionIdx ?? 0];
    const quests = questLocations(g.world).filter(q => q.systemId === sys.id && q.contactId === `planet:${g.orbitPlanetIdx}`
      && (objectives || !q.poiId || (poi ? q.poiId === poi.id : surf.pois.some(site => site.id === q.poiId && surf.regions[site.regionIdx] === region))));
    const sections: [string, string[]][] = objectives ? [[pl.name.toUpperCase(), [`${quests.length} CURRENT OBJECTIVES.`]]]
      : [[(poi?.name ?? region?.name ?? pl.name).toUpperCase(), [
        `PLANET: ${pl.name}. SYSTEM: ${sys.name}.`,
        ...(poi ? [`SITE: ${settlementTierLabel(poi)}. ${poi.surveyed ? "SURVEYED" : "NOT SURVEYED"}.${poi.looted ? " RUIN CLEARED." : ""}`] : []),
        `TERRITORY: ${region?.name ?? "UNAVAILABLE"}.`,
        `CONTROL: ${region?.factionId ? faction(region.factionId).name : "UNCLAIMED"}. RESOURCE: ${region?.resource ?? "UNKNOWN"}.`,
        poi ? (poi.kind === "defense" ? "MILITARY SITE. CIVILIAN LANDING PROHIBITED." : poi.landable || poi.kind === "ruin" ? "E LANDS AT THIS SITE." : "NO LANDING PAD. L DEPLOYS THE ROVER IN THE TERRITORY.") : "L DEPLOYS THE ROVER IN THIS TERRITORY.",
      ]]];
    sections.push(...quests.map(q => [q.title.toUpperCase(), [`${q.source}${q.ready ? " / READY TO HAND IN" : ""}`, q.action]] as [string, string[]]));
    if (!objectives) sections.push(["PLANET RECORD", [planetLore(g.world, sys, g.orbitPlanetIdx)]]);
    this.info = new ReaderOverlay(objectives ? "ORBITAL OBJECTIVES" : "LOCATION DETAILS", sections, () => { this.info = undefined; });
  }

  enter(g: Game): void {
    this.sync(g); this.scan = 0; g.hint = ""; g.hintTimer = 0;
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
    g.showHint("orbit", "TAB: SITES/TERRITORIES / E: LAND / L: ROVER / I: DETAILS / HOLD V: SCAN");
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
    if (this.info) { this.info.update(g); return; }
    const previousSite = this.sites.selected, previousRegion = this.regions.selected;
    this.sync(g);
    const changedSite = previousSite !== undefined && previousSite !== this.sites.selected;
    const changedRegion = previousRegion !== undefined && previousRegion !== this.regions.selected;
    const inp = g.input, p = g.world.player, sys = g.world.systems[p.systemId];
    const pl = sys.planets[g.orbitPlanetIdx], surf = pl.surface!, pois = surf.pois;
    const clicked = (rect: { x: number; y: number; w: number; h: number }) => inp.mousePressed && contains(rect, inp.mouseX, inp.mouseY);
    if (!this.questFocus) this.rot += dt * 0.25;
    if (inp.wasPressed("Escape") || clicked({ x: 390, y: 2, w: 88, h: 16 })) { (g.scenes.flight as FlightScene).resumeNext = true; g.setScene("flight"); return; }
    if (inp.wasPressed("F5")) g.save();
    if (inp.wasPressed("i") || clicked(INFO)) { this.openInfo(g); return; }
    if (inp.wasPressed("o") || clicked(OBJECTIVES)) { this.openInfo(g, true); return; }
    if (inp.wasPressed("Tab")) this.pane = this.pane === "sites" ? "regions" : "sites";
    if (clicked(SITES)) this.pane = "sites";
    if (clicked(REGIONS)) this.pane = "regions";
    const view = this.pane === "sites" ? this.sites : this.regions;
    const before = view.index;
    if (inp.wasPressed("ArrowDown")) view.move(1);
    if (inp.wasPressed("ArrowUp")) view.move(-1);
    if (inp.wasPressed("PageDown") || clicked(NEXT)) view.page(1);
    if (inp.wasPressed("PageUp") || clicked(PREV)) view.page(-1);
    if (inp.wasPressed("Home")) view.select(0);
    if (inp.wasPressed("End")) view.select(view.keys.length - 1);
    if (inp.wheel && contains({ x: LIST.x, y: LIST.y, w: LIST.width, h: 132 }, inp.mouseX, inp.mouseY)) view.move(Math.sign(inp.wheel));
    if (inp.mousePressed && this.drawnPane === this.pane && view.hit(inp.mouseX, inp.mouseY, LIST) !== undefined) {
      const shown = this.drawnRows[Math.floor((inp.mouseY - LIST.y) / LIST.rowHeight)];
      const index = this.pane === "sites" ? this.sites.keys.indexOf(shown as string) : this.regions.keys.indexOf(shown as Region);
      if (index >= 0) view.select(index);
    }
    const manual = before !== view.index || inp.wasPressed("ArrowDown") || inp.wasPressed("ArrowUp");
    if (manual) { this.questFocus = false; sfx.blip(); if (this.pane === "sites" && pois[this.sel]) this.rot = pois[this.sel].lon * Math.PI / 180; }
    if (inp.mousePressed && inp.mouseX < 240 && inp.mouseY >= 68 && inp.mouseY < 220) {
      const candidates = pois.map((poi, index) => ({ poi, index, at: this.project(poi.lat, poi.lon) })).filter(poi => poi.at && Math.hypot(poi.at[0] - inp.mouseX, poi.at[1] - inp.mouseY) < 6);
      candidates.sort((a, b) => Math.hypot(a.at![0] - inp.mouseX, a.at![1] - inp.mouseY) - Math.hypot(b.at![0] - inp.mouseX, b.at![1] - inp.mouseY));
      if (candidates.length) { this.sel = candidates[0].index; this.pane = "sites"; this.questFocus = false; sfx.blip(); }
    }
    if (inp.wasPressed("[") || inp.wasPressed("]")) {
      if (this.pane === "sites") this.regions.select(pois[this.sel]?.regionIdx ?? 0);
      this.pane = "regions"; this.regions.move(inp.wasPressed("]") ? 1 : -1); this.questFocus = false;
    }
    if (inp.wasPressed("q") || clicked(QUEST)) {
      const sites = [...new Set(questLocations(g.world).filter(q => q.systemId === sys.id && q.contactId === `planet:${g.orbitPlanetIdx}` && q.poiId).map(q => pois.findIndex(poi => poi.id === q.poiId)).filter(i => i >= 0))];
      if (sites.length) { this.sel = sites[(sites.indexOf(this.sel) + 1) % sites.length]; this.rot = pois[this.sel].lon * Math.PI / 180; this.pane = "sites"; this.questFocus = true; }
      else { this.openInfo(g, true); return; }
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

    const poi = pois[this.sel];
    const roverRegion = this.regionSel ?? poi?.regionIdx ?? 0;
    if ((inp.wasPressed("l") || clicked(ROVER)) && surf.regions[roverRegion]) {
      if (this.pane === "sites" ? changedSite : changedRegion) { g.toast("LOCATION CHANGED. CHECK THE NEW SELECTION."); return; }
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
    if (this.pane === "sites" && poi && (inp.wasPressed("e") || clicked(LAND))) {
      if (changedSite) { g.toast("LOCATION CHANGED. CHECK THE NEW SELECTION."); return; }
      const canLand = poi.landable || poi.kind === "ruin";
      if (!canLand) { g.toast(`${poi.name.toUpperCase()}: NO LANDING PAD`); }
      else {
        const reg = surf.regions[poi.regionIdx];
        if (!reg) { g.toast("SITE TERRITORY UNAVAILABLE."); return; }
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
    if (this.info) { this.info.draw(g, ctx); return; }
    const p = g.world.player;
    const sys = g.world.systems[p.systemId];
    const pl = sys.planets[g.orbitPlanetIdx];
    const surf = pl.surface!;
    const quests=questLocations(g.world).filter(q=>q.systemId===sys.id && q.contactId===`planet:${g.orbitPlanetIdx}`);
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
      const col = this.poiColor(poi, surf.regions[poi.regionIdx]?.factionId ?? null);
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(pr[0]) - 1, Math.round(pr[1]) - 1, 3, 3);
      if (quests.some(q=>q.poiId===poi.id)) drawQuestMarker(ctx,pr[0],pr[1]);
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
    drawText(ctx, clippedText(`${pl.name.toUpperCase()} / ORBIT`, 374), 8, 6, PAL.white);
    drawText(ctx, clippedText(`${sys.name} / ${faction(sys.factionId).name}`, 464), 8, 15, faction(sys.factionId).color);
    drawText(ctx, "ESC LEAVE ORBIT", VW - textWidth("ESC LEAVE ORBIT") - 6, 6, PAL.greyDark);

    drawText(ctx, `${quests.length} QUEST ${quests.length === 1 ? "OBJECTIVE" : "OBJECTIVES"}`, 8, 32, quests.length ? PAL.gold : PAL.greyDark);
    mapButton(ctx, QUEST, "Q QUEST SITE", this.questFocus);
    mapButton(ctx, OBJECTIVES, "O OBJECTIVES");
    const view = this.pane === "sites" ? this.sites : this.regions;
    mapButton(ctx, SITES, `SITES ${surf.pois.length}`, this.pane === "sites");
    mapButton(ctx, REGIONS, `TERRITORIES ${surf.regions.length}`, this.pane === "regions");
    ctx.strokeStyle = PAL.uiBorder; ctx.strokeRect(244, 54, 229, 135);
    this.drawnPane = this.pane; this.drawnRows = view.keys.slice(view.offset, view.end);
    for (let index = view.offset; index < view.end; index++) {
      const y = LIST.y + (index - view.offset) * LIST.rowHeight;
      if (index === view.index) { ctx.fillStyle = "#132b43"; ctx.fillRect(LIST.x, y, LIST.width, LIST.rowHeight); }
      if (this.pane === "sites") {
        const poi = surf.pois[index], quest = quests.some(q => q.poiId === poi.id);
        drawText(ctx, clippedText(poi.name.toUpperCase(), 196), 250, y + 4, index === this.sel ? PAL.white : quest ? PAL.gold : this.poiColor(poi, surf.regions[poi.regionIdx]?.factionId ?? null));
        drawText(ctx, `${settlementTierLabel(poi)} / ${poi.surveyed ? "SURVEYED" : "UNSURVEYED"}${poi.looted ? " / CLEARED" : ""}`, 250, y + 13, PAL.grey);
        if (quest) drawQuestMarker(ctx, 464, y + 8);
      } else {
        const region = surf.regions[index], charted = p.ground?.[`${sys.id}:${g.orbitPlanetIdx}:${index}`]?.charted;
        const home = p.homesteads?.some(h => h.systemId === sys.id && h.planetIdx === g.orbitPlanetIdx && h.regionIdx === index);
        drawText(ctx, clippedText(region.name.toUpperCase(), 210), 250, y + 4, index === this.regions.index ? PAL.white : PAL.grey);
        drawText(ctx, clippedText(`${region.resource.toUpperCase()} / ${region.factionId ? faction(region.factionId).name : "UNCLAIMED"}${home ? " / HOME" : charted ? " / CHARTED" : ""}`, 210), 250, y + 13, home ? PAL.gold : PAL.grey);
      }
    }
    if (!view.keys.length) drawText(ctx, this.pane === "sites" ? "NO SITES. CHOOSE A TERRITORY FOR THE ROVER." : "NO TERRITORIES AVAILABLE.", 250, 66, PAL.grey);
    mapButton(ctx, PREV, "PAGE UP"); mapButton(ctx, NEXT, "PAGE DOWN");
    drawText(ctx, `${view.keys.length ? view.offset + 1 : 0}..${view.end} / ${view.keys.length}`, 326, 201, PAL.grey);
    const poi = surf.pois[this.sel];
    mapButton(ctx, LAND, this.pane === "sites" && poi && (poi.landable || poi.kind === "ruin") && poi.kind !== "defense" ? "E LAND" : "NO PAD");
    mapButton(ctx, ROVER, surf.regions.length ? "L ROVER" : "NO REGION"); mapButton(ctx, INFO, "I DETAILS");
    drawText(ctx, "TAB: SITES/TERRITORIES / ARROWS OR WHEEL: SELECT / HOME/END: FIRST/LAST", 8, 249, PAL.greyDark);
    drawText(ctx, `HOLD V: SURVEY / SATELLITES ${surf.satellites}`, 8, 261, PAL.greyDark);
    if (this.msg) drawText(ctx, clippedText(this.msg, 210), 8, 220, PAL.ui);
    if (g.toastTimer > 0) wrapText(g.toastMsg, 54).slice(0, 2).forEach((line, i) => drawText(ctx, line, 8, 224 + i * 8, PAL.ui));
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
