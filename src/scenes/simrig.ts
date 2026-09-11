import type { Game, Scene } from "../game";
import { VW, VH } from "../game";
import { beginShipSim, chooseShipSim, continueShipSim, runClassicSim, shipSimAct, shipSimKnown, shipSimReason } from "../core/shipsim";
import { clamp } from "../core/mathx";
import { sfx } from "../core/sfx";
import { RNG } from "../core/rng";
import { SIM_PROGRAMS } from "../world";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { wrap } from "./encounter";
import type { InteriorScene } from "./interior";
import type { World } from "../world";

const TOP = 58, ROW = 24, VISIBLE = 6;
export class SimRigScene implements Scene {
  touchMode = "menu" as const;
  cursor = 0;
  scroll = 0;
  result = "";
  message = "";
  time = 0;
  returnPosition?: { world: World; x: number; y: number };

  open(g: Game): void {
    const interior = g.scenes.interior as InteriorScene;
    this.returnPosition = { world: g.world, x: interior.px, y: interior.py };
    g.setScene("simrig");
  }
  enter(g: Game): void {
    this.cursor = 0; this.scroll = 0; this.result = ""; this.message = ""; this.time = 0;
    if (!g.world.player.furnishings?.includes("simrig")) this.leave(g);
  }
  leave(g: Game): void {
    g.setScene("interior");
    if (this.returnPosition?.world === g.world) {
      const interior = g.scenes.interior as InteriorScene;
      interior.px = this.returnPosition.x; interior.py = this.returnPosition.y;
    }
  }
  menu(g: Game): { label: string; detail: string; run: () => void }[] {
    const p = g.world.player;
    return [
      { label: "A REASONABLE RECONSTRUCTION", detail: shipSimKnown(g.world) ? "A THREE-ACT PROGRAM THE SHIP WROTE ABOUT YOU" : "ASK THE SHIP ITS NAME AT THE WALL OF RECORD", run: () => {
        this.message = beginShipSim(g.world) ?? ""; this.cursor = 0; this.scroll = 0; g.autosave();
      } },
      ...SIM_PROGRAMS.map(program => ({ label: program.name, detail: program.blurb.toUpperCase(), run: () => {
        const result = runClassicSim(g.world, program.id, new RNG(g.world.seed ^ Math.floor(g.world.time * 7)));
        if (result) { this.result = result; sfx.select(); g.autosave(); }
        else this.message = "THE RIG HAS ALREADY RUN THIS LEG, OR HAS A PROGRAM WAITING TO FINISH.";
      } })),
      { label: "STUDY INSTEAD", detail: "CLOSE THE RIG; E AT THE STUDY TRAINS A SKILL", run: () => { p.simUsed = true; g.autosave(); this.leave(g); } },
      { label: "BACK TO THE SHIP", detail: "LEAVE THE RIG READY FOR LATER", run: () => this.leave(g) },
    ];
  }
  update(g: Game, dt: number): void {
    this.time += dt; const inp = g.input, p = g.world.player;
    if (inp.wasPressed("Escape")) { this.leave(g); return; }
    if (inp.wasPressed("F5")) g.save();
    if (inp.wasPressed("F9")) { g.load(); return; }
    if (!p.furnishings?.includes("simrig")) { this.leave(g); return; }
    const run = p.shipSim?.active;
    if (run) {
      const act = shipSimAct(run), replying = run.reply !== undefined;
      const count = replying ? 1 : act.choices.length;
      this.cursor = clamp(this.cursor, 0, count - 1);
      if (inp.wasPressed("ArrowDown") || inp.wheel > 0) this.cursor = (this.cursor + 1) % count;
      if (inp.wasPressed("ArrowUp") || inp.wheel < 0) this.cursor = (this.cursor + count - 1) % count;
      const row = Math.floor((inp.mouseY - 178) / 22);
      const click = inp.mousePressed && inp.mouseX >= 20 && inp.mouseX < VW - 20 && row >= 0 && row < count;
      if (click) this.cursor = row;
      if (click || inp.wasPressed("Enter") || inp.wasPressed(" ")) {
        if (replying) {
          const done = run.done;
          if (continueShipSim(g.world, run) && done) { g.autosave(); this.leave(g); return; }
        } else chooseShipSim(g.world, run, run.stage, this.cursor);
        this.cursor = 0; sfx.select(); g.autosave();
      }
      return;
    }
    if (this.result) {
      if (inp.wasPressed("Enter") || inp.wasPressed(" ") || (inp.mousePressed && inp.mouseY >= 237)) this.leave(g);
      return;
    }
    const rows = this.menu(g);
    if (inp.wasPressed("ArrowDown") || inp.wheel > 0) this.cursor = (this.cursor + 1) % rows.length;
    if (inp.wasPressed("ArrowUp") || inp.wheel < 0) this.cursor = (this.cursor + rows.length - 1) % rows.length;
    this.cursor = clamp(this.cursor, 0, rows.length - 1);
    if (this.cursor < this.scroll) this.scroll = this.cursor;
    if (this.cursor >= this.scroll + VISIBLE) this.scroll = this.cursor - VISIBLE + 1;
    const row = Math.floor((inp.mouseY - TOP) / ROW) + this.scroll;
    const click = inp.mousePressed && inp.mouseX >= 160 && inp.mouseX < VW - 12 && inp.mouseY >= TOP && inp.mouseY < TOP + VISIBLE * ROW && row < rows.length;
    if (click) this.cursor = row;
    if (click || inp.wasPressed("Enter") || inp.wasPressed(" ")) rows[this.cursor].run();
  }
  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#080e18"; ctx.fillRect(0, 0, VW, VH);
    const run = g.world.player.shipSim?.active;
    drawText(ctx, run ? "A REASONABLE RECONSTRUCTION" : "THE SIM RIG", 12, 9, PAL.ui);
    drawText(ctx, run ? `WRITTEN BY ${run.cast.voice} / ACT ${Math.min(3, run.stage + 1)} OF 3` : "AN HOUR SOMEWHERE ELSE. ONE PROGRAM EACH LEG.", 12, 23, PAL.grey);
    if (run) {
      this.drawSet(ctx, run.stage);
      const act = shipSimAct(run), replying = run.reply !== undefined;
      drawText(ctx, act.title, 12, 106, PAL.gold);
      wrap((replying ? run.reply! : act.text).toUpperCase(), 112).slice(0, 7).forEach((line, i) => drawText(ctx, line, 12, 118 + i * 8, PAL.white));
      const choices = replying ? [run.done ? "END THE PROGRAM" : "CONTINUE THE RECONSTRUCTION"] : act.choices;
      choices.forEach((choice, i) => {
        const y = 178 + i * 22;
        if (this.cursor === i) { ctx.fillStyle = "#19323d"; ctx.fillRect(20, y, VW - 40, 20); }
        drawText(ctx, `${this.cursor === i ? ">" : " "} ${choice}`, 28, y + 5, this.cursor === i ? PAL.gold : PAL.ui);
      });
      drawText(ctx, "ARROWS CHOOSE   ENTER / CLICK CONTINUE   ESC PAUSES THE PROGRAM", 12, 258, PAL.greyDark);
      return;
    }
    if (this.result) {
      this.drawSet(ctx, 0);
      wrap(this.result.toUpperCase(), 108).forEach((line, i) => drawText(ctx, line, 12, 115 + i * 9, PAL.white));
      drawText(ctx, "[ ENTER / CLICK: BACK TO THE SHIP ]", 12, 242, PAL.ui);
      return;
    }
    ctx.fillStyle = "#172536"; ctx.fillRect(20, 60, 120, 142);
    ctx.strokeStyle = "#386175"; ctx.strokeRect(20, 60, 120, 142);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = ["#396477", "#245d64", "#5d5275", "#466451"][(i + Math.floor(this.time)) % 4]; ctx.fillRect(30 + i * 27, 72, 17, 85); }
    ctx.fillStyle = "#07111b"; ctx.fillRect(36, 91, 88, 49);
    drawText(ctx, "THE DOOR", 80 - textWidth("THE DOOR") / 2, 174, PAL.grey);
    drawText(ctx, "SAYS HELLO", 80 - textWidth("SAYS HELLO") / 2, 185, PAL.ui);
    const rows = this.menu(g);
    rows.slice(this.scroll, this.scroll + VISIBLE).forEach((row, i) => {
      const y = TOP + i * ROW, selected = this.cursor === this.scroll + i;
      if (selected) { ctx.fillStyle = "#19323d"; ctx.fillRect(160, y, VW - 172, ROW - 2); }
      drawText(ctx, `${selected ? ">" : " "} ${row.label}`, 166, y + 3, selected ? PAL.gold : PAL.white);
      drawText(ctx, wrap(row.detail, 73)[0], 174, y + 13, PAL.greyDark);
    });
    drawText(ctx, `${this.scroll + 1}-${Math.min(rows.length, this.scroll + VISIBLE)} OF ${rows.length} CHOICES / ARROWS OR WHEEL`, 160, 210, PAL.grey);
    const status = this.message || (g.world.player.simUsed ? "THE RIG HAS RUN THIS LEG. DOCK BEFORE STARTING ANOTHER PROGRAM." : "A BEACH, AN OPERA, OR YOURSELF AS THE SHIP REMEMBERS YOU.");
    wrap(status, 112).slice(0, 3).forEach((line, i) => drawText(ctx, line, 12, 227 + i * 8, PAL.ui));
    drawText(ctx, "ARROWS / WHEEL MOVE   ENTER / CLICK CHOOSE   ESC SHIP   F5 SAVE", 12, 258, PAL.greyDark);
  }
  drawSet(ctx: CanvasRenderingContext2D, stage: number): void {
    ctx.fillStyle = "#132832"; ctx.fillRect(12, 40, VW - 24, 57);
    ctx.strokeStyle = "#285463";
    for (let x = 12; x < VW; x += 24) { ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x, 97); ctx.stroke(); }
    for (let y = 49; y < 97; y += 12) { ctx.beginPath(); ctx.moveTo(12, y); ctx.lineTo(VW - 12, y); ctx.stroke(); }
    const cx = VW / 2;
    if (stage === 0) {
      ctx.fillStyle = "#486879"; ctx.fillRect(cx - 48, 56, 96, 24); ctx.fillStyle = "#1c3a49"; ctx.fillRect(cx - 32, 61, 64, 17);
      ctx.fillStyle = "#c7a54a"; ctx.fillRect(cx - 3, 74, 7, 12); ctx.fillStyle = "#e8b48c"; ctx.fillRect(cx - 2, 70, 5, 5);
    } else if (stage === 1) {
      ctx.fillStyle = "#758fa1"; ctx.fillRect(cx - 57, 63, 37, 12); ctx.fillRect(cx + 30, 61, 40, 17);
      ctx.strokeStyle = PAL.gold; ctx.beginPath(); ctx.moveTo(cx - 20, 69); ctx.lineTo(cx + 30, 69); ctx.stroke();
      drawText(ctx, "DISTRESS", cx + 37, 48, PAL.warn);
    } else {
      ctx.strokeStyle = PAL.ui; ctx.beginPath(); ctx.ellipse(cx, 68, 24, 19, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = PAL.gold; ctx.fillRect(cx - 2, 67, 5, 4);
      drawText(ctx, "THE NEXT PART IS YOURS", cx - textWidth("THE NEXT PART IS YOURS") / 2, 86, PAL.ui);
    }
  }
}
