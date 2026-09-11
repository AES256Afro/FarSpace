// Wreck interior: board a derelict, loot crates, survive the fires and breaches.

import type { FlightScene } from "./flight/index";
import { Game, Scene, VW } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { RNG, hashStr } from "../core/rng";
import { logEntry } from "../world";
import { addCargo, WreckDef } from "../world";
import { commodity } from "../data/data";
import { sfx } from "../core/sfx";
import { music } from "../core/music";
import { flag } from "../core/achievements";
import type { Encounter } from "../data/encounters";
import type { EncounterScene } from "./encounter";
import { gainMaterials } from "../core/materials";
import { T, moveWalker, deckOrigin, drawTiles, drawPerson, nearestTile, tooltip, footer } from "./walkbase";

const BASE = [
  "############################",
  "#A..........#..............#",
  "#...........D..............#",
  "#....######.#....######....#",
  "#....#....#.#....#....#....#",
  "#....#....D.D....D....#....#",
  "#....######......######....#",
  "#..........................#",
  "############################",
];

export class WreckScene implements Scene {
  touchMode = "walk" as const;
  px = 2 * T; py = T + 5;
  deck: string[] = [];
  crates: { tx: number; ty: number; id: string; qty: number; taken: boolean }[] = [];
  fires: { tx: number; ty: number }[] = [];
  partner: "engineer" | "medic" | "gunner" | null = null; askedFor = "";
  recorder: { tx: number; ty: number; taken: boolean } | null = null; recorderFor = "";
  breaches: { tx: number; ty: number }[] = [];
  o2 = 100;
  msg = ""; msgTimer = 0;
  wreck!: WreckDef;
  hurtCd = 0;

  enter(g: Game): void {
    const w = g.wreckTarget;
    if (!w) { (g.scenes.flight as FlightScene).resumeNext = true; g.setScene("flight"); return; }
    this.wreck = w;
    { const p0 = g.world.player; const here = (p0.wrecksOfMine ?? []).includes(w.id) ? (p0.lost ?? []).find((l) => !(p0.flags ?? {})[`theplace:${w.id}:${l.name}`]) : null;
      if (here) { (p0.flags ??= {})[`theplace:${w.id}:${here.name}`] = true; const enc0: Encounter = { id: "theplace", where: "space", title: "THE PLACE", weight: 0,
        text: `You know this corridor. You know which hatch it was. ${here.name}, ${here.role}, didn't make it to the pod from somewhere about here, and the crew behind you have gone quiet in the lock because they know it too.`,
        options: [
          { label: "SAY THE NAME HERE. LEAVE SOMETHING", hint: "Loyalty up; a keepsake goes the other way; the crew remember you did", result: (g2) => { for (const c of p0.crew) { c.loyalty = (c.loyalty ?? 0) + 0.3; c.morale = Math.min(100, c.morale + 4); } if ((p0.keepsakes ?? []).length) { const k = p0.keepsakes!.shift()!; logEntry(g2.world, `Left ${k.split(",")[0]} at ${w.name} for ${here.name}`); } else logEntry(g2.world, `Said ${here.name}'s name at ${w.name}`); flag(g2, "theplace"); return `YOU SAY ${here.name.toUpperCase()} INTO THE SUIT BAND, AND LEAVE SOMETHING OF THE SHIP'S ON THE DECK BY THE HATCH, AND NOBODY BEHIND YOU SAYS ANYTHING FOR THE WHOLE BOARDING. LOYALTY UP. THEY'LL TELL THE NEXT CREW YOU DID THIS.`; } },
          { label: "WORK THE WRECK. THEY'D HAVE WANTED THE CRATES", hint: "Morale up a little; a joke that's allowed", result: () => { for (const c of p0.crew) c.morale = Math.min(100, c.morale + 2); return `SOMEBODY BEHIND YOU SAYS '${here.name.split(" ")[0].toUpperCase()} WOULD HAVE HAD THE CRATES OUT BY NOW', AND THAT'S THE RIGHT THING TO SAY, AND EVERYBODY LAUGHS THE RIGHT AMOUNT. MORALE UP.`; } },
        ] };
        (g.scenes["encounter"] as EncounterScene).open(g, enc0, "wreck", true); this.askedFor = w.id; }
      else if ((p0.wrecksOfMine ?? []).includes(w.id)) g.toast("YOU KNOW THIS CORRIDOR. YOU KNOW WHERE THE LIGHTS WERE."); }
    this.deck = BASE.map((r) => r);
    const rng = new RNG(hashStr(w.id));
    this.px = 2 * T; this.py = T + 5;
    this.o2 = 100;
    // a boarding party: who comes through the lock with you changes the derelict
    if (this.askedFor !== w.id) {
      this.askedFor = w.id; this.partner = null;
      const p = g.world.player;
      const has = (r: string) => p.crew.some((c) => c.role === r && !c.sick);
      if (!w.id.startsWith("wreck-mine") && !w.looted && rng.chance(0.3)) {
        // salvage rights: another cutter is already latched on, and the belt has rules about that
        const cut = rng.pick(["a Corsair cutter", "a belt tug with three names painted over", "a Guild salvage barge", "a family skiff, kids at the port"]);
        const half = () => { for (const c of this.crates) c.qty = Math.max(1, Math.ceil(c.qty / 2)); };
        const enc: Encounter = { id: "claimjumpers", where: "space", title: "SALVAGE RIGHTS", weight: 0,
          text: `${cut.charAt(0).toUpperCase() + cut.slice(1)} is latched to the far lock with its lights on and a cutting torch already going. The band: 'WE WERE HERE FIRST. BELT RULES. HALF, OR NOTHING, OR YOU CAN COME AND ARGUE ABOUT IT.'`,
          options: [
            { label: "HALF EACH. BELT RULES", hint: "Half the crates; nobody bleeds", result: (g2) => { half(); (p.flags ??= {}).claimjumpers = true; logEntry(g2.world, `Split ${w.name} with ${cut}, belt rules`); return "YOU TAKE THE NEAR ROOMS AND THEY TAKE THE FAR ONES, AND THE TWO CREWS PASS IN THE CORRIDOR WITHOUT A WORD, WHICH IS BELT MANNERS. HALF THE CRATES ARE YOURS."; } },
            { label: "BUY THEIR CLAIM (150CR)", hint: "Full salvage; they cast off happy", requires: () => p.credits >= 150, result: (g2) => { p.credits -= 150; (p.flags ??= {}).claimjumpers = true; logEntry(g2.world, `Bought ${cut}'s claim on ${w.name}`); return "THEY TAKE THE MONEY AND CAST OFF, AND ONE OF THEM WAVES. IT'S CHEAPER THAN A FIGHT AND YOU BOTH KNOW IT. THE WRECK IS YOURS."; } },
            { label: "STAND YOUR GROUND", hint: has("gunner") ? "The gunner at the lock; they back off" : "Half the time they back off. Half the time they don't.", result: (g2, rng2) => { (p.flags ??= {}).claimjumpers = true; if (has("gunner") || rng2.chance(0.5)) { logEntry(g2.world, `Stared ${cut} off ${w.name}`); return has("gunner") ? "THE GUNNER STANDS IN THE LOCK WITH THE EXTINGUISHER HELD LIKE IT ISN'T ONE. THE TORCH GOES OUT. THEY CAST OFF. THE WRECK IS YOURS, AND THEY'LL REMEMBER YOUR HULL." : "YOU TELL THEM THE RULES WERE WRITTEN FOR TUGS, NOT FOR THE SHIP THAT TOWED THE TUGS. A LONG PAUSE ON THE BAND. THEY CAST OFF. THE WRECK IS YOURS."; } half(); for (const c of p.crew) c.morale = Math.max(0, c.morale - 3); logEntry(g2.world, `Argued salvage with ${cut} at ${w.name} and lost the far rooms`); return "THEY DON'T BACK OFF. THEY CUT THROUGH TO THE FAR ROOMS WHILE YOU'RE STILL TALKING, AND NOBODY WANTS TO BE THE ONE WHO STARTS IT IN A SUIT. HALF THE CRATES. MORALE DOWN."; } },
            { label: "LET THEM HAVE IT", hint: "Nothing here; the belt hears you were fair", result: (g2) => { for (const c of this.crates) c.taken = true; (p.flags ??= {}).claimjumpers = true; p.beltStanding = (p.beltStanding ?? 0) + 2; logEntry(g2.world, `Left ${w.name} to ${cut}`); return "YOU CAST OFF AND LEAVE THEM TO IT. SOMEBODY ON THEIR BAND SAYS YOUR CALLSIGN LIKE THEY'RE WRITING IT DOWN, THE GOOD WAY. THE BELT HEARS. NOTHING FOR THE HOLD."; } },
          ] };
        (g.scenes["encounter"] as EncounterScene).open(g, enc, "wreck", true);
      } else if (has("engineer") || has("medic") || has("gunner")) {
        const enc: Encounter = { id: "boarding", where: "space", title: "BOARDING PARTY", weight: 0,
          text: "The lock cycles and the derelict breathes out at you: cold, dark, something burning somewhere aft. Who comes through with you? One. The rest hold the ship.",
          options: [
            ...(has("engineer") ? [{ label: "THE ENGINEER", hint: "Seals what leaks; breaches drain half as fast, fires spread slower", result: () => { this.partner = "engineer"; return "THE ENGINEER COMES THROUGH WITH A ROLL OF PATCHES AND A TORCH IN THEIR TEETH. 'BREACHES FIRST. THEN WHATEVER YOU CAME FOR.'"; } }] : []),
            ...(has("medic") ? [{ label: "THE MEDIC", hint: "A spare tank on the suit: a third more air", result: () => { this.partner = "medic"; this.o2 = 130; return "THE MEDIC CLIPS A SPARE TANK TO YOUR SUIT BEFORE YOU CAN ARGUE. 'BREATHE SLOWER. YOU NEVER DO.'"; } }] : []),
            ...(has("gunner") ? [{ label: "THE GUNNER", hint: "Clears the fires near the lock", result: () => { this.partner = "gunner"; this.fires = this.fires.filter((f) => f.tx > 8); return "THE GUNNER GOES IN FIRST WITH AN EXTINGUISHER LIKE IT'S A RIFLE AND THE FIRES NEAR THE LOCK ARE OUT BEFORE YOU'VE FOUND YOUR FEET."; } }] : []),
            ...(p.crew.some((c) => (c.docks ?? 0) === 0 && !c.sick) ? [{ label: "THE CADET", hint: "Their first walk in a dead hull; a third less air, and they come back changed", result: () => { const c = p.crew.find((x) => (x.docks ?? 0) === 0 && !x.sick)!; this.partner = null; this.o2 = 70; c.loyalty = (c.loyalty ?? 0) + 0.4; c.morale = Math.min(100, c.morale + 6); c.skill = Math.min(10, c.skill + 1); flag(g, "cadeteva"); logEntry(g.world, `${c.name}'s first walk in a dead hull, ${w.name}`); return `${c.name.toUpperCase()} COMES THROUGH THE LOCK BREATHING LIKE SOMEBODY WHO'S NEVER HEARD THEIR OWN BREATHING BEFORE, AND USES A THIRD OF YOUR AIR DOING IT. YOU LET THEM. SKILL UP. THEY'LL TELL THIS ONE FOR YEARS.`; } }] : []),
            { label: "GO ALONE", result: () => "YOU GO THROUGH ALONE. THE LOCK SHUTS BEHIND YOU. SOMEBODY ON THE BAND SAYS 'COME BACK' LIKE IT'S AN ORDER." },
          ] };
        (g.scenes["encounter"] as EncounterScene).open(g, enc, "wreck", true);
      }
    }
    // scatter crates for each loot entry in the side rooms / corridor
    const spots: [number, number][] = [];
    for (let ty = 1; ty < BASE.length - 1; ty++) for (let tx = 2; tx < BASE[0].length - 1; tx++) if (BASE[ty][tx] === "." && !(tx < 4 && ty < 3)) spots.push([tx, ty]);
    { const rr = new RNG(hashStr(`rec:${w.id}`)); this.recorder = !w.id.startsWith("wreck-mine") && spots.length > 1 && !(this.recorder && this.recorderFor === w.id && this.recorder.taken) && rr.chance(0.4) ? (() => { const [tx, ty] = spots.splice(rr.int(0, spots.length - 1), 1)[0]; return { tx, ty, taken: false }; })() : null; this.recorderFor = w.id; }
    this.crates = w.loot.map((l) => {
      const [tx, ty] = spots.splice(rng.int(0, spots.length - 1), 1)[0];
      return { tx, ty, id: l.id, qty: l.qty, taken: false };
    });
    this.fires = []; this.breaches = [];
    const nf = Math.round(w.hazard * 5);
    for (let i = 0; i < nf; i++) {
      const [tx, ty] = spots.splice(rng.int(0, spots.length - 1), 1)[0];
      if (rng.chance(0.6)) this.fires.push({ tx, ty }); else this.breaches.push({ tx, ty });
    }
    if (w.id.startsWith("ark-")) { this.say(`${w.name.toUpperCase()} - TEN KILOMETRES OF SLEEPING SHIP. THE AIR IS OLD BUT IT IS AIR.`); sfx.pa(); }
    else { this.say(`${w.name.toUpperCase()} - HULL COLD. WATCH FOR FIRE.`); sfx.alarm(); }
  }

  solid(tx: number, ty: number): boolean {
    if (ty < 0 || ty >= this.deck.length || tx < 0 || tx >= this.deck[0].length) return true;
    const ch = this.deck[ty][tx];
    if (ch === "#") return true;
    return this.crates.some((c) => !c.taken && c.tx === tx && c.ty === ty);
  }

  say(m: string): void { this.msg = m; this.msgTimer = 3; }

  leave(g: Game): void {
    if (this.wreck.id.startsWith("ark-") && this.crates.every((c) => c.taken)) { (g.world.player.codex ??= {})["signal:THE SLEEPERS"] = 1; g.toast("SOMEWHERE DEEP IN THE ARK, A LIGHT COMES ON THAT WASN'T ON BEFORE."); logEntry(g.world, `Walked the corridors of ${this.wreck.name}`); flag(g, "arkWalker"); }
    if (this.crates.every((c) => c.taken)) { this.wreck.looted = true; flag(g, "wreckLooted"); gainMaterials(g, { germanium: 1 + Math.floor(Math.random() * 2), iron: 2, nickel: Math.random() < 0.5 ? 2 : 0 }); }
    (g.scenes.flight as FlightScene).resumeNext = true; g.setScene("flight");
  }

  update(g: Game, dt: number): void {
    const inp = g.input;
    const p = g.world.player;
    if (this.wreck.id.startsWith("ark-")) music.setMood("ark", 0);
    if (inp.wasPressed("Escape")) { this.leave(g); return; }
    moveWalker(g, this, dt, (tx, ty) => this.solid(tx, ty));
    const ptx = Math.floor(this.px / T), pty = Math.floor(this.py / T);
    // hazards
    this.hurtCd -= dt;
    if (this.fires.some((f) => f.tx === ptx && f.ty === pty) && this.hurtCd <= 0) {
      this.hurtCd = 0.5;
      p.hull = Math.max(1, p.hull - 4);
      this.say("BURNING! MOVE!");
      sfx.hit();
    }
    // breached compartment drains suit O2 while you're inside the derelict
    const breachNear = this.breaches.some((b) => Math.hypot(b.tx - ptx, b.ty - pty) < 4);
    this.o2 = Math.max(0, this.o2 - dt * (breachNear ? (this.partner === "engineer" ? 2 : 4) : 1.2));
    if (this.o2 <= 0) { g.toast("SUIT O2 EXHAUSTED - RETURNING TO SHIP"); this.leave(g); return; }
    // fire spreads slowly
    if (Math.random() < dt * (this.partner === "engineer" ? 0.02 : 0.05) && this.fires.length < 12) {
      const f = this.fires[Math.floor(Math.random() * this.fires.length)];
      if (f) {
        const nx = f.tx + (Math.random() < 0.5 ? 1 : -1), ny = f.ty;
        if (!this.solid(nx, ny) && !this.fires.some((x) => x.tx === nx && x.ty === ny)) this.fires.push({ tx: nx, ty: ny });
      }
    }
    // the recorder: the last thing the ship said, still in the box
    const rec = this.recorder;
    if (rec && !rec.taken && inp.wasPressed("e") && Math.hypot(rec.tx * T + T / 2 - this.px, rec.ty * T + T / 2 - this.py) < 16) {
      rec.taken = true; const rr = new RNG(hashStr(`rec:${this.wreck.id}`));
      const last = rr.pick(["'...tell the yard the port mount was fine. It was fine. It was everything else.'", "'If anyone finds this, the crew got to the pods. All of them. Log that first.'", "'We answered the hail. That's what I'd like remembered. We answered it.'", "'Water's at four percent. Somebody sing something.'", "'Course for home is laid in. It's a good course. Somebody should fly it.'"]);
      p.expData = (p.expData ?? 0) + 25; (p.keepsakes ??= []).push(`the recorder from ${this.wreck.name}`); if (p.keepsakes.length > 8) p.keepsakes.shift();
      logEntry(g.world, `${this.wreck.name}'s recorder, last entry: ${last}`); flag(g, "recorder");
      this.msg = `THE RECORDER, STILL WARM. LAST ENTRY: ${last.toUpperCase()} +25 DATA.`; this.msgTimer = 8; sfx.pickup();
      return;
    }
    // loot
    const crate = this.crates.find((c) => !c.taken && Math.hypot(c.tx * T + T / 2 - this.px, c.ty * T + T / 2 - this.py) < 16);
    if (crate && inp.wasPressed("e")) {
      if (addCargo(p, crate.id, crate.qty)) {
        crate.taken = true;
        g.toast(`+${crate.qty} ${commodity(crate.id).name.toUpperCase()}`);
        sfx.pickup();
        if (commodity(crate.id).illegal) g.showHint("illegal", "ILLEGAL CARGO ABOARD - GUARDED GATES MAY SEIZE IT");
      } else g.toast("CARGO FULL");
    }
    // extinguish adjacent fire with E
    const fire = this.fires.find((f) => Math.hypot(f.tx * T + T / 2 - this.px, f.ty * T + T / 2 - this.py) < 16);
    if (fire && inp.wasPressed("e") && !crate) {
      this.fires = this.fires.filter((f) => f !== fire);
      this.say("FIRE OUT");
      sfx.repair();
    }
    const air = nearestTile(this.deck, this.px, this.py, "A");
    if (air && inp.wasPressed("e")) { this.leave(g); return; }
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.msg = ""; }
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, VW, 270);
    const [ox, oy] = deckOrigin(this.deck, 12);
    drawTiles(ctx, this.deck, ox, oy, (ch, x, y) => {
      if (ch === "A") { ctx.fillStyle = "#2c3550"; ctx.fillRect(x, y + 2, T, T - 2); ctx.fillStyle = PAL.warn; ctx.fillRect(x + 2, y + 4, T - 4, 3); }
      return true;
    });
    for (const b of this.breaches) {
      const x = ox + b.tx * T, y = oy + b.ty * T;
      ctx.fillStyle = "#05070f"; ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
      ctx.fillStyle = PAL.starMid; ctx.fillRect(x + 4, y + 5, 1, 1);
    }
    for (const f of this.fires) {
      const x = ox + f.tx * T, y = oy + f.ty * T;
      const fl = Math.floor(g.world.time * 8 + f.tx) % 3;
      ctx.fillStyle = fl === 0 ? "#ff5a5a" : fl === 1 ? "#ffb347" : "#ffd75a";
      ctx.fillRect(x + 2, y + 3 + fl, T - 4, T - 4 - fl);
    }
    for (const c of this.crates) {
      if (c.taken) continue;
      const x = ox + c.tx * T, y = oy + c.ty * T;
      ctx.fillStyle = "#5d6680"; ctx.fillRect(x + 1, y + 2, T - 2, T - 3);
      ctx.fillStyle = commodity(c.id).illegal ? PAL.danger : PAL.gold; ctx.fillRect(x + 3, y + 4, T - 6, 2);
    }
    if (this.recorder && !this.recorder.taken) { const x = ox + this.recorder.tx * T, y = oy + this.recorder.ty * T; ctx.fillStyle = "#2b3350"; ctx.fillRect(x + 2, y + 3, T - 4, T - 5); ctx.fillStyle = Math.floor(g.world.time * 2) % 2 === 0 ? PAL.danger : "#5d6680"; ctx.fillRect(x + 4, y + 5, 2, 2); }
    drawPerson(ctx, Math.round(ox + this.px), Math.round(oy + this.py), "#e8b48c", "#3a6ea5");
    const crate = this.crates.find((c) => !c.taken && Math.hypot(c.tx * T + T / 2 - this.px, c.ty * T + T / 2 - this.py) < 16);
    if (crate) tooltip(ctx, ox, oy, crate.tx, crate.ty, `${commodity(crate.id).name.toUpperCase()} x${crate.qty}`, "[E] TAKE", commodity(crate.id).illegal ? PAL.danger : PAL.gold);
    else {
      const fire = this.fires.find((f) => Math.hypot(f.tx * T + T / 2 - this.px, f.ty * T + T / 2 - this.py) < 16);
      if (fire) tooltip(ctx, ox, oy, fire.tx, fire.ty, "FIRE", "[E] EXTINGUISH", PAL.danger);
      const air = nearestTile(this.deck, this.px, this.py, "A");
      if (air) tooltip(ctx, ox, oy, air.tx, air.ty, "AIRLOCK", "[E] RETURN TO SHIP", PAL.warn);
    }
    drawText(ctx, `DERELICT: ${this.wreck.name.toUpperCase()}`, 8, 6, PAL.white);
    drawText(ctx, `SUIT O2 ${Math.round(this.o2)}%   HULL ${Math.round(g.world.player.hull)}`, 8, 15, this.o2 < 30 ? PAL.danger : PAL.grey);
    drawText(ctx, "ESC LEAVE", VW - textWidth("ESC LEAVE") - 6, 6, PAL.greyDark);
    footer(ctx, g, this.msg);
  }
}
