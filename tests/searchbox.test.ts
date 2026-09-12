// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { openSearchBox } from "../src/core/searchbox";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
describe("reader search input", () => {
  it("cancels a nonempty search on the first Escape without passing it to the game", () => {
    const done = vi.fn(), gameKey = vi.fn(); window.addEventListener("keydown", gameKey);
    try {
      const close = openSearchBox("TEST", "EXISTING SEARCH", done), input = document.querySelector("input")!;
      const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }); input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true); expect(document.querySelector("dialog")).toBeNull(); expect(done).toHaveBeenCalledWith(null); expect(gameKey).not.toHaveBeenCalled();
      close(); expect(done).toHaveBeenCalledOnce();
    } finally { window.removeEventListener("keydown", gameKey); }
  });
  it("submits the complete value once and keeps ordinary typing inside the form", () => {
    const done = vi.fn(), gameKey = vi.fn(); window.addEventListener("keydown", gameKey);
    try {
      openSearchBox("TEST", "", done); const input = document.querySelector("input")!; input.value = "crew log";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "r", bubbles: true })); expect(gameKey).not.toHaveBeenCalled();
      document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      expect(done).toHaveBeenCalledOnce(); expect(done).toHaveBeenCalledWith("crew log"); expect(document.querySelector("dialog")).toBeNull();
    } finally { window.removeEventListener("keydown", gameKey); }
  });
});
