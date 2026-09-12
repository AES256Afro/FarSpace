import { afterEach, describe, expect, it, vi } from "vitest";
import { Game } from "../src/game";
import { generateWorld, findStation, jumpFuelCost, missionDeliverable, cargoUsed } from "../src/world";
import { FlightScene } from "../src/scenes/flight/index";
import { StationScene } from "../src/scenes/station";
import { tutorialUpdate, tutorialText, tutorialDetails, actionKey, STEPS } from "../src/core/tutorial";
import { schoolOffer, schoolAccepted, schoolDeliveryTarget } from "../src/core/flightschool";
import { decodeSave, SAVE_VERSION } from "../src/save";
import { questLocations } from "../src/core/questlocations";
import { settings } from "../src/core/settings";
import * as wire from "../src/core/wire";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); settings().keymap = {}; });
function fixture(seed = 421, realGalaxy = false, maxLy = 20) {
  vi.spyOn(wire, "getCallsign").mockReturnValue(null);
  const world = generateWorld(seed, { realGalaxy, maxLy }), p = world.player, fs = new FlightScene(), station = new StationScene(), keys = new Set<string>();
  Object.assign(p, { story: 99, story2: -1, story3: -1 });
  const g = Object.assign(Object.create(Game.prototype), { world, sceneName: "flight", frontend: false, scenes: { flight: fs, station }, toast: vi.fn(), autosave: vi.fn(() => true), input: { isDown: (key: string) => keys.has(key), wasPressed: () => false } }) as Game;
  return { g, fs, station, p, keys, school: p.flightSchool!, home: findStation(world, p.flightSchool!.homeStationId)! };
}

describe("first flight lesson", () => {
  it("requires actual manual thrust and braking, never elapsed time, autopilot or a stationary key tap", () => {
    const { g, fs, p, keys, school } = fixture(); g.world.time = 99999; tutorialUpdate(g); expect(p.tutorial).toBe(0);
    p.vx = 80; fs.engineBurn = true; tutorialUpdate(g); expect(school.thrustSeen).toBeUndefined();
    keys.add("w"); fs.engineBurn = false; tutorialUpdate(g); expect(school.thrustSeen).toBeUndefined();
    fs.engineBurn = true; tutorialUpdate(g); expect(school.thrustSeen).toBe(true);
    keys.clear(); keys.add("x"); fs.engineBurn = false; p.vx = 0; tutorialUpdate(g); expect(p.tutorial).toBe(0);
    p.vx = 20; fs.engineBurn = true; tutorialUpdate(g); expect(school.brakeSeen).toBe(true);
    p.vx = 0; fs.engineBurn = false; const credits = p.credits; tutorialUpdate(g); expect(p.tutorial).toBe(1); expect(p.credits).toBe(credits + 50);
    tutorialUpdate(g); expect(p.credits).toBe(credits + 50);
  });
  it("keeps progress through save/load and separate worlds, and cannot pay a repeated lesson", () => {
    const a = fixture(1), b = fixture(2); a.p.flightSchool!.thrustSeen = true; a.p.flightSchool!.brakeSeen = true;
    const loaded = decodeSave(JSON.stringify(a.g.world)).world!; expect(loaded.player.flightSchool?.thrustSeen).toBe(true); a.g.world = loaded;
    a.keys.add("x"); loaded.player.vx = loaded.player.vy = 0; tutorialUpdate(a.g); expect(loaded.player.tutorial).toBe(1);
    const credits = loaded.player.credits; loaded.player.tutorial = 0; tutorialUpdate(a.g); expect(loaded.player.credits).toBe(credits);
    b.keys.add("x"); tutorialUpdate(b.g); expect(b.p.tutorial).toBe(0); expect(b.school.thrustSeen).toBeUndefined();
  });
  it("does not progress from docked, paused, launching or reader input", () => {
    const { g, fs, p, keys } = fixture(); keys.add("w"); p.vx = 100; fs.engineBurn = true;
    for (const mode of ["paused", "mapOpen", "logOpen"] as const) { fs[mode] = true; tutorialUpdate(g); expect(p.flightSchool!.thrustSeen).toBeUndefined(); fs[mode] = false; }
    fs.launching = 1; tutorialUpdate(g); expect(p.flightSchool!.thrustSeen).toBeUndefined();
    g.sceneName = "station"; tutorialUpdate(g); expect(tutorialText(g)).toContain("UNDOCK"); expect(p.tutorial).toBe(0);
  });
  it("uses the physical bindings in prompts and explains the missing stop", () => {
    const { g, school } = fixture(); settings().keymap = { ArrowUp: "w", w: "m", q: "x", x: "i" };
    expect(actionKey("w")).toBe("ARROWUP"); expect(tutorialText(g)).toContain("ARROWUP THRUST"); school.thrustSeen = true;
    expect(tutorialText(g)).toContain("Q HOLD BRAKE"); expect(tutorialText(g)).toContain("TURNING ALONE");
  });
});

describe("reachable first work", () => {
  it("offers a cargo-free job and affordable round trip across Sol sizes and Uncharted seeds", () => {
    for (const real of [false, true]) for (const maxLy of real ? [20, 50] : [20]) for (let seed = 0; seed < 40; seed++) {
      const { g, p, home, school } = fixture(seed, real, maxLy); p.cargoMax = cargoUsed(p);
      const target = schoolDeliveryTarget(g.world), offer = schoolOffer(g.world, school.homeStationId);
      expect(target, `seed ${seed} real ${real} radius ${maxLy}`).not.toBeNull(); expect(offer).not.toBeNull();
      expect(offer!.kind).toBe("post"); expect(offer!.qty).toBeUndefined(); expect(offer!.tier).toBe(0); expect(target!.st.military).not.toBe(true);
      if (target!.sys.id !== home.sys.id) expect(jumpFuelCost(g.world, home.sys.id, target!.sys.id) * 2 + 20).toBeLessThanOrEqual(p.fuelMax);
      expect(p.crew).toHaveLength(0); expect(p.fuel).toBeGreaterThan(20); expect(p.credits).toBeGreaterThan(0);
      expect(schoolOffer(g.world, target!.st.id)).toBeNull();
    }
  });
  it("tracks the real acceptance, payment, home return and final successful save", () => {
    const { g, p, station, school, home } = fixture(); p.tutorial = 1; p.dockedAt = home.st.id; g.sceneName = "station"; station.station = home.st;
    tutorialUpdate(g); expect(p.tutorial).toBe(2); const offer = schoolOffer(g.world, home.st.id)!;
    station.acceptMission(g, offer); expect(school.missionId).toBe(offer.id); tutorialUpdate(g); expect(p.tutorial).toBe(3);
    const destination = findStation(g.world, offer.targetStationId!)!; p.systemId = destination.sys.id; p.dockedAt = destination.st.id; station.station = destination.st;
    expect(missionDeliverable(g.world, offer, destination.st)).toBe(true); expect(tutorialText(g)).toContain("COLLECT PAYMENT");
    const credits = p.credits; station.completeMission(g, offer); expect(school.delivered).toBe(true); expect(p.credits).toBeGreaterThanOrEqual(credits + 180);
    tutorialUpdate(g); expect(p.tutorial).toBe(4); const paid = p.credits; station.completeMission(g, offer); expect(p.credits).toBe(paid);
    p.systemId = home.sys.id; p.dockedAt = home.st.id; station.station = home.st; tutorialUpdate(g); expect(p.tutorial).toBe(5);
    let saved = ""; vi.mocked(g.autosave).mockImplementation(() => { saved = JSON.stringify(g.world); return true; });
    expect(g.save()).toBe(true); expect(p.tutorial).toBe(STEPS.length); expect(JSON.parse(saved).player.flightSchool.saved).toBe(true);
    const doneCredits = p.credits; g.save(); tutorialUpdate(g); expect(p.credits).toBe(doneCredits);
  });
  it("does not finish school on an automatic save or a failed manual save", () => {
    const { g, p, school } = fixture(); p.tutorial = 5; p.dockedAt = school.homeStationId; school.delivered = true;
    g.autosave(); expect(p.tutorial).toBe(5); expect(school.saved).toBeUndefined();
    vi.mocked(g.autosave).mockReturnValue(false); expect(g.save()).toBe(false); expect(p.tutorial).toBe(5); expect(school.saved).toBeUndefined();
    vi.mocked(g.autosave).mockReturnValue(true); p.dockedAt = null; expect(g.save()).toBe(true); expect(p.tutorial).toBe(5); expect(tutorialText(g)).not.toContain("SAFE AT");
  });
  it("marks the current lesson port and clears it after skipping without touching a contract or route", () => {
    const { g, p, home } = fixture(); p.tutorial = 2; const offer = schoolOffer(g.world, home.st.id)!;
    expect(questLocations(g.world).find(q => q.source === "SCHOOL")?.contactId).toBe(`station:${home.st.id}`);
    offer.accepted = true; p.missions.push(offer); schoolAccepted(g.world, offer); tutorialUpdate(g);
    expect(questLocations(g.world).find(q => q.id === `mission:${offer.id}`)?.contactId).toBe(`station:${offer.targetStationId}`);
    expect(questLocations(g.world).some(q => q.source === "SCHOOL")).toBe(false);
    p.navTarget = offer.targetSystemId; g.input.wasPressed = k => k === "k"; tutorialUpdate(g);
    expect(p.tutorial).toBe(-1); expect(p.missions).toContain(offer); expect(p.navTarget).toBe(offer.targetSystemId); expect(questLocations(g.world).some(q => q.source === "SCHOOL")).toBe(false);
  });
  it("can repost a lost job without repeating acceptance rewards", () => {
    const { g, p, home, school } = fixture(); p.tutorial = 2; const offer = schoolOffer(g.world, home.st.id)!;
    offer.accepted = true; p.missions.push(offer); schoolAccepted(g.world, offer); tutorialUpdate(g); const credits = p.credits;
    p.missions = []; tutorialUpdate(g); expect(p.tutorial).toBe(2); expect(school.missionId).toBeUndefined();
    const repost = schoolOffer(g.world, home.st.id)!; repost.accepted = true; p.missions.push(repost); schoolAccepted(g.world, repost); tutorialUpdate(g); expect(p.credits).toBe(credits);
  });
  it("provides optional rescue and exploration instructions without making them required", () => {
    const { g } = fixture(); const text = tutorialDetails(g).join(" "); expect(text).toContain("Optional exploration"); expect(text).toContain("Optional rescue"); expect(text).toContain("Neither branch is required");
  });
});

describe("school save compatibility", () => {
  it("keeps existing voyages opted out and rejects malformed new school state", () => {
    const { g } = fixture(); const old = JSON.parse(JSON.stringify(g.world)); old.version = 16; delete old.player.flightSchool;
    expect(decodeSave(JSON.stringify(old)).world?.player.tutorial).toBe(-1);
    const current = JSON.parse(JSON.stringify(g.world)); current.version = SAVE_VERSION; current.player.flightSchool.paidSteps = "all";
    expect(decodeSave(JSON.stringify(current)).world).toBeNull();
  });
});
