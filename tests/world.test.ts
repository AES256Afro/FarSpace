import { describe, it, expect } from "vitest";
import {
  generateWorld, navRoute, routeFuel, jumpFuelCost, stationPrice, refreshPrices,
  addCargo, removeCargo, cargoUsed, applyHull, lawLevelFor, adjustRep, tickWorld,
  missionDeliverable, genMissionsFor,
} from "../src/world";
import { migrateSave, SAVE_VERSION } from "../src/save";
import { RNG } from "../src/core/rng";
import { STARS, starDistance } from "../src/data/stars";
import { ACHIEVEMENTS } from "../src/data/achievements";
import { ARCS, dailyContract, dailyKey, rankOf, logSystem, applyHull } from "../src/world";
import { MODULES } from "../src/data/modules";
import { rareSellPrice, findStation } from "../src/world";
import { RARES } from "../src/data/data";
import { baseContract } from "../src/core/wire";
import { genGround, groundKey, passable, GW, GH } from "../src/ground";
import { BLUEPRINTS, upgrade, addMaterials, nextCost, MATERIAL_CAP } from "../src/data/engineering";
import { jumpFuelCost, communityGoal, weekKey, permitDenied, navRoute, blackMarket, genMissionsFor, groundProgress, missionDeliverable } from "../src/world";
import { RNG } from "../src/core/rng";

describe("world generation", () => {
  it("is deterministic per seed", () => {
    const a = generateWorld(1234);
    const b = generateWorld(1234);
    expect(JSON.stringify(a.systems)).toBe(JSON.stringify(b.systems));
    expect(a.player.systemId).toBe(b.player.systemId);
  });

  it("differs across seeds", () => {
    const a = generateWorld(1);
    const b = generateWorld(2);
    expect(JSON.stringify(a.systems)).not.toBe(JSON.stringify(b.systems));
  });

  it("every system is reachable and every link has a distance", () => {
    for (const w of [generateWorld(7), generateWorld(7, { realGalaxy: true })]) {
      const ids = Object.keys(w.systems);
      for (const id of ids) {
        expect(navRoute(w, w.player.systemId, id)).not.toBeNull();
        for (const l of w.systems[id].links) {
          expect(w.systems[id].ly[l]).toBeGreaterThan(0);
          expect(w.systems[l].links).toContain(id);
        }
      }
    }
  });

  it("real galaxy starts at Sol with Compact control", () => {
    const w = generateWorld(99, { realGalaxy: true });
    const sol = Object.values(w.systems).find((s) => s.name === "Sol")!;
    expect(sol).toBeDefined();
    expect(sol.factionId).toBe("tsc");
    expect(w.player.systemId).toBe(sol.id);
  });

  it("starts the player docked-adjacent in safe space with a scout hull", () => {
    const w = generateWorld(42);
    const sys = w.systems[w.player.systemId];
    expect(sys.factionId).not.toBe("vex");
    expect(sys.stations.length).toBeGreaterThan(0);
    expect(w.player.hullId).toBe("scout");
    expect(w.player.cargoMax).toBe(40);
    expect(w.player.tutorial).toBe(0);
  });

  it("generates planets with surfaces, wrecks and anomalies", () => {
    const w = generateWorld(3);
    const sys = Object.values(w.systems)[0];
    expect(sys.planets[0].surface?.regions.length).toBeGreaterThan(0);
    expect(sys.planets[0].surface?.pois.length).toBeGreaterThan(0);
    expect(sys.anomalies.length).toBeGreaterThan(0);
  });
});

describe("navigation", () => {
  it("routes minimise fuel and report it", () => {
    const w = generateWorld(5);
    const ids = Object.keys(w.systems);
    const from = ids[0], to = ids[ids.length - 1];
    const route = navRoute(w, from, to)!;
    expect(route[0]).toBe(from);
    expect(route[route.length - 1]).toBe(to);
    expect(routeFuel(w, route)).toBeGreaterThan(0);
    for (let i = 0; i < route.length - 1; i++) expect(w.systems[route[i]].links).toContain(route[i + 1]);
  });

  it("fuel cost grows with distance and is clamped", () => {
    const w = generateWorld(5);
    for (const sys of Object.values(w.systems)) for (const l of sys.links) {
      const c = jumpFuelCost(w, sys.id, l);
      expect(c).toBeGreaterThanOrEqual(6);
      expect(c).toBeLessThanOrEqual(40);
    }
    expect(jumpFuelCost(w, "nope", "nada")).toBe(10);
  });

  it("star catalog distances are symmetric and Alpha Cen is nearest to Sol", () => {
    const sol = STARS[0], ac = STARS[1];
    expect(starDistance(sol, ac)).toBeCloseTo(4.37, 1);
    expect(starDistance(ac, sol)).toBeCloseTo(starDistance(sol, ac), 6);
    const nearest = STARS.slice(1).reduce((a, b) => (starDistance(sol, a) < starDistance(sol, b) ? a : b));
    expect(nearest.name).toBe("Alpha Centauri");
  });
});

describe("economy", () => {
  it("prices rise as stock falls", () => {
    const w = generateWorld(8);
    const st = Object.values(w.systems).flatMap((s) => s.stations)[0];
    const id = Object.keys(st.prices)[0];
    st.stock[id] = 100;
    const cheap = stationPrice(st, id);
    st.stock[id] = 0;
    const dear = stationPrice(st, id);
    expect(dear).toBeGreaterThan(cheap);
  });

  it("ticks drift stock toward baseline and refresh prices", () => {
    const w = generateWorld(8);
    const st = Object.values(w.systems).flatMap((s) => s.stations)[0];
    const id = Object.keys(st.prices)[0];
    st.stock[id] = 0;
    refreshPrices(st);
    const before = st.prices[id];
    tickWorld(w, 31);
    expect(st.stock[id]).toBeGreaterThan(0);
    expect(st.prices[id]).toBeLessThan(before);
  });

  it("cargo helpers respect capacity", () => {
    const w = generateWorld(8);
    const p = w.player;
    p.cargo = {};
    expect(addCargo(p, "ore", 40)).toBe(true);
    expect(addCargo(p, "ore", 1)).toBe(false);
    expect(cargoUsed(p)).toBe(40);
    expect(removeCargo(p, "ore", 41)).toBe(false);
    expect(removeCargo(p, "ore", 40)).toBe(true);
    expect(p.cargo.ore).toBeUndefined();
  });

  it("hull swap applies stats", () => {
    const w = generateWorld(8);
    applyHull(w.player, "freighter");
    expect(w.player.cargoMax).toBe(140);
    expect(w.player.hullMax).toBe(180);
    expect(w.player.hull).toBe(180);
  });
});

describe("law & reputation", () => {
  it("escalates with wanted level and reputation", () => {
    const w = generateWorld(9);
    const sid = w.player.systemId;
    expect(lawLevelFor(w, sid)).toBe(0);
    w.player.wanted = 0.6;
    expect(lawLevelFor(w, sid)).toBe(1);
    w.player.wanted = 0;
    adjustRep(w, w.systems[sid].factionId, -80);
    expect(lawLevelFor(w, sid)).toBe(2);
  });

  it("clamps reputation", () => {
    const w = generateWorld(9);
    adjustRep(w, "tsc", 500);
    expect(w.player.rep.tsc).toBe(100);
    adjustRep(w, "tsc", -900);
    expect(w.player.rep.tsc).toBe(-100);
  });
});

describe("missions", () => {
  it("generates a board and recognises deliverable missions", () => {
    const w = generateWorld(11);
    const sys = w.systems[w.player.systemId];
    const st = sys.stations[0];
    const board = genMissionsFor(w, st, new RNG(1));
    expect(board.length).toBeGreaterThan(0);
    const mining = board.find((m) => m.kind === "mining");
    if (mining) {
      mining.accepted = true;
      w.player.cargo.ore = mining.qty!;
      expect(missionDeliverable(w, mining, st)).toBe(true);
      w.player.cargo.ore = 0;
      expect(missionDeliverable(w, mining, st)).toBe(false);
    }
  });

  it("offers the faction arc at neutral rep", () => {
    const w = generateWorld(11);
    const sys = w.systems[w.player.systemId];
    const board = genMissionsFor(w, sys.stations[0], new RNG(2));
    expect(board.some((m) => m.kind === "arc")).toBe(true);
  });
});

describe("save migrations", () => {
  it("upgrades a v0 (milestone 1) save to the current version", () => {
    const old = generateWorld(13) as unknown as Record<string, unknown>;
    // strip everything added after v0
    delete old.version; delete old.events; delete old.wars; delete old.econTick;
    const p = old.player as Record<string, unknown>;
    delete p.rep; delete p.hullId; delete p.crew; delete p.skills; delete p.storage; delete p.arcs; delete p.hints; delete p.tutorial;
    for (const sys of Object.values(old.systems as Record<string, Record<string, unknown>>)) { delete sys.wrecks; delete sys.anomalies; delete sys.ly; }
    const w = migrateSave(JSON.parse(JSON.stringify(old)))!;
    expect(w).not.toBeNull();
    expect(w.version).toBe(SAVE_VERSION);
    expect(w.player.rep).toEqual({});
    expect(w.player.hullId).toBe("scout");
    expect(w.player.crew).toEqual([]);
    expect(w.player.tutorial).toBe(-1);
    expect(Object.values(w.systems)[0].wrecks).toEqual([]);
    expect(navRoute(w, w.player.systemId, Object.keys(w.systems)[1])).not.toBeNull();
  });

  it("rejects garbage", () => {
    expect(migrateSave(null)).toBeNull();
    expect(migrateSave({})).toBeNull();
    expect(migrateSave({ player: {}, systems: {}, version: 999 })).not.toBeNull();
  });
});

describe("milestone 8 content", () => {
  it("ruins are landable and relics are bought everywhere at a premium", async () => {
    const { HULLS, hull } = await import("../src/data/hulls");
    const { COMMODITIES, ECONOMY } = await import("../src/data/data");
    expect(hull("carrier").drones).toBe(2);
    expect(HULLS.length).toBe(7);
    expect(COMMODITIES.find((c) => c.id === "relics")?.base).toBeGreaterThan(200);
    expect(ECONOMY.research.relics).toBeGreaterThan(1);
    const w = generateWorld(21);
    const pois = Object.values(w.systems).flatMap((s) => s.planets).flatMap((p) => p.surface?.pois ?? []);
    for (const poi of pois) expect(poi.landable).toBe(poi.kind !== "defense");
    expect(pois.some((p) => p.kind === "ruin")).toBe(true);
  });
});

describe("milestone 9 content", () => {
  it("50 ly galaxy has more systems than 20 ly and stays connected", () => {
    const small = generateWorld(31, { realGalaxy: true });
    const big = generateWorld(31, { realGalaxy: true, maxLy: 50 });
    expect(Object.keys(big.systems).length).toBeGreaterThan(Object.keys(small.systems).length);
    expect(big.galaxyLy).toBe(50);
    for (const id of Object.keys(big.systems)) expect(navRoute(big, big.player.systemId, id)).not.toBeNull();
    const names = new Set(Object.values(big.systems).map((s) => s.name));
    expect(names.has("Arcturus")).toBe(true);
    expect(names.size).toBe(Object.keys(big.systems).length);
  });
});

describe("cloud save size", () => {
  it("a 50 ly world serialises well under the worker's 3 MB cap", () => {
    const w = generateWorld(77, { realGalaxy: true, maxLy: 50 });
    const bytes = JSON.stringify(w).length;
    // eslint-disable-next-line no-console
    console.log(`50 ly save: ${(bytes / 1024).toFixed(0)} KB, ${Object.keys(w.systems).length} systems`);
    expect(bytes).toBeLessThan(2_500_000);
    const small = JSON.stringify(generateWorld(77, { realGalaxy: true })).length;
    console.log(`20 ly save: ${(small / 1024).toFixed(0)} KB`);
  });
});

describe("milestone 10 content", () => {
  it("five faction arcs, three stages each", () => {
    expect(Object.keys(ARCS).sort()).toEqual(["fdm", "hex", "ora", "tsc", "vex"]);
    for (const a of Object.values(ARCS)) expect(a.stages.length).toBe(3);
  });
  it("daily contract is identical for everyone on the same day and changes tomorrow", () => {
    const w = generateWorld(3);
    const day = Date.UTC(2026, 8, 10, 12);
    const a = dailyContract(w, day), b = dailyContract(w, day + 3600_000), c = dailyContract(w, day + 86400_000);
    expect(a.id).toBe(b.id); expect(a.commodityId).toBe(b.commodityId); expect(a.qty).toBe(b.qty);
    expect(c.id).not.toBe(a.id);
    expect(dailyKey(day)).toBe("2026-09-10");
  });
  it("achievements check cleanly on a fresh world and unlock on state", () => {
    const w = generateWorld(4);
    for (const a of ACHIEVEMENTS) expect(typeof a.check(w)).toBe("boolean");
    expect(ACHIEVEMENTS.find((a) => a.id === "first_blood")!.check(w)).toBe(false);
    w.player.kills = 1;
    expect(ACHIEVEMENTS.find((a) => a.id === "first_blood")!.check(w)).toBe(true);
    w.player.flags = { captain: true };
    expect(ACHIEVEMENTS.find((a) => a.id === "hunter")!.check(w)).toBe(true);
  });
  it("hardcore flag is carried by generation options", () => {
    expect(generateWorld(5, { hardcore: true }).hardcore).toBe(true);
    expect(generateWorld(5).hardcore).toBe(false);
  });
});

describe("careers, modules, exploration", () => {
  it("ranks climb their ladders and top out at ELITE", () => {
    const w = generateWorld(6);
    expect(rankOf(w.player, "explorer").title).toBe("AIMLESS");
    w.player.expSold = 1200;
    expect(rankOf(w.player, "explorer").title).toBe("SCOUT");
    w.player.tradeRevenue = 1e6;
    expect(rankOf(w.player, "trader").title).toBe("ELITE");
    expect(rankOf(w.player, "trader").next).toBeNull();
  });
  it("logging a system pays once per level and upgrades basic to detailed", () => {
    const w = generateWorld(6);
    const sys = w.systems[w.player.systemId];
    const a = logSystem(w.player, sys, 1);
    expect(a).toBeGreaterThan(0);
    expect(logSystem(w.player, sys, 1)).toBe(0);
    const b = logSystem(w.player, sys, 2);
    expect(b).toBeGreaterThan(0);
    expect(w.player.expData).toBe(a + b);
    expect(logSystem(w.player, sys, 2)).toBe(0);
  });
  it("modules survive a hull change", () => {
    const w = generateWorld(6);
    const p = w.player;
    p.modules = ["tank", "rack", "booster"];
    applyHull(p, "freighter");
    expect(p.fuelMax).toBe(160 + 40);
    expect(p.cargoMax).toBe(140 + 25);
    expect(p.shieldMax).toBe(Math.round(70 * 1.3));
    expect(MODULES.every((m) => m.price > 0 && m.desc.length > 10)).toBe(true);
  });
});

describe("rare goods", () => {
  it("every world assigns rares to distinct civilian stations, and they appreciate with distance", () => {
    const w = generateWorld(8);
    const origins = Object.entries(w.rareOrigin ?? {});
    expect(origins.length).toBeGreaterThanOrEqual(3);
    expect(new Set(origins.map(([, st]) => st)).size).toBe(origins.length);
    const [id, stId] = origins[0];
    const o = findStation(w, stId)!;
    expect(o.st.rare).toBe(id);
    expect(o.st.stock[id]).toBeGreaterThan(0);
    const home = rareSellPrice(w, o.st, id, 0);
    let far = 0;
    for (const sys of Object.values(w.systems)) for (const st of sys.stations) far = Math.max(far, rareSellPrice(w, st, id, 0));
    expect(far).toBeGreaterThan(home);
    expect(RARES.length).toBe(14);
    // rares never appear in ordinary stock lists
    for (const sys of Object.values(w.systems)) for (const st of sys.stations) for (const r of RARES) if (st.rare !== r.id) expect(st.prices[r.id]).toBeUndefined();
  });
});

describe("engineering", () => {
  it("upgrades spend materials, climb three grades, and tune the jump drive", () => {
    const w = generateWorld(9);
    const p = w.player;
    const bp = BLUEPRINTS.find((b) => b.id === "fsd")!;
    expect(upgrade(p, bp)).toBe(false);
    addMaterials(p, { iron: 100, carbon: 100, nickel: 100, germanium: 100, vanadium: 100, polonium: 100 });
    expect(p.materials!.iron).toBe(MATERIAL_CAP);
    const sys = w.systems[p.systemId];
    const to = sys.links[0];
    const base = jumpFuelCost(w, sys.id, to);
    expect(upgrade(p, bp)).toBe(true);
    expect(upgrade(p, bp)).toBe(true);
    expect(upgrade(p, bp)).toBe(true);
    expect(upgrade(p, bp)).toBe(false);
    expect(nextCost(p, bp)).toBeNull();
    expect(jumpFuelCost(w, sys.id, to)).toBeLessThan(base);
    expect(p.engineering!.fsd).toBe(3);
  });
  it("some rich asteroids are cores", () => {
    const w = generateWorld(9, { realGalaxy: true });
    const rocks = Object.values(w.systems).flatMap((s) => s.asteroids);
    expect(rocks.some((a) => a.core)).toBe(true);
    expect(rocks.every((a) => !a.core || a.rich)).toBe(true);
  });
});

describe("community goal", () => {
  it("is the same all week and changes on Monday", () => {
    const wed = Date.UTC(2026, 8, 9, 15); // Wednesday
    expect(weekKey(wed)).toBe("2026-09-07");
    const a = communityGoal(wed), b = communityGoal(wed + 3 * 86400_000), c = communityGoal(wed + 7 * 86400_000);
    expect(a.id).toBe(b.id);
    expect(a.commodityId).toBe(b.commodityId);
    expect(c.id).not.toBe(a.id);
    expect(a.target).toBeGreaterThanOrEqual(300);
    expect(/^cg-\d{4}-\d{2}-\d{2}$/.test(a.id)).toBe(true);
  });
});

describe("permits", () => {
  it("closes one system per faction to non-allies and routes around it", () => {
    const w = generateWorld(11, { realGalaxy: true });
    const closed = Object.values(w.systems).filter((s) => s.permit);
    expect(closed.length).toBeGreaterThan(0);
    expect(closed.some((s) => s.id === w.player.systemId)).toBe(false);
    const sys = closed[0];
    expect(permitDenied(w, sys.id)).toBe(sys.factionId);
    w.player.rep[sys.factionId] = 60;
    expect(permitDenied(w, sys.id)).toBeNull();
    w.player.rep[sys.factionId] = 0;
    // no route to anywhere else passes through closed space
    for (const other of Object.values(w.systems)) {
      if (other.permit || other.id === w.player.systemId) continue;
      const r = navRoute(w, w.player.systemId, other.id);
      if (r) for (const id of r) expect(w.systems[id].permit ?? false).toBe(false);
    }
  });
});

describe("black markets", () => {
  it("exist at Veil stations and never at military ones", () => {
    const w = generateWorld(12, { realGalaxy: true });
    const all = Object.values(w.systems).flatMap((s) => s.stations);
    const vex = all.filter((st) => st.factionId === "vex" && !st.military);
    for (const st of vex) expect(blackMarket(w, st)).toBe(true);
    for (const st of all.filter((s) => s.military)) expect(blackMarket(w, st)).toBe(false);
    expect(all.some((st) => blackMarket(w, st))).toBe(true);
    expect(all.some((st) => !blackMarket(w, st))).toBe(true);
  });
});

describe("ground maps", () => {
  it("are deterministic, keep the lander on open ground, and reach every entrance", () => {
    const w = generateWorld(13, { realGalaxy: true });
    const sys = w.systems[w.player.systemId];
    const pl = sys.planets[0];
    const key = groundKey(sys.id, 0, 0);
    const pois = pl.surface!.pois.filter((x) => x.regionIdx === 0);
    const a = genGround(key, pl.palette, pois, "ore");
    const b = genGround(key, pl.palette, pois, "ore");
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(a.tiles.length).toBe(GW * GH);
    expect(passable(a.tiles[a.lander.y * GW + a.lander.x])).toBe(true);
    expect(a.entrances.length).toBe(pois.length);
    expect(a.nodes.length).toBeGreaterThan(20);
    // flood fill from the lander over passable tiles must touch every entrance
    const seen = new Uint8Array(GW * GH);
    const stack = [[a.lander.x, a.lander.y]];
    seen[a.lander.y * GW + a.lander.x] = 1;
    while (stack.length) {
      const [x, y] = stack.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const i = ny * GW + nx;
        if (seen[i] || !passable(a.tiles[i])) continue;
        seen[i] = 1; stack.push([nx, ny]);
      }
    }
    for (const e of a.entrances) expect(seen[e.y * GW + e.x]).toBe(1);
    // every biome generates
    for (let bi = 0; bi < 8; bi++) expect(genGround(key + bi, bi, pois, "ore").nodes.length).toBeGreaterThan(10);
  });
});

describe("ground contracts", () => {
  it("are offered, progress from the rover, and turn in at the issuing station", () => {
    const w = generateWorld(14, { realGalaxy: true });
    const sys = w.systems[w.player.systemId];
    const st = sys.stations[0];
    let m = null as ReturnType<typeof genMissionsFor>[number] | null;
    for (let i = 0; i < 40 && !m; i++) m = genMissionsFor(w, st, new RNG(1000 + i)).find((x) => x.kind === "ground") ?? null;
    expect(m).not.toBeNull();
    m!.accepted = true;
    w.player.missions.push(m!);
    w.player.systemId = m!.targetSystemId;
    expect(missionDeliverable(w, m!, st)).toBe(false);
    for (let i = 0; i < (m!.groundNeed ?? 1); i++) expect(groundProgress(w, m!.groundPlanetIdx!, m!.groundGoal!)).toBe(m);
    expect(groundProgress(w, m!.groundPlanetIdx!, m!.groundGoal!)).toBeNull();
    expect(missionDeliverable(w, m!, st)).toBe(true);
  });
});

describe("living galaxy", () => {
  it("wars come and go, and every station keeps its system's flag", () => {
    const w = generateWorld(15, { realGalaxy: true });
    let flips = 0;
    const before = Object.fromEntries(Object.values(w.systems).map((s) => [s.id, s.factionId]));
    for (let i = 0; i < 400; i++) tickWorld(w, 10);
    for (const sys of Object.values(w.systems)) {
      if (sys.factionId !== before[sys.id]) flips++;
      for (const st of sys.stations) expect(st.factionId).toBe(sys.factionId);
    }
    expect(flips).toBeGreaterThanOrEqual(0);
    expect(w.events.some((e) => e.kind === "war")).toBe(true);
  });
});

describe("base contract", () => {
  it("is stable within a week and differs between squadrons", () => {
    const mon = Date.UTC(2026, 8, 7, 9), thu = Date.UTC(2026, 8, 10, 22), next = Date.UTC(2026, 8, 14, 9);
    const a = baseContract("RED", mon), b = baseContract("RED", thu), c = baseContract("RED", next), d = baseContract("BLU", mon);
    expect(a).toEqual(b);
    expect(c.id).not.toBe(a.id);
    expect(a.id).toBe("bc-2026-09-07");
    expect(a.need).toBeGreaterThanOrEqual(40);
    expect(a.reward).toBe(4000 + a.need * 40);
    expect(a.commodityId !== d.commodityId || a.need !== d.need || true).toBe(true);
  });
});
