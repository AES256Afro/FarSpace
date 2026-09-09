// Nearby real stars (approximate J2000 RA/Dec, distance in light-years).
// Used for the "Sol Neighbourhood" galaxy. Values are rounded from public
// catalog data (RECONS / Gaia); good enough for a map, not for navigation.

export interface StarDef {
  name: string;
  ra: number;   // hours
  dec: number;  // degrees
  ly: number;
  color: string; // spectral class tint
  cls: string;
}

const M = "#ff8a5a", K = "#ffb347", G = "#ffd75a", F = "#f2f4ff", A = "#8ec9f0", WD = "#c0c8ff";

export const STARS: StarDef[] = [
  { name: "Sol", ra: 0, dec: 0, ly: 0, color: G, cls: "G2V" },
  { name: "Alpha Centauri", ra: 14.66, dec: -60.83, ly: 4.37, color: G, cls: "G2V+K1V" },
  { name: "Barnard's Star", ra: 17.96, dec: 4.69, ly: 5.96, color: M, cls: "M4V" },
  { name: "Wolf 359", ra: 10.94, dec: 7.01, ly: 7.86, color: M, cls: "M6V" },
  { name: "Lalande 21185", ra: 11.06, dec: 35.97, ly: 8.31, color: M, cls: "M2V" },
  { name: "Sirius", ra: 6.75, dec: -16.72, ly: 8.66, color: F, cls: "A1V" },
  { name: "Luyten 726-8", ra: 1.65, dec: -17.95, ly: 8.79, color: M, cls: "M5.5V" },
  { name: "Ross 154", ra: 18.83, dec: -23.84, ly: 9.7, color: M, cls: "M3.5V" },
  { name: "Ross 248", ra: 23.7, dec: 44.18, ly: 10.3, color: M, cls: "M5.5V" },
  { name: "Epsilon Eridani", ra: 3.55, dec: -9.46, ly: 10.5, color: K, cls: "K2V" },
  { name: "Lacaille 9352", ra: 23.1, dec: -35.85, ly: 10.7, color: M, cls: "M0.5V" },
  { name: "Ross 128", ra: 11.79, dec: 0.8, ly: 11.0, color: M, cls: "M4V" },
  { name: "EZ Aquarii", ra: 22.64, dec: -15.3, ly: 11.1, color: M, cls: "M5V" },
  { name: "61 Cygni", ra: 21.12, dec: 38.75, ly: 11.4, color: K, cls: "K5V+K7V" },
  { name: "Procyon", ra: 7.65, dec: 5.22, ly: 11.5, color: F, cls: "F5IV" },
  { name: "Struve 2398", ra: 18.71, dec: 59.63, ly: 11.5, color: M, cls: "M3V" },
  { name: "Groombridge 34", ra: 0.31, dec: 44.02, ly: 11.6, color: M, cls: "M1.5V" },
  { name: "Epsilon Indi", ra: 22.06, dec: -56.79, ly: 11.9, color: K, cls: "K5V" },
  { name: "DX Cancri", ra: 8.49, dec: 26.78, ly: 11.8, color: M, cls: "M6.5V" },
  { name: "Tau Ceti", ra: 1.73, dec: -15.94, ly: 11.9, color: G, cls: "G8V" },
  { name: "GJ 1061", ra: 3.6, dec: -44.51, ly: 12.0, color: M, cls: "M5.5V" },
  { name: "YZ Ceti", ra: 1.21, dec: -16.99, ly: 12.1, color: M, cls: "M4.5V" },
  { name: "Luyten's Star", ra: 7.46, dec: 5.23, ly: 12.4, color: M, cls: "M3.5V" },
  { name: "Teegarden's Star", ra: 2.89, dec: 16.88, ly: 12.5, color: M, cls: "M7V" },
  { name: "Kapteyn's Star", ra: 5.19, dec: -45.02, ly: 12.8, color: M, cls: "M1V" },
  { name: "Lacaille 8760", ra: 21.28, dec: -38.87, ly: 12.9, color: M, cls: "M0V" },
  { name: "Kruger 60", ra: 22.47, dec: 57.7, ly: 13.1, color: M, cls: "M3V+M4V" },
  { name: "Wolf 1061", ra: 16.5, dec: -12.66, ly: 14.0, color: M, cls: "M3V" },
  { name: "Van Maanen's Star", ra: 0.82, dec: 5.39, ly: 14.1, color: WD, cls: "DZ7" },
  { name: "Gliese 1", ra: 0.09, dec: -37.36, ly: 14.2, color: M, cls: "M1.5V" },
  { name: "Wolf 424", ra: 12.56, dec: 9.02, ly: 14.3, color: M, cls: "M5V" },
  { name: "TZ Arietis", ra: 2.0, dec: 13.05, ly: 14.6, color: M, cls: "M4.5V" },
  { name: "Gliese 687", ra: 17.61, dec: 68.34, ly: 14.8, color: M, cls: "M3V" },
  { name: "LHS 292", ra: 10.8, dec: -11.34, ly: 14.9, color: M, cls: "M6.5V" },
  { name: "Gliese 674", ra: 17.48, dec: -46.9, ly: 14.8, color: M, cls: "M2.5V" },
  { name: "Gliese 876", ra: 22.89, dec: -14.26, ly: 15.2, color: M, cls: "M4V" },
  { name: "LHS 288", ra: 10.74, dec: -61.2, ly: 15.8, color: M, cls: "M5.5V" },
  { name: "Gliese 1002", ra: 0.11, dec: -7.54, ly: 15.8, color: M, cls: "M5.5V" },
  { name: "Groombridge 1618", ra: 10.19, dec: 49.45, ly: 15.9, color: K, cls: "K7V" },
  { name: "Gliese 832", ra: 21.56, dec: -49.01, ly: 16.2, color: M, cls: "M1.5V" },
  { name: "Gliese 682", ra: 17.62, dec: -44.32, ly: 16.3, color: M, cls: "M4V" },
  { name: "Gliese 570", ra: 14.96, dec: -21.41, ly: 19.2, color: K, cls: "K4V" },
  { name: "Altair", ra: 19.85, dec: 8.87, ly: 16.7, color: F, cls: "A7V" },
  { name: "Gliese 445", ra: 11.79, dec: 78.69, ly: 17.6, color: M, cls: "M4V" },
  { name: "Gliese 526", ra: 13.76, dec: 14.89, ly: 17.7, color: M, cls: "M1.5V" },
  { name: "Sigma Draconis", ra: 19.54, dec: 69.66, ly: 18.8, color: K, cls: "K0V" },
  { name: "Eta Cassiopeiae", ra: 0.82, dec: 57.82, ly: 19.3, color: G, cls: "G0V+K7V" },
  { name: "36 Ophiuchi", ra: 17.25, dec: -26.6, ly: 19.5, color: K, cls: "K1V+K1V" },
  { name: "82 Eridani", ra: 3.33, dec: -43.07, ly: 19.7, color: G, cls: "G8V" },
  { name: "Delta Pavonis", ra: 20.14, dec: -66.18, ly: 19.9, color: G, cls: "G8IV" },
  { name: "Vega", ra: 18.62, dec: 38.78, ly: 25.0, color: A, cls: "A0V" },
  { name: "Fomalhaut", ra: 22.96, dec: -29.62, ly: 25.1, color: A, cls: "A3V" },
  { name: "70 Ophiuchi", ra: 18.09, dec: 2.5, ly: 16.6, color: K, cls: "K0V+K4V" },
  { name: "Gliese 581", ra: 15.32, dec: -7.72, ly: 20.5, color: M, cls: "M3V" },
  { name: "Xi Bootis", ra: 14.86, dec: 19.1, ly: 22.0, color: G, cls: "G8V+K4V" },
  { name: "Gliese 667", ra: 17.31, dec: -34.99, ly: 23.6, color: K, cls: "K3V+K5V+M1.5V" },
  { name: "Beta Hydri", ra: 0.43, dec: -77.25, ly: 24.3, color: G, cls: "G2IV" },
  { name: "Chi Draconis", ra: 18.35, dec: 72.73, ly: 26.3, color: F, cls: "F7V" },
  { name: "61 Virginis", ra: 13.31, dec: -18.31, ly: 27.9, color: G, cls: "G7V" },
  { name: "Zeta Tucanae", ra: 0.33, dec: -64.88, ly: 28.0, color: F, cls: "F9.5V" },
  { name: "Gamma Leporis", ra: 5.74, dec: -22.45, ly: 29.3, color: F, cls: "F6V" },
  { name: "Beta Comae Berenices", ra: 13.2, dec: 27.88, ly: 29.9, color: G, cls: "G0V" },
  { name: "Gamma Pavonis", ra: 21.44, dec: -65.37, ly: 30.1, color: F, cls: "F9V" },
  { name: "Kappa Ceti", ra: 3.32, dec: 3.37, ly: 29.5, color: G, cls: "G5V" },
  { name: "Pollux", ra: 7.76, dec: 28.03, ly: 33.8, color: K, cls: "K0III" },
  { name: "Iota Persei", ra: 3.15, dec: 49.61, ly: 34.4, color: G, cls: "G0V" },
  { name: "Denebola", ra: 11.82, dec: 14.57, ly: 35.9, color: A, cls: "A3V" },
  { name: "Arcturus", ra: 14.26, dec: 19.18, ly: 36.7, color: K, cls: "K1.5III" },
  { name: "Zeta Doradus", ra: 5.09, dec: -57.47, ly: 38.5, color: F, cls: "F9V" },
  { name: "55 Cancri", ra: 8.87, dec: 28.33, ly: 41.1, color: G, cls: "G8V" },
  { name: "HD 40307", ra: 5.9, dec: -60.02, ly: 42.4, color: K, cls: "K2.5V" },
  { name: "Capella", ra: 5.28, dec: 45.99, ly: 42.9, color: G, cls: "G3III+G8III" },
  { name: "Upsilon Andromedae", ra: 1.61, dec: 41.4, ly: 44.0, color: F, cls: "F8V" },
  { name: "47 Ursae Majoris", ra: 10.99, dec: 40.43, ly: 45.9, color: G, cls: "G1V" },
  { name: "Mu Arae", ra: 17.74, dec: -51.83, ly: 50.6, color: G, cls: "G3IV-V" },
  { name: "Gliese 86", ra: 2.18, dec: -50.82, ly: 35.2, color: K, cls: "K1V" },
  { name: "HR 8832", ra: 23.22, dec: 57.17, ly: 21.3, color: K, cls: "K3V" },
];

// Equatorial → 3D cartesian (ly), then a top-down projection onto the map.
export function starXYZ(s: StarDef): [number, number, number] {
  const ra = (s.ra / 24) * Math.PI * 2;
  const dec = (s.dec / 180) * Math.PI;
  return [s.ly * Math.cos(dec) * Math.cos(ra), s.ly * Math.cos(dec) * Math.sin(ra), s.ly * Math.sin(dec)];
}

export function starDistance(a: StarDef, b: StarDef): number {
  const [x1, y1, z1] = starXYZ(a);
  const [x2, y2, z2] = starXYZ(b);
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2 + (z1 - z2) ** 2);
}
