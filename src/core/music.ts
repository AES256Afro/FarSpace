// Ambient engine: a warm starship hum, not a chord pad. Layers of filtered
// noise and sub-bass sines that breathe slowly, tinted per faction, with a
// low throb that rises when hostiles close. Think a quiet deck at night.

import { audioBus } from "./sfx";
import { settings } from "./settings";

const PREF_KEY = "farspace-music";

interface Mood { sub: number; sub2: number; cutoff: number; noise: number; air: number; gain: number }
const MOODS: Record<string, Mood> = {
  title: { sub: 55, sub2: 82.4, cutoff: 170, noise: 0.16, air: 0.005, gain: 0.9 },
  tsc:   { sub: 55, sub2: 82.4, cutoff: 190, noise: 0.16, air: 0.006, gain: 1.0 },   // orderly, warm
  fdm:   { sub: 61.7, sub2: 92.5, cutoff: 240, noise: 0.24, air: 0.009, gain: 1.0 }, // industrial, more machinery
  hex:   { sub: 49, sub2: 73.4, cutoff: 150, noise: 0.14, air: 0.004, gain: 0.95 },  // cool, hushed
  ora:   { sub: 58.3, sub2: 87.3, cutoff: 200, noise: 0.18, air: 0.007, gain: 1.0 }, // open, airy
  vex:   { sub: 46.2, sub2: 71.8, cutoff: 160, noise: 0.2, air: 0.006, gain: 1.0 },  // slightly wrong: subs beat against each other
  void:  { sub: 41.2, sub2: 61.7, cutoff: 120, noise: 0.1, air: 0.003, gain: 0.8 },
  ground: { sub: 36, sub2: 48, cutoff: 700, noise: 0.22, air: 0.02, gain: 0.55 },   // wind over the plains
  storm:  { sub: 36, sub2: 48, cutoff: 1600, noise: 0.5, air: 0.05, gain: 0.8 },    // weather on the hull
};

function noiseBuffer(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else d[i] = w;
  }
  return buf;
}

class Music {
  private started = false;
  private muted = true; // off until the pilot turns it on (H, or Settings)
  private mood = "title";
  private intensity = 0;
  private bus: GainNode | null = null;
  private lp: BiquadFilterNode | null = null;
  private noiseGain: GainNode | null = null;
  private airGain: GainNode | null = null;
  private sub1: OscillatorNode | null = null;
  private sub2: OscillatorNode | null = null;
  private subGain: GainNode | null = null;
  private throbGain: GainNode | null = null;
  private throb: OscillatorNode | null = null;

  constructor() {
    try { this.muted = localStorage.getItem(PREF_KEY) !== "on"; } catch { /* ignore */ }
  }

  isMuted(): boolean { return this.muted; }

  toggle(): boolean {
    this.muted = !this.muted;
    try { localStorage.setItem(PREF_KEY, this.muted ? "off" : "on"); } catch { /* ignore */ }
    if (this.bus) {
      const now = this.bus.context.currentTime;
      this.bus.gain.cancelScheduledValues(now);
      this.bus.gain.linearRampToValueAtTime(this.muted ? 0 : this.level(), now + 0.8);
    } else if (!this.muted) this.start();
    return !this.muted;
  }

  // 0.5 was the fixed bus gain before volume became a setting; 0.6 is the default slider
  level(): number { return 0.5 * (settings().music / 0.6); }

  applyVolume(): void {
    if (!this.bus) return;
    const now = this.bus.context.currentTime;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.linearRampToValueAtTime(this.muted ? 0 : this.level(), now + 0.15);
  }

  start(): void {
    if (this.started) return;
    const b = audioBus();
    if (!b) return;
    const { ctx, master } = b;
    this.started = true;
    this.bus = ctx.createGain();
    this.bus.gain.value = this.muted ? 0 : this.level();
    this.bus.connect(master);

    // engine body: brown noise, low-passed hard, breathing gently
    this.lp = ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = 180;
    this.lp.Q.value = 0.4;
    this.lp.connect(this.bus);
    const brown = ctx.createBufferSource();
    brown.buffer = noiseBuffer(ctx, 6, true);
    brown.loop = true;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.16;
    brown.connect(this.noiseGain);
    this.noiseGain.connect(this.lp);
    brown.start();
    const breathe = ctx.createOscillator();
    breathe.frequency.value = 0.07;
    const breatheAmt = ctx.createGain();
    breatheAmt.gain.value = 35;
    breathe.connect(breatheAmt);
    breatheAmt.connect(this.lp.frequency);
    breathe.start();

    // sub-bass: two sines a fifth apart, barely detuned so they slowly beat
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0.11;
    this.subGain.connect(this.bus);
    this.sub1 = ctx.createOscillator(); this.sub1.type = "sine"; this.sub1.frequency.value = 55;
    this.sub2 = ctx.createOscillator(); this.sub2.type = "sine"; this.sub2.frequency.value = 82.6;
    const subLp = ctx.createBiquadFilter(); subLp.type = "lowpass"; subLp.frequency.value = 140;
    this.sub1.connect(subLp); this.sub2.connect(subLp); subLp.connect(this.subGain);
    this.sub1.start(); this.sub2.start();
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.045;
    const swellAmt = ctx.createGain();
    swellAmt.gain.value = 0.03;
    swell.connect(swellAmt);
    swellAmt.connect(this.subGain.gain);
    swell.start();

    // air: a whisper of ventilation, high and very quiet
    const white = ctx.createBufferSource();
    white.buffer = noiseBuffer(ctx, 4, false);
    white.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2600; bp.Q.value = 0.8;
    this.airGain = ctx.createGain(); this.airGain.gain.value = 0.006;
    white.connect(bp); bp.connect(this.airGain); this.airGain.connect(this.bus);
    white.start();

    // combat throb: a slow, heavy pulse under everything, silent until needed
    this.throbGain = ctx.createGain();
    this.throbGain.gain.value = 0;
    this.throbGain.connect(this.bus);
    this.throb = ctx.createOscillator(); this.throb.type = "triangle"; this.throb.frequency.value = 38;
    const throbLp = ctx.createBiquadFilter(); throbLp.type = "lowpass"; throbLp.frequency.value = 110;
    const trem = ctx.createOscillator(); trem.frequency.value = 1.6;
    const tremAmt = ctx.createGain(); tremAmt.gain.value = 0.5;
    const tremBias = ctx.createGain(); tremBias.gain.value = 0.5;
    trem.connect(tremAmt); tremAmt.connect(tremBias.gain);
    this.throb.connect(throbLp); throbLp.connect(tremBias); tremBias.connect(this.throbGain);
    trem.start(); this.throb.start();

    this.applyMood(true);
  }

  // Scenes call this with the faction of the current system ("void"/"title" too) and 0..1 hostility
  setMood(mood: string, intensity: number): void {
    const m = MOODS[mood] ? mood : "void";
    const changed = m !== this.mood || Math.abs(intensity - this.intensity) > 0.05;
    this.mood = m;
    this.intensity = Math.max(0, Math.min(1, intensity));
    if (!this.started) { this.start(); return; }
    if (changed) this.applyMood(false);
  }

  private applyMood(immediate: boolean): void {
    if (!this.bus || !this.lp || !this.noiseGain || !this.airGain || !this.sub1 || !this.sub2 || !this.subGain || !this.throbGain) return;
    const ctx = this.bus.context;
    const now = ctx.currentTime;
    const m = MOODS[this.mood];
    const t = immediate ? 0.05 : 4;
    const ramp = (param: AudioParam, v: number) => { param.cancelScheduledValues(now); param.setTargetAtTime(v, now, t / 3); };
    ramp(this.lp.frequency, m.cutoff + this.intensity * 140);
    ramp(this.noiseGain.gain, m.noise * m.gain);
    ramp(this.airGain.gain, m.air);
    ramp(this.sub1.frequency, m.sub);
    ramp(this.sub2.frequency, this.mood === "vex" ? m.sub2 * 1.012 : m.sub2 + 0.2);
    ramp(this.subGain.gain, 0.11 * m.gain);
    ramp(this.throbGain.gain, this.intensity * 0.22);
  }
}

export const music = new Music();
