import { afterEach, expect, it, vi } from "vitest";
import { pull } from "../src/core/cloud";

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
