import { afterEach, describe, expect, it, vi } from "vitest";
import { generateWorld } from "../src/world";
import { COMMODITIES } from "../src/data/data";
import { StationScene } from "../src/scenes/station";
import type { Game } from "../src/game";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function fixture(tab: number) {
  vi.useFakeTimers();
  const w = generateWorld(413), p = w.player, st = w.systems[p.systemId].stations[0];
  p.dockedAt = st.id; p.crew = []; p.missions = []; p.credits = 10000; p.cargoMax = 200;
  p.cargo = Object.fromEntries(COMMODITIES.map(c => [c.id, 2]));
  const station = new StationScene(); station.station = st; station.tab = tab;
  const keys = new Set<string>();
  const input = { wasPressed: (k: string) => keys.has(k), isDown: () => false, mousePressed: false, mouseRightPressed: false, mouseX: 90, mouseY: tab === 0 ? 72 : 60, wheel: 0 };
  const g = { world: w, input, toast: vi.fn(), showHint: vi.fn(), autosave: vi.fn() } as unknown as Game;
  const ctx = { fillRect: vi.fn(), fillStyle: "" } as unknown as CanvasRenderingContext2D;
  const draw = () => { station.rowBoxes = []; if (tab === 0) station.drawMarket(g, ctx, 56); else station.drawShipyard(g, ctx, 56); };
  return { p, st, station, keys, input, g, ctx, draw };
}

describe.each([["market", 0], ["shipyard", 1]] as const)("%s list input", (_, tab) => {
  it("keeps scrolling downward despite pointer drift over an earlier row", () => {
    const { p, station, input, g, draw } = fixture(tab), before = JSON.stringify(p);
    for (let i = 0; i < 24; i++) {
      draw(); input.mouseX += 0.5; input.wheel = 1; station.update(g, 0);
      expect(station.cursor).toBe(i + 1);
      input.wheel = 0; input.mouseX += 0.5; draw(); station.update(g, 0);
      expect(station.cursor).toBe(i + 1);
    }
    expect(JSON.stringify(p)).toBe(before);
  });
  it("preserves keyboard selection when the pointer moves afterwards", () => {
    const { station, keys, input, g, draw } = fixture(tab);
    station.cursor = 20; draw(); keys.add("ArrowDown"); station.update(g, 0); keys.clear();
    expect(station.cursor).toBe(21);
    draw(); input.mouseY += 1; station.update(g, 0); expect(station.cursor).toBe(21);
  });
});

describe("market viewport", () => {
  it("keeps every commodity, including carried rares, and its pointer target on screen", () => {
    const { station, draw, g } = fixture(0), rows = station.marketRows(g);
    expect(rows).toHaveLength(COMMODITIES.length);
    for (let i = 0; i < rows.length; i++) {
      station.cursor = i; draw();
      expect(station.rowBoxes[i][0]).toBeGreaterThanOrEqual(66);
      expect(station.rowBoxes[i][1]).toBeLessThan(192);
      const visible = station.rowBoxes.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
      expect(visible.length).toBeLessThanOrEqual(12);
    }
  });
  it("clicking the last scrolled rare sells only that commodity", () => {
    const { station, draw, g, input, p } = fixture(0), rows = station.marketRows(g), id = rows.at(-1)!;
    station.cursor = rows.length - 1; draw(); const before = { ...p.cargo };
    input.mouseY = station.rowBoxes[station.cursor][0] + 4; input.mousePressed = true;
    station.update(g, 0); expect(p.cargo).toEqual(before); input.mouseX = 40; input.mouseY = 250;
    station.update(g, 0); expect(p.cargo).toEqual({ ...before, [id]: before[id] - 1 });
    expect(p.credits).toBeGreaterThan(10000);
  });
  it("clicking market information below the rows makes no trade", () => {
    const { station, draw, g, input, p } = fixture(0); station.cursor = 25; draw();
    const before = JSON.stringify(p); input.mouseY = 210; input.mousePressed = true;
    station.update(g, 0); expect(JSON.stringify(p)).toBe(before); expect(station.cursor).toBe(25);
  });
});
