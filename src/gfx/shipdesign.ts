// Hull proportions are fixed by class. Seeded detail never changes the nose.
type Profile = readonly (readonly [number, number])[];
const PROFILES: Record<string, Profile> = {
  scout: [[0, .12], [.15, .18], [.3, .35], [.48, .3], [.65, .18], [.85, .09], [1, 0]],
  prospector: [[0, .18], [.15, .3], [.5, .3], [.64, .2], [.88, .09], [1, 0]],
  freighter: [[0, .21], [.15, .28], [.6, .28], [.78, .16], [1, .02]],
  interceptor: [[0, .1], [.15, .2], [.28, .37], [.42, .26], [.72, .1], [1, 0]],
  explorer: [[0, .12], [.2, .38], [.3, .4], [.38, .18], [.72, .15], [1, 0]],
  barge: [[0, .25], [.12, .33], [.67, .33], [.76, .22], [1, .03]],
  carrier: [[0, .2], [.12, .3], [.6, .34], [.8, .24], [1, .02]],
  "service-cutter": [[0, .16], [.2, .24], [.5, .25], [.72, .15], [1, 0]],
};

export function shipDesign(size: number, style = "scout") {
  const profile = PROFILES[style] ?? PROFILES.scout;
  const tail = 2, nose = size - 2, center = Math.floor(size / 2);
  const widths = Array.from({ length: size }, (_, x) => {
    if (x < tail || x > nose) return -1;
    const t = (x - tail) / (nose - tail);
    const end = profile.findIndex(([at]) => at >= t);
    const [x1, w1] = profile[Math.max(0, end - 1)], [x2, w2] = profile[Math.max(0, end)];
    return Math.round(size * (w1 + (w2 - w1) * (x2 === x1 ? 0 : (t - x1) / (x2 - x1))));
  });
  const engineOffset = Math.max(1, Math.floor(widths[tail] * .6));
  return { tail, nose, center, widths, engines: [-engineOffset, engineOffset] };
}
