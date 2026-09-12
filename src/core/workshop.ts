import { cargoUsed, rememberYardFittings, refreshFittedStats, type PlayerState } from "../world";
import { MATERIALS } from "../data/engineering";
import { COMMODITIES } from "../data/data";
import { hasModule } from "../data/modules";

export interface ResourceCost { materials?: Record<string, number>; cargo?: Record<string, number> }
export interface ResearchDef { id: string; name: string; parent?: string; seconds: number; cost: ResourceCost; benefit: string }
export interface Recipe { id: string; name: string; tech?: string; seconds: number; cost: ResourceCost; output: { kind: "cargo" | "module" | "torpedoes" | "seismic"; id: string; qty: number }; use: string }
export interface ProductionJob { recipe: string; remaining: number; progress: number }
export interface WorkshopState { research: string[]; project?: { id: string; progress: number }; queue: ProductionJob[]; paused: boolean }
export const TECHNOLOGIES: ResearchDef[] = [
  { id: "fabrication", name: "Fabrication", seconds: 20, cost: { materials: { nickel: 4, carbon: 4 } }, benefit: "Build data cores, torpedoes and seismic charges." },
  { id: "metallurgy", name: "Metallurgy", parent: "fabrication", seconds: 30, cost: { materials: { iron: 8, vanadium: 4 }, cargo: { ore: 3 } }, benefit: "Turn recovered alloys into six spare parts per batch." },
  { id: "supplies", name: "Field supplies", parent: "fabrication", seconds: 30, cost: { materials: { carbon: 8, germanium: 3 }, cargo: { med: 1 } }, benefit: "Make medical supplies and fuel cells from salvage." },
  { id: "automation", name: "Production control", parent: "fabrication", seconds: 30, cost: { materials: { germanium: 6, nickel: 6 }, cargo: { data: 1 } }, benefit: "Queue five jobs with up to twenty batches each. Pause or cancel any job." },
  { id: "mining", name: "Mining systems", parent: "metallurgy", seconds: 45, cost: { materials: { germanium: 6, vanadium: 4 }, cargo: { data: 2 } }, benefit: "Mine 20% faster. Build collectors, prospectors and a refinery at a station." },
  { id: "storage", name: "Material storage", parent: "metallurgy", seconds: 35, cost: { materials: { nickel: 8, germanium: 4 }, cargo: { metals: 3 } }, benefit: "Raise storage from 60 to 120 of each material." },
  { id: "power", name: "Reactor chemistry", parent: "supplies", seconds: 45, cost: { materials: { polonium: 2, vanadium: 6 }, cargo: { data: 2, relics: 1 } }, benefit: "Use polonium to produce eight fuel cells per batch." },
];
export const RECIPES: Recipe[] = [
  { id: "refine", name: "Refined metals", seconds: 5, cost: { cargo: { ore: 3 } }, output: { kind: "cargo", id: "metals", qty: 1 }, use: "Sell at a market or use in fabrication." },
  { id: "plate", name: "Metal from minerals", seconds: 5, cost: { materials: { iron: 4, nickel: 2 } }, output: { kind: "cargo", id: "metals", qty: 1 }, use: "Turn mineral storage into cargo for sale or construction." },
  { id: "parts", name: "Spare parts", seconds: 6, cost: { materials: { nickel: 3, carbon: 2 } }, output: { kind: "cargo", id: "parts", qty: 1 }, use: "Seal breaches, repair ships and build structures." },
  { id: "fuel", name: "Fuel cells", seconds: 6, cost: { cargo: { water: 1 }, materials: { carbon: 3 } }, output: { kind: "cargo", id: "fuel", qty: 2 }, use: "Sell, stock a depot, or transfer cells into your ship's tank." },
  { id: "data", name: "Data cores", tech: "fabrication", seconds: 8, cost: { materials: { germanium: 3, nickel: 2 } }, output: { kind: "cargo", id: "data", qty: 1 }, use: "Research production, mining and reactor technology." },
  { id: "torpedoes", name: "Torpedo", tech: "fabrication", seconds: 8, cost: { cargo: { metals: 2 }, materials: { nickel: 3 } }, output: { kind: "torpedoes", id: "torpedoes", qty: 1 }, use: "Load one round for R in flight." },
  { id: "seismic", name: "Seismic charge", tech: "fabrication", seconds: 8, cost: { cargo: { parts: 1 }, materials: { vanadium: 3 } }, output: { kind: "seismic", id: "seismic", qty: 1 }, use: "Press C near a core asteroid, then move clear." },
  { id: "alloy-parts", name: "Alloy components", tech: "metallurgy", seconds: 12, cost: { cargo: { metals: 2 }, materials: { vanadium: 4, germanium: 3 } }, output: { kind: "cargo", id: "parts", qty: 6 }, use: "Produce spare parts from recovered circuits and alloys." },
  { id: "med", name: "Medical supplies", tech: "supplies", seconds: 8, cost: { cargo: { food: 1, water: 1 }, materials: { carbon: 2 } }, output: { kind: "cargo", id: "med", qty: 1 }, use: "Treat crew, answer relief contracts or sell at a station." },
  { id: "salvage-fuel", name: "Recovered fuel cells", tech: "supplies", seconds: 8, cost: { materials: { carbon: 4, vanadium: 2 } }, output: { kind: "cargo", id: "fuel", qty: 2 }, use: "Make fuel without water ice." },
  { id: "reactor-fuel", name: "Reactor fuel cells", tech: "power", seconds: 12, cost: { materials: { polonium: 1, carbon: 4 } }, output: { kind: "cargo", id: "fuel", qty: 8 }, use: "Turn rare reactor material into fuel for long journeys." },
  ...(["prospector", "collector", "refinery"] as const).map((id, i): Recipe => ({ id, name: ["Prospector limpets", "Collector limpets", "Refinery"][i], tech: "mining", seconds: 20, cost: { cargo: { parts: 5 + i * 2, metals: 4 }, materials: { germanium: 4, vanadium: 3 } }, output: { kind: "module", id, qty: 1 }, use: ["Read a rock's exact mineral yield before mining.", "Collect ore and cargo within 240 metres.", "Recover one refined metal from each mined rock."][i] })),
];
export const MATERIAL_GUIDE: Record<string, { source: string; use: string }> = {
  iron: { source: "Ordinary asteroids", use: "Metals, metallurgy and ship upgrades" },
  nickel: { source: "Asteroids and wreck shielding", use: "Parts, data cores, ammunition and upgrades" },
  carbon: { source: "Asteroids and wreck shielding", use: "Parts, fuel, medical supplies and upgrades" },
  germanium: { source: "Wreck circuits and some asteroids", use: "Data cores, production control and mining equipment" },
  vanadium: { source: "Rich asteroids and wreck shielding", use: "Charges, alloy components, fuel and mining equipment" },
  polonium: { source: "Core asteroids and signals", use: "Reactor chemistry, fuel and advanced ship upgrades" },
};
export function workshop(p: PlayerState): WorkshopState { return p.workshop ??= { research: [], queue: [], paused: false }; }
export function researched(p: PlayerState, id: string): boolean { return p.workshop?.research.includes(id) ?? false; }
export function resourceName(id: string): string { return MATERIALS.find(m => m.id === id)?.name ?? COMMODITIES.find(c => c.id === id)?.name ?? id; }
export function costText(cost: ResourceCost, p?: PlayerState): string {
  return (["materials", "cargo"] as const).flatMap(store => Object.entries(cost[store] ?? {}).map(([id, n]) => `${resourceName(id)} ${n}${p ? ` (have ${p[store]?.[id] ?? 0})` : ""}`)).join(" · ");
}
function costReason(p: PlayerState, cost: ResourceCost): string | null {
  for (const store of ["materials", "cargo"] as const) for (const [id, n] of Object.entries(cost[store] ?? {})) if ((p[store]?.[id] ?? 0) < n) return `Need ${n} ${resourceName(id)}. You have ${p[store]?.[id] ?? 0}.`;
  return null;
}
function spend(p: PlayerState, cost: ResourceCost): void {
  for (const store of ["materials", "cargo"] as const) for (const [id, n] of Object.entries(cost[store] ?? {})) p[store]![id] -= n;
}
export function researchReason(p: PlayerState, tech: ResearchDef): string | null {
  if (researched(p, tech.id)) return "Research complete.";
  if (tech.parent && !researched(p, tech.parent)) return `Research ${TECHNOLOGIES.find(t => t.id === tech.parent)!.name} first.`;
  return costReason(p, tech.cost);
}
export function startResearch(p: PlayerState, id: string): string | null {
  const tech = TECHNOLOGIES.find(t => t.id === id); if (!tech) return "Unknown research.";
  if (workshop(p).project) return "Finish or cancel the current research first.";
  const reason = researchReason(p, tech); if (reason) return reason;
  workshop(p).project = { id, progress: 0 }; return null;
}
export function recipeReason(p: PlayerState, recipe: Recipe): string | null {
  if (recipe.tech && !researched(p, recipe.tech)) return `Research ${TECHNOLOGIES.find(t => t.id === recipe.tech)!.name} first.`;
  if (recipe.output.kind === "module") {
    if (hasModule(p, recipe.output.id)) return "Already fitted.";
    if (!p.dockedAt) return "Dock at a station to build and fit this equipment.";
  }
  const missing = costReason(p, recipe.cost); if (missing) return missing;
  const consumed = Object.values(recipe.cost.cargo ?? {}).reduce((a, b) => a + b, 0);
  if (recipe.output.kind === "cargo" && cargoUsed(p) - consumed + recipe.output.qty > p.cargoMax) return "Cargo hold full. Sell or store cargo, or choose a recipe that consumes cargo.";
  return null;
}
export function enqueue(p: PlayerState, id: string, batches = 1): string | null {
  const recipe = RECIPES.find(r => r.id === id); if (!recipe) return "Unknown recipe.";
  const auto = researched(p, "automation"), state = workshop(p);
  if (!Number.isInteger(batches) || batches < 1 || batches > (auto ? 20 : 1)) return "Research Production control for batches of up to 20.";
  if (state.queue.length >= (auto ? 5 : 1)) return auto ? "Queue full. Five jobs maximum." : "Finish this job or research Production control to queue more.";
  if (recipe.output.kind === "module" && (batches !== 1 || state.queue.some(j => j.recipe === id))) return "Only one of each fitting can be built.";
  const reason = recipeReason(p, recipe); if (reason) return reason;
  state.queue.push({ recipe: id, remaining: batches, progress: 0 }); return null;
}
export function tickWorkshop(p: PlayerState, dt: number): string[] {
  const state = p.workshop; if (!state || state.paused || !Number.isFinite(dt) || dt <= 0) return [];
  dt = Math.min(dt, 0.25); const events: string[] = [];
  const project = state.project, tech = TECHNOLOGIES.find(t => t.id === project?.id);
  if (project && tech && !researchReason(p, tech)) {
    project.progress = Math.min(tech.seconds, project.progress + dt);
    if (project.progress >= tech.seconds) { spend(p, tech.cost); state.research.push(tech.id); delete state.project; events.push(`${tech.name} research complete.`); }
  }
  const job = state.queue[0], recipe = RECIPES.find(r => r.id === job?.recipe);
  if (job && recipe && !recipeReason(p, recipe)) {
    job.progress = Math.min(recipe.seconds, job.progress + dt);
    if (job.progress >= recipe.seconds) {
      spend(p, recipe.cost); const out = recipe.output;
      if (out.kind === "cargo") p.cargo[out.id] = (p.cargo[out.id] ?? 0) + out.qty;
      else if (out.kind === "module") { rememberYardFittings(p); (p.modules ??= []).push(out.id); refreshFittedStats(p); }
      else p[out.kind] = (p[out.kind] ?? 0) + out.qty;
      job.remaining--; job.progress = 0; if (job.remaining <= 0) state.queue.shift();
      events.push(`Built ${out.qty} ${recipe.name}.`);
    }
  }
  return events;
}
export function useFuelCells(p: PlayerState): string {
  if ((p.cargo.fuel ?? 0) < 1) return "No fuel cells in the hold.";
  if (p.fuelMax - p.fuel < 10) return "Make room for 10 fuel in the tank first.";
  p.cargo.fuel--; p.fuel += 10; return "Transferred one fuel cell into the tank. +10 fuel.";
}

export function validWorkshopState(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== "object") return false;
  const s = value as WorkshopState;
  if (!Array.isArray(s.research) || new Set(s.research).size !== s.research.length || !s.research.every(id => TECHNOLOGIES.some(t => t.id === id)) || typeof s.paused !== "boolean") return false;
  if (s.research.some(id => { const t = TECHNOLOGIES.find(t => t.id === id)!; return t.parent && !s.research.includes(t.parent); })) return false;
  const auto = s.research.includes("automation");
  if (!Array.isArray(s.queue) || s.queue.length > (auto ? 5 : 1)) return false;
  for (const j of s.queue) {
    const r = RECIPES.find(r => r.id === j?.recipe);
    if (!r || !Number.isInteger(j.remaining) || j.remaining < 1 || j.remaining > (auto ? 20 : 1) || !Number.isFinite(j.progress) || j.progress < 0 || j.progress > r.seconds || (r.tech && !s.research.includes(r.tech))) return false;
    if (r.output.kind === "module" && (j.remaining !== 1 || s.queue.filter(q => q.recipe === j.recipe).length !== 1)) return false;
  }
  if (s.project !== undefined) {
    const t = TECHNOLOGIES.find(t => t.id === s.project?.id);
    if (!t || s.research.includes(t.id) || (t.parent && !s.research.includes(t.parent)) || !Number.isFinite(s.project.progress) || s.project.progress < 0 || s.project.progress > t.seconds) return false;
  }
  return true;
}
