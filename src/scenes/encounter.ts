// Encounter card: pauses the world, shows a situation and two or three choices,
// then the outcome. Returns to whatever scene raised it.

import { Game, Scene, VW, VH } from "../game";
import { drawText } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { sfx } from "../core/sfx";
import { RNG } from "../core/rng";
import type { Encounter, EncounterOption } from "../data/encounters";
import { logEntry } from "../world";
import { ListView } from "../core/listview";
import { clippedText, contains, mapButton } from "../core/mapview";
import { wrapText } from "../core/text";
import { ReaderOverlay } from "./reader";

const TEXT = { x: 36, y: 39, w: 408, h: 64 };
const ROWS = { x: 36, y: 137, w: 408, h: 72 }, ROW = 18;
const TEXT_UP = { x: 36, y: 112, w: 76, h: 17 }, TEXT_DOWN = { x: 368, y: 112, w: 76, h: 17 };
const PREV = { x: 36, y: 213, w: 76, h: 17 }, NEXT = { x: 368, y: 213, w: 76, h: 17 };
const READ = { x: 36, y: 235, w: 112, h: 17 }, INFO = { x: 156, y: 235, w: 136, h: 17 };
const RUN = { x: 300, y: 235, w: 144, h: 17 };

export function wrap(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      if ((line + " " + word).trim().length > maxChars) { out.push(line.trim()); line = word; }
      else line = (line + " " + word).trim();
    }
    if (line) out.push(line);
  }
  return out;
}

export class EncounterScene implements Scene {
  touchMode = "menu" as const;
  enc!: Encounter;
  returnTo = "flight";
  view = new ListView<EncounterOption>(4);
  get cursor(): number { return this.view.index; }
  set cursor(index: number) { this.view.select(index); }
  outcome: string | null = null;
  info?: ReaderOverlay;
  textScroll = 0;
  story = false;
  private drawn: EncounterOption[] = [];
  private openedWorld?: Game["world"];
  private serial = 0;
  private resolved = false;
  private returned = false;

  open(g: Game, enc: Encounter, returnTo: string, story = false): void {
    this.onSceneLeave();
    this.enc = enc; this.returnTo = returnTo; this.outcome = null; this.story = story;
    this.view = new ListView<EncounterOption>(4); this.view.sync(this.options(g));
    this.drawn = []; this.textScroll = 0; this.resolved = false; this.returned = false;
    this.openedWorld = g.world; this.serial++;
    const p = g.world.player;
    if (!story) { p.encounters ??= {}; p.encounters[enc.id] = (p.encounters[enc.id] ?? 0) + 1; }
    g.setScene("encounter");
    sfx.alarm();
  }

  onSceneLeave(): void { this.info?.onSceneLeave(); this.info = undefined; }
  options(g: Game) { return this.enc.options.filter(o => !o.requires || o.requires(g)); }
  textLines(): string[] { return wrapText(this.outcome ?? this.enc.text, 102); }
  textRows(): number { return this.outcome === null ? 8 : 20; }
  textEnd(): number { return Math.max(0, this.textLines().length - this.textRows()); }

  back(g: Game): void {
    if (this.returned || g.scene !== this || g.world !== this.openedWorld) return;
    this.returned = true;
    // Surface.enter reads outcome to apply rover damage once.
    if (this.returnTo === "flight") (g.scenes.flight as unknown as { resumeNext: boolean }).resumeNext = true;
    g.setScene(this.returnTo);
  }

  read(selected?: EncounterOption): void {
    const sections: [string, string[]][] = selected
      ? [[selected.label, [selected.hint ?? "No additional terms."]]]
      : [[this.enc.title, [this.enc.text]], ...(this.outcome === null ? [] : [["OUTCOME", [this.outcome]] as [string, string[]]])];
    this.info = new ReaderOverlay(selected ? "CHOICE DETAILS" : "CONVERSATION", sections, () => { this.info = undefined; });
  }

  choose(g: Game): void {
    const option = this.view.selected;
    if (this.resolved || !option || !this.options(g).includes(option)) return;
    const enc = this.enc, world = g.world, serial = this.serial, story = this.story;
    this.resolved = true;
    const rng = new RNG((world.seed ^ Math.floor(world.time * 7) ^ enc.id.length) >>> 0);
    const out = option.result(g, rng);
    sfx.select();
    if (g.world === world) {
      if (!story) logEntry(world, `${enc.title}: ${option.label}`);
      else if (enc.title.startsWith("THE SIGNAL")) logEntry(world, enc.title);
    }
    // A callback can open another conversation or move to another scene/world.
    if (this.serial !== serial || g.scene !== this || g.world !== world) return;
    if (!out) { this.back(g); return; }
    this.outcome = out; this.textScroll = 0;
  }

  update(g: Game, dt: number): void {
    void dt;
    if (g.scene !== this || g.world !== this.openedWorld || this.returned) return;
    if (this.info) { this.info.update(g); return; }
    const inp = g.input;
    const click = (rect: typeof RUN) => inp.mousePressed && contains(rect, inp.mouseX, inp.mouseY);
    const outcome = this.outcome !== null;
    const textRect = { ...TEXT, h: this.textRows() * 8 };
    const textUp = outcome ? PREV : TEXT_UP, textDown = outcome ? NEXT : TEXT_DOWN;
    let delta = (this.textRows() - 1) * (Number(inp.wasPressed("ArrowRight") || click(textDown)) - Number(inp.wasPressed("ArrowLeft") || click(textUp)));
    if (inp.wheel && (outcome || contains(textRect, inp.mouseX, inp.mouseY))) delta += Math.sign(inp.wheel) * 3;
    if (outcome) {
      delta += 3 * (Number(inp.wasPressed("ArrowDown")) - Number(inp.wasPressed("ArrowUp")))
        + (this.textRows() - 1) * (Number(inp.wasPressed("PageDown")) - Number(inp.wasPressed("PageUp")));
      if (inp.wasPressed("Home")) this.textScroll = 0;
      if (inp.wasPressed("End")) this.textScroll = this.textEnd();
    }
    this.textScroll = Math.max(0, Math.min(this.textEnd(), this.textScroll + delta));
    if (inp.wasPressed("o") || click(READ)) { this.read(); return; }
    if (outcome) {
      if (inp.wasPressed("Enter") || inp.wasPressed("Escape") || inp.wasPressed(" ") || click(RUN)) this.back(g);
      return;
    }
    const previous = this.view.selected, opts = this.options(g);
    this.view.sync(opts);
    const removed = previous !== undefined && !opts.includes(previous);
    if (inp.wasPressed("ArrowUp")) this.view.move(-1);
    if (inp.wasPressed("ArrowDown")) this.view.move(1);
    if (inp.wheel && !contains(textRect, inp.mouseX, inp.mouseY)) this.view.move(Math.sign(inp.wheel) * 3);
    if (inp.wasPressed("PageUp") || click(PREV)) this.view.page(-1);
    if (inp.wasPressed("PageDown") || click(NEXT)) this.view.page(1);
    if (inp.wasPressed("Home")) this.view.select(0);
    if (inp.wasPressed("End")) this.view.select(opts.length - 1);
    if (inp.mousePressed && contains(ROWS, inp.mouseX, inp.mouseY)) {
      const option = this.drawn[Math.floor((inp.mouseY - ROWS.y) / ROW)];
      const index = opts.indexOf(option);
      if (index >= 0) this.view.select(index);
      return;
    }
    if (removed) return;
    if (!opts.length) {
      if (inp.wasPressed("Enter") || inp.wasPressed("Escape") || click(RUN)) this.back(g);
      return;
    }
    if (inp.wasPressed("i") || click(INFO)) { this.read(this.view.selected); return; }
    if (inp.wasPressed("Enter") || inp.wasPressed(" ") || click(RUN)) this.choose(g);
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    if (this.info) { this.info.draw(g, ctx); return; }
    const under = g.scenes[this.returnTo];
    if (under && under !== this) under.draw(g, ctx);
    ctx.fillStyle = "rgba(5,6,10,0.72)"; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = "#0c1220"; ctx.fillRect(24, 12, 432, 246);
    ctx.strokeStyle = PAL.uiBorder; ctx.strokeRect(24.5, 12.5, 431, 245);
    drawText(ctx, clippedText(this.enc.title, 408), 36, 21, this.story ? PAL.info : PAL.gold);
    const outcome = this.outcome !== null, lines = this.textLines(), count = this.textRows();
    lines.slice(this.textScroll, this.textScroll + count).forEach((line, i) => drawText(ctx, line, TEXT.x, TEXT.y + i * 8, outcome ? PAL.white : PAL.grey));
    const textUp = outcome ? PREV : TEXT_UP, textDown = outcome ? NEXT : TEXT_DOWN;
    mapButton(ctx, textUp, "< TEXT", this.textScroll > 0);
    mapButton(ctx, textDown, "TEXT >", this.textScroll < this.textEnd());
    drawText(ctx, `${this.textScroll + 1}-${Math.min(lines.length, this.textScroll + count)} OF ${lines.length} LINES`, 176, textUp.y + 6, PAL.grey);
    this.drawn = [];
    if (!outcome) {
      this.drawn = this.view.keys.slice(this.view.offset, this.view.end);
      this.drawn.forEach((option, index) => {
        const y = ROWS.y + index * ROW, selected = option === this.view.selected;
        if (selected) { ctx.fillStyle = "#203446"; ctx.fillRect(ROWS.x, y, ROWS.w, ROW - 1); }
        drawText(ctx, clippedText(`${selected ? ">" : " "} ${option.label}`, 400), 40, y + 2, selected ? PAL.white : PAL.ui);
        if (option.hint) drawText(ctx, clippedText(option.hint.toUpperCase(), 392), 48, y + 10, PAL.grey);
      });
      if (!this.view.keys.length) drawText(ctx, "NO ANSWERS AVAILABLE. CONTINUE TO RETURN.", 40, ROWS.y + 9, PAL.grey);
      mapButton(ctx, PREV, "PAGE UP"); mapButton(ctx, NEXT, "PAGE DOWN");
      drawText(ctx, `${this.view.keys.length ? this.view.offset + 1 : 0}-${this.view.end} OF ${this.view.keys.length} CHOICES`, 176, 219, PAL.grey);
      mapButton(ctx, INFO, "I CHOICE DETAILS", !!this.view.selected);
    }
    mapButton(ctx, READ, "O READ ALL");
    mapButton(ctx, RUN, outcome || !this.view.keys.length ? "ENTER CONTINUE" : "ENTER CHOOSE");
    drawText(ctx, outcome ? "WHEEL/ARROWS SCROLL  HOME/END TOP/BOTTOM  ESC CONTINUE" : "UP/DOWN SELECT  PAGE UP/DOWN CHOICES  LEFT/RIGHT TEXT", 36, 262, PAL.greyDark);
  }
}
