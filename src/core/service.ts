import type { PlayerState, StationDef, World } from "../world";
import { adjustRep, commandRank, findStation, ledger, logEntry, navRoute, permitDenied } from "../world";

export type ServiceKind = "liaison" | "patrol" | "survey";
export interface ServiceOrder {
  id: string; serial: number; kind: ServiceKind; fromStationId: string; targetSystemId: string;
  targetStationId?: string; planetIndex?: number; title: string; description: string;
  pay: number; need: number; progress: number; stage: "outbound" | "return"; report?: string;
}
export interface ServiceRecord {
  factionId: string; stationId: string; joinedAt: number; serial: number; completed: number;
  history: { title: string; t: number; pay: number; report: string }[]; order?: ServiceOrder;
}
export const SERVICE_RANKS = [
  { at: 0, title: "AUXILIARY" }, { at: 2, title: "WATCH OFFICER" },
  { at: 5, title: "CUTTER CAPTAIN" }, { at: 9, title: "SENIOR CAPTAIN" },
];
export function serviceRank(p: PlayerState): { at: number; title: string } {
  return [...SERVICE_RANKS].reverse().find(r => (p.service?.completed ?? 0) >= r.at)!;
}
export function serviceOffice(w: World, stationId = w.player.dockedAt ?? ""): StationDef | null {
  const found = findStation(w, stationId);
  return found && found.sys.id === w.player.systemId && w.player.dockedAt === stationId && found.st.military && found.st.factionId !== "vex" ? found.st : null;
}
export function serviceJoinReason(w: World, stationId: string): string | null {
  const st = serviceOffice(w, stationId);
  if (!st) return "ENROL AT A NAVAL STATION'S SERVICE OFFICE.";
  if (w.player.service) return "YOUR SERVICE RECORD IS ALREADY OPEN.";
  if (commandRank(w.player) === "SKIPPER") return "TEN DEEDS ON THE WALL, LIEUTENANT IN THE LANES, BEFORE THE SERVICE TAKES YOUR APPLICATION.";
  if ((w.player.rep[st.factionId] ?? 0) < 10) return "THE SERVICE NEEDS TEN STANDING WITH THIS FACTION BEFORE IT OPENS YOUR RECORD.";
  return null;
}
export function joinService(w: World, stationId: string): string {
  const reason = serviceJoinReason(w, stationId); if (reason) return reason;
  const st = serviceOffice(w, stationId)!;
  w.player.service = { factionId: st.factionId, stationId, joinedAt: w.time, serial: 0, completed: 0, history: [] };
  logEntry(w, `Enrolled in the ${st.factionId} service at ${st.name}, as an auxiliary`);
  return "THE CLERK OPENS A FILE. 'YOUR RANK IN THE LANES STAYS YOURS. THIS RECORD IS FOR WORK YOU DO WITH US.' AUXILIARY, POSTED HERE. TAKE AN ASSIGNMENT WHEN YOU WANT ONE.";
}
export function serviceWorkReason(w: World, stationId: string): string | null {
  const st = serviceOffice(w, stationId), record = w.player.service;
  if (!st || !record || st.factionId !== record.factionId) return "THIS OFFICE DOES NOT HOLD YOUR SERVICE RECORD.";
  if (record.order) return "FINISH OR RETURN YOUR CURRENT ORDERS FIRST.";
  if ((w.player.rep[record.factionId] ?? 0) < 0) return "NEW ASSIGNMENTS ARE ON HOLD WHILE YOUR FACTION STANDING IS BELOW ZERO. EXISTING REPORTS ARE STILL ACCEPTED.";
  if (record.stationId !== stationId) return "TRANSFER YOUR POSTING TO THIS OFFICE BEFORE TAKING ITS ORDERS.";
  return null;
}
export function transferService(w: World, stationId: string): string {
  const st = serviceOffice(w, stationId), record = w.player.service;
  if (!st || !record || st.factionId !== record.factionId) return "TRANSFER AT AN OFFICE OF YOUR OWN SERVICE.";
  if (record.order) return "THE CURRENT ORDERS BELONG TO YOUR OLD POSTING. FINISH OR RETURN THEM FIRST.";
  if (record.stationId === stationId) return "YOUR FILE IS ALREADY AT THIS OFFICE.";
  record.stationId = stationId;
  logEntry(w, `Transferred the service posting to ${st.name}`);
  return `THE CLERK SENDS FOR YOUR FILE. POSTING: ${st.name.toUpperCase()}. YOUR COMPLETED WORK AND SERVICE GRADE COME WITH IT.`;
}
export function serviceOffers(w: World, stationId: string): ServiceOrder[] {
  if (serviceWorkReason(w, stationId)) return [];
  const record = w.player.service!, from = findStation(w, stationId)!;
  const systems = Object.values(w.systems).filter(sys => sys.factionId !== "vex" && !permitDenied(w, sys.id))
    .map(sys => ({ sys, route: navRoute(w, from.sys.id, sys.id) }))
    .filter((x): x is { sys: typeof from.sys; route: string[] } => x.route !== null)
    .sort((a, b) => a.route.length - b.route.length || a.sys.id.localeCompare(b.sys.id));
  const serial = record.serial + 1, bonus = SERVICE_RANKS.indexOf(serviceRank(w.player)) * 100;
  const make = (kind: ServiceKind, target: { sys: typeof from.sys; route: string[] }, extra: Partial<ServiceOrder>): ServiceOrder => ({
    id: `${stationId}:${serial}:${kind}`, serial, kind, fromStationId: stationId,
    targetSystemId: target.sys.id, title: "", description: "", pay: 450 + Math.max(0, target.route.length - 1) * 100 + bonus,
    need: 0, progress: 0, stage: "outbound", ...extra,
  });
  const pick = <T>(items: T[]): T | undefined => items.length ? items[(serial - 1) % Math.min(6, items.length)] : undefined;
  const offers: ServiceOrder[] = [];
  const civil = pick(systems.flatMap(target => target.sys.stations.filter(st => !st.military && st.factionId === record.factionId && st.id !== stationId).map(st => ({ ...target, st }))));
  if (civil) offers.push(make("liaison", civil, { targetStationId: civil.st.id, title: `Liaison: ${civil.st.name}`,
    description: `Visit ${civil.st.name}, ${civil.sys.name}. Walk its deck and ask the harbourmaster what the watch should know. Bring a signed account back here. The office wants actual needs, not a speech. No cargo, cabin or deadline.` }));
  const patrol = pick(systems.filter(x => x.sys.id !== from.sys.id));
  if (patrol) offers.push(make("patrol", patrol, { title: `Lane watch: ${patrol.sys.name}`, need: 90, pay: 600 + Math.max(0, patrol.route.length - 1) * 100 + bonus,
    description: `Spend 90 seconds under way in ${patrol.sys.name}, off cruise, below speed 60 and clear of docking. Listen on the public band. Fighting is not required. The time accumulates; you can leave and return. Report back here, with no deadline.` }));
  if (record.completed >= 2) {
    const survey = pick(systems.flatMap(target => target.sys.planets.map((planet, planetIndex) => ({ ...target, planet, planetIndex }))));
    if (survey) offers.push(make("survey", survey, { title: `Quiet survey: ${survey.planet.name}`, planetIndex: survey.planetIndex, need: 60, pay: 750 + Math.max(0, survey.route.length - 1) * 100 + bonus,
      description: `Hold close to ${survey.planet.name}, ${survey.sys.name}, for 60 seconds, off cruise, below speed 60 and without red alert. Stay within the planet's radius plus 320. Quiet observation counts; the clock pauses whenever conditions change. Report back here, with no deadline.` }));
  }
  return offers;
}
export function acceptServiceOrder(w: World, stationId: string, expected: ServiceOrder): string {
  const reason = serviceWorkReason(w, stationId); if (reason) return reason;
  const offer = serviceOffers(w, stationId).find(o => o.id === expected.id && o.targetSystemId === expected.targetSystemId && o.targetStationId === expected.targetStationId && o.planetIndex === expected.planetIndex);
  if (!offer) return "THOSE ORDERS HAVE CHANGED. READ THE CURRENT POSTING SHEET.";
  w.player.service!.serial = offer.serial; w.player.service!.order = offer;
  const plotted = plotServiceOrder(w);
  logEntry(w, `Accepted service orders: ${offer.title}; report back to ${findStation(w, stationId)!.st.name}`);
  return `${offer.description.toUpperCase()} PAY ON REPORT: ${offer.pay}CR. ${plotted ? "COURSE SET." : "THE ROUTE IS CLOSED; THE ORDERS CAN WAIT."}`;
}
export function serviceDestination(w: World): { systemId: string; stationId?: string } | null {
  const order = w.player.service?.order; if (!order) return null;
  if (order.stage === "return") { const home = findStation(w, order.fromStationId); return home ? { systemId: home.sys.id, stationId: home.st.id } : null; }
  return { systemId: order.targetSystemId, stationId: order.targetStationId };
}
export function plotServiceOrder(w: World): boolean {
  const dest = serviceDestination(w);
  if (!dest || !w.systems[dest.systemId] || permitDenied(w, dest.systemId) || !navRoute(w, w.player.systemId, dest.systemId)) return false;
  w.player.navTarget = dest.systemId; w.player.singersCourse = false;
  if (dest.stationId) w.player.navStationId = dest.stationId; else delete w.player.navStationId;
  return true;
}
export function serviceAudienceAt(w: World, stationId: string): boolean {
  const order = w.player.service?.order, dest = findStation(w, stationId);
  return !!order && order.kind === "liaison" && order.stage === "outbound" && order.targetStationId === stationId && w.player.dockedAt === stationId && dest?.sys.id === w.player.systemId;
}
export function serviceAudience(w: World, expected: ServiceOrder, listen: boolean): string {
  const order = w.player.service?.order;
  if (!order || order !== expected || !serviceAudienceAt(w, order.targetStationId ?? "")) return "THOSE ORDERS ARE NO LONGER WAITING AT THIS OFFICE.";
  order.report = listen ? "The harbour office asks for published patrol routes and a named contact for small ships. The captain listened to the dock hands before writing the request."
    : "The harbour office reports its current approach lanes and rescue contact. The captain checked the details against the local board.";
  order.stage = "return";
  logEntry(w, `Collected the harbourmaster's signed account for ${order.title}`);
  return `${order.report.toUpperCase()} RETURN TO ${findStation(w, order.fromStationId)!.st.name.toUpperCase()} AND FILE IT AT THE SERVICE OFFICE. G/U RESTORES THE COURSE.`;
}
export function tickServiceOrder(w: World, dt: number, flight: { cruise: boolean; docking: boolean; alert: number }): string | null {
  const p = w.player, order = p.service?.order;
  if (!order || order.stage !== "outbound" || order.kind === "liaison" || p.dockedAt || p.systemId !== order.targetSystemId || flight.cruise || flight.docking || Math.hypot(p.vx, p.vy) >= 60 || !Number.isFinite(dt) || dt <= 0) return null;
  if (order.kind === "survey") {
    const planet = w.systems[p.systemId]?.planets[order.planetIndex ?? -1];
    if (!planet || flight.alert >= 2 || Math.hypot(p.x - Math.cos(planet.angle) * planet.orbit, p.y - Math.sin(planet.angle) * planet.orbit) >= planet.radius + 320) return null;
  }
  order.progress = Math.min(order.need, order.progress + Math.min(1, dt));
  if (order.progress < order.need) return null;
  order.stage = "return"; order.report = order.kind === "patrol" ? "Ninety seconds on the public band, with the ship holding a steady station. The listening watch is complete."
    : "Sixty seconds of quiet close observation. The observation record was taken without red alert.";
  logEntry(w, `Completed ${order.title}; the report awaits the sending office`);
  return `${order.title.toUpperCase()}: WATCH COMPLETE. REPORT BACK TO ${findStation(w, order.fromStationId)?.st.name.toUpperCase() ?? "THE SENDING OFFICE"}. G/U PLOTS THE RETURN.`;
}
export function reportServiceOrder(w: World, expected: ServiceOrder): string {
  const record = w.player.service, order = record?.order;
  if (!record || !order || order !== expected || order.stage !== "return" || !serviceOffice(w, order.fromStationId)) return "REPORT IN PERSON AT THE NAVAL OFFICE THAT ISSUED THESE ORDERS.";
  const before = serviceRank(w.player).title;
  record.completed++; record.history.push({ title: order.title, t: w.time, pay: order.pay, report: order.report ?? "Report received." });
  record.history = record.history.slice(-12); delete record.order;
  w.player.credits += order.pay; ledger(w.player, "contracts", order.pay); adjustRep(w, record.factionId, 2);
  clearServiceCourse(w, { systemId: w.player.systemId, stationId: order.fromStationId });
  const after = serviceRank(w.player).title;
  if (after !== before) (w.mailQueue ??= []).push({ dueT: w.time + 300, from: `${findStation(w, record.stationId)!.st.name} service personnel`,
    text: `Your completed assignments now number ${record.completed}. Your service grade is ${after.toLowerCase()}. Your rank in the lanes remains your own. The clerk has ordered a new line on the office board, which is how we celebrate. The kettle is on.` });
  logEntry(w, `Filed ${order.title}: ${order.pay}cr, service record ${record.completed}${before !== after ? `, promoted to ${after.toLowerCase()}` : ""}`);
  return `THE CLERK READS EVERY LINE BEFORE SIGNING. +${order.pay}CR, +2 FACTION STANDING. ${record.completed} ASSIGNMENTS FILED.${before !== after ? ` SERVICE PROMOTION: ${after}.` : " 'THE NEXT SHEET WILL BE HERE WHEN YOU ARE.'"}`;
}
function clearServiceCourse(w: World, dest: { systemId: string; stationId?: string } | null): void {
  if (dest && w.player.navTarget === dest.systemId && w.player.navStationId === dest.stationId) { delete w.player.navStationId; w.player.navTarget = null; }
}
export function withdrawServiceOrder(w: World, expected: ServiceOrder): string {
  const record = w.player.service, office = serviceOffice(w);
  if (!record?.order || record.order !== expected || !office || office.factionId !== record.factionId) return "RETURN THE ORDERS AT AN OFFICE OF YOUR SERVICE.";
  const dest = serviceDestination(w); clearServiceCourse(w, dest); delete record.order;
  logEntry(w, `Returned service orders unfinished: ${expected.title}`);
  return "THE CLERK TAKES THE ORDERS BACK. 'THANK YOU FOR TELLING US.' NO PAY OR SERVICE CREDIT. YOUR EXISTING RECORD STAYS.";
}
export function serviceObjective(w: World): string | null {
  const order = w.player.service?.order; if (!order) return null;
  if (order.stage === "return") return `SERVICE: FILE REPORT AT ${findStation(w, order.fromStationId)?.st.name.toUpperCase() ?? "THE SENDING OFFICE"}`;
  return `SERVICE: ${order.title.toUpperCase()}${order.need ? ` ${Math.floor(order.progress)}/${order.need}S` : " / HARBOURMASTER"}`;
}
