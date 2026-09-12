import { describe, expect, it, vi } from "vitest";
import { Game } from "../src/game";
import { generateWorld, genCrewCandidate, type Mission, type Poi } from "../src/world";
import { COMMODITIES } from "../src/data/data";
import { hull } from "../src/data/hulls";
import { RNG } from "../src/core/rng";
import { CityScene } from "../src/scenes/city";
import { OutpostScene } from "../src/scenes/outpost";
import { EncounterScene } from "../src/scenes/encounter";

function fixture(kind: "city" | "outpost" = "city") {
  const world = generateWorld(418), p = world.player, keys = new Set<string>();
  p.story = 0; p.story2 = -1; p.story3 = -1; p.missions = []; p.crew = []; p.tutorial = -1; p.cargo = {}; p.credits = 10000; p.ledger = {};
  const surf = world.systems[p.systemId].planets[0].surface!;
  const poi: Poi = { id: "test-city", name: "TEST PORT", kind, lat: 0, lon: 0, regionIdx: 0, landable: true, surveyed: false };
  surf.pois.push(poi); surf.regions[0].factionId = null;
  const scene = kind === "city" ? new CityScene() : new OutpostScene();
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true }) as CanvasRenderingContext2D;
  const g = { world, sceneName: kind, orbitPlanetIdx: 0, landedPoiId: poi.id, settingsReturn: "station", input: { wasPressed: (key: string) => keys.has(key), isDown: () => false, mousePressed: false, mouseX: 0, mouseY: 0, wheel: 0, flush: vi.fn(), down: new Set() }, toast: vi.fn(), showHint: vi.fn(), setScene: vi.fn(), save: vi.fn(), autosave: vi.fn() } as unknown as Game;
  scene.enter(g);
  const rows = COMMODITIES.slice(0, 20).map((c, i) => ({ id: c.id, buy: 10 + i, sell: 5 + i }));
  const setRows = (items: typeof rows) => { if (scene instanceof CityScene) scene.rows = items; else scene.trade.rows = items; };
  setRows(rows);
  if (scene instanceof CityScene) scene.panel = "market"; else scene.trade.open = true;
  scene.update(g, .05); scene.market.view.select(0);
  const draw = () => scene.draw(g, ctx);
  const press = (key: string) => { keys.add(key); scene.update(g, .05); keys.clear(); };
  const click = (x: number, y: number) => { Object.assign(g.input, { mousePressed: true, mouseX: x, mouseY: y }); scene.update(g, .05); g.input.mousePressed = false; };
  return { g, p, poi, scene, rows, setRows, keys, press, click, draw };
}

for (const kind of ["city", "outpost"] as const) describe(`${kind} trade desk`, () => {
  it("reaches all goods with paging and wheel, despite a parked pointer", () => {
    const { g, scene, press, draw } = fixture(kind); draw(); Object.assign(g.input, { mouseX: 60, mouseY: 75 });
    press("PageDown"); expect(scene.market.view.index).toBe(6); expect(scene.market.view.offset).toBe(6);
    scene.update(g, .05); expect(scene.market.view.index).toBe(6);
    g.input.wheel = 1; scene.update(g, .05); g.input.wheel = 0; expect(scene.market.view.index).toBe(9);
    press("End"); expect(scene.market.view.selected).toBe(COMMODITIES[19].id); expect(scene.market.view.end).toBe(20);
    press("Home"); expect(scene.market.view.index).toBe(0);
  });
  it("keeps headers, margins, empty space and row clicks free of transactions", () => {
    const { scene, p, click, draw } = fixture(kind); draw();
    for (const [x, y] of [[30, 75], [435, 75], [60, 62], [60, 191], [60, 242]]) click(x, y);
    expect(scene.market.view.index).toBe(0); expect(p.credits).toBe(10000);
    click(60, 95); expect(scene.market.view.index).toBe(1); expect(p.cargo).toEqual({});
    click(60, 223); expect(p.cargo.metals).toBe(1); expect(p.credits).toBe(9989);
  });
  it("keeps the selected good and visible row identity across insertions", () => {
    const { scene, g, rows, press, draw, click, setRows } = fixture(kind); press("PageDown"); draw();
    const selected = rows[6].id, top = rows[6].id;
    setRows([{ id: COMMODITIES[20].id, buy: 3, sell: 2 }, ...rows]);
    scene.update(g, .05); expect(scene.market.view.selected).toBe(selected); expect(scene.market.view.keys[scene.market.view.offset]).toBe(top);
    click(60, 75); expect(scene.market.view.selected).toBe(top);
  });
  it("requires a new action after removal of the selected good", () => {
    const { scene, p, rows, setRows, press } = fixture(kind); press("PageDown"); setRows(rows.filter((_, i) => i !== 6));
    press("Enter"); expect(scene.market.view.selected).toBe(rows[7].id); expect(p.cargo).toEqual({});
    press("Enter"); expect(p.cargo[rows[7].id]).toBe(1);
  });
  it("settles one unit once and retains cargo and credits when a limit prevents trading", () => {
    const { g, p, press, click } = fixture(kind);
    p.credits = 9; press("Enter"); expect(p.cargo).toEqual({}); expect(p.credits).toBe(9);
    p.credits = 100; p.cargoMax = 0; press("Enter"); expect(p.cargo).toEqual({}); expect(p.credits).toBe(100);
    p.cargoMax = 1; press("b"); expect(p.cargo.ore).toBe(1); expect(p.credits).toBe(90);
    click(190, 223); expect(p.cargo.ore ?? 0).toBe(0); expect(p.credits).toBe(95);
    press("s"); expect(p.credits).toBe(95); expect(g.autosave).toHaveBeenCalledTimes(2); expect(p.ledger!.settlements).toBe(-5);
  });
  it("handles an empty desk without invalid selection or transactions", () => {
    const { scene, p, setRows, press, draw } = fixture(kind); setRows([]);
    for (const key of ["ArrowDown", "End", "PageDown", "Enter", "b", "s", "i"]) press(key);
    expect(scene.market.view.index).toBe(0); expect(p.credits).toBe(10000); expect(() => draw()).not.toThrow();
  });
  it("returns from full details to the same desk without replaying arrival effects", () => {
    const { scene, g, p, press, poi } = fixture(kind); press("End"); const chosen = scene.market.view.selected;
    poi.projects = ["chapel"]; p.crew = [genCrewCandidate(new RNG(12))]; p.crew[0].morale = 50;
    const before = JSON.stringify(g.world); press("i"); expect(scene.info?.sections[0][0]).toBe(COMMODITIES[19].name); expect(scene.touchMode).toBe("menu");
    press("Escape"); expect(scene.info).toBeUndefined(); expect(scene.market.view.selected).toBe(chosen); expect(JSON.stringify(g.world)).toBe(before); expect(g.setScene).not.toHaveBeenCalled();
    press("Escape"); expect(scene.touchMode).toBe("walk"); expect(g.setScene).not.toHaveBeenCalled();
    g.surfaceReturn = true; press("Escape"); expect(g.setScene).toHaveBeenCalledWith("surface"); expect(g.settingsReturn).toBe("station");
  });
});

describe("city recruitment and contracts", () => {
  it("hires the selected person on the last page and selects their adjacent replacement", () => {
    const { scene: base, g, p, press, draw, click } = fixture(), scene = base as CityScene;
    scene.panel = "bar"; scene.candidates = Array.from({ length: 15 }, (_, i) => ({ ...genCrewCandidate(new RNG(i)), name: `CREW ${i}` }));
    press("End"); const candidate = scene.candidates[14]; draw(); click(60, 223);
    expect(p.crew[0].name).toBe(candidate.name); expect(p.credits).toBe(10000 - candidate.wage * 3); expect(scene.bar.view.selected?.name).toBe("CREW 13"); expect(g.autosave).toHaveBeenCalledOnce();
  });
  it("respects reserved leave berths and insufficient signing funds", () => {
    const { scene: base, p, press, g } = fixture(), scene = base as CityScene;
    scene.panel = "bar"; const candidate = scene.candidates[0];
    p.shoreCrew = Array.from({ length: hull(p.hullId).crewSlots }, () => ({ member: { ...candidate }, stationId: "home", docks: 0 }));
    press("Enter"); expect(p.crew).toHaveLength(0); expect(p.credits).toBe(10000);
    p.shoreCrew = []; p.credits = 0; press("Enter"); expect(p.crew).toHaveLength(0); expect(g.autosave).not.toHaveBeenCalled();
  });
  it("keeps duplicate crew names distinct and blocks hiring after removal in the input frame", () => {
    const { scene: base, g, p, press } = fixture(), scene = base as CityScene;
    scene.panel = "bar"; scene.candidates = Array.from({ length: 10 }, (_, i) => ({ ...genCrewCandidate(new RNG(i)), name: "Ari Sen" }));
    press("PageDown"); const chosen = scene.bar.view.selected!; scene.candidates.unshift({ ...chosen }); scene.update(g, .05); expect(scene.bar.view.selected).toBe(chosen);
    scene.candidates = scene.candidates.filter(c => c !== chosen); press("Enter"); expect(p.crew).toHaveLength(0);
  });
  it("reads complete contract text and accepts the actual last contract without moving the caller", () => {
    const { scene: base, p, press, g, poi } = fixture(), scene = base as CityScene;
    scene.panel = "board"; scene.board = Array.from({ length: 15 }, (_, i) => ({ id: `job-${i}`, title: `JOB ${i}`, desc: "DETAIL ".repeat(200) + `FINAL ${i}`, kind: "bounty", fromStationId: poi.id, reward: 100, accepted: false, done: false } as Mission));
    press("End"); press("i"); expect(scene.info?.sections[0][1].join(" ")).toContain("FINAL 14"); press("Escape"); expect(scene.contracts.view.index).toBe(14); expect(g.setScene).not.toHaveBeenCalled();
    press("Enter"); expect(p.missions[0].id).toBe("job-14"); expect(scene.contracts.view.selected).toBe("accept:job-13");
  });
  it("pays and removes delivery goods once, even when the board becomes empty", () => {
    const { scene: base, p, press, poi, g, draw } = fixture(), scene = base as CityScene;
    scene.panel = "board"; scene.board = []; p.cargo = { ore: 2 };
    const mission = { id: "delivery", title: "ORE", desc: "Bring two ore", kind: "mining", fromStationId: poi.id, targetStationId: poi.id, reward: 100, commodityId: "ore", qty: 2, accepted: true, done: false } as Mission;
    p.missions = [mission]; press("Enter"); expect(p.cargo.ore ?? 0).toBe(0); expect(p.credits).toBe(10100); expect(p.missions).toHaveLength(0);
    press("Enter"); expect(p.credits).toBe(10100); expect(g.autosave).toHaveBeenCalledOnce(); expect(() => draw()).not.toThrow();
  });
  it("retains offered contracts when the mission log is full", () => {
    const { scene: base, p, press, poi, g } = fixture(), scene = base as CityScene;
    scene.panel = "board"; scene.board = [{ id: "offer", title: "OFFER", desc: "", kind: "bounty", fromStationId: poi.id, reward: 100, accepted: false, done: false } as Mission];
    p.missions = Array.from({ length: 5 }, (_, i) => ({ ...scene.board[0], id: `active-${i}`, accepted: true }));
    press("Enter"); expect(p.missions).toHaveLength(5); expect(scene.board[0].accepted).toBe(false); expect(g.autosave).not.toHaveBeenCalled();
  });
});

it("outpost buying restrictions and wanted goods retain their settlement effects", () => {
  const { scene: base, p, poi, setRows, press } = fixture("outpost"), scene = base as OutpostScene;
  setRows([{ id: "food", buy: 0, sell: 30 }]); scene.needs = ["food"]; p.cargo = { food: 1 }; poi.growth = 0;
  press("Enter"); expect(p.credits).toBe(10000); expect(p.cargo.food).toBe(1);
  press("s"); expect(p.credits).toBe(10030); expect(p.cargo.food ?? 0).toBe(0); expect(poi.growth).toBe(6); expect(p.ledger!.settlements).toBe(30);
});

it("city contract removal requires a fresh action and stale row clicks resolve displayed identity", () => {
  const { scene: base, p, press, poi, draw, click } = fixture(), scene = base as CityScene;
  scene.panel = "board"; scene.board = Array.from({ length: 15 }, (_, i) => ({ id: `job-${i}`, title: `JOB ${i}`, desc: "", kind: "bounty", fromStationId: poi.id, reward: 100, accepted: false, done: false } as Mission));
  press("PageDown"); draw(); const shown = scene.board[6];
  scene.board.unshift({ ...shown, id: "inserted" }); click(60, 75); expect(scene.contracts.view.selected).toBe(`accept:${shown.id}`); expect(p.missions).toHaveLength(0);
  scene.board = scene.board.filter(m => m !== shown); press("Enter"); expect(p.missions).toHaveLength(0); expect(scene.contracts.view.selected).toBe("accept:job-7");
  press("Enter"); expect(p.missions[0].id).toBe("job-7");
});

it("empty cantina actions are inert and preserve the city caller", () => {
  const { scene: base, p, press, draw, g } = fixture(), scene = base as CityScene;
  scene.panel = "bar"; scene.candidates = [];
  for (const key of ["End", "PageDown", "ArrowUp", "Enter", "i"]) press(key);
  expect(scene.bar.view.index).toBe(0); expect(p.crew).toHaveLength(0); expect(g.autosave).not.toHaveBeenCalled(); expect(() => draw()).not.toThrow();
  press("Escape"); expect(scene.panel).toBe("none"); expect(g.setScene).not.toHaveBeenCalled();
});

it("desk input applies only one trade when buy and sell arrive together", () => {
  const { keys, scene, g, p } = fixture(); keys.add("b"); keys.add("s"); scene.update(g, .05);
  expect(p.cargo.ore).toBe(1); expect(p.credits).toBe(9990); expect(g.autosave).toHaveBeenCalledOnce();
});

function foremanFixture() {
  const f = fixture("outpost"), scene = f.scene as OutpostScene, encounter = new EncounterScene();
  Object.assign(f.g, { scene, scenes: { outpost: scene, encounter, repair: { enter: vi.fn() } }, setScene: Game.prototype.setScene });
  scene.trade.open = false; scene.px = 123; scene.py = 54; f.poi.projects = ["chapel"];
  f.p.crew = [genCrewCandidate(new RNG(1))]; f.p.crew[0].morale = 50; f.p.oxygen = 8;
  return { ...f, scene, encounter };
}
it("foreman return keeps the walk position and does not repeat arrival benefits", () => {
  const { scene, g, p, encounter } = foremanFixture();
  scene.foreman(g); expect(g.sceneName).toBe("encounter"); encounter.back(g);
  expect(g.sceneName).toBe("outpost"); expect([scene.px, scene.py]).toEqual([123, 54]); expect(p.crew[0].morale).toBe(50); expect(p.oxygen).toBe(8);
  scene.foreman(g); encounter.back(g); expect(p.crew[0].morale).toBe(50);
});
it("foreman return refreshes constructed facilities while retaining the selected good", () => {
  const { scene, g, poi, encounter } = foremanFixture();
  scene.market.view.select(scene.market.view.keys.indexOf("parts")); scene.foreman(g); poi.projects!.push("pad"); encounter.back(g);
  expect(scene.trade.rows.some(r => r.id === "water")).toBe(true); expect(scene.market.view.selected).toBe("parts"); expect([scene.px, scene.py]).toEqual([123, 54]);
});
it("plant repair return pays once and keeps arrival effects from repeating", () => {
  vi.useFakeTimers();
  try {
    const { scene, g, p, encounter } = foremanFixture(); scene.foreman(g);
    encounter.enc.options.find(option => option.label.startsWith("FIX THE PLANT"))!.result(g, new RNG(1)); encounter.back(g);
    vi.runOnlyPendingTimers(); expect(g.sceneName).toBe("repair"); const mission = g.tenderMission!; mission.tenderDone = true;
    g.setScene("outpost"); expect(mission.done).toBe(true); expect(p.credits).toBe(10400); expect(p.crew[0].morale).toBe(50); expect(p.oxygen).toBe(8); expect([scene.px, scene.py]).toEqual([123, 54]);
    scene.foreman(g); encounter.back(g); expect(p.credits).toBe(10400);
  } finally { vi.useRealTimers(); }
});
it("a queued plant repair cannot reopen after the player loads another world", () => {
  vi.useFakeTimers();
  try {
    const { scene, g, encounter } = foremanFixture(); scene.foreman(g);
    encounter.enc.options.find(option => option.label.startsWith("FIX THE PLANT"))!.result(g, new RNG(1)); encounter.back(g);
    g.world = generateWorld(419); g.sceneName = "flight"; vi.runOnlyPendingTimers(); expect(g.sceneName).toBe("flight"); expect(scene.resumeNext).toBe(false);
  } finally { vi.useRealTimers(); }
});
