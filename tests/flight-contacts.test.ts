import { afterEach, describe, expect, it, vi } from "vitest";
import { Game } from "../src/game";
import { generateWorld } from "../src/world";
import { FlightScene } from "../src/scenes/flight/index";
import { flightContacts, npcIntent, contactLawTerms } from "../src/scenes/flight/contacts";
import { flightRecordSections } from "../src/scenes/flight/display";
import { updateNpcs } from "../src/scenes/flight/ai";
import { grantPiratePassage, tickPiratePassage, breakPiratePassage } from "../src/core/piracy";
import { lawSettlement, settleLaw, closeLawCases } from "../src/core/law";
import type { Npc } from "../src/scenes/flight/types";
import type { Encounter } from "../src/data/encounters";
import * as wire from "../src/core/wire";
import { RNG } from "../src/core/rng";

afterEach(() => vi.restoreAllMocks());
function fixture() {
  vi.spyOn(wire, "getCallsign").mockReturnValue(null);
  const world = generateWorld(420), p = world.player, fs = new FlightScene(), sys = world.systems[p.systemId];
  Object.assign(p, { x: 50000, y: 0, wanted: 0, rep: {}, tutorial: -1, story: 99, story2: -1, story3: -1, crew: [], missions: [], fuel: 20 });
  const g = Object.assign(Object.create(Game.prototype), { world, scenes: { flight: fs }, toast: vi.fn() }) as Game;
  const npc = (kind: Npc["kind"], extra: Partial<Npc> = {}) => { const n: Npc = { kind, x: p.x + 30, y: p.y, hull: 100, hullMax: 100, angle: 0, vx: 0, vy: 0, fireCd: 10, targetIdx: 0, ...extra }; fs.npcs.push(n); return n; };
  return { g, fs, p, sys, npc };
}

describe("contact identity and intent", () => {
  it("keeps primary contact and E on the same actor as rescue, pirate and station priorities change", () => {
    const { g, fs, p, sys, npc } = fixture(), st = sys.stations[0]; st.angle = 0; st.orbit = p.x;
    const aid = npc("trader", { name: "Dry tanks", disabled: true, mayday: true }); const pirate = npc("pirate", { name: "Toll collector" });
    const help = vi.spyOn(fs, "offerHelp").mockImplementation(() => {}), parley = vi.spyOn(fs, "parley").mockImplementation(() => {}), dock = vi.spyOn(fs, "dockAt").mockReturnValue(true);
    expect(flightContacts(fs, g)[0]).toMatchObject({ name: "Dry tanks", primary: true, intent: "Drifting with empty fuel tanks" }); fs.tryInteract(g); expect(help).toHaveBeenCalledWith(g, aid);
    fs.npcs = [pirate]; expect(flightContacts(fs, g)[0].name).toBe("Toll collector"); fs.tryInteract(g); expect(parley).toHaveBeenCalledWith(g, pirate);
    pirate.fleeing = true; expect(flightContacts(fs, g)[0].name).toBe(st.name); fs.tryInteract(g); expect(dock).toHaveBeenCalledWith(g, st);
  });
  it("matches pirate interception, platform avoidance, prey and actual flee behavior", () => {
    const { g, fs, p, npc } = fixture(); const raider = npc("pirate");
    expect(npcIntent(fs, g, raider)).toBe("Attacking your ship"); updateNpcs(fs, g, .01); expect(raider.vx).toBeLessThanOrEqual(0);
    fs.platforms.push({ x: raider.x, y: 10 } as never); expect(npcIntent(fs, g, raider)).toContain("Avoiding"); fs.platforms = [];
    p.x -= 800; const trader = npc("trader", { x: raider.x + 20, name: "Merchant" }); expect(npcIntent(fs, g, raider)).toBe("Hunting Merchant");
    trader.hull = 0; expect(npcIntent(fs, g, raider)).toBe("Cruising the lane");
    raider.hull = 20; expect(npcIntent(fs, g, raider)).toContain("fleeing"); updateNpcs(fs, g, .01); expect(raider.fleeing).toBe(true);
  });
  it("uses real trader tasks and does not invent a fuel request or customs scan", () => {
    const { g, fs, sys, npc } = fixture(); const trader = npc("trader");
    expect(npcIntent(fs, g, trader)).toBe(`Hauling cargo to ${sys.stations[0].name}`);
    trader.transit = { tx: 0, ty: 0 }; expect(npcIntent(fs, g, trader)).toContain("transit waypoint");
    trader.disabled = true; expect(npcIntent(fs, g, trader)).toBe("Disabled and waiting for repairs");
    trader.casualties = true; trader.mayday = true; expect(npcIntent(fs, g, trader)).toContain("casualties");
    trader.convoy = true; expect(npcIntent(fs, g, trader)).toContain("convoy formation");
    const patrol = npc("patrol"); expect(npcIntent(fs, g, patrol)).toBe("Patrolling the lane");
    trader.convoy = false; trader.disabled = false; trader.casualties = false; delete trader.transit; sys.stations = []; expect(npcIntent(fs, g, trader)).toBe("Destination unknown");
  });
  it("updates escort and fighter descriptions when their actual target changes", () => {
    const { g, fs, p, sys, npc } = fixture(); const drone = npc("drone"), fighter = npc("fighter");
    expect(npcIntent(fs, g, drone)).toContain("Holding beside"); expect(npcIntent(fs, g, fighter)).toContain("Circling");
    const pirate = npc("pirate", { name: "Raider" }); expect(npcIntent(fs, g, drone)).toBe("Engaging Raider");
    const st = sys.stations[0]; st.angle = 0; st.orbit = p.x;
    expect(npcIntent(fs, g, fighter)).toBe("Defending port against Raider"); p.wanted = 1; expect(npcIntent(fs, g, fighter)).toBe("Attacking your ship");
    grantPiratePassage(g.world); expect(npcIntent(fs, g, drone)).toContain("Holding beside"); pirate.hull = 0; closeLawCases(g.world); expect(npcIntent(fs, g, fighter)).toContain("Circling");
  });
  it("removes dead, docked, departed and out of range contacts without editing state", () => {
    const { g, fs, npc } = fixture(); const n = npc("trader", { disabled: true }); const before = JSON.stringify(g.world);
    expect(flightContacts(fs, g)).toHaveLength(1); expect(JSON.stringify(g.world)).toBe(before);
    n.x += 1400; expect(flightContacts(fs, g)).toHaveLength(0); n.x -= 1400; n.docked = true; expect(flightContacts(fs, g)).toHaveLength(0);
    n.docked = false; n.hull = 0; expect(flightContacts(fs, g)).toHaveLength(0); fs.npcs = []; expect(flightContacts(fs, g)).toHaveLength(0);
  });
  it("retains long contact identity and full terms while rounding condition values", () => {
    const { g, fs, p, npc } = fixture(); const name = "Long identity ".repeat(80) + "FINAL NAME"; npc("trader", { name, disabled: true }); p.fuel = 8.23456789;
    const sections = JSON.stringify(flightRecordSections(fs, g)); expect(sections).toContain(name); expect(sections).toContain("FUEL 9/"); expect(sections).not.toContain("8.23456789");
  });
});

describe("separate law and corsair terms", () => {
  it("shows actual law cause and settlement requirements, then clears after payment", () => {
    const { g, fs, p, npc } = fixture(); p.wanted = 1; p.credits = 100000; npc("patrol");
    expect(flightContacts(fs, g)[0].details.join(" ")).toContain("active wanted record");
    const quote = lawSettlement(g.world)!; expect(contactLawTerms(fs, g).join(" ")).toContain(`${quote.cost}cr`); expect(contactLawTerms(fs, g).join(" ")).toContain("break contact");
    expect(settleLaw(g.world, quote)).toBeNull(); expect(flightContacts(fs, g)[0].relationship).toBe("Local security"); expect(contactLawTerms(fs, g).join(" ")).toContain("No settlement payment due");
  });
  it("shows free cooldown time independently of corsair passage and expiry", () => {
    const { g, fs, p, npc } = fixture(); p.wanted = 1; p.lawQuiet = 13; npc("pirate"); grantPiratePassage(g.world);
    expect(contactLawTerms(fs, g).join(" ")).toContain("47 flight seconds"); expect(contactLawTerms(fs, g).join(" ")).toContain("180 flight seconds");
    expect(flightContacts(fs, g)[0].relationship).toBe("Passage respected"); g.world.player.piratePassage![p.systemId] = .5; tickPiratePassage(g.world, 1);
    expect(flightContacts(fs, g)[0].relationship).toBe("Hostile corsair"); expect(contactLawTerms(fs, g).join(" ")).toContain("No corsair passage agreement"); expect(p.wanted).toBe(1);
  });
  it("explains a manual truce break in retained world history without clearing the warrant", () => {
    const { g, fs, p, npc } = fixture(); p.wanted = 1; npc("pirate"); grantPiratePassage(g.world); expect(breakPiratePassage(g.world)).toBe(true);
    expect(JSON.stringify(g.world)).toContain("Safe passage ended after our weapons struck a corsair"); expect(flightContacts(fs, g)[0].relationship).toBe("Hostile corsair"); expect(p.wanted).toBe(1);
  });
});

describe("help call validity", () => {
  function callFixture() {
    const f = fixture(), n = f.npc("trader", { disabled: true, mayday: true }); let enc: Encounter;
    f.g.scenes.encounter = { open: (_g: Game, e: Encounter) => { enc = e; } } as never;
    f.fs.offerHelp(f.g, n);
    return { ...f, n, answer: () => enc.options[0].result(f.g, new RNG(1)) };
  }
  it.each(["departed", "range", "repaired", "new rescue"])("rejects an obsolete aid action after %s", reason => {
    const f = callFixture(), fuel = f.p.fuel, credits = f.p.credits;
    if (reason === "departed") f.fs.npcs = []; else if (reason === "range") f.n.x += 100; else if (reason === "repaired") f.n.disabled = false; else f.fs.repairJob = { npc: f.n } as never;
    expect(f.answer()).toContain("CLOSED"); expect(f.p.fuel).toBe(fuel); expect(f.p.credits).toBe(credits);
  });
  it("rechecks resources and prevents repeated payment from an answered mayday", () => {
    const f = callFixture(); f.p.fuel = 10; expect(f.answer()).toContain("NO LONGER AVAILABLE"); f.p.fuel = 20;
    f.answer(); expect(f.p.fuel).toBe(10); const credits = f.p.credits; expect(f.answer()).toContain("CLOSED"); expect(f.p.credits).toBe(credits);
  });
});
