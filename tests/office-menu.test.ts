import { afterEach, describe, expect, it, vi } from "vitest";
import { Game } from "../src/game";
import { generateWorld, type Mission } from "../src/world";
import { ServiceScene } from "../src/scenes/service";
import { CouncilScene } from "../src/scenes/council";
import { ServiceFileScene } from "../src/scenes/servicefile";
import { EncounterScene } from "../src/scenes/encounter";
import type { OfficeAction } from "../src/scenes/officemenu";
import { serviceOffers } from "../src/core/service";
import { borrowServiceCutter } from "../src/core/serviceloan";
import { takeCouncilSeat } from "../src/core/council";
import { RNG } from "../src/core/rng";

function fixture(kind: "service" | "council" = "service") {
  const world = generateWorld(410), p = world.player, st = world.systems[p.systemId].stations[0], keys = new Set<string>();
  st.military = kind === "service"; st.type = "mining"; st.factionId = "fdm";
  p.dockedAt = st.id; p.tutorial = -1; p.crew = []; p.cargo = {}; p.credits = 1000; p.missions = []; p.beltStanding = 5; (p.flags ??= {}).freeman = true; p.rep.fdm = 20;
  p.service = { factionId: "fdm", stationId: st.id, joinedAt: 0, serial: 3, completed: 3, history: [] };
  const scene = kind === "service" ? new ServiceScene() : new CouncilScene(), file = new ServiceFileScene(), encounter = new EncounterScene();
  const g = Object.assign(Object.create(Game.prototype), { world, sceneName: kind, scene, scenes: { [kind]: scene, servicefile: file, encounter, stationwalk: { enter: vi.fn(), px: 0, py: 0 }, station: { enter: vi.fn() } }, settingsReturn: "station", spriteCache: new Map(),
    input: { wasPressed: (key: string) => keys.has(key), isDown: () => false, mousePressed: false, mouseX: 0, mouseY: 0, wheel: 0, flush: vi.fn(), down: new Set() }, autosave: vi.fn(), save: vi.fn(), load: vi.fn(), toast: vi.fn(), showHint: vi.fn(),
  }) as Game;
  g.setScene(kind);
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true }) as CanvasRenderingContext2D;
  const press = (key: string) => { keys.add(key); g.scene.update(g, .05); keys.clear(); };
  const click = (x: number, y: number) => { Object.assign(g.input, { mousePressed: true, mouseX: x, mouseY: y }); g.scene.update(g, .05); g.input.mousePressed = false; };
  const draw = () => g.scene.draw(g, ctx);
  return { world, p, st, scene, file, encounter, g, keys, press, click, draw };
}
function many(kind: "service" | "council") {
  const f = fixture(kind);
  let rows: OfficeAction[] = Array.from({ length: 18 }, (_, i) => ({ id: `action-${i}`, label: `ACTION ${i}`, detail: `DETAIL ${i} ` + "LONG REQUIREMENT ".repeat(100) + `FINAL ${i}`, run: vi.fn(() => `RESULT ${i}`) }));
  vi.spyOn(f.scene, "actions").mockImplementation(() => rows);
  f.scene.menu.view.sync([]); f.scene.update(f.g, .05);
  return { ...f, get rows() { return rows; }, setRows: (next: OfficeAction[]) => { rows = next; } };
}
afterEach(() => vi.restoreAllMocks());

for (const kind of ["service", "council"] as const) describe(`${kind} office list`, () => {
  it("pages every action without hover stealing keyboard selection", () => {
    const { scene, g, press, draw, click } = many(kind); draw(); click(245, 50); press("PageDown"); expect(scene.menu.view.index).toBe(6); expect(scene.menu.view.offset).toBe(6);
    scene.update(g, .05); expect(scene.menu.view.index).toBe(6);
    g.input.wheel = 1; scene.update(g, .05); g.input.wheel = 0; expect(scene.menu.view.index).toBe(9);
    press("End"); expect(scene.menu.view.selected).toBe("action-17"); expect(scene.menu.view.end).toBe(18); press("Home"); expect(scene.menu.view.index).toBe(0);
  });
  it("keeps row clicks, headers and margins free of actions", () => {
    const { rows, click, draw, scene } = many(kind); draw();
    for (const [x, y] of [[229, 60], [469, 60], [250, 40], [245, 188], [250, 237]]) click(x, y);
    click(250, 74); expect(scene.menu.view.selected).toBe("action-1"); expect(rows.every(r => !(r.run as ReturnType<typeof vi.fn>).mock.calls.length)).toBe(true);
    click(250, 220); expect(rows[1].run).toHaveBeenCalledOnce(); expect(scene.menu.view.selected).toBe("action-1");
  });
  it("resolves the drawn row after insertion and waits after selected removal", () => {
    const f = many(kind); f.press("PageDown"); f.draw(); const selected = f.rows[6];
    f.setRows([{ ...selected, id: "new", run: vi.fn() }, ...f.rows]); f.click(250, 50); expect(f.scene.menu.view.selected).toBe(selected.id); expect(selected.run).not.toHaveBeenCalled();
    f.setRows(f.rows.filter(r => r !== selected)); f.press("Enter"); expect(f.scene.menu.view.selected).toBe("action-7"); expect(f.rows.find(r => r.id === "action-7")!.run).not.toHaveBeenCalled();
    f.press("Enter"); expect(f.rows.find(r => r.id === "action-7")!.run).toHaveBeenCalledOnce();
  });
  it("reads complete selected terms and full reply without changing world or position", () => {
    const { scene, g, world, press } = many(kind); press("End"); const offset = scene.menu.view.offset;
    scene.lastReply = "REPLY ".repeat(300) + "LAST WORD"; const before = JSON.stringify(world), time = scene.time;
    press("i"); expect(scene.info?.sections[0][1].join(" ")).toContain("FINAL 17"); press("End"); press("Escape");
    expect(scene.menu.view.selected).toBe("action-17"); expect(scene.menu.view.offset).toBe(offset); expect(scene.time).toBe(time + .05);
    press("o"); expect(scene.info?.sections.at(-1)?.[1][0]).toContain("LAST WORD"); press("Escape");
    expect(g.sceneName).toBe(kind); expect(g.settingsReturn).toBe("station"); expect(JSON.stringify(world)).toBe(before); expect(g.autosave).not.toHaveBeenCalled();
  });
  it("handles empty actions and leaves through the correct promenade position", () => {
    const { setRows, press, click, draw, g, scene } = many(kind); setRows([]);
    for (const key of ["End", "PageDown", "Enter", "i"]) press(key); click(250, 220); expect(scene.menu.view.index).toBe(0); expect(g.autosave).not.toHaveBeenCalled(); expect(() => draw()).not.toThrow();
    press("Escape"); expect(g.sceneName).toBe("stationwalk"); expect(g.scenes.stationwalk).toMatchObject({ px: 145, py: 35 });
  });
  it("resets stale selection when entering another world and cleans pending readers", () => {
    const { scene, g, press } = many(kind); press("End"); press("i"); const cleanup = vi.fn(); scene.info!.closeSearchBox = cleanup;
    g.setScene("station"); expect(cleanup).toHaveBeenCalledOnce(); expect(scene.info).toBeUndefined();
    const replacement = generateWorld(410); replacement.systems[replacement.player.systemId].stations[0].military = kind === "service"; replacement.systems[replacement.player.systemId].stations[0].type = "mining";
    replacement.player.dockedAt = replacement.systems[replacement.player.systemId].stations[0].id; g.world = replacement; scene.resumeNext = true; g.setScene(kind); expect(scene.menu.view.index).toBe(0); expect(scene.menu.view.offset).toBe(0);
  });
});

describe("office domain returns", () => {
  it("keeps the service file action selected through the actual file reader", () => {
    const { scene: base, g, press, p } = fixture(), scene = base as ServiceScene;
    borrowServiceCutter(g.world); scene.menu.view.sync(scene.actions(g).map(row => row.id)); scene.cursor = scene.actions(g).findIndex(row => row.id === "history");
    const selected = scene.menu.view.selected, offset = scene.scroll, before = JSON.stringify(p);
    press("Enter"); expect(g.sceneName).toBe("servicefile"); press("Escape"); expect(g.sceneName).toBe("service"); expect(scene.menu.view.selected).toBe(selected); expect(scene.scroll).toBe(offset); expect(JSON.stringify(p)).toBe(before); expect(g.autosave).not.toHaveBeenCalled();
  });
  it("keeps the selected service offer after declining a fare conflict conversation", () => {
    const { scene: base, p, g, encounter, press } = fixture(), scene = base as ServiceScene;
    const offer = serviceOffers(g.world, scene.stationId).find(o => o.kind === "patrol")!;
    p.missions = [{ id: "fare", title: "FARE", kind: "passenger", passengerName: "Ari Sen", passengerKind: "regular", targetSystemId: p.systemId, targetStationId: p.dockedAt, accepted: true, done: false, reward: 100 } as Mission];
    scene.menu.view.sync(scene.actions(g).map(row => row.id)); scene.cursor = scene.actions(g).findIndex(row => row.id.startsWith(`offer:${offer.id}:`)); const selected = scene.menu.view.selected;
    press("Enter"); expect(g.sceneName).toBe("encounter"); encounter.enc.options[2].result(g, new RNG(1)); encounter.back(g);
    expect(g.sceneName).toBe("service"); expect(scene.menu.view.selected).toBe(selected); expect(p.service!.order).toBeUndefined(); expect(scene.lastReply).toContain("DID BOOK FIRST");
  });
  it("does not pay twice when a service report action is removed", () => {
    const { scene: base, p, g, press } = fixture(), scene = base as ServiceScene;
    p.service!.order = { ...serviceOffers(g.world, scene.stationId)[0], stage: "return", report: "SIGNED" };
    const reward = p.service!.order.pay; scene.menu.view.sync(scene.actions(g).map(row => row.id)); scene.cursor = scene.actions(g).findIndex(row => row.id.startsWith("report:"));
    press("Enter"); expect(p.credits).toBe(1000 + reward); expect(p.service!.completed).toBe(4); expect(p.service!.order).toBeUndefined();
    press("Enter"); expect(p.credits).toBe(1000 + reward); expect(p.service!.completed).toBe(4);
  });
  it("reads all council minutes and the active reply without voting or collecting expenses", () => {
    const { scene: base, p, world, g, press, st } = fixture("council"), scene = base as CouncilScene;
    takeCouncilSeat(world, st.id); p.council!.ballots = Array.from({ length: 20 }, (_, i) => ({ week: `2026-01-${String(i + 1).padStart(2, "0")}`, stationId: st.id, issueId: "water", choice: 0, resolution: `MINUTE ${i} ` + "FULL TEXT ".repeat(100) }));
    p.council!.mandate = { week: "2026-01-20", fromStationId: st.id, targetStationId: st.id, resolution: "ORIGINAL REQUEST", stage: "return", reply: "OFFICE REPLY ".repeat(200) + "FINAL REPLY" };
    const before = JSON.stringify(world); press("o"); expect(scene.info?.sections.filter(([title]) => title.startsWith("MINUTES:"))).toHaveLength(20); expect(scene.info?.sections.find(([title]) => title === "CURRENT JOURNEY")?.[1].join(" ")).toContain("FINAL REPLY");
    press("Escape"); expect(JSON.stringify(world)).toBe(before); expect(g.autosave).not.toHaveBeenCalled();
  });
  it("keeps the council chair through a cancelled agenda and retains the clerk's reply", () => {
    const { scene: base, g, press, encounter } = fixture("council"), scene = base as CouncilScene;
    press("Enter"); expect(scene.seated).toBe(true); const selected = scene.menu.view.selected;
    press("Enter"); expect(g.sceneName).toBe("encounter"); encounter.enc.options[3].result(g, new RNG(1)); encounter.back(g);
    expect(scene.seated).toBe(true); expect(scene.menu.view.selected).toBe(selected); expect(scene.lastReply).toContain("KETTLE");
  });
});
