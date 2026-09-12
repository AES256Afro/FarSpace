import { afterEach, describe, expect, it, vi } from "vitest";
import { acceptCouncilMandate, castCouncilVote, COUNCIL_ISSUES, councilAt, councilAudience, councilAudienceAt, councilBallot, councilIssue, councilObjective, councilRecipient, councilStanding, councilVoteReason, plotCouncilMandate, reportCouncilMandate, takeCouncilSeat, withdrawCouncilMandate } from "../src/core/council";
import { findStation, generateWorld, isBeltStation, tickMail, weekKey } from "../src/world";
import { migrateSave, SAVE_VERSION } from "../src/save";
import { CouncilScene } from "../src/scenes/council";
import { StationWalkScene } from "../src/scenes/stationwalk";
import { StationScene } from "../src/scenes/station";
import { EncounterScene } from "../src/scenes/encounter";
import { GalaxyScene } from "../src/scenes/galaxy";
import { Game } from "../src/game";
import { RNG } from "../src/core/rng";

const NOW = Date.parse("2026-09-11T15:00:00Z"), WEEK = 7 * 86400000;
function fixture() {
  const w = generateWorld(398), p = w.player; p.tutorial = -1; p.crew = []; p.credits = 1000;
  const home = Object.values(w.systems).flatMap(s => s.stations).find(st => councilAt(w, st.id) && councilRecipient(w, st.id))!;
  expect(home).toBeDefined();
  const arrive = (id: string) => { const f = findStation(w, id)!; p.systemId = f.sys.id; p.dockedAt = id; };
  arrive(home.id); p.beltStanding = 5; (p.flags ??= {}).freeman = true; w.mailQueue = []; p.mail = [];
  const vote = (choice = 2, now = NOW) => {
    takeCouncilSeat(w, home.id); return castCouncilVote(w, home.id, weekKey(now), councilIssue(w, home.id, now).id, choice, now);
  };
  const accept = () => { vote(); return acceptCouncilMandate(w, home.id, weekKey(NOW), NOW); };
  return { w, p, home, arrive, vote, accept };
}
function game(f: ReturnType<typeof fixture>) {
  const keys = new Set<string>();
  const g = Object.assign(Object.create(Game.prototype), { world: f.w, sceneName: "council",
    scenes: { council: new CouncilScene(), stationwalk: new StationWalkScene(), station: new StationScene(), encounter: new EncounterScene(), galaxy: new GalaxyScene() },
    input: { wasPressed: (key: string) => keys.has(key), isDown: () => false, mousePressed: false, mouseX: 0, mouseY: 0, wheel: 0 },
    toast: vi.fn(), autosave: vi.fn(), showHint: vi.fn(), save: vi.fn(), load: vi.fn(),
  }) as Game;
  return { g, keys };
}
afterEach(() => vi.restoreAllMocks());

describe("the rock's council", () => {
  it("admits observers but reserves a real docked chair for freemen with standing", () => {
    const { w, p, home } = fixture(); p.beltStanding = 2;
    expect(councilAt(w)?.id).toBe(home.id); expect(councilStanding(w)).toBe(false);
    expect(takeCouncilSeat(w, home.id)).toContain("VISITORS"); expect(p.council).toBeUndefined();
    p.beltStanding = 3; delete p.flags!.freeman; expect(takeCouncilSeat(w, home.id)).toContain("VISITORS");
    p.flags!.freeman = true; p.dockedAt = null; expect(takeCouncilSeat(w, home.id)).toContain("NOT HERE");
    p.dockedAt = home.id; expect(takeCouncilSeat(w, home.id)).toContain("WRITES YOUR NAME");
    expect(p.council?.stationId).toBe(home.id); expect(takeCouncilSeat(w, home.id)).toContain("STILL HERE");
    home.military = true; expect(councilAt(w)).toBeNull();
  });

  it("rotates three agendas on UTC Mondays and rejects a stale agenda or invalid option", () => {
    const { w, home } = fixture(); takeCouncilSeat(w, home.id);
    expect(new Set([0, 1, 2].map(n => councilIssue(w, home.id, NOW + n * WEEK).id)).size).toBe(3);
    const sunday = Date.parse("2026-09-13T23:59:59Z"), monday = sunday + 1000;
    expect(councilIssue(w, home.id, sunday).id).toBe(councilIssue(w, home.id, NOW).id);
    expect(councilIssue(w, home.id, monday).id).not.toBe(councilIssue(w, home.id, sunday).id);
    for (const [week, issue, choice] of [[weekKey(NOW - WEEK), councilIssue(w, home.id, NOW).id, 0], [weekKey(NOW), "missing", 0], [weekKey(NOW), councilIssue(w, home.id, NOW).id, 9], [weekKey(NOW), councilIssue(w, home.id, NOW).id, 0.5]] as [string, string, number][]) {
      expect(castCouncilVote(w, home.id, week, issue, choice, NOW)).toContain("AGENDA HAS CHANGED");
    }
    expect(w.player.council?.ballots).toEqual([]); expect(w.mailQueue).toEqual([]);
  });

  it.each([0, 1, 2])("applies option %i once and posts the actual resolution in one letter", choice => {
    const { w, p, home, vote } = fixture(); const option = councilIssue(w, home.id, NOW).choices[choice];
    const belt = p.beltStanding!, rep = p.rep[home.factionId] ?? 0;
    vote(choice); expect(p.beltStanding).toBe(belt + option.belt); expect(p.rep[home.factionId]).toBe(rep + option.rep);
    expect(councilBallot(w, NOW)?.resolution).toBe(option.resolution); expect(w.mailQueue).toHaveLength(1);
    const after = JSON.stringify(p.council); vote(choice); expect(JSON.stringify(p.council)).toBe(after); expect(w.mailQueue).toHaveLength(1);
    expect(p.beltStanding).toBe(belt + option.belt); w.time += 300; tickMail(w); tickMail(w);
    expect(p.mail).toHaveLength(1); expect(p.mail![0].text).toContain(option.resolution);
  });

  it("keeps one weekly vote across chair moves and refuses replay after clock rollback", () => {
    const { w, p, home, arrive, vote } = fixture(); vote();
    const next = Object.values(w.systems).flatMap(s => s.stations).find(st => st.id !== home.id && !st.military)!;
    next.type = "mining";
    arrive(next.id); takeCouncilSeat(w, next.id);
    expect(councilVoteReason(w, next.id, NOW)).toContain("MINUTES");
    expect(councilVoteReason(w, next.id, NOW - WEEK)).toContain("MINUTES");
    expect(councilVoteReason(w, next.id, NOW + WEEK)).toBeNull();
    castCouncilVote(w, next.id, weekKey(NOW + WEEK), councilIssue(w, next.id, NOW + WEEK).id, 2, NOW + WEEK);
    expect(p.council?.ballots).toHaveLength(2);
  });

  it("chooses a reachable civil office and rejects missing, repeated or unavailable mandates", () => {
    const { w, p, home, vote } = fixture(); takeCouncilSeat(w, home.id);
    expect(acceptCouncilMandate(w, home.id, weekKey(NOW), NOW)).toContain("ANOTHER SITTING");
    vote(); const dest = councilRecipient(w, home.id)!;
    expect(isBeltStation(dest.st)).toBe(false); expect(dest.st.military).toBeFalsy(); expect(dest.st.factionId).toBe(home.factionId);
    expect(acceptCouncilMandate(w, home.id, weekKey(NOW), NOW)).toContain(dest.st.name.toUpperCase());
    const m = p.council!.mandate; expect(p.navStationId).toBe(dest.st.id);
    expect(acceptCouncilMandate(w, home.id, weekKey(NOW), NOW)).toContain("ALREADY CARRY"); expect(p.council!.mandate).toBe(m);
    expect(takeCouncilSeat(w, home.id)).toContain("STILL HERE");
    for (const sys of Object.values(w.systems)) for (const st of sys.stations) if (!isBeltStation(st)) st.military = true;
    expect(councilRecipient(w, home.id)).toBeNull();
  });

  it.each([false, true])("requires the correct audience and a return home, settling response %s once", meeting => {
    const { w, p, home, arrive, accept } = fixture(); accept(); const m = p.council!.mandate!;
    expect(reportCouncilMandate(w, m)).toContain("MUST BE READ BACK");
    expect(councilAudience(w, m, meeting)).toContain("NO LONGER");
    arrive(m.targetStationId); expect(councilAudienceAt(w, m.targetStationId)).toBe(true);
    expect(councilAudience(w, { ...m }, meeting)).toContain("NO LONGER");
    expect(councilAudience(w, m, meeting)).toContain("NO CONTRACT HAS BEEN SIGNED");
    expect(m.stage).toBe("return"); expect(m.reply).toContain(meeting ? "joint meeting" : "named reviewer"); expect(p.navStationId).toBe(home.id);
    expect(councilAudience(w, m, meeting)).toContain("NO LONGER"); expect(reportCouncilMandate(w, m)).toContain("MUST BE READ BACK");
    arrive(home.id); const credits = p.credits; p.beltStanding = 1; delete p.flags!.freeman;
    expect(reportCouncilMandate(w, m)).toContain("+300CR"); expect(p.credits).toBe(credits + 300);
    expect(p.council!.represented).toBe(1); expect(p.council!.mandate).toBeUndefined(); expect(p.navStationId).toBeUndefined();
    expect(reportCouncilMandate(w, m)).toContain("MUST BE READ BACK"); expect(p.credits).toBe(credits + 300); expect(w.mailQueue).toHaveLength(2);
    p.beltStanding = 5; p.flags!.freeman = true; expect(acceptCouncilMandate(w, home.id, weekKey(NOW), NOW)).toContain("ALREADY LEFT");
  });

  it("retains an old mandate over weekly changes and save migration without occupying a cabin", () => {
    const { w, p, home, arrive, accept } = fixture(); accept(); w.version = SAVE_VERSION;
    const old = p.council!.mandate!; const missions = JSON.stringify(p.missions);
    castCouncilVote(w, home.id, weekKey(NOW + WEEK), councilIssue(w, home.id, NOW + WEEK).id, 2, NOW + WEEK);
    expect(p.council!.mandate).toBe(old); w.time += 1000000;
    const restored = migrateSave(JSON.parse(JSON.stringify(w)))!;
    expect(restored.player.council).toEqual(p.council); expect(JSON.stringify(restored.player.missions)).toBe(missions);
    expect(councilObjective(restored)).toContain("HARBOURMASTER");
    arrive(old.targetStationId); councilAudience(w, old, true);
    const returned = migrateSave(JSON.parse(JSON.stringify(w)))!; expect(returned.player.council!.mandate!.stage).toBe("return");
    expect(councilObjective(returned)).toContain("REPORT TO THE CHAIR");
  });

  it("allows handing the papers back without reward or penalty, without restarting that sitting", () => {
    const { w, p, home, arrive, accept } = fixture(); accept(); const m = p.council!.mandate!, credits = p.credits, belt = p.beltStanding;
    arrive(m.targetStationId); expect(withdrawCouncilMandate(w, m)).toContain("RETURN TO");
    arrive(home.id); expect(withdrawCouncilMandate(w, m)).toContain("NO PAYMENT");
    expect(p.credits).toBe(credits); expect(p.beltStanding).toBe(belt); expect(p.council!.mandate).toBeUndefined();
    expect(acceptCouncilMandate(w, home.id, weekKey(NOW), NOW)).toContain("ALREADY LEFT");
  });

  it("keeps the objective when the route closes, and restores its exact station from the galaxy map", () => {
    const f = fixture(); f.accept(); const { g, keys } = game(f), m = f.p.council!.mandate!;
    f.p.navTarget = null; delete f.p.navStationId; f.p.singersCourse = true;
    keys.add("c"); (g.scenes.galaxy as GalaxyScene).update(g, 0); keys.clear();
    expect(f.p.navStationId).toBe(m.targetStationId); expect(f.p.singersCourse).toBe(false);
    const dest = findStation(f.w, m.targetStationId)!; dest.sys.permit = true; f.p.rep[dest.sys.factionId] = -100;
    expect(plotCouncilMandate(f.w)).toBe(false); expect(f.p.council!.mandate).toBe(m);
    expect(councilObjective(f.w)).toContain(dest.st.name.toUpperCase());
    keys.add("F9"); keys.add("c"); g.autosave = vi.fn(); (g.scenes.galaxy as GalaxyScene).update(g, 0);
    expect(g.load).toHaveBeenCalledOnce(); expect(g.autosave).not.toHaveBeenCalled();
  });

  it("places the room on a reachable belt deck and opens the correct News kiosk", () => {
    const f = fixture(), { g, keys } = game(f), walk = g.scenes.stationwalk as StationWalkScene;
    g.setScene("stationwalk"); walk.px = 145; walk.py = 35;
    expect(walk.tileAt(14, 2)).toBe("C"); expect(walk.solid(14, 3)).toBe(false);
    expect(walk.nearestKiosk()?.def.label).toContain("COUNCIL"); keys.add("e"); walk.update(g, 0); keys.clear();
    expect(g.sceneName).toBe("council");
    (g.scenes.council as CouncilScene).leave(g); expect(g.sceneName).toBe("stationwalk"); expect(walk.px).toBe(145);
    walk.px = 325; walk.py = 85; expect(walk.nearestKiosk()?.def.tab).toBe(9);
    vi.spyOn(g.scenes.station as StationScene, "enter").mockImplementation(() => {});
    keys.add("e"); walk.update(g, 0); keys.clear();
    expect(g.sceneName).toBe("station"); expect((g.scenes.station as StationScene).tab).toBe(9);
    expect((g.scenes.station as StationScene).returnTo).toBe("stationwalk");
    f.home.type = "trade"; expect(walk.tileAt(14, 2)).toBe(".");
  });

  it("lets keyboard choices move with a parked pointer and gives the courier a focused audience", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const f = fixture(), { g, keys } = game(f), scene = g.scenes.council as CouncilScene;
    g.input.mouseX = 160; g.input.mouseY = 150; g.setScene("council");
    scene.actions(g)[0].run(); scene.actions(g)[0].run();
    const enc = g.scenes.encounter as EncounterScene;
    keys.add("ArrowDown"); enc.update(g, 0); keys.clear(); expect(enc.cursor).toBe(1);
    keys.add("ArrowDown"); enc.update(g, 0); keys.clear(); expect(enc.cursor).toBe(2);
    keys.add("Enter"); enc.update(g, 0); keys.clear(); expect(f.p.council!.ballots[0].choice).toBe(2);
    keys.add("Enter"); enc.update(g, 0); keys.clear();
    scene.actions(g).find(a => a.label === "SPEAK FOR THE ROCK")!.run(); const m = f.p.council!.mandate!;
    f.arrive(m.targetStationId); g.setScene("stationwalk"); const walk = g.scenes.stationwalk as StationWalkScene;
    walk.px = 205; walk.py = 35; keys.add("e"); walk.update(g, 0); keys.clear();
    expect(g.sceneName).toBe("encounter"); expect(enc.enc.id).toBe("council-audience"); expect(enc.enc.options).toHaveLength(3);
    enc.enc.options[2].result(g, new RNG(1)); expect(m.stage).toBe("outbound");
    enc.enc.options[0].result(g, new RNG(1)); expect(m.stage).toBe("return");
  });

  it("supports keyboard and pointer seating, a guarded agenda, and short action lists", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const f = fixture(), { g, keys } = game(f), scene = g.scenes.council as CouncilScene;
    g.setScene("council"); keys.add("Enter"); scene.update(g, 0); keys.clear(); expect(scene.seated).toBe(true);
    keys.add("Enter"); scene.update(g, 0); keys.clear(); expect(g.sceneName).toBe("encounter");
    const enc = g.scenes.encounter as EncounterScene;
    expect(enc.enc!.options).toHaveLength(4);
    enc.enc!.options[2].result(g, new RNG(1)); g.setScene("council"); expect(scene.seated).toBe(true);
    expect(scene.actions(g).some(a => a.label === "SPEAK FOR THE ROCK")).toBe(true);
    scene.actions(g).find(a => a.label === "SPEAK FOR THE ROCK")!.run(); const m = f.p.council!.mandate!;
    f.arrive(m.targetStationId); councilAudience(f.w, m, true); f.arrive(f.home.id);
    vi.spyOn(Date, "now").mockReturnValue(NOW + WEEK); expect(scene.actions(g).length).toBeLessThanOrEqual(6);
    f.p.beltStanding = 1; delete f.p.flags!.freeman; g.setScene("council");
    expect(scene.actions(g).some(a => a.label === "READ BACK THE OFFICE'S REPLY")).toBe(true);
    scene.actions(g).find(a => a.label === "READ BACK THE OFFICE'S REPLY")!.run(); expect(f.p.council!.represented).toBe(1);
    f.p.beltStanding = 5; f.p.flags!.freeman = true; g.input.mousePressed = true; g.input.mouseX = 112; g.input.mouseY = 150;
    scene.update(g, 0); expect(scene.seated).toBe(true);
    keys.add("F9"); g.autosave = vi.fn(); scene.update(g, 0); expect(g.load).toHaveBeenCalledOnce(); expect(g.autosave).not.toHaveBeenCalled();
  });
});
