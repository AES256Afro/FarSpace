import { describe, expect, it } from "vitest";
import type { Game } from "../src/game";
import type { CrewMember } from "../src/data/crew";
import { awayBonuses, awayCrew, fieldPositions, finishAwayTrip } from "../src/core/awayteam";
import { GH, GT, GW, HAZARD, MOUNTAIN, PLAIN, WATER, type GroundMap } from "../src/ground";
import { generateWorld } from "../src/world";
import { AwayTeamScene } from "../src/scenes/awayteam";
import { SurfaceScene } from "../src/scenes/surface";

const member = (name: string, role: CrewMember["role"], specialty?: string): CrewMember => ({ name, role, specialty, skill: 3, morale: 70, wage: 40 });
const ground = (): GroundMap => ({ key: "test", biome: 2, tiles: new Uint8Array(GW * GH).fill(PLAIN), nodes: [], entrances: [], lander: { x: 5, y: 5 } });

describe("away teams", () => {
  it("only takes two distinct fit people who still belong to the crew", () => {
    const crew = [member("Ada", "engineer"), member("Lin", "pilot", "science"), member("Bo", "medic"), member("Kit", "gunner")];
    crew[2].sick = { kind: "dock fever", until: 500 };
    expect(awayCrew(crew, ["Missing", "Bo", "Ada", "Ada", "Lin", "Kit"]).map(c => c.name)).toEqual(["Ada", "Lin"]);
    expect(awayCrew([], ["Ada"])).toEqual([]);
  });

  it("combines distinct roles without doubling a repeated role", () => {
    const engineer = member("Ada", "engineer"), science = member("Lin", "pilot", "science");
    const support = awayBonuses([engineer, science]);
    expect(support.powerUse).toBe(0.75);
    expect(support.repair).toBe(60);
    expect(Math.round(120 * support.floraData)).toBe(150);
    expect(Math.round(45 * support.floraData)).toBe(56);
    expect(support.stormSpeed).toBe(0.85);
    expect(awayBonuses([engineer, member("Pat", "engineer")]).powerUse).toBe(0.75);
    const rescue = awayBonuses([member("Bo", "medic"), member("Kit", "gunner")]);
    expect(rescue.recoveryHull).toBe(5);
    expect(rescue.recoveryIntegrity).toBe(75);
    expect(rescue.hazardDamage).toBe(0.75);
    expect(awayBonuses([]).powerUse).toBe(1);
  });

  it("returns both people, counts one trip, and keeps their shared record through saves", () => {
    const w = generateWorld(913);
    w.player.crew = [member("Ada", "engineer"), member("Lin", "pilot"), member("Bo", "medic")];
    w.player.crew[0].morale = 99;
    finishAwayTrip(w, ["Ada", "Lin"]);
    expect(w.player.awayTrips).toBe(1);
    expect(w.player.crew[0].morale).toBe(100);
    expect(w.player.crew[1].morale).toBe(73);
    expect(w.player.crew[2].morale).toBe(70);
    const restored = JSON.parse(JSON.stringify(w)) as typeof w;
    expect(restored.player.crew[0].bonds?.Lin).toBe(0.2);
    expect(restored.player.crew[1].bonds?.Ada).toBe(0.2);
    expect(restored.player.crew[0].loyalty).toBe(0.3);
    expect(restored.player.log?.some(e => e.text.includes("Ada and Lin"))).toBe(true);
  });

  it("puts suits on separate reachable tiles, away from water, heat, and geysers", () => {
    const map = ground();
    const x = 20, y = 20;
    map.tiles[y * GW + x + 1] = WATER;
    map.tiles[(y + 1) * GW + x] = HAZARD;
    map.nodes.push({ kind: "geyser", x: x - 2, y, label: "vent" });
    const positions = fieldPositions(map, x * GT + 4, y * GT + 4, 2);
    expect(positions.length).toBe(2);
    for (const p of positions) {
      const tx = Math.floor(p.x / GT), ty = Math.floor(p.y / GT);
      expect(map.tiles[ty * GW + tx]).toBe(PLAIN);
      expect(Math.abs(tx - (x - 2)) > 1 || Math.abs(ty - y) > 1).toBe(true);
    }
    expect(Math.hypot(positions[0].x - positions[1].x, positions[0].y - positions[1].y)).toBeGreaterThanOrEqual(10);
    map.tiles.fill(MOUNTAIN); map.tiles[y * GW + x] = PLAIN;
    expect(fieldPositions(map, x * GT + 4, y * GT + 4, 2)).toEqual([]);
    expect(fieldPositions(map, -4, -4, 2)).toEqual([]);
  });

  it("supports a full roster by keyboard and touch, caps the seats, and cancels edits", () => {
    const scene = new AwayTeamScene();
    const crew = Array.from({ length: 8 }, (_, i) => member(`Crew ${i}`, "engineer"));
    let result: string[] = [], current = "";
    const keys = new Set<string>();
    const input = { wasPressed: (key: string) => keys.has(key), wheel: 0, mousePressed: false, mouseX: 0, mouseY: 0 };
    const g = { world: { player: { crew } }, input, setScene: (name: string) => { current = name; }, scenes: { surface: { setAwayTeam: (_g: Game, names: string[]) => { result = names; } } } } as unknown as Game;
    const press = (key: string) => { keys.add(key); scene.update(g); keys.clear(); };
    scene.open(g, ["Crew 0"]);
    press("ArrowDown"); press("Enter");
    press("ArrowDown"); press("Enter");
    expect(scene.selected).toEqual(["Crew 0", "Crew 1"]);
    expect(scene.message).toContain("TWO SEATS");
    press("Escape"); expect(result).toEqual(["Crew 0"]); expect(current).toBe("surface");
    scene.open(g, []);
    input.mousePressed = true; input.mouseX = 410; input.mouseY = 216; scene.update(g);
    expect(scene.cursor).toBe(6);
    input.mouseX = 80; input.mouseY = 70; scene.update(g);
    expect(scene.selected).toEqual(["Crew 6"]);
    input.mouseY = 240; scene.update(g);
    expect(result).toEqual(["Crew 6"]); expect(current).toBe("surface");
  });

  it("clears the landed team before lift-off so returning twice cannot award twice", () => {
    const scene = new SurfaceScene();
    const w = generateWorld(914); w.player.crew = [member("Ada", "engineer"), member("Lin", "pilot")];
    const g = { world: w, toast: () => {}, setScene: () => {} } as unknown as Game;
    scene.awayTeam = ["Ada", "Lin"];
    scene.leave(g); scene.leave(g);
    expect(w.player.awayTrips).toBe(1);
    expect(w.player.crew[0].loyalty).toBe(0.3);
    expect(scene.awayTeam).toEqual([]);
  });

  it("keeps the team and region when returning from a ground card, and asks again on a fresh landing", () => {
    const scene = new SurfaceScene();
    const w = generateWorld(915, { realGalaxy: true });
    w.player.crew = [member("Ada", "engineer"), member("Lin", "pilot")];
    let asks = 0;
    const g = { world: w, surfaceFresh: true, orbitPlanetIdx: 0, landedRegionIdx: 0,
      toast: () => {}, showHint: () => {}, setScene: () => {},
      scenes: { awayteam: { open: () => { asks++; } }, encounter: { returnTo: "surface", outcome: null } },
    } as unknown as Game;
    scene.enter(g); scene.setAwayTeam(g, ["Ada", "Lin"]);
    scene.state.taken.push(3); scene.integrity = 65;
    const map = scene.map, px = scene.px;
    scene.enter(g);
    expect(asks).toBe(1); expect(scene.map).toBe(map); expect(scene.px).toBe(px);
    expect(scene.awayTeam).toEqual(["Ada", "Lin"]);
    expect(scene.state.taken).toContain(3); expect(scene.integrity).toBe(65);
    g.surfaceFresh = true; scene.enter(g);
    expect(asks).toBe(2); expect(scene.awayTeam).toEqual([]);
  });

  it("awards and announces the same science-assisted scan value in the surface scene", () => {
    const scene = new SurfaceScene();
    const w = generateWorld(916); w.player.crew = [member("Lin", "pilot", "science")];
    const messages: string[] = [];
    const g = { world: w, input: { isDown: (key: string) => key === "v", wasPressed: () => false },
      toast: (line: string) => messages.push(line), scenes: {}, orbitPlanetIdx: 0,
    } as unknown as Game;
    scene.map = ground(); scene.state = { taken: [], scanned: [], charted: true };
    scene.map.nodes = [{ kind: "flora", x: 20, y: 20, label: "Glass reeds" }, { kind: "outcrop", x: 40, y: 40, label: "Rock", material: "iron" }];
    scene.px = 20 * GT + 4; scene.py = 20 * GT + 4; scene.stormTimer = 999;
    scene.awayTeam = ["Lin"];
    const data = w.player.expData ?? 0;
    scene.update(g, 2);
    expect(w.player.expData).toBe(data + 150);
    expect(messages).toContain("NEW SPECIES: Glass reeds +150 EXPLORATION DATA");
    expect(scene.state.scanned).toEqual([0]);
    scene.update(g, 2);
    expect(w.player.expData).toBe(data + 150);
  });
});
