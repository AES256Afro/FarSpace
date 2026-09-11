import { afterEach, describe, expect, it, vi } from "vitest";
import { HelpScene } from "../src/scenes/help";
import { AlmanacScene } from "../src/scenes/almanac";
import { Game } from "../src/game";
import { generateWorld } from "../src/world";
import { FlightScene } from "../src/scenes/flight/index";
import { InteriorScene } from "../src/scenes/interior";
import { OrbitScene } from "../src/scenes/orbit";
import { WreckScene } from "../src/scenes/wreck";
import { RepairScene } from "../src/scenes/repair";
import { EncounterScene } from "../src/scenes/encounter";
import * as wire from "../src/core/wire";
import * as save from "../src/save";

afterEach(() => vi.restoreAllMocks());

function fixture() {
  vi.spyOn(wire, "fetchBases").mockResolvedValue([]);
  vi.spyOn(wire, "getCallsign").mockReturnValue(null);
  const world = generateWorld(396), p = world.player;
  p.dockedAt = null; p.crew = []; p.missions = [];
  const flight = new FlightScene(), keys = new Set<string>();
  const g = Object.assign(Object.create(Game.prototype), {
    world, sceneName: "", justUndocked: false, orbitPlanetIdx: 0, spriteCache: new Map(),
    scenes: { flight, interior: new InteriorScene(), orbit: new OrbitScene(), wreck: new WreckScene(), repair: new RepairScene(), encounter: new EncounterScene() },
    input: { wasPressed: (key: string) => keys.has(key), isDown: () => false, mousePressed: false, wheel: 0 },
    toast: vi.fn(), showHint: vi.fn(), autosave: vi.fn(),
  }) as Game;
  g.setScene("flight");
  const trader = flight.npcs.find(n => n.kind === "trader")!;
  expect(trader).toBeDefined();
  trader.disabled = true; trader.hull = 23;
  flight.sos = { trader, pirates: [], reward: 400, ttl: 120, kind: "disabled" };
  flight.repairJob = { npc: trader, crewName: "Ari", progress: 0.25, need: 30, wave: 2, kind: "repair" };
  flight.towing = trader;
  flight.escort = { trader, missionId: "keep-escort" };
  flight.convoy = { ships: [trader], reward: 100, lost: 0 };
  flight.loot = [{ x: 800, y: 900, commodityId: "parts", qty: 2, life: 40 }];
  flight.charges = [{ ax: 200, ay: 300, t: 1 }];
  const original = { ships: [...flight.npcs], sos: flight.sos, job: flight.repairJob, escort: flight.escort, convoy: flight.convoy, loot: flight.loot };
  return { g, flight, keys, trader, original };
}

function expectPreserved(f: ReturnType<typeof fixture>) {
  expect(f.g.sceneName).toBe("flight");
  expect(f.original.ships.every(n => f.flight.npcs.includes(n))).toBe(true);
  expect(f.flight.sos).toBe(f.original.sos);
  expect(f.flight.repairJob).toBe(f.original.job);
  expect(f.flight.repairJob?.progress).toBe(0.25);
  expect(f.flight.towing).toBe(f.trader);
  expect(f.flight.escort).toBe(f.original.escort);
  expect(f.flight.convoy).toBe(f.original.convoy);
  expect(f.flight.loot).toBe(f.original.loot);
  expect(f.flight.resumeNext).toBe(false);
}

function expectRebuilt(f: ReturnType<typeof fixture>) {
  expect(f.flight.npcs.length).toBeGreaterThan(0);
  expect(f.original.ships.some(n => f.flight.npcs.includes(n))).toBe(false);
  expect(f.flight.sos).toBeNull(); expect(f.flight.repairJob).toBeNull();
  expect(f.flight.towing).toBeNull(); expect(f.flight.escort).toBeNull();
  expect(f.flight.convoy).toBeNull(); expect(f.flight.loot).toEqual([]);
  expect(f.flight.charges).toEqual([]); expect(f.flight.resumeNext).toBe(false);
}

describe("flight continuity", () => {
  it.each(["CONTROLS", "HANDBOOK"])("keeps current contacts when returning from %s", label => {
    const f = fixture(); f.g.scenes.help = new HelpScene(); f.g.scenes.almanac = new AlmanacScene();
    f.flight.pauseOptions(f.g).find(o => o.label === label)!.act();
    expect(f.g.sceneName).toBe(label === "CONTROLS" ? "help" : "almanac");
    f.keys.add("Escape"); f.g.scene.update(f.g, 0); expectPreserved(f);
  });
  it.each(["Escape", "i", "e"])("keeps contacts and rescue work when leaving the ship with %s", key => {
    const f = fixture();
    f.g.setScene("interior");
    f.keys.add(key); f.g.scene.update(f.g, 0);
    expectPreserved(f);
  });

  it("keeps the same flight through an orbit visit", () => {
    const f = fixture(); f.g.setScene("orbit");
    f.keys.add("Escape"); f.g.scene.update(f.g, 0);
    expectPreserved(f);
  });

  it("keeps contacts after wreck boarding and an unavailable wreck", () => {
    const f = fixture(), scene = f.g.scenes.wreck as WreckScene;
    f.g.wreckTarget = { id: "continuity-wreck", name: "Quiet Hull", x: 0, y: 0, hazard: 0, looted: false, loot: [{ id: "parts", qty: 1 }] };
    scene.askedFor = f.g.wreckTarget.id;
    f.g.setScene("wreck"); f.keys.add("Escape"); scene.update(f.g, 0);
    expectPreserved(f);
    f.g.wreckTarget = null; f.g.setScene("wreck");
    expectPreserved(f);
  });

  it("retains a freighter when leaving a repair or encounter card", () => {
    const f = fixture(); f.g.repairTarget = f.trader;
    (f.g.scenes.repair as RepairScene).leave(f.g, false);
    expectPreserved(f);
    (f.g.scenes.encounter as EncounterScene).back(f.g);
    expectPreserved(f);
  });

  it("rebuilds a loaded world even with the same seed, system and a pending overlay return", () => {
    const f = fixture(); f.flight.resumeNext = true;
    f.g.world = JSON.parse(JSON.stringify(f.g.world));
    f.g.setScene("flight"); expectRebuilt(f);
    expect(f.g.repairTarget).toBeNull();
  });

  it("rebuilds after a system change that bypasses normal jump entry", () => {
    const f = fixture(); f.flight.resumeNext = true;
    f.g.world.player.systemId = f.g.world.systems[f.g.world.player.systemId].links[0];
    f.g.setScene("flight"); expectRebuilt(f);
  });

  it("stops the old flight frame immediately after loading with F9", () => {
    const f = fixture(), old = f.g.world.player;
    old.vx = 50; const x = old.x, y = old.y;
    const loaded = JSON.parse(JSON.stringify(f.g.world));
    vi.spyOn(save, "loadSave").mockReturnValue(loaded);
    f.keys.add("F9"); f.flight.update(f.g, 0.05);
    expect(f.g.world).toBe(loaded); expectRebuilt(f);
    expect(old.x).toBe(x); expect(old.y).toBe(y);
    expect(loaded.player.x).toBe(x); expect(loaded.player.y).toBe(y);
  });

  it("rebuilds on a real station departure even with a stale return request", () => {
    const f = fixture(); vi.spyOn(Math, "random").mockReturnValue(0.99);
    f.flight.resumeNext = true; f.g.justUndocked = true;
    f.g.setScene("flight"); expectRebuilt(f);
    expect(f.g.justUndocked).toBe(false);
  });

  it("does not reuse a population without a return request", () => {
    const f = fixture(); f.g.setScene("flight"); expectRebuilt(f);
  });

  it("drops old rescue references on a jump, then preserves the destination on a ship visit", () => {
    const f = fixture(), p = f.g.world.player;
    p.fuel = 10000; for (const fac of Object.keys(p.rep)) p.rep[fac] = 100;
    const destination = f.g.world.systems[p.systemId].links[0];
    f.flight.autopilot = true; f.flight.convoy = null;
    f.flight.doJump(f.g, destination, false);
    expect(p.systemId).toBe(destination); expectRebuilt(f);
    expect(f.flight.autopilot).toBe(true);
    const ships = [...f.flight.npcs];
    f.g.setScene("interior"); f.keys.add("Escape"); f.g.scene.update(f.g, 0);
    expect(ships.every(n => f.flight.npcs.includes(n))).toBe(true);
    expect(f.g.autosave).toHaveBeenCalledOnce();
  });

  it("ignores a wire response belonging to the previous world", async () => {
    const f = fixture();
    let finish!: (lights: wire.Light[]) => void;
    vi.spyOn(wire, "fetchWire").mockResolvedValue([]);
    vi.spyOn(wire, "fetchLights").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const lookup = vi.spyOn(wire, "lightsAt");
    f.g.world.realGalaxy = true; f.g.setScene("flight");
    f.g.world = JSON.parse(JSON.stringify(f.g.world)); f.g.world.realGalaxy = false;
    f.g.setScene("flight"); const ships = [...f.flight.npcs];
    finish([]); await Promise.resolve();
    expect(lookup).not.toHaveBeenCalled();
    expect(f.flight.npcs).toEqual(ships);
  });
});
