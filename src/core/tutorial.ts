// Flight School follows one postal run. Progress belongs to the saved voyage.
import type { Game } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { findStation } from "../world";
import { sfx } from "./sfx";
import { keyLabel, settings } from "./settings";
import { wrapText } from "./text";
import { schoolActive, schoolDeliveryTarget, schoolDestination } from "./flightschool";
import type { FlightScene } from "../scenes/flight/index";

export const STEPS = [
  { text: "THRUST, WATCH YOUR DRIFT, THEN MAKE A CONTROLLED STOP", reward: 50 },
  { text: "DOCK AT THE STATION MARKED FLIGHT SCHOOL ON THE MAP", reward: 100 },
  { text: "ACCEPT FIRST POST FROM THE MISSIONS TAB", reward: 50 },
  { text: "DELIVER THE MAIL AND COLLECT PAYMENT IN MISSIONS", reward: 150 },
  { text: "RETURN TO YOUR STARTING PORT AND DOCK SAFELY", reward: 100 },
  { text: "SAVE YOUR COMPLETED VOYAGE WITH F5", reward: 0 },
];
export function tutorialActive(g: Game): boolean { return schoolActive(g.world); }
export function tutorialStage(g: Game): number { return tutorialActive(g) ? g.world.player.tutorial! : -1; }

export function actionKey(action: string): string {
  const map = settings().keymap;
  const assigned = Object.entries(map).filter(([, value]) => value === action).map(([key]) => keyLabel(key));
  if (!map[action] || map[action] === action) assigned.push(keyLabel(action));
  return [...new Set(assigned)].join("/") || "UNBOUND (SETTINGS)";
}

export function tutorialText(g: Game): string {
  const p = g.world.player, s = p.flightSchool, stage = tutorialStage(g);
  if (stage < 0 || !s) return "";
  if (stage === 0 && ["station", "stationwalk"].includes(g.sceneName)) return "UNDOCK WITH ESC TO PRACTISE THRUST AND A CONTROLLED STOP.";
  if (stage === 0) return !s.thrustSeen ? `${actionKey("w")} THRUST PAST 60 M/S. NOSE IS HEADING; DRIFT IS MOTION. ${actionKey("a")}/${actionKey("d")} TURN.` : `${actionKey("x")} HOLD BRAKE UNTIL STOPPED (BELOW 4 M/S). TURNING ALONE DOES NOT STOP DRIFT.`;
  const home = findStation(g.world, s.homeStationId), destination = schoolDestination(g.world);
  if (stage === 2) {
    const target = schoolDeliveryTarget(g.world);
    return target ? `AT ${home?.st.name.toUpperCase() ?? "YOUR STARTING PORT"}, MISSIONS TAB: ACCEPT FIRST POST TO ${target.st.name.toUpperCase()}. NO CARGO SPACE OR CREW NEEDED. J READS FULL TERMS.` : "NO SUITABLE FIRST POST ROUTE AVAILABLE. KEEP EXPLORING OR K SKIP SCHOOL.";
  }
  if (stage === 5 && p.dockedAt === s.homeStationId) return `SAFE AT ${home?.st.name.toUpperCase() ?? "YOUR HOME PORT"}. F5 SAVES AND COMPLETES FLIGHT SCHOOL.`;
  if (!destination) return "THE LESSON PORT IS MISSING. KEEP EXPLORING OR K SKIP SCHOOL.";
  if (destination.sys.id !== p.systemId) return `${stage >= 4 ? "RETURN TO" : "DELIVER TO"} ${destination.st.name.toUpperCase()}. ${actionKey("g")} GALAXY: SELECT ${destination.sys.name.toUpperCase()}, THEN FLY THERE. REFUEL AT THE SHIPYARD FIRST. ${actionKey("Tab")} FINDS THE PORT AFTER ARRIVAL.`;
  if (stage === 3 && p.dockedAt === destination.st.id) return "MISSIONS TAB: SELECT FIRST POST AND ENTER TO COLLECT PAYMENT.";
  return `${stage >= 4 ? "RETURN TO" : stage === 3 ? "DELIVER TO" : "DOCK AT THE STATION:"} ${destination.st.name.toUpperCase()}, ${destination.sys.name.toUpperCase()}. ${actionKey("Tab")} MAP: SELECT ITS QUEST MARKER, THEN FLY THERE. ${actionKey("e")} REQUESTS DOCKING WITHIN 110M.`;
}

export function tutorialDetails(g: Game): string[] {
  if (!tutorialActive(g)) return [];
  return [tutorialText(g),
    `A plotted course does not start flight by itself. On the system map select the named station, then choose FLY THERE. The ship stops nearby; ${actionKey("e")} requests docking. ${actionKey("n")} or manual flight cancels autopilot.`,
    "At a port, tabs choose services. Missions lists the First post offer and later its payment. Market trades are optional. SHIPYARD offers REFUEL; select it and press Enter. Refuel before a jump and keep fuel for the return.",
    `Optional exploration: ${actionKey("e")} near a planet enters orbit. Optional rescue: ${actionKey("e")} beside a ship needing help opens its requirements. L RECORD describes nearby contacts. Neither branch is required for this job.`,
    "K skips school without changing your accepted contracts or route. Progress and paid lessons are stored with this voyage. F5 is a manual save; a failed save does not complete the final lesson."];
}

function advance(g: Game): void {
  const p = g.world.player, s = p.flightSchool, stage = tutorialStage(g);
  if (!s || stage < 0 || stage >= STEPS.length - 1) return;
  const reward = s.paidSteps.includes(stage) ? 0 : STEPS[stage].reward;
  if (!s.paidSteps.includes(stage)) s.paidSteps.push(stage);
  p.credits += reward; p.tutorial = stage + 1;
  sfx.pickup(); g.toast(reward ? `+${reward}CR / NEXT FLIGHT LESSON` : "NEXT FLIGHT LESSON");
  g.autosave();
}

export function tutorialUpdate(g: Game): void {
  const p = g.world.player, s = p.flightSchool, stage = tutorialStage(g);
  if (stage < 0 || !s || g.frontend || g.scene?.pausesVoyage) return;
  if (g.input.wasPressed("k")) { p.tutorial = -1; g.toast("FLIGHT SCHOOL DISMISSED"); g.autosave(); return; }
  const flight = g.scenes.flight as FlightScene | undefined;
  const atHome = p.dockedAt === s.homeStationId && ["station", "stationwalk"].includes(g.sceneName);
  switch (stage) {
    case 0: {
      if (g.sceneName !== "flight" || !flight || flight.paused || flight.mapOpen || flight.logOpen || flight.launching > 0 || flight.docking) return;
      const speed = Math.hypot(p.vx, p.vy);
      if (g.input.isDown("w") && flight.engineBurn && speed > 60) s.thrustSeen = true;
      if (s.thrustSeen && g.input.isDown("x") && p.fuel > 0) {
        if (flight.engineBurn && speed >= 4) s.brakeSeen = true;
        if (s.brakeSeen && speed < 4) advance(g);
      }
      break;
    }
    case 1: if (atHome) advance(g); break;
    case 2: if (s.missionId && p.missions.some(m => m.id === s.missionId && m.accepted && !m.done)) advance(g); break;
    case 3:
      if (s.delivered) advance(g);
      else if (s.missionId && !p.missions.some(m => m.id === s.missionId && m.accepted && !m.done)) {
        delete s.missionId; p.tutorial = 2; g.toast("FIRST POST IS NO LONGER ABOARD. RETURN TO YOUR STARTING PORT TO ACCEPT IT AGAIN."); g.autosave();
      }
      break;
    case 4: if (s.delivered && atHome) advance(g); break;
  }
}

// Include completion in the bytes being saved, and restore the lesson if writing fails.
export function prepareTutorialSave(g: Game): (() => void) | null {
  const p = g.world.player, s = p.flightSchool;
  if (g.frontend || tutorialStage(g) !== 5 || !s?.delivered || p.dockedAt !== s.homeStationId) return null;
  const oldSaved = s.saved;
  p.tutorial = STEPS.length; s.saved = true;
  return () => { p.tutorial = 5; if (oldSaved === undefined) delete s.saved; else s.saved = oldSaved; };
}

export function drawTutorial(g: Game, ctx: CanvasRenderingContext2D, y = 72): void {
  const stage = tutorialStage(g);
  if (stage < 0) return;
  const head = `FLIGHT SCHOOL ${stage + 1}/${STEPS.length}`, lines = wrapText(tutorialText(g), 110).slice(0, 2);
  ctx.fillStyle = "rgba(8,12,22,0.94)"; ctx.fillRect(4, y - 3, 472, 13 + lines.length * 9);
  drawText(ctx, head, 10, y, PAL.ui); drawText(ctx, "[K] SKIP", 470 - textWidth("[K] SKIP"), y, PAL.greyDark);
  lines.forEach((line, i) => drawText(ctx, line, 10, y + 10 + i * 9, PAL.gold));
}
