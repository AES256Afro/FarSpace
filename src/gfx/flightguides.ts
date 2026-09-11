import { flightDirections } from "../core/flightdirections";
import { shipDesign } from "./shipdesign";
import { PAL } from "./palette";

export function drawFlightGuides(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, vx: number, vy: number, size: number, zoom: number): void {
  const { nose, drift } = flightDirections(angle, vx, vy, size, zoom);
  ctx.save(); ctx.translate(x, y);
  // A solid forward chevron and a hollow drift diamond differ in shape too.
  if (drift) {
    const dx = Math.cos(drift.angle), dy = Math.sin(drift.angle);
    ctx.strokeStyle = PAL.gold; ctx.lineWidth = 1;
    for (let r = nose.radius + 4; r < drift.radius - 5; r += 5) {
      ctx.beginPath(); ctx.moveTo(dx * r, dy * r); ctx.lineTo(dx * (r + 2), dy * (r + 2)); ctx.stroke();
    }
    ctx.save(); ctx.translate(dx * drift.radius, dy * drift.radius);
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(4, 0); ctx.lineTo(0, 4); ctx.lineTo(-4, 0); ctx.closePath();
    ctx.strokeStyle = PAL.bg; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = PAL.gold; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
  }
  ctx.rotate(nose.angle);
  ctx.beginPath(); ctx.moveTo(nose.radius - 1, -4); ctx.lineTo(nose.radius + 5, 0);
  ctx.lineTo(nose.radius - 1, 4); ctx.lineTo(nose.radius + 1, 0); ctx.closePath();
  ctx.strokeStyle = PAL.bg; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = PAL.white; ctx.fill();
  // Short wing brackets identify your hull without enclosing nearby objects.
  ctx.strokeStyle = "#486579"; ctx.lineWidth = 1;
  for (const sign of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(-4, sign * (nose.radius - 3));
    ctx.lineTo(3, sign * (nose.radius - 3)); ctx.stroke();
  }
  ctx.restore();
}

export function drawShipDrive(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, zoom: number, style: string, burning: boolean, retro: boolean, time: number): void {
  if (!burning && !retro) return;
  const { tail, nose, center, engines } = shipDesign(size, style);
  const pulse = Math.floor(time * 15) % 3, length = 5 + pulse * 2;
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(zoom, zoom);
  if (burning) for (const dy of engines) {
    const ex = tail - size / 2, ey = center + dy - size / 2;
    ctx.fillStyle = "#da753c"; ctx.fillRect(ex - length - 2, ey - 1, length + 2, 3);
    ctx.fillStyle = "#ffcf66"; ctx.fillRect(ex - length, ey, length, 1);
    ctx.fillStyle = "#fff1c4"; ctx.fillRect(ex - 4, ey - 1, 4, 3);
  }
  if (retro) for (const sign of [-1, 1]) {
    ctx.fillStyle = "#b0edff";
    ctx.fillRect(nose - size / 2 - 3, sign * 3 - 1, 4 + pulse, 2);
  }
  ctx.restore();
}
