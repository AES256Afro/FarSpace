import { afterEach, describe, expect, it, vi } from "vitest";
import { applyHull, fittedHullStats, generateWorld, hullTransferReason, refreshFittedStats, rememberYardFittings, findStation } from "../src/world";
import { blueprint, upgrade } from "../src/data/engineering";
import { hull } from "../src/data/hulls";
import { StationScene } from "../src/scenes/station";
import { borrowServiceCutter, returnServiceCutter } from "../src/core/serviceloan";
import { joinService } from "../src/core/service";
import { migrateSave, SAVE_VERSION } from "../src/save";
import type { Game } from "../src/game";
import * as wire from "../src/core/wire";
import * as dialog from "../src/core/dialog";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
function fixture() {
  vi.useFakeTimers(); vi.spyOn(wire, "post").mockResolvedValue(undefined);
  const w = generateWorld(404, { realGalaxy: true, maxLy: 20 }), p = w.player;
  const st = Object.values(w.systems).flatMap(s => s.stations).find(s => s.military && s.factionId !== "vex")!;
  p.systemId = findStation(w, st.id)!.sys.id; p.dockedAt = st.id; p.credits = 20000; p.cargo = {}; p.crew = [];
  p.materials = { iron: 60, nickel: 60, carbon: 60, germanium: 60, vanadium: 60, polonium: 60 };
  const station = new StationScene(); station.station = st;
  const g = { world: w, toast: vi.fn(), showHint: vi.fn(), spriteCache: new Map(), autosave: vi.fn(), setScene: vi.fn() } as unknown as Game;
  const buy = (label: string) => station.shipyardOptions(g).find(o => o.label.startsWith(label))!.action();
  return { w, p, st, g, station, buy };
}
describe("fittings across hull changes", () => {
  it("applies shield grades from the fitted hull consistently, without compounding on each visit", () => {
    const { p } = fixture(), bp = blueprint("shields")!;
    const capacities = [55, 60, 65];
    for (const cap of capacities) { expect(upgrade(p, bp)).toBe(true); expect(p.shieldMax).toBe(cap); expect(p.shield).toBe(cap); }
    const before = JSON.stringify(p); expect(upgrade(p, bp)).toBe(false); expect(JSON.stringify(p)).toBe(before);
    applyHull(p, p.hullId); expect(p.shieldMax).toBe(65);
  });
  it("keeps capacity independent of whether the capacitor or engineering was bought first", () => {
    const a = fixture(); a.buy("FIT SHIELD CAPACITOR"); for (let i = 0; i < 3; i++) upgrade(a.p, blueprint("shields")!);
    const b = fixture(); for (let i = 0; i < 3; i++) upgrade(b.p, blueprint("shields")!); b.buy("FIT SHIELD CAPACITOR");
    expect(a.p.shieldMax).toBe(85); expect(b.p.shieldMax).toBe(85); expect(fittedHullStats(a.p)).toEqual(fittedHullStats(b.p));
  });
  it("retains purchased cargo pods and flat booster plates through module fits, grades and hull swaps", () => {
    const { p, buy } = fixture(); buy("CARGO POD"); buy("CARGO POD"); buy("SHIELD BOOSTER"); buy("SHIELD BOOSTER");
    expect(p.yardFittings).toEqual({ cargo: 20, shield: 50 }); buy("FIT CARGO RACK"); buy("FIT SHIELD CAPACITOR"); upgrade(p, blueprint("cargo")!); upgrade(p, blueprint("shields")!);
    expect(p.cargoMax).toBe(90); expect(p.shieldMax).toBe(122);
    applyHull(p, "freighter"); expect(p.cargoMax).toBe(190); expect(p.shieldMax).toBe(150);
    applyHull(p, "scout"); expect(p.cargoMax).toBe(90); expect(p.shieldMax).toBe(122);
  });
  it("recovers an older save's remaining capacity surplus without changing its damaged condition", () => {
    const { w, p } = fixture(); p.cargoMax = 70; p.shieldMax = 108; p.hull = 32; p.shield = 11; p.systems[0].health = 47; p.fuel = 33;
    w.version = SAVE_VERSION; const loaded = migrateSave(JSON.parse(JSON.stringify(w)))!, q = loaded.player;
    rememberYardFittings(q); refreshFittedStats(q); expect(q.yardFittings).toEqual({ cargo: 30, shield: 58 });
    expect([q.hull,q.shield,q.fuel,q.systems[0].health]).toEqual([32,11,33,47]); expect(q.cargoMax).toBe(70); expect(q.shieldMax).toBe(108);
    applyHull(q, "freighter"); expect(q.cargoMax).toBe(170); expect(q.shieldMax).toBe(128);
    const again = migrateSave(JSON.parse(JSON.stringify(loaded)))!; refreshFittedStats(again.player); expect(again.player.yardFittings).toEqual({ cargo: 30, shield: 58 });
  });
  it("previews the actual fitted capacity without mutating player state", () => {
    const { p } = fixture(); p.cargoMax += 20; p.shieldMax += 25; const before = JSON.stringify(p);
    expect(fittedHullStats(p, "freighter")).toMatchObject({ cargoMax: 160, shieldMax: 95 }); expect(JSON.stringify(p)).toBe(before);
  });
  it("clamps transferred fuel after accounting for the auxiliary tank", () => {
    const { p, buy } = fixture(); buy("FIT AUXILIARY TANK"); applyHull(p, "freighter"); p.fuel = 130; applyHull(p, "scout");
    expect(p.fuelMax).toBe(hull("scout").fuelMax + 40); expect(p.fuel).toBe(130);
    p.fuel = 999; applyHull(p, "scout"); expect(p.fuel).toBe(p.fuelMax);
  });
  it("lets a purchased smaller hull use all transferred fittings and rejects overflow without spending", () => {
    const { p, g, station, buy } = fixture(); buy("FIT CARGO RACK"); buy("CARGO POD"); applyHull(p, "freighter"); p.cargo = { ore: 75 };
    station.buyHull(g, "scout", true); expect(p.hullId).toBe("scout"); expect(p.cargoMax).toBe(75); expect(p.cargo.ore).toBe(75); expect(p.fleet).toHaveLength(1);
    applyHull(p, "freighter"); p.cargo.ore = 76; const before = JSON.stringify(p); station.buyHull(g, "scout", false); expect(JSON.stringify(p)).toBe(before);
  });
  it("uses the same fitting check when boarding a parked hull", () => {
    const { p, g, st, station, buy } = fixture(); buy("CARGO POD"); applyHull(p, "freighter"); p.cargo = { ore: 50 };
    const stored = { hullId: "scout", stationId: st.id, hull: 45, torpedoes: 3 }; p.fleet = [stored];
    station.swapShip(g, stored); expect(p.hullId).toBe("scout"); expect(p.cargoMax).toBe(50); expect(p.cargo.ore).toBe(50); expect(p.hull).toBe(45);
  });
  it("reserves shore-leave berths in purchases, parked swaps, and liner travel", () => {
    const { w, p, st, g, station } = fixture(); applyHull(p, "freighter"); p.crew = [];
    p.shoreCrew = Array.from({ length: hull("scout").crewSlots + 1 }, (_, i) => ({ stationId: st.id, docks: 0, member: { name: `Crew ${i}`, role: "pilot", wage: 20, morale: 80, skill: 1 } }));
    expect(hullTransferReason(p, "scout")).toContain("RESERVED LEAVE BERTHS");
    const stored = { hullId: "scout", stationId: st.id, hull: 50, torpedoes: 0 }; p.fleet = [stored];
    const before = JSON.stringify(p); station.buyHull(g, "scout", false); station.swapShip(g, stored); expect(JSON.stringify(p)).toBe(before);
    stored.stationId = Object.values(w.systems).flatMap(s => s.stations).find(s => s.id !== st.id)!.id;
    const confirm = vi.spyOn(dialog, "confirmBox").mockReturnValue(true), beforeLiner = JSON.stringify(p); station.takeTheLiner(g);
    expect(confirm).not.toHaveBeenCalled(); expect(JSON.stringify(p)).toBe(beforeLiner);
  });
  it("keeps old and newly purchased flat fittings through cutter custody without modifying held damage", () => {
    const { w, p, st, buy } = fixture(); p.achievements = Array(10).fill("deed"); p.rep[st.factionId] = 30; joinService(w, st.id); p.service!.completed = 2;
    buy("CARGO POD"); buy("SHIELD BOOSTER"); p.hull = 43; p.shield = 19; borrowServiceCutter(w); const loan = p.service!.loan!;
    expect(p.cargoMax).toBe(70); expect(p.shieldMax).toBe(115); buy("CARGO POD"); buy("SHIELD BOOSTER"); returnServiceCutter(w, loan);
    expect(p.cargoMax).toBe(60); expect(p.shieldMax).toBe(100); expect(p.hull).toBe(43); expect(p.shield).toBe(19); expect(p.yardFittings).toEqual({ cargo: 20, shield: 50 });
  });
  it("does not fit or charge for the same captured module action twice", () => {
    const { p, station, g } = fixture(); const action = station.shipyardOptions(g).find(o => o.label === "FIT CARGO RACK")!.action;
    action(); const before = JSON.stringify(p); action(); expect(JSON.stringify(p)).toBe(before);
  });
});
