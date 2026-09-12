import { describe, expect, it, vi } from "vitest";
import { Game } from "../src/game";
import { generateWorld } from "../src/world";
import { LettersScene } from "../src/scenes/letters";

function fixture() {
  const world = generateWorld(398), keys = new Set<string>(), letters = new LettersScene();
  world.player.mail = [
    { from: "The oldest shipmate", dueT: 10, text: "FIRST LETTER" },
    { from: "The middle shipmate", dueT: 20, text: Array.from({ length: 130 }, (_, i) => `Paragraph ${i}: the station is quiet and the kettle is on.`).join("\n") },
    { from: "The newest shipmate", dueT: 30, text: "LAST LETTER" },
  ];
  const station = { tab: 9, returnTo: "stationwalk", enter() { this.tab = 0; this.returnTo = "flight"; } };
  const g = Object.assign(Object.create(Game.prototype), { world, scenes: { station, letters }, sceneName: "station",
    input: { wasPressed: (key: string) => keys.has(key), mousePressed: false, mouseX: 0, mouseY: 0, wheel: 0 },
    autosave: vi.fn(), load: vi.fn(),
  }) as Game;
  return { g, keys, letters, station };
}

describe("full letter reader", () => {
  it("opens the selected recent letter and marks each letter read once", () => {
    const { g, keys, letters } = fixture(); letters.open(g);
    expect(letters.mail[letters.cursor].from).toBe("The newest shipmate");
    expect(g.world.player.mail![2].read).toBe(true); expect(g.world.player.mail![0].read).toBeUndefined();
    keys.add("ArrowRight"); letters.update(g); keys.clear();
    expect(letters.mail[letters.cursor].from).toBe("The middle shipmate");
    keys.add("ArrowLeft"); letters.update(g); keys.clear();
    expect(g.autosave).toHaveBeenCalledTimes(2);
  });

  it("scrolls a long letter to its actual last paragraph and resets for another letter", () => {
    const { g, keys, letters } = fixture(); letters.open(g, 1);
    expect(letters.lines()).toHaveLength(130);
    keys.add("PageDown"); letters.update(g); keys.clear(); expect(letters.scroll).toBe(18);
    g.input.wheel = 1; for (let i = 0; i < 100; i++) letters.update(g); g.input.wheel = 0;
    expect(letters.scroll).toBe(letters.maxScroll());
    expect(letters.lines().slice(letters.scroll).at(-1)).toContain("PARAGRAPH 129");
    keys.add("ArrowRight"); letters.update(g); keys.clear();
    expect(letters.scroll).toBe(0); expect(letters.lines()).toEqual(["FIRST LETTER"]);
  });

  it("supports pointer navigation and returns to the same services tab and deck exit", () => {
    const { g, letters, station } = fixture(); letters.open(g);
    g.input.mousePressed = true; g.input.mouseX = 145; g.input.mouseY = 243; letters.update(g);
    expect(letters.cursor).toBe(1);
    g.input.mouseX = 400; letters.update(g);
    expect(g.sceneName).toBe("station"); expect(station.tab).toBe(9); expect(station.returnTo).toBe("stationwalk");
  });

  it("handles an empty mailbox and does not run the old reader after loading", () => {
    const { g, keys, letters } = fixture(); g.world.player.mail = []; letters.open(g);
    expect(letters.lines()).toEqual(["NO LETTERS HAVE ARRIVED."]); expect(g.autosave).not.toHaveBeenCalled();
    keys.add("ArrowRight"); keys.add("F9"); letters.update(g);
    expect(g.load).toHaveBeenCalledOnce(); expect(letters.cursor).toBe(0);
  });
  it("keeps the same letter and line when new mail arrives or earlier mail is removed", () => {
    const { g, keys, letters } = fixture(); letters.open(g, 1); const selected = letters.mail[letters.cursor];
    keys.add("PageDown"); letters.update(g); keys.clear();
    g.world.player.mail!.push({ from: "New arrival", dueT: 40, text: "NEW MAIL" }); letters.update(g);
    expect(letters.mail[letters.cursor]).toBe(selected); expect(letters.scroll).toBe(18); expect(g.world.player.mail!.at(-1)!.read).toBeUndefined();
    g.world.player.mail!.pop(); letters.update(g); expect(letters.mail[letters.cursor]).toBe(selected); expect(letters.scroll).toBe(18);
    g.world.player.mail!.splice(1, 1); letters.update(g); expect(letters.mail[letters.cursor].text).toBe("FIRST LETTER"); expect(letters.scroll).toBe(0);
  });
  it("supports Home and End and includes a complete sender when the header is too long", () => {
    const { g, keys, letters } = fixture(); letters.open(g, 1); keys.add("End"); letters.update(g); keys.clear(); expect(letters.scroll).toBe(letters.maxScroll());
    keys.add("Home"); letters.update(g); keys.clear(); expect(letters.scroll).toBe(0);
    const from = "LONGNAME".repeat(80); letters.mail[letters.cursor].from = from;
    expect(letters.lines().join("").replace(/\s+/g, "")).toContain(from); expect(letters.lines().every(line => line.length <= 108)).toBe(true);
  });

});
