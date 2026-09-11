import type { Game } from "../game";
import { findStation, stardate, type World } from "../world";
import { serviceFareReport, serviceObjective, serviceOffice, serviceRank } from "../core/service";
import { loanSummary } from "../core/serviceloan";
import { ReaderScene } from "./reader";

export function serviceFileSections(w: World): [string, string[]][] {
  const record = w.player.service;
  if (!record) return [["NO SERVICE RECORD", ["THE OFFICE HAS NO FILE FOR THIS CAPTAIN."]]];
  const sections: [string, string[]][] = [["YOUR SERVICE FILE", [
    `SERVICE: ${record.factionId}. GRADE: ${serviceRank(w.player).title}.`,
    `POSTING: ${findStation(w, record.stationId)?.st.name ?? record.stationId}.`,
    `${record.completed} REPORTS FILED. ${record.history.length} RETAINED BELOW, NEWEST FIRST.`,
    "READING THIS FILE DOES NOT FILE A REPORT OR COLLECT PAYMENT. RETURN TO THE DUTY DESK FOR THOSE ACTIONS.",
  ]]];
  const order = record.order;
  if (order) {
    sections.push(["CURRENT ORDERS", [order.title, serviceObjective(w) ?? "NO CURRENT OBJECTIVE.",
      order.description, `PAY ON REPORT: ${order.pay}CR. STATUS: ${order.stage === "fares" ? "BOOKED FARES FIRST" : order.stage === "return" ? "READY TO REPORT" : "ASSIGNMENT UNDER WAY"}.`,
      ...(order.report ? [order.report] : []),
    ]]);
    if (order.civilianPlan) sections.push(["THE BOOKED FARES", [serviceFareReport(w, order).trim()]]);
  } else sections.push(["CURRENT ORDERS", ["NO ACTIVE ASSIGNMENT. THE DUTY DESK HAS THE CURRENT POSTING SHEET."]]);
  const loan = loanSummary(w);
  if (loan) sections.push(["THE CUTTER IN YOUR CUSTODY", [loan,
    "RETURN THE CUTTER AT ITS DEPOT THROUGH THE DUTY DESK OR SHIPS TAB. READING THE FILE DOES NOT CHANGE HULLS.",
  ]]);
  [...record.history].reverse().forEach((report, i) => sections.push([
    `REPORT ${record.completed - i}: ${report.title}`,
    [`FILED ${stardate({ ...w, time: report.t })}. PAID ${report.pay}CR.`, report.report],
  ]));
  return sections;
}

export class ServiceFileScene extends ReaderScene {
  constructor() { super("SERVICE FILE", []); }

  open(g: Game, history = false): void {
    if (!serviceOffice(g.world)) return;
    g.settingsReturn = "service"; g.setScene("servicefile");
    const block = this.blocks.find(b => history ? b.title.startsWith("REPORT ") : b.title === "CURRENT ORDERS");
    if (block) this.scroll = Math.min(this.maxScroll(), block.top);
  }

  enter(g?: Game): void {
    if (g) this.sections.splice(0, this.sections.length, ...serviceFileSections(g.world));
    super.enter();
  }
}
