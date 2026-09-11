import { afterEach, describe, expect, it, vi } from "vitest";
import { generateWorld, lawLevelFor } from "../src/world";
import { LAW_COOLDOWN, closeLawCases, lawActive, lawSettlement, recordOffence, settleLaw, tickLawCooldown } from "../src/core/law";
import { Game } from "../src/game";
import { FlightScene } from "../src/scenes/flight/index";
import { EncounterScene } from "../src/scenes/encounter";
import { updateBullets, updateNpcs, updatePlatforms } from "../src/scenes/flight/ai";
import type { Npc, Platform } from "../src/scenes/flight/types";
import { migrateSave } from "../src/save";
import { RNG } from "../src/core/rng";
import * as wire from "../src/core/wire";

afterEach(() => vi.restoreAllMocks());

function world() {
  const w = generateWorld(405);
  const sys = Object.values(w.systems).find(s => s.factionId !== "vex" && s.stations.length)!;
  w.player.systemId = sys.id; w.player.dockedAt = null;
  w.player.rep[sys.factionId] = -85; w.player.wanted = 1;
  w.player.crew = []; w.player.missions = []; w.player.credits = 10000;
  return w;
}
function quiet(w: ReturnType<typeof world>, seconds = LAW_COOLDOWN) {
  for (let i = 0; i < seconds * 20; i++) tickLawCooldown(w, 0.05, false);
}
function fixture() {
  vi.spyOn(wire, "fetchBases").mockResolvedValue([]);
  vi.spyOn(wire, "getCallsign").mockReturnValue(null);
  const w = world(), flight = new FlightScene(), keys = new Set<string>();
  const g = Object.assign(Object.create(Game.prototype), {
    world: w, sceneName: "", justUndocked: false, spriteCache: new Map(),
    scenes: { flight, encounter: new EncounterScene() },
    input: { wasPressed: (key: string) => keys.has(key), isDown: () => false, mousePressed: false, wheel: 0, mouseX: -1, mouseY: -1 },
    toast: vi.fn(), showHint: vi.fn(), autosave: vi.fn(),
  }) as Game;
  g.setScene("flight"); flight.npcs = []; flight.platforms = []; flight.bullets = [];
  flight.encounterTimer = 10000; flight.spawnTimer = 10000;
  return { g, flight, w, p: w.player, keys, sys: w.systems[w.player.systemId] };
}
function npc(kind: Npc["kind"], x: number, y: number): Npc {
  return { kind, x, y, vx: 0, vy: 0, angle: 0, hull: 100, hullMax: 100, fireCd: 0, targetIdx: 0 };
}

describe("ending patrol pursuit", () => {
  it("clears maximum heat and outlaw pursuit after a real minute, without changing standing", () => {
    const w = world(), fid = w.systems[w.player.systemId].factionId;
    quiet(w, 59); expect(lawLevelFor(w, w.player.systemId)).toBe(2);
    expect(w.player.lawQuiet).toBeCloseTo(59);
    quiet(w, 1);
    expect(w.player.wanted).toBe(0); expect(w.player.rep[fid]).toBe(-85);
    expect(lawLevelFor(w, w.player.systemId)).toBe(0); expect(lawActive(w)).toBe(false);
    expect(w.player.credits).toBe(10000);
    quiet(w, 120); expect(lawLevelFor(w, w.player.systemId)).toBe(0);
  });
  it("also closes old negative-reputation pursuit with no wanted heat", () => {
    const w = world(); w.player.wanted = 0;
    quiet(w); expect(lawLevelFor(w, w.player.systemId)).toBe(0);
  });
  it("resets on contact and never erodes reputation while being chased", () => {
    const w = world(), before = { ...w.player.rep };
    quiet(w, 25); tickLawCooldown(w, 0.05, true);
    expect(w.player.lawQuiet).toBe(0);
    for (let i = 0; i < 180; i++) tickLawCooldown(w, 1, true);
    expect(w.player.rep).toEqual(before); expect(w.player.wanted).toBe(1);
    quiet(w, 59); expect(lawLevelFor(w, w.player.systemId)).toBe(2);
  });
  it("carries the original case and elapsed time through a saved jump to pirate space", () => {
    let w = world(); const fid = w.systems[w.player.systemId].factionId, home = w.player.systemId;
    quiet(w, 30); w = migrateSave(JSON.parse(JSON.stringify(w)))!;
    w.player.systemId = Object.values(w.systems).find(s => s.factionId === "vex")!.id;
    quiet(w, 30); w.player.systemId = home;
    expect(w.player.lawStandDown?.[fid]).toBe(true); expect(lawLevelFor(w, home)).toBe(0);
  });
  it("a new offence reopens the faction case and restarts the clock", () => {
    const w = world(); quiet(w); recordOffence(w, 0.15);
    expect(lawLevelFor(w, w.player.systemId)).toBe(2); expect(w.player.lawQuiet).toBe(0);
    quiet(w, 20); recordOffence(w, 0.2); expect(w.player.lawQuiet).toBe(0);
  });
  it("ignores invalid time and caps a large frame instead of granting an instant escape", () => {
    const w = world();
    for (const dt of [0, -1, NaN, Infinity]) tickLawCooldown(w, dt, false);
    expect(w.player.lawQuiet).toBeUndefined();
    tickLawCooldown(w, 9999, false); expect(w.player.lawQuiet).toBe(1);
  });
  it("quotes and settles all open cases once, preserves positive standing, and logs the cost", () => {
    const w = world(), fid = w.systems[w.player.systemId].factionId;
    w.player.lawCases = [fid, "ring"]; w.player.rep.ring = 40;
    const q = lawSettlement(w)!;
    expect(q.cost).toBe(3550); expect(settleLaw(w, q)).toBeNull();
    expect(w.player.credits).toBe(6450); expect(w.player.rep[fid]).toBe(0); expect(w.player.rep.ring).toBe(40);
    expect(lawLevelFor(w, w.player.systemId)).toBe(0);
    expect(settleLaw(w, q)).toContain("RECORD CHANGED"); expect(w.player.credits).toBe(6450);
  });
  it("refuses insufficient funds and changed records or systems", () => {
    const w = world(), q = lawSettlement(w)!;
    w.player.credits = 0; expect(settleLaw(w, q)).toContain("NOT ENOUGH"); expect(w.player.wanted).toBe(1);
    w.player.credits = 10000; w.player.rep[q.factions[0]] -= 1;
    expect(settleLaw(w, q)).toContain("RECORD CHANGED"); expect(w.player.credits).toBe(10000);
    const next = lawSettlement(w)!;
    w.player.systemId = Object.values(w.systems).find(s => s.id !== w.player.systemId)!.id;
    expect(settleLaw(w, next)).toContain("RECORD CHANGED");
  });
  it("offers restitution after free cooling, with no payment needed for a clean record", () => {
    const w = world(); quiet(w);
    const q = lawSettlement(w)!; expect(q.cost).toBe(2750);
    expect(settleLaw(w, q)).toBeNull(); expect(lawSettlement(w)).toBeNull();
  });
  it("offers no lawful cashier in pirate space, while heat can still cool there", () => {
    const w = world(); w.player.systemId = Object.values(w.systems).find(s => s.factionId === "vex")!.id;
    expect(lawSettlement(w)).toBeNull(); quiet(w); expect(w.player.wanted).toBe(0);
  });
});

describe("flight ceasefire", () => {
  it("counts live law ships and severe-warrant platforms, but not unrelated pirates", () => {
    const { g, flight, p } = fixture();
    flight.npcs = [npc("patrol", p.x + 899, p.y)]; expect(flight.lawContact(g)).toBe(true);
    flight.npcs[0].x = p.x + 901; expect(flight.lawContact(g)).toBe(false);
    flight.npcs = [npc("fighter", p.x, p.y + 500)]; expect(flight.lawContact(g)).toBe(true);
    flight.npcs[0].disabled = true; expect(flight.lawContact(g)).toBe(false);
    flight.npcs = [npc("pirate", p.x, p.y)]; expect(flight.lawContact(g)).toBe(false);
    flight.platforms = [{ x: p.x + 499, y: p.y, hostileToPlayer: false } as Platform];
    expect(flight.lawContact(g)).toBe(true); p.wanted = 0.6; p.rep = {};
    expect(flight.lawContact(g)).toBe(false);
  });
  it("patrols, fighters and law platforms stop firing after settlement", () => {
    const { g, flight, p, sys, w } = fixture(), st = sys.stations[0];
    p.x = Math.cos(st.angle) * st.orbit; p.y = Math.sin(st.angle) * st.orbit;
    flight.npcs = [npc("patrol", p.x + 90, p.y), npc("fighter", p.x, p.y + 90)];
    flight.platforms = [{ anchor: "station", anchorIdx: 0, orbitR: 60, orbitAngle: 0, orbitSpeed: 0, x: p.x + 60, y: p.y, fireCd: 0, hostileToPlayer: false }];
    updateNpcs(flight, g, 0.05); updatePlatforms(flight, g, 0.05);
    expect(flight.bullets.filter(b => b.hostile && b.lawFaction)).toHaveLength(3);
    const pirateShot = { x: p.x + 200, y: p.y, vx: 0, vy: 0, life: 1, hostile: true, dmg: 1 };
    flight.bullets.push(pirateShot);
    settleLaw(w, lawSettlement(w)!); flight.clearLawFire(g);
    expect(flight.bullets).toEqual([pirateShot]);
    flight.npcs.forEach(n => n.fireCd = 0); flight.platforms[0].fireCd = 0;
    updateNpcs(flight, g, 0.05); updatePlatforms(flight, g, 0.05);
    expect(flight.bullets).toEqual([pirateShot]);
  });
  it("a player hit after cooling reopens pursuit", () => {
    const { g, flight, p, w } = fixture(); quiet(w);
    const trader = npc("trader", p.x + 100, p.y); flight.npcs = [trader];
    flight.bullets = [{ x: trader.x, y: trader.y, vx: 0, vy: 0, life: 1, hostile: false, fromPlayer: true, dmg: 1 }];
    updateBullets(flight, g, 0.01);
    expect(lawLevelFor(w, p.systemId)).toBe(2); expect(p.wanted).toBe(0.15);
  });
  it("U and the pause menu expose the same guarded payment and preserve flight contacts", () => {
    const { g, flight, p, w, keys } = fixture();
    const patrol = npc("patrol", p.x + 100, p.y); flight.npcs = [patrol];
    keys.add("u"); flight.update(g, 0.05); keys.clear();
    expect(g.sceneName).toBe("encounter");
    const card = g.scenes.encounter as EncounterScene;
    const pay = card.enc.options[0]; expect(pay.label).toContain("3550CR");
    pay.result(g, new RNG(1)); expect(p.credits).toBe(6450);
    pay.result(g, new RNG(1)); expect(p.credits).toBe(6450);
    card.back(g); expect(flight.npcs).toEqual([patrol]); expect(g.sceneName).toBe("flight");
    expect(flight.pauseOptions(g)[1].label).toBe("TRAFFIC CONTROL (U)");
    recordOffence(w, 1); flight.contactTrafficControl(g);
    const oldPay = card.enc.options[0]; g.world = JSON.parse(JSON.stringify(w));
    oldPay.result(g, new RNG(1)); expect(g.world.player.credits).toBe(6450);
  });
  it("free cooling restores civilian entry; restitution restores military entry", () => {
    const { g, flight, w, sys } = fixture();
    const st = { ...sys.stations[0], military: false };
    expect(flight.dockAt(g, st)).toBe(false); quiet(w);
    expect(flight.dockAt(g, st)).toBe(true); flight.docking = null;
    st.military = true; expect(flight.dockAt(g, st)).toBe(false);
    settleLaw(w, lawSettlement(w)!); expect(flight.dockAt(g, st)).toBe(true);
  });
  it("existing amnesty closes saved cases as well as wanted heat", () => {
    const w = world(); quiet(w, 20); closeLawCases(w);
    expect(lawActive(w)).toBe(false); expect(w.player.lawQuiet).toBe(0);
  });
  it("keeps every pause action on screen and a stationary pointer does not steal keyboard selection", () => {
    const { g, flight, keys } = fixture();
    flight.paused = true; flight.pauseCursor = flight.pauseOptions(g).length - 1;
    const rows = flight.pauseRows(g);
    expect(rows.at(-1)!.option.label).toBe("SAVE AND QUIT TO TITLE");
    expect(rows.every(r => r.y >= 110 && r.y + 9 < 230)).toBe(true);
    g.input.mouseX = 240; g.input.mouseY = 110;
    flight.pausePointerX = 240; flight.pausePointerY = 110;
    flight.pauseCursor = 0; keys.add("ArrowDown"); flight.update(g, 0.05);
    expect(flight.pauseCursor).toBe(1);
  });

});
