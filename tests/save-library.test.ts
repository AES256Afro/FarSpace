import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { activeSlot, decodeSave, loadSave, SAVE_VERSION, saveKeyFor, setActiveSlot } from "../src/save";
import { clearSavedSlot, preserveSlot, readSavePreview, recoveryKeyFor, replaceSlot, restoreSlot, storeImportedWorld } from "../src/core/savelibrary";
import { generateWorld } from "../src/world";
import { Game } from "../src/game";
import { FlightScene } from "../src/scenes/flight/index";

let data: Map<string, string>, storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> };
beforeEach(() => {
  data = new Map(); storage = { getItem: vi.fn(k => data.get(k) ?? null), setItem: vi.fn((k, v) => { data.set(k, String(v)); }), removeItem: vi.fn(k => data.delete(k)) };
  vi.stubGlobal("localStorage", storage);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function raw(seed: number) { const w = generateWorld(seed); w.player.shipName = `Voyage ${seed}`; w.savedAt = seed * 1000; return JSON.stringify(w); }

describe("read-only save previews", () => {
  it("reads all three slots without changing the active slot, world bytes or cloud codes", () => {
    for (let slot = 0; slot < 3; slot++) data.set(saveKeyFor(slot), raw(417 + slot));
    data.set("farspace-cloud-code", "ABCDEFGH23"); data.set("farspace-slot", "1"); const before = [...data];
    for (let slot = 0; slot < 3; slot++) expect(readSavePreview(slot).world?.player.shipName).toBe(`Voyage ${417 + slot}`);
    expect([...data]).toEqual(before); expect(activeSlot()).toBe(1); expect(storage.setItem).not.toHaveBeenCalled();
  });
  it("refreshes a slot replaced by another tab and never labels a corrupt save empty", () => {
    data.set(saveKeyFor(0), raw(1)); expect(readSavePreview(0).world?.savedAt).toBe(1000);
    data.set(saveKeyFor(0), raw(2)); expect(readSavePreview(0).world?.savedAt).toBe(2000);
    data.set(saveKeyFor(0), "{bad"); expect(readSavePreview(0)).toMatchObject({ present: true, world: null, raw: "{bad" });
  });
  it("selects an empty slot without writing a placeholder save", () => {
    data.set(saveKeyFor(0), raw(1)); const original = data.get(saveKeyFor(0));
    expect(setActiveSlot(2)).toBe(true); expect(activeSlot()).toBe(2); expect(loadSave()).toBeNull();
    expect(data.get(saveKeyFor(0))).toBe(original); expect(data.has(saveKeyFor(2))).toBe(false);
    expect(storage.setItem.mock.calls.map(([key]) => key)).toEqual(["farspace-slot"]);
  });
  it.each([-1, .5, NaN, Infinity, 3])("refuses an invalid slot number %s", slot => { expect(setActiveSlot(slot)).toBe(false); expect(storage.setItem).not.toHaveBeenCalled(); });
  it("reports storage read and selection failures", () => {
    storage.getItem.mockImplementation(() => { throw Error("Unavailable"); }); expect(readSavePreview(0).error).toContain("unavailable");
    storage.setItem.mockImplementation(() => { throw Error("Quota"); }); expect(setActiveSlot(1)).toBe(false);
  });
});

describe("save replacement and recovery", () => {
  it.each([[0, 1], [1, 0], [1, 2], [2, 1], [0, 2], [2, 0]])("copies %s to %s and preserves each slot's cloud ownership", (from, to) => {
    const source = raw(100 + from), previous = raw(200 + to); data.set(saveKeyFor(from), source); data.set(saveKeyFor(to), previous);
    data.set("farspace-cloud-code", "ABCDEFGH23"); data.set("farspace-cloud-code-1", "BCDEFGHJ23"); data.set("farspace-cloud-code-2", "CDEFGHJK23");
    expect(replaceSlot(to, source)).toEqual({ ok: true }); expect(data.get(saveKeyFor(to))).toBe(source);
    expect(data.get(saveKeyFor(from))).toBe(source); expect(data.get(recoveryKeyFor(to))).toBe(previous);
    expect(storage.setItem.mock.calls.every(([key]) => !String(key).includes("cloud-code"))).toBe(true);
    expect(restoreSlot(to)).toEqual({ ok: true }); expect(data.get(saveKeyFor(to))).toBe(previous); expect(data.get(recoveryKeyFor(to))).toBe(source);
  });
  it("clears with a recovery copy and restores the exact bytes", () => {
    const original = raw(1); data.set(saveKeyFor(1), original);
    expect(clearSavedSlot(1)).toEqual({ ok: true }); expect(data.has(saveKeyFor(1))).toBe(false);
    expect(readSavePreview(1).recovery).toBe(true); expect(restoreSlot(1)).toEqual({ ok: true }); expect(data.get(saveKeyFor(1))).toBe(original);
  });
  it("refuses replacement when the recovery write fails", () => {
    const original = raw(1); data.set(saveKeyFor(0), original); storage.setItem.mockImplementation(() => { throw Error("Quota"); });
    expect(replaceSlot(0, raw(2))).toMatchObject({ ok: false }); expect(data.get(saveKeyFor(0))).toBe(original);
    expect(clearSavedSlot(0)).toMatchObject({ ok: false }); expect(storage.removeItem).not.toHaveBeenCalled();
  });
  it("keeps the current and recovery copies when the replacement write fails", () => {
    const original = raw(1); data.set(saveKeyFor(0), original);
    storage.setItem.mockImplementation((k, v) => { if (k === saveKeyFor(0)) throw Error("Quota"); data.set(k, v); });
    expect(replaceSlot(0, raw(2))).toMatchObject({ ok: false }); expect(data.get(saveKeyFor(0))).toBe(original); expect(data.get(recoveryKeyFor(0))).toBe(original);
  });
  it("leaves existing saves and recovery untouched for invalid input or a newer schema", () => {
    const original = raw(1); data.set(saveKeyFor(0), original); data.set(recoveryKeyFor(0), raw(2)); const before = [...data];
    expect(replaceSlot(0, "{}")).toMatchObject({ ok: false });
    const future = generateWorld(3); future.version = SAVE_VERSION + 1;
    expect(storeImportedWorld(0, future)).toMatchObject({ ok: false }); expect([...data]).toEqual(before); expect(storage.setItem).not.toHaveBeenCalled();
  });
  it("preserves damaged original bytes for export while allowing a valid replacement", () => {
    data.set(saveKeyFor(0), "{original damaged bytes"); expect(replaceSlot(0, raw(2))).toEqual({ ok: true });
    expect(data.get(recoveryKeyFor(0))).toBe("{original damaged bytes"); expect(restoreSlot(0)).toMatchObject({ ok: false }); expect(loadSave()?.seed).toBe(2);
  });
  it("keeps an empty slot empty when preparing a new voyage", () => { expect(preserveSlot(2)).toEqual({ ok: true }); expect(storage.setItem).not.toHaveBeenCalled(); });
  it("keeps the active world in memory when imported persistence fails", () => {
    const original = generateWorld(1), imported = generateWorld(2); data.set(saveKeyFor(0), JSON.stringify(original));
    storage.setItem.mockImplementation(() => { throw Error("Quota"); });
    const g = { world: original, spriteCache: new Map(), setScene: vi.fn(), toast: vi.fn() } as unknown as Game;
    expect(Game.prototype.adoptWorld.call(g, imported)).toBe(false); expect(g.world).toBe(original); expect(g.setScene).not.toHaveBeenCalled();
  });
  it("blocks autosave while title navigation owns the game", () => {
    const g = { frontend: true, world: generateWorld(1) } as unknown as Game; Game.prototype.autosave.call(g); expect(storage.setItem).not.toHaveBeenCalled();
  });
  it("reports a failed flight save without announcing success or replacing the stored copy", () => {
    const original = raw(1); data.set(saveKeyFor(0), original); storage.setItem.mockImplementation(() => { throw Error("Quota"); });
    const g = { frontend: false, world: generateWorld(2), autosave: Game.prototype.autosave, toast: vi.fn() } as unknown as Game;
    expect(Game.prototype.save.call(g)).toBe(false); expect(g.toast).toHaveBeenCalledOnce(); expect(g.toast).toHaveBeenCalledWith(expect.stringContaining("LOCAL SAVE FAILED"));
    expect(data.get(saveKeyFor(0))).toBe(original);
  });
  it("keeps the voyage paused when Save and quit cannot persist it", () => {
    const g = { world: generateWorld(2), save: vi.fn(() => false), setScene: vi.fn() } as unknown as Game;
    const scene = new FlightScene(); scene.paused = true;
    scene.pauseOptions(g).find(row => row.label === "SAVE AND QUIT TO TITLE")!.act();
    expect(g.save).toHaveBeenCalledOnce(); expect(g.setScene).not.toHaveBeenCalled(); expect(scene.paused).toBe(true);
  });
});

describe("playable save validation", () => {
  it("migrates a version-zero save without rewriting its stored bytes", () => {
    const old = JSON.parse(raw(13)); delete old.version; delete old.events; delete old.wars; delete old.econTick;
    for (const key of ["rep", "hullId", "crew", "skills", "storage", "arcs", "hints", "tutorial"]) delete old.player[key];
    for (const sys of Object.values(old.systems) as Record<string, unknown>[]) { delete sys.wrecks; delete sys.anomalies; delete sys.ly; }
    const bytes = JSON.stringify(old); data.set(saveKeyFor(0), bytes); expect(loadSave()?.version).toBe(SAVE_VERSION);
    expect(data.get(saveKeyFor(0))).toBe(bytes); expect(storage.setItem).not.toHaveBeenCalled();
  });
  it.each(["credits", "systemId", "crew", "systems", "paint"])("rejects an unusable player %s field", field => {
    const w = JSON.parse(raw(13)); w.player[field] = { unexpected: true }; expect(decodeSave(JSON.stringify(w)).world).toBeNull();
  });
});
