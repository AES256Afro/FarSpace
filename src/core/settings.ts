// Player settings that live outside the save: aim mode, key bindings, video.

const KEY = "farspace-settings";

export interface Settings {
  aim: "mouse" | "keys";
  keymap: Record<string, string>; // physical key → action key the scenes understand
}

export const ACTIONS: { key: string; label: string }[] = [
  { key: "w", label: "THRUST" }, { key: "s", label: "RETRO" }, { key: "a", label: "TURN LEFT" }, { key: "d", label: "TURN RIGHT" },
  { key: " ", label: "FIRE" }, { key: "r", label: "TORPEDO" }, { key: "m", label: "MINE" }, { key: "x", label: "BRAKE" },
  { key: "v", label: "DEEP SCAN" }, { key: "e", label: "INTERACT" }, { key: "i", label: "BOARD SHIP" },
  { key: "Tab", label: "SYSTEM MAP" }, { key: "g", label: "GALAXY MAP" }, { key: "h", label: "MUSIC" }, { key: "f", label: "FULLSCREEN" },
];

function defaults(): Settings {
  let coarse = false;
  try { coarse = window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches; } catch { /* no DOM */ }
  return { aim: coarse ? "keys" : "mouse", keymap: {} };
}

let cached: Settings | null = null;

export function settings(): Settings {
  if (cached) return cached;
  cached = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(cached, JSON.parse(raw));
  } catch { /* ignore */ }
  return cached;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const s = Object.assign(settings(), patch);
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  return s;
}

export function keyLabel(k: string): string {
  return k === " " ? "SPACE" : k.length === 1 ? k.toUpperCase() : k.toUpperCase();
}

export function toggleFullscreen(el: HTMLElement): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void el.requestFullscreen?.();
}
