import { tickWorkshop } from "./workshop";
import type { FlightScene } from "../scenes/flight/index";
// Title navigation reads the world. Only an active voyage runs story systems.
import type { Game } from "../game";
import { tutorialUpdate } from "./tutorial";
import { storyUpdate, convoyUpdate } from "./story";
import { crewArcUpdate } from "./crewarcs";
import { keeperUpdate } from "./keeper";
import { checkAchievements } from "./achievements";
export function updateVoyageSystems(g: Game, dt = 0): void {
  if (g.frontend) return;
  const flight = g.scenes.flight as FlightScene | undefined;
  const working = ["workshop", "station", "interior", "orbit", "surface"].includes(g.sceneName)
    || (g.sceneName === "flight" && flight && !flight.paused && !flight.mapOpen && !flight.logOpen);
  if (working) { const events = tickWorkshop(g.world.player, dt); if (events.length) { g.toast(events.join(" ")); g.autosave(); } }
  tutorialUpdate(g); storyUpdate(g); convoyUpdate(g); crewArcUpdate(g); keeperUpdate(g);
  checkAchievements(g);
}
