import { describe, expect, it, vi } from "vitest";
import { beginShipSim, chooseShipSim, continueShipSim, runClassicSim, shipSimAct, shipSimCast, shipSimKnown, shipSimReason } from "../src/core/shipsim";
import { generateWorld, SIM_PROGRAMS } from "../src/world";
import { migrateSave, SAVE_VERSION } from "../src/save";
import { RNG } from "../src/core/rng";
import { Game } from "../src/game";
import { InteriorScene } from "../src/scenes/interior";
import { SimRigScene } from "../src/scenes/simrig";

function fixture() {
  const w = generateWorld(399), p = w.player;
  p.tutorial = -1; p.furnishings = ["simrig"]; p.voiceName = "Kettle"; p.shipName = "The Long Way";
  p.captainName = "Rosa Sen"; p.motto = "Bring them home."; p.lives = 7;
  p.crew = [{ name: "Mina Sol", role: "pilot", skill: 2, morale: 70, wage: 30, docks: 5, loyalty: 1 }];
  const finish = (ending = 0) => {
    beginShipSim(w); const run = p.shipSim!.active!;
    for (let stage = 0; stage < 3; stage++) { chooseShipSim(w, run, stage, stage === 2 ? ending : 0); if (stage < 2) continueShipSim(w, run); }
    return run;
  };
  return { w, p, finish };
}
function game(f: ReturnType<typeof fixture>) {
  const keys = new Set<string>();
  const g = Object.assign(Object.create(Game.prototype), { world: f.w, sceneName: "interior",
    scenes: { simrig: new SimRigScene(), interior: new InteriorScene() },
    input: { wasPressed: (key: string) => keys.has(key), isDown: () => false, mousePressed: false, mouseX: 0, mouseY: 0, wheel: 0 },
    toast: vi.fn(), autosave: vi.fn(), showHint: vi.fn(), save: vi.fn(), load: vi.fn(),
  }) as Game;
  return { g, keys };
}
describe("the ship's reconstruction", () => {
  it("requires a rig and a known ship voice, then reserves one session", () => {
    const { w, p } = fixture(); p.furnishings = [];
    expect(beginShipSim(w)).toContain("NEEDS A SIM RIG"); expect(p.shipSim).toBeUndefined();
    p.furnishings = ["simrig"]; delete p.voiceName; expect(shipSimKnown(w)).toBe(false);
    expect(beginShipSim(w)).toContain("ASK THE SHIP ITS NAME"); (p.flags ??= {}).shipCrew = true;
    expect(beginShipSim(w)).toBeNull(); expect(p.simUsed).toBe(true); expect(p.shipSim?.active?.stage).toBe(0);
    const run = p.shipSim!.active; expect(beginShipSim(w)).toBeNull(); expect(p.shipSim!.active).toBe(run); expect(p.shipSim!.serial).toBe(1);
  });
  it("uses a snapshot of real names and history and keeps it stable after crew changes", () => {
    const { w, p } = fixture(); beginShipSim(w); const run = p.shipSim!.active!;
    expect(run.cast.voice).toBe("KETTLE"); expect(run.cast.crew).toBe("Mina Sol"); expect(run.cast.memory).toContain("7 lives");
    expect(shipSimAct(run).text).toContain("The Long Way"); expect(shipSimAct(run).text).toContain("Rosa Sen");
    p.voiceName = "Tomorrow"; p.crew = []; p.lives = 800; p.shipName = "Another Ship";
    expect(run.cast.voice).toBe("KETTLE"); expect(run.cast.memory).toContain("7 lives"); expect(run.cast.crew).toBe("Mina Sol");
    p.council = { stationId: "s", represented: 2, ballots: [] }; expect(shipSimCast(w).memory).toContain("2 written replies");
    delete p.council; p.alumni = [{ name: "Ari Sen", role: "engineer", stationId: "s", docks: 35, t: 0, finalJourney: true }];
    expect(shipSimCast(w).memory).toContain("Ari Sen");
  });
  it("rejects stale objects, stages and repeated answers without extra progress", () => {
    const { w, p } = fixture(); beginShipSim(w); const run = p.shipSim!.active!;
    expect(chooseShipSim(w, { ...run }, 0, 0)).toBeNull(); expect(chooseShipSim(w, run, 2, 0)).toBeNull();
    expect(chooseShipSim(w, run, 0, -1)).toBeNull(); expect(chooseShipSim(w, run, 0, 0.5)).toBeNull();
    expect(continueShipSim(w, run)).toBe(false); const line = chooseShipSim(w, run, 0, 1);
    expect(line).toContain("Mina Sol"); expect(chooseShipSim(w, run, 0, 2)).toBeNull(); expect(run.choices).toEqual([1]);
    expect(continueShipSim(w, run)).toBe(true); expect(run.stage).toBe(1); expect(continueShipSim(w, run)).toBe(false);
  });
  it.each([0, 1, 2])("plays every scene with choice %i and keeps a distinct ending", choice => {
    const { w, p } = fixture(); beginShipSim(w); const run = p.shipSim!.active!;
    for (let stage = 0; stage < 3; stage++) {
      expect(shipSimAct(run).choices).toHaveLength(3); expect(shipSimAct(run).text).not.toMatch(/undefined|NaN/);
      expect(chooseShipSim(w, run, stage, choice)?.length).toBeGreaterThan(100);
      if (stage < 2) expect(continueShipSim(w, run)).toBe(true);
    }
    expect(run.done).toBe(true); expect(run.ending).toBe(["THE PEOPLE", "THE WAY HOME", "THE NEXT GATE"][choice]);
    expect(p.shipSim!.runs).toBe(1); expect(p.shipSim!.endings[run.ending!]).toBe(1);
  });
  it("grants morale and one first-run keepsake only once, and leaves real flight resources alone", () => {
    const { w, p, finish } = fixture(); const before = JSON.stringify({ hull: p.hull, shield: p.shield, fuel: p.fuel, credits: p.credits, cargo: p.cargo, missions: p.missions, system: p.systemId, nav: p.navTarget });
    const run = finish(1); expect(p.crew[0].morale).toBe(76); expect(p.crew[0].loyalty).toBeCloseTo(1.1); expect(p.flags?.holiday).toBe(true);
    expect(p.keepsakes).toHaveLength(1); expect(chooseShipSim(w, run, 2, 0)).toBeNull(); expect(p.crew[0].morale).toBe(76);
    expect(JSON.stringify({ hull: p.hull, shield: p.shield, fuel: p.fuel, credits: p.credits, cargo: p.cargo, missions: p.missions, system: p.systemId, nav: p.navTarget })).toBe(before);
    continueShipSim(w, run); expect(beginShipSim(w)).toContain("RUN THIS LEG");
    p.simUsed = false; const second = finish(2); expect(p.shipSim!.runs).toBe(2); expect(p.keepsakes).toHaveLength(1); expect(second.id).toBe(2);
  });
  it("saves unanswered and answered acts, including the final response, with no repeated reward", () => {
    const { w, p } = fixture(); w.version = SAVE_VERSION; beginShipSim(w); const old = p.shipSim!.active!;
    chooseShipSim(w, old, 0, 2);
    const loaded = migrateSave(JSON.parse(JSON.stringify(w)))!, run = loaded.player.shipSim!.active!;
    expect(run.reply).toContain("I measured"); expect(chooseShipSim(loaded, old, 0, 1)).toBeNull();
    continueShipSim(loaded, run); loaded.time += 1000000; loaded.player.simUsed = false;
    expect(beginShipSim(loaded)).toBeNull(); expect(loaded.player.shipSim!.active).toBe(run);
    chooseShipSim(loaded, run, 1, 2); continueShipSim(loaded, run); chooseShipSim(loaded, run, 2, 0);
    const end = migrateSave(JSON.parse(JSON.stringify(loaded)))!, endRun = end.player.shipSim!.active!;
    expect(endRun.done).toBe(true); expect(end.player.simUsed).toBe(true);
    expect(chooseShipSim(end, endRun, 2, 1)).toBeNull(); continueShipSim(end, endRun);
    expect(end.player.shipSim!.active).toBeUndefined(); expect(end.player.shipSim!.runs).toBe(1); expect(end.player.crew[0].morale).toBe(76);
  });
  it("handles a solo captain and sparse old saves without inventing a crew reward", () => {
    const { w, p, finish } = fixture(); p.crew = []; delete p.homePort; delete p.log; delete p.lives; delete p.words;
    expect(shipSimCast(w).memory).toContain("short log"); const run = finish();
    expect(run.cast.crew).toBeNull(); expect(run.reply).not.toContain("MORALE"); expect(run.reply).toContain("SHIP KEEPS YOUR ENDING");
    expect(shipSimReason(w)).toBeNull(); p.furnishings = []; expect(shipSimReason(w)).toContain("NEEDS A SIM RIG");
    expect(p.shipSim!.active).toBe(run);
  });
  it.each(SIM_PROGRAMS.map(p => p.id))("keeps classic program %s playable with a single-use guard", id => {
    const { w, p } = fixture(); expect(runClassicSim(w, id, new RNG(1))).toBeTruthy(); const after = JSON.stringify(p);
    expect(p.flags?.holiday).toBe(true); expect(runClassicSim(w, id, new RNG(1))).toBeNull(); expect(JSON.stringify(p)).toBe(after);
  });
  it("does not let a classic program overwrite an unfinished reconstruction", () => {
    const { w, p } = fixture(); beginShipSim(w); const run = p.shipSim!.active; p.simUsed = false;
    expect(runClassicSim(w, "beach", new RNG(1))).toBeNull(); expect(p.shipSim!.active).toBe(run);
  });
  it("scrolls the full program list with keyboard and pointer and retains the return position", () => {
    const f = fixture(), { g, keys } = game(f), sim = g.scenes.simrig as SimRigScene, interior = g.scenes.interior as InteriorScene;
    interior.px = 145; interior.py = 75; sim.open(g);
    for (let i = 0; i < 7; i++) { keys.add("ArrowDown"); sim.update(g, 0); keys.clear(); }
    expect(sim.cursor).toBe(7); expect(sim.scroll).toBe(2);
    g.input.mouseX = 200; g.input.mouseY = 58 + 5 * 24 + 4; g.input.mousePressed = true;
    sim.update(g, 0); g.input.mousePressed = false; expect(sim.result).toContain("CAT"); expect(f.p.simUsed).toBe(true);
    keys.add("Enter"); sim.update(g, 0); keys.clear(); expect(g.sceneName).toBe("interior"); expect(interior.px).toBe(145); expect(interior.py).toBe(75);
  });
  it("pauses and resumes the exact response through scene returns and stops after F9", () => {
    const f = fixture(), { g, keys } = game(f), sim = g.scenes.simrig as SimRigScene;
    sim.open(g); keys.add("Enter"); sim.update(g, 0); keys.clear(); expect(f.p.shipSim?.active).toBeDefined();
    keys.add("Enter"); sim.update(g, 0); keys.clear(); const run = f.p.shipSim!.active!; expect(run.reply).toBeDefined();
    keys.add("Escape"); sim.update(g, 0); keys.clear(); expect(g.sceneName).toBe("interior");
    sim.open(g); expect(f.p.shipSim!.active).toBe(run); expect(run.reply).toBeDefined();
    keys.add("F9"); keys.add("Enter"); g.autosave = vi.fn(); sim.update(g, 0);
    expect(g.load).toHaveBeenCalledOnce(); expect(g.autosave).not.toHaveBeenCalled(); expect(run.stage).toBe(0);
  });
});
