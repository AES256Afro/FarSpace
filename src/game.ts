// Game shell: canvas, scaling, scene management, sprite cache, save/load, hints.

import { Input } from "./core/input";
import { RNG } from "./core/rng";
import { World, generateWorld, WreckDef } from "./world";
import { loadSave, writeSave, SAVE_KEY } from "./save";
import * as cloud from "./core/cloud";
import { hull } from "./data/hulls";
import {
  Sprite, genShip, genPlanet, genStation, genAsteroid, genGate, genSun, genPortrait,
  genPlatform, genNebula, genWreck, genGlobe,
} from "./gfx/sprites";

export const VW = 480;
export const VH = 270;

export interface Scene {
  update(g: Game, dt: number): void;
  draw(g: Game, ctx: CanvasRenderingContext2D): void;
  enter?(g: Game): void;
  touchMode?: "flight" | "walk" | "menu";
}

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  buffer: HTMLCanvasElement;
  bctx: CanvasRenderingContext2D;
  input: Input;
  world: World;
  scene!: Scene;
  sceneName = "";
  scale = 1;
  toastMsg = "";
  toastTimer = 0;
  hint = "";
  hintTimer = 0;
  spriteCache = new Map<string, Sprite>();
  scenes: Record<string, Scene> = {};
  wreckTarget: WreckDef | null = null;
  orbitPlanetIdx = 0;
  landedPoiId: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.buffer = document.createElement("canvas");
    this.buffer.width = VW;
    this.buffer.height = VH;
    this.bctx = this.buffer.getContext("2d")!;
    this.bctx.imageSmoothingEnabled = false;
    this.input = new Input(canvas, () => ({ scale: this.scale, ox: 0, oy: 0 }));
    window.addEventListener("resize", () => this.resize());
    this.world = loadSave() ?? generateWorld(0xfa25face);
    this.resize();
  }

  hasSave(): boolean {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  cloudStatus = "";

  save(): void {
    writeSave(this.world);
    this.toast("GAME SAVED");
    if (cloud.getCode()) {
      this.cloudStatus = "SYNCING";
      void cloud.push(this.world).then((r) => {
        this.cloudStatus = r.ok ? "SYNCED" : `CLOUD: ${r.error ?? "FAILED"}`;
        if (!r.ok) this.toast(`CLOUD SYNC FAILED (${r.error ?? "?"}) - SAVED LOCALLY`);
      });
    }
  }

  // Adopt a world from the cloud or a file: persist locally and jump in
  adoptWorld(w: World): void {
    this.world = w;
    this.spriteCache.clear();
    writeSave(w);
    this.setScene(w.player.dockedAt ? "station" : "flight");
  }

  /** CONTINUE: prefer the cloud copy when it is newer than the local one. */
  async continueGame(): Promise<void> {
    const code = cloud.getCode();
    if (code) {
      this.toast("CHECKING CLOUD...");
      const remote = await cloud.pull(code);
      const localAt = this.world.savedAt ?? 0;
      if (remote && remote.updatedAt > localAt + 1000) {
        this.toast("CLOUD SAVE IS NEWER - LOADED IT");
        this.adoptWorld(remote.world);
        return;
      }
    }
    this.setScene(this.world.player.dockedAt ? "station" : "flight");
  }

  load(): void {
    const w = loadSave();
    if (!w) { this.toast("NO SAVE FOUND"); return; }
    this.world = w;
    this.spriteCache.clear();
    this.toast("GAME LOADED");
    this.setScene(this.world.player.dockedAt ? "station" : "flight");
  }

  newGame(realGalaxy: boolean): void {
    this.world = generateWorld((Math.random() * 0xffffffff) >>> 0, { realGalaxy });
    this.spriteCache.clear();
  }

  setScene(name: string): void {
    this.scene = this.scenes[name];
    this.sceneName = name;
    this.scene.enter?.(this);
  }

  touchMode(): "flight" | "walk" | "menu" {
    return this.scene?.touchMode ?? "menu";
  }

  toast(msg: string): void {
    this.toastMsg = msg;
    this.toastTimer = 2.5;
  }

  // One-time contextual guidance; remembered in the save
  showHint(key: string, text: string): void {
    const p = this.world.player;
    if (p.hints[key]) return;
    p.hints[key] = true;
    this.hint = text;
    this.hintTimer = 7;
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    // integer scale on desktop; allow fractional on small screens so phones fill the width
    const raw = Math.min(w / VW, h / VH);
    this.scale = raw >= 1 ? Math.floor(raw) : Math.max(0.5, raw);
    this.canvas.width = Math.round(VW * this.scale);
    this.canvas.height = Math.round(VH * this.scale);
    this.canvas.style.width = `${Math.round(VW * this.scale)}px`;
    this.canvas.style.height = `${Math.round(VH * this.scale)}px`;
    this.ctx.imageSmoothingEnabled = false;
  }

  sprite(key: string, gen: () => Sprite): Sprite {
    let s = this.spriteCache.get(key);
    if (!s) {
      s = gen();
      this.spriteCache.set(key, s);
    }
    return s;
  }

  playerShip(): Sprite {
    const h = hull(this.world.player.hullId);
    return this.sprite(`player-ship-${h.id}`, () => genShip(new RNG(this.world.seed ^ 0x51e9 ^ h.id.length), h.spriteSize, h.color, h.accent));
  }
  pirateShip(): Sprite {
    return this.sprite("pirate-ship", () => genShip(new RNG(this.world.seed ^ 0xdead), 20, "#8c6a5a", "#ff5a5a"));
  }
  traderShip(): Sprite {
    return this.sprite("trader-ship", () => genShip(new RNG(this.world.seed ^ 0x77aa), 22, "#7a8ca5", "#ffd75a"));
  }
  patrolShip(): Sprite {
    return this.sprite("patrol-ship", () => genShip(new RNG(this.world.seed ^ 0x3c3c), 22, "#6a7a9c", "#5ab3ff"));
  }
  planetSprite(sysId: string, idx: number, radius: number, palette: number): Sprite {
    return this.sprite(`planet-${sysId}-${idx}`, () => genPlanet(new RNG(this.world.seed ^ (idx * 7919) ^ sysId.length * 31), radius, palette));
  }
  globeSprite(sysId: string, idx: number, palette: number, rotation: number): Sprite {
    // 12 rotation frames, cached
    const frame = Math.floor(((rotation % (Math.PI * 2)) / (Math.PI * 2)) * 12);
    const sys = this.world.systems[sysId];
    const pl = sys.planets[idx];
    return this.sprite(`globe-${sysId}-${idx}-${frame}`, () => genGlobe(new RNG(this.world.seed ^ (idx * 7919) ^ sysId.length * 31), 64, palette, pl.surface, (frame / 12) * Math.PI * 2));
  }
  stationSprite(id: string, military: boolean): Sprite {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return this.sprite(`station-${id}`, () => genStation(new RNG(this.world.seed ^ h), 40, military));
  }
  asteroidSprite(seed: number, radius: number, rich: boolean): Sprite {
    return this.sprite(`ast-${seed}`, () => genAsteroid(new RNG(seed), radius, rich));
  }
  gateSprite(): Sprite {
    return this.sprite("gate", () => genGate(36));
  }
  platformSprite(hostile: boolean): Sprite {
    return this.sprite(`platform-${hostile}`, () => genPlatform(new RNG(this.world.seed ^ 0x9d9d), hostile));
  }
  wreckSprite(): Sprite {
    return this.sprite("wreck", () => genWreck(new RNG(this.world.seed ^ 0x7e7e), 30));
  }
  nebulaSprite(sysId: string): Sprite {
    let h = 0;
    for (const ch of sysId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return this.sprite(`nebula-${sysId}`, () => genNebula(new RNG(this.world.seed ^ h ^ 0x4e4e), 480, 270));
  }
  sunSprite(sysId: string, radius: number, color: string): Sprite {
    return this.sprite(`sun-${sysId}`, () => genSun(new RNG(this.world.seed ^ sysId.length), radius, color));
  }
  portrait(name: string): Sprite {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return this.sprite(`face-${name}`, () => genPortrait(new RNG(h)));
  }
}
