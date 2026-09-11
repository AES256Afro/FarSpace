import { addCargo, cargoUsed, findStation, learnWord, logEntry, navRoute, passengersAboard, type Mission, type PlayerState, type StationDef, type World } from "../world";
import { hashStr } from "./rng";

export const SINGERS_DOCK_RANGE = 160;
export interface SingersAccount { light: number; dataShared: number; trades: number; joinedAt: number; homecomings?: number }
export type SingersOffer = "survey" | "fuel" | "repair" | "parts" | "relic";
export const SINGERS_OFFERS: SingersOffer[] = ["survey", "fuel", "repair", "parts", "relic"];
export interface LightQuote { label: string; detail: string; amount: number; cost: number; reason: string }

export function knowsSingersBerth(p: PlayerState): boolean {
  return !!p.singersHome && !!(p.flags?.singersHomeDone || p.flags?.singershome || p.singersExchange);
}

// The ring stays outside planetary and station orbits, clear of the jump gates.
// Its position depends on the home system, so loading or returning cannot move it.
export function singersBerth(w: World, systemId = w.player.systemId): { x: number; y: number } | null {
  if (!knowsSingersBerth(w.player) || systemId !== w.player.singersHome) return null;
  const sys = w.systems[systemId];
  if (!sys) return null;
  const outer = Math.max(0, ...sys.planets.map(p => p.orbit + p.radius), ...sys.stations.map(s => s.orbit));
  const radius = Math.max(5600, outer + 400);
  const start = (hashStr(sys.id) % 360) * Math.PI / 180;
  let best = { x: 0, y: 0 }, clearance = -1;
  for (let i = 0; i < 12; i++) {
    const angle = start + i * Math.PI / 6;
    const pos = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    const d = Math.min(Infinity, ...sys.jumpPoints.map(j => Math.hypot(pos.x - j.x, pos.y - j.y)));
    if (d > clearance) { best = pos; clearance = d; }
  }
  return best;
}

export function atSingersBerth(w: World): boolean {
  const berth = singersBerth(w), p = w.player;
  return !!berth && Math.hypot(p.x - berth.x, p.y - berth.y) < SINGERS_DOCK_RANGE;
}

export function enterSingersBerth(w: World): boolean {
  if (!atSingersBerth(w)) return false;
  const p = w.player;
  if (!p.singersExchange) {
    p.singersExchange = { light: 0, dataShared: 0, trades: 0, joinedAt: w.time };
    logEntry(w, "The singers opened the berth. The interpreter called it a market, then corrected herself: a place to bring things back.");
  }
  return true;
}

export function lightQuote(p: PlayerState, offer: SingersOffer): LightQuote {
  const light = p.singersExchange?.light ?? 0;
  if (offer === "survey") return { label: "SHARE A SURVEY", detail: "100 EXPLORATION DATA -> 5 LIGHT", amount: 100, cost: -5, reason: (p.expData ?? 0) >= 100 ? "" : "BRING 100 EXPLORATION DATA." };
  if (offer === "fuel" || offer === "repair") {
    const fuel = offer === "fuel";
    const missing = Math.max(0, (fuel ? p.fuelMax - p.fuel : p.hullMax - p.hull));
    const amount = Math.min(fuel ? 25 : 20, missing);
    const cost = Math.ceil(amount * (fuel ? 0.2 : 0.3));
    const noun = fuel ? "FUEL" : "HULL";
    return { label: fuel ? "FILL THE TANK" : "MEND THE HULL", detail: `${Math.round(amount * 10) / 10} ${noun} FOR ${cost} LIGHT`, amount, cost, reason: !amount ? `${noun} ALREADY FULL.` : light < cost ? `NEED ${cost} LIGHT.` : "" };
  }
  const parts = offer === "parts", amount = parts ? 2 : 1, cost = parts ? 4 : 30;
  return { label: parts ? "ADAPTED PARTS" : "A SINGING RELIC", detail: `${amount} ${parts ? "PARTS" : "RELIC"} FOR ${cost} LIGHT`, amount, cost, reason: cargoUsed(p) + amount > p.cargoMax ? `NEED ${amount} FREE CARGO SPACE.` : light < cost ? `NEED ${cost} LIGHT.` : "" };
}

export function tradeWithSingers(w: World, offer: SingersOffer): { ok: boolean; message: string } {
  const p = w.player, account = p.singersExchange;
  if (!atSingersBerth(w) || !account) return { ok: false, message: "DOCK AT THE SINGERS' BERTH FIRST." };
  const q = lightQuote(p, offer);
  if (q.reason) return { ok: false, message: q.reason };
  if (offer === "survey") { p.expData = (p.expData ?? 0) - q.amount; account.dataShared += q.amount; }
  else if (offer === "fuel") p.fuel = Math.min(p.fuelMax, p.fuel + q.amount);
  else if (offer === "repair") p.hull = Math.min(p.hullMax, p.hull + q.amount);
  else if (!addCargo(p, offer === "parts" ? "parts" : "relics", q.amount)) return { ok: false, message: "THE HOLD IS FULL." };
  account.light -= q.cost;
  account.trades++;
  return { ok: true, message: offer === "survey" ? "THEY KEEP THE STORY OF WHERE YOU WENT. +5 LIGHT." : `${q.label}: ${q.detail}.` };
}

export function singerFare(w: World, station: StationDef): Mission | null {
  const p = w.player;
  if (station.type !== "research" || !knowsSingersBerth(p) || passengersAboard(p).some(m => m.passengerKind === "singer")) return null;
  const from = findStation(w, station.id)?.sys, home = p.singersHome && w.systems[p.singersHome];
  if (!from || !home || from.id === home.id) return null;
  const route = navRoute(w, from.id, home.id);
  if (!route || route.length < 2) return null;
  const reward = 20 + (route.length - 1) * 5;
  const name = ["The Held Note", "Light Through Rain", "The Fifth Voice", "A Small Interval"][w.missionCounter % 4];
  return {
    id: `fare-singer-${station.id}-${w.missionCounter++}`, kind: "passenger", passengerKind: "singer",
    title: `Homeward: ${name}`, passengerName: name,
    desc: `One cabin to the singers' berth in ${home.name}. ${reward} light on arrival, no deadline. The traveler carries a listening bowl and insists it gets the window. G then R plots home.`,
    fromStationId: station.id, targetSystemId: home.id, reward: 0, lightReward: reward,
    accepted: false, done: false, tier: 0, party: 1, mood: 65, demand: null, docksAboard: 0, sights: [],
  };
}

export function singerBoardingReason(w: World, m: Mission, stationId: string): string {
  if (m.accepted || m.done || w.player.missions.some(x => x.id === m.id)) return "THIS PASSENGER IS ALREADY ON YOUR MANIFEST.";
  if (!knowsSingersBerth(w.player) || m.targetSystemId !== w.player.singersHome || m.fromStationId !== stationId) return "THIS OFFER IS NO LONGER AVAILABLE HERE.";
  if (passengersAboard(w.player).some(x => x.passengerKind === "singer")) return "YOU ALREADY HAVE A SINGER TRAVELING HOME.";
  return "";
}

export function deliverSinger(w: World, m: Mission): string | null {
  const p = w.player;
  if (m.kind !== "passenger" || m.passengerKind !== "singer" || !m.accepted || m.done || !p.missions.includes(m)
    || m.targetSystemId !== p.systemId || !atSingersBerth(w)) return null;
  if (!enterSingersBerth(w)) return null;
  const account = p.singersExchange!;
  const pay = m.lightReward ?? 25;
  m.done = true;
  account.light += pay; account.homecomings = (account.homecomings ?? 0) + 1;
  p.fares = (p.fares ?? 0) + 1;
  const name = m.passengerName ?? "A singer";
  (p.guestbook ??= []).push({ name, kind: "singer", from: findStation(w, m.fromStationId)?.st.name ?? "a research station",
    to: "The singers' berth", mood: Math.round(m.mood ?? 65), t: w.time,
    line: m.dined ? "There was a place for my bowl at your table. I will remember the shape of it." : "You brought me home without asking the light to hurry. Your name belongs in this room.",
  });
  if (p.guestbook.length > 12) p.guestbook.shift();
  const learned = learnWord(p, "return");
  logEntry(w, `${name} went home through the singers' berth. ${pay} light received. The listening bowl had the window all the way.`);
  return `${name.toUpperCase()} IS HOME. +${pay} LIGHT.${learned ? " A WORD LEARNED: RETURN." : " THE ROOM KNOWS YOUR NAME."}`;
}
