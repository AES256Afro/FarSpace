import type { CrewMember } from "../data/crew";
import { GH, GT, GW, HAZARD, passable, type GroundMap } from "../ground";
import { logEntry, shiftBond, type World } from "../world";

export const AWAY_CAPACITY = 2;

export function awayCrew(crew: CrewMember[], names: string[]): CrewMember[] {
  return [...new Set(names)].map((name) => crew.find((c) => c.name === name && !c.sick))
    .filter((c): c is CrewMember => !!c).slice(0, AWAY_CAPACITY);
}

export function awayRole(c: CrewMember): string {
  return c.specialty === "science" ? "SCIENCE" : c.role.toUpperCase();
}

export function awayBenefit(c: CrewMember): string {
  if (c.specialty === "science") return "Flora data +25%; easier driving in storms";
  if (c.role === "engineer") return "Battery use -25%; a spare repairs 60 integrity";
  if (c.role === "medic") return "Emergency recovery costs 5 hull instead of 10";
  if (c.role === "gunner") return "Spots trouble: terrain damage -25%";
  return "Keeps the wheels straight: easier driving in storms";
}

export function awayBonuses(crew: CrewMember[]) {
  const has = (role: CrewMember["role"]) => crew.some((c) => c.role === role);
  return {
    powerUse: has("engineer") ? 0.75 : 1,
    repair: has("engineer") ? 60 : 40,
    floraData: crew.some((c) => c.specialty === "science") ? 1.25 : 1,
    hazardDamage: has("gunner") ? 0.75 : 1,
    stormSpeed: has("pilot") ? 0.85 : 0.7,
    recoveryHull: has("medic") ? 5 : 10,
    recoveryIntegrity: has("medic") ? 75 : 60,
  };
}

export function finishAwayTrip(w: World, names: string[]): CrewMember[] {
  const crew = awayCrew(w.player.crew, names);
  if (!crew.length) return crew;
  w.player.awayTrips = (w.player.awayTrips ?? 0) + 1;
  for (const c of crew) {
    c.loyalty = (c.loyalty ?? 0) + 0.3;
    c.morale = Math.min(100, c.morale + 3);
  }
  if (crew.length === 2) shiftBond(crew[0], crew[1], 0.2);
  logEntry(w, `${crew.map((c) => c.name).join(" and ")} came down with me and came back up`);
  return crew;
}

// Crew ride while the rover moves, and step onto reachable safe ground at stops.
// A small flood search prevents suits appearing across water or through a wall.
export function fieldPositions(map: GroundMap, px: number, py: number, count: number): { x: number; y: number }[] {
  const sx = Math.floor(px / GT), sy = Math.floor(py / GT);
  const safe = (x: number, y: number) => x >= 0 && y >= 0 && x < GW && y < GH
    && passable(map.tiles[y * GW + x]) && map.tiles[y * GW + x] !== HAZARD
    && !map.nodes.some((n) => n.kind === "geyser" && Math.abs(n.x - x) <= 1 && Math.abs(n.y - y) <= 1);
  if (!safe(sx, sy)) return [];
  const queue: [number, number, number][] = [[sx, sy, 0]];
  const seen = new Set([sy * GW + sx]);
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < queue.length && positions.length < Math.min(AWAY_CAPACITY, count); i++) {
    const [x, y, steps] = queue[i];
    const point = { x: x * GT + GT / 2, y: y * GT + GT / 2 };
    if (Math.hypot(point.x - px, point.y - py) >= 11
      && Math.hypot(point.x - (map.lander.x * GT + GT / 2), point.y - (map.lander.y * GT + GT / 2)) >= 11
      && positions.every((p) => Math.hypot(p.x - point.x, p.y - point.y) >= 10)) positions.push(point);
    if (steps >= 3) continue;
    for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0], [0, -1]]) {
      const nx = x + dx, ny = y + dy, key = ny * GW + nx;
      if (!seen.has(key) && safe(nx, ny)) { seen.add(key); queue.push([nx, ny, steps + 1]); }
    }
  }
  return positions;
}
