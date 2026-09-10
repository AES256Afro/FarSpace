// Ship interior: walk your deck, repair physical panels, seal breaches, fight
// fires, talk to crew and passengers, study, eat, sleep.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { ShipSystemId, removeCargo, cargoUsed, crewBonus, tickWorld, passengersAboard, crewXp, FURNISHINGS, bond } from "../world";
import { commodity } from "../data/data";

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
  courier: { high: ["I'll make the meeting with time to spare. Excellent.", "Efficient. I'll say so.", "Best run I've booked this quarter."],
    mid: ["I have a meeting. You understand.", "What's our ETA. Precisely.", "I'll be working, don't mind me."],
    low: ["The meeting is gone. You realise that.", "I'll be asking for a refund.", "Speed, Captain. It was the whole point."] },
};
import { hull, HullDef } from "../data/hulls";
import { CREW_LINES, ROLE_INFO, roleLabel } from "../data/crew";
import { clamp, dist } from "../core/mathx";
import { sfx } from "../core/sfx";
import { music } from "../core/music";
import { rankOf, rescuePoints, STORY_LEN, findStation, canRetireCaptain, retireCaptain, RETIRE_AFTER } from "../world";
import * as wire from "../core/wire";
import { isOccasion } from "../data/occasions";
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
  { ch: "M", sysId: "comms", label: "COMMS ARRAY", desc: "Signals & nav" },
  { ch: "B", sysId: null, label: "BUNK", desc: "Sleep (skips 60s)" },
  { ch: "K", sysId: null, label: "GALLEY", desc: "Eat (needs provisions)" },
  { ch: "S", sysId: null, label: "STUDY TERMINAL", desc: "Train a skill" },
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
  crewPos: { x: number; y: number; tx: number; ty: number; pause: number }[] = [];
  paxPos: Record<string, { x: number; y: number; tx: number; ty: number; pause: number }> = {};
  // passengers stretch their legs: the seat, the galley, the viewport, back to the seat
  wanderPassengers(p: import("../world").PlayerState, dt: number): void {
    const seat = nearestTile(this.deck, 0, 0, "p", 1e9); if (!seat) return;
    const aboard = passengersAboard(p);
    for (const id of Object.keys(this.paxPos)) if (!aboard.some((m) => m.id === id)) delete this.paxPos[id];
    aboard.forEach((m, i) => {
      let pp = this.paxPos[m.id];
      const home = { x: seat.tx * T + T / 2 + ([0, -8, 8][i] ?? 0), y: seat.ty * T + T / 2 + (i ? 4 : 0) };
      if (!pp) { pp = { x: home.x, y: home.y, tx: home.x, ty: home.y, pause: 8 + Math.random() * 10 }; this.paxPos[m.id] = pp; }
      if (pp.pause > 0) { pp.pause -= dt; return; }
      const d = Math.hypot(pp.tx - pp.x, pp.ty - pp.y);
      if (d < 1.5) {
        pp.pause = 8 + Math.random() * 16;
        const goHome = Math.random() < 0.6;
        const dest = goHome ? null : nearestTile(this.deck, pp.x, pp.y, Math.random() < 0.5 ? "K" : "C", 1e9);
        if (!dest) { pp.tx = home.x; pp.ty = home.y; }
        else { const dx = this.tileAt(dest.tx + 1, dest.ty) === "." ? 1 : this.tileAt(dest.tx - 1, dest.ty) === "." ? -1 : 0; pp.tx = (dest.tx + dx) * T + T / 2; pp.ty = dest.ty * T + T / 2; }
      } else {
        const step = 12 * dt; const nx = pp.x + ((pp.tx - pp.x) / d) * step, ny = pp.y + ((pp.ty - pp.y) / d) * step;
        if (!this.solid(Math.floor(nx / T), Math.floor(ny / T))) { pp.x = nx; pp.y = ny; } else { pp.tx = pp.x; pp.ty = pp.y; }
      }
    });
  }
  passengerNear(p: import("../world").PlayerState): import("../world").Mission | null {
    for (const m of passengersAboard(p)) { const pp = this.paxPos[m.id]; if (pp && dist(pp.x, pp.y, this.px, this.py) < 16) return m; }
    return null;
  }
  // where each crew member is right now: their post, or wandering between the galley, the bunks and the bridge
  crewAt(i: number): { x: number; y: number } | null {
    const sp = this.crewSpots()[i]; if (!sp) return null;
    const c = this.crewPos[i];
    return c ? { x: c.x, y: c.y } : { x: sp.tx * T + T / 2, y: sp.ty * T + T / 2 };
  }
  wanderCrew(p: import("../world").PlayerState, dt: number): void {
    const spots = this.crewSpots();
    p.crew.forEach((c, i) => {
      const sp = spots[i]; if (!sp) return;
      let cp = this.crewPos[i];
      if (!cp) { cp = { x: sp.tx * T + T / 2, y: sp.ty * T + T / 2, tx: sp.tx * T + T / 2, ty: sp.ty * T + T / 2, pause: 3 + Math.random() * 6 }; this.crewPos[i] = cp; }
      if (c.sick) { cp.tx = sp.tx * T + T / 2; cp.ty = sp.ty * T + T / 2; } // the sick stay in their bunks
      if (cp.pause > 0) { cp.pause -= dt; return; }
      const d = Math.hypot(cp.tx - cp.x, cp.ty - cp.y);
      if (d < 1.5) {
        cp.pause = 6 + Math.random() * 14;
        const goHome = Math.random() < 0.5;
        const dest = goHome ? sp : nearestTile(this.deck, cp.x, cp.y, Math.random() < 0.5 ? "K" : Math.random() < 0.5 ? "B" : "C", 1e9);
        if (dest) { const dx = this.tileAt(dest.tx + 1, dest.ty) === "." ? 1 : this.tileAt(dest.tx - 1, dest.ty) === "." ? -1 : 0; cp.tx = (dest.tx + (goHome ? 0 : dx)) * T + T / 2; cp.ty = dest.ty * T + T / 2; }
      } else {
        const step = 16 * dt; const nx = cp.x + ((cp.tx - cp.x) / d) * step, ny = cp.y + ((cp.ty - cp.y) / d) * step;
        if (!this.solid(Math.floor(nx / T), Math.floor(ny / T))) { cp.x = nx; cp.y = ny; } else { cp.tx = cp.x; cp.ty = cp.y; }
      }
    });
  }

  enter(g: Game): void {
    const p = g.world.player;
    this.deck = DECKS[hull(p.hullId).deck];
    this.rooms = computeRooms(this.deck, (ch) => ch !== "#");
    const nRooms = Math.max(...this.rooms.flat()) + 1;
    this.roomO2 = Array(nRooms).fill(100);
    // spawn near cockpit
    const c = nearestTile(this.deck, 0, 0, "C", 1e9)!;
    this.px = c.tx * T - T; this.py = c.ty * T + T / 2;
    this.msg = "YOUR SHIP. WASD WALK - E INTERACT";
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
    if (isOccasion("remembrance")) lines.push(`REMEMBRANCE: ${[...(p.alumni ?? []).map((a) => a.name), ...(p.lineage ?? []).map((c) => c.name)].slice(-5).map((n) => n.toUpperCase()).join(", ") || "NO NAMES YET. GIVE IT TIME."}`);
    const opts: Encounter["options"] = [{ label: "CLOSE", result: () => "" }];
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

    const near = nearestTile(this.deck, this.px, this.py, "CELRWGMBKSH");
    const fire = p.fires.find((f) => dist(f.tx * T + T / 2, f.ty * T + T / 2, this.px, this.py) < 16);
    const breach = p.breaches.find((b) => dist(b.tx * T + T / 2, b.ty * T + T / 2, this.px, this.py) < 16);
    this.wanderCrew(p, dt);
    this.wanderPassengers(p, dt);
    const crewNear = p.crew.map((c, i) => ({ c, spot: this.crewSpots()[i], at: this.crewAt(i) })).find((x) => x.at && dist(x.at.x, x.at.y, this.px, this.py) < 16);
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
    const catNear = !!p.cat && dist(this.cat.x, this.cat.y, this.px, this.py) < 14;
    if (inp.wasPressed("e") && catNear && !crewNear && !fire && !breach) {
      const lines = [`${p.cat!.name.toUpperCase()} PURRS LIKE A SMALL REACTOR.`, `${p.cat!.name.toUpperCase()} ALLOWS ONE PAT. EXACTLY ONE.`, `${p.cat!.name.toUpperCase()} LOOKS AT YOU, THEN AT THE GALLEY, THEN AT YOU.`, `${p.cat!.name.toUpperCase()} IS ASLEEP ON THE WARM BIT. THE WARM BIT IS THE REACTOR HOUSING.`];
      this.talk = lines[Math.floor(Math.random() * lines.length)]; this.talkTimer = 4;
      for (const c of p.crew) c.morale = Math.min(100, c.morale + 1);
      this.cat.pause = 3;
      sfx.purr();
    } else if (inp.wasPressed("e")) {
      if (crewNear) {
        const c = crewNear.c;
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
        const pool = mood >= 75 ? PASSENGER_LINES[px.passengerKind ?? "vip"].high : mood >= 35 ? PASSENGER_LINES[px.passengerKind ?? "vip"].mid : PASSENGER_LINES[px.passengerKind ?? "vip"].low;
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
        } else if (near.ch === "K") {
          if ((p.cargo.food ?? 0) > 0) {
            removeCargo(p, "food", 1);
            p.hull = Math.min(p.hullMax, p.hull + 5);
            for (const c of p.crew) c.morale = Math.min(100, c.morale + 10);
            this.say(p.crew.length ? "A HOT MEAL FOR EVERYONE. MORALE UP, +5 HULL" : "A HOT MEAL. +5 HULL");
          } else this.say("GALLEY'S EMPTY. BUY PROVISIONS AT A STATION");
        } else if (near.ch === "H") {
          const n = hull(p.hullId).drones ?? 0;
          this.say(n ? `HANGAR: ${n} ESCORT DRONES RACKED. THEY LAUNCH WITH YOU AND RE-ARM AT DOCK.` : "HANGAR: EMPTY RACKS");
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
      else if (id === "shelf") { ctx.fillStyle = "#6a4a2a"; ctx.fillRect(x + 1, y + 4, 8, 1); ctx.fillRect(x + 1, y + 7, 8, 1); const n = Math.min(4, Math.floor(((p.codex ? Object.keys(p.codex).length : 0) + (p.cargo.relics ?? 0) + (p.achievements ?? []).length) / 3)); for (let i = 0; i < n; i++) { ctx.fillStyle = ["#e060ff", "#ffd75a", "#63f2c8", "#ff9a3a"][i]; ctx.fillRect(x + 2 + i * 2, y + 2, 1, 2); } }
    }
    if (p.cat && (this.cat.x || this.cat.y)) {
      const cx = Math.round(ox + this.cat.x), cy = Math.round(oy + this.cat.y);
      ctx.fillStyle = "#e0b070"; ctx.fillRect(cx - 2, cy - 1, 4, 2); ctx.fillRect(cx + 1, cy - 3, 2, 2); // body, head
      ctx.fillStyle = "#3a2a1a"; ctx.fillRect(cx - 3, cy - 2, 1, 1); // tail tip
      if (Math.floor(g.world.time * 2) % 4 === 0) { ctx.fillStyle = "#63f2c8"; ctx.fillRect(cx + 2, cy - 3, 1, 1); } // an eye
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
    else if (p.cat && dist(this.cat.x, this.cat.y, this.px, this.py) < 14 && !crewNear) tooltip(ctx, ox, oy, Math.floor(this.cat.x / T), Math.floor(this.cat.y / T), p.cat.name.toUpperCase(), "[E] PAT", "#e0b070");
    else if (fire) tooltip(ctx, ox, oy, fire.tx, fire.ty, "FIRE", "[HOLD E] EXTINGUISH", PAL.danger);
    else if (breach) tooltip(ctx, ox, oy, breach.tx, breach.ty, "HULL BREACH", "[HOLD E] SEAL (1 PART)", PAL.danger);
    else if (crewNear) tooltip(ctx, ox, oy, Math.floor(crewNear.at!.x / T), Math.floor(crewNear.at!.y / T), `${crewNear.c.name} - ${ROLE_INFO[crewNear.c.role].label}`, "[E] TALK", PAL.ui);
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
