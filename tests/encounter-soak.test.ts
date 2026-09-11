// Every card, every option, under a loaded ship: crew of every role, a cadet, Number One, fares of every kind,
// the flags the second and third sittings added, and a fake Game that has the few methods cards touch.
import { describe, it, expect } from "vitest";
import { RNG } from "../src/core/rng";
import { ENCOUNTERS, pickEncounter } from "../src/data/encounters";
import { generateWorld, genCrewCandidate, genFares, isBeltStation, shiftBond } from "../src/world";

function loaded(seed: number) {
  const w = generateWorld(seed, { realGalaxy: true }); const p = w.player; const rng = new RNG(seed);
  p.credits = 9000; p.fuel = 80; p.cargo = { food: 6, parts: 4, water: 6, med: 3, lux: 2 };
  const roles = ["engineer", "medic", "pilot", "gunner", "pilot"] as const;
  roles.forEach((r, i) => { const c = genCrewCandidate(rng); c.role = r; c.docks = i === 4 ? 0 : 6 + i; if (i === 4) c.cadet = true; if (i === 2) c.specialty = "science" as never; if (i === 1) c.specialty = "counsellor" as never; c.trait = ["born on a rock", "counts litres", "cooks", "cards", "plant"][i]; p.crew.push(c); });
  shiftBond(p.crew[0], p.crew[1], 3.5); p.numberOne = p.crew[0].name;
  p.flags = { shipCrew: true, freeman: true, longship: true, rockkid: true, dockhand: true, firstContact: true, singersGuided: true, quietOnes: true, quietOnesGift: true, pranked: true, directiveBroken: true };
  p.voiceName = "Kettle"; p.motto = "Ask the belt."; p.catchphrase = "Go"; p.cat = { name: "Biscuit", since: 0 };
  p.lost = [{ name: "Rosa Ndiaye", role: "engineer", where: "Ross 128", t: 1 }]; p.keepsakes = ["a pen"]; p.words = ["hello"];
  p.leg = { jumps: 2, fights: 3, cards: 0, alerts: 2, burns: 1, rescues0: 0, t0: w.time - 9 * 3600 };
  (p.codex ??= {})["contact:THE QUIET ONES"] = 2; p.codex["contact:THE SINGERS"] = 3; p.lives = 100; p.officeLetters = 1;
  const stations = Object.values(w.systems).flatMap((s) => s.stations); const mil = stations.find((s) => s.military)!;
  const belt = stations.find((s) => isBeltStation(s))!; p.rep[mil.factionId] = 40; p.rep[belt.factionId] = 40;
  for (let i = 0; i < 30; i++) for (const m of genFares(w, mil, new RNG(500 + i))) if (!p.missions.some((x) => x.passengerKind === m.passengerKind)) { m.accepted = true; p.missions.push(m); }
  for (let i = 0; i < 30; i++) for (const m of genFares(w, belt, new RNG(900 + i))) if (!p.missions.some((x) => x.passengerKind === m.passengerKind)) { m.accepted = true; p.missions.push(m); }
  const toasts: string[] = [];
  const g = { world: w, scenes: {}, toast: (t: string) => toasts.push(t), showHint: () => undefined } as unknown as import("../src/game").Game;
  return { w, p, g, toasts };
}

describe("encounter soak", () => {
  it("every card's when() and every option's requires() run on a loaded ship", () => {
    for (const seed of [31, 32, 33]) { const { g } = loaded(seed); for (const e of ENCOUNTERS) { if (e.when) expect(typeof e.when(g)).toBe("boolean"); for (const o of e.options) if (o.requires) expect(typeof o.requires(g)).toBe("boolean"); } }
  });
  it("every option resolves to a line on a loaded ship, across seeds, without throwing", () => {
    let ran = 0;
    for (const seed of [41, 42, 43]) {
      for (const e of ENCOUNTERS) for (const o of e.options) {
        const { g } = loaded(seed);
        if (o.requires && !o.requires(g)) continue;
        const line = o.result(g, new RNG(seed * 7 + ran));
        expect(typeof line, `${e.id} / ${o.label}`).toBe("string");
        ran++;
      }
    }
    expect(ran).toBeGreaterThan(200);
  });
  it("picking cards a thousand times never returns a card whose when() is false", () => {
    const { g } = loaded(51);
    for (let i = 0; i < 1000; i++) { const e = pickEncounter(g, i % 4 === 0 ? "ground" : "space", new RNG(i)); if (e && e.when) expect(e.when(g), e.id).toBe(true); }
  });
});
