import { afterEach, describe, expect, it, vi } from "vitest";
import { Game } from "../src/game";
import { ReaderScene } from "../src/scenes/reader";
import { HelpScene } from "../src/scenes/help";
import { AlmanacScene } from "../src/scenes/almanac";
import { ChronicleScene } from "../src/scenes/chronicle";
import { WhatsNewScene } from "../src/scenes/whatsnew";
import { chronicleText, generateWorld } from "../src/world";
import * as wire from "../src/core/wire";
import * as searchbox from "../src/core/searchbox";

function fixture(reader = new ReaderScene("TEST", [
  ["PORT", ["Dock here", "Settle your warrant at traffic control", "The quote uses your record"]],
  ["LONG SECTION", Array.from({ length: 70 }, (_, i) => `LINE ${i}`)],
  ["LAST SECTION", ["LAST LINE"]],
])) {
  const keys = new Set<string>();
  const g = { input: { flush: vi.fn(), down: new Set<string>(), wasPressed: (k: string) => keys.has(k), wheel: 0, mousePressed: false, mouseX: 0, mouseY: 0 }, settingsReturn: "flight", setScene: vi.fn() } as unknown as Game;
  reader.enter();
  const press = (key: string) => { keys.add(key); reader.update(g); keys.clear(); };
  return { reader, g, press };
}
afterEach(() => vi.restoreAllMocks());

describe("reference readers", () => {
  it("finds body text without removing its heading or neighbouring instructions", () => {
    const { reader } = fixture(); reader.search("  WaRRaNt  ");
    expect(reader.blocks.map(b => b.title)).toEqual(["PORT"]);
    expect(reader.blocks[0].lines).toEqual(["Dock here", "Settle your warrant at traffic control", "The quote uses your record"]);
    reader.search("last section"); expect(reader.blocks[0].lines).toEqual(["LAST LINE"]);
  });
  it("handles no results and clears back to the full reference", () => {
    const { reader, press } = fixture(); reader.search("not found");
    expect(reader.blocks).toEqual([]); press("End"); expect(reader.scroll).toBe(0);
    press("Delete"); expect(reader.blocks).toHaveLength(3); expect(reader.query).toBe("");
  });
  it("reaches the end of long sections and never scrolls outside the content", () => {
    const { reader, press, g } = fixture(); press("PageDown"); expect(reader.scroll).toBeGreaterThan(24);
    press("End"); const last = reader.blocks.at(-1)!;
    expect(last.top - reader.scroll).toBeLessThan(192); expect(reader.scroll).toBe(reader.maxScroll());
    g.input.wheel = 999; reader.update(g); expect(reader.scroll).toBe(reader.maxScroll());
    g.input.wheel = 0; press("Home"); press("PageUp"); expect(reader.scroll).toBe(0);
  });
  it("jumps between headings, including the final short section", () => {
    const { reader, press } = fixture(); press("ArrowRight"); expect(reader.scroll).toBe(reader.blocks[1].top);
    press("ArrowRight"); expect(reader.scroll).toBe(reader.maxScroll());
    press("ArrowLeft"); expect(reader.scroll).toBe(reader.blocks[1].top);
    press("ArrowLeft"); expect(reader.scroll).toBe(0);
  });
  it("preserves an existing query and position when a prompt is cancelled", () => {
    const { reader, press } = fixture(); reader.search("long section"); press("PageDown");
    const before = reader.scroll; let finish!: (query: string | null) => void;
    vi.spyOn(searchbox, "openSearchBox").mockImplementation((_title, _value, callback) => { finish = callback; return () => callback(null); });
    press("/"); press("End"); expect(reader.scroll).toBe(before); finish(null); expect(reader.query).toBe("LONG SECTION"); expect(reader.scroll).toBe(before);
    press("s"); finish("warrant"); expect(reader.query).toBe("WARRANT"); expect(reader.scroll).toBe(0);
  });
  it("keeps the reader open on content clicks and supports pointer navigation and explicit back", () => {
    const { reader, g } = fixture(); g.input.mousePressed = true; g.input.mouseX = 100; g.input.mouseY = 100;
    reader.update(g); expect(g.setScene).not.toHaveBeenCalled();
    g.input.mouseX = 170; g.input.mouseY = 253; reader.update(g); expect(reader.scroll).toBeGreaterThan(0);
    g.input.mouseX = 425; g.input.mouseY = 8; reader.update(g); expect(g.setScene).toHaveBeenCalledWith("flight"); expect(g.settingsReturn).toBe("title");
  });
  it("makes the lower on-foot and general controls reachable", () => {
    const { reader, press } = fixture(new HelpScene()); press("End");
    expect(reader.blocks.at(-1)!.title).toBe("EVERYWHERE");
    expect(reader.blocks.at(-1)!.top - reader.scroll).toBeLessThan(192);
    reader.search("on foot"); expect(reader.blocks[0].lines.join(" ")).toContain("PASSENGER SEAT");
  });
  it("finds both new pursuit mechanisms in the real handbook", () => {
    const { reader } = fixture(new AlmanacScene()); reader.search("safe passage");
    expect(reader.blocks.some(b => b.title === "CORSAIR SAFE PASSAGE")).toBe(true);
    reader.search("60 SECONDS"); expect(reader.blocks.some(b => b.lines.some(l => l.includes("U ")))).toBe(true);
    reader.enter(); expect(reader.query).toBe(""); expect(reader.blocks).toHaveLength(reader.sections.length);
  });
  it("closes a pending search when another scene takes over", () => {
    const { reader, press, g } = fixture(); reader.search("long section"); press("PageDown"); const before = reader.scroll;
    const close = vi.fn();
    vi.spyOn(searchbox, "openSearchBox").mockImplementation((_title, _value, callback) => () => { close(); callback(null); });
    press("/"); reader.onSceneLeave();
    expect(close).toHaveBeenCalledOnce(); expect(reader.closeSearchBox).toBeUndefined(); expect(g.input.flush).toHaveBeenCalledOnce(); expect(reader.scroll).toBe(before);
  });
  it("restores an existing flight on return", () => {
    const { g, press } = fixture(); const flight = { resumeNext: false }; g.scenes = { flight } as unknown as Game["scenes"];
    press("Escape"); expect(flight.resumeNext).toBe(true);
  });
  it("keeps complete chronicle text searchable and leaves body clicks inert", () => {
    vi.spyOn(wire, "getCallsign").mockReturnValue(null);
    const reader = new ChronicleScene(), { g, press } = fixture(reader); g.world = generateWorld(418);
    g.world.player.log = Array.from({ length: 100 }, (_, i) => ({ t: i, text: `LOG ENTRY ${i}` }));
    reader.enter(g);
    const flat = reader.sections.flatMap(([title, lines]) => [title, ...lines]).join(" ").replace(/\s+/g, " ");
    expect(flat).toContain(chronicleText(g.world, null).toUpperCase().replace(/\s+/g, " "));
    g.input.mousePressed = true; g.input.mouseX = 80; g.input.mouseY = 70; reader.update(g); expect(g.setScene).not.toHaveBeenCalled(); g.input.mousePressed = false;
    press("End"); expect(reader.scroll).toBe(reader.maxScroll()); expect(reader.blocks.at(-1)?.lines.at(-1)).toContain("LOG ENTRY 99");
    reader.search("log entry 99"); expect(reader.blocks.some(b => b.title === "CAPTAIN'S LOG:")).toBe(true);
  });
  it("keeps old release notes reachable and searchable", () => {
    const reader = new WhatsNewScene(), { press } = fixture(reader); press("End");
    expect(reader.blocks.at(-1)?.title).toBe("0.10 - DEPTH"); expect(reader.scroll).toBe(reader.maxScroll());
    reader.search("0.261"); expect(reader.blocks[0].lines.join(" ")).toContain("FOURTEEN RECIPES");
  });
  it("wraps long headings and uninterrupted names without losing characters", () => {
    const word = "X".repeat(260), reader = new ReaderScene("TEST", [[word, [word]]]); reader.enter();
    expect(reader.blocks[0].headings.every(l => l.length <= 111)).toBe(true); expect(reader.blocks[0].lines.every(l => l.length <= 111)).toBe(true);
    expect(reader.blocks[0].lines.join("")).toBe(word); expect(reader.blocks[0].headings.join("")).toBe(word);
  });

});
