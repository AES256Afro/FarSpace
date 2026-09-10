// Planet-scale ground maps: a region of a world as a scrolling tile map the
// rover can cross. Pure generation (no DOM) so it can be unit-tested; the
// scene in scenes/surface.ts renders and drives it.

import { RNG, hashStr } from "./core/rng";
import type { Poi } from "./world";

export const GW = 96;   // tiles across
export const GH = 72;   // tiles down
export const GT = 8;    // pixels per tile

// tile ids
export const WATER = 0, PLAIN = 1, HILLS = 2, MOUNTAIN = 3, HAZARD = 4, SAND = 5;

export type NodeKind = "outcrop" | "flora" | "geyser" | "wreck" | "cache" | "probe";
export interface GroundNode { x: number; y: number; kind: NodeKind; material?: string; label: string }
export interface Entrance { x: number; y: number; poiId: string; kind: string; name: string }
export interface GroundMap {
  key: string;
  biome: number;            // planet palette index
  tiles: Uint8Array;
  nodes: GroundNode[];
  entrances: Entrance[];
  lander: { x: number; y: number };
}

export interface Biome { name: string; water: number; mountain: number; hazard: number; hills: number; sand: boolean; flora: number; geyser: number; hazardName: string; waterName: string }
export const BIOMES: Biome[] = [
  { name: "OCEAN WORLD", water: 0.52, mountain: 0.86, hazard: 0, hills: 0.72, sand: true, flora: 0.25, geyser: 0.05, hazardName: "", waterName: "SEA" },
  { name: "DESERT", water: 0.06, mountain: 0.8, hazard: 0, hills: 0.62, sand: true, flora: 0.08, geyser: 0.08, hazardName: "", waterName: "OASIS" },
  { name: "VERDANT", water: 0.3, mountain: 0.84, hazard: 0, hills: 0.66, sand: false, flora: 0.4, geyser: 0.05, hazardName: "", waterName: "LAKE" },
  { name: "EXOTIC", water: 0.22, mountain: 0.8, hazard: 0.08, hills: 0.6, sand: false, flora: 0.3, geyser: 0.1, hazardName: "SPORE FIELD", waterName: "TARN" },
  { name: "VOLCANIC", water: 0.05, mountain: 0.76, hazard: 0.16, hills: 0.55, sand: false, flora: 0.05, geyser: 0.2, hazardName: "LAVA", waterName: "MELT POOL" },
  { name: "ICE", water: 0.12, mountain: 0.82, hazard: 0.08, hills: 0.64, sand: false, flora: 0.06, geyser: 0.12, hazardName: "CREVASSE", waterName: "MELTWATER" },
  { name: "CLOUD DECK", water: 0.45, mountain: 0.9, hazard: 0.04, hills: 0.7, sand: false, flora: 0.12, geyser: 0.15, hazardName: "DOWNDRAFT", waterName: "CLOUD SEA" },
  { name: "CLOUD DECK", water: 0.45, mountain: 0.9, hazard: 0.04, hills: 0.7, sand: false, flora: 0.12, geyser: 0.15, hazardName: "DOWNDRAFT", waterName: "CLOUD SEA" },
];

export function groundKey(systemId: string, planetIdx: number, regionIdx: number): string {
  return `${systemId}:${planetIdx}:${regionIdx}`;
}

// value noise: hashed lattice, bilinear blend
function lattice(seed: number, x: number, y: number): number {
  let h = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = lattice(seed, x0, y0), b = lattice(seed, x0 + 1, y0), c = lattice(seed, x0, y0 + 1), d = lattice(seed, x0 + 1, y0 + 1);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

export function passable(t: number): boolean {
  return t === PLAIN || t === HILLS || t === SAND;
}

export function genGround(key: string, biome: number, pois: Poi[], regionResource: string): GroundMap {
  const seed = hashStr(key);
  const rng = new RNG(seed);
  const b = BIOMES[biome % BIOMES.length];
  const tiles = new Uint8Array(GW * GH);
  const s1 = rng.int(1, 1e9), s2 = rng.int(1, 1e9), s3 = rng.int(1, 1e9);
  const lander = { x: 48 + rng.int(-6, 6), y: 36 + rng.int(-5, 5) };
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    let e = noise(s1, x / 14, y / 14) * 0.65 + noise(s2, x / 5, y / 5) * 0.35;
    // keep the landing zone open
    const dl = Math.hypot(x - lander.x, y - lander.y);
    if (dl < 5) e = b.water + 0.05 + (b.hills - b.water) * 0.4;
    else if (dl < 9) e = e * 0.5 + (b.water + 0.12) * 0.5;
    let t: number;
    if (e < b.water) t = WATER;
    else if (e < b.water + 0.06 && b.sand) t = SAND;
    else if (e >= b.mountain) t = MOUNTAIN;
    else if (e >= b.hills) t = HILLS;
    else t = PLAIN;
    if (t === PLAIN && b.hazard > 0 && noise(s3, x / 4, y / 4) < b.hazard && dl > 8) t = HAZARD;
    tiles[y * GW + x] = t;
  }
  const at = (x: number, y: number) => tiles[y * GW + x];
  const set = (x: number, y: number, t: number) => { if (x >= 0 && y >= 0 && x < GW && y < GH) tiles[y * GW + x] = t; };
  const carve = (cx: number, cy: number, r: number) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) set(cx + x, cy + y, PLAIN); };
  // entrances: the region's POIs, spread out and reachable
  const entrances: Entrance[] = [];
  const taken: [number, number][] = [[lander.x, lander.y]];
  for (const poi of pois) {
    let best: [number, number] | null = null;
    for (let tries = 0; tries < 60 && !best; tries++) {
      const x = rng.int(8, GW - 9), y = rng.int(6, GH - 7);
      if (taken.every(([tx, ty]) => Math.hypot(tx - x, ty - y) > 18)) best = [x, y];
    }
    if (!best) best = [rng.int(8, GW - 9), rng.int(6, GH - 7)];
    taken.push(best);
    carve(best[0], best[1], 2);
    entrances.push({ x: best[0], y: best[1], poiId: poi.id, kind: poi.kind, name: poi.name });
  }
  // corridors: a rough passable path from the lander to every entrance
  for (const e of entrances) {
    let x = lander.x, y = lander.y;
    let guard = 0;
    while ((x !== e.x || y !== e.y) && guard++ < 400) {
      if (rng.chance(0.5) && x !== e.x) x += Math.sign(e.x - x); else if (y !== e.y) y += Math.sign(e.y - y); else x += Math.sign(e.x - x);
      const t = at(x, y);
      if (!passable(t)) set(x, y, t === WATER ? SAND : PLAIN);
    }
  }
  // nodes
  const nodes: GroundNode[] = [];
  const mats = (t: number): string => {
    if (t === HILLS) return rng.pick(["nickel", "germanium", "iron"]);
    if (biome === 4) return rng.pick(["iron", "polonium", "vanadium"]);
    if (biome === 3) return rng.pick(["vanadium", "carbon", "germanium"]);
    if (biome === 5) return rng.pick(["carbon", "nickel", "germanium"]);
    return rng.pick(["iron", "nickel", "carbon", "iron"]);
  };
  const want = 34;
  for (let tries = 0; tries < 800 && nodes.length < want; tries++) {
    const x = rng.int(2, GW - 3), y = rng.int(2, GH - 3);
    const t = at(x, y);
    if (!passable(t)) continue;
    if (Math.hypot(x - lander.x, y - lander.y) < 4) continue;
    if (nodes.some((n) => Math.abs(n.x - x) + Math.abs(n.y - y) < 4) || entrances.some((e) => Math.hypot(e.x - x, e.y - y) < 3)) continue;
    const r = rng.next();
    let kind: NodeKind;
    if (r < 0.34) kind = "outcrop";
    else if (r < 0.34 + b.flora) kind = "flora";
    else if (r < 0.34 + b.flora + b.geyser) kind = "geyser";
    else if (r < 0.86) kind = "probe";
    else if (r < 0.93) kind = "wreck";
    else kind = "cache";
    const material = kind === "outcrop" ? mats(t) : undefined;
    const label = kind === "outcrop" ? `${material!.toUpperCase()} OUTCROP` : kind === "flora" ? rng.pick(["TUBE MOSS", "GLASS REEDS", "SHELF FUNGUS", "CORAL BRUSH", "FROST LICHEN", "WIRE VINES"])
      : kind === "geyser" ? (b.geyser > 0.15 ? "FUMAROLE" : "GEYSER") : kind === "probe" ? "CRASHED PROBE" : kind === "wreck" ? "ROVER WRECK" : `${regionResource.toUpperCase()} CACHE`;
    nodes.push({ x, y, kind, material, label });
  }
  return { key, biome, tiles, nodes, entrances, lander };
}
