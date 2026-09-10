// A headless soak: hours of ship time through the pure simulation, with the
// station-side settlements that don't need a canvas. If any system throws or
// drifts into nonsense (NaN credits, unbounded lists), this is where it shows.

import { describe, it, expect } from "vitest";
import { generateWorld, tickWorld, genFares, settlePassengers, tickBonds, collectShoreCrew, crewFallsIll, crewRecover, tickCharters, hireCharter, collectCharters, tickInfra, buildInfra, tickMail, helpCaptain, growSettlement, tickAlumniMail, catGift, adoptCat, runCharterTrip } from "../src/world";
import { tickSerial } from "../src/data/serials";
import { RNG } from "../src/core/rng";

describe("headless soak", () => {
  it("six hours of ship time with dockings every four minutes keeps every number finite and every list bounded", () => {
    const w = generateWorld(999, { realGalaxy: true });
    const p = w.player;
    p.tutorial = -1; p.credits = 20000; p.modules = ["cabins", "greenhouse"];
    p.crew = [
      { name: "Ada", role: "engineer", skill: 2, morale: 70, wage: 80, docks: 0, loyalty: 2 },
      { name: "Bo", role: "medic", skill: 1, morale: 70, wage: 35, docks: 0, loyalty: 1 },
      { name: "Cy", role: "pilot", skill: 1, morale: 70, wage: 50, docks: 0, loyalty: 1 },
    ];
    adoptCat(p, "Biscuit", 0);
    const systems = Object.values(w.systems).filter((s) => s.stations.length);
    // a beacon in a dead system, a charter on a real run
    const dead = Object.values(w.systems).find((s) => !s.stations.length && s.links.length) ?? systems[1];
    if (!dead.stations.length) { p.systemId = dead.id; p.kits = { beacon: 1 }; const r = buildInfra(w, "beacon", 500, 500, "SOAK"); expect(typeof r).toBe("object"); }
    const a = systems[0].stations[0], b = w.systems[systems[0].links.find((l) => w.systems[l].stations.length) ?? systems[1].id].stations[0];
    p.credits = 20000;
    const ch = hireCharter(w, a.id, b.id, Object.keys(a.prices)[0], new RNG(1));
    expect(typeof ch).toBe("object");
    let docks = 0;
    for (let minute = 0; minute < 360; minute++) {
      w.time += 60; tickWorld(w, 60);
      if (minute % 4 === 0) {
        docks++;
        const sys = systems[docks % systems.length]; const st = sys.stations[docks % sys.stations.length];
        p.systemId = sys.id; p.dockedAt = st.id;
        const rng = new RNG(docks);
        for (const c of p.crew) { c.docks = (c.docks ?? 0) + 1; if (!crewRecover(c, w.time)) crewFallsIll(p, c, w.time, rng); }
        collectShoreCrew(p, st.id, 5);
        tickBonds(p, rng);
        p.cargo.food = 6;
        const fares = genFares(w, st, rng);
        if (fares.length && p.missions.filter((m) => m.kind === "passenger" && !m.done).length < 3) { const f = fares[0]; f.accepted = true; p.missions.push(f); }
        for (const m of p.missions) if (m.kind === "passenger" && !m.done && m.targetStationId === st.id) m.done = true;
        p.missions = p.missions.filter((m) => !m.done);
        settlePassengers(p);
        collectCharters(p);
        tickMail(w); tickAlumniMail(w, rng); catGift(p, rng);
        if (docks % 7 === 0 && w.captains?.length) helpCaptain(w, w.captains[docks % w.captains.length].name, "repair", rng);
        const poi = sys.planets.flatMap((pl) => pl.surface?.pois ?? []).find((q) => q.kind === "outpost");
        if (poi) growSettlement(w, poi, 8, "SOAK");
        p.dockedAt = null;
      }
      if (minute % 3 === 0) tickSerial(w, new RNG(minute));
    }
    expect(Number.isFinite(p.credits)).toBe(true);
    expect(p.crew.every((c) => Number.isFinite(c.morale) && c.morale >= 0 && c.morale <= 100)).toBe(true);
    expect(w.events.length).toBeLessThanOrEqual(40);
    expect((p.log ?? []).length).toBeLessThanOrEqual(60);
    expect((p.mail ?? []).length).toBeLessThanOrEqual(20);
    expect((w.mailQueue ?? []).length).toBeLessThan(200);
    expect(p.missions.length).toBeLessThan(10);
    expect(Object.values(w.systems).every((s) => s.stations.every((st) => Object.values(st.stock).every((v) => Number.isFinite(v) && v >= 0)))).toBe(true);
    expect(Object.values(w.systems).every((s) => Number.isFinite(s.pirateActivity) && s.pirateActivity >= 0)).toBe(true);
    const json = JSON.stringify(w);
    expect(json.length).toBeLessThan(3_000_000);
    expect(json).not.toContain("null,null,null,null,null,null,null,null,null,null");
    void runCharterTrip; void tickInfra; void tickCharters;
  });
});
