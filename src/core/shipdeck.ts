import { RNG } from "./rng";

export interface DeckPoint { tx: number; ty: number }
export interface DeckRoom { name: string; x: number; y: number; width: number; height: number; color: string }
export interface DeckSystem extends DeckPoint { ch: "E" | "L" | "R"; name: string }
export interface ShipDeck {
  tiles: string[];
  rooms: DeckRoom[];
  systems: DeckSystem[];
  airlock: DeckPoint;
  spawn: DeckPoint;
  fixtures: { power: DeckPoint; fuel: DeckPoint; survivor: DeckPoint; recorder: DeckPoint };
  cargoSpots: DeckPoint[];
  name: string;
}
export interface RepairProgress { seed: number; health: Record<string, number>; fires: DeckPoint[] }

// A clear spine connects every room. Equipment stays away from doors and the
// spine so every repair panel has a reachable working position.
export function generateShipDeck(seed: number): ShipDeck {
  const rng = new RNG(seed);
  const widths = Array.from({ length: 3 }, () => rng.int(7, 11));
  const top = rng.int(4, 6), bottom = rng.int(4, 6);
  const width = widths.reduce((a, b) => a + b, 0) + 4;
  const height = top + bottom + 4;
  const grid = Array.from({ length: height }, () => Array<string>(width).fill("#"));
  const rooms: DeckRoom[] = [];
  const names = ["DRIVE", "REACTOR", "LIFE SUPPORT", "BRIDGE", "CARGO", "CREW"];
  for (let i = names.length - 1; i > 0; i--) { const j = rng.int(0, i); [names[i], names[j]] = [names[j], names[i]]; }
  const colors: Record<string, string> = { DRIVE: "#253348", REACTOR: "#3b2932", "LIFE SUPPORT": "#1c3736", BRIDGE: "#29324d", CARGO: "#393326", CREW: "#303048" };
  const cy = top + 1;
  for (let y = cy; y <= cy + 1; y++) for (let x = 1; x < width - 1; x++) grid[y][x] = ".";
  let x = 2;
  for (let col = 0; col < widths.length; col++) {
    for (let side = 0; side < 2; side++) {
      const room = { name: names[col * 2 + side], x, y: side ? cy + 3 : 1, width: widths[col] - 1, height: side ? bottom - 1 : top - 1, color: colors[names[col * 2 + side]] };
      rooms.push(room);
      for (let yy = room.y; yy < room.y + room.height; yy++) for (let xx = room.x; xx < room.x + room.width; xx++) grid[yy][xx] = ".";
      const door = rng.int(room.x + 1, room.x + room.width - 2);
      grid[side ? cy + 2 : cy - 1][door] = "D";
    }
    x += widths[col];
  }
  const mirrored = rng.chance(0.5);
  const airlock = { tx: mirrored ? width - 2 : 1, ty: cy };
  grid[airlock.ty][airlock.tx] = "A";
  const spawn = { tx: mirrored ? width - 3 : 2, ty: cy + 1 };
  const at = (name: string): DeckPoint => {
    const room = rooms.find(r => r.name === name)!;
    const ty = room.y + 2;
    let tx = room.x + Math.floor(room.width / 2);
    if (grid[ty + 1]?.[tx] === "D" || grid[ty - 1]?.[tx] === "D") tx++;
    return { tx, ty };
  };
  const systems: DeckSystem[] = [
    { ...at("DRIVE"), ch: "E", name: "ENGINES" },
    { ...at("LIFE SUPPORT"), ch: "L", name: "LIFE SUPPORT" },
    { ...at("REACTOR"), ch: "R", name: "REACTOR" },
  ];
  const fixtures = { power: at("REACTOR"), fuel: at("DRIVE"), survivor: at("CREW"), recorder: at("BRIDGE") };
  const occupied = new Set(Object.values(fixtures).map(p => `${p.tx},${p.ty}`));
  const cargoSpots: DeckPoint[] = [];
  for (const room of rooms) for (let yy = room.y; yy < room.y + room.height; yy++) for (let xx = room.x; xx < room.x + room.width; xx++) {
    // Wall racks cannot block the middle of a room or its entrance.
    const doorway = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => grid[yy + dy]?.[xx + dx] === "D");
    if ((yy === room.y || xx === room.x) && !doorway && !occupied.has(`${xx},${yy}`)) cargoSpots.push({ tx: xx, ty: yy });
  }
  for (let i = cargoSpots.length - 1; i > 0; i--) { const j = rng.int(0, i); [cargoSpots[i], cargoSpots[j]] = [cargoSpots[j], cargoSpots[i]]; }
  return { tiles: grid.map(r => r.join("")), rooms, systems, airlock, spawn, fixtures, cargoSpots, name: rng.pick(["CARGO HAULER", "SURVEY VESSEL", "SERVICE SHIP", "LONG RANGE TRANSPORT"]) };
}
