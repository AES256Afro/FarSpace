import { afterEach, describe, expect, it, vi } from "vitest";
import { generateWorld, genCrewCandidate } from "../src/world";
import { breakPiratePassage, grantPiratePassage, piratePassageRemaining, piratesPeaceful, tickPiratePassage } from "../src/core/piracy";
import { Game } from "../src/game";
import { FlightScene } from "../src/scenes/flight/index";
import { EncounterScene } from "../src/scenes/encounter";
import { updateBullets, updateNpcs, updatePlatforms } from "../src/scenes/flight/ai";
import { fireTorpedo, updateComms, updateTorpedoes } from "../src/scenes/flight/combat";
import type { Npc } from "../src/scenes/flight/types";
import { RNG } from "../src/core/rng";
import { migrateSave } from "../src/save";
import * as wire from "../src/core/wire";

afterEach(() => vi.restoreAllMocks());
function npc(kind: Npc["kind"], x: number, y: number): Npc {
  return { kind, x, y, vx: 0, vy: 0, angle: 0, hull: 100, hullMax: 100, fireCd: 0, targetIdx: 0 };
}
function fixture() {
  vi.spyOn(wire, "fetchBases").mockResolvedValue([]);
  vi.spyOn(wire, "getCallsign").mockReturnValue(null);
  const w = generateWorld(406), p = w.player;
  p.dockedAt = null; p.x = p.y = 10000; p.vx = p.vy = 0;
  p.wanted = 0; p.rep = {}; p.crew = []; p.missions = []; p.credits = 1000;
  const flight = new FlightScene();
  const g = Object.assign(Object.create(Game.prototype), {
    world: w, sceneName: "", justUndocked: false, spriteCache: new Map(),
    scenes: { flight, encounter: new EncounterScene() },
    input: { wasPressed: () => false, isDown: () => false, mousePressed: false, wheel: 0, mouseX: -1, mouseY: -1 },
    toast: vi.fn(), showHint: vi.fn(), autosave: vi.fn(),
  }) as Game;
  g.setScene("flight"); flight.npcs = [npc("pirate", p.x + 100, p.y)];
  flight.platforms = []; flight.bullets = []; flight.comms = [];
  flight.encounterTimer = flight.spawnTimer = flight.sosTimer = flight.hailT = 10000;
  return { g, flight, w, p, pirate: flight.npcs[0], card: g.scenes.encounter as EncounterScene };
}

describe("corsair passage agreements", () => {
  it("keeps three flight minutes through saves and consumes time while travelling elsewhere", () => {
    let w = generateWorld(406); const home = w.player.systemId;
    grantPiratePassage(w); expect(piratePassageRemaining(w)).toBe(180);
    for (let i = 0; i < 600; i++) tickPiratePassage(w, 0.05);
    w = migrateSave(JSON.parse(JSON.stringify(w)))!;
    expect(piratePassageRemaining(w)).toBeCloseTo(150);
    w.player.systemId = w.systems[home].links[0];
    expect(piratePassageRemaining(w)).toBe(0); expect(piratesPeaceful(w)).toBe(false);
    for (let i = 0; i < 30; i++) tickPiratePassage(w, 1);
    w.player.systemId = home; expect(piratePassageRemaining(w)).toBeCloseTo(120);
    for (let i = 0; i < 2399; i++) tickPiratePassage(w, 0.05);
    expect(piratesPeaceful(w)).toBe(true);
    expect(tickPiratePassage(w, 0.05)).toBe(true); expect(piratesPeaceful(w)).toBe(false);
  });
  it("cannot expire from invalid elapsed time or a suspended large frame", () => {
    const w = generateWorld(406); grantPiratePassage(w);
    for (const dt of [0, -5, NaN, Infinity]) tickPiratePassage(w, dt);
    expect(piratePassageRemaining(w)).toBe(180);
    tickPiratePassage(w, 1000); expect(piratePassageRemaining(w)).toBe(179);
  });
  it("paid parley protects against replacements and cancels both sides' outstanding player-directed shots", () => {
    const { g, flight, w, p, pirate, card } = fixture();
    flight.npcs.push(npc("pirate", p.x + 200, p.y));
    const shot = { x: p.x, y: p.y, vx: 0, vy: 0, life: 1, dmg: 1, hostile: true };
    const lawShot = { ...shot, lawFaction: "tsc" };
    const traderShot = { ...shot, hostile: false, pirateShot: true };
    flight.bullets = [lawShot, traderShot, { ...shot, pirateShot: true }, { ...shot, hostile: false, fromPlayer: true }, { ...shot, hostile: false, escortShot: true }];
    flight.torps = [{ ...shot, target: pirate }];
    flight.parley(g, pirate);
    const pay = card.enc.options[0]; expect(pay.label).toContain("240CR");
    expect(pay.result(g, new RNG(1))).toContain("THREE FLIGHT MINUTES");
    expect(p.credits).toBe(760); expect(pirate.fleeing).toBe(true);
    expect(flight.bullets).toEqual([lawShot, traderShot]); expect(flight.torps).toEqual([]);
    expect(piratePassageRemaining(w)).toBe(180);
    expect(pay.result(g, new RNG(1))).toContain("PARLEY HAS CLOSED"); expect(p.credits).toBe(760);
    const replacement = npc("pirate", p.x + 100, p.y); flight.npcs = [replacement]; flight.bullets = [];
    updateNpcs(flight, g, 0.05); expect(flight.bullets).toEqual([]);
  });
  it("a failed bluff grants no peace, and the same card cannot roll again", () => {
    const { g, flight, w, pirate, card } = fixture(); flight.parley(g, pirate);
    const bluff = card.enc.options.find(o => o.label.startsWith("BLUFF"))!;
    const rng = new RNG(1); vi.spyOn(rng, "chance").mockReturnValue(false);
    expect(bluff.result(g, rng)).toContain("NICE TRY"); expect(piratePassageRemaining(w)).toBe(0);
    expect(bluff.result(g, rng)).toContain("PARLEY HAS CLOSED");
  });
  it.each(["BLUFF", "OFFER THEM", "ONE ACROSS"])("successful %s grants passage", prefix => {
    const { g, flight, w, p, pirate, card } = fixture(); p.kills = 30; flight.parley(g, pirate);
    const option = card.enc.options.find(o => o.label.startsWith(prefix))!;
    const rng = new RNG(1); vi.spyOn(rng, "chance").mockReturnValue(true);
    expect(option.result(g, rng)).toContain("THREE FLIGHT MINUTES");
    expect(piratePassageRemaining(w)).toBe(180); expect(p.credits).toBe(1000);
  });
  it("rejects a changed world, missing participant, or newly insufficient funds", () => {
    const { g, flight, w, p, pirate, card } = fixture(); flight.parley(g, pirate);
    const pay = card.enc.options[0]; p.credits = 0;
    expect(pay.result(g, new RNG(1))).toContain("NO LONGER AVAILABLE"); expect(piratePassageRemaining(w)).toBe(0);
    p.credits = 1000; flight.npcs = [];
    expect(pay.result(g, new RNG(1))).toContain("PARLEY HAS CLOSED"); expect(p.credits).toBe(1000);
    flight.npcs = [pirate]; g.world = migrateSave(JSON.parse(JSON.stringify(w)))!;
    expect(pay.result(g, new RNG(1))).toContain("PARLEY HAS CLOSED"); expect(g.world.player.credits).toBe(1000);
  });
  it("does not charge a second toll while passage is already honoured", () => {
    const { g, flight, w, p, pirate } = fixture(); grantPiratePassage(w); flight.parley(g, pirate);
    expect(g.sceneName).toBe("flight"); expect(p.credits).toBe(1000);
  });
});

describe("weapons honour pirate peace", () => {
  it.each(["passage", "standing"])("pirates, Veil platforms, drones and auto-gunners hold fire for %s", reason => {
    const { g, flight, w, p, pirate } = fixture();
    if (reason === "passage") grantPiratePassage(w); else p.rep.vex = 40;
    const gunner = genCrewCandidate(new RNG(9)); gunner.role = "gunner"; gunner.skill = 3; gunner.sick = null;
    p.crew = [gunner];
    flight.npcs.push(npc("drone", p.x + 30, p.y));
    flight.update(g, 0.05);
    expect(flight.bullets).toEqual([]); expect(flight.alert).toBe(0); expect(pirate.hull).toBe(100);
    updateComms(flight, g, 0.05); expect(pirate.hailed).not.toBe(true);
    const st = w.systems[p.systemId].stations[0]; p.x = Math.cos(st.angle) * st.orbit; p.y = Math.sin(st.angle) * st.orbit;
    flight.npcs = [];
    flight.platforms = [{ anchor: "station", anchorIdx: 0, orbitR: 60, orbitAngle: 0, orbitSpeed: 0, x: p.x + 60, y: p.y, fireCd: 0, hostileToPlayer: true }];
    updatePlatforms(flight, g, 0.05); expect(flight.bullets).toEqual([]);
  });
  it("player gunfire that hits breaks passage, while unrelated fire does not", () => {
    const { g, flight, w, p, pirate } = fixture(); grantPiratePassage(w);
    const shot = { x: pirate.x, y: pirate.y, vx: 0, vy: 0, life: 1, hostile: false, dmg: 1 };
    flight.bullets = [shot]; updateBullets(flight, g, 0.01);
    expect(piratePassageRemaining(w)).toBe(180);
    flight.bullets = [{ ...shot, life: 1, fromPlayer: true }]; updateBullets(flight, g, 0.01);
    expect(piratePassageRemaining(w)).toBe(0); expect(p.credits).toBe(1000);
    updateNpcs(flight, g, 0.05); expect(flight.bullets.some(b => b.hostile && b.pirateShot)).toBe(true);
  });
  it("torpedoes do not automatically lock a peaceful contact, but a manual hit breaks passage", () => {
    const { g, flight, w, p, pirate } = fixture(); grantPiratePassage(w); p.torpedoes = 2;
    fireTorpedo(flight, g); expect(flight.torps[0].target).toBeNull();
    flight.torps = [{ x: pirate.x, y: pirate.y, vx: 0, vy: 0, life: 1, target: null }];
    updateTorpedoes(flight, g, 0.001); expect(piratePassageRemaining(w)).toBe(0);
  });
  it("E can reach a port beside a peaceful pirate instead of demanding another parley", () => {
    const { g, flight, w, p, pirate } = fixture(), st = w.systems[p.systemId].stations[0];
    grantPiratePassage(w); p.x = Math.cos(st.angle) * st.orbit + 90; p.y = Math.sin(st.angle) * st.orbit;
    pirate.x = p.x + 100; pirate.y = p.y;
    flight.tryInteract(g); expect(flight.docking?.st.id).toBe(st.id); expect(g.sceneName).toBe("flight");
  });
  it("the agreement expires once and breaking it cannot replay the log", () => {
    const { w } = fixture(); grantPiratePassage(w); expect(breakPiratePassage(w)).toBe(true);
    expect(breakPiratePassage(w)).toBe(false); expect(tickPiratePassage(w, 1)).toBe(false);
  });
});
