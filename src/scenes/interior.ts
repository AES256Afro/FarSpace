// Ship interior: walk your deck, repair physical panels, seal breaches, fight
// fires, talk to crew and passengers, study, eat, sleep.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { ShipSystemId, removeCargo, cargoUsed, crewBonus, tickWorld, passengersAboard, crewXp, FURNISHINGS, bond, onWatch, watchIndex, captainNickname, borderStanding, passengersFed, cookMeal, briefingReports, setFocus, runSim, SIM_PROGRAMS, nameTheShip, weekKey, dedication, MOTTOS, stardate, birthdaysDue } from "../world";
import { commodity, faction } from "../data/data";
import { crewChatter, soloChatter, MESS_LINES, passengerChatter } from "../data/chatter";
import { RNG } from "../core/rng";

const PASSENGER_LINES: Record<string, { high: string[]; mid: string[]; low: string[] }> = {
  vip: { high: ["This is almost civilised.", "I've told my people about this ship. Good things, for once.", "Keep flying like this and I'll book you again."],
    mid: ["Is this really the fastest you can fly?", "Do you have anything to drink that isn't recycled?", "I'll be mentioning this ship to my people. Whether that's good depends on you."],
    low: ["I have been on prison barges with better service.", "My people will hear about this.", "How much longer. Exactly."] },
  refugee: { high: ["Thank you. I mean it. Nobody else would take me.", "I slept. First time in weeks.", "When we land, I'll find work. I always do."],
    mid: ["Don't let them scan us at the gate. Please.", "Is there any more of that food?", "I don't mind the noise. It means the engines work."],
    low: ["We're going to be turned back. I can feel it.", "The others are frightened. I'm frightened.", "Please. Just get us there."] },
  fugitive: { high: ["You're good at this. Not asking how.", "Quietest ship I've been on. I've been on a few.", "Once I'm off, you never saw me. That's a compliment."],
    mid: ["No questions. That was the deal.", "If the gate flags us, you never saw me.", "You'll get paid. Just get me there."],
    low: ["You're going to get me caught.", "This is taking too long. Too long.", "If they board us, I'm not going quietly."] },
  tourist: { high: ["We've never seen anything like it. Any of it.", "The children want to know if you'll take us again next year.", "Is that another one? Slow down, slow down!"],
    mid: ["When do we see it?", "Are the viewports always this small?", "Someone in the party is asking about the toilets."],
    low: ["This isn't what the brochure said.", "We paid for sights, not corridors.", "The children have stopped asking questions. That's worse."] },
  envoy: { high: ["The talks will go better for having arrived on a ship like this. That's not flattery. It's diplomacy.", "I've drafted the opening line three times. The hum helps."],
    mid: ["How many dockings left? I ask only because the treaty does.", "If we're fired on, I'd like to be told before, not after."],
    low: ["A treaty is a fragile thing. So, it turns out, is my stomach.", "I have been on worse ships. I am trying to remember when."] },
  patient: { high: ["The medic says I'm holding. I believe the medic. I've decided to.", "Smooth flying. I felt it in the stitches, in a good way."],
    mid: ["How far to the clinic? Roughly. In dockings.", "I'm fine. I'm saying that so somebody has."],
    low: ["Tell the pilot the turns are the hard part.", "If we don't make it in time, it's not your fault. I wanted that said."] },
  prisoner: { high: ["You feed your prisoners. That's rarer than you'd think.", "The irons are Guild pattern. I'm not going anywhere. I'm just saying I know."],
    mid: ["The navy's version leaves things out. Everybody's does.", "Is there a gunner aboard? ... Just making conversation."],
    low: ["I've been on worse ships. Those ships had worse captains, though.", "Two jumps from here there's a rock where nobody would ask. Just so you know it exists."] },
  courier: { high: ["I'll make the meeting with time to spare. Excellent.", "Efficient. I'll say so.", "Best run I've booked this quarter."],
    mid: ["I have a meeting. You understand.", "What's our ETA. Precisely.", "I'll be working, don't mind me."],
    low: ["The meeting is gone. You realise that.", "I'll be asking for a refund.", "Speed, Captain. It was the whole point."] },
};
import { hull, HullDef } from "../data/hulls";
import { CREW_LINES, ROLE_INFO, roleLabel, SPECIALTIES } from "../data/crew";
import { clamp, dist } from "../core/mathx";
import { sfx } from "../core/sfx";
import { flag } from "../core/achievements";
import { ask } from "../core/dialog";
import { music } from "../core/music";
import { rankOf, rescuePoints, STORY_LEN, findStation, canRetireCaptain, retireCaptain, RETIRE_AFTER, ledger, logEntry, chooseSpecialty } from "../world";
import * as wire from "../core/wire";
import { isOccasion } from "../data/occasions";
import { serialLines } from "../data/serials";
import type { Encounter } from "../data/encounters";
import type { EncounterScene } from "./encounter";
import { ACHIEVEMENTS } from "../data/achievements";
import { T, moveWalker, deckOrigin, drawTiles, drawPerson, nearestTile, tooltip, footer, computeRooms } from "./walkbase";

// Deck layouts per hull. # wall . floor D door C cockpit E engines L scrubbers
// W weapons G cargo R reactor M comms B bunk K galley S study c crew spot p passenger seat
const DECKS: Record<HullDef["deck"], string[]> = {
  scout: [
    "##############################",
    "#..........##........#....M..#",
    "#..B.......##...R....#.......#",
    "#..........D.........D....C..#",
    "#..K..S....##........#.......#",
    "#..p.......##...L....#..c....#",
    "######D#######D###############",
    "#........#..........#....W...#",
    "#..G.....D..........D........#",
    "#........#....E.....#........#",
    "#........#..........#........#",
    "##############################",
  ],
  prospector: [
    "################################",
    "#....G.....#........#.....M....#",
    "#..........#...R....#..........#",
    "#....G.....D........D.....C....#",
    "#..........#........#..........#",
    "#....G.....#...L....#..c..c....#",
    "#####D#######D##########D#######",
    "#.........#.........#..........#",
    "#..B..K...D....E....D...S..p...#",
    "#.........#.........#....W.....#",
    "################################",
  ],
  freighter: [
    "######################################",
    "#....G....G....#........#.....M......#",
    "#..............#...R....#............#",
    "#....G....G....D........D.....C......#",
    "#..............#........#............#",
    "#....G....G....#...L....#..c..c..c...#",
    "#######D#########D##########D#########",
    "#.......#..........#..........#......#",
    "#..B.B..D....E.....D..K...S...D..p...#",
    "#.......#..........#..........#..W...#",
    "######################################",
  ],
  carrier: [
    "##########################################",
    "#....G....G....#.........#......M........#",
    "#..............#....R....#...............#",
    "#....G....G....D.........D.......C.......#",
    "#..............#.........#...............#",
    "#..B..B..B.....#....L....#..c..c..c..c..c#",
    "#######D###########D###########D##########",
    "#.......#.............#........#.........#",
    "#..K..S.D......E......D..H..H..D...p.....#",
    "#.......#.............#........#....W....#",
    "#.......#.............#..H..H..#.........#",
    "##########################################",
  ],
  interceptor: [
    "##########################",
    "#....M....#.....#....C...#",
    "#.........D..R..D........#",
    "#..W......#.....#..c.....#",
    "####D#######D#####D#######",
    "#......#........#........#",
    "#..B...D...E....D..K..S..#",
    "#..G...#...L....#..p..c..#",
    "##########################",
  ],
};

interface PanelDef { ch: string; sysId: ShipSystemId | null; label: string; desc: string }
const PANELS: PanelDef[] = [
  { ch: "C", sysId: null, label: "COCKPIT", desc: "Take the helm" },
  { ch: "E", sysId: "engines", label: "MAIN ENGINES", desc: "Thrust output" },
  { ch: "L", sysId: "life", label: "AIR SCRUBBERS", desc: "O2 recycling" },
  { ch: "R", sysId: "reactor", label: "REACTOR CORE", desc: "Ship power" },
  { ch: "W", sysId: "weapons", label: "WEAPON MOUNTS", desc: "Cannon feeds" },
  { ch: "G", sysId: "cargo", label: "CARGO BAY", desc: "Stowed goods" },
  { ch: "M", sysId: "comms", label: "COMMS ARRAY", desc: "Listen to the band" },
  { ch: "B", sysId: null, label: "BUNK", desc: "Sleep (skips 60s)" },
  { ch: "K", sysId: null, label: "GALLEY", desc: "Eat (needs provisions)" },
  { ch: "S", sysId: null, label: "STUDY TERMINAL", desc: "Senior staff briefing once a leg; train a skill" },
  { ch: "H", sysId: null, label: "HANGAR BAY", desc: "Escort drones" },
];

export class InteriorScene implements Scene {
  touchMode = "walk" as const;
  px = 3 * T; py = 3 * T;
  deck: string[] = DECKS.scout;
  rooms: number[][] = [];
  roomO2: number[] = [];
  msg = ""; msgTimer = 0;
  repairing: { key: string; progress: number } | null = null;
  hurtCd = 0;
  spreadCd = 20;
  talk = "";
  talkTimer = 0;
  banterTimer = 20;
  talkIdx = 0;
  cat = { x: 0, y: 0, tx: 0, ty: 0, pause: 1, sat: false };
  crewPos: { x: number; y: number; tx: number; ty: number; pause: number; goal?: number; path?: { tx: number; ty: number }[] }[] = [];
  // corridor talk: short lines over the crew's heads, and the galley at mess call
  bubbles: { i: number; pax?: string; text: string; life: number }[] = [];
  watch = -1;
  watchTime = 0;
  chatCd = 2;
  messUntil = 0;
  messFed = false;
  lastMessSlot = -1;
  tickChatter(g: Game, p: import("../world").PlayerState, dt: number): void {
    for (const b of this.bubbles) b.life -= dt;
    this.bubbles = this.bubbles.filter((b) => b.life > 0);
    this.chatCd -= dt; if (this.chatCd > 0) return;
    this.chatCd = 2;
    const mess = g.world.time < this.messUntil;
    const rng = new RNG((g.world.seed ^ Math.floor(g.world.time * 7)) >>> 0);
    const free = (i: number) => !this.bubbles.some((b) => b.i === i);
    for (let i = 0; i < p.crew.length; i++) {
      const a = p.crew[i]; const at = this.crewAt(i); if (!at || a.sick || !free(i) || this.bubbles.length >= 2) continue;
      for (let j = 0; j < p.crew.length; j++) {
        if (j === i) continue; const b = p.crew[j]; const bt = this.crewAt(j);
        if (!bt || b.sick || dist(at.x, at.y, bt.x, bt.y) > 18) continue;
        if (rng.chance(mess ? 0.35 : 0.2)) { this.bubbles.push({ i, text: crewChatter(g.world, a, b, rng), life: 4.5 }); break; }
      }
      if (free(i) && (this.crewPos[i]?.pause ?? 0) > 0 && rng.chance(0.03)) { const line = soloChatter(a); if (line) this.bubbles.push({ i, text: line, life: 3 }); }
    }
    // passengers corner whoever's nearest, and get an answer
    for (const m of passengersAboard(p)) {
      const pp = this.paxPos[m.id]; if (!pp || pp.pause <= 0 || this.bubbles.length >= 2 || this.bubbles.some((b) => b.pax === m.id)) continue;
      const j = p.crew.findIndex((c, k) => { const at = this.crewAt(k); return at && !c.sick && dist(at.x, at.y, pp.x, pp.y) < 18; });
      if (j < 0 || !rng.chance(0.2)) continue;
      const q = passengerChatter(m, p.crew[j], rng);
      this.bubbles.push({ i: -1, pax: m.id, text: q.ask, life: 4 });
      if (free(j)) this.bubbles.push({ i: j, text: q.reply, life: 6 });
    }
    // the watch changes: half the crew to their posts, the rest stand down
    const wi = watchIndex(g.world.time);
    if (this.watch !== wi) {
      if (this.watch >= 0 && p.crew.length >= 2) { this.say("WATCH CHANGE"); for (const cp of this.crewPos) if (cp) cp.pause = 0; }
      this.watch = wi;
    }
    // mess call: every so often the crew eat together; eat with them and they notice
    const slot = Math.floor(g.world.time / 300);
    if (slot !== this.lastMessSlot) {
      if (this.lastMessSlot >= 0 && p.crew.filter((c) => !c.sick).length >= 2) { this.messUntil = g.world.time + 45; this.messFed = false; g.toast("MESS CALL - THE CREW HEAD FOR THE GALLEY"); sfx.blip(); }
      this.lastMessSlot = slot;
    }
    if (mess && !this.messFed) {
      const k = nearestTile(this.deck, 0, 0, "K", 1e9);
      if (k && dist(k.tx * T + T / 2, k.ty * T + T / 2, this.px, this.py) < 22) {
        this.messFed = true; p.messes = (p.messes ?? 0) + 1;
        for (const l of passengersFed(p)) g.toast(l);
        for (const c of p.crew) if (!c.sick) c.morale = Math.min(100, c.morale + 1);
        const i = p.crew.findIndex((c) => !c.sick);
        if (i >= 0) this.bubbles.push({ i, text: rng.pick(MESS_LINES), life: 5 });
        const near = p.crew.map((c, ci) => ({ c, at: this.crewAt(ci) })).filter((x) => x.at && !x.c.sick).sort((a, b) => dist(a.at!.x, a.at!.y, this.px, this.py) - dist(b.at!.x, b.at!.y, this.px, this.py))[0];
        const key = near ? `dine:${near.c.name}:${weekKey()}` : "";
        if (near && !(p.flags ?? {})[key]) { (p.flags ??= {})[key] = true; near.c.loyalty = (near.c.loyalty ?? 0) + 0.4; near.c.morale = Math.min(100, near.c.morale + 4); flag(g, "company"); this.say(`YOU EAT WITH THE CREW AND SIT WITH ${near.c.name.split(" ")[0].toUpperCase()}. THEY TALK ABOUT HOME. LOYALTY UP.`); }
        else this.say("YOU EAT WITH THE CREW. MORALE UP.");
      }
    }
  }
  // any other business: one of the staff brings a motion, and the table waits for the captain
  staffMotion(g: Game): void {
    const p = g.world.player; const rng = new RNG(Math.floor(g.world.time * 3) + 5);
    const by = (role: string) => p.crew.find((c) => c.role === role && !c.sick);
    const eng = by("engineer"), med = by("medic"), gun = by("gunner"), pil = by("pilot");
    const motions: { who: import("../data/crew").CrewMember; text: string; yes: (g2: Game) => string; no: (g2: Game) => string }[] = [];
    if (eng) motions.push({ who: eng, text: `${eng.name.split(" ")[0].toUpperCase()} (ENGINES): "I WANT TO RUN THE DRIVE HOT FOR A LEG. TEN PERCENT ON THE FUEL. IT'LL COST US IN WEAR AND I'LL OWN THAT."`, yes: (g2) => { g2.world.player.focus = "helm"; p.wear = (p.wear ?? 0) + 3; eng.morale = Math.min(100, eng.morale + 6); return "GRANTED. THE DRIVE RUNS HOT AND THE ENGINEER RUNS HAPPY. FOCUS: HELM FOR THE LEG; WEAR +3 UP FRONT."; }, no: () => { eng.morale = Math.max(0, eng.morale - 2); return "DENIED. THE ENGINEER NODS LIKE THEY EXPECTED IT AND WRITES SOMETHING DOWN."; } });
    if (med) motions.push({ who: med, text: `${med.name.split(" ")[0].toUpperCase()} (SICKBAY): "THE CREW NEED A REST DAY. NOT A WATCH. A DAY. I'LL SIGN THE ORDER IF YOU WON'T."`, yes: (g2) => { g2.world.time += 3600; for (const c of p.crew) c.morale = Math.min(100, c.morale + 8); return "GRANTED. AN HOUR OF SHIP TIME GOES BY WITH NOBODY ON WATCH BUT THE SHIP. MORALE +8. THE MEDIC LOOKS SMUG, MEDICALLY."; }, no: () => { med.morale = Math.max(0, med.morale - 3); return "DENIED. THE MEDIC SIGNS SOMETHING ANYWAY AND PINS IT TO THE GALLEY DOOR."; } });
    if (gun) motions.push({ who: gun, text: `${gun.name.split(" ")[0].toUpperCase()} (TACTICAL): "LIVE-FIRE DRILL BEFORE THE JUMP. THE CREW HATE IT. THAT'S HOW YOU KNOW IT WORKS."`, yes: (g2) => { const x = crewXp(p, "gunner", 2); for (const c of p.crew) if (c !== gun) c.morale = Math.max(0, c.morale - 2); g2.world.player.focus = "tactical"; return `GRANTED. TWENTY MINUTES OF THE KLAXON AND EVERYBODY'S FIRST NAME. FOCUS: TACTICAL FOR THE LEG. MORALE -2, EXCEPT THE GUNNER'S.${x ? " " + x : ""}`; }, no: () => "DENIED. THE GUNNER SAYS 'NOTED' THE WAY THE OFFICE SAYS IT." });
    if (pil) motions.push({ who: pil, text: `${pil.name.split(" ")[0].toUpperCase()} (HELM): "LET ME TAKE THE LONG WAY ROUND THE STAR ON THE NEXT LEG. THE PASSENGERS PAY FOR THE VIEW AND I NEVER GET TO SEE IT."`, yes: () => { for (const m of passengersAboard(p)) m.mood = Math.min(100, (m.mood ?? 60) + 6); pil.morale = Math.min(100, pil.morale + 8); p.fuel = Math.max(0, p.fuel - 3); return "GRANTED. THREE UNITS OF FUEL FOR A VIEW OF THE STAR NOBODY ON THE BRIDGE WILL FORGET. THE PILOT DOESN'T SAY THANK YOU. THE PILOT HUMS."; }, no: () => { pil.morale = Math.max(0, pil.morale - 2); return "DENIED. THE PILOT FLIES THE SHORT WAY, PRECISELY, WHICH IS ITS OWN COMMENT."; } });
    if (!motions.length) { g.toast("NO OTHER BUSINESS. THE TABLE EMPTIES."); return; }
    const mo = rng.pick(motions); p.briefed = true;
    const enc: Encounter = { id: "motion", where: "space", title: "ANY OTHER BUSINESS", weight: 0, text: mo.text,
      options: [
        { label: "GRANTED", result: (g2) => { flag(g2, "motion"); logEntry(g2.world, `Granted ${mo.who.name}'s motion at the briefing`); return mo.yes(g2); } },
        { label: "DENIED", result: (g2) => mo.no(g2) },
        { label: "TABLE IT. NEXT LEG", hint: "They'll bring it back", result: () => { p.briefed = false; return "TABLED. THEY'LL BRING IT BACK, WORD FOR WORD, AND YOU'LL KNOW BY THEIR FACE."; } },
      ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "interior", true);
  }
  // the captain's table: a mess call with a fare aboard is a dinner, if you ask them
  captainsTable(g: Game, m: import("../world").Mission): void {
    const p = g.world.player; const name = (m.passengerName ?? "THE PASSENGER").toUpperCase(); const kind = m.passengerKind ?? "vip";
    const story: Record<string, string> = {
      vip: "THEY TALK ABOUT THE PORTS THEY OWN A PIECE OF, AND THEN, THREE COURSES IN, ABOUT THE ONE THEY GREW UP ON.",
      refugee: "THEY DON'T TALK MUCH. THEY EAT EVERYTHING, AND THEN THEY TALK ABOUT THE HOUSE. THE CREW GO QUIET AND STAY QUIET.",
      fugitive: "THEY TELL A STORY ABOUT A CARD GAME AND A HARBOURMASTER THAT CAN'T BE TRUE AND IS, AND NOBODY ASKS THE NAMES.",
      tourist: "THEY ASK EVERY CREW MEMBER WHAT THEY DO AND WRITE IT DOWN. THE ENGINEER GETS TWO PAGES.",
      courier: "THEY CHECK THE TIME FOUR TIMES AND THEN, SOMEWHERE IN THE SECOND COURSE, STOP.",
      envoy: "THEY TELL YOU WHAT THE TREATY ACTUALLY SAYS, WHICH IS NOT WHAT EITHER SIDE THINKS IT SAYS, AND THAT THIS IS THE POINT OF TREATIES.",
      patient: "THE MEDIC CUTS THEIR FOOD WITHOUT BEING ASKED AND THEY LET THEM. THEY TALK ABOUT WHAT THEY'LL DO WITH THE HAND WHEN IT'S FIXED.",
      prisoner: "THE GUNNER SITS BESIDE THEM AND THE IRONS STAY ON, AND THEY EAT LIKE SOMEBODY WHO REMEMBERS OTHER TABLES. THEY SAY THANK YOU TO THE COOK, SPECIFICALLY.",
    };
    const enc: Encounter = { id: "captainstable", where: "space", title: "THE CAPTAIN'S TABLE", weight: 0,
      text: `Mess call, and ${m.passengerName ?? "your passenger"} is standing in the galley hatch with a tray, not sure of the rule. There's a chair at your end of the table. There's always a chair.`,
      options: [
        { label: "SIT WITH ME", hint: "Their mood up a lot; the crew hear a story", result: (g2) => { m.dined = true; m.mood = Math.min(100, (m.mood ?? 60) + 12); for (const c of p.crew) c.morale = Math.min(100, c.morale + 2); flag(g2, "captainstable"); logEntry(g2.world, `${m.passengerName ?? "A passenger"} sat at the captain's table`); return `${name} SITS. ${story[kind] ?? story.vip} MOOD UP, THEIRS AND THE TABLE'S.`; } },
        { label: "SIT WITH THE CREW; THEY'RE BETTER COMPANY", hint: "Mood up a little; loyalty up", result: () => { m.dined = true; m.mood = Math.min(100, (m.mood ?? 60) + 4); for (const c of p.crew) c.loyalty = (c.loyalty ?? 0) + 0.1; return `${name} SITS WITH THE CREW AND THE CREW MAKE ROOM, WHICH IS ITS OWN KIND OF WELCOME. YOU EAT AT YOUR END AND LISTEN.`; } },
        { label: "PASSENGERS EAT IN THE LOUNGE", hint: "Mood down; the rule is the rule", result: () => { m.dined = true; m.mood = Math.max(0, (m.mood ?? 60) - 6); return `${name} TAKES THE TRAY BACK TO THE LOUNGE. THE RULE IS THE RULE. THE CREW EAT FASTER THAN USUAL.`; } },
      ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "interior", true);
  }
  // the dedication plaque: four mottos off the yard's list, or your own
  mottoMenu(g: Game): void {
    const p = g.world.player; const rng = new RNG(Math.floor(g.world.time * 7) + 17);
    const rest = [...MOTTOS]; const picks: string[] = [];
    while (picks.length < 4 && rest.length) picks.push(rest.splice(rng.int(0, rest.length - 1), 1)[0]);
    const set = (g2: Game, m: string) => { p.motto = m; flag(g2, "motto"); logEntry(g2.world, `Had the plaque by the airlock engraved: "${m}"`); return `THE YARD'S ENGRAVER TAKES A DAY AND CHARGES NOTHING, WHICH IS HOW YOU KNOW THEY LIKED IT. THE PLAQUE READS: ${dedication(g2.world)}`; };
    const enc: Encounter = { id: "motto", where: "space", title: "THE PLAQUE", text: "A brass plate by the airlock with the name and the registry on it, and a blank line under them that every yard leaves blank on purpose. The engraver's list is pinned beside it, and there's a pencil.",
      weight: 0, options: [
        ...picks.map((m: string) => ({ label: `"${m.toUpperCase()}"`, result: (g2: Game) => set(g2, m) })),
        { label: "WRITE YOUR OWN", hint: "Up to forty characters", result: (g2) => { const m = (ask("The engraver waits with the pencil. What goes on the plaque?", p.motto ?? "") ?? "").trim().slice(0, 40); if (!m) return "THE LINE STAYS BLANK. THE ENGRAVER SAYS THAT'S A CHOICE TOO."; return set(g2, m); } },
        { label: "LEAVE IT BLANK", result: () => "YOU LEAVE IT. THE ENGRAVER NODS LIKE MOST DO." },
      ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "interior", true);
  }
  // card night: once a week the crew deal at the galley table, and the captain is either in or watching
  cardNight(g: Game): void {
    const p = g.world.player; const key = `cards:${weekKey()}`;
    const players = p.crew.filter((c) => !c.sick);
    const shark = [...players].sort((a, b) => b.skill - a.skill)[0];
    const enc: Encounter = { id: "cards", where: "space", title: "CARD NIGHT", weight: 0,
      text: `The galley table's been cleared and somebody's found a deck with the sixes marked. ${players.map((c) => c.name.split(" ")[0]).join(", ")} are already dealt in, and there's a chair with your name on it, or there isn't, depending on what you say next.`,
      options: [
        { label: "DEAL ME IN (50CR STAKE)", hint: "Morale up all round; the pot goes where the skill is", requires: () => p.credits >= 50, result: (g2, rng) => { (p.flags ??= {})[key] = true; p.credits -= 50; for (const c of players) c.morale = Math.min(100, c.morale + 5); const win = rng.chance(0.4); if (win) { p.credits += 50 * players.length; flag(g2, "cards"); logEntry(g2.world, "Card night in the galley; took the pot"); sfx.pickup(); return `YOU TAKE THE POT OFF THE WHOLE TABLE, ${50 * players.length}CR, AND ${shark.name.split(" ")[0].toUpperCase()} WANTS IT NOTED THAT THE SIXES WERE MARKED BEFORE YOU SAT DOWN. MORALE UP. NOBODY MINDS LOSING TO THE CAPTAIN AS MUCH AS THEY SAY.`; } shark.morale = Math.min(100, shark.morale + 5); flag(g2, "cards"); logEntry(g2.world, `Card night in the galley; ${shark.name} took the pot`); return `${shark.name.toUpperCase()} TAKES YOUR FIFTY WITH A FACE LIKE A BULKHEAD AND THEN CAN'T KEEP IT. MORALE UP ALL ROUND, ESPECIALLY THEIRS. THE CREW WILL TELL THIS ONE AT EVERY BAR ON THE LINE.`; } },
        { label: "PLAY FOR MATCHES", hint: "Morale +3; no money on the table", result: (g2) => { (p.flags ??= {})[key] = true; for (const c of players) c.morale = Math.min(100, c.morale + 3); flag(g2, "cards"); logEntry(g2.world, "Card night in the galley, for matches"); return "YOU PLAY FOR MATCHES AND LOSE THEM ALL, AND THE MATCHES ARE THE SHIP'S ANYWAY. MORALE UP. THE HUM GOES ON UNDER THE TABLE TALK LIKE IT'S DEALT IN TOO."; } },
        { label: "WATCH FROM THE HATCH", hint: "They play; you learn who bluffs", result: (g2) => { (p.flags ??= {})[key] = true; for (const c of players) c.morale = Math.min(100, c.morale + 2); const bluffer = [...players].sort((a, b) => (b.loyalty ?? 0) - (a.loyalty ?? 0))[0]; logEntry(g2.world, "Card night in the galley; watched"); return `YOU LEAN IN THE HATCH AND LEARN THAT ${bluffer.name.split(" ")[0].toUpperCase()} BLUFFS WITH THEIR LEFT HAND FLAT ON THE TABLE, AND THAT ${shark.name.split(" ")[0].toUpperCase()} KNOWS IT. MORALE UP. USEFUL, ON A BRIDGE.`; } },
        { label: "NOT TONIGHT. GALLEY'S FOR COOKING", hint: "Cook instead; they'll deal another week", result: (g2) => { const meal = cookMeal(p); if (meal) { for (const l of meal.slice(1)) g2.toast(l); return meal[0]; } return "THE DECK GOES BACK IN THE DRAWER AND THE GALLEY'S EMPTY ANYWAY. BUY PROVISIONS AT A STATION."; } },
      ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "interior", true);
  }
  paxPos: Record<string, { x: number; y: number; tx: number; ty: number; pause: number; path?: { tx: number; ty: number }[] }> = {};
  // passengers stretch their legs: the seat, the galley, the viewport, back to the seat
  wanderPassengers(p: import("../world").PlayerState, dt: number): void {
    const seat = nearestTile(this.deck, 0, 0, "p", 1e9); if (!seat) return;
    const aboard = passengersAboard(p);
    for (const id of Object.keys(this.paxPos)) if (!aboard.some((m) => m.id === id)) delete this.paxPos[id];
    aboard.forEach((m, i) => {
      let pp = this.paxPos[m.id];
      const home = { tx: seat.tx, ty: seat.ty };
      if (!pp) { pp = { x: home.tx * T + T / 2 + ([0, -3, 3][i] ?? 0), y: home.ty * T + T / 2, tx: 0, ty: 0, pause: 8 + Math.random() * 10 }; this.paxPos[m.id] = pp; }
      if (pp.path?.length) {
        const n = pp.path[0]; const nx = n.tx * T + T / 2 + (pp.path.length === 1 ? ([0, -3, 3][i] ?? 0) : 0), ny = n.ty * T + T / 2;
        const d = Math.hypot(nx - pp.x, ny - pp.y);
        if (d < 0.8) { pp.x = nx; pp.y = ny; pp.path.shift(); if (!pp.path.length) pp.pause = 8 + Math.random() * 16; return; }
        const step = Math.min(d, 12 * dt); pp.x += ((nx - pp.x) / d) * step; pp.y += ((ny - pp.y) / d) * step;
        return;
      }
      if (pp.pause > 0) { pp.pause -= dt; return; }
      const goHome = Math.random() < 0.6;
      const dest = goHome ? home : nearestTile(this.deck, pp.x, pp.y, Math.random() < 0.5 ? "K" : "C", 1e9);
      if (dest) {
        const dx = goHome ? 0 : this.tileAt(dest.tx + 1, dest.ty) === "." ? 1 : this.tileAt(dest.tx - 1, dest.ty) === "." ? -1 : 0;
        pp.path = this.findPath(Math.floor(pp.x / T), Math.floor(pp.y / T), dest.tx + dx, dest.ty);
      }
      if (!pp.path?.length) pp.pause = 6 + Math.random() * 8;
    });
  }
  passengerNear(p: import("../world").PlayerState): import("../world").Mission | null {
    for (const m of passengersAboard(p)) { const pp = this.paxPos[m.id]; if (pp && dist(pp.x, pp.y, this.px, this.py) < 16) return m; }
    return null;
  }
  // the comms array: sit with the band a while. The serial, the news, the wire.
  wireItems: import("../core/wire").WireEvent[] = [];
  listenToTheBand(g: Game): void {
    const p = g.world.player; const w = g.world;
    const comms = p.systems.find((s) => s.id === "comms");
    if (comms && comms.health < 40) {
      const enc: Encounter = { id: "band", where: "space", title: "THE BAND", text: "STATIC. THE ARRAY IS TOO DAMAGED TO HOLD A SIGNAL. SOMEWHERE UNDER IT, VERY FAINTLY, SOMEBODY IS SINGING.", weight: 0, options: [{ label: "SWITCH IT OFF", result: () => "" }] };
      (g.scenes["encounter"] as EncounterScene).open(g, enc, "interior", true); return;
    }
    const lines: string[] = [];
    const serial = serialLines(w);
    if (serial) { lines.push(`GALNET SERIAL - ${serial.title}, FROM ${serial.where.toUpperCase()}`); const last = serial.parts[serial.parts.length - 1]; lines.push(last ? `"${last.toUpperCase()}"`.slice(0, 118) : "\"THE FIRST PART IS ON ITS WAY.\""); if (serial.hook) lines.push(`> ${serial.hook.toUpperCase()}`.slice(0, 118)); }
    for (const n of w.news.slice(0, 2)) lines.push(`NEWS: ${n.headline.toUpperCase()}. ${n.body.toUpperCase()}`.slice(0, 118));
    for (const e of this.wireItems.slice(0, 2)) lines.push(`WIRE: ${e.callsign} ${e.text.toUpperCase()} - ${e.system.toUpperCase()} (${wire.ageLabel(e.t)})`.slice(0, 118));
    { const bs = borderStanding(w); if (bs) lines.push(`THE BORDER: ${w.systems[bs.c.systemId]?.name.toUpperCase() ?? "?"} - ${faction(bs.c.incumbent).name.split(" ")[0].toUpperCase()} ${bs.inc} V ${faction(bs.c.challenger).name.split(" ")[0].toUpperCase()} ${bs.chal}`); }
    if (!lines.length) lines.push("A CARRIER WAVE AND NOTHING ON IT. THE STATIONS ARE QUIET TONIGHT.");
    const key = `band:${p.systemId}`;
    const enc: Encounter = { id: "band", where: "space", title: "THE BAND", text: lines.join("\n"), weight: 0, options: [
      { label: "SIT WITH IT A WHILE", result: () => { const first = !(p.flags ?? {})[key]; (p.flags ??= {})[key] = true; flag(g, "band"); if (first) { for (const c of p.crew) c.morale = Math.min(100, c.morale + 2); for (const m of passengersAboard(p)) m.mood = Math.min(100, (m.mood ?? 60) + 2); } return first ? "THE CREW DRIFT IN ONE BY ONE AND STAND IN THE HATCHWAY LISTENING. NOBODY SAYS 'TURN IT UP'. NOBODY HAS TO. MORALE UP." : "YOU'VE HEARD THIS EPISODE. IT'S STILL GOOD."; } },
      { label: "SWITCH IT OFF", result: () => "THE HUM OF THE SHIP COMES BACK. IT WAS THERE ALL ALONG." },
    ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "interior", true);
  }
  // at the top of their trade, they come to you with a choice
  offerSpecialty(g: Game, c: import("../data/crew").CrewMember): void {
    const opts = SPECIALTIES[c.role];
    const enc: Encounter = { id: "specialty", where: "space", title: `${c.name.toUpperCase()} - A TRADE OF THEIR OWN`, weight: 0,
      text: `${c.name.toUpperCase()} HAS BEEN THE BEST ${ROLE_INFO[c.role].label} YOU'VE HAD FOR A WHILE NOW, AND KNOWS IT. 'I'VE BEEN THINKING ABOUT WHAT I'M FOR, SKIPPER. I COULD GO ONE OF TWO WAYS. YOUR CALL. YOU'RE THE ONE WHO HAS TO LIVE WITH IT.'`,
      options: [
        ...opts.map((o) => ({ label: `${o.name} - ${o.desc.toUpperCase()}`, result: () => chooseSpecialty(g.world, c, o.id) ?? "" })),
        { label: "GIVE ME A DAY TO THINK", result: () => `${c.name.toUpperCase()} NODS. 'THE OFFER STANDS.'` },
      ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "interior", true);
  }
  // a hand of cards on an upturned crate: matchsticks, or a round of drinks
  playCards(g: Game, c: import("../data/crew").CrewMember): void {
    const p = g.world.player;
    const others = p.crew.filter((o) => o !== c && !o.sick).slice(0, 2);
    const rng = new RNG((g.world.seed ^ Math.floor(g.world.time * 17)) >>> 0);
    const sharp = !!c.trait?.includes("cards");
    const edge = sharp ? 0.65 : 0.5;
    const seated = [c, ...others];
    const cheer = (n: number) => { for (const o of seated) o.morale = Math.min(100, o.morale + n); c.loyalty = (c.loyalty ?? 0) + 0.25; };
    const enc: Encounter = { id: "cards", where: "space", title: `A HAND OF CARDS WITH ${c.name.toUpperCase()}`, weight: 0,
      text: `${c.name.toUpperCase()} DEALS ON AN UPTURNED CRATE.${others.length ? ` ${others.map((o) => o.name.toUpperCase()).join(" AND ")} PULL${others.length === 1 ? "S" : ""} UP A SEAT.` : ""} ${sharp ? "THEY PLAY FOR MATCHSTICKS. THEY PLAY VERY WELL FOR MATCHSTICKS." : "NOBODY'S VERY GOOD. THAT'S THE POINT."}`,
      options: [
        { label: "MATCHSTICKS", result: () => { const win = rng.chance(1 - edge); cheer(5); flag(g, "cards"); logEntry(g.world, `A hand of cards with ${c.name} after watch`); return win ? `YOU TAKE THE POT: ELEVEN MATCHSTICKS AND ${c.name.toUpperCase()}'S GRUDGING RESPECT. MORALE UP.` : `${c.name.toUpperCase()} CLEANS YOU OUT AND DOESN'T EVEN GLOAT. MUCH. MORALE UP ANYWAY.`; } },
        { label: "A ROUND OF DRINKS (20CR STAKE)", requires: () => p.credits >= 20, result: () => { const win = rng.chance(1 - edge); flag(g, "cards"); if (win) { p.credits += 20; ledger(p, "crew", 20); } else { p.credits -= 20; ledger(p, "crew", -20); } cheer(8); return win ? "YOU WIN THE ROUND AND BUY IT ANYWAY. THE CREW NOTICE. +20CR, MORALE UP." : "YOU LOSE THE ROUND AND PAY FOR IT. THE CREW NOTICE THAT TOO. -20CR, MORALE UP."; } },
        { label: "NOT TONIGHT", result: () => `${c.name.toUpperCase()} SHRUGS AND DEALS ${others.length ? "THE OTHERS IN" : "A PATIENCE HAND"}.` },
      ] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "interior", true);
  }
  // where each crew member is right now: their post, or wandering between the galley, the bunks and the bridge
  crewAt(i: number): { x: number; y: number } | null {
    const sp = this.crewSpots()[i]; if (!sp) return null;
    const c = this.crewPos[i];
    return c ? { x: c.x, y: c.y } : { x: sp.tx * T + T / 2, y: sp.ty * T + T / 2 };
  }
  // Breadth-first path across the deck, door to door. Returns the tiles to walk, goal last.
  findPath(fx: number, fy: number, tx: number, ty: number): { tx: number; ty: number }[] {
    if (fx === tx && fy === ty) return [];
    const w = this.deck[0].length, h = this.deck.length;
    const prev = new Int32Array(w * h).fill(-1);
    const q: number[] = [fy * w + fx]; prev[fy * w + fx] = fy * w + fx;
    for (let qi = 0; qi < q.length && qi < 4000; qi++) {
      const cur = q[qi]; const cx = cur % w, cy = Math.floor(cur / w);
      if (cx === tx && cy === ty) {
        const path: { tx: number; ty: number }[] = [];
        for (let n = cur; n !== fy * w + fx; n = prev[n]) path.push({ tx: n % w, ty: Math.floor(n / w) });
        return path.reverse();
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx; if (prev[ni] !== -1 || this.solid(nx, ny)) continue;
        prev[ni] = cur; q.push(ni);
      }
    }
    return [];
  }
  // floor tiles around the galley: a table's worth of places to sit
  seatsAround(t: { tx: number; ty: number }): { tx: number; ty: number }[] {
    const out = [t, { tx: t.tx + 1, ty: t.ty }, { tx: t.tx - 1, ty: t.ty }, { tx: t.tx, ty: t.ty + 1 }, { tx: t.tx, ty: t.ty - 1 }, { tx: t.tx + 1, ty: t.ty + 1 }];
    return out.filter((s) => !this.solid(s.tx, s.ty) && this.tileAt(s.tx, s.ty) !== "D");
  }
  wanderCrew(p: import("../world").PlayerState, dt: number, mess = false): void {
    const spots = this.crewSpots();
    const galley = mess ? nearestTile(this.deck, 0, 0, "K", 1e9) : null;
    const seats = galley ? this.seatsAround(galley) : [];
    p.crew.forEach((c, i) => {
      const sp = spots[i]; if (!sp) return;
      let cp = this.crewPos[i];
      if (!cp) { cp = { x: sp.tx * T + T / 2, y: sp.ty * T + T / 2, tx: sp.tx * T + T / 2, ty: sp.ty * T + T / 2, pause: 3 + Math.random() * 6 }; this.crewPos[i] = cp; }
      const setGoal = (tx: number, ty: number) => { const key = tx * 1000 + ty; if (cp.goal !== key) { cp.goal = key; cp.path = this.findPath(Math.floor(cp.x / T), Math.floor(cp.y / T), tx, ty); } };
      if (c.sick) setGoal(sp.tx, sp.ty); // the sick stay in their bunks
      else if (galley && seats.length) { const st = seats[i % seats.length]; setGoal(st.tx, st.ty); if (cp.path?.length) cp.pause = 0; }
      // walk the path, one tile at a time
      if (cp.path?.length) {
        const n = cp.path[0]; const nx = n.tx * T + T / 2, ny = n.ty * T + T / 2; cp.tx = nx; cp.ty = ny;
        const d = Math.hypot(nx - cp.x, ny - cp.y);
        if (d < 0.8) { cp.x = nx; cp.y = ny; cp.path.shift(); if (!cp.path.length) cp.pause = galley ? 0.5 : 6 + Math.random() * 14; return; }
        const step = Math.min(d, 16 * dt); cp.x += ((nx - cp.x) / d) * step; cp.y += ((ny - cp.y) / d) * step;
        return;
      }
      if (galley || c.sick) return; // seated, or laid up
      if (cp.pause > 0) { cp.pause -= dt; return; }
      // on watch: the post for your role, mostly. Off watch: bunk, galley, a look out of the cockpit.
      const watch = onWatch(p, i, this.watchTime);
      const post = c.role === "engineer" ? (Math.random() < 0.5 ? "E" : "R") : c.role === "gunner" ? "W" : c.role === "pilot" ? "C" : "S";
      const goHome = Math.random() < (watch ? 0.25 : 0.5);
      const dest = goHome ? sp : nearestTile(this.deck, cp.x, cp.y, watch ? (Math.random() < 0.7 ? post : "C") : (Math.random() < 0.5 ? "K" : Math.random() < 0.5 ? "B" : "C"), 1e9) ?? nearestTile(this.deck, cp.x, cp.y, "K", 1e9);
      if (dest) {
        const dx = goHome ? 0 : this.tileAt(dest.tx + 1, dest.ty) === "." ? 1 : this.tileAt(dest.tx - 1, dest.ty) === "." ? -1 : 0;
        setGoal(dest.tx + dx, dest.ty);
      }
      if (!cp.path?.length) cp.pause = 4 + Math.random() * 6;
    });
  }

  enter(g: Game): void {
    const p = g.world.player;
    this.bubbles = []; this.lastMessSlot = Math.floor(g.world.time / 300); this.watch = watchIndex(g.world.time);
    if (g.world.realGalaxy) void wire.fetchWire().then((e) => { this.wireItems = e; });
    for (const l of birthdaysDue(g.world)) g.toast(l);
    this.deck = DECKS[hull(p.hullId).deck];
    this.rooms = computeRooms(this.deck, (ch) => ch !== "#");
    const nRooms = Math.max(...this.rooms.flat()) + 1;
    this.roomO2 = Array(nRooms).fill(100);
    // spawn near cockpit
    const c = nearestTile(this.deck, 0, 0, "C", 1e9)!;
    this.px = c.tx * T - T; this.py = c.ty * T + T / 2;
    this.msg = "YOUR SHIP. WASD WALK - E INTERACT - V LOOK OUT";
    this.msgTimer = 4;
    this.repairing = null;
    g.showHint("interior", "DAMAGED PANELS BLINK RED - HOLD E TO REPAIR (SPARE PARTS FOR HEAVY DAMAGE)");
  }

  tileAt(tx: number, ty: number): string {
    if (ty < 0 || ty >= this.deck.length || tx < 0 || tx >= this.deck[0].length) return "#";
    return this.deck[ty][tx];
  }

  solid(tx: number, ty: number): boolean {
    const ch = this.tileAt(tx, ty);
    if (ch === "#") return true;
    return ch !== "." && ch !== "D" && ch !== "c" && ch !== "p" && PANELS.some((p) => p.ch === ch);
  }

  readWall(g: Game): void {
    const p = g.world.player;
    const hours = Math.floor(g.world.time / 3600), mins = Math.floor((g.world.time % 3600) / 60);
    const lines = [
      `${(p.shipName ?? hull(p.hullId).name).toUpperCase()} - ${hours}H ${mins}M UNDER WAY`,
      `RESCUES ${p.rescues ?? 0}   REPAIRS ${p.repairs ?? 0}   TOWS ${p.tows ?? 0}   LIVES SAVED ${p.lives ?? 0}   RESCUER: ${rankOf(p, "rescuer").title} (${rescuePoints(p)})`,
      `EXPLORER ${rankOf(p, "explorer").title}   TRADER ${rankOf(p, "trader").title}   MINER ${rankOf(p, "miner").title}`,
      `FIRST DISCOVERIES ${Object.values(p.firsts ?? {}).filter((c) => c).length}   CODEX ${Object.keys(p.codex ?? {}).length}   CLAIMS ${(p.homesteads ?? []).length}   ACHIEVEMENTS ${(p.achievements ?? []).length}/${ACHIEVEMENTS.length}`,
      `${p.flags?.theSignal ? "THE SIGNAL: ANSWERED." : (p.story ?? 0) > 0 && (p.story ?? 0) < STORY_LEN ? `THE SIGNAL: STAGE ${(p.story ?? 0) + 1} OF ${STORY_LEN}` : "THE SIGNAL: NOT YET HEARD."}   ${p.flags?.convoyDone ? "THE CONVOY: SETTLED." : (p.story2 ?? -1) >= 0 ? "THE CONVOY: OPEN." : "THE CONVOY: NOT YET."}   ${p.flags?.keeperDone ? `THE KEEPER: ${(p.codex ?? {})["wonder:The Crossing"] ? "THE CROSSING LOGGED " + (p.codex ?? {})["wonder:The Crossing"] + "X." : "DECIDED."}` : (p.story3 ?? -1) >= 0 ? "THE KEEPER: THE LIGHT WAITS." : "THE KEEPER: NOT YET."}`,
      `WEAR ${Math.round(p.wear ?? 0)}%   YARD SERVICES ${(p.berthLog ?? []).length}${p.berthLog?.length ? `, LAST AT ${(findStation(g.world, p.berthLog[p.berthLog.length - 1].stationId)?.st.name ?? "A YARD").toUpperCase()}` : ""}`,
      (p.alumni ?? []).length ? `SERVED AND WENT HOME: ${(p.alumni ?? []).slice(-4).map((a) => `${a.name.toUpperCase()} (${roleLabel(a.role)}, ${a.docks})`).join(", ")}` : "NOBODY HAS RETIRED FROM THIS SHIP YET.",
      p.log?.length ? `LAST ENTRY: ${p.log[p.log.length - 1].text.toUpperCase()}` : "THE LOG IS EMPTY.",
    ];
    if (p.lineage?.length) lines.push(`CAPTAINS BEFORE YOU: ${p.lineage.slice(-3).map((c) => c.name.toUpperCase()).join(", ")}${p.captainName ? `. NOW: ${p.captainName.toUpperCase()}` : ""}`);
    if (p.hullHistory) lines.push(`THIS HULL WAS ${p.hullHistory.previous.toUpperCase()}'S. THEY LEFT ${p.hullHistory.quirk.toUpperCase()}.`);
    { const nick = captainNickname(g.world); if (nick) lines.push(`THE LANES CALL THIS SHIP'S CAPTAIN ${nick}.`); }
    { const bests = Object.entries(p.raceBest ?? {}).slice(0, 3).map(([id, t]) => `${(findStation(g.world, id)?.st.name ?? "?").toUpperCase()} ${t.toFixed(1)}S`); if (bests.length || p.regatta === 3) lines.push(`${p.regatta === 3 ? "REGATTA CHAMPION. " : ""}${bests.length ? `RING TIMES: ${bests.join(", ")}` : ""}`.trim()); }
    lines.push(`PLAQUE: ${dedication(g.world)}`.slice(0, 118));
    if (p.keepsakes?.length) lines.push(`KEPT ABOARD: ${p.keepsakes.slice(-4).map((k) => k.toUpperCase()).join("; ")}`.slice(0, 118));
    if (p.lost?.length) lines.push(`LOST WITH THEIR SHIP: ${p.lost.slice(-4).map((l) => `${l.name.toUpperCase()} (${l.role.toUpperCase()}, OFF ${l.where.toUpperCase()})`).join("; ")}`.slice(0, 118));
    if (p.wrecksOfMine?.length) lines.push(`${p.wrecksOfMine.length} SHIP${p.wrecksOfMine.length > 1 ? "S" : ""} OF YOURS STILL OUT THERE, WHERE ${p.wrecksOfMine.length > 1 ? "THEY" : "IT"} FELL.`);
    if (isOccasion("remembrance")) lines.push(`REMEMBRANCE: ${[...(p.lost ?? []).map((l) => l.name), ...(p.alumni ?? []).map((a) => a.name), ...(p.lineage ?? []).map((c) => c.name)].slice(-5).map((n) => n.toUpperCase()).join(", ") || "NO NAMES YET. GIVE IT TIME."}`);
    const opts: Encounter["options"] = [{ label: "CLOSE", result: () => "" }];
    if (!p.voiceName) opts.push({ label: "ASK THE SHIP WHAT IT WANTS TO BE CALLED", hint: "It has had a name for a while. Nobody asked.", result: (g2) => { const name = ask("The band goes quiet. The ship spells something, slowly, letter by letter. What did it say?", ""); if (!name) return "THE BAND STAYS QUIET. ANOTHER TIME."; const l = nameTheShip(g2.world, name); if (g2.world.player.voiceName) { flag(g2, "shipnamed"); sfx.select(); } return l; } });
    else lines.push(`THE SHIP CALLS ITSELF ${p.voiceName.toUpperCase()}. IT SIGNS ITS LINES THAT WAY NOW.`);
    if (p.flags?.shipCrew) { const wear = Math.round(p.wear ?? 0); const verdict = wear > 70 ? "YOU RUN ME HARD. I'D LIKE THAT NOTED, AND A YARD." : (p.rescues ?? 0) > (p.kills ?? 0) ? "MORE PEOPLE PULLED OUT THAN PUT DOWN. I'M PROUD OF THAT. I'M ALLOWED." : (p.kills ?? 0) >= 25 ? "YOU FIGHT WELL. I WISH YOU DIDN'T HAVE TO. I'M GLAD IT'S YOU." : "STEADY HANDS, MOST DAYS. THE OTHER DAYS I DON'T MENTION."; lines.push(`THE SHIP'S REVIEW OF THE CAPTAIN: "${verdict}"`); }
    opts.push({ label: "DICTATE A LOG ENTRY", hint: "Personal log, in your own words; it goes in the record", result: (g2) => { const t = (ask("Captain's personal log. Say it plainly; the ship writes it down.", "") ?? "").trim().slice(0, 96); if (!t) return "THE SHIP WAITS. YOU DON'T SAY ANYTHING. IT LOGS THE SILENCE, WHICH IS ALSO A KIND OF ENTRY."; logEntry(g2.world, `Personal log: ${t}`); flag(g2, "dictated"); return `LOGGED, STARDATE ${stardate(g2.world)}. THE SHIP READS IT BACK IN YOUR OWN WORDS, WHICH IS ALWAYS A LITTLE WORSE THAN YOU REMEMBER SAYING IT.`; } });
    opts.push({ label: p.motto ? "CHANGE THE MOTTO ON THE PLAQUE" : "CHOOSE A MOTTO FOR THE PLAQUE", hint: "Every ship gets a line by the airlock. Most captains never pick it.", result: (g2) => { this.mottoMenu(g2); return ""; } });
    const why = canRetireCaptain(g.world);
    if (!why) opts.push({ label: "RETIRE THIS CAPTAIN...", hint: "Hand the ship on; the galaxy carries on", result: (g2) => { this.retireMenu(g2); return ""; } });
    else if (g.world.time >= RETIRE_AFTER / 2) opts.push({ label: "RETIRE THIS CAPTAIN", hint: why, result: () => why });
    const enc: Encounter = { id: "wall", where: "space", title: "WALL OF RECORD", text: lines.join("\n"), weight: 0, options: opts };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "interior", true);
  }

  // Who takes the chair? A crew member, with their skill in your hands, or nobody in particular.
  retireMenu(g: Game): void {
    const p = g.world.player;
    const st = findStation(g.world, p.dockedAt ?? "")?.st;
    const me = (p.captainName ?? wire.getCallsign() ?? "THE CAPTAIN").toUpperCase();
    const opts: Encounter["options"] = [];
    for (const c of p.crew.slice(0, 3)) {
      opts.push({ label: `HAND THE SHIP TO ${c.name.toUpperCase()} (${ROLE_INFO[c.role].label}, SKILL ${c.skill})`, hint: c.role === "pilot" ? "Their piloting becomes yours" : c.role === "engineer" ? "Their engineering becomes yours" : "A steady hand", result: (g2) => {
        const cap = retireCaptain(g2.world, me, c);
        void wire.post("achievement", `retired and handed ${g2.world.player.shipName ?? "the ship"} to ${c.name}`, st?.name ?? "");
        return `${me} SIGNS THE SHIP OVER AT ${(st?.name ?? "THE DOCK").toUpperCase()} AND WALKS DOWN THE RAMP WITH ${cap.credits - g2.world.player.credits}CR OF PENSION. ${c.name.toUpperCase()} SITS IN THE CHAIR. IT CREAKS THE SAME WAY.`;
      } });
    }
    opts.push({ label: "RETIRE AND LET THE YARD FIND A NEW CAPTAIN", hint: "You start over in the same ship, same galaxy", result: (g2) => { const cap = retireCaptain(g2.world, me, null); return `${me} LEAVES ${cap.credits - g2.world.player.credits}CR RICHER AND THE SHIP POORER. A NEW NAME GOES ON THE MANIFEST. THE GALAXY DOESN'T BLINK.`; } });
    opts.push({ label: "NOT YET", result: () => "THE WALL WAITS. IT'S GOOD AT THAT." });
    const enc: Encounter = { id: "retire", where: "space", title: "THE CHAIR", text: `RETIRING MEANS: SIXTY PERCENT OF THE CREDITS GO WITH YOU AS A PENSION. OPEN CONTRACTS ARE HANDED BACK. STANDINGS HALVE. THE SHIP, ITS MODULES, ITS WALL, ITS CREW, YOUR STRUCTURES AND EVERYONE YOU EVER FLEW WITH STAY IN THE GALAXY. YOUR NAME GOES ON THE WALL AND ${st ? st.name.toUpperCase() + "'S PROMENADE" : "A PROMENADE"}.`, weight: 0, options: opts };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "interior", true);
  }

  say(m: string): void { this.msg = m; this.msgTimer = 3; }

  crewSpots(): { tx: number; ty: number }[] {
    const out: { tx: number; ty: number }[] = [];
    for (let ty = 0; ty < this.deck.length; ty++) for (let tx = 0; tx < this.deck[0].length; tx++) if (this.deck[ty][tx] === "c") out.push({ tx, ty });
    return out;
  }

  update(g: Game, dt: number): void {
    music.setMood("ship", g.world.player.fires.length ? 0.4 : 0);
    const inp = g.input;
    const p = g.world.player;
    if (inp.wasPressed("Escape") || inp.wasPressed("i")) { g.setScene("flight"); return; }
    if (inp.wasPressed("v")) { g.setScene("vista"); return; }
    if (inp.wasPressed("r")) { g.settingsReturn = "interior"; g.setScene("roster"); return; }
    if (inp.wasPressed("F5")) g.save();
    const moved = moveWalker(g, this, dt, (tx, ty) => this.solid(tx, ty));
    if (moved) this.repairing = null;
    const ptx = Math.floor(this.px / T), pty = Math.floor(this.py / T);
    const room = this.rooms[pty]?.[ptx] ?? -1;

    // ---- hazards: breaches drain the room's air, fires hurt and spread
    for (const b of p.breaches) {
      const r = this.rooms[b.ty]?.[b.tx] ?? -1;
      if (r >= 0) this.roomO2[r] = Math.max(0, this.roomO2[r] - dt * 5);
    }
    for (let i = 0; i < this.roomO2.length; i++) {
      if (!p.breaches.some((b) => (this.rooms[b.ty]?.[b.tx] ?? -1) === i)) this.roomO2[i] = Math.min(100, this.roomO2[i] + dt * 3);
    }
    if (room >= 0 && this.roomO2[room] < 20) {
      p.oxygen = Math.max(0, p.oxygen - dt * 6);
      if (p.oxygen <= 0) p.hull = Math.max(1, p.hull - dt * 3);
    }
    this.hurtCd -= dt;
    if (p.fires.some((f) => f.tx === ptx && f.ty === pty) && this.hurtCd <= 0) {
      this.hurtCd = 0.5; p.hull = Math.max(1, p.hull - 3); this.say("FIRE! GET CLEAR OR PUT IT OUT"); sfx.hit();
    }
    this.spreadCd -= dt;
    if (this.spreadCd <= 0) {
      this.spreadCd = 20;
      if (p.fires.length && p.fires.length < 8) {
        const f = p.fires[Math.floor(Math.random() * p.fires.length)];
        const nx = f.tx + (Math.random() < 0.5 ? 1 : -1);
        if (!this.solid(nx, f.ty) && this.tileAt(nx, f.ty) !== "D" && !p.fires.some((x) => x.tx === nx && x.ty === f.ty)) p.fires.push({ tx: nx, ty: f.ty });
        const sys = p.systems[Math.floor(Math.random() * p.systems.length)];
        sys.health = Math.max(0, sys.health - 5);
      }
    }
    // engineer crew quietly patches things while you're aboard
    const eng = crewBonus(p, "engineer");
    if (eng > 0) for (const s of p.systems) if (s.health < 100) s.health = Math.min(100, s.health + dt * 0.4 * eng);

    const near = nearestTile(this.deck, this.px, this.py, "CELRWGMBKSHp");
    const fire = p.fires.find((f) => dist(f.tx * T + T / 2, f.ty * T + T / 2, this.px, this.py) < 16);
    const breach = p.breaches.find((b) => dist(b.tx * T + T / 2, b.ty * T + T / 2, this.px, this.py) < 16);
    this.watchTime = g.world.time;
    this.wanderCrew(p, dt, g.world.time < this.messUntil);
    this.wanderPassengers(p, dt);
    this.tickChatter(g, p, dt);
    const crewNear = p.crew.map((c, i) => ({ c, spot: this.crewSpots()[i], at: this.crewAt(i) })).find((x) => x.at && dist(x.at.x, x.at.y, this.px, this.py) < 16);
    if (inp.wasPressed("c") && crewNear && !crewNear.c.sick) { this.playCards(g, crewNear.c); return; }
    const passenger = p.missions.find((m) => m.kind === "passenger" && m.accepted && !m.done);
    const pSpot = nearestTile(this.deck, this.px, this.py, "p");
    const repairSpeed = 1.2 / (1 + eng * 0.5 + (p.skills.engineering ?? 0) * 0.05);

    // ---- hold E: repair panel / seal breach / extinguish fire
    if (inp.isDown("e") && (fire || breach || (near && PANELS.find((x) => x.ch === near.ch)?.sysId))) {
      const key = fire ? `fire${fire.tx},${fire.ty}` : breach ? `br${breach.tx},${breach.ty}` : `sys${near!.ch}`;
      const def = near ? PANELS.find((x) => x.ch === near.ch) : undefined;
      const sys = def?.sysId ? p.systems.find((s) => s.id === def.sysId) : undefined;
      const doable = fire || (breach && (p.cargo.parts ?? 0) > 0) || (sys && sys.health < 100 && ((p.cargo.parts ?? 0) > 0 || sys.health >= 60));
      if (doable) {
        if (!this.repairing || this.repairing.key !== key) this.repairing = { key, progress: 0 };
        this.repairing.progress += dt;
        if (this.repairing.progress >= repairSpeed) {
          this.repairing.progress = 0;
          if (fire) { p.fires = p.fires.filter((f) => f !== fire); this.say("FIRE OUT"); sfx.repair(); }
          else if (breach) { removeCargo(p, "parts", 1); p.breaches = p.breaches.filter((b) => b !== breach); this.say("BREACH SEALED"); sfx.repair(); }
          else if (sys) {
            if (sys.health < 60 && !removeCargo(p, "parts", 1)) { this.say("NEED SPARE PARTS"); this.repairing = null; return; }
            sys.health = Math.min(100, sys.health + 20);
            p.skills.engineering = Math.min(10, (p.skills.engineering ?? 0) + 0.1);
            { const up = crewXp(p, "engineer"); if (up) g.toast(up); }
            sfx.repair();
            this.say(`${sys.name.toUpperCase()} AT ${Math.round(sys.health)}%`);
          }
        }
      } else if (breach) this.say("NEED SPARE PARTS TO SEAL A BREACH");
      else if (sys && sys.health < 60) this.say("NEED SPARE PARTS FOR MAJOR REPAIRS");
    } else this.repairing = null;

    // ---- tap E: verbs
    if (inp.wasPressed("e") && dist(1 * T + T / 2, 1 * T + T / 2, this.px, this.py) < 14) { this.readWall(g); return; }
    const catNear = !!p.cat && !p.catAway && dist(this.cat.x, this.cat.y, this.px, this.py) < 14;
    if (inp.wasPressed("e") && catNear && !crewNear && !fire && !breach) {
      const lines = [`${p.cat!.name.toUpperCase()} PURRS LIKE A SMALL REACTOR.`, `${p.cat!.name.toUpperCase()} ALLOWS ONE PAT. EXACTLY ONE.`, `${p.cat!.name.toUpperCase()} LOOKS AT YOU, THEN AT THE GALLEY, THEN AT YOU.`, `${p.cat!.name.toUpperCase()} IS ASLEEP ON THE WARM BIT. THE WARM BIT IS THE REACTOR HOUSING.`];
      this.talk = lines[Math.floor(Math.random() * lines.length)]; this.talkTimer = 4;
      for (const c of p.crew) c.morale = Math.min(100, c.morale + 1);
      this.cat.pause = 3;
      sfx.purr();
    } else if (inp.wasPressed("e")) {
      if (crewNear && crewNear.c.skill >= 3 && !crewNear.c.specialty && !crewNear.c.sick) { this.offerSpecialty(g, crewNear.c); return; }
      if (crewNear) {
        const c = crewNear.c;
        const couns = p.crew.find((o) => o !== c && o.specialty === "counsellor" && !o.sick);
        if (couns && !c.sick && c.morale < 60 && !c.counselled) {
          c.counselled = true; c.morale = Math.min(100, c.morale + 6);
          this.say(`${couns.name.split(" ")[0].toUpperCase()} TAKES ${c.name.split(" ")[0].toUpperCase()} INTO THE STUDY FOR TWENTY MINUTES. NOBODY SAYS WHAT WAS SAID. MORALE +6.`); sfx.select();
          return;
        }
        const pool = c.morale >= 65 ? CREW_LINES[c.role].high : c.morale >= 30 ? CREW_LINES[c.role].mid : CREW_LINES[c.role].low;
        const ask = c.request ? (c.request.kind === "visit" ? " ...and about that stop I asked for." : c.request.kind === "goods" ? " ...and the list is still by the airlock." : " ...and the letter's still in your locker.") : "";
        const friend = p.crew.find((o) => o !== c && bond(c, o) >= 2), foe = p.crew.find((o) => o !== c && bond(c, o) <= -2);
        const arcNote = c.arc && !c.arc.done ? " ...and thank you. For the other thing." : "";
        const bondNote = (foe ? ` ...and keep ${foe.name} out of my engine room.` : friend ? ` ...${friend.name} and I have a bet on the next gate.` : "") + arcNote;
        const line = c.sick ? `(${c.sick.kind}, laid up) ${["Don't come too close, Captain.", "I'll be fine. Give me a day.", "The med bay's colder than the hold."][Math.floor(Math.random() * 3)]}`
          : Math.random() < 0.25 && c.trait ? `(${c.trait}) ${pool[Math.floor(Math.random() * pool.length)]}` : pool[Math.floor(Math.random() * pool.length)];
        this.talk = `${c.name.toUpperCase()} (${ROLE_INFO[c.role].label}, SKILL ${c.skill}, MORALE ${Math.round(c.morale)}${(c.loyalty ?? 0) >= 2 ? ", LOYAL" : ""}, ${c.docks ?? 0} DOCKINGS): ${line}${ask}${bondNote}`;
        this.talkTimer = 5;
        c.morale = Math.min(100, c.morale + 1);
      } else if (passenger && this.passengerNear(p)) {
        // whoever you're standing beside
        const px = this.passengerNear(p)!;
        const mood = px.mood ?? 60;
        const lines = PASSENGER_LINES[px.passengerKind ?? "vip"] ?? PASSENGER_LINES.vip;
        const messOn = g.world.time < this.messUntil;
        if (messOn && !px.dined) { this.captainsTable(g, px); return; }
        const pool = mood >= 75 ? lines.high : mood >= 35 ? lines.mid : lines.low;
        const want = px.demand ? ` ...${commodity(px.demand).name} would make the trip, if you see any.` : px.passengerKind === "tourist" && !px.sightSeen ? " ...and when do we see it?" : "";
        this.talk = `${px.passengerName!.toUpperCase()}${(px.party ?? 1) > 1 ? ` (+${(px.party ?? 1) - 1})` : ""} (MOOD ${Math.round(mood)}): ${pool[Math.floor(Math.random() * pool.length)]}${want}`;
        px.mood = Math.min(100, mood + 2);
        this.talkTimer = 5;
      } else if (near && !fire && !breach) {
        if (near.ch === "C") { g.setScene("flight"); return; }
        if (near.ch === "B") {
          // sleep: skip a minute of world time, fully restore
          for (let i = 0; i < 60; i++) tickWorld(g.world, 1);
          g.world.time += 60;
          p.oxygen = p.oxygenMax; p.shield = p.shieldMax;
          p.hull = Math.min(p.hullMax, p.hull + 10);
          for (const c of p.crew) c.morale = Math.min(100, c.morale + 5);
          this.say("YOU SLEEP. 60S PASS. +10 HULL, SHIELDS AND O2 RESTORED");
        } else if (near.ch === "K" && p.crew.filter((c) => !c.sick).length >= 2 && !(p.flags ?? {})[`cards:${weekKey()}`]) {
          this.cardNight(g);
          return;
        } else if (near.ch === "K") {
          const meal = cookMeal(p);
          if (meal) { this.say(meal[0]); for (const l of meal.slice(1)) g.toast(l); }
          else this.say("GALLEY'S EMPTY. BUY PROVISIONS AT A STATION");
        } else if (near.ch === "M") {
          this.listenToTheBand(g);
          return;
        } else if (near.ch === "p" && !this.passengerNear(p)) {
          const book = (p.guestbook ?? []).slice(-4).reverse();
          const left = [...(p.lostProperty ?? []).map((it) => `${it.name.toUpperCase().split(",")[0]} (${it.owner.toUpperCase()}'S)`), ...(p.keepsakes ?? []).slice(-2).map((k) => k.toUpperCase().split(",")[0] + " (OURS NOW)")];
          this.talk = left.length ? `ON THE SEAT: ${left.join(", ")}. ${(p.lostProperty ?? []).length ? "THE HARBOUR OFFICE TAKES LOST PROPERTY." : "THE GUESTBOOK IS UNDERNEATH."}`.slice(0, 200) : book.length ? `THE GUESTBOOK: ${book.map((e) => `${e.name.toUpperCase()}: "${e.line.toUpperCase()}"`).join("  ")}`.slice(0, 200) : "THE GUESTBOOK IS OPEN ON THE SEAT, BLANK BUT FOR THE SHIP'S NAME. THE LOUNGE AT ANY STATION HAS PEOPLE WHO'D SIGN IT.";
          this.talkTimer = 7;
        } else if (near.ch === "H") {
          const n = hull(p.hullId).drones ?? 0;
          this.say(n ? `HANGAR: ${n} ESCORT DRONES RACKED. THEY LAUNCH WITH YOU AND RE-ARM AT DOCK.` : "HANGAR: EMPTY RACKS");
        } else if (near.ch === "S" && p.crew.length >= 2 && !p.briefed) {
          // senior staff: reports round the table, then a focus for the leg
          const enc: Encounter = { id: "briefing", where: "space", title: "SENIOR STAFF BRIEFING", weight: 0, text: briefingReports(g.world).join("\n"),
            options: [
              { label: "FOCUS: ENGINES", hint: "Wear accrues 20% slower until the next dock", result: (g2) => { sfx.select(); flag(g2, "briefing"); return setFocus(g2.world, "engines"); } },
              { label: "FOCUS: SICKBAY", hint: "Morale +4 now; the sick mend twice as fast", result: (g2) => { sfx.select(); flag(g2, "briefing"); return setFocus(g2.world, "sickbay"); } },
              { label: "FOCUS: TACTICAL", hint: "Shields recharge half again as fast", result: (g2) => { sfx.select(); flag(g2, "briefing"); return setFocus(g2.world, "tactical"); } },
              { label: "FOCUS: HELM", hint: "The next jumps cost 10% less fuel", result: (g2) => { sfx.select(); flag(g2, "briefing"); return setFocus(g2.world, "helm"); } },
              { label: "NO CHANGES. STUDY INSTEAD", result: (g2) => { g2.world.player.briefed = true; return "YOU THANK THEM AND LET THEM GO. THE STUDY IS QUIET AGAIN; E TO READ."; } },
              { label: "ANY OTHER BUSINESS?", hint: "Somebody always has a motion", result: (g2) => { this.staffMotion(g2); return ""; } },
            ] };
          (g.scenes["encounter"] as EncounterScene).open(g, enc, "interior", true);
          return;
        } else if (near.ch === "S" && (p.furnishings ?? []).includes("simrig") && !p.simUsed) {
          const enc: Encounter = { id: "simrig", where: "space", title: "THE SIM RIG", weight: 0, text: "The rig hums up. A menu on the door, hand-lettered, with a warning under it in a different hand: 'IF IT JAMS, DON'T PANIC. PANIC IS A PROGRAM.'",
            options: [
              ...SIM_PROGRAMS.map((sp) => ({ label: sp.name, hint: sp.blurb, result: (g2: Game, rng: RNG) => { sfx.select(); flag(g2, "holiday"); return runSim(g2.world, sp.id, rng); } })),
              { label: "NOT NOW. STUDY INSTEAD", result: (g2) => { g2.world.player.simUsed = true; return "THE RIG HUMS DOWN, DISAPPOINTED. E TO READ."; } },
            ] };
          (g.scenes["encounter"] as EncounterScene).open(g, enc, "interior", true);
          return;
        } else if (near.ch === "S") {
          const which = (p.skills.piloting ?? 0) <= (p.skills.engineering ?? 0) ? "piloting" : "engineering";
          p.skills[which] = Math.min(10, (p.skills[which] ?? 0) + 0.5);
          this.say(`STUDIED ${which.toUpperCase()}: NOW ${p.skills[which].toFixed(1)}/10`);
          sfx.select();
        } else {
          const def = PANELS.find((x) => x.ch === near.ch);
          const sys = def?.sysId ? p.systems.find((s) => s.id === def.sysId) : undefined;
          if (sys && sys.health >= 100) this.say(`${sys.name.toUpperCase()}: NOMINAL`);
        }
      }
    }
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.msg = ""; }
    if (this.talkTimer > 0) { this.talkTimer -= dt; if (this.talkTimer <= 0) this.talk = ""; }
    // the cat goes where it likes, mostly the console and the galley
    if (p.cat) {
      const c = this.cat;
      if (c.x === 0 && c.y === 0) { const k = nearestTile(this.deck, 0, 0, "K", 1e9); c.x = c.tx = (k ? k.tx : 2) * T + T / 2; c.y = c.ty = (k ? k.ty : 2) * T + T / 2; }
      if (c.pause > 0) c.pause -= dt;
      else {
        const d = Math.hypot(c.tx - c.x, c.ty - c.y);
        if (d < 1.5) {
          c.pause = 4 + Math.random() * 10;
          const favourite = Math.random() < 0.5 ? nearestTile(this.deck, this.px, this.py, "CKRB", 1e9) : null;
          const spot = favourite ?? { tx: 1 + Math.floor(Math.random() * (this.deck[0].length - 2)), ty: 1 + Math.floor(Math.random() * (this.deck.length - 2)) };
          const ch = this.tileAt(spot.tx, spot.ty);
          if (ch === "." || ch === "c" || ch === "p" || favourite) { c.tx = spot.tx * T + T / 2; c.ty = spot.ty * T + T / 2 + (favourite ? 6 : 0); }
        } else { const step = 18 * dt; const nx = c.x + ((c.tx - c.x) / d) * step, ny = c.y + ((c.ty - c.y) / d) * step; if (!this.solid(Math.floor(nx / T), Math.floor(ny / T))) { c.x = nx; c.y = ny; } else { c.tx = c.x; c.ty = c.y; } }
      }
    }
    // crew talk to each other when you're not talking to them
    this.banterTimer -= dt;
    if (this.banterTimer <= 0 && !this.talk && p.crew.length >= 2) {
      this.banterTimer = ((p.furnishings ?? []).includes("jukebox") ? 18 : 30) + Math.random() * 30;
      const a = p.crew[Math.floor(Math.random() * p.crew.length)];
      let b = p.crew[Math.floor(Math.random() * p.crew.length)];
      if (b === a) b = p.crew.find((c) => c !== a) ?? a;
      const v = bond(a, b);
      const lowMorale = Math.min(a.morale, b.morale) < 35 || v <= -2;
      const lines = v <= -2 ? [
        [`${a.name}: ...`, `${b.name}: ...`],
        [`${a.name}: Tell ${b.name} the coolant's due.`, `${b.name}: Tell ${a.name} I heard.`],
        [`${a.name}: Is this seat taken?`, `${b.name}: Yes.`],
      ] : v >= 2 ? [
        [`${a.name}: Same bet as last time?`, `${b.name}: Double. I feel lucky.`],
        [`${a.name}: You ate my ration bar.`, `${b.name}: I saved you from it.`],
        [`${a.name}: If this ship ever docks for good, we open a bar.`, `${b.name}: You cook. I'll pour.`],
      ] : lowMorale ? [
        [`${a.name}: How long since we ate anything that wasn't a bar?`, `${b.name}: Don't. I'm trying not to count.`],
        [`${a.name}: I had an offer at the last station.`, `${b.name}: You say that every station.`],
        [`${a.name}: Is the captain even listening to us?`, `${b.name}: Ask the wall of record. It listens more.`],
      ] : [
        [`${a.name}: Nice burn through the belt back there.`, `${b.name}: That was me. The captain just held on.`],
        [`${a.name}: Bet you a shift the next mayday's a medic job.`, `${b.name}: Bet you two it's corsairs pretending.`],
        [`${a.name}: Galley's stocked. Real coffee.`, `${b.name}: Then this is the best ship in the sector.`],
        [`${a.name}: Did you see the drifters off the gas giant?`, `${b.name}: I saw them. They saw us. Nobody blinked.`],
        [`${a.name}: The reactor's humming in tune again.`, `${b.name}: I retuned it. You're welcome. Again.`],
        ...(p.cat ? [[`${a.name}: ${p.cat.name}'s asleep on the comms panel again.`, `${b.name}: Leave it. Best signal we've had all week.`], [`${a.name}: Who's feeding ${p.cat.name}?`, `${b.name}: Everyone. That's the problem.`]] : []),
      ];
      const pick = lines[Math.floor(Math.random() * lines.length)];
      this.talk = `${pick[0].toUpperCase()}   ${pick[1].toUpperCase()}`;
      this.talkTimer = 7;
    }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, VW, VH);
    const [ox, oy] = deckOrigin(this.deck, 8);
    const p = g.world.player;
    drawTiles(ctx, this.deck, ox, oy, (ch, x, y, tx, ty) => {
      const def = PANELS.find((pn) => pn.ch === ch);
      if (def) {
        let col: string = PAL.info;
        if (def.sysId) {
          const sys = p.systems.find((s) => s.id === def.sysId)!;
          col = sys.health > 70 ? PAL.good : sys.health > 35 ? PAL.warn : PAL.danger;
        } else if (def.ch === "C") col = PAL.ui;
        else col = "#7a5aa5";
        ctx.fillStyle = "#2c3550"; ctx.fillRect(x, y + 2, T, T - 2);
        ctx.fillStyle = col; ctx.fillRect(x + 2, y + 4, T - 4, 3);
        if (def.sysId) {
          const sys = p.systems.find((s) => s.id === def.sysId)!;
          if (sys.health < 50 && Math.floor(g.world.time * 3) % 2 === 0) { ctx.fillStyle = PAL.danger; ctx.fillRect(x + T - 3, y + 1, 2, 2); }
        }
      } else if (ch === "c" || ch === "p") {
        ctx.fillStyle = "#1a2236"; ctx.fillRect(x + 2, y + 6, T - 4, 3); // seat
      }
      // low-O2 rooms tint blue
      const r = this.rooms[ty]?.[tx] ?? -1;
      if (r >= 0 && this.roomO2[r] < 40) { ctx.globalAlpha = 0.25 * (1 - this.roomO2[r] / 40); ctx.fillStyle = PAL.info; ctx.fillRect(x, y, T, T); ctx.globalAlpha = 1; }
      return true;
    });
    for (const b of p.breaches) {
      const x = ox + b.tx * T, y = oy + b.ty * T;
      ctx.fillStyle = "#05070f"; ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
      ctx.fillStyle = PAL.starMid; ctx.fillRect(x + 4, y + 5, 1, 1);
    }
    for (const f of p.fires) {
      const x = ox + f.tx * T, y = oy + f.ty * T;
      const fl = Math.floor(g.world.time * 8 + f.tx) % 3;
      ctx.fillStyle = fl === 0 ? "#ff5a5a" : fl === 1 ? "#ffb347" : "#ffd75a";
      ctx.fillRect(x + 2, y + 3 + fl, T - 4, T - 4 - fl);
    }
    // crew at their spots, passenger in the seat
    const spots = this.crewSpots();
    p.crew.forEach((c, i) => {
      const at = this.crewAt(i);
      if (!at) return;
      drawPerson(ctx, Math.round(ox + at.x), Math.round(oy + at.y), "#c78a5a", c.role === "engineer" ? "#c7a54a" : c.role === "gunner" ? "#a53a3a" : c.role === "pilot" ? "#3a6ea5" : "#3aa55e");
      if (c.sick) { ctx.fillStyle = "#9fd8a0"; ctx.fillRect(Math.round(ox + at.x) + 3, Math.round(oy + at.y) - 5, 2, 2); }
      else if (c.morale < 30 && Math.floor(g.world.time * 2) % 2 === 0) { ctx.fillStyle = PAL.warn; ctx.fillRect(Math.round(ox + at.x) + 3, Math.round(oy + at.y) - 5, 2, 2); }
    });
    // the hold: crates for what you carry, a stack per ten units
    { const gt = nearestTile(this.deck, 0, 0, "G", 1e9); if (gt) { const n = Math.min(6, Math.ceil(cargoUsed(p) / 10)); for (let i = 0; i < n; i++) { const cx = ox + gt.tx * T + (i % 3) * 3 + 1 + (this.tileAt(gt.tx + 1, gt.ty) === "." ? T : 0), cy = oy + gt.ty * T + Math.floor(i / 3) * 4 + 2; ctx.fillStyle = i % 2 ? "#6a4a2a" : "#7a5a3a"; ctx.fillRect(cx, cy, 3, 3); ctx.fillStyle = "#c7a54a"; ctx.fillRect(cx + 1, cy, 1, 1); } } }
    // crew belongings by their bunks: what they do off duty, in one small object each
    this.crewSpots().forEach((sp, i) => {
      const c = p.crew[i]; if (!c || !c.trait) return;
      const x = ox + sp.tx * T, y = oy + sp.ty * T;
      const t = c.trait;
      if (t.includes("plant")) { ctx.fillStyle = "#3aa55e"; ctx.fillRect(x + 8, y + 1, 1, 2); ctx.fillRect(x + 7, y + 2, 3, 1); }
      else if (t.includes("reads") || t.includes("letters") || t.includes("sketches")) { ctx.fillStyle = "#f2f4ff"; ctx.fillRect(x + 7, y + 1, 2, 3); ctx.fillStyle = "#c7a54a"; ctx.fillRect(x + 7, y + 1, 2, 1); }
      else if (t.includes("cards") || t.includes("tally") || t.includes("stamps")) { ctx.fillStyle = "#e8e8e8"; ctx.fillRect(x + 7, y + 1, 2, 2); ctx.fillStyle = "#a53a3a"; ctx.fillRect(x + 8, y + 2, 1, 1); }
      else if (t.includes("hymns") || t.includes("song") || t.includes("talks")) { ctx.fillStyle = "#ffd75a"; ctx.fillRect(x + 8, y + 1, 1, 3); ctx.fillRect(x + 7, y + 3, 2, 1); }
      else if (t.includes("cooks")) { ctx.fillStyle = "#9aa5bd"; ctx.fillRect(x + 7, y + 1, 3, 2); ctx.fillStyle = "#ff9a3a"; ctx.fillRect(x + 8, y + 1, 1, 1); }
      else { ctx.fillStyle = "#5d6680"; ctx.fillRect(x + 7, y + 1, 3, 2); }
    });
    // passengers' luggage by the seat
    { const ps = nearestTile(this.deck, 0, 0, "p", 1e9); if (ps) passengersAboard(p).forEach((m, i) => { ctx.fillStyle = m.passengerKind === "vip" ? "#c7a54a" : "#6a4a2a"; ctx.fillRect(ox + ps.tx * T + 1 + i * 3, oy + ps.ty * T + T - 3, 2, 2); }); }
    for (const id of p.furnishings ?? []) {
      const f = FURNISHINGS.find((x) => x.id === id); if (!f) continue;
      const t = nearestTile(this.deck, 0, 0, f.tile, 1e9); if (!t) continue;
      // one tile to the right of the thing it belongs to, or left if that's a wall
      const tx = this.tileAt(t.tx + 1, t.ty) === "." ? t.tx + 1 : t.tx - 1;
      const x = ox + tx * T, y = oy + t.ty * T;
      if (id === "plant") { ctx.fillStyle = "#6a4a2a"; ctx.fillRect(x + 3, y + 6, 4, 3); ctx.fillStyle = "#3aa55e"; ctx.fillRect(x + 2, y + 2, 2, 3); ctx.fillRect(x + 5, y + 1, 2, 4); ctx.fillRect(x + 4, y + 4, 2, 2); }
      else if (id === "rug") { ctx.fillStyle = "#7a3a3a"; ctx.fillRect(x + 1, y + 2, 8, 6); ctx.fillStyle = "#c7a54a"; ctx.fillRect(x + 2, y + 3, 6, 4); ctx.fillStyle = "#7a3a3a"; ctx.fillRect(x + 3, y + 4, 4, 2); }
      else if (id === "jukebox") { ctx.fillStyle = "#5d6680"; ctx.fillRect(x + 2, y + 1, 6, 8); ctx.fillStyle = Math.floor(g.world.time * 3) % 2 ? "#e060ff" : "#63f2c8"; ctx.fillRect(x + 3, y + 2, 4, 2); ctx.fillStyle = "#ffd75a"; ctx.fillRect(x + 4, y + 6, 2, 1); }
      else if (id === "viewport") { ctx.fillStyle = "#0b1020"; ctx.fillRect(x + 1, y + 1, 8, 8); ctx.fillStyle = "#9aa5bd"; ctx.fillRect(x + 1, y + 1, 8, 1); ctx.fillRect(x + 1, y + 8, 8, 1); for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? "#ffffff" : "#5ab3ff"; ctx.fillRect(x + 2 + ((i * 3 + Math.floor(g.world.time)) % 6), y + 2 + (i * 2) % 5, 1, 1); } }
      else if (id === "hammock") { ctx.fillStyle = "#c7a54a"; ctx.fillRect(x + 1, y + 3, 1, 4); ctx.fillRect(x + 8, y + 3, 1, 4); ctx.fillStyle = "#7a5aa5"; ctx.fillRect(x + 2, y + 5, 6, 2); if (Math.floor(g.world.time / 7) % 2 === 0) { ctx.fillStyle = "#e8b48c"; ctx.fillRect(x + 4, y + 4, 2, 1); } }
      else if (id === "mural") { const cols = ["#5ab3ff", "#ffd75a", "#3aa55e", "#e060ff", "#ff9a3a"]; const n = Math.min(5, 1 + Math.floor(Object.keys(p.expLog ?? {}).length / 3)); for (let i = 0; i < n; i++) { ctx.fillStyle = cols[i]; ctx.fillRect(x + 1 + i * 2, y + 2 + (i % 2), 2, 5 - (i % 2)); } }
      else if (id === "chair") { ctx.fillStyle = "#6a4a2a"; ctx.fillRect(x + 2, y + 2, 6, 1); ctx.fillRect(x + 2, y + 2, 1, 6); ctx.fillRect(x + 7, y + 2, 1, 6); ctx.fillStyle = "#c7a54a"; ctx.fillRect(x + 3, y + 5, 4, 2); ctx.fillStyle = "#3a4a6c"; ctx.fillRect(x + 2, y + 7, 6, 1); }
      else if (id === "simrig") { ctx.fillStyle = "#5d6680"; ctx.fillRect(x + 1, y + 1, 8, 8); const ph = Math.floor(g.world.time * 2) % 4; ctx.fillStyle = ["#5ab3ff", "#ffd75a", "#3aa55e", "#e060ff"][ph]; ctx.fillRect(x + 2, y + 2, 6, 6); ctx.fillStyle = "#0b1020"; ctx.fillRect(x + 4, y + 4, 2, 4); }
      else if (id === "shelf") { ctx.fillStyle = "#6a4a2a"; ctx.fillRect(x + 1, y + 4, 8, 1); ctx.fillRect(x + 1, y + 7, 8, 1); const n = Math.min(4, Math.floor(((p.codex ? Object.keys(p.codex).length : 0) + (p.cargo.relics ?? 0) + (p.achievements ?? []).length) / 3)); for (let i = 0; i < n; i++) { ctx.fillStyle = ["#e060ff", "#ffd75a", "#63f2c8", "#ff9a3a"][i]; ctx.fillRect(x + 2 + i * 2, y + 2, 1, 2); } }
    }
    if (p.cat && !p.catAway && (this.cat.x || this.cat.y)) {
      const cx = Math.round(ox + this.cat.x), cy = Math.round(oy + this.cat.y);
      ctx.fillStyle = "#e0b070"; ctx.fillRect(cx - 2, cy - 1, 4, 2); ctx.fillRect(cx + 1, cy - 3, 2, 2); // body, head
      ctx.fillStyle = "#3a2a1a"; ctx.fillRect(cx - 3, cy - 2, 1, 1); // tail tip
      if (Math.floor(g.world.time * 2) % 4 === 0) { ctx.fillStyle = "#63f2c8"; ctx.fillRect(cx + 2, cy - 3, 1, 1); } // an eye
    }
    // corridor talk over their heads
    const placed: { x: number; y: number; w: number }[] = [];
    for (const b of this.bubbles) {
      const at = b.pax ? this.paxPos[b.pax] : this.crewAt(b.i); if (!at) continue;
      const w = textWidth(b.text) + 4;
      const bx = clamp(Math.round(ox + at.x - w / 2), 2, VW - w - 2); let by = Math.round(oy + at.y) - 34;
      while (placed.some((q) => Math.abs(q.y - by) < 10 && bx < q.x + q.w + 2 && q.x < bx + w + 2)) by -= 10; // stack, don't overlap
      placed.push({ x: bx, y: by, w });
      ctx.fillStyle = "#0b1020"; ctx.fillRect(bx, by - 1, w, 9);
      ctx.fillStyle = "#2a3550"; ctx.fillRect(clamp(Math.round(ox + at.x) - 1, bx + 2, bx + w - 4), by + 8, 2, 2);
      drawText(ctx, b.text, bx + 2, by, b.text.startsWith("*") ? PAL.greyDark : b.pax ? "#b28fe0" : PAL.ui);
    }
    const passenger = p.missions.find((m) => m.kind === "passenger" && m.accepted && !m.done);
    const pSpot = nearestTile(this.deck, 0, 0, "p", 1e9);
    if (passenger && pSpot) {
      const all = passengersAboard(p);
      all.forEach((px, i) => {
        const pp = this.paxPos[px.id];
        const ofs = [[0, 0], [-8, 4], [8, 4]][i] ?? [0, 8];
        const x = pp ? ox + pp.x : ox + pSpot.tx * T + T / 2 + ofs[0], y = pp ? oy + pp.y : oy + pSpot.ty * T + T / 2 + ofs[1];
        drawPerson(ctx, Math.round(x), Math.round(y), "#f0d0b0", px.passengerKind === "vip" ? "#c7a54a" : px.passengerKind === "refugee" ? "#6a7a9c" : px.passengerKind === "tourist" ? "#5ab3ff" : "#7a5aa5");
        if ((px.mood ?? 60) < 35 && Math.floor(g.world.time * 2) % 2 === 0) { ctx.fillStyle = PAL.warn; ctx.fillRect(Math.round(x) + 3, Math.round(y) - 5, 2, 2); }
      });
    }

    drawPerson(ctx, Math.round(ox + this.px), Math.round(oy + this.py), "#e8b48c", "#3a6ea5");

    // the wall of record: plaques for what this ship has done, scorch where it's been hurt
    {
      const px0 = ox + 1 * T, py0 = oy + 0 * T;
      const p2 = g.world.player;
      const deeds = (p2.repairs ?? 0) + (p2.tows ?? 0) + (p2.rescues ?? 0) + Math.floor((p2.lives ?? 0) / 3);
      const plaques = Math.min(6, deeds + (p2.flags?.theSignal ? 1 : 0) + Object.values(p2.firsts ?? {}).filter((c) => c).length + (p2.alumni ?? []).length);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i < plaques ? "#c7a54a" : "#2a3146";
        ctx.fillRect(px0 + 2 + i * 4, py0 + 3, 3, 4);
      }
      if ((p2.cargo.relics ?? 0) > 0 || (p2.codex && Object.keys(p2.codex).length)) { ctx.fillStyle = "#e060ff"; ctx.fillRect(px0 + T + 4, py0 + 5, 2, 2); ctx.fillStyle = "#63f2c8"; ctx.fillRect(px0 + T + 8, py0 + 5, 2, 2); }
      if (p2.hull < p2.hullMax * 0.6) {
        // scorch: a few dark blotches on the deck, seeded so they stay put until the yard fixes the hull
        ctx.globalAlpha = 0.35; ctx.fillStyle = "#000";
        const seed = (g.world.seed >>> 0) % 100000;
        for (let i = 0; i < 5; i++) { const tx = 2 + ((i * 7 + seed) % (this.deck[0].length - 4)), ty = 1 + ((i * 3 + (seed >> 3)) % (this.deck.length - 2)); if (this.deck[ty]?.[tx] === ".") ctx.fillRect(ox + tx * T + 1, oy + ty * T + 2, T - 2, T - 3); }
        ctx.globalAlpha = 1;
      }
    }

    // tooltips
    const near = nearestTile(this.deck, this.px, this.py, "CELRWGMBKSH");
    const fire = p.fires.find((f) => dist(f.tx * T + T / 2, f.ty * T + T / 2, this.px, this.py) < 16);
    const breach = p.breaches.find((b) => dist(b.tx * T + T / 2, b.ty * T + T / 2, this.px, this.py) < 16);
    const crewNear = p.crew.map((c, i) => ({ c, spot: spots[i], at: this.crewAt(i) })).find((x) => x.at && dist(x.at.x, x.at.y, this.px, this.py) < 16);
    const atWall = dist(1 * T + T / 2, 1 * T + T / 2, this.px, this.py) < 14;
    if (atWall && !fire && !breach) tooltip(ctx, ox, oy, 1, 0, "WALL OF RECORD", "[E] READ", "#c7a54a");
    else if (p.cat && !p.catAway && dist(this.cat.x, this.cat.y, this.px, this.py) < 14 && !crewNear) tooltip(ctx, ox, oy, Math.floor(this.cat.x / T), Math.floor(this.cat.y / T), p.cat.name.toUpperCase(), "[E] PAT", "#e0b070");
    else if (fire) tooltip(ctx, ox, oy, fire.tx, fire.ty, "FIRE", "[HOLD E] EXTINGUISH", PAL.danger);
    else if (breach) tooltip(ctx, ox, oy, breach.tx, breach.ty, "HULL BREACH", "[HOLD E] SEAL (1 PART)", PAL.danger);
    else if (crewNear) tooltip(ctx, ox, oy, Math.floor(crewNear.at!.x / T), Math.floor(crewNear.at!.y / T), `${crewNear.c.name} - ${ROLE_INFO[crewNear.c.role].label}`, crewNear.c.sick ? "[E] TALK" : "[E] TALK  [C] CARDS", PAL.ui);
    else if (passenger && this.passengerNear(p)) { const m = this.passengerNear(p)!; const pp = this.paxPos[m.id]; tooltip(ctx, ox, oy, Math.floor(pp.x / T), Math.floor(pp.y / T), m.passengerName ?? "PASSENGER", "[E] TALK", "#b28fe0"); }
    else if (near) {
      const def = PANELS.find((x) => x.ch === near.ch)!;
      const sys = def.sysId ? p.systems.find((s) => s.id === def.sysId)! : null;
      const label = sys ? `${def.label} ${Math.round(sys.health)}%` : def.label;
      const hint = def.ch === "C" ? "[E] TAKE HELM" : sys && sys.health < 100 ? "[HOLD E] REPAIR" : `[E] ${def.desc.toUpperCase()}`;
      tooltip(ctx, ox, oy, near.tx, near.ty, label, hint, sys && sys.health < 100 ? PAL.warn : PAL.ui);
    }
    if (this.repairing) {
      const px = Math.round(ox + this.px), py = Math.round(oy + this.py);
      ctx.fillStyle = PAL.greyDark; ctx.fillRect(px - 10, py - 10, 20, 3);
      ctx.fillStyle = PAL.good; ctx.fillRect(px - 10, py - 10, Math.round(20 * clamp(this.repairing.progress / 1.2, 0, 1)), 3);
    }
    drawText(ctx, `${hull(p.hullId).name.toUpperCase()} - INTERIOR`, 8, 6, PAL.white);
    drawText(ctx, `PARTS ${p.cargo.parts ?? 0}  FOOD ${p.cargo.food ?? 0}  CARGO ${cargoUsed(p)}/${p.cargoMax}  CREW ${p.crew.length}/${hull(p.hullId).crewSlots}  PILOT ${(p.skills.piloting ?? 0).toFixed(1)} ENG ${(p.skills.engineering ?? 0).toFixed(1)}`, 8, 15, PAL.grey);
    drawText(ctx, "ESC/I RETURN TO FLIGHT", VW - textWidth("ESC/I RETURN TO FLIGHT") - 6, 6, PAL.greyDark);
    if (p.breaches.length || p.fires.length) drawText(ctx, `! ${p.breaches.length} BREACH  ${p.fires.length} FIRE`, VW - 90, 15, PAL.danger);
    if (this.talk) {
      ctx.fillStyle = "rgba(8,12,22,0.92)"; ctx.fillRect(6, VH - 34, VW - 12, 22);
      drawText(ctx, this.talk.slice(0, 116), 10, VH - 30, PAL.ui);
      if (this.talk.length > 116) drawText(ctx, this.talk.slice(116, 232), 10, VH - 21, PAL.ui);
    } else footer(ctx, g, this.msg);
    if (g.hint) drawText(ctx, g.hint, VW / 2 - textWidth(g.hint) / 2, 24, PAL.gold);
  }
}
