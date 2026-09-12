import { supportAtShip, supportTerms } from "../../core/supportjobs";
import type { Game } from "../../game";
import type { FlightScene } from "./index";
import type { Npc } from "./types";
import { inSafeZone } from "./ai";
import { flightInteraction } from "./interaction";
import { piratePassageRemaining } from "../../core/piracy";
import { LAW_COOLDOWN, lawActive, lawSettlement } from "../../core/law";
import { singersBerth } from "../../core/singers";
import { faction } from "../../data/data";

export interface FlightContact {
  name: string;
  relationship: string;
  intent: string;
  distance: number;
  details: string[];
  primary: boolean;
}

// Follow the same branch order as updateNpcs. Do not infer private intentions
// from cosmetic names, comms text or the direction a sprite happens to face.
export function npcIntent(fs: FlightScene, g: Game, n: Npc): string {
  const p = g.world.player, sys = g.world.systems[p.systemId];
  const distance = (o: { x: number; y: number }) => Math.hypot(o.x - n.x, o.y - n.y);
  const livePirates = fs.npcs.filter(o => o.kind === "pirate" && o.hull > 0);
  if (n.convoy) return "Keeping convoy formation";
  if (n.kind === "pirate") {
    if (n.fleeing || (n.variant !== "captain" && n.hull < n.hullMax * .3)) return "Breaking off and fleeing";
    if (fs.platforms.some(pf => distance(pf) < 360)) return "Avoiding a defence platform";
    if (distance(p) < 700 && !inSafeZone(fs, g, p.x, p.y) && !fs.piratesFriendly(g)) return distance(p) < 260 ? "Attacking your ship" : "Intercepting your ship";
    const prey = fs.npcs.find(o => o.kind === "trader" && o.hull > 0 && distance(o) < 500);
    return prey ? `Hunting ${prey.name ?? "a freighter"}` : "Cruising the lane";
  }
  if (n.kind === "drone") {
    const target = livePirates.find(o => !fs.piratesFriendly(g) && !o.fleeing && Math.hypot(o.x - p.x, o.y - p.y) < 450);
    return target ? `Engaging ${target.name ?? "a corsair"}` : "Holding beside your ship";
  }
  if (n.kind === "fighter") {
    const st = sys.stations[n.targetIdx % Math.max(1, sys.stations.length)];
    const hx = st ? Math.cos(st.angle) * st.orbit : 0, hy = st ? Math.sin(st.angle) * st.orbit : 0;
    if (fs.lawLevel(g) >= 1 && Math.hypot(hx - p.x, hy - p.y) < 500) return distance(p) < 280 ? "Attacking your ship" : "Intercepting your ship";
    const target = livePirates.find(o => Math.hypot(hx - o.x, hy - o.y) < 800);
    return target ? `Defending port against ${target.name ?? "a corsair"}` : `Circling ${st?.name ?? "home position"}`;
  }
  if (n.kind === "trader") {
    if (n.disabled) return n.casualties ? "Disabled with casualties aboard" : n.mayday ? "Drifting with empty fuel tanks" : "Disabled and waiting for repairs";
    if (n.casualties) return "Stopped with casualties aboard";
    const threat = livePirates.find(o => distance(o) < 200);
    if (threat) return `Evading ${threat.name ?? "a corsair"}`;
    if (n.transit) return "Travelling to a transit waypoint";
    const st = sys.stations[n.targetIdx % Math.max(1, sys.stations.length)];
    return st ? `Hauling cargo to ${st.name}` : "Destination unknown";
  }
  if (fs.lawLevel(g) >= 1 && distance(p) < 900) return distance(p) < 260 ? "Attacking your ship" : "Pursuing your ship";
  const target = livePirates.find(o => distance(o) < 900);
  return target ? `Pursuing ${target.name ?? "a corsair"}` : "Patrolling the lane";
}

export function contactLawTerms(fs: FlightScene, g: Game): string[] {
  const w = g.world, p = w.player, sys = w.systems[p.systemId], quote = lawSettlement(w);
  const terms = [`JURISDICTION: ${faction(sys.factionId).name}`];
  if (lawActive(w)) {
    terms.push(fs.lawContact(g) ? "PURSUIT ACTIVE: break contact to start the free cooldown." : `PURSUIT COOLDOWN: ${Math.max(0, Math.ceil(LAW_COOLDOWN - (p.lawQuiet ?? 0)))} flight seconds remaining.`);
    terms.push("Stay at least 900m from patrols and fighters, and 500m from law platforms. New offences restart the clock. Closing pursuit does not repair reputation.");
  } else terms.push("No open pursuit. Military port access still depends on reputation.");
  terms.push(quote ? `U TRAFFIC CONTROL: ${quote.cost}cr to settle ${quote.factions.map(id => faction(id).name).join(", ")}. You have ${p.credits}cr. Settlement closes cases and restores those factions to at least neutral.` : sys.factionId === "vex" ? "No lawful settlement office here." : "No settlement payment due.");
  const passage = piratePassageRemaining(w);
  terms.push(passage > 0 ? `CORSAIR PASSAGE: ${Math.ceil(passage)} flight seconds in ${sys.name}. Corsairs will not target your ship. Your gunner and escorts hold fire. A manual hit ends the agreement. Law pursuit is separate.` : (p.rep.vex ?? 0) >= 40 ? "Corsairs respect your Veil standing. Law pursuit is separate." : "No corsair passage agreement. E can open parley with an active corsair within 260m.");
  return terms;
}

export function flightContacts(fs: FlightScene, g: Game): FlightContact[] {
  const p = g.world.player, sys = g.world.systems[p.systemId], pick = flightInteraction(fs, g);
  const contacts: FlightContact[] = [];
  for (const n of fs.npcs) {
    const distance = Math.hypot(n.x - p.x, n.y - p.y);
    if (n.hull <= 0 || n.docked || distance >= 1400) continue;
    const primary = (pick?.kind === "help" || pick?.kind === "parley") && pick.target === n;
    const lawShip = n.kind === "patrol" || n.kind === "fighter";
    const relationship = n.convoy || n.kind === "drone" ? "With you" : n.kind === "pirate" ? fs.piratesFriendly(g) ? "Passage respected" : n.fleeing ? "Disengaging" : "Hostile corsair" : lawShip ? fs.lawLevel(g) > 0 ? "Law pursuit" : "Local security" : "Civilian";
    const details = [`Hull ${Math.ceil(n.hull)}/${n.hullMax}`];
    if (lawShip) {
      details.push(`Authority: ${faction(sys.factionId).name}`);
      if (fs.lawLevel(g) > 0) details.push(`Pursuit cause: ${p.wanted > .5 ? "active wanted record" : "hostile local reputation"}. U opens traffic control for cooldown and settlement terms.`);
    }
    if (n.kind === "pirate") details.push(fs.piratesFriendly(g) ? "Passage protects your ship; other freighters can still be attacked." : "Corsairs attack unprotected ships. Leave their 700m intercept range, reach protected space, or approach within 260m and use parley.");
    if (n.kind === "trader" && (n.disabled || n.casualties || n.hull < n.hullMax * .5)) {
      const aid=supportAtShip(g.world,n);
      if(aid)details.push(...supportTerms(g.world,aid));
      else if (fs.repairJob?.npc === n) details.push(`${fs.repairJob.crewName} is ${fs.repairJob.kind === "medic" ? "treating casualties" : "repairing the ship"}. Stay close.`);
      else if (fs.repairJob) details.push("Your crew already has a rescue job. Finish it before opening another help call.");
      else if (n.casualties) details.push(`Medical aid: two medical supplies (${p.cargo.med??0} aboard) and a fit medic. Transfer the critical patient afterward with a medic and one free passenger berth. You can accept and return with supplies.`);
      else if (n.mayday) details.push(`Fuel aid: transfer 10 fuel; at least 15 must be aboard. You have ${Math.ceil(p.fuel)}. The Pilots' Fund pays 300cr.`);
      else if (n.disabled) details.push(`Repair aid: deliver two spare parts (${p.cargo.parts??0} aboard), then send a fit engineer or board and repair it yourself for 400cr. Tow delivery pays 550cr. You can accept and return with supplies.`);
      else details.push(`Hull aid: transfer a spare part. Parts aboard: ${p.cargo.parts ?? 0}.`);
      if (!primary && !fs.repairJob) details.push(distance >= 80 ? "Approach within 80m to offer help." : "Another contact has priority on E. Its current action is shown on the flight display.");
    }
    if (primary) details.push(pick!.prompt);
    else details.push("You may continue flying. Reading this contact does not select an action or change course.");
    contacts.push({ name: n.name ?? (n.kind === "pirate" ? "Corsair" : n.kind === "trader" ? "Freighter" : n.kind), relationship, intent: fs.towing === n ? "Under tow by your ship" : npcIntent(fs, g, n), distance, details, primary });
  }
  if (pick && pick.kind !== "help" && pick.kind !== "parley") {
    let name = "Nearby location", relationship = "Location", intent = pick.prompt, distance = 0;
    const details: string[] = [pick.prompt];
    if (pick.kind === "station") {
      const st = pick.target, rep = p.rep[st.factionId] ?? 0;
      name = st.name; relationship = faction(st.factionId).name; intent = "Docking service";
      distance = Math.hypot(Math.cos(st.angle) * st.orbit - p.x, Math.sin(st.angle) * st.orbit - p.y);
      if (st.military && rep < -20) details.push("Military docking denied: reputation must be at least -20. U traffic control can offer settlement.");
      else if (rep < -60 && !p.lawStandDown?.[st.factionId]) details.push("Docking denied by hostile reputation. Close pursuit or settle with traffic control.");
      else details.push("Docking request available. Control may ask you to hold while the bay clears.");
    } else if (pick.kind === "gate") {
      name = `Gate to ${g.world.systems[pick.target.targetSystemId].name}`; intent = pick.target.guarded ? "Customs checks occur when you jump" : "Jump passage"; distance = Math.hypot(pick.target.x - p.x, pick.target.y - p.y);
    } else if (pick.kind === "wreck" || pick.kind === "signal" || pick.kind === "ark") {
      name = pick.target.name; distance = Math.hypot(pick.target.x - p.x, pick.target.y - p.y); intent = pick.kind === "wreck" ? "Salvage and recovery available" : pick.kind === "ark" ? "Boarding available" : "Investigation available";
    } else if (pick.kind === "planet") {
      name = pick.target.name; intent = "Orbital approach"; distance = Math.hypot(Math.cos(pick.target.angle) * pick.target.orbit - p.x, Math.sin(pick.target.angle) * pick.target.orbit - p.y);
    } else if (pick.kind === "singers") { name = "Singers' berth"; intent = "Docking approach"; const berth = singersBerth(g.world); if (berth) distance = Math.hypot(berth.x - p.x, berth.y - p.y); }
    else if (pick.kind === "structure") { name = "Structure"; intent = "Services"; distance = Math.hypot(pick.target.x - p.x, pick.target.y - p.y); }
    else { name = "Construction site"; intent = "Deployment"; }
    contacts.unshift({ name, relationship, intent, distance, details, primary: true });
  }
  return contacts.sort((a, b) => Number(b.primary) - Number(a.primary) || a.distance - b.distance);
}
