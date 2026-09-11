import type { PlayerState, World } from "../world";
import { applyHull, findStation, hullTransferReason, logEntry, navRoute, permitDenied } from "../world";
import { faction } from "../data/data";
import { hull, SERVICE_CUTTER } from "../data/hulls";
import { serviceOffice } from "./service";

export type HeldHull = Pick<PlayerState, "hullId" | "shipName" | "paint" | "hull" | "shield" | "fuel" | "systems" | "breaches" | "fires" | "torpedoes" | "wear" | "berthLog" | "hullHistory" | "commissionedAt">;
export interface ServiceLoan { serial: number; stationId: string; issuedAt: number; name: string; held: HeldHull }

export { hullTransferReason } from "../world";
export function loanBorrowReason(w: World): string | null {
  const p = w.player, record = p.service, office = serviceOffice(w);
  if (!record || !office || office.factionId !== record.factionId || record.stationId !== office.id) return "THE CUTTER IS ISSUED AT YOUR CURRENT SERVICE POSTING.";
  if (record.loan || p.hullId === SERVICE_CUTTER.id) return "THE SERVICE ALREADY HAS A CUTTER IN YOUR CUSTODY.";
  if (record.completed < 2) return "TWO FILED REPORTS AND WATCH OFFICER GRADE BEFORE THE DEPOT ISSUES A CUTTER.";
  if (record.lastLoanReport !== undefined && record.completed <= record.lastLoanReport) return "THE DEPOT HAS ISSUED AGAINST THIS REPORT. FILE ANOTHER ASSIGNMENT BEFORE REQUESTING ANOTHER CUTTER.";
  if ((p.rep[record.factionId] ?? 0) < 0) return "THE DEPOT SUSPENDS NEW LOANS BELOW ZERO FACTION STANDING.";
  return hullTransferReason(p, SERVICE_CUTTER.id);
}
function holdHull(p: PlayerState): HeldHull {
  return structuredClone({ hullId: p.hullId, shipName: p.shipName, paint: p.paint, hull: p.hull, shield: p.shield,
    fuel: p.fuel, systems: p.systems, breaches: p.breaches, fires: p.fires, torpedoes: p.torpedoes,
    wear: p.wear, berthLog: p.berthLog, hullHistory: p.hullHistory, commissionedAt: p.commissionedAt });
}
export function borrowServiceCutter(w: World): string {
  const reason = loanBorrowReason(w); if (reason) return reason;
  const p = w.player, record = p.service!, held = holdHull(p), serial = (record.loanSerial ?? 0) + 1;
  const name = `WATCH ${serial}`;
  record.lastLoanReport = record.completed;
  record.loanSerial = serial; record.loan = { serial, stationId: p.dockedAt!, issuedAt: w.time, name, held };
  applyHull(p, SERVICE_CUTTER.id); p.shipName = name; p.paint = faction(record.factionId).color;
  p.fuel = p.fuelMax; p.torpedoes = 0; p.wear = 0; p.berthLog = []; p.heat = 0;
  p.hullHistory = { previous: `${faction(record.factionId).name} depot`, quirk: "a kettle bolted to the duty desk and three perfectly straight pencil marks" };
  p.commissionedAt = w.time;
  logEntry(w, `Took the service cutter ${name} on loan; ${held.shipName ?? hull(held.hullId).name} held at ${findStation(w, p.dockedAt!)!.st.name}`);
  return `THE ${name} IS YOURS TO COMMAND WHILE ON LOAN. THE ${held.shipName ?? hull(held.hullId).name} IS HELD HERE WITH ITS CONDITION, FUEL AND TORPEDOES RECORDED. YOUR FITTINGS, CARGO, CREW AND SHIP'S VOICE COME WITH YOU. NO FEE OR RETURN DEADLINE. ONE ISSUE PER FILED REPORT.`.toUpperCase();
}
export function loanReturnReason(w: World, expected?: ServiceLoan): string | null {
  const p = w.player, loan = p.service?.loan;
  if (!loan || (expected && expected !== loan)) return "THAT CUTTER IS NO LONGER IN YOUR CUSTODY.";
  if (p.hullId !== SERVICE_CUTTER.id) return "THE CURRENT HULL DOES NOT MATCH THE CUTTER ON THE CUSTODY SHEET. THE HELD SHIP REMAINS SAFE.";
  const depot = findStation(w, loan.stationId);
  if (!depot || p.dockedAt !== loan.stationId || p.systemId !== depot.sys.id) return `RETURN AT ${depot?.st.name.toUpperCase() ?? "THE ISSUING DEPOT"}, WHERE YOUR OWN SHIP IS HELD. PLOT THE DEPOT FROM THE SERVICE OFFICE.`;
  return hullTransferReason(p, loan.held.hullId);
}
export function returnServiceCutter(w: World, expected: ServiceLoan): string {
  const reason = loanReturnReason(w, expected); if (reason) return reason;
  const p = w.player, record = p.service!, held = expected.held;
  const ammo = p.torpedoes ?? 0, returnedHull = Math.round(p.hull);
  applyHull(p, held.hullId);
  p.hull = Math.min(p.hullMax, held.hull); p.shield = Math.min(p.shieldMax, held.shield); p.fuel = Math.min(p.fuelMax, held.fuel);
  p.systems = structuredClone(held.systems); p.breaches = structuredClone(held.breaches); p.fires = structuredClone(held.fires);
  p.torpedoes = (held.torpedoes ?? 0) + ammo; p.heat = 0;
  for (const key of ["shipName", "paint", "wear", "berthLog", "hullHistory", "commissionedAt"] as const) {
    if (held[key] === undefined) delete p[key];
    else Object.assign(p, { [key]: structuredClone(held[key]) });
  }
  record.loansReturned = (record.loansReturned ?? 0) + 1;
  delete record.loan;
  if (p.navStationId === expected.stationId) { delete p.navStationId; p.navTarget = null; }
  logEntry(w, `Returned ${expected.name}, hull ${returnedHull}, to the service; resumed ${p.shipName ?? hull(p.hullId).name}. No return charge`);
  return `${expected.name} RETURNED. ABOARD ${p.shipName ?? hull(p.hullId).name}. CARGO/FITTINGS KEPT; ${p.torpedoes} TORPEDOES. NO RETURN CHARGE.`.toUpperCase();
}
export function plotLoanDepot(w: World): boolean {
  const loan = w.player.service?.loan, depot = loan && findStation(w, loan.stationId);
  if (!depot || permitDenied(w, depot.sys.id) || !navRoute(w, w.player.systemId, depot.sys.id)) return false;
  w.player.navTarget = depot.sys.id; w.player.navStationId = depot.st.id; w.player.singersCourse = false;
  return true;
}
export function loanHullChangeReason(p: PlayerState): string | null {
  if (!p.service?.loan && p.hullId !== SERVICE_CUTTER.id) return null;
  return "CUTTER ON LOAN. DEPOT SHIPYARD: RETURN SERVICE CUTTER. THEN BUY, SWAP OR TAKE THE LINER.";
}
export function loanSummary(w: World): string | null {
  const loan = w.player.service?.loan; if (!loan) return null;
  return `${w.player.shipName ?? loan.name}: SERVICE LOAN. ${loan.held.shipName ?? hull(loan.held.hullId).name} HELD AT ${findStation(w, loan.stationId)?.st.name ?? "THE DEPOT"}. NO RETURN DEADLINE.`.toUpperCase();
}
