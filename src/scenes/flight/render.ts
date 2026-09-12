import { renderFlightHud, flightHudBounds } from "./hud";
import { flightDisplay } from "./display";
import { systemContacts } from "../systemmap";
import { drawQuestMarker } from "../../gfx/questmarkers";
import { aimedRock, rockMaterials, hasMiningRemains } from "../../core/mining";
import { wreckAvailable } from "../../core/salvage";
// Rendering for the flight scene: world, HUD, radar markers, system map.

import type { Game } from "../../game";
import { VW, VH } from "../../game";
import type { FlightScene } from "./index";
import { drawText, textWidth } from "../../gfx/font";
import { infraAt, infraLit, stormBlind, wondersIn, captainByName, isFriend, isRival, hasSpecialty } from "../../world";
import * as wire from "../../core/wire";
import { PAL } from "../../gfx/palette";
import { clamp, TAU, angDiff, dist } from "../../core/mathx";
import { SYSTEM_SIZE, navRoute } from "../../world";
import { faction } from "../../data/data";
import { hull } from "../../data/hulls";
import { permitDenied } from "../../world";
import { hasModule } from "../../data/modules";
import { presence } from "../../core/presence";
import { baseAt } from "../../core/wire";
import { genShip } from "../../gfx/sprites";
import { drawFlightGuides, drawShipDrive } from "../../gfx/flightguides";
import { RNG } from "../../core/rng";
import { inSafeZone } from "./ai";
import { drawTouchControls } from "../../core/touch";
import { singersBerth } from "../../core/singers";
import { drawSingersRing } from "../../gfx/singers";

export function drawFlight(fs: FlightScene, g: Game, ctx: CanvasRenderingContext2D): void {
  if (fs.logReader) { fs.logReader.draw(g, ctx); return; }
  const p = g.world.player;
  const sys = g.world.systems[p.systemId];
  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, VW, VH);

  const shx = fs.camShake > 0 ? (Math.random() - 0.5) * fs.camShake : 0;
  const shy = fs.camShake > 0 ? (Math.random() - 0.5) * fs.camShake : 0;
  const z = fs.zoom;
  const camX = p.x - (VW / 2) / z + shx;
  const camY = p.y - (VH / 2) / z + shy;
  const toScreen = (wx: number, wy: number): [number, number] => [
    Math.round((wx - camX) * z),
    Math.round((wy - camY) * z),
  ];

  // nebula backdrop
  {
    const neb = g.nebulaSprite(sys.id);
    ctx.globalAlpha = 0.55;
    const px = -((camX * 0.06 * z) % VW);
    const py = -((camY * 0.06 * z) % VH);
    for (const ox of [px - VW, px, px + VW]) {
      for (const oy of [py - VH, py, py + VH]) ctx.drawImage(neb, Math.round(ox), Math.round(oy));
    }
    ctx.globalAlpha = 1;
  }
  drawStars(ctx, camX, camY, z);

  // sun
  const sunSpr = g.sunSprite(sys.id, sys.sunRadius, sys.sunColor);
  {
    const [sx, sy] = toScreen(0, 0);
    const s = sunSpr.width * z;
    ctx.drawImage(sunSpr, sx - s / 2, sy - s / 2, s, s);
  }
  ctx.strokeStyle = "#141a2e";
  for (const pl of sys.planets) {
    ctx.beginPath();
    const [ox, oy] = toScreen(0, 0);
    ctx.arc(ox, oy, pl.orbit * z, 0, TAU);
    ctx.stroke();
  }

  // planets
  sys.planets.forEach((pl, i) => {
    const px = Math.cos(pl.angle) * pl.orbit;
    const py = Math.sin(pl.angle) * pl.orbit;
    const spr = g.planetSprite(sys.id, i, pl.radius, pl.palette);
    const [sx, sy] = toScreen(px, py);
    const s = spr.width * z;
    if (sx > -s && sx < VW + s && sy > -s && sy < VH + s) {
      ctx.drawImage(spr, sx - s / 2, sy - s / 2, s, s);
      const d = dist(p.x, p.y, px, py);
      if (d < pl.radius + 200) {
        drawText(ctx, pl.name, sx - textWidth(pl.name) / 2, sy - s / 2 - 8, PAL.grey);
      }
    }
  });

  // void drifters: slow, enormous, harmless; they like gas giants
  for (const d of fs.drifters) {
    const [dx, dy] = toScreen(d.x, d.y);
    if (dx < -80 || dx > VW + 80 || dy < -80 || dy > VH + 80) continue;
    const segs = 9;
    ctx.strokeStyle = d.logged ? "#7c88b8" : "#5a6a9a";
    ctx.lineWidth = Math.max(1, 3 * z);
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const wob = Math.sin(g.world.time * 1.2 + d.phase + t * 4) * 6 * z;
      const px2 = dx - Math.cos(d.angle) * t * 60 * z + Math.cos(d.angle + Math.PI / 2) * wob;
      const py2 = dy - Math.sin(d.angle) * t * 60 * z + Math.sin(d.angle + Math.PI / 2) * wob;
      if (i === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = "#e8ecff"; ctx.fillRect(Math.round(dx), Math.round(dy), 2, 2);
    if (dist(p.x, p.y, d.x, d.y) < 260) drawText(ctx, d.logged ? "VOID DRIFTER" : "UNKNOWN LIFEFORM - HOLD V", dx - 40, dy - 16 * z - 8, PAL.info);
  }

  // wonders: big, slow, unmistakable
  for (const wd of wondersIn(g.world, sys.id)) {
    const [sx, sy] = toScreen(wd.x, wd.y);
    if (sx < -400 || sx > VW + 400 || sy < -400 || sy > VH + 400) continue;
    const t = g.world.time;
    ctx.save();
    if (wd.kind === "ring") { for (let i = 0; i < 3; i++) { ctx.strokeStyle = i === 1 ? "#ffe9a0" : "#9aa5bd"; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t + i); ctx.beginPath(); ctx.ellipse(sx, sy, (120 + i * 18) * z, (34 + i * 6) * z, 0.3, 0, Math.PI * 2); ctx.stroke(); } }
    else if (wd.kind === "pulsar") { const k = (t * 3) % 1; ctx.fillStyle = "#f2f4ff"; ctx.fillRect(sx - 2, sy - 2, 4, 4); ctx.strokeStyle = "#8ec9f0"; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.arc(sx, sy, (10 + k * 160) * z, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 0.6; ctx.fillStyle = "#8ec9f0"; ctx.fillRect(sx - 1, sy - 200 * z, 2, 400 * z); }
    else if (wd.kind === "ark") { ctx.translate(sx, sy); ctx.rotate(t * 0.02); ctx.fillStyle = "#2a3146"; ctx.fillRect(-160 * z, -14 * z, 320 * z, 28 * z); ctx.fillStyle = "#3a4a6c"; for (let i = -7; i <= 7; i++) ctx.fillRect(i * 20 * z - 2, -20 * z, 4, 40 * z); ctx.fillStyle = Math.floor(t * 0.7) % 5 === 0 ? "#ffd75a" : "#1a2036"; ctx.fillRect(-4, -4, 8, 8); }
    else if (wd.kind === "glass") { for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2, r = (220 + (i % 5) * 12) * z; const gl = Math.sin(t * 2 + i) > 0.6; ctx.fillStyle = gl ? "#f2f4ff" : "#8ec9f0"; ctx.fillRect(Math.round(sx + Math.cos(a) * r), Math.round(sy + Math.sin(a) * r * 0.5), gl ? 3 : 2, gl ? 3 : 2); } }
    else if (wd.kind === "twins") { for (const d of [-1, 1]) { ctx.fillStyle = d < 0 ? "#ffb347" : "#8ec9f0"; ctx.beginPath(); ctx.arc(sx + d * 60 * z, sy, 28 * z, 0, Math.PI * 2); ctx.fill(); } ctx.strokeStyle = "#ffe9a0"; ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 4); ctx.beginPath(); ctx.moveTo(sx - 34 * z, sy); ctx.quadraticCurveTo(sx, sy - 20 * z * Math.sin(t), sx + 34 * z, sy); ctx.stroke(); }
    else if (wd.kind === "nursery") { for (let i = 0; i < 60; i++) { const px2 = sx + ((i * 37) % 300 - 150) * z, py2 = sy + ((i * 53) % 200 - 100) * z; ctx.fillStyle = "#f2f4ff"; ctx.fillRect(px2, py2, 2, 2); ctx.fillStyle = "#8ec9f0"; ctx.globalAlpha = 0.5; ctx.fillRect(px2 + 2, py2 + 1, 12 * z, 1); ctx.globalAlpha = 1; } }
    else if (wd.kind === "lantern") { for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? "#ff9a3a" : "#ffb347"; ctx.globalAlpha = 0.1 + 0.05 * Math.sin(t * 0.7 + i) + (dist(p.x, p.y, wd.x, wd.y) < 600 ? 0.1 : 0); ctx.beginPath(); ctx.arc(sx + Math.cos(i * 1.3) * 40 * z, sy + Math.sin(i * 1.9) * 30 * z, (90 + i * 22) * z, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; }
    else if (wd.kind === "garden") { ctx.fillStyle = "#3a2a1a"; ctx.beginPath(); ctx.moveTo(sx - 120 * z, sy); ctx.lineTo(sx + 120 * z, sy - 10 * z); ctx.lineTo(sx + 60 * z, sy + 70 * z); ctx.lineTo(sx - 80 * z, sy + 50 * z); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#3aa55e"; ctx.fillRect(sx - 120 * z, sy - 8 * z, 240 * z, 10 * z); for (let i = 0; i < 24; i++) { ctx.fillStyle = i % 3 ? "#63c26e" : "#ffd75a"; ctx.fillRect(sx - 110 * z + i * 9 * z, sy - 12 * z - ((i * 7) % 9) * z, 3, 4 + ((i * 5) % 6)); } }
    else if (wd.kind === "loom") { for (let i = 0; i < 7; i++) { const ph = t * 0.15 + i * 0.9; ctx.strokeStyle = i % 2 ? "#b28fe0" : "#8ec9f0"; ctx.globalAlpha = 0.35 + 0.25 * Math.sin(ph * 2); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx - 220 * z, sy + Math.sin(ph) * 60 * z); ctx.bezierCurveTo(sx - 80 * z, sy + Math.cos(ph * 1.3) * 90 * z, sx + 80 * z, sy - Math.sin(ph * 0.7) * 90 * z, sx + 220 * z, sy + Math.cos(ph) * 60 * z); ctx.stroke(); } ctx.lineWidth = 1; }
    else if (wd.kind === "clock") { ctx.translate(sx, sy); ctx.rotate(t * 0.0017); ctx.strokeStyle = "#5d6680"; ctx.lineWidth = 6 * z; ctx.beginPath(); ctx.arc(0, 0, 170 * z, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.fillStyle = i % 3 ? "#3a4a6c" : "#ffd75a"; ctx.fillRect(Math.cos(a) * 170 * z - 3, Math.sin(a) * 170 * z - 3, 6, 6); } ctx.strokeStyle = "#9aa5bd"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(t * 0.0017 * 12) * 120 * z, Math.sin(t * 0.0017 * 12) * 120 * z); ctx.stroke(); }
    else if (wd.kind === "choir") { for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2 + (i % 3) * 0.2, r = (140 + (i * 37) % 120) * z; const ring = Math.sin(t * 1.5 + i * 0.7) > 0.7; ctx.fillStyle = ring ? "#ffe9a0" : "#6a5a4a"; const sz = ring ? 5 : 3; ctx.fillRect(Math.round(sx + Math.cos(a) * r) - 1, Math.round(sy + Math.sin(a) * r * 0.6) - 1, sz, sz); if (ring) { ctx.strokeStyle = "#ffe9a0"; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * r, sy + Math.sin(a) * r * 0.6, 10 * z, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; } } }
    else if (wd.kind === "cathedral") { for (let i = 0; i < 6; i++) { const h = (80 + (i * 43) % 90) * z; ctx.fillStyle = i % 2 ? "#3a4a6c" : "#2a3146"; ctx.fillRect(sx + (i - 3) * 30 * z, sy - h, 10 * z, h * 2); ctx.fillStyle = "#6a7a9c"; ctx.fillRect(sx + (i - 3) * 30 * z + 2, sy - h, 2, h * 2); } }
    ctx.restore(); ctx.globalAlpha = 1;
    const d = dist(p.x, p.y, wd.x, wd.y);
    if (d < 1400) { const label = wd.seen ? wd.name.toUpperCase() : "SOMETHING VAST"; drawText(ctx, label, sx - textWidth(label) / 2, sy - 40 * z - 10, PAL.gold); }
  }
  // lighthouses: a beacon mast with a slow strobe, or a depot with tank lights
  for (const inf of infraAt(g.world, sys.id)) {
    const [sx, sy] = toScreen(inf.x, inf.y);
    if (sx < -40 || sx > VW + 40 || sy < -40 || sy > VH + 40) continue;
    const lit = infraLit(inf);
    ctx.fillStyle = "#6a7a9c";
    if (inf.upgraded) { ctx.fillStyle = "#3a4a6c"; ctx.fillRect(Math.round(sx) - 14 * z, Math.round(sy) - 5 * z, 28 * z, 10 * z); ctx.fillStyle = "#6a7a9c"; ctx.fillRect(Math.round(sx) - 10 * z, Math.round(sy) - 9 * z, 20 * z, 4 * z); for (let i = 0; i < 4; i++) { ctx.fillStyle = Math.floor(g.world.time * 2 + i) % 3 ? "#ffe9a0" : "#0b1020"; ctx.fillRect(Math.round(sx) - 10 * z + i * 6 * z, Math.round(sy) - 2 * z, 2, 2); } }
    if (inf.kind === "beacon") { ctx.fillStyle = "#6a7a9c"; ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 8 * z, 2, 16 * z); ctx.fillRect(Math.round(sx) - 4 * z, Math.round(sy) + 6 * z, 8 * z, 2); }
    else { ctx.fillRect(Math.round(sx) - 6 * z, Math.round(sy) - 4 * z, 12 * z, 8 * z); ctx.fillStyle = "#3a4a6c"; ctx.fillRect(Math.round(sx) - 4 * z, Math.round(sy) - 2 * z, 8 * z, 4 * z); }
    if (lit && Math.floor(g.world.time * 2) % 2 === 0) { ctx.fillStyle = inf.kind === "beacon" ? "#ffe9a0" : "#63f2c8"; ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 9 * z, 3, 3); }
    if (!lit && Math.floor(g.world.time * 4) % 4 === 0) { ctx.fillStyle = PAL.danger; ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 9 * z, 2, 2); }
    const d = dist(p.x, p.y, inf.x, inf.y);
    if (d < 260) {
      const label = `${inf.upgraded ? "WAYSTATION" : inf.kind.toUpperCase()} (${inf.owner === (wire.getCallsign() ?? "YOU") ? "YOURS" : inf.owner})${lit ? "" : " - DARK"}`;
      drawText(ctx, label, sx - textWidth(label) / 2, sy - 14 * z - 8, lit ? PAL.gold : PAL.danger);
    }
  }
  const berth = singersBerth(g.world);
  if (berth) {
    const [sx, sy] = toScreen(berth.x, berth.y);
    if (sx > -80 && sx < VW + 80 && sy > -80 && sy < VH + 80) {
      drawSingersRing(ctx, sx, sy, z, g.world.time);
      drawText(ctx, "SINGERS' BERTH", sx - 26, sy - 31 * z, PAL.ui);
    }
  }
  // stations
  for (const st of sys.stations) {
    const sx0 = Math.cos(st.angle) * st.orbit;
    const sy0 = Math.sin(st.angle) * st.orbit;
    const spr = g.stationSprite(st.id, st.military);
    const [sx, sy] = toScreen(sx0, sy0);
    const s = spr.width * z;
    if (sx > -s && sx < VW + s && sy > -s && sy < VH + s) {
      ctx.drawImage(spr, sx - s / 2, sy - s / 2, s, s);
      // nav lights: a slow red/green blink on the rim, and a bay strobe when someone is docking
      const tphase = g.world.time * 1.5 + st.id.length;
      if (Math.floor(tphase) % 2 === 0) { ctx.fillStyle = "#ff5a5a"; ctx.fillRect(Math.round(sx - s / 2), Math.round(sy), 2, 2); }
      else { ctx.fillStyle = "#63f2c8"; ctx.fillRect(Math.round(sx + s / 2) - 2, Math.round(sy), 2, 2); }
      if (Math.floor(g.world.time * 6) % 3 === 0) { ctx.fillStyle = "#ffffff"; ctx.fillRect(Math.round(sx), Math.round(sy - s / 2), 1, 1); }
      if (dist(p.x, p.y, sx0, sy0) < 200) {
        drawText(ctx, st.name, sx - textWidth(st.name) / 2, sy - s / 2 - 8, st.military ? PAL.danger : PAL.ui);
      }
    }
  }

  // wrecks
  const wreckSpr = g.wreckSprite();
  for (const w of sys.wrecks) {
    if (!wreckAvailable(w)) continue;
    const [sx, sy] = toScreen(w.x, w.y);
    if (sx < -40 || sx > VW + 40 || sy < -40 || sy > VH + 40) continue;
    const recoveredHull = w.recovery && w.recovery.status !== "dismantled" ? hull(w.recovery.hullId) : null;
    const spr = recoveredHull ? g.sprite(`disabled-${recoveredHull.id}`, () => genShip(new RNG(g.world.seed ^ 0x991), recoveredHull.spriteSize, "#667381", PAL.warn, recoveredHull.id)) : wreckSpr;
    const s = spr.width * z;
    ctx.save(); ctx.translate(sx, sy); if (recoveredHull) ctx.rotate(w.recovery!.angle);
    ctx.drawImage(spr, -s / 2, -s / 2, s, s); ctx.restore();
    if (dist(p.x, p.y, w.x, w.y) < 160) {
      const label = recoveredHull ? "DISABLED HULL" : w.looted ? "SALVAGE REMAINS" : "DERELICT";
      drawText(ctx, label, sx - textWidth(label) / 2, sy - s / 2 - 8, PAL.grey);
    }
  }

  // jump points
  const gateSpr = g.gateSprite();
  for (const jp of sys.jumpPoints) {
    const [sx, sy] = toScreen(jp.x, jp.y);
    const s = gateSpr.width * z;
    if (sx > -s && sx < VW + s && sy > -s && sy < VH + s) {
      ctx.drawImage(gateSpr, sx - s / 2, sy - s / 2, s, s);
      const tname = g.world.systems[jp.targetSystemId].name;
      const closed = permitDenied(g.world, jp.targetSystemId);
      const gl = `GATE: ${tname}${closed ? " (PERMIT)" : ""}`;
      drawText(ctx, gl, sx - textWidth(gl) / 2, sy - s / 2 - 8, closed ? PAL.warn : PAL.info);
    }
  }

  // asteroids
  for (const a of sys.asteroids) {
    if (a.ore <= 0) continue;
    const [sx, sy] = toScreen(a.x, a.y);
    if (sx < -30 || sx > VW + 30 || sy < -30 || sy > VH + 30) continue;
    const spr = g.asteroidSprite(a.spriteSeed, a.radius, a.rich);
    const s = spr.width * z;
    ctx.drawImage(spr, sx - s / 2, sy - s / 2, s, s);
    if (a.core) {
      // a motherlode glints: a slow gold pulse around the rock
      const pulse = 0.4 + 0.3 * Math.sin(g.world.time * 3 + a.x);
      ctx.globalAlpha = pulse; ctx.strokeStyle = PAL.gold;
      ctx.beginPath(); ctx.arc(sx, sy, s / 2 + 3, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  for (const c of fs.charges) {
    const [sx, sy] = toScreen(c.ax, c.ay);
    const t = Math.ceil(c.t);
    const blink = Math.floor(c.t * (c.t < 1.5 ? 8 : 3)) % 2 === 0;
    drawText(ctx, `CHARGE ${t}`, sx - 16, sy - 18, blink ? PAL.danger : PAL.gold);
    if (dist(p.x, p.y, c.ax, c.ay) < 120) drawText(ctx, "GET CLEAR", sx - 18, sy + 12, PAL.danger);
  }

  // Every mining target reports range and progress; prospectors add composition.
  const miningTarget = aimedRock(sys.asteroids, p, fs.aim);
  if (miningTarget) {
    const a = miningTarget, [sx, sy] = toScreen(a.x, a.y), d = Math.hypot(a.x - p.x, a.y - p.y);
    const label = `${a.core ? "CORE" : a.rich ? "RICH ROCK" : "ROCK"} / ${Math.round(d)}M`;
    drawText(ctx, label, Math.max(4, Math.min(VW - textWidth(label) - 4, sx - textWidth(label) / 2)), Math.max(20, sy - a.radius * z - 15), PAL.mining);
    if (a.miningInitial && !a.core) { ctx.fillStyle = "#173138"; ctx.fillRect(sx - 20, sy + a.radius * z + 5, 40, 3); ctx.fillStyle = PAL.mining; ctx.fillRect(sx - 20, sy + a.radius * z + 5, 40 * Math.max(0, 1 - a.ore / a.miningInitial), 3); }
    if (hasModule(p, "prospector")) {
      const text = Object.entries(rockMaterials(a)).map(([id,n]) => `${n} ${id.toUpperCase()}`).join(" / ");
      drawText(ctx,text,Math.max(4, Math.min(VW - textWidth(text) - 4,sx-textWidth(text)/2)),Math.max(28,sy-a.radius*z-7),PAL.gold);
    }
  }
  for (const a of sys.asteroids) if (hasMiningRemains(a)) {
    const [sx,sy] = toScreen(a.x,a.y); if (sx < -10 || sx > VW+10 || sy < -10 || sy > VH+10) continue;
    ctx.fillStyle = PAL.gold; ctx.fillRect(sx-2,sy-2,4,4);
    if (Math.hypot(p.x-a.x,p.y-a.y) < 160) drawText(ctx,"ORE / MATERIALS",Math.max(4,Math.min(VW-70,sx-30)),sy+7,PAL.gold);
  }

  // mining beam
  if (fs.mining) {
    for (const a of miningTarget ? [miningTarget] : []) {
      if (a.ore <= 0) continue;
      if (dist(p.x, p.y, a.x, a.y) < 90 && Math.abs(angDiff(fs.aim, Math.atan2(a.y - p.y, a.x - p.x))) < 0.5) {
        const [x1, y1] = toScreen(p.x, p.y);
        const [x2, y2] = toScreen(a.x, a.y);
        ctx.strokeStyle = PAL.mining;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        break;
      }
    }
  }

  // deep scan ring
  if (fs.scanCharge > 0) {
    const [sx, sy] = toScreen(p.x, p.y);
    ctx.strokeStyle = PAL.info;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(sx, sy, fs.scanCharge * 900 * z, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // anomalies (discovered)
  for (const an of sys.anomalies) {
    if (!an.discovered || an.claimed) continue;
    const [sx, sy] = toScreen(an.x, an.y);
    if (sx < -20 || sx > VW + 20 || sy < -20 || sy > VH + 20) continue;
    const blink = Math.floor(g.world.time * 4) % 2 === 0;
    ctx.fillStyle = blink ? PAL.info : PAL.uiDim;
    ctx.fillRect(sx - 2, sy - 2, 5, 5);
    drawText(ctx, an.name, sx - textWidth(an.name) / 2, sy - 10, PAL.info);
  }

  if (fs.race && fs.race.started && fs.race.pacerT > 0) {
    // the pacer: the record holder's ghost, at their pace along the course
    const r = fs.race; const pts = r.gates; let total = 0; const seg: number[] = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(d); total += d; }
    let along = Math.min(1, r.t / r.pacerT) * total; let px = pts[pts.length - 1].x, py = pts[pts.length - 1].y;
    for (let i = 0; i < seg.length; i++) { if (along <= seg[i]) { const k = seg[i] ? along / seg[i] : 0; px = pts[i].x + (pts[i + 1].x - pts[i].x) * k; py = pts[i].y + (pts[i + 1].y - pts[i].y) * k; break; } along -= seg[i]; }
    const [sx, sy] = toScreen(px, py);
    ctx.strokeStyle = PAL.info; ctx.beginPath(); ctx.moveTo(sx, sy - 5); ctx.lineTo(sx + 5, sy); ctx.lineTo(sx, sy + 5); ctx.lineTo(sx - 5, sy); ctx.closePath(); ctx.stroke();
    drawText(ctx, r.pacerName, sx - textWidth(r.pacerName) / 2, sy - 14, PAL.info);
  }
  if (fs.race) {
    fs.race.gates.forEach((gt, i) => {
      const [sx, sy] = toScreen(gt.x, gt.y);
      const next = i === fs.race!.idx, done = i < fs.race!.idx;
      const pulse = next ? 1 + 0.15 * Math.sin(g.world.time * 6) : 1;
      ctx.strokeStyle = done ? PAL.greyDark : next ? PAL.gold : PAL.grey;
      ctx.lineWidth = next ? 2 : 1;
      ctx.beginPath(); ctx.arc(sx, sy, 22 * z * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
      drawText(ctx, `${i + 1}`, sx - 2, sy - 3, done ? PAL.greyDark : next ? PAL.gold : PAL.grey);
    });
  }
  for (const l of fs.loot) {
    const [sx, sy] = toScreen(l.x, l.y);
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(sx - 2, sy - 2, 4, 4);
    ctx.fillStyle = PAL.white;
    ctx.fillRect(sx - 1, sy - 1, 2, 2);
  }

  {
    const pfSpr = g.platformSprite(sys.factionId === "vex");
    for (const pf of fs.platforms) {
      const [sx, sy] = toScreen(pf.x, pf.y);
      if (sx < -20 || sx > VW + 20 || sy < -20 || sy > VH + 20) continue;
      const s = pfSpr.width * z;
      ctx.drawImage(pfSpr, sx - s / 2, sy - s / 2, s, s);
    }
  }

  // other pilots (ghosts): translucent, tagged with their call sign
  for (const gh of presence.ghosts.values()) {
    const h = hull(gh.hull);
    const spr = g.sprite(`ghost-${h.id}`, () => genShip(new RNG(g.world.seed ^ 0x51e9 ^ h.id.length), h.spriteSize, h.color, h.accent, h.id));
    const pos = presence.at(gh);
    const [sx, sy] = toScreen(pos.x, pos.y);
    if (sx < -40 || sx > VW + 40 || sy < -40 || sy > VH + 40) continue;
    ctx.globalAlpha = 0.8;
    drawRotated(ctx, spr, sx, sy, gh.angle, z);
    ctx.globalAlpha = 1;
    const tag = `${gh.tag ? `[${gh.tag}] ` : ""}${gh.callsign}${gh.name ? ` - ${gh.name}` : ""}`;
    drawText(ctx, tag, sx - textWidth(tag) / 2, sy - (h.spriteSize / 2) * z - 10, PAL.info);
  }

  for (const n of fs.npcs) {
    const spr = n.kind === "pirate" ? g.pirateShip()
      : n.kind === "patrol" || n.kind === "fighter" || n.kind === "drone" ? g.patrolShip()
      : g.traderShip();
    const [sx, sy] = toScreen(n.x, n.y);
    if (sx < -40 || sx > VW + 40 || sy < -40 || sy > VH + 40) continue;
    drawRotated(ctx, spr, sx, sy, n.angle, z);
    const col = n.kind === "pirate" ? (n.fleeing || fs.piratesFriendly(g) ? PAL.grey : PAL.danger) : n.kind === "patrol" || n.kind === "fighter" ? PAL.info : n.kind === "drone" ? PAL.ui : PAL.gold;
    ctx.fillStyle = col;
    ctx.fillRect(sx - 6, sy - 12, Math.round(12 * (n.hull / n.hullMax)), 1);
    if (n.companion && n.name) { const label = `${n.name.toUpperCase()} - WITH YOU`; drawText(ctx, label, sx - textWidth(label) / 2, sy - 20, PAL.gold); }
    else if (n.variant === "captain") drawText(ctx, n.name ?? "CAPTAIN", sx - textWidth(n.name ?? "CAPTAIN") / 2, sy - 20, PAL.danger);
    else if (n.convoy) { drawText(ctx, "CONVOY", sx - textWidth("CONVOY") / 2, sy - 20, PAL.gold); }
    else if (n.naval) { drawText(ctx, "SERVICE CUTTER", sx - textWidth("SERVICE CUTTER") / 2, sy - 20, PAL.info); }
    else if (n.ghost && n.name && dist(p.x, p.y, n.x, n.y) < 420) { const label = `${n.name.toUpperCase()} - ON THE WIRE`; drawText(ctx, label, sx - textWidth(label) / 2, sy - 20, PAL.info); }
    else if (n.kind === "trader" && n.name && dist(p.x, p.y, n.x, n.y) < 360) { const cap = captainByName(g.world, n.name); const label = cap ? `${cap.name.toUpperCase()}${isRival(cap) ? " - RIVAL" : isFriend(cap) ? " - FRIEND" : cap.helped ? " - OWES YOU" : ""}` : n.name.toUpperCase(); drawText(ctx, label, sx - textWidth(label) / 2, sy - 20, cap && isRival(cap) ? PAL.danger : cap && isFriend(cap) ? PAL.gold : PAL.grey); }
    else if (n.tag) { const lbl = `[${n.tag}] ${n.kind === "pirate" ? "RAIDER" : "CONVOY"}`; drawText(ctx, lbl, sx - textWidth(lbl) / 2, sy - 20, n.kind === "pirate" ? PAL.danger : PAL.info); }
    if (n.kind === "trader" && (n.disabled || n.casualties || n.hull < n.hullMax * 0.5) && dist(p.x, p.y, n.x, n.y) < 220) {
      const lbl = n.casualties ? "CASUALTIES" : n.disabled ? "DISABLED" : "DAMAGED";
      drawText(ctx, lbl, sx - textWidth(lbl) / 2, sy + 14, n.disabled ? PAL.warn : PAL.grey);
      if (n.disabled && Math.floor(g.world.time * 3) % 2 === 0) { ctx.fillStyle = PAL.warn; ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 14, 2, 2); }
    }
    if (fs.repairJob && fs.repairJob.npc === n) {
      ctx.fillStyle = PAL.greyDark; ctx.fillRect(sx - 15, sy - 26, 30, 3);
      ctx.fillStyle = PAL.good; ctx.fillRect(sx - 15, sy - 26, Math.round(30 * Math.min(1, fs.repairJob.progress)), 3);
    }
    else if (n.variant === "cutter") { ctx.fillStyle = PAL.danger; ctx.fillRect(sx - 8, sy - 12, 1, 1); ctx.fillRect(sx + 7, sy - 12, 1, 1); }
    if (n.fleeing) drawText(ctx, "FLEEING", sx - 14, sy - 18, PAL.warn);
    if (fs.escort && fs.escort.trader === n) drawText(ctx, "ESCORT", sx - 12, sy - 20, PAL.gold);
  }

  for (const b of fs.bullets) {
    const [sx, sy] = toScreen(b.x, b.y);
    ctx.fillStyle = b.hostile ? PAL.danger : PAL.ui;
    ctx.fillRect(sx - 1, sy - 1, 2, 2);
  }
  for (const t of fs.torps) {
    const [sx, sy] = toScreen(t.x, t.y);
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(sx - 1, sy - 1, 3, 3);
    ctx.fillStyle = PAL.white;
    ctx.fillRect(sx, sy, 1, 1);
  }
  for (const pt of fs.particles) {
    const [sx, sy] = toScreen(pt.x, pt.y);
    ctx.globalAlpha = Math.min(1, pt.life * 2);
    ctx.fillStyle = pt.color;
    ctx.fillRect(sx, sy, 1, 1);
    ctx.globalAlpha = 1;
  }
  {
    const [sx, sy] = toScreen(p.x, p.y);
    const h = hull(p.hullId);
    drawShipDrive(ctx, sx, sy, p.angle, h.spriteSize, z, h.id, fs.engineBurn, fs.retroBurn, g.world.time);
    drawRotated(ctx, g.playerShip(), sx, sy, p.angle, z);
    drawFlightGuides(ctx, sx, sy, p.angle, p.vx, p.vy, h.spriteSize, z);
    if (fs.mouseAim) {
      // turret barrel + cursor reticle
      ctx.strokeStyle = PAL.ui;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(fs.aim) * 9, sy + Math.sin(fs.aim) * 9); ctx.stroke();
      const mx = Math.round(g.input.mouseX), my = Math.round(g.input.mouseY);
      ctx.strokeStyle = fs.mining ? PAL.mining : PAL.ui;
      ctx.globalAlpha = 0.9;
      ctx.strokeRect(mx - 3.5, my - 3.5, 7, 7);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillRect(mx, my, 1, 1);
      ctx.globalAlpha = 1;
    }
  }

  for (const f of fs.floaters) {
    const [sx, sy] = toScreen(f.x, f.y);
    ctx.globalAlpha = Math.min(1, f.life * 1.5);
    drawText(ctx, f.text, sx - textWidth(f.text) / 2, sy, f.color);
    ctx.globalAlpha = 1;
  }
  if (fs.hitFlash > 0) {
    ctx.fillStyle = `rgba(255,60,60,${(fs.hitFlash * 0.22).toFixed(3)})`;
    ctx.fillRect(0, 0, VW, VH);
  }
  const display = flightDisplay(fs, g);
  drawEdgeMarkers(fs, g, ctx, camX, camY, z, flightHudBounds(display, g.toastTimer > 0));
  renderFlightHud(fs, g, ctx, display);
  drawTouchControls(g, ctx);
  if (fs.mapOpen) drawSystemMap(g, ctx);
  if (fs.paused) {
    ctx.fillStyle = "rgba(5,6,10,0.8)"; ctx.fillRect(0, 0, VW, VH);
    drawText(ctx, "PAUSED", VW / 2 - textWidth("PAUSED") / 2, 84, PAL.white);
    const sub = `${(g.world.player.shipName ?? hull(g.world.player.hullId).name).toUpperCase()} - ${g.world.systems[g.world.player.systemId].name.toUpperCase()} - ${Math.floor(g.world.time / 3600)}H ${Math.floor((g.world.time % 3600) / 60)}M UNDER WAY`;
    drawText(ctx, sub, VW / 2 - textWidth(sub) / 2, 94, PAL.grey);
    for (const { option, index, y } of fs.pauseRows(g)) {
      const sel = index === fs.pauseCursor;
      if (sel) drawText(ctx, ">", VW / 2 - textWidth(option.label) / 2 - 10, y, PAL.gold);
      drawText(ctx, option.label, VW / 2 - textWidth(option.label) / 2, y, sel ? PAL.white : PAL.greyDark);
    }
    const footer = `UP/DOWN OR WHEEL: ${fs.pauseCursor + 1}/${fs.pauseOptions(g).length}  ENTER SELECT  ESC RESUME`;
    drawText(ctx, footer, VW / 2 - textWidth(footer) / 2, 230, PAL.greyDark);
    return;
  }

}

export function drawEdgeMarkers(fs: FlightScene, g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, z: number, bounds = flightHudBounds(flightDisplay(fs, g), g.toastTimer > 0)): void {
  const p = g.world.player;
  const sys = g.world.systems[p.systemId];
  const mark = (wx: number, wy: number, color: string, label?: string) => {
    const sx = (wx - camX) * z;
    const sy = (wy - camY) * z;
    if (sx > 8 && sx < VW - 8 && sy > bounds.top && sy < bounds.bottom) return;
    const cx = VW / 2, cy = VH / 2;
    const dx = sx - cx, dy = sy - cy;
    const t = Math.max(Math.abs(dx) / (VW / 2 - 8), Math.abs(dy) / (dy < 0 ? cy - bounds.top : bounds.bottom - cy));
    const ex = cx + dx / t, ey = cy + dy / t;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(ex) - 1, Math.round(ey) - 1, 3, 3);
    if (label) {
      const dist10 = Math.round(Math.hypot(wx - p.x, wy - p.y) / 100) / 10;
      const txt = `${label} ${dist10}K`;
      const tx = clamp(ex - textWidth(txt) / 2, 2, VW - textWidth(txt) - 2);
      const ty = clamp(ey + (ey < cy ? 5 : -8), bounds.top + 3, bounds.bottom - 8);
      drawText(ctx, txt, tx, ty, color);
    }
  };
  if (stormBlind(g.world, sys.id)) {
    // the storm eats the radar: only what's close, and only the beacon if there is one
    if (Math.floor(g.world.time * 3) % 2 === 0) drawText(ctx, "RADAR: STORM", VW - textWidth("RADAR: STORM") - 4, bounds.top + 3, PAL.warn);
    return;
  }
  const berth = singersBerth(g.world);
  if (berth) mark(berth.x, berth.y, PAL.ui, "SINGERS");
  for (const st of sys.stations) {
    mark(Math.cos(st.angle) * st.orbit, Math.sin(st.angle) * st.orbit, st.military ? PAL.danger : PAL.ui, st.military ? "BASE" : "STN");
  }
  for (const inf of infraAt(g.world, sys.id)) {
    mark(inf.x, inf.y, infraLit(inf) ? PAL.gold : PAL.danger, inf.kind === "beacon" ? "BEACON" : "DEPOT");
  }
  let navGateTarget: string | null = null;
  if (p.navTarget && p.navTarget !== p.systemId) {
    const route = navRoute(g.world, p.systemId, p.navTarget);
    if (route && route.length > 1) navGateTarget = route[1];
  } else if (p.navTarget === p.systemId) {
    p.navTarget = null;
  }
  for (const jp of sys.jumpPoints) {
    const isNav = jp.targetSystemId === navGateTarget;
    mark(jp.x, jp.y, isNav ? PAL.gold : PAL.info, isNav ? "NAV>" : "GATE");
  }
  for (const n of fs.npcs) {
    if (n.kind === "pirate" && dist(n.x, n.y, p.x, p.y) < 900) mark(n.x, n.y, n.fleeing || fs.piratesFriendly(g) ? PAL.grey : PAL.danger);
  }
  if (fs.sos && fs.sos.trader.hull > 0) mark(fs.sos.trader.x, fs.sos.trader.y, PAL.gold, fs.sos.kind === "disabled" ? "MAYDAY" : fs.sos.kind === "casualties" ? "MEDICAL" : "SOS");
  if (fs.repairJob) mark(fs.repairJob.npc.x, fs.repairJob.npc.y, PAL.good, "REPAIR");
  { const cr = g.world.crisis; if (cr && cr.systemId === p.systemId && cr.delivered < cr.need && g.world.time < cr.until) { const st = sys.stations.find((s) => s.id === cr.stationId); if (st) mark(Math.cos(st.angle) * st.orbit, Math.sin(st.angle) * st.orbit, PAL.danger, "CRISIS"); } }
  if (fs.escort && fs.escort.trader.hull > 0) mark(fs.escort.trader.x, fs.escort.trader.y, PAL.gold, "ESCORT");
  if (fs.race) { const gt = fs.race.gates[fs.race.idx]; mark(gt.x, gt.y, PAL.gold, `RING ${fs.race.idx + 1}`); }
  for (const contact of systemContacts(g).filter(c=>c.quests?.length)) {
    const color=contact.quests!.some(q=>q.ready) ? PAL.good : PAL.gold;
    mark(contact.x,contact.y,color,`Q ${contact.name.toUpperCase().slice(0,18)}`);
    const sx=(contact.x-camX)*z, sy=(contact.y-camY)*z;
    if(sx>10 && sx<VW-10 && sy>28 && sy<VH-35) drawQuestMarker(ctx,sx,sy,contact.quests!.some(q=>q.ready));
  }
  for (const gh of presence.ghosts.values()) { const pos = presence.at(gh); mark(pos.x, pos.y, PAL.info, gh.callsign); }
  for (const m of fs.maydays) if (Math.floor(g.world.time * 3) % 2 === 0) mark(m.x, m.y, PAL.danger, `MAYDAY ${m.from}`);
  const wreckRange = hasModule(p, "fss") || hull(p.hullId).scanner ? 1e9 : 1500;
  for (const w of sys.wrecks) if (wreckAvailable(w) && dist(w.x, w.y, p.x, p.y) < wreckRange) mark(w.x, w.y, PAL.grey, "WRECK");
}

export function drawRotated(ctx: CanvasRenderingContext2D, spr: HTMLCanvasElement, x: number, y: number, ang: number, z: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(z, z);
  ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
  ctx.restore();
}

export function drawStars(ctx: CanvasRenderingContext2D, camX: number, camY: number, z: number): void {
  const layers = [
    { p: 0.2, col: PAL.starDim, n: 40 },
    { p: 0.5, col: PAL.starMid, n: 30 },
    { p: 0.9, col: PAL.starBright, n: 14 },
  ];
  for (const layer of layers) {
    const ox = camX * layer.p * z;
    const oy = camY * layer.p * z;
    ctx.fillStyle = layer.col;
    for (let i = 0; i < layer.n; i++) {
      const hx = Math.imul(i + 1, 2654435761) >>> 0;
      const hy = Math.imul(i + 7, 1597334677) >>> 0;
      const x = ((hx % VW) - (ox % VW) + VW * 2) % VW;
      const y = ((hy % VH) - (oy % VH) + VH * 2) % VH;
      ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
    }
  }
}

export function drawHud(fs: FlightScene, g: Game, ctx: CanvasRenderingContext2D): void {
  renderFlightHud(fs, g, ctx);
}

export function drawSystemMap(g: Game, ctx: CanvasRenderingContext2D): void {
  (g.scenes.flight as FlightScene).systemMap.draw(g, ctx);
}
