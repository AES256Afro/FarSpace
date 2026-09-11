import { afterEach, describe, expect, it, vi } from "vitest";
import { Game } from "../src/game";
import { generateWorld } from "../src/world";
import { decodeSave, SAVE_VERSION } from "../src/save";
import { hull } from "../src/data/hulls";
import { attachRecoveryTow, canDisable, deliverRecovery, detachRecoveryTow, disableCombatShip, hullSalePrice, recoveryTow, updateRecoveryTow } from "../src/core/shiprecovery";
import { cutSalvage, prepareSalvage, wreckAvailable } from "../src/core/salvage";
import { FlightScene } from "../src/scenes/flight/index";
import { npcKilled, resolveNpcHit, updateBullets } from "../src/scenes/flight/ai";
import { updateTorpedoes } from "../src/scenes/flight/combat";
import { SalvageScene } from "../src/scenes/salvage";
import { StationScene } from "../src/scenes/station";
import type { Npc } from "../src/scenes/flight/types";
import { systemContacts } from "../src/scenes/systemmap";
import * as dialog from "../src/core/dialog";
import * as wire from "../src/core/wire";

afterEach(() => vi.restoreAllMocks());
function fixture() {
  vi.spyOn(wire, "fetchBases").mockResolvedValue([]); vi.spyOn(wire, "getCallsign").mockReturnValue(null);
  const w = generateWorld(420), p = w.player, sys = w.systems[p.systemId], st = sys.stations[0];
  p.dockedAt = null; p.crew = []; p.cargo = {}; p.fuel = 50; p.fleet = [];
  p.x = 3000; p.y = 3000;
  const n: Npc = { kind: "pirate", name: "Cold Kestrel", x: 3010, y: 3000, vx: 12, vy: 15, angle: 0.8, hull: -2, hullMax: 60, fireCd: 0, targetIdx: 0 };
  const flight = new FlightScene(), salvage = new SalvageScene(), station = new StationScene(), keys = new Set<string>();
  const g = Object.assign(Object.create(Game.prototype), { world: w, sceneName: "", justUndocked: false, spriteCache: new Map(),
    scenes: { flight, salvage, station }, input: { wasPressed: (k: string) => keys.has(k), isDown: () => false, mouseX: 0, mouseY: 0, mousePressed: false, wheel: 0 },
    toast: vi.fn(), showHint: vi.fn(), autosave: vi.fn(),
  }) as Game;
  const disable = () => { const wreck = disableCombatShip(w, n, "gun", 0)!; expect(wreck).toBeTruthy(); prepareSalvage(wreck, w.seed); return wreck; };
  const ready = () => { const wreck = disable(); wreck.boarding!.rescued = true; wreck.boarding!.power = 100; wreck.boarding!.breaches = []; return wreck; };
  return { w, p, sys, st, n, g, flight, salvage, station, keys, disable, ready };
}

describe("combat disablement", () => {
  it.each(["gun", "torpedo"] as const)("only converts finishing %s hits below that weapon's chance", weapon => {
    const f = fixture(); f.n.hull = 1;
    expect(disableCombatShip(f.w, f.n, weapon, 0)).toBeNull(); f.n.hull = -1;
    expect(disableCombatShip(f.w, f.n, weapon, weapon === "gun" ? 0.35 : 0.1)).toBeNull();
    expect(disableCombatShip(f.w, f.n, weapon, 0.09)).not.toBeNull();
  });
  it.each([{ kind: "drone" }, { disabled: true }, { ghost: "other pilot" }, { companion: true }, { convoy: true }, { naval: true }, { tag: "story-convoy" }, { name: "THE HERALD" }])("keeps protected contacts in their existing combat flow: %j", change => {
    const f = fixture(); Object.assign(f.n, change); expect(canDisable(f.n)).toBe(false); expect(disableCombatShip(f.w, f.n, "gun", 0)).toBeNull();
  });
  it("transfers the ship and cargo exactly once without kills, bounty progress or loose loot", () => {
    const f = fixture(); f.n.cargo = { id: "metals", qty: 7 }; f.flight.npcs = [f.n];
    f.p.missions = [{ kind: "bounty", accepted: true, done: false, targetSystemId: f.p.systemId, kills: 0 } as any];
    const kills = f.p.kills; vi.spyOn(Math, "random").mockReturnValue(0);
    expect(resolveNpcHit(f.flight, f.g, f.n, true, "gun")).toBe("disabled");
    expect(resolveNpcHit(f.flight, f.g, f.n, true, "gun")).toBe("disabled"); npcKilled(f.flight, f.g, f.n, true);
    const wrecks = f.sys.wrecks.filter(w => w.id === f.n.disabledWreckId); expect(wrecks).toHaveLength(1);
    expect(wrecks[0].loot).toEqual([{ id: "metals", qty: 7 }]); expect(wrecks[0].boarding!.survivor).toBe(true);
    expect(f.p.kills).toBe(kills); expect(f.p.missions[0].kills).toBe(0); expect(f.flight.loot).toEqual([]);
  });
  it("applies disablement through player bullets but keeps NPC damage and failed rolls lethal", () => {
    const f = fixture(); f.n.hull = 2; f.flight.npcs = [f.n]; vi.spyOn(Math, "random").mockReturnValue(0);
    f.flight.bullets = [{ x: f.n.x, y: f.n.y, vx: 0, vy: 0, life: 1, hostile: false, fromPlayer: true, dmg: 5 }];
    updateBullets(f.flight, f.g, 0.01); expect(f.n.disabledWreckId).toBeDefined();
    const other = { ...f.n, disabled: false, disabledWreckId: undefined, hull: -2 };
    const before = f.p.kills; expect(resolveNpcHit(f.flight, f.g, other, false, "gun")).toBe("destroyed");
    expect(f.p.kills).toBe(before); vi.mocked(Math.random).mockReturnValue(0.99);
    expect(resolveNpcHit(f.flight, f.g, { ...other }, true, "gun")).toBe("destroyed"); expect(f.p.kills).toBe(before + 1);
  });
  it("applies torpedo disablement without the torpedo kill achievement", () => {
    const f = fixture(); f.n.hull = 5; f.flight.npcs = [f.n]; vi.spyOn(Math, "random").mockReturnValue(0);
    f.flight.torps = [{ x: f.n.x, y: f.n.y, vx: 0, vy: 0, life: 2, target: f.n }];
    updateTorpedoes(f.flight, f.g, 0.01); expect(f.n.disabledWreckId).toBeDefined(); expect(f.p.flags?.torpedoKill).not.toBe(true);
  });
  it("keeps consequences for attacking civilian ships", () => {
    const f = fixture(); f.n.kind = "trader"; const rep = f.p.rep[f.sys.factionId] ?? 0, wanted = f.p.wanted;
    const wreck = f.disable(); expect(wreck.recovery!.hullId).toBe("freighter");
    expect(f.p.wanted).toBeGreaterThan(wanted); expect(f.p.rep[f.sys.factionId]).toBeLessThan(rep);
  });
});

describe("whole hull recovery", () => {
  it("upgrades existing voyages without changing their cargo, fleet or wrecks", () => {
    const f = fixture(); f.w.version = 14; f.p.cargo = { metals: 7 };
    f.p.fleet = [{ hullId: "interceptor", stationId: f.st.id, name: "Old Kestrel", hull: 65, torpedoes: 0 }];
    const before = JSON.parse(JSON.stringify(f.w));
    const loaded = decodeSave(JSON.stringify(f.w)); expect(loaded.error).toBeNull();
    expect(loaded.world!.version).toBe(SAVE_VERSION);
    expect(loaded.world!.player.cargo).toEqual(before.player.cargo);
    expect(loaded.world!.player.fleet).toEqual(before.player.fleet);
    expect(loaded.world!.systems).toEqual(before.systems);
    expect(loaded.world!.player.recoveryTow).toBeUndefined();
  });
  it("requires rescue, power, sealed breaches and a single tow", () => {
    const f = fixture(), wreck = f.disable();
    expect(attachRecoveryTow(f.w, wreck)).toContain("SURVIVOR"); wreck.boarding!.rescued = true;
    expect(attachRecoveryTow(f.w, wreck)).toContain("POWER"); wreck.boarding!.power = 100; wreck.boarding!.breaches = [{ tx: 3, ty: 3 }];
    expect(attachRecoveryTow(f.w, wreck)).toContain("BREACHES"); wreck.boarding!.breaches = [];
    expect(attachRecoveryTow(f.w, wreck, true)).toContain("ONE TOW");
    expect(attachRecoveryTow(f.w, wreck)).toBeNull(); expect(recoveryTow(f.w)).toBe(wreck);
  });
  it("persists the hull, tow, and positions through saving and a real flight reload", () => {
    const f = fixture(), wreck = f.ready(); attachRecoveryTow(f.w, wreck); f.p.x += 100; updateRecoveryTow(f.w, 0.25);
    f.w.version = SAVE_VERSION;
    const loaded = decodeSave(JSON.stringify(f.w)); expect(loaded.error).toBeNull(); f.g.world = loaded.world!;
    f.g.setScene("flight"); const tow = recoveryTow(f.g.world)!;
    expect(tow.x).toBe(wreck.x); expect(tow.recovery).toEqual(wreck.recovery); expect(f.g.world.player.recoveryTow).toEqual(f.p.recoveryTow);
  });
  it("detaches a snapped line while leaving the hull available for another attempt", () => {
    const f = fixture(), wreck = f.ready(); attachRecoveryTow(f.w, wreck); f.p.x += 500;
    expect(updateRecoveryTow(f.w, 0.1)).toContain("SNAPPED"); expect(recoveryTow(f.w)).toBeNull(); expect(wreck.recovery!.status).toBe("adrift");
    expect(wreckAvailable(wreck)).toBe(true); f.p.x = wreck.x; expect(attachRecoveryTow(f.w, wreck)).toBeNull();
    detachRecoveryTow(f.w); expect(wreck.recovery!.status).toBe("adrift");
  });
  it("rejects remote pickups and systems without a delivery port", () => {
    const f = fixture(), wreck = f.ready(); f.p.x += 200; expect(attachRecoveryTow(f.w, wreck)).toContain("80M");
    f.p.x = wreck.x; f.sys.stations = []; expect(attachRecoveryTow(f.w, wreck)).toContain("NO SHIPYARD");
  });
  it("blocks jumping with an attached hull before spending fuel", () => {
    const f = fixture(), wreck = f.ready(); attachRecoveryTow(f.w, wreck); const fuel = f.p.fuel;
    f.flight.doJump(f.g, f.sys.links[0], false); expect(f.p.fuel).toBe(fuel); expect(f.p.systemId).toBe(f.sys.id); expect(recoveryTow(f.w)).toBe(wreck);
  });
  it("keeps both manual and automatic cruise off during a long tow", () => {
    const f = fixture(), wreck = f.ready(); attachRecoveryTow(f.w, wreck); f.p.angle = 0; f.p.vx = f.p.vy = 0;
    vi.spyOn(f.flight, "apTarget").mockReturnValue({ x: f.p.x + 2000, y: f.p.y, label: "PORT" });
    vi.spyOn(f.flight, "massLocked").mockReturnValue(false); f.flight.autopilot = true;
    f.flight.updateAutopilot(f.g, 0.05); expect(f.flight.cruise).toBe(false); expect(f.flight.apThrust).toBe(true);
    f.flight.toggleCruise(f.g); expect(f.flight.cruise).toBe(false); expect(recoveryTow(f.w)).toBe(wreck);
  });
  it("requires confirmation to start dismantling, and then prevents hull recovery", () => {
    const f = fixture(), wreck = f.ready(); f.g.wreckTarget = wreck; f.salvage.enter(f.g); f.salvage.cursor = 2;
    f.salvage.choose(f.g); expect(f.salvage.active).toBeNull(); expect(f.salvage.message).toContain("CONFIRM");
    f.salvage.choose(f.g); expect(f.salvage.active).toBe(f.salvage.parts[0]); f.salvage.update(f.g, 0.1);
    expect(wreck.recovery!.status).toBe("dismantled"); expect(attachRecoveryTow(f.w, wreck)).toContain("ONLY BE SALVAGED");
  });
  it("does not lose recovery eligibility when storage prevents cutting or while towing", () => {
    const f = fixture(), wreck = f.ready(), part = wreck.salvage!.parts[0]; f.p.cargoMax = 0;
    cutSalvage(wreck, f.w.seed, part, f.p, 0.1); expect(wreck.recovery!.status).toBe("adrift");
    attachRecoveryTow(f.w, wreck); f.p.cargoMax = 50;
    expect(cutSalvage(wreck, f.w.seed, part, f.p, 0.1).reason).toContain("DETACH"); expect(f.p.fuel).toBe(50);
  });
  it("delivers one damaged hull into the local fleet and removes the space salvage", () => {
    const f = fixture(), wreck = f.ready(); attachRecoveryTow(f.w, wreck);
    f.p.dockedAt = f.st.id; expect(deliverRecovery(f.w, f.st.id)).toBeNull();
    wreck.x = Math.cos(f.st.angle) * f.st.orbit; wreck.y = Math.sin(f.st.angle) * f.st.orbit;
    const ship = deliverRecovery(f.w, f.st.id)!; expect(ship.hull).toBe(Math.round(hull(ship.hullId).hullMax * 0.2));
    expect(f.p.fleet).toEqual([ship]); expect(deliverRecovery(f.w, f.st.id)).toBeNull(); expect(wreckAvailable(wreck)).toBe(false);
    f.p.x = wreck.x; f.p.y = wreck.y; expect(systemContacts(f.g).some(c => c.id === `wreck:${wreck.id}`)).toBe(false);
    expect(cutSalvage(wreck, f.w.seed, wreck.salvage!.parts[0], f.p, 1).reason).toContain("ALREADY BEEN RECOVERED");
  });
  it("sells the recovered hull once for its displayed condition price, with cancellation supported", () => {
    const f = fixture(), wreck = f.ready(); attachRecoveryTow(f.w, wreck); f.p.dockedAt = f.st.id;
    wreck.x = Math.cos(f.st.angle) * f.st.orbit; wreck.y = Math.sin(f.st.angle) * f.st.orbit;
    const ship = deliverRecovery(f.w, f.st.id)!; f.station.station = f.st; const credits = f.p.credits, price = hullSalePrice(ship);
    const confirm = vi.spyOn(dialog, "confirmBox").mockReturnValue(false); f.station.scrapHull(f.g, ship); expect(f.p.credits).toBe(credits);
    confirm.mockReturnValue(true); f.station.scrapHull(f.g, ship); f.station.scrapHull(f.g, ship);
    expect(f.p.fleet).toEqual([]); expect(f.p.credits).toBe(credits + price); expect(f.g.autosave).toHaveBeenCalled();
    expect(hullSalePrice({ ...ship, hull: hull(ship.hullId).hullMax })).toBeGreaterThan(price);
  });
  it("can keep the recovered ship without repairing it for free", () => {
    const f = fixture(), wreck = f.ready(); attachRecoveryTow(f.w, wreck); f.p.dockedAt = f.st.id;
    wreck.x = Math.cos(f.st.angle) * f.st.orbit; wreck.y = Math.sin(f.st.angle) * f.st.orbit;
    const ship = deliverRecovery(f.w, f.st.id)!, oldHull = f.p.hullId; f.station.station = f.st;
    f.station.swapShip(f.g, ship); expect(f.p.hullId).toBe(ship.hullId); expect(f.p.hull).toBe(ship.hull);
    expect(f.p.fleet).toHaveLength(1); expect(f.p.fleet![0].hullId).toBe(oldHull); expect(wreck.recovery!.status).toBe("delivered");
  });
});
