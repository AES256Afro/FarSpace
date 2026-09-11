import { describe, expect, it } from "vitest";
import { atSingersBerth, enterSingersBerth, knowsSingersBerth, lightQuote, singersBerth, tradeWithSingers } from "../src/core/singers";
import { generateWorld, SYSTEM_SIZE } from "../src/world";
import { migrateSave, SAVE_VERSION } from "../src/save";
import { FlightScene } from "../src/scenes/flight/index";
import { SingersScene } from "../src/scenes/singers";
import { GalaxyScene } from "../src/scenes/galaxy";
import type { Game } from "../src/game";

function invited(seed = 934) {
  const w = generateWorld(seed), p = w.player;
  p.singersHome = p.systemId; p.flags = { singersHomeDone: true }; p.keepsakes = [];
  const berth = singersBerth(w)!; p.x = berth.x; p.y = berth.y; p.vx = 0; p.vy = 0; p.dockedAt = null;
  return w;
}

describe("singers' berth", () => {
  it("admits existing listeners without a keepsake and requires completed contact", () => {
    const w = invited(), p = w.player;
    expect(knowsSingersBerth(p)).toBe(true);
    expect(enterSingersBerth(w)).toBe(true);
    expect(p.singersExchange?.light).toBe(0);
    const account = p.singersExchange, logs = p.log?.length;
    enterSingersBerth(w);
    expect(p.singersExchange).toBe(account); expect(p.log?.length).toBe(logs);
    delete p.singersExchange; p.flags = {};
    expect(singersBerth(w)).toBeNull(); expect(enterSingersBerth(w)).toBe(false);
    p.flags.singershome = true;
    expect(knowsSingersBerth(p)).toBe(true);
    delete p.singersHome;
    expect(knowsSingersBerth(p)).toBe(false);
  });

  it("places the same berth beyond moving orbits and clear of gates across generated homes", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const w = invited(seed);
      for (const sys of Object.values(w.systems)) {
        w.player.singersHome = sys.id;
        const berth = singersBerth(w, sys.id)!;
        const r = Math.hypot(berth.x, berth.y);
        expect(r).toBeLessThan(SYSTEM_SIZE);
        expect(sys.planets.every(p => r - p.orbit - p.radius >= 399.9)).toBe(true);
        expect(sys.stations.every(s => r - s.orbit >= 399.9)).toBe(true);
        expect(sys.jumpPoints.every(j => Math.hypot(berth.x - j.x, berth.y - j.y) > 500)).toBe(true);
        for (const p of sys.planets) p.angle += 0.5;
        expect(singersBerth(w, sys.id)).toEqual(berth);
      }
    }
  });

  it("converts only unspent survey data and never spends human credits or reputation", () => {
    const w = invited(), p = w.player; enterSingersBerth(w);
    p.expData = 250; const credits = p.credits, rep = { ...p.rep };
    expect(tradeWithSingers(w, "survey").ok).toBe(true);
    expect(tradeWithSingers(w, "survey").ok).toBe(true);
    expect(tradeWithSingers(w, "survey").ok).toBe(false);
    expect(p.expData).toBe(50); expect(p.singersExchange).toMatchObject({ light: 10, dataShared: 200, trades: 2 });
    expect(p.credits).toBe(credits); expect(p.rep).toEqual(rep);
  });

  it("quotes a partial refill and repair, charges once, and refuses full resources", () => {
    const w = invited(), p = w.player; enterSingersBerth(w); p.singersExchange!.light = 20;
    p.fuel = p.fuelMax - 3; p.hull = p.hullMax - 2;
    expect(lightQuote(p, "fuel")).toMatchObject({ amount: 3, cost: 1 });
    expect(lightQuote(p, "repair")).toMatchObject({ amount: 2, cost: 1 });
    tradeWithSingers(w, "fuel"); tradeWithSingers(w, "repair");
    expect(p.fuel).toBe(p.fuelMax); expect(p.hull).toBe(p.hullMax); expect(p.singersExchange!.light).toBe(18);
    expect(tradeWithSingers(w, "fuel").ok).toBe(false);
    expect(tradeWithSingers(w, "repair").ok).toBe(false);
    expect(p.singersExchange!.light).toBe(18);
    p.hull -= 20; p.singersExchange!.light = 5;
    expect(tradeWithSingers(w, "repair").ok).toBe(false);
    expect(p.singersExchange!.light).toBe(5); expect(p.hull).toBe(p.hullMax - 20);
  });

  it("rejects cargo without room before charging and supports relic trade after a saved return", () => {
    const w = invited(), p = w.player; enterSingersBerth(w); p.singersExchange!.light = 40;
    p.cargo = { food: p.cargoMax - 1 };
    expect(tradeWithSingers(w, "parts").ok).toBe(false); expect(p.singersExchange!.light).toBe(40);
    p.cargo = {};
    expect(tradeWithSingers(w, "parts").ok).toBe(true);
    expect(p.cargo.parts).toBe(2); expect(p.singersExchange!.light).toBe(36);
    w.version = SAVE_VERSION;
    const restored = migrateSave(JSON.parse(JSON.stringify(w)))!;
    expect(atSingersBerth(restored)).toBe(true);
    expect(tradeWithSingers(restored, "relic").ok).toBe(true);
    expect(restored.player.cargo.relics).toBe(1); expect(restored.player.singersExchange!.light).toBe(6);
    restored.player.x += 400;
    expect(tradeWithSingers(restored, "survey").ok).toBe(false);
  });

  it("takes a plotted course through gates and still targets the berth after arrival", () => {
    const w = invited(), p = w.player, flight = new FlightScene();
    const home = w.systems[p.systemId], neighbor = home.links[0];
    p.singersCourse = true; p.navTarget = home.id; p.systemId = neighbor;
    const g = { world: w } as Game;
    expect(flight.apTarget(g)?.label).toBe(`GATE ${home.name.toUpperCase()}`);
    p.systemId = home.id;
    expect(flight.apTarget(g)?.label).toBe("SINGERS' BERTH");
    p.navTarget = null;
    expect(flight.apTarget(g)?.label).toBe("SINGERS' BERTH");
    expect(flight.massLocked(g)).toBe(true);
    p.navTarget = neighbor;
    expect(flight.apTarget(g)?.label).toBe(`GATE ${w.systems[neighbor].name.toUpperCase()}`);
  });

  it("docks with E, trades by pointer, and preserves encounter state when leaving both screens", () => {
    const w = invited(), p = w.player, flight = new FlightScene(), scene = new SingersScene(), galaxy = new GalaxyScene();
    let current = "flight", saves = 0;
    const keys = new Set<string>();
    const input = { wasPressed: (key: string) => keys.has(key), wheel: 0, mousePressed: false, mouseX: 0, mouseY: 0 };
    const g = { world: w, scenes: { flight, singers: scene }, input, toast: () => {}, autosave: () => { saves++; },
      setScene: (name: string) => { current = name; if (name === "singers") scene.enter(g); if (name === "flight") flight.enter(g); },
    } as unknown as Game;
    flight.enter(g);
    p.vx = 100; flight.tryInteract(g); expect(current).toBe("flight");
    p.vx = 0; flight.tryInteract(g); expect(current).toBe("singers");
    p.expData = 100; const npcs = flight.npcs; flight.scanMsg = "KEEP THIS CONTACT";
    input.mousePressed = true; input.mouseX = 240; input.mouseY = 85; scene.update(g, 0.01);
    expect(p.expData).toBe(0); expect(p.singersExchange!.light).toBe(5); expect(saves).toBe(2);
    input.mousePressed = false; keys.add("Escape"); scene.update(g, 0.01); keys.clear();
    expect(current).toBe("flight"); expect(flight.npcs).toBe(npcs); expect(flight.scanMsg).toBe("KEEP THIS CONTACT");
    keys.add("r"); galaxy.update(g, 0); keys.clear();
    expect(p.singersCourse).toBe(true); expect(p.navTarget).toBe(p.singersHome);
    keys.add("Escape"); galaxy.update(g, 0); keys.clear();
    expect(flight.npcs).toBe(npcs);
  });
});
