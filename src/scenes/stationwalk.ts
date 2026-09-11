// Station promenade: walk the station on foot. Kiosks open the service screens,
// NPCs wander the deck, the airlock takes you back to your ship.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { RNG, hashStr } from "../core/rng";
import { dist } from "../core/mathx";
import { sfx } from "../core/sfx";
import { flag } from "../core/achievements";
import { isBeltStation, beltGain, removeCargo } from "../world";
import { StationDef, findStation, isFriend, isRival, rivalOf, galaxyEventAt, dockingsAt, raceHolder, stakeDividend, weekKey, addCargo, logEntry, berthedCaptains, rivalryLine, handInLostItem, buyJuice, JUICE_PRICE, passengersAboard } from "../world";
import { occasionFor } from "../data/occasions";
import type { Encounter } from "../data/encounters";
import type { EncounterScene } from "./encounter";
import { wrap } from "./encounter";
import { faction, genPersonName } from "../data/data";
import { StationScene } from "./station";
import type { CrewMember } from "../data/crew";
import { finishLastLeg, lastLegAtPort } from "../core/lastleg";
import { concourseGossip } from "../data/gossip";
import { stationHour, clockText, tannoyLines } from "../data/tannoy";
import { dockhandLines, dockhandFavour } from "../data/dockhand";
import { voteMods, myVote } from "../data/votes";
import { hull, HULLS } from "../data/hulls";
import * as spriteMod from "../gfx/sprites";

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
  farewell?: CrewMember;
}

export class StationWalkScene implements Scene {
  touchMode = "walk" as const;
  px = 37 * T;
  py = 3 * T + 5;
  npcs: WalkerNpc[] = [];
  bubbles: { n: WalkerNpc; text: string; life: number }[] = [];
  tannoy = ""; tannoyT = 0;
  gossipCd = 1;
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
    const night = stationHour(this.station).night;
    const curfew = night && voteMods(g.world, this.station.factionId).curfew;
    const n = (this.station.military ? 4 : 6) - (night ? 2 : 0) - (curfew ? 2 : 0);
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
    // the dock-hand, by your clamp, with an opinion about the hull
    { const dx = 36 * T + 4, dy = 4 * T + 4; this.npcs.push({ x: dx, y: dy, tx: dx, ty: dy, name: genPersonName(new RNG(hashStr(`dockhand:${this.station.id}`))), skin: "#c78a5a", suit: "#c7a54a", pause: 1e9, tag: "DOCK-HAND", line: `DOCK-HAND: ${new RNG((Math.random() * 1e9) >>> 0).pick(dockhandLines(g.world, this.station, rng))}` }); }
    // your own people, out on the deck: crew on shore leave here, and shipmates who retired here
    const p = g.world.player;
    const waiting = p.crew.filter(c => lastLegAtPort(g.world, c));
    for (const [i, c] of waiting.entries()) {
      const spot = i === 0 ? { x: 365, y: 75 } : this.randomFloor(rng);
      this.npcs.push({ x: spot.x, y: spot.y, tx: spot.x, ty: spot.y, name: c.name,
        skin: "#e8b48c", suit: "#c7a54a", pause: 1e9, tag: "LAST JOURNEY", farewell: c,
        line: "THE BAG IS PACKED. THE REST OF THE CREW ARE WAITING TO SAY GOODBYE." });
    }
    if (waiting.length) {
      const partySpots = [{ x: 355, y: 85 }, { x: 375, y: 85 }];
      for (const [i, c] of p.crew.filter(c => !waiting.includes(c)).slice(0, 2).entries()) {
        const spot = partySpots[i];
        this.npcs.push({ x: spot.x, y: spot.y, tx: spot.x, ty: spot.y, name: c.name,
          skin: "#c78a5a", suit: "#5d6680", pause: 1e9, tag: "SHIPMATE",
          line: `${c.name.toUpperCase()}: SOMEONE HAS TO CARRY THE BAG. NONE OF US WANTED THAT TO BE OUR LAST JOB TOGETHER.` });
      }
    }
    for (const sl of (p.shoreCrew ?? []).filter((x) => x.stationId === this.station.id)) {
      const spot = this.randomFloor(rng);
      this.npcs.push({ x: spot.x, y: spot.y, tx: spot.x, ty: spot.y, name: sl.member.name, skin: "#c78a5a", suit: sl.member.role === "engineer" ? "#c7a54a" : sl.member.role === "gunner" ? "#a53a3a" : sl.member.role === "pilot" ? "#3a6ea5" : "#3aa55e", pause: 2, tag: "ON LEAVE",
        line: rng.pick([`${sl.member.name.toUpperCase()}: 'Not yet, Captain. Two more days. I ${sl.member.trait ?? "sleep"} and it's glorious.'`, `${sl.member.name.toUpperCase()}: 'Berth's still mine, right? Good. Go on, I'll find you when you dock next.'`, `${sl.member.name.toUpperCase()}: 'They've got real coffee here. REAL coffee. Don't wait for me.'`]) });
    }
    // a crew member's people, when you dock at their home port: a line, a small gift, a lift for them
    for (const c of p.crew.filter((x) => x.home === this.station.id && !x.sick).slice(0, 2)) {
      const spot = this.randomFloor(rng);
      const rel = rng.pick(["mother", "father", "sister", "brother", "daughter", "old friend"]);
      const first = c.name.split(" ")[0];
      const key = `family:${this.station.id}:${c.name}:${weekKey()}`;
      this.npcs.push({ x: spot.x, y: spot.y, tx: spot.x, ty: spot.y, name: `${first}'s ${rel}`, skin: "#e8b48c", suit: "#7a5aa5", pause: 4, tag: "FAMILY",
        line: (p.flags ?? {})[key] ? `${first.toUpperCase()}'S ${rel.toUpperCase()}: 'YOU AGAIN. GOOD. BRING THEM HOME SAFE.'` : `${first.toUpperCase()}'S ${rel.toUpperCase()}: 'SO YOU'RE THE CAPTAIN. ${rng.pick(["THEY WRITE ABOUT YOU. MOSTLY GOOD.", "THEY DON'T WRITE ENOUGH. TELL THEM.", "THEY SOUND HAPPY. THAT'S NEW."])} HERE, TAKE THIS FOR THE GALLEY.'` });
    }
    // berth neighbours: a captain you know, ship in the bay, walking off the jump
    for (const c of berthedCaptains(g.world, this.station.id)) {
      const spot = this.randomFloor(rng);
      const first = c.name.split(" ")[0];
      this.npcs.push({ x: spot.x, y: spot.y, tx: spot.x, ty: spot.y, name: c.name, skin: "#d8a070", suit: isRival(c) ? "#8a2a2a" : "#2a6a8a", pause: 3, tag: isRival(c) ? "RIVAL" : isFriend(c) ? "FRIEND" : "CAPTAIN",
        line: isRival(c) ? `${c.name.toUpperCase()}: '${rivalryLine(g.world, c, rng)}'` : rng.pick([`${c.name.toUpperCase()}: 'Berthed two down from you. The ${c.ship} needs a week in the yard and I need a drink. Come find me.'`, `${c.name.toUpperCase()}: 'Saw your name on the board. ${first}'s rule: never dock hungry. There's a stall by the lift. Go.'`, `${c.name.toUpperCase()}: 'The ${c.ship} came in on fumes. Don't tell control. Tell nobody. Tell the bar, they'll buy me one.'`]) });
    }
    for (const a of (p.alumni ?? []).filter((x) => x.stationId === this.station.id).slice(-2)) {
      const spot = this.randomFloor(rng);
      this.npcs.push({ x: spot.x, y: spot.y, tx: spot.x, ty: spot.y, name: a.name, skin: "#e8b48c", suit: "#5d6680", pause: 4, tag: "RETIRED",
        line: a.finalJourney ? `${a.name.toUpperCase()}: 'You brought me to the place I chose. The kettle is on. Tell me where you went next.'` : rng.pick([`${a.name.toUpperCase()}: '${a.docks} dockings with you. I still count the gates in my sleep. How's the old ship?'`, `${a.name.toUpperCase()}: 'They let me run the ${a.role === "engineer" ? "yard" : a.role === "medic" ? "clinic" : a.role === "gunner" ? "range" : a.role === "captain" ? "harbour office" : "tug"} here. Quieter. Good quiet.'`, a.role === "captain" ? `${a.name.toUpperCase()}: 'How's my ship? Don't answer that. She's yours now. Fly her like you stole her.'` : `${a.name.toUpperCase()}: 'If you ever need a ${a.role} again... no. No, I'm done. But it was good.'`]) });
    }
    // fares waiting for a ship, luggage at their feet
    const stScene = (g.scenes["station"] as StationScene | undefined);
    for (const f of (stScene?.fares ?? []).slice(0, 3)) {
      const spot = this.randomFloor(rng);
      this.npcs.push({ x: spot.x, y: spot.y, tx: spot.x, ty: spot.y, name: f.passengerName ?? "A FARE", skin: f.passengerKind === "singer" ? "#63f2c8" : rng.pick(["#e8b48c", "#c78a5a", "#f0d0b0"]), suit: f.passengerKind === "vip" ? "#c7a54a" : f.passengerKind === "tourist" ? "#5ab3ff" : "#7a5aa5", pause: 6, tag: "WAITING FOR A SHIP",
        line: `${(f.passengerName ?? "").toUpperCase()}: '${f.desc.split(". ")[0]}. Ask at the lounge if you've a cabin.'` });
    }
    // the ship's cat, if she's slipped out: a small walker with opinions, and a homecoming if she was left here before
    if (p.cat && p.catAway === this.station.id) {
      p.catAway = null; g.toast(`${p.cat.name.toUpperCase()} IS WAITING BY THE AIRLOCK, LOOKING SMUG AND A LITTLE FATTER. SHE'S BEEN FED.`);
    } else if (p.cat && !p.catAway && Math.random() < 0.25) {
      const spot = this.randomFloor(rng);
      this.npcs.push({ x: spot.x, y: spot.y, tx: spot.x, ty: spot.y, name: p.cat.name, skin: "#e0b070", suit: "#e0b070", pause: 1, tag: "YOUR CAT", line: `${p.cat.name.toUpperCase()} LOOKS AT YOU AS IF YOU'RE THE ONE WHO WANDERED OFF. SHE FOLLOWS YOU BACK TO THE SHIP.` });
      this.msg = `${p.cat.name.toUpperCase()} HAS SLIPPED OUT ONTO THE PROMENADE. FIND HER BEFORE YOU LEAVE (E BESIDE HER)`; this.msgTimer = 6;
    }
    // the crowd matches the day: stalls on market day, pickets in a strike, revellers at a festival, mourners on remembrance
    {
      const oc = occasionFor();
      const ev = galaxyEventAt(g.world, p.systemId);
      const crowd: { tag: string; suit: string; lines: string[]; n: number }[] = [];
      if (oc.id === "market") crowd.push({ tag: "STALLHOLDER", suit: "#c7a54a", n: 3, lines: ["'Fresh in from the belt! Well. Fresh-ish.'", "'Two for the price of one and a half. Market day, captain.'", "'Don't squeeze the fruit. Or do. I'm not your mother.'"] });
      if (isBeltStation(this.station)) crowd.push({ tag: "ROCK KID", suit: "#d9a066", n: 2, lines: ["'Is that your ship? The one with the dent? My mam says the dent means it's been somewhere.'", "'I've never been down a well. What's it like when things fall? ... Down? Just down? That's stupid.'", "'The inners send water in bottles. You brought it in a tank. Everybody says so.'", "'When I'm big I'm flying a rock hopper. Or yours. Yours if you're still around. Are you still going to be around?'", "'Show us the airlock. Just the outside. Just the button. We won't press it. We might press it.'"] });
      { const kid = p.crew.find((c) => c.cadet && c.home === this.station.id); if (kid) crowd.push({ tag: "CADET'S MAM", suit: "#c77a9a", n: 1, lines: [`'You're the captain. ${kid.name.split(" ")[0]} wrote. Are they eating? Don't tell me. I can see from here they're not eating.'`, `'The dent's smaller than in the drawing. ${kid.name.split(" ")[0]} always did exaggerate. Gets it from their father.'`, `'Bring them back with all their fingers and I'll never ask you for anything else. I'll ask you for other things.'`] }); }
      if (this.station.military) crowd.push({ tag: "MARINE", suit: "#3a6a3a", n: 2, lines: ["'Brig's aft of the yard, captain. Transfers sign in there. Don't let them talk to you on the way. They all talk.'", "'Board of inquiry sits at ten. You're not on the list. That's the good version of that sentence.'", "'Emergency call went out an hour ago. Reactor, next system over. If you've an engineer aboard, the board's got your name on it already.'", "'We don't salute merchants. ... All right, we salute the ones with a rank. Carry on, captain.'", "'Patrol orders on the board for anyone with a stripe. Hold station, show the flag, come home. It's not hard. People make it hard.'"] });
      if (oc.id === "remembrance") crowd.push({ tag: "MOURNER", suit: "#5d6680", n: 2, lines: ["'My brother flew the lanes. They read his name at noon.'", "'It's a good list. A long one. Mind how you go out there.'"] });
      if (night && !curfew) {
        // the band: three of them in the lower corridor, clear of the kiosks, standing their set
        const lines = ["'REQUESTS IN THE HAT. NO, NOT THAT ONE. EVERYBODY ASKS FOR THAT ONE.'", "'WE PLAY THE NIGHT SHIFT BECAUSE THE NIGHT SHIFT LISTENS.'", "'ONE MORE, THEN THE BAR CLOSES. THE BAR DOESN'T CLOSE. ONE MORE ANYWAY.'"];
        [12, 13, 14].forEach((tx, i) => { const x = tx * T + T / 2, y = 8 * T + T / 2; this.npcs.push({ x, y, tx: x, ty: y, name: genPersonName(rng), skin: rng.pick(["#e8b48c", "#c78a5a", "#8c5a3a"]), suit: "#e060ff", pause: 1e9, tag: "THE BAND", line: `THE BAND: ${lines[i]}` }); });
      }
      if (ev?.kind === "strike" && ev.stationId === this.station.id) crowd.push({ tag: "PICKET", suit: "#a53a3a", n: 3, lines: ["'No yard work at standard rates! Not until they pay the night shift!'", "'You want your hull patched, captain? Tell the harbourmaster to settle.'", "'We're not against you. We're against them. Have a sandwich.'"] });
      if (ev?.kind === "festival" && ev.stationId === this.station.id) crowd.push({ tag: "REVELLER", suit: "#e060ff", n: 3, lines: ["'FESTIVAL! Are you the band? You look like the band.'", "'Three days of this. My feet are gone. I regret nothing.'", "'Tourists everywhere. Bless them. They tip.'"] });
      for (const c of crowd) for (let i = 0; i < c.n; i++) { const spot = this.randomFloor(rng); this.npcs.push({ x: spot.x, y: spot.y, tx: spot.x, ty: spot.y, name: genPersonName(rng), skin: rng.pick(["#e8b48c", "#c78a5a", "#f0d0b0"]), suit: c.suit, pause: rng.range(1, 5), tag: c.tag, line: c.lines[i % c.lines.length] }); }
    }
    this.msg = waiting.length ? `${waiting[0].name.toUpperCase()} IS ON THE LOWER RIGHT DECK. E TO SAY GOODBYE.` : `${this.station.name.toUpperCase()} PROMENADE`;
    this.msgTimer = waiting.length ? 12 : 3;
    this.bubbles = []; this.gossipCd = 1;
    this.tannoy = ""; this.tannoyT = 2;
  }
  farewell(g: Game, c: CrewMember): void {
    if (!lastLegAtPort(g.world, c)) return;
    const finish = (g2: Game, bonus: boolean) => {
      const line = finishLastLeg(g2.world, c, bonus);
      if (!line) return "THE FAREWELL COULDN'T BE SETTLED. CHECK THE CREW, PORT, AND CREDITS.";
      g2.autosave(); return line;
    };
    const enc: Encounter = { id: "last-leg-farewell", where: "space", weight: 0,
      title: `${c.name.toUpperCase()} - THE LAST ENTRY`,
      text: `${this.station.name.toUpperCase()}. THE SHIP'S CREW STAND ON THE DECK WITH ONE KIT BAG BETWEEN THEM. ${c.name.toUpperCase()} KEEPS LOOKING AT THE AIRLOCK, AS IF SOMEONE MIGHT CALL THE NEXT WATCH. 'THIS IS THE ONE, CAPTAIN. I'LL WRITE WHEN I'VE FOUND THE KETTLE.'`,
      options: [
        { label: "GO WELL. THANK YOU FOR THE WATCHES.", result: g2 => finish(g2, false) },
        { label: "TAKE 300CR TO GET SETTLED.", requires: g2 => g2.world.player.credits >= 300, result: g2 => finish(g2, true) },
        { label: "ANOTHER MINUTE TOGETHER.", result: () => "NOBODY MOVES. THERE IS TIME FOR ANOTHER MINUTE. COME BACK WHEN YOU'RE READY." },
      ],
    };
    (g.scenes.encounter as EncounterScene).open(g, enc, "stationwalk", true);
  }

  tickTannoy(g: Game, dt: number): void {
    this.tannoyT -= dt;
    if (this.tannoyT > 0) return;
    if (this.tannoy) { this.tannoy = ""; this.tannoyT = 14 + Math.random() * 16; return; }
    const rng = new RNG((Math.random() * 1e9) >>> 0);
    this.tannoy = rng.pick(tannoyLines(g.world, this.station, rng));
    this.tannoyT = 7;
    sfx.select();
  }
  // overheard: two walkers stop near each other and near you, and one of them says something
  tickGossip(g: Game, dt: number): void {
    for (const b of this.bubbles) b.life -= dt;
    this.bubbles = this.bubbles.filter((b) => b.life > 0);
    this.gossipCd -= dt; if (this.gossipCd > 0) return;
    this.gossipCd = 2;
    const rng = new RNG((Math.random() * 1e9) >>> 0);
    for (const a of this.npcs) {
      if (a.tag || a.pause <= 0 || this.bubbles.length >= 2 || this.bubbles.some((b) => b.n === a) || dist(a.x, a.y, this.px, this.py) > 90) continue;
      const b = this.npcs.find((o) => o !== a && !o.tag && o.pause > 0 && dist(a.x, a.y, o.x, o.y) < 20);
      if (b && rng.chance(0.3)) { this.bubbles.push({ n: a, text: concourseGossip(g.world, this.station, rng)[0], life: 5 }); a.pause = Math.max(a.pause, 5); b.pause = Math.max(b.pause, 5); }
    }
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
    // this port remembers you: dockings, your stake, your times, who you've landed here, how you voted
    {
      const st = this.station; const docks = dockingsAt(p, st.id);
      const held = p.stakes?.[st.id] ?? 0; const best = p.raceBest?.[st.id]; const holder = raceHolder(w, st);
      const landed = (p.guestbook ?? []).filter((e) => e.to === st.name).length;
      const mine = st.factionId !== "vex" ? myVote(w, st.factionId) : null;
      lines.push(`ON FILE HERE: ${docks} DOCKING${docks === 1 ? "" : "S"}${held ? `; ${held} SHARE${held > 1 ? "S" : ""} (~${stakeDividend(w, st)}CR A DOCKING)` : ""}${landed ? `; ${landed} FARE${landed > 1 ? "S" : ""} LANDED` : ""}${mine ? `; VOTED ${mine.toUpperCase()} THIS WEEK` : ""}`);
      lines.push(st.military ? "NO RING COURSE AT A NAVAL STATION." : `THE RINGS: LOCAL RECORD ${holder.t.toFixed(1)}S (${holder.name.toUpperCase()})${best !== undefined ? `, YOUR BEST ${best.toFixed(1)}S` : ", NO TIME OF YOURS YET"}`);
    }
    const lost = p.lostProperty ?? [];
    if (lost.length) lines.push(`LOST PROPERTY ABOARD YOUR SHIP: ${lost.map((it) => `${it.name.toUpperCase().split(",")[0]} (${it.owner.toUpperCase()})`).join("; ")}`.slice(0, 118));
    const enc: Encounter = { id: "harbour", where: "space", title: "HARBOURMASTER'S OFFICE", text: lines.join("\n"), weight: 0, options: [
      ...lost.map((it) => ({ label: `HAND IN ${it.name.toUpperCase().split(",")[0]}`, hint: it.stationId === this.station.id ? `${it.owner} got off here; the office has them on file` : `${it.owner} got off elsewhere; it'll be forwarded`, result: (g2: Game) => { sfx.pickup(); flag(g2, "lostfound"); return handInLostItem(g2.world, it, this.station.id); } })),
      ...(isBeltStation(this.station) && (p.cargo.water ?? 0) >= 1 ? [{ label: "A UNIT OF WATER FOR THE ROCK'S TANK", hint: "The tithe; belt standing, a little, and the office writes it down", result: (g2: Game) => { removeCargo(p, "water", 1); p.waterToBelt = (p.waterToBelt ?? 0) + 1; const bl = beltGain(g2.world, 0.2); flag(g2, "tithe"); logEntry(g2.world, `A unit of water for ${this.station.name}'s tank, the tithe`); return bl ?? "THE HARBOURMASTER WRITES IT IN THE BOOK WITHOUT LOOKING UP, WHICH ON A ROCK IS A CEREMONY. THE TANK IS A LITRE FULLER. THE BELT REMEMBERS THE SMALL THINGS TOO."; } }] : []),
      { label: "THANK THEM AND GO", result: () => "" }] };
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

    this.tickGossip(g, dt);
    this.tickTannoy(g, dt);
    // the cat comes first, kiosk or no kiosk
    if (inp.wasPressed("e")) {
      const farewell = this.npcs.find(n => n.farewell && dist(this.px, this.py, n.x, n.y) < 16);
      if (farewell && lastLegAtPort(g.world, farewell.farewell!)) { this.farewell(g, farewell.farewell!); return; }
      const cat = this.npcs.find((n) => n.tag === "YOUR CAT" && dist(this.px, this.py, n.x, n.y) < 16);
      if (cat) { this.npcs = this.npcs.filter((n) => n !== cat); this.msg = cat.line!; this.msgTimer = 5; sfx.purr(); for (const c of g.world.player.crew) c.morale = Math.min(100, c.morale + 1); return; }
      const retired = this.npcs.find(n => n.tag === "RETIRED" && dist(this.px, this.py, n.x, n.y) < 16);
      if (retired) { this.msg = retired.line!; this.msgTimer = 7; retired.pause = Math.max(retired.pause, 4); return; }
    }
    // kiosk interaction
    const near = this.nearestKiosk();
    if (inp.wasPressed("e") && !near) {
      const fam = this.npcs.find((n) => n.tag === "FAMILY" && dist(this.px, this.py, n.x, n.y) < 16);
      if (fam) {
        const first = fam.name.split("'")[0]; const c = g.world.player.crew.find((x) => x.name.split(" ")[0] === first);
        const key = `family:${this.station.id}:${c?.name ?? first}:${weekKey()}`;
        this.msg = fam.line!; this.msgTimer = 6;
        if (c && !(g.world.player.flags ?? {})[key]) { (g.world.player.flags ??= {})[key] = true; c.morale = Math.min(100, c.morale + 12); c.loyalty = (c.loyalty ?? 0) + 0.5; addCargo(g.world.player, "food", 1); flag(g, "family"); g.toast(`${c.name.toUpperCase()} IS GLAD YOU STOPPED. +1 PROVISIONS FOR THE GALLEY, MORALE UP`); sfx.pickup(); logEntry(g.world, `Met ${c.name}'s ${fam.name.split("'s ")[1] ?? "family"} at ${this.station.name}`); }
        return;
      }
      const kid = this.npcs.find((n) => n.tag === "ROCK KID" && dist(this.px, this.py, n.x, n.y) < 16);
      if (kid) {
        const p2 = g.world.player; const key = `kid:${this.station.id}`;
        this.msg = kid.line!; this.msgTimer = 6;
        if (!(p2.flags ?? {})[key]) { (p2.flags ??= {})[key] = true; p2.flags.rockkid = true; p2.beltStanding = (p2.beltStanding ?? 0) + 0.5; (g.world.mailQueue ??= []).push({ dueT: g.world.time + 700, from: `${kid.name.split(" ")[0]}'s mam, ${this.station.name}`, text: `${kid.name.split(" ")[0]} hasn't stopped talking about the ship with the dent. Enclosed is the drawing. The dent is in it. So, for some reason, is a dog. You don't have a dog. ${kid.name.split(" ")[0]} says you should. Thank you for stopping. Inners don't, usually.` }); (p2.keepsakes ??= []).push(`a rock kid's drawing of the ship, with a dog in it`); if (p2.keepsakes.length > 8) p2.keepsakes.shift(); flag(g, "rockkid"); logEntry(g.world, `Talked to a rock kid at ${this.station.name}; a drawing of the ship came later, with a dog in it`); }
        return;
      }
      const band = this.npcs.find((n) => n.tag === "THE BAND" && dist(this.px, this.py, n.x, n.y) < 16);
      if (band) {
        const p2 = g.world.player; const key = `band:${this.station.id}:${weekKey()}`;
        this.msg = band.line!; this.msgTimer = 6;
        if (!(p2.flags ?? {})[key]) { (p2.flags ??= {})[key] = true; for (const c of p2.crew) c.morale = Math.min(100, c.morale + 4); for (const m of passengersAboard(p2)) m.mood = Math.min(100, (m.mood ?? 60) + 4); flag(g, "encore"); logEntry(g.world, `Stood for a set on the night promenade at ${this.station.name}`); g.toast("YOU STAND FOR A SET. THE CREW DRIFT OVER. SOMEBODY REQUESTS THE ONE ABOUT THE GATE. MORALE UP."); sfx.select(); }
        return;
      }
      const dh = this.npcs.find((n) => n.tag === "DOCK-HAND" && dist(this.px, this.py, n.x, n.y) < 16);
      if (dh) { this.msg = dh.line!; this.msgTimer = 6; const f = dockhandFavour(g.world, this.station, new RNG((Math.random() * 1e9) >>> 0)); if (f) { g.toast(f); sfx.repair(); if (f.includes("ON THE HOUSE")) flag(g, "dockhand"); } else sfx.select(); return; }
      const cap = this.npcs.find((n) => (n.tag === "FRIEND" || n.tag === "RIVAL" || n.tag === "CAPTAIN") && dist(this.px, this.py, n.x, n.y) < 16);
      if (cap) {
        const c = (g.world.captains ?? []).find((x) => x.name === cap.name);
        this.msg = cap.line!; this.msgTimer = 6; cap.pause = Math.max(cap.pause, 4);
        const key = `berth:${this.station.id}:${cap.name}:${weekKey()}`;
        if (c && !(g.world.player.flags ?? {})[key]) {
          (g.world.player.flags ??= {})[key] = true; c.met++; c.lastSeen = g.world.time; flag(g, "neighbour");
          if (isRival(c)) { sfx.select(); logEntry(g.world, `Ran into ${c.name} on the promenade at ${this.station.name}. Words were had`); }
          else { const gift = Math.random() < 0.5 ? "parts" : "credits"; if (gift === "parts" && addCargo(g.world.player, "parts", 1)) { g.toast(`${c.name.toUpperCase()} HANDS OVER A SPARE FROM THE ${c.ship.toUpperCase()}. +1 SPARE PART. "YOU'LL NEED IT BEFORE I DO."`); } else { g.world.player.credits += 60; g.toast(`${c.name.toUpperCase()} SETTLES AN OLD ROUND. +60CR. "DON'T ARGUE. NEXT ONE'S YOURS."`); } sfx.pickup(); logEntry(g.world, `Met ${c.name} off the ${c.ship} on the promenade at ${this.station.name}`); }
        }
        return;
      }
      const who = this.npcs.find((n) => dist(this.px, this.py, n.x, n.y) < 16);
      if (who) { if (!who.line) who.line = `${who.name.toUpperCase()}: ${concourseGossip(g.world, this.station, new RNG((Math.random() * 1e9) >>> 0))[0]}`; this.msg = who.line; this.msgTimer = 6; who.pause = Math.max(who.pause, 4); }
    }
    if (near && inp.wasPressed("e")) {
      if (near.def.tab === -2) { this.harbourmaster(g); return; }
      if (near.def.tab === -1) {
        // the clinic: sick crew back on their feet for a fee, and the juice for a hard burn
        const p = g.world.player;
        const sick = p.crew.filter((c) => c.sick);
        const fee = 120 * sick.length;
        const enc: Encounter = { id: "clinic", where: "space", title: "THE CLINIC", weight: 0,
          text: `${sick.length ? `${sick.map((c) => c.name).join(" and ")} on the cots, ${fee}cr to put them right.` : "Everyone's fine. The medic looks almost disappointed."} On the shelf behind the counter: burn juice, ${JUICE_PRICE}cr a dose. One hard burn each, until you dock or jump. Faster cruise, keener thrust, a frame and a crew that pay for it. ${p.juice ?? 0} aboard.`,
          options: [
            ...(sick.length ? [{ label: `TREAT THE SICK (${fee}CR)`, requires: () => p.credits >= fee, result: () => { p.credits -= fee; for (const c of sick) { c.sick = null; c.morale = Math.min(100, c.morale + 5); } return `${sick.map((c) => c.name.toUpperCase()).join(" AND ")} TREATED, -${fee}CR. 'REST. REAL REST. I KNOW YOU WON'T.'`; } }] : []),
            { label: `BUY BURN JUICE (${JUICE_PRICE}CR)`, hint: "Hard burn from the pause menu in flight", result: () => { const l = buyJuice(p); if (l.includes("-")) sfx.pickup(); return l; } },
            { label: "LEAVE", result: () => "" },
          ] };
        (g.scenes["encounter"] as EncounterScene).open(g, enc, "stationwalk", true);
        return;
      }
      if (near.def.tab === null) {
        const loose = this.npcs.find((n) => n.tag === "YOUR CAT");
        if (loose && g.world.player.cat) { g.world.player.catAway = this.station.id; this.npcs = this.npcs.filter((n) => n !== loose); g.toast(`YOU LEFT WITHOUT ${g.world.player.cat.name.toUpperCase()}. SHE'LL BE HERE WHEN YOU COME BACK. THE CREW WILL MENTION IT.`); }
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
    // the bays: your ship on the airlock side, a parked hull of yours across the deck, traffic below
    {
      const fit = (spr: HTMLCanvasElement, cx: number, cy: number, max: number) => { const sc = Math.min(1, max / Math.max(spr.width, spr.height)); ctx.drawImage(spr, Math.round(cx - spr.width * sc / 2), Math.round(cy - spr.height * sc / 2), Math.round(spr.width * sc), Math.round(spr.height * sc)); };
      const p = g.world.player;
      fit(g.playerShip(), ox + 37 * T, oy + 2.5 * T, 30);
      ctx.fillStyle = "#3a4a6c"; ctx.fillRect(ox + 35 * T + 2, oy + 4 * T + 4, 4 * T - 4, 1); // the clamp rail
      const parked = (p.fleet ?? []).find((f) => f.stationId === this.station.id);
      const guest = parked ? null : berthedCaptains(g.world, this.station.id)[0];
      if (guest) {
        const h = HULLS[hashStr(guest.ship) % HULLS.length];
        const spr = g.sprite(`hull-preview-${h.id}`, () => spriteMod.genShip(new RNG(g.world.seed ^ 0x51e9 ^ h.id.length), h.spriteSize, h.color, h.accent));
        fit(spr, ox + 2.5 * T, oy + 2.5 * T, 26);
        ctx.fillStyle = "#3a4a6c"; ctx.fillRect(ox + T + 2, oy + 4 * T + 4, 4 * T - 4, 1);
        const nm = guest.ship.toUpperCase().slice(0, 9);
        drawText(ctx, nm, ox + 2.5 * T - textWidth(nm) / 2, oy + 4 * T + 6, PAL.greyDark);
      }
      if (parked) {
        const h = hull(parked.hullId);
        const spr = g.sprite(`hull-preview-${h.id}`, () => spriteMod.genShip(new RNG(g.world.seed ^ 0x51e9 ^ h.id.length), h.spriteSize, h.color, h.accent));
        fit(spr, ox + 2.5 * T, oy + 2.5 * T, 26);
        ctx.fillStyle = "#3a4a6c"; ctx.fillRect(ox + T + 2, oy + 4 * T + 4, 4 * T - 4, 1);
        const nm = (parked.name ?? h.name).toUpperCase().slice(0, 9);
        drawText(ctx, nm, ox + 2.5 * T - textWidth(nm) / 2, oy + 4 * T + 6, PAL.greyDark);
      }
      const sx = ox + 28 * T + ((g.world.time * 9) % (11 * T)); const sy = oy + 9 * T + 4;
      ctx.fillStyle = "#9aa5bd"; ctx.fillRect(Math.round(sx), sy, 3, 2); ctx.fillStyle = Math.floor(g.world.time * 3) % 2 ? "#ff5a5a" : "#3aa55e"; ctx.fillRect(Math.round(sx) + 3, sy, 1, 1);
    }
    // the night shift: the deck lights are down
    if (stationHour(this.station).night) { ctx.fillStyle = "rgba(4,6,14,0.38)"; ctx.fillRect(ox, oy, DECK[0].length * T, DECK.length * T); }
    // NPCs
    for (const n of this.npcs) {
      const x = Math.round(ox + n.x), y = Math.round(oy + n.y);
      if (n.tag === "YOUR CAT") { ctx.fillStyle = "#e0b070"; ctx.fillRect(x - 2, y - 1, 4, 2); ctx.fillRect(x + 1, y - 3, 2, 2); ctx.fillStyle = "#3a2a1a"; ctx.fillRect(x - 3, y - 2, 1, 1); if (Math.floor(g.world.time * 2) % 4 === 0) { ctx.fillStyle = "#63f2c8"; ctx.fillRect(x + 2, y - 3, 1, 1); } continue; }
      ctx.fillStyle = n.skin;
      ctx.fillRect(x - 2, y - 4, 4, 3);
      ctx.fillStyle = n.suit;
      ctx.fillRect(x - 3, y - 1, 6, 5);
    }

    // overheard, over their heads
    const placed: { x: number; y: number; w: number }[] = [];
    for (const b of this.bubbles) {
      const w = textWidth(b.text) + 4;
      const bx = Math.max(2, Math.min(VW - w - 2, Math.round(ox + b.n.x - w / 2))); let by = Math.round(oy + b.n.y) - 24;
      while (placed.some((q) => Math.abs(q.y - by) < 10 && bx < q.x + q.w + 2 && q.x < bx + w + 2)) by -= 10;
      placed.push({ x: bx, y: by, w });
      ctx.fillStyle = "#0b1020"; ctx.fillRect(bx, by - 1, w, 9);
      ctx.fillStyle = "#2a3550"; ctx.fillRect(Math.max(bx + 2, Math.min(bx + w - 4, Math.round(ox + b.n.x) - 1)), by + 8, 2, 2);
      drawText(ctx, b.text, bx + 2, by, PAL.grey);
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
    { const t = stationHour(this.station); drawText(ctx, `${this.station.name.toUpperCase()} - PROMENADE - ${clockText(t)} STATION TIME, ${t.label}`, 8, 6, PAL.white); }
    if (this.tannoy) { const lines = wrap(`TANNOY: ${this.tannoy}`, 90).slice(0, 2); lines.forEach((tl, i) => drawText(ctx, tl, VW / 2 - textWidth(tl) / 2, 26 + i * 8, PAL.gold)); }
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
      // the toast sits above the message, one line higher when the message wraps to two
      drawText(ctx, g.toastMsg, VW / 2 - textWidth(g.toastMsg) / 2, this.msg && textWidth(this.msg) > VW - 16 ? VH - 31 : VH - 22, PAL.ui);
    }
  }
}
