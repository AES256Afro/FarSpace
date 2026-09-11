import { afterEach, describe, expect, it, vi } from "vitest";
import { acceptServiceOrder, joinService, plotServiceOrder, reportServiceOrder, serviceAudience, serviceAudienceAt, serviceJoinReason, serviceObjective, serviceOffers, serviceOffice, serviceRank, serviceWorkReason, tickServiceOrder, transferService, withdrawServiceOrder } from "../src/core/service";
import type { ServiceKind } from "../src/core/service";
import { commandRank, findStation, generateWorld, tickMail } from "../src/world";
import { migrateSave, SAVE_VERSION } from "../src/save";
import { Game } from "../src/game";
import { ServiceScene } from "../src/scenes/service";
import { StationScene } from "../src/scenes/station";
import { StationWalkScene } from "../src/scenes/stationwalk";
import { EncounterScene } from "../src/scenes/encounter";
import { GalaxyScene } from "../src/scenes/galaxy";
import { FlightScene } from "../src/scenes/flight/index";
import { RNG } from "../src/core/rng";

function fixture() {
  const w = generateWorld(400, { realGalaxy: true, maxLy: 20 }), p = w.player;
  p.tutorial = -1; p.crew = []; p.credits = 1000; p.achievements = Array.from({ length: 10 }, (_, i) => `deed-${i}`);
  const stations = Object.values(w.systems).flatMap(s => s.stations);
  const home = stations.find(st => st.military && st.factionId !== "vex")!;
  p.rep[home.factionId] = 20;
  const arrive = (id: string) => { const f = findStation(w, id)!; p.systemId = f.sys.id; p.dockedAt = id; };
  arrive(home.id); w.mailQueue = []; p.mail = [];
  const accept = (kind: ServiceKind = "liaison") => {
    if (!p.service) joinService(w, home.id);
    const offer = serviceOffers(w, p.dockedAt!).find(o => o.kind === kind)!; expect(offer).toBeDefined();
    acceptServiceOrder(w, p.dockedAt!, offer); return p.service!.order!;
  };
  const finishLiaison = () => { const order = accept(); arrive(order.targetStationId!); serviceAudience(w, order, true); arrive(home.id); return reportServiceOrder(w, order); };
  return { w, p, home, stations, arrive, accept, finishLiaison };
}
function game(f: ReturnType<typeof fixture>) {
  const keys = new Set<string>();
  const g = Object.assign(Object.create(Game.prototype), { world: f.w, sceneName: "service", spriteCache: new Map(),
    scenes: { service: new ServiceScene(), stationwalk: new StationWalkScene(), station: new StationScene(), encounter: new EncounterScene(), galaxy: new GalaxyScene(), flight: new FlightScene() },
    input: { wasPressed: (key: string) => keys.has(key), isDown: () => false, mousePressed: false, mouseX: 0, mouseY: 0, wheel: 0 },
    toast: vi.fn(), autosave: vi.fn(), showHint: vi.fn(), save: vi.fn(), load: vi.fn(),
  }) as Game;
  return { g, keys };
}
afterEach(() => vi.restoreAllMocks());
const quiet = { cruise: false, docking: false, alert: 0 };
describe("the naval service record", () => {
  it("requires an actual friendly naval office, ten deeds and ten standing, and preserves lane rank", () => {
    const { w, p, home, stations, arrive } = fixture(); const lane = commandRank(p);
    p.dockedAt = null; expect(serviceJoinReason(w, home.id)).toContain("NAVAL STATION");
    arrive(home.id); p.achievements = []; expect(joinService(w, home.id)).toContain("TEN DEEDS");
    p.achievements = Array(10).fill("deed"); p.rep[home.factionId] = 9; expect(joinService(w, home.id)).toContain("TEN STANDING");
    p.rep[home.factionId] = 10; expect(joinService(w, home.id)).toContain("AUXILIARY");
    expect(commandRank(p)).toBe(lane); const first = p.service; joinService(w, home.id); expect(p.service).toBe(first);
    const civil = stations.find(st => !st.military)!; arrive(civil.id); expect(serviceOffice(w)).toBeNull();
    home.factionId = "vex"; arrive(home.id); expect(serviceOffice(w)).toBeNull();
  });
  it("offers reachable work and uses current terms instead of a changed caller quote", () => {
    const { w, p, home, accept } = fixture(); joinService(w, home.id);
    const offers = serviceOffers(w, home.id); expect(offers.map(o => o.kind)).toEqual(["liaison", "patrol"]);
    const offer = offers[0]; acceptServiceOrder(w, home.id, { ...offer, pay: 999999, progress: 100, stage: "return" });
    expect(p.service!.order!.pay).toBe(offer.pay); expect(p.service!.order!.stage).toBe("outbound");
    expect(p.service!.order!.progress).toBe(0); expect(serviceWorkReason(w, home.id)).toContain("CURRENT ORDERS");
    withdrawServiceOrder(w, p.service!.order!); expect(acceptServiceOrder(w, home.id, offer)).toContain("CHANGED");
    const second = accept(); expect(second.serial).toBe(2);
  });
  it("keeps sealed routes out of offers and refuses to plot a newly closed route", () => {
    const { w, p, home } = fixture(); joinService(w, home.id); const offer = serviceOffers(w, home.id).find(o => o.kind === "patrol")!;
    const sys = w.systems[offer.targetSystemId]; sys.permit = true; p.rep[sys.factionId] = 20;
    expect(serviceOffers(w, home.id).some(o => o.targetSystemId === sys.id)).toBe(false);
    sys.permit = false; acceptServiceOrder(w, home.id, serviceOffers(w, home.id).find(o => o.kind === "patrol")!);
    w.systems[p.service!.order!.targetSystemId].permit = true;
    p.navTarget = null; expect(plotServiceOrder(w)).toBe(false); expect(p.navTarget).toBeNull();
  });
  it.each([false, true])("requires the named civil office and retains its actual reply, listening=%s", listen => {
    const { w, p, home, arrive, accept } = fixture(); const order = accept();
    expect(serviceAudience(w, order, listen)).toContain("NO LONGER"); arrive(order.targetStationId!);
    expect(serviceAudienceAt(w, order.targetStationId!)).toBe(true);
    expect(serviceAudience(w, { ...order }, listen)).toContain("NO LONGER");
    const response = serviceAudience(w, order, listen); expect(response).toContain(listen ? "DOCK HANDS" : "APPROACH LANES");
    expect(order.stage).toBe("return"); expect(serviceAudience(w, order, listen)).toContain("NO LONGER");
    expect(reportServiceOrder(w, order)).toContain("ISSUED");
    expect(plotServiceOrder(w)).toBe(true); expect(p.navStationId).toBe(home.id);
    arrive(home.id); const credits = p.credits, rep = p.rep[home.factionId];
    reportServiceOrder(w, order); expect(p.credits).toBe(credits + order.pay); expect(p.rep[home.factionId]).toBe(rep + 2);
    expect(p.service!.history[0].report).toBe(order.report); expect(p.service!.completed).toBe(1); expect(p.navTarget).toBeNull();
    reportServiceOrder(w, order); expect(p.credits).toBe(credits + order.pay); expect(p.service!.completed).toBe(1);
  });
  it("ticks a patrol only in real flight under the stated conditions and returns once", () => {
    const { w, p, accept } = fixture(); const order = accept("patrol"); p.vx = p.vy = 0;
    tickServiceOrder(w, 1, quiet); expect(order.progress).toBe(0);
    p.systemId = order.targetSystemId; tickServiceOrder(w, 1, quiet); expect(order.progress).toBe(0);
    p.dockedAt = null;
    for (const f of [{ ...quiet, cruise: true }, { ...quiet, docking: true }]) tickServiceOrder(w, 1, f);
    p.vx = 60; tickServiceOrder(w, 1, quiet); expect(order.progress).toBe(0); p.vx = 0;
    for (const dt of [NaN, Infinity, -1, 0]) tickServiceOrder(w, dt, quiet); expect(order.progress).toBe(0);
    tickServiceOrder(w, 999, quiet); expect(order.progress).toBe(1);
    for (let i = 1; i < 89; i++) expect(tickServiceOrder(w, 1, quiet)).toBeNull();
    expect(tickServiceOrder(w, 1, quiet)).toContain("WATCH COMPLETE"); expect(order.progress).toBe(90); expect(order.stage).toBe("return");
    expect(tickServiceOrder(w, 1, quiet)).toBeNull(); expect(serviceObjective(w)).toContain("FILE REPORT");
  });
  it("requires quiet close observation and retains earlier progress when conditions change", () => {
    const { w, p, accept } = fixture(); joinService(w, p.dockedAt!); p.service!.completed = 2;
    const order = accept("survey"), pl = w.systems[order.targetSystemId].planets[order.planetIndex!];
    p.systemId = order.targetSystemId; p.dockedAt = null; p.vx = p.vy = 0; p.x = Math.cos(pl.angle) * pl.orbit; p.y = Math.sin(pl.angle) * pl.orbit;
    tickServiceOrder(w, 1, quiet); expect(order.progress).toBe(1);
    tickServiceOrder(w, 1, { ...quiet, alert: 2 }); expect(order.progress).toBe(1);
    p.x += pl.radius + 321; tickServiceOrder(w, 1, quiet); expect(order.progress).toBe(1); p.x -= pl.radius + 321;
    for (let i = 1; i < 60; i++) tickServiceOrder(w, 1, quiet);
    expect(order.stage).toBe("return"); expect(order.report).toContain("quiet close observation");
  });
  it("promotes through the independent ladder, adjusts later pay and sends promotion mail once", () => {
    const f = fixture(), { w, p, home, finishLiaison } = f; finishLiaison(); const before = serviceOffers(w, home.id)[0].pay;
    expect(finishLiaison()).toContain("WATCH OFFICER"); expect(serviceRank(p).title).toBe("WATCH OFFICER");
    expect(serviceOffers(w, home.id).some(o => o.kind === "survey")).toBe(true);
    for (let i = 2; i < 9; i++) finishLiaison(); expect(serviceRank(p).title).toBe("SENIOR CAPTAIN");
    expect(commandRank(p)).toBe("LIEUTENANT"); expect(w.mailQueue).toHaveLength(3);
    expect(serviceOffers(w, home.id)[0].pay).toBeGreaterThan(before);
    w.time += 300; tickMail(w); tickMail(w); expect(p.mail).toHaveLength(3);
    for (let i = 9; i < 15; i++) finishLiaison(); expect(p.service!.history).toHaveLength(12); expect(p.service!.completed).toBe(15);
  });
  it("permits reporting and withdrawal after standing falls but suspends new orders", () => {
    const { w, p, home, arrive, accept } = fixture(); const order = accept(); p.rep[home.factionId] = -10;
    arrive(order.targetStationId!); serviceAudience(w, order, false); arrive(home.id);
    expect(reportServiceOrder(w, order)).toContain("+2 FACTION"); expect(serviceOffers(w, home.id)).toEqual([]);
    expect(serviceWorkReason(w, home.id)).toContain("BELOW ZERO");
    p.rep[home.factionId] = 10; const next = accept(); p.rep[home.factionId] = -10;
    expect(withdrawServiceOrder(w, next)).toContain("NO PAY"); expect(p.service!.completed).toBe(1);
  });
  it("transfers to another office of the same service without resetting its record", () => {
    const { w, p, home, stations, arrive, finishLiaison, accept } = fixture(); finishLiaison();
    const other = stations.find(st => st.id !== home.id && st.factionId === home.factionId)!; other.military = true;
    const order = accept(); arrive(other.id); expect(transferService(w, other.id)).toContain("CURRENT ORDERS");
    expect(withdrawServiceOrder(w, order)).toContain("NO PAY"); expect(serviceWorkReason(w, other.id)).toContain("TRANSFER");
    expect(transferService(w, other.id)).toContain("POSTING:"); expect(p.service!.completed).toBe(1); expect(p.service!.stationId).toBe(other.id);
    other.factionId = "vex"; expect(transferService(w, other.id)).toContain("OWN SERVICE");
  });
  it("saves an unfinished watch and an unfiled report without duplicate rewards", () => {
    const { w, p, home, accept } = fixture(); const old = accept("patrol"); old.progress = 47; w.version = SAVE_VERSION;
    const loaded = migrateSave(JSON.parse(JSON.stringify(w)))!; const order = loaded.player.service!.order!;
    expect(order.progress).toBe(47); loaded.time += 99999999;
    expect(loaded.player.service!.order).toBe(order); expect(reportServiceOrder(loaded, old)).toContain("ISSUED");
    loaded.player.systemId = order.targetSystemId; loaded.player.dockedAt = null; loaded.player.vx = loaded.player.vy = 0;
    for (let i = 0; i < 43; i++) tickServiceOrder(loaded, 1, quiet);
    const ready = migrateSave(JSON.parse(JSON.stringify(loaded)))!; const report = ready.player.service!.order!;
    ready.player.systemId = findStation(ready, home.id)!.sys.id; ready.player.dockedAt = home.id;
    const credits = ready.player.credits; reportServiceOrder(ready, report); reportServiceOrder(ready, report);
    expect(ready.player.credits).toBe(credits + report.pay); expect(ready.player.service!.completed).toBe(1); expect(p.credits).toBe(1000);
  });
  it("maps the military deck office and opens it with E, preserving the return position", () => {
    const f = fixture(), { g, keys } = game(f), walk = g.scenes.stationwalk as StationWalkScene;
    walk.enter(g); walk.px = 145; walk.py = 35; expect(walk.tileAt(14, 2)).toBe("V");
    keys.add("e"); walk.update(g, 0); keys.clear(); expect(g.sceneName).toBe("service");
    keys.add("Enter"); g.scene.update(g, 0); keys.clear(); expect(f.p.service).toBeDefined();
    keys.add("Escape"); g.scene.update(g, 0); keys.clear(); expect(g.sceneName).toBe("stationwalk"); expect(walk.px).toBe(145); expect(walk.py).toBe(35);
  });
  it("uses the harbourmaster encounter and guards its captured order on replay", () => {
    const f = fixture(), order = f.accept(), { g } = game(f); f.arrive(order.targetStationId!);
    const walk = g.scenes.stationwalk as StationWalkScene; walk.enter(g); walk.serviceAudience(g);
    const encounter = g.scenes.encounter as EncounterScene;
    expect(g.sceneName).toBe("encounter"); const opt = encounter.enc!.options[1];
    expect(opt.result(g, new RNG(1))).toContain("DOCK HANDS"); expect(opt.result(g, new RNG(1))).toContain("NO LONGER");
  });
  it("plots the current exact destination with G/U and the Missions U action", () => {
    const f = fixture(), order = f.accept(), { g, keys } = game(f); const map = g.scenes.galaxy as GalaxyScene;
    f.p.navTarget = null; keys.add("u"); map.update(g, 0); keys.clear(); expect(f.p.navStationId).toBe(order.targetStationId);
    const st = g.scenes.station as StationScene; st.station = f.home; st.tab = 3;
    f.p.navTarget = null; keys.add("u"); st.update(g, 0); keys.clear(); expect(f.p.navTarget).toBe(order.targetSystemId);
  });
  it("stops scene input after loading instead of filing a second action", () => {
    const f = fixture(), { g, keys } = game(f), office = g.scenes.service as ServiceScene; office.enter(g);
    keys.add("F9"); keys.add("Enter"); office.update(g, 0); expect(g.load).toHaveBeenCalledOnce(); expect(f.p.service).toBeUndefined();
  });
});
