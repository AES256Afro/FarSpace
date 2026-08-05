// Game shell: canvas, scaling, scene management, sprite cache, save/load.

import { Input } from "./core/input";
import { RNG } from "./core/rng";
import { World, generateWorld } from "./world";
import { Sprite, genShip, genPlanet, genStation, genAsteroid, genGate, genSun, genPortrait } from "./gfx/sprites";

export const VW = 480;
export const VH = 270;

export interface Scene {
  update(g: Game, dt: number): void;
  draw(g: Game, ctx: CanvasRenderingContext2D): void;
  enter?(g: Game): void;
}

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  buffer: HTMLCanvasElement;
  bctx: CanvasRenderingContext2D;
  input: Input;
  world: World;
  scene!: Scene;
  scale = 1;
  ox = 0;
  oy = 0;
  toastMsg = "";
  toastTimer = 0;
  spriteCache = new Map<string, Sprite>();
  scenes: Record<string, Scene> = {};

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
    this.world = this.loadOrNew();
    this.resize();
  }

  loadOrNew(): World {
    try {
      const raw = localStorage.getItem("farspace-save");
      if (raw) {
        const w = JSON.parse(raw) as World;
        if (w.seed !== undefined && w.player) return w;
      }
    } catch { /* corrupted save -> new game */ }
    return generateWorld(0xfa25face);
  }

  save(): void {
    localStorage.setItem("farspace-save", JSON.stringify(this.world));
    this.toast("GAME SAVED");
  }

  load(): void {
    const raw = localStorage.getItem("farspace-save");
    if (!raw) { this.toast("NO SAVE FOUND"); return; }
    this.world = JSON.parse(raw) as World;
    this.toast("GAME LOADED");
    this.setScene(this.world.player.dockedAt ? "station" : "flight");
  }

  newGame(): void {
    this.world = generateWorld((Math.random() * 0xffffffff) >>> 0);
  }

  setScene(name: string): void {
    this.scene = this.scenes[name];
    this.scene.enter?.(this);
  }

  toast(msg: string): void {
    this.toastMsg = msg;
    this.toastTimer = 2.5;
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.scale = Math.max(1, Math.floor(Math.min(w / VW, h / VH)));
    this.canvas.width = VW * this.scale;
    this.canvas.height = VH * this.scale;
    this.canvas.style.width = `${VW * this.scale}px`;
    this.canvas.style.height = `${VH * this.scale}px`;
    this.ctx.imageSmoothingEnabled = false;
  }

  // ---------- Sprite cache (regenerated deterministically on demand) ----------

  sprite(key: string, gen: () => Sprite): Sprite {
    let s = this.spriteCache.get(key);
    if (!s) {
      s = gen();
      this.spriteCache.set(key, s);
    }
    return s;
  }

  playerShip(): Sprite {
    return this.sprite("player-ship", () => genShip(new RNG(this.world.seed ^ 0x51e9), 24, "#9aa5bd", "#63f2c8"));
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
  sunSprite(sysId: string, radius: number, color: string): Sprite {
    return this.sprite(`sun-${sysId}`, () => genSun(new RNG(this.world.seed ^ sysId.length), radius, color));
  }
  portrait(name: string): Sprite {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return this.sprite(`face-${name}`, () => genPortrait(new RNG(h)));
  }
}
