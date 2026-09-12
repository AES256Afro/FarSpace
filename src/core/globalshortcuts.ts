import type { Game } from "../game";
import { music } from "./music";

// A key used to finish typing or rebinding belongs to that interaction for
// the whole frame, even when it closes before the global controls run.
export function runGlobalShortcuts(g: Game, capturedAtFrameStart = false): void {
  if (capturedAtFrameStart || g.scene.capturesKeys) return;
  if (typeof document !== "undefined" && document.activeElement?.matches("input,textarea,select,[contenteditable='true']")) return;
  if (g.input.wasPressed("h")) g.toast(music.toggle() ? "MUSIC ON" : "MUSIC OFF");
  if (g.input.wasPressed("F7") && g.sceneName !== "title") g.postcard(g.postcardCaption());
}
