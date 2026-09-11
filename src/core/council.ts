import type { StationDef, World } from "../world";
import { adjustRep, BELT_FREEMAN_AT, beltGain, findStation, isBeltStation, ledger, logEntry, navRoute, permitDenied, weekKey } from "../world";
import { hashStr } from "./rng";

export interface CouncilChoice { label: string; resolution: string; belt: number; rep: number }
export interface CouncilIssue { id: string; title: string; text: string; choices: CouncilChoice[] }
export const COUNCIL_ISSUES: CouncilIssue[] = [
  { id: "water", title: "THE WATER AGREEMENT", text: "The inner haulers want a lower water tariff. The clinic wants their contract renewed. The clerk has put both papers on the same table.", choices: [
    { label: "HOLD THE WATER RATE", resolution: "Keep the rock's water rate and seek a separate clinic agreement.", belt: 2, rep: -2 },
    { label: "CUT THE RATE FOR THE CLINIC", resolution: "Offer a lower water rate in exchange for a written clinic contract.", belt: -1, rep: 3 },
    { label: "ASK FOR AN OPEN COST REVIEW", resolution: "Ask both sides to publish costs before changing the water rate.", belt: 1, rep: 1 },
  ] },
  { id: "tugs", title: "THE TUG ON THE NIGHT WATCH", text: "There is one rescue tug for three rocks. The inners offer another if their haulers get priority. The night watch has brought its call log.", choices: [
    { label: "KEEP RESCUE IN LOCAL HANDS", resolution: "Keep local dispatch and ask the inners to fund an additional tug without priority berths.", belt: 2, rep: -2 },
    { label: "ACCEPT THE INNER CONTRACT", resolution: "Accept a second tug under the inner dispatch contract, with published response records.", belt: -1, rep: 3 },
    { label: "PROPOSE A SHARED DISTRESS DESK", resolution: "Propose a shared distress desk that dispatches by danger rather than ownership.", belt: 1, rep: 1 },
  ] },
  { id: "filters", title: "WHO SIGNS THE AIR FILTERS", text: "The yard can make the filters. The inner office will only certify imported ones. A mechanic has set a clean local filter beside a very expensive stamp.", choices: [
    { label: "BACK THE ROCK'S OWN YARD", resolution: "Ask the inner office to recognise the rock's existing filter tests.", belt: 2, rep: -2 },
    { label: "ORDER THE CERTIFIED FILTERS", resolution: "Request a standing supply contract for certified filters at a disclosed price.", belt: -1, rep: 3 },
    { label: "INVITE A JOINT TEST", resolution: "Invite local mechanics and inner inspectors to test both filters in the same rig.", belt: 1, rep: 1 },
  ] },
];
export interface CouncilBallot {
  week: string; stationId: string; issueId: string; choice: number; resolution: string;
}
export interface CouncilMandate {
  week: string; fromStationId: string; targetStationId: string; resolution: string;
  stage: "outbound" | "return"; reply?: string;
}
export interface CouncilState {
  stationId: string;
  lastVoteWeek?: string;
  ballots: CouncilBallot[];
  mandate?: CouncilMandate;
  lastMandateWeek?: string;
  represented: number;
}

export function councilAt(w: World, stationId = w.player.dockedAt): StationDef | null {
  const f = stationId && findStation(w, stationId);
  return f && isBeltStation(f.st) && !f.st.military ? f.st : null;
}
function dockedAt(w: World, stationId: string): boolean {
  const f = findStation(w, stationId);
  return !!f && w.player.dockedAt === stationId && w.player.systemId === f.sys.id;
}
export function councilStanding(w: World): boolean {
  return !!w.player.flags?.freeman && (w.player.beltStanding ?? 0) >= BELT_FREEMAN_AT;
}
export function takeCouncilSeat(w: World, stationId: string): string {
  if (!councilAt(w, stationId) || !dockedAt(w, stationId)) return "THE COUNCIL IS NOT HERE.";
  if (!councilStanding(w)) return "VISITORS MAY LISTEN. THE CHAIR REQUIRES THE FREEMAN'S NAME AND THREE BELT STANDING.";
  const old = w.player.council;
  if (old?.stationId === stationId) return "YOUR CHAIR IS STILL HERE. SOMEONE HAS MOVED THE KETTLE CLOSER.";
  if (old?.mandate) return "BRING BACK THE OUTSTANDING REPLY BEFORE MOVING YOUR SEAT.";
  w.player.council = { ...old, stationId, ballots: old?.ballots ?? [], represented: old?.represented ?? 0 };
  logEntry(w, `Took a seat on ${findStation(w, stationId)!.st.name}'s council`);
  return "THE CLERK WRITES YOUR NAME ON A CHAIR. 'YOU HAVE TO SIT IN IT. THAT IS THE JOB.'";
}
export function councilIssue(w: World, stationId: string, now = Date.now()): CouncilIssue {
  const week = Math.floor(Date.parse(weekKey(now)) / 604800000);
  return COUNCIL_ISSUES[(hashStr(`${w.seed}:${stationId}`) + week) % COUNCIL_ISSUES.length];
}
export function councilBallot(w: World, now = Date.now()): CouncilBallot | null {
  return w.player.council?.ballots.find(b => b.week === weekKey(now)) ?? null;
}
export function councilVoteReason(w: World, stationId: string, now = Date.now()): string | null {
  if (!councilAt(w, stationId) || !dockedAt(w, stationId)) return "THE COUNCIL IS NOT HERE.";
  if (!councilStanding(w)) return "YOUR VOICE IS WELCOME. THE VOTE WAITS UNTIL THE FREEMAN'S STANDING IS RESTORED.";
  const state = w.player.council;
  if (state?.stationId !== stationId) return "TAKE THIS ROCK'S CHAIR BEFORE VOTING.";
  if (state.lastVoteWeek && state.lastVoteWeek >= weekKey(now)) return "YOUR VOTE IS IN THE MINUTES. THE NEXT SITTING BEGINS MONDAY UTC.";
  return null;
}
export function castCouncilVote(w: World, stationId: string, week: string, issueId: string, choice: number, now = Date.now()): string {
  const reason = councilVoteReason(w, stationId, now); if (reason) return reason;
  const issue = councilIssue(w, stationId, now), option = issue.choices[choice];
  if (week !== weekKey(now) || issue.id !== issueId || !Number.isInteger(choice) || !option) return "THE AGENDA HAS CHANGED. READ THE NEW PAPER BEFORE VOTING.";
  const state = w.player.council!, st = findStation(w, stationId)!.st;
  const ballot: CouncilBallot = { week: weekKey(now), stationId, issueId, choice, resolution: option.resolution };
  state.lastVoteWeek = ballot.week; state.ballots.push(ballot); state.ballots = state.ballots.slice(-12);
  if (option.belt > 0) beltGain(w, option.belt); else w.player.beltStanding = Math.max(0, (w.player.beltStanding ?? 0) + option.belt);
  adjustRep(w, st.factionId, option.rep);
  (w.mailQueue ??= []).push({ dueT: w.time + 300, from: `${st.name}'s council, minutes of ${ballot.week}`,
    text: `The clerk records your vote on ${issue.title.toLowerCase()}: ${option.resolution} The council adopts this as its request to the inner office. A request is not a signed agreement. Someone still has to take it there and bring back what they actually said. Your chair has been put away until next week. The kettle has not.` });
  logEntry(w, `${st.name}'s council: ${option.resolution}`);
  return `YOUR WORD ENTERS THE MINUTES. BELT ${option.belt > 0 ? "+" : ""}${option.belt}; ${st.factionId.toUpperCase()} ${option.rep > 0 ? "+" : ""}${option.rep}. THE CLERK ASKS IF YOU WILL CARRY THE REQUEST.`;
}

export function councilRecipient(w: World, fromStationId: string) {
  const home = findStation(w, fromStationId); if (!home) return null;
  const choices = Object.values(w.systems).filter(sys => !permitDenied(w, sys.id)).flatMap(sys => {
    const route = navRoute(w, home.sys.id, sys.id); if (!route) return [];
    return sys.stations.filter(st => !isBeltStation(st) && !st.military && st.factionId !== "vex" && st.factionId === home.st.factionId)
      .map(st => ({ sys, st, hops: route.length }));
  });
  choices.sort((a, b) => a.hops - b.hops || a.st.id.localeCompare(b.st.id));
  return choices[0] ?? null;
}
export function acceptCouncilMandate(w: World, stationId: string, week: string, now = Date.now()): string {
  const state = w.player.council, ballot = councilBallot(w, now);
  if (!state || !dockedAt(w, stationId) || state.stationId !== stationId || !councilStanding(w)) return "THE ROCK CANNOT GIVE YOU THIS MANDATE HERE.";
  if (state.mandate) return "YOU ALREADY CARRY A COUNCIL REQUEST. BRING BACK ITS REPLY FIRST.";
  if (!ballot || ballot.stationId !== stationId || ballot.week !== week || (state.lastMandateWeek && state.lastMandateWeek >= week)) return "THAT REQUEST HAS ALREADY LEFT THE COUNCIL, OR BELONGS TO ANOTHER SITTING.";
  const recipient = councilRecipient(w, stationId); if (!recipient) return "NO REACHABLE INNER OFFICE ON THE CHART. THE PAPER CAN WAIT.";
  state.mandate = { week, fromStationId: stationId, targetStationId: recipient.st.id, resolution: ballot.resolution, stage: "outbound" };
  state.lastMandateWeek = week; plotCouncilMandate(w);
  logEntry(w, `Carrying ${findStation(w, stationId)!.st.name}'s council request to ${recipient.st.name}`);
  return `TAKE THE REQUEST TO ${recipient.st.name.toUpperCase()}, ${recipient.sys.name.toUpperCase()}. P TO WALK ITS DECK; E AT THE HARBOURMASTER. 300CR AFTER YOU BRING THE REPLY HOME. NO DEADLINE.`;
}
export function plotCouncilMandate(w: World): boolean {
  const m = w.player.council?.mandate; if (!m) return false;
  const dest = findStation(w, m.stage === "outbound" ? m.targetStationId : m.fromStationId);
  if (!dest || permitDenied(w, dest.sys.id) || !navRoute(w, w.player.systemId, dest.sys.id)) return false;
  w.player.navTarget = dest.sys.id; w.player.navStationId = dest.st.id; w.player.singersCourse = false;
  return true;
}
export function councilAudienceAt(w: World, stationId: string): boolean {
  const m = w.player.council?.mandate;
  return !!m && m.stage === "outbound" && m.targetStationId === stationId && dockedAt(w, stationId);
}
export function councilAudience(w: World, expected: CouncilMandate, meeting: boolean): string {
  const m = w.player.council?.mandate;
  if (m !== expected || !m || !councilAudienceAt(w, m.targetStationId)) return "THIS REQUEST IS NO LONGER WAITING AT THIS OFFICE.";
  m.stage = "return";
  m.reply = meeting ? "The inner office offers a joint meeting at the rock, with its cost book open. No contract has been signed."
    : "The inner office acknowledges the council's request in writing and assigns it a named reviewer. No contract has been signed.";
  const plotted = plotCouncilMandate(w);
  logEntry(w, `Spoke for ${findStation(w, m.fromStationId)?.st.name ?? "the sending rock"} at the inner office; returning with a written reply`);
  return `${m.reply.toUpperCase()} BRING THE REPLY TO YOUR COUNCIL CHAIR. ${plotted ? "COURSE SET HOME." : "THE ROUTE IS CLOSED; THE PAPERS CAN WAIT."}`;
}
export function reportCouncilMandate(w: World, expected: CouncilMandate): string {
  const state = w.player.council, m = state?.mandate;
  if (!state || !m || m !== expected || m.stage !== "return" || !dockedAt(w, m.fromStationId)) return "THE REPLY MUST BE READ BACK AT THE ROCK THAT SENT YOU.";
  state.represented++; delete state.mandate;
  w.player.credits += 300; ledger(w.player, "missions", 300); beltGain(w, 1);
  if (w.player.navStationId === m.fromStationId) { delete w.player.navStationId; w.player.navTarget = null; }
  const home = findStation(w, m.fromStationId)!.st;
  (w.mailQueue ??= []).push({ dueT: w.time + 600, from: `${home.name}'s council, reply on file`,
    text: `You read back the office's actual reply: ${m.reply} The council has entered the next step in the minutes. You did not return with a promise nobody made. That matters here. The expense payment is 300 credits. The chair remains yours. Please stop balancing it on two legs.` });
  logEntry(w, `Returned the inner office's reply to ${home.name}; 300cr expenses, one more journey for the rock`);
  return "THE CLERK FILES THE REPLY BESIDE YOUR WORD. 'NOW WE KNOW WHAT TO ASK NEXT.' +300CR EXPENSES, +1 BELT STANDING.";
}
export function withdrawCouncilMandate(w: World, expected: CouncilMandate): string {
  const state = w.player.council;
  if (!state?.mandate || state.mandate !== expected || !dockedAt(w, expected.fromStationId)) return "RETURN TO THE SENDING COUNCIL TO HAND THE PAPERS BACK.";
  delete state.mandate;
  const target = expected.stage === "outbound" ? expected.targetStationId : expected.fromStationId;
  if (w.player.navStationId === target) { delete w.player.navStationId; w.player.navTarget = null; }
  logEntry(w, "Returned a council mandate unfinished; the clerk will find another ship");
  return "THE CLERK TAKES THE PAPERS BACK. 'BETTER TO TELL US.' NO PAYMENT, NO PENALTY.";
}
export function councilObjective(w: World): string | null {
  const m = w.player.council?.mandate; if (!m) return null;
  const dest = findStation(w, m.stage === "outbound" ? m.targetStationId : m.fromStationId);
  if (!dest) return "COUNCIL: DESTINATION MISSING. RETURN TO THE SENDING ROCK.";
  return `COUNCIL: ${m.stage === "outbound" ? "HARBOURMASTER AT" : "REPORT TO THE CHAIR AT"} ${dest.st.name.toUpperCase()}, ${dest.sys.name.toUpperCase()}`;
}
