// Procedural sound effects — WebAudio, no assets. Context resumes on first
// user gesture (browser autoplay policy).

import { settings } from "./settings";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
// music is routed through the master bus too, so effects get their own gain stage
let fxBus: GainNode | null = null;

function ac(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      fxBus = ctx.createGain();
      fxBus.gain.value = settings().sfx / 0.8;
      fxBus.connect(master);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Re-read the effects volume setting. */
export function applySfxVolume(): void {
  if (fxBus) fxBus.gain.value = settings().sfx / 0.8;
}

/** Shared context + master bus for other audio modules (music). Null until the first gesture. */
export function audioBus(): { ctx: AudioContext; master: GainNode } | null {
  const c = ac();
  return c && master ? { ctx: c, master } : null;
}

export function initAudioUnlock(): void {
  const unlock = () => { ac(); };
  window.addEventListener("keydown", unlock, { once: true });
  window.addEventListener("mousedown", unlock, { once: true });
}

function env(dur: number, vol = 1): GainNode | null {
  const c = ac();
  if (!c || !master) return null;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  g.connect(fxBus ?? master);
  return g;
}

function osc(type: OscillatorType, freq: number, dur: number, vol = 1, slideTo?: number): void {
  const c = ac();
  const g = env(dur, vol);
  if (!c || !g) return;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), c.currentTime + dur);
  o.connect(g);
  o.start();
  o.stop(c.currentTime + dur);
}

function noise(dur: number, vol = 1, lowpass = 2000): void {
  const c = ac();
  const g = env(dur, vol);
  if (!c || !g) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lowpass;
  src.connect(f);
  f.connect(g);
  src.start();
}

let lastLaser = 0;
let thrustNode: GainNode | null = null;
export const sfx = {
  laser(): void {
    const now = performance.now();
    if (now - lastLaser < 60) return;
    lastLaser = now;
    osc("triangle", 640, 0.11, 0.22, 180);
  },
  enemyLaser(): void {
    osc("triangle", 380, 0.14, 0.13, 90);
  },
  torpedo(): void {
    noise(0.35, 0.3, 700);
    osc("sine", 90, 0.4, 0.3, 40);
  },
  // engine rumble: call every frame with whether the mains are lit
  thrust(on: boolean): void {
    const c = ac();
    if (!c || !master) return;
    if (!thrustNode) {
      const src = c.createBufferSource();
      const len = c.sampleRate * 2;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.05 * (Math.random() * 2 - 1)) / 1.05; d[i] = last * 3; }
      src.buffer = buf; src.loop = true;
      const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 320;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(lp); lp.connect(g); g.connect(fxBus ?? master);
      src.start();
      thrustNode = g;
    }
    const target = on ? 0.35 : 0;
    const now = c.currentTime;
    thrustNode.gain.cancelScheduledValues(now);
    thrustNode.gain.setTargetAtTime(target, now, on ? 0.08 : 0.25);
  },
  boom(big = false): void {
    noise(big ? 0.5 : 0.25, big ? 0.7 : 0.4, big ? 900 : 1400);
    osc("sine", big ? 120 : 180, big ? 0.5 : 0.3, 0.5, 40);
  },
  hit(): void {
    noise(0.08, 0.3, 3000);
  },
  mine(): void {
    osc("sine", 220 + Math.random() * 60, 0.08, 0.08, 200);
  },
  pickup(): void {
    osc("square", 660, 0.07, 0.2);
    setTimeout(() => osc("square", 990, 0.09, 0.2), 70);
  },
  blip(): void {
    osc("square", 1200, 0.04, 0.12);
  },
  select(): void {
    osc("square", 780, 0.06, 0.15);
  },
  dock(): void {
    osc("sine", 330, 0.3, 0.25, 440);
    setTimeout(() => osc("sine", 550, 0.35, 0.2), 180);
  },
  jump(): void {
    osc("sawtooth", 100, 0.9, 0.35, 1400);
    noise(0.9, 0.2, 600);
  },
  alarm(): void {
    osc("square", 520, 0.18, 0.2);
    setTimeout(() => osc("square", 520, 0.18, 0.2), 250);
  },
  repair(): void {
    noise(0.06, 0.15, 5000);
    osc("square", 300 + Math.random() * 200, 0.05, 0.08);
  },
};
