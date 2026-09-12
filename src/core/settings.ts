// Player settings that live outside the save: aim mode, key bindings, video.

const KEY = "farspace-settings";

export interface Settings {
  aim: "mouse" | "keys";
  keymap: Record<string, string>; // physical key → action key the scenes understand
  hardcore: boolean;              // applies to new games
  music: number;                  // hum volume 0..1
  sfx: number;                    // effects volume 0..1
  presence: boolean;              // share position with pilots in the same system
  hudDensity?: "full" | "compact" | "minimal";
  hudOpacity?: number;            // panel opacity, 30..100; text stays opaque
  screenFit?: "fit" | "integer"; // fit the window or use whole scale increments
  voice?: boolean;                // the ship speaks on the band (default on)
  alertOnUndock?: "green" | "yellow"; // standing order: the alert status the ship leaves the clamp at (default green)
  numberOneHails?: boolean;       // standing order: Number One acknowledges passing hails on autopilot (default on)
  numberOneTakesLeg?: boolean;    // standing order: at eight hours since the clamp Number One takes the ship (default off)
  objectsToLandings?: boolean;    // standing order: Number One objects to the captain landing, once (default on)
  keepQuietLeg?: boolean;         // standing order: when the ship asks for a quiet leg, the answer is yes (default off)
  chatter?: "quiet" | "normal" | "busy"; // how busy the comms band is (default normal)
  lanes?: "gentle" | "normal" | "rough"; // how many corsairs the lanes carry (default normal)
  whatsNewSeen?: string;          // the version whose What's New you last opened
}

export const ACTIONS: { key: string; label: string }[] = [
  { key: "w", label: "THRUST" }, { key: "s", label: "RETRO" }, { key: "a", label: "TURN LEFT" }, { key: "d", label: "TURN RIGHT" },
  { key: " ", label: "FIRE" }, { key: "r", label: "TORPEDO" }, { key: "m", label: "MINE" }, { key: "x", label: "BRAKE" },
  { key: "v", label: "DEEP SCAN" }, { key: "e", label: "INTERACT" }, { key: "i", label: "BOARD SHIP" },
  { key: "j", label: "CRUISE" }, { key: "n", label: "AUTOPILOT" }, { key: "c", label: "SEISMIC CHARGE" }, { key: "t", label: "SYSTEM CHANNEL" },
  { key: "Tab", label: "SYSTEM MAP" }, { key: "g", label: "GALAXY MAP" }, { key: "h", label: "MUSIC" }, { key: "f", label: "FULLSCREEN" },
];

function defaults(): Settings {
  let coarse = false;
  try { coarse = window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches; } catch { /* no DOM */ }
  return { aim: coarse ? "keys" : "mouse", keymap: {}, hardcore: false, music: 0.6, sfx: 0.8, presence: true };
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

// Validate presentation preferences from older or manually edited settings.
export function displaySettings() {
  const s = settings();
  return {
    hudDensity: s.hudDensity === "full" || s.hudDensity === "minimal" ? s.hudDensity : "compact" as const,
    hudOpacity: typeof s.hudOpacity === "number" && Number.isFinite(s.hudOpacity) ? Math.max(30, Math.min(100, s.hudOpacity)) : 90,
    screenFit: s.screenFit === "integer" ? "integer" as const : "fit" as const,
  };
}

export function keyLabel(k: string): string {
  return k === " " ? "SPACE" : k.length === 1 ? k.toUpperCase() : k.toUpperCase();
}

export function toggleFullscreen(el: HTMLElement): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void el.requestFullscreen?.();
}
