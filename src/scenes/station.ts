// Station scene: docked services — market, shipyard, ships, missions, bar (crew), storage, news.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth, CHAR_H } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { RNG } from "../core/rng";
import { clamp } from "../core/mathx";
import { commodity, faction } from "../data/data";
import { HULLS, hull } from "../data/hulls";
import { ROLE_INFO, CrewMember } from "../data/crew";
import {
  StationDef, Mission, genMissionsFor, cargoUsed, addCargo, removeCargo, findStation,
  buyPrice, sellPrice, refreshPrices, missionDeliverable, adjustRep, repLabel, missionTier,
  crewWages, genCrewCandidate, applyHull, pushEvent, ARCS,
} from "../world";
import { sfx } from "../core/sfx";
import { music } from "../core/music";

const TABS = ["MARKET", "SHIPYARD", "SHIPS", "MISSIONS", "BAR", "STORAGE", "NEWS"] as const;

export class StationScene implements Scene {
  touchMode = "menu" as const;
  tab = 0;
  cursor = 0;
  boardMissions: Mission[] = [];
  barLine = "";
  candidates: CrewMember[] = [];
  station!: StationDef;
  returnTo: "flight" | "stationwalk" = "flight";
  rowBoxes: [number, number][] = [];
  arrivedOnce = "";

  enter(g: Game): void {
    const found = findStation(g.world, g.world.player.dockedAt!);
    if (!found) { g.setScene("flight"); return; }
    this.station = found.st;
    this.tab = 0;
    this.cursor = 0;
    this.returnTo = "flight";
    const p = g.world.player;
    const rng = new RNG((g.world.seed ^ this.station.id.length * 2711 ^ Math.floor(g.world.time / 60)) >>> 0);
    this.boardMissions = genMissionsFor(g.world, this.station, rng);
    this.candidates = [];
    for (let i = 0; i < rng.int(1, 3); i++) this.candidates.push(genCrewCandidate(rng.fork(i + 1)));
    this.barLine = "";
    refreshPrices(this.station);
    p.oxygen = p.oxygenMax;
    // docking is where the crew gets paid and fed — once per docking event
    const dockKey = `${this.station.id}:${Math.floor(g.world.time)}`;
    if (this.arrivedOnce !== dockKey) {
      this.arrivedOnce = dockKey;
      this.settleCrew(g);
    }
    g.showHint("station", "ARROWS/CLICK TO BROWSE - ENTER TO ACT - ESC UNDOCKS - P WALKS THE DECK");
  }

  settleCrew(g: Game): void {
    const p = g.world.player;
    if (!p.crew.length) return;
    const wages = crewWages(p);
    if (p.credits >= wages) { p.credits -= wages; g.toast(`CREW WAGES PAID -${wages}CR`); }
    else { for (const c of p.crew) c.morale = Math.max(0, c.morale - 20); g.toast("CAN'T PAY WAGES - CREW MORALE DROPS"); }
    for (const c of p.crew) {
      if ((p.cargo.food ?? 0) > 0) { removeCargo(p, "food", 1); c.morale = Math.min(100, c.morale + 8); }
      else c.morale = Math.max(0, c.morale - 15);
    }
    const quitters = p.crew.filter((c) => c.morale <= 5);
    for (const q of quitters) g.toast(`${q.name.toUpperCase()} WALKED OFF THE SHIP`);
    p.crew = p.crew.filter((c) => c.morale > 5);
  }

  update(g: Game, dt: number): void {
    const inp = g.input;
    music.setMood(this.station.factionId, 0);
    if (inp.wasPressed("Escape")) {
      if (this.returnTo === "stationwalk") g.setScene("stationwalk");
      else { g.world.player.dockedAt = null; g.setScene("flight"); g.toast("UNDOCKED"); }
      return;
    }
    if (inp.wasPressed("p")) { g.setScene("stationwalk"); return; }
    if (inp.wasPressed("F5")) g.save();
    if (inp.wasPressed("ArrowLeft") || inp.wasPressed("q")) { this.tab = (this.tab + TABS.length - 1) % TABS.length; this.cursor = 0; }
    if (inp.wasPressed("ArrowRight") || inp.wasPressed("e")) { this.tab = (this.tab + 1) % TABS.length; this.cursor = 0; }
    if (inp.wasPressed("ArrowUp")) { this.cursor--; sfx.blip(); }
    if (inp.wasPressed("ArrowDown")) { this.cursor++; sfx.blip(); }
    if (inp.wheel) this.cursor += Math.sign(inp.wheel);

    let clickedRow = false;
    if (inp.mousePressed) {
      let tx = 8;
      for (let i = 0; i < TABS.length; i++) {
        const w = textWidth(TABS[i]) + 10;
        if (inp.mouseY >= 36 && inp.mouseY <= 50 && inp.mouseX >= tx - 4 && inp.mouseX < tx + w - 4) { this.tab = i; this.cursor = 0; }
        tx += w;
      }
    }
    if (inp.mouseX > 4 && inp.mouseX < 476) {
      const row = this.rowBoxes.findIndex(([y0, y1]) => inp.mouseY >= y0 && inp.mouseY <= y1);
      if (row >= 0) { this.cursor = row; if (inp.mousePressed) clickedRow = true; }
    }

    const p = g.world.player;
    const st = this.station;
    const rep = p.rep[st.factionId] ?? 0;
    const enter = inp.wasPressed("Enter") || inp.wasPressed(" ") || clickedRow;
    if (enter) sfx.select();

    switch (TABS[this.tab]) {
      case "MARKET": {
        const rows = Object.keys(st.prices);
        this.cursor = clamp(this.cursor, 0, rows.length - 1);
        const id = rows[this.cursor];
        if (enter || inp.wasPressed("b")) {
          const price = buyPrice(st, id, rep);
          if ((st.stock[id] ?? 0) <= 0) g.toast("OUT OF STOCK");
          else if (p.credits < price) g.toast("NOT ENOUGH CREDITS");
          else if (!addCargo(p, id, 1)) g.toast("CARGO FULL");
          else { p.credits -= price; st.stock[id]--; refreshPrices(st); g.showHint("trade", "PRICES MOVE: BUY WHERE STOCK IS HIGH, SELL WHERE IT'S LOW"); }
        }
        if (inp.wasPressed("s") || inp.wasPressed("Backspace")) {
          const price = sellPrice(st, id, rep);
          if (!removeCargo(p, id, 1)) g.toast("NONE IN CARGO");
          else { p.credits += price; st.stock[id] = (st.stock[id] ?? 0) + 1; refreshPrices(st); }
        }
        break;
      }
      case "SHIPYARD": {
        const options = this.shipyardOptions(g);
        this.cursor = clamp(this.cursor, 0, options.length - 1);
        if (enter) options[this.cursor].action();
        break;
      }
      case "SHIPS": {
        this.cursor = clamp(this.cursor, 0, HULLS.length - 1);
        if (enter) this.buyHull(g, HULLS[this.cursor].id);
        break;
      }
      case "MISSIONS": {
        const avail = this.boardMissions.filter((m) => !m.accepted);
        const deliverable = p.missions.filter((m) => missionDeliverable(g.world, m, st));
        const rows = deliverable.length + avail.length;
        this.cursor = clamp(this.cursor, 0, Math.max(0, rows - 1));
        if (enter) {
          if (this.cursor < deliverable.length) this.completeMission(g, deliverable[this.cursor]);
          else {
            const m = avail[this.cursor - deliverable.length];
            if (m) this.acceptMission(g, m);
          }
        }
        break;
      }
      case "BAR": {
        const rows = st.barPatrons.length + this.candidates.length;
        this.cursor = clamp(this.cursor, 0, Math.max(0, rows - 1));
        if (enter) {
          if (this.cursor < st.barPatrons.length) {
            const rng = new RNG((g.world.seed ^ (this.cursor * 7727) ^ Math.floor(g.world.time / 20)) >>> 0);
            this.barLine = rng.pick(BAR_LINES)(g, this.station);
          } else {
            const c = this.candidates[this.cursor - st.barPatrons.length];
            if (c) this.hire(g, c);
          }
        }
        break;
      }
      case "STORAGE": {
        const held = Object.keys(p.cargo);
        const stored = Object.keys(p.storage[st.id] ?? {});
        const rows = held.length + stored.length;
        this.cursor = clamp(this.cursor, 0, Math.max(0, rows - 1));
        if (enter && rows) {
          p.storage[st.id] ??= {};
          const box = p.storage[st.id];
          if (this.cursor < held.length) {
            const id = held[this.cursor];
            if (removeCargo(p, id, 1)) box[id] = (box[id] ?? 0) + 1;
          } else {
            const id = stored[this.cursor - held.length];
            if (box[id] > 0 && addCargo(p, id, 1)) { box[id]--; if (box[id] <= 0) delete box[id]; }
            else g.toast("CARGO FULL");
          }
        }
        break;
      }
      case "NEWS":
        this.cursor = clamp(this.cursor, 0, g.world.news.length - 1);
        break;
    }
  }

  acceptMission(g: Game, m: Mission): void {
    const p = g.world.player;
    const st = this.station;
    if (p.missions.filter((x) => x.accepted && !x.done).length >= 5) { g.toast("MISSION LOG FULL"); return; }
    if (m.kind === "passenger" && p.missions.some((x) => x.kind === "passenger" && x.accepted && !x.done)) { g.toast("ONE PASSENGER AT A TIME"); return; }
    if (m.tier && m.tier > missionTier(p.rep[st.factionId] ?? 0)) { g.toast("YOUR STANDING ISN'T HIGH ENOUGH"); return; }
    if ((m.kind === "delivery" || (m.kind === "arc" && m.commodityId && m.arcStage !== undefined && ARCS[m.arcFaction!].stages[m.arcStage].kind === "delivery")) && m.commodityId && m.qty) {
      if (!addCargo(p, m.commodityId, m.qty)) { g.toast("NOT ENOUGH CARGO SPACE"); return; }
    }
    m.accepted = true;
    p.missions.push(m);
    g.toast("MISSION ACCEPTED");
    if (m.kind === "escort") g.showHint("escort", "THE FREIGHTER LAUNCHES WHEN YOU UNDOCK - STAY CLOSE");
    if (m.kind === "research") g.showHint("research", "IN THE TARGET SYSTEM, HOLD V TO DEEP-SCAN FOR THE SIGNAL");
    if (m.kind === "passenger") g.showHint("passenger", "YOUR PASSENGER IS IN THE BUNK ROOM - TALK TO THEM ABOARD (I)");
  }

  completeMission(g: Game, m: Mission): void {
    const p = g.world.player;
    const st = this.station;
    if (m.commodityId && m.qty && m.kind !== "research") removeCargo(p, m.commodityId, m.qty);
    m.done = true;
    p.credits += m.reward;
    adjustRep(g.world, st.factionId, m.repReward ?? 3);
    if (m.kind === "arc" && m.arcFaction !== undefined && m.arcStage !== undefined) {
      p.arcs[m.arcFaction] = m.arcStage + 1;
      const arc = ARCS[m.arcFaction];
      const finished = p.arcs[m.arcFaction] >= arc.stages.length;
      pushEvent(g.world, {
        t: g.world.time, kind: "arc", systemId: p.systemId,
        text: finished
          ? `${faction(m.arcFaction).name}: "${arc.title}" concludes — an independent pilot changed the balance in this region`
          : `${faction(m.arcFaction).name} moves on "${arc.title}" — sources credit a freelance captain`,
      });
      if (finished) { adjustRep(g.world, m.arcFaction, 25); g.toast(`ARC COMPLETE: ${arc.title.toUpperCase()}`); }
    }
    g.toast(`MISSION COMPLETE +${m.reward}CR`);
    sfx.pickup();
    p.missions = p.missions.filter((x) => !x.done);
    p.hints.firstMission ||= true;
  }

  hire(g: Game, c: CrewMember): void {
    const p = g.world.player;
    const slots = hull(p.hullId).crewSlots;
    const cost = c.wage * 3;
    if (p.crew.length >= slots) { g.toast(`NO BERTHS LEFT (${slots} ON THIS HULL)`); return; }
    if (p.credits < cost) { g.toast(`SIGNING BONUS ${cost}CR - NOT ENOUGH`); return; }
    p.credits -= cost;
    p.crew.push({ ...c });
    this.candidates = this.candidates.filter((x) => x !== c);
    g.toast(`${c.name.toUpperCase()} SIGNED ON AS ${ROLE_INFO[c.role].label}`);
    g.showHint("crew", "CREW LIVE ABOARD - VISIT THEM WITH I - KEEP FOOD IN CARGO");
  }

  buyHull(g: Game, id: string): void {
    const p = g.world.player;
    const h = hull(id);
    if (p.hullId === id) { g.toast("THIS IS YOUR CURRENT HULL"); return; }
    const tradeIn = Math.round(hull(p.hullId).price * 0.6);
    const cost = Math.max(0, h.price - tradeIn);
    if (p.credits < cost) { g.toast(`NEED ${cost}CR AFTER TRADE-IN`); return; }
    if (cargoUsed(p) > h.cargoMax) { g.toast(`CARGO WON'T FIT: ${cargoUsed(p)}/${h.cargoMax} - STORE OR SELL FIRST`); return; }
    if (p.crew.length > h.crewSlots) { g.toast(`TOO MUCH CREW FOR ${h.crewSlots} BERTHS`); return; }
    p.credits -= cost;
    applyHull(p, id);
    g.spriteCache.delete(`player-ship-${p.hullId}`);
    g.toast(`WELCOME ABOARD THE ${h.name.toUpperCase()}`);
    sfx.dock();
  }

  shipyardOptions(g: Game): { label: string; sub: string; action: () => void }[] {
    const p = g.world.player;
    const st = this.station;
    const opts: { label: string; sub: string; action: () => void }[] = [];
    const fuelNeed = Math.ceil(p.fuelMax - p.fuel);
    opts.push({ label: `REFUEL (${fuelNeed} UNITS)`, sub: `${fuelNeed * st.fuelPrice}CR`, action: () => {
      if (fuelNeed <= 0) return g.toast("TANKS FULL");
      const afford = Math.min(fuelNeed, Math.floor(p.credits / st.fuelPrice));
      p.fuel += afford; p.credits -= afford * st.fuelPrice;
      g.toast(afford < fuelNeed ? "PARTIAL REFUEL" : "REFUELED");
    } });
    const hullNeed = Math.ceil(p.hullMax - p.hull);
    opts.push({ label: `HULL REPAIR (${hullNeed} PTS)`, sub: `${hullNeed * st.repairPrice}CR`, action: () => {
      if (hullNeed <= 0) return g.toast("HULL INTACT");
      const afford = Math.min(hullNeed, Math.floor(p.credits / st.repairPrice));
      p.hull += afford; p.credits -= afford * st.repairPrice;
      p.breaches = []; p.fires = [];
      g.toast(afford < hullNeed ? "PARTIAL REPAIR" : "HULL RESTORED");
    } });
    const sysDamaged = p.systems.filter((s) => s.health < 100);
    opts.push({ label: `SERVICE ALL SYSTEMS (${sysDamaged.length})`, sub: `${sysDamaged.length * 60}CR`, action: () => {
      if (!sysDamaged.length) return g.toast("ALL SYSTEMS NOMINAL");
      const cost = sysDamaged.length * 60;
      if (p.credits < cost) return g.toast("NOT ENOUGH CREDITS");
      p.credits -= cost;
      for (const s of p.systems) s.health = 100;
      g.toast("SYSTEMS SERVICED");
    } });
    opts.push({ label: "BUY SPARE PARTS KIT", sub: `${st.prices["parts"] ?? 45}CR`, action: () => {
      const cost = st.prices["parts"] ?? 45;
      if (p.credits < cost) return g.toast("NOT ENOUGH CREDITS");
      if (!addCargo(p, "parts", 1)) return g.toast("CARGO FULL");
      p.credits -= cost; g.toast("PARTS STOWED IN CARGO");
    } });
    opts.push({ label: `CARGO POD +10 (NOW ${p.cargoMax})`, sub: "500CR", action: () => {
      if (p.credits < 500) return g.toast("NOT ENOUGH CREDITS");
      p.credits -= 500; p.cargoMax += 10; g.toast("CARGO EXPANDED");
    } });
    opts.push({ label: `SHIELD BOOSTER +25 (NOW ${p.shieldMax})`, sub: "800CR", action: () => {
      if (p.credits < 800) return g.toast("NOT ENOUGH CREDITS");
      p.credits -= 800; p.shieldMax += 25; g.toast("SHIELD CAPACITY UP");
    } });
    if (p.wanted > 0 && !st.military) {
      const cost = Math.round(p.wanted * 1000);
      opts.push({ label: "BRIBE RECORDS CLERK (CLEAR WARRANT)", sub: `${cost}CR`, action: () => {
        if (p.credits < cost) return g.toast("NOT ENOUGH CREDITS");
        p.credits -= cost; p.wanted = 0; g.toast("RECORDS... MISPLACED");
      } });
    }
    const rep = p.rep[st.factionId] ?? 0;
    if (rep < 0 && !st.military) {
      const cost = Math.round(-rep * 30);
      opts.push({ label: `CLEAN RECORD FEE (${faction(st.factionId).name.split(" ")[0]} REP → 0)`, sub: `${cost}CR`, action: () => {
        if (p.credits < cost) return g.toast("NOT ENOUGH CREDITS");
        p.credits -= cost; p.rep[st.factionId] = 0; g.toast("YOUR FILE IS CLEAN. FOR NOW.");
      } });
    }
    return opts;
  }

  // ---------- Draw ----------

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    this.rowBoxes = [];
    const p = g.world.player;
    const st = this.station;
    const fac = faction(st.factionId);
    const rep = p.rep[st.factionId] ?? 0;
    ctx.fillStyle = PAL.uiPanel;
    ctx.fillRect(0, 0, VW, VH);
    ctx.drawImage(g.stationSprite(st.id, st.military), 8, 6, 28, 28);
    drawText(ctx, st.name.toUpperCase(), 42, 8, PAL.white);
    drawText(ctx, `${st.military ? "STAR BASE" : "STATION"} - ${st.type.toUpperCase()} - ${fac.name}`, 42, 17, fac.color);
    drawText(ctx, `${p.credits}CR   CARGO ${cargoUsed(p)}/${p.cargoMax}   REP ${repLabel(rep)} (${rep})`, 42, 26, PAL.gold);
    const escLabel = this.returnTo === "stationwalk" ? "ESC PROMENADE" : "ESC UNDOCK";
    drawText(ctx, `P WALK DECK - ${escLabel}`, VW - textWidth(`P WALK DECK - ${escLabel}`) - 6, 8, PAL.greyDark);
    if (st.military) drawText(ctx, "SECURITY LEVEL: HIGH", VW - textWidth("SECURITY LEVEL: HIGH") - 6, 17, PAL.danger);
    const war = g.world.wars.find((w) => w.systemId === p.systemId);
    if (war) drawText(ctx, "SYSTEM AT WAR - PRICES UNSTABLE", VW - textWidth("SYSTEM AT WAR - PRICES UNSTABLE") - 6, 26, PAL.warn);

    let tx = 8;
    TABS.forEach((t, i) => {
      const active = i === this.tab;
      if (active) { ctx.fillStyle = PAL.uiBorder; ctx.fillRect(tx - 2, 38, textWidth(t) + 4, 10); }
      drawText(ctx, t, tx, 40, active ? PAL.ui : PAL.greyDark);
      tx += textWidth(t) + 10;
    });
    ctx.fillStyle = PAL.uiBorder;
    ctx.fillRect(0, 50, VW, 1);

    const top = 56;
    switch (TABS[this.tab]) {
      case "MARKET": this.drawMarket(g, ctx, top); break;
      case "SHIPYARD": this.drawShipyard(g, ctx, top); break;
      case "SHIPS": this.drawShips(g, ctx, top); break;
      case "MISSIONS": this.drawMissions(g, ctx, top); break;
      case "BAR": this.drawBar(g, ctx, top); break;
      case "STORAGE": this.drawStorage(g, ctx, top); break;
      case "NEWS": this.drawNews(g, ctx, top); break;
    }
    if (g.toastTimer > 0) drawText(ctx, g.toastMsg, VW / 2 - textWidth(g.toastMsg) / 2, VH - 10, PAL.ui);
    if (g.hint) drawText(ctx, g.hint, VW / 2 - textWidth(g.hint) / 2, VH - 20, PAL.gold);
  }

  row(ctx: CanvasRenderingContext2D, y: number, selected: boolean): void {
    this.rowBoxes.push([y - 2, y + 8]);
    if (selected) { ctx.fillStyle = "#13203a"; ctx.fillRect(4, y - 2, VW - 8, 10); }
  }

  drawMarket(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const p = g.world.player;
    const st = this.station;
    const rep = p.rep[st.factionId] ?? 0;
    drawText(ctx, "COMMODITY", 8, top, PAL.greyDark);
    drawText(ctx, "BUY", 150, top, PAL.greyDark);
    drawText(ctx, "SELL", 190, top, PAL.greyDark);
    drawText(ctx, "STOCK", 235, top, PAL.greyDark);
    drawText(ctx, "HELD", 280, top, PAL.greyDark);
    drawText(ctx, "TREND", 320, top, PAL.greyDark);
    drawText(ctx, "ENTER/B BUY - S SELL", 370, top, PAL.greyDark);
    const rows = Object.keys(st.prices);
    rows.forEach((id, i) => {
      const y = top + 12 + i * 11;
      const c = commodity(id);
      this.row(ctx, y, i === this.cursor);
      drawText(ctx, c.name + (c.illegal ? " *" : ""), 8, y, c.illegal ? PAL.danger : PAL.white);
      drawText(ctx, `${buyPrice(st, id, rep)}`, 150, y, PAL.gold);
      drawText(ctx, `${sellPrice(st, id, rep)}`, 190, y, PAL.grey);
      drawText(ctx, `${st.stock[id] ?? 0}`, 235, y, PAL.grey);
      drawText(ctx, `${p.cargo[id] ?? 0}`, 280, y, PAL.ui);
      const ratio = buyPrice(st, id, 0) / (c.base || 1);
      drawText(ctx, ratio > 1.3 ? "HIGH" : ratio < 0.8 ? "LOW" : "-", 320, y, ratio > 1.3 ? PAL.danger : ratio < 0.8 ? PAL.good : PAL.greyDark);
    });
    drawText(ctx, "* ILLEGAL - GATE SCANS WILL SEIZE IT.  GOOD STANDING EARNS BETTER PRICES.", 8, top + 12 + rows.length * 11 + 6, PAL.greyDark);
  }

  drawShipyard(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const opts = this.shipyardOptions(g);
    opts.forEach((o, i) => {
      const y = top + i * 11;
      this.row(ctx, y, i === this.cursor);
      drawText(ctx, o.label, 8, y, PAL.white);
      drawText(ctx, o.sub, VW - textWidth(o.sub) - 8, y, PAL.gold);
    });
    const p = g.world.player;
    let y = top + opts.length * 11 + 6;
    drawText(ctx, `SHIP SYSTEMS (${hull(p.hullId).name.toUpperCase()}):`, 8, y, PAL.greyDark);
    y += 10;
    for (const s of p.systems) {
      const col = s.health > 70 ? PAL.good : s.health > 35 ? PAL.warn : PAL.danger;
      drawText(ctx, s.name, 8, y, PAL.grey);
      ctx.fillStyle = PAL.greyDark; ctx.fillRect(120, y + 1, 50, 3);
      ctx.fillStyle = col; ctx.fillRect(120, y + 1, Math.round(50 * s.health / 100), 3);
      y += 9;
    }
  }

  drawShips(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const p = g.world.player;
    const tradeIn = Math.round(hull(p.hullId).price * 0.6);
    drawText(ctx, `HULL MARKET - TRADE-IN VALUE OF YOUR ${hull(p.hullId).name.toUpperCase()}: ${tradeIn}CR`, 8, top, PAL.greyDark);
    HULLS.forEach((h, i) => {
      const y = top + 12 + i * 34;
      this.row(ctx, y, i === this.cursor);
      const own = h.id === p.hullId;
      drawText(ctx, h.name.toUpperCase() + (own ? "  (YOURS)" : ""), 8, y, own ? PAL.ui : PAL.white);
      const cost = Math.max(0, h.price - tradeIn);
      drawText(ctx, own ? "-" : `${cost}CR`, VW - textWidth(`${cost}CR`) - 8, y, PAL.gold);
      drawText(ctx, `HULL ${h.hullMax}  SHLD ${h.shieldMax}  CARGO ${h.cargoMax}  FUEL ${h.fuelMax}  THRUST ${h.accel}  TOP ${h.maxSpeed}  MINE x${h.miningRate}  GUNS ${h.weaponDmg}  CREW ${h.crewSlots}`, 8, y + 9, PAL.grey);
      drawText(ctx, h.desc, 8, y + 18, PAL.greyDark);
      // preview sprite
      const spr = g.sprite(`hull-preview-${h.id}`, () => {
        const { genShip } = spriteMod;
        return genShip(new RNG(g.world.seed ^ 0x51e9 ^ h.id.length), h.spriteSize, h.color, h.accent);
      });
      ctx.drawImage(spr, VW - 60, y + 6);
    });
  }

  drawMissions(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const p = g.world.player;
    const st = this.station;
    const deliverable = p.missions.filter((m) => missionDeliverable(g.world, m, st));
    const avail = this.boardMissions.filter((m) => !m.accepted);
    const tier = missionTier(p.rep[st.factionId] ?? 0);
    let y = top;
    let idx = 0;
    if (deliverable.length) {
      drawText(ctx, "READY TO TURN IN:", 8, y, PAL.good); y += 10;
      for (const m of deliverable) {
        this.row(ctx, y, idx === this.cursor);
        drawText(ctx, `${m.title}  +${m.reward}CR`, 12, y, PAL.gold);
        y += 11; idx++;
      }
      y += 4;
    }
    drawText(ctx, `MISSION BOARD (YOUR TIER: ${["CIVILIAN", "TRUSTED", "MILITARY"][tier]}):`, 8, y, PAL.greyDark); y += 10;
    if (!avail.length) drawText(ctx, "NO POSTINGS. CHECK BACK LATER.", 12, y, PAL.greyDark);
    for (const m of avail) {
      const locked = (m.tier ?? 0) > tier;
      this.row(ctx, y, idx === this.cursor);
      drawText(ctx, (m.kind === "arc" ? "* " : "") + m.title + (locked ? "  [LOCKED]" : ""), 12, y, m.kind === "arc" ? PAL.gold : locked ? PAL.greyDark : PAL.white);
      drawText(ctx, `+${m.reward}CR`, VW - textWidth(`+${m.reward}CR`) - 8, y, PAL.gold);
      y += 8;
      drawText(ctx, m.desc.slice(0, 112), 12, y, PAL.greyDark);
      y += 12; idx++;
      if (y > VH - 50) break;
    }
    y += 2;
    drawText(ctx, "YOUR LOG:", 8, y, PAL.greyDark); y += 10;
    const log = p.missions.filter((m) => m.accepted && !m.done);
    if (!log.length) drawText(ctx, "EMPTY", 12, y, PAL.greyDark);
    for (const m of log.slice(0, 4)) {
      const prog = m.killsNeeded ? ` (${m.kills}/${m.killsNeeded})` : m.escortDone ? " (DONE - RETURN)" : "";
      drawText(ctx, `> ${m.title}${prog} - ${g.world.systems[m.targetSystemId].name}`, 12, y, PAL.uiDim);
      y += 9;
    }
  }

  drawBar(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const st = this.station;
    const p = g.world.player;
    drawText(ctx, "THE LOUNGE - TALK (ENTER) OR HIRE", 8, top, PAL.greyDark);
    let y = top + 12;
    let idx = 0;
    st.barPatrons.forEach((name, i) => {
      this.row(ctx, y + 2, idx === this.cursor);
      ctx.drawImage(g.portrait(name), 10, y - 2, 12, 12);
      drawText(ctx, name, 28, y, PAL.white);
      drawText(ctx, ["HAULER", "ENGINEER", "OFF-DUTY SECURITY", "PROSPECTOR", "DRIFTER"][i % 5], 28, y + 8, PAL.greyDark);
      y += 18; idx++;
    });
    if (this.candidates.length) {
      drawText(ctx, `FOR HIRE (BERTHS ${p.crew.length}/${hull(p.hullId).crewSlots}):`, 8, y, PAL.greyDark); y += 10;
      for (const c of this.candidates) {
        this.row(ctx, y + 2, idx === this.cursor);
        ctx.drawImage(g.portrait(c.name), 10, y - 2, 12, 12);
        drawText(ctx, `${c.name} - ${ROLE_INFO[c.role].label} ${"*".repeat(c.skill)}`, 28, y, PAL.ui);
        drawText(ctx, `${ROLE_INFO[c.role].effect}. WAGE ${c.wage}CR/DOCK, BONUS ${c.wage * 3}CR`, 28, y + 8, PAL.greyDark);
        y += 18; idx++;
      }
    }
    if (this.barLine) {
      ctx.fillStyle = "#0e1626"; ctx.fillRect(6, y, VW - 12, 28);
      ctx.strokeStyle = PAL.uiBorder; ctx.strokeRect(6.5, y + 0.5, VW - 13, 27);
      const words = this.barLine.split(" ");
      let line = "", ly = y + 4;
      for (const wd of words) {
        if (textWidth(line + " " + wd) > VW - 30) { drawText(ctx, line, 12, ly, PAL.ui); ly += CHAR_H + 2; line = wd; }
        else line = line ? line + " " + wd : wd;
      }
      drawText(ctx, line, 12, ly, PAL.ui);
    }
  }

  drawStorage(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const p = g.world.player;
    const st = this.station;
    const box = p.storage[st.id] ?? {};
    drawText(ctx, "STATION WAREHOUSE - ENTER MOVES ONE UNIT", 8, top, PAL.greyDark);
    let y = top + 12; let idx = 0;
    drawText(ctx, "IN YOUR HOLD:", 8, y, PAL.grey); y += 10;
    const held = Object.keys(p.cargo);
    if (!held.length) { drawText(ctx, "EMPTY", 12, y, PAL.greyDark); y += 10; }
    for (const id of held) { this.row(ctx, y, idx === this.cursor); drawText(ctx, `${commodity(id).name} x${p.cargo[id]}  → STORE`, 12, y, PAL.white); y += 11; idx++; }
    y += 6;
    drawText(ctx, `STORED AT ${st.name.toUpperCase()}:`, 8, y, PAL.grey); y += 10;
    const stored = Object.keys(box);
    if (!stored.length) { drawText(ctx, "EMPTY", 12, y, PAL.greyDark); }
    for (const id of stored) { this.row(ctx, y, idx === this.cursor); drawText(ctx, `${commodity(id).name} x${box[id]}  → LOAD`, 12, y, PAL.ui); y += 11; idx++; }
  }

  drawNews(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    drawText(ctx, "GALNET NEWS FEED", 8, top, PAL.info);
    let y = top + 14;
    for (const n of g.world.news.slice(0, 7)) {
      drawText(ctx, n.headline.slice(0, 60), 8, y, PAL.white); y += 9;
      drawText(ctx, n.body.slice(0, 112), 8, y, PAL.greyDark); y += 13;
    }
  }
}

import * as spriteMod from "../gfx/sprites";

const BAR_LINES: ((g: Game, st: StationDef) => string)[] = [
  (g, st) => {
    const sys = Object.values(g.world.systems).find((s) => s.stations.includes(st))!;
    const link = sys.links[0] ? g.world.systems[sys.links[0]].name : "the next system";
    return `Word is the corsairs are thick around ${link} lately. Fly armed or fly fast.`;
  },
  (g) => {
    const rich = Object.values(g.world.systems).find((s) => s.factionId === "fdm");
    return `A prospector swears the belts in ${rich?.name ?? "the Guild systems"} still glitter. Bring a mining laser and patience.`;
  },
  (g) => {
    const ev = g.world.events[g.world.events.length - 1];
    return ev ? `You hear about that? ${ev.text}. That's what the net says, anyway.` : "Quiet cycle. Too quiet for my taste.";
  },
  () => "Gate security's jumpy. If you're hauling anything... sensitive, weigh the odds. Good standing helps.",
  () => "Derelicts out past the belt still have cargo in them. And fires. Bring a suit with real O2.",
  () => "Research posts pay for anomaly surveys. Hold your scanner and fly toward whatever pings.",
  (g) => {
    const war = g.world.wars[0];
    return war ? `${g.world.systems[war.systemId].name} is a war zone this cycle. Prices are mad. So are the patrols.` : "You look like you can handle a bounty. Corsair scalps are worth good credits.";
  },
  () => "Planets have outposts if you bother to enter orbit. Cheap ore down the well, if you can lift it.",
];
