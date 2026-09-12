// Keyboard + mouse + gamepad input, tracked in internal-resolution coordinates.
// Touch (core/touch.ts) and the gamepad both synthesize the same key states, so
// scenes only ever ask "is W down" and "was E pressed".

import { settings } from "./settings";

export class Input {
  down = new Set<string>();
  pressed = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  mousePressed = false;
  wheel = 0;
  mouseRight = false;
  mouseRightPressed = false;
  textEvents: string[] = [];
  lastRawKey: string | null = null; // unmapped key of the most recent keydown (for rebinding)
  padConnected = false;
  private padHeld = new Set<string>();
  private touchHeld = new Set<string>();
  private keyboardHeld = new Map<string,string>();
  private focused = true;
  private padMode?: "flight" | "walk" | "menu";
  private padNeedsNeutral = false;

  constructor(canvas: HTMLCanvasElement, getScale: () => { scale: number; ox: number; oy: number }) {
    window.addEventListener("keydown", (e) => {
      if (["Tab", "F5", "F9", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"].includes(e.key)) {
        e.preventDefault();
      }
      const raw = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.lastRawKey = raw;
      if (!e.ctrlKey && !e.metaKey && !e.altKey && raw.length === 1) this.textEvents.push(raw);
      const k = this.map(raw);
      this.keyboardHeld.set(raw,k);
      if (!this.down.has(k)) this.pressed.add(k);
      this.down.add(k);
    });
    window.addEventListener("keyup", (e) => {
      const raw=e.key.length===1?e.key.toLowerCase():e.key;
      const k=this.keyboardHeld.get(raw)??this.map(raw);
      this.keyboardHeld.delete(raw);
      this.releaseUnowned(k);
    });
    window.addEventListener("blur", () => {this.focused=false;this.padNeedsNeutral=true;this.keyboardHeld.clear();this.padHeld.clear();this.touchHeld.clear();this.down.clear();this.flush();this.lastRawKey=null;this.mouseDown=false;this.mouseRight=false;});
    window.addEventListener("focus", () => {this.focused=true;});
    canvas.addEventListener("mousemove", (e) => {
      const { scale, ox, oy } = getScale();
      const r = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left - ox) / scale;
      this.mouseY = (e.clientY - r.top - oy) / scale;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 2) { this.mouseRight = true; this.mouseRightPressed = true; return; }
      this.mouseDown = true;
      this.mousePressed = true;
    });
    window.addEventListener("mouseup", (e) => { if (e.button === 2) this.mouseRight = false; else this.mouseDown = false; });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.wheel += Math.sign(e.deltaY);
    }, { passive: false });
    window.addEventListener("gamepadconnected", () => { this.padConnected = true; });
    window.addEventListener("gamepaddisconnected", () => { this.padConnected = false; this.releasePad(); });
  }

  // Standard-mapping pad → keys. Call once per frame before scenes update.
  // mode "flight": left stick = thrust/turn, "walk": left stick = WASD, "menu": D-pad/stick = arrows.
  pollGamepad(mode: "flight" | "walk" | "menu"): void {
    if(!this.focused)return;
    const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find((p) => p && p.connected);
    if (!pad) { this.padConnected=false; if (this.padHeld.size) this.releasePad(); return; }
    this.padConnected = true;
    const btn = (i: number) => !!pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5);
    const ax = (i: number) => (Math.abs(pad.axes[i] ?? 0) > 0.3 ? pad.axes[i] : 0);
    const lx = ax(0), ly = ax(1);
    if(this.padMode!==mode&&this.padHeld.size)this.padNeedsNeutral=true;
    this.padMode=mode;
    if(this.padNeedsNeutral){
      this.releasePad();
      if(pad.buttons.some(b=>b.pressed||b.value>.5)||lx||ly)return;
      this.padNeedsNeutral=false;
    }
    const want = new Set<string>();
    const up = btn(12) || ly < -0.3, down = btn(13) || ly > 0.3, left = btn(14) || lx < -0.3, right = btn(15) || lx > 0.3;
    if (mode === "menu") {
      if (up) want.add("ArrowUp"); if (down) want.add("ArrowDown"); if (left) want.add("ArrowLeft"); if (right) want.add("ArrowRight");
      if (btn(0)) want.add("Enter"); if (btn(1)) want.add("Escape");
      if (btn(2)) want.add("s"); if (btn(3)) want.add("p");
    } else if(mode==="walk") {
      if(up)want.add("w");if(down)want.add("s");if(left)want.add("a");if(right)want.add("d");
      if(btn(0))want.add("e");if(btn(1))want.add("Escape");
      if(btn(2))want.add("r");if(btn(3))want.add("q");
      if(btn(4))want.add("v");if(btn(5))want.add("c");
      if(btn(6))want.add("Tab");if(btn(8))want.add("i");
      if(btn(9))want.add("g");if(btn(10))want.add("b");
    } else {
      if (up) want.add("w"); if (down) want.add("s"); if (left) want.add("a"); if (right) want.add("d");
      if (btn(0)) want.add("e");            // A: interact / dock / jump
      if (btn(1)) want.add("Escape");       // B: back
      if (btn(2) || btn(7)) want.add(" ");  // X / RT: fire
      if (btn(3)) want.add("m");            // Y: mine
      if (btn(5)) want.add("x");            // RB: brake
      if (btn(4)) want.add("v");            // LB: deep scan
      if (btn(6)) want.add("Tab");          // LT: system map
      if (btn(9)) want.add("g");            // Start: galaxy map
      if (btn(8)) want.add("i");            // Select: board ship
      if (btn(10)) want.add("n");           // L3: autopilot
      if (btn(11)) want.add("j");           // R3: cruise
      if (btn(12)) want.add("r");           // D-up: torpedo
      if (btn(13)) want.add("c");           // D-down: seismic charge
      if (btn(14)) want.add("t");           // D-left: system channel
      if (btn(15)) want.add("h");           // D-right: music
    }
    this.setHeld(this.padHeld,want);
  }

  setTouchKeys(want: ReadonlySet<string>): void {this.setHeld(this.touchHeld,want);}

  private setHeld(held:Set<string>,want:ReadonlySet<string>):void {
    for(const k of Array.from(held))if(!want.has(k)){held.delete(k);this.releaseUnowned(k);}
    for(const k of want)if(!held.has(k)){held.add(k);if(!this.down.has(k))this.pressed.add(k);this.down.add(k);}
  }

  private releaseUnowned(k:string):void {
    if(!this.padHeld.has(k)&&!this.touchHeld.has(k)&&!Array.from(this.keyboardHeld.values()).includes(k))this.down.delete(k);
  }

  private releasePad(): void {this.setHeld(this.padHeld,new Set());}

  // Apply the player's rebinds: physical key → action key
  private map(k: string): string {
    const m = settings().keymap;
    return m[k] ?? k;
  }

  flush(): void {
    this.pressed.clear();
    this.textEvents = [];
    this.mousePressed = false;
    this.mouseRightPressed = false;
    this.wheel = 0;
  }

  isDown(k: string): boolean {
    return this.down.has(k);
  }
  wasPressed(k: string): boolean {
    return this.pressed.has(k);
  }
}
