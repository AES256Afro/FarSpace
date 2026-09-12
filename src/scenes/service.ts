import type { ServiceFileScene } from "./servicefile";
import { borrowServiceCutter, loanBorrowReason, loanReturnReason, loanSummary, plotLoanDepot, returnServiceCutter } from "../core/serviceloan";
import type { Game, Scene } from "../game";
import { VW, VH } from "../game";
import { acceptServiceOrder, joinService, plotServiceOrder, reportServiceOrder, SERVICE_RANKS, serviceConflictingFares, serviceJoinReason, serviceObjective, serviceOffers, serviceOffice, serviceRank, serviceWorkReason, transferService, withdrawServiceOrder, type ServiceFareChoice, type ServiceOrder } from "../core/service";
import { OfficeMenu, type OfficeAction as Action } from "./officemenu";
import { ReaderOverlay } from "./reader";
import { serviceFileSections } from "./servicefile";
import { clippedText } from "../core/mapview";
import type { World } from "../world";
import { sfx } from "../core/sfx";
import { commandRank, findStation } from "../world";
import { drawText } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { EncounterScene } from "./encounter";
import type { StationWalkScene } from "./stationwalk";

export class ServiceScene implements Scene {
  touchMode = "menu" as const;
  stationId = "";
  menu = new OfficeMenu();
  get cursor(): number { return this.menu.view.index; }
  set cursor(index: number) { this.menu.view.select(index); }
  get scroll(): number { return this.menu.view.offset; }
  info?: ReaderOverlay;
  get pausesVoyage(): boolean { return !!this.info; }
  resumeNext = false;
  private world?: World;
  lastReply = "";
  message = "";
  time = 0;
  enter(g: Game): void {
    const st = serviceOffice(g.world); if (!st) { g.setScene("station"); return; }
    const resume = this.resumeNext && this.world === g.world && this.stationId === st.id;
    this.resumeNext = false; this.world = g.world;
    if (resume) { this.menu.view.sync(this.actions(g).map(row => row.id)); return; }
    this.onSceneLeave(); this.stationId = st.id; this.menu = new OfficeMenu(); this.time = 0;
    this.message = g.world.player.service ? "THE DUTY CLERK HAS TWO PENCILS AND NO PATIENCE FOR SPEECHES. 'TELL ME WHAT YOU CAN DO, CAPTAIN. WE CAN START THERE.'" : "TEN DEEDS AND TEN STANDING OPENS A SERVICE RECORD. THE DUTY CLERK SETS DOWN A PENCIL. 'VOLUNTARY ASSIGNMENTS, CAPTAIN. YOUR SHIP AND YOUR RANK IN THE LANES STAY YOURS.'";
    this.lastReply = this.message; this.menu.view.sync(this.actions(g).map(row => row.id));
  }
  leave(g: Game): void {
    this.resumeNext = false;
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
      return this.lastReply = this.message = choice === "fares-first" ? `THE CLERK AMENDS THE SHEET. YOUR ${fares.length} PRIOR FARES GO FIRST; THE WATCH WAITS. PAY ON REPORT: ${accepted.pay}CR. G/U FOLLOWS THEIR MANIFEST, THEN YOUR ORDERS. NO NEW DEADLINE.` : `THE CLERK SIGNS. THE AFFECTED FARES LOSE FIVE MOOD; THEIR BOOKINGS REMAIN. PAY ON REPORT: ${accepted.pay}CR. SERVICE COURSE SET.`;
    };
    this.resumeNext = true;
    (g.scenes.encounter as EncounterScene).open(g, {
      id: `service-fares-${order.id}`, title: "THE FARES ALREADY ABOARD", weight: 0, where: "space",
      text: `${first.name.toUpperCase()} BOOKED ${destination.toUpperCase()}${fares.length > 1 ? `; ${fares.length - 1} OTHER FARES ALSO NEED A DIFFERENT ROUTE` : ""}. THE CLERK TAPS YOUR MANIFEST. 'I CAN AMEND THE ORDERS. ANOTHER WATCH COVERS YOU FOR 100CR FROM THE REPORT PAY. OR YOU CAN TELL YOUR PASSENGERS WE GO FIRST.' EXISTING FARE CONDITIONS STILL APPLY.`,
      options: [
        { label: "CLEAR MY BOOKED FARES FIRST", hint: `${order.pay - 100}cr on report; orders wait for these fares`, result: g2 => choose(g2, "fares-first") },
        { label: "TAKE THE ORDERS FIRST", hint: `${order.pay}cr on report; affected fares lose five mood`, result: g2 => choose(g2, "orders-first") },
        { label: "LEAVE THE ORDERS FOR NOW", hint: "Keep the bookings and take no assignment", result: () => this.lastReply = this.message = "THE CLERK PUTS THE SHEET BACK. 'THEY DID BOOK FIRST. COME BACK WHEN YOU HAVE ROOM IN YOUR DAY.'" },
      ],
    }, "service", true);
    return "";
  }
  actions(g: Game): Action[] {
    const w = g.world, st = serviceOffice(w, this.stationId), record = w.player.service;
    if (!st) return [];
    const rows: Action[] = [];
    if (!record) rows.push({ id: "join", label: "OPEN A SERVICE RECORD", detail: serviceJoinReason(w, st.id) ?? "TEN DEEDS AND TEN FACTION STANDING. VOLUNTARY ASSIGNMENTS; KEEP YOUR SHIP AND YOUR RANK IN THE LANES.", run: () => joinService(w, st.id) });
    else if (record.factionId !== st.factionId) rows.push({ id: "foreign-file", label: "ASK AFTER YOUR FILE", detail: `YOUR SERVICE POSTING IS ${findStation(w, record.stationId)?.st.name.toUpperCase() ?? "AT ANOTHER OFFICE"}.`, run: () => "THE CLERK POINTS TO YOUR SERVICE NAME. 'THAT IS ANOTHER NAVY. THEY KEEP THEIR OWN FILES.'" });
    else {
      if (record.order) {
        const order = record.order;
        rows.push({ id: `read:${order.id}`, label: "READ CURRENT ORDERS", detail: `${serviceObjective(w)}. PAY ${order.pay}CR. ${order.description}`.toUpperCase(), run: () => { (g.scenes.servicefile as ServiceFileScene).open(g); return ""; } });
        if (order.stage === "return" && order.fromStationId === st.id) rows.push({ id: `report:${order.id}`, label: "FILE THE COMPLETED REPORT", detail: `${order.pay}CR / +2 FACTION STANDING / ONE SERVICE CREDIT. ${order.report ?? ""}`.toUpperCase(), run: () => reportServiceOrder(w, order) });
        rows.push({ id: `plot:${order.id}`, label: "PLOT THE SERVICE JOURNEY", detail: `${serviceObjective(w)}. N IN FLIGHT FOLLOWS THE COURSE. G/U RESTORES IT WHILE AWAY.`, run: () => plotServiceOrder(w) ? "SERVICE COURSE RESTORED. N IN FLIGHT FOLLOWS THE ROUTE." : "THE ROUTE IS CLOSED. YOUR ORDERS CAN WAIT." });
        rows.push({ id: `withdraw:${order.id}`, label: "RETURN ORDERS UNFINISHED", detail: "NO PAYMENT OR SERVICE CREDIT. KEEP YOUR EXISTING RECORD.", run: () => withdrawServiceOrder(w, order) });
      } else if (record.stationId !== st.id) rows.push({ id: `posting:${st.id}`, label: "TAKE A POSTING HERE", detail: "MOVE YOUR SERVICE FILE HERE. COMPLETED WORK AND GRADE COME WITH YOU.", run: () => transferService(w, st.id) });
      else {
        for (const order of serviceOffers(w, st.id)) rows.push({ id: `offer:${order.id}:${order.targetSystemId}:${order.targetStationId ?? ""}:${order.planetIndex ?? ""}`, label: order.title.toUpperCase(), detail: `${order.pay}CR ON REPORT. ${order.description}`.toUpperCase(), run: () => this.takeOrder(g, st.id, order) });
        if (rows.length === 0) rows.push({ id: "ask", label: "ASK FOR ORDERS", detail: serviceWorkReason(w, st.id) ?? "NO REACHABLE ASSIGNMENT ON THE CURRENT CHART.", run: () => serviceWorkReason(w, st.id) ?? "THE CHART HAS NO SUITABLE OPEN ROUTE. THE CLERK LEAVES YOUR NAME ON THE LIST." });
      }
      rows.push({ id: "history", label: "READ YOUR SERVICE FILE", detail: `${record.completed} ASSIGNMENTS COMPLETED. READ CURRENT ORDERS AND ALL ${record.history.length} RETAINED REPORTS IN FULL.`, run: () => {
        (g.scenes.servicefile as ServiceFileScene).open(g, true); return "";
      } });
    }
    if (record?.loan) {
      const loan = record.loan;
      rows.push({ id: `return-cutter:${loan.stationId}:${loan.serial}`, label: "RETURN THE SERVICE CUTTER", detail: loanReturnReason(w) ?? `BOARD YOUR HELD SHIP. CARGO AND CREW MUST FIT; THERE IS NO RETURN CHARGE. ${loanSummary(w)}`, run: () => {
        const line = returnServiceCutter(w, loan); g.spriteCache.clear(); return line;
      } });
      rows.push({ id: `depot:${loan.stationId}:${loan.serial}`, label: "PLOT THE CUTTER'S DEPOT", detail: loanSummary(w)!, run: () => plotLoanDepot(w) ? "DEPOT COURSE SET. N IN FLIGHT FOLLOWS IT TO YOUR HELD SHIP." : "THE ROUTE IS CLOSED. YOUR HELD SHIP CAN WAIT." });
    } else if (record && record.factionId === st.factionId) rows.push({ id: `borrow:${record.completed}`, label: "REQUEST A CUTTER ON LOAN", detail: loanBorrowReason(w) ?? "TERN CUTTER: HULL 160, SHIELD 90, HOLD 60, FUEL 180, THREE CREW. YOUR OWN SHIP IS HELD HERE. YOUR CARGO AND FITTINGS MOVE WITH YOU. RETURN REQUIRES THEM TO FIT YOUR OLD HULL. NO FEE OR DEADLINE. ONE ISSUE PER FILED REPORT.", run: () => {
      const line = borrowServiceCutter(w); g.spriteCache.clear(); return line;
    } });
    rows.push({ id: "leave", label: "BACK TO THE PROMENADE", detail: "THE DUTY DESK STAYS OPEN.", run: () => { this.leave(g); return ""; } });
    return rows;
  }
  onSceneLeave(): void { this.info?.onSceneLeave(); this.info = undefined; }

  openInfo(g: Game, record = false): void {
    const row = this.actions(g).find(row => row.id === this.menu.view.selected);
    const sections: [string, string[]][] = record ? [
      ["DUTY OFFICE", [findStation(g.world, this.stationId)?.st.name ?? this.stationId]],
      ...serviceFileSections(g.world),
      ["LAST REPLY", [this.lastReply]],
    ] : row ? [[row.label, [row.detail, "ESC RETURNS TO THE DESK. ENTER AT THE DESK PERFORMS THIS ACTION."]]] : [];
    this.info = new ReaderOverlay(record ? "OFFICE RECORD" : "ACTION DETAILS", sections, () => { this.info = undefined; });
  }

  update(g: Game, dt: number): void {
    if (this.info) { this.info.update(g); return; }
    this.time += dt; const inp = g.input;
    if (inp.wasPressed("Escape")) { this.leave(g); return; }
    if (inp.wasPressed("F5")) g.save();
    if (inp.wasPressed("F9")) { g.load(); return; }
    if (!serviceOffice(g.world, this.stationId) || g.world.player.dockedAt !== this.stationId || findStation(g.world, this.stationId)?.sys.id !== g.world.player.systemId) { g.setScene("station"); return; }
    const rows = this.actions(g), previous = this.menu.view.selected, command = this.menu.update(rows, inp);
    if (previous !== this.menu.view.selected) this.message = "";
    if (command === "details" || command === "record") { this.openInfo(g, command === "record"); return; }
    const row = rows.find(row => row.id === this.menu.view.selected);
    if (command === "run" && row) {
      const message = row.run();
      if (message) { this.message = message; this.lastReply = message; }
      sfx.select();
      if (g.sceneName === "service") { this.menu.view.sync(this.actions(g).map(row => row.id)); g.autosave(); }
    }
  }
  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    if (this.info) { this.info.draw(g, ctx); return; }
    const w = g.world, st = serviceOffice(w, this.stationId); if (!st) return;
    const record = w.player.service;
    ctx.fillStyle = "#080e18"; ctx.fillRect(0, 0, VW, VH);
    drawText(ctx, "THE SERVICE OFFICE", 12, 9, PAL.ui);
    drawText(ctx, clippedText(`${st.name.toUpperCase()} / ${st.factionId.toUpperCase()} DUTY DESK`, 456), 12, 23, PAL.grey);
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
    this.menu.draw(ctx, this.actions(g), this.message);
  }
}
