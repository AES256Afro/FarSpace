import { afterEach, describe, expect, it, vi } from "vitest";
import { generateWorld, cargoUsed } from "../src/world";
import { COMMODITIES } from "../src/data/data";
import { StationScene } from "../src/scenes/station";
import type { Game } from "../src/game";
import * as wire from "../src/core/wire";
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
function fixture() {
  vi.useFakeTimers(); vi.spyOn(wire, "post").mockResolvedValue(undefined);
  const w = generateWorld(411), p = w.player, st = w.systems[p.systemId].stations[0];
  p.dockedAt = st.id; p.cargoMax = 2000; p.crew = [];
  p.cargo = Object.fromEntries(COMMODITIES.map(c => [c.id, 2]));
  p.storage = { [st.id]: Object.fromEntries(COMMODITIES.map(c => [c.id, 3])), elsewhere: { food: 80 } };
  const station = new StationScene(); station.station = st; station.tab = 7;
  const keys = new Set<string>(), input = { wasPressed: (k: string) => keys.has(k), isDown: () => false, mousePressed: false, mouseRightPressed: false, mouseX: -1, mouseY: -1, wheel: 0 };
  const g = { world: w, input, toast: vi.fn(), autosave: vi.fn() } as unknown as Game;
  const ctx = { fillRect: vi.fn(), fillStyle: "" } as unknown as CanvasRenderingContext2D;
  const act = () => { keys.add("Enter"); station.update(g, 0); keys.clear(); };
  return { p, st, station, g, ctx, input, keys, act };
}
describe("warehouse inventory", () => {
  it("shows every selected item inside the viewport for a large hold and warehouse", () => {
    const { station, g, ctx } = fixture(), rows = station.storageRows(g); expect(rows).toHaveLength(52);
    for (let i = 0; i < rows.length; i++) {
      station.cursor = i; station.rowBoxes = []; station.drawStorage(g, ctx, 56);
      const visible = station.storageWindow(g); expect(visible.some(r => r.index === i)).toBe(true);
      expect(visible.every(r => r.y >= 84 && r.y + 8 < 216)).toBe(true);
      expect(station.rowBoxes[i][0]).toBeGreaterThanOrEqual(82);
    }
  });
  it("loads the actual scrolled pointer row and preserves all other inventory", () => {
    const { station, g, ctx, input, p, st } = fixture(), id = COMMODITIES.at(-1)!.id;
    station.cursor = 51; station.drawStorage(g, ctx, 56);
    input.mouseX = 200; input.mouseY = station.rowBoxes[51][0] + 4; input.mousePressed = true;
    station.update(g, 0); expect(p.cargo[id]).toBe(2); input.mouseX = 40; input.mouseY = 250;
    station.update(g, 0); expect(p.cargo[id]).toBe(3); expect(p.storage[st.id][id]).toBe(2);
    expect(p.cargo.food).toBe(2); expect(p.storage[st.id].food).toBe(3); expect(p.storage.elsewhere.food).toBe(80);
    expect(cargoUsed(p)).toBe(53);
  });
  it("keeps the same stored commodity selected when loading creates a new hold row", () => {
    const { station, g, act, p, st } = fixture(); p.cargo = {}; p.storage[st.id] = { food: 3, med: 2 };
    station.cursor = 1; act(); expect(p.cargo.med).toBe(1); expect(p.storage[st.id].med).toBe(1);
    expect(station.storageRows(g)[station.cursor]).toMatchObject({ kind: "stored", id: "med" });
    act(); expect(p.cargo.med).toBe(2); expect(p.storage[st.id].med).toBeUndefined();
    expect(station.cursor).toBeLessThan(station.storageRows(g).length);
  });
  it("stores one unit at a time and conserves the combined quantity when a row disappears", () => {
    const { station, g, act, p, st } = fixture(); p.cargo = { food: 2 }; p.storage[st.id] = {};
    act(); expect(p.cargo.food).toBe(1); expect(p.storage[st.id].food).toBe(1);
    expect(station.storageRows(g)[station.cursor].kind).toBe("held"); act();
    expect(p.cargo.food).toBeUndefined(); expect(p.storage[st.id].food).toBe(2); expect(station.cursor).toBe(0);
  });
  it("does not consume warehouse goods when the hold is full", () => {
    const { station, g, act, p } = fixture(); p.cargoMax = cargoUsed(p); station.cursor = 51;
    const before = JSON.stringify(p); act(); expect(JSON.stringify(p)).toBe(before); expect(g.toast).toHaveBeenCalledWith("CARGO FULL");
  });
  it("ignores zero quantities and handles empty inventory without a transfer", () => {
    const { station, g, act, p, st } = fixture(); p.cargo = { food: 0 }; p.storage[st.id] = { med: 0 };
    expect(station.storageRows(g)).toEqual([]); const before = JSON.stringify(p); act(); expect(JSON.stringify(p)).toBe(before);
  });
});
