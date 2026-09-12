import { describe, it, expect, vi } from "vitest";
import type { Game } from "../src/game";
import { generateWorld } from "../src/world";
import { LettersScene } from "../src/scenes/letters";
import { ReaderOverlay, ReaderScene } from "../src/scenes/reader";
import { CityScene } from "../src/scenes/city";
import { OutpostScene } from "../src/scenes/outpost";
import { ServiceScene } from "../src/scenes/service";
import { CouncilScene } from "../src/scenes/council";
import { EncounterScene } from "../src/scenes/encounter";
import { OrbitScene } from "../src/scenes/orbit";
import { FlightScene } from "../src/scenes/flight/index";
import { updateVoyageSystems } from "../src/core/runtime";
import { workshop } from "../src/core/workshop";

describe("reader runtime ownership", () => {
  for (const Scene of [CityScene, OutpostScene, ServiceScene, CouncilScene, EncounterScene, OrbitScene]) it(`pauses voyage systems in ${Scene.name} while its reader is open`, () => {
    const scene = new Scene(), world = generateWorld(269); world.player.tutorial = 2; workshop(world.player).queue = [{ recipe: "parts", remaining: 1, progress: 0 }];
    const g = { world, scene, sceneName: "orbit", frontend: false, scenes: {}, input: { wasPressed: () => true }, toast: vi.fn(), autosave: vi.fn() } as unknown as Game;
    scene.info = new ReaderOverlay("Read", [["Terms", ["Complete terms"]]], () => {}); const before = JSON.stringify(world); updateVoyageSystems(g, 30); expect(JSON.stringify(world)).toBe(before);
    scene.onSceneLeave(); expect(scene.pausesVoyage).toBe(false);
  });
  it("pauses through the flight owner of system map details", () => {
    const scene = new FlightScene(), world = generateWorld(269); world.player.tutorial = 2;
    scene.mapOpen = true; scene.systemMap.info = new ReaderOverlay("Destination", [["Site", ["Details"]]], () => {});
    const g = { world, scene, sceneName: "flight", frontend: false, scenes: { flight: scene }, input: { wasPressed: () => true } } as unknown as Game;
    const before = JSON.stringify(world); updateVoyageSystems(g, 30); expect(JSON.stringify(world)).toBe(before); scene.onSceneLeave(); expect(scene.pausesVoyage).toBe(false);
  });
  it("pauses standalone handbook and Chronicle readers", () => {
    const scene = new ReaderScene("Read", [["Chapter", ["Text"]]]), world = generateWorld(269), before = JSON.stringify(world);
    updateVoyageSystems({ scene, world, frontend: false } as Game, 30); expect(JSON.stringify(world)).toBe(before);
    updateVoyageSystems({ scene: new LettersScene(), world, frontend: false } as Game, 30); expect(JSON.stringify(world)).toBe(before);
  });
});
