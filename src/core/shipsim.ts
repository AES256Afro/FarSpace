import type { World } from "../world";
import { findStation, firstOfficer, logEntry, runSim, shipVoiceName, SIM_PROGRAMS } from "../world";
import type { SimProgram } from "../world";
import { hull } from "../data/hulls";
import { RNG } from "./rng";

export interface ShipSimCast {
  voice: string; ship: string; captain: string; crew: string | null; home: string;
  memory: string; motto: string; cat: string | null;
}
export interface ShipSimRun {
  id: number; cast: ShipSimCast; stage: number; choices: number[];
  reply?: string; done?: boolean; ending?: string;
}
export interface ShipSimState { serial: number; runs: number; endings: Record<string, number>; active?: ShipSimRun; lastEnding?: string }
export interface ShipSimAct { title: string; text: string; choices: string[] }

export function shipSimKnown(w: World): boolean { return !!(w.player.voiceName || w.player.flags?.shipCrew); }
export function shipSimReason(w: World): string | null {
  const p = w.player;
  if (!p.furnishings?.includes("simrig")) return "THE SHIP NEEDS A SIM RIG. FURNISH IT AT A SHIPYARD.";
  if (p.shipSim?.active) return null;
  if (!shipSimKnown(w)) return "ASK THE SHIP ITS NAME AT THE WALL OF RECORD. IT HAS NOT SIGNED THE PROGRAM YET.";
  if (p.simUsed) return "THE RIG HAS RUN THIS LEG. THE NEXT DOCKING OPENS ANOTHER SESSION.";
  return null;
}
export function shipSimCast(w: World): ShipSimCast {
  const p = w.player, home = p.homePort && findStation(w, p.homePort);
  const last = p.alumni?.find(a => a.finalJourney);
  const memory = (p.council?.represented ?? 0) > 0 ? `You brought ${p.council!.represented} written repl${p.council!.represented === 1 ? "y" : "ies"} home for a rock. I kept a copy.`
    : last ? `You took ${last.name} to their chosen last port. I remember the empty bunk.`
    : (p.lives ?? 0) > 0 ? `${p.lives} lives in the rescue record. I count those separately from the cargo.`
    : (p.words ?? []).length ? `We learned ${p.words!.length} words that were not ours. I practise when you sleep.`
    : p.log?.length ? `From my log: ${p.log[p.log.length - 1].text.slice(0, 100)}`
    : "We have a short log. I have left room for what comes next.";
  return { voice: shipVoiceName(p), ship: p.shipName ?? hull(p.hullId).name, captain: p.captainName ?? "THE CAPTAIN",
    crew: (firstOfficer(p) ?? p.crew[0])?.name ?? null, home: home ? home.st.name : "a port we have not chosen yet",
    memory, motto: p.motto ?? "Keep the people aboard.", cat: p.cat?.name ?? null };
}
export function beginShipSim(w: World): string | null {
  const reason = shipSimReason(w); if (reason) return reason;
  if (w.player.shipSim?.active) return null;
  const state = w.player.shipSim ??= { serial: 0, runs: 0, endings: {} };
  state.active = { id: ++state.serial, cast: shipSimCast(w), stage: 0, choices: [] };
  w.player.simUsed = true;
  logEntry(w, `Entered ${state.active.cast.voice}'s sim program, A Reasonable Reconstruction`);
  return null;
}
export function shipSimAct(run: ShipSimRun): ShipSimAct {
  const c = run.cast;
  if (run.stage === 0) return { title: "ACT ONE: A PERFECTLY ORDINARY ARRIVAL",
    text: `${c.ship}'s bridge appears, twice its real size. ${c.crew ?? "An actor with a very unconvincing moustache"} plays the harbourmaster. '${c.captain}, your application for permission to have arrived has arrived.' ${c.voice}: 'I have improved the dialogue. The log was mostly swearing.'`,
    choices: ["ASK WHAT THE CLERK NEEDS", "LET YOUR CREW HANDLE THE DESK", "ASK WHY THE BRIDGE IS SO LARGE"],
  };
  if (run.stage === 1) return { title: "ACT TWO: SOMEBODY HAS TO ANSWER",
    text: `A tiny freighter appears in a very large storm. Its distress call is voiced by the coffee machine. ${c.voice}: '${c.memory} This scene is invented. The question is familiar.' The freighter seems to need a tow. It certainly needs a voice on the radio and somebody to tell the passengers what is happening.`,
    choices: ["TAKE THE LINE YOURSELF", "GIVE EACH PERSON A JOB", "ASK THE FREIGHTER WHAT IT NEEDS FIRST"],
  };
  return { title: "ACT THREE: THE PART I COULD NOT WRITE",
    text: `The storm fades. ${c.home} waits outside the window. The crew have gone to find the kettle${c.cat ? `; ${c.cat} has kept the captain's chair` : ""}. ${c.voice}: 'Your plaque says, ${c.motto} I copied the words. I could not copy why you stay. That part is yours.'`,
    choices: ["FOR THE PEOPLE WHO COME ABOARD", "TO HAVE SOMEWHERE TO COME HOME TO", "TO FIND OUT WHAT IS PAST THE NEXT GATE"],
  };
}
export function chooseShipSim(w: World, expected: ShipSimRun, stage: number, choice: number): string | null {
  const state = w.player.shipSim, run = state?.active;
  if (!run || run !== expected || run.done || run.reply !== undefined || run.stage !== stage || stage < 0 || stage > 2 || !Number.isInteger(choice) || choice < 0 || choice > 2) return null;
  run.choices.push(choice);
  const c = run.cast;
  if (stage === 0) {
    run.reply = [
      `'A pen,' says the clerk. The entire simulation stops while somebody finds a pen. ${c.voice}: 'You do this. You ask what is missing. It ruins a surprising number of arguments.'`,
      `${c.crew ?? "The substitute first officer"} takes the paper and quietly solves everything while your simulated self practises a speech. ${c.voice}: 'I gave you a speech because you never let me finish mine.'`,
      `${c.voice}: 'The bridge is the size you behave as though it is when you pace. I measured.' The harbourmaster moves a wall in, apologetically. Everybody fits better.`,
    ][choice];
  } else if (stage === 1) {
    run.reply = [
      `You take a line through rain that cannot exist in space. ${c.voice}: 'I added rain. It made the cable easier to see.' The freighter comes alongside. The passengers ask your name. You remember to ask theirs.`,
      `${c.crew ?? "Your temporary crew"} takes the tow, the radio gets a calm voice, and the passengers get an explanation. ${c.voice}: 'Nobody did everything. Everybody did something. That is my favourite trick of yours.'`,
      `The freighter says its engines work. It has lost the way home. You share a course and stay on the radio. ${c.voice}: 'I had already animated a tow cable. I have removed it. Listening is hard to draw.'`,
    ][choice];
  } else {
    const endings = ["THE PEOPLE", "THE WAY HOME", "THE NEXT GATE"];
    run.ending = endings[choice];
    run.reply = [
      `${c.voice}: 'I thought so. You count bunks before credits. I have adjusted the model.' The simulated ship opens every cabin door. None of them is empty for long.`,
      `${c.voice}: 'Then I will keep the light on. That is a thing I can do.' The window fills with a port. There is room at the clamp for another ship.`,
      `${c.voice}: 'Good. I left that part unfinished on purpose.' A gate lights at the edge of the picture. The program ends before either of you can spoil the view.`,
    ][choice];
    run.reply += w.player.crew.length ? " THE CREW COME OUT SMILING. MORALE +6. THE PROGRAM KEEPS YOUR ENDING." : " THE RIG LIGHTS DIM. THE SHIP KEEPS YOUR ENDING.";
    (w.player.flags ??= {}).holiday = true;
    run.done = true; state!.runs++; state!.lastEnding = run.ending; state!.endings[run.ending] = (state!.endings[run.ending] ?? 0) + 1;
    w.player.simUsed = true;
    for (const crew of w.player.crew) { crew.morale = Math.min(100, crew.morale + 6); crew.loyalty = (crew.loyalty ?? 0) + 0.1; }
    if (state!.runs === 1) {
      (w.player.keepsakes ??= []).push(`the last page of ${c.voice}'s sim script, with your ending in the margin`);
      if (w.player.keepsakes.length > 8) w.player.keepsakes.shift();
    }
    logEntry(w, `Completed ${c.voice}'s reconstruction of the captain: ${run.ending.toLowerCase()}`);
  }
  return run.reply;
}
export function continueShipSim(w: World, expected: ShipSimRun): boolean {
  const state = w.player.shipSim, run = state?.active;
  if (!run || run !== expected || run.reply === undefined) return false;
  if (run.done) { delete state!.active; return true; }
  run.stage++; delete run.reply; return true;
}
export function runClassicSim(w: World, program: SimProgram, rng: RNG): string | null {
  if (!w.player.furnishings?.includes("simrig") || w.player.simUsed || w.player.shipSim?.active || !SIM_PROGRAMS.some(p => p.id === program)) return null;
  const result = runSim(w, program, rng);
  (w.player.flags ??= {}).holiday = true;
  return result;
}
