// Station promenade: walk the station on foot. Kiosks open the service screens,
// NPCs wander the deck, the airlock takes you back to your ship.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { RNG, hashStr } from "../core/rng";
import { dist } from "../core/mathx";
import { StationDef, findStation, isFriend, isRival, rivalOf, galaxyEventAt } from "../world";
import { occasionFor } from "../data/occasions";
import type { Encounter } from "../data/encounters";
import type { EncounterScene } from "./encounter";
import { faction, genPersonName } from "../data/data";
import { StationScene } from "./station";

const T = 10;

// Promenade layout. # wall, . floor, A airlock, M market, Y shipyard,
// B mission board, R bar, N news terminal, ~ window strip (solid, shows space)
const DECK = [
  "########################################",
  "#~~~~#............................#~~~~#",
  "#....#..M...........O...........Y.#....#",
  "#....D............................D...A#",
  "#....#............................#....#",
  "######..........########..........######",
  "#...............#......#...............#",
  "#.....B.........#..RR..#....H....N.....#",
  "#...............#......#...............#",
  "#~~~~~~~....................~~~~~~~~~~~#",
  "########################################",
];

interface Kiosk {
  ch: string;
  label: string;
  tab: number | null; // StationScene tab index; null = special
}

const KIOSKS: Kiosk[] = [
  { ch: "M", label: "COMMODITY MARKET", tab: 0 },
  { ch: "Y", label: "SHIPYARD DESK", tab: 1 },
  { ch: "B", label: "MISSION BOARD", tab: 3 },
  { ch: "R", label: "THE LOUNGE BAR", tab: 4 },
  { ch: "N", label: "GALNET TERMINAL", tab: 6 },
  { ch: "A", label: "AIRLOCK - YOUR SHIP", tab: null },
  { ch: "H", label: "STATION CLINIC", tab: -1 },
  { ch: "O", label: "HARBOURMASTER", tab: -2 },
];

interface WalkerNpc {
  x: number; y: number;
  tx: number; ty: number;
  name: string;
  skin: string; suit: string;
  pause: number;
  tag?: string;   // ON LEAVE, RETIRED: someone from your own ship, here on the deck
  line?: string;  // what they say when you press E beside them
}

export class StationWalkScene implements Scene {
  touchMode = "walk" as const;
  px = 37 * T;
  py = 3 * T + 5;
  npcs: WalkerNpc[] = [];
  station!: StationDef;
  msg = "";
  msgTimer = 0;

  enter(g: Game): void {
    const found = findStation(g.world, g.world.player.dockedAt!);
    if (!found) { g.setScene("flight"); return; }
    this.station = found.st;
    // spawn at airlock
    this.px = 37 * T;
    this.py = 3 * T + 5;
    // NPC walkers seeded per station
    const rng = new RNG(hashStr(this.station.id) ^ 0x9a7b);
    this.npcs = [];
    const n = this.station.military ? 4 : 6;
    for (let i = 0; i < n; i++) {
      const spot = this.randomFloor(rng);
      this.npcs.push({
        x: spot.x, y: spot.y, tx: spot.x, ty: spot.y,
        name: i < this.station.barPatrons.length ? this.station.barPatrons[i] : genPersonName(rng),
        skin: rng.pick(["#e8b48c", "#c78a5a", "#8c5a3a", "#f0d0b0", "#a86f48"]),
        suit: this.station.military && i < 2 ? "#5d6680" : rng.pick(["#3a6ea5", "#7a5aa5", "#3aa55e", "#a53a3a", "#c7a54a"]),
        pause: rng.range(0, 3),
      });
    }
    // your own people, out on the deck: crew on shore leave here, and shipmates who retired here
    const p = g.world.player;
    for (const sl of (p.shoreCrew ?? []).filter((x) => x.stationId === this.station.id)) {
      const spot = this.randomFloor(rng);
      this.npcs.push({ x: spot.x, y: spot.y, tx: spot.x, ty: spot.y, name: sl.member.name, skin: "#c78a5a", suit: sl.member.role === "engineer" ? "#c7a54a" : sl.member.role === "gunner" ? "#a53a3a" : sl.member.role === "pilot" ? "#3a6ea5" : "#3aa55e", pause: 2, tag: "ON LEAVE",
        line: rng.pick([`${sl.member.name.toUpperCase()}: 'Not yet, Captain. Two more days. I ${sl.member.trait ?? "sleep"} and it's glorious.'`, `${sl.member.name.toUpperCase()}: 'Berth's still mine, right? Good. Go on, I'll find you when you dock next.'`, `${sl.member.name.toUpperCase()}: 'They've got real coffee here. REAL coffee. Don't wait for me.'`]) });
    }
    for (const a of (p.alumni ?? []).filter((x) => x.stationId === this.station.id).slice(-2)) {
      const spot = this.randomFloor(rng);
      this.npcs.push({ x: spot.x, y: spot.y, tx: spot.x, ty: spot.y, name: a.name, skin: "#e8b48c", suit: "#5d6680", pause: 4, tag: "RETIRED",
        line: rng.pick([`${a.name.toUpperCase()}: '${a.docks} dockings with you. I still count the gates in my sleep. How's the old ship?'`, `${a.name.toUpperCase()}: 'They let me run the ${a.role === "engineer" ? "yard" : a.role === "medic" ? "clinic" : a.role === "gunner" ? "range" : a.role === "captain" ? "harbour office" : "tug"} here. Quieter. Good quiet.'`, a.role === "captain" ? `${a.name.toUpperCase()}: 'How's my ship? Don't answer that. She's yours now. Fly her like you stole her.'` : `${a.name.toUpperCase()}: 'If you ever need a ${a.role} again... no. No, I'm done. But it was good.'`]) });
    }
    // fares waiting for a ship, luggage at their feet
    const stScene = (g.scenes["station"] as StationScene | undefined);
    for (const f of (stScene?.fares ?? []).slice(0, 3)) {
      const spot = this.randomFloor(rng);
      this.npcs.push({ x: spot.x, y: spot.y, tx: spot.x, ty: spot.y, name: f.passengerName ?? "A FARE", skin: rng.pick(["#e8b48c", "#c78a5a", "#f0d0b0"]), suit: f.passengerKind === "vip" ? "#c7a54a" : f.passengerKind === "tourist" ? "#5ab3ff" : "#7a5aa5", pause: 6, tag: "WAITING FOR A SHIP",
        line: `${(f.passengerName ?? "").toUpperCase()}: '${f.desc.split(". ")[0]}. Ask at the lounge if you've a cabin.'` });
    }
    // the crowd matches the day: stalls on market day, pickets in a strike, revellers at a festival, mourners on remembrance
    {
      const oc = occasionFor();
      const ev = galaxyEventAt(g.world, p.systemId);
      const crowd: { tag: string; suit: string; lines: string[]; n: number }[] = [];
      if (oc.id === "market") crowd.push({ tag: "STALLHOLDER", suit: "#c7a54a", n: 3, lines: ["'Fresh in from the belt! Well. Fresh-ish.'", "'Two for the price of one and a half. Market day, captain.'", "'Don't squeeze the fruit. Or do. I'm not your mother.'"] });
      if (oc.id === "remembrance") crowd.push({ tag: "MOURNER", suit: "#5d6680", n: 2, lines: ["'My brother flew the lanes. They read his name at noon.'", "'It's a good list. A long one. Mind how you go out there.'"] });
      if (ev?.kind === "strike" && ev.stationId === this.station.id) crowd.push({ tag: "PICKET", suit: "#a53a3a", n: 3, lines: ["'No yard work at standard rates! Not until they pay the night shift!'", "'You want your hull patched, captain? Tell the harbourmaster to settle.'", "'We're not against you. We're against them. Have a sandwich.'"] });
      if (ev?.kind === "festival" && ev.stationId === this.station.id) crowd.push({ tag: "REVELLER", suit: "#e060ff", n: 3, lines: ["'FESTIVAL! Are you the band? You look like the band.'", "'Three days of this. My feet are gone. I regret nothing.'", "'Tourists everywhere. Bless them. They tip.'"] });
      for (const c of crowd) for (let i = 0; i < c.n; i++) { const spot = this.randomFloor(rng); this.npcs.push({ x: spot.x, y: spot.y, tx: spot.x, ty: spot.y, name: genPersonName(rng), skin: rng.pick(["#e8b48c", "#c78a5a", "#f0d0b0"]), suit: c.suit, pause: rng.range(1, 5), tag: c.tag, line: c.lines[i % c.lines.length] }); }
    }
    this.msg = `${this.station.name.toUpperCase()} PROMENADE`;
    this.msgTimer = 3;
  }

  // The harbourmaster's office: who's in, who's due, your berth log, your charters, the rival if any
  harbourmaster(g: Game): void {
    const w = g.world; const p = w.player;
    const sys = w.systems[p.systemId];
    const here = (w.captains ?? []).filter((c) => w.time - c.lastSeen < 900).slice(0, 4);
    const lines: string[] = [];
    lines.push(`${this.station.name.toUpperCase()} HARBOUR OFFICE - TRAFFIC THIS HOUR: ${Math.max(2, sys.stations.length * 3 + Math.floor((w.time / 60) % 7))} MOVEMENTS`);
    lines.push(here.length ? `IN THE LANES LATELY: ${here.map((c) => `${c.name.toUpperCase()} (${c.ship.toUpperCase()}${isFriend(c) ? ", FRIEND" : isRival(c) ? ", RIVAL" : ""})`).join("; ")}`.slice(0, 118) : "IN THE LANES LATELY: NOBODY YOU'D KNOW.");
    const r = rivalOf(w);
    if (r) lines.push(`ON FILE: ${r.name.toUpperCase()} OF THE ${r.ship.toUpperCase()} HAS LODGED ${2 + Math.abs(r.disposition)} COMPLAINTS ABOUT YOU. NONE UPHELD.`);
    const bl = (p.berthLog ?? []).slice(-3).reverse();
    lines.push(bl.length ? `YOUR BERTH LOG: ${bl.map((b) => `${(findStation(w, b.stationId)?.st.name ?? "?").toUpperCase()} ${b.cost}CR`).join("; ")}` : "YOUR BERTH LOG: NO YARD SERVICES ON FILE. THE HARBOURMASTER RAISES AN EYEBROW.");
    for (const c of p.haulers ?? []) lines.push(`CHARTER ${c.name.toUpperCase()}: ${c.trips} TRIPS, ${c.earned}CR, HULL ${c.health}%`);
    lines.push(`WEAR ${Math.round(p.wear ?? 0)}%   FARES CARRIED ${p.fares ?? 0}   DOCKINGS BY YOUR CREW ${p.crew.reduce((a, c) => Math.max(a, c.docks ?? 0), 0)}`);
    const enc: Encounter = { id: "harbour", where: "space", title: "HARBOURMASTER'S OFFICE", text: lines.join("\n"), weight: 0, options: [{ label: "THANK THEM AND GO", result: () => "" }] };
    (g.scenes["encounter"] as EncounterScene).open(g, enc, "stationwalk", true);
  }

  randomFloor(rng: RNG): { x: number; y: number } {
    for (let tries = 0; tries < 100; tries++) {
      const tx = rng.int(1, DECK[0].length - 2);
      const ty = rng.int(1, DECK.length - 2);
      if (DECK[ty][tx] === ".") return { x: tx * T + T / 2, y: ty * T + T / 2 };
    }
    return { x: 5 * T, y: 3 * T };
  }

  tileAt(tx: number, ty: number): string {
    if (ty < 0 || ty >= DECK.length || tx < 0 || tx >= DECK[0].length) return "#";
    return DECK[ty][tx];
  }

  solid(tx: number, ty: number): boolean {
    const ch = this.tileAt(tx, ty);
    return ch !== "." && ch !== "D";
  }

  update(g: Game, dt: number): void {
    const inp = g.input;
    if (inp.wasPressed("Escape")) {
      // back to the docked services screen
      g.setScene("station");
      return;
    }
    if (inp.wasPressed("F5")) g.save();

    const speed = 55;
    let dx = 0, dy = 0;
    if (inp.isDown("w")) dy -= 1;
    if (inp.isDown("s")) dy += 1;
    if (inp.isDown("a")) dx -= 1;
    if (inp.isDown("d")) dx += 1;
    if (dx && dy) { dx *= 0.707; dy *= 0.707; }
    const nx = this.px + dx * speed * dt;
    const ny = this.py + dy * speed * dt;
    const canX = !this.solid(Math.floor((nx - 3) / T), Math.floor((this.py - 3) / T)) &&
      !this.solid(Math.floor((nx + 3) / T), Math.floor((this.py - 3) / T)) &&
      !this.solid(Math.floor((nx - 3) / T), Math.floor((this.py + 3) / T)) &&
      !this.solid(Math.floor((nx + 3) / T), Math.floor((this.py + 3) / T));
    const canY = !this.solid(Math.floor((this.px - 3) / T), Math.floor((ny - 3) / T)) &&
      !this.solid(Math.floor((this.px + 3) / T), Math.floor((ny - 3) / T)) &&
      !this.solid(Math.floor((this.px - 3) / T), Math.floor((ny + 3) / T)) &&
      !this.solid(Math.floor((this.px + 3) / T), Math.floor((ny + 3) / T));
    if (canX) this.px = nx;
    if (canY) this.py = ny;

    // NPC wandering
    for (const n of this.npcs) {
      if (n.pause > 0) { n.pause -= dt; continue; }
      const d = Math.hypot(n.tx - n.x, n.ty - n.y);
      if (d < 2) {
        const rng = new RNG((Math.random() * 1e9) >>> 0);
        if (rng.chance(0.5)) { n.pause = rng.range(1, 4); }
        const spot = this.randomFloor(rng);
        n.tx = spot.x; n.ty = spot.y;
      } else {
        // straight-line steps; promenade is open enough that this reads fine
        const step = 22 * dt;
        const vx = ((n.tx - n.x) / d) * step;
        const vy = ((n.ty - n.y) / d) * step;
        const ntx = Math.floor((n.x + vx) / T), nty = Math.floor((n.y + vy) / T);
        if (!this.solid(ntx, nty)) { n.x += vx; n.y += vy; }
        else { n.tx = n.x; n.ty = n.y; } // blocked: pick a new target next tick
      }
    }

    // kiosk interaction
    const near = this.nearestKiosk();
    if (inp.wasPressed("e") && !near) {
      const who = this.npcs.find((n) => n.line && dist(this.px, this.py, n.x, n.y) < 16);
      if (who) { this.msg = who.line!; this.msgTimer = 6; }
    }
    if (near && inp.wasPressed("e")) {
      if (near.def.tab === -2) { this.harbourmaster(g); return; }
      if (near.def.tab === -1) {
        // the clinic: sick crew back on their feet, for a fee
        const p = g.world.player;
        const sick = p.crew.filter((c) => c.sick);
        if (!sick.length) { this.msg = "CLINIC: 'EVERYONE'S FINE. TRY THE BAR.'"; this.msgTimer = 4; return; }
        const fee = 120 * sick.length;
        if (p.credits < fee) { this.msg = `CLINIC: ${fee}CR FOR ${sick.length} PATIENT${sick.length > 1 ? "S" : ""}. YOU'RE SHORT.`; this.msgTimer = 4; return; }
        p.credits -= fee; for (const c of sick) { c.sick = null; c.morale = Math.min(100, c.morale + 5); }
        this.msg = `CLINIC: ${sick.map((c) => c.name.toUpperCase()).join(" AND ")} TREATED, -${fee}CR. 'REST. REAL REST. I KNOW YOU WON'T.'`; this.msgTimer = 6;
        return;
      }
      if (near.def.tab === null) {
        g.world.player.dockedAt = null;
        g.justUndocked = true;
        g.setScene("flight");
        g.toast("UNDOCKED");
        return;
      }
      const st = g.scenes["station"] as StationScene;
      st.enter(g);
      st.tab = near.def.tab;
      st.returnTo = "stationwalk";
      g.scene = st;
      return;
    }

    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.msg = ""; }
  }

  nearestKiosk(): { def: Kiosk; tx: number; ty: number } | null {
    let best: { def: Kiosk; tx: number; ty: number } | null = null;
    let bestD = 18;
    for (let ty = 0; ty < DECK.length; ty++) {
      for (let tx = 0; tx < DECK[0].length; tx++) {
        const def = KIOSKS.find((k) => k.ch === DECK[ty][tx]);
        if (!def) continue;
        const d = dist(this.px, this.py, tx * T + T / 2, ty * T + T / 2);
        if (d < bestD) { bestD = d; best = { def, tx, ty }; }
      }
    }
    return best;
  }

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, VW, VH);
    const ox = Math.round(VW / 2 - (DECK[0].length * T) / 2);
    const oy = Math.round(VH / 2 - (DECK.length * T) / 2) + 10;
    const fac = faction(this.station.factionId);

    for (let ty = 0; ty < DECK.length; ty++) {
      for (let tx = 0; tx < DECK[0].length; tx++) {
        const ch = DECK[ty][tx];
        const x = ox + tx * T, y = oy + ty * T;
        if (ch === "#") {
          ctx.fillStyle = "#232a3d";
          ctx.fillRect(x, y, T, T);
          ctx.fillStyle = "#2c3550";
          ctx.fillRect(x, y, T, 2);
        } else if (ch === "~") {
          // viewport window: space + stars
          ctx.fillStyle = "#05070f";
          ctx.fillRect(x, y, T, T);
          const h = (Math.imul(tx * 31 + ty * 7, 2654435761) >>> 0);
          if (h % 3 === 0) {
            ctx.fillStyle = PAL.starMid;
            ctx.fillRect(x + (h % T), y + ((h >> 4) % T), 1, 1);
          }
          ctx.fillStyle = "#2c3550";
          ctx.fillRect(x, y, T, 1);
          ctx.fillRect(x, y + T - 1, T, 1);
        } else {
          ctx.fillStyle = (tx + ty) % 2 === 0 ? "#11182b" : "#121a2e";
          ctx.fillRect(x, y, T, T);
          if (ch === "D") {
            ctx.fillStyle = "#1d2b47";
            ctx.fillRect(x + 1, y, T - 2, T);
          }
          const kiosk = KIOSKS.find((k) => k.ch === ch);
          if (kiosk) {
            ctx.fillStyle = "#2c3550";
            ctx.fillRect(x, y + 2, T, T - 2);
            const col = kiosk.ch === "A" ? PAL.warn
              : kiosk.ch === "R" ? "#c7a54a"
              : kiosk.ch === "M" ? PAL.gold
              : kiosk.ch === "Y" ? PAL.hull
              : kiosk.ch === "B" ? PAL.ui
              : PAL.info;
            ctx.fillStyle = col;
            ctx.fillRect(x + 2, y + 4, T - 4, 3);
            // sign glow
            if (Math.floor(g.world.time * 2 + x) % 3 !== 0) {
              ctx.fillRect(x + 3, y + 1, T - 6, 1);
            }
          }
        }
      }
    }

    // the deck dressed for what the station does: planters, ore carts, lab benches, pipework, crates, racks
    {
      const type = this.station.type;
      const spots: [number, number][] = [[9, 3], [12, 3], [26, 3], [29, 3], [9, 8], [30, 8]];
      spots.forEach(([tx, ty], i) => {
        const x = ox + tx * T, y = oy + ty * T;
        if (type === "agri") { ctx.fillStyle = "#6a4a2a"; ctx.fillRect(x + 1, y + 6, 8, 3); ctx.fillStyle = i % 2 ? "#3aa55e" : "#63c26e"; ctx.fillRect(x + 2, y + 2, 2, 4); ctx.fillRect(x + 5, y + 1, 2, 5); }
        else if (type === "mining") { ctx.fillStyle = "#5d6680"; ctx.fillRect(x + 1, y + 4, 8, 4); ctx.fillStyle = "#9aa5bd"; ctx.fillRect(x + 2, y + 2, 6, 2); ctx.fillStyle = "#c7a54a"; ctx.fillRect(x + 3 + (i % 3), y + 3, 1, 1); }
        else if (type === "research") { ctx.fillStyle = "#2c3550"; ctx.fillRect(x + 1, y + 3, 8, 5); ctx.fillStyle = Math.floor(g.world.time * 2 + i) % 2 ? "#63f2c8" : "#5ab3ff"; ctx.fillRect(x + 2 + (i % 2) * 3, y + 4, 2, 1); }
        else if (type === "refinery") { ctx.fillStyle = "#6a7a9c"; ctx.fillRect(x, y + 4, 10, 2); ctx.fillRect(x + 4, y + 1, 2, 3); ctx.fillStyle = "#ff9a3a"; if (Math.floor(g.world.time * 3 + i) % 4 === 0) ctx.fillRect(x + 4, y, 2, 1); }
        else if (type === "trade") { ctx.fillStyle = i % 2 ? "#6a4a2a" : "#7a5a3a"; ctx.fillRect(x + 1, y + 3, 4, 4); ctx.fillRect(x + 5, y + 5, 4, 3); ctx.fillStyle = "#c7a54a"; ctx.fillRect(x + 2, y + 3, 1, 1); }
        else if (type === "military") { ctx.fillStyle = "#5d6680"; ctx.fillRect(x + 1, y + 2, 8, 6); ctx.fillStyle = "#ff5a5a"; ctx.fillRect(x + 3, y + 4, 1, 1); ctx.fillRect(x + 6, y + 4, 1, 1); }
      });
    }
    // NPCs
    for (const n of this.npcs) {
      const x = Math.round(ox + n.x), y = Math.round(oy + n.y);
      ctx.fillStyle = n.skin;
      ctx.fillRect(x - 2, y - 4, 4, 3);
      ctx.fillStyle = n.suit;
      ctx.fillRect(x - 3, y - 1, 6, 5);
    }

    // player
    const px = Math.round(ox + this.px), py = Math.round(oy + this.py);
    ctx.fillStyle = "#e8b48c";
    ctx.fillRect(px - 2, py - 4, 4, 3);
    ctx.fillStyle = "#3a6ea5";
    ctx.fillRect(px - 3, py - 1, 6, 5);

    // NPC name on proximity
    for (const n of this.npcs) {
      if (dist(this.px, this.py, n.x, n.y) < 16) {
        const x = Math.round(ox + n.x), y = Math.round(oy + n.y);
        const label = n.tag ? `${n.name} - ${n.tag}` : n.name;
        drawText(ctx, label, x - textWidth(label) / 2, y - 12, n.tag ? PAL.gold : PAL.grey);
        if (n.line) drawText(ctx, "[E] TALK", x - textWidth("[E] TALK") / 2, y + 8, PAL.gold);
      } else if (n.tag) {
        const x = Math.round(ox + n.x), y = Math.round(oy + n.y);
        ctx.fillStyle = PAL.gold; ctx.fillRect(x - 1, y - 8, 2, 2); // a marker so you can spot your own people across the deck
      }
    }

    // kiosk tooltip
    const near = this.nearestKiosk();
    if (near) {
      const kx = ox + near.tx * T + T / 2;
      drawText(ctx, near.def.label, kx - textWidth(near.def.label) / 2, oy + near.ty * T - 9, PAL.ui);
      const hint = near.def.tab === null ? "[E] BOARD SHIP + UNDOCK" : near.def.tab === -1 ? "[E] TREAT SICK CREW (120CR EACH)" : near.def.tab === -2 ? "[E] ASK" : "[E] USE";
      drawText(ctx, hint, kx - textWidth(hint) / 2, oy + near.ty * T + T + 3, PAL.gold);
    }

    // header
    drawText(ctx, `${this.station.name.toUpperCase()} - PROMENADE`, 8, 6, PAL.white);
    drawText(ctx, `${fac.name}${this.station.military ? " - MILITARY" : ""}`, 8, 15, fac.color);
    drawText(ctx, "WASD WALK - E USE - ESC SERVICES MENU", VW - textWidth("WASD WALK - E USE - ESC SERVICES MENU") - 6, 6, PAL.greyDark);
    if (this.station.military) {
      drawText(ctx, "ARMED GUARDS WATCH THE DECK", VW - textWidth("ARMED GUARDS WATCH THE DECK") - 6, 15, PAL.danger);
    }

    if (this.msg) {
      if (textWidth(this.msg) <= VW - 16) drawText(ctx, this.msg, VW / 2 - textWidth(this.msg) / 2, VH - 12, PAL.ui);
      else {
        // two lines, broken at a space near the middle
        const words = this.msg.split(" "); let a = "", b = "";
        for (const wd of words) { if (textWidth(a + " " + wd) <= VW - 16 && !b) a = a ? a + " " + wd : wd; else b = b ? b + " " + wd : wd; }
        drawText(ctx, a, VW / 2 - textWidth(a) / 2, VH - 21, PAL.ui);
        drawText(ctx, b, VW / 2 - textWidth(b) / 2, VH - 12, PAL.ui);
      }
    }
    if (g.toastTimer > 0) {
      drawText(ctx, g.toastMsg, VW / 2 - textWidth(g.toastMsg) / 2, VH - 22, PAL.ui);
    }
  }
}
