// @vitest-environment happy-dom
import { afterEach, describe, it, expect, vi } from "vitest";
import type { Game } from "../src/game";
import { runGlobalShortcuts } from "../src/core/globalshortcuts";
import { music } from "../src/core/music";
import { GalaxyScene } from "../src/scenes/galaxy";
import { SettingsScene } from "../src/scenes/settings";
import { generateWorld } from "../src/world";
import { updateVoyageSystems } from "../src/core/runtime";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
function fixture() {
  const toggle = vi.spyOn(music, "toggle").mockReturnValue(true), scene = new GalaxyScene();
  const g = { scene, sceneName: "galaxy", input: { wasPressed: () => true }, toast: vi.fn(), postcard: vi.fn(), postcardCaption: () => "CAPTION" } as unknown as Game;
  return { g, scene, toggle };
}
describe("global shortcut ownership", () => {
  it("does not change music or capture a postcard while finding a system", () => {
    const { g, scene, toggle } = fixture(); scene.searching = true; runGlobalShortcuts(g); expect(toggle).not.toHaveBeenCalled(); expect(g.postcard).not.toHaveBeenCalled();
    scene.searching = false; runGlobalShortcuts(g, true); expect(toggle).not.toHaveBeenCalled(); expect(g.postcard).not.toHaveBeenCalled();
    runGlobalShortcuts(g); expect(toggle).toHaveBeenCalledOnce(); expect(g.postcard).toHaveBeenCalledWith("CAPTION");
  });
  it("keeps the key used to finish rebinding out of global actions for that frame", () => {
    const { g, toggle } = fixture(), scene = new SettingsScene(); g.scene = scene; g.sceneName = "settings"; scene.binding = "w";
    const captured = scene.capturesKeys; runGlobalShortcuts(g); scene.binding = null; runGlobalShortcuts(g, captured); expect(toggle).not.toHaveBeenCalled(); expect(g.postcard).not.toHaveBeenCalled();
  });
  it("leaves focused form input in charge even when a gamepad produces a global key", () => {
    const { g, toggle } = fixture(), input = document.createElement("input"); document.body.append(input); input.focus(); runGlobalShortcuts(g); expect(toggle).not.toHaveBeenCalled(); expect(g.postcard).not.toHaveBeenCalled();
  });
  it("pauses voyage systems during galaxy search and settings", () => {
    const { g, scene } = fixture(); g.world = generateWorld(270); scene.searching = true; const before = JSON.stringify(g.world); updateVoyageSystems(g, 10); expect(JSON.stringify(g.world)).toBe(before);
    g.scene = new SettingsScene(); updateVoyageSystems(g, 10); expect(JSON.stringify(g.world)).toBe(before);
  });
});
