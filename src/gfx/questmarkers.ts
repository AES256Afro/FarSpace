import { PAL } from "./palette";

export function drawQuestMarker(ctx: CanvasRenderingContext2D, x: number, y: number, ready = false): void {
  ctx.strokeStyle = ready ? PAL.good : PAL.gold;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 8, y); ctx.closePath(); ctx.stroke();
}
