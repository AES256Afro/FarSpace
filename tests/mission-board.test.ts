import { afterEach, describe, expect, it, vi } from "vitest";
import { generateWorld, type Mission } from "../src/world";
import { Game } from "../src/game";
import { StationScene } from "../src/scenes/station";
import { ReaderScene } from "../src/scenes/reader";
import * as wire from "../src/core/wire";
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
function fixture() {
  vi.useFakeTimers(); vi.spyOn(wire, "post").mockResolvedValue(undefined);
  const w = generateWorld(412), p = w.player, st = w.systems[p.systemId].stations[0];
  p.dockedAt = st.id; p.dockVisit = { stationId: st.id, startedAt: 0, settled: true }; p.cargo = {}; p.cargoMax = 100; p.missions = []; p.crew = []; p.tutorial = -1;
  const station = new StationScene(), reader = new ReaderScene("MISSION LOG", []);
  station.station = st; station.tab = 3; station.visit = p.dockVisit; station.visitWorld = w; station.goalFetched = Date.now();
  const mission = (i: number): Mission => ({ id: `posted-${i}`, title: `POSTING ${i}`, desc: `DELIVER THE NAMED GOODS. FULL INSTRUCTIONS ${i}.`, kind: "delivery", commodityId: "food", qty: 1, fromStationId: st.id, targetStationId: st.id, targetSystemId: p.systemId, reward: 100 + i, accepted: false, done: false });
  station.boardMissions = Array.from({ length: 12 }, (_, i) => mission(i));
  const keys = new Set<string>(), input = { wasPressed: (k: string) => keys.has(k), isDown: () => false, mousePressed: false, mouseRightPressed: false, mouseX: -1, mouseY: -1, wheel: 0 };
  const g = Object.assign(Object.create(Game.prototype), { world: w, input, scenes: { station, missionlog: reader }, scene: station, sceneName: "station", toast: vi.fn(), showHint: vi.fn(), autosave: vi.fn() }) as Game;
  const ctx = { fillRect: vi.fn(), fillStyle: "" } as unknown as CanvasRenderingContext2D;
  return { w, p, st, station, reader, g, keys, input, ctx, mission };
}
describe("complete mission board", () => {
  it("keeps all selected postings and hand-ins inside the canvas", () => {
    const { station, g, p, mission, ctx } = fixture(); p.cargo.food = 5;
    p.missions = [20, 21, 22].map(i => ({ ...mission(i), accepted: true }));
    const rows = station.missionRows(g); expect(rows).toHaveLength(15); expect(rows.slice(0, 3).every(r => r.ready)).toBe(true);
    for (let i = 0; i < rows.length; i++) {
      station.cursor = i; station.rowBoxes = []; station.drawMissions(g, ctx, 56);
      expect(station.missionWindow(g).some(r => r.index === i)).toBe(true);
      expect(station.missionWindow(g).every(r => r.y >= 84 && r.y + 13 < 222)).toBe(true);
    }
  });
  it("accepts the actual visible scrolled posting by pointer", () => {
    const { station, g, ctx, input, p } = fixture(); station.cursor = 11; station.drawMissions(g, ctx, 56);
    input.mouseX = 150; input.mouseY = station.rowBoxes[11][0] + 4; input.mousePressed = true; station.update(g, 0);
    expect(p.missions.map(m => m.id)).toEqual(["posted-11"]); expect(p.cargo.food).toBe(1);
    expect(station.boardMissions[0].accepted).toBe(false);
  });
  it("turns in a selected visible mission once without consuming other deliveries", () => {
    const { station, g, ctx, input, p, mission } = fixture(); p.cargo.food = 3;
    p.missions = [20, 21, 22].map(i => ({ ...mission(i), accepted: true })); const credits = p.credits;
    station.cursor = 2; station.drawMissions(g, ctx, 56); input.mouseX = 150; input.mouseY = station.rowBoxes[2][0] + 4; input.mousePressed = true;
    station.update(g, 0); expect(p.missions.map(m => m.id)).toEqual(["posted-20", "posted-21"]); expect(p.cargo.food).toBe(2); expect(p.credits).toBeGreaterThan(credits);
  });
  it("reads every active mission and passenger and keeps the full description", () => {
    const { station, g, p, mission } = fixture();
    p.missions = Array.from({ length: 8 }, (_, i) => ({ ...mission(i + 20), accepted: true, kind: i > 4 ? "passenger" as const : "bounty" as const, killsNeeded: i < 5 ? 3 : undefined, kills: 1, mood: i > 4 ? 72 : undefined }));
    p.missions[7].passengerKind = "singer"; p.missions[7].lightReward = 30;
    const before = JSON.stringify(p), sections = station.missionSections(g), active = sections.filter(s => s.mission?.accepted);
    expect(active).toHaveLength(8); expect(active[7].lines).toContain("REWARD: 30 LIGHT AT HOME.");
    expect(active[4].lines).toContain("TARGETS: 1/3."); expect(active[7].lines.join(" ")).toContain("FULL INSTRUCTIONS 27.");
    expect(JSON.stringify(p)).toBe(before);
  });
  it("opens the selected posting in the full log and returns to the same tab without accepting it", () => {
    const { station, g, p, reader, keys } = fixture(); station.cursor = 11; const before = JSON.stringify(p);
    keys.add("j"); station.update(g, 0); keys.clear(); expect(g.sceneName).toBe("missionlog"); expect(reader.scroll).toBeGreaterThan(0);
    reader.search("FULL INSTRUCTIONS 11."); expect(reader.blocks).toHaveLength(1); expect(reader.blocks[0].title).toBe("POSTING: POSTING 11");
    keys.add("Escape"); reader.update(g); keys.clear(); expect(g.sceneName).toBe("station"); expect(station.tab).toBe(3); expect(station.cursor).toBe(11);
    expect(JSON.stringify(p)).toBe(before); expect(g.autosave).not.toHaveBeenCalled();
  });
  it("never offers a human-station hand-in for a singer even with an old station target", () => {
    const { station, g, p, mission } = fixture();
    p.missions = [{ ...mission(20), kind: "passenger", passengerKind: "singer", lightReward: 30, accepted: true }];
    expect(station.missionRows(g).filter(r => r.ready)).toEqual([]);
    expect(station.missionSections(g).find(s => s.mission === p.missions[0])!.lines).toContain("STATUS: ACCEPTED.");
  });
  it("keeps locked postings guarded and opens the log from its pointer control", () => {
    const { station, g, p, reader, keys, input } = fixture(); station.boardMissions[11].tier = 2; p.rep[station.station.factionId] = 0; station.cursor = 11;
    keys.add("Enter"); station.update(g, 0); keys.clear(); expect(p.missions).toEqual([]); expect(g.toast).toHaveBeenCalledWith("YOUR STANDING ISN'T HIGH ENOUGH");
    input.mouseX = 420; input.mouseY = 58; input.mousePressed = true; station.update(g, 0);
    expect(g.sceneName).toBe("missionlog"); expect(reader.blocks.some(b => b.lines.join(" ").includes("HIGHER STANDING REQUIRED"))).toBe(true);
  });
});
