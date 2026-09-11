import { describe, expect, it, vi } from "vitest";
import { Game } from "../src/game";
import { generateWorld } from "../src/world";
import { serviceFileSections, ServiceFileScene } from "../src/scenes/servicefile";
import { ServiceScene } from "../src/scenes/service";
import { borrowServiceCutter } from "../src/core/serviceloan";

function fixture() {
  const world = generateWorld(410), p = world.player, st = world.systems[p.systemId].stations[0];
  st.military = true; st.factionId = "fdm"; p.dockedAt = st.id; p.crew = [];
  p.service = { factionId: "fdm", stationId: st.id, joinedAt: 0, serial: 20, completed: 20,
    history: Array.from({ length: 12 }, (_, i) => ({ title: `VISIT ${i + 9}`, t: i * 3600, pay: 500 + i,
      report: Array.from({ length: 75 }, (_, j) => `RECEIPT ${j}: THE PASSENGER ARRIVED AS BOOKED.`).join(" ") + ` END OF REPORT ${i + 9}.` })),
  };
  const file = new ServiceFileScene(), service = new ServiceScene(), keys = new Set<string>();
  const g = Object.assign(Object.create(Game.prototype), { world, scenes: { servicefile: file, service }, sceneName: "service", settingsReturn: "title",
    input: { wasPressed: (key: string) => keys.has(key), mousePressed: false, mouseX: 0, mouseY: 0, wheel: 0 }, autosave: vi.fn() }) as Game;
  service.enter(g);
  return { world, p, st, file, service, keys, g };
}
describe("complete service file", () => {
  it("keeps all retained reports, dates and payments in newest-first order", () => {
    const { world, p } = fixture(), before = JSON.stringify(world);
    const reports = serviceFileSections(world).filter(([title]) => title.startsWith("REPORT "));
    expect(reports).toHaveLength(12); expect(reports[0][0]).toBe("REPORT 20: VISIT 20");
    expect(reports.at(-1)![0]).toBe("REPORT 9: VISIT 9");
    expect(reports[0][1][0]).toContain("FILED 41110.0. PAID 511CR.");
    expect(reports.at(-1)![1].at(-1)).toContain("END OF REPORT 9.");
    expect(p.service!.history[0].title).toBe("VISIT 9"); expect(JSON.stringify(world)).toBe(before);
  });
  it("includes current orders, all fare receipts and custody terms without changing the ship", () => {
    const { world, p, st } = fixture(); borrowServiceCutter(world);
    p.service!.order = { id: "active", serial: 21, kind: "liaison", fromStationId: st.id, targetSystemId: p.systemId, title: "CURRENT VISIT", description: "LISTEN TO THE DOCK HANDS", pay: 700, need: 0, progress: 0, stage: "return", report: "THE OFFICE SIGNED THE ACCOUNT.", civilianPlan: { choice: "fares-first", amendmentCost: 100, fares: Array.from({ length: 30 }, (_, i) => ({ id: String(i), name: `TRAVELLER ${i}`, systemId: p.systemId, singer: false, delivered: true })) } };
    const before = JSON.stringify(world), sections = serviceFileSections(world), text = sections.flatMap(([title, lines]) => [title, ...lines]).join(" ");
    expect(text).toContain("THE OFFICE SIGNED THE ACCOUNT."); expect(text).toContain("TRAVELLER 29: delivered");
    expect(text).toContain("PAY ON REPORT: 700CR"); expect(text).toContain("NO RETURN DEADLINE"); expect(JSON.stringify(world)).toBe(before);
  });
  it("opens the archive from its real office action, reads to the oldest final line and returns without payment", () => {
    const { g, file, service, p, keys } = fixture(), before = JSON.stringify(p);
    service.actions(g).find(a => a.label === "READ YOUR SERVICE FILE")!.run();
    expect(g.sceneName).toBe("servicefile"); expect(file.scroll).toBeGreaterThan(0);
    keys.add("End"); file.update(g); keys.clear(); const last = file.blocks.at(-1)!;
    expect(last.lines.at(-1)).toContain("END OF REPORT 9."); expect(last.top + last.height - file.scroll).toBeLessThanOrEqual(192);
    keys.add("Escape"); file.update(g); keys.clear(); expect(g.sceneName).toBe("service");
    expect(JSON.stringify(p)).toBe(before); expect(g.autosave).not.toHaveBeenCalled();
  });
  it("searches retained reports and rebuilds the file for a replaced world", () => {
    const { g, file } = fixture(); file.open(g, true); file.search("END OF REPORT 9."); expect(file.blocks).toHaveLength(1);
    g.world = generateWorld(5); file.enter(g); expect(file.query).toBe(""); expect(file.blocks[0].title).toBe("NO SERVICE RECORD");
  });
  it("handles an empty career and prevents opening a duty desk file while in flight", () => {
    const { p, world, file, g } = fixture(); p.service!.history = []; p.service!.completed = 0;
    expect(serviceFileSections(world).some(([title]) => title.startsWith("REPORT "))).toBe(false);
    file.open(g, true); expect(file.scroll).toBe(0); p.dockedAt = null; g.sceneName = "flight"; file.open(g); expect(g.sceneName).toBe("flight");
  });
});
