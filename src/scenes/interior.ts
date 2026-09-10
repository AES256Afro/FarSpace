// Ship interior: walk your deck, repair physical panels, seal breaches, fight
// fires, talk to crew and passengers, study, eat, sleep.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { ShipSystemId, removeCargo, cargoUsed, crewBonus, tickWorld } from "../world";
import { hull, HullDef } from "../data/hulls";
import { CREW_LINES, ROLE_INFO } from "../data/crew";
import { clamp, dist } from "../core/mathx";
import { sfx } from "../core/sfx";
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

  say(m: string): void { this.msg = m; this.msgTimer = 3; }

  crewSpots(): { tx: number; ty: number }[] {
    const out: { tx: number; ty: number }[] = [];
    for (let ty = 0; ty < this.deck.length; ty++) for (let tx = 0; tx < this.deck[0].length; tx++) if (this.deck[ty][tx] === "c") out.push({ tx, ty });
    return out;
  }

  update(g: Game, dt: number): void {
    const inp = g.input;
    const p = g.world.player;
    if (inp.wasPressed("Escape") || inp.wasPressed("i")) { g.setScene("flight"); return; }
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
    const crewNear = p.crew.map((c, i) => ({ c, spot: this.crewSpots()[i] })).find((x) => x.spot && dist(x.spot.tx * T + T / 2, x.spot.ty * T + T / 2, this.px, this.py) < 16);
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
            sfx.repair();
            this.say(`${sys.name.toUpperCase()} AT ${Math.round(sys.health)}%`);
          }
        }
      } else if (breach) this.say("NEED SPARE PARTS TO SEAL A BREACH");
      else if (sys && sys.health < 60) this.say("NEED SPARE PARTS FOR MAJOR REPAIRS");
    } else this.repairing = null;

    // ---- tap E: verbs
    if (inp.wasPressed("e")) {
      if (crewNear) {
        const c = crewNear.c;
        const pool = c.morale >= 65 ? CREW_LINES[c.role].high : c.morale >= 30 ? CREW_LINES[c.role].mid : CREW_LINES[c.role].low;
        const ask = c.request ? ` ...and about that stop I asked for.` : "";
        this.talk = `${c.name.toUpperCase()} (${ROLE_INFO[c.role].label}, SKILL ${c.skill}, MORALE ${Math.round(c.morale)}${(c.loyalty ?? 0) >= 2 ? ", LOYAL" : ""}): ${pool[Math.floor(Math.random() * pool.length)]}${ask}`;
        this.talkTimer = 5;
        c.morale = Math.min(100, c.morale + 1);
      } else if (passenger && pSpot && dist(pSpot.tx * T + T / 2, pSpot.ty * T + T / 2, this.px, this.py) < 16) {
        const lines = passenger.passengerKind === "vip"
          ? ["Is this really the fastest you can fly?", "I'll be mentioning this ship to my people. Whether that's good depends on you.", "Do you have anything to drink that isn't recycled?"]
          : passenger.passengerKind === "refugee"
            ? ["Thank you. I mean it. Nobody else would take me.", "I'll find work when we land. I always do.", "Don't let them scan us at the gate. Please."]
            : ["No questions. That was the deal.", "If the gate flags us, you never saw me.", "You'll get paid. Just get me there."];
        this.talk = `${passenger.passengerName!.toUpperCase()}: ${lines[Math.floor(Math.random() * lines.length)]}`;
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
      const s = spots[i];
      if (!s) return;
      drawPerson(ctx, ox + s.tx * T + T / 2, oy + s.ty * T + T / 2, "#c78a5a", c.role === "engineer" ? "#c7a54a" : c.role === "gunner" ? "#a53a3a" : c.role === "pilot" ? "#3a6ea5" : "#3aa55e");
      if (c.morale < 30 && Math.floor(g.world.time * 2) % 2 === 0) { ctx.fillStyle = PAL.warn; ctx.fillRect(ox + s.tx * T + T / 2 + 3, oy + s.ty * T, 2, 2); }
    });
    const passenger = p.missions.find((m) => m.kind === "passenger" && m.accepted && !m.done);
    const pSpot = nearestTile(this.deck, 0, 0, "p", 1e9);
    if (passenger && pSpot) drawPerson(ctx, ox + pSpot.tx * T + T / 2, oy + pSpot.ty * T + T / 2, "#f0d0b0", "#7a5aa5");

    drawPerson(ctx, Math.round(ox + this.px), Math.round(oy + this.py), "#e8b48c", "#3a6ea5");

    // tooltips
    const near = nearestTile(this.deck, this.px, this.py, "CELRWGMBKSH");
    const fire = p.fires.find((f) => dist(f.tx * T + T / 2, f.ty * T + T / 2, this.px, this.py) < 16);
    const breach = p.breaches.find((b) => dist(b.tx * T + T / 2, b.ty * T + T / 2, this.px, this.py) < 16);
    const crewNear = p.crew.map((c, i) => ({ c, spot: spots[i] })).find((x) => x.spot && dist(x.spot.tx * T + T / 2, x.spot.ty * T + T / 2, this.px, this.py) < 16);
    if (fire) tooltip(ctx, ox, oy, fire.tx, fire.ty, "FIRE", "[HOLD E] EXTINGUISH", PAL.danger);
    else if (breach) tooltip(ctx, ox, oy, breach.tx, breach.ty, "HULL BREACH", "[HOLD E] SEAL (1 PART)", PAL.danger);
    else if (crewNear) tooltip(ctx, ox, oy, crewNear.spot.tx, crewNear.spot.ty, `${crewNear.c.name} - ${ROLE_INFO[crewNear.c.role].label}`, "[E] TALK", PAL.ui);
    else if (passenger && pSpot && dist(pSpot.tx * T + T / 2, pSpot.ty * T + T / 2, this.px, this.py) < 16) tooltip(ctx, ox, oy, pSpot.tx, pSpot.ty, passenger.passengerName!, "[E] TALK", "#b28fe0");
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
