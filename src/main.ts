// FarSpace entry point: boot the game, register scenes, run the loop.

import { Game, VW, VH } from "./game";
import { TitleScene } from "./scenes/title";
import { FlightScene } from "./scenes/flight";
import { StationScene } from "./scenes/station";
import { InteriorScene } from "./scenes/interior";
import { GalaxyScene } from "./scenes/galaxy";
import { StationWalkScene } from "./scenes/stationwalk";
import { initAudioUnlock } from "./core/sfx";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const game = new Game(canvas);

game.scenes["title"] = new TitleScene();
game.scenes["flight"] = new FlightScene();
game.scenes["station"] = new StationScene();
game.scenes["interior"] = new InteriorScene();
game.scenes["galaxy"] = new GalaxyScene();
game.scenes["stationwalk"] = new StationWalkScene();

game.setScene("title");
initAudioUnlock();

// dev/debug handle
(window as unknown as { game: Game }).game = game;

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (game.toastTimer > 0) game.toastTimer -= dt;

  game.scene.update(game, dt);
  game.scene.draw(game, game.bctx);
  game.input.flush();

  // blit internal buffer scaled to the display canvas
  game.ctx.imageSmoothingEnabled = false;
  game.ctx.drawImage(game.buffer, 0, 0, VW, VH, 0, 0, VW * game.scale, VH * game.scale);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
