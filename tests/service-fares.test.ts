import { describe, expect, it, vi } from "vitest";
import { acceptServiceOrder, joinService, plotServiceOrder, recordServiceFareDelivery, reportServiceOrder, serviceAudience, serviceAudienceAt, serviceConflictingFares, serviceFareReport, serviceObjective, serviceOffers, syncServiceFares, tickServiceOrder } from "../src/core/service";
import { deliverSinger, singersBerth } from "../src/core/singers";
import { findStation, generateWorld, type Mission } from "../src/world";
import { migrateSave, SAVE_VERSION } from "../src/save";
import { StationScene } from "../src/scenes/station";
import { ServiceScene } from "../src/scenes/service";
import { EncounterScene } from "../src/scenes/encounter";
import { Game } from "../src/game";
import { RNG } from "../src/core/rng";

function fixture() {
  const w = generateWorld(402, { realGalaxy: true, maxLy: 20 }), p = w.player;
  const stations = Object.values(w.systems).flatMap(s => s.stations), home = stations.find(s => s.military && s.factionId !== "vex")!;
  const arrive = (id: string) => { p.systemId = findStation(w, id)!.sys.id; p.dockedAt = id; };
  arrive(home.id); p.achievements = Array(10).fill("deed"); p.rep[home.factionId] = 30; p.crew = []; p.missions = []; p.credits = 1000;
  joinService(w, home.id);
  const offer = serviceOffers(w, home.id)[0];
  const target = stations.find(s => findStation(w, s.id)!.sys.id !== offer.targetSystemId && s.id !== home.id)!;
  const fare: Mission = { id: "fare-402", kind: "passenger", title: "Mara's passage", desc: "A cabin home", passengerName: "Mara Vale", passengerKind: "courier", fromStationId: home.id, targetSystemId: findStation(w, target.id)!.sys.id, targetStationId: target.id, reward: 200, accepted: true, done: false, mood: 60 };
  p.missions = [fare];
  const accept = (choice: "fares-first" | "orders-first" = "fares-first") => { acceptServiceOrder(w, home.id, offer, choice, serviceConflictingFares(w, offer)); return p.service!.order!; };
  const g = Object.assign(Object.create(Game.prototype), { world: w, scenes: { service: new ServiceScene(), encounter: new EncounterScene() }, sceneName: "service", input: { mouseX: 0, mouseY: 0 }, toast: vi.fn(), showHint: vi.fn(), autosave: vi.fn(), spriteCache: new Map() }) as Game;
  return { w, p, home, target, arrive, offer, fare, accept, g };
}
const quiet = { cruise: false, docking: false, alert: 0 };
describe("orders and booked fares", () => {
  it("requires a choice for conflicting destinations without changing funds or mood", () => {
    const { w, p, home, offer, fare } = fixture();
    expect(acceptServiceOrder(w, home.id, offer)).toContain("CHOOSE"); expect(p.service!.order).toBeUndefined(); expect(p.credits).toBe(1000); expect(fare.mood).toBe(60);
  });
  it("accepts the same destination directly but distinguishes two stations in one system", () => {
    const { w, p, home, offer, fare } = fixture(); fare.targetSystemId = offer.targetSystemId;
    fare.targetStationId = "different-clamp"; expect(serviceConflictingFares(w, offer)).toHaveLength(1);
    fare.targetStationId = offer.targetStationId; expect(serviceConflictingFares(w, offer)).toEqual([]);
    acceptServiceOrder(w, home.id, offer); expect(p.service!.order!.civilianPlan).toBeUndefined();
  });
  it("treats a system watch as compatible with a fare to that system", () => {
    const { w, home, fare } = fixture(); const patrol = serviceOffers(w, home.id).find(o => o.kind === "patrol")!;
    fare.targetSystemId = patrol.targetSystemId; expect(serviceConflictingFares(w, patrol)).toEqual([]);
  });
  it("rejects a changed manifest, including a rerouted booking", () => {
    const { w, p, home, offer, fare } = fixture(); const seen = serviceConflictingFares(w, offer);
    fare.targetStationId = "rerouted"; expect(acceptServiceOrder(w, home.id, offer, "orders-first", seen)).toContain("FARES HAVE CHANGED");
    expect(p.service!.order).toBeUndefined(); expect(fare.mood).toBe(60);
  });
  it("amends pay once, leaves credits alone, and waits for the named fares", () => {
    const { w, p, offer, fare, accept } = fixture(); const order = accept();
    expect(order.pay).toBe(offer.pay - 100); expect(p.credits).toBe(1000); expect(fare.mood).toBe(60); expect(order.stage).toBe("fares");
    expect(p.navStationId).toBe(fare.targetStationId); expect(serviceObjective(w)).toContain("1 PRIOR FARES");
    p.systemId = order.targetSystemId; p.dockedAt = order.targetStationId!;
    expect(serviceAudienceAt(w, order.targetStationId!)).toBe(false); expect(serviceAudience(w, order, true)).toContain("NO LONGER");
    order.kind = "patrol"; p.dockedAt = null; tickServiceOrder(w, 999, quiet); expect(order.progress).toBe(0); expect(order.stage).toBe("fares");
  });
  it("records the real station hand-in before its mission is removed, then resumes the orders", () => {
    const { w, p, fare, target, arrive, accept, g } = fixture(); const order = accept(); arrive(target.id);
    const station = new StationScene(); station.station = target; station.completeMissionInner(g, fare);
    expect(p.missions).not.toContain(fare); expect(order.civilianPlan!.fares[0].delivered).toBe(true); expect(order.stage).toBe("outbound");
    expect(plotServiceOrder(w)).toBe(true); expect(p.navStationId).toBe(order.targetStationId);
    expect(serviceFareReport(w, order)).toContain("Mara Vale: delivered");
  });
  it("does not invent a receipt from an unfinished, copied or wrong-station mission", () => {
    const { w, p, fare, accept } = fixture(); const order = accept();
    recordServiceFareDelivery(w, fare); fare.done = true; recordServiceFareDelivery(w, fare); recordServiceFareDelivery(w, { ...fare });
    expect(order.civilianPlan!.fares[0].delivered).toBeUndefined(); p.missions = []; syncServiceFares(w);
    expect(order.stage).toBe("outbound"); expect(serviceFareReport(w, order)).toContain("left without a delivery receipt"); expect(syncServiceFares(w)).toBeNull();
  });
  it("plots a singer's berth and records its actual arrival in the service manifest", () => {
    const { w, p, fare, accept } = fixture(); p.singersHome = fare.targetSystemId; p.flags.singersHomeDone = true;
    fare.passengerKind = "singer"; delete fare.targetStationId; fare.lightReward = 25; const order = accept();
    expect(p.singersCourse).toBe(true); expect(p.navStationId).toBeUndefined();
    expect(deliverSinger(w, fare)).toBeNull(); expect(order.stage).toBe("fares");
    p.systemId = p.singersHome; p.dockedAt = null; Object.assign(p, singersBerth(w)); expect(deliverSinger(w, fare)).toContain("IS HOME");
    expect(order.civilianPlan!.fares[0].delivered).toBe(true); expect(order.stage).toBe("outbound");
    plotServiceOrder(w); expect(p.singersCourse).toBe(false); expect(p.navStationId).toBe(order.targetStationId);
  });
  it("does not extend the original promise to passengers booked later", () => {
    const { w, p, fare, accept } = fixture(); const order = accept(); p.missions = [{ ...fare, id: "new-passenger" }]; syncServiceFares(w);
    expect(order.stage).toBe("outbound"); expect(order.civilianPlan!.fares).toHaveLength(1);
  });
  it("orders first costs five mood once, keeps the booking, and files an honest report", () => {
    const { w, p, fare, home, offer, arrive, accept } = fixture(); const order = accept("orders-first");
    expect(order.pay).toBe(offer.pay); expect(order.stage).toBe("outbound"); expect(fare.mood).toBe(55); expect(fare.done).toBe(false);
    acceptServiceOrder(w, home.id, offer, "orders-first", serviceConflictingFares(w, offer)); expect(fare.mood).toBe(55);
    arrive(order.targetStationId!); serviceAudience(w, order, true); arrive(home.id); reportServiceOrder(w, order);
    expect(p.service!.history[0].report).toContain("Orders first"); expect(p.service!.history[0].report).toContain("Mara Vale: still aboard");
    expect(p.credits).toBe(1000 + order.pay); reportServiceOrder(w, order); expect(p.credits).toBe(1000 + order.pay);
  });
  it("preserves a partial manifest through save and pays the reduced amount on report", () => {
    const { w, p, fare, accept } = fixture(); p.missions.push({ ...fare, id: "second-fare", passengerName: "Tess" }); const old = accept();
    old.civilianPlan!.fares[0].delivered = true; p.missions.shift(); w.version = SAVE_VERSION;
    const loaded = migrateSave(JSON.parse(JSON.stringify(w)))!, order = loaded.player.service!.order!;
    expect(order.stage).toBe("fares"); expect(order.civilianPlan!.fares[0].delivered).toBe(true);
    loaded.player.missions = []; syncServiceFares(loaded); loaded.player.systemId = order.targetSystemId; loaded.player.dockedAt = order.targetStationId!;
    serviceAudience(loaded, order, true); loaded.player.systemId = findStation(loaded, order.fromStationId)!.sys.id; loaded.player.dockedAt = order.fromStationId;
    reportServiceOrder(loaded, order); expect(loaded.player.credits).toBe(1000 + order.pay);
    expect(loaded.player.service!.history[0].report).toContain("100cr amendment deducted"); expect(loaded.player.service!.history[0].report).toContain("Tess: left without a delivery receipt");
  });
  it("opens a three-choice office card, leaves decline free, and rejects stale world callbacks", () => {
    const { w, p, home, offer, g, fare } = fixture(); const office = g.scenes.service as ServiceScene; office.enter(g); office.takeOrder(g, home.id, offer);
    const card = g.scenes.encounter as EncounterScene; expect(g.sceneName).toBe("encounter"); expect(card.enc.text).toContain("MARA VALE"); expect(card.enc.options).toHaveLength(3);
    card.enc.options[2].result(g, new RNG(1)); expect(p.service!.order).toBeUndefined(); expect(fare.mood).toBe(60);
    g.world = migrateSave(JSON.parse(JSON.stringify({ ...w, version: SAVE_VERSION })))!;
    expect(card.enc.options[0].result(g, new RNG(1))).toContain("WATCH HAS CHANGED"); expect(g.world.player.service!.order).toBeUndefined();
    g.world = w; expect(card.enc.options[1].result(g, new RNG(1))).toContain("FIVE MOOD");
    expect(card.enc.options[1].result(g, new RNG(1))).toContain("ALREADY SIGNED"); expect(fare.mood).toBe(55);
  });
});
