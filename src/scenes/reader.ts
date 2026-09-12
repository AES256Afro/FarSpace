import type { Game, Scene } from "../game";
import { VW, VH } from "../game";
import { openSearchBox } from "../core/searchbox";
import { clamp } from "../core/mathx";
import { drawText } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { wrapText } from "../core/text";

type Section = [string, string[]];
const TOP = 34, HEIGHT = 192;

// Keep complete matching sections so a search result includes its context.
export class ReaderScene implements Scene {
  touchMode = "menu" as const;
  scroll = 0;
  query = "";
  blocks: { title: string; headings: string[]; lines: string[]; top: number; height: number }[] = [];
  total = 0;
  closeSearchBox?: () => void;

  constructor(readonly title: string, readonly sections: Section[]) {}

  enter(_g?: Game): void { this.closeSearchBox?.(); this.search(""); }

  onSceneLeave(): void { this.closeSearchBox?.(); this.closeSearchBox = undefined; }

  search(query: string): void {
    this.query = query.trim().slice(0, 48).toUpperCase();
    this.scroll = 0; this.total = 0;
    this.blocks = this.sections.filter(([title, lines]) =>
      !this.query || [title, ...lines].some(line => line.toUpperCase().includes(this.query)))
      .map(([title, source]) => {
        const headings = wrapText(title, 111), lines = source.flatMap(line => wrapText(line, 111));
        const block = { title, headings, lines, top: this.total, height: 7 + (headings.length + lines.length) * 8 };
        this.total += block.height;
        return block;
      });
  }

  maxScroll(): number { return Math.max(0, this.total - HEIGHT); }

  section(direction: number): void {
    const candidates = this.blocks.filter(b => direction > 0 ? b.top > this.scroll + 1 : b.top < this.scroll - 1);
    const target = direction > 0 ? candidates[0] : candidates.at(-1);
    this.scroll = clamp(target?.top ?? (direction > 0 ? this.maxScroll() : 0), 0, this.maxScroll());
  }

  protected leave(g: Game): void {
    const returnTo = g.settingsReturn; g.settingsReturn = "title";
    if (returnTo === "flight" && g.scenes?.flight) (g.scenes.flight as unknown as { resumeNext: boolean }).resumeNext = true;
    g.setScene(returnTo);
  }

  update(g: Game): void {
    if (this.closeSearchBox) return;
    const inp = g.input;
    const click = (x0: number, x1: number) => inp.mousePressed && inp.mouseY >= 245 && inp.mouseY < 264 && inp.mouseX >= x0 && inp.mouseX < x1;
    const back = inp.mousePressed && inp.mouseY >= 3 && inp.mouseY < 17 && inp.mouseX >= 414 && inp.mouseX < VW;
    if (inp.wasPressed("Escape") || inp.wasPressed("Enter") || back) {
      this.leave(g); return;
    }
    if (inp.wasPressed("/") || inp.wasPressed("s") || click(308, 376)) {
      this.closeSearchBox = openSearchBox(this.title, this.query, query => {
        this.closeSearchBox = undefined;
        g.input.flush(); g.input.down.clear();
        if (query !== null) this.search(query);
      });
      return;
    }
    if (inp.wasPressed("Delete") || click(380, 468)) { this.search(""); return; }
    if (inp.wasPressed("Home")) this.scroll = 0;
    if (inp.wasPressed("End")) this.scroll = this.maxScroll();
    if (inp.wasPressed("ArrowLeft") || click(12, 84)) this.section(-1);
    if (inp.wasPressed("ArrowRight") || click(232, 304)) this.section(1);
    const delta = 24 * (Number(inp.wasPressed("ArrowDown")) - Number(inp.wasPressed("ArrowUp")) + Math.sign(inp.wheel))
      + (HEIGHT - 16) * (Number(inp.wasPressed("PageDown") || click(160, 228)) - Number(inp.wasPressed("PageUp") || click(88, 156)));
    this.scroll = clamp(this.scroll + delta, 0, this.maxScroll());
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    void g;
    ctx.fillStyle = PAL.uiPanel; ctx.fillRect(0, 0, VW, VH);
    drawText(ctx, `${this.title} - ${this.blocks.length}/${this.sections.length} SECTIONS`, 12, 8, PAL.white);
    drawText(ctx, "[ ESC BACK ]", 420, 8, PAL.ui);
    drawText(ctx, this.query ? `FIND: ${this.query}` : "UP/DOWN OR WHEEL: SCROLL   LEFT/RIGHT: SECTION   / OR S: FIND", 12, 21, PAL.grey);
    ctx.save(); ctx.beginPath(); ctx.rect(12, TOP, VW - 30, HEIGHT); ctx.clip();
    if (!this.blocks.length) drawText(ctx, "NO MATCHING SECTIONS. TRY ANOTHER TERM OR CLEAR THE SEARCH.", 12, TOP + 12, PAL.grey);
    for (const block of this.blocks) {
      const y = TOP + block.top - this.scroll;
      if (y > TOP + HEIGHT) break;
      if (y + block.height < TOP) continue;
      block.headings.forEach((line, i) => drawText(ctx, line, 12, y + i * 8, PAL.ui));
      block.lines.forEach((line, i) => drawText(ctx, line, 12, y + 1 + (block.headings.length + i) * 8,
        this.query && line.toUpperCase().includes(this.query) ? PAL.white : PAL.grey));
    }
    ctx.restore();
    if (this.maxScroll()) {
      const thumb = Math.max(8, HEIGHT * HEIGHT / this.total);
      ctx.fillStyle = PAL.uiBorder; ctx.fillRect(470, TOP, 2, HEIGHT);
      ctx.fillStyle = PAL.ui; ctx.fillRect(470, TOP + this.scroll / this.maxScroll() * (HEIGHT - thumb), 2, thumb);
    }
    drawText(ctx, `PAGE UP/DOWN: PAGE   HOME/END: TOP/BOTTOM   ${this.scroll === this.maxScroll() ? "END OF RESULTS" : "MORE BELOW"}`, 12, 234, PAL.greyDark);
    const buttons: [number, string, boolean][] = [
      [12, "[ PREV ]", this.scroll > 0], [88, "[ UP ]", this.scroll > 0],
      [160, "[ DOWN ]", this.scroll < this.maxScroll()], [232, "[ NEXT ]", this.scroll < this.maxScroll()],
      [308, "[ FIND ]", true], [380, "[ CLEAR ]", !!this.query],
    ];
    for (const [x, label, enabled] of buttons) drawText(ctx, label, x, 252, enabled ? PAL.ui : PAL.greyDark);
  }
}

// Read within a parent view without entering it again or changing its caller.
export class ReaderOverlay extends ReaderScene {
  constructor(title: string, sections: Section[], private readonly close: () => void) {
    super(title, sections); this.enter();
  }
  protected leave(g: Game): void {
    this.onSceneLeave(); g.input.flush?.(); g.input.down?.clear(); this.close();
  }
}
