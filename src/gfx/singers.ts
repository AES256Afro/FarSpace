// Six nested arcs answer one another; the berth has no human hull or lettering.
export function drawSingersRing(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, time: number): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + Math.sin(time * 0.4) * 0.08;
    ctx.strokeStyle = ["#63f2c8", "#5ab3ff", "#d6bcff"][i % 3];
    ctx.globalAlpha = 0.55 + 0.35 * Math.sin(time * 1.6 - i);
    ctx.beginPath(); ctx.arc(0, 0, 10 + i * 2.5, a, a + Math.PI * 0.85); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillRect(Math.cos(a) * (10 + i * 2.5) - 1, Math.sin(a) * (10 + i * 2.5) - 1, 2, 2);
  }
  ctx.globalAlpha = 1; ctx.fillStyle = "#e9ffff"; ctx.fillRect(-2, -2, 4, 4);
  ctx.restore();
}
