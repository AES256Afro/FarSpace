// Flight School: a six-step objective card for first-time pilots. Each step
// completes off real game state (no scripted sequence), pays a little, and the
// whole thing can be dismissed with K. Existing saves start with it off.

import type { Game } from "../game";
import { VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { cargoUsed } from "../world";
import { sfx } from "../core/sfx";

export const STEPS = [
  { text: "THRUST WITH W, TURN WITH A/D, THEN BRAKE WITH X", reward: 50 },
  { text: "DOCK AT THE STATION: FLY CLOSE AND PRESS E", reward: 100 },
  { text: "BUY SOMETHING AT THE MARKET (ENTER)", reward: 50 },
  { text: "ACCEPT A MISSION FROM THE MISSIONS TAB", reward: 50 },
  { text: "UNDOCK (ESC) AND JUMP THROUGH A GATE (E)", reward: 150 },
  { text: "BOARD YOUR SHIP (I) AND LOOK AROUND", reward: 200 },
  { text: "ORBIT A WORLD (E NEAR IT) AND DROP THE ROVER (L)", reward: 300 },
];

// True while Flight School still has lessons to give (its skip key is K)
export function tutorialActive(g: Game): boolean {
  const s = g.world.player.tutorial ?? -1;
  return s >= 0 && s < STEPS.length;
}

// per-step baselines, kept in memory only; recaptured after a reload
let fastSeen = false;
let cargoBase = -1;
let systemBase = "";
let lastStage = -2;

export function tutorialStage(g: Game): number {
  return g.world.player.tutorial ?? -1;
}

function advance(g: Game): void {
  const p = g.world.player;
  const stage = p.tutorial ?? -1;
  if (stage < 0 || stage >= STEPS.length) return;
  p.credits += STEPS[stage].reward;
  p.tutorial = stage + 1;
  sfx.pickup();
  g.toast(p.tutorial >= STEPS.length ? `FLIGHT SCHOOL COMPLETE +${STEPS[stage].reward}CR` : `+${STEPS[stage].reward}CR - NEXT LESSON`);
}

export function tutorialUpdate(g: Game): void {
  const p = g.world.player;
  const stage = p.tutorial ?? -1;
  if (stage < 0 || stage >= STEPS.length) return;
  if (stage !== lastStage) {
    lastStage = stage;
    fastSeen = false;
    cargoBase = cargoUsed(p);
    systemBase = p.systemId;
  }
  if (g.input.wasPressed("k")) { p.tutorial = -1; g.toast("FLIGHT SCHOOL DISMISSED"); return; }
  const scene = g.sceneName;
  switch (stage) {
    case 0: {
      const spd = Math.hypot(p.vx, p.vy);
      if (spd > 60) fastSeen = true;
      if ((fastSeen && spd < 12 && scene === "flight") || g.world.time > 45) advance(g);
      break;
    }
    case 1: if (scene === "station" || scene === "stationwalk") advance(g); break;
    case 2: if (cargoUsed(p) > cargoBase) advance(g); break;
    case 3: if (p.missions.some((m) => m.accepted && !m.done)) advance(g); break;
    case 4: if (p.systemId !== systemBase) advance(g); break;
    case 5: if (scene === "interior") advance(g); break;
    case 6: if (Object.values(p.ground ?? {}).some((gs) => gs.charted)) advance(g); break;
  }
}

export function drawTutorial(g: Game, ctx: CanvasRenderingContext2D, y = 72): void {
  const stage = tutorialStage(g);
  if (stage < 0 || stage >= STEPS.length) return;
  const head = `FLIGHT SCHOOL ${stage + 1}/${STEPS.length}`;
  const text = STEPS[stage].text;
  const w = Math.max(textWidth(head), textWidth(text)) + 12;
  const x = VW / 2 - w / 2;
  ctx.fillStyle = "rgba(8,12,22,0.88)";
  ctx.fillRect(x, y - 3, w, 24);
  ctx.strokeStyle = PAL.uiDim;
  ctx.strokeRect(x + 0.5, y - 2.5, w - 1, 23);
  drawText(ctx, head, x + 6, y, PAL.ui);
  drawText(ctx, "[K] SKIP", x + w - textWidth("[K] SKIP") - 6, y, PAL.greyDark);
  drawText(ctx, text, x + 6, y + 10, PAL.gold);
  void VH;
}
