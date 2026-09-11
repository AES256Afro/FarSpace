// Bearings use screen-up as north; physics uses +x as angle zero.
export function bearing(angle: number): { degrees: number; compass: string } {
  const degrees = ((Math.round(angle * 180 / Math.PI + 90) % 360) + 360) % 360;
  return { degrees, compass: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(degrees / 45) % 8] };
}

export function flightDirections(angle: number, vx: number, vy: number, size: number, zoom: number) {
  const speed = Math.hypot(vx, vy), radius = Math.max(16, size * zoom / 2 + 7);
  return {
    nose: { angle, radius, ...bearing(angle) },
    drift: speed >= 2 ? { angle: Math.atan2(vy, vx), radius: radius + 17, ...bearing(Math.atan2(vy, vx)) } : null,
    speed,
  };
}
