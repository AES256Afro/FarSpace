// Presentation-only randomness, independent of the world's random streams.
import { RNG } from "./rng";
export const TITLE_VIEWS = ["orbit", "station", "bridge"] as const;
export type TitleView = typeof TITLE_VIEWS[number];
interface DeckState { remaining: TitleView[]; last: TitleView | null }
export class TitleViews {
  private state: DeckState;
  constructor(private random: () => number, saved?: unknown) {
    const s = saved as Partial<DeckState> | undefined;
    this.state = s && Array.isArray(s.remaining) && s.remaining.every(v => TITLE_VIEWS.includes(v))
      && new Set(s.remaining).size === s.remaining.length && (s.last === null || TITLE_VIEWS.includes(s.last!))
      && !s.remaining.includes(s.last!) ? { remaining: [...s.remaining], last: s.last! } : { remaining: [], last: null };
  }
  next(): TitleView {
    if (!this.state.remaining.length) this.state.remaining = [...TITLE_VIEWS];
    const choices = this.state.remaining.filter(v => v !== this.state.last);
    const next = choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))];
    this.state.remaining = this.state.remaining.filter(v => v !== next); this.state.last = next;
    return next;
  }
  snapshot(): DeckState { return { remaining: [...this.state.remaining], last: this.state.last }; }
}
export function presentationRandom(): () => number {
  let seed = Date.now();
  try { seed = crypto.getRandomValues(new Uint32Array(1))[0]; } catch { /* local clock fallback */ }
  const rng = new RNG(seed); return () => rng.next();
}
