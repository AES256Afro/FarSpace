import { afterEach, describe, expect, it, vi } from "vitest";
import { Game } from "../src/game";
import { generateWorld, type WreckDef } from "../src/world";
import { decodeSave } from "../src/save";
import { prepareWreck } from "../src/core/derelicts";
import { CUT_FUEL, contestedWreck, cutSalvage, prepareSalvage, shareSalvage, wreckAvailable } from "../src/core/salvage";
import { MATERIAL_CAP } from "../src/data/engineering";
import { SalvageScene } from "../src/scenes/salvage";
import { WreckScene } from "../src/scenes/wreck";
import { EncounterScene } from "../src/scenes/encounter";
import { FlightScene } from "../src/scenes/flight/index";
import { systemContacts } from "../src/scenes/systemmap";
import * as wire from "../src/core/wire";

afterEach(() => vi.restoreAllMocks());
function fixture() {
  vi.spyOn(wire, "fetchBases").mockResolvedValue([]);
  vi.spyOn(wire, "getCallsign").mockReturnValue(null);
  const world = generateWorld(419), p = world.player;
  p.cargo = {}; p.materials = {}; p.crew = []; p.fuel = 50; p.cargoMax = 50; p.dockedAt = null;
  const wreck: WreckDef = { id: "salvage-test", name: "Lost Runner", x: 3000, y: 3000, hazard: 0.4, looted: false, loot: [{ id: "parts", qty: 2 }] };
  world.systems[p.systemId].wrecks.push(wreck);
  const boarding = prepareWreck(wreck, world.seed).state; boarding.survivor = false; boarding.claimResolved = true;
  const state = prepareSalvage(wreck, world.seed), keys = new Set<string>();
  const flight = new FlightScene(), salvage = new SalvageScene(), walk = new WreckScene();
  const g = Object.assign(Object.create(Game.prototype), { world, wreckTarget: wreck, sceneName: "", justUndocked: false,
    scenes: { flight, salvage, wreck: walk, encounter: new EncounterScene() },
    input: { wasPressed: (k: string) => keys.has(k), isDown: () => false, mouseX: 0, mouseY: 0, wheel: 0, mousePressed: false },
    toast: vi.fn(), showHint: vi.fn(), autosave: vi.fn(), save: vi.fn(),
  }) as Game;
  const cut = (index = 0, seconds = 4) => {
    for (let t = 0; t < seconds; t += 0.125) cutSalvage(wreck, world.seed, state.parts[index], p, 0.125);
  };
  return { world, p, wreck, boarding, state, cut, g, keys, flight, salvage, walk };
}

describe("wreck salvage", () => {
  it("generates finite, varied stocks without changing boarding contents", () => {
    const f = fixture(), before = JSON.stringify(f.boarding), variants = new Set<string>();
    for (let seed = 0; seed < 80; seed++) {
      const w = { ...f.wreck, salvage: undefined }, first = prepareSalvage(w, seed);
      expect(prepareSalvage({ ...w, salvage: undefined }, seed)).toEqual(first);
      expect(first.parts.every(p => p.remaining > 0 && p.remaining === p.total)).toBe(true);
      variants.add(JSON.stringify(first));
    }
    expect(variants.size).toBeGreaterThan(40);
    expect(JSON.stringify(f.boarding)).toBe(before);
  });
  it("recovers one unit for the stated time and fuel cost", () => {
    const f = fixture(), stock = f.state.parts[0].remaining;
    f.cut(0, 2); expect(f.p.cargo.parts).toBeUndefined(); expect(f.p.fuel).toBeCloseTo(49.75);
    f.cut(0, 2); expect(f.p.cargo.parts).toBe(1); expect(f.p.fuel).toBeCloseTo(50 - CUT_FUEL);
    expect(f.state.parts[0].remaining).toBe(stock - 1);
  });
  it("does not refill or charge for a stripped section", () => {
    const f = fixture(), part = f.state.parts[0]; f.cut(0, part.total * 4);
    const fuel = f.p.fuel; f.cut(0, 8);
    expect(f.p.cargo.parts).toBe(part.total); expect(f.p.fuel).toBe(fuel); expect(part.remaining).toBe(0);
    expect(prepareSalvage(f.wreck, 999).parts[0]).toBe(part);
  });
  it("stops at cargo capacity and keeps paid work intact", () => {
    const f = fixture(), part = f.state.parts[0]; f.cut(0, 2);
    f.p.cargoMax = 0; const fuel = f.p.fuel; f.cut(0, 5);
    expect(part.progress).toBe(0.5); expect(f.p.fuel).toBe(fuel); expect(part.remaining).toBe(part.total);
    f.p.cargoMax = 1; f.cut(0, 8); expect(f.p.cargo.parts).toBe(1); expect(f.p.fuel).toBeCloseTo(49.5);
  });
  it("does not discard fractional capacity overflow", () => {
    const f = fixture(); f.p.cargoMax = 0.5; f.cut();
    expect(f.p.fuel).toBe(50); expect(f.state.parts[0].progress).toBe(0);
  });
  it("uses material storage separately and stops at its limit", () => {
    const f = fixture(), part = f.state.parts[1]; f.p.cargoMax = 0; f.p.materials![part.resource] = MATERIAL_CAP - 1;
    f.cut(1, 12); expect(f.p.materials![part.resource]).toBe(MATERIAL_CAP);
    expect(part.remaining).toBe(part.total - 1); expect(f.p.fuel).toBeCloseTo(49.5); expect(f.p.cargo).toEqual({});
  });
  it("saves partial work, stock, and fuel through the actual save decoder", () => {
    const f = fixture(); f.cut(0, 5.5);
    const loaded = decodeSave(JSON.stringify(f.world)); expect(loaded.error).toBeNull();
    const w = loaded.world!.systems[f.p.systemId].wrecks.find(w => w.id === f.wreck.id)!;
    const state = prepareSalvage(w, f.world.seed); expect(state).toEqual(f.state);
    for (let i = 0; i < 20; i++) cutSalvage(w, f.world.seed, state.parts[0], loaded.world!.player, 0.125);
    expect(loaded.world!.player.cargo.parts).toBe(2); expect(loaded.world!.player.fuel).toBeCloseTo(49);
  });
  it("exhausts fuel without going negative and resumes after refueling", () => {
    const f = fixture(); f.p.fuel = 0.125; f.cut(0, 10);
    expect(f.p.fuel).toBe(0); expect(f.state.parts[0].progress).toBe(0.25); expect(f.p.cargo.parts).toBeUndefined();
    f.p.fuel = 1; f.cut(0, 3); expect(f.p.cargo.parts).toBe(1); expect(f.p.fuel).toBeCloseTo(0.625);
  });
  it("an available engineer cuts faster for the same fuel", () => {
    const f = fixture(); f.p.crew = [{ role: "engineer", sick: false } as any]; f.cut(0, 2.75);
    expect(f.p.cargo.parts).toBeUndefined(); cutSalvage(f.wreck, f.world.seed, f.state.parts[0], f.p, 0.05);
    expect(f.p.cargo.parts).toBe(1); expect(f.p.fuel).toBeCloseTo(49.5);
  });
  it("checks survivors before consuming fuel or removing parts", () => {
    const f = fixture(); f.boarding.survivor = true; f.cut();
    expect(f.p.fuel).toBe(50); expect(f.state.parts[0].progress).toBe(0);
    f.boarding.rescued = true; f.cut(); expect(f.p.cargo.parts).toBe(1);
  });
  it("keeps old cleared wrecks and occupied arks from gaining scrap", () => {
    const f = fixture();
    for (const w of [{ ...f.wreck, looted: true, salvage: undefined }, { ...f.wreck, id: "ark-sleepers", salvage: undefined }]) {
      expect(prepareSalvage(w, 419).parts).toEqual([]);
    }
  });
  it("settles contested claims before cutting and divides exterior salvage", () => {
    const f = fixture(); f.boarding.claimResolved = false;
    for (let i = 0; !contestedWreck(f.wreck); i++) f.wreck.id = `claim-${i}`;
    f.cut(); expect(f.p.fuel).toBe(50);
    const totals = f.state.parts.map(p => p.total); shareSalvage(f.wreck, 419); f.boarding.claimResolved = true;
    expect(f.state.parts.map(p => p.remaining)).toEqual(totals.map(n => Math.ceil(n / 2)));
    f.cut(); expect(f.p.cargo.parts).toBe(1);
    shareSalvage(f.wreck, 419, true); expect(f.state.parts.every(p => p.remaining === 0)).toBe(true);
  });
  it("keeps cleared interiors on the map until exterior salvage is gone", () => {
    const f = fixture(); f.p.x = f.wreck.x; f.p.y = f.wreck.y; f.wreck.looted = true;
    expect(wreckAvailable(f.wreck)).toBe(true);
    expect(systemContacts(f.g).find(c => c.id === `wreck:${f.wreck.id}`)?.detail).toContain("EXTERIOR SALVAGE");
    f.state.parts.forEach(p => p.remaining = 0);
    expect(wreckAvailable(f.wreck)).toBe(false);
    expect(systemContacts(f.g).some(c => c.id === `wreck:${f.wreck.id}`)).toBe(false);
    f.wreck.looted = false; expect(wreckAvailable(f.wreck)).toBe(true);
  });
});

describe("salvage scene and flight continuity", () => {
  it("opens from flight, cuts, pauses, and returns to the same population and jobs", () => {
    const f = fixture(); f.g.setScene("flight");
    const npcs = f.flight.npcs, trader = npcs.find(n => n.kind === "trader")!;
    const sos = f.flight.sos = { trader, pirates: [], reward: 100, ttl: 120, kind: "disabled" };
    f.p.x = f.wreck.x; f.p.y = f.wreck.y; f.flight.tryInteract(f.g);
    expect(f.g.sceneName).toBe("salvage"); f.salvage.cursor = 1; f.salvage.choose(f.g);
    for (let i = 0; i < 8; i++) f.salvage.update(f.g, 0.125);
    f.salvage.choose(f.g); const paid = f.p.fuel; f.salvage.update(f.g, 1);
    expect(f.p.fuel).toBe(paid); expect(f.state.parts[0].progress).toBe(0.25);
    f.salvage.leave(f.g); expect(f.g.sceneName).toBe("flight");
    expect(f.flight.npcs).toBe(npcs); expect(f.flight.sos).toBe(sos);
    f.flight.tryInteract(f.g); expect(f.g.sceneName).toBe("salvage"); expect(f.state.parts[0].progress).toBe(0.25);
  });
  it("boarding returns to salvage and preserves both sets of work", () => {
    const f = fixture(); f.g.setScene("flight"); f.g.setScene("salvage"); f.walk.askedFor = f.wreck.id;
    f.salvage.board(f.g); expect(f.g.sceneName).toBe("wreck");
    f.walk.state.power = 83; f.walk.leave(f.g); expect(f.g.sceneName).toBe("salvage");
    expect(f.boarding.power).toBe(83); expect(f.salvage.parts).toBe(f.state.parts);
    f.salvage.board(f.g); expect(f.walk.state.power).toBe(83);
  });
  it("does not move selection when the pointer crosses rows or activate the footer", () => {
    const f = fixture(); f.g.setScene("salvage"); f.keys.add("ArrowDown"); f.salvage.update(f.g, 0); f.keys.clear();
    f.g.input.mouseX = 190; f.g.input.mouseY = 60; f.salvage.update(f.g, 0); expect(f.salvage.cursor).toBe(1);
    f.g.input.mouseY = 239; f.g.input.mousePressed = true; f.salvage.update(f.g, 0); expect(f.salvage.active).toBeNull();
    f.g.input.mouseY = 56 + 2 * 32 + 10; f.salvage.update(f.g, 0); expect(f.salvage.active).toBe(f.state.parts[1]);
  });
});
