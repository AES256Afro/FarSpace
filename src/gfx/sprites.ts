// Procedural pixel-art sprite generation. Everything is drawn once to offscreen
// canvases at boot, seeded from the world seed — no external assets.

import { RNG } from "../core/rng";

export type Sprite = HTMLCanvasElement;

function make(w: number, h: number): [Sprite, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

// ---------- Ships ----------
// Symmetric hull built from random pixel runs, mirrored across the axis.
// Ships face RIGHT (+x) at rotation 0.

export function genShip(rng: RNG, size: number, baseColor: string, accent: string): Sprite {
  const [c, ctx] = make(size, size);
  const half = Math.floor(size / 2);
  const body: number[] = []; // half-width per column
  let w = 1;
  for (let x = 0; x < size; x++) {
    const t = x / size;
    // taper nose and tail, bulge middle
    const target = t < 0.25 ? 1 + t * 8 : t < 0.7 ? 2 + Math.sin(t * Math.PI) * (size / 5) : (1 - t) * (size / 3) + 1;
    w += rng.range(-1, 1.3);
    w = Math.max(1, Math.min(target, half - 1));
    body.push(Math.round(w));
  }
  // Hull: draw mirrored columns with vertical shading (light on top)
  for (let x = 0; x < size; x++) {
    const hw = body[x];
    for (let y = -hw; y <= hw; y++) {
      const f = y < 0 ? 1.25 - (Math.abs(y) / hw) * 0.2 : 1.0 - (y / hw) * 0.45;
      ctx.fillStyle = shade(baseColor, f);
      ctx.fillRect(x, half + y, 1, 1);
    }
  }
  // Cockpit near nose
  const cx = Math.floor(size * 0.72);
  ctx.fillStyle = "#66d9ff";
  ctx.fillRect(cx, half - 1, Math.max(2, Math.floor(size / 8)), 2);
  // Accent stripe
  ctx.fillStyle = accent;
  const sx = Math.floor(size * 0.2);
  ctx.fillRect(sx, half - Math.floor(body[sx] * 0.7), Math.floor(size * 0.4), 1);
  ctx.fillRect(sx, half + Math.floor(body[sx] * 0.7), Math.floor(size * 0.4), 1);
  // Engine glow at tail
  ctx.fillStyle = "#3a86b8";
  for (let y = -body[0]; y <= body[0]; y++) {
    if (rng.chance(0.7)) ctx.fillRect(0, half + y, 1, 1);
  }
  // Wing hardpoints
  if (rng.chance(0.7)) {
    const wx = Math.floor(size * rng.range(0.3, 0.5));
    const wy = body[wx];
    ctx.fillStyle = shade(baseColor, 0.7);
    ctx.fillRect(wx, half - wy - 1, 3, 1);
    ctx.fillRect(wx, half + wy + 1, 3, 1);
  }
  return c;
}

// ---------- Planets ----------

const PLANET_PALETTES: string[][] = [
  ["#3a6ea5", "#4a89c7", "#63a5e0", "#8ec9f0", "#e8f4ff"], // ocean
  ["#a5683a", "#c78a4a", "#e0a563", "#f0c98e", "#fff0e0"], // desert
  ["#3aa55e", "#4ac774", "#63e08f", "#8ef0b3", "#e0ffe8"], // verdant
  ["#7a5aa5", "#9674c7", "#b28fe0", "#cfb3f0", "#f0e8ff"], // exotic
  ["#a53a3a", "#c74a4a", "#e06363", "#f08e8e", "#ffe0e0"], // volcanic
  ["#9aa5bd", "#b8c2d6", "#d0d8e8", "#e4eaf4", "#ffffff"], // ice
  ["#c7a54a", "#e0c063", "#f0d98e", "#fff0c0", "#fffae0"], // gas giant gold
  ["#4a7c8c", "#5a97a8", "#6fb3c4", "#8ed0e0", "#d0f4ff"], // gas giant teal
];

export function genPlanet(rng: RNG, radius: number, paletteIdx?: number): Sprite {
  const size = radius * 2 + 2;
  const [c, ctx] = make(size, size);
  const pal = PLANET_PALETTES[(paletteIdx ?? rng.int(0, PLANET_PALETTES.length - 1)) % PLANET_PALETTES.length];
  const cx = size / 2, cy = size / 2;
  const isGas = rng.chance(0.4);
  const bandFreq = rng.range(0.5, 1.4);
  const noiseSeed = rng.fork(77);
  // simple value-noise via random gradient rows
  const rows: number[] = [];
  for (let i = 0; i < size + 2; i++) rows.push(noiseSeed.next());
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5, dy = y - cy + 0.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > radius) continue;
      let v: number;
      if (isGas) {
        v = 0.5 + 0.5 * Math.sin(y * bandFreq + rows[y] * 4 + Math.sin(x * 0.15 + rows[(y + 1) % rows.length] * 6) * 1.2);
      } else {
        const n = noiseSeed.next();
        const continent = Math.sin(x * 0.35 + rows[y] * 9) + Math.cos(y * 0.3 + rows[(x % rows.length)] * 7);
        v = 0.5 + continent * 0.25 + (n - 0.5) * 0.25;
      }
      // light from upper-left
      const light = 1 - (d / radius) * 0.55 + (-dx - dy) / (radius * 4);
      let idx = Math.floor(v * pal.length);
      idx = Math.max(0, Math.min(pal.length - 1, idx));
      ctx.fillStyle = shade(pal[idx], Math.max(0.3, Math.min(1.15, light)));
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // atmosphere rim
  ctx.strokeStyle = shade(pal[2], 1.3);
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  return c;
}

// ---------- Stations ----------
// Ring-and-spoke or block structures with blinking-light spots baked in.

export function genStation(rng: RNG, size: number, military: boolean): Sprite {
  const [c, ctx] = make(size, size);
  const cx = size / 2, cy = size / 2;
  const base = military ? "#8c95a8" : "#9aa5bd";
  const accent = military ? "#ff5a5a" : "#63f2c8";
  const style = rng.int(0, 1);
  if (style === 0) {
    // ring station
    const R = size * 0.42;
    for (let a = 0; a < 360; a += 2) {
      const rad = (a * Math.PI) / 180;
      const x = Math.round(cx + Math.cos(rad) * R);
      const y = Math.round(cy + Math.sin(rad) * R * 0.9);
      ctx.fillStyle = shade(base, 0.8 + Math.sin(rad) * 0.3);
      ctx.fillRect(x - 1, y - 1, 3, 3);
    }
    // spokes
    ctx.fillStyle = shade(base, 0.65);
    ctx.fillRect(Math.round(cx) - 1, Math.round(cy - R), 2, Math.round(R * 2));
    ctx.fillRect(Math.round(cx - R), Math.round(cy) - 1, Math.round(R * 2), 2);
  } else {
    // block station: stacked modules
    let y = size * 0.15;
    while (y < size * 0.85) {
      const h = rng.int(3, Math.max(4, size / 6));
      const w = rng.int(Math.floor(size * 0.3), Math.floor(size * 0.8));
      const x = cx - w / 2;
      for (let yy = 0; yy < h; yy++) {
        ctx.fillStyle = shade(base, 1.1 - (yy / h) * 0.5);
        ctx.fillRect(Math.round(x), Math.round(y + yy), w, 1);
      }
      // windows
      ctx.fillStyle = "#ffd75a";
      for (let wx = 0; wx < w; wx += 3) {
        if (rng.chance(0.5)) ctx.fillRect(Math.round(x + wx + 1), Math.round(y + h / 2), 1, 1);
      }
      y += h + 1;
    }
  }
  // core
  const coreR = size * 0.14;
  for (let y = -coreR; y <= coreR; y++) {
    for (let x = -coreR; x <= coreR; x++) {
      if (x * x + y * y <= coreR * coreR) {
        ctx.fillStyle = shade(base, 1.15 - (y / coreR) * 0.3);
        ctx.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
      }
    }
  }
  ctx.fillStyle = accent;
  ctx.fillRect(Math.round(cx) - 1, Math.round(cy) - 1, 2, 2);
  if (military) {
    // gun turrets
    ctx.fillStyle = "#5d6680";
    ctx.fillRect(Math.round(cx - size * 0.45), Math.round(cy) - 1, 4, 2);
    ctx.fillRect(Math.round(cx + size * 0.45) - 4, Math.round(cy) - 1, 4, 2);
    ctx.fillRect(Math.round(cx) - 1, Math.round(cy - size * 0.45), 2, 4);
  }
  return c;
}

// ---------- Asteroids ----------

export function genAsteroid(rng: RNG, radius: number, rich: boolean): Sprite {
  const size = radius * 2 + 2;
  const [c, ctx] = make(size, size);
  const cx = size / 2, cy = size / 2;
  // lumpy radius per angle
  const lumps: number[] = [];
  const n = 12;
  for (let i = 0; i < n; i++) lumps.push(rng.range(0.6, 1.0));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5, dy = y - cy + 0.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx);
      const i = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * n) % n;
      const rr = radius * lumps[i];
      if (d > rr) continue;
      const light = 1 - (d / rr) * 0.4 + (-dx - dy) / (radius * 5);
      ctx.fillStyle = shade("#7a7268", Math.max(0.35, light));
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // craters
  for (let i = 0; i < radius; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0, radius * 0.6);
    ctx.fillStyle = shade("#7a7268", 0.5);
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
  }
  // ore glints
  if (rich) {
    ctx.fillStyle = "#ffd75a";
    for (let i = 0; i < 3 + radius / 2; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(0, radius * 0.5);
      ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
    }
  }
  return c;
}

// ---------- Jump gate ----------

export function genGate(size: number): Sprite {
  const [c, ctx] = make(size, size);
  const cx = size / 2, cy = size / 2;
  const R = size * 0.42;
  for (let a = 0; a < 360; a += 3) {
    const rad = (a * Math.PI) / 180;
    const x = cx + Math.cos(rad) * R;
    const y = cy + Math.sin(rad) * R;
    ctx.fillStyle = a % 30 < 6 ? "#63f2c8" : "#5d6680";
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
  }
  // inner shimmer
  for (let r = R - 4; r > 2; r -= 2) {
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = "#66d9ff";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return c;
}

// ---------- Sun ----------

export function genSun(rng: RNG, radius: number, color: string): Sprite {
  const size = radius * 2 + 8;
  const [c, ctx] = make(size, size);
  const cx = size / 2, cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5, dy = y - cy + 0.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > radius + 3) continue;
      if (d > radius) {
        ctx.globalAlpha = 0.25 * (1 - (d - radius) / 3);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
        ctx.globalAlpha = 1;
        continue;
      }
      const f = 1.35 - (d / radius) * 0.5 + (rng.next() - 0.5) * 0.15;
      ctx.fillStyle = shade(color, f);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

// ---------- Tiny crew portraits (for bar / crew UI) ----------

const SKIN = ["#e8b48c", "#c78a5a", "#8c5a3a", "#f0d0b0", "#a86f48"];
const HAIR = ["#2a2a33", "#5a3a1d", "#c7a54a", "#8a93ab", "#a83a3a", "#3a6ea5"];

export function genPortrait(rng: RNG): Sprite {
  const [c, ctx] = make(12, 12);
  const skin = rng.pick(SKIN);
  const hair = rng.pick(HAIR);
  const suit = rng.pick(["#3a6ea5", "#5d6680", "#7a5aa5", "#3aa55e", "#a53a3a"]);
  // suit shoulders
  ctx.fillStyle = suit;
  ctx.fillRect(1, 9, 10, 3);
  // head
  ctx.fillStyle = skin;
  ctx.fillRect(3, 3, 6, 6);
  // hair
  ctx.fillStyle = hair;
  ctx.fillRect(3, 1, 6, 2);
  if (rng.chance(0.5)) ctx.fillRect(2, 2, 1, 4);
  if (rng.chance(0.5)) ctx.fillRect(9, 2, 1, 4);
  // eyes
  ctx.fillStyle = "#1d2333";
  ctx.fillRect(4, 5, 1, 1);
  ctx.fillRect(7, 5, 1, 1);
  return c;
}
