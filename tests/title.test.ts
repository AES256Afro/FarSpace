// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TitleScene } from "../src/scenes/title";
import { TitleViews, TITLE_VIEWS } from "../src/core/titleviews";
import { titlePreview } from "../src/core/titlepreview";
import { updateVoyageSystems } from "../src/core/runtime";
import { Game } from "../src/game";
import { generateWorld } from "../src/world";
import { SAVE_VERSION, setActiveSlot } from "../src/save";
import * as cloud from "../src/core/cloud";
import { music } from "../src/core/music";
import { Storage as TestStorage } from "happy-dom";

vi.mock("../src/gfx/titlebackdrop", () => ({ TitleBackdrop: class { draw() {} } }));
vi.mock("../src/core/music", () => ({ music: { setMood: vi.fn(), isMuted: () => true, toggle: vi.fn() } }));
vi.mock("../src/core/sfx", () => ({ sfx: { select: vi.fn() } }));
vi.mock("../src/core/cloud", async original => ({ ...await original<object>(), pull: vi.fn(), importFile: vi.fn(), exportFile: vi.fn() }));

beforeEach(() => {
  vi.stubGlobal("localStorage", new TestStorage()); vi.stubGlobal("sessionStorage", new TestStorage());
  document.body.replaceChildren(); vi.clearAllMocks();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function saved() {
  const w = generateWorld(416); w.version = SAVE_VERSION; w.savedAt = Date.now(); w.player.shipName = "Long Way Home";
  localStorage.setItem("farspace-save", JSON.stringify(w)); return w;
}
function fixture() {
  const scene = new TitleScene(), keys = new Set<string>();
  const input = { down: new Set<string>(), lastRawKey: null, flush: () => keys.clear(), wasPressed: (k: string) => keys.has(k) };
  const other = () => ({ enter: vi.fn(), update: vi.fn(), draw: vi.fn() });
  const g = { world: generateWorld(416), input, frontend: false, sceneName: "", spriteCache: new Map(),
    scenes: { title: scene, settings: other(), help: other(), slots: other(), almanac: other(), chronicle: other(), whatsnew: other(), flight: other(), station: other() },
    setScene: Game.prototype.setScene, newGame: vi.fn(), adoptWorld: vi.fn(), toast: vi.fn() } as unknown as Game;
  g.setScene("title"); return { g, scene, keys };
}
function button(id: string) { const b = document.querySelector<HTMLButtonElement>(`[data-action="${id}"]`); expect(b, id).not.toBeNull(); return b!; }
function click(id: string) { button(id).click(); }
function key(key: string) { document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); }
async function settled() { await Promise.resolve(); await Promise.resolve(); }

describe("title scene deck", () => {
  it("shows all three scenes per cycle without consecutive repeats across restarts", () => {
    let n = 0, deck = new TitleViews(() => ((++n * 37) % 100) / 100), last = "";
    for (let cycle = 0; cycle < 100; cycle++) {
      const views = [];
      for (let i = 0; i < 3; i++) {
        const view = deck.next(); expect(view).not.toBe(last); views.push(view); last = view;
        deck = new TitleViews(() => ((++n * 37) % 100) / 100, JSON.parse(JSON.stringify(deck.snapshot())));
      }
      expect(views.sort()).toEqual([...TITLE_VIEWS].sort());
    }
  });
  it.each([null, {}, { remaining: ["orbit", "orbit"], last: null }, { remaining: ["bad"], last: "orbit" }, { remaining: ["orbit"], last: "orbit" }])("recovers a damaged presentation state", state => {
    const deck = new TitleViews(() => 0, state); expect(new Set([deck.next(), deck.next(), deck.next()]).size).toBe(3);
  });
});

describe("title preview", () => {
  it("reads current hull, name, location and save age without writing or changing the active slot", () => {
    const w = saved(), raw = localStorage.getItem("farspace-save"), write = vi.spyOn(Storage.prototype, "setItem");
    expect(titlePreview()).toMatchObject({ ship: "Long Way Home", location: w.systems[w.player.systemId].name, savedAt: w.savedAt, slot: 0, error: null });
    expect(write).not.toHaveBeenCalled(); expect(localStorage.getItem("farspace-save")).toBe(raw);
  });
  it("refreshes a replaced save in the same slot", () => {
    const w = saved(); expect(titlePreview().ship).toBe("Long Way Home");
    w.player.shipName = "New Arrival"; localStorage.setItem("farspace-save", JSON.stringify(w)); expect(titlePreview().ship).toBe("New Arrival");
  });
  it("offers the neutral Wren for an empty slot", () => { expect(titlePreview()).toMatchObject({ ship: "Wren Scout", present: false, world: null }); });
  it.each(["{bad json", JSON.stringify({ version: 14, player: {}, systems: {} })])("retains an unreadable slot and reports it", raw => {
    localStorage.setItem("farspace-save", raw); expect(titlePreview()).toMatchObject({ world: null, present: true });
    expect(titlePreview().error).toContain("could not be read"); expect(localStorage.getItem("farspace-save")).toBe(raw);
  });
  it("does not continue a save from a newer schema", () => {
    const w = saved(); w.version = SAVE_VERSION + 1; localStorage.setItem("farspace-save", JSON.stringify(w)); expect(titlePreview().world).toBeNull();
  });
});

describe("title navigation", () => {
  it("starts a new player on New voyage and opens the requested galaxy", () => {
    const { g } = fixture(); expect(document.activeElement).toBe(button("new")); expect(document.querySelector('[data-action="continue"]')).toBeNull();
    click("new"); click("sol50"); expect(g.newGame).toHaveBeenCalledWith(true, 50); expect(g.sceneName).toBe("flight");
    expect(g.frontend).toBe(false); expect(document.getElementById("title-screen")).toBeNull();
  });
  it("continues only the saved voyage and offers cancellation before starting over", () => {
    saved(); const { g } = fixture(); expect(document.activeElement).toBe(button("continue"));
    click("new"); click("sol20"); expect(button("accept").textContent).toBe("Start new voyage"); click("cancel");
    expect(g.newGame).not.toHaveBeenCalled(); key("Escape"); click("continue");
    expect(g.world.player.shipName).toBe("Long Way Home"); expect(g.frontend).toBe(false);
  });
  it("preserves view, submenu, focus and scroll through child scenes and cleans up the menu", () => {
    const { g, scene } = fixture(); click("new"); button("difficulty").focus();
    document.getElementById("title-screen")!.scrollTop = 130; const view = scene.view; click("difficulty");
    expect(g.sceneName).toBe("settings"); expect(g.frontend).toBe(true); expect(document.getElementById("title-screen")).toBeNull();
    g.setScene("title"); expect(scene.view).toBe(view); expect(scene.page).toBe("new");
    expect(document.activeElement).toBe(button("difficulty")); expect(document.getElementById("title-screen")!.scrollTop).toBe(130);
    expect(document.querySelectorAll("#title-screen")).toHaveLength(1);
    g.setScene("flight"); g.setScene("title"); expect(scene.view).not.toBe(view); expect(scene.page).toBe("home");
  });
  it("keeps focus through pointer movement and repeated frames; keyboard reaches the final action", () => {
    const { g, scene } = fixture(); button("settings").focus();
    for (let i = 0; i < 20; i++) { document.body.dispatchEvent(new MouseEvent("mousemove", { bubbles: true })); scene.update(g, .05); }
    expect(document.activeElement).toBe(button("settings")); key("End"); expect(document.activeElement).toBe(button("fullscreen"));
    key("Home"); expect(document.activeElement).toBe(button("new"));
  });
  it("keeps typing and Tab inside the native form without firing global shortcuts", () => {
    fixture(); click("library"); click("identity"); click("callsign");
    const input = document.querySelector("input")!; expect(document.activeElement).toBe(input);
    const globalKey = vi.fn(); window.addEventListener("keydown", globalKey);
    key("h"); key("f"); key("Tab"); expect(globalKey).not.toHaveBeenCalled(); expect(music.toggle).not.toHaveBeenCalled();
    input.value = "TOO@ODD"; document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(document.querySelector('[role="status"]')!.textContent).toContain("Use 2-16");
    key("Escape"); expect(document.querySelector("input")).toBeNull(); window.removeEventListener("keydown", globalKey);
  });
  it("supports explicit view changes and reduced-motion still frames", () => {
    const { g, scene } = fixture(), view = scene.view; click("view"); expect(scene.view).not.toBe(view);
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    scene.update(g, 60); expect(scene.t).toBe(0);
  });
  it("does not advance the saved world, create saves or change the scene during a simulated twenty-minute title stay", () => {
    saved(); const { g, scene } = fixture(), before = JSON.stringify(g.world), raw = localStorage.getItem("farspace-save"), view = scene.view;
    const write = vi.spyOn(Storage.prototype, "setItem");
    for (let i = 0; i < 24000; i++) { scene.update(g, .05); updateVoyageSystems(g); }
    expect(JSON.stringify(g.world)).toBe(before); expect(localStorage.getItem("farspace-save")).toBe(raw);
    expect(write).not.toHaveBeenCalled(); expect(scene.view).toBe(view); expect(g.sceneName).toBe("title");
  });
});

describe("title asynchronous save actions", () => {
  it.each(["cancel", "local", "leave", "slot"])("ignores a cloud response after %s", async way => {
    saved(); cloud.setCode("ABCDEFGH23"); let resolve!: (value: { world: ReturnType<typeof generateWorld>; updatedAt: number }) => void;
    vi.mocked(cloud.pull).mockImplementation(() => new Promise(r => { resolve = r; }));
    const { g, scene } = fixture(); click("continue"); expect(button("local").disabled).toBe(false);
    if (way === "cancel") click("cancel-load"); else if (way === "local") click("local"); else if (way === "leave") g.setScene("settings"); else setActiveSlot(1);
    resolve({ world: generateWorld(900), updatedAt: Date.now() + 10000 }); await settled();
    expect(g.adoptWorld).not.toHaveBeenCalled(); expect(scene.page).not.toBe("confirm");
  });
  it("requires a choice before adopting a newer cloud copy", async () => {
    const w = saved(); cloud.setCode("ABCDEFGH23"); vi.mocked(cloud.pull).mockResolvedValue({ world: w, updatedAt: Date.now() + 10000 });
    const { g } = fixture(); click("continue"); await settled(); expect(button("accept").textContent).toBe("Load cloud voyage");
    expect(g.adoptWorld).not.toHaveBeenCalled(); click("cancel"); expect(g.adoptWorld).not.toHaveBeenCalled();
  });
  it("uses the local save when the cloud copy is older", async () => {
    const w = saved(); cloud.setCode("ABCDEFGH23"); vi.mocked(cloud.pull).mockResolvedValue({ world: w, updatedAt: 1 });
    const { g } = fixture(); click("continue"); await settled(); expect(g.frontend).toBe(false); expect(g.adoptWorld).not.toHaveBeenCalled();
  });
  it("reports network failure and leaves the local save intact", async () => {
    saved(); cloud.setCode("ABCDEFGH23"); const raw = localStorage.getItem("farspace-save"); vi.mocked(cloud.pull).mockResolvedValue(null);
    fixture(); click("continue"); await settled(); expect(document.querySelector('[role="status"]')!.textContent).toContain("Cloud save unavailable");
    expect(localStorage.getItem("farspace-save")).toBe(raw); expect(button("continue").disabled).toBe(false);
  });
  it("checks the active slot again when accepting an imported file", async () => {
    vi.mocked(cloud.importFile).mockResolvedValue(generateWorld(900)); const { g } = fixture(); click("library"); click("import"); await settled();
    setActiveSlot(1); click("accept"); expect(g.adoptWorld).not.toHaveBeenCalled(); expect(document.querySelector('[role="status"]')!.textContent).toContain("active slot changed");
  });
});
