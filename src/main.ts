// FarSpace entry point: boot the game, register scenes, run the loop.

import { Game, VW, VH } from "./game";
import { TitleScene } from "./scenes/title";
import { FlightScene } from "./scenes/flight/index";
import { StationScene } from "./scenes/station";
import { InteriorScene } from "./scenes/interior";
import { GalaxyScene } from "./scenes/galaxy";
import { StationWalkScene } from "./scenes/stationwalk";
import { WreckScene } from "./scenes/wreck";
import { OrbitScene } from "./scenes/orbit";
import { OutpostScene } from "./scenes/outpost";
import { crewArcUpdate } from "./core/crewarcs";
import { keeperUpdate } from "./core/keeper";
import { WaystationScene } from "./scenes/waystation";
import { AlmanacScene } from "./scenes/almanac";
import { ChronicleScene } from "./scenes/chronicle";
import { RosterScene } from "./scenes/roster";
import { CityScene } from "./scenes/city";
import { RuinScene } from "./scenes/ruin";
import { SettingsScene } from "./scenes/settings";
import { SurfaceScene } from "./scenes/surface";
import { HelpScene } from "./scenes/help";
import { WhatsNewScene } from "./scenes/whatsnew";
import { EncounterScene } from "./scenes/encounter";
import { RepairScene } from "./scenes/repair";
import { SlotsScene } from "./scenes/slots";
import { checkAchievements } from "./core/achievements";
import { storyUpdate, convoyUpdate } from "./core/story";
import { presence } from "./core/presence";
import { initAudioUnlock } from "./core/sfx";
import { initTouch } from "./core/touch";
import { music } from "./core/music";
import { tutorialUpdate } from "./core/tutorial";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const game = new Game(canvas);

game.scenes["title"] = new TitleScene();
game.scenes["flight"] = new FlightScene();
game.scenes["station"] = new StationScene();
game.scenes["interior"] = new InteriorScene();
game.scenes["galaxy"] = new GalaxyScene();
game.scenes["stationwalk"] = new StationWalkScene();
game.scenes["wreck"] = new WreckScene();
game.scenes["orbit"] = new OrbitScene();
game.scenes["outpost"] = new OutpostScene();
game.scenes["waystation"] = new WaystationScene();
game.scenes["almanac"] = new AlmanacScene();
game.scenes["chronicle"] = new ChronicleScene();
game.scenes["roster"] = new RosterScene();
game.scenes["city"] = new CityScene();
game.scenes["ruin"] = new RuinScene();
game.scenes["settings"] = new SettingsScene();
game.scenes["surface"] = new SurfaceScene();
game.scenes["help"] = new HelpScene();
game.scenes["whatsnew"] = new WhatsNewScene();
game.scenes["encounter"] = new EncounterScene();
game.scenes["repair"] = new RepairScene();
game.scenes["slots"] = new SlotsScene();

game.setScene("title");
initAudioUnlock();
initTouch(canvas, game);

// dev/debug handle
(window as unknown as { game: Game; presence: typeof presence }).game = game;
(window as unknown as { presence: typeof presence }).presence = presence; // debug handle, same instance the scenes use
// a hot update would spawn a second game loop on the same canvas; reload instead
if (import.meta.hot) import.meta.hot.accept(() => location.reload());

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.toastTimer > 0) game.toastTimer -= dt;
  if (game.hintTimer > 0) { game.hintTimer -= dt; if (game.hintTimer <= 0) game.hint = ""; }

  game.input.pollGamepad(game.touchMode());
  if (game.input.wasPressed("h")) game.toast(music.toggle() ? "MUSIC ON" : "MUSIC OFF");
  music.start();
  // one bad frame must not kill the loop: log it, toast it, carry on
  try {
    game.scene.update(game, dt);
    tutorialUpdate(game);
    storyUpdate(game);
    convoyUpdate(game);
    crewArcUpdate(game);
    keeperUpdate(game);
  } catch (err) {
    console.error(err);
    if (!game.toastMsg.startsWith("GLITCH")) game.toast("GLITCH LOGGED - CARRYING ON");
  }
  checkAchievements(game);
  try { game.scene.draw(game, game.bctx); }
  catch (err) { console.error("draw failed in", game.sceneName, err); if (!game.toastMsg.startsWith("GLITCH")) game.toast("GLITCH LOGGED - CARRYING ON"); }
  if (game.input.wasPressed("F7") && game.sceneName !== "title") game.postcard(game.postcardCaption());
  game.input.flush();

  game.ctx.imageSmoothingEnabled = false;
  game.ctx.drawImage(game.buffer, 0, 0, VW, VH, 0, 0, game.canvas.width, game.canvas.height);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
