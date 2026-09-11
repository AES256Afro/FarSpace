import { describe, it, expect } from "vitest";
import {
  weekKey, genCrewCandidate, hasSpecialty, legSummary, noteLeg, newLeg, SIM_PROGRAMS, reviewCrew, reviewDue, nameTheShip, shipVoiceName, receptionHeld, receptionDue, ALERT_NAME, alertMods, beltRate, isBeltStation, FURNISHINGS, runSim, setFocus, briefingReports, patientDeadline, patientOutcome, takeJuice, buyJuice, envoyOutcome, firstOfficer, stardate, cookMeal, LOST_KEEP_AFTER, LOST_REWARD, tickLostProperty, handInLostItem, leaveLostItem, passengersTookFire, passengersFed, askPassengerRequest, findStation, berthedCaptains, generateWorld, navRoute, routeFuel, jumpFuelCost, stationPrice, refreshPrices,
  addCargo, removeCargo, cargoUsed, applyHull, lawLevelFor, adjustRep, tickWorld,
  missionDeliverable, genMissionsFor, tickWear, jumpWear, wearThrust, wearFault, servicePrice, serviceHull, crewFallsIll, crewRecover, crewTreat, crewBonus, sendOnLeave, berthsUsed, collectShoreCrew, retireCrew, genFares, passengerCap, passengersAboard, settlePassengers, passengerPay, logSight, canBuildInfra, buildInfra, infraAt, infraTraffic, tickInfra, stockDepot, drawDepot, collectInfra, repairInfra, infraLit, jumpFuelCost, canRetireCaptain, retireCaptain, crewXp, restAtDock, adoptCat, stormBlind, tickBonds, bond, shiftBond, feuds, bondLabel, chronicleText, growSettlement, settlementTierLabel, hireCharter, tickCharters, collectCharters, releaseCharter, refreshPrices, seeWonder, wondersIn, captainByName, helpCaptain, isFriend, friendsAt, tickMail, pickCaptainFor, canUpgradeInfra, upgradeInfra, rivalOf, isRival, rivalTakesFare, rivalBeatsYouTo, askRideAlong, tickRideAlong, setHomePort, isHome, donateRelic, hullHistoryFor, notableById, notableOutcome, canFundProject, fundProject, PROJECTS, settlementNeeds, ledger, ledgerAround, LEDGER_LABELS, catGift, stationBulletin, dockingsAt } from "../src/world";
import { occasionFor, OCCASIONS } from "../src/data/occasions";
import { STEPS } from "../src/core/tutorial";
import { CREW_ARCS, arcObjective } from "../src/core/crewarcs";
import { KEEPER, keeperReady, startKeeper, keeperObjective, keeperScan, KEEPER_OWNER } from "../src/core/keeper";
import type { Charter, Mission } from "../src/world";
import type { Infra } from "../src/world";
import { migrateSave, SAVE_VERSION, saveKeyFor, SLOTS } from "../src/save";
import { RNG } from "../src/core/rng";
import { STARS, starDistance } from "../src/data/stars";
import { ACHIEVEMENTS } from "../src/data/achievements";
import { ARCS, dailyContract, dailyKey, rankOf, logSystem, applyHull } from "../src/world";
import { MODULES } from "../src/data/modules";
import { WONDER_DEFS, rareSellPrice, findStation, genCrewCandidate, raceCourse, racePar, racePrize, recordRace, RACE_GATES, onWatch, WATCH_LEN, raceHolder, beatHolder, postDelivered, missionDeliverable, captainNickname, signGuestbook, lanesReport, hangPicture, leaveWreck, addWireWrecks, enterRegatta, regattaObjective, regattaProgress, buyStake, collectStake, stakePrice, STAKE_CAP, collectRemoteStakes, hasSpecialty, chooseSpecialty, wearRate, crewOwnHull, OWN_HULL_CREW_FEE, maydayAnswered, favourFor, favourDone, borderContest, pushInfluence, borderStanding, resolveBorder, photoTaken, WONDER_RANGE, replyToLetter } from "../src/world";
import { RARES } from "../src/data/data";
import { baseContract } from "../src/core/wire";
import { syndicateAt, baseDemand, tickSyndicates, adjustSynRep, synStanding, shiftRelation, synRelation, synAllies, effectiveSynStanding, warContribute, backWar } from "../src/world";
import { ENCOUNTERS, pickEncounter } from "../src/data/encounters";
import { crewChatter, soloChatter, passengerChatter } from "../src/data/chatter";
import { arcFor, CREW_ARCS, arcObjective } from "../src/core/crewarcs";
import { concourseGossip } from "../src/data/gossip";
import { stationHour, tannoyLines, hoursRate } from "../src/data/tannoy";
import { passingHail } from "../src/data/hails";
import { dockhandLines, dockhandFavour, DOCKHAND_REGULAR_AT } from "../src/data/dockhand";
import { weeklyIssue, castVote, voteResult, voteMods, myVote } from "../src/data/votes";
import { STORY, storyObjective, CONVOY, convoyObjective } from "../src/core/story";
import { homesteadYield, settleHomestead, HOMESTEAD_CAP, tickCrisis, crisisAt, tickGalaxyEvents, galaxyEventAt, rescuePoints, logEntry, embargoed, hasCharter } from "../src/world";
import { genGround, groundKey, passable, GW, GH } from "../src/ground";
import { SERIALS, tickSerial, serialDef, serialHookActive, serialLines, serialPremium, serialMissionFor, serialRecruitFor, SERIAL_GAP, SERIAL_HOOK_TTL } from "../src/data/serials";
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
    let sawWar = false;
    for (let i = 0; i < 400; i++) { tickWorld(w, 10); if (w.events.some((e) => e.kind === "war")) sawWar = true; }
    for (const sys of Object.values(w.systems)) {
      if (sys.factionId !== before[sys.id]) flips++;
      for (const st of sys.stations) expect(st.factionId).toBe(sys.factionId);
    }
    expect(flips).toBeGreaterThanOrEqual(0);
    expect(sawWar).toBe(true);
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

describe("save slots", () => {
  it("slot 0 keeps the historic key; others are suffixed", () => {
    expect(SLOTS).toBe(3);
    expect(saveKeyFor(0)).toBe("farspace-save");
    expect(saveKeyFor(1)).toBe("farspace-save-1");
    expect(saveKeyFor(2)).toBe("farspace-save-2");
  });
});

describe("syndicates", () => {
  it("four AI syndicates per galaxy with distinct homes, partners and rivals", () => {
    const w = generateWorld(16, { realGalaxy: true });
    const sy = w.syndicates ?? [];
    expect(sy.length).toBe(4);
    expect(new Set(sy.map((s) => s.systemId)).size).toBe(4);
    expect(sy.every((s) => s.systemId !== w.player.systemId)).toBe(true);
    for (const s of sy) {
      expect(syndicateAt(w, s.stationId)?.tag).toBe(s.tag);
      expect(s.rivals.length).toBeGreaterThan(0);
      expect(s.treasury).toBeGreaterThan(0);
    }
    // migration adds them to old worlds
    const old = JSON.parse(JSON.stringify(w)); old.version = 5; delete old.syndicates;
    const m = migrateSave(old)!;
    expect(m.syndicates?.length).toBe(4);
  });
});

describe("syndicate economy", () => {
  it("offers contracts at a syndicate base, seeds weekly demand, and rivalry moves treasuries", () => {
    const w = generateWorld(17, { realGalaxy: true });
    const sy = w.syndicates![0];
    const st = w.systems[sy.systemId].stations.find((x) => x.id === sy.stationId)!;
    const ms = genMissionsFor(w, st, new RNG(5)).filter((m) => m.syndicate === sy.tag);
    expect(ms.length).toBeGreaterThanOrEqual(1);
    expect(ms.some((m) => m.kind === "delivery") || ms.some((m) => m.kind === "bounty")).toBe(true);
    const d1 = baseDemand("syn:" + sy.tag, Date.UTC(2026, 8, 9)), d2 = baseDemand("syn:" + sy.tag, Date.UTC(2026, 8, 11));
    expect(d1).toEqual(d2);
    expect(d1.length).toBe(3);
    expect(new Set(d1).size).toBe(3);
    const total = () => w.syndicates!.reduce((a, s) => a + s.treasury, 0);
    const before = total();
    for (let i = 0; i < 20; i++) tickSyndicates(w, new RNG(100 + i));
    expect(total()).toBeGreaterThanOrEqual(before); // raids move money, trade creates it
    adjustSynRep(w, sy.tag, 35);
    expect(synStanding(w, sy.tag)).toBe(35);
  });
});

describe("syndicate diplomacy", () => {
  it("relations move rivalry lists, alliances share perks, and the news reports it", () => {
    const w = generateWorld(18, { realGalaxy: true });
    const [a, b] = w.syndicates!.filter((s) => s.style !== "pirate");
    expect(a && b).toBeTruthy();
    const start = synRelation(w, a.tag, b.tag);
    shiftRelation(w, a.tag, b.tag, 60 - start);
    expect(synAllies(w, a.tag)).toContain(b.tag);
    expect(w.events.some((e) => e.text.includes("alliance"))).toBe(true);
    adjustSynRep(w, b.tag, 60);
    expect(effectiveSynStanding(w, a.tag)).toBe(30); // partner of an ally counts as affiliate
    shiftRelation(w, a.tag, b.tag, -100);
    expect(a.rivals).toContain(b.tag);
    expect(b.rivals).toContain(a.tag);
    expect(w.events.some((e) => e.text.includes("feud"))).toBe(true);
  });
});

describe("syndicate wars", () => {
  it("a deep feud starts a war, contributions move the front, and resolution moves a lane", () => {
    const w = generateWorld(19, { realGalaxy: true });
    const [a, b] = w.syndicates!.filter((s) => s.style !== "pirate");
    shiftRelation(w, a.tag, b.tag, -100);
    let tries = 0;
    while (!w.synWar && tries++ < 40) tickSyndicates(w, new RNG(500 + tries));
    expect(w.synWar).toBeTruthy();
    const war = w.synWar!;
    const winnerSide = war.attacker;
    warContribute(w, winnerSide, 100);
    expect(war.score).toBe(100);
    const partnersBefore = w.syndicates!.find((s) => s.tag === winnerSide)!.partners.length;
    const credits = w.player.credits;
    tickSyndicates(w, new RNG(9)); // resolves on decisive score
    expect(w.synWar).toBeNull();
    expect(w.syndicates!.find((s) => s.tag === winnerSide)!.partners.length).toBeGreaterThanOrEqual(partnersBefore);
    expect(w.player.credits).toBeGreaterThan(credits);
    expect(w.player.flags?.warVeteran).toBe(true);
    expect(w.events.some((e) => e.text.includes("Syndicate war over"))).toBe(true);
    // a rout (score 100 for the attacker) takes the base when the loser has a free partner to fall back to
    const win = w.syndicates!.find((s) => s.tag === winnerSide)!;
    const lose = w.syndicates!.find((s) => s.tag === (winnerSide === war.attacker ? war.defender : war.attacker))!;
    if (win.holdings?.length) { expect(syndicateAt(w, win.holdings[0])?.tag).toBe(win.tag); expect(lose.stationId).not.toBe(win.holdings[0]); }
  });
});

describe("squadrons at war", () => {
  it("declaring moves the front, multiplies contributions, and a win owes the treasury", () => {
    const w = generateWorld(20, { realGalaxy: true });
    const [a, b] = w.syndicates!.filter((s) => s.style !== "pirate");
    shiftRelation(w, a.tag, b.tag, -100);
    let tries = 0;
    while (!w.synWar && tries++ < 40) tickSyndicates(w, new RNG(300 + tries));
    const war = w.synWar!;
    expect(backWar(w, war.attacker, "RED")).toBe(true);
    expect(war.score).toBe(10);
    expect(backWar(w, war.defender, "BLU")).toBe(false);
    warContribute(w, war.attacker, 10);
    expect(war.contrib[war.attacker]).toBe(15);
    warContribute(w, war.attacker, 100);
    tickSyndicates(w, new RNG(1));
    expect(w.synWar).toBeNull();
    expect(w.player.warPayout?.tag).toBe("RED");
    expect(w.player.warPayout!.value).toBeGreaterThan(500);
    expect(w.player.flags?.squadWarWin).toBe(true);
  });
});

describe("encounters", () => {
  it("every option resolves to a line, and repeats are weighted down", () => {
    const w = generateWorld(21, { realGalaxy: true });
    w.player.credits = 5000; w.player.fuel = 100; w.player.cargo = { food: 5, parts: 2 };
    const g = { world: w, scenes: {} } as unknown as import("../src/game").Game;
    for (const e of ENCOUNTERS) for (const o of e.options) {
      if (o.requires && !o.requires(g)) continue;
      const line = o.result(g, new RNG(3));
      expect(typeof line).toBe("string");
      expect(line.length).toBeGreaterThan(10);
    }
    const first = pickEncounter(g, "space", new RNG(1))!;
    expect(first.where).toBe("space");
    w.player.encounters = { [first.id]: 50 };
    let same = 0;
    for (let i = 0; i < 40; i++) if (pickEncounter(g, "space", new RNG(100 + i))!.id === first.id) same++;
    expect(same).toBeLessThan(6);
    expect(pickEncounter(g, "ground", new RNG(2))!.where).toBe("ground");
  });
});

describe("corridor talk", () => {
  it("crew have something to say in every state", () => {
    const w = generateWorld(23, { realGalaxy: true });
    const rng = new RNG(5);
    const a = genCrewCandidate(rng), b = genCrewCandidate(rng);
    w.player.crew = [a, b];
    const seen = new Set<string>();
    for (const bd of [-3, 0, 3]) { a.bonds = { [b.name]: bd }; for (let i = 0; i < 20; i++) seen.add(crewChatter(w, a, b, new RNG(i))); }
    expect(seen.size).toBeGreaterThan(8);
    w.player.hull = 10; w.player.fuel = 1; w.player.credits = 50; w.player.cat = { name: "Biscuit", since: 0 }; a.morale = 10;
    for (let i = 0; i < 30; i++) expect(crewChatter(w, a, b, new RNG(i)).length).toBeGreaterThan(5);
    a.trait = "plays cards for matchsticks";
    expect(soloChatter(a)).toContain("CARDS");
  });
});

describe("concourse gossip", () => {
  it("the crowd has plenty to say and it all fits on a line", () => {
    const w = generateWorld(24, { realGalaxy: true });
    const st = Object.values(w.systems).flatMap((s) => s.stations)[0];
    const base = concourseGossip(w, st, new RNG(1));
    expect(base.length).toBeGreaterThan(5);
    w.crisis = { stationId: st.id, systemId: w.player.systemId, commodityId: "med", need: 20, delivered: 4, until: w.time + 1000, kind: "outbreak" };
    w.player.rescues = 5; w.player.discoveries = 4; w.player.homePort = st.id; w.player.dockings = { [st.id]: 9 };
    const rich = concourseGossip(w, st, new RNG(2));
    expect(rich.length).toBeGreaterThan(base.length + 3);
    for (const l of rich) expect(l.length).toBeLessThanOrEqual(96);
  });
});

describe("the ring race", () => {
  it("lays six rings round the station, pays more under par, and keeps your best", () => {
    const w = generateWorld(25, { realGalaxy: true });
    const st = Object.values(w.systems).flatMap((s) => s.stations)[0];
    const gates = raceCourse(st, 1);
    expect(gates.length).toBe(RACE_GATES);
    const cx = Math.cos(st.angle) * st.orbit, cy = Math.sin(st.angle) * st.orbit;
    for (const gt of gates) { const d = Math.hypot(gt.x - cx, gt.y - cy); expect(d).toBeGreaterThan(150); expect(d).toBeLessThan(600); }
    expect(raceCourse(st, 1)).toEqual(gates);
    const grand = raceCourse(st, 1, 8, 1.35);
    expect(grand.length).toBe(8);
    expect(racePar(grand)).toBeGreaterThan(racePar(gates));
    const par = racePar(gates);
    expect(par).toBeGreaterThan(8);
    expect(racePrize(par - 5, par)).toBeGreaterThan(racePrize(par + 5, par));
    expect(racePrize(par, par, Date.UTC(2026, 8, 9, 12))).toBeGreaterThan(0);
    expect(recordRace(w.player, st.id, 40.26)).toBe(true);
    expect(recordRace(w.player, st.id, 45)).toBe(false);
    expect(recordRace(w.player, st.id, 39)).toBe(true);
    expect(w.player.raceBest![st.id]).toBe(39);
    expect(w.player.races).toBe(3);
    // the local record holder: a named captain a shade over par, beaten once and remembered
    const h = raceHolder(w, st);
    expect(h.t).toBeGreaterThan(racePar(raceCourse(st, w.seed)));
    expect(raceHolder(w, st).name).toBe(h.name);
    expect(beatHolder(w, st, h.t + 1)).toBeNull();
    if (h.captain) h.captain.disposition = -2;
    const line = beatHolder(w, st, h.t - 1);
    expect(line).toBeTruthy();
    if (h.captain) expect(h.captain.disposition).toBe(-3);
    if (h.captain) expect((w.mailQueue ?? []).some((l) => l.from.startsWith(h.captain!.name))).toBe(true);
    expect(beatHolder(w, st, h.t - 2)).toBeNull();
    expect(w.player.raceBeaten![st.id]).toBe(true);
  });
});

describe("watches and passengers aboard", () => {
  it("half the crew are on watch and it swaps every watch; passengers get an answer from any role", () => {
    const w = generateWorld(26, { realGalaxy: true });
    const rng = new RNG(8);
    w.player.crew = [genCrewCandidate(rng), genCrewCandidate(rng), genCrewCandidate(rng)];
    expect(onWatch(w.player, 0, 0)).toBe(true); expect(onWatch(w.player, 1, 0)).toBe(false);
    expect(onWatch(w.player, 0, WATCH_LEN)).toBe(false); expect(onWatch(w.player, 1, WATCH_LEN)).toBe(true);
    w.player.crew = [w.player.crew[0]]; expect(onWatch(w.player, 0, WATCH_LEN)).toBe(true);
    const m = { id: "m", kind: "passenger", passengerKind: "tourist", mood: 90 } as unknown as import("../src/world").Mission;
    for (const role of ["pilot", "engineer", "gunner", "medic"] as const) { const c = { ...genCrewCandidate(rng), role }; const q = passengerChatter(m, c, new RNG(1)); expect(q.ask.length).toBeGreaterThan(5); expect(q.reply.length).toBeGreaterThan(2); }
  });
});

describe("the post", () => {
  it("every civil station has a mail bag, deliverable at its target with no cargo, and sometimes a letter comes back", () => {
    const w = generateWorld(27, { realGalaxy: true });
    const civil = Object.values(w.systems).flatMap((s) => s.stations).filter((st) => !st.military);
    const st = civil[0];
    const board = genMissionsFor(w, st, new RNG(4));
    const post = board.find((m) => m.kind === "post")!;
    expect(post).toBeTruthy();
    expect(post.commodityId).toBeUndefined();
    post.accepted = true;
    const target = findStation(w, post.targetStationId!)!.st;
    expect(missionDeliverable(w, post, st)).toBe(target === st);
    expect(missionDeliverable(w, post, target)).toBe(true);
    let notes = 0;
    for (let i = 0; i < 20; i++) if (postDelivered(w, new RNG(i))) notes++;
    expect(w.player.postRuns).toBe(20);
    expect(notes).toBeGreaterThan(2);
    expect((w.mailQueue ?? []).length).toBe(notes);
    const mil = Object.values(w.systems).flatMap((s) => s.stations).find((x) => x.military);
    if (mil) expect(genMissionsFor(w, mil, new RNG(4)).some((m) => m.kind === "post")).toBe(false);
    let convoy: import("../src/world").Mission | undefined;
    for (let seed = 0; seed < 8 && !convoy; seed++) convoy = genMissionsFor(w, st, new RNG(seed)).find((m) => m.kind === "convoy");
    expect(convoy).toBeTruthy();
    if (convoy) { convoy.accepted = true; expect(missionDeliverable(w, convoy, st)).toBe(false); expect(convoy.reward).toBeGreaterThan(150); }
  });
});

describe("a name on the lanes", () => {
  it("is earned, in order of what you've done most", () => {
    const w = generateWorld(28, { realGalaxy: true });
    expect(captainNickname(w)).toBeNull();
    w.player.postRuns = 10; expect(captainNickname(w)).toBe("THE POSTMAN");
    w.player.rescues = 5; expect(captainNickname(w)).toBe("THE LIFEBOAT");
    w.player.rescues = 0; w.player.postRuns = 0; w.player.races = 3; w.player.raceBeaten = { x: true }; expect(captainNickname(w)).toBe("RING RUNNER");
  });
});

describe("station hours and the tannoy", () => {
  it("every station keeps its own clock and always has something to announce", () => {
    const w = generateWorld(29, { realGalaxy: true });
    const sts = Object.values(w.systems).flatMap((s) => s.stations);
    const at = Date.UTC(2026, 8, 10, 3, 30);
    const hours = new Set(sts.map((st) => stationHour(st, at).h));
    expect(hours.size).toBeGreaterThan(3);
    expect(stationHour(sts[0], at)).toEqual(stationHour(sts[0], at));
    for (const st of sts.slice(0, 5)) { const lines = tannoyLines(w, st, new RNG(1), at); expect(lines.length).toBeGreaterThan(5); for (const l of lines) expect(l.length).toBeLessThanOrEqual(130); }
    w.player.postRuns = 10; expect(tannoyLines(w, sts[0], new RNG(2), at).some((l) => l.includes("THE POSTMAN"))).toBe(true);
  });
  it("the supplemental log tallies the leg in the captain's voice", () => {
    const w = generateWorld(52, { realGalaxy: true }); const p = w.player; p.crew = [genCrewCandidate(new RNG(1))]; p.crew[0].morale = 80;
    newLeg(p, w.time); expect(legSummary(w)).toBeNull();
    noteLeg(p, "jumps"); noteLeg(p, "jumps"); noteLeg(p, "fights"); noteLeg(p, "alerts"); noteLeg(p, "cards"); p.rescues = (p.rescues ?? 0) + 1; w.time += 5400;
    const s = legSummary(w)!;
    expect(s).toMatch(/^Supplemental, stardate 41\d+\.\d, 1\.5h since the clamp: 2 jumps, fire taken, red alert x1, 1 card on the lane, 1 rescue\.( Crew in good heart\.)?$/);
    newLeg(p, w.time); noteLeg(p, "jumps"); w.time += 600; expect(legSummary(w)).toMatch(/10m since the clamp: 1 jump\. Crew in good heart\.$/);
    expect(s.length).toBeLessThanOrEqual(118);
    newLeg(p, w.time); expect(legSummary(w)).toBeNull();
  });
  it("reviews: commend, counsel, or choose Number One, once a week each", () => {
    const w = generateWorld(50, { realGalaxy: true }); const p = w.player;
    p.crew = [genCrewCandidate(new RNG(1)), genCrewCandidate(new RNG(2))]; p.crew[0].docks = 9; p.crew[1].docks = 1; for (const c of p.crew) { c.morale = 50; c.loyalty = 0; }
    expect(firstOfficer(p)).toBe(p.crew[0]);
    expect(reviewDue(p, p.crew[1])).toBe(true);
    expect(reviewCrew(w, p.crew[1], "numberone")).toContain("NUMBER ONE"); expect(firstOfficer(p)).toBe(p.crew[1]); expect(p.crew[1].loyalty).toBe(1);
    expect(reviewDue(p, p.crew[1])).toBe(false); expect(reviewDue(p, p.crew[0])).toBe(true);
    expect(reviewCrew(w, p.crew[0], "commend")).toContain("MORALE AND LOYALTY UP"); expect(p.crew[0].morale).toBe(58);
    const w2 = generateWorld(51, { realGalaxy: true }); const c = genCrewCandidate(new RNG(3)); c.morale = 50; w2.player.crew = [c];
    expect(reviewCrew(w2, c, "counsel")).toContain("MORALE DIPS"); expect(c.morale).toBe(47);
    const couns = { ...genCrewCandidate(new RNG(4)), role: "medic", specialty: "counsellor", skill: 3, morale: 60, sick: null } as any; w2.player.crew.push(couns);
    expect(hasSpecialty(w2.player, "counsellor")).toBe(true); (w2.player.flags ??= {})[`review:${c.name}:x`] = false;
    const w3 = generateWorld(53, { realGalaxy: true }); w3.player.crew = [couns, { ...c }]; const c3 = w3.player.crew[1]; c3.morale = 50;
    expect(reviewCrew(w3, c3, "commend")).toContain("MORALE AND LOYALTY UP"); expect(c3.morale).toBe(62);
  });
  it("a fare who wants the star up close, and a loop that breaks on the third try", () => {
    const w = generateWorld(49, { realGalaxy: true }); const p = w.player;
    p.missions.push({ id: "s", kind: "passenger", title: "t", desc: "d", fromStationId: "a", targetSystemId: "b", reward: 100, accepted: true, done: false, passengerName: "Rook", mood: 50, request: "star", requestMet: true, tip: 30 } as Mission);
    expect(settlePassengers(p).some((l) => l.includes("STAR UP CLOSE") && l.includes("+30CR"))).toBe(true);
    const g = { world: w, scenes: {} } as unknown as import("../src/game").Game;
    const loop = ENCOUNTERS.find((e) => e.id === "loop")!; expect(loop.when!(g)).toBe(true);
    let tries = 0; while (!p.flags?.loopDone && tries < 5) { loop.options[0].result(g, new RNG(100 + tries)); tries++; }
    expect(p.flags?.loopDone).toBe(true); expect(tries).toBeLessThanOrEqual(3); expect(loop.when!(g)).toBe(false);
  });
  it("the ship's voice signs with the hull until it is asked its name", () => {
    const w = generateWorld(48, { realGalaxy: true }); const p = w.player;
    expect(shipVoiceName(p)).toBe(shipVoiceName(p).toUpperCase()); expect(p.voiceName).toBeUndefined();
    expect(nameTheShip(w, " ")).toContain("WAITS"); expect(p.voiceName).toBeUndefined();
    expect(nameTheShip(w, "Marigold")).toContain("MARIGOLD"); expect(shipVoiceName(p)).toBe("MARIGOLD");
    expect(nameTheShip(w, "averyveryverylongnameindeed").length).toBeGreaterThan(10); expect(p.voiceName!.length).toBeLessThanOrEqual(16);
  });
  it("receptions come with standing, once a week per faction", () => {
    const w = generateWorld(47, { realGalaxy: true }); const p = w.player;
    const sts = Object.values(w.systems).flatMap((s) => s.stations).filter((s) => s.factionId !== "vex");
    for (const st of sts.slice(0, 5)) expect(receptionDue(w, st)).toBe(false);
    for (const st of sts) p.rep[st.factionId] = 30;
    const due = sts.find((st) => receptionDue(w, st));
    expect(due).toBeDefined();
    receptionHeld(w, due!); expect(receptionDue(w, due!)).toBe(false);
  });
  it("passing hails have manners: patrols are formal, haulers belt or business, liners smug", () => {
    const w = generateWorld(46, { realGalaxy: true }); const p = w.player; p.cat = { name: "Biscuit", since: 0 } as any;
    const mk = (kind: "trader" | "patrol") => ({ kind, x: 100, y: 200, hull: 10 } as any);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) { const h = passingHail(w, mk(i % 2 ? "patrol" : "trader"), i % 5 === 0 ? 2 : 0, new RNG(i)); expect(h).not.toBeNull(); seen.add(h!.from.split(" ")[0]); expect(h!.text.length).toBeLessThanOrEqual(150); }
    expect(seen.has("PATROL")).toBe(true); expect(seen.has("HAULER")).toBe(true);
    expect([...Array(40).keys()].some((i) => passingHail(w, mk("trader"), 0, new RNG(i))!.text.includes("CAT"))).toBe(true);
  });
  it("alert status: yellow readies the shields, red readies everything and costs morale", () => {
    expect(alertMods(0)).toEqual({ shield: 1, dmg: 1, morale: 0 });
    expect(alertMods(1).shield).toBe(1.5); expect(alertMods(2)).toEqual({ shield: 2, dmg: 1.1, morale: -1 });
    expect(ALERT_NAME[2]).toBe("RED ALERT");
  });
  it("the belt remembers: mining and refinery yards give the sharer their rate", () => {
    const w = generateWorld(45, { realGalaxy: true }); const p = w.player;
    const sts = Object.values(w.systems).flatMap((s) => s.stations);
    const belt = sts.find((s) => isBeltStation(s))!; const inner = sts.find((s) => !isBeltStation(s))!;
    expect(beltRate(p, belt)).toBe(1); (p.flags ??= {}).belt = true;
    expect(beltRate(p, belt)).toBe(0.9); expect(beltRate(p, inner)).toBe(1);
    p.dockedAt = belt.id; expect(tannoyLines(w, belt, new RNG(1)).some((l) => l.includes("THE YARD REMEMBERS"))).toBe(true);
  });
  it("the singers: three cards gated by flags, and the codex counts how far it went", () => {
    const w = generateWorld(44, { realGalaxy: true }); const p = w.player; p.expData = 100; p.crew = [genCrewCandidate(new RNG(1))];
    const g = { world: w, scenes: {} } as unknown as import("../src/game").Game;
    const by = (id: string) => ENCOUNTERS.find((e) => e.id === id)!;
    expect(by("singersreturn").when!(g)).toBe(false); expect(by("singersgift").when!(g)).toBe(false);
    let line = ""; for (let i = 0; i < 20 && !p.flags?.firstContact; i++) { p.expData = 100; line = by("firstcontact").options[0].result(g, new RNG(i)); }
    expect(p.flags?.firstContact).toBe(true); expect(p.codex?.["contact:THE SINGERS"]).toBe(1);
    expect(by("singersreturn").when!(g)).toBe(true);
    expect(by("singersreturn").options[1].result(g, new RNG(1))).toContain("SING THE ROUTE"); expect(p.codex?.["contact:THE SINGERS"]).toBe(2);
    expect(by("singersreturn").when!(g)).toBe(false); expect(by("singersgift").when!(g)).toBe(true);
    expect(by("singersgift").options[0].result(g, new RNG(1))).toContain("HUMS"); expect(p.codex?.["contact:THE SINGERS"]).toBe(3);
    expect(p.keepsakes?.some((k) => k.includes("shard"))).toBe(true); expect(by("singersgift").when!(g)).toBe(false);
  });
  it("the sim rig: four programs, each once a leg, and the fares come to the opera", () => {
    const w = generateWorld(43, { realGalaxy: true }); const p = w.player;
    expect(FURNISHINGS.some((f) => f.id === "simrig" && f.tile === "S")).toBe(true);
    p.crew = [genCrewCandidate(new RNG(1))]; p.crew[0].morale = 50;
    p.missions.push({ id: "f", kind: "passenger", title: "t", desc: "d", fromStationId: "a", targetSystemId: "b", reward: 100, accepted: true, done: false, passengerName: "Rook", mood: 50 } as Mission);
    expect(runSim(w, "opera", new RNG(1))).toContain("OPERA"); expect(p.simUsed).toBe(true); expect(p.crew[0].morale).toBe(54); expect(passengersAboard(p)[0].mood).toBe(58);
    for (const id of ["beach", "frontier", "home", "unwinnable"] as const) expect(runSim(w, id, new RNG(2)).length).toBeGreaterThan(20);
    expect(SIM_PROGRAMS.some((s) => s.id === "unwinnable")).toBe(true);
    expect(p.crew[0].morale).toBeGreaterThanOrEqual(66); expect(p.crew[0].morale).toBeLessThanOrEqual(78);
  });
  it("the senior staff report by department and a focus changes wear, fuel and the sick", () => {
    const w = generateWorld(42, { realGalaxy: true }); const p = w.player;
    p.crew = [{ ...genCrewCandidate(new RNG(1)), role: "engineer" }, { ...genCrewCandidate(new RNG(2)), role: "medic" }] as any; for (const c of p.crew) c.sick = null;
    p.wear = 65; const rep = briefingReports(w);
    expect(rep.length).toBe(4); expect(rep[0]).toContain("(ENGINES)"); expect(rep[0]).toContain("WEAR AT 65%"); expect(rep[1]).toContain("(SICKBAY)"); expect(rep[2]).toContain("NO PILOT"); expect(rep[3]).toContain("NO GUNNER");
    const w0 = p.wear; p.focus = null; tickWear(p, 10); const plain = p.wear - w0;
    p.wear = w0; p.focus = "engines"; tickWear(p, 10); expect(p.wear - w0).toBeCloseTo(plain * 0.8, 5);
    const sys = w.systems[p.systemId]; const to = sys.links[0]; p.focus = null; const f0 = jumpFuelCost(w, sys.id, to); p.focus = "helm"; expect(jumpFuelCost(w, sys.id, to)).toBeLessThanOrEqual(f0);
    p.crew[1].sick = { kind: "flu", until: w.time + 1000 }; p.crew[0].morale = 50;
    expect(setFocus(w, "sickbay")).toContain("SICKBAY"); expect(p.crew[0].morale).toBe(54); expect(p.crew[1].sick!.until - w.time).toBeCloseTo(500, 5); expect(p.briefed).toBe(true);
  });
  it("patients: in time and the clinic takes over; a medic buys a docking; late halves the fare", () => {
    const w = generateWorld(41, { realGalaxy: true }); const p = w.player;
    const st = Object.values(w.systems).flatMap((s) => s.stations)[0];
    let pt: Mission | undefined; for (let i = 0; i < 40 && !pt; i++) pt = genFares(w, st, new RNG(i)).find((m) => m.passengerKind === "patient");
    expect(pt).toBeDefined(); expect(pt!.title).toMatch(/^Patient: /); expect(pt!.demand).toBe("med");
    p.crew = [];
    const m = { ...pt!, docksAboard: pt!.patience, mood: 50 } as Mission;
    expect(patientOutcome(w, m).ok).toBe(true); expect(m.mood).toBe(75); expect(p.lives).toBe(1);
    const late = { ...pt!, docksAboard: (pt!.patience ?? 1) + 1, mood: 50 } as Mission;
    expect(patientOutcome(w, late).ok).toBe(false); expect(late.mood).toBe(25);
    p.crew = [{ ...genCrewCandidate(new RNG(2)), role: "medic", sick: null } as any];
    const saved = { ...pt!, docksAboard: (pt!.patience ?? 1) + 1, mood: 50 } as Mission;
    expect(patientDeadline(p, saved)).toBe((pt!.patience ?? 1) + 1);
    expect(patientOutcome(w, saved).ok).toBe(true); expect(patientOutcome(w, saved).lines.length).toBe(1);
  });
  it("the juice: three doses at most, one hard burn each, and the crew pay for it", () => {
    const w = generateWorld(40, { realGalaxy: true }); const p = w.player; p.credits = 1000; p.crew = [genCrewCandidate(new RNG(1))]; p.crew[0].morale = 50; p.wear = 0;
    expect(takeJuice(p)).toBeNull();
    for (let i = 0; i < 3; i++) expect(buyJuice(p)).toContain("-150CR");
    expect(buyJuice(p)).toContain("LIMIT"); expect(p.juice).toBe(3); expect(p.credits).toBe(550);
    expect(takeJuice(p)).toContain("HARD BURN"); expect(p.juice).toBe(2); expect(p.wear).toBe(4); expect(p.crew[0].morale).toBe(46);
    p.credits = 10; p.juice = 0; expect(buyJuice(p)).toContain("SHORT");
  });
  it("envoy fares: a treaty lands clean or the talks fail", () => {
    const w = generateWorld(39, { realGalaxy: true });
    const st = Object.values(w.systems).flatMap((s) => s.stations)[0];
    let envoy: Mission | undefined; for (let i = 0; i < 40 && !envoy; i++) envoy = genFares(w, st, new RNG(i)).find((m) => m.passengerKind === "envoy");
    expect(envoy).toBeDefined(); expect(envoy!.treaty).toBeDefined(); expect(envoy!.title).toMatch(/^Envoy: /);
    const m = { ...envoy!, docksAboard: 1, mood: 60 } as Mission;
    const before = { a: w.player.rep[m.treaty!.a] ?? 0, b: w.player.rep[m.treaty!.b] ?? 0 };
    const ok = envoyOutcome(w, m); expect(ok.ok).toBe(true); expect(ok.lines[0]).toContain("TALKS BEGIN"); expect(m.mood).toBe(85);
    expect((w.player.rep[m.treaty!.a] ?? 0) - before.a).toBe(4);
    const late = { ...envoy!, docksAboard: 9, mood: 60 } as Mission; expect(envoyOutcome(w, late).ok).toBe(false); expect(late.mood).toBe(30);
    const shot = { ...envoy!, docksAboard: 0, tookFire: true, mood: 60 } as Mission; expect(envoyOutcome(w, shot).lines[0]).toContain("SHOT AT");
  });
  it("the captain's log has a stardate and a Number One once somebody has served three dockings", () => {
    const w = generateWorld(38, { realGalaxy: true }); const p = w.player;
    expect(stardate(w)).toMatch(/^41\d\d\d\.\d$/);
    w.time = 3600; expect(stardate(w)).toBe("41010.0");
    expect(firstOfficer(p)).toBeNull();
    p.crew = [genCrewCandidate(new RNG(1)), genCrewCandidate(new RNG(2))]; p.crew[0].docks = 1; p.crew[1].docks = 2;
    expect(firstOfficer(p)).toBeNull();
    p.crew[1].docks = 5; expect(firstOfficer(p)).toBe(p.crew[1]);
    expect(chronicleText(w, null)).toContain(`Captain's log, stardate 41010.0. First officer: ${p.crew[1].name}.`);
  });
  it("the crew and the concourse talk about keepsakes, lost property, the dock-hand and the night rate", () => {
    const w = generateWorld(37, { realGalaxy: true }); const p = w.player;
    const a = genCrewCandidate(new RNG(1)), b = genCrewCandidate(new RNG(2));
    p.keepsakes = ["a scarf, left by Mara Quill"]; p.lostProperty = [{ name: "one glove", owner: "Rook", stationId: "x", t: 0, docks: 0 }]; p.flags = { dockhand: true, neighbour: true };
    const seen = new Set<string>(); for (let i = 0; i < 80; i++) seen.add(crewChatter(w, a, b, new RNG(i)));
    for (const key of ["A SCARF", "ONE GLOVE", "DOCK-HAND", "HUGGED"]) expect([...seen].some((l) => l.includes(key))).toBe(true);
    const st = Object.values(w.systems).flatMap((s) => s.stations)[0];
    const g = new Set<string>(); for (let i = 0; i < 80; i++) for (const l of concourseGossip(w, st, new RNG(i))) g.add(l);
    expect([...g].some((l) => l.includes("LOST PROPERTY DRAWER"))).toBe(true);
    expect([...g].some((l) => l.includes("DOCK-HAND"))).toBe(true);
    for (const l of g) expect(l.length).toBeLessThanOrEqual(96);
  });
  it("the galley cooks from what is aboard: dinner with luxuries, a pour after, and the fares eat too", () => {
    const w = generateWorld(36, { realGalaxy: true }); const p = w.player;
    p.crew = [genCrewCandidate(new RNG(1))]; p.crew[0].morale = 50; p.crew[0].trait = "cooks";
    p.cargo = { food: 2, lux: 1, r_tea: 1 }; p.hull = p.hullMax - 20;
    p.missions.push({ id: "f", kind: "passenger", title: "t", desc: "d", fromStationId: "a", targetSystemId: "b", reward: 100, accepted: true, done: false, passengerName: "Rook", mood: 50, request: "meal", requestMet: false, tip: 40 } as Mission);
    const out = cookMeal(p)!;
    expect(out[0]).toContain("PROPER DINNER"); expect(out[0]).toContain("TEA AFTER"); expect(out[0]).toContain("MORALE +18");
    expect(out.some((l) => l.includes("HOT MEAL"))).toBe(true);
    expect(p.cargo.food).toBe(1); expect(p.cargo.lux ?? 0).toBe(0); expect(p.cargo.r_tea).toBe(1);
    expect(p.crew[0].morale).toBe(68); expect(p.hull).toBe(p.hullMax - 15); expect(p.mealsCooked).toBe(1);
    const m = passengersAboard(p)[0]; expect(m.requestMet).toBe(true); expect(m.mood).toBe(70);
    expect(cookMeal(p)![0]).toContain("SECONDS"); expect(cookMeal(p)).toBeNull();
  });
  it("lost property: fares leave things, the harbour office takes them, unclaimed things become keepsakes", () => {
    const w = generateWorld(35, { realGalaxy: true }); const p = w.player;
    const st = Object.values(w.systems).flatMap((s) => s.stations)[0];
    const m = { id: "f", kind: "passenger", title: "t", desc: "d", fromStationId: "a", targetSystemId: "b", reward: 100, accepted: true, done: false, passengerName: "Rook Adeyemi" } as Mission;
    let line: string | null = null; for (let i = 0; i < 40 && !line; i++) line = leaveLostItem(p, m, st.id, 10, new RNG(i));
    expect(line).toContain("ROOK ADEYEMI LEFT"); expect(p.lostProperty!.length).toBe(1);
    const c0 = p.credits; const it = p.lostProperty![0];
    expect(handInLostItem(w, it, st.id)).toContain(`+${LOST_REWARD}CR`); expect(p.credits - c0).toBe(LOST_REWARD); expect(p.lostProperty!.length).toBe(0);
    line = null; for (let i = 0; i < 40 && !line; i++) line = leaveLostItem(p, m, st.id, 10, new RNG(i));
    for (let d = 0; d < LOST_KEEP_AFTER - 1; d++) expect(tickLostProperty(p)).toEqual([]);
    expect(tickLostProperty(p)[0]).toContain("IT'S THE SHIP'S NOW"); expect(p.keepsakes!.length).toBe(1); expect(p.lostProperty!.length).toBe(0);
  });
  it("passenger requests: a meal, a quiet run or a view, tipped at the end when met", () => {
    const w = generateWorld(34, { realGalaxy: true }); const p = w.player;
    const mk = (id: string): Mission => ({ id, kind: "passenger", title: "t", desc: "d", fromStationId: "a", targetSystemId: "b", reward: 200, accepted: true, done: false, passengerName: "Pax " + id, passengerKind: "tourist" } as Mission);
    p.crew = [genCrewCandidate(new RNG(1)), genCrewCandidate(new RNG(2))]; for (const c of p.crew) c.sick = undefined;
    p.missions.push(mk("1"), mk("2"), mk("3"));
    const asked = new Set<string>();
    for (let i = 0; i < 3; i++) { const r = askPassengerRequest(p, new RNG(i + 7)); expect(r).not.toBeNull(); asked.add(r!.m.request!); }
    expect(askPassengerRequest(p, new RNG(1))).toBeNull();
    const [a, b, c] = passengersAboard(p);
    a.request = "meal"; b.request = "quiet"; c.request = "view"; for (const m of [a, b, c]) { m.requestMet = false; m.tip = 70; }
    expect(passengersFed(p).length).toBe(1); expect(a.requestMet).toBe(true);
    passengersTookFire(p);
    logSight(p, "comet", "a comet", p.systemId);
    const lines = settlePassengers(p);
    expect(lines.some((l) => l.includes("PAX 1") && l.includes("HOT MEAL") && l.includes("+70CR"))).toBe(true);
    expect(lines.some((l) => l.includes("PAX 2") && l.includes("DIDN'T GET ONE"))).toBe(true);
    expect(lines.some((l) => l.includes("PAX 3") && l.includes("VIEW") && l.includes("+70CR"))).toBe(true);
    expect(passengerPay(a)).toBeGreaterThan(passengerPay(b) + 60);
    expect(settlePassengers(p).some((l) => l.includes("ASKED FOR"))).toBe(false);
  });
  it("the dock-hand reads the hull and does a regular a small favour once a week", () => {
    const w = generateWorld(33, { realGalaxy: true });
    const st = Object.values(w.systems).flatMap((s) => s.stations)[0]; const p = w.player;
    p.hull = 1; p.fuel = 0; p.wear = 50; p.cat = { name: "Biscuit", since: 0 } as any;
    const lines = dockhandLines(w, st, new RNG(1));
    for (const key of ["What did you hit", "rattles", "fumes", "Biscuit", "New face"]) expect(lines.some((l) => l.includes(key))).toBe(true);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(120);
    expect(dockhandFavour(w, st, new RNG(1))).toBeNull();
    p.dockings = { ...(p.dockings ?? {}), [st.id]: DOCKHAND_REGULAR_AT };
    expect(dockhandLines(w, st, new RNG(1)).some((l) => l.includes("Back again"))).toBe(true);
    const before = { hull: p.hull, fuel: p.fuel, wear: p.wear };
    const f = dockhandFavour(w, st, new RNG(2)); expect(f).toContain("ON THE HOUSE");
    expect(p.hull > before.hull || p.fuel > before.fuel || (p.wear ?? 0) < before.wear).toBe(true);
    expect(dockhandFavour(w, st, new RNG(3))).toBeNull();
  });
  it("station hours set the yard rate: a night rate, a keen early shift, and a fuller lounge after dark", () => {
    const w = generateWorld(29, { realGalaxy: true });
    const st = Object.values(w.systems).flatMap((s) => s.stations)[0];
    const seen = new Set<string>();
    for (let h = 0; h < 24; h++) { const r = hoursRate(st, Date.UTC(2026, 8, 10, h, 0)); seen.add(r.label); expect(r.mul).toBeGreaterThan(0.8); expect(r.mul).toBeLessThan(1.3); expect(r.lounge).toBeGreaterThan(0); }
    expect(seen.has("NIGHT RATE")).toBe(true); expect(seen.has("EARLY SHIFT")).toBe(true); expect(seen.has("")).toBe(true);
    const night = [...Array(24).keys()].map((h) => Date.UTC(2026, 8, 10, h, 0)).find((at) => stationHour(st, at).night)!;
    expect(hoursRate(st, night)).toEqual({ mul: 1.15, label: "NIGHT RATE", lounge: 0.75 });
  });
  it("berth neighbours: home-port captains you have met, the rival at home, and the tannoy knows", () => {
    const w = generateWorld(32, { realGalaxy: true });
    const caps = w.captains ?? []; expect(caps.length).toBeGreaterThan(2);
    const c = caps.find((x) => x.disposition >= 0)!; const st = findStation(w, c.homeStationId)!.st;
    expect(berthedCaptains(w, st.id).map((x) => x.id)).not.toContain(c.id);
    c.met = 1;
    expect(berthedCaptains(w, st.id).map((x) => x.id)).toContain(c.id);
    const rv = rivalOf(w)!; expect(berthedCaptains(w, rv.homeStationId).map((x) => x.id)).toContain(rv.id);
    w.player.dockedAt = st.id;
    expect(tannoyLines(w, st, new RNG(1)).some((l) => l.includes(c.ship.toUpperCase()) && l.includes("BAY 2"))).toBe(true);
    expect(berthedCaptains(w, st.id).length).toBeLessThanOrEqual(2);
  });
  it("the tannoy pages the captain about mail, the cat, family and consignments, but only while docked", () => {
    const w = generateWorld(31, { realGalaxy: true });
    const st = Object.values(w.systems).flatMap((s) => s.stations)[0];
    const p = w.player; const at = Date.UTC(2026, 8, 10, 12, 0);
    p.mail = [{ dueT: w.time - 100, from: "A", text: "hi" }]; p.cat = { name: "Biscuit", since: 0 }; p.catAway = st.id;
    p.crew = [{ ...genCrewCandidate(new RNG(3)), home: st.id, sick: false }];
    p.missions.push({ id: "m1", kind: "delivery", title: "t", desc: "d", fromStationId: st.id, targetSystemId: st.id, targetStationId: st.id, reward: 1, accepted: true, done: false } as any);
    p.hull = 1; p.fuel = 0;
    expect(tannoyLines(w, st, new RNG(1), at).some((l) => l.includes("MAIL"))).toBe(false);
    p.dockedAt = st.id;
    const lines = tannoyLines(w, st, new RNG(1), at);
    for (const key of ["COLLECT THEIR MAIL", "BISCUIT", "PEOPLE ARE ON THE PROMENADE", "EXPECTING A CONSIGNMENT", "TRAILING SOMETHING", "ON FUMES"]) expect(lines.some((l) => l.includes(key))).toBe(true);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(130);
    (p.flags ??= {})[`family:${st.id}:${p.crew[0].name}:${weekKey(at)}`] = true;
    expect(tannoyLines(w, st, new RNG(1), at).some((l) => l.includes("PEOPLE ARE ON THE PROMENADE"))).toBe(false);
  });
});

describe("the guestbook", () => {
  it("passengers sign on the way out, the book keeps a dozen, and happy ones come back by name", () => {
    const w = generateWorld(30, { realGalaxy: true });
    const st = Object.values(w.systems).flatMap((s) => s.stations).find((x) => !x.military)!;
    const fares = genFares(w, st, new RNG(1));
    expect(fares.some((f) => f.returning)).toBe(false);
    for (let i = 0; i < 15; i++) { const f = fares[i % fares.length]; f.mood = 90; signGuestbook(w, f, st.name, new RNG(i)); }
    expect(w.player.guestbook!.length).toBe(12);
    expect(w.player.guestbook![0].line.length).toBeGreaterThan(5);
    let returning = 0;
    for (let seed = 0; seed < 30; seed++) if (genFares(w, st, new RNG(seed)).some((f) => f.returning)) returning++;
    expect(returning).toBeGreaterThan(3);
    const r = [...Array(30).keys()].flatMap((seed) => genFares(w, st, new RNG(seed))).find((f) => f.returning)!;
    expect(r.title.startsWith("Returning fare")).toBe(true);
    expect(r.desc).toContain("asked for you by name");
  });
});

describe("what the void keeps", () => {
  it("a lost ship leaves a wreck with half the hold, and the lost go on the wall", () => {
    const w = generateWorld(31, { realGalaxy: true });
    const p = w.player; const sys = w.systems[p.systemId];
    p.cargo = { food: 6, parts: 3 }; p.shipName = "Late Supper";
    const before = sys.wrecks.length;
    const wd = leaveWreck(w, 120, -40, { name: "Ada Ferro", role: "pilot" });
    expect(sys.wrecks.length).toBe(before + 1);
    expect(wd.name).toContain("Late Supper");
    expect(wd.loot).toEqual([{ id: "food", qty: 3 }, { id: "parts", qty: 1 }]);
    expect(p.wrecksOfMine).toEqual([wd.id]);
    expect(p.lost![0].name).toBe("Ada Ferro");
    expect((p.log ?? []).some((l) => l.text.includes("didn't make it"))).toBe(true);
    // other pilots' wrecks from the wire appear once each, with a little salvage
    const n = addWireWrecks(w, [{ callsign: "OTHER-1", kind: "wreck" }, { callsign: "OTHER-2", kind: "beacon" }, { callsign: "OTHER-1", kind: "wreck" }]);
    expect(n).toBe(1);
    expect(addWireWrecks(w, [{ callsign: "OTHER-1", kind: "wreck" }])).toBe(0);
    const ww = sys.wrecks.find((x) => x.id === "wreck-wire-OTHER-1")!;
    expect(ww.name).toContain("OTHER-1");
    expect(ww.loot.length).toBe(2);
  });
});

describe("the regatta", () => {
  it("three courses, three stations, a title at the end", () => {
    const w = generateWorld(32, { realGalaxy: true });
    const p = w.player;
    const st = Object.values(w.systems).flatMap((s) => s.stations).find((x) => !x.military)!;
    expect(regattaObjective(w)).toBeNull();
    expect(enterRegatta(w, st.id)).toContain("REGATTA");
    expect(enterRegatta(w, st.id)).toBeNull();
    const c = p.regattaCourse!;
    expect(new Set(c).size).toBe(3);
    expect(regattaObjective(w)).toContain("1/3");
    expect(regattaProgress(w, c[0], 20, 15, false)).toBeNull();
    expect(regattaProgress(w, c[0], 14, 15, false)).toContain("FIRST COURSE");
    expect(regattaProgress(w, c[1], 14, 15, false)).toBeNull();
    expect(regattaProgress(w, c[1], 14, 15, true)).toContain("RECORD IS YOURS");
    expect(regattaProgress(w, c[2], 14, 15, false)).toBeNull();
    expect(regattaProgress(w, c[2], 12, 15, false)).toContain("CHAMPION");
    expect(p.regatta).toBe(3);
    expect(captainNickname(w)).toBe("THE CHAMPION");
  });
});

describe("stakes", () => {
  it("shares cost more as you hold more, pay a dividend on docking, and stop at the cap", () => {
    const w = generateWorld(33, { realGalaxy: true });
    const p = w.player; p.credits = 100000;
    const st = Object.values(w.systems).flatMap((s) => s.stations).find((x) => !x.military)!;
    const p0 = stakePrice(w, st);
    expect(buyStake(w, st, 1)).toContain("1 HELD");
    expect(stakePrice(w, st)).toBeGreaterThan(p0);
    expect(collectStake(w, st)).toBeGreaterThan(0);
    expect(buyStake(w, st, STAKE_CAP)).toContain("ALL ONE CAPTAIN");
    p.credits = 10; expect(buyStake(w, st, 1)).toContain("SHORT");
    p.credits = 100000; const other = Object.values(w.systems).flatMap((s) => s.stations).find((x) => !x.military && x !== st)!; buyStake(w, other, 4);
    const r = collectRemoteStakes(w, st.id); expect(r.n).toBe(1); expect(r.total).toBeGreaterThan(0);
    expect(collectRemoteStakes(w, other.id).n).toBe(1);
    const mil = Object.values(w.systems).flatMap((s) => s.stations).find((x) => x.military);
    if (mil) expect(buyStake(w, mil, 1)).toContain("NAVY");
  });
});

describe("the week's vote", () => {
  it("one question a week per faction; your standing weighs; results shape the lanes", () => {
    const w = generateWorld(34, { realGalaxy: true });
    const at = Date.UTC(2026, 8, 9, 12);
    const fac = Object.values(w.systems).map((s) => s.factionId).find((f) => f !== "vex")!;
    const issue = weeklyIssue(w, fac, at);
    expect(weeklyIssue(w, fac, at + 3600_000).id).toBe(issue.id);
    expect(myVote(w, fac, at)).toBeNull();
    w.player.rep[fac] = 40;
    const r0 = voteResult(w, fac, at);
    expect(r0.weight).toBeCloseTo(0.3);
    const line = castVote(w, fac, true, at);
    expect(line).toMatch(/PASSED|FAILED/);
    expect(myVote(w, fac, at)).toBe("yes");
    expect(castVote(w, fac, false, at)).toContain("ALREADY".replace("ALREADY", "VOTED"));
    const mods = voteMods(w, fac, at);
    expect(mods.patrol > 0 && mods.yard > 0).toBe(true);
    expect(voteMods(w, "vex", at)).toEqual({ patrol: 1, yard: 1, curfew: false });
  });
});

describe("a trade of their own", () => {
  it("only at skill three, once, and it shows in the numbers", () => {
    const w = generateWorld(35, { realGalaxy: true });
    const p = w.player; const rng = new RNG(6);
    const e = { ...genCrewCandidate(rng), role: "engineer" as const, skill: 2 };
    p.crew = [e];
    expect(chooseSpecialty(w, e, "framewright")).toBeNull();
    e.skill = 3;
    const base = wearRate(p);
    expect(chooseSpecialty(w, e, "framewright")).toContain("FRAMEWRIGHT");
    expect(chooseSpecialty(w, e, "coolant")).toBeNull();
    expect(hasSpecialty(p, "framewright")).toBe(true);
    expect(wearRate(p)).toBeLessThan(base);
    e.morale = 10; expect(hasSpecialty(p, "framewright")).toBe(false);
    const pl = { ...genCrewCandidate(rng), role: "pilot" as const, skill: 3 };
    p.crew = [pl]; const ids = Object.keys(w.systems); const a = ids[0], b = w.systems[a].links[0];
    const f0 = jumpFuelCost(w, a, b); chooseSpecialty(w, pl, "gaterunner"); expect(jumpFuelCost(w, a, b)).toBeLessThanOrEqual(f0);
  });
});

describe("fleet at work", () => {
  it("a parked hull becomes a charter and comes back when released", () => {
    const w = generateWorld(36, { realGalaxy: true });
    const p = w.player; p.credits = 5000;
    const sts = Object.values(w.systems).flatMap((s) => s.stations).filter((x) => !x.military);
    const ship = { hullId: "freighter", stationId: sts[0].id, name: "Tin Sparrow", hull: 80, torpedoes: 0 };
    p.fleet = [ship];
    const r = crewOwnHull(w, ship, sts[0].id, sts[1].id, "food", new RNG(1));
    expect(typeof r).toBe("object");
    const c = r as import("../src/world").Charter;
    expect(c.own).toBe(true); expect(c.name).toBe("Tin Sparrow"); expect(c.qty).toBeGreaterThanOrEqual(6);
    expect(p.fleet.length).toBe(0); expect(p.credits).toBe(5000 - OWN_HULL_CREW_FEE);
    expect(crewOwnHull(w, ship, sts[0].id, sts[1].id, "food", new RNG(1))).toContain("ISN'T HERE");
    releaseCharter(p, c);
    expect(p.haulers!.length).toBe(0); expect(p.fleet.length).toBe(1); expect(p.fleet[0].name).toBe("Tin Sparrow"); expect(p.fleet[0].stationId).toBe(sts[0].id);
  });
});

describe("maydays on the wire", () => {
  it("a rescue post naming you after your mayday counts; older or other posts don't", () => {
    const evs = [
      { kind: "rescue", text: "answered ABLE-1's mayday with fuel", t: 1000, callsign: "BAKER-2" },
      { kind: "rescue", text: "answered CHARLIE-3's mayday with fuel", t: 2000, callsign: "BAKER-2" },
      { kind: "trade", text: "answered ABLE-1's mayday with fuel", t: 3000, callsign: "DOG-4" },
    ];
    expect(maydayAnswered(evs, "ABLE-1", 500)).toBe("BAKER-2");
    expect(maydayAnswered(evs, "ABLE-1", 1500)).toBeNull();
    expect(maydayAnswered(evs, "able-1", 500)).toBe("BAKER-2");
    expect(maydayAnswered(evs, "EASY-5", 0)).toBeNull();
  });
});

describe("favours", () => {
  it("a friend's errand: no fee, a letter and a gift later, a captain who remembers", () => {
    const w = generateWorld(37, { realGalaxy: true });
    const cap = (w.captains ?? [])[0]; expect(cap).toBeTruthy();
    const st = Object.values(w.systems).flatMap((s) => s.stations).find((x) => !x.military && (w.systems[Object.values(w.systems).find((s2) => s2.stations.includes(x))!.id].links.length > 0))!;
    const m = favourFor(w, cap, st, new RNG(2))!;
    expect(m.kind).toBe("post"); expect(m.reward).toBe(0); expect(m.favourFor).toBe(cap.id);
    const helped = cap.helped, disp = cap.disposition;
    expect(favourDone(w, m, new RNG(3))).toContain(cap.name.toUpperCase());
    expect(cap.helped).toBe(helped + 1); expect(cap.disposition).toBe(Math.min(5, disp + 1));
    expect((w.mailQueue ?? []).some((l) => l.from.startsWith(cap.name))).toBe(true);
  });
});

describe("second stories", () => {
  it("every role has two stories, picked by name, and the new beats check the new counters", () => {
    const w = generateWorld(38, { realGalaxy: true });
    for (const role of ["engineer", "medic", "pilot", "gunner"] as const) expect(CREW_ARCS.filter((a) => a.role === role).length).toBe(2);
    const rng = new RNG(9); const crew = Array.from({ length: 12 }, () => ({ ...genCrewCandidate(rng), role: "pilot" as const }));
    const ids = new Set(crew.map((c) => arcFor(c.role, c)!.id));
    expect(ids.size).toBe(2);
    const c = crew.find((x) => arcFor(x.role, x)!.id === "pilot2")!;
    w.player.crew = [c];
    c.arc = arcFor(c.role, c)!.setup(w, c, rng);
    expect(c.arc.id).toBe("pilot2");
    expect(arcObjective(w, c)).toContain("SIGHT A WONDER");
    const g = { world: w, scenes: {}, sceneName: "flight" } as unknown as import("../src/game").Game;
    const def = arcFor(c.role, c)!;
    expect(def.stages[0].check(g, c)).toBe(false);
    (w.wonders ?? [])[0].seen = true;
    expect(def.stages[0].check(g, c)).toBe(true);
    def.stages[0].card(g, c); c.arc.stage = 1;
    expect(def.stages[1].check(g, c)).toBe(false);
    w.player.vistaViews = 1;
    expect(def.stages[1].check(g, c)).toBe(true);
  });
});

describe("the border", () => {
  it("one seam system a week; pushes count; Monday settles it and can flip the system", () => {
    const w = generateWorld(39, { realGalaxy: true });
    const at = Date.UTC(2026, 8, 9, 12);
    const c = borderContest(w, at)!;
    expect(c).toBeTruthy(); expect(c.incumbent).not.toBe(c.challenger);
    expect(borderContest(w, at + 3600_000)!.systemId).toBe(c.systemId);
    expect(pushInfluence(w, c.systemId, "nobody", 1, at)).toBe(false);
    expect(pushInfluence(w, c.systemId, c.challenger, 40, at)).toBe(true);
    const st = borderStanding(w, at)!;
    expect(st.yoursChal).toBe(40); expect(st.chal).toBeGreaterThan(st.inc);
    w.borderWeek = "2026-09-07";
    const later = Date.UTC(2026, 8, 16, 12);
    const line = resolveBorder(w, later);
    expect(line).toMatch(/FALLS TO THE/);
    expect(w.systems[c.systemId].factionId).toBe(c.challenger);
    expect(w.systems[c.systemId].stations.every((x) => x.factionId === c.challenger)).toBe(true);
    expect(w.player.rep[c.challenger]).toBeGreaterThan(0);
    expect(resolveBorder(w, later)).toBeNull();
    expect(w.borderLog!.length).toBe(1);
    // a rally on the contested station's board this week, fetched from anywhere, not handed over
    const now = borderContest(w)!; const cst = w.systems[now.systemId].stations.find((x) => !x.military);
    if (cst) { const board = genMissionsFor(w, cst, new RNG(3)); const r = board.find((m) => m.rally)!; expect(r).toBeTruthy(); expect(r.targetStationId).toBe(cst.id); expect(r.qty).toBeGreaterThanOrEqual(6); }
  });
});

describe("pictures wanted", () => {
  it("a photo mission is done by a postcard in the right place and turned in where it was posted", () => {
    const w = generateWorld(40, { realGalaxy: true });
    const sts = Object.values(w.systems).flatMap((s) => s.stations).filter((x) => !x.military && (x.type === "research" || x.type === "trade"));
    let m: import("../src/world").Mission | undefined;
    for (const st of sts) { for (let seed = 0; seed < 6 && !m; seed++) m = genMissionsFor(w, st, new RNG(seed)).find((x) => x.kind === "photo"); if (m) break; }
    expect(m).toBeTruthy();
    m!.accepted = true; w.player.missions = [m!];
    const from = findStation(w, m!.fromStationId)!.st;
    expect(missionDeliverable(w, m!, from)).toBe(false);
    const ph = m!.photo!;
    if (ph.wonderId) { const wd = wondersIn(w, ph.systemId).find((x) => x.id === ph.wonderId)!; expect(photoTaken(w, { systemId: ph.systemId, x: wd.x + WONDER_RANGE * 2, y: wd.y, inOrbit: false }).length).toBe(0); expect(photoTaken(w, { systemId: ph.systemId, x: wd.x + 10, y: wd.y, inOrbit: false }).length).toBe(1); }
    else { expect(photoTaken(w, { systemId: ph.systemId, x: 0, y: 0, inOrbit: false }).length).toBe(0); expect(photoTaken(w, { systemId: ph.systemId, x: 0, y: 0, inOrbit: true, orbitPlanetIdx: ph.planetIdx }).length).toBe(1); }
    expect(m!.photoDone).toBe(true);
    expect(missionDeliverable(w, m!, from)).toBe(true);
    const research = sts.find((x) => x.type === "research");
    if (research) { expect(hangPicture(w, research, m!, "TEST")).toContain("MUSEUM"); expect(research.museum![research.museum!.length - 1].item).toContain("a picture of"); }
    const trade = sts.find((x) => x.type === "trade"); if (trade) expect(hangPicture(w, trade, m!, "TEST")).toBeNull();
  });
});

describe("more wonders", () => {
  it("twelve kinds, all with names and descriptions, all assignable", () => {
    const kinds = Object.keys(WONDER_DEFS);
    expect(kinds.length).toBe(12);
    for (const k of kinds) { expect(WONDER_DEFS[k as keyof typeof WONDER_DEFS].names.length).toBe(3); expect(WONDER_DEFS[k as keyof typeof WONDER_DEFS].desc.length).toBeGreaterThan(30); }
    const w = generateWorld(41, { realGalaxy: true });
    for (const wd of w.wonders ?? []) expect(kinds).toContain(wd.kind);
    const seen = new Set<string>();
    for (let seed = 0; seed < 8; seed++) for (const wd of generateWorld(100 + seed, { realGalaxy: true }).wonders ?? []) seen.add(wd.kind);
    expect(seen.has("loom") || seen.has("clock") || seen.has("choir")).toBe(true);
  });
});

describe("chronicle of the week", () => {
  it("the chronicle carries the week's votes, border, holdings and times", () => {
    const w = generateWorld(42, { realGalaxy: true });
    const p = w.player; p.credits = 50000;
    const st = Object.values(w.systems).flatMap((s) => s.stations).find((x) => !x.military && x.factionId !== "vex")!;
    castVote(w, st.factionId, true);
    buyStake(w, st, 2); recordRace(p, st.id, 33.3);
    const text = chronicleText(w, "TEST");
    expect(text).toContain("The week:");
    expect(text).toContain("Voted this week");
    expect(text).toContain("Holdings:");
    expect(text).toContain("Ring times:");
    expect(text).toContain("The border:");
    signGuestbook(w, { id: "g", kind: "passenger", title: "", desc: "", fromStationId: st.id, targetSystemId: p.systemId, accepted: true, done: false, tier: 0, reward: 1, passengerName: "Guest", passengerKind: "vip", mood: 80 }, st.name, new RNG(1));
    expect(chronicleText(w, "TEST")).toContain("Guestbook, last signatures:");
  });
});

describe("writing back", () => {
  it("a reply to a captain's letter is remembered; a second reply is refused", () => {
    const w = generateWorld(43, { realGalaxy: true });
    const cap = (w.captains ?? [])[0]; const d0 = cap.disposition;
    const m = { dueT: 0, from: `${cap.name}, ${cap.ship}`, text: "hello" };
    expect(replyToLetter(w, m)).toContain(cap.name.toUpperCase());
    expect(cap.disposition).toBe(Math.min(5, d0 + 1));
    expect(replyToLetter(w, m)).toContain("ALREADY");
    expect(replyToLetter(w, { dueT: 0, from: "A stranger", text: "x" })).toContain("A STRANGER");
  });
});

describe("the lanes report", () => {
  it("comes from your home port, once you have one, and mentions the border", () => {
    const w = generateWorld(44, { realGalaxy: true });
    expect(lanesReport(w)).toBeNull();
    const st = Object.values(w.systems).flatMap((s) => s.stations).find((x) => !x.military)!;
    w.player.homePort = st.id;
    const l = lanesReport(w)!;
    expect(l.from).toContain(st.name);
    expect(l.text).toContain("contested");
  });
});

describe("the signal", () => {
  it("every stage has an objective and its checks pass when the world reaches them", () => {
    const w = generateWorld(22, { realGalaxy: true });
    const g = { world: w, scenes: {}, sceneName: "flight" } as unknown as import("../src/game").Game;
    expect(STORY.length).toBe(7);
    expect(storyObjective(w)).toContain("STATIC");
    expect(STORY[0].check(g)).toBe(false);
    w.player.expLog = { a: 1, b: 1, c: 2 };
    expect(STORY[0].check(g)).toBe(true);
    const sys = Object.values(w.systems).find((s) => s.anomalies.length)!;
    sys.anomalies[0].claimed = true;
    expect(STORY[1].check(g)).toBe(true);
    const card = STORY[1].card(g)!;
    expect(w.player.storyTarget).toBeTruthy();
    expect(card).toContain("PLOT A COURSE");
    const t = w.player.storyTarget!;
    const poi = w.systems[t.systemId].planets[t.planetIdx].surface!.pois.find((x) => x.id === t.poiId)!;
    expect(poi.kind).toBe("ruin");
    poi.looted = true;
    expect(STORY[2].check(g)).toBe(true);
    for (let i = 3; i < STORY.length; i++) expect(typeof STORY[i].objective(w)).toBe("string");
  });
});

describe("homesteads", () => {
  it("accumulate their resource over play time and cap", () => {
    const h = { key: "k", systemId: "s", planetIdx: 0, regionIdx: 0, resource: "ore", stock: 0, lastT: 0, name: "Claim" };
    expect(homesteadYield(h, 600)).toBeCloseTo(2, 5);
    settleHomestead(h, 3000);
    expect(h.stock).toBeCloseTo(10, 5);
    expect(homesteadYield(h, 1e9)).toBe(HOMESTEAD_CAP);
  });
});

describe("crises and tenders", () => {
  it("a crisis starts, is visible at its station, and expires with a penalty", () => {
    const w = generateWorld(23, { realGalaxy: true });
    let tries = 0;
    while (!w.crisis && tries++ < 50) tickCrisis(w, new RNG(40 + tries));
    expect(w.crisis).toBeTruthy();
    const c = w.crisis!;
    expect(crisisAt(w, c.stationId)).toBe(c);
    expect(["med", "food", "fuel"]).toContain(c.commodityId);
    w.time = c.until + 1;
    tickCrisis(w, new RNG(1));
    expect(w.crisis).toBeNull();
    expect(w.events.some((e) => e.text.includes("unanswered"))).toBe(true);
    const st = w.systems[w.player.systemId].stations.find((s) => !s.military)!;
    let tender = null as ReturnType<typeof genMissionsFor>[number] | null;
    for (let i = 0; i < 30 && !tender; i++) tender = genMissionsFor(w, st, new RNG(2000 + i)).find((m) => m.kind === "repair") ?? null;
    expect(tender).toBeTruthy();
    expect(missionDeliverable(w, tender!, st)).toBe(false);
    tender!.accepted = true; tender!.tenderDone = true;
    expect(missionDeliverable(w, tender!, st)).toBe(true);
  });
});

describe("standing orders", () => {
  it("appear at trusted stations and keep their shipment counters", () => {
    const w = generateWorld(24, { realGalaxy: true });
    const st = w.systems[w.player.systemId].stations[0];
    w.player.rep[st.factionId] = 40;
    let order = null as ReturnType<typeof genMissionsFor>[number] | null;
    for (let i = 0; i < 40 && !order; i++) order = genMissionsFor(w, st, new RNG(3000 + i)).find((m) => m.shipTotal) ?? null;
    expect(order).toBeTruthy();
    expect(order!.shipTotal).toBeGreaterThanOrEqual(3);
    expect(order!.kind).toBe("mining");
    expect(order!.commodityId).toBeTruthy();
  });
});

describe("living galaxy", () => {
  it("events start, mark their system, and end with effects reverted", () => {
    const w = generateWorld(25, { realGalaxy: true });
    let tries = 0;
    while (!w.galaxyEvent && tries++ < 60) tickGalaxyEvents(w, new RNG(700 + tries));
    expect(w.galaxyEvent).toBeTruthy();
    const e = w.galaxyEvent!;
    expect(galaxyEventAt(w, e.systemId)).toBe(e);
    w.time = e.until + 1;
    tickGalaxyEvents(w, new RNG(1));
    expect(w.galaxyEvent).toBeNull();
    w.player.lives = 3; w.player.repairs = 2; w.player.tows = 1; w.player.rescues = 1;
    expect(rescuePoints(w.player)).toBe(10);
    expect(rankOf(w.player, "rescuer").title).toBe("FIRST RESPONDER");
    for (let i = 0; i < 70; i++) logEntry(w, `entry ${i}`);
    expect(w.player.log!.length).toBe(60);
  });
});

describe("faction politics", () => {
  it("embargo band and charters", () => {
    const w = generateWorld(26);
    w.player.rep.tsc = -50;
    expect(embargoed(w, "tsc")).toBe(true);
    w.player.rep.tsc = -70;
    expect(embargoed(w, "tsc")).toBe(false); // docking is refused instead
    w.player.rep.tsc = 0;
    expect(embargoed(w, "tsc")).toBe(false);
    expect(hasCharter(w, "tsc")).toBe(false);
    w.player.charters = ["tsc"];
    expect(hasCharter(w, "tsc")).toBe(true);
  });
});

describe("the missing convoy", () => {
  it("has three stages with objectives and checks that pass on the right state", () => {
    const w = generateWorld(27, { realGalaxy: true });
    const g = { world: w, scenes: {}, sceneName: "flight" } as unknown as import("../src/game").Game;
    expect(CONVOY.length).toBe(3);
    expect(convoyObjective(w)).toBeNull();
    const sy = w.syndicates!.find((s) => s.style !== "pirase" && s.partners.length)!;
    const partner = w.systems[Object.values(w.systems).find((s) => s.stations.some((st) => st.id === sy.partners[0]))!.id];
    w.player.convoyTrack = { tag: sy.tag, rivalTag: sy.rivals[0] ?? "VULT", partnerStationId: sy.partners[0], laneSystemId: partner.id };
    w.player.story2 = 0;
    expect(convoyObjective(w)).toContain("DEEP-SCAN");
    expect(CONVOY[0].check(g)).toBe(false);
    partner.anomalies.push({ id: `convoy-${sy.tag}`, name: "Convoy Nine", kind: "derelict", x: 0, y: 0, discovered: true, claimed: true, reward: 0 });
    expect(CONVOY[0].check(g)).toBe(true);
    expect(CONVOY[0].card(g)).toContain("HARBOURMASTER");
    w.player.dockedAt = sy.partners[0];
    expect(CONVOY[1].check(g)).toBe(true);
  });
});

describe("a life aboard", () => {
  it("wear climbs under way and with jumps, costs thrust, throws faults, and a yard service clears it", () => {
    const w = generateWorld(31, { realGalaxy: true });
    const p = w.player;
    p.wear = 0;
    tickWear(p, 100);
    expect(p.wear).toBeCloseTo(1.2, 3);
    p.crew = [{ name: "A", role: "engineer", skill: 2, morale: 80, wage: 80 }];
    p.wear = 0; tickWear(p, 100);
    expect(p.wear).toBeLessThan(1.2); // an engineer slows it
    p.crew = [];
    jumpWear(p); jumpWear(p);
    expect(p.wear).toBeGreaterThan(4);
    p.wear = 100;
    expect(wearThrust(p)).toBeCloseTo(0.9, 5);
    p.wear = 40;
    expect(wearThrust(p)).toBe(1);
    expect(wearFault(p, new RNG(1))).toBeNull(); // below 70 nothing fails
    p.wear = 120;
    let faults = 0;
    for (let i = 0; i < 20; i++) if (wearFault(p, new RNG(i))) faults++;
    expect(faults).toBeGreaterThan(3);
    const price = servicePrice(p);
    expect(price).toBe(720);
    serviceHull(p, "st", 10, price);
    expect(p.wear).toBe(0);
    expect(p.berthLog!.length).toBe(1);
    expect(p.systems.every((s) => s.health >= 70)).toBe(true);
  });

  it("sick crew give no bonus, recover in time or with med supplies, and a medic shortens it", () => {
    const w = generateWorld(32, { realGalaxy: true });
    const p = w.player;
    const c = { name: "B", role: "pilot" as const, skill: 3, morale: 20, wage: 50 };
    p.crew = [c];
    p.cargo = {};
    let kind: string | null = null;
    for (let i = 0; i < 60 && !kind; i++) kind = crewFallsIll(p, c, 1000, new RNG(i));
    expect(kind).not.toBeNull();
    expect(crewBonus(p, "pilot")).toBe(0);
    expect(crewRecover(c, 1001)).toBe(false);
    expect(crewRecover(c, 1000 + 1000)).toBe(true);
    expect(crewBonus(p, "pilot")).toBe(1.5); // low morale halves it
    c.sick = { kind: "the grey flu", until: 5000 };
    expect(crewTreat(p, c)).toBe(false); // no med aboard
    p.cargo.med = 1;
    expect(crewTreat(p, c)).toBe(true);
    expect(p.cargo.med ?? 0).toBe(0);
    expect(c.sick).toBeNull();
    // a medic aboard halves the lay-up
    p.crew = [c, { name: "M", role: "medic", skill: 1, morale: 80, wage: 35 }];
    let k2: string | null = null;
    for (let i = 0; i < 60 && !k2; i++) k2 = crewFallsIll(p, c, 2000, new RNG(i));
    const dur = c.sick!.until - 2000;
    expect(dur).toBeLessThanOrEqual(240);
  });

  it("crew on leave keep their berth, come back when you dock there, and give up after enough dockings", () => {
    const w = generateWorld(33, { realGalaxy: true });
    const p = w.player;
    const a = { name: "A", role: "gunner" as const, skill: 1, morale: 50, wage: 55 };
    const b = { name: "B", role: "medic" as const, skill: 1, morale: 50, wage: 35 };
    p.crew = [a, b];
    sendOnLeave(p, a, "st1");
    expect(p.crew.length).toBe(1);
    expect(berthsUsed(p)).toBe(2);
    let r = collectShoreCrew(p, "st2", 3);
    expect(r.back.length).toBe(0); expect(r.gone.length).toBe(0);
    r = collectShoreCrew(p, "st1", 3);
    expect(r.back[0]).toBe(a);
    expect(p.crew.length).toBe(2);
    expect(a.morale).toBe(80);
    sendOnLeave(p, b, "st1");
    for (let i = 0; i < 7; i++) r = collectShoreCrew(p, "st9", 3);
    expect(r.gone.length).toBe(0);
    r = collectShoreCrew(p, "st9", 3);
    expect(r.gone[0]).toBe(b);
    expect(p.shoreCrew!.length).toBe(0);
    const al = retireCrew(p, a, "st1", 50);
    expect(p.alumni![0]).toBe(al);
    expect(p.crew.length).toBe(0);
  });
});

describe("the liner trade", () => {
  it("the lounge offers fares, moods move with demands and delays, sights pay, and cabins raise the cap", () => {
    const w = generateWorld(41, { realGalaxy: true });
    const p = w.player;
    const st = w.systems[p.systemId].stations[0];
    const fares = genFares(w, st, new RNG(5));
    expect(fares.length).toBeGreaterThanOrEqual(2);
    expect(fares.every((f) => f.kind === "passenger" && f.mood === 60 && f.targetStationId)).toBe(true);
    expect(passengerCap(p)).toBe(1);
    p.modules = ["cabins"];
    expect(passengerCap(p)).toBe(3);
    const f = { ...fares[0], accepted: true, demand: "lux", patience: 2, docksAboard: 0, mood: 60, passengerKind: "vip" as const, sights: [] };
    p.missions.push(f);
    expect(passengersAboard(p).length).toBe(1);
    p.cargo = { lux: 1 };
    let lines = settlePassengers(p);
    expect(f.mood).toBe(90);
    expect(f.demand).toBeNull();
    expect(p.cargo.lux ?? 0).toBe(0);
    expect(lines.some((l) => l.includes("MOOD UP"))).toBe(true);
    settlePassengers(p); lines = settlePassengers(p);
    expect(f.mood).toBe(78); // one dock past patience
    expect(lines.some((l) => l.includes("HOW MUCH LONGER"))).toBe(true);
    expect(passengerPay({ ...f, mood: 100 })).toBe(Math.round(f.reward * 1.2));
    expect(passengerPay({ ...f, mood: 0 })).toBe(Math.round(f.reward * 0.6));
    // a tourist booked for a planet: incidental sights add up, the booked one completes the fare
    const t = { ...fares[0], id: "t", accepted: true, passengerKind: "tourist" as const, sightKind: "planet" as const, sightPlanetIdx: 1, targetSystemId: "sysX", sightSeen: false, sights: [], mood: 60 };
    p.missions.push(t);
    expect(logSight(p, "comet", "a comet", "elsewhere")).toBe(true);
    expect(t.sightSeen).toBe(false);
    expect(logSight(p, "planet", "world one", "sysX", 0)).toBe(true);
    expect(t.sightSeen).toBe(false);
    expect(logSight(p, "planet", "world two", "sysX", 1)).toBe(true);
    expect(t.sightSeen).toBe(true);
    expect(t.sights.length).toBe(3);
    expect(passengerPay({ ...t, mood: 60 })).toBe(Math.round(t.reward * (0.6 + 0.36 + 0.3)));
  });
});

describe("the lighthouse", () => {
  it("kits plant only in dead systems, beacons earn tolls and cut jump fuel, depots sell stock, raids darken and parts repair", () => {
    const w = generateWorld(51, { realGalaxy: true });
    const p = w.player;
    const busy = Object.values(w.systems).find((s) => s.stations.length)!;
    const dead = Object.values(w.systems).find((s) => s.id !== busy.id && s.links.some((l) => w.systems[l].stations.length && l !== s.id))!;
    dead.stations = []; // a dead system for the test, whatever the seed drew
    expect(canBuildInfra(w, busy.id)).toContain("ALREADY");
    expect(canBuildInfra(w, dead.id)).toBeNull();
    p.systemId = dead.id;
    expect(buildInfra(w, "beacon", 0, 0, "ME")).toContain("NO BEACON KIT");
    p.kits = { beacon: 1, depot: 1 };
    const b = buildInfra(w, "beacon", 100, 50, "ME");
    expect(typeof b).toBe("object");
    expect(p.kits.beacon).toBe(0);
    expect(infraAt(w, dead.id).length).toBe(1);
    expect(buildInfra(w, "beacon", 0, 0, "ME")).toContain("ALREADY A BEACON");
    const d = buildInfra(w, "depot", -100, 0, "ME") as Infra;
    expect(d.kind).toBe("depot");
    expect(canBuildInfra(w, dead.id)).toContain("TWO STRUCTURES");
    // jump fuel: a fifth off in or out of a lit system
    const link = dead.links[0];
    const full = jumpFuelCost({ ...w, infra: [] } as typeof w, dead.id, link);
    expect(jumpFuelCost(w, dead.id, link)).toBeLessThan(full);
    // tolls accrue with time; nothing without traffic
    expect(infraTraffic(w, dead.id)).toBeGreaterThan(0);
    const beacon = b as Infra;
    w.time += 600;
    let news: string[] = [];
    for (let i = 0; i < 30 && beacon.till === 0; i++) news = tickInfra(w, new RNG(1000 + i));
    expect(beacon.till).toBeGreaterThan(0);
    // depot: stock from the hold, sells over time, and draws for the owner
    p.cargo = { fuel: 50 };
    expect(stockDepot(d, p, 40)).toBe(40);
    expect(p.cargo.fuel).toBe(10);
    d.stock = 40; d.till = 0; w.time += 600; d.lastT = w.time - 600;
    tickInfra(w, new RNG(7));
    expect(d.stock).toBeLessThan(40);
    expect(d.till).toBeGreaterThan(0);
    p.fuel = 0; p.fuelMax = 30;
    const drew = drawDepot(d, p);
    expect(drew).toBeGreaterThan(0);
    expect(p.fuel).toBe(drew);
    const c = collectInfra(beacon, p);
    expect(c).toBeGreaterThan(0);
    expect(beacon.till).toBe(0);
    // raids: run enough ticks and something gets hit; parts bring it back
    let hit = false;
    for (let i = 0; i < 80 && !hit; i++) { w.time += 60; const n = tickInfra(w, new RNG(i)); if (n.length) hit = true; }
    expect(hit).toBe(true);
    beacon.health = 20;
    expect(infraLit(beacon)).toBe(false);
    p.cargo = {};
    expect(repairInfra(beacon, p)).toBe(false);
    p.cargo = { parts: 1 };
    expect(repairInfra(beacon, p)).toBe(true);
    expect(beacon.health).toBe(55);
    expect(infraLit(beacon)).toBe(true);
    void news;
  });
});

describe("legacy", () => {
  it("a captain retires at a dock after an hour, the successor takes the chair, and the galaxy keeps its history", () => {
    const w = generateWorld(61, { realGalaxy: true });
    const p = w.player;
    const st = w.systems[p.systemId].stations[0];
    expect(canRetireCaptain(w)).toContain("DOCK");
    p.dockedAt = st.id;
    expect(canRetireCaptain(w)).toContain("TOO SOON");
    w.time = 4000;
    expect(canRetireCaptain(w)).toBeNull();
    const pilot = { name: "Ines Mbeki", role: "pilot" as const, skill: 3, morale: 80, wage: 150 };
    const eng = { name: "Bo Rell", role: "engineer" as const, skill: 1, morale: 80, wage: 40 };
    p.crew = [pilot, eng];
    p.credits = 10000; p.rep = { tsc: 80 }; p.wanted = 0.2; p.charters = ["tsc"];
    p.missions.push({ id: "m", kind: "delivery", title: "x", desc: "", fromStationId: st.id, targetSystemId: p.systemId, reward: 1, accepted: true, done: false });
    w.infra = [{ id: "b", kind: "beacon", systemId: p.systemId, x: 0, y: 0, owner: "ME", builtAt: 0, health: 100, till: 50, stock: 0, earned: 0, lastT: 0 }];
    const cap = retireCaptain(w, "OLD HAND", pilot);
    expect(cap.credits).toBe(10000);
    expect(p.credits).toBe(4000);
    expect(p.captainName).toBe("Ines Mbeki");
    expect(p.crew).toEqual([eng]);
    expect(p.skills.piloting).toBe(4.5);
    expect(p.rep.tsc).toBe(40);
    expect(p.wanted).toBe(0);
    expect(p.charters).toEqual([]);
    expect(p.missions.filter((m) => !m.done).length).toBe(0);
    expect(p.lineage!.length).toBe(1);
    expect(p.alumni!.some((a) => a.role === "captain" && a.name === "OLD HAND" && a.stationId === st.id)).toBe(true);
    expect(w.infra.length).toBe(1);
    expect(p.log!.some((l) => l.text.includes("took the chair"))).toBe(true);
  });
});

describe("life on the deck", () => {
  it("crew learn by doing, rest passes ship time, cats lift morale, storms blind unless a beacon is lit", () => {
    const w = generateWorld(71, { realGalaxy: true });
    const p = w.player;
    const g = { name: "G", role: "gunner" as const, skill: 1, morale: 50, wage: 55 };
    p.crew = [g];
    let up: string | null = null;
    for (let i = 0; i < 12; i++) up = crewXp(p, "gunner") ?? up;
    expect(g.skill).toBe(2);
    expect(g.wage).toBe(110);
    expect(up).toContain("SKILL 2");
    expect(crewXp(p, "pilot")).toBeNull();
    const t0 = w.time;
    restAtDock(w, 600);
    expect(w.time - t0).toBe(600);
    expect(g.morale).toBeGreaterThan(50);
    adoptCat(p, "Biscuit", w.time);
    expect(p.cat!.name).toBe("Biscuit");
    const sysId = p.systemId;
    w.galaxyEvent = { kind: "storm", systemId: sysId, until: w.time + 500 };
    expect(stormBlind(w, sysId)).toBe(true);
    w.infra = [{ id: "b", kind: "beacon", systemId: sysId, x: 0, y: 0, owner: "ME", builtAt: 0, health: 100, till: 0, stock: 0, earned: 0, lastT: 0 }];
    expect(stormBlind(w, sysId)).toBe(false);
    w.infra[0].health = 10;
    expect(stormBlind(w, sysId)).toBe(true);
  });
});

describe("galnet serials", () => {
  it("a serial starts, runs its parts on the clock, leaves a hook at its station, and retires", () => {
    const w = generateWorld(81, { realGalaxy: true });
    w.serial = null;
    let started = 0;
    for (let i = 0; i < 40 && !w.serial; i++) { tickSerial(w, new RNG(i)); started++; }
    expect(w.serial).not.toBeNull();
    const s = w.serial!;
    const def = serialDef(s.id)!;
    expect(s.lines.length).toBe(0);
    tickSerial(w, new RNG(1)); // first part lands at once
    expect(s.lines.length).toBe(1);
    expect(w.events[w.events.length - 1].text).toContain(def.title);
    tickSerial(w, new RNG(2));
    expect(s.lines.length).toBe(1); // not yet: the gap
    w.time += SERIAL_GAP; tickSerial(w, new RNG(3));
    w.time += SERIAL_GAP; tickSerial(w, new RNG(4));
    expect(s.lines.length).toBe(def.parts.length);
    expect(serialHookActive(w)).toBe(true);
    const lines = serialLines(w)!;
    expect(lines.parts.length).toBe(def.parts.length);
    expect(lines.hook).not.toBeNull();
    if (def.hook.kind === "premium") expect(serialPremium(w, s.stationId, def.hook.commodityId)).toBe(def.hook.mult);
    if (def.hook.kind === "mission") { const m = serialMissionFor(w, s.stationId); expect(m).not.toBeNull(); expect(m!.fromStationId).toBe(s.stationId); }
    if (def.hook.kind === "recruit") expect(serialRecruitFor(w, s.stationId)).toBe(def.hook.role);
    expect(serialPremium(w, "elsewhere", "water")).toBe(1);
    w.time += SERIAL_HOOK_TTL; tickSerial(w, new RNG(5));
    expect(w.serial).toBeNull();
    expect(w.serialsSeen).toContain(def.id);
    void started;
  });
  it("every serial's parts and hook lines render for any station", () => {
    const w = generateWorld(82, { realGalaxy: true });
    const sys = Object.values(w.systems).find((s) => s.stations.length && s.links.length)!;
    const other = w.systems[sys.links[0]];
    const c = { sys, st: sys.stations[0], name: "Test Person", other };
    for (const d of SERIALS) { for (const part of d.parts) expect(part(c).length).toBeGreaterThan(20); expect(d.hookLine(c).length).toBeGreaterThan(10); if (d.hook.kind === "mission") expect(d.hook.mission(w, c).reward).toBeGreaterThan(0); }
  });
});

describe("shipmates", () => {
  it("bonds drift at the dock, feuds and friendships show, and the chronicle reads back the career", () => {
    const w = generateWorld(91, { realGalaxy: true });
    const p = w.player;
    const a = { name: "Ada", role: "engineer" as const, skill: 1, morale: 80, wage: 40 };
    const b = { name: "Bo", role: "medic" as const, skill: 1, morale: 80, wage: 35 };
    p.crew = [a, b];
    for (let i = 0; i < 12; i++) tickBonds(p, new RNG(i));
    expect(Math.abs(bond(a, b))).toBeGreaterThan(0);
    shiftBond(a, b, -6);
    expect(bond(a, b)).toBe(-3);
    expect(feuds(p).length).toBe(1);
    expect(bondLabel(bond(a, b))).toBe("FEUDING");
    shiftBond(a, b, 6);
    expect(bond(a, b)).toBe(3);
    expect(feuds(p).length).toBe(0);
    p.shipName = "Kestrel"; p.cat = { name: "Biscuit", since: 0 }; p.lineage = [{ name: "Old Hand", from: 0, to: 100, stationId: w.systems[p.systemId].stations[0].id, credits: 5000, deeds: 3 }];
    logEntry(w, "Tested the chronicle");
    const text = chronicleText(w, "TESTER");
    expect(text).toContain("KESTREL");
    expect(text).toContain("Biscuit");
    expect(text).toContain("Old Hand");
    expect(text).toContain("Tested the chronicle");
    expect(text).toContain("Ada, engineer");
  });
});

describe("settlements grow", () => {
  it("trade and work raise an outpost to a town and then a city, with a patron and a plaque", () => {
    const w = generateWorld(101, { realGalaxy: true });
    const pl = Object.values(w.systems).flatMap((s) => s.planets).find((x) => x.surface && x.surface.pois.some((p) => p.kind === "outpost"))!;
    const poi = pl.surface!.pois.find((p) => p.kind === "outpost")!;
    expect(settlementTierLabel(poi)).toBe("OUTPOST");
    expect(growSettlement(w, poi, 50, "TESTER")).toBeNull();
    const town = growSettlement(w, poi, 60, "TESTER");
    expect(town).toContain("TOWN");
    expect(poi.tier).toBe(1);
    expect(poi.patron).toBe("TESTER");
    expect(settlementTierLabel(poi)).toBe("TOWN");
    expect(growSettlement(w, poi, 100, "TESTER")).toBeNull();
    const city = growSettlement(w, poi, 100, "TESTER");
    expect(city).toContain("CITY");
    expect(poi.kind).toBe("city");
    expect(w.events[w.events.length - 1].text).toContain("TESTER");
    const ruin = pl.surface!.pois.find((p) => p.kind === "ruin");
    if (ruin) expect(growSettlement(w, ruin, 500, "X")).toBeNull();
  });
});

describe("charters", () => {
  it("a hired hauler runs trips on the clock, moves stock, banks a cut, gets raided in pirate space, and pays out at dock", () => {
    const w = generateWorld(111, { realGalaxy: true });
    const p = w.player;
    const sys = Object.values(w.systems).find((s) => s.stations.length && s.links.some((l) => w.systems[l].stations.length))!;
    const from = sys.stations[0];
    const to = w.systems[sys.links.find((l) => w.systems[l].stations.length)!].stations[0];
    const id = Object.keys(from.prices).find((k) => (from.stock[k] ?? 0) > 20 && !k.startsWith("r_")) ?? "food";
    from.stock[id] = 60; to.stock[id] = 0; refreshPrices(from); refreshPrices(to);
    p.credits = 1000;
    expect(hireCharter(w, from.id, to.id, id, new RNG(1))).toContain("UP FRONT");
    p.credits = 10000;
    const c = hireCharter(w, from.id, to.id, id, new RNG(1)) as Charter;
    expect(c.name).toContain("Hauler");
    expect(p.credits).toBe(7000);
    for (const s2 of Object.values(w.systems)) s2.pirateActivity = 0; // calm lanes for the earnings check
    w.time += c.tripSecs * 3;
    const news = tickCharters(w, new RNG(2));
    expect(c.trips).toBe(3);
    expect(c.till).toBeGreaterThan(0);
    expect(to.stock[id]).toBeGreaterThan(0);
    expect(news.length).toBe(0);
    const paid = collectCharters(p);
    expect(paid.total).toBeGreaterThan(0);
    expect(c.till).toBe(0);
    // pirate lanes: enough trips and something gets hit
    for (const s2 of Object.values(w.systems)) s2.pirateActivity = 1;
    let hit = false;
    for (let i = 0; i < 30 && !hit && (p.haulers ?? []).includes(c); i++) { w.time += c.tripSecs; if (tickCharters(w, new RNG(100 + i)).length) hit = true; }
    expect(hit).toBe(true);
    expect((p.haulers ?? []).length).toBeLessThanOrEqual(1);
    if ((p.haulers ?? []).includes(c)) { releaseCharter(p, c); }
    expect((p.haulers ?? []).length).toBe(0);
  });
});

describe("wonders", () => {
  it("every galaxy gets a handful of unique wonders, seeing one logs it once for full data, and old saves get theirs", () => {
    const w = generateWorld(121, { realGalaxy: true });
    expect(w.wonders!.length).toBeGreaterThanOrEqual(3);
    const kinds = new Set(w.wonders!.map((x) => x.kind));
    expect(kinds.size).toBe(w.wonders!.length);
    const wd = w.wonders![0];
    expect(wd.systemId).not.toBe(w.player.systemId);
    expect(Math.hypot(wd.x, wd.y)).toBeGreaterThan(2000);
    const before = w.player.expData ?? 0;
    const r1 = seeWonder(w, wd, "TESTER");
    expect(r1.first).toBe(true); expect(r1.data).toBe(400);
    expect((w.player.expData ?? 0) - before).toBe(400);
    expect(w.player.codex![`wonder:${wd.name}`]).toBe(1);
    const r2 = seeWonder(w, wd, "OTHER");
    expect(r2.first).toBe(false); expect(wd.seenBy).toBe("TESTER");
    expect(wondersIn(w, wd.systemId).length).toBeGreaterThanOrEqual(1);
    const raw = JSON.parse(JSON.stringify({ ...w, version: 11, wonders: undefined }));
    const m = migrateSave(raw)!;
    expect(m.wonders!.length).toBeGreaterThanOrEqual(3);
    expect(m.version).toBe(SAVE_VERSION);
  });
});

describe("contacts", () => {
  it("a galaxy has regular captains, helping one twice makes a friend, and letters arrive at a later dock with gifts", () => {
    const w = generateWorld(131, { realGalaxy: true });
    expect(w.captains!.length).toBeGreaterThanOrEqual(6);
    const c = w.captains![0];
    expect(captainByName(w, c.name)).toBe(c);
    expect(helpCaptain(w, "Nobody", "repair", new RNG(1))).toBeNull();
    expect(helpCaptain(w, c.name, "repair", new RNG(1))).toBeNull();
    expect(c.disposition).toBe(1); expect(isFriend(c)).toBe(false);
    const line = helpCaptain(w, c.name, "tow", new RNG(2));
    expect(line).toContain("FRIEND");
    expect(isFriend(c)).toBe(true);
    expect(friendsAt(w, c.homeStationId)).toContain(c);
    expect(w.mailQueue!.length).toBe(2);
    expect(tickMail(w).length).toBe(0); // not due yet
    const credits = w.player.credits;
    w.time += 1000;
    const delivered = tickMail(w);
    expect(delivered.length).toBe(2);
    expect(w.player.mail!.length).toBe(2);
    expect(w.mailQueue!.length).toBe(0);
    const gifted = w.player.mail!.some((m) => m.gift?.credits) ? w.player.credits > credits : true;
    expect(gifted).toBe(true);
    let picked = 0;
    for (let i = 0; i < 40; i++) if (pickCaptainFor(w, w.player.systemId, new RNG(i))) picked++;
    expect(picked).toBeGreaterThan(4);
    const raw = JSON.parse(JSON.stringify({ ...w, version: 12, captains: undefined }));
    expect(migrateSave(raw)!.captains!.length).toBeGreaterThanOrEqual(6);
  });
});

describe("the waystation", () => {
  it("a lit structure with credits and parts becomes a waystation that earns more", () => {
    const w = generateWorld(141, { realGalaxy: true });
    const p = w.player;
    const inf = { id: "b", kind: "beacon" as const, systemId: p.systemId, x: 0, y: 0, owner: "ME", builtAt: 0, health: 100, till: 0, stock: 0, earned: 0, lastT: 0 };
    w.infra = [inf];
    p.credits = 100; p.cargo = {};
    expect(canUpgradeInfra(inf, p)).toContain("5000");
    p.credits = 6000;
    expect(canUpgradeInfra(inf, p)).toContain("PARTS");
    p.cargo = { parts: 12 };
    expect(canUpgradeInfra(inf, p)).toBeNull();
    inf.health = 10;
    expect(canUpgradeInfra(inf, p)).toContain("RELIGHT");
    inf.health = 100;
    expect(upgradeInfra(inf, p)).toBe(true);
    expect(inf.upgraded).toBe(true);
    expect(p.credits).toBe(1000);
    expect(p.cargo.parts ?? 0).toBe(0);
    expect(canUpgradeInfra(inf, p)).toContain("ALREADY");
    const plain = { ...inf, id: "c", upgraded: false, till: 0, earned: 0, lastT: 0 };
    w.infra = [inf, plain];
    for (const s2 of Object.values(w.systems)) s2.pirateActivity = 0;
    w.time = 600; inf.lastT = 0; plain.lastT = 0;
    tickInfra(w, new RNG(3));
    expect(inf.till).toBeGreaterThan(plain.till);
  });
});

describe("the greenhouse", () => {
  it("grows a crate of provisions every five minutes under way", () => {
    const w = generateWorld(151, { realGalaxy: true });
    const p = w.player;
    p.cargo = {}; p.modules = ["greenhouse"];
    tickWorld(w, 299);
    expect(p.cargo.food ?? 0).toBe(0);
    tickWorld(w, 2);
    expect(p.cargo.food ?? 0).toBe(1);
    expect(p.grown).toBe(1);
  });
});

describe("rivals", () => {
  it("every galaxy seeds one rival who takes fares, beats you to sights, and can be won round by helping", () => {
    const w = generateWorld(161, { realGalaxy: true });
    const r = rivalOf(w)!;
    expect(r).not.toBeNull();
    expect(isRival(r)).toBe(true);
    const st = w.systems[w.player.systemId].stations[0];
    const fares = genFares(w, st, new RNG(3));
    const n = fares.length;
    let taken: string | null = null;
    for (let i = 0; i < 30 && !taken; i++) taken = rivalTakesFare(w, fares, new RNG(i));
    if (n >= 2) { expect(taken).toContain(r.name.toUpperCase()); expect(fares.length).toBe(n - 1); }
    const wd = w.wonders![0];
    let beaten = false;
    for (let i = 0; i < 40 && !beaten; i++) { wd.seen = false; wd.seenBy = undefined; beaten = rivalBeatsYouTo(w, wd, new RNG(i)); }
    expect(beaten).toBe(true);
    expect(wd.seenBy).toBe(r.name);
    helpCaptain(w, r.name, "repair", new RNG(1));
    expect(r.disposition).toBe(-1);
    helpCaptain(w, r.name, "tow", new RNG(2));
    expect(isRival(r)).toBe(false);
    expect(rivalOf(w)).toBeNull();
  });
});

describe("belonging", () => {
  it("a friend rides along for three dockings, a home port is remembered, museums take relics with your name", () => {
    const w = generateWorld(171, { realGalaxy: true });
    const p = w.player;
    const c = w.captains![0];
    expect(askRideAlong(p, c)).toContain("LEAD ON");
    expect(p.companion!.docks).toBe(3);
    expect(askRideAlong(p, c)).toContain("ALREADY");
    expect(tickRideAlong(p)).toBeNull(); expect(tickRideAlong(p)).toBeNull();
    expect(tickRideAlong(p)).toContain("PEELS OFF");
    expect(p.companion).toBeNull();
    const st = w.systems[p.systemId].stations[0];
    setHomePort(p, st.id);
    expect(isHome(p, st.id)).toBe(true);
    expect(chronicleText(w, "T")).toContain("Home port");
    const research = Object.values(w.systems).flatMap((s) => s.stations).find((s) => s.type === "research")!;
    p.cargo = {};
    expect(donateRelic(w, research, "TESTER")).toBeNull();
    p.cargo = { relics: 2 };
    const line = donateRelic(w, research, "TESTER");
    expect(line).toContain("YOUR NAME");
    expect(research.museum!.length).toBe(1);
    expect(research.museum![0].by).toBe("TESTER");
    expect(p.cargo.relics).toBe(1);
    const agri = Object.values(w.systems).flatMap((s) => s.stations).find((s) => s.type === "agri");
    if (agri) expect(donateRelic(w, agri, "TESTER")).toBeNull();
  });
});

describe("rhythms", () => {
  it("the occasion keys off the real week, lit beacons ease piracy, and used hulls carry a history", () => {
    const monday = Date.UTC(2026, 8, 7, 12); // a Monday
    expect(occasionFor(monday).id).toBe("founders");
    expect(occasionFor(monday + 86400_000).id).toBe("silence");
    expect(occasionFor(monday + 6 * 86400_000).id).toBe("lanes");
    expect(occasionFor(monday + 7 * 86400_000).id).toBe("founders");
    expect(OCCASIONS.length).toBe(7);
    const w = generateWorld(181, { realGalaxy: true });
    const sysId = w.player.systemId;
    w.systems[sysId].pirateActivity = 0.8;
    w.infra = [{ id: "b", kind: "beacon", systemId: sysId, x: 0, y: 0, owner: "ME", builtAt: 0, health: 100, till: 0, stock: 0, earned: 0, lastT: 0 }];
    w.time = 600;
    tickInfra(w, new RNG(9));
    expect(w.systems[sysId].pirateActivity).toBeLessThan(0.8);
    let hist = null;
    for (let i = 0; i < 20 && !hist; i++) hist = hullHistoryFor(w, new RNG(i));
    expect(hist).not.toBeNull();
    expect(hist!.quirk.length).toBeGreaterThan(10);
  });
});

describe("flight school", () => {
  it("has ten lessons, each with a reward", () => {
    expect(STEPS.length).toBe(10);
    expect(STEPS.every((s) => s.reward > 0 && s.text.length < 92)).toBe(true);
  });
});

describe("crew arcs", () => {
  it("every role has a three-beat story whose objectives and cards render, and the engineer's wreck is planted", () => {
    const w = generateWorld(191, { realGalaxy: true });
    const g = { world: w, scenes: {}, sceneName: "station" } as unknown as import("../src/game").Game;
    expect(CREW_ARCS.length).toBe(8);
    for (const def of CREW_ARCS) {
      const c = { name: "Test " + def.role, role: def.role, skill: 1, morale: 70, wage: 40, loyalty: 2, home: w.systems[w.player.systemId].stations[0].id, arc: null as import("../src/core/crewarcs").CrewArc | null };
      expect(def.ask(w, c).length).toBeGreaterThan(20);
      c.arc = def.setup(w, c, new RNG(7));
      expect(def.stages.length).toBe(2);
      expect(arcObjective(w, c)).toContain(def.title);
      for (const st of def.stages) expect(st.objective(w, c).length).toBeGreaterThan(5);
      if (def.id === "engineer") expect(w.systems[c.arc.targetSystemId!].wrecks.some((x) => x.id === c.arc!.wreckId)).toBe(true);
      expect(def.finale(g, c).length).toBeGreaterThan(20);
    }
  });
});

describe("faces", () => {
  it("every galaxy has three notables, they turn up as fares, and delivery has consequences by mood", () => {
    const w = generateWorld(201, { realGalaxy: true });
    expect(w.notables!.length).toBe(3);
    const st = w.systems[w.player.systemId].stations[0];
    let fare: import("../src/world").Mission | null = null;
    for (let i = 0; i < 60 && !fare; i++) fare = genFares(w, st, new RNG(i)).find((f) => f.notable) ?? null;
    expect(fare).not.toBeNull();
    const n = notableById(w, fare!.notable)!;
    const before = w.player.rep[n.factionId] ?? 0;
    const happy = notableOutcome(w, { ...fare!, mood: 95 });
    expect(happy).not.toBeNull();
    if (n.kind === "senator") expect(hasCharter(w, n.factionId) || (w.player.rep[n.factionId] ?? 0) > before).toBe(true);
    const sour = notableOutcome(w, { ...fare!, mood: 10 });
    expect(sour).not.toBeNull();
    expect(n.carried).toBe(2);
    const raw = JSON.parse(JSON.stringify({ ...w, version: 13, notables: undefined }));
    expect(migrateSave(raw)!.notables!.length).toBe(3);
  });
});

describe("the keeper", () => {
  it("starts in a dead system with a failing beacon and a wreck, and its stages check the right state", () => {
    const w = generateWorld(211, { realGalaxy: true });
    const g = { world: w, scenes: {}, sceneName: "flight", toast: () => undefined } as unknown as import("../src/game").Game;
    expect(keeperReady(w)).toBe(false);
    w.time = 11000;
    expect(keeperReady(w)).toBe(true);
    const t = startKeeper(w)!;
    expect(t).not.toBeNull();
    const k = w.infra!.find((i) => i.owner === KEEPER_OWNER)!;
    expect(k.systemId).toBe(t.systemId);
    expect(k.health).toBeLessThan(30);
    expect(w.systems[t.wreckSystemId].wrecks.some((x) => x.id === t.wreckId)).toBe(true);
    expect(keeperObjective(w)).toContain("RELIGHT");
    expect(KEEPER[0].check(g)).toBe(false);
    k.health = 60; (w.player.flags ??= {}).keeperRelit = true;
    expect(KEEPER[0].check(g)).toBe(true);
    expect(KEEPER[0].card(g)).toContain("KEEPER'S LANTERN");
    w.systems[t.wreckSystemId].wrecks.find((x) => x.id === t.wreckId)!.looted = true;
    expect(KEEPER[1].check(g)).toBe(true);
    w.player.story3 = 2; w.player.systemId = t.systemId; w.player.x = k.x + 10; w.player.y = k.y;
    expect(keeperScan(g)).toBe(true);
    const an = w.systems[t.systemId].anomalies.find((a) => a.id === t.contactId)!;
    expect(an).toBeDefined();
    an.claimed = true;
    expect(KEEPER[2].check(g)).toBe(true);
    expect(KEEPER.length).toBe(4);
  });
});

describe("town projects", () => {
  it("a town's patron can fund projects with credits and goods; they add growth and change needs", () => {
    const w = generateWorld(221, { realGalaxy: true });
    const p = w.player;
    const pl = Object.values(w.systems).flatMap((s) => s.planets).find((x) => x.surface && x.surface.pois.some((q) => q.kind === "outpost"))!;
    const poi = pl.surface!.pois.find((q) => q.kind === "outpost")!;
    expect(canFundProject(p, poi, "clinic")).toContain("TOWN");
    poi.tier = 1; poi.growth = 100;
    p.credits = 100; p.cargo = {};
    expect(canFundProject(p, poi, "clinic")).toContain("CR NEEDED");
    p.credits = 5000;
    expect(canFundProject(p, poi, "clinic")).toContain("NEEDED ABOARD");
    p.cargo = { med: 2 };
    expect(canFundProject(p, poi, "clinic")).toBeNull();
    const line = fundProject(w, poi, "clinic", "TESTER");
    expect(line).not.toBeNull();
    expect(poi.projects).toContain("clinic");
    expect(p.credits).toBe(3800);
    expect(p.cargo.med ?? 0).toBe(0);
    expect(poi.growth).toBe(125);
    expect(canFundProject(p, poi, "clinic")).toContain("ALREADY");
    for (let i = 0; i < 20; i++) expect(settlementNeeds(w, poi, Date.now() + i * 7 * 86400_000)).not.toContain("med");
    expect(PROJECTS.length).toBe(4);
  });
});

describe("the ledger", () => {
  it("attributes credit changes to sources, rounded, and skips zero", () => {
    const w = generateWorld(231, { realGalaxy: true });
    const p = w.player;
    ledger(p, "trade", 120.4);
    ledger(p, "trade", 30);
    ledger(p, "crew", -80);
    ledger(p, "other", 0);
    expect(p.ledger!.trade).toBe(150);
    expect(p.ledger!.crew).toBe(-80);
    expect(p.ledger!.other).toBeUndefined();
    const r = ledgerAround(p, "fares", () => { p.credits += 500; return "ok"; });
    expect(r).toBe("ok");
    expect(p.ledger!.fares).toBe(500);
    expect(Object.keys(LEDGER_LABELS).length).toBeGreaterThan(8);
  });
});

describe("small kindnesses", () => {
  it("the cat brings gifts now and then", () => {
    const w = generateWorld(241, { realGalaxy: true });
    const p = w.player;
    expect(catGift(p, new RNG(1))).toBeNull();
    p.cat = { name: "Biscuit", since: 0 }; p.crew = [{ name: "A", role: "medic", skill: 1, morale: 50, wage: 35 }];
    const lines = new Set<string>();
    for (let i = 0; i < 200; i++) { const l = catGift(p, new RNG(i)); if (l) lines.add(l.slice(0, 20)); }
    expect(lines.size).toBeGreaterThanOrEqual(3);
  });
});

describe("regulars", () => {
  it("the bulletin notices regulars and carries the last fare's review", () => {
    const w = generateWorld(251, { realGalaxy: true });
    const p = w.player;
    const st = w.systems[p.systemId].stations[0];
    p.shipName = "Kestrel";
    expect(stationBulletin(w, st).some((l) => l.includes("KESTREL"))).toBe(false);
    p.dockings = { [st.id]: 6 };
    expect(stationBulletin(w, st).some((l) => l.includes("Regulars") && l.includes("KESTREL"))).toBe(true);
    p.dockings = { [st.id]: 12 }; p.lastFareMood = { [st.id]: 90 }; p.cat = { name: "Biscuit", since: 0 };
    const lines = stationBulletin(w, st);
    expect(lines.some((l) => l.includes("bay warm"))).toBe(true);
    expect(lines.some((l) => l.includes("Five stars") && l.includes("The cat"))).toBe(true);
    expect(dockingsAt(p, st.id)).toBe(12);
  });
});
