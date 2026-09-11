// Decorative title scenes. These sprites and clocks never touch a voyage.
import { RNG } from "../core/rng";
import { TitleView } from "../core/titleviews";
import { hull } from "../data/hulls";
import { genPlanet, genShip, genStation, Sprite } from "./sprites";

export class TitleBackdrop {
  private planet = genPlanet(new RNG(0x717713), 136, 0);
  private station = genStation(new RNG(17), 146, false);
  private traffic = genShip(new RNG(412), 24, "#9aa5bd", "#e5c179", "freighter");
  private ship: Sprite | null = null;
  private shipKey = "";
  draw(ctx: CanvasRenderingContext2D, view: TitleView, time: number, hullId: string, seed: number, paint?: string): void {
    const h = hull(hullId), key = `${h.id}:${seed}:${paint ?? ""}`;
    if (key !== this.shipKey) { this.ship = genShip(new RNG(seed ^ 0x51e9 ^ h.id.length), h.spriteSize, h.color, paint ?? h.accent, h.id); this.shipKey = key; }
    ctx.fillStyle = "#070d16"; ctx.fillRect(0, 0, 480, 270);
    for (let i = 0; i < 150; i++) {
      const x = (Math.imul(i + 3, 2654435761) >>> 0) % 480, y = (Math.imul(i + 11, 1597334677) >>> 0) % 270;
      ctx.fillStyle = i % 7 === 0 ? "#b4c6d7" : i % 3 ? "#33465c" : "#61798e";
      ctx.fillRect(x, y, 1, 1);
    }
    const placeShip = (sprite: Sprite, x: number, y: number, size: number, angle: number) => {
      ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(angle);
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size); ctx.restore();
    };
    if (view === "orbit") {
      ctx.drawImage(this.planet, 290, 125);
      placeShip(this.ship!, 347, 103 + Math.sin(time * .14) * 4, 82, -.28);
    } else if (view === "station") {
      ctx.save(); ctx.globalAlpha = .48; ctx.drawImage(this.planet, 362, 164, 165, 165); ctx.restore();
      ctx.drawImage(this.station, 281, 39);
      // Three fixed traffic paths, evaluated from time rather than accumulating actors.
      for (let i = 0; i < 3; i++) {
        const f = ((time * .009 + i / 3) % 1), x = 270 + f * 185, y = 210 - f * 184 + i * 10;
        placeShip(i === 0 ? this.ship! : this.traffic, x, y, i === 0 ? 29 : 19, -.78);
      }
      ctx.fillStyle = "#b8eecf"; ctx.fillRect(351, 166, 4, 2); ctx.fillRect(340, 165, 3, 2);
    } else {
      ctx.drawImage(this.planet, 270, 111);
      placeShip(this.traffic, 411 + Math.sin(time * .08) * 14, 62, 19, -.3);
      const poly = (points: number[][], color: string) => {
        ctx.fillStyle = color; ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
      };
      poly([[0,0],[480,0],[480,13],[18,13],[0,58]], "#253844");
      poly([[448,0],[460,0],[411,231],[400,231]], "#273c48");
      poly([[243,0],[251,0],[275,227],[264,227]], "#263d4a");
      poly([[0,245],[151,237],[254,221],[419,221],[480,242],[480,270],[0,270]], "#142630");
      poly([[283,230],[406,230],[434,265],[268,265]], "#3a505d");
      ctx.fillStyle = "#071923"; ctx.fillRect(294, 234, 39, 21); ctx.fillRect(344, 234, 49, 21);
      ctx.fillStyle = h.accent;
      for (let i = 0; i < 4; i++) { ctx.fillRect(299, 239 + i * 3, 17 + i * 3, 1); ctx.fillRect(349 + i * 10, 239, 4, 10 - i); }
      ctx.fillStyle = "#d9bd7b"; ctx.fillRect(304, 260, 5, 2); ctx.fillRect(318, 260, 5, 2);
    }
  }
}
