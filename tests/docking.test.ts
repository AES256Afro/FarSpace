import { afterEach, describe, expect, it, vi } from "vitest";
import { beginDockVisit, currentDockVisit } from "../src/core/docking";
import { generateWorld, findStation, crewWages } from "../src/world";
import { Game } from "../src/game";
import { StationScene } from "../src/scenes/station";
import { StationWalkScene } from "../src/scenes/stationwalk";
import { FlightScene } from "../src/scenes/flight/index";
import { EncounterScene } from "../src/scenes/encounter";
import { LettersScene } from "../src/scenes/letters";
import { migrateSave, SAVE_VERSION } from "../src/save";
import * as wire from "../src/core/wire";
import * as dialog from "../src/core/dialog";

afterEach(() => vi.restoreAllMocks());
function fixture() {
  vi.spyOn(wire, "fetchSquadronData").mockResolvedValue(undefined);
  vi.spyOn(wire, "fetchBases").mockResolvedValue([]);
  vi.spyOn(wire, "fetchRaceRecords").mockResolvedValue([]);
  vi.spyOn(wire, "getSquadron").mockReturnValue(null);
  vi.spyOn(wire, "getCallsign").mockReturnValue(null);
  vi.spyOn(wire, "post").mockResolvedValue(undefined);
  const w = generateWorld(403), p = w.player, st = w.systems[p.systemId].stations[0];
  p.tutorial = -1; p.credits = 2000; p.cargo = { food: 20 }; p.achievements = []; p.missions = [];
  p.crew = [{ name: "Ada Vale", role: "engineer", skill: 2, wage: 80, morale: 70, docks: 4, loyalty: 3 }];
  const station = new StationScene(), flight = new FlightScene(), keys = new Set<string>();
  vi.spyOn(station, "crewRequest").mockImplementation(() => {});
  const g = Object.assign(Object.create(Game.prototype), { world: w, scenes: { station, flight, stationwalk: new StationWalkScene(), encounter: new EncounterScene(), letters: new LettersScene() }, sceneName: "flight", spriteCache: new Map(),
    input: { wasPressed: (key: string) => keys.has(key), isDown: () => false, mousePressed: false, mouseX: 0, mouseY: 0, wheel: 0 },
    toast: vi.fn(), showHint: vi.fn(), autosave: vi.fn(),
  }) as Game;
  return { w, p, st, g, station, flight, keys };
}
function totals(f: ReturnType<typeof fixture>) {
  const p = f.g.world.player;
  return { credits: p.credits, cargo: { ...p.cargo }, docks: { ...p.dockings }, crew: JSON.parse(JSON.stringify(p.crew)), leg: JSON.parse(JSON.stringify(p.leg ?? null)), sim: p.simUsed, briefed: p.briefed, focus: p.focus };
}
describe("one settled visit to port", () => {
  it("requires a real station in the current system", () => {
    const { w, p, st } = fixture(); expect(currentDockVisit(w)).toBeNull(); expect(beginDockVisit(w, "missing")).toBe(false);
    const other = Object.values(w.systems).find(s => s.id !== p.systemId && s.stations.length)!.stations[0];
    expect(beginDockVisit(w, other.id)).toBe(false); expect(p.dockedAt).toBeNull();
    expect(beginDockVisit(w, st.id)).toBe(true); expect(currentDockVisit(w)).toMatchObject({ stationId: st.id, startedAt: w.time, settled: false });
  });
  it("settles wages, food, crew experience and passenger stops exactly once across menu returns", () => {
    const f = fixture(), { w, p, st, g, station } = f; const wages = crewWages(p);
    p.missions = [{ id: "fare", kind: "passenger", title: "A cabin", desc: "Home", fromStationId: st.id, targetSystemId: w.systems[p.systemId].links[0], targetStationId: "elsewhere", accepted: true, done: false, reward: 100, mood: 60, docksAboard: 0 }];
    beginDockVisit(w, st.id); g.setScene("station"); const after = totals(f), stops = p.missions[0].docksAboard;
    expect(p.credits).toBe(2000 - wages); expect(p.cargo.food).toBe(19); expect(p.crew[0].docks).toBe(5); expect(stops).toBe(1);
    station.tab = 4; const board = station.boardMissions, fares = station.fares, candidates = station.candidates;
    for (const seconds of [0, 1, 61, 3600]) { w.time += seconds; g.setScene("stationwalk"); g.setScene("station"); }
    expect(totals(f)).toEqual(after); expect(p.missions[0].docksAboard).toBe(stops); expect(station.tab).toBe(4);
    expect(station.boardMissions).toBe(board); expect(station.fares).toBe(fares); expect(station.candidates).toBe(candidates); expect(g.autosave).toHaveBeenCalledOnce();
  });
  it("keeps sim use, counselling and a briefing made during the same visit", () => {
    const f = fixture(), { w, p, st, g } = f; beginDockVisit(w, st.id); g.setScene("station");
    p.simUsed = true; p.briefed = true; p.focus = "explore"; p.crew[0].counselled = true;
    const before = totals(f); w.time += 90; g.setScene("stationwalk"); g.setScene("station"); expect(totals(f)).toEqual(before);
    beginDockVisit(w, st.id); g.setScene("station"); expect(p.simUsed).toBe(false); expect(p.briefed).toBe(false); expect(p.focus).toBeNull(); expect(p.crew[0].counselled).toBe(false);
  });
  it("settles a genuine second arrival even at the same station and same timestamp", () => {
    const f = fixture(), { w, p, st, g } = f; beginDockVisit(w, st.id); g.setScene("station"); const first = p.dockVisit, credits = p.credits;
    p.dockedAt = null; beginDockVisit(w, st.id); g.setScene("station"); expect(p.dockVisit).not.toBe(first);
    expect(p.credits).toBe(credits - crewWages(p)); expect(p.crew[0].docks).toBe(6); expect(p.dockings?.[st.id]).toBe(2);
  });
  it("persists completed settlement and after-arrival resets before autosave", () => {
    const f = fixture(), { w, p, st, g } = f; p.simUsed = true; p.briefed = true; p.crew[0].counselled = true;
    let saved = ""; g.autosave = () => { saved = JSON.stringify(w); }; beginDockVisit(w, st.id); g.setScene("station");
    const disk = JSON.parse(saved); expect(disk.player.dockVisit.settled).toBe(true); expect(disk.player.simUsed).toBe(false); expect(disk.player.briefed).toBe(false); expect(disk.player.crew[0].counselled).toBe(false);
    const after = totals(f); disk.version = SAVE_VERSION; g.world = migrateSave(disk)!; g.world.time += 600; g.setScene("station"); expect(totals(f)).toEqual(after);
  });
  it("does not charge an older already-docked save or reset its current activities", () => {
    const f = fixture(), { w, p, st, g } = f; p.dockedAt = st.id; p.simUsed = true; p.briefed = true; p.crew[0].counselled = true;
    const before = totals(f); w.version = SAVE_VERSION; g.world = migrateSave(JSON.parse(JSON.stringify(w)))!; g.setScene("station");
    expect(totals(f)).toEqual(before); expect(g.world.player.dockVisit?.settled).toBe(true); expect(g.autosave).not.toHaveBeenCalled();
  });
  it("settles a saved pending arrival once and rejects cached services from another world", () => {
    const f = fixture(), { w, p, st, g, station } = f; beginDockVisit(w, st.id); w.version = SAVE_VERSION;
    const pending = migrateSave(JSON.parse(JSON.stringify(w)))!; g.setScene("station"); const oldBoard = station.boardMissions;
    g.world = pending; g.setScene("station"); expect(g.world.player.credits).toBe(p.credits); expect(g.world.player.dockVisit?.settled).toBe(true); expect(station.boardMissions).not.toBe(oldBoard);
    g.setScene("station"); expect(g.world.player.crew[0].docks).toBe(5);
  });
  it("returning from an arrival encounter preserves settlement and the selected services tab", () => {
    const f = fixture(), { w, p, st, g, station } = f; beginDockVisit(w, st.id); g.setScene("station"); station.tab = 9;
    const after = totals(f), card = g.scenes.encounter as EncounterScene;
    card.open(g, { id: "port-test", where: "space", title: "AT THE CLAMP", text: "A visitor", weight: 0, options: [] }, "station", true);
    w.time += 30; card.back(g); expect(totals(f)).toEqual(after); expect(station.tab).toBe(9); expect(p.dockVisit?.settled).toBe(true);
  });
  it("preserves kiosk return to deck and lets deck Escape return to launch services", () => {
    const { w, st, g, station, keys } = fixture(); beginDockVisit(w, st.id); g.setScene("station");
    station.returnTo = "stationwalk"; keys.add("Escape"); station.update(g, 0); keys.clear(); expect(g.sceneName).toBe("stationwalk");
    keys.add("Escape"); g.scene.update(g, 0); keys.clear(); expect(g.sceneName).toBe("station"); expect(station.returnTo).toBe("flight");
    keys.add("Escape"); station.update(g, 0); keys.clear(); expect(g.sceneName).toBe("flight"); expect(w.player.dockedAt).toBeNull();
  });
  it("starts a new visit on the completed approach without settling during the glide", () => {
    const f = fixture(), { w, p, st, g, flight } = f; g.setScene("flight");
    flight.docking = { st, bay: 2, t: 0, x0: p.x, y0: p.y };
    flight.updateDocking(g, 0.5); expect(p.dockedAt).toBeNull(); expect(p.credits).toBe(2000);
    flight.updateDocking(g, 1.2); expect(p.dockedAt).toBe(st.id); expect(p.dockVisit?.settled).toBe(true); expect(p.credits).toBe(1920);
  });
  it("starts a visit after emergency recovery and a liner trip", () => {
    const f = fixture(), { w, p, st, g, station, flight } = f; p.crew = []; p.hull = 0; w.hardcore = false;
    g.setScene("flight"); flight.destroyed(g); expect(p.dockVisit?.settled).toBe(true); const recovery = p.dockVisit;
    const dest = Object.values(w.systems).flatMap(s => s.stations).find(s => s.id !== st.id)!;
    p.cargo = {}; p.credits = 20000; p.fleet = [{ hullId: "scout", stationId: dest.id, hull: 70, torpedoes: 0 }];
    vi.spyOn(dialog, "confirmBox").mockReturnValue(true); station.takeTheLiner(g);
    expect(p.dockedAt).toBe(dest.id); expect(p.dockVisit?.stationId).toBe(dest.id); expect(p.dockVisit?.settled).toBe(true); expect(p.dockVisit).not.toBe(recovery);
  });
  it("ignores late base and race responses from an earlier world at the same station", async () => {
    const { w, p, st, g, station } = fixture(); w.realGalaxy = true; st.military = false; p.dockedAt = st.id;
    let baseDone!: (b: any) => void, raceDone!: (r: any) => void;
    vi.spyOn(wire, "getSquadron").mockReturnValue("TEST");
    vi.spyOn(wire, "fetchBase").mockReturnValueOnce(new Promise(r => { baseDone = r; })).mockResolvedValue(null);
    vi.spyOn(wire, "fetchRaceRecords").mockReturnValueOnce(new Promise(r => { raceDone = r; })).mockResolvedValue([]);
    g.setScene("station"); const oldStation = station.station; w.version = SAVE_VERSION;
    g.world = migrateSave(JSON.parse(JSON.stringify(w)))!; g.setScene("station"); await Promise.resolve();
    expect(station.station).not.toBe(oldStation); expect(station.base).toBeNull(); expect(station.raceRecords).toEqual([]);
    baseDone({ stationId: "stale", tag: "OLD" }); raceDone([{ callsign: "OLD" }]); await Promise.resolve();
    expect(station.base).toBeNull(); expect(station.raceRecords).toEqual([]);
  });
});
