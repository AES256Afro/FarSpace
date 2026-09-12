import { afterEach, describe, expect, it, vi } from "vitest";
import { Game } from "../src/game";
import { StationScene } from "../src/scenes/station";
import { generateWorld, type Mission } from "../src/world";
import { HULLS } from "../src/data/hulls";
import { MODULES } from "../src/data/modules";
import { COMMODITIES } from "../src/data/data";
import { updateVoyageSystems } from "../src/core/runtime";
import { workshop } from "../src/core/workshop";
import * as wire from "../src/core/wire";

function fixture(tab = 0) {
  vi.useFakeTimers(); vi.spyOn(wire, "post").mockResolvedValue(undefined);
  const world = generateWorld(418), p = world.player, st = world.systems[p.systemId].stations[0], station = new StationScene(), keys = new Set<string>();
  p.dockedAt = st.id; p.dockVisit = { stationId: st.id, startedAt: 0, settled: true }; p.tutorial = -1; p.crew = []; p.missions = []; p.cargo = {}; p.credits = 50000; p.cargoMax = 300;
  station.station = st; station.tab = tab; station.visit = p.dockVisit; station.visitWorld = world; station.goalFetched = Date.now();
  const g = Object.assign(Object.create(Game.prototype), { world, sceneName: "station", scene: station, frontend: false, scenes: { station, stationwalk: { enter: vi.fn() }, flight: { enter: vi.fn(), resumeNext: false }, workshop: { enter: vi.fn() } },
    input: { wasPressed: (k: string) => keys.has(k), isDown: (k: string) => keys.has(k), mousePressed: false, mouseRightPressed: false, mouseX: -1, mouseY: -1, wheel: 0, flush: () => keys.clear(), down: new Set() },
    toast: vi.fn(), showHint: vi.fn(), autosave: vi.fn(), save: vi.fn(), spriteCache: new Map(), sprite: () => ({ width: 20, height: 20 }), stationSprite: vi.fn(), portrait: vi.fn(),
  }) as Game;
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true }) as CanvasRenderingContext2D;
  const press = (key: string) => { keys.add(key); station.update(g, 0); keys.clear(); };
  const click = (x: number, y: number, right = false) => { Object.assign(g.input, { mouseX: x, mouseY: y, mousePressed: !right, mouseRightPressed: right }); station.update(g, 0); g.input.mousePressed = false; g.input.mouseRightPressed = false; };
  const draw = () => station.draw(g, ctx);
  const mission = (i: number): Mission => ({ id: `offer-${i}`, title: `MISSION ${i}`, desc: "DELIVERY TERMS ".repeat(100) + `FINAL ${i}`, kind: "delivery", commodityId: "food", qty: 1, fromStationId: st.id, targetStationId: st.id, targetSystemId: p.systemId, reward: 200, accepted: false, done: false });
  return { g, p, st, world, station, keys, press, click, draw, ctx, mission };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("station list identity", () => {
  it("keeps a carried rare selected across new stock and requires fresh input after its removal", () => {
    const f = fixture(), rare = COMMODITIES.filter(c => c.rare); f.st.prices = {}; f.st.stock = {}; f.p.cargo = Object.fromEntries(rare.slice(0, 3).map(c => [c.id, 2]));
    f.station.cursor = 1; f.draw(); const selected = f.station.list.view.selected;
    f.st.prices.food = 20; f.st.stock.food = 9; f.station.update(f.g, 0); expect(f.station.list.view.selected).toBe(selected);
    delete f.p.cargo[selected!]; const before = JSON.stringify(f.p.cargo), credits = f.p.credits; f.press("s"); expect(JSON.stringify(f.p.cargo)).toBe(before); expect(f.p.credits).toBe(credits);
    f.press("s"); expect(f.p.credits).toBeGreaterThan(credits);
  });
  it("resolves a drawn rare row by identity after insertion and never trades from either mouse button", () => {
    const f = fixture(), rare = COMMODITIES.find(c => c.rare)!; f.st.prices = {}; f.st.stock = {}; f.p.cargo = { [rare.id]: 3 }; f.draw(); const y = f.station.rowBoxes[0][0] + 3;
    f.st.prices.food = 20; f.st.stock.food = 9; f.click(80, y); expect(f.station.list.view.selected).toBe(rare.id); f.click(80, y, true); expect(f.p.cargo[rare.id]).toBe(3);
    f.click(280, 250); expect(f.p.cargo[rare.id]).toBe(2); expect(f.p.cargo.food).toBeUndefined();
  });
  it("keeps the same yard action as quantities change and guards the next module after fitting", () => {
    const f = fixture(1); f.p.fuel = 10; f.p.fuelMax = 100; f.station.cursor = f.station.shipyardOptions(f.g).findIndex(o => o.id === "refuel"); f.draw();
    f.p.fuel = 20; f.press("Enter"); expect(f.p.fuel).toBe(100); expect(f.station.list.view.selected).toBe("refuel");
    f.station.cursor = f.station.shipyardOptions(f.g).findIndex(o => o.id === `module:${MODULES[0].id}`); f.draw(); f.press("Enter");
    expect(f.p.modules).toContain(MODULES[0].id); const credits = f.p.credits, modules = [...f.p.modules!]; f.press("Enter"); expect(f.p.modules).toEqual(modules); expect(f.p.credits).toBe(credits);
  });
  it("keeps duplicate named hulls distinct and follows the drawn owned ship after fleet insertion", () => {
    const f = fixture(2); f.p.fleet = Array.from({ length: 12 }, (_, i) => ({ hullId: "scout", name: "SAME NAME", stationId: f.st.id, hull: 60 + i, torpedoes: i }));
    f.station.cursor = HULLS.length + 10; f.draw(); const target = f.p.fleet[10], y = f.station.rowBoxes[f.station.cursor][0] + 3;
    f.p.fleet.unshift({ ...target, hull: 99 }); f.click(60, y); expect(f.station.shipRows(f.g)[f.station.cursor]).toMatchObject({ ship: target });
    const swap = vi.spyOn(f.station, "swapShip").mockImplementation(() => {}); f.click(40, 250); expect(swap).toHaveBeenCalledWith(f.g, target);
  });
  it("does not board an adjacent ship when the selected hull disappears", () => {
    const f = fixture(2); f.p.fleet = [1, 2].map(i => ({ hullId: "scout", name: `SHIP ${i}`, stationId: f.st.id, hull: 80, torpedoes: i }));
    f.station.cursor = HULLS.length; f.draw(); const swap = vi.spyOn(f.station, "swapShip").mockImplementation(() => {}); f.p.fleet.shift(); f.press("Enter"); expect(swap).not.toHaveBeenCalled(); f.press("Enter"); expect(swap).toHaveBeenCalledWith(f.g, f.p.fleet[0]);
  });
  it("retains the same stored good when loading inserts a held row before several stored goods", () => {
    const f = fixture(7); f.p.storage[f.st.id] = { food: 5, med: 5, water: 5 }; f.station.cursor = 1; f.draw(); f.press("Enter"); f.press("Enter");
    expect(f.p.cargo).toEqual({ med: 2 }); expect(f.p.storage[f.st.id]).toEqual({ food: 5, med: 3, water: 5 }); expect(f.station.list.view.selected).toBe("stored:med");
  });
  it("selects the mission description row without accepting it and keeps market row bounds separate", () => {
    const f = fixture(3); f.station.boardMissions = [f.mission(0), f.mission(1)]; f.draw();
    const y = f.station.rowBoxes[1][0] + 12; f.click(100, y); expect(f.station.cursor).toBe(1); expect(f.p.missions).toEqual([]);
    f.station.tab = 0; f.draw(); const rows = f.station.rowBoxes.filter(([a]) => Number.isFinite(a));
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1][1]).toBeLessThanOrEqual(rows[i][0]);
  });
  it("retains the same mission when a deliverable is inserted ahead and ignores a removed posting", () => {
    const f = fixture(3); f.station.boardMissions = [f.mission(0), f.mission(1), f.mission(2)]; f.station.cursor = 1; f.draw();
    f.p.cargo.food = 1; f.p.missions = [{ ...f.mission(9), accepted: true }]; f.station.update(f.g, 0); expect(f.station.list.view.selected).toBe("accept:offer-1");
    f.station.boardMissions[1].done = true; f.press("Enter"); expect(f.p.missions.map(m => m.id)).toEqual(["offer-9"]); expect(f.station.list.view.selected).toBe("accept:offer-2");
  });
  it("keeps a crew candidate through patron insertion and pays only for that person", () => {
    const f = fixture(4); f.st.barPatrons = []; f.station.fares = []; f.station.candidates = [0, 1].map(i => ({ name: `CREW ${i}`, role: "pilot", skill: 1, wage: 40, morale: 70 }));
    f.station.cursor = 1; f.draw(); f.st.barPatrons.unshift("NEW CAPTAIN"); f.press("Enter"); expect(f.p.crew[0].name).toBe("CREW 1"); expect(f.p.credits).toBe(49880); expect(f.station.candidates[0].name).toBe("CREW 0");
  });
});

for (const tab of [0, 1, 2, 3, 4, 6, 7, 8]) describe(`station tab ${tab} navigation`, () => {
  it("supports pages and Home/End with a stable visible selection and full details", () => {
    const f = fixture(tab); f.p.cargo = Object.fromEntries(COMMODITIES.map(c => [c.id, 2])); f.p.storage[f.st.id] = { food: 2 };
    f.station.boardMissions = Array.from({ length: 18 }, (_, i) => f.mission(i)); f.station.candidates = Array.from({ length: 14 }, (_, i) => ({ name: `LONG CREW NAME ${i}`, role: "pilot", skill: 1, wage: 40, morale: 70, trait: "COMPLETE CREW TERMS ".repeat(100) }));
    if (tab === 8) vi.spyOn(f.station, "baseRows").mockReturnValue(Array.from({ length: 25 }, (_, i) => ({ kind: "deposit", id: `test-${i}`, label: `BASE ${i}`, sub: "FULL BASE TERMS ".repeat(100) })));
    f.draw(); f.press("PageDown"); expect(f.station.cursor).toBe(Math.min(f.station.list.view.pageSize, f.station.list.view.keys.length - 1));
    f.press("End"); const index = f.station.cursor, offset = f.station.list.view.offset; expect(index).toBe(f.station.list.view.keys.length - 1); f.draw();
    if (tab !== 8) expect(f.station.rowBoxes[index][0]).toBeLessThan(223);
    const before = JSON.stringify(f.world); f.press("i"); expect(f.station.info).toBeDefined(); f.press("End"); f.press("Escape"); expect(f.station.cursor).toBe(index); expect(f.station.list.view.offset).toBe(offset); expect(JSON.stringify(f.world)).toBe(before);
    f.press("Home"); expect(f.station.cursor).toBe(0);
  });
});

describe("base action viewport", () => {
  it("draws the last base action with its original identity without sending a request", () => {
    const f = fixture(8); vi.spyOn(wire, "getSquadron").mockReturnValue("TEST"); f.world.syndicates = [];
    f.station.baseLoaded = true; f.station.base = { stationId: f.st.id, stationName: f.st.name, systemName: "SYSTEM", treasury: 100, vault: {}, upgrades: [], founded: 0, log: [] };
    const rows = Array.from({ length: 25 }, (_, i) => ({ kind: "deposit" as const, id: `good-${i}`, label: `GOOD ${i}`, sub: `FULL TERMS ${i}` }));
    vi.spyOn(f.station, "baseRows").mockReturnValue(rows); const send = vi.spyOn(wire, "baseAction").mockResolvedValue(null);
    f.press("End"); f.draw(); expect(f.station.cursor).toBe(24); expect(f.station.rowBoxes[24][0]).toBeGreaterThan(56); expect(f.station.rowBoxes[24][1]).toBeLessThan(175);
    f.press("i"); expect(f.station.info!.sections[0][1][0]).toBe("FULL TERMS 24"); expect(send).not.toHaveBeenCalled();
  });
});

describe("station readers and shortcut ownership", () => {
  it("reads the entire selected mission and lounge reply without advancing production or school", () => {
    const f = fixture(3); f.station.boardMissions = [f.mission(0)]; f.p.tutorial = 2; workshop(f.p).queue = [{ recipe: "parts", remaining: 1, progress: 0 }];
    f.press("i"); expect(f.station.info!.sections[0][1].join(" ")).toContain("FINAL 0"); const before = JSON.stringify(f.world); f.keys.add("k"); updateVoyageSystems(f.g, 10); f.keys.clear(); expect(JSON.stringify(f.world)).toBe(before);
    f.press("Escape"); expect(f.station.pausesVoyage).toBe(false); f.station.tab = 4; f.station.barLine = "REPLY ".repeat(500) + "LAST REPLY"; f.press("o"); expect(f.station.info!.sections[0][1][0]).toContain("LAST REPLY");
  });
  it("cleans a pending reader and resets selection on a replaced world", () => {
    const f = fixture(1); f.press("End"); f.press("i"); const clean = vi.fn(); f.station.info!.closeSearchBox = clean; f.g.setScene("stationwalk"); expect(clean).toHaveBeenCalledOnce();
    const world = generateWorld(419), st = world.systems[world.player.systemId].stations[0]; world.player.dockedAt = st.id; world.player.dockVisit = { stationId: st.id, startedAt: 0, settled: true, portAudiencePending: false }; f.g.world = world;
    vi.spyOn(f.station, "loadPortData").mockImplementation(() => {}); f.g.setScene("station"); expect(f.station.cursor).toBe(0); expect(f.station.list.tab).toBe(-1);
  });
  it("opens the guestbook with P on Record and walks the deck from other tabs", () => {
    const f = fixture(11); f.press("p"); expect(f.g.sceneName).toBe("station"); expect(f.station.recordView).toBe("guestbook"); f.press("p"); expect(f.station.recordView).toBe("achievements");
    f.station.tab = 0; f.press("p"); expect(f.g.sceneName).toBe("stationwalk");
  });
  it("keeps Workshop clicks within the drawn rectangle", () => {
    const f = fixture(); for (const [x, y] of [[299, 230], [474, 230], [490, 230], [320, 242]]) f.click(x, y);
    expect(f.g.scenes.workshop.enter).not.toHaveBeenCalled(); f.click(310, 234); expect(f.g.scenes.workshop.enter).toHaveBeenCalledOnce();
  });
  it("does not trade from information, margins, row clicks or a right click", () => {
    const f = fixture(); f.draw(); const before = JSON.stringify(f.p);
    for (const [x, y] of [[3, 70], [477, 70], [20, 55], [50, 210], [90, 70]]) f.click(x, y); f.click(90, 70, true); expect(JSON.stringify(f.p)).toBe(before);
  });
  it("does not buy a station share with I and gives V its explicit action", () => {
    const f = fixture(); f.st.military = false; f.draw(); const before = f.p.credits; f.press("i"); expect(f.p.credits).toBe(before); f.press("Escape"); f.press("v"); expect(f.p.credits).toBeLessThan(before); expect(f.p.stakes?.[f.st.id]).toBe(1);
  });
  it("does not interpret the flight school skip key as a hull purchase", () => {
    const f = fixture(2); f.p.tutorial = 2; const buy = vi.spyOn(f.station, "buyHull").mockImplementation(() => {}); f.press("k"); expect(buy).not.toHaveBeenCalled();
  });
});
