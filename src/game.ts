// Game shell: canvas, scaling, scene management, sprite cache, save/load, hints.

import { Input } from "./core/input";
import { drawText as drawTextTo } from "./gfx/font";
import { findStation, photoTaken, captainNickname } from "./world";
import { RNG } from "./core/rng";
import { World, generateWorld, WreckDef } from "./world";
import { loadSave, writeSave, saveKeyFor, activeSlot } from "./save";
import * as cloud from "./core/cloud";
import { syncScores } from "./core/wire";
import { settings } from "./core/settings";
import { titlePreview } from "./core/titlepreview";
import { storeImportedWorld } from "./core/savelibrary";
import { hull } from "./data/hulls";
import { isOccasion } from "./data/occasions";
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
  onSceneLeave?(g: Game, next: string): void;
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
  frontend = false;
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
  landedRegionIdx = 0;
  repairTarget: import("./scenes/flight/types").Npc | null = null;
  tenderMission: import("./world").Mission | null = null;
  tenderReturn: string | null = null;
  surfaceFresh = false;   // set by orbit when the rover is dropped
  surfaceReturn = false;  // sites entered from the ground return to the ground

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
    this.world = titlePreview().world ?? generateWorld(0xfa25face);
    this.resize();
  }

  hasSave(): boolean {
    try { return !!localStorage.getItem(saveKeyFor(activeSlot())); } catch { return false; }
  }

  cloudStatus = "";
  justUndocked = false; // the next flight enter plays the launch
  lastBay = 0;          // the bay control cleared you for, so the deck agrees with the band
  infraTarget: import("./world").Infra | null = null; // the structure you walked into
  settingsReturn = "title"; // where SETTINGS and the HANDBOOK go back to

  save(): boolean {
    if (!this.autosave()) return false;
    this.toast(cloud.getCode() ? "GAME SAVED - SYNCING" : "GAME SAVED");
    return true;
  }

  // Quiet save: local always, cloud when linked. Runs on dock and after jumps.
  // A postcard: the frame as it is, a caption strip, saved as a PNG.
  postcard(caption: string): void {
    try {
      const c = document.createElement("canvas");
      c.width = VW * 2; c.height = VH * 2 + 24;
      const cx = c.getContext("2d")!;
      cx.imageSmoothingEnabled = false;
      cx.fillStyle = "#05060a"; cx.fillRect(0, 0, c.width, c.height);
      cx.drawImage(this.buffer, 0, 0, VW, VH, 0, 0, VW * 2, VH * 2);
      cx.save(); cx.translate(8, VH * 2 + 6); cx.scale(2, 2);
      drawTextTo(cx, caption.toUpperCase().slice(0, 90), 0, 0, "#c7a54a");
      cx.restore();
      const p = this.world.player;
      p.postcards = (p.postcards ?? 0) + 1;
      for (const line of photoTaken(this.world, { systemId: p.systemId, x: p.x, y: p.y, orbitPlanetIdx: this.orbitPlanetIdx, inOrbit: this.sceneName === "orbit" || this.sceneName === "surface" })) this.toast(line);
      if (isOccasion("lantern")) p.expData = (p.expData ?? 0) + 60;
      c.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `farspace-postcard-${p.postcards}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }, "image/png");
      this.toast(`POSTCARD ${p.postcards} SAVED`);
    } catch { this.toast("POSTCARD FAILED"); }
  }

  // What a postcard from here would say
  postcardCaption(): string {
    const p = this.world.player;
    const sys = this.world.systems[p.systemId];
    const ship = (p.shipName ?? hull(p.hullId).name).toUpperCase();
    const h = Math.floor(this.world.time / 3600), m = Math.floor((this.world.time % 3600) / 60);
    const near = this.sceneName === "flight" ? (this.world.wonders ?? []).find((x) => x.systemId === p.systemId && x.seen && Math.hypot(x.x - p.x, x.y - p.y) < 1400) : null;
    const where = near ? `${near.name.toUpperCase()}, ${sys.name.toUpperCase()}` : this.sceneName === "orbit" ? `ORBIT OF ${(sys.planets[this.orbitPlanetIdx]?.name ?? sys.name).toUpperCase()}` : this.sceneName === "interior" ? `ABOARD ${ship}` : this.sceneName === "station" || this.sceneName === "stationwalk" ? (findStation(this.world, p.dockedAt ?? "")?.st.name ?? sys.name).toUpperCase() : this.sceneName === "surface" ? `GROUNDSIDE, ${sys.name.toUpperCase()}` : sys.name.toUpperCase();
    const nick = captainNickname(this.world);
    return `${where} - ${ship}${nick ? ` (${nick})` : ""} - ${h}H ${m}M UNDER WAY`;
  }

  autosave(): boolean {
    if (this.frontend) return false;
    try { writeSave(this.world); }
    catch { this.toast("LOCAL SAVE FAILED - PREVIOUS SAVE KEPT. FREE BROWSER STORAGE OR EXPORT FROM SAVE LIBRARY."); return false; }
    syncScores(this.world);
    if (cloud.getCode()) {
      this.cloudStatus = "SYNCING";
      void cloud.push(this.world).then((r) => {
        this.cloudStatus = r.ok ? "SYNCED" : `CLOUD: ${r.error ?? "FAILED"}`;
        if (!r.ok) this.toast(`CLOUD SYNC FAILED (${r.error ?? "?"}) - SAVED LOCALLY`);
      });
    }
    return true;
  }

  // Hardcore death: the save is gone, locally and in the cloud if linked
  eraseSave(): void {
    try { localStorage.removeItem(saveKeyFor(activeSlot())); } catch { /* ignore */ }
    this.world = generateWorld(0xfa25face);
    if (cloud.getCode()) void cloud.push(this.world);
  }

  // Adopt a world from the cloud or a file: persist locally and jump in
  adoptWorld(w: World): boolean {
    const result = storeImportedWorld(activeSlot(), w);
    if (!result.ok) { this.toast(result.error); return false; }
    this.world = w;
    this.spriteCache.clear();
    this.setScene(w.player.dockedAt ? "station" : "flight");
    return true;
  }

  load(): void {
    const w = loadSave();
    if (!w) { this.toast("NO SAVE FOUND"); return; }
    this.world = w;
    this.spriteCache.clear();
    this.toast("GAME LOADED");
    this.setScene(this.world.player.dockedAt ? "station" : "flight");
  }

  newGame(realGalaxy: boolean, maxLy = 20): void {
    this.world = generateWorld((Math.random() * 0xffffffff) >>> 0, { realGalaxy, maxLy, hardcore: settings().hardcore });
    this.spriteCache.clear();
  }

  setScene(name: string): void {
    this.scene?.onSceneLeave?.(this, name);
    this.frontend = name === "title" || (this.frontend && ["settings", "help", "almanac", "whatsnew", "chronicle"].includes(name));
    this.scene = this.scenes[name];
    this.sceneName = name;
    this.scene.enter?.(this);
  }

  touchMode(): "flight" | "walk" | "menu" {
    if (this.sceneName === "flight" && (this.scene as Scene & { mapOpen?: boolean }).mapOpen) return "menu";
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
    const paint = this.world.player.paint;
    return this.sprite(`player-ship-${h.id}-${paint ?? ""}`, () => genShip(new RNG(this.world.seed ^ 0x51e9 ^ h.id.length), h.spriteSize, h.color, paint ?? h.accent, h.id));
  }
  pirateShip(): Sprite {
    return this.sprite("pirate-ship", () => genShip(new RNG(this.world.seed ^ 0xdead), 20, "#8c6a5a", "#ff5a5a", "interceptor"));
  }
  traderShip(): Sprite {
    return this.sprite("trader-ship", () => genShip(new RNG(this.world.seed ^ 0x77aa), 22, "#7a8ca5", "#ffd75a", "freighter"));
  }
  patrolShip(): Sprite {
    return this.sprite("patrol-ship", () => genShip(new RNG(this.world.seed ^ 0x3c3c), 22, "#6a7a9c", "#5ab3ff", "service-cutter"));
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
