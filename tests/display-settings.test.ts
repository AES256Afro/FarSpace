import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it("loads old settings with usable display defaults and retains display preferences after reload", async () => {
  let stored = JSON.stringify({ music: .4, keymap: { q: "w" } });
  vi.stubGlobal("localStorage", { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } });
  const first = await import("../src/core/settings");
  expect(first.displaySettings()).toEqual({hudDensity:"compact",hudOpacity:90,screenFit:"fit"});
  first.saveSettings({hudDensity:"minimal",hudOpacity:40,screenFit:"integer"});
  vi.resetModules();
  const loaded = await import("../src/core/settings");
  expect(loaded.displaySettings()).toEqual({hudDensity:"minimal",hudOpacity:40,screenFit:"integer"});
  expect(loaded.settings()).toMatchObject({music:.4,keymap:{q:"w"}});
});

it("contains invalid or out of range presentation values without making the canvas disappear", async () => {
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({hudDensity:"unknown",hudOpacity:"none",screenFit:"stretch"}), setItem: vi.fn() });
  const {displaySettings,saveSettings} = await import("../src/core/settings");
  expect(displaySettings()).toEqual({hudDensity:"compact",hudOpacity:90,screenFit:"fit"});
  for (const value of [NaN,Infinity]) { saveSettings({hudOpacity:value}); expect(displaySettings().hudOpacity).toBe(90); }
  saveSettings({hudOpacity:-100}); expect(displaySettings().hudOpacity).toBe(30);
  saveSettings({hudOpacity:200}); expect(displaySettings().hudOpacity).toBe(100);
});
