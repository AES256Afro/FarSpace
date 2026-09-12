import { type Game, type Scene } from "../game";
import { cargoUsed, findStation } from "../world";
import { BLUEPRINTS, MATERIALS, materialCap, engGrade, nextCost, canAfford, upgrade } from "../data/engineering";
import { RECIPES, TECHNOLOGIES, MATERIAL_GUIDE, workshop, researched, resourceName, costText, recipeReason, researchReason, enqueue, startResearch, useFuelCells } from "../core/workshop";
import type { FlightScene } from "./flight/index";
import "../ui/workshop.css";

export function openWorkshop(g: Game): void {
  const scene = g.scenes.workshop as WorkshopScene;
  scene.returnTo = g.sceneName;
  if (g.sceneName === "flight") { const fs = g.scenes.flight as FlightScene; fs.resumeNext = true; fs.paused = false; }
  g.setScene("workshop");
}
type Page = "materials" | "craft" | "research" | "production" | "upgrades";
export class WorkshopScene implements Scene {
  touchMode = "menu" as const;
  returnTo = "flight";
  page: Page = "materials";
  filter = "";
  private root: HTMLElement | null = null;
  private content!: HTMLElement;
  private status!: HTMLElement;
  private elapsed = 0;
  private snapshot = "";
  enter(g: Game): void {
    workshop(g.world.player); g.input.flush(); g.input.down.clear();
    this.root?.remove(); const root = document.createElement("section"); this.root = root;
    root.id = "workshop-screen"; root.setAttribute("aria-label", "Ship workshop");
    root.innerHTML = `<div class="workshop-shell"><header><div><span class="eyebrow">SHIP SYSTEMS</span><h1>Workshop</h1></div><button data-action="back">Back to voyage · Esc</button></header><p class="workshop-summary"></p><nav aria-label="Workshop pages"></nav><p class="workshop-status" role="status" aria-live="polite"></p><main></main><footer>Materials use separate storage. Cargo fills the hold. Inputs are spent only when a job completes. Production pauses on the title, maps and pause screens.</footer></div>`;
    this.content = root.querySelector("main")!; this.status = root.querySelector(".workshop-status")!;
    root.querySelector<HTMLButtonElement>("[data-action=back]")!.onclick = () => this.back(g);
    for (const [id, label] of Object.entries({ materials: "Materials & loot", craft: "Craft", research: "Research tree", production: "Production", upgrades: "Ship upgrades" })) {
      const b = this.button(label, () => { this.page = id as Page; this.filter = ""; this.render(g); this.root!.scrollTop = 0; }); b.dataset.page = id; root.querySelector("nav")!.append(b);
    }
    root.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); this.back(g); } if (e.key === "F5") { e.preventDefault(); g.save(); this.status.textContent = g.toastMsg; } });
    root.addEventListener("keyup", e => e.stopPropagation()); document.body.append(root); this.render(g);
    root.querySelector<HTMLButtonElement>("[data-action=back]")!.focus();
  }
  onSceneLeave(g: Game): void { this.root?.remove(); this.root = null; g.input.flush(); g.input.down.clear(); }
  back(g: Game): void { if (this.returnTo === "flight") (g.scenes.flight as FlightScene).resumeNext = true; g.setScene(this.returnTo); }
  private button(label: string, action: () => void): HTMLButtonElement { const b = document.createElement("button"); b.textContent = label; b.onclick = action; return b; }
  private text(parent: HTMLElement, tag: string, text: string): HTMLElement { const el = document.createElement(tag); el.textContent = text; parent.append(el); return el; }
  private card(parent: HTMLElement, title: string, note: string): HTMLElement { const el = document.createElement("article"); parent.append(el); this.text(el, "h2", title); this.text(el, "p", note); return el; }
  private act(g: Game, action: () => string | null, success: string): void { const message = action(); this.status.textContent = message ?? success; g.autosave(); this.render(g); }
  private render(g: Game): void {
    if (!this.root) return;
    const p = g.world.player, state = workshop(p), scroll = this.root.scrollTop;
    const focused = (document.activeElement as HTMLElement | null)?.dataset.action;
    this.content.replaceChildren(); this.content.className = this.page === "research" ? "research-grid" : "workshop-grid";
    this.root.querySelectorAll<HTMLButtonElement>("nav button").forEach(b => b.setAttribute("aria-current", String(b.dataset.page === this.page)));
    this.root.querySelector(".workshop-summary")!.textContent = `Hold ${cargoUsed(p)}/${p.cargoMax} · ${materialCap(p)} per material · ${p.fuel.toFixed(0)}/${p.fuelMax} fuel · ${state.research.length}/${TECHNOLOGIES.length} technologies`;
    if (this.page === "materials") {
      const intro = this.card(this.content, "Put your salvage to work", "Make spare parts now with nickel and carbon. Use germanium for data cores after Fabrication research. Ship upgrades also spend materials at research and refinery stations."); intro.className = "workshop-intro";
      intro.append(this.button("Make spare parts", () => { this.page = "craft"; this.filter = "nickel"; this.render(g); }));
      for (const m of MATERIALS) {
        const n = p.materials?.[m.id] ?? 0, guide = MATERIAL_GUIDE[m.id], c = this.card(this.content, `${m.name} · ${n}/${materialCap(p)}${n >= materialCap(p) ? " · Full" : ""}`, guide.use);
        this.text(c, "small", `Find it: ${guide.source}.`);
        const b = this.button(`Uses for ${m.name}`, () => { this.page = "craft"; this.filter = m.id; this.render(g); }); b.dataset.action = `use-${m.id}`; c.append(b);
      }
      for (const [id, n] of Object.entries(p.cargo).filter(([, n]) => n > 0)) {
        const uses = RECIPES.filter(r => r.cost.cargo?.[id]).map(r => r.name);
        const studies = TECHNOLOGIES.filter(t => t.cost.cargo?.[id]).map(t => t.name);
        const c = this.card(this.content, `${resourceName(id)} · ${n} in hold`, [...(uses.length ? [`Build: ${uses.join(", ")}.`] : []), ...(studies.length ? [`Research: ${studies.join(", ")}.`] : []), "Can also be sold at a market or delivered for a matching contract."].join(" "));
        if (id === "fuel") c.append(this.button("Transfer one cell to tank", () => this.act(g, () => useFuelCells(p), "")));
      }
    } else if (this.page === "craft") {
      const intro = this.card(this.content, this.filter ? `Recipes using ${resourceName(this.filter)}` : "Fabrication bench", "Each recipe shows your stock against its cost. Research unlocks more recipes. Fittings require a station. Jobs retain progress when supplies or storage run out."); intro.className = "workshop-intro";
      if (this.filter) intro.append(this.button("Show all recipes", () => { this.filter = ""; this.render(g); }));
      for (const recipe of RECIPES.filter(r => !this.filter || r.cost.materials?.[this.filter] || r.cost.cargo?.[this.filter])) {
        const c = this.card(this.content, `${recipe.name} · ${recipe.output.qty} per batch`, recipe.use);
        this.text(c, "p", costText(recipe.cost, p)); this.text(c, "small", `${recipe.seconds} seconds per batch${recipe.tech ? ` · Requires ${TECHNOLOGIES.find(t => t.id === recipe.tech)!.name}` : " · Available from the start"}`);
        const reason = recipeReason(p, recipe); this.text(c, "p", reason ?? "Supplies ready.");
        for (const n of researched(p, "automation") && recipe.output.kind !== "module" ? [1, 5, 20] : [1]) {
          const b = this.button(n === 1 ? "Build one batch" : `Queue ${n} batches`, () => this.act(g, () => enqueue(p, recipe.id, n), `${recipe.name} added to production.`)); b.disabled = !!reason; b.dataset.action = `craft-${recipe.id}-${n}`; c.append(b);
        }
      }
    } else if (this.page === "research") {
      const intro = this.card(this.content, "Research and development", "Fabrication opens three branches. Finish a parent technology before starting its children. Research and production can run together. Inputs remain yours until completion."); intro.className = "workshop-intro";
      for (const tech of TECHNOLOGIES) {
        const done = researched(p, tech.id), active = state.project?.id === tech.id, reason = researchReason(p, tech);
        const c = this.card(this.content, tech.name, tech.benefit); c.dataset.research = tech.id; c.dataset.complete = String(done);
        this.text(c, "small", tech.parent ? `Requires: ${TECHNOLOGIES.find(t => t.id === tech.parent)!.name} → ${tech.name}` : "Start here");
        this.text(c, "p", done ? "Complete" : costText(tech.cost, p));
        if (active) { this.text(c, "p", "Research in progress").dataset.progress = "research"; c.append(this.button("Cancel research", () => this.act(g, () => { delete state.project; return null; }, "Research cancelled. No inputs spent."))); }
        else { this.text(c, "p", done ? "Available on every ship you own." : reason ?? `${tech.seconds} seconds · Ready to research`); const b = this.button(done ? "Completed" : "Research", () => this.act(g, () => startResearch(p, tech.id), `${tech.name} research started.`)); b.disabled = done || !!reason || !!state.project; b.dataset.action = `research-${tech.id}`; c.append(b); }
      }
    } else if (this.page === "production") {
      const intro = this.card(this.content, state.paused ? "Production paused" : "Production running", "Only the first production job runs. Shortages or a full hold stop that job before spending inputs. Cancelling retains inputs and discards its unfinished work. No production runs while the game is closed."); intro.className = "workshop-intro";
      intro.append(this.button(state.paused ? "Resume production" : "Pause production", () => this.act(g, () => { state.paused = !state.paused; return null; }, state.paused ? "Production resumed." : "Production paused.")));
      if (state.project) this.text(intro, "p", "").dataset.progress = "research";
      if (!state.queue.length) this.text(intro, "p", "No jobs queued. Choose a recipe in Craft.");
      state.queue.forEach((job, i) => { const recipe = RECIPES.find(r => r.id === job.recipe)!; const c = this.card(this.content, `${i + 1}. ${recipe.name}`, `${job.remaining} ${job.remaining === 1 ? "batch" : "batches"} remaining`); this.text(c, "p", "").dataset.progress = String(i); c.append(this.button("Cancel job", () => this.act(g, () => { state.queue.splice(i, 1); return null; }, "Job cancelled. No inputs spent."))); });
    } else {
      const st = findStation(g.world, p.dockedAt ?? "")?.st, here = st?.type === "research" || st?.type === "refinery";
      const intro = this.card(this.content, "Engineering grades", here ? `Apply upgrades at ${st.name}. Existing grades remain available.` : "Dock at a research or refinery station to apply these upgrades. Each grade is permanent across ship changes."); intro.className = "workshop-intro";
      for (const bp of BLUEPRINTS) {
        const cost = nextCost(p, bp), c = this.card(this.content, `${bp.name} · Grade ${engGrade(p, bp.id)}/3`, bp.desc);
        this.text(c, "p", cost ? costText({ materials: cost }, p) : "Maximum grade reached.");
        const b = this.button("Apply next grade", () => this.act(g, () => { if (!here || !upgrade(p, bp)) return "Upgrade unavailable."; (p.flags ??= {}).engineer = true; return null; }, `${bp.name} applied.`)); b.disabled = !here || !cost || !canAfford(p, cost); b.dataset.action = `upgrade-${bp.id}`; c.append(b);
      }
    }
    this.snapshot = JSON.stringify([p.materials, p.cargo, state.research, state.project?.id, state.queue.map(j => [j.recipe, j.remaining]), state.paused, p.engineering, p.modules]);
    if (focused) (this.root.querySelector<HTMLButtonElement>(`[data-action="${focused}"]`) ?? this.content.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus({ preventScroll: true });
    this.root.scrollTop = scroll; this.progress(g);
  }
  private progress(g: Game): void {
    const p = g.world.player, state = workshop(p);
    this.root?.querySelectorAll<HTMLElement>("[data-progress]").forEach(el => {
      if (el.dataset.progress === "research") { const t = TECHNOLOGIES.find(t => t.id === state.project?.id); el.textContent = t ? `${t.name}: ${Math.floor(100 * state.project!.progress / t.seconds)}% · ${state.paused ? "Paused" : researchReason(p, t) ?? "Working"}` : "Research complete."; }
      else { const job = state.queue[Number(el.dataset.progress)], r = RECIPES.find(r => r.id === job?.recipe); if (job && r) el.textContent = `${Math.floor(100 * job.progress / r.seconds)}% · ${state.paused ? "Paused" : recipeReason(p, r) ?? (el.dataset.progress === "0" ? "Working" : "Waiting")}`; }
    });
  }
  update(g: Game, dt: number): void {
    if (g.input.wasPressed("Escape")) { this.back(g); return; }
    if (g.toastTimer > 0 && /^(Built |.* research complete\.)/.test(g.toastMsg)) this.status.textContent = g.toastMsg;
    this.elapsed += dt; if (this.elapsed < 0.25) return; this.elapsed = 0;
    const p = g.world.player, s = workshop(p), snap = JSON.stringify([p.materials, p.cargo, s.research, s.project?.id, s.queue.map(j => [j.recipe, j.remaining]), s.paused, p.engineering, p.modules]);
    if (snap !== this.snapshot) this.render(g); else this.progress(g);
  }
  draw(_g: Game, ctx: CanvasRenderingContext2D): void { ctx.fillStyle = "#080e18"; ctx.fillRect(0, 0, 480, 270); }
}
