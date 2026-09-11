import { describe, expect, it } from "vitest";
import { deliverSinger, singerFare, singersBerth } from "../src/core/singers";
import { askPassengerRequest, generateWorld, genFares, missionDeliverable, navRoute, passengersAboard, settlePassengers, type Mission } from "../src/world";
import { RNG } from "../src/core/rng";
import { migrateSave, SAVE_VERSION } from "../src/save";
import { StationScene } from "../src/scenes/station";
import { SingersScene } from "../src/scenes/singers";
import { passengerChatter } from "../src/data/chatter";
import type { Game } from "../src/game";

function trip() {
  const w = generateWorld(935), p = w.player, source = w.systems[p.systemId];
  const station = source.stations[0]; station.type = "research"; station.military = false;
  p.singersHome = source.links[0]; p.flags = { singersHomeDone: true }; p.crew = [];
  p.dockedAt = station.id; p.missions = [];
  const m = singerFare(w, station)!;
  const scene = new StationScene(); scene.station = station; scene.fares = [m];
  const messages: string[] = [];
  const g = { world: w, toast: (s: string) => messages.push(s), autosave: () => {}, showHint: () => {}, portrait: () => ({}) } as unknown as Game;
  return { w, p, station, m, scene, g, messages };
}

function arrive(t: ReturnType<typeof trip>) {
  t.p.systemId = t.p.singersHome!; t.p.dockedAt = null;
  const b = singersBerth(t.w)!; t.p.x = b.x; t.p.y = b.y;
}

describe("singer passage home", () => {
  it("posts a cabin fare at an invited research station away from home, priced in light", () => {
    const { w, p, station, m } = trip();
    expect(m).toMatchObject({ kind: "passenger", passengerKind: "singer", party: 1, reward: 0, accepted: false });
    expect(m.targetStationId).toBeUndefined();
    expect(m.lightReward).toBe(20 + (navRoute(w, p.systemId, p.singersHome!)!.length - 1) * 5);
    expect(genFares(w, station, new RNG(7))[0].passengerKind).toBe("singer");
    station.type = "trade"; expect(singerFare(w, station)).toBeNull();
    station.type = "research"; p.flags = {}; expect(singerFare(w, station)).toBeNull();
    p.flags.singersHomeDone = true; p.singersHome = p.systemId; expect(singerFare(w, station)).toBeNull();
  });

  it("respects cabin capacity, rejects duplicate offers, and plots home when boarding", () => {
    const t = trip(), { p, m, scene, g, w, station } = t;
    p.missions = [{ ...m, id: "existing", passengerKind: "courier", accepted: true }];
    scene.acceptMission(g, m); expect(m.accepted).toBe(false); expect(p.missions).toHaveLength(1);
    p.modules = ["cabins"];
    const stale = singerFare(w, station)!;
    scene.acceptMission(g, m); scene.acceptMission(g, m); scene.acceptMission(g, stale);
    expect(passengersAboard(p)).toHaveLength(2); expect(m.accepted).toBe(true); expect(stale.accepted).toBe(false);
    expect(scene.fares).toHaveLength(0); expect(p.navTarget).toBe(p.singersHome); expect(p.singersCourse).toBe(true);
    expect(singerFare(w, station)).toBeNull();
  });

  it("allows long journeys without a docking penalty or a promised credit tip", () => {
    const { p, m, scene, g } = trip(); scene.acceptMission(g, m);
    for (let i = 0; i < 100; i++) expect(settlePassengers(p)).toEqual([]);
    expect(m.mood).toBe(65); expect(m.docksAboard).toBe(100); expect(m.done).toBe(false);
    expect(askPassengerRequest(p, new RNG(4))).toBeNull();
  });

  it("refuses delivery at human stations, from orbit, or for an unaccepted or copied mission", () => {
    const t = trip();
    expect(deliverSinger(t.w, t.m)).toBeNull();
    t.scene.acceptMission(t.g, t.m);
    expect(deliverSinger(t.w, t.m)).toBeNull();
    for (const st of t.w.systems[t.p.singersHome!].stations) expect(missionDeliverable(t.w, t.m, st)).toBe(false);
    const credits = t.p.credits;
    t.scene.completeMissionInner(t.g, t.m);
    expect(t.m.done).toBe(false); expect(t.p.credits).toBe(credits);
    arrive(t);
    expect(deliverSinger(t.w, { ...t.m })).toBeNull();
  });

  it("pays once at the berth, frees the cabin, records the journey, and keeps human money unchanged", () => {
    const t = trip(); t.scene.acceptMission(t.g, t.m); const credits = t.p.credits, rep = { ...t.p.rep };
    t.m.dined = true; arrive(t);
    const berthScene = new SingersScene(); berthScene.enter(t.g); berthScene.enter(t.g);
    expect(t.p.singersExchange).toMatchObject({ light: t.m.lightReward, homecomings: 1, trades: 0 });
    expect(t.p.fares).toBe(1); expect(passengersAboard(t.p)).toHaveLength(0);
    expect(t.p.credits).toBe(credits); expect(t.p.rep).toEqual(rep);
    expect(t.p.guestbook).toHaveLength(1); expect(t.p.guestbook![0]).toMatchObject({ kind: "singer", to: "The singers' berth" });
    expect(t.p.guestbook![0].line).toContain("your table"); expect(t.p.words).toContain("return");
    expect(deliverSinger(t.w, t.m)).toBeNull();
  });

  it("keeps an unfinished fare through save migration, then persists its completed payment", () => {
    const t = trip(); t.scene.acceptMission(t.g, t.m); arrive(t); t.w.version = SAVE_VERSION;
    const restored = migrateSave(JSON.parse(JSON.stringify(t.w)))!;
    expect(deliverSinger(restored, restored.player.missions[0])).toContain(`+${t.m.lightReward} LIGHT`);
    const again = migrateSave(JSON.parse(JSON.stringify(restored)))!;
    expect(deliverSinger(again, again.player.missions[0])).toBeNull();
    expect(again.player.singersExchange?.light).toBe(t.m.lightReward);
  });

  it("never turns a singer guestbook entry into a generic returning fare", () => {
    const { w, p, station } = trip(); station.type = "trade";
    p.guestbook = [{ name: "The Held Note", kind: "singer", from: "Survey", to: "Berth", mood: 99, line: "Home.", t: 0 }];
    for (let i = 0; i < 60; i++) expect(genFares(w, station, new RNG(i)).some(m => m.passengerKind === "singer" || m.passengerName === "The Held Note")).toBe(false);
  });

  it("keeps the selected fare and its mouse target visible in a crowded bar", () => {
    const { scene, station, m, g } = trip();
    station.barPatrons = Array.from({ length: 7 }, (_, i) => `Patron ${i}`);
    scene.candidates = Array.from({ length: 9 }, (_, i) => ({ name: `Crew ${i}`, role: "pilot" as const, skill: 1, morale: 70, wage: 40 }));
    scene.fares = [m, { ...m, id: "second" }];
    scene.cursor = station.barPatrons.length + scene.candidates.length;
    const ctx = new Proxy({}, { get: () => () => {}, set: () => true }) as CanvasRenderingContext2D;
    scene.drawBar(g, ctx, 56);
    const [top, bottom] = scene.rowBoxes[scene.cursor];
    expect(top).toBeGreaterThanOrEqual(65); expect(bottom).toBeLessThanOrEqual(216);
    expect(scene.rowBoxes.findIndex(([a, b]) => 185 >= a && 185 <= b)).toBe(scene.cursor);
    expect(scene.rowBoxes[0]).toEqual([Infinity, -Infinity]);
  });

  it("gives the passenger original conversations with each crew role", () => {
    const { m } = trip();
    for (const role of ["pilot", "engineer", "medic", "gunner"] as const) {
      const c = { name: "Ada", role, skill: 1, morale: 70, wage: 40 };
      const line = passengerChatter(m, c, new RNG(3));
      expect(line.ask.length).toBeGreaterThan(10); expect(line.reply.length).toBeGreaterThan(10);
      expect(line.ask).not.toContain("WHAT I PAID");
    }
  });
});
