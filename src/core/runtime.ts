// Title navigation reads the world. Only an active voyage runs story systems.
import type { Game } from "../game";
import { tutorialUpdate } from "./tutorial";
import { storyUpdate, convoyUpdate } from "./story";
import { crewArcUpdate } from "./crewarcs";
import { keeperUpdate } from "./keeper";
import { checkAchievements } from "./achievements";
export function updateVoyageSystems(g: Game): void {
  if (g.frontend) return;
  tutorialUpdate(g); storyUpdate(g); convoyUpdate(g); crewArcUpdate(g); keeperUpdate(g);
  checkAchievements(g);
}
