import { afterEach, describe, expect, it, vi } from "vitest";
import { generateWorld, findStation, type Charter } from "../src/world";
import { HULLS } from "../src/data/hulls";
import { StationScene } from "../src/scenes/station";
import type { Game } from "../src/game";
import * as dialog from "../src/core/dialog";
import * as wire from "../src/core/wire";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
function fixture() {
  vi.useFakeTimers(); vi.spyOn(wire, "post").mockResolvedValue(undefined);
  const w = generateWorld(407), p = w.player, st = w.systems[p.systemId].stations[0];
  const away = Object.values(w.systems).flatMap(s => s.stations).filter(s => s.id !== st.id);
  p.dockedAt = st.id; p.credits = 20000; p.cargo = {}; p.crew = []; p.missions = [];
  p.fleet = Array.from({ length: 18 }, (_, i) => ({ hullId: "scout", stationId: i < 12 ? st.id : away[i - 12].id, name: `Owned ${i}`, hull: 80, torpedoes: i }));
  const charter = (id: string, own = false): Charter => ({ id, name: id, from: st.id, to: away[0].id, commodityId: "food", qty: 10, tripSecs: 300, lastT: 0, trips: 3, earned: 120, till: 51, health: 80, raided: 0, own, hullId: "scout", shipName: id });
  p.haulers = [charter("First worker", true), charter("Second worker"), charter("Last worker")];
  const station = new StationScene(); station.station = st; station.tab = 2;
  const keys = new Set<string>();
  const input = { wasPressed: (key: string) => keys.has(key), isDown: () => false, mousePressed: false, mouseRightPressed: false, wheel: 0, mouseX: -1, mouseY: -1, flush: vi.fn() };
  const g = { world: w, input, toast: vi.fn(), showHint: vi.fn(), spriteCache: new Map(), autosave: vi.fn(), setScene: vi.fn(), sprite: () => ({ width: 24, height: 24 }) } as unknown as Game;
  const ctx = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: "" } as unknown as CanvasRenderingContext2D;
  return { w, p, st, away, station, g, keys, input, ctx };
}

describe("station fleet selection", () => {
  it("keeps every market, parked, remote and working row reachable in a long fleet", () => {
    const { station, g, ctx, p } = fixture(), rows = station.shipRows(g);
    expect(rows).toHaveLength(HULLS.length + 18 + 3);
    expect(rows.filter(r => r.kind === "remote")).toHaveLength(6);
    const before = JSON.stringify(p);
    for (let i = 0; i < rows.length; i++) {
      station.cursor = i; station.drawShips(g, ctx, 56);
      const visible = station.shipWindow(g);
      expect(visible.some(r => r.index === i)).toBe(true);
      expect(visible.every(r => r.y >= 83 && r.y + 16 < 238)).toBe(true);
      expect(station.rowBoxes[i][0]).toBeGreaterThanOrEqual(81);
      expect(station.rowBoxes[i][1]).toBeLessThan(238);
    }
    expect(JSON.stringify(p)).toBe(before);
  });
  it("a pointer click on a scrolled owned ship dispatches that ship, not a market purchase", () => {
    const { station, g, ctx, input, p } = fixture();
    const index = HULLS.length + 10; station.cursor = index; station.drawShips(g, ctx, 56);
    const swap = vi.spyOn(station, "swapShip").mockImplementation(() => {}), buy = vi.spyOn(station, "buyHull").mockImplementation(() => {});
    input.mouseX = 100; input.mouseY = station.rowBoxes[index][0] + 4; input.mousePressed = true;
    station.update(g, 0);
    expect(swap).not.toHaveBeenCalled(); input.mouseX = 40; input.mouseY = 250; station.update(g, 0);
    expect(swap).toHaveBeenCalledWith(g, p.fleet![10]); expect(buy).not.toHaveBeenCalled();
  });
  it("clicking ship details does not buy or board anything", () => {
    const { station, g, ctx, input } = fixture(); station.drawShips(g, ctx, 56);
    const buy = vi.spyOn(station, "buyHull").mockImplementation(() => {});
    input.mouseX = 300; input.mouseY = 85; input.mousePressed = true;
    station.update(g, 0); expect(buy).not.toHaveBeenCalled();
  });
  it("R releases the selected working hull, settles its till once, and leaves other charters", () => {
    const { station, g, keys, p, st } = fixture(); const first = p.haulers![0];
    station.cursor = station.shipRows(g).findIndex(r => r.kind === "working" && r.charter === first);
    vi.spyOn(dialog, "confirmBox").mockReturnValue(true); keys.add("r"); station.update(g, 0);
    expect(p.haulers!.map(c => c.name)).toEqual(["Second worker", "Last worker"]);
    expect(p.credits).toBe(20051); expect(first.till).toBe(0);
    expect(p.fleet!.some(f => f.name === first.name && f.stationId === st.id && f.hull === 80)).toBe(true);
    station.releaseWorkingShip(g, first); expect(p.credits).toBe(20051);
    expect(p.fleet!.filter(f => f.name === first.name)).toHaveLength(1);
  });
  it("R on a market row cannot release an unrelated charter; declining release changes nothing", () => {
    const { station, g, keys, p } = fixture(); const confirm = vi.spyOn(dialog, "confirmBox").mockReturnValue(false);
    const before = JSON.stringify(p); keys.add("r"); station.update(g, 0);
    expect(confirm).not.toHaveBeenCalled(); expect(JSON.stringify(p)).toBe(before);
    station.releaseWorkingShip(g, p.haulers![0]); expect(JSON.stringify(p)).toBe(before);
  });
  it("L dispatches the selected remote hull", () => {
    const { station, g, keys, p } = fixture(), ship = p.fleet![16];
    station.cursor = station.shipRows(g).findIndex(r => r.kind === "remote" && r.ship === ship);
    const liner = vi.spyOn(station, "takeTheLiner").mockImplementation(() => {});
    keys.add("l"); station.update(g, 0); expect(liner).toHaveBeenCalledWith(g, ship);
  });
  it("the actual liner boards the requested remote ship instead of the first or nearest hull", () => {
    const { station, g, p, w, st } = fixture(), ship = p.fleet![17], dest = findStation(w, ship.stationId)!;
    vi.spyOn(dialog, "confirmBox").mockReturnValue(true);
    station.takeTheLiner(g, ship);
    expect(p.systemId).toBe(dest.sys.id); expect(p.dockedAt).toBe(dest.st.id);
    expect(p.shipName).toBe("Owned 17"); expect(p.torpedoes).toBe(17);
    expect(p.fleet!.some(f => f.name === "Owned 12")).toBe(true);
    expect(p.fleet!.some(f => f.stationId === st.id && !f.name)).toBe(true);
  });
  it("a missing requested liner hull cannot fall back to another destination", () => {
    const { station, g, p } = fixture(); const before = JSON.stringify(p);
    const confirm = vi.spyOn(dialog, "confirmBox").mockReturnValue(true);
    station.takeTheLiner(g, { ...p.fleet![17] });
    expect(confirm).not.toHaveBeenCalled(); expect(JSON.stringify(p)).toBe(before);
  });
});

describe("scrolled shipyard pointer mapping", () => {
  it("clicking a visible scrolled option runs exactly its action", () => {
    const { station, g, ctx, input } = fixture(); station.tab = 1;
    const options = Array.from({ length: 40 }, (_, i) => ({ id: `item-${i}`, label: `ITEM ${i}`, sub: "", action: vi.fn() }));
    vi.spyOn(station, "shipyardOptions").mockReturnValue(options);
    station.cursor = 34; station.drawShipyard(g, ctx, 56);
    const y = station.rowBoxes[34][0] + 4;
    expect(y).toBeGreaterThan(56); expect(y).toBeLessThan(235);
    input.mouseX = 90; input.mouseY = y; input.mousePressed = true;
    station.update(g, 0);
    expect(options[34].action).not.toHaveBeenCalled(); input.mouseX = 40; input.mouseY = 250; station.update(g, 0);
    expect(options[34].action).toHaveBeenCalledOnce();
    expect(options.filter(o => o.action.mock.calls.length)).toEqual([options[34]]);
  });
  it("shipyard details on the right cannot activate a purchase on the left", () => {
    const { station, g, ctx, input } = fixture(); station.tab = 1;
    const options = [{ id: "item", label: "ITEM", sub: "", action: vi.fn() }];
    vi.spyOn(station, "shipyardOptions").mockReturnValue(options); station.drawShipyard(g, ctx, 56);
    input.mouseX = 320; input.mouseY = 58; input.mousePressed = true;
    station.update(g, 0); expect(options[0].action).not.toHaveBeenCalled();
  });
});
