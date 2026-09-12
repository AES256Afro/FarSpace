import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsScene } from "../src/scenes/settings";
import { settings, ACTIONS } from "../src/core/settings";
import { drawText } from "../src/gfx/font";
import type { Game } from "../src/game";

vi.mock("../src/gfx/font", async importOriginal => ({ ...await importOriginal<object>(), drawText: vi.fn() }));

beforeEach(() => {
  vi.stubGlobal("document", { fullscreenElement: null });
  vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
  const s = settings();
  for (const key of Object.keys(s)) delete (s as unknown as Record<string, unknown>)[key];
  Object.assign(s, { aim: "mouse", keymap: {}, hardcore: false, music: 0.6, sfx: 0.8, presence: true });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

function fixture() {
  const scene = new SettingsScene(), keys = new Set<string>();
  const input = {
    wasPressed: (k: string) => keys.has(k), mouseX: 90, mouseY: 50, mousePressed: false,
    wheel: 0, lastRawKey: null as string | null,
    flush() { keys.clear(); this.mousePressed = false; this.wheel = 0; },
  };
  const g = { input, settingsReturn: "flight", setScene: vi.fn(), toastTimer: 0 } as unknown as Game;
  const ctx = { fillRect: vi.fn(), fillStyle: "" } as unknown as CanvasRenderingContext2D;
  const draw = () => scene.draw(g, ctx);
  const frame = () => { scene.update(g, 0); input.flush(); draw(); };
  const key = (k: string) => { keys.add(k); frame(); };
  const clickRow = (i: number) => { input.mouseX = 90; input.mouseY = scene.rowBoxes[i][0] + 4; input.mousePressed = true; frame(); };
  draw();
  return { scene, input, g, draw, frame, key, clickRow };
}

describe("settings scrolling", () => {
  it("reaches every row by wheel and keeps its place through pointer drift", () => {
    const { scene, input, frame } = fixture(), before = JSON.stringify(settings());
    for (let i = 1; i < scene.rows().length; i++) {
      input.wheel = 1; input.mouseX += 0.5; frame();
      expect(scene.cursor).toBe(i);
      input.mouseY += 0.1; frame(); expect(scene.cursor).toBe(i);
      expect(scene.rowBoxes[i][0]).toBeGreaterThanOrEqual(34);
      expect(scene.rowBoxes[i][1]).toBeLessThan(236);
    }
    input.wheel = 1; frame(); expect(scene.cursor).toBe(scene.rows().length - 1);
    expect(JSON.stringify(settings())).toBe(before);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("keeps arrow navigation visible and wraps at both ends without hover selection", () => {
    const { scene, key, input, frame } = fixture();
    for (let i = 1; i < scene.rows().length; i++) {
      key("ArrowDown"); expect(scene.cursor).toBe(i);
      expect(Number.isFinite(scene.rowBoxes[i][0])).toBe(true);
      expect(scene.rowBoxes.filter(([y]) => Number.isFinite(y))).toHaveLength(14);
    }
    key("ArrowDown"); expect(scene.cursor).toBe(0);
    key("ArrowUp"); expect(scene.cursor).toBe(scene.rows().length - 1);
    input.mouseY = 50; frame(); expect(scene.cursor).toBe(scene.rows().length - 1);
  });

  it("supports pages, Home/End and pointer page controls", () => {
    const { scene, key, input, frame } = fixture();
    key("PageDown"); expect(scene.cursor).toBe(14); expect(scene.top).toBe(14);
    key("PageUp"); expect(scene.cursor).toBe(0); expect(scene.top).toBe(0);
    key("End"); expect(scene.cursor).toBe(scene.rows().length - 1);
    key("Home"); expect(scene.cursor).toBe(0); expect(scene.top).toBe(0);
    input.mouseX = 100; input.mouseY = 242; input.mousePressed = true; frame();
    expect(scene.cursor).toBe(14); expect(scene.top).toBe(14);
    input.mouseX = 30; input.mousePressed = true; frame(); expect(scene.cursor).toBe(0);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("places the key heading with the bindings, including a mixed window", () => {
    const { scene, key, draw } = fixture();
    expect(vi.mocked(drawText).mock.calls.some(([, label]) => label === "KEY BINDINGS (FLIGHT)")).toBe(false);
    scene.cursor = 14; vi.mocked(drawText).mockClear(); draw();
    const calls = vi.mocked(drawText).mock.calls;
    const heading = calls.find(([, label]) => label === "KEY BINDINGS (FLIGHT)")!;
    const thrust = calls.find(([, label]) => label === "THRUST")!;
    const lastOption = calls.find(([, label]) => label === "ORDERS: THE SHIP'S QUIET LEG")!;
    expect(heading[3]).toBeGreaterThan(lastOption[3]); expect(heading[3]).toBeLessThan(thrust[3]);
    key("End"); expect(scene.rows().filter(r => r.keyBinding)).toHaveLength(ACTIONS.length + 1);
  });

  it("clicks the actual scrolled standing order without changing adjacent options", () => {
    const { scene, draw, clickRow } = fixture();
    scene.cursor = 20; draw(); const before = { ...settings() };
    clickRow(13); expect(scene.cursor).toBe(13);
    expect(settings()).toEqual({ ...before, keepQuietLeg: true });
  });

  it("rebinds a lower row and reaches reset without resetting other settings", () => {
    const { scene, key, clickRow, input, frame } = fixture();
    key("End"); const last = scene.rows().length - 1;
    clickRow(last - 1); expect(scene.binding).toBe("f");
    input.lastRawKey = "b"; frame();
    expect(settings().keymap).toEqual({ b: "f" }); expect(scene.binding).toBeNull();
    const before = { ...settings() };
    clickRow(last); expect(settings()).toEqual({ ...before, keymap: {} });
  });

  it("keeps margin, section heading and footer information clicks inert", () => {
    const { scene, key, input, frame, g } = fixture();
    settings().keymap = { q: "w" }; key("End"); const last = scene.cursor;
    for (const [x, y] of [[2, scene.rowBoxes[last][0] + 4], [479, scene.rowBoxes[last][0] + 4], [90, 36], [200, 242], [100, 261]]) {
      input.mouseX = x; input.mouseY = y; input.mousePressed = true; frame();
      expect(scene.cursor).toBe(last); expect(settings().keymap).toEqual({ q: "w" });
    }
    expect(localStorage.setItem).not.toHaveBeenCalled(); expect(g.setScene).not.toHaveBeenCalled();
  });

  it.each(["Escape", "pointer"])("cancels a scrolled binding with %s and stays in settings", method => {
    const { scene, key, clickRow, input, frame, g } = fixture();
    key("End"); clickRow(scene.rows().length - 2);
    if (method === "Escape") input.lastRawKey = "Escape";
    else { input.mouseX = 430; input.mouseY = 10; input.mousePressed = true; }
    frame(); expect(scene.binding).toBeNull(); expect(g.setScene).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled(); expect(settings().keymap).toEqual({});
  });

  it("retains volume adjustment and returns to the original scene with Back", () => {
    const { scene, draw, key, input, frame, g } = fixture();
    scene.cursor = 3; draw(); key("ArrowRight"); expect(settings().sfx).toBe(0.9);
    key("ArrowLeft"); expect(settings().sfx).toBe(0.8);
    input.mouseX = 430; input.mouseY = 10; input.mousePressed = true; frame();
    expect(g.setScene).toHaveBeenCalledWith("flight"); expect(g.settingsReturn).toBe("title");
  });
});

it("requests the current flight population when returning from Settings", () => {
  const { scene, g, key } = fixture(); const flight = { resumeNext: false }; g.scenes = { flight } as unknown as Game["scenes"];
  key("End"); const cursor = scene.cursor, top = scene.top; key("Escape"); expect(flight.resumeNext).toBe(true); expect(g.setScene).toHaveBeenCalledWith("flight"); scene.enter(); expect(scene.cursor).toBe(cursor); expect(scene.top).toBe(top);
});
