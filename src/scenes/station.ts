// Station scene: docked services — trade, shipyard, missions, bar, news net.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth, CHAR_H } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { RNG } from "../core/rng";
import { clamp } from "../core/mathx";
import { COMMODITIES, commodity, faction } from "../data/data";
import { StationDef, Mission, genMissionsFor, cargoUsed, addCargo, removeCargo, findStation } from "../world";

const TABS = ["MARKET", "SHIPYARD", "MISSIONS", "BAR", "NEWS"] as const;

export class StationScene implements Scene {
  tab = 0;
  cursor = 0;
  boardMissions: Mission[] = [];
  barLine = "";
  station!: StationDef;
  returnTo: "flight" | "stationwalk" = "flight";

  enter(g: Game): void {
    const found = findStation(g.world, g.world.player.dockedAt!);
    if (!found) { g.setScene("flight"); return; }
    this.station = found.st;
    this.tab = 0;
    this.cursor = 0;
    this.returnTo = "flight";
    // fresh mission board per docking, seeded by station + coarse time
    const rng = new RNG((g.world.seed ^ this.station.id.length * 2711 ^ Math.floor(g.world.time / 60)) >>> 0);
    this.boardMissions = genMissionsFor(g.world, this.station, rng);
    this.barLine = "";
    // docking services: free O2 top-up
    g.world.player.oxygen = g.world.player.oxygenMax;
  }

  update(g: Game, dt: number): void {
    const inp = g.input;
    if (inp.wasPressed("Escape")) {
      if (this.returnTo === "stationwalk") {
        g.setScene("stationwalk");
      } else {
        g.world.player.dockedAt = null;
        g.setScene("flight");
        g.toast("UNDOCKED");
      }
      return;
    }
    if (inp.wasPressed("p") || inp.wasPressed("w")) {
      g.setScene("stationwalk");
      return;
    }
    if (inp.wasPressed("F5")) g.save();
    if (inp.wasPressed("ArrowLeft") || inp.wasPressed("q")) { this.tab = (this.tab + TABS.length - 1) % TABS.length; this.cursor = 0; }
    if (inp.wasPressed("ArrowRight") || inp.wasPressed("e")) { this.tab = (this.tab + 1) % TABS.length; this.cursor = 0; }
    if (inp.wasPressed("ArrowUp")) this.cursor--;
    if (inp.wasPressed("ArrowDown")) this.cursor++;

    const p = g.world.player;
    const st = this.station;
    const enter = inp.wasPressed("Enter") || inp.wasPressed(" ");

    switch (TABS[this.tab]) {
      case "MARKET": {
        const rows = Object.keys(st.prices);
        this.cursor = clamp(this.cursor, 0, rows.length - 1);
        const id = rows[this.cursor];
        // buy with enter/right-shift-B, sell with backspace/S
        if (enter || inp.wasPressed("b")) {
          const price = st.prices[id];
          if ((st.stock[id] ?? 0) <= 0) g.toast("OUT OF STOCK");
          else if (p.credits < price) g.toast("NOT ENOUGH CREDITS");
          else if (!addCargo(p, id, 1)) g.toast("CARGO FULL");
          else { p.credits -= price; st.stock[id]--; }
        }
        if (inp.wasPressed("s") || inp.wasPressed("Backspace")) {
          const price = st.prices[id];
          if (!removeCargo(p, id, 1)) g.toast("NONE IN CARGO");
          else { p.credits += price; st.stock[id] = (st.stock[id] ?? 0) + 1; }
        }
        break;
      }
      case "SHIPYARD": {
        const options = this.shipyardOptions(g);
        this.cursor = clamp(this.cursor, 0, options.length - 1);
        if (enter) options[this.cursor].action();
        break;
      }
      case "MISSIONS": {
        const avail = this.boardMissions.filter((m) => !m.accepted);
        const deliverable = this.deliverableMissions(g);
        const rows = deliverable.length + avail.length;
        this.cursor = clamp(this.cursor, 0, Math.max(0, rows - 1));
        if (enter) {
          if (this.cursor < deliverable.length) {
            this.completeMission(g, deliverable[this.cursor]);
          } else {
            const m = avail[this.cursor - deliverable.length];
            if (m) {
              if (p.missions.filter((x) => x.accepted && !x.done).length >= 4) {
                g.toast("MISSION LOG FULL");
              } else {
                m.accepted = true;
                // delivery missions hand you the cargo now
                if (m.kind === "delivery" && m.commodityId && m.qty) {
                  if (!addCargo(p, m.commodityId, m.qty)) {
                    m.accepted = false;
                    g.toast("NOT ENOUGH CARGO SPACE");
                    break;
                  }
                }
                p.missions.push(m);
                g.toast("MISSION ACCEPTED");
              }
            }
          }
        }
        break;
      }
      case "BAR": {
        this.cursor = clamp(this.cursor, 0, st.barPatrons.length - 1);
        if (enter) {
          const rng = new RNG((g.world.seed ^ (this.cursor * 7727) ^ Math.floor(g.world.time / 20)) >>> 0);
          this.barLine = rng.pick(BAR_LINES)(g, this.station);
        }
        break;
      }
      case "NEWS":
        this.cursor = clamp(this.cursor, 0, g.world.news.length - 1);
        break;
    }
  }

  shipyardOptions(g: Game): { label: string; sub: string; action: () => void }[] {
    const p = g.world.player;
    const st = this.station;
    const opts: { label: string; sub: string; action: () => void }[] = [];
    const fuelNeed = Math.ceil(p.fuelMax - p.fuel);
    const fuelCost = fuelNeed * st.fuelPrice;
    opts.push({
      label: `REFUEL (${fuelNeed} UNITS)`,
      sub: `${fuelCost}CR`,
      action: () => {
        if (fuelNeed <= 0) return g.toast("TANKS FULL");
        const afford = Math.min(fuelNeed, Math.floor(p.credits / st.fuelPrice));
        p.fuel += afford;
        p.credits -= afford * st.fuelPrice;
        g.toast(afford < fuelNeed ? "PARTIAL REFUEL" : "REFUELED");
      },
    });
    const hullNeed = Math.ceil(p.hullMax - p.hull);
    opts.push({
      label: `HULL REPAIR (${hullNeed} PTS)`,
      sub: `${hullNeed * st.repairPrice}CR`,
      action: () => {
        if (hullNeed <= 0) return g.toast("HULL INTACT");
        const afford = Math.min(hullNeed, Math.floor(p.credits / st.repairPrice));
        p.hull += afford;
        p.credits -= afford * st.repairPrice;
        g.toast(afford < hullNeed ? "PARTIAL REPAIR" : "HULL RESTORED");
      },
    });
    const sysDamaged = p.systems.filter((s) => s.health < 100);
    opts.push({
      label: `SERVICE ALL SYSTEMS (${sysDamaged.length})`,
      sub: `${sysDamaged.length * 60}CR`,
      action: () => {
        if (!sysDamaged.length) return g.toast("ALL SYSTEMS NOMINAL");
        const cost = sysDamaged.length * 60;
        if (p.credits < cost) return g.toast("NOT ENOUGH CREDITS");
        p.credits -= cost;
        for (const s of p.systems) s.health = 100;
        g.toast("SYSTEMS SERVICED");
      },
    });
    opts.push({
      label: "BUY SPARE PARTS KIT",
      sub: `${st.prices["parts"] ?? 45}CR`,
      action: () => {
        const cost = st.prices["parts"] ?? 45;
        if (p.credits < cost) return g.toast("NOT ENOUGH CREDITS");
        if (!addCargo(p, "parts", 1)) return g.toast("CARGO FULL");
        p.credits -= cost;
        g.toast("PARTS STOWED IN CARGO");
      },
    });
    opts.push({
      label: `CARGO POD +10 (NOW ${p.cargoMax})`,
      sub: "500CR",
      action: () => {
        if (p.credits < 500) return g.toast("NOT ENOUGH CREDITS");
        p.credits -= 500;
        p.cargoMax += 10;
        g.toast("CARGO EXPANDED");
      },
    });
    opts.push({
      label: `SHIELD BOOSTER +25 (NOW ${p.shieldMax})`,
      sub: "800CR",
      action: () => {
        if (p.credits < 800) return g.toast("NOT ENOUGH CREDITS");
        p.credits -= 800;
        p.shieldMax += 25;
        g.toast("SHIELD CAPACITY UP");
      },
    });
    if (p.wanted > 0 && !st.military) {
      opts.push({
        label: "BRIBE RECORDS CLERK (CLEAR WARRANT)",
        sub: `${Math.round(p.wanted * 1000)}CR`,
        action: () => {
          const cost = Math.round(p.wanted * 1000);
          if (p.credits < cost) return g.toast("NOT ENOUGH CREDITS");
          p.credits -= cost;
          p.wanted = 0;
          g.toast("RECORDS... MISPLACED");
        },
      });
    }
    return opts;
  }

  deliverableMissions(g: Game): Mission[] {
    const p = g.world.player;
    return p.missions.filter((m) => {
      if (!m.accepted || m.done) return false;
      if (m.kind === "bounty") {
        return (m.kills ?? 0) >= (m.killsNeeded ?? 1) && m.fromStationId === this.station.id;
      }
      if (m.targetStationId !== this.station.id) return false;
      if (m.commodityId && m.qty) return (p.cargo[m.commodityId] ?? 0) >= m.qty;
      return false;
    });
  }

  completeMission(g: Game, m: Mission): void {
    const p = g.world.player;
    if (m.commodityId && m.qty) removeCargo(p, m.commodityId, m.qty);
    m.done = true;
    p.credits += m.reward;
    g.toast(`MISSION COMPLETE +${m.reward}CR`);
    p.missions = p.missions.filter((x) => !x.done);
  }

  // ---------- Draw ----------

  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    const p = g.world.player;
    const st = this.station;
    const fac = faction(st.factionId);
    ctx.fillStyle = PAL.uiPanel;
    ctx.fillRect(0, 0, VW, VH);

    // header with station art
    const spr = g.stationSprite(st.id, st.military);
    ctx.drawImage(spr, 8, 6, 28, 28);
    drawText(ctx, st.name.toUpperCase(), 42, 8, PAL.white);
    drawText(ctx, `${st.military ? "STAR BASE" : "STATION"} - ${st.type.toUpperCase()} - ${fac.name}`, 42, 17, fac.color);
    drawText(ctx, `${p.credits}CR   CARGO ${cargoUsed(p)}/${p.cargoMax}`, 42, 26, PAL.gold);
    const escLabel = this.returnTo === "stationwalk" ? "ESC PROMENADE" : "ESC UNDOCK";
    drawText(ctx, `P WALK DECK - ${escLabel}`, VW - textWidth(`P WALK DECK - ${escLabel}`) - 6, 8, PAL.greyDark);
    if (st.military) drawText(ctx, "SECURITY LEVEL: HIGH", VW - textWidth("SECURITY LEVEL: HIGH") - 6, 17, PAL.danger);

    // tabs
    let tx = 8;
    TABS.forEach((t, i) => {
      const active = i === this.tab;
      if (active) {
        ctx.fillStyle = PAL.uiBorder;
        ctx.fillRect(tx - 2, 38, textWidth(t) + 4, 10);
      }
      drawText(ctx, t, tx, 40, active ? PAL.ui : PAL.greyDark);
      tx += textWidth(t) + 12;
    });
    ctx.fillStyle = PAL.uiBorder;
    ctx.fillRect(0, 50, VW, 1);

    const top = 56;
    switch (TABS[this.tab]) {
      case "MARKET": this.drawMarket(g, ctx, top); break;
      case "SHIPYARD": this.drawShipyard(g, ctx, top); break;
      case "MISSIONS": this.drawMissions(g, ctx, top); break;
      case "BAR": this.drawBar(g, ctx, top); break;
      case "NEWS": this.drawNews(g, ctx, top); break;
    }

    if (g.toastTimer > 0) {
      drawText(ctx, g.toastMsg, VW / 2 - textWidth(g.toastMsg) / 2, VH - 10, PAL.ui);
    }
  }

  row(ctx: CanvasRenderingContext2D, y: number, selected: boolean): void {
    if (selected) {
      ctx.fillStyle = "#13203a";
      ctx.fillRect(4, y - 2, VW - 8, 10);
    }
  }

  drawMarket(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const p = g.world.player;
    const st = this.station;
    drawText(ctx, "COMMODITY", 8, top, PAL.greyDark);
    drawText(ctx, "PRICE", 170, top, PAL.greyDark);
    drawText(ctx, "STOCK", 220, top, PAL.greyDark);
    drawText(ctx, "HELD", 270, top, PAL.greyDark);
    drawText(ctx, "ENTER/B BUY - S SELL", 320, top, PAL.greyDark);
    const rows = Object.keys(st.prices);
    rows.forEach((id, i) => {
      const y = top + 12 + i * 11;
      const c = commodity(id);
      this.row(ctx, y, i === this.cursor);
      drawText(ctx, c.name + (c.illegal ? " *" : ""), 8, y, c.illegal ? PAL.danger : PAL.white);
      drawText(ctx, `${st.prices[id]}`, 170, y, PAL.gold);
      drawText(ctx, `${st.stock[id] ?? 0}`, 220, y, PAL.grey);
      drawText(ctx, `${p.cargo[id] ?? 0}`, 270, y, PAL.ui);
    });
    drawText(ctx, "* ILLEGAL - GATE SCANS WILL SEIZE IT", 8, top + 12 + rows.length * 11 + 6, PAL.greyDark);
  }

  drawShipyard(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const opts = this.shipyardOptions(g);
    opts.forEach((o, i) => {
      const y = top + i * 12;
      this.row(ctx, y, i === this.cursor);
      drawText(ctx, o.label, 8, y, PAL.white);
      drawText(ctx, o.sub, VW - textWidth(o.sub) - 8, y, PAL.gold);
    });
    const p = g.world.player;
    let y = top + opts.length * 12 + 8;
    drawText(ctx, "SHIP SYSTEMS:", 8, y, PAL.greyDark);
    y += 10;
    for (const s of p.systems) {
      const col = s.health > 70 ? PAL.good : s.health > 35 ? PAL.warn : PAL.danger;
      drawText(ctx, `${s.name}`, 8, y, PAL.grey);
      ctx.fillStyle = PAL.greyDark;
      ctx.fillRect(120, y + 1, 50, 3);
      ctx.fillStyle = col;
      ctx.fillRect(120, y + 1, Math.round(50 * s.health / 100), 3);
      y += 9;
    }
  }

  drawMissions(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const deliverable = this.deliverableMissions(g);
    const avail = this.boardMissions.filter((m) => !m.accepted);
    let y = top;
    let idx = 0;
    if (deliverable.length) {
      drawText(ctx, "READY TO TURN IN:", 8, y, PAL.good);
      y += 10;
      for (const m of deliverable) {
        this.row(ctx, y, idx === this.cursor);
        drawText(ctx, `${m.title}  +${m.reward}CR`, 12, y, PAL.gold);
        y += 11; idx++;
      }
      y += 4;
    }
    drawText(ctx, "MISSION BOARD:", 8, y, PAL.greyDark);
    y += 10;
    if (!avail.length) { drawText(ctx, "NO POSTINGS. CHECK BACK LATER.", 12, y, PAL.greyDark); }
    for (const m of avail) {
      this.row(ctx, y, idx === this.cursor);
      drawText(ctx, m.title, 12, y, PAL.white);
      drawText(ctx, `+${m.reward}CR`, VW - textWidth(`+${m.reward}CR`) - 8, y, PAL.gold);
      y += 8;
      drawText(ctx, m.desc.slice(0, 100), 12, y, PAL.greyDark);
      y += 12;
      idx++;
    }
    // player log
    y += 4;
    drawText(ctx, "YOUR LOG:", 8, y, PAL.greyDark);
    y += 10;
    const log = g.world.player.missions.filter((m) => m.accepted && !m.done);
    if (!log.length) drawText(ctx, "EMPTY", 12, y, PAL.greyDark);
    for (const m of log) {
      const prog = m.kind === "bounty" ? ` (${m.kills}/${m.killsNeeded})` : "";
      drawText(ctx, `> ${m.title}${prog} - ${g.world.systems[m.targetSystemId].name}`, 12, y, PAL.uiDim);
      y += 9;
    }
  }

  drawBar(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    const st = this.station;
    drawText(ctx, "THE LOUNGE - TALK TO A PATRON (ENTER)", 8, top, PAL.greyDark);
    st.barPatrons.forEach((name, i) => {
      const y = top + 14 + i * 18;
      this.row(ctx, y + 2, i === this.cursor);
      ctx.drawImage(g.portrait(name), 10, y - 2, 12, 12);
      drawText(ctx, name, 28, y, PAL.white);
      drawText(ctx, ["HAULER", "ENGINEER", "OFF-DUTY SECURITY", "PROSPECTOR", "DRIFTER"][i % 5], 28, y + 8, PAL.greyDark);
    });
    if (this.barLine) {
      const y = top + 14 + st.barPatrons.length * 18 + 8;
      ctx.fillStyle = "#0e1626";
      ctx.fillRect(6, y - 4, VW - 12, 30);
      ctx.strokeStyle = PAL.uiBorder;
      ctx.strokeRect(6.5, y - 3.5, VW - 13, 29);
      // wrap text
      const words = this.barLine.split(" ");
      let line = "", ly = y;
      for (const wd of words) {
        if (textWidth(line + " " + wd) > VW - 30) {
          drawText(ctx, line, 12, ly, PAL.ui);
          ly += CHAR_H + 2;
          line = wd;
        } else line = line ? line + " " + wd : wd;
      }
      drawText(ctx, line, 12, ly, PAL.ui);
    }
  }

  drawNews(g: Game, ctx: CanvasRenderingContext2D, top: number): void {
    drawText(ctx, "GALNET NEWS FEED", 8, top, PAL.info);
    let y = top + 14;
    for (const n of g.world.news) {
      drawText(ctx, n.headline, 8, y, PAL.white);
      y += 9;
      drawText(ctx, n.body.slice(0, 110), 8, y, PAL.greyDark);
      y += 14;
    }
  }
}

const BAR_LINES: ((g: Game, st: StationDef) => string)[] = [
  (g, st) => {
    const sys = Object.values(g.world.systems).find((s) => s.stations.includes(st))!;
    const link = sys.links[0] ? g.world.systems[sys.links[0]].name : "the next system";
    return `Word is the corsairs are thick around ${link} lately. Fly armed or fly fast.`;
  },
  (g, st) => {
    const rich = Object.values(g.world.systems).find((s) => s.factionId === "fdm");
    return `A prospector swears the belts in ${rich?.name ?? "the Guild systems"} still glitter. Bring a mining laser and patience.`;
  },
  (g) => {
    const items = Object.values(g.world.systems).flatMap((s) => s.stations);
    const st2 = items[Math.floor(Math.random() * items.length)];
    return `Heard ${st2?.name ?? "some depot"} pays over the odds for refined metals. Might be nothing.`;
  },
  () => "Gate security's been jumpy since the seizure. If you're hauling anything... sensitive, weigh the odds.",
  () => "An engineer here can patch any system if you bring spare parts. Or do it yourself — panel's usually behind the engine room.",
  (g) => `They say a research post pays triple for bio samples, no questions. Illegal in Compact space, mind you.`,
  () => "You look like you can handle a bounty. Check the board — corsair scalps are worth good credits.",
];
