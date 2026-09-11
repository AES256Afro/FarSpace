import { afterEach, describe, expect, it, vi } from "vitest";
import { borrowServiceCutter, hullTransferReason, loanBorrowReason, loanHullChangeReason, loanReturnReason, loanSummary, plotLoanDepot, returnServiceCutter } from "../src/core/serviceloan";
import { joinService } from "../src/core/service";
import { applyHull, findStation, generateWorld } from "../src/world";
import { hull, HULLS, SERVICE_CUTTER } from "../src/data/hulls";
import { migrateSave, SAVE_VERSION } from "../src/save";
import { Game } from "../src/game";
import { ServiceScene } from "../src/scenes/service";
import { StationScene } from "../src/scenes/station";
import { StationWalkScene } from "../src/scenes/stationwalk";

function fixture() {
  const w = generateWorld(401, { realGalaxy: true, maxLy: 20 }), p = w.player;
  const home = Object.values(w.systems).flatMap(s => s.stations).find(st => st.military && st.factionId !== "vex")!;
  p.tutorial = -1; p.achievements = Array(10).fill("deed"); p.rep[home.factionId] = 20;
  const arrive = (id: string) => { const f = findStation(w, id)!; p.systemId = f.sys.id; p.dockedAt = id; };
  arrive(home.id); joinService(w, home.id); p.service!.completed = 2;
  p.shipName = "The Long Way"; p.paint = "#abc123"; p.hull = 73; p.shield = 27; p.fuel = 44;
  p.systems[0].health = 63; p.breaches = [{ tx: 2, ty: 3 }]; p.fires = [{ tx: 4, ty: 5 }];
  p.torpedoes = 4; p.wear = 22; p.berthLog = [{ stationId: home.id, t: 0, wear: 4, cost: 10 }];
  p.hullHistory = { previous: "Ari Sen", quirk: "a pencil mark" }; p.commissionedAt = 17;
  p.crew = [{ name: "Mina Sol", role: "pilot", skill: 2, morale: 70, wage: 30, docks: 5, loyalty: 1 }];
  p.cargo = { food: 3 }; p.furnishings = ["simrig", "plant"]; p.voiceName = "Kettle";
  return { w, p, home, arrive };
}
function game(f: ReturnType<typeof fixture>) {
  const keys = new Set<string>();
  const g = Object.assign(Object.create(Game.prototype), { world: f.w, spriteCache: new Map(), sceneName: "service",
    scenes: { service: new ServiceScene(), station: new StationScene(), stationwalk: new StationWalkScene() },
    input: { wasPressed: (key: string) => keys.has(key), isDown: () => false, mousePressed: false, mouseX: 0, mouseY: 0, wheel: 0 },
    toast: vi.fn(), autosave: vi.fn(), showHint: vi.fn(), save: vi.fn(), load: vi.fn(),
  }) as Game;
  (g.scenes.station as StationScene).station = f.home;
  return { g, keys };
}
afterEach(() => vi.restoreAllMocks());
describe("service cutter custody", () => {
  it("has a playable hull without adding a purchase or trade-in entry", () => {
    expect(hull(SERVICE_CUTTER.id)).toBe(SERVICE_CUTTER); expect(HULLS.some(h => h.id === SERVICE_CUTTER.id)).toBe(false);
    expect(SERVICE_CUTTER.crewSlots).toBe(3); expect(SERVICE_CUTTER.cargoMax).toBe(60);
    const f = fixture(), { g } = game(f); const before = JSON.stringify(f.p);
    (g.scenes.station as StationScene).buyHull(g, SERVICE_CUTTER.id, false); expect(JSON.stringify(f.p)).toBe(before);
  });
  it("requires grade, standing, current posting, and room for cargo and reserved berths", () => {
    const { w, p, home } = fixture(); p.service!.completed = 1; expect(loanBorrowReason(w)).toContain("TWO FILED");
    p.service!.completed = 2; p.rep[home.factionId] = -1; expect(loanBorrowReason(w)).toContain("BELOW ZERO"); p.rep[home.factionId] = 20;
    p.cargo = { ore: 61 }; expect(borrowServiceCutter(w)).toContain("HOLD NEEDS 61"); expect(p.service!.loan).toBeUndefined();
    p.modules = ["rack"]; expect(loanBorrowReason(w)).toBeNull(); p.cargo = {};
    p.shoreCrew = Array.from({ length: 3 }, () => ({ member: { ...p.crew[0] }, stationId: home.id, docks: 0 }));
    expect(loanBorrowReason(w)).toContain("RESERVED LEAVE BERTHS NEED 4"); p.shoreCrew = [];
    p.service!.stationId = "another"; expect(loanBorrowReason(w)).toContain("CURRENT SERVICE POSTING");
  });
  it("keeps the original ship separate from the fleet and transfers the captain's equipment and people", () => {
    const { w, p, home } = fixture(); const cargo = p.cargo, crew = p.crew, credit = p.credits;
    p.fleet = [{ hullId: "freighter", stationId: home.id, hull: 170, torpedoes: 3, name: "Second Ship" }]; const fleet = JSON.stringify(p.fleet);
    borrowServiceCutter(w); const loan = p.service!.loan!;
    expect(p.hullId).toBe(SERVICE_CUTTER.id); expect(p.shipName).toBe("WATCH 1"); expect(p.fuel).toBe(180); expect(p.torpedoes).toBe(0);
    expect(p.cargo).toBe(cargo); expect(p.crew).toBe(crew); expect(p.voiceName).toBe("Kettle"); expect(p.furnishings).toEqual(["simrig", "plant"]);
    expect(p.credits).toBe(credit); expect(JSON.stringify(p.fleet)).toBe(fleet);
    expect(loan.held.shipName).toBe("The Long Way"); expect(loan.held.hull).toBe(73); expect(loan.held.systems[0].health).toBe(63);
    p.systems[0].health = 12; expect(loan.held.systems[0].health).toBe(63);
    const after = JSON.stringify(p); borrowServiceCutter(w); expect(JSON.stringify(p)).toBe(after);
  });
  it("restores the held hull's exact condition and supplies and keeps equipment acquired on loan", () => {
    const { w, p } = fixture(); const before = structuredClone(p); borrowServiceCutter(w); const loan = p.service!.loan!;
    p.hull = 19; p.shield = 2; p.fuel = 6; p.torpedoes = 3; p.cargo.parts = 2; p.modules = ["tank", "rack", "booster"];
    p.engineering = { cargo: 1, shields: 1 }; p.crew[0].morale = 88; p.wear = 70; p.shipName = "Another Watch";
    const credits = p.credits; expect(returnServiceCutter(w, loan)).toContain("NO RETURN CHARGE");
    expect(p.hullId).toBe(before.hullId); expect(p.shipName).toBe(before.shipName); expect(p.paint).toBe(before.paint);
    expect(p.hull).toBe(73); expect(p.shield).toBe(27); expect(p.fuel).toBe(44); expect(p.torpedoes).toBe(7);
    expect(p.systems).toEqual(before.systems); expect(p.breaches).toEqual(before.breaches); expect(p.fires).toEqual(before.fires);
    expect(p.wear).toBe(22); expect(p.berthLog).toEqual(before.berthLog); expect(p.hullHistory).toEqual(before.hullHistory); expect(p.commissionedAt).toBe(17);
    expect(p.fuelMax).toBe(140); expect(p.cargoMax).toBe(70); expect(p.shieldMax).toBe(72);
    expect(p.cargo).toEqual({ food: 3, parts: 2 }); expect(p.crew[0].morale).toBe(88); expect(p.credits).toBe(credits);
    expect(p.service!.loan).toBeUndefined(); expect(p.service!.loansReturned).toBe(1);
    const after = JSON.stringify(p); returnServiceCutter(w, loan); expect(JSON.stringify(p)).toBe(after);
  });
  it("refuses a return that would lose cargo or crew and leaves the entire state intact", () => {
    const { w, p } = fixture(); borrowServiceCutter(w); const loan = p.service!.loan!; p.cargo = { ore: 41 };
    const before = JSON.stringify(p); expect(returnServiceCutter(w, loan)).toContain("HOLD NEEDS 41"); expect(JSON.stringify(p)).toBe(before);
    p.modules = ["rack"]; expect(loanReturnReason(w)).toBeNull();
    p.crew.push({ ...p.crew[0], name: "Ari Sen" }); const crowd = JSON.stringify(p);
    expect(returnServiceCutter(w, loan)).toContain("BERTHS NEED 2"); expect(JSON.stringify(p)).toBe(crowd);
  });
  it("requires the actual depot but accepts return after loss of standing or depot ownership", () => {
    const { w, p, home, arrive } = fixture(); borrowServiceCutter(w); const loan = p.service!.loan!;
    const other = Object.values(w.systems).flatMap(s => s.stations).find(st => st.id !== home.id)!;
    arrive(other.id); expect(returnServiceCutter(w, loan)).toContain("RETURN AT"); expect(p.service!.loan).toBe(loan);
    arrive(home.id); p.rep[home.factionId] = -80; home.factionId = "vex";
    expect(loanReturnReason(w)).toBeNull(); expect(returnServiceCutter(w, loan)).toContain("NO RETURN CHARGE");
  });
  it("plots the held ship and preserves custody when its route is closed", () => {
    const { w, p, home, arrive } = fixture(); borrowServiceCutter(w); const loan = p.service!.loan!;
    const other = Object.values(w.systems).flatMap(s => s.stations).find(st => st.id !== home.id)!; arrive(other.id);
    expect(plotLoanDepot(w)).toBe(true); expect(p.navStationId).toBe(home.id); expect(loanSummary(w)).toContain("THE LONG WAY HELD AT");
    const sys = findStation(w, home.id)!.sys; sys.permit = true; p.rep[sys.factionId] = 20;
    expect(plotLoanDepot(w)).toBe(false); expect(p.service!.loan).toBe(loan);
  });
  it("survives saves without sharing objects and refuses an old callback or changed active hull", () => {
    const { w, p } = fixture(); borrowServiceCutter(w); const old = p.service!.loan!; w.version = SAVE_VERSION;
    const loaded = migrateSave(JSON.parse(JSON.stringify(w)))!, loan = loaded.player.service!.loan!;
    expect(loan.held.systems).not.toBe(old.held.systems); expect(loan.held.systems).toEqual(old.held.systems);
    expect(returnServiceCutter(loaded, old)).toContain("NO LONGER"); loaded.player.hullId = "freighter";
    expect(returnServiceCutter(loaded, loan)).toContain("DOES NOT MATCH"); expect(loaded.player.service!.loan).toBe(loan);
    loaded.player.hullId = SERVICE_CUTTER.id; returnServiceCutter(loaded, loan); expect(loaded.player.hull).toBe(73);
  });
  it("does not copy borrowed ammo or reset the original hull through repeated loans", () => {
    const { w, p } = fixture(); borrowServiceCutter(w); returnServiceCutter(w, p.service!.loan!);
    expect(p.torpedoes).toBe(4); expect(borrowServiceCutter(w)).toContain("FILE ANOTHER ASSIGNMENT");
    expect(p.service!.loan).toBeUndefined(); p.service!.completed++; borrowServiceCutter(w); expect(p.service!.loan!.serial).toBe(2); expect(p.torpedoes).toBe(0);
    returnServiceCutter(w, p.service!.loan!); expect(p.torpedoes).toBe(4); expect(p.hull).toBe(73); expect(p.systems[0].health).toBe(63);
  });
  it("blocks hull purchases, swaps and liner travel while leaving the loan and fleet intact", () => {
    const f = fixture(), { w, p, home } = f, { g } = game(f), station = g.scenes.station as StationScene;
    p.credits = 100000; const stored = { hullId: "carrier", hull: 260, torpedoes: 0, stationId: home.id };
    p.fleet = [stored]; borrowServiceCutter(w); const before = JSON.stringify(p);
    station.buyHull(g, "freighter", false); station.buyHull(g, "freighter", true); station.swapShip(g, stored); station.takeTheLiner(g);
    expect(JSON.stringify(p)).toBe(before); expect(loanHullChangeReason(p)).toContain("ON LOAN");
    expect(g.toast).toHaveBeenCalledTimes(4);
  });
  it("rejects stale or borrowed parked hull objects before scrap, charter or swap", () => {
    const f = fixture(), { g } = game(f), station = g.scenes.station as StationScene;
    const stale = { hullId: "carrier", hull: 260, torpedoes: 0, stationId: f.home.id };
    const before = JSON.stringify(f.p); station.scrapHull(g, stale); station.putToWork(g, stale); station.swapShip(g, stale);
    expect(JSON.stringify(f.p)).toBe(before);
    const borrowed = { ...stale, hullId: SERVICE_CUTTER.id }; f.p.fleet = [borrowed]; const after = JSON.stringify(f.p);
    station.scrapHull(g, borrowed); station.putToWork(g, borrowed); station.swapShip(g, borrowed); expect(JSON.stringify(f.p)).toBe(after);
  });
  it("exposes a return action at the shipyard even when the depot has changed faction", () => {
    const f = fixture(), { w, p, home } = f, { g } = game(f); borrowServiceCutter(w); home.factionId = "vex";
    const opts = (g.scenes.station as StationScene).shipyardOptions(g); expect(opts[0].label).toBe("RETURN SERVICE CUTTER");
    opts[0].action(); expect(p.hullId).toBe("scout"); expect(p.service!.loan).toBeUndefined(); expect(g.autosave).toHaveBeenCalledOnce();
  });
  it("scrolls the loan and depot actions into view and returns with pointer input", () => {
    const f = fixture(), { g, keys } = game(f), office = g.scenes.service as ServiceScene; office.enter(g);
    const borrowIndex = office.actions(g).findIndex(a => a.label === "REQUEST A CUTTER ON LOAN");
    for (let i = 0; i < borrowIndex; i++) { keys.add("ArrowDown"); office.update(g, 0); keys.clear(); }
    keys.add("Enter"); office.update(g, 0); keys.clear(); expect(f.p.hullId).toBe(SERVICE_CUTTER.id);
    const retIndex = office.actions(g).findIndex(a => a.label === "RETURN THE SERVICE CUTTER");
    for (let i = 0; i < retIndex; i++) { keys.add("ArrowDown"); office.update(g, 0); keys.clear(); }
    g.input.mouseX = 300; g.input.mouseY = 48 + (retIndex - office.scroll) * 25 + 5; g.input.mousePressed = true;
    office.update(g, 0); expect(f.p.hullId).toBe("scout"); expect(f.p.service!.loansReturned).toBe(1);
  });
  it("checks fitted capacity without mutating the current ship or its systems", () => {
    const { p } = fixture(); p.modules = ["rack"]; p.engineering = { cargo: 2 }; p.cargo = { ore: 75 };
    const before = JSON.stringify(p); expect(hullTransferReason(p, "scout")).toBeNull(); expect(JSON.stringify(p)).toBe(before);
    p.cargo.ore = 76; expect(hullTransferReason(p, "scout")).toContain("HAS 75");
  });
});
