// Touch controls: a virtual stick on the left, action buttons on the right.
// They synthesize the same key states the keyboard uses, so scenes don't care.

import type { Game } from "../game";
import { VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";

export const touch = {
  enabled: false,
  stickId: -1,
  stickX: 0, stickY: 0,   // stick centre (internal px)
  dx: 0, dy: 0,           // -1..1
  buttons: new Map<number, string>(), // touch id → key
};

interface Btn { key: string; label: string; x: number; y: number; r: number }

// Layout differs by scene family; flight gets fire/mine/brake/interact, walk gets interact
export function touchButtons(mode: "flight" | "walk" | "menu"): Btn[] {
  if (mode === "flight") {
    return [
      { key: " ", label: "FIRE", x: VW - 26, y: VH - 62, r: 16 },
      { key: "m", label: "MINE", x: VW - 62, y: VH - 44, r: 13 },
      { key: "x", label: "BRK", x: VW - 26, y: VH - 100, r: 12 },
      { key: "e", label: "USE", x: VW - 62, y: VH - 82, r: 13 },
      { key: "Tab", label: "MAP", x: VW - 16, y: 14, r: 10 },
      { key: "i", label: "SHIP", x: VW - 40, y: 14, r: 10 },
    ];
  }
  if (mode === "walk") {
    return [
      { key: "e", label: "USE", x: VW - 30, y: VH - 50, r: 16 },
      { key: "Escape", label: "ESC", x: VW - 16, y: 14, r: 10 },
    ];
  }
  return [];
}

export function initTouch(canvas: HTMLCanvasElement, g: Game): void {
  const toInternal = (t: Touch): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [(t.clientX - r.left) / g.scale, (t.clientY - r.top) / g.scale];
  };
  const mode = () => g.touchMode();
  const press = (key: string) => { if (!g.input.down.has(key)) g.input.pressed.add(key); g.input.down.add(key); };
  const release = (key: string) => g.input.down.delete(key);

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    touch.enabled = true;
    for (const t of Array.from(e.changedTouches)) {
      const [x, y] = toInternal(t);
      const m = mode();
      const btn = touchButtons(m).find((b) => Math.hypot(b.x - x, b.y - y) < b.r + 6);
      if (btn) { touch.buttons.set(t.identifier, btn.key); press(btn.key); continue; }
      if (m === "menu") {
        g.input.mouseX = x; g.input.mouseY = y;
        g.input.mousePressed = true; g.input.mouseDown = true;
        continue;
      }
      if (x < VW / 2 && touch.stickId < 0) {
        touch.stickId = t.identifier;
        touch.stickX = x; touch.stickY = y;
        touch.dx = 0; touch.dy = 0;
      } else {
        // right-half tap outside buttons acts like a click (menus inside HUD etc.)
        g.input.mouseX = x; g.input.mouseY = y;
        g.input.mousePressed = true;
      }
    }
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== touch.stickId) continue;
      const [x, y] = toInternal(t);
      const dx = (x - touch.stickX) / 22, dy = (y - touch.stickY) / 22;
      const len = Math.hypot(dx, dy);
      touch.dx = len > 1 ? dx / len : dx;
      touch.dy = len > 1 ? dy / len : dy;
    }
    applyStick(g);
  }, { passive: false });

  const end = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      const key = touch.buttons.get(t.identifier);
      if (key) { release(key); touch.buttons.delete(t.identifier); }
      if (t.identifier === touch.stickId) {
        touch.stickId = -1; touch.dx = 0; touch.dy = 0;
        applyStick(g);
      }
    }
    g.input.mouseDown = false;
  };
  canvas.addEventListener("touchend", end, { passive: false });
  canvas.addEventListener("touchcancel", end, { passive: false });
}

// Map the stick to WASD. In flight: up = thrust, left/right = rotate, down = retro.
function applyStick(g: Game): void {
  const m = g.touchMode();
  const set = (k: string, on: boolean) => {
    if (on) { if (!g.input.down.has(k)) g.input.pressed.add(k); g.input.down.add(k); }
    else g.input.down.delete(k);
  };
  if (m === "menu") return;
  const { dx, dy } = touch;
  if (m === "flight") {
    set("w", dy < -0.35);
    set("s", dy > 0.5);
    set("a", dx < -0.35);
    set("d", dx > 0.35);
  } else {
    set("w", dy < -0.35); set("s", dy > 0.35); set("a", dx < -0.35); set("d", dx > 0.35);
  }
}

export function drawTouchControls(g: Game, ctx: CanvasRenderingContext2D): void {
  if (!touch.enabled) return;
  const m = g.touchMode();
  if (m === "menu") return;
  // stick
  if (touch.stickId >= 0) {
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = PAL.ui;
    ctx.beginPath(); ctx.arc(touch.stickX, touch.stickY, 22, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = PAL.ui;
    ctx.beginPath(); ctx.arc(touch.stickX + touch.dx * 22, touch.stickY + touch.dy * 22, 6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = PAL.ui;
    ctx.beginPath(); ctx.arc(50, VH - 60, 22, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const b of touchButtons(m)) {
    const held = g.input.down.has(b.key);
    ctx.globalAlpha = held ? 0.7 : 0.3;
    ctx.fillStyle = held ? PAL.ui : PAL.uiPanel;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = PAL.ui;
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawText(ctx, b.label, b.x - textWidth(b.label) / 2, b.y - 3, held ? PAL.bg : PAL.ui);
  }
}
