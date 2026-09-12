import type { Game, Scene } from "../game";
import type { FlightScene } from "./flight/index";
import { journeyBriefing, journeyRecordSections, objectiveDetails, pinObjective, reconcileObjective } from "../core/journey";
import { questLocations } from "../core/questlocations";
import { ListView } from "../core/listview";
import { clippedText, contains, mapButton, type Rect } from "../core/mapview";
import { openSearchBox } from "../core/searchbox";
import { drawText } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { wrapText } from "../core/text";
import { ReaderOverlay } from "./reader";

const ROWS = { x: 12, y: 107, width: 270, rowHeight: 17 };
const PIN: Rect = { x: 12, y: 244, w: 82, h: 16 };
const CLEAR: Rect = { x: 100, y: 244, w: 68, h: 16 };
const READ: Rect = { x: 174, y: 244, w: 82, h: 16 };
const FIND: Rect = { x: 262, y: 244, w: 78, h: 16 };
const CONTINUE: Rect = { x: 346, y: 244, w: 122, h: 16 };

export class JourneyScene implements Scene {
  readonly touchMode = "menu" as const;
  readonly pausesVoyage = true;
  get capturesKeys(): boolean { return !!this.closeSearchBox || !!this.info?.closeSearchBox; }
  returnTo = "flight";
  existingVisit = false;
  view = new ListView<string>(7);
  drawn: string[] = [];
  query = "";
  info?: ReaderOverlay;
  closeSearchBox?: () => void;

  enter(g: Game): void {
    this.onSceneLeave(); this.query = ""; this.view = new ListView<string>(7); this.drawn = [];
    this.sync(g);
    const index = this.view.keys.indexOf(g.world.player.objectiveFocusId ?? "");
    if (index >= 0) this.view.select(index);
    g.input.flush?.(); g.input.down?.clear();
  }
  onSceneLeave(): void {
    this.closeSearchBox?.(); this.closeSearchBox = undefined;
    this.info?.onSceneLeave(); this.info = undefined;
  }
  sync(g: Game): void {
    const query = this.query.toLowerCase();
    this.view.sync(questLocations(g.world).filter(q => [q.title, q.source, q.action, g.world.systems[q.systemId]?.name ?? ""].some(s => s.toLowerCase().includes(query))).map(q => q.id));
  }
  continue(g: Game): void {
    reconcileObjective(g.world);
    if (this.returnTo === "flight") (g.scenes.flight as FlightScene).resumeNext = this.existingVisit;
    g.input.flush?.(); g.input.down?.clear();
    g.setScene(this.returnTo);
  }
  update(g: Game): void {
    if (this.info) { this.info.update(g); return; }
    if (this.closeSearchBox) return;
    const inp = g.input, selected = this.view.selected;
    this.sync(g);
    const removed = selected !== undefined && !this.view.keys.includes(selected);
    const click = (rect: Rect) => inp.mousePressed && contains(rect, inp.mouseX, inp.mouseY);
    if (inp.wasPressed("Escape") || inp.wasPressed("F4") || click(CONTINUE)) { this.continue(g); return; }
    if (inp.wasPressed("/") || click(FIND)) {
      this.closeSearchBox = openSearchBox("Find objective", this.query, query => {
        this.closeSearchBox = undefined; g.input.flush(); g.input.down.clear();
        if (query !== null) { this.query = query; this.sync(g); }
      }); return;
    }
    if (inp.wasPressed("Delete")) { this.query = ""; this.sync(g); return; }
    if (inp.wasPressed("l") || click(READ)) {
      this.info = new ReaderOverlay("VOYAGE RECORDS", journeyRecordSections(g.world), () => { this.info = undefined; }); return;
    }
    if (inp.wasPressed("c") || click(CLEAR)) { pinObjective(g.world); g.autosave(); return; }
    if (inp.wasPressed("Enter") || click(PIN)) {
      if (removed || !selected || !pinObjective(g.world, selected)) { g.toast("THAT OBJECTIVE IS NO LONGER AVAILABLE. CHOOSE CURRENT WORK."); return; }
      g.autosave(); return;
    }
    if (inp.wasPressed("Home")) this.view.select(0);
    if (inp.wasPressed("End")) this.view.select(this.view.keys.length - 1);
    if (inp.wasPressed("PageDown")) this.view.page(1);
    if (inp.wasPressed("PageUp")) this.view.page(-1);
    this.view.move(Number(inp.wasPressed("ArrowDown")) - Number(inp.wasPressed("ArrowUp")) + Math.sign(inp.wheel || 0));
    if (inp.mousePressed) {
      const row = Math.floor((inp.mouseY - ROWS.y) / ROWS.rowHeight);
      if (inp.mouseX >= ROWS.x && inp.mouseX < ROWS.x + ROWS.width && row >= 0 && row < this.view.pageSize) {
        const id = this.drawn[row], index = id === undefined ? -1 : this.view.keys.indexOf(id);
        if (index >= 0) this.view.select(index);
        else g.toast("THAT OBJECTIVE IS NO LONGER AVAILABLE.");
      }
    }
  }
  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    if (this.info) { this.info.draw(g, ctx); return; }
    this.sync(g);
    const b = journeyBriefing(g.world), quests = questLocations(g.world);
    const text = (s: string, x: number, y: number, width = 456, color: string = PAL.grey) => drawText(ctx, clippedText(s.toUpperCase(), width), x, y, color);
    ctx.fillStyle = PAL.uiPanel; ctx.fillRect(0, 0, 480, 270);
    text(`YOUR VOYAGE / ${b.ship}`, 12, 9, 456, PAL.white);
    text(b.location, 12, 23, 456, PAL.ui);
    text(b.aboard, 12, 35); text(b.condition, 12, 47);
    text(b.completed, 12, 61); text(b.next, 12, 75, 456, PAL.gold);
    text(this.query ? `FIND: ${this.query} / DELETE CLEAR` : "CHOOSE CURRENT WORK / ENTER PINS / ESC CONTINUES", 12, 93, 456, PAL.ui);
    this.drawn = this.view.keys.slice(this.view.offset, this.view.end);
    for (const [row, id] of this.drawn.entries()) {
      const q = quests.find(q => q.id === id)!;
      const y = ROWS.y + row * ROWS.rowHeight;
      if (id === this.view.selected) { ctx.fillStyle = "#20374b"; ctx.fillRect(ROWS.x, y, ROWS.width, ROWS.rowHeight); }
      text(`${q.focused ? "* " : ""}${q.title}`, 16, y + 2, 260, q.focused ? PAL.gold : PAL.white);
      text(`${q.source} / ${g.world.systems[q.systemId].name}`, 16, y + 10, 260);
    }
    if (!this.view.keys.length) text("NO MATCHING OBJECTIVES", 16, 112, 260);
    const selected = quests.find(q => q.id === this.view.selected);
    ctx.save(); ctx.beginPath(); ctx.rect(292, 107, 176, 119); ctx.clip();
    if (selected) {
      const lines = [selected.title, ...objectiveDetails(g.world, selected)].flatMap(line => wrapText(line.toUpperCase(), 42));
      lines.slice(0, 13).forEach((line, i) => text(line, 294, 109 + i * 8, 172, i === 0 ? PAL.gold : PAL.grey));
    } else text("L OPENS THE FULL RECORDS", 294, 109, 172);
    ctx.restore();
    text(`${this.view.keys.length ? this.view.index + 1 : 0}/${this.view.keys.length} / WHEEL, ARROWS, PAGE UP/DOWN`, 12, 230, 280);
    text("L: COMPLETE TERMS AND LOG", 294, 230, 174, PAL.ui);
    mapButton(ctx, PIN, "ENTER PIN", !!selected?.focused); mapButton(ctx, CLEAR, "C CLEAR"); mapButton(ctx, READ, "L RECORDS"); mapButton(ctx, FIND, "/ FIND"); mapButton(ctx, CONTINUE, "ESC CONTINUE");
  }
}

export function openJourney(g: Game, returning = false): void {
  const scene = g.scenes.journey as JourneyScene | undefined;
  const returnTo = returning ? g.world.player.dockedAt ? "station" : "flight" : g.sceneName;
  if (!scene) { if (returning) g.setScene(returnTo); return; }
  if (returning) g.justUndocked = false;
  scene.returnTo = returnTo; scene.existingVisit = !returning;
  g.setScene("journey");
}
