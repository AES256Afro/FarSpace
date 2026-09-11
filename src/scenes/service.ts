import { borrowServiceCutter, loanBorrowReason, loanReturnReason, loanSummary, plotLoanDepot, returnServiceCutter } from "../core/serviceloan";
import type { Game, Scene } from "../game";
import { VW, VH } from "../game";
import { acceptServiceOrder, joinService, plotServiceOrder, reportServiceOrder, SERVICE_RANKS, serviceConflictingFares, serviceFareReport, serviceJoinReason, serviceObjective, serviceOffers, serviceOffice, serviceRank, serviceWorkReason, transferService, withdrawServiceOrder, type ServiceFareChoice, type ServiceOrder } from "../core/service";
import { clamp } from "../core/mathx";
import { sfx } from "../core/sfx";
import { commandRank, findStation } from "../world";
import { drawText } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { EncounterScene, wrap } from "./encounter";
import type { StationWalkScene } from "./stationwalk";

interface Action { label: string; detail: string; run: () => string }
const TOP = 48, ROW = 25, VISIBLE = 6, LEFT = 230;
export class ServiceScene implements Scene {
  touchMode = "menu" as const;
  stationId = "";
  cursor = 0;
  scroll = 0;
  message = "";
  time = 0;
  enter(g: Game): void {
    const st = serviceOffice(g.world); if (!st) { g.setScene("station"); return; }
    this.stationId = st.id; this.cursor = 0; this.scroll = 0; this.time = 0;
    this.message = g.world.player.service ? "THE DUTY CLERK HAS TWO PENCILS AND NO PATIENCE FOR SPEECHES. 'TELL ME WHAT YOU CAN DO, CAPTAIN. WE CAN START THERE.'" : "TEN DEEDS AND TEN STANDING OPENS A SERVICE RECORD. THE DUTY CLERK SETS DOWN A PENCIL. 'VOLUNTARY ASSIGNMENTS, CAPTAIN. YOUR SHIP AND YOUR RANK IN THE LANES STAY YOURS.'";
  }
  leave(g: Game): void {
    g.setScene("stationwalk"); const walk = g.scenes.stationwalk as StationWalkScene;
    walk.px = 145; walk.py = 35;
  }
  takeOrder(g: Game, stationId: string, order: ServiceOrder): string {
    const world = g.world, fares = serviceConflictingFares(world, order);
    if (!fares.length) return acceptServiceOrder(g.world, stationId, order);
    const first = fares[0], destination = first.singer ? "THE SINGERS' BERTH" : findStation(g.world, first.stationId ?? "")?.st.name ?? g.world.systems[first.systemId]?.name ?? "ANOTHER SYSTEM";
    const choose = (g2: Game, choice: ServiceFareChoice): string => {
      if (g2.world !== world) return "THE WATCH HAS CHANGED. READ THE CURRENT POSTING SHEET.";
      if (g2.world.player.service?.order) return "YOUR CURRENT ORDERS ARE ALREADY SIGNED.";
      const line = acceptServiceOrder(g2.world, stationId, order, choice, fares), accepted = g2.world.player.service?.order;
      if (accepted?.id !== order.id) return line;
      g2.autosave();
      return choice === "fares-first" ? `THE CLERK AMENDS THE SHEET. YOUR ${fares.length} PRIOR FARES GO FIRST; THE WATCH WAITS. PAY ON REPORT: ${accepted.pay}CR. G/U FOLLOWS THEIR MANIFEST, THEN YOUR ORDERS. NO NEW DEADLINE.` : `THE CLERK SIGNS. THE AFFECTED FARES LOSE FIVE MOOD; THEIR BOOKINGS REMAIN. PAY ON REPORT: ${accepted.pay}CR. SERVICE COURSE SET.`;
    };
    (g.scenes.encounter as EncounterScene).open(g, {
      id: `service-fares-${order.id}`, title: "THE FARES ALREADY ABOARD", weight: 0, where: "space",
      text: `${first.name.toUpperCase()} BOOKED ${destination.toUpperCase()}${fares.length > 1 ? `; ${fares.length - 1} OTHER FARES ALSO NEED A DIFFERENT ROUTE` : ""}. THE CLERK TAPS YOUR MANIFEST. 'I CAN AMEND THE ORDERS. ANOTHER WATCH COVERS YOU FOR 100CR FROM THE REPORT PAY. OR YOU CAN TELL YOUR PASSENGERS WE GO FIRST.' EXISTING FARE CONDITIONS STILL APPLY.`,
      options: [
        { label: "CLEAR MY BOOKED FARES FIRST", hint: `${order.pay - 100}cr on report; orders wait for these fares`, result: g2 => choose(g2, "fares-first") },
        { label: "TAKE THE ORDERS FIRST", hint: `${order.pay}cr on report; affected fares lose five mood`, result: g2 => choose(g2, "orders-first") },
        { label: "LEAVE THE ORDERS FOR NOW", hint: "Keep the bookings and take no assignment", result: () => "THE CLERK PUTS THE SHEET BACK. 'THEY DID BOOK FIRST. COME BACK WHEN YOU HAVE ROOM IN YOUR DAY.'" },
      ],
    }, "service", true);
    return "";
  }
  actions(g: Game): Action[] {
    const w = g.world, st = serviceOffice(w, this.stationId), record = w.player.service;
    if (!st) return [];
    const rows: Action[] = [];
    if (!record) rows.push({ label: "OPEN A SERVICE RECORD", detail: serviceJoinReason(w, st.id) ?? "TEN DEEDS AND TEN FACTION STANDING. VOLUNTARY ASSIGNMENTS; KEEP YOUR SHIP AND YOUR RANK IN THE LANES.", run: () => joinService(w, st.id) });
    else if (record.factionId !== st.factionId) rows.push({ label: "ASK AFTER YOUR FILE", detail: `YOUR SERVICE POSTING IS ${findStation(w, record.stationId)?.st.name.toUpperCase() ?? "AT ANOTHER OFFICE"}.`, run: () => "THE CLERK POINTS TO YOUR SERVICE NAME. 'THAT IS ANOTHER NAVY. THEY KEEP THEIR OWN FILES.'" });
    else {
      if (record.order) {
        const order = record.order;
        rows.push({ label: "READ CURRENT ORDERS", detail: `${serviceObjective(w)}. PAY ${order.pay}CR. ${order.description}`.toUpperCase(), run: () => `${serviceObjective(w)}. PAY ${order.pay}CR.${serviceFareReport(w, order)}`.toUpperCase() });
        if (order.stage === "return" && order.fromStationId === st.id) rows.push({ label: "FILE THE COMPLETED REPORT", detail: `${order.pay}CR / +2 FACTION STANDING / ONE SERVICE CREDIT. ${order.report ?? ""}`.toUpperCase(), run: () => reportServiceOrder(w, order) });
        rows.push({ label: "PLOT THE SERVICE JOURNEY", detail: "N IN FLIGHT FOLLOWS THE COURSE. G/U RESTORES IT WHILE AWAY.", run: () => plotServiceOrder(w) ? "SERVICE COURSE RESTORED. N IN FLIGHT FOLLOWS THE ROUTE." : "THE ROUTE IS CLOSED. YOUR ORDERS CAN WAIT." });
        rows.push({ label: "RETURN ORDERS UNFINISHED", detail: "NO PAYMENT OR SERVICE CREDIT. KEEP YOUR EXISTING RECORD.", run: () => withdrawServiceOrder(w, order) });
      } else if (record.stationId !== st.id) rows.push({ label: "TAKE A POSTING HERE", detail: "MOVE YOUR SERVICE FILE HERE. COMPLETED WORK AND GRADE COME WITH YOU.", run: () => transferService(w, st.id) });
      else {
        for (const order of serviceOffers(w, st.id)) rows.push({ label: order.title.toUpperCase(), detail: `${order.pay}CR ON REPORT. ${order.description}`.toUpperCase(), run: () => this.takeOrder(g, st.id, order) });
        if (rows.length === 0) rows.push({ label: "ASK FOR ORDERS", detail: serviceWorkReason(w, st.id) ?? "NO REACHABLE ASSIGNMENT ON THE CURRENT CHART.", run: () => serviceWorkReason(w, st.id) ?? "THE CHART HAS NO SUITABLE OPEN ROUTE. THE CLERK LEAVES YOUR NAME ON THE LIST." });
      }
      rows.push({ label: "READ YOUR LAST REPORT", detail: `${record.completed} ASSIGNMENTS COMPLETED. THE OFFICE KEEPS THE LAST TWELVE REPORTS.`, run: () => {
        const last = record.history.at(-1); return last ? `${last.title}: ${last.report} PAID ${last.pay}CR.`.toUpperCase() : "YOUR FILE HAS A NAME, A POSTING AND AN EMPTY FIRST PAGE. 'THAT PART IS NORMAL,' SAYS THE CLERK.";
      } });
    }
    if (record?.loan) {
      const loan = record.loan;
      rows.push({ label: "RETURN THE SERVICE CUTTER", detail: loanReturnReason(w) ?? `BOARD YOUR HELD SHIP. CARGO AND CREW MUST FIT; THERE IS NO RETURN CHARGE. ${loanSummary(w)}`, run: () => {
        const line = returnServiceCutter(w, loan); g.spriteCache.clear(); return line;
      } });
      rows.push({ label: "PLOT THE CUTTER'S DEPOT", detail: loanSummary(w)!, run: () => plotLoanDepot(w) ? "DEPOT COURSE SET. N IN FLIGHT FOLLOWS IT TO YOUR HELD SHIP." : "THE ROUTE IS CLOSED. YOUR HELD SHIP CAN WAIT." });
    } else if (record && record.factionId === st.factionId) rows.push({ label: "REQUEST A CUTTER ON LOAN", detail: loanBorrowReason(w) ?? "TERN CUTTER: HULL 160, SHIELD 90, HOLD 60, FUEL 180, THREE CREW. YOUR OWN SHIP IS HELD HERE. YOUR CARGO AND FITTINGS MOVE WITH YOU. RETURN REQUIRES THEM TO FIT YOUR OLD HULL. NO FEE OR DEADLINE. ONE ISSUE PER FILED REPORT.", run: () => {
      const line = borrowServiceCutter(w); g.spriteCache.clear(); return line;
    } });
    rows.push({ label: "BACK TO THE PROMENADE", detail: "THE DUTY DESK STAYS OPEN.", run: () => { this.leave(g); return ""; } });
    return rows;
  }
  update(g: Game, dt: number): void {
    this.time += dt; const inp = g.input;
    if (inp.wasPressed("Escape")) { this.leave(g); return; }
    if (inp.wasPressed("F5")) g.save();
    if (inp.wasPressed("F9")) { g.load(); return; }
    if (!serviceOffice(g.world, this.stationId)) { g.setScene("station"); return; }
    const rows = this.actions(g); this.cursor = clamp(this.cursor, 0, rows.length - 1);
    const old = this.cursor;
    if (inp.wasPressed("ArrowDown") || inp.wheel > 0) this.cursor = (this.cursor + 1) % rows.length;
    if (inp.wasPressed("ArrowUp") || inp.wheel < 0) this.cursor = (this.cursor + rows.length - 1) % rows.length;
    if (this.cursor !== old) this.message = "";
    if (this.cursor < this.scroll) this.scroll = this.cursor;
    if (this.cursor >= this.scroll + VISIBLE) this.scroll = this.cursor - VISIBLE + 1;
    const row = Math.floor((inp.mouseY - TOP) / ROW) + this.scroll;
    const click = inp.mousePressed && inp.mouseX >= LEFT && inp.mouseX < VW - 12 && inp.mouseY >= TOP && inp.mouseY < TOP + ROW * VISIBLE && row < rows.length;
    if (click) this.cursor = row;
    if (click || inp.wasPressed("Enter") || inp.wasPressed(" ")) {
      this.message = rows[this.cursor].run(); this.cursor = 0; this.scroll = 0; sfx.select();
      if (g.sceneName === "service") g.autosave();
    }
  }
  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    const w = g.world, st = serviceOffice(w, this.stationId); if (!st) return;
    const record = w.player.service;
    ctx.fillStyle = "#080e18"; ctx.fillRect(0, 0, VW, VH);
    drawText(ctx, "THE SERVICE OFFICE", 12, 9, PAL.ui);
    drawText(ctx, `${st.name.toUpperCase()} / ${st.factionId.toUpperCase()} DUTY DESK`, 12, 23, PAL.grey);
    ctx.fillStyle = "#192434"; ctx.fillRect(12, 45, 202, 150);
    ctx.fillStyle = "#34485b"; ctx.fillRect(23, 54, 65, 65); ctx.fillRect(23, 76, 65, 2); ctx.fillRect(23, 98, 65, 2);
    for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 3 === 1 ? "#847351" : "#587274"; ctx.fillRect(28 + (i % 3) * 19, 59 + Math.floor(i / 3) * 22, 13, 13); }
    ctx.fillStyle = "#526a8a"; ctx.fillRect(133, 69, 14, 18); ctx.fillStyle = "#e8b48c"; ctx.fillRect(136, 60, 8, 9);
    ctx.fillStyle = "#705839"; ctx.fillRect(104, 86, 90, 16); ctx.fillRect(108, 102, 5, 16); ctx.fillRect(184, 102, 5, 16);
    ctx.fillStyle = "#d9d0aa"; ctx.fillRect(126, 88, 18, 9); ctx.fillStyle = PAL.gold; ctx.fillRect(153, 90, 12, 1);
    const grade = record ? serviceRank(w.player).title : "NO SERVICE RECORD";
    drawText(ctx, grade, 22, 129, PAL.gold);
    drawText(ctx, `LANES: ${commandRank(w.player)}`, 22, 140, PAL.grey);
    drawText(ctx, `REPORTS FILED: ${record?.completed ?? 0}`, 22, 151, PAL.white);
    const next = SERVICE_RANKS.find(r => r.at > (record?.completed ?? 0));
    drawText(ctx, next ? `NEXT GRADE: ${next.at} REPORTS` : "SENIOR SERVICE GRADE", 22, 162, PAL.greyDark);
    drawText(ctx, `STANDING: ${(w.player.rep[record?.factionId ?? st.factionId] ?? 0).toFixed(0)}`, 22, 173, PAL.ui);
    if (record?.loan) drawText(ctx, "CUTTER IN YOUR CUSTODY", 22, 184, PAL.gold);
    const rows = this.actions(g);
    rows.slice(this.scroll, this.scroll + VISIBLE).forEach((row, i) => {
      const selected = this.cursor === this.scroll + i, y = TOP + i * ROW;
      if (selected) { ctx.fillStyle = "#203446"; ctx.fillRect(LEFT, y, VW - LEFT - 12, ROW - 2); }
      drawText(ctx, `${selected ? ">" : " "} ${row.label}`.slice(0, 57), LEFT + 4, y + 5, selected ? PAL.gold : PAL.white);
      drawText(ctx, selected ? "READ DETAILS BELOW" : "ENTER OR CLICK", LEFT + 12, y + 15, PAL.greyDark);
    });
    if (rows.length > VISIBLE) drawText(ctx, `${this.scroll + 1}-${Math.min(rows.length, this.scroll + VISIBLE)} OF ${rows.length} / ARROWS SCROLL`, LEFT + 4, 199, PAL.greyDark);
    const line = this.message || rows[this.cursor]?.detail || "";
    wrap(line, 112).slice(0, 6).forEach((text, i) => drawText(ctx, text, 12, 207 + i * 8, this.message ? PAL.ui : PAL.grey));
    drawText(ctx, "ARROWS / WHEEL MOVE   ENTER / CLICK CHOOSE   ESC DECK   F5 SAVE", 12, 259, PAL.greyDark);
  }
}
