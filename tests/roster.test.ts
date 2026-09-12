import { describe, expect, it, vi } from "vitest";
import type { Game } from "../src/game";
import type { CrewMember } from "../src/data/crew";
import { generateWorld } from "../src/world";
import { RosterScene } from "../src/scenes/roster";

const member = (i: number): CrewMember => ({ name: `CREW ${i}`, role: "engineer", skill: 1, morale: 50, wage: 30 });
function fixture(count = 20) {
  const world = generateWorld(418), keys = new Set<string>(); world.player.crew = Array.from({ length: count }, (_, i) => member(i)); world.player.credits = 1000;
  const scene = new RosterScene(), open = vi.fn(), flight = { resumeNext: false };
  const g = { world, scenes: { flight, encounter: { open } }, input: { wasPressed: (key: string) => keys.has(key), mousePressed: false, mouseX: 0, mouseY: 0, wheel: 0 }, settingsReturn: "flight", setScene: vi.fn(), autosave: vi.fn(), toast: vi.fn() } as unknown as Game;
  scene.enter(g);
  const press = (key: string) => { keys.add(key); scene.update(g, 0); keys.clear(); };
  const click = (x: number, y: number) => { Object.assign(g.input, { mouseX: x, mouseY: y, mousePressed: true }); scene.update(g, 0); g.input.mousePressed = false; };
  return { g, scene, press, click, open, flight };
}

describe("crew roster", () => {
  it("preserves the selected person when earlier entries change and pays that person", () => {
    const { g, scene, press } = fixture(); press("End"); const selected = scene.view.selected!;
    g.world.player.crew.unshift(member(99)); press("Enter");
    expect(scene.view.selected).toBe(selected); expect(selected.morale).toBe(65); expect(g.world.player.crew[0].morale).toBe(50);
    expect(g.world.player.credits).toBe(900); expect(g.autosave).toHaveBeenCalledOnce();
    g.world.player.crew.splice(0, 3); scene.update(g, 0); expect(scene.view.selected).toBe(selected); expect(scene.view.end).toBe(g.world.player.crew.length);
  });
  it("treats duplicate names as separate people and retains review selection on return", () => {
    const { g, scene, press, open } = fixture(12); g.world.player.crew.forEach(c => c.name = "SAME NAME"); press("End");
    const selected = scene.view.selected, offset = scene.view.offset; press("v");
    expect(open).toHaveBeenCalled(); scene.enter(g); expect(scene.view.selected).toBe(selected); expect(scene.view.offset).toBe(offset);
    g.world = generateWorld(419); g.world.player.crew = [member(70)]; scene.enter(g); expect(scene.view.selected?.name).toBe("CREW 70");
  });
  it("selects a displayed row without paying, then uses the explicit action button", () => {
    const { g, scene, press, click } = fixture(); press("End"); const top = scene.view.keys[scene.view.offset];
    click(30, 40); expect(scene.view.selected).toBe(top); expect(g.world.player.credits).toBe(1000);
    click(180, 224); expect(top.morale).toBe(65); expect(g.world.player.credits).toBe(900);
    for (const [x, y] of [[30, 24], [160, 40], [100, 215], [300, 100]]) click(x, y);
    expect(g.world.player.credits).toBe(900); expect(g.setScene).not.toHaveBeenCalled();
  });
  it("keeps leave entries readable and prevents aboard actions", () => {
    const { g, scene, press, open } = fixture(0), away = member(1);
    g.world.player.shoreCrew = [{ member: away, stationId: g.world.systems[g.world.player.systemId].stations[0].id, docks: 2 }];
    scene.update(g, 0); expect(scene.details(g).join(" ")).toContain("ON LEAVE AT");
    for (const key of ["Enter", "v", "n"]) press(key);
    expect(g.world.player.credits).toBe(1000); expect(away.morale).toBe(50); expect(open).not.toHaveBeenCalled();
    g.world.player.shoreCrew = []; press("End"); press("Enter"); expect(scene.view.selected).toBeUndefined();
    press("Escape"); expect(flightState(g)).toBe(true); expect(g.setScene).toHaveBeenCalledWith("flight");
  });
  it("scrolls full details without moving crew selection and preserves detail position on return", () => {
    const { g, scene, press } = fixture(1), c = scene.view.selected!; c.trait = Array.from({ length: 180 }, (_, i) => `WORD${i}`).join(" ");
    press("ArrowRight"); expect(scene.detailScroll).toBeGreaterThan(0); expect(scene.view.selected).toBe(c);
    const position = scene.detailScroll; scene.enter(g); expect(scene.detailScroll).toBe(position);
    press("ArrowLeft"); expect(scene.detailScroll).toBe(0);
  });
});
function flightState(g: Game) { return (g.scenes.flight as unknown as { resumeNext: boolean }).resumeNext; }
