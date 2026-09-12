import { afterEach, describe, expect, it, vi } from "vitest";
import { Game } from "../src/game";
import { generateWorld } from "../src/world";
import { FlightScene } from "../src/scenes/flight/index";
import { flightDisplay, flightRecordSections } from "../src/scenes/flight/display";
import { flightInteraction } from "../src/scenes/flight/interaction";
import { drawEdgeMarkers } from "../src/scenes/flight/render";
import { renderFlightHud, flightHudBounds } from "../src/scenes/flight/hud";
import { updateVoyageSystems } from "../src/core/runtime";
import * as font from "../src/gfx/font";
import { PAL } from "../src/gfx/palette";
import { saveSettings } from "../src/core/settings";
import * as wire from "../src/core/wire";

afterEach(() => { vi.restoreAllMocks(); saveSettings({hudDensity:"compact",hudOpacity:90}); });
function fixture() {
  vi.spyOn(wire, "getCallsign").mockReturnValue(null);
  const world = generateWorld(419), p = world.player, fs = new FlightScene(), keys = new Set<string>();
  Object.assign(p, { tutorial: -1, story: 99, story2: -1, story3: -1, crew: [], missions: [], x: 50000, y: 50000, vx: 0, vy: 0, dockedAt: null });
  const g = Object.assign(Object.create(Game.prototype), { world, sceneName: "flight", scenes: { flight: fs }, hint: "", toastMsg: "", toastTimer: 0, input: { wasPressed: (key: string) => keys.has(key), isDown: () => false, down: new Set(), flush: vi.fn(), mousePressed: false, mouseX: 0, mouseY: 0, wheel: 0 }, autosave: vi.fn(), toast: vi.fn() }) as Game;
  const press = (key: string) => { keys.add(key); fs.update(g, .05); keys.clear(); };
  return { g, fs, p, sys: world.systems[p.systemId], keys, press };
}

describe("flight display priorities", () => {
  it.each(["full", "compact", "minimal"] as const)("keeps direction, course, fuel, pursuit and rescue readable in %s while lessons and chatter wait", mode => {
    saveSettings({hudDensity:mode});
    const { g, fs, p, sys } = fixture(); p.tutorial = 1; p.fuel = 4; p.navTarget = sys.links[0]; p.angle = 0; p.vx = 0; p.vy = -20; fs.mouseAim = true; fs.aim = Math.PI;
    vi.spyOn(fs, "lawStatus").mockReturnValue("WARRANT: BREAK CONTACT / U TRAFFIC CONTROL");
    fs.npcs.push({ kind: "trader", name: "Aid vessel", hull: 10, hullMax: 100, x: p.x + 30, y: p.y, vx: 0, vy: 0, angle: 0, fireCd: 0, targetIdx: 0 });
    fs.comms.push({ from: "GALLEY", text: "A complete ordinary message", life: 8, color: PAL.grey });
    const before = JSON.stringify(g.world), d = flightDisplay(fs, g);
    expect(d.urgent).toBe(true); expect(d.notices[0].text).toContain("WARRANT"); expect(d.notices[1].text).toContain("LOW FUEL"); expect(d.activity[0].text).toContain("NEEDS HELP"); expect(d.action).toContain("E OFFER HELP");
    expect([d.nose, d.drift, d.aim]).toEqual(["090 E", "000 N", "270 W"]); expect(d.route).toContain(g.world.systems[p.navTarget!].name); expect(d.tutorial).toContain("DOCK AT THE STATION"); expect(JSON.stringify(g.world)).toBe(before);
    fs.recordComms(g.world.time); expect(JSON.stringify(flightRecordSections(fs, g))).toContain("A complete ordinary message");
    const draw = vi.spyOn(font, "drawText").mockImplementation(() => {});
    const ctx = new Proxy({}, { get: () => () => {}, set: () => true }) as CanvasRenderingContext2D;
    renderFlightHud(fs, g, ctx);
    const texts = draw.mock.calls.map(c => String(c[1]));
    expect(texts.some(t => t.includes("GALLEY"))).toBe(false); expect(texts.some(t => t.includes("FUEL 4/"))).toBe(true); expect(texts.filter(t => t.startsWith("E "))).toHaveLength(1);
    for (const [, text, x, y] of draw.mock.calls) { expect(Number(x)).toBeGreaterThanOrEqual(0); expect(Number(x) + font.textWidth(String(text))).toBeLessThanOrEqual(480); expect(Number(y)).toBeLessThanOrEqual(264); }
  });
  it("keeps bearings independent of zoom and marks stopped drift without inventing a direction", () => {
    const { g, fs, p } = fixture(); p.angle = -Math.PI / 2; p.vx = 30; p.vy = 0;
    fs.zoom = .25; const a = flightDisplay(fs, g); fs.zoom = 2; const b = flightDisplay(fs, g); expect([a.nose, a.drift]).toEqual([b.nose, b.drift]);
    p.vx = 0; expect(flightDisplay(fs, g).drift).toBe("STOPPED"); p.vx = 1; expect(flightDisplay(fs, g).drift).toBe("<2 M/S");
  });
  it("clears departed rescue and deleted destination text without moving the ship or cancelling its course during draw", () => {
    const { g, fs, p, sys } = fixture(); const wreck = { id: "gone", name: "Temporary hull", x: p.x, y: p.y, looted: false, hazard: 0, loot: [] }; sys.wrecks.push(wreck); fs.localTarget = { systemId: sys.id, id: "wreck:gone" }; fs.autopilot = true;
    expect(flightDisplay(fs, g).route).toContain(wreck.name); sys.wrecks.pop(); const before = JSON.stringify(g.world); const d = flightDisplay(fs, g);
    expect(d.route).toContain("UNAVAILABLE"); expect(d.action).not.toContain(wreck.name); expect(fs.autopilot).toBe(true); expect(JSON.stringify(g.world)).toBe(before);
  });
  it("does not clean up a stale station assignment while displaying the course", () => {
    const { g, fs, p } = fixture(); p.navStationId = "removed-station";
    const before = JSON.stringify(g.world); flightDisplay(fs, g); expect(JSON.stringify(g.world)).toBe(before); expect(p.navStationId).toBe("removed-station");
  });
  it("clears expired law status and brings the lesson back", () => {
    const { g, fs, p } = fixture(); p.tutorial = 1; p.fuel = 2;
    const law = vi.spyOn(fs, "lawStatus").mockReturnValue("WARRANT COOLDOWN: 1S / U SETTLE");
    expect(flightDisplay(fs, g).urgent).toBe(true); law.mockReturnValue(null); p.fuel = 80;
    const d = flightDisplay(fs, g); expect(d.urgent).toBe(false); expect(d.notices.some(n => n.text.includes("WARRANT"))).toBe(false); expect(d.tutorial).toContain("FLIGHT SCHOOL");
  });

  it("gives a nearby seismic charge priority and clears the instruction once safe", () => {
    const { g, fs, p } = fixture(); fs.charges.push({ ax: p.x, ay: p.y, t: 3 });
    const danger = flightDisplay(fs, g); expect(danger.notices[0].text).toContain("SEISMIC CHARGE"); expect(danger.action).toContain("BEYOND 120M");
    p.x += 150; expect(flightDisplay(fs, g).action).not.toContain("DETONATES");
  });

});

describe("flight interaction selection", () => {
  it("uses the same priority for prompt and E with rescue, pirate and dock together", () => {
    const { g, fs, p, sys } = fixture(), st = sys.stations[0]; st.angle = 0; st.orbit = p.x; p.y = 0;
    const trader = { kind: "trader" as const, hull: 10, hullMax: 100, x: p.x + 10, y: 0, vx: 0, vy: 0, angle: 0, fireCd: 0, targetIdx: 0 };
    const pirate = { ...trader, kind: "pirate" as const, hull: 100 }; fs.npcs = [trader, pirate]; vi.spyOn(fs, "piratesFriendly").mockReturnValue(false);
    const help = vi.spyOn(fs, "offerHelp").mockImplementation(() => {}), parley = vi.spyOn(fs, "parley").mockImplementation(() => {}), dock = vi.spyOn(fs, "dockAt").mockImplementation(() => {});
    expect(flightInteraction(fs, g)?.kind).toBe("help"); fs.tryInteract(g); expect(help).toHaveBeenCalledWith(g, trader); expect(dock).not.toHaveBeenCalled();
    trader.hull = 100; expect(flightInteraction(fs, g)?.kind).toBe("parley"); fs.tryInteract(g); expect(parley).toHaveBeenCalledWith(g, pirate);
    pirate.hull = 0; expect(flightInteraction(fs, g)?.kind).toBe("station"); fs.tryInteract(g); expect(dock).toHaveBeenCalledWith(g, st);
  });
  it("explains insufficient jump fuel and drops the prompt after leaving range", () => {
    const { g, fs, p, sys } = fixture(), gate = sys.jumpPoints[0]; Object.assign(p, { x: gate.x, y: gate.y, fuel: 0 });
    expect(flightInteraction(fs, g)?.prompt).toContain("NEED"); const jump = vi.spyOn(fs, "doJump").mockImplementation(() => {}); fs.tryInteract(g); expect(jump).toHaveBeenCalledWith(g, gate.targetSystemId, gate.guarded);
    p.x = 50000; p.y = 50000; expect(flightInteraction(fs, g)).toBeNull();
  });
  it("keeps a busy repair job from offering another rescue ahead of the dock", () => {
    const { g, fs, p, sys } = fixture(), st = sys.stations[0]; st.angle = 0; st.orbit = p.x; p.y = 0;
    const trader = { kind: "trader" as const, hull: 10, hullMax: 100, x: p.x, y: 0, vx: 0, vy: 0, angle: 0, fireCd: 0, targetIdx: 0 };
    fs.npcs = [trader]; fs.repairJob = { npc: trader, crewName: "Engineer", kind: "repair", progress: .5, need: 1, wave: 0 };
    expect(flightInteraction(fs, g)?.kind).toBe("station");
  });

});

describe("complete flight record", () => {
  it("retains full messages, notices and lesson text while pausing all voyage updates", () => {
    const { g, fs, p, press } = fixture(); p.tutorial = 1;
    fs.comms = Array.from({ length: 40 }, (_, i) => ({ from: `CREW ${i}`, text: `Message ${i} ${"word ".repeat(80)}FINAL ${i}`, life: 8, color: PAL.grey }));
    g.toastMsg = "TOAST CONTENT"; g.toastTimer = 5; g.hint = "HINT CONTENT";
    press("l"); expect(fs.touchMode).toBe("menu"); expect(fs.logOpen).toBe(true); expect(fs.pausesVoyage).toBe(true); const before = JSON.stringify(g.world), population = fs.npcs;
    for (let i = 0; i < 120; i++) { fs.update(g, .05); updateVoyageSystems(g, .05); }
    expect(JSON.stringify(g.world)).toBe(before); expect(fs.npcs).toBe(population);
    const content = JSON.stringify(fs.logReader!.sections); expect(content).toContain("FINAL 39"); expect(content).toContain("TOAST CONTENT"); expect(content).toContain("HINT CONTENT"); expect(content).toContain("FLIGHT SCHOOL");
    press("End"); expect(fs.logReader!.scroll).toBe(fs.logReader!.maxScroll()); fs.logReader!.search("FINAL 39"); expect(fs.logReader!.blocks).toHaveLength(1);
    press("Escape"); expect(fs.logReader).toBeUndefined(); expect(fs.logOpen).toBe(false); expect(fs.pausesVoyage).toBe(false); expect(fs.touchMode).toBe("flight");
  });
  it("does not repeat a held notice and cleans search on external scene changes", () => {
    const { g, fs } = fixture(); g.toastMsg = "One notice"; g.toastTimer = 3;
    fs.recordNotices(g); fs.recordNotices(g); expect(fs.commsLog).toHaveLength(1); g.toastTimer = 0; fs.recordNotices(g); g.toastTimer = 3; fs.recordNotices(g); expect(fs.commsLog).toHaveLength(2);
    fs.openFlightRecord(g); const close = vi.fn(); fs.logReader!.closeSearchBox = close; fs.onSceneLeave(); expect(close).toHaveBeenCalledOnce(); expect(fs.logReader).toBeUndefined(); expect(fs.logOpen).toBe(false);
  });
});


it("opens the record from the same button in every density and gives space back without changing the voyage", () => {
  const { g, fs } = fixture();
  fs.alert = 1;
  fs.comms.push({ from: "CREW", text: "Ordinary chatter", life: 8, color: PAL.grey });
  const before = JSON.stringify(g.world), heights: number[] = [];
  vi.spyOn(font, "drawText").mockImplementation(() => {});
  for (const mode of ["full", "compact", "minimal"] as const) {
    saveSettings({ hudDensity: mode, hudOpacity: 30 });
    const fillRect = vi.fn();
    const ctx = new Proxy({fillRect}, {get: (obj, key) => key === "fillRect" ? obj.fillRect : () => {}, set: () => true}) as unknown as CanvasRenderingContext2D;
    renderFlightHud(fs, g, ctx);
    heights.push(fillRect.mock.calls.filter(([x,,w]) => x === 0 && w === 480).reduce((sum,[,,,h]) => sum + h, 0));
    expect(JSON.stringify(g.world)).toBe(before);
    Object.assign(g.input, {mousePressed:true,mouseX:447,mouseY:20});
    fs.update(g,0); expect(fs.logOpen).toBe(true);
    expect(JSON.stringify(fs.logReader!.sections)).toContain("YELLOW ALERT");
    fs.onSceneLeave(); g.input.mousePressed = false;
  }
  expect(heights[1]).toBeLessThan(heights[0]); expect(heights[2]).toBeLessThan(heights[1]);
});


it.each(["full", "compact", "minimal"] as const)("keeps edge destination labels clear of the %s HUD", mode => {
  const { g, fs, p, sys } = fixture(); saveSettings({hudDensity:mode,hudOpacity:30}); p.hull=20;p.fuel=4;
  sys.jumpPoints[0].x=p.x;sys.jumpPoints[0].y=p.y-10000;
  const draw=vi.spyOn(font,"drawText").mockImplementation(()=>{});
  const ctx=new Proxy({}, {get:()=>()=>{},set:()=>true}) as CanvasRenderingContext2D;
  const bounds=flightHudBounds(flightDisplay(fs,g),false);
  drawEdgeMarkers(fs,g,ctx,p.x-240,p.y-135,1);
  expect(draw.mock.calls.some(([,text])=>String(text).startsWith("GATE"))).toBe(true);
  for (const [,,,y] of draw.mock.calls) { expect(y).toBeGreaterThanOrEqual(bounds.top);expect(Number(y)+5).toBeLessThan(bounds.bottom); }
});
