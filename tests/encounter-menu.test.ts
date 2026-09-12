import { afterEach, describe, expect, it, vi } from "vitest";
import { Game } from "../src/game";
import { EncounterScene } from "../src/scenes/encounter";
import { SurfaceScene } from "../src/scenes/surface";
import type { Encounter, EncounterOption } from "../src/data/encounters";
import { generateWorld } from "../src/world";

function fixture(count = 13, caller = "flight") {
  const world = generateWorld(410), scene = new EncounterScene(), keys = new Set<string>();
  world.player.tutorial = -1; world.player.crew = [];
  const options: EncounterOption[] = Array.from({ length: count }, (_, i) => ({ label: `ANSWER ${i}`, hint: `TERMS ${i} ` + "FULL TERMS ".repeat(100) + `FINAL TERM ${i}`, result: vi.fn(() => "RESULT ".repeat(300) + `FINAL RESULT ${i}`) }));
  const enc: Encounter = { id: "test-conversation", title: "A LONG CONVERSATION ".repeat(20), text: "PARAGRAPH ".repeat(300) + "LAST PARAGRAPH\n" + "X".repeat(301), where: "space", weight: 1, options };
  const under = { enter: vi.fn(), draw: vi.fn(), resumeNext: false };
  const g = Object.assign(Object.create(Game.prototype), { world, sceneName: caller, scene: under, scenes: { encounter: scene, [caller]: under, station: { enter: vi.fn() } },
    input: { wasPressed: (key: string) => keys.has(key), mousePressed: false, mouseX: 0, mouseY: 0, wheel: 0, flush: vi.fn(), down: new Set() }, spriteCache: new Map(), showHint: vi.fn(), toast: vi.fn(), autosave: vi.fn(),
  }) as Game;
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true }) as CanvasRenderingContext2D;
  scene.open(g, enc, caller);
  const press = (key: string) => { keys.add(key); scene.update(g, .05); keys.clear(); };
  const click = (x: number, y: number) => { Object.assign(g.input, { mousePressed: true, mouseX: x, mouseY: y }); scene.update(g, .05); g.input.mousePressed = false; };
  const draw = () => scene.draw(g, ctx);
  return { g, world, scene, enc, options, under, keys, press, click, draw };
}
afterEach(() => vi.restoreAllMocks());

describe("conversation choices and text", () => {
  it("pages every answer and keeps a parked pointer from stealing selection", () => {
    const { scene, g, press, click, draw, options } = fixture(); draw(); click(100, 140); press("PageDown");
    expect(scene.view.selected).toBe(options[4]); expect(scene.view.offset).toBe(4);
    g.input.mouseX = 120; scene.update(g, 0); expect(scene.view.selected).toBe(options[4]);
    press("End"); expect(scene.view.selected).toBe(options[12]); expect(scene.view.end).toBe(13);
    press("Home"); expect(scene.cursor).toBe(0); press("ArrowUp"); expect(scene.cursor).toBe(0);
  });
  it("selects on row clicks and executes only the explicit answer control", () => {
    const { options, scene, click, draw } = fixture(); draw();
    for (const [x, y] of [[35, 140], [444, 140], [100, 130], [100, 210], [100, 30], [470, 140]]) click(x, y);
    expect(options.every(o => !(o.result as ReturnType<typeof vi.fn>).mock.calls.length)).toBe(true);
    click(80, 157); expect(scene.view.selected).toBe(options[1]); expect(options[1].result).not.toHaveBeenCalled();
    click(350, 243); expect(options[1].result).toHaveBeenCalledOnce();
  });
  it("preserves duplicate label identities across insertion and rechecks removal before execution", () => {
    const { scene, enc, options, press, draw, click } = fixture(); options[5].label = options[4].label;
    press("PageDown"); draw(); const inserted = { ...options[0], result: vi.fn(() => "NEW") };
    enc.options.unshift(inserted); click(60, 141); expect(scene.view.selected).toBe(options[5]); // options is the live source array
    const selected = scene.view.selected!; selected.requires = () => false; press("Enter");
    expect(selected.result).not.toHaveBeenCalled(); expect(scene.view.selected).toBe(options[6]); expect(options[6].result).not.toHaveBeenCalled();
    press("Enter"); expect(options[6].result).toHaveBeenCalledOnce();
  });
  it("does not execute a row that vanished after drawing", () => {
    const { options, scene, press, click, draw } = fixture(); press("PageDown"); draw(); const selected = options[4]; selected.requires = () => false;
    click(100, 141); expect(scene.view.selected).toBe(options[5]); expect(options.every(o => !(o.result as ReturnType<typeof vi.fn>).mock.calls.length)).toBe(true);
  });
  it("scrolls complete body text independently of choices and reads unbroken text", () => {
    const { scene, g, press, click, options, draw } = fixture(); press("End"); const offset = scene.view.offset;
    Object.assign(g.input, { mouseX: 100, mouseY: 60, wheel: 1 }); scene.update(g, 0); g.input.wheel = 0;
    expect(scene.textScroll).toBe(3); expect(scene.view.selected).toBe(options[12]);
    press("ArrowRight"); expect(scene.textScroll).toBe(10); click(400, 120); expect(scene.textScroll).toBe(17);
    press("o"); expect(scene.info?.sections[0][1][0]).toContain("LAST PARAGRAPH"); press("End"); expect(scene.info!.scroll).toBe(scene.info!.maxScroll());
    expect(scene.info!.blocks[0].lines.join("")).toContain("X".repeat(301)); click(100, 100); expect(scene.info).toBeDefined();
    press("Escape"); expect(scene.view.offset).toBe(offset); expect(scene.textScroll).toBe(17); expect(g.sceneName).toBe("encounter"); expect(() => draw()).not.toThrow();
  });
  it("reads full selected terms without choosing or advancing the world", () => {
    const { scene, world, options, press } = fixture(); press("End"); const before = JSON.stringify(world);
    press("i"); expect(scene.info!.sections[0][1][0]).toContain("FINAL TERM 12"); press("End"); press("Escape");
    expect(scene.view.selected).toBe(options[12]); expect(JSON.stringify(world)).toBe(before); expect(options[12].result).not.toHaveBeenCalled();
  });
  it("keeps the outcome open for body and margin clicks, with complete scrolling and one return", () => {
    const { scene, options, g, under, press, click, draw } = fixture(1); press("Enter"); expect(options[0].result).toHaveBeenCalledOnce();
    click(80, 80); click(470, 243); click(200, 243); expect(g.sceneName).toBe("encounter"); press("End"); expect(scene.textScroll).toBe(scene.textEnd()); expect(scene.textLines().at(-1)).toContain("FINAL RESULT 0");
    press("o"); expect(scene.info!.sections.at(-1)![1][0]).toContain("FINAL RESULT 0"); press("Escape"); expect(g.sceneName).toBe("encounter"); expect(() => draw()).not.toThrow();
    click(350, 243); expect(g.sceneName).toBe("flight"); expect(under.resumeNext).toBe(true); scene.back(g); press("Enter"); expect(under.enter).toHaveBeenCalledOnce(); expect(options[0].result).toHaveBeenCalledOnce();
  });
  it("handles zero options without a numeric error and allows a return", () => {
    const { scene, press, options, g, draw } = fixture(0); for (const key of ["ArrowUp", "ArrowDown", "PageDown", "End", "i"]) press(key);
    expect(scene.cursor).toBe(0); expect(options).toHaveLength(0); expect(() => draw()).not.toThrow(); press("Escape"); expect(g.sceneName).toBe("flight");
  });
  it("requires an answer when choices exist and does not let Escape bypass a consequence", () => {
    const { g, press, options } = fixture(1); press("Escape"); expect(g.sceneName).toBe("encounter"); expect(options[0].result).not.toHaveBeenCalled();
  });
  it("cleans a nested reader and resets selection on a fresh conversation", () => {
    const { scene, enc, g, press } = fixture(); press("End"); press("i"); const cleanup = vi.fn(); scene.info!.closeSearchBox = cleanup;
    scene.open(g, enc, "flight", true); expect(cleanup).toHaveBeenCalledOnce(); expect(scene.info).toBeUndefined(); expect(scene.cursor).toBe(0); expect(scene.textScroll).toBe(0);
    press("o"); const cleanup2 = vi.fn(); scene.info!.closeSearchBox = cleanup2; g.setScene("station"); expect(cleanup2).toHaveBeenCalledOnce(); expect(scene.info).toBeUndefined();
  });
});

describe("conversation callback and caller boundaries", () => {
  it("executes a reentrant callback only once and returns an empty reply once", () => {
    const { scene, options, g, press, under } = fixture(1); options[0].result = vi.fn(() => { scene.update(g, 0); g.world.player.credits += 25; return ""; });
    const before = g.world.player.credits; press("Enter"); expect(options[0].result).toHaveBeenCalledOnce(); expect(g.world.player.credits).toBe(before + 25); expect(under.enter).toHaveBeenCalledOnce();
  });
  it("does not overwrite a child conversation opened by a callback", () => {
    const { scene, options, enc, g, press, world } = fixture(1); const child = { ...enc, id: "child", title: "CHILD", options: [{ label: "CHILD ANSWER", result: vi.fn(() => "CHILD RESULT") }] };
    options[0].result = vi.fn(() => { scene.open(g, child, "flight", true); return "PARENT RESULT"; });
    press("Enter"); expect(scene.enc).toBe(child); expect(scene.outcome).toBeNull(); expect(g.sceneName).toBe("encounter"); expect(world.player.log.at(-1)?.text).toBe(`${enc.title}: ANSWER 0`.slice(0, 120));
    press("Enter"); expect(scene.outcome).toBe("CHILD RESULT"); expect(child.options[0].result).toHaveBeenCalledOnce();
  });
  it("does not reopen the old caller after a callback changes scenes", () => {
    const { scene, options, g, press, under } = fixture(1); options[0].result = vi.fn(() => { g.setScene("station"); return ""; });
    press("Enter"); expect(g.sceneName).toBe("station"); scene.back(g); expect(under.enter).not.toHaveBeenCalled();
  });
  it("does not write a stale reply or log into a replacement world", () => {
    const { scene, options, g, press, under } = fixture(1), replacement = generateWorld(5), before = JSON.stringify(replacement);
    options[0].result = vi.fn(() => { g.world = replacement; return "STALE RESULT"; }); press("Enter"); scene.back(g);
    expect(scene.outcome).toBeNull(); expect(JSON.stringify(replacement)).toBe(before); expect(under.enter).not.toHaveBeenCalled();
  });
  it("preserves rover damage until the actual SurfaceScene consumes it once", () => {
    const { g, scene, options, press, world } = fixture(1, "surface"), surface = new SurfaceScene();
    const sys = Object.values(world.systems).find(s => s.planets.some(p => p.surface?.regions.length))!;
    world.player.systemId = sys.id; g.orbitPlanetIdx = sys.planets.findIndex(p => p.surface?.regions.length); g.landedRegionIdx = 0; g.surfaceFresh = false;
    g.scenes.surface = surface; surface.enter(g); surface.integrity = 80;
    options[0].result = vi.fn(() => "THE ROVER SLIPS. ROVER INTEGRITY -15"); press("Enter"); expect(surface.integrity).toBe(80);
    press("Enter"); expect(g.sceneName).toBe("surface"); expect(surface.integrity).toBe(65); expect(scene.outcome).toBeNull(); surface.enter(g); expect(surface.integrity).toBe(65);
  });
});
