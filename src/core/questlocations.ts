import { activeSupport, supportAction } from "./supportjobs";
import { findStation, missionDeliverable, type World, type Mission } from "../world";
import { schoolDestination } from "./flightschool";
import { commodity } from "../data/data";
import { serviceDestination } from "./service";

export interface QuestLocation {
  id: string;
  title: string;
  source: "CONTRACT" | "STORY" | "CREW" | "SERVICE" | "COUNCIL" | "SCHOOL" | "AID";
  systemId: string;
  contactId?: string;
  poiId?: string;
  action: string;
  ready?: boolean;
  focused?: boolean;
}

// Read current objectives without advancing a quest or revealing a hidden signal.
export function questLocations(w: World): QuestLocation[] {
  const p = w.player, out: QuestLocation[] = [];
  const add = (q: QuestLocation) => {
    const sys = w.systems[q.systemId]; if (!sys) return;
    if (q.contactId?.startsWith("wreck:") && !sys.wrecks.some(r => `wreck:${r.id}` === q.contactId)) return;
    if (q.contactId?.startsWith("infra:") && !w.infra?.some(i => i.systemId === sys.id && `infra:${i.id}` === q.contactId)) return;
    out.push(q);
  };
  const station = (q: Omit<QuestLocation, "systemId" | "contactId">, id?: string) => {
    const found = id ? findStation(w, id) : null;
    if (found) add({ ...q, systemId: found.sys.id, contactId: `station:${found.st.id}` });
  };
  const planet = (q: Omit<QuestLocation, "contactId">, idx?: number) => {
    if (idx !== undefined && w.systems[q.systemId]?.planets[idx]) add({ ...q, contactId: `planet:${idx}` });
    else if (idx === undefined) add(q);
  };
  const signal = (q: Omit<QuestLocation, "contactId">, id?: string) => {
    const an = w.systems[q.systemId]?.anomalies.find(a => a.id === id && a.discovered && !a.claimed);
    add({ ...q, contactId: an ? `signal:${an.id}` : undefined, action: an ? "APPROACH SIGNAL. E TO INVESTIGATE." : "SEARCH THIS SYSTEM. HOLD V TO SCAN." });
  };
  for(const j of p.support?.jobs??[]) if(activeSupport(j)) {
    const q={id:j.id,title:`${j.name}: ${j.kind} aid`,source:"AID" as const,action:supportAction(w,j)};
    if(j.phase==="report"||j.phase==="tow")station(q,j.stationId);
    else add({...q,systemId:j.systemId,contactId:`support:${j.id}`});
  }
  const school = schoolDestination(w);
  if (school && !(p.tutorial === 3 && p.missions.some(m => m.id === p.flightSchool?.missionId && m.accepted && !m.done))) station({ id: "school:port", title: "Flight School", source: "SCHOOL", action: p.tutorial === 3 ? "DOCK. COLLECT FIRST POST PAYMENT IN MISSIONS." : p.tutorial === 5 ? "F5 SAVES AND COMPLETES THE LESSON." : "DOCK AT THIS PORT FOR YOUR FLIGHT LESSON." }, school.st.id);
  for (const m of p.missions) {
    if (!m.accepted || m.done) continue;
    const q = { id: `mission:${m.id}`, title: m.title, source: "CONTRACT" as const, systemId: m.targetSystemId, action: "COMPLETE THE OBJECTIVE HERE." };
    const turnIn = [m.targetStationId, m.fromStationId].map(id => id ? findStation(w, id) : null).find(f => f && missionDeliverable(w, m, f.st));
    if (turnIn) { station({ ...q, action: "DOCK. COLLECT PAYMENT IN MISSIONS.", ready: true }, turnIn.st.id); continue; }
    if (m.passengerKind === "singer") { add({ ...q, contactId: "singers", action: "E AT THE SINGERS' BERTH." }); continue; }
    if (m.kind === "passenger" && m.passengerKind === "tourist" && !m.sightSeen) {
      planet({ ...q, systemId: m.sightSystemId ?? m.targetSystemId, action: m.sightPlanetIdx !== undefined ? "ENTER ORBIT FOR THE PASSENGER'S VIEW." : "SHOW THE PASSENGER THE BOOKED SIGHT." }, m.sightPlanetIdx); continue;
    }
    if (m.kind === "ground") { planet({ ...q, action: `LAND WITH THE ROVER. ${m.groundGoal?.toUpperCase() ?? "SURVEY"} ${m.groundDone ?? 0}/${m.groundNeed ?? 1}.` }, m.groundPlanetIdx); continue; }
    if (m.kind === "observe") { planet({ ...q, action: "HOLD A QUIET ORBIT. NO RED ALERT." }, m.sightPlanetIdx); continue; }
    if (m.kind === "photo" && m.photo) {
      const photo = m.photo, wonder = w.wonders?.find(x => x.id === photo.wonderId && x.seen);
      if (photo.planetIdx !== undefined) planet({ ...q, systemId: photo.systemId, action: "ENTER ORBIT. F7 TAKES THE PICTURE." }, photo.planetIdx);
      else add({ ...q, systemId: photo.systemId, contactId: wonder ? `wonder:${wonder.id}` : undefined, action: "FIND THE REQUESTED VIEW. F7 TAKES THE PICTURE." });
      continue;
    }
    if (m.anomalyId) { signal(q, m.anomalyId); continue; }
    if (m.killsNeeded) { add({ ...q, action: `FIND THE CONTRACT TARGETS. ${m.kills ?? 0}/${m.killsNeeded}.` }); continue; }
    if (m.kind === "patrol") { add({ ...q, action: `PATROL THIS SYSTEM. ${Math.floor(m.patrolT ?? 0)}/${m.patrolNeed ?? 90} SECONDS.` }); continue; }
    if (m.kind === "escort" || m.kind === "convoy" || (m.kind === "arc" && m.arcFaction === "fdm" && m.arcStage === 1)) { add({ ...q, action: "ESCORT THE SHIP THROUGH ITS ROUTE." }); continue; }
    const action = missionAction(m, p.cargo);
    if (m.targetStationId) station({ ...q, action }, m.targetStationId); else add({ ...q, action });
  }
  const story = p.story ?? 0, target = p.storyTarget;
  if (story === 2 && target) planet({ id: "story:signal", title: "The Signal: The vault", source: "STORY", systemId: target.systemId, poiId: target.poiId, action: "ENTER ORBIT. LAND AT THE MARKED RUIN." }, target.planetIdx);
  if (story === 3) for (const sys of Object.values(w.systems)) for (const st of sys.stations) if (st.type === "research") station({ id: `story:research:${st.id}`, title: "The Signal: Decipherment", source: "STORY", action: "DOCK AT ANY RESEARCH STATION." }, st.id);
  if (story === 4 && p.storyVeil) for (const st of w.systems[p.storyVeil]?.stations ?? []) station({ id: `story:veil:${st.id}`, title: "The Signal: The Veil", source: "STORY", action: "DOCK TO SPEAK WITH THE VEIL." }, st.id);
  if (story === 5 && p.storyOrigin) signal({ id: "story:origin", title: "The Signal: The source", source: "STORY", systemId: p.storyOrigin, action: "" }, "the-beacon");
  const convoy = p.convoyTrack;
  if (p.story2 === 0 && convoy) signal({ id: "story:convoy", title: "The missing convoy", source: "STORY", systemId: convoy.laneSystemId, action: "" }, `convoy-${convoy.tag}`);
  if (p.story2 === 1 && convoy) station({ id: "story:convoy", title: "The missing convoy", source: "STORY", action: "DOCK TO MEET THE HARBOURMASTER." }, convoy.partnerStationId);
  const keeper = p.keeper;
  if (keeper && (p.story3 === 0 || p.story3 === 2)) {
    const found = w.infra?.find(i => i.owner === "THE KEEPER" && i.systemId === keeper.systemId);
    const discovered = w.systems[keeper.systemId]?.anomalies.find(a => a.id === keeper.contactId && a.discovered && !a.claimed);
    add({ id: "story:keeper", title: "The Keeper", source: "STORY", systemId: keeper.systemId, contactId: discovered ? `signal:${discovered.id}` : found ? `infra:${found.id}` : undefined, action: p.story3 === 0 ? "BRING SPARE PARTS. E TO REPAIR." : discovered ? "E TO INVESTIGATE THE CONTACT." : "HOLD V BESIDE THE KEEPER'S LIGHT." });
  }
  if (keeper && p.story3 === 1) add({ id: "story:keeper", title: "The Keeper's log", source: "STORY", systemId: keeper.wreckSystemId, contactId: `wreck:${keeper.wreckId}`, action: "E TO BOARD. RECOVER THE SHIP'S LOG." });
  for (const crew of p.crew) {
    const a = crew.arc; if (!a || a.done || a.stage < 0 || a.stage > 1) continue;
    const q = { id: `crew:${JSON.stringify([crew.name, crew.role, crew.home ?? "", a.id])}`, title: `${crew.name}'s journey`, source: "CREW" as const, systemId: a.targetSystemId ?? "", action: "" };
    if (a.id === "engineer" && a.stage === 0 && a.wreckId) add({ ...q, contactId: `wreck:${a.wreckId}`, action: "E TO BOARD THE OLD SHIP." });
    if (a.id === "engineer" && a.stage === 1) station({ ...q, action: "DOCK WITH TWO SPARE PARTS." }, a.targetStationId);
    if (a.id === "medic" && a.stage === 0) station({ ...q, action: "DOCK WITH THREE MEDICAL SUPPLIES." }, a.targetStationId);
    if (a.id === "pilot" && a.stage === 1) planet({ ...q, action: "ENTER ORBIT FOR THE VIEW." }, a.planetIdx);
    if (a.id === "gunner") station({ ...q, action: a.stage === 0 ? "DOCK TO VISIT THE OLD CREW." : "DOCK WITH TWO LUXURIES." }, a.targetStationId);
  }
  const order = p.service?.order, dest = order ? serviceDestination(w) : null;
  if (order && dest) {
    const q: QuestLocation = { id: `service:${order.id}`, title: order.title, source: "SERVICE", systemId: dest.systemId, action: order.stage === "return" ? "DOCK AND REPORT TO THE SERVICE." : order.stage === "fares" ? "DELIVER THE BOOKED PASSENGER." : order.kind === "liaison" ? "DOCK. P TO WALK THE DECK; E AT THE OFFICE." : order.description };
    if (dest.stationId) station(q, dest.stationId); else if (dest.singer) add({ ...q, contactId: "singers" }); else planet(q, order.planetIndex);
  }
  const council = p.council?.mandate;
  if (council) station({ id: `council:${JSON.stringify([council.week, council.fromStationId, council.targetStationId])}`, title: "Council journey", source: "COUNCIL", action: council.stage === "outbound" ? "DOCK. P TO WALK THE DECK; E AT THE OFFICE." : "DOCK AND BRING THE REPLY TO THE COUNCIL." }, council.stage === "outbound" ? council.targetStationId : council.fromStationId);
  for (const q of out) if (q.id === p.objectiveFocusId && out.filter(other => other.id === q.id).length === 1) q.focused = true;
  return out;
}
function missionAction(m: Mission, cargo: Record<string, number>): string {
  if (m.kind === "repair") return "DOCK. OPEN MISSIONS TO REPAIR THE TENDER.";
  if (m.kind === "emergency") return "DOCK WITH A FIT ENGINEER ABOARD.";
  if (m.commodityId && m.qty) return `BRING ${m.qty} ${commodity(m.commodityId).name.toUpperCase()}. ABOARD ${cargo[m.commodityId] ?? 0}.`;
  if (m.kind === "post") return "DOCK TO DELIVER THE POST.";
  return "DOCK TO COMPLETE THE CONTRACT.";
}
