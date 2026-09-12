import { describe, expect, it, vi } from "vitest";
import type { Game } from "../src/game";
import { generateWorld, type Mission, type Poi, type Region } from "../src/world";
import { OrbitScene } from "../src/scenes/orbit";

function fixture() {
  const world = generateWorld(418), p = world.player, keys = new Set<string>(), orbit = new OrbitScene();
  p.story = 0; p.story2 = -1; p.story3 = -1; p.missions = []; p.crew = []; p.tutorial = -1;
  const sys = world.systems[p.systemId], planet = sys.planets[0], surf = planet.surface!;
  surf.regions = Array.from({ length: 20 }, (_, i): Region => ({ name: `TERRITORY ${i}`, factionId: null, resource: "ore", color: "#555555", lat: 0, lon: i * 15 }));
  surf.pois = Array.from({ length: 25 }, (_, i): Poi => ({ id: `site-${i}`, name: `SITE ${i}`, kind: "outpost", lat: 0, lon: i * 14, regionIdx: i % 20, landable: true, surveyed: false }));
  const ctx = new Proxy({}, { get: (_target, name) => name === "measureText" ? () => ({ width: 0 }) : () => {}, set: () => true }) as CanvasRenderingContext2D;
  const g = { world, scenes: { flight: { resumeNext: false } }, sceneName: "orbit", orbitPlanetIdx: 0, settingsReturn: "station", input: { wasPressed: (key: string) => keys.has(key), isDown: () => false, mousePressed: false, mouseX: 0, mouseY: 0, wheel: 0, flush: vi.fn(), down: new Set() }, toast: vi.fn(), showHint: vi.fn(), setScene: vi.fn(), save: vi.fn(), nebulaSprite: () => ({}), globeSprite: () => ({ width: 128, height: 128 }), playerShip: () => ({}) } as unknown as Game;
  orbit.enter(g);
  const draw = () => orbit.draw(g, ctx);
  const press = (key: string) => { keys.add(key); orbit.update(g, .05); keys.clear(); };
  const click = (x: number, y: number) => { Object.assign(g.input, { mousePressed: true, mouseX: x, mouseY: y }); orbit.update(g, .05); g.input.mousePressed = false; };
  return { g, p, planet, surf, orbit, keys, press, click, draw };
}

describe("orbital location menus", () => {
  it("pages all sites, retains selected identity, and lands at that exact site", () => {
    const { g, surf, orbit, press } = fixture(); press("PageDown"); expect(orbit.sel).toBe(6); expect(orbit.sites.offset).toBe(6);
    press("End"); const chosen = surf.pois.at(-1)!; expect(orbit.sites.end).toBe(25);
    surf.pois.unshift({ ...surf.pois[0], id: "new-site" }); orbit.update(g, .05); expect(orbit.sites.selected).toBe(chosen.id);
    press("e"); expect(g.landedPoiId).toBe(chosen.id); expect(g.setScene).toHaveBeenCalledWith("outpost");
  });
  it("uses the displayed row identity when a new site appears before a click", () => {
    const { surf, orbit, press, click, draw, g } = fixture(); press("PageDown"); draw(); const shown = surf.pois[6];
    surf.pois.unshift({ ...surf.pois[0], id: "inserted" }); click(260, 60);
    expect(orbit.sites.selected).toBe(shown.id); expect(g.setScene).not.toHaveBeenCalled();
  });
  it("chooses the adjacent remaining site after removal and resets for another planet object", () => {
    const { g, surf, orbit, press } = fixture(); press("PageDown"); surf.pois.splice(6, 1); orbit.update(g, .05); expect(orbit.sites.selected).toBe("site-7");
    g.world = generateWorld(419); orbit.enter(g); expect(orbit.sel).toBe(0); expect(orbit.sites.offset).toBe(0);
  });
  it("keeps territory selection separate from site landing and deploys the rover there", () => {
    const { g, orbit, press, click, draw } = fixture(); press("Tab"); press("End"); expect(orbit.regionSel).toBe(19); draw();
    press("e"); expect(g.setScene).not.toHaveBeenCalled();
    click(330, 226); expect(g.landedRegionIdx).toBe(19); expect(g.setScene).toHaveBeenCalledWith("surface");
  });
  it("leaves headers and margins inert and maps each visible row exactly once", () => {
    const { orbit, click, draw, g } = fixture(); draw();
    for (const [x, y] of [[245, 54], [475, 70], [265, 189], [300, 27]]) click(x, y);
    expect(orbit.sel).toBe(0); expect(g.setScene).not.toHaveBeenCalled();
    click(260, 78); expect(orbit.sel).toBe(1); expect(g.setScene).not.toHaveBeenCalled();
  });
  it("shows full location and quest instructions without entering the parent again", () => {
    const { g, p, surf, orbit, press, planet } = fixture(); press("End"); const site = surf.pois[24]; site.name = "LONG ".repeat(40);
    p.story = 2; p.storyTarget = { systemId: p.systemId, planetIdx: 0, poiId: site.id }; press("q");
    const position = { selected: orbit.sites.selected, offset: orbit.sites.offset, rotation: orbit.rot }, before = JSON.stringify(g.world);
    press("i"); expect(orbit.info?.sections[0][0]).toBe(site.name.toUpperCase()); expect(orbit.info?.sections.some(([title]) => title === "THE SIGNAL: THE VAULT")).toBe(true);
    press("End"); press("Escape"); expect(orbit.info).toBeUndefined(); expect(g.setScene).not.toHaveBeenCalled(); expect(g.settingsReturn).toBe("station");
    expect({ selected: orbit.sites.selected, offset: orbit.sites.offset, rotation: orbit.rot }).toEqual(position); expect(JSON.stringify(g.world)).toBe(before);
    expect(planet.surface!.pois[24].id).toBe(position.selected);
  });
  it("lists every objective at the planet, including objectives without an exact site", () => {
    const { p, orbit, press, g } = fixture(), st = g.world.systems[p.systemId].stations[0];
    p.missions = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, title: `Survey ${i}`, desc: "", kind: "ground", fromStationId: st.id, targetStationId: st.id, targetSystemId: p.systemId, accepted: true, done: false, reward: 100, groundPlanetIdx: 0, groundGoal: "flora", groundNeed: i + 1, groundDone: 0 } as Mission));
    press("o"); expect(orbit.info?.sections).toHaveLength(13); expect(orbit.info?.sections.at(-1)?.[0]).toBe("SURVEY 11");
  });
  it("handles empty sites and territories without invalid selection or landing", () => {
    const { g, surf, orbit, press, draw } = fixture(); surf.pois = []; surf.regions = [];
    for (const key of ["ArrowDown", "ArrowUp", "End", "PageDown", "]", "l", "e"]) press(key);
    expect(orbit.sel).toBe(0); expect(orbit.regions.index).toBe(0); expect(g.setScene).not.toHaveBeenCalled(); expect(() => draw()).not.toThrow();
  });
  it("preserves hostile territory and military landing restrictions", () => {
    const { g, p, surf, press } = fixture(); surf.pois[0].kind = "defense"; press("e"); expect(g.setScene).not.toHaveBeenCalled();
    surf.pois[0].kind = "outpost"; const faction = g.world.systems[p.systemId].factionId; surf.regions[0].factionId = faction; p.rep[faction] = -50;
    press("e"); press("l"); expect(g.setScene).not.toHaveBeenCalled(); expect(g.toast).toHaveBeenCalledWith("LANDING DENIED - REGION HOSTILE TO YOU");
  });
  it("requires a fresh landing action if the selected site disappears in that frame", () => {
    const { surf, orbit, press, g } = fixture(); press("PageDown"); surf.pois.splice(6, 1); press("e");
    expect(orbit.sites.selected).toBe("site-7"); expect(g.setScene).not.toHaveBeenCalled(); press("e"); expect(g.landedPoiId).toBe("site-7");
  });
  it("clears a surface hint on return to orbit without losing site selection", () => {
    const { orbit, press, g } = fixture(); press("End"); g.hint = "OLD RUIN INSTRUCTIONS"; orbit.enter(g);
    expect(g.hint).toBe(""); expect(orbit.sites.selected).toBe("site-24");
  });

});
