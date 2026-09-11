import { afterEach, expect, it, vi } from "vitest";
import { pull, newCode, validCode } from "../src/core/cloud";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("bounds a stalled cloud lookup and releases its timeout after failure", async () => {
  vi.useFakeTimers(); vi.stubGlobal("location", { hostname: "farspace.fsociety.work" });
  vi.stubGlobal("localStorage", { getItem: () => null });
  let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
    signal = options.signal!; signal!.addEventListener("abort", () => reject(new Error("Aborted")));
  })));
  const pending = pull("ABCDEFGH23"); await vi.advanceTimersByTimeAsync(9999); expect(signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1); expect(await pending).toBeNull(); expect(signal?.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
});
it("generates codes accepted by the API and link form for every random-byte value", () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  for (let byte = 0; byte < 256; byte++) {
    vi.stubGlobal("crypto", { getRandomValues: (buffer: Uint8Array) => { buffer.fill(byte); return buffer; } });
    const code = newCode(); expect(code).not.toBeNull(); expect(validCode(code!)).toBe(true);
    expect(code).toMatch(/^[A-Z2-7]{8,12}$/);
  }
});
it("does not report an unstored cloud code as created", () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw Error("Quota"); } });
  vi.stubGlobal("crypto", { getRandomValues: (buffer: Uint8Array) => buffer.fill(1) }); expect(newCode()).toBeNull();
});
