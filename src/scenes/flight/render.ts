// Rendering for the flight scene: world, HUD, radar markers, system map.

import type { Game } from "../../game";
import { councilObjective } from "../../core/council";
import { systemLabel } from "../../world";
import { VW, VH } from "../../game";
import type { FlightScene } from "./index";
import { drawText, textWidth } from "../../gfx/font";
import { infraAt, infraLit, stormBlind, wondersIn, captainByName, isFriend, isRival, patientDeadline, ALERT_NAME, hasSpecialty, firstOfficer } from "../../world";
import * as wire from "../../core/wire";
import { PAL } from "../../gfx/palette";
import { clamp, TAU, angDiff, dist } from "../../core/mathx";
import { SYSTEM_SIZE, navRoute, repLabel } from "../../world";
import { faction } from "../../data/data";
import { hull } from "../../data/hulls";
import { permitDenied } from "../../world";
import { hasModule } from "../../data/modules";
import { presence } from "../../core/presence";
import { baseAt } from "../../core/wire";
import { storyObjective } from "../../core/story";
import { genShip } from "../../gfx/sprites";
import { RNG } from "../../core/rng";
import { inSafeZone } from "./ai";
import { drawTouchControls } from "../../core/touch";
import { drawTutorial } from "../../core/tutorial";
import { singersBerth, SINGERS_DOCK_RANGE } from "../../core/singers";
import { drawSingersRing } from "../../gfx/singers";

export function drawFlight(fs: FlightScene, g: Game, ctx: CanvasRenderingContext2D): void {
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
        if (d < pl.radius + 90) drawText(ctx, "[E] ENTER ORBIT", sx - 30, sy + s / 2 + 3, PAL.gold);
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
    if (wd.kind === "ark" && d < 160) drawText(ctx, "[E] BOARD THE ARK", sx - 36, sy + 30 * z + 4, PAL.gold);
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
      if (d < 90) drawText(ctx, inf.upgraded ? `[E] WALK IN - TILL ${Math.round(inf.till)}CR` : `[E] TEND - TILL ${Math.round(inf.till)}CR${inf.kind === "depot" ? ` - STOCK ${inf.stock}` : ""} - ${inf.health}%`, sx - 60, sy + 10 * z + 3, PAL.gold);
    }
  }
  const berth = singersBerth(g.world);
  if (berth) {
    const [sx, sy] = toScreen(berth.x, berth.y);
    if (sx > -80 && sx < VW + 80 && sy > -80 && sy < VH + 80) {
      drawSingersRing(ctx, sx, sy, z, g.world.time);
      drawText(ctx, "SINGERS' BERTH", sx - 26, sy - 31 * z, PAL.ui);
      if (dist(p.x, p.y, berth.x, berth.y) < SINGERS_DOCK_RANGE)
        drawText(ctx, Math.hypot(p.vx, p.vy) > 45 ? "BRAKE BELOW 45" : "[E] COME ABOARD", sx - 28, sy + 29 * z, PAL.gold);
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
        if (dist(p.x, p.y, sx0, sy0) < 60) drawText(ctx, "[E] DOCK", sx - 16, sy + s / 2 + 3, PAL.gold);
      }
    }
  }

  // wrecks
  const wreckSpr = g.wreckSprite();
  for (const w of sys.wrecks) {
    if (w.looted) continue;
    const [sx, sy] = toScreen(w.x, w.y);
    if (sx < -40 || sx > VW + 40 || sy < -40 || sy > VH + 40) continue;
    const s = wreckSpr.width * z;
    ctx.drawImage(wreckSpr, sx - s / 2, sy - s / 2, s, s);
    if (dist(p.x, p.y, w.x, w.y) < 160) {
      drawText(ctx, "DERELICT", sx - 16, sy - s / 2 - 8, PAL.grey);
      if (dist(p.x, p.y, w.x, w.y) < 60) drawText(ctx, "[E] BOARD", sx - 18, sy + s / 2 + 3, PAL.gold);
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
      if (dist(p.x, p.y, jp.x, jp.y) < 70) {
        const cost = fs.jumpCost(g, jp.targetSystemId);
        drawText(ctx, `[E] JUMP (${cost} FUEL)`, sx - 36, sy + s / 2 + 3, PAL.gold);
      }
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

  // prospector limpets: read the rock you're pointing at
  if (hasModule(p, "prospector")) {
    let best: (typeof sys.asteroids)[number] | null = null; let bestD = 220;
    for (const a of sys.asteroids) {
      if (a.ore <= 0) continue;
      const d = dist(p.x, p.y, a.x, a.y);
      if (d < bestD && Math.abs(angDiff(fs.aim, Math.atan2(a.y - p.y, a.x - p.x))) < 0.35) { bestD = d; best = a; }
    }
    if (best) {
      const [sx, sy] = toScreen(best.x, best.y);
      const label = best.core ? `CORE - SEISMIC CHARGE (C)` : `${best.rich ? "MOTHERLODE" : "ORE"} ${Math.ceil(best.ore)}${best.rich ? " - RICH" : ""}`;
      ctx.strokeStyle = best.rich ? PAL.gold : PAL.mining;
      ctx.strokeRect(Math.round(sx - best.radius * z) - 2.5, Math.round(sy - best.radius * z) - 2.5, Math.round(best.radius * z * 2) + 5, Math.round(best.radius * z * 2) + 5);
      drawText(ctx, label, sx - textWidth(label) / 2, sy - best.radius * z - 10, best.rich ? PAL.gold : PAL.mining);
    }
  }

  // mining beam
  if (fs.mining) {
    for (const a of sys.asteroids) {
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
    if (dist(p.x, p.y, an.x, an.y) < 60) drawText(ctx, "[E] INVESTIGATE", sx - 30, sy + 6, PAL.gold);
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
    const spr = g.sprite(`ghost-${h.id}`, () => genShip(new RNG(g.world.seed ^ 0x51e9 ^ h.id.length), h.spriteSize, h.color, h.accent));
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
    const col = n.kind === "pirate" ? PAL.danger : n.kind === "patrol" || n.kind === "fighter" ? PAL.info : n.kind === "drone" ? PAL.ui : PAL.gold;
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
      const near = dist(p.x, p.y, n.x, n.y) < 80;
      const lbl = n.casualties ? (near ? "CASUALTIES - [E] OFFER HELP" : "CASUALTIES") : n.disabled ? (near ? "DISABLED - [E] OFFER HELP" : "DISABLED") : (near ? "DAMAGED - [E] OFFER HELP" : "DAMAGED");
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
    drawRotated(ctx, g.playerShip(), sx, sy, p.angle, z);
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
  drawEdgeMarkers(fs, g, ctx, camX, camY, z);
  drawHud(fs, g, ctx);
  drawTutorial(g, ctx, 68);
  drawTouchControls(g, ctx);
  if (fs.mapOpen) drawSystemMap(g, ctx);
  if (fs.paused) {
    ctx.fillStyle = "rgba(5,6,10,0.8)"; ctx.fillRect(0, 0, VW, VH);
    drawText(ctx, "PAUSED", VW / 2 - textWidth("PAUSED") / 2, 84, PAL.white);
    const sub = `${(g.world.player.shipName ?? hull(g.world.player.hullId).name).toUpperCase()} - ${g.world.systems[g.world.player.systemId].name.toUpperCase()} - ${Math.floor(g.world.time / 3600)}H ${Math.floor((g.world.time % 3600) / 60)}M UNDER WAY`;
    drawText(ctx, sub, VW / 2 - textWidth(sub) / 2, 94, PAL.grey);
    fs.pauseOptions(g).forEach((o, i) => { const y = 110 + i * 12; const sel = i === fs.pauseCursor; if (sel) drawText(ctx, ">", VW / 2 - textWidth(o.label) / 2 - 10, y, PAL.gold); drawText(ctx, o.label, VW / 2 - textWidth(o.label) / 2, y, sel ? PAL.white : PAL.greyDark); });
    drawText(ctx, "ESC RESUMES", VW / 2 - textWidth("ESC RESUMES") / 2, 180, PAL.greyDark);
    return;
  }
  if (fs.logOpen) {
    ctx.fillStyle = "rgba(5,6,10,0.92)"; ctx.fillRect(0, 0, VW, VH);
    drawText(ctx, "COMMS LOG - L OR ESC TO CLOSE", VW / 2 - textWidth("COMMS LOG - L OR ESC TO CLOSE") / 2, 6, PAL.ui);
    const rows = fs.commsLog.slice(-26);
    if (!rows.length) drawText(ctx, "NOTHING ON THE BAND YET.", 12, 24, PAL.greyDark);
    rows.forEach((c, i) => {
      const h = Math.floor(c.t / 3600), m = Math.floor((c.t % 3600) / 60);
      drawText(ctx, `${h}H${String(m).padStart(2, "0")} ${c.from}: ${c.text}`.slice(0, 92), 12, 22 + i * 9, c.from === (g.world.player.shipName ?? "SHIP").toUpperCase() ? PAL.uiDim : PAL.grey);
    });
  }
}

export function drawEdgeMarkers(fs: FlightScene, g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, z: number): void {
  const p = g.world.player;
  const sys = g.world.systems[p.systemId];
  const mark = (wx: number, wy: number, color: string, label?: string) => {
    const sx = (wx - camX) * z;
    const sy = (wy - camY) * z;
    if (sx > 8 && sx < VW - 8 && sy > 8 && sy < VH - 30) return;
    const cx = VW / 2, cy = VH / 2 - 11;
    const dx = sx - cx, dy = sy - cy;
    const t = Math.max(Math.abs(dx) / (VW / 2 - 8), Math.abs(dy) / (VH / 2 - 22));
    const ex = cx + dx / t, ey = cy + dy / t;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(ex) - 1, Math.round(ey) - 1, 3, 3);
    if (label) {
      const dist10 = Math.round(Math.hypot(wx - p.x, wy - p.y) / 100) / 10;
      const txt = `${label} ${dist10}K`;
      const tx = clamp(ex - textWidth(txt) / 2, 2, VW - textWidth(txt) - 2);
      const ty = clamp(ey + (ey < cy ? 5 : -8), 8, VH - 34);
      drawText(ctx, txt, tx, ty, color);
    }
  };
  if (stormBlind(g.world, sys.id)) {
    // the storm eats the radar: only what's close, and only the beacon if there is one
    if (Math.floor(g.world.time * 3) % 2 === 0) drawText(ctx, "RADAR: STORM", VW - textWidth("RADAR: STORM") - 4, 34, PAL.warn);
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
    if (n.kind === "pirate" && dist(n.x, n.y, p.x, p.y) < 900) mark(n.x, n.y, PAL.danger);
  }
  if (fs.sos && fs.sos.trader.hull > 0) mark(fs.sos.trader.x, fs.sos.trader.y, PAL.gold, fs.sos.kind === "disabled" ? "MAYDAY" : fs.sos.kind === "casualties" ? "MEDICAL" : "SOS");
  if (fs.repairJob) mark(fs.repairJob.npc.x, fs.repairJob.npc.y, PAL.good, "REPAIR");
  { const cr = g.world.crisis; if (cr && cr.systemId === p.systemId && cr.delivered < cr.need && g.world.time < cr.until) { const st = sys.stations.find((s) => s.id === cr.stationId); if (st) mark(Math.cos(st.angle) * st.orbit, Math.sin(st.angle) * st.orbit, PAL.danger, "CRISIS"); } }
  if (fs.escort && fs.escort.trader.hull > 0) mark(fs.escort.trader.x, fs.escort.trader.y, PAL.gold, "ESCORT");
  if (fs.race) { const gt = fs.race.gates[fs.race.idx]; mark(gt.x, gt.y, PAL.gold, `RING ${fs.race.idx + 1}`); }
  // active mission target station in this system
  for (const m of p.missions) {
    if (!m.accepted || m.done || m.targetSystemId !== p.systemId || !m.targetStationId) continue;
    const st = sys.stations.find((s) => s.id === m.targetStationId);
    if (st) mark(Math.cos(st.angle) * st.orbit, Math.sin(st.angle) * st.orbit, PAL.gold, "MISSION");
  }
  for (const gh of presence.ghosts.values()) { const pos = presence.at(gh); mark(pos.x, pos.y, PAL.info, gh.callsign); }
  for (const m of fs.maydays) if (Math.floor(g.world.time * 3) % 2 === 0) mark(m.x, m.y, PAL.danger, `MAYDAY ${m.from}`);
  const wreckRange = hasModule(p, "fss") || hull(p.hullId).scanner ? 1e9 : 1500;
  for (const w of sys.wrecks) if (!w.looted && dist(w.x, w.y, p.x, p.y) < wreckRange) mark(w.x, w.y, PAL.grey, "WRECK");
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
  const p = g.world.player;
  const sys = g.world.systems[p.systemId];
  ctx.fillStyle = "rgba(8,12,22,0.85)";
  ctx.fillRect(0, VH - 22, VW, 22);
  ctx.fillStyle = PAL.uiBorder;
  ctx.fillRect(0, VH - 23, VW, 1);

  const bar = (x: number, label: string, v: number, max: number, col: string) => {
    drawText(ctx, label, x, VH - 19, PAL.grey);
    ctx.fillStyle = PAL.greyDark;
    ctx.fillRect(x, VH - 11, 40, 4);
    ctx.fillStyle = col;
    ctx.fillRect(x, VH - 11, Math.round(40 * clamp(v / max, 0, 1)), 4);
  };
  bar(6, "HULL", p.hull, p.hullMax, p.hull < 30 ? PAL.danger : PAL.good);
  bar(56, "SHLD", p.shield, p.shieldMax, PAL.shield);
  bar(106, "FUEL", p.fuel, p.fuelMax, p.fuel < 15 ? PAL.danger : PAL.thrust);
  bar(156, "O2", p.oxygen, p.oxygenMax, p.oxygen < 40 ? PAL.danger : PAL.info);

  drawText(ctx, `${p.credits}CR`, 210, VH - 19, PAL.gold);
  const spd = Math.round(Math.hypot(p.vx, p.vy));
  drawText(ctx, `${spd} M/S`, 210, VH - 11, PAL.grey);

  const fac = faction(sys.factionId);
  drawText(ctx, sys.name, 270, VH - 19, fac.color);
  const rep = repLabel(p.rep?.[sys.factionId] ?? 0);
  drawText(ctx, `${fac.name.slice(0, 22)} ${rep}`, 270, VH - 11, PAL.greyDark);
  const law = fs.lawLevel(g);
  if (law >= 2) drawText(ctx, "SHOOT ON SIGHT", VW - 100, VH - 19, PAL.danger);
  else if (law === 1) drawText(ctx, "WANTED", VW - 76, VH - 19, PAL.danger);
  if (inSafeZone(fs, g, p.x, p.y) && law === 0) drawText(ctx, "PROTECTED SPACE", VW - textWidth("PROTECTED SPACE") - 4, 24, PAL.good);
  drawText(ctx, "TAB MAP", VW - 36, VH - 19, PAL.greyDark);
  drawText(ctx, "J CRUISE", VW - 36, VH - 11, PAL.greyDark);
  if (presence.status === "on") {
    const n = presence.ghosts.size;
    const t = n ? `${n} PILOT${n === 1 ? "" : "S"} HERE - T TO HAIL` : "SYSTEM CHANNEL - T";
    drawText(ctx, t, VW - textWidth(t) - 4, 14, n ? PAL.info : PAL.greyDark);
  }
  if (g.cloudStatus) drawText(ctx, g.cloudStatus, VW - 36 - textWidth(g.cloudStatus) - 6, VH - 11, g.cloudStatus === "SYNCED" ? PAL.uiDim : PAL.warn);

  let wy = 4;
  for (const s of p.systems) {
    if (s.health < 50) {
      drawText(ctx, `! ${systemLabel(p, s)} ${Math.round(s.health)}%`, 4, wy, s.health < 25 ? PAL.danger : PAL.warn);
      wy += 8;
    }
  }
  if (p.crew && p.crew.some((c) => c.morale < 30)) { const med = p.crew.find((c) => c.role === "medic" && !c.sick); drawText(ctx, med ? `! ${med.name.split(" ")[0].toUpperCase()}: THEY NEED A PORT. OR A MEAL. OR BOTH.` : "! CREW MORALE LOW", 4, wy, PAL.warn); wy += 8; }
  if (p.crew && p.crew.some((c) => c.sick)) { drawText(ctx, `! ${p.crew.filter((c) => c.sick).length} CREW LAID UP`, 4, wy, PAL.warn); wy += 8; }
  {
    const mine = (g.world.infra ?? []).filter((i) => i.owner === (wire.getCallsign() ?? "YOU"));
    const till = mine.reduce((a, i) => a + i.till, 0);
    const dark = mine.filter((i) => !infraLit(i)).length;
    if (dark) { drawText(ctx, `! ${dark} STRUCTURE${dark > 1 ? "S" : ""} DARK - BRING PARTS`, 4, wy, PAL.danger); wy += 8; }
    else if (till >= 200) { drawText(ctx, `LIGHTHOUSE TILL ${Math.round(till)}CR`, 4, wy, PAL.gold); wy += 8; }
  }
  if ((p.wear ?? 0) >= 70) { drawText(ctx, `! WEAR ${Math.round(p.wear ?? 0)}% - YARD SERVICE DUE`, 4, wy, (p.wear ?? 0) >= 90 ? PAL.danger : PAL.warn); wy += 8; }
  drawText(ctx, `${(p.shipName ?? hull(p.hullId).name).toUpperCase()}  TORP ${p.torpedoes ?? 0}${p.seismic ? `  SEISMIC ${p.seismic}` : ""}`, 4, wy, PAL.greyDark);
  // heat: only shown when it matters
  const heat = p.heat ?? 0;
  if (heat > 4 || fs.scooping) {
    const hx = VW - 60, hy = wy;
    drawText(ctx, fs.scooping ? "SCOOP" : "HEAT", hx - 24, hy, fs.scooping ? PAL.thrust : heat > 80 ? PAL.danger : PAL.grey);
    ctx.fillStyle = PAL.greyDark; ctx.fillRect(hx, hy + 1, 50, 4);
    ctx.fillStyle = heat > 100 ? PAL.danger : heat > 70 ? PAL.warn : PAL.thrust;
    ctx.fillRect(hx, hy + 1, Math.round(50 * clamp(heat / 100, 0, 1)), 4);
    if (heat > 100 && Math.floor(g.world.time * 6) % 2 === 0) drawText(ctx, "OVERHEAT", hx + 8, hy - 9, PAL.danger);
  }
  if (fs.repairJob) {
    const t = fs.repairJob.kind === "medic" ? `${fs.repairJob.crewName.toUpperCase()} TREATING CASUALTIES: ${Math.round(Math.min(1, fs.repairJob.progress) * 100)}% - STAY CLOSE` : `${fs.repairJob.crewName.toUpperCase()} ABOARD THE FREIGHTER: ${Math.round(Math.min(1, fs.repairJob.progress) * 100)}% - HOLD THE CORSAIRS OFF`;
    drawText(ctx, t, VW / 2 - textWidth(t) / 2, 50, PAL.good);
  }
  if (fs.towing) {
    const z = fs.zoom; const ax = VW / 2, ay = VH / 2 - 11; const bx = ax + (fs.towing.x - p.x) * z, by = ay + (fs.towing.y - p.y) * z;
    ctx.strokeStyle = PAL.warn; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.globalAlpha = 1;
    const t = "TOWING - DOCK AT ANY STATION - NO CRUISE, NO JUMPS, KEEP IT UNDER 420M";
    drawText(ctx, t, VW / 2 - textWidth(t) / 2, 50, PAL.warn);
  }
  if (p.evacuees) drawText(ctx, `${p.evacuees.n} SURVIVORS ABOARD - DOCK TO HAND THEM OVER`, 4, 40, PAL.good);
  if (fs.cruise || fs.autopilot) {
    const t = `${p.focus ? `FOCUS: ${p.focus.toUpperCase()}` : ""}${p.focus && (fs.hardBurn || fs.cruise || fs.autopilot) ? " - " : ""}${fs.hardBurn ? "HARD BURN" : ""}${fs.hardBurn && (fs.cruise || fs.autopilot) ? " - " : ""}${fs.cruise ? "CRUISE" : ""}${fs.cruise && fs.autopilot ? " - " : ""}${fs.autopilot ? `AUTOPILOT: ${fs.apLabel}` : ""}`;
    drawText(ctx, t, VW / 2 - textWidth(t) / 2, VH - 34, fs.cruise ? PAL.info : PAL.ui);
  }
  if (fs.dockTimer > 0.2) {
    const t = `DOCKING COMPUTER ${".".repeat(1 + Math.floor(fs.dockTimer * 2) % 3)}`;
    drawText(ctx, t, VW / 2 - textWidth(t) / 2, VH - 44, PAL.info);
  }
  if (fs.arrivalLog) drawText(ctx, fs.arrivalLog, VW / 2 - textWidth(fs.arrivalLog) / 2, 30, PAL.info);
  if (g.world.synWar && g.world.synWar.systemId === p.systemId) {
    const war = g.world.synWar;
    const t = `SYNDICATE WAR: [${war.attacker}] RAIDERS VS [${war.defender}] CONVOYS - FRONT ${war.score > 0 ? "+" : ""}${war.score}`;
    drawText(ctx, t, VW / 2 - textWidth(t) / 2, 60, PAL.warn);
  }
  if (fs.raidBase && !fs.raidBase.repelled && Math.floor(g.world.time * 2) % 2 === 0) {
    const t = `RAIDERS AT THE [${fs.raidBase.tag}] BASE`;
    drawText(ctx, t, VW / 2 - textWidth(t) / 2, 50, PAL.danger);
  }
  wy += 10;
  for (const c of fs.comms) {
    ctx.globalAlpha = Math.min(1, c.life);
    const line = `${c.from}: ${c.text}`.slice(0, 70);
    ctx.fillStyle = "rgba(8,12,22,0.7)"; ctx.fillRect(2, wy - 1, textWidth(line) + 4, 8);
    drawText(ctx, line, 4, wy, c.color);
    ctx.globalAlpha = 1;
    wy += 8;
  }

  if (fs.scanMsg) drawText(ctx, fs.scanMsg, VW / 2 - textWidth(fs.scanMsg) / 2, 30, PAL.warn);
  if (fs.convoy && !fs.race) { const alive = fs.convoy.ships.filter((s) => s.hull > 0 && fs.npcs.includes(s)); const near = alive.filter((s) => dist(s.x, s.y, p.x, p.y) < 700).length; const line = `CONVOY: ${near}/${alive.length} WITH YOU - TAKE THEM TO ANY GATE AND JUMP`; drawText(ctx, line, VW / 2 - textWidth(line) / 2, VH - 34, near === alive.length ? PAL.gold : PAL.warn); }
  if (fs.docking?.hold) { const line = `HOLDING SHORT OF BAY ${fs.docking.bay} - CONTROL WILL CALL YOU IN`; drawText(ctx, line, VW / 2 - textWidth(line) / 2, VH - 34, PAL.warn); }
  if (fs.race) { const r = fs.race; const line = r.started ? `RING RACE  ${r.idx}/${r.gates.length}  ${r.t.toFixed(1)}S  (PAR ${r.par}S)` : `RING RACE - FLY THROUGH RING 1 TO START THE CLOCK`; drawText(ctx, line, VW / 2 - textWidth(line) / 2, VH - 34, PAL.gold); }
  if (fs.alert > 0) { const a = ALERT_NAME[fs.alert]; const blink = fs.alert === 2 && Math.floor(g.world.time * 2) % 2 === 0; ctx.fillStyle = fs.alert === 2 ? (blink ? "rgba(120,20,20,0.75)" : "rgba(80,10,10,0.75)") : "rgba(90,70,10,0.7)"; ctx.fillRect(VW / 2 - textWidth(a) / 2 - 6, 28, textWidth(a) + 12, 11); drawText(ctx, a, VW / 2 - textWidth(a) / 2, 30, fs.alert === 2 ? PAL.white : PAL.warn); }
  { const fo = firstOfficer(p); const gun = p.crew.find((c) => c.role === "gunner" && !c.sick); const eng = p.crew.find((c) => c.role === "engineer" && !c.sick); const parts: string[] = []; if (p.leg && p.crew.length && g.world.time - p.leg.t0 > 6 * 3600) parts.push(`LONG LEG ${Math.floor((g.world.time - p.leg.t0) / 3600)}H`); if (p.numberOneLeg && fo) parts.push(`ACTING CAPTAIN: ${fo.name.split(" ")[0].toUpperCase()}`); else if (fs.autopilot && fo) parts.push(`CONN: ${fo.name.split(" ")[0].toUpperCase()}`); if (fs.alert === 2 && gun) parts.push(`TACTICAL: ${gun.name.split(" ")[0].toUpperCase()}`); if (fs.alert === 2 && eng && p.systems.some((s) => s.health < 100)) parts.push(`DAMAGE CONTROL: ${eng.name.split(" ")[0].toUpperCase()}`); if (parts.length) { const t = parts.join("  "); drawText(ctx, t, VW - textWidth(t) - 4, VH - 43, PAL.greyDark); } }
  if (g.toastTimer > 0) drawText(ctx, g.toastMsg, VW / 2 - textWidth(g.toastMsg) / 2, 40, PAL.ui);

  const active = p.missions.filter((m) => m.accepted && !m.done);
  let my = 4;
  {
    const so = storyObjective(g.world);
    if (so && (p.tutorial ?? -1) < 0) { const line = `* ${so}`.slice(0, 80); drawText(ctx, line, VW - textWidth(line) - 4, my, PAL.info); my += 8; }
  }
  const council = councilObjective(g.world);
  if (council) { const line = `${council} (G/C: PLOT)`.slice(0, 90); drawText(ctx, line, VW - textWidth(line) - 4, my, PAL.gold); my += 8; }
  for (const m of active.slice(0, 3)) {
    const prog = m.kind === "patrol" || m.kind === "observe" ? ` ${Math.min(m.patrolNeed ?? 90, Math.floor(m.patrolT ?? 0))}/${m.patrolNeed ?? 90}S${m.observeBlown ? " (SEEN)" : ""}` : m.kind === "emergency" && m.byT !== undefined ? (g.world.time > m.byT ? " - LATE, HALF PAY" : ` - ${Math.ceil((m.byT - g.world.time) / 60)}M LEFT`) : m.kind === "bounty" ? ` ${m.kills}/${m.killsNeeded}` : m.kind === "ground" ? ` ${m.groundDone ?? 0}/${m.groundNeed ?? 1}` : m.shipTotal ? ` ${(m.shipDone ?? 0) + 1}/${m.shipTotal}` : "";
    // a fare's open request rides on the line: what they want, and whether it's still on
    const patient = m.kind === "passenger" && m.passengerKind === "patient" ? ((m.docksAboard ?? 0) >= patientDeadline(p, m) ? " - CRITICAL, NEXT DOCK" : " - STABLE") : m.kind === "passenger" && m.passengerKind === "prisoner" ? (p.crew.some((c) => c.role === "gunner" && !c.sick) ? " - IN IRONS, GUARDED" : " - IN IRONS, NO GUARD") : "";
    const envoy = patient ? patient : m.kind === "passenger" && m.treaty ? (m.tookFire ? " - TREATY: SHOT AT" : (m.docksAboard ?? 0) >= (m.patience ?? 2) ? " - TREATY: LAST DOCKING" : " - TREATY: CLEAN SO FAR") : "";
    const req = envoy ? envoy : m.kind === "passenger" && m.request && !m.requestSettled ? (m.request === "quiet" ? (m.tookFire ? " - QUIET RUN: BROKEN" : " - QUIET RUN: SO FAR") : m.requestMet ? ` - ${m.request === "meal" ? "HOT MEAL" : m.request === "star" ? "STAR" : "VIEW"}: DONE` : ` - WANTS ${m.request === "meal" ? "A HOT MEAL" : m.request === "star" ? "THE STAR UP CLOSE" : "A VIEW"}`) : "";
    const line = `> ${m.title}${prog}${req}`;
    drawText(ctx, line, VW - textWidth(line) - 4, my, req ? (((m.request === "quiet" || m.treaty) && m.tookFire) || patient.includes("CRITICAL") ? PAL.danger : m.requestMet ? PAL.good : PAL.gold) : PAL.uiDim);
    my += 8;
  }
  if (g.hint) {
    ctx.fillStyle = "rgba(8,12,22,0.9)";
    ctx.fillRect(VW / 2 - textWidth(g.hint) / 2 - 4, 52, textWidth(g.hint) + 8, 12);
    drawText(ctx, g.hint, VW / 2 - textWidth(g.hint) / 2, 55, PAL.gold);
  }
}

export function drawSystemMap(g: Game, ctx: CanvasRenderingContext2D): void {
  const p = g.world.player;
  const sys = g.world.systems[p.systemId];
  ctx.fillStyle = "rgba(5,6,10,0.92)";
  ctx.fillRect(0, 0, VW, VH);
  const cx = VW / 2, cy = VH / 2;
  const sc = (VH / 2 - 20) / SYSTEM_SIZE;
  drawText(ctx, `SYSTEM MAP: ${sys.name.toUpperCase()}`, cx - textWidth(`SYSTEM MAP: ${sys.name.toUpperCase()}`) / 2, 6, PAL.ui);
  if (stormBlind(g.world, sys.id)) {
    const t = "ION STORM: THE CHART IS STATIC. A LIT BEACON WOULD HOLD IT.";
    drawText(ctx, t, cx - textWidth(t) / 2, cy, PAL.warn);
    for (let i = 0; i < 300; i++) { ctx.fillStyle = i % 3 ? PAL.greyDark : PAL.grey; ctx.fillRect((Math.imul(i + Math.floor(g.world.time * 8), 2654435761) >>> 0) % VW, (Math.imul(i + 7, 1597334677) >>> 0) % VH, 1, 1); }
    return;
  }
  ctx.fillStyle = sys.sunColor;
  ctx.fillRect(cx - 2, cy - 2, 4, 4);
  ctx.strokeStyle = PAL.uiBorder;
  for (const pl of sys.planets) {
    ctx.beginPath();
    ctx.arc(cx, cy, pl.orbit * sc, 0, TAU);
    ctx.stroke();
    const px = cx + Math.cos(pl.angle) * pl.orbit * sc;
    const py = cy + Math.sin(pl.angle) * pl.orbit * sc;
    ctx.fillStyle = PAL.grey;
    ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 3, 3);
    drawText(ctx, pl.name, px + 4, py - 2, PAL.greyDark);
  }
  for (const st of sys.stations) {
    const sx = cx + Math.cos(st.angle) * st.orbit * sc;
    const sy = cy + Math.sin(st.angle) * st.orbit * sc;
    ctx.fillStyle = st.military ? PAL.danger : PAL.ui;
    ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 3, 3);
    drawText(ctx, st.name, sx + 4, sy - 2, st.military ? PAL.danger : PAL.ui);
  }
  for (const inf of infraAt(g.world, sys.id)) {
    const sx = cx + inf.x * sc, sy = cy + inf.y * sc;
    ctx.fillStyle = infraLit(inf) ? PAL.gold : PAL.danger;
    ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 3, 3);
    drawText(ctx, inf.kind.toUpperCase(), sx + 4, sy - 2, infraLit(inf) ? PAL.gold : PAL.danger);
  }
  for (const jp of sys.jumpPoints) {
    const gx = cx + jp.x * sc, gy = cy + jp.y * sc;
    ctx.fillStyle = PAL.info;
    ctx.fillRect(Math.round(gx) - 1, Math.round(gy) - 1, 3, 3);
    drawText(ctx, g.world.systems[jp.targetSystemId].name, gx + 4, gy - 2, PAL.info);
  }
  for (const w of sys.wrecks) {
    if (w.looted) continue;
    ctx.fillStyle = PAL.grey;
    ctx.fillRect(Math.round(cx + w.x * sc) - 1, Math.round(cy + w.y * sc) - 1, 2, 2);
  }
  for (const an of sys.anomalies) {
    if (!an.discovered || an.claimed) continue;
    ctx.fillStyle = PAL.info;
    ctx.fillRect(Math.round(cx + an.x * sc) - 1, Math.round(cy + an.y * sc) - 1, 3, 3);
    const tag = hasSpecialty(p, "science") && (an.kind === "fold" || an.kind === "lens" || an.kind === "echo") ? ` (${an.kind.toUpperCase()})` : "";
    drawText(ctx, an.name + tag, cx + an.x * sc + 4, cy + an.y * sc - 2, PAL.info);
  }
  for (const wd of wondersIn(g.world, sys.id)) {
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(Math.round(cx + wd.x * sc) - 2, Math.round(cy + wd.y * sc) - 2, 5, 5);
    drawText(ctx, wd.seen ? wd.name.toUpperCase() : "WONDER?", cx + wd.x * sc + 5, cy + wd.y * sc - 2, PAL.gold);
  }
  const berth = singersBerth(g.world);
  if (berth) {
    const sx = cx + berth.x * sc, sy = cy + berth.y * sc;
    ctx.strokeStyle = PAL.ui; ctx.strokeRect(Math.round(sx) - 3, Math.round(sy) - 3, 6, 6);
    drawText(ctx, "SINGERS' BERTH", sx + 6, sy - 2, PAL.ui);
  }
  const px = cx + p.x * sc, py = cy + p.y * sc;
  ctx.fillStyle = PAL.white;
  ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 3, 3);
  const atBerth = berth && dist(p.x, p.y, berth.x, berth.y) * sc < 16;
  drawText(ctx, "YOU", px + 4, py + (atBerth ? 7 : -2), PAL.white);
  drawText(ctx, "TAB CLOSE - G GALAXY MAP", cx - textWidth("TAB CLOSE - G GALAXY MAP") / 2, VH - 10, PAL.greyDark);
}
