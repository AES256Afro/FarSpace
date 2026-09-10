// Rendering for the flight scene: world, HUD, radar markers, system map.

import type { Game } from "../../game";
import { VW, VH } from "../../game";
import type { FlightScene } from "./index";
import { drawText, textWidth } from "../../gfx/font";
import { PAL } from "../../gfx/palette";
import { clamp, TAU, angDiff, dist } from "../../core/mathx";
import { SYSTEM_SIZE, navRoute, repLabel } from "../../world";
import { faction } from "../../data/data";
import { hull } from "../../data/hulls";
import { permitDenied } from "../../world";
import { hasModule } from "../../data/modules";
import { presence } from "../../core/presence";
import { genShip } from "../../gfx/sprites";
import { RNG } from "../../core/rng";
import { inSafeZone } from "./ai";
import { drawTouchControls } from "../../core/touch";
import { drawTutorial } from "../../core/tutorial";

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

  // stations
  for (const st of sys.stations) {
    const sx0 = Math.cos(st.angle) * st.orbit;
    const sy0 = Math.sin(st.angle) * st.orbit;
    const spr = g.stationSprite(st.id, st.military);
    const [sx, sy] = toScreen(sx0, sy0);
    const s = spr.width * z;
    if (sx > -s && sx < VW + s && sy > -s && sy < VH + s) {
      ctx.drawImage(spr, sx - s / 2, sy - s / 2, s, s);
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
    const tag = gh.name ? `${gh.callsign} - ${gh.name}` : gh.callsign;
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
    if (n.variant === "captain") drawText(ctx, n.name ?? "CAPTAIN", sx - textWidth(n.name ?? "CAPTAIN") / 2, sy - 20, PAL.danger);
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
  for (const st of sys.stations) {
    mark(Math.cos(st.angle) * st.orbit, Math.sin(st.angle) * st.orbit, st.military ? PAL.danger : PAL.ui, st.military ? "BASE" : "STN");
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
  if (fs.sos && fs.sos.trader.hull > 0) mark(fs.sos.trader.x, fs.sos.trader.y, PAL.gold, "SOS");
  if (fs.escort && fs.escort.trader.hull > 0) mark(fs.escort.trader.x, fs.escort.trader.y, PAL.gold, "ESCORT");
  // active mission target station in this system
  for (const m of p.missions) {
    if (!m.accepted || m.done || m.targetSystemId !== p.systemId || !m.targetStationId) continue;
    const st = sys.stations.find((s) => s.id === m.targetStationId);
    if (st) mark(Math.cos(st.angle) * st.orbit, Math.sin(st.angle) * st.orbit, PAL.gold, "MISSION");
  }
  for (const gh of presence.ghosts.values()) { const pos = presence.at(gh); mark(pos.x, pos.y, PAL.info, gh.callsign); }
  const wreckRange = hasModule(p, "fss") ? 1e9 : 1500;
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
  if (inSafeZone(fs, g, p.x, p.y) && law === 0) drawText(ctx, "PROTECTED SPACE", VW - 130, VH - 11, PAL.good);
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
      drawText(ctx, `! ${s.name.toUpperCase()} ${Math.round(s.health)}%`, 4, wy, s.health < 25 ? PAL.danger : PAL.warn);
      wy += 8;
    }
  }
  if (p.crew && p.crew.some((c) => c.morale < 30)) { drawText(ctx, "! CREW MORALE LOW", 4, wy, PAL.warn); wy += 8; }
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
  if (fs.cruise || fs.autopilot) {
    const t = `${fs.cruise ? "CRUISE" : ""}${fs.cruise && fs.autopilot ? " - " : ""}${fs.autopilot ? `AUTOPILOT: ${fs.apLabel}` : ""}`;
    drawText(ctx, t, VW / 2 - textWidth(t) / 2, VH - 34, fs.cruise ? PAL.info : PAL.ui);
  }
  if (fs.dockTimer > 0.2) {
    const t = `DOCKING COMPUTER ${".".repeat(1 + Math.floor(fs.dockTimer * 2) % 3)}`;
    drawText(ctx, t, VW / 2 - textWidth(t) / 2, VH - 44, PAL.info);
  }
  if (fs.arrivalLog) drawText(ctx, fs.arrivalLog, VW / 2 - textWidth(fs.arrivalLog) / 2, 30, PAL.info);
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
  if (g.toastTimer > 0) drawText(ctx, g.toastMsg, VW / 2 - textWidth(g.toastMsg) / 2, 40, PAL.ui);

  const active = p.missions.filter((m) => m.accepted && !m.done);
  let my = 4;
  for (const m of active.slice(0, 3)) {
    const prog = m.kind === "bounty" ? ` ${m.kills}/${m.killsNeeded}` : "";
    drawText(ctx, `> ${m.title}${prog}`, VW - textWidth(`> ${m.title}${prog}`) - 4, my, PAL.uiDim);
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
    drawText(ctx, an.name, cx + an.x * sc + 4, cy + an.y * sc - 2, PAL.info);
  }
  const px = cx + p.x * sc, py = cy + p.y * sc;
  ctx.fillStyle = PAL.white;
  ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 3, 3);
  drawText(ctx, "YOU", px + 4, py - 2, PAL.white);
  drawText(ctx, "TAB CLOSE - G GALAXY MAP", cx - textWidth("TAB CLOSE - G GALAXY MAP") / 2, VH - 10, PAL.greyDark);
}
