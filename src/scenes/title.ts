// A scene-owned HTML menu over decorative pixel artwork.
import { Game, Scene } from "../game";
import { TitleBackdrop } from "../gfx/titlebackdrop";
import { TitleViews, TitleView, presentationRandom } from "../core/titleviews";
import { titlePreview, TitlePreview, saveAge } from "../core/titlepreview";
import { settings, toggleFullscreen } from "../core/settings";
import { activeSlot, setActiveSlot, SLOTS } from "../save";
import { readSavePreview, preserveSlot, replaceSlot, clearSavedSlot, restoreSlot, SaveOperation } from "../core/savelibrary";
import { hull } from "../data/hulls";
import { music } from "../core/music";
import { sfx } from "../core/sfx";
import * as cloud from "../core/cloud";
import * as wire from "../core/wire";
import type { World } from "../world";
import "../ui/title.css";

type Page = "home" | "new" | "library" | "slots" | "slot" | "copy" | "help" | "identity" | "cloud" | "form" | "confirm" | "loading";
interface Action { id: string; label: string; sub?: string; act: () => void; primary?: boolean; disabled?: boolean }
const VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "?";
const DECK_KEY = "farspace-title-views";
const CHILDREN = new Set(["settings", "help", "almanac", "whatsnew", "chronicle"]);

export class TitleScene implements Scene {
  touchMode = "menu" as const;
  view: TitleView = "orbit";
  page: Page = "home";
  t = 0;
  preview!: TitlePreview;
  private deck: TitleViews | null = null;
  private backdrop: TitleBackdrop | null = null;
  private root: HTMLElement | null = null;
  private art: HTMLCanvasElement | null = null;
  private menu!: HTMLElement;
  private status!: HTMLElement;
  private caption!: HTMLElement;
  private resume = false;
  private focusId = "";
  private scroll = 0;
  private request = 0;
  private message = "";
  private cloudUnavailable = false;
  private selectedSlot = 0;
  private slotReturn: "new" | "library" = "library";
  private form?: { title: string; label: string; value: string; max: number; submit: (value: string) => void; back: Page };
  private confirmation?: { title: string; detail: string; accept: string; act: () => void; back: Page };

  enter(g: Game): void {
    this.preview = titlePreview();
    if (!this.deck) {
      let saved: unknown;
      try { saved = JSON.parse(sessionStorage.getItem(DECK_KEY) ?? "null"); } catch { /* start a fresh deck */ }
      this.deck = new TitleViews(presentationRandom(), saved);
    }
    if (!this.resume) { this.advanceView(); this.page = "home"; this.focusId = ""; this.scroll = 0; }
    if (this.page === "slot" || this.page === "copy") this.preview = titlePreview(this.selectedSlot);
    this.resume = false; this.message = this.preview.error ?? "";
    this.backdrop ??= new TitleBackdrop();
    g.input.flush(); g.input.down.clear(); g.input.lastRawKey = null;
    this.mount(g); this.render(g, true);
  }

  onSceneLeave(g: Game, next: string): void {
    this.resume = CHILDREN.has(next); this.request++;
    this.scroll = this.root?.scrollTop ?? 0;
    this.root?.remove(); this.root = null; this.art = null;
    g.input.flush(); g.input.down.clear(); g.input.lastRawKey = null;
  }

  private advanceView(): void {
    this.view = this.deck!.next(); this.t = 0;
    try { sessionStorage.setItem(DECK_KEY, JSON.stringify(this.deck!.snapshot())); } catch { /* presentation only */ }
  }

  private mount(g: Game): void {
    this.root?.remove();
    const root = document.createElement("section"); root.id = "title-screen"; root.setAttribute("aria-label", "FarSpace main menu");
    root.innerHTML = `<canvas class="title-art" width="480" height="270" aria-hidden="true"></canvas>
      <div class="title-shell"><header class="title-top"><span>INDEPENDENT FLIGHT</span><span class="title-slot"></span></header>
      <div class="title-body"><div><h1 class="title-brand">FARSPACE</h1><p class="title-tagline">Your ship. Your crew. Your way home.</p>
      <div class="title-menu"></div><div class="title-status" role="status" aria-live="polite"></div></div>
      <div class="title-caption"></div></div><footer class="title-footer"><span class="title-version"></span><nav aria-label="Display and news"></nav></footer></div>`;
    this.root = root; this.art = root.querySelector("canvas"); this.menu = root.querySelector(".title-menu")!;
    this.status = root.querySelector(".title-status")!; this.caption = root.querySelector(".title-caption")!;
    root.querySelector(".title-slot")!.textContent = `LOCAL SLOT ${activeSlot() + 1}`;
    root.querySelector(".title-version")!.textContent = `v${VERSION}`;
    root.addEventListener("focusin", e => { const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]"); if (b) this.focusId = b.dataset.action!; });
    root.addEventListener("keydown", e => {
      e.stopPropagation();
      const typing = (e.target as HTMLElement).matches("input,textarea,select");
      if (e.key === "Escape") { e.preventDefault(); this.back(g); return; }
      if (typing) return;
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault(); this.moveFocus(e.key === "ArrowUp" ? -1 : 1, e.key === "Home" ? "first" : e.key === "End" ? "last" : undefined);
      } else if (e.key.toLowerCase() === "f") { e.preventDefault(); toggleFullscreen(document.documentElement); }
      else if (e.key.toLowerCase() === "h") { e.preventDefault(); music.toggle(); this.footer(g); }
      else if (e.key === "F5" || e.key === "F9") e.preventDefault();
    });
    root.addEventListener("keyup", e => e.stopPropagation());
    document.body.append(root);
  }

  private moveFocus(dir: number, edge?: "first" | "last"): void {
    const buttons = Array.from(this.root?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const i = edge === "first" ? 0 : edge === "last" ? buttons.length - 1 : (current + dir + buttons.length) % buttons.length;
    buttons[i].focus();
  }

  private button(a: Action): HTMLButtonElement {
    const b = document.createElement("button"); b.type = "button"; b.dataset.action = a.id; b.disabled = a.disabled ?? false;
    b.className = a.primary ? "primary" : ""; b.textContent = a.label;
    if (a.sub) { const sub = document.createElement("small"); sub.textContent = a.sub; b.append(sub); }
    b.onclick = () => { if (b.disabled || !b.isConnected) return; this.focusId = a.id; sfx.select(); a.act(); };
    return b;
  }

  private show(g: Game, page: Page): void {
    this.page = page; this.message = ""; this.focusId = ""; this.scroll = 0;
    if (page !== "confirm" && page !== "form") this.preview = titlePreview(page === "slot" || page === "copy" ? this.selectedSlot : activeSlot());
    this.render(g);
  }
  private open(g: Game, scene: string): void { g.settingsReturn = "title"; g.setScene(scene); }
  private back(g: Game): void {
    this.request++;
    const page = this.page === "form" ? this.form?.back ?? "home" : this.page === "confirm" ? this.confirmation?.back ?? "home"
      : this.page === "copy" ? "slot" : this.page === "slot" ? "slots" : this.page === "slots" ? this.slotReturn
      : this.page === "cloud" || this.page === "identity" ? "library" : "home";
    this.show(g, page);
  }
  private ask(g: Game, title: string, label: string, value: string, max: number, submit: (value: string) => void, back: Page): void {
    this.form = { title, label, value, max, submit, back }; this.show(g, "form");
  }
  private confirm(g: Game, title: string, detail: string, accept: string, act: () => void, back: Page): void {
    this.confirmation = { title, detail, accept, act, back }; this.show(g, "confirm");
  }
  private say(message: string): void { this.message = message; this.status.textContent = message; }

  actions(g: Game): Action[] {
    const p = this.preview, code = cloud.getCode();
    if (this.page === "slots") return Array.from({ length: SLOTS }, (_, slot) => {
      const r = readSavePreview(slot), w = r.world;
      return { id: `slot-${slot}`, label: `Slot ${slot + 1}${slot === activeSlot() ? " · active" : ""}`,
        sub: w ? `${w.player.shipName || hull(w.player.hullId).name} · ${w.systems[w.player.systemId].name} · ${saveAge(w.savedAt ?? null, Date.now())}` : r.present ? "Unreadable save · original kept" : "Empty slot",
        act: () => { this.selectedSlot = slot; this.show(g, "slot"); } };
    });
    if (this.page === "slot") {
      const slot = this.selectedSlot, r = readSavePreview(slot), w = r.world;
      return [
        { id: "use-slot", label: `Choose slot ${slot + 1}`, sub: "Select this slot and return. Loading is a separate action.", primary: true, act: () => {
          if (!setActiveSlot(slot)) { this.say("The active slot could not be stored. Your previous selection was kept."); return; }
          this.preview = titlePreview(); this.root!.querySelector(".title-slot")!.textContent = `LOCAL SLOT ${slot + 1}`;
          this.show(g, this.slotReturn === "new" ? "new" : "home");
        } },
        { id: "copy-save", label: "Copy this saved voyage", sub: "Choose another local slot. Its cloud code stays with that slot.", disabled: !w, act: () => this.show(g, "copy") },
        { id: "export-slot", label: "Export this slot", sub: "Download its stored bytes, even if it cannot be loaded.", disabled: !r.present, act: () => { if (r.raw) { cloud.exportStoredFile(r.raw, slot, w?.player.shipName); this.say("Save file downloaded."); } } },
        { id: "restore-save", label: "Restore recovery copy", sub: "Swap back to the voyage kept before the last replacement or clear.", disabled: !r.recovery, act: () => this.confirm(g, `Restore slot ${slot + 1}?`, "The current saved voyage becomes the recovery copy. This slot keeps its cloud code.", "Restore voyage", () => this.finishSlotOperation(g, restoreSlot(slot), "Recovery copy restored."), "slot") },
        { id: "export-recovery", label: "Export recovery copy", sub: "Download the original stored bytes for safekeeping.", disabled: !r.recovery, act: () => { const saved = readSavePreview(slot, true); if (saved.raw) cloud.exportStoredFile(saved.raw, slot, "recovery"); else this.say(saved.error ?? "No recovery copy is available."); } },
        { id: "clear-save", label: "Clear this slot", sub: "Keeps one recovery copy and this slot's cloud code.", disabled: !r.present, act: () => this.confirm(g, `Clear slot ${slot + 1}?`, "The saved voyage moves to this slot's recovery copy. You can restore it from this page.", "Clear slot", () => this.finishSlotOperation(g, clearSavedSlot(slot), "Slot cleared. Recovery copy available."), "slot") },
      ];
    }
    if (this.page === "copy") return Array.from({ length: SLOTS }, (_, slot) => slot).filter(slot => slot !== this.selectedSlot).map(slot => ({
      id: `copy-to-${slot}`, label: `Copy into slot ${slot + 1}`, sub: readSavePreview(slot).present ? "Replaces this destination after keeping a recovery copy." : "Empty destination.",
      act: () => {
        const source = readSavePreview(this.selectedSlot);
        if (!source.raw || !source.world) { this.say("The source save is no longer available."); return; }
        this.confirm(g, `Copy slot ${this.selectedSlot + 1} into slot ${slot + 1}?`, "Copies the stored voyage. The destination keeps its cloud code and a recovery copy of its previous save.", "Copy voyage", () => this.finishSlotOperation(g, replaceSlot(slot, source.raw!), `Copied into slot ${slot + 1}.`), "copy");
      },
    }));
    if (this.page === "home") return [
      ...(p.world ? [{ id: "continue", label: "Continue voyage", sub: `${p.ship} · ${p.location} · ${saveAge(p.savedAt, Date.now())}`, primary: true, act: () => this.continue(g) }] : []),
      ...(p.world && this.cloudUnavailable ? [{ id: "local-home", label: "Continue local save", sub: "Use this device's copy without checking the cloud.", act: () => this.loadLocal(g) }] : []),
      { id: "new", label: "New voyage", primary: !p.world, act: () => this.show(g, "new") },
      { id: "library", label: "Save library", act: () => this.show(g, "library") },
      { id: "settings", label: "Settings", act: () => this.open(g, "settings") },
      { id: "help", label: "Help & handbook", act: () => this.show(g, "help") },
    ];
    if (this.page === "new") return [
      { id: "sol20", label: "Sol neighbourhood", sub: "Real stars within 20 light-years. Recommended start.", primary: true, act: () => this.start(g, true, 20) },
      { id: "sol50", label: "Sol 50 light-years", sub: "A larger region for longer journeys.", act: () => this.start(g, true, 50) },
      { id: "uncharted", label: "Uncharted", sub: "A generated galaxy to explore.", act: () => this.start(g, false, 20) },
      { id: "difficulty", label: "Change difficulty in Settings", act: () => this.open(g, "settings") },
      { id: "choose-slot", label: "Choose a different slot", act: () => { this.slotReturn = "new"; this.show(g, "slots"); } },
    ];
    if (this.page === "library") return [
      { id: "slots", label: "Browse save slots", sub: `Three local games. Active slot: ${p.slot + 1}.`, primary: true, act: () => { this.slotReturn = "library"; this.show(g, "slots"); } },
      ...(p.world ? [{ id: "chronicle", label: "The Chronicle", sub: "The selected voyage's career so far.", act: () => { g.world = p.world!; this.open(g, "chronicle"); } }] : []),
      { id: "cloud", label: "Cloud saves", sub: code ? "This slot has a linked code." : "Move a voyage between devices using a save code.", act: () => this.show(g, "cloud") },
      { id: "export", label: "Export save file", sub: "Download this slot's saved voyage.", disabled: !p.world, act: () => { if (p.world) { cloud.exportFile(p.world); this.say("Save file downloaded."); } } },
      { id: "import", label: "Import save file", sub: "Choose a saved voyage from this device.", act: () => { void this.importFile(g); } },
      { id: "identity", label: "Callsign & squadron", act: () => this.show(g, "identity") },
    ];
    if (this.page === "help") return [
      { id: "controls", label: "Controls", sub: "Every key, grouped by where you are.", primary: true, act: () => this.open(g, "help") },
      { id: "handbook", label: "Handbook", sub: "Find a system, activity or explanation.", act: () => this.open(g, "almanac") },
      { id: "school", label: "Flight School", sub: "Six optional lessons follow a postal job, safe return and save. K skips school.", act: () => this.say("Start a new voyage for Flight School. Existing voyages stay in free exploration and keep their contracts.") },
    ];
    if (this.page === "identity") return [
      { id: "callsign", label: wire.getCallsign() ? `Callsign: ${wire.getCallsign()}` : "Choose a callsign", sub: "Your name on Fleet Wire and the leaderboards.", act: () => this.callsign(g) },
      { id: "squadron", label: wire.getSquadron() ? `Squadron: ${wire.getSquadron()}` : "Join a squadron", sub: "A shared two-to-five-character tag.", disabled: !wire.getCallsign(), act: () => this.squadron(g) },
    ];
    if (this.page === "cloud") return code ? [
      { id: "show-code", label: "Show this slot's save code", act: () => this.say(`Save code: ${code}`) },
      { id: "download", label: "Download cloud copy", sub: "Review before replacing the local voyage.", act: () => { void this.download(g, code, false); } },
      { id: "unlink", label: "Unlink this device", sub: "The cloud copy stays available with its code.", act: () => { const ok = cloud.setCode(null); this.render(g); this.say(ok ? "This slot is unlinked." : "The cloud link could not be changed. Please try again."); } },
    ] : [
      { id: "create-code", label: "Create a save code", sub: "Saving during a voyage will upload to this code.", act: () => { const code = cloud.newCode(); this.render(g); this.say(code ? `Save code: ${code}. Save during your voyage to upload.` : "The save code could not be stored. Please free browser storage and try again."); } },
      { id: "link-code", label: "Link with a code", act: () => this.ask(g, "Link a cloud save", "Save code", "", 12, value => {
        const code = value.trim().toUpperCase(); if (!cloud.validCode(code)) { this.say("Enter a valid FarSpace save code."); return; }
        void this.download(g, code, true);
      }, "cloud") },
    ];
    if (this.page === "loading") return [
      ...(p.world ? [{ id: "local", label: "Continue local save", sub: "Use the saved copy on this device.", primary: true, act: () => { this.request++; this.loadLocal(g); } }] : []),
      { id: "cancel-load", label: "Cancel", act: () => { this.request++; this.show(g, "home"); } },
    ];
    if (this.page === "confirm" && this.confirmation) return [
      { id: "accept", label: this.confirmation.accept, primary: true, act: this.confirmation.act },
      { id: "cancel", label: "Cancel", act: () => this.back(g) },
    ];
    return [];
  }

  private render(g: Game, restore = false): void {
    if (!this.root) return;
    this.menu.replaceChildren();
    const titles: Partial<Record<Page, string>> = { new: "New voyage", library: "Save library", slots: "Choose a saved voyage", slot: `Slot ${this.selectedSlot + 1}`, copy: "Copy destination", help: "Help & handbook", cloud: "Cloud saves", identity: "Callsign & squadron", loading: "Checking cloud save" };
    if (this.page !== "home") {
      this.menu.append(this.button({ id: "back", label: "← Back", act: () => this.back(g) }));
      const title = document.createElement("h2"); title.textContent = this.page === "form" ? this.form!.title : this.page === "confirm" ? this.confirmation!.title : titles[this.page] ?? "";
      this.menu.append(title);
    }
    const note = this.page === "new" ? `Slot ${activeSlot() + 1} · ${settings().hardcore ? "Hardcore: destruction erases the save" : "Standard difficulty"}`
      : this.page === "slot" ? this.slotDescription() : this.page === "confirm" ? this.confirmation!.detail : this.page === "library" ? this.preview.error ?? `${this.preview.world ? this.preview.ship + " · " + this.preview.location : "No valid save in this slot"}` : "";
    if (note) { const p = document.createElement("p"); p.className = "title-note"; p.textContent = note; this.menu.append(p); }
    if (this.page === "form" && this.form) {
      const config = this.form, form = document.createElement("form"), label = document.createElement("label"), input = document.createElement("input");
      label.textContent = config.label; input.value = config.value; input.maxLength = config.max; input.autocomplete = "off"; input.spellcheck = false;
      label.append(input); const submit = this.button({ id: "submit", label: "Save", primary: true, act: () => {} }); submit.type = "submit";
      form.append(label, submit); form.onsubmit = e => { e.preventDefault(); config.submit(input.value); }; this.menu.append(form);
      input.focus();
    } else {
      for (const a of this.actions(g)) this.menu.append(this.button(a));
    }
    this.status.textContent = this.message; this.footer(g); this.describeView();
    if (this.page !== "form") {
      const buttons = Array.from(this.root.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const focus = restore ? buttons.find(b => b.dataset.action === this.focusId) : null;
      (focus ?? buttons.find(b => b.classList.contains("primary")) ?? buttons[0])?.focus({ preventScroll: true });
    }
    this.root.scrollTop = restore ? this.scroll : 0;
  }

  private describeView(): void {
    this.caption.replaceChildren(); const name = document.createElement("strong"), sub = document.createElement("span");
    name.textContent = this.view === "orbit" ? "Above the quiet side" : this.view === "station" ? "The next departure" : "Before the next watch";
    sub.textContent = `${this.preview.ship} · ${this.view === "bridge" ? "bridge" : this.view === "station" ? "station" : "orbital"} illustration`;
    this.caption.append(name, sub);
  }
  private footer(g: Game): void {
    const nav = this.root?.querySelector(".title-footer nav"); if (!nav) return;
    nav.replaceChildren();
    for (const action of [
      { id: "news", label: settings().whatsNewSeen === VERSION ? "What's new" : "What's new *", act: () => this.open(g, "whatsnew") },
      { id: "music", label: music.isMuted() ? "Music off" : "Music on", act: () => { music.toggle(); this.footer(g); this.root?.querySelector<HTMLButtonElement>('[data-action="music"]')?.focus(); } },
      { id: "view", label: "Change view", act: () => { this.advanceView(); this.describeView(); } },
      { id: "fullscreen", label: "Fullscreen", act: () => toggleFullscreen(document.documentElement) },
    ]) nav.append(this.button(action));
  }

  private start(g: Game, real: boolean, maxLy: number): void {
    const slot = activeSlot(), launch = () => {
      if (slot !== activeSlot()) { this.show(g, "new"); this.say("The active slot changed. Please choose again."); return; }
      const backup = preserveSlot(slot); if (!backup.ok) { this.say(backup.error); return; }
      g.newGame(real, maxLy); g.setScene("flight");
    };
    if (readSavePreview(slot).present) this.confirm(g, `Start over in slot ${slot + 1}?`, "Keep a recovery copy of this slot, then start a new voyage. The next save replaces the slot's voyage and updates its linked cloud copy.", "Start new voyage", launch, "new");
    else launch();
  }
  private loadLocal(g: Game): void {
    const preview = titlePreview();
    if (!preview.world) { this.preview = preview; this.show(g, "home"); this.say(preview.error ?? "No local save is available."); return; }
    g.world = preview.world; g.spriteCache.clear(); g.setScene(g.world.player.dockedAt ? "station" : "flight");
  }
  private continue(g: Game): void {
    const code = cloud.getCode(); if (!code) { this.loadLocal(g); return; }
    void this.download(g, code, false, true);
  }
  private async download(g: Game, code: string, link: boolean, continuing = false): Promise<void> {
    const ticket = ++this.request, slot = activeSlot(); this.show(g, "loading");
    const remote = await cloud.pull(code);
    if (ticket !== this.request || g.scene !== this || slot !== activeSlot()) return;
    this.preview = titlePreview();
    if (!remote) { this.cloudUnavailable = true; this.show(g, continuing ? "home" : "cloud"); this.say("Cloud save unavailable. A valid local save can still be continued."); return; }
    this.cloudUnavailable = false;
    if (continuing && remote.updatedAt <= (this.preview.savedAt ?? 0) + 1000) { this.loadLocal(g); return; }
    const localRaw = readSavePreview(slot).raw;
    this.confirm(g, link ? "Use this cloud voyage?" : "Use the cloud copy?", `Local: ${this.preview.savedAt ? new Date(this.preview.savedAt).toLocaleString() : "no recorded save time"}. Cloud: ${new Date(remote.updatedAt).toLocaleString()}. Load the cloud voyage into slot ${slot + 1}, keeping the previous local save as its recovery copy.`, "Load cloud voyage", () => {
      if (slot !== activeSlot()) { this.show(g, "home"); this.say("The active slot changed. Please choose again."); return; }
      if (readSavePreview(slot).raw !== localRaw) { this.preview = titlePreview(); this.show(g, "home"); this.say("The local save changed while this choice was open. Please review it again."); return; }
      const previous = cloud.getCode();
      if (link && !cloud.setCode(code)) { this.say("The cloud link could not be stored. The local voyage was kept."); return; }
      if (!g.adoptWorld(remote.world)) { if (link) cloud.setCode(previous); this.say(g.toastMsg || "The save could not be stored. The local voyage was kept."); }
    }, continuing ? "home" : "cloud");
  }
  private async importFile(g: Game): Promise<void> {
    const ticket = ++this.request, slot = activeSlot();
    const world: World | null = await cloud.importFile();
    if (ticket !== this.request || g.scene !== this || slot !== activeSlot()) return;
    if (!world) { this.say("No file was selected, or the save is damaged or from a newer game version. The local save was kept."); return; }
    const localRaw = readSavePreview(slot).raw;
    this.confirm(g, "Use the imported voyage?", `Load this file into slot ${slot + 1}, keeping the previous voyage as its recovery copy. This slot keeps its cloud code.`, "Load imported voyage", () => {
      if (slot !== activeSlot()) { this.show(g, "home"); this.say("The active slot changed. Please choose again."); return; }
      if (readSavePreview(slot).raw !== localRaw) { this.preview = titlePreview(); this.show(g, "home"); this.say("The local save changed while this choice was open. Please review it again."); return; }
      if (!g.adoptWorld(world)) this.say(g.toastMsg || "The save could not be stored. The local voyage was kept.");
    }, "library");
  }
  private slotDescription(): string {
    const r = readSavePreview(this.selectedSlot), w = r.world;
    if (!w) return r.error ?? "No saved voyage in this slot. Choose it to start a new voyage.";
    const p = w.player;
    return `${p.shipName || hull(p.hullId).name} · ${w.systems[p.systemId].name}. ${p.captainName ? `Captain ${p.captainName}. ` : ""}${p.credits}cr · ${p.crew.length} crew · ${Math.floor(w.time / 3600)}h ${Math.floor(w.time % 3600 / 60)}m under way. ${p.lineage?.length ? `Captain ${p.lineage.length + 1} of the line. ` : ""}${p.cat ? `${p.cat.name} aboard. ` : ""}${w.hardcore ? "Hardcore" : "Standard"}. Saved ${w.savedAt ? new Date(w.savedAt).toLocaleString() : "at an unknown time"}.`;
  }
  private finishSlotOperation(g: Game, result: SaveOperation, success: string): void {
    this.preview = titlePreview(); this.show(g, "slot"); this.say(result.ok ? success : result.error);
  }
  private callsign(g: Game): void {
    this.ask(g, "Choose a callsign", "Callsign: 2-16 letters, digits, spaces, - or _", wire.getCallsign() ?? "", 16, value => {
      const name = value.trim().toUpperCase(); if (!wire.validCallsign(name)) { this.say("Use 2-16 letters, digits, spaces, - or _."); return; }
      wire.setCallsign(name); this.show(g, "identity"); this.say("Callsign saved.");
    }, "identity");
  }
  private squadron(g: Game): void {
    this.ask(g, "Squadron", "Tag: 2-5 letters or digits; leave empty to leave", wire.getSquadron() ?? "", 5, value => {
      const tag = value.trim().toUpperCase(); if (tag && !wire.validSquadron(tag)) { this.say("Use 2-5 letters or digits."); return; }
      wire.setSquadron(tag || null); this.show(g, "identity"); this.say(tag ? "Squadron tag saved." : "Squadron left.");
    }, "identity");
  }

  update(g: Game, dt: number): void {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (!reduced) this.t += dt;
    music.setMood("title", 0);
    // Physical keyboard uses native focus; gamepad input arrives through Input.
    if (g.input.wasPressed("ArrowDown")) this.moveFocus(1);
    if (g.input.wasPressed("ArrowUp")) this.moveFocus(-1);
    if (g.input.wasPressed("Enter")) (document.activeElement as HTMLButtonElement)?.click?.();
    if (g.input.wasPressed("Escape")) this.back(g);
  }
  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    const p = this.preview.world?.player;
    this.backdrop?.draw(ctx, this.view, this.t, p?.hullId ?? "scout", this.preview.world?.seed ?? 0xfa25face, p?.paint);
    const art = this.art?.getContext("2d"); if (art) { art.imageSmoothingEnabled = false; art.drawImage(g.buffer, 0, 0); }
  }
}
