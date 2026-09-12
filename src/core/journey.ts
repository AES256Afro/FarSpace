import { cargoUsed, findStation, passengersAboard, systemLabel, type World } from "../world";
import { commodity } from "../data/data";
import { hull } from "../data/hulls";
import { MATERIALS } from "../data/engineering";
import { questLocations, type QuestLocation } from "./questlocations";

export interface ContractReceipt { id: string; title: string; time: number; stationId: string }

export function focusedObjective(w: World): QuestLocation | undefined {
  const matches = questLocations(w).filter(q => q.id === w.player.objectiveFocusId);
  return matches.length === 1 ? matches[0] : undefined;
}

// Pinning chooses existing work. It never chooses a course or performs the work.
export function pinObjective(w: World, id?: string): boolean {
  if (id !== undefined && questLocations(w).filter(q => q.id === id).length !== 1) return false;
  if (id === undefined) delete w.player.objectiveFocusId;
  else w.player.objectiveFocusId = id;
  return true;
}

export function reconcileObjective(w: World): void {
  if (w.player.objectiveFocusId && !focusedObjective(w)) delete w.player.objectiveFocusId;
}

export function objectiveDetails(w: World, q: QuestLocation): string[] {
  const m = q.id.startsWith("mission:") ? w.player.missions.find(m => `mission:${m.id}` === q.id) : undefined;
  const sys = w.systems[q.systemId];
  const st = q.contactId?.startsWith("station:") ? findStation(w, q.contactId.slice(8)) : null;
  return [
    `SOURCE: ${q.source}. ${q.focused ? "YOUR CHOSEN OBJECTIVE." : ""}`,
    `DESTINATION: ${st ? `${st.st.name}, ` : ""}${sys?.name ?? "Destination unavailable"}.`, q.action,
    ...(m ? [m.desc, `CONTRACT PAYMENT: ${m.reward}cr. Collect it after completing the work.`] : []),
    ...(q.source === "SERVICE" && w.player.service?.order ? [w.player.service.order.description] : []),
    q.systemId === w.player.systemId ? "TAB opens the system map during flight. Select the destination, then choose Fly there to travel." : "G opens the galaxy map during flight. Select the destination system, then choose Fly there to travel.",
    "Pinning keeps this objective visible. It does not change your course or start flight.",
  ];
}

export function journeyBriefing(w: World) {
  const p = w.player, sys = w.systems[p.systemId], st = p.dockedAt ? findStation(w, p.dockedAt) : null;
  const passengers = passengersAboard(p).reduce((n, m) => n + (m.party ?? 1), 0);
  const materialCount = Object.values(p.materials ?? {}).reduce((a, b) => a + b, 0);
  const receipt = p.lastContractReceipt;
  const focus = focusedObjective(w);
  return {
    ship: p.shipName ?? hull(p.hullId).name,
    location: st ? `Docked at ${st.st.name}, ${sys.name}` : `In flight in ${sys.name}`,
    aboard: `${cargoUsed(p)}/${p.cargoMax} cargo, ${materialCount} materials, ${p.crew.length} crew, ${passengers} passengers${p.evacuees?.n ? `, ${p.evacuees.n} survivors` : ""}`,
    condition: `Hull ${Math.ceil(p.hull)}/${p.hullMax}, fuel ${Math.ceil(p.fuel)}/${p.fuelMax}, oxygen ${Math.ceil(p.oxygen)}/${p.oxygenMax}`,
    completed: receipt ? `Latest recorded port contract: ${receipt.title}` : "No completed port contract recorded in this save.",
    focus,
    next: focus ? `${focus.title}: ${focus.action}` : p.objectiveFocusId ? "The chosen objective is no longer available. Choose current work below." : "Choose an objective below, or continue your voyage.",
  };
}

// These are views of current records, not a second journal stored in the save.
export function journeyRecordSections(w: World): [string, string[]][] {
  const p = w.player, b = journeyBriefing(w), receipt = p.lastContractReceipt;
  return [
    [b.ship, [b.location, b.aboard, b.condition, `${p.credits}cr aboard.`, ...p.systems.map(s => `${systemLabel(p, s)}: ${Math.ceil(s.health)}%`)]],
    ["LATEST RECORDED PORT CONTRACT", receipt ? [receipt.title, `Completed at ${findStation(w, receipt.stationId)?.st.name ?? receipt.stationId}, voyage time ${Math.floor(receipt.time / 60)} minutes.`] : [b.completed, "Older completions are not inferred from credits or counters. Other outcomes may appear in the captain's log below."]],
    ["CHOSEN OBJECTIVE", b.focus ? [b.focus.title, ...objectiveDetails(w, b.focus)] : [b.next]],
    ["CARGO MANIFEST", Object.entries(p.cargo).filter(([, n]) => n > 0).map(([id, n]) => `${commodity(id).name}: ${n}`)],
    ["MATERIALS", [...Object.entries(p.materials ?? {}).filter(([, n]) => n > 0).map(([id, n]) => `${MATERIALS.find(m => m.id === id)?.name ?? id}: ${n}`), "F2 Workshop lists recipes, research and material uses during flight or at a port."]],
    ["CREW AND PASSENGERS", [...p.crew.map(c => `${c.name}, ${c.role}. Morale ${Math.round(c.morale)}. ${c.sick ? `Unwell: ${c.sick.kind}.` : "Fit for duty."}`), ...passengersAboard(p).map(m => `${m.passengerName ?? m.title}: ${m.party ?? 1} aboard. ${m.desc}`), ...(p.evacuees?.n ? [`${p.evacuees.n} survivors from ${p.evacuees.from}. Dock to hand them over.`] : [])]],
    ...questLocations(w).map(q => [q.title, objectiveDetails(w, q)] as [string, string[]]),
    ["CAPTAIN'S LOG", p.log?.length ? [...p.log].reverse().map(e => `${Math.floor(e.t / 60)} MIN: ${e.text}`) : ["No captain's log entries in this save."]],
  ];
}
