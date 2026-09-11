import { describe, expect, it } from "vitest";
import { bearing, flightDirections } from "../src/core/flightdirections";
import { HULLS, SERVICE_CUTTER } from "../src/data/hulls";

describe("flight direction cues", () => {
  it.each([
    [-Math.PI / 2, 0, "N"], [0, 90, "E"], [Math.PI / 2, 180, "S"],
    [Math.PI, 270, "W"], [-Math.PI / 4, 45, "NE"],
  ])("maps physics angle %s to the screen compass", (angle, degrees, compass) => {
    expect(bearing(angle as number)).toEqual({ degrees, compass });
  });
  it("keeps bearings in range after many turns and at the north boundary", () => {
    expect(bearing(-Math.PI / 2 + Math.PI * 200)).toEqual({ degrees: 0, compass: "N" });
    expect(bearing(-Math.PI / 2 - Math.PI * 202)).toEqual({ degrees: 0, compass: "N" });
    expect(bearing(-Math.PI / 2 - .001).degrees).toBe(0);
  });
  it("distinguishes the nose from sideways and backward motion", () => {
    const sideways = flightDirections(0, 0, -100, 24, 1);
    expect(sideways.nose.compass).toBe("E"); expect(sideways.drift?.compass).toBe("N");
    const backwards = flightDirections(0, -100, 0, 24, 1);
    expect(backwards.nose.compass).toBe("E"); expect(backwards.drift?.compass).toBe("W");
  });
  it("retains heading while stopped and suppresses an unstable near-zero drift bearing", () => {
    expect(flightDirections(Math.PI, 0, 0, 24, 1)).toMatchObject({ nose: { compass: "W" }, drift: null, speed: 0 });
    expect(flightDirections(0, .1, -.1, 24, 1).drift).toBeNull();
    expect(flightDirections(0, 0, 2, 24, 1).drift?.compass).toBe("S");
  });
  it("keeps the nose cue outside every hull and separates aligned drift at all flight zooms", () => {
    for (const h of [...HULLS, SERVICE_CUTTER]) for (const zoom of [.25, .5, 1, 2]) {
      const d = flightDirections(0, 100, 0, h.spriteSize, zoom);
      expect(d.nose.radius - 1).toBeGreaterThan(h.spriteSize * zoom / 2);
      expect(d.nose.radius).toBeGreaterThanOrEqual(16);
      expect(d.drift!.radius - 4).toBeGreaterThan(d.nose.radius + 5);
    }
  });
});
