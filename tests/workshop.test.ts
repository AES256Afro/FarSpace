import { describe, expect, it, vi } from "vitest";
import { mine } from "../src/scenes/flight/ai";
import { FlightScene } from "../src/scenes/flight/index";
import type { Game } from "../src/game";
import { generateWorld } from "../src/world";
import { decodeSave, SAVE_VERSION } from "../src/save";
import { MATERIALS, materialCap, addMaterials } from "../src/data/engineering";
import { RECIPES, TECHNOLOGIES, workshop, startResearch, enqueue, tickWorkshop, recipeReason, useFuelCells, validWorkshopState } from "../src/core/workshop";
import { crackRock, collectRock, hasMiningRemains, rockMaterials, aimedRock } from "../src/core/mining";
import { prepareSalvage, salvageReason } from "../src/core/salvage";

function fixture() {
  const w = generateWorld(429), p = w.player;
  p.materials = Object.fromEntries(MATERIALS.map(m => [m.id, 60]));
  p.cargo = { ore: 20, metals: 12, parts: 10, water: 8, food: 4, med: 4, data: 5, relics: 2 }; p.cargoMax = 150;
  p.modules = []; const s = workshop(p);
  return { w, p, s };
}
function work(p: ReturnType<typeof fixture>["p"], seconds: number) { const messages: string[] = []; for (let i = 0; i < seconds * 4; i++) messages.push(...tickWorkshop(p, 0.25)); return messages; }

describe("workshop production and research", () => {
  it("starts with a material recipe that frees salvage storage and produces usable parts", () => {
    const { p, s } = fixture(), parts = p.cargo.parts;
    expect(enqueue(p, "parts")).toBeNull(); expect(p.materials!.nickel).toBe(60);
    work(p, 3); expect(p.cargo.parts).toBe(parts); expect(s.queue[0].progress).toBe(3);
    work(p, 3); expect(p.cargo.parts).toBe(parts + 1); expect(p.materials!.nickel).toBe(57); expect(p.materials!.carbon).toBe(58);
    work(p, 100); expect(p.cargo.parts).toBe(parts + 1); expect(s.queue).toEqual([]);
  });
  it("checks prerequisite research, consumes its cost once and unlocks fabrication", () => {
    const { p, s } = fixture(); expect(startResearch(p, "automation")).toContain("Fabrication");
    expect(enqueue(p, "data")).toContain("Fabrication"); expect(startResearch(p, "fabrication")).toBeNull();
    expect(startResearch(p, "fabrication")).toContain("current research"); work(p, 20);
    expect(s.research).toEqual(["fabrication"]); expect(p.materials!.nickel).toBe(56); expect(enqueue(p, "data")).toBeNull();
    expect(startResearch(p, "fabrication")).toContain("complete");
  });
  it("pauses for missing inputs without losing progress or spending the other ingredients", () => {
    const { p, s } = fixture(); enqueue(p, "parts"); work(p, 2); p.materials!.carbon = 0;
    work(p, 10); expect(s.queue[0].progress).toBe(2); expect(p.materials!.nickel).toBe(60);
    p.materials!.carbon = 2; work(p, 4); expect(s.queue).toEqual([]); expect(p.materials!.carbon).toBe(0);
  });
  it("pauses when output cannot fit and resumes without losing any batch", () => {
    const { p, s } = fixture(); p.cargo = {}; p.cargoMax = 1; enqueue(p, "parts"); work(p, 5);
    p.cargo.ore = 1; work(p, 10); expect(s.queue[0].progress).toBe(5); expect(p.materials!.nickel).toBe(60);
    delete p.cargo.ore; work(p, 1); expect(p.cargo.parts).toBe(1); expect(s.queue).toEqual([]);
  });
  it("can refine a full hold because the inputs free enough output space", () => {
    const { p } = fixture(); p.cargo = { ore: 3 }; p.cargoMax = 3;
    expect(enqueue(p, "refine")).toBeNull(); work(p, 5); expect(p.cargo).toEqual({ ore: 0, metals: 1 });
  });
  it("bounds automatic batches and jobs and executes each batch once", () => {
    const { p, s } = fixture(); expect(enqueue(p, "parts", 5)).toContain("Production control");
    s.research = ["fabrication", "automation"]; expect(enqueue(p, "parts", 21)).toContain("20");
    for (let i = 0; i < 5; i++) expect(enqueue(p, "parts", 2)).toBeNull();
    expect(enqueue(p, "parts")).toContain("Queue full"); const before = p.cargo.parts; work(p, 60);
    expect(s.queue).toEqual([]); expect(p.cargo.parts).toBe(before + 10); expect(p.materials!.nickel).toBe(30);
  });
  it("allows cancellation and pause without consuming reserved ingredients", () => {
    const { p, s } = fixture(); enqueue(p, "parts"); startResearch(p, "fabrication"); work(p, 2);
    s.paused = true; work(p, 100); expect(s.queue[0].progress).toBe(2); expect(s.project!.progress).toBe(2);
    s.queue = []; delete s.project; s.paused = false; work(p, 100); expect(p.materials!.nickel).toBe(60);
  });
  it("does not spend shared inputs twice when research and production finish together", () => {
    const { p, s } = fixture(); p.materials = { nickel: 4, carbon: 4 }; startResearch(p, "fabrication"); enqueue(p, "parts");
    s.project!.progress = 19.75; s.queue[0].progress = 5.75; tickWorkshop(p, 0.25);
    expect(s.research).toEqual(["fabrication"]); expect(s.queue).toHaveLength(1); expect(p.materials.nickel).toBe(0);
  });
  it("requires docking for module construction and never produces duplicate fittings", () => {
    const { p, s } = fixture(); s.research = ["fabrication", "metallurgy", "mining", "automation"]; p.dockedAt = null;
    expect(enqueue(p, "collector")).toContain("Dock"); p.dockedAt = "test-port"; expect(enqueue(p, "collector")).toBeNull();
    expect(enqueue(p, "collector")).toContain("Only one"); work(p, 5); p.dockedAt = null; work(p, 30); expect(p.modules).toEqual([]);
    p.dockedAt = "test-port"; work(p, 15); expect(p.modules).toEqual(["collector"]); expect(enqueue(p, "collector")).toContain("Already fitted");
  });
  it("expands material capacity consistently for pickups and exterior salvage", () => {
    const { p, s, w } = fixture(); expect(materialCap(p)).toBe(60); const wreck = w.systems[p.systemId].wrecks[0];
    wreck.looted = false; wreck.boarding = undefined; const part = prepareSalvage(wreck, w.seed).parts.find(x => x.store === "materials")!;
    expect(salvageReason(wreck, part, p)).toContain("60 EACH"); s.research = ["fabrication", "metallurgy", "storage"];
    expect(materialCap(p)).toBe(120); expect(salvageReason(wreck, part, p)).toBeNull();
    addMaterials(p, { [part.resource]: 80 }); expect(p.materials![part.resource]).toBe(120);
  });
  it("stores research and production progress and migrates existing voyages without gifts", () => {
    const { p, w, s } = fixture(); w.version = SAVE_VERSION; startResearch(p, "fabrication"); enqueue(p, "parts"); work(p, 2);
    const read = decodeSave(JSON.stringify(w)); expect(read.error).toBeNull(); expect(read.world!.player.workshop).toEqual(s);
    delete p.workshop; w.version = 15; const cargo = { ...p.cargo }; const old = decodeSave(JSON.stringify(w));
    expect(old.world!.version).toBe(SAVE_VERSION); expect(old.world!.player.workshop).toBeUndefined(); expect(old.world!.player.cargo).toEqual(cargo);
  });
  it.each([null, {}, { research: ["made-up"], queue: [], paused: false }, { research: [], queue: [{ recipe: "parts", remaining: -1, progress: 0 }], paused: false }, { research: [], queue: [], paused: false, project: { id: "fabrication", progress: -1 } }])("rejects malformed saved jobs: %j", value => {
    const { w } = fixture(); w.player.workshop = value as any; expect(validWorkshopState(value)).toBe(false); expect(decodeSave(JSON.stringify(w)).world).toBeNull();
  });
  it("spends fuel cells only when the tank has room for the complete transfer", () => {
    const { p } = fixture(); p.cargo.fuel = 1; p.fuel = p.fuelMax - 9;
    expect(useFuelCells(p)).toContain("room"); expect(p.cargo.fuel).toBe(1); p.fuel--; useFuelCells(p); expect(p.fuel).toBe(p.fuelMax); expect(p.cargo.fuel).toBe(0);
  });
  it("gives every material a crafting use and every technology a reachable parent", () => {
    for (const m of MATERIALS) expect(RECIPES.some(r => r.cost.materials?.[m.id])).toBe(true);
    for (const t of TECHNOLOGIES) { const seen = new Set<string>(); let node = t; while (node.parent) { expect(seen.has(node.id)).toBe(false); seen.add(node.id); node = TECHNOLOGIES.find(p => p.id === node.parent)!; expect(node).toBeDefined(); } }
  });
});

describe("mining deposits", () => {
  it("stops the actual mining beam for a full hold and cracks the selected rock only once", () => {
    const { w, p } = fixture(), fs = new FlightScene(), a = w.systems[p.systemId].asteroids[0];
    const g = { world: w, toast: vi.fn() } as unknown as Game;
    w.systems[p.systemId].asteroids = [a]; p.x = a.x - 60; p.y = a.y; a.ore = 0.01; a.core = false; p.cargoMax = 0;
    mine(fs, g, 0.05, 1, 0); expect(a.ore).toBe(0.01); expect(g.toast).toHaveBeenCalledWith(expect.stringContaining("HOLD FULL"));
    p.cargo = {}; p.cargoMax = 10; const before = p.mined ?? 0; mine(fs, g, 0.05, 1, 0);
    expect(a.ore).toBe(0); const after = p.mined; expect(after).toBeGreaterThan(before);
    mine(fs, g, 0.05, 1, 0); expect(p.mined).toBe(after); expect(a.miningRemains!.cargo.ore).toBe(a.rich ? 3 : 1);
  });
  it("keeps core ore and rare materials available when collection is full", () => {
    const { w, p } = fixture(), a = w.systems[p.systemId].asteroids[0]; a.core = true;
    p.x = a.x; p.y = a.y; p.cargoMax = 0; crackRock(p, a);
    expect(a.miningRemains!.cargo.ore).toBeGreaterThanOrEqual(6); expect(a.miningRemains!.cargo.metals).toBeGreaterThanOrEqual(2);
    const stock = JSON.stringify(a.miningRemains); collectRock(p, a); expect(JSON.stringify(a.miningRemains)).toBe(stock);
    expect(a.miningRemains!.materials).toEqual(rockMaterials(a));
  });
  it("gives stable mineral yields and guarantees useful common material", () => {
    const { w, p } = fixture(), a = w.systems[p.systemId].asteroids[0];
    expect(rockMaterials(a)).toEqual(rockMaterials({ ...a })); expect(rockMaterials(a).iron).toBeGreaterThan(0);
    expect(rockMaterials({ ...a, rich: true }).vanadium).toBe(1);
  });
  it("retains material overflow and cargo through a save until there is room", () => {
    const { w, p } = fixture(), a = w.systems[p.systemId].asteroids[0]; p.x = a.x; p.y = a.y; p.cargoMax = 0;
    crackRock(p, a); const before = JSON.stringify(a.miningRemains); expect(collectRock(p, a)).toEqual({ cargo: 0, materials: 0 });
    expect(JSON.stringify(a.miningRemains)).toBe(before); w.version = SAVE_VERSION;
    const loaded = decodeSave(JSON.stringify(w)).world!; const rock = loaded.systems[p.systemId].asteroids[0];
    loaded.player.materials = {}; loaded.player.cargo = {}; loaded.player.cargoMax = 20;
    const got = collectRock(loaded.player, rock); expect(got.cargo).toBeGreaterThan(0); expect(got.materials).toBeGreaterThan(0);
    expect(hasMiningRemains(rock)).toBe(false); expect(collectRock(loaded.player, rock)).toEqual({ cargo: 0, materials: 0 });
  });
  it("partially collects cargo and leaves the rest at the rock", () => {
    const { w, p } = fixture(), a = w.systems[p.systemId].asteroids[0]; a.rich = true; p.x = a.x; p.y = a.y; p.cargo = {}; p.cargoMax = 1;
    crackRock(p, a); collectRock(p, a); expect(p.cargo.ore).toBe(1); expect(a.miningRemains!.cargo.ore).toBe(2);
  });
  it("uses collector range and refinery output without destroying overflow", () => {
    const { w, p } = fixture(), a = w.systems[p.systemId].asteroids[0]; a.rich = false; p.x = a.x + 200; p.y = a.y; p.modules = ["refinery"]; p.cargo = {};
    crackRock(p, a); expect(a.miningRemains!.cargo.metals).toBe(1); expect(collectRock(p, a).cargo).toBe(0);
    p.modules.push("collector"); expect(collectRock(p, a).cargo).toBe(1);
  });
  it("uses the nearest rock in the mining cone for both aim and extraction", () => {
    const { w, p } = fixture(), a = w.systems[p.systemId].asteroids[0]; p.x = p.y = 0;
    const near = { ...a, x: 50, y: 0, ore: 2 }, far = { ...a, x: 80, y: 0, ore: 2 };
    expect(aimedRock([far, near], p, 0, 90)).toBe(near); expect(aimedRock([near], p, Math.PI, 90)).toBeNull();
  });
});
