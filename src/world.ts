// World model + procedural galaxy generation. Pure data — scenes render it.

import { RNG, hashStr } from "./core/rng";
import {
  FACTIONS, ECONOMY, COMMODITIES, StationType,
  genSystemName, genStationName, genPersonName, planetName,
} from "./data/data";

export interface Planet {
  name: string;
  orbit: number;      // orbital radius in world units
  angle: number;      // current angle
  speed: number;      // radians/sec
  radius: number;     // sprite radius px
  palette: number;
}

export interface StationDef {
  id: string;
  name: string;
  type: StationType;
  military: boolean;
  orbit: number;
  angle: number;
  speed: number;
  factionId: string;
  prices: Record<string, number>;
  stock: Record<string, number>;
  fuelPrice: number;
  repairPrice: number; // per hull point
  barPatrons: string[];
}

export interface AsteroidDef {
  x: number; y: number;
  radius: number;
  rich: boolean;
  ore: number;       // remaining ore units
  spriteSeed: number;
  rot: number; rotSpeed: number;
}

export interface JumpPointDef {
  id: string;
  x: number; y: number;
  targetSystemId: string;
  guarded: boolean;
}

export interface SystemDef {
  id: string;
  name: string;
  gx: number; gy: number;    // galaxy map position
  factionId: string;
  sunColor: string;
  sunRadius: number;
  planets: Planet[];
  stations: StationDef[];
  asteroids: AsteroidDef[];
  jumpPoints: JumpPointDef[];
  pirateActivity: number;    // 0..1
  links: string[];           // connected system ids
}

export interface Mission {
  id: string;
  kind: "delivery" | "bounty" | "mining";
  title: string;
  desc: string;
  fromStationId: string;
  targetSystemId: string;
  targetStationId?: string;
  commodityId?: string;
  qty?: number;
  killsNeeded?: number;
  kills?: number;
  reward: number;
  accepted: boolean;
  done: boolean;
}

export interface NewsItem {
  headline: string;
  body: string;
}

export type ShipSystemId = "engines" | "life" | "weapons" | "cargo" | "reactor" | "comms";

export interface ShipSystem {
  id: ShipSystemId;
  name: string;
  health: number; // 0..100
}

export interface PlayerState {
  credits: number;
  systemId: string;
  x: number; y: number;
  vx: number; vy: number;
  angle: number;
  hull: number; hullMax: number;
  shield: number; shieldMax: number;
  fuel: number; fuelMax: number;
  oxygen: number; oxygenMax: number;
  cargo: Record<string, number>;
  cargoMax: number;
  systems: ShipSystem[];
  missions: Mission[];
  dockedAt: string | null;
  kills: number;
  wanted: number; // heat with law enforcement 0..1
}

export interface World {
  seed: number;
  time: number;
  systems: Record<string, SystemDef>;
  player: PlayerState;
  news: NewsItem[];
  missionCounter: number;
}

export const SYSTEM_SIZE = 6000; // world units, square from -SIZE..SIZE

// ---------- Generation ----------

function genPrices(rng: RNG, type: StationType): { prices: Record<string, number>; stock: Record<string, number> } {
  const prices: Record<string, number> = {};
  const stock: Record<string, number> = {};
  for (const c of COMMODITIES) {
    const mult = ECONOMY[type][c.id] ?? 1;
    if (mult === 0) continue; // not traded here
    prices[c.id] = Math.max(1, Math.round(c.base * mult * rng.range(0.85, 1.15)));
    stock[c.id] = mult < 1 ? rng.int(30, 120) : rng.int(0, 25);
  }
  return { prices, stock };
}

function genSystem(rng: RNG, id: string, gx: number, gy: number, factionId: string): SystemDef {
  const name = genSystemName(rng);
  const sunColors = ["#ffd75a", "#ffb347", "#ff8a5a", "#8ec9f0", "#f2f4ff", "#ff5a5a"];
  const sys: SystemDef = {
    id, name, gx, gy, factionId,
    sunColor: rng.pick(sunColors),
    sunRadius: rng.int(26, 44),
    planets: [],
    stations: [],
    asteroids: [],
    jumpPoints: [],
    pirateActivity: factionId === "vex" ? rng.range(0.6, 1) : rng.range(0.05, 0.45),
    links: [],
  };
  // planets
  const nPlanets = rng.int(2, 5);
  let orbit = 700;
  for (let i = 0; i < nPlanets; i++) {
    orbit += rng.range(500, 900);
    sys.planets.push({
      name: planetName(name, i),
      orbit,
      angle: rng.range(0, Math.PI * 2),
      speed: rng.range(0.002, 0.01) * (rng.chance(0.5) ? 1 : -1),
      radius: rng.int(10, 26),
      palette: rng.int(0, 7),
    });
  }
  // stations
  const nStations = factionId === "vex" ? 1 : rng.int(1, 3);
  const types: StationType[] = ["mining", "agri", "refinery", "research", "trade"];
  for (let i = 0; i < nStations; i++) {
    const military = factionId !== "vex" && rng.chance(FACTIONS.find((f) => f.id === factionId)!.military * 0.5);
    const type: StationType = military ? "military" : rng.pick(types);
    const { prices, stock } = genPrices(rng, type);
    const patrons: string[] = [];
    for (let p = 0; p < rng.int(2, 4); p++) patrons.push(genPersonName(rng));
    sys.stations.push({
      id: `${id}-st${i}`,
      name: genStationName(rng, military),
      type, military,
      orbit: sys.planets[i % sys.planets.length].orbit + rng.range(120, 260),
      angle: rng.range(0, Math.PI * 2),
      speed: rng.range(0.003, 0.008),
      factionId,
      prices, stock,
      fuelPrice: rng.int(2, 4),
      repairPrice: rng.int(3, 6),
      barPatrons: patrons,
    });
  }
  // asteroid belt(s)
  const nBelts = rng.int(1, 2);
  for (let b = 0; b < nBelts; b++) {
    const beltR = rng.range(1200, SYSTEM_SIZE * 0.75);
    const count = rng.int(30, 60);
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = beltR + rng.range(-260, 260);
      sys.asteroids.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        radius: rng.int(4, 12),
        rich: rng.chance(0.3),
        ore: rng.int(3, 10),
        spriteSeed: rng.int(0, 1e9),
        rot: rng.range(0, Math.PI * 2),
        rotSpeed: rng.range(-0.3, 0.3),
      });
    }
  }
  return sys;
}

export function generateWorld(seed: number): World {
  const rng = new RNG(seed);
  const systems: Record<string, SystemDef> = {};
  // Lay out 10 systems on a rough grid with jitter
  const N = 10;
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < N; i++) {
    let x = 0, y = 0, ok = false;
    for (let tries = 0; tries < 50 && !ok; tries++) {
      x = rng.range(30, 290);
      y = rng.range(30, 190);
      ok = positions.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 > 55 * 55);
    }
    positions.push({ x, y });
  }
  // faction territories: nearest-of-4 seeds; last faction (vex) gets outliers
  const factionSeeds = FACTIONS.slice(0, 4).map(() => ({ x: rng.range(40, 280), y: rng.range(40, 180) }));
  const ids: string[] = [];
  for (let i = 0; i < N; i++) {
    const id = `sys${i}`;
    ids.push(id);
    let fi = 0, best = Infinity;
    factionSeeds.forEach((s, j) => {
      const d = (s.x - positions[i].x) ** 2 + (s.y - positions[i].y) ** 2;
      if (d < best) { best = d; fi = j; }
    });
    const factionId = best > 90 * 90 && rng.chance(0.6) ? "vex" : FACTIONS[fi].id;
    systems[id] = genSystem(rng.fork(i + 1), id, positions[i].x, positions[i].y, factionId);
  }
  // Links: connect each system to 1-3 nearest neighbours (undirected)
  for (let i = 0; i < N; i++) {
    const dists = ids
      .map((id, j) => ({ id, d: (positions[i].x - positions[j].x) ** 2 + (positions[i].y - positions[j].y) ** 2, j }))
      .filter((e) => e.j !== i)
      .sort((a, b) => a.d - b.d);
    const want = rng.int(1, 3);
    for (let k = 0; k < want; k++) {
      const other = dists[k].id;
      if (!systems[ids[i]].links.includes(other)) systems[ids[i]].links.push(other);
      if (!systems[other].links.includes(ids[i])) systems[other].links.push(ids[i]);
    }
  }
  // ensure connectivity: BFS from sys0, attach any orphans to nearest visited
  const visited = new Set<string>(["sys0"]);
  const queue = ["sys0"];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const l of systems[cur].links) if (!visited.has(l)) { visited.add(l); queue.push(l); }
  }
  for (const id of ids) {
    if (!visited.has(id)) {
      // link to any visited system
      const target = [...visited][rng.int(0, visited.size - 1)];
      systems[id].links.push(target);
      systems[target].links.push(id);
      visited.add(id);
    }
  }
  // jump point entities within each system (one per link)
  for (const id of ids) {
    const sys = systems[id];
    sys.links.forEach((l, k) => {
      const a = (k / sys.links.length) * Math.PI * 2 + 0.7;
      const r = SYSTEM_SIZE * 0.85;
      sys.jumpPoints.push({
        id: `${id}-jp${k}`,
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        targetSystemId: l,
        guarded: systems[id].factionId !== "vex",
      });
    });
  }

  // Start in a non-pirate system with a station
  const startId = ids.find((i) => systems[i].factionId !== "vex" && systems[i].stations.length > 0) ?? "sys0";
  const startSys = systems[startId];
  const st = startSys.stations[0];
  const sx = Math.cos(st.angle) * st.orbit;
  const sy = Math.sin(st.angle) * st.orbit;

  const player: PlayerState = {
    credits: 400,
    systemId: startId,
    x: sx + 80, y: sy + 40,
    vx: 0, vy: 0, angle: 0,
    hull: 100, hullMax: 100,
    shield: 50, shieldMax: 50,
    fuel: 100, fuelMax: 100,
    oxygen: 100, oxygenMax: 100,
    cargo: {},
    cargoMax: 40,
    systems: [
      { id: "reactor", name: "Reactor Core", health: 100 },
      { id: "engines", name: "Main Engines", health: 100 },
      { id: "life", name: "Air Scrubbers", health: 100 },
      { id: "weapons", name: "Weapon Mounts", health: 100 },
      { id: "cargo", name: "Cargo Bay", health: 100 },
      { id: "comms", name: "Comms Array", health: 100 },
    ],
    missions: [],
    dockedAt: null,
    kills: 0,
    wanted: 0,
  };

  const world: World = { seed, time: 0, systems, player, news: [], missionCounter: 0 };
  world.news = genNews(new RNG(seed ^ 0xbeef), world);
  return world;
}

// ---------- Missions ----------

export function genMissionsFor(world: World, station: StationDef, rng: RNG): Mission[] {
  const missions: Mission[] = [];
  const sys = Object.values(world.systems).find((s) => s.stations.includes(station))!;
  const linked = sys.links.map((l) => world.systems[l]);
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const kind = rng.pick(["delivery", "bounty", "mining"] as const);
    const idn = `m${world.missionCounter++}`;
    if (kind === "delivery" && linked.length) {
      const target = rng.pick(linked);
      const tStation = target.stations.length ? rng.pick(target.stations) : null;
      if (!tStation) continue;
      const com = rng.pick(COMMODITIES.filter((c) => !c.illegal || rng.chance(0.15)));
      const qty = rng.int(3, 10);
      const reward = Math.round(com.base * qty * 1.6 + 120 + (com.illegal ? 400 : 0));
      missions.push({
        id: idn, kind, accepted: false, done: false,
        title: `Deliver ${qty} ${com.name}`,
        desc: `Take ${qty}x ${com.name} to ${tStation.name} in ${target.name}.${com.illegal ? " Discreetly. Avoid gate scans." : ""}`,
        fromStationId: station.id,
        targetSystemId: target.id,
        targetStationId: tStation.id,
        commodityId: com.id, qty, reward,
      });
    } else if (kind === "bounty") {
      const target = linked.length && rng.chance(0.6) ? rng.pick(linked) : sys;
      const kills = rng.int(2, 4);
      missions.push({
        id: idn, kind, accepted: false, done: false,
        title: `Bounty: ${kills} corsairs`,
        desc: `Destroy ${kills} Veil Corsair raiders in ${target.name}. Payment on return.`,
        fromStationId: station.id,
        targetSystemId: target.id,
        killsNeeded: kills, kills: 0,
        reward: 250 * kills + rng.int(0, 200),
      });
    } else {
      const qty = rng.int(6, 14);
      missions.push({
        id: idn, kind, accepted: false, done: false,
        title: `Mining: ${qty} Raw Ore`,
        desc: `Deliver ${qty}x Raw Ore to ${station.name}. Mine it or buy it — we don't care.`,
        fromStationId: station.id,
        targetSystemId: sys.id,
        targetStationId: station.id,
        commodityId: "ore", qty,
        reward: 26 * qty + rng.int(20, 120),
      });
    }
  }
  return missions;
}

// ---------- News ----------

const NEWS_TEMPLATES = [
  (a: string, b: string) => ({ headline: `TENSIONS RISE IN ${a.toUpperCase()}`, body: `Patrols doubled at jump points after corsair sightings near ${b}.` }),
  (a: string, b: string) => ({ headline: `ORE PRICES SURGE`, body: `Refineries in ${a} pay premium rates as belt yields dip in ${b}.` }),
  (a: string, b: string) => ({ headline: `MISSING SURVEY TEAM`, body: `A research vessel out of ${a} went dark near ${b}. Salvagers circling.` }),
  (a: string, b: string) => ({ headline: `TRADE ACCORD SIGNED`, body: `${a} and ${b} slash docking fees for guild-registered haulers.` }),
  (a: string, b: string) => ({ headline: `BIO-CARGO SEIZED`, body: `Customs at ${a} intercepted unlicensed biological samples bound for ${b}.` }),
  (a: string, b: string) => ({ headline: `GATE MAINTENANCE`, body: `Expect scan delays at ${a} jump points through the cycle.` }),
];

export function genNews(rng: RNG, world: World): NewsItem[] {
  const names = Object.values(world.systems).map((s) => s.name);
  const items: NewsItem[] = [];
  for (let i = 0; i < 5; i++) {
    const t = rng.pick(NEWS_TEMPLATES);
    items.push(t(rng.pick(names), rng.pick(names)));
  }
  return items;
}

// ---------- Cargo helpers ----------

export function cargoUsed(p: PlayerState): number {
  return Object.values(p.cargo).reduce((a, b) => a + b, 0);
}

export function addCargo(p: PlayerState, id: string, qty: number): boolean {
  if (cargoUsed(p) + qty > p.cargoMax) return false;
  p.cargo[id] = (p.cargo[id] ?? 0) + qty;
  return true;
}

export function removeCargo(p: PlayerState, id: string, qty: number): boolean {
  if ((p.cargo[id] ?? 0) < qty) return false;
  p.cargo[id] -= qty;
  if (p.cargo[id] <= 0) delete p.cargo[id];
  return true;
}

export function hasIllegalCargo(p: PlayerState): boolean {
  return Object.entries(p.cargo).some(([id, q]) => q > 0 && COMMODITIES.find((c) => c.id === id)?.illegal);
}

export function findStation(world: World, stationId: string): { sys: SystemDef; st: StationDef } | null {
  for (const sys of Object.values(world.systems)) {
    const st = sys.stations.find((s) => s.id === stationId);
    if (st) return { sys, st };
  }
  return null;
}
