// The second sitting (M201–M314): the pure functions behind the bridge, the belt, the service and life aboard.
import { describe, it, expect } from "vitest";
import { RNG } from "../src/core/rng";
import { tickWorld, beltGain, BELT_FREEMAN_AT, commandOffer, learnWord, chartSingersHome, generateWorld, genCrewCandidate, inquiryDue, transferRequest, leavePair, anniversaryDue, birthdaysDue, droughtAt, fleetReviewAt, shipNewsletter, prisonerOutcome, systemLabel, dedication, officeWrites, birthdaysDue as bdays, shiftBond, briefingReports, firstOfficer, isBeltStation, genFares, genMissionsFor, MOTTOS, SYSTEM_NICKS, runSim, hashStr as _h } from "../src/world";

const mk = () => { const w = generateWorld(0xfa25face); const p = w.player; const rng = new RNG(7); for (let i = 0; i < 3; i++) { const c = genCrewCandidate(rng); c.docks = 5; p.crew.push(c); } return { w, p, rng }; };

describe("the second sitting", () => {
  it("boards of inquiry sit once per lost crew member, at naval stations only", () => {
    const { w, p } = mk(); const stations = Object.values(w.systems).flatMap((s) => s.stations); const mil = stations.find((s) => s.military)!; const civ = stations.find((s) => !s.military)!;
    expect(inquiryDue(w, mil)).toBe(false);
    p.lost = [{ name: "R", role: "engineer", where: "X", t: 0 }];
    expect(inquiryDue(w, mil)).toBe(true); expect(inquiryDue(w, civ)).toBe(false);
    p.inquiries = 1; expect(inquiryDue(w, mil)).toBe(false);
  });
  it("transfer requests need a long, unhappy record; the same leave needs a bond", () => {
    const { w, p } = mk();
    expect(transferRequest(w)).toBeNull();
    p.crew[0].morale = 20; expect(transferRequest(w)?.name).toBe(p.crew[0].name);
    (p.flags ??= {})[`transfer:${p.crew[0].name}`] = true; expect(transferRequest(w)).toBeNull();
    expect(leavePair(w)).toBeNull();
    shiftBond(p.crew[1], p.crew[2], 2.5); const pair = leavePair(w); expect(pair && pair.map((c) => c.name).sort()).toEqual([p.crew[1].name, p.crew[2].name].sort());
  });
  it("anniversaries and birthdays fire once each", () => {
    const { w, p } = mk();
    expect(anniversaryDue(w)).toBeNull();
    p.commissionedAt = w.time - 360000 - 1; expect(anniversaryDue(w)).toMatch(/100 HOURS/); expect(anniversaryDue(w)).toBeNull();
    const c = p.crew[0]; const want = _h(`bday:${c.name}`) % 30; const day = Math.floor(w.time / 86400); w.time += ((want - day % 30 + 30) % 30) * 86400;
    expect(bdays(w).length).toBe(1); expect(birthdaysDue(w).length).toBe(0);
  });
  it("droughts and fleet reviews are looked up by station and time", () => {
    const { w } = mk(); const stations = Object.values(w.systems).flatMap((s) => s.stations); const st = stations[0];
    w.galaxyEvent = { kind: "drought", systemId: "x", stationId: st.id, until: w.time + 10 };
    expect(droughtAt(w, st.id)).toBeTruthy(); expect(fleetReviewAt(w, st.id)).toBeNull();
    w.time += 20; expect(droughtAt(w, st.id)).toBeNull();
  });
  it("the office writes three times and then opens a file; the newsletter always has a header and corrections", () => {
    const { w, p } = mk();
    officeWrites(w, "a"); officeWrites(w, "b"); expect(p.flags?.office).toBeFalsy(); officeWrites(w, "c"); expect(p.flags?.office).toBe(true);
    expect((w.mailQueue ?? []).filter((m) => m.from.includes("office")).length).toBe(3);
    const news = shipNewsletter(w); expect(news[0]).toMatch(/GALLEY DOOR/); expect(news[news.length - 1]).toMatch(/CORRECTIONS/);
  });
  it("prisoners can only walk without a gunner, and the plaque carries the motto", () => {
    const { w, p } = mk(); const stations = Object.values(w.systems).flatMap((s) => s.stations); const mil = stations.find((s) => s.military)!;
    p.rep[mil.factionId] = 40; let fare = null as ReturnType<typeof genFares>[number] | null; for (let i = 0; i < 40 && !fare; i++) fare = genFares(w, mil, new RNG(500 + i)).find((m) => m.passengerKind === "prisoner") ?? null;
    expect(fare).toBeTruthy();
    for (const c of p.crew) c.role = "gunner";
    for (let i = 0; i < 20; i++) expect(prisonerOutcome(w, { ...fare!, docksAboard: 2 }, new RNG(i)).ok).toBe(true);
    p.motto = MOTTOS[0]; expect(dedication(w)).toContain(MOTTOS[0].toUpperCase());
    const s = p.systems[0]; expect(systemLabel(p, s)).toBe(s.name.toUpperCase()); (p.systemNicks ??= {})[s.id] = "Doris"; expect(systemLabel(p, s)).toBe(`DORIS (${s.name.toUpperCase()})`);
    expect(Object.keys(SYSTEM_NICKS).length).toBeGreaterThan(3);
  });
  it("briefings add Number One and a science line; the cats program raises morale", () => {
    const { w, p } = mk();
    p.numberOne = p.crew[0].name; expect(firstOfficer(p)?.name).toBe(p.crew[0].name);
    p.crew[1].specialty = "science" as never; p.crew[1].role = "pilot";
    const rep = briefingReports(w); expect(rep.some((l) => l.includes("(NUMBER ONE)"))).toBe(true); expect(rep.some((l) => l.includes("(SCIENCE)"))).toBe(true);
    const m0 = p.crew[0].morale; runSim(w, "cats", new RNG(1)); expect(p.crew[0].morale).toBeGreaterThan(m0);
  });
  it("everything the second sitting adds survives a JSON round trip", () => {
    const { w, p } = mk();
    p.numberOne = p.crew[0].name; p.motto = MOTTOS[1]; p.catchphrase = "Go"; p.systemNicks = { reactor: "Doris" }; p.prisoners = 1; p.wakes = 1; p.lost = [{ name: "R", role: "engineer", where: "X", t: 1 }];
    p.crewPick = Object.values(w.systems)[0].stations[0]?.id; p.numberOneLeg = true; p.shipAskedQuiet = true; p.commissionedAt = 10; p.ribbons = 2; p.waterToBelt = 12; p.officeLetters = 2; p.keepsakes = ["a pen"];
    officeWrites(w, "a fold"); w.galaxyEvent = { kind: "review", systemId: "s", stationId: "st", until: w.time + 5 };
    const back = JSON.parse(JSON.stringify(w)) as typeof w;
    expect(back.player.numberOne).toBe(p.numberOne); expect(back.player.systemNicks?.reactor).toBe("Doris"); expect(back.mailQueue?.length).toBe(w.mailQueue?.length);
    expect(() => { briefingReports(back); shipNewsletter(back); dedication(back); anniversaryDue(back); birthdaysDue(back); leavePair(back); transferRequest(back); }).not.toThrow();
    expect(systemLabel(back.player, back.player.systems[0])).toContain("DORIS");
  });
  it("the third sitting: command offers, words, and the singers' chart", () => {
    const { w, p } = mk();
    expect(commandOffer(w)).toBeNull();
    p.numberOne = p.crew[0].name; p.crew[0].docks = 14; p.crew[0].loyalty = 2.5; p.achievements = Array.from({ length: 30 }, (_, i) => `d${i}`);
    expect(commandOffer(w)?.name).toBe(p.crew[0].name);
    (p.flags ??= {})[`offer:${p.crew[0].name}`] = true; expect(commandOffer(w)).toBeNull();
    expect(learnWord(p, "hello")).toMatch(/WORD LEARNED/); expect(learnWord(p, "hello")).toBeNull(); expect(p.words).toEqual(["hello"]);
    const home = chartSingersHome(w, new RNG(3)); expect(home).toBeTruthy(); expect(home).not.toBe(p.systemId); expect(w.systems[home!].links).not.toContain(p.systemId);
    expect(chartSingersHome(w, new RNG(4))).toBe(home);
  });
  it("the long leg drains morale past six hours; the freeman's name comes back twice; prisoners can walk", () => {
    const { w, p } = mk();
    for (const c of p.crew) c.morale = 70;
    p.leg = { jumps: 1, fights: 0, cards: 0, alerts: 0, burns: 0, rescues0: 0, t0: w.time - 7 * 3600 }; w.longLegTick = 599;
    tickWorld(w, 2); expect(p.crew[0].morale).toBe(69); expect(p.flags?.longLegNoted).toBe(true);
    p.beltStanding = 0; (p.flags ??= {}).freeman = true; p.flags.freemanLost = true; delete p.flags.freeman;
    p.beltStanding = BELT_FREEMAN_AT - 0.5; expect(beltGain(w, 1)).toMatch(/TWICE IS RARER/); expect(p.flags.freeman).toBe(true); expect(p.flags.freemanTwice).toBe(true);
    const stations = Object.values(w.systems).flatMap((s) => s.stations); const mil = stations.find((s) => s.military)!; p.rep[mil.factionId] = 40;
    let fare = null as ReturnType<typeof genFares>[number] | null; for (let i = 0; i < 40 && !fare; i++) fare = genFares(w, mil, new RNG(500 + i)).find((m) => m.passengerKind === "prisoner") ?? null;
    for (const c of p.crew) c.role = "pilot";
    let walked = false; for (let i = 0; i < 60 && !walked; i++) walked = !prisonerOutcome(w, { ...fare!, docksAboard: 2 }, new RNG(i)).ok;
    expect(walked).toBe(true);
  });
  it("observation, emergency and freeman runs generate with their fields", () => {
    const { w, p } = mk(); const stations = Object.values(w.systems).flatMap((s) => s.stations);
    const rs = stations.find((s) => s.type === "research")!; p.rep[rs.factionId] = 40;
    let ob = null as any; for (let i = 0; i < 60 && !ob; i++) ob = genMissionsFor(w, rs, new RNG(700 + i)).find((m) => m.kind === "observe");
    expect(ob && ob.patrolNeed).toBeGreaterThan(0); expect(ob.sightPlanetIdx).toBeGreaterThanOrEqual(0);
    let em = null as any; for (let i = 0; i < 60 && !em; i++) em = genMissionsFor(w, rs, new RNG(100 + i)).find((m) => m.kind === "emergency");
    expect(em && em.byT).toBeGreaterThan(w.time);
    const belt = stations.find((s) => isBeltStation(s))!; p.rep[belt.factionId] = 40; (p.flags ??= {}).freeman = true;
    let fr = null as any; for (let i = 0; i < 80 && !fr; i++) fr = genMissionsFor(w, belt, new RNG(1200 + i)).find((m) => m.title.startsWith("Freeman"));
    expect(fr && fr.desc).toMatch(/inners need not apply/);
  });
});
