import { describe, expect, it, vi } from "vitest";
import type { CrewMember } from "../src/data/crew";
import { beginLastLeg, finishLastLeg, lastLegAtPort, lastLegDestination, lastLegObjective, lastLegTalk, plotLastLeg, stationCourseTarget } from "../src/core/lastleg";
import { collectShoreCrew, findStation, generateWorld, retireCrew, sendOnLeave, tickMail } from "../src/world";
import { migrateSave, SAVE_VERSION } from "../src/save";
import { Game } from "../src/game";
import { FlightScene } from "../src/scenes/flight/index";
import { StationScene } from "../src/scenes/station";
import { StationWalkScene } from "../src/scenes/stationwalk";
import { EncounterScene } from "../src/scenes/encounter";
import { GalaxyScene } from "../src/scenes/galaxy";
import { RosterScene } from "../src/scenes/roster";
import { RNG } from "../src/core/rng";

function fixture() {
  const w = generateWorld(397), p = w.player;
  const start = w.systems[p.systemId].stations[0]; p.dockedAt = start.id; p.tutorial = -1;
  const home = Object.values(w.systems).find(s => s.id !== p.systemId && !s.permit && s.stations.length >= 2)!;
  const c: CrewMember = { name: "Ari Sen", role: "engineer", skill: 3, morale: 70, wage: 40, docks: 35, home: home.stations[1].id, loyalty: 4 };
  const other: CrewMember = { name: "Mina Sol", role: "pilot", skill: 2, morale: 70, wage: 35, docks: 4, loyalty: 1 };
  p.crew = [c, other]; p.credits = 800; w.mailQueue = []; p.alumni = [];
  const dest = findStation(w, c.home!)!;
  const arrive = () => { p.systemId = dest.sys.id; p.dockedAt = dest.st.id; };
  return { w, p, c, other, start, dest, arrive };
}

function game(f: ReturnType<typeof fixture>) {
  const keys = new Set<string>();
  const g = Object.assign(Object.create(Game.prototype), { world: f.w, sceneName: "station",
    scenes: { flight: new FlightScene(), station: new StationScene(), stationwalk: new StationWalkScene(), encounter: new EncounterScene(), roster: new RosterScene() },
    input: { wasPressed: (key: string) => keys.has(key), isDown: () => false, mousePressed: false, mouseX: 0, mouseY: 0, wheel: 0 },
    toast: vi.fn(), autosave: vi.fn(), showHint: vi.fn(),
  }) as Game;
  (g.scenes.station as StationScene).station = f.start;
  return { g, keys };
}

describe("an old hand's final journey", () => {
  it("chooses their reachable home, keeps the working berth, and records one promise", () => {
    const { w, p, c, dest } = fixture();
    expect(lastLegDestination(w, c)?.st.id).toBe(dest.st.id);
    expect(beginLastLeg(w, c, dest.st.id)).toBe(true);
    const loyalty = c.loyalty, logs = p.log?.length;
    expect(p.crew).toContain(c); expect(p.alumni).toEqual([]); expect(p.credits).toBe(800);
    expect(p.navStationId).toBe(dest.st.id); expect(p.navTarget).toBe(dest.sys.id);
    expect(beginLastLeg(w, c, dest.st.id)).toBe(false);
    expect(c.loyalty).toBe(loyalty); expect(p.log?.length).toBe(logs);
  });

  it("rejects a stale or invented offer and does not offer it to new or departed crew", () => {
    const { w, c, dest } = fixture();
    expect(beginLastLeg(w, c, "missing-port")).toBe(false);
    c.docks = 29; expect(lastLegDestination(w, c)).toBeNull();
    c.docks = 35; w.player.crew = []; expect(beginLastLeg(w, c, dest.st.id)).toBe(false);
    expect(c.lastLeg).toBeUndefined();
  });

  it("chooses a stable alternative when home is missing or behind a closed permit", () => {
    const { w, p, c, dest } = fixture();
    c.home = "missing-home";
    const chosen = lastLegDestination(w, c)!;
    expect(chosen.st.id).not.toBe(p.dockedAt); expect(lastLegDestination(w, c)).toEqual(chosen);
    c.home = dest.st.id; dest.sys.permit = true; p.rep[dest.sys.factionId] = 0;
    expect(lastLegDestination(w, c)?.sys.id).not.toBe(dest.sys.id);
    for (const sys of Object.values(w.systems)) sys.stations = [];
    expect(lastLegDestination(w, c)).toBeNull();
  });

  it("survives save migration and long detours with the same destination", () => {
    const { w, c, dest } = fixture(); w.version = SAVE_VERSION;
    expect(c.lastLeg).toBeUndefined();
    beginLastLeg(w, c, dest.st.id); w.time += 1000000; c.docks += 100;
    const restored = migrateSave(JSON.parse(JSON.stringify(w)))!;
    const member = restored.player.crew[0];
    expect(member.lastLeg).toEqual(c.lastLeg);
    expect(restored.player.navStationId).toBe(dest.st.id);
    expect(lastLegObjective(restored, member)).toContain(dest.st.name.toUpperCase());
    expect(lastLegTalk(restored, member)).toContain("NO HURRY");
  });

  it("flies through gates and targets the chosen station instead of the nearest one", () => {
    const { w, p, c, dest } = fixture(); beginLastLeg(w, c, dest.st.id);
    const flight = new FlightScene(), g = { world: w } as Game;
    expect(flight.apTarget(g)?.label).toMatch(/^GATE /);
    p.systemId = dest.sys.id; p.dockedAt = null; p.navTarget = null;
    const near = dest.sys.stations.find(s => s.id !== dest.st.id)!;
    p.x = Math.cos(near.angle) * near.orbit; p.y = Math.sin(near.angle) * near.orbit;
    expect(flight.apTarget(g)?.label).toBe(dest.st.name.toUpperCase());
    dest.st.angle += 0.25;
    expect(flight.apTarget(g)?.x).toBeCloseTo(Math.cos(dest.st.angle) * dest.st.orbit);
    p.navTarget = Object.keys(w.systems).find(id => id !== dest.sys.id)!;
    expect(stationCourseTarget(w)).toBeNull(); expect(p.navStationId).toBeUndefined();
    expect(c.lastLeg?.stationId).toBe(dest.st.id);
  });

  it("lets the galaxy map replace the exact course and the roster restore it", () => {
    const f = fixture(), { g, keys } = game(f); beginLastLeg(f.w, f.c, f.dest.st.id);
    const galaxy = new GalaxyScene(); galaxy.selected = f.dest.sys.id;
    keys.add("n"); galaxy.update(g, 0); keys.clear();
    expect(f.p.navStationId).toBeUndefined(); expect(f.c.lastLeg).toBeDefined();
    const roster = g.scenes.roster as RosterScene;
    keys.add("n"); roster.update(g, 0); keys.clear();
    expect(f.p.navStationId).toBe(f.dest.st.id);
    f.dest.sys.permit = true; f.p.rep[f.dest.sys.factionId] = 0;
    expect(plotLastLeg(f.w, f.c)).toBe(false); expect(f.c.lastLeg).toBeDefined();
  });

  it("requires the actual crew member at the chosen port before the farewell", () => {
    const f = fixture(); beginLastLeg(f.w, f.c, f.dest.st.id);
    expect(finishLastLeg(f.w, f.c, false)).toBeNull();
    f.arrive(); expect(lastLegAtPort(f.w, f.c)).toBe(true);
    expect(finishLastLeg(f.w, { ...f.c }, false)).toBeNull();
    f.p.dockedAt = null; expect(finishLastLeg(f.w, f.c, false)).toBeNull();
    expect(f.p.alumni).toEqual([]); expect(f.w.mailQueue).toEqual([]);
  });

  it("allows a farewell without money and settles alumni, crew, keepsake and letter once", () => {
    const f = fixture(); beginLastLeg(f.w, f.c, f.dest.st.id); f.arrive();
    f.p.numberOne = f.c.name; f.p.credits = 0;
    expect(finishLastLeg(f.w, f.c, true)).toBeNull(); expect(f.p.crew).toContain(f.c);
    expect(finishLastLeg(f.w, f.c, false)).toContain("WATCH TALLY");
    expect(f.p.crew).not.toContain(f.c); expect(f.p.numberOne).toBeUndefined();
    expect(f.p.alumni).toHaveLength(1); expect(f.p.alumni![0]).toMatchObject({ stationId: f.dest.st.id, finalJourney: true });
    expect(f.other.morale).toBe(75); expect(f.p.credits).toBe(0);
    expect(f.p.keepsakes).toHaveLength(1); expect(f.w.mailQueue).toHaveLength(1);
    const letter = f.w.mailQueue![0]; expect(letter.text).toContain("The yard hired me");
    expect(tickMail(f.w)).toEqual([]); f.w.time = letter.dueT; expect(tickMail(f.w)).toHaveLength(1);
    expect(f.p.mail).toHaveLength(1); expect(tickMail(f.w)).toEqual([]);
    expect(finishLastLeg(f.w, f.c, false)).toBeNull();
    expect(f.p.alumni).toHaveLength(1); expect(f.other.morale).toBe(75);
  });

  it("charges a voluntary bonus exactly once", () => {
    const f = fixture(); beginLastLeg(f.w, f.c, f.dest.st.id); f.arrive();
    expect(finishLastLeg(f.w, f.c, true)).toContain("300CR");
    expect(f.p.credits).toBe(500); expect(f.other.morale).toBe(78);
    expect(finishLastLeg(f.w, f.c, true)).toBeNull(); expect(f.p.credits).toBe(500);
  });

  it("does not fabricate a completed journey after another departure, and keeps shore leave explicit", () => {
    const f = fixture(); beginLastLeg(f.w, f.c, f.dest.st.id);
    sendOnLeave(f.p, f.c, f.start.id);
    expect(plotLastLeg(f.w, f.c)).toBe(false); expect(finishLastLeg(f.w, f.c, false)).toBeNull();
    collectShoreCrew(f.p, f.start.id, 5); expect(f.p.crew).toContain(f.c);
    expect(f.c.lastLeg?.stationId).toBe(f.dest.st.id);
    retireCrew(f.p, f.c, f.start.id, f.w.time); f.arrive();
    expect(finishLastLeg(f.w, f.c, false)).toBeNull();
    expect(f.p.alumni).toHaveLength(1); expect(f.p.alumni![0].finalJourney).toBeUndefined();
    expect(f.w.mailQueue).toEqual([]);
  });

  it("offers the final journey to a crew member who had an older retirement conversation", () => {
    const f = fixture(), { g } = game(f); f.c.retireAsked = true;
    const rng = new RNG(1); vi.spyOn(rng, "chance").mockReturnValue(true);
    (g.scenes.station as StationScene).retirement(g, rng);
    const card = g.scenes.encounter as EncounterScene;
    expect(card.enc.options[0].label).toContain("ONE LAST LEG");
    card.enc.options[0].result(g, rng);
    expect(f.c.lastLeg?.stationId).toBe(f.dest.st.id); expect(f.p.crew).toContain(f.c);
    expect(g.autosave).toHaveBeenCalledOnce();
    card.enc.options[0].result(g, rng); expect(g.autosave).toHaveBeenCalledOnce();
  });

  it("puts the old hand and crew on reachable station floor, then opens the farewell with E", () => {
    const f = fixture(), { g, keys } = game(f); beginLastLeg(f.w, f.c, f.dest.st.id); f.arrive();
    g.setScene("stationwalk"); const walk = g.scenes.stationwalk as StationWalkScene;
    const person = walk.npcs.find(n => n.farewell === f.c)!;
    expect(person).toBeDefined(); expect(walk.msg).toContain("SAY GOODBYE");
    for (const n of walk.npcs.filter(n => n.farewell || n.tag === "SHIPMATE")) expect(walk.solid(Math.floor(n.x / 10), Math.floor(n.y / 10))).toBe(false);
    walk.px = person.x - 8; walk.py = person.y;
    keys.add("e"); walk.update(g, 0); keys.clear(); expect(g.sceneName).toBe("encounter");
    const card = g.scenes.encounter as EncounterScene;
    expect(card.enc.id).toBe("last-leg-farewell");
    card.enc.options[2].result(g, new RNG(1)); expect(f.p.crew).toContain(f.c);
    card.enc.options[0].result(g, new RNG(1)); expect(g.autosave).toHaveBeenCalledOnce();
    card.back(g); expect(g.sceneName).toBe("stationwalk");
    expect(walk.npcs.some(n => n.farewell)).toBe(false);
    expect(walk.npcs.find(n => n.name === f.c.name && n.tag === "RETIRED")?.line).toContain("place I chose");
    // The talk prompt still works if the retired shipmate wanders beside a kiosk.
    const retired = walk.npcs.find(n => n.name === f.c.name && n.tag === "RETIRED")!;
    for (let y = 0; y < 11; y++) for (let x = 0; x < 40; x++) if (walk.tileAt(x, y) === "O") {
      retired.x = walk.px = (x - 1) * 10 + 5; retired.y = walk.py = y * 10 + 5;
    }
    expect(walk.nearestKiosk()).not.toBeNull();
    keys.add("e"); walk.update(g, 0); keys.clear();
    expect(g.sceneName).toBe("stationwalk"); expect(walk.msg).toContain("place I chose");
  });
});
