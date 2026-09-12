// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Storage as TestStorage } from "happy-dom";
import { Game } from "../src/game";
import { generateWorld, findStation, type Mission } from "../src/world";
import { journeyBriefing, journeyRecordSections, focusedObjective, pinObjective, reconcileObjective } from "../src/core/journey";
import { questLocations } from "../src/core/questlocations";
import { JourneyScene, openJourney } from "../src/scenes/journey";
import { StationScene } from "../src/scenes/station";
import { FlightScene } from "../src/scenes/flight/index";
import { flightDisplay, flightRecordSections } from "../src/scenes/flight/display";
import { systemContacts } from "../src/scenes/systemmap";
import { updateVoyageSystems } from "../src/core/runtime";
import { decodeSave, SAVE_VERSION } from "../src/save";
import { schoolOffer } from "../src/core/flightschool";
import { workshop } from "../src/core/workshop";
import * as wire from "../src/core/wire";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });
function fixture(count = 2) {
  vi.stubGlobal("localStorage", new TestStorage()); vi.stubGlobal("sessionStorage", new TestStorage());
  vi.spyOn(wire, "getCallsign").mockReturnValue(null);
  const world = generateWorld(422), p = world.player, home = findStation(world, p.flightSchool!.homeStationId)!;
  p.tutorial = -1; p.story = 0; p.story2 = -1; p.story3 = -1; p.missions = [];
  for (let i = 0; i < count; i++) p.missions.push({ id: `test-${i}`, kind: "delivery", title: `Supply shipment ${i}`, desc: `Complete terms ${i}. `.repeat(40) + `END TERMS ${i}`, fromStationId: home.st.id, targetStationId: home.st.id, targetSystemId: home.sys.id, commodityId: "parts", qty: i + 1, accepted: true, done: false, reward: 100 + i } as Mission);
  const journey = new JourneyScene(), flight = new FlightScene(), keys = new Set<string>();
  const input = { down: new Set<string>(), wheel: 0, mousePressed: false, mouseX: 0, mouseY: 0, flush: () => keys.clear(), wasPressed: (k: string) => keys.has(k), isDown: () => false };
  const g = Object.assign(Object.create(Game.prototype), { world, input, frontend: false, sceneName: "flight", scene: flight, scenes: { journey, flight, station: { enter: vi.fn() } }, spriteCache: new Map(), toast: vi.fn(), autosave: vi.fn(() => true), showHint: vi.fn() }) as Game;
  const press = (key: string) => { keys.add(key); journey.update(g); keys.clear(); };
  return { g, world, p, home, journey, flight, keys, input, press };
}

describe("voyage briefing sources", () => {
  it("reads current people, manifest, condition and existing history without changing the world", () => {
    const { world, p, home } = fixture(); p.shipName = "Return Test"; p.dockedAt = home.st.id; p.cargo = { parts: 8 }; p.materials = { iron: 12 };
    p.crew = [{ name: "Ari", role: "engineer", skill: 1, morale: 55, wage: 10 }];
    p.evacuees = { n: 3, from: "Damaged freighter" }; p.hull = 43.2; p.log = [{ t: 40, text: "An actual log entry" }];
    const before = JSON.stringify(world), b = journeyBriefing(world), records = journeyRecordSections(world);
    expect(b.location).toContain(home.st.name); expect(b.aboard).toContain("8/"); expect(b.aboard).toContain("12 materials"); expect(b.aboard).toContain("3 survivors"); expect(b.condition).toContain("Hull 44/");
    expect(b.completed).toContain("No completed"); expect(records.flat(2).join(" ")).toContain("An actual log entry"); expect(records.flat(2).join(" ")).toContain("END TERMS 1");
    expect(JSON.stringify(world)).toBe(before);
  });
  it("pins only existing unique work and changes no course, reward or mission state", () => {
    const { world, p, home } = fixture(); p.navTarget = home.sys.id;
    const before = JSON.stringify(world); expect(pinObjective(world, "mission:missing")).toBe(false); expect(JSON.stringify(world)).toBe(before);
    expect(pinObjective(world, "mission:test-1")).toBe(true); expect(focusedObjective(world)?.id).toBe("mission:test-1");
    delete p.objectiveFocusId; expect(JSON.stringify(world)).toBe(before);
    p.missions.push({ ...p.missions[0] }); expect(pinObjective(world, "mission:test-0")).toBe(false);
  });
  it("keeps the owning mission through destination changes and resolves completed, failed or missing work", () => {
    const { world, p, home } = fixture(); const m = p.missions[0]; m.kind = "bounty"; m.killsNeeded = 2; m.kills = 1; delete m.commodityId; delete m.qty;
    pinObjective(world, "mission:test-0"); expect(focusedObjective(world)?.contactId).toBeUndefined();
    m.kills = 2; expect(focusedObjective(world)?.contactId).toBe(`station:${home.st.id}`);
    m.done = true; expect(focusedObjective(world)).toBeUndefined(); reconcileObjective(world); expect(p.objectiveFocusId).toBeUndefined();
    pinObjective(world, "mission:test-1"); p.missions = []; reconcileObjective(world); expect(p.objectiveFocusId).toBeUndefined();
    const other = fixture(); pinObjective(other.world, "mission:test-0"); other.home.sys.stations = []; reconcileObjective(other.world); expect(other.p.objectiveFocusId).toBeUndefined();
  });
  it("keeps a crew objective through roster reordering and rejects a vanished wreck", () => {
    const { world, p, home } = fixture(0); const wreck = home.sys.wrecks[0]; expect(wreck).toBeDefined();
    const ari = { name: "Ari", role: "engineer" as const, skill: 1, morale: 55, wage: 10, arc: { id: "engineer", stage: 0, targetSystemId: home.sys.id, wreckId: wreck.id } };
    p.crew = [ari]; const id = questLocations(world)[0].id; pinObjective(world, id);
    p.crew.unshift({ name: "Sam", role: "pilot", skill: 1, morale: 55, wage: 10 }); expect(focusedObjective(world)?.id).toBe(id);
    home.sys.wrecks = []; reconcileObjective(world); expect(p.objectiveFocusId).toBeUndefined();
  });
  it("does not carry an old council focus into a new mandate", () => {
    const { world, p, home } = fixture(0);
    p.council = { stationId: home.st.id, mandate: { week: "2026-W37", fromStationId: home.st.id, targetStationId: home.st.id, resolution: "Carry the reply", stage: "outbound" } } as typeof p.council;
    const id = questLocations(world)[0].id; pinObjective(world, id);
    p.council!.mandate!.stage = "return"; expect(focusedObjective(world)?.id).toBe(id);
    p.council!.mandate!.week = "2026-W38"; reconcileObjective(world); expect(p.objectiveFocusId).toBeUndefined();
  });
  it("carries the chosen objective into the HUD, records and local map contacts", () => {
    const { g, world, home, flight } = fixture(); pinObjective(world, "mission:test-1");
    expect(flightDisplay(flight, g).focus).toContain("Supply shipment 1");
    expect(flightRecordSections(flight, g).find(([title]) => title.startsWith("CHOSEN"))?.[1].join(" ")).toContain("END TERMS 1");
    expect(systemContacts(g).find(c => c.id === `station:${home.st.id}`)?.quests?.[0]).toMatchObject({ id: "mission:test-1", focused: true });
  });
  it("records actual port completion once, with no inferred receipt for repeated or unavailable payment", () => {
    const { g, world, p, home } = fixture(0); p.tutorial = 2;
    const m = schoolOffer(world, home.st.id)!; expect(m).not.toBeNull(); m.accepted = true; p.missions.push(m);
    const target = findStation(world, m.targetStationId!)!, scene = new StationScene(); scene.station = target.st;
    p.systemId = target.sys.id; p.dockedAt = target.st.id;
    scene.completeMission(g, m); expect(p.lastContractReceipt).toEqual({ id: m.id, title: m.title, time: world.time, stationId: target.st.id });
    const receipt = JSON.stringify(p.lastContractReceipt), credits = p.credits; world.time += 10; scene.completeMission(g, m);
    expect(JSON.stringify(p.lastContractReceipt)).toBe(receipt); expect(p.credits).toBe(credits);
  });
});

describe("briefing navigation and persistence", () => {
  it("pauses all voyage systems and preserves existing flight state on return", () => {
    const { g, world, journey, flight, press } = fixture(); workshop(world.player).queue = [{ recipe: "parts", remaining: 1, progress: 0 }];
    flight.autopilot = true; flight.localTarget = { systemId: world.player.systemId, id: "station:test" };
    const entered = vi.spyOn(flight, "enter").mockImplementation(() => {}), before = JSON.stringify(world);
    openJourney(g); for (let i = 0; i < 60; i++) { journey.update(g); updateVoyageSystems(g, 1); }
    expect(g.sceneName).toBe("journey"); expect(JSON.stringify(world)).toBe(before); expect(flight.autopilot).toBe(true);
    press("Escape"); expect(g.sceneName).toBe("flight"); expect(flight.resumeNext).toBe(true); expect(entered).toHaveBeenCalledOnce(); expect(JSON.stringify(world)).toBe(before);
  });
  it("loads into a paused briefing before entering the saved destination scene", () => {
    const { g, world, home, journey, press } = fixture(); world.player.dockedAt = home.st.id; world.player.objectiveFocusId = "mission:test-1";
    localStorage.setItem("farspace-save", JSON.stringify(world)); g.justUndocked = true; g.load();
    expect(g.sceneName).toBe("journey"); expect(g.scenes.station.enter).not.toHaveBeenCalled(); expect(g.justUndocked).toBe(false);
    expect(journey.view.selected).toBe("mission:test-1"); press("Escape"); expect(g.scenes.station.enter).toHaveBeenCalledOnce();
  });
  it("routes the station F9 shortcut through the saved voyage briefing", () => {
    const { g, world, home, keys } = fixture(); const station = new StationScene(); station.station = home.st;
    world.player.dockedAt = home.st.id; localStorage.setItem("farspace-save", JSON.stringify(world));
    g.scene = station; g.sceneName = "station"; g.scenes.station = station; keys.add("F9"); station.update(g, 0);
    expect(g.sceneName).toBe("journey"); expect(g.scenes.journey.pausesVoyage).toBe(true);
  });
  it("reaches late rows, retains their identity through reordering and rejects an obsolete click", () => {
    const { g, world, journey, input, press } = fixture(80); openJourney(g); press("End"); expect(journey.view.selected).toBe("mission:test-79");
    press("Enter"); expect(world.player.objectiveFocusId).toBe("mission:test-79"); expect(journey.view.selected).toBe("mission:test-79");
    press("Home"); journey.drawn = ["mission:test-0"]; world.player.missions = world.player.missions.filter(m => m.id !== "test-0");
    input.mousePressed = true; input.mouseX = 20; input.mouseY = 110; journey.update(g); expect(g.toast).toHaveBeenCalledWith("THAT OBJECTIVE IS NO LONGER AVAILABLE.");
    expect(world.player.objectiveFocusId).toBe("mission:test-79");
  });
  it("does not pin the adjacent item when the selected owner is removed", () => {
    const { g, world, journey, press } = fixture(); openJourney(g); world.player.missions.shift(); press("Enter"); expect(world.player.objectiveFocusId).toBeUndefined(); expect(g.autosave).not.toHaveBeenCalled();
    journey.query = "does not exist"; journey.sync(g); press("Enter"); expect(world.player.objectiveFocusId).toBeUndefined();
  });
  it("keeps complete searchable records and search input cannot pin or continue", () => {
    const { g, world, journey, press } = fixture(40); openJourney(g); press("l"); expect(journey.info).toBeDefined();
    journey.info!.search("END TERMS 39"); expect(journey.info!.blocks.flatMap(b => b.lines).join(" ")).toContain("END TERMS 39");
    press("Escape"); expect(journey.info).toBeUndefined(); press("/"); expect(journey.capturesKeys).toBe(true);
    press("Enter"); expect(g.sceneName).toBe("journey"); expect(world.player.objectiveFocusId).toBeUndefined();
    journey.onSceneLeave(); expect(journey.capturesKeys).toBe(false); expect(document.querySelector("input")).toBeNull();
  });
  it("migrates old saves without fabricating a focus or receipt and rejects malformed new fields", () => {
    const { world, p, home } = fixture(); world.version = 17;
    const old = decodeSave(JSON.stringify(world)).world!; expect(old.version).toBe(SAVE_VERSION); expect(old.player.objectiveFocusId).toBeUndefined(); expect(old.player.lastContractReceipt).toBeUndefined();
    p.objectiveFocusId = "mission:test-0"; p.lastContractReceipt = { id: "old", title: "Delivered supplies", time: 12, stationId: home.st.id };
    const loaded = decodeSave(JSON.stringify(world)).world!; expect(focusedObjective(loaded)?.id).toBe(p.objectiveFocusId); expect(loaded.player.lastContractReceipt).toEqual(p.lastContractReceipt);
    for (const bad of [null, 2, "", [], {}]) { const raw = JSON.parse(JSON.stringify(world)); raw.player.objectiveFocusId = bad; expect(decodeSave(JSON.stringify(raw)).world).toBeNull(); }
    p.lastContractReceipt.time = -1; expect(decodeSave(JSON.stringify(world)).world).toBeNull();
  });
});
