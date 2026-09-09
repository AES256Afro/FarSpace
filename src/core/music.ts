// Ambient soundtrack: slow procedural pads keyed to the faction whose space
// you're in, a low pulse that rises with nearby hostiles. No samples.

import { audioBus } from "./sfx";

const PREF_KEY = "farspace-music";

// Root note (Hz) and a chord palette per faction; "void" for uncontrolled space, "title" for the menu
const MOODS: Record<string, { root: number; chords: number[][]; type: OscillatorType }> = {
  title: { root: 110, chords: [[0, 7, 12], [0, 5, 12], [0, 7, 14], [-2, 5, 12]], type: "sine" },
  tsc:   { root: 130.81, chords: [[0, 4, 7], [0, 5, 9], [-3, 4, 7], [0, 4, 11]], type: "sine" },       // C major, orderly
  fdm:   { root: 98,     chords: [[0, 7, 10], [0, 5, 10], [3, 7, 10], [0, 7, 12]], type: "triangle" }, // G mixolydian, working
  hex:   { root: 123.47, chords: [[0, 4, 7], [0, 4, 9], [2, 6, 9], [0, 4, 7]], type: "sine" },        // B major, cool
  ora:   { root: 110,    chords: [[0, 3, 7], [0, 5, 8], [-2, 3, 7], [0, 3, 10]], type: "triangle" },  // A minor, wide
  vex:   { root: 82.41,  chords: [[0, 3, 6], [0, 1, 6], [0, 3, 8], [-1, 3, 6]], type: "sawtooth" },   // E dim, wrong
  void:  { root: 65.41,  chords: [[0, 7], [0, 12], [0, 7, 19]], type: "sine" },
};

class Music {
  private started = false;
  private muted = false;
  private mood = "title";
  private intensity = 0;
  private bus: GainNode | null = null;
  private padGain: GainNode | null = null;
  private pulseGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private oscs: OscillatorNode[] = [];
  private pulse: OscillatorNode | null = null;
  private chordIdx = 0;
  private nextChordAt = 0;
  private timer: number | null = null;

  constructor() {
    try { this.muted = localStorage.getItem(PREF_KEY) === "off"; } catch { /* ignore */ }
  }

  isMuted(): boolean { return this.muted; }

  toggle(): boolean {
    this.muted = !this.muted;
    try { localStorage.setItem(PREF_KEY, this.muted ? "off" : "on"); } catch { /* ignore */ }
    if (this.bus) {
      const now = this.bus.context.currentTime;
      this.bus.gain.cancelScheduledValues(now);
      this.bus.gain.linearRampToValueAtTime(this.muted ? 0 : 0.5, now + 0.5);
    } else if (!this.muted) this.start();
    return !this.muted;
  }

  // Safe to call every frame; starts lazily once audio is unlocked
  start(): void {
    if (this.started) return;
    const b = audioBus();
    if (!b) return;
    const { ctx, master } = b;
    this.started = true;
    this.bus = ctx.createGain();
    this.bus.gain.value = this.muted ? 0 : 0.5;
    this.bus.connect(master);
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 420;
    this.filter.Q.value = 0.7;
    this.filter.connect(this.bus);
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.22;
    this.padGain.connect(this.filter);
    // slow filter sweep
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(this.filter.frequency);
    lfo.start();
    // three detuned voices
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.detune.value = (i - 1) * 6;
      o.connect(this.padGain);
      o.start();
      this.oscs.push(o);
    }
    // combat pulse: low drone with tremolo, faded in by intensity
    this.pulseGain = ctx.createGain();
    this.pulseGain.gain.value = 0;
    this.pulseGain.connect(this.bus);
    this.pulse = ctx.createOscillator();
    this.pulse.type = "sawtooth";
    const trem = ctx.createOscillator();
    trem.frequency.value = 2.2;
    const tremGain = ctx.createGain();
    tremGain.gain.value = 0.5;
    const tremBias = ctx.createGain();
    tremBias.gain.value = 0.12;
    trem.connect(tremGain);
    tremGain.connect(tremBias.gain);
    this.pulse.connect(tremBias);
    tremBias.connect(this.pulseGain);
    trem.start();
    this.pulse.start();
    this.applyChord(true);
    this.timer = window.setInterval(() => this.tick(), 500);
  }

  // Scenes call this with the faction of the current system (or "void"/"title") and 0..1 hostility
  setMood(mood: string, intensity: number): void {
    const m = MOODS[mood] ? mood : "void";
    const changed = m !== this.mood;
    this.mood = m;
    this.intensity = Math.max(0, Math.min(1, intensity));
    if (!this.started) { this.start(); return; }
    if (changed) { this.chordIdx = 0; this.applyChord(false); }
    const ctx = this.bus!.context;
    const now = ctx.currentTime;
    this.pulseGain!.gain.cancelScheduledValues(now);
    this.pulseGain!.gain.linearRampToValueAtTime(this.intensity * 0.35, now + 1.5);
    this.filter!.frequency.cancelScheduledValues(now);
    this.filter!.frequency.linearRampToValueAtTime(420 + this.intensity * 900, now + 1.5);
  }

  private tick(): void {
    if (!this.started || !this.bus) return;
    if (this.bus.context.currentTime >= this.nextChordAt) this.applyChord(false);
  }

  private applyChord(immediate: boolean): void {
    if (!this.bus) return;
    const ctx = this.bus.context;
    const m = MOODS[this.mood];
    const chord = m.chords[this.chordIdx % m.chords.length];
    this.chordIdx++;
    const now = ctx.currentTime;
    const glide = immediate ? 0.01 : 2.5;
    this.oscs.forEach((o, i) => {
      const semis = chord[i % chord.length] + (i >= chord.length ? 12 : 0);
      const f = m.root * Math.pow(2, semis / 12);
      o.type = m.type;
      o.frequency.cancelScheduledValues(now);
      o.frequency.setTargetAtTime(f, now, glide / 3);
    });
    if (this.pulse) {
      this.pulse.frequency.cancelScheduledValues(now);
      this.pulse.frequency.setTargetAtTime(m.root / 2, now, 0.5);
    }
    this.nextChordAt = now + 8 + Math.random() * 4;
  }
}

export const music = new Music();
