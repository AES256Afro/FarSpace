import { describe, expect, it, vi } from "vitest";
import type { Game } from "../src/game";
import { generateWorld, type Mission } from "../src/world";
import { SystemMap } from "../src/scenes/systemmap";
import { FlightScene } from "../src/scenes/flight/index";

function fixture() {
  const world = generateWorld(418), p = world.player, sys = world.systems[p.systemId], map = new SystemMap(), flight = new FlightScene(), keys = new Set<string>();
  p.story = 0; p.story2 = -1; p.story3 = -1; p.missions = []; p.crew = []; p.dockedAt = null; p.navTarget = sys.links[0];
  flight.systemMap = map; flight.mapOpen = true;
  const g = { world, scenes: { flight }, sceneName: "flight", settingsReturn: "roster", input: { wasPressed: (key: string) => keys.has(key), isDown: () => false, mouseX: 0, mouseY: 0, mousePressed: false, wheel: 0, flush: vi.fn(), down: new Set() }, toast: vi.fn(), save: vi.fn(), load: vi.fn(), setScene: vi.fn() } as unknown as Game;
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true }) as CanvasRenderingContext2D;
  map.enter(g);
  const press = (key: string) => { keys.add(key); map.update(g, .05); keys.clear(); };
  const click = (x: number, y: number) => { Object.assign(g.input, { mouseX: x, mouseY: y, mousePressed: true }); map.update(g, .05); g.input.mousePressed = false; };
  const wrecks = () => {
    const sample = sys.wrecks[0]; sys.wrecks = Array.from({ length: 22 }, (_, i) => ({ ...sample, id: `test-${i}`, name: `WRECK ${String(i).padStart(2, "0")}`, x: p.x + 30, y: p.y, looted: false })); map.filter = "WRECK"; map.sync(g);
  };
  return { g, p, sys, map, flight, press, click, wrecks, draw: () => map.draw(g, ctx) };
}

describe("local map details and list continuity", () => {
  it("shows all quests at one station and returns to the same camera without changing a course", () => {
    const { g, p, sys, map, flight, press } = fixture(), station = sys.stations[0];
    p.missions = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, title: `SUPPLY ORDER ${i}`, desc: "", kind: "delivery", fromStationId: station.id, targetStationId: station.id, targetSystemId: sys.id, commodityId: "parts", qty: i + 1, reward: 100, accepted: true, done: false } as Mission));
    map.selected = `station:${station.id}`; map.camera.x = 733; map.camera.y = 812; const scale = map.camera.scale, state = JSON.stringify(g.world);
    press("i"); expect(map.info?.sections).toHaveLength(13); expect(map.info?.sections.at(-1)?.[0]).toBe("SUPPLY ORDER 11");
    expect(map.info?.sections.at(-1)?.[1].join(" ")).toContain("12"); press("End"); expect(map.info?.scroll).toBe(map.info?.maxScroll());
    press("a"); expect(flight.autopilot).toBe(false); press("Escape");
    expect(map.info).toBeUndefined(); expect(flight.mapOpen).toBe(true); expect(g.sceneName).toBe("flight"); expect(g.settingsReturn).toBe("roster");
    expect([map.camera.x, map.camera.y, map.camera.scale]).toEqual([733, 812, scale]); expect(JSON.stringify(g.world)).toBe(state);
  });
  it("preserves the top visible contact and selection when earlier entries change", () => {
    const { g, sys, map, wrecks } = fixture(); wrecks(); map.selected = "wreck:test-10"; map.scroll = 8;
    sys.wrecks.push({ ...sys.wrecks[0], id: "new", name: "A NEW WRECK" }); map.update(g, .05);
    expect(map.selected).toBe("wreck:test-10"); expect(map.contacts(g)[map.scroll].id).toBe("wreck:test-8");
    sys.wrecks = sys.wrecks.filter(w => w.id !== "test-10"); map.update(g, .05); expect(map.selected).toBe("wreck:test-11");
  });
  it("uses the row that was drawn when a contact is inserted before pointer selection", () => {
    const { g, sys, map, wrecks, draw, click } = fixture(); wrecks(); map.scroll = 8; draw();
    sys.wrecks.push({ ...sys.wrecks[0], id: "new", name: "A NEW WRECK" }); click(330, 130);
    expect(map.selected).toBe("wreck:test-8"); expect(g.world.player.navTarget).toBe(sys.links[0]);
  });
  it("does not reset list scrolling when the pointer drifts or details are read", () => {
    const { g, map, wrecks, press } = fixture(); wrecks(); press("PageDown"); expect(map.scroll).toBe(7);
    Object.assign(g.input, { mouseX: 345, mouseY: 149, wheel: 1 }); map.update(g, .05); g.input.wheel = 0;
    const top = map.scroll; g.input.mouseY += 1; map.update(g, .05); expect(map.scroll).toBe(top);
    press("i"); press("Escape"); expect(map.scroll).toBe(top);
  });
  it("removes an objective overlay when its parent flight is left", () => {
    const { map, flight, press } = fixture(); press("o"); expect(map.info).toBeDefined(); flight.onSceneLeave(); expect(map.info).toBeUndefined();
  });
  it("does not start travel toward a replacement for a removed contact in the same frame", () => {
    const { sys, map, flight, wrecks, press } = fixture(); wrecks(); map.selected = "wreck:test-10";
    sys.wrecks = sys.wrecks.filter(w => w.id !== "test-10"); press("a");
    expect(map.selected).toBe("wreck:test-11"); expect(flight.localTarget).toBeNull(); expect(flight.autopilot).toBe(false);
  });

});
