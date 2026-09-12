import { findStation, logEntry, passengerCap, passengersAboard, type World } from "../world";
import type { Npc } from "../scenes/flight/types";

export type SupportKind = "repair" | "medical" | "fuel";
export type SupportPhase = "waiting" | "working" | "transfer" | "tow" | "report" | "complete" | "lost" | "released";
export interface SupportJob {
  id: string; name: string; kind: SupportKind; systemId: string; stationId: string;
  phase: SupportPhase; created: number; ended?: number; outcome?: string;
  patientDelivered?: boolean;
  supplied: boolean; progress: number; worker?: string; paid: boolean;
  ship: Pick<Npc, "x" | "y" | "angle" | "hull" | "hullMax" | "cargo" | "tag" | "mayday" | "repairInterior">;
}
export interface SupportState { serial: number; jobs: SupportJob[] }
export const activeSupport = (j: SupportJob) => !["complete", "lost", "released"].includes(j.phase);
export const supportAtShip = (w: World, n: Npc) => w.player.support?.jobs.find(j => j.id === n.supportId);

export function snapshotSupport(w: World, n: Npc): void {
  const j = supportAtShip(w, n); if (!j || !activeSupport(j) || j.phase === "report") return;
  j.ship = { x: n.x, y: n.y, angle: n.angle, hull: n.hull, hullMax: n.hullMax, cargo: n.cargo ? { ...n.cargo } : undefined, tag: n.tag, mayday: n.mayday, repairInterior: n.repairInterior };
}

export function acceptSupport(w: World, n: Npc): SupportJob | null {
  const old = supportAtShip(w, n); if (old) return activeSupport(old) ? old : null;
  if (n.kind !== "trader" || n.hull <= 0 || n.docked || !(n.disabled || n.casualties || n.mayday)) return null;
  const state = w.player.support ?? { serial: 0, jobs: [] };
  if (state.jobs.filter(activeSupport).length >= 4) return null;
  const sys = w.systems[w.player.systemId];
  const local = [...sys.stations].filter(s => !s.military).sort((a,b) => Math.hypot(Math.cos(a.angle)*a.orbit-n.x,Math.sin(a.angle)*a.orbit-n.y)-Math.hypot(Math.cos(b.angle)*b.orbit-n.x,Math.sin(b.angle)*b.orbit-n.y));
  const st = local[0] ?? sys.stations[0] ?? Object.values(w.systems).flatMap(s => s.stations)[0]; if (!st) return null;
  w.player.support = state;
  state.jobs = [...state.jobs.filter(activeSupport), ...state.jobs.filter(j => !activeSupport(j)).slice(-11)];
  const serial = ++state.serial, name = n.name ?? `Freighter ${serial}`;
  const job: SupportJob = { id: `aid:${w.seed}:${serial}`, name, kind: n.casualties ? "medical" : n.mayday ? "fuel" : "repair", systemId: sys.id, stationId: st.id, phase: "waiting", created: w.time, supplied: false, progress: 0, paid: false, ship: { x:n.x,y:n.y,angle:n.angle,hull:n.hull,hullMax:n.hullMax } };
  n.supportId = job.id; n.name = name; state.jobs.push(job); snapshotSupport(w,n);
  logEntry(w, `Accepted ${name}'s ${job.kind === "medical" ? "medical" : job.kind === "fuel" ? "fuel" : "repair"} request in ${sys.name}`);
  return job;
}

export function supportShip(w: World, j: SupportJob): Npc {
  const sys = w.systems[j.systemId];
  return { ...j.ship, supportId:j.id, name:j.name, kind:"trader", vx:0,vy:0,fireCd:0,targetIdx:Math.max(0,sys.stations.findIndex(s=>s.id===j.stationId)),disabled:j.kind !== "medical",casualties:j.kind === "medical",mayday:j.kind === "fuel" };
}

export function endSupport(w: World, j: SupportJob, phase: "lost" | "released" | "complete", outcome: string): void {
  if (!activeSupport(j)) return;
  j.phase = phase; j.ended = w.time; j.outcome = outcome; delete j.worker;
  logEntry(w, `${j.name}: ${outcome}`);
}

export function supportBerths(w: World): number {
  return Math.max(0, passengerCap(w.player) - passengersAboard(w.player).reduce((n,m)=>n+(m.party??1),0));
}

export function supportTerms(w: World, j: SupportJob): string[] {
  const p=w.player;
  const needs = j.kind === "repair" ? `Two spare parts (${p.cargo.parts??0} aboard) and a fit engineer, or board and do the repair yourself. Parts are delivered once. Repair payment: 400cr.`
    : j.kind === "medical" ? `Two medical supplies (${p.cargo.med??0} aboard) and a fit medic to stabilise the casualties. Transfer the critical patient with a fit medic and one free passenger berth (${supportBerths(w)} free). Stabilisation pays 300cr; the port pays 200cr for the patient.`
    : `Transfer 10 fuel with at least 15 aboard (${Math.ceil(p.fuel)} aboard), for 300cr. Alternatively tow the ship into a station for 550cr.`;
  return [needs, j.phase === "report" ? "Aid completed. Dock to record the handoff; no further supplies are required." : j.supplied ? "Required supplies already delivered. Returning will not consume them again." : "You can accept the request and leave to obtain supplies.",
    `PROGRESS: ${j.phase.toUpperCase()}${j.progress ? ` / ${Math.floor(j.progress*100)}%` : ""}.`,
    j.phase === "report" ? `Dock to close the aid report. Suggested port: ${findStation(w,j.stationId)?.st.name??"any available port"}.` : "Stay within 200m while crew work. Leaving pauses work and returns your crew aboard. Reloading retains the ship and repair progress.",
    "A tow cannot jump or cruise. A broken line leaves the ship at its last position. No cargo space is needed to accept a request."];
}

export function supportAction(w: World, j: SupportJob): string {
  if (j.phase === "report") return "DOCK AT A PORT TO CLOSE THE AID REPORT.";
  if (j.phase === "tow") return "TOW THE SHIP INTO A STATION. DO NOT JUMP OR CRUISE.";
  if (j.phase === "transfer") return `E TRANSFER PATIENT. FIT MEDIC AND ONE FREE BERTH (${supportBerths(w)} FREE).`;
  if (j.phase === "working") return `CREW WORK ${Math.floor(j.progress*100)}%. STAY WITHIN 200M.`;
  return j.kind === "repair" ? `E OFFER AID. ${j.supplied ? "PARTS DELIVERED." : "BRING TWO PARTS."} FIT ENGINEER OR BOARD.` : j.kind === "medical" ? `E OFFER MEDICAL AID. ${j.supplied ? "MEDICINES DELIVERED." : "BRING TWO MED SUPPLIES."} FIT MEDIC REQUIRED.` : "E TRANSFER TEN FUEL OR ATTACH A TOW.";
}

// This runs after the existing DockVisit payouts. The receipt itself pays nothing.
export function closeSupportAtPort(w: World, stationId: string): boolean {
  let changed=false;
  const found=findStation(w,stationId); if(!found || w.player.dockedAt!==stationId || w.player.systemId!==found.sys.id) return false;
  for(const j of w.player.support?.jobs??[]) if(j.phase==="report") {
    if(j.kind==="medical" && !j.patientDelivered) continue;
    changed=true;j.stationId=stationId;
    endSupport(w,j,"complete",`${j.kind === "medical" ? "Patient handed over" : "Aid report received"} at ${found.st.name}`);
    w.player.lastSupportReceipt={id:j.id,title:`${j.name}: ${j.outcome}`,time:w.time,stationId};
  }
  return changed;
}

export function reconcileSupport(w: World): void {
  for(const j of w.player.support?.jobs??[]) if(activeSupport(j)) {
    if(!w.systems[j.systemId]) {endSupport(w,j,"lost","The support system is no longer available.");continue;}
    if(!findStation(w,j.stationId)) {
      const port=Object.values(w.systems).flatMap(s=>s.stations)[0];
      if(port)j.stationId=port.id;else endSupport(w,j,"lost","No receiving port remains available.");
    }
    if(j.kind==="medical"&&j.phase==="report"&&!j.patientDelivered&&w.player.evacuees?.supportId!==j.id)endSupport(w,j,"lost","The patient is no longer aboard. No hospital transfer was recorded.");
  }
}

export function validSupport(value: unknown): boolean {
  if(value===undefined)return true;
  if(!value || typeof value!=="object")return false;
  const s=value as SupportState;
  if(!Number.isSafeInteger(s.serial)||s.serial<0||!Array.isArray(s.jobs)||s.jobs.length>16)return false;
  const ids=new Set<string>();
  return s.jobs.every(j=>{
    if(!j||![j.id,j.name,j.systemId,j.stationId].every(x=>typeof x==="string"&&x.length>0&&x.length<4096)||ids.has(j.id))return false;ids.add(j.id);
    if(!["repair","medical","fuel"].includes(j.kind)||!["waiting","working","transfer","tow","report","complete","lost","released"].includes(j.phase)||typeof j.supplied!=="boolean"||typeof j.paid!=="boolean")return false;
    if(![j.created,j.progress,j.ship?.x,j.ship?.y,j.ship?.angle,j.ship?.hull,j.ship?.hullMax].every(Number.isFinite)||j.created<0||j.progress<0||j.progress>1||j.ship.hullMax<=0)return false;
    if(j.patientDelivered!==undefined&&typeof j.patientDelivered!=="boolean")return false;
    if(j.worker!==undefined&&typeof j.worker!=="string"||j.ended!==undefined&&(!Number.isFinite(j.ended)||j.ended<0))return false;
    if(["transfer","report","complete"].includes(j.phase)&&!j.paid)return false;
    if(j.ship.cargo&&(!j.ship.cargo.id||typeof j.ship.cargo.id!=="string"||!Number.isSafeInteger(j.ship.cargo.qty)||j.ship.cargo.qty<0))return false;
    if(j.ship.tag!==undefined&&typeof j.ship.tag!=="string"||j.ship.mayday!==undefined&&typeof j.ship.mayday!=="boolean")return false;
    const deck=j.ship.repairInterior;
    return !deck || Number.isSafeInteger(deck.seed)&&!!deck.health&&typeof deck.health==="object"&&Object.values(deck.health).every(n=>Number.isFinite(n)&&n>=0&&n<=100)&&Array.isArray(deck.fires)&&deck.fires.length<=8&&deck.fires.every(f=>Number.isInteger(f.tx)&&Number.isInteger(f.ty));
  }) && s.jobs.filter(activeSupport).length<=4;
}
