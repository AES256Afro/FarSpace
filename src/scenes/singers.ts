import { Game, Scene, VW, VH } from "../game";
import { enterSingersBerth, lightQuote, SINGERS_OFFERS, tradeWithSingers } from "../core/singers";
import { sfx } from "../core/sfx";
import { music } from "../core/music";
import { drawText, textWidth } from "../gfx/font";
import { drawSingersRing } from "../gfx/singers";
import { PAL } from "../gfx/palette";
import type { FlightScene } from "./flight/index";
import { cargoUsed } from "../world";

const TOP = 82, ROW = 23, LEFT = 186;

export class SingersScene implements Scene {
  touchMode = "menu" as const;
  cursor = 0;
  message = "";
  time = 0;

  enter(g: Game): void {
    if (!enterSingersBerth(g.world)) { this.leave(g); return; }
    const p = g.world.player;
    p.vx = 0; p.vy = 0;
    this.cursor = 0; this.time = 0;
    this.message = "YOUR NAME IS STILL IN THE ROLL-CALL. THE BERTH REMEMBERS.";
    g.autosave();
  }

  leave(g: Game): void {
    const flight = g.scenes.flight as FlightScene;
    flight.resumeNext = true;
    g.setScene("flight");
  }

  update(g: Game, dt: number): void {
    this.time += dt; music.setMood("wonder", 0);
    const inp = g.input, total = SINGERS_OFFERS.length + 1;
    if (inp.wasPressed("Escape")) { this.leave(g); return; }
    if (inp.wasPressed("F5")) g.save();
    if (inp.wasPressed("F9")) { g.load(); return; }
    if (inp.wasPressed("ArrowUp") || inp.wheel < 0) this.cursor = (this.cursor + total - 1) % total;
    if (inp.wasPressed("ArrowDown") || inp.wheel > 0) this.cursor = (this.cursor + 1) % total;
    const row = Math.floor((inp.mouseY - TOP) / ROW);
    const clicked = inp.mousePressed && inp.mouseX >= LEFT && inp.mouseX < VW - 16 && row >= 0 && row < total;
    if (clicked) this.cursor = row;
    if (clicked || inp.wasPressed("Enter") || inp.wasPressed(" ")) {
      if (this.cursor === SINGERS_OFFERS.length) { this.leave(g); return; }
      const result = tradeWithSingers(g.world, SINGERS_OFFERS[this.cursor]);
      this.message = result.message;
      if (result.ok) { sfx.pickup(); g.autosave(); } else sfx.blip();
    }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    const p = g.world.player, account = p.singersExchange;
    ctx.fillStyle = "#070d18"; ctx.fillRect(0, 0, VW, VH);
    for (let i = 0; i < 55; i++) {
      ctx.fillStyle = i % 4 ? "#172b43" : "#3c6979";
      ctx.fillRect((i * 137 + 23) % VW, (i * 47 + 31) % VH, 1, 1);
    }
    ctx.strokeStyle = "#244858"; ctx.strokeRect(12, 12, VW - 24, VH - 40);
    drawText(ctx, "THE SINGERS' BERTH", 24, 22, PAL.ui);
    drawText(ctx, `${g.world.systems[p.systemId].name.toUpperCase()} / THE RETURNING ROOM`, 24, 33, PAL.grey);
    drawText(ctx, "THEY TRADE IN LIGHT. YOUR SURVEYS TELL THEM WHERE IT HAS BEEN.", 24, 48, PAL.white);
    drawText(ctx, `LIGHT ${account?.light ?? 0}   DATA ${Math.floor(p.expData ?? 0)}   SHARED ${account?.dataShared ?? 0}`, 24, 64, PAL.gold);
    drawText(ctx, `FUEL ${Math.floor(p.fuel)}/${p.fuelMax}   HULL ${Math.floor(p.hull)}/${p.hullMax}   HOLD ${cargoUsed(p)}/${p.cargoMax}   PARTS ${p.cargo.parts ?? 0}   RELICS ${p.cargo.relics ?? 0}`, 24, 74, PAL.grey);

    drawSingersRing(ctx, 94, 124, 2.1, this.time);
    drawText(ctx, "THE INTERPRETER", 94 - textWidth("THE INTERPRETER") / 2, 169, PAL.ui);
    const lines = ["'YOUR CREDIT CHIP IS LOVELY.'", "'WHAT DOES IT REMEMBER?'", "", "SHE LETS YOU KEEP IT.", "THE SHIP IS RELIEVED."];
    lines.forEach((line, i) => drawText(ctx, line, 94 - textWidth(line) / 2, 184 + i * 9, PAL.grey));

    for (let i = 0; i < SINGERS_OFFERS.length + 1; i++) {
      const y = TOP + i * ROW;
      if (i === this.cursor) { ctx.fillStyle = "#1b3043"; ctx.fillRect(LEFT, y, VW - LEFT - 16, ROW - 2); }
      if (i === SINGERS_OFFERS.length) {
        drawText(ctx, "> BACK TO THE SHIP", LEFT + 6, y + 4, PAL.ui);
        drawText(ctx, "THE CLAMPS OPEN WITHOUT A SOUND.", LEFT + 14, y + 13, PAL.grey);
      } else {
        const q = lightQuote(p, SINGERS_OFFERS[i]);
        drawText(ctx, `${i === this.cursor ? "> " : "  "}${q.label}`, LEFT + 6, y + 4, q.reason ? PAL.grey : PAL.gold);
        drawText(ctx, q.detail, LEFT + 14, y + 13, q.reason ? PAL.greyDark : PAL.white);
      }
    }
    drawText(ctx, this.message, 24, 236, PAL.ui);
    if (this.cursor < SINGERS_OFFERS.length) drawText(ctx, lightQuote(p, SINGERS_OFFERS[this.cursor]).reason, 24, 246, PAL.warn);
    const help = "ARROWS / WHEEL MOVE   ENTER / CLICK TRADE   ESC SHIP   F5 SAVE";
    drawText(ctx, help, VW / 2 - textWidth(help) / 2, 257, PAL.grey);
  }
}
