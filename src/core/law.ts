import { FACTIONS } from "../data/data";
import { lawLevelFor, ledger, logEntry, type World } from "../world";

export const LAW_COOLDOWN = 60;
const jurisdiction = (id: string) => id !== "vex" && FACTIONS.some(f => f.id === id);

export function lawCases(w: World): string[] {
  const p = w.player, here = w.systems[p.systemId].factionId;
  const ids = [...(p.lawCases ?? [])];
  if (jurisdiction(here) && (p.wanted > 0 || lawLevelFor(w, p.systemId) > 0)) ids.push(here);
  return [...new Set(ids.filter(jurisdiction))].sort();
}

export function lawActive(w: World): boolean {
  return w.player.wanted > 0 || lawCases(w).length > 0;
}

export function recordOffence(w: World, heat: number, factionId = w.systems[w.player.systemId].factionId): void {
  if (!Number.isFinite(heat) || heat <= 0) return;
  const p = w.player;
  p.wanted = Math.min(1, p.wanted + heat);
  p.lawQuiet = 0;
  if (jurisdiction(factionId)) {
    p.lawCases = [...new Set([...(p.lawCases ?? []), factionId])];
    if (p.lawStandDown) delete p.lawStandDown[factionId];
  }
}

// A closed pursuit remains closed until another offence, even at poor standing.
// Reputation still controls prices, contracts and access to military ports.
export function closeLawCases(w: World, extra: string[] = []): void {
  const p = w.player;
  p.lawStandDown ??= {};
  for (const id of [...lawCases(w), ...extra].filter(jurisdiction)) p.lawStandDown[id] = true;
  p.wanted = 0; p.lawCases = []; p.lawQuiet = 0;
}

export function tickLawCooldown(w: World, dt: number, contact: boolean): boolean {
  if (!Number.isFinite(dt) || dt <= 0) return false;
  const p = w.player;
  if (!lawActive(w)) { p.lawQuiet = 0; return false; }
  p.lawCases = lawCases(w);
  if (contact) { p.lawQuiet = 0; return false; }
  p.lawQuiet = Math.min(LAW_COOLDOWN, Math.max(0, p.lawQuiet ?? 0) + Math.min(dt, 1));
  if (p.lawQuiet < LAW_COOLDOWN - 1e-8) return false;
  closeLawCases(w);
  logEntry(w, "Patrol pursuit closed after a quiet minute out of contact. Standing unchanged.");
  return true;
}

export interface LawSettlement {
  systemId: string;
  factions: string[];
  cost: number;
  record: string;
}

export function lawSettlement(w: World): LawSettlement | null {
  const p = w.player, here = w.systems[p.systemId].factionId;
  if (!jurisdiction(here)) return null;
  const factions = [...new Set([...lawCases(w), here])].sort();
  const standing = factions.map(id => p.rep[id] ?? 0);
  if (!lawActive(w) && !standing.some(r => r < 0)) return null;
  const cost = Math.ceil(200 + 800 * p.wanted + 30 * standing.reduce((sum, r) => sum + Math.max(0, -r), 0));
  return { systemId: p.systemId, factions, cost, record: JSON.stringify([p.wanted, factions, standing]) };
}

export function settleLaw(w: World, quote: LawSettlement): string | null {
  const current = lawSettlement(w), p = w.player;
  if (!current || current.systemId !== quote.systemId || current.record !== quote.record || current.cost !== quote.cost) return "THE RECORD CHANGED. CONTACT TRAFFIC CONTROL AGAIN.";
  if (p.credits < current.cost) return "NOT ENOUGH CREDITS. BREAK CONTACT FOR A FREE COOLDOWN.";
  p.credits -= current.cost; ledger(p, "Traffic control settlement", -current.cost);
  closeLawCases(w, current.factions);
  for (const id of current.factions) p.rep[id] = Math.max(0, p.rep[id] ?? 0);
  logEntry(w, `Settled patrol record with traffic control for ${current.cost}cr. ${current.factions.join(", ")} standing restored to at least neutral.`);
  return null;
}
