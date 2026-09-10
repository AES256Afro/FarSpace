// World model + procedural galaxy generation + world simulation rules.
// Pure data and pure functions — scenes render it. No DOM here (tests run in node).

import { RNG, hashStr } from "./core/rng";
import { clamp } from "./core/mathx";
import {
  FACTIONS, ECONOMY, COMMODITIES, RARES, StationType,
  genSystemName, genStationName, genPersonName, planetName,
} from "./data/data";
import { STARS, starXYZ, starDistance } from "./data/stars";
import { hull } from "./data/hulls";
import { moduleDef } from "./data/modules";
import type { CrewMember, CrewRole } from "./data/crew";
import { ROLE_INFO, CREW_TRAITS, SICKNESS, LEAVE_DOCKS } from "./data/crew";

// ---------- Types ----------

export interface Region {
  name: string;
  factionId: string | null;   // null = uncontrolled
  lat: number; lon: number;   // seed point (degrees)
  resource: string;           // commodity id this region yields
  color: string;
}

export type PoiKind = "city" | "mine" | "research" | "defense" | "ruin" | "outpost";

export interface Poi {
  id: string;
  name: string;
  kind: PoiKind;
  lat: number; lon: number;
  regionIdx: number;
  landable: boolean;
  surveyed: boolean;
  looted?: boolean; // ruins: relic caches taken
}

export interface PlanetSurface {
  regions: Region[];
  pois: Poi[];
  satellites: number;
  scanned: boolean;
  surveyFiled?: boolean;
}

export interface Planet {
  name: string;
  orbit: number;
  angle: number;
  speed: number;
  radius: number;
  palette: number;
  surface: PlanetSurface | null;
}

export interface StationDef {
  id: string;
  name: string;
  type: StationType;
  military: boolean;
  orbit: number;
  angle: number;
  speed: number;
  factionId: string;
  prices: Record<string, number>;   // recomputed from stock each tick
  stock: Record<string, number>;
  fuelPrice: number;
  repairPrice: number;
  barPatrons: string[];
  rare?: string; // commodity id produced only here
}

export interface AsteroidDef {
  x: number; y: number;
  radius: number;
  rich: boolean;
  core?: boolean; // lasers won't crack it; needs a seismic charge
  ore: number;
  spriteSeed: number;
  rot: number; rotSpeed: number;
}

export interface JumpPointDef {
  id: string;
  x: number; y: number;
  targetSystemId: string;
  guarded: boolean;
}

export interface WreckDef {
  id: string;
  x: number; y: number;
  looted: boolean;
  loot: { id: string; qty: number }[];
  hazard: number; // 0..1 how much fire/breach inside
  name: string;
}

export type AnomalyKind = "data" | "derelict" | "survey";

export interface AnomalyDef {
  id: string;
  name: string;
  kind: AnomalyKind;
  x: number; y: number;
  discovered: boolean;
  claimed: boolean;
  reward: number;
}

export interface SystemDef {
  id: string;
  name: string;
  gx: number; gy: number;
  factionId: string;
  sunColor: string;
  sunRadius: number;
  starClass?: string;
  planets: Planet[];
  stations: StationDef[];
  asteroids: AsteroidDef[];
  jumpPoints: JumpPointDef[];
  wrecks: WreckDef[];
  anomalies: AnomalyDef[];
  pirateActivity: number;
  links: string[];
  ly: Record<string, number>; // distance to each linked system, light-years
  permit?: boolean; // entry needs ALLIED standing with the owning faction
}

export type MissionKind = "delivery" | "bounty" | "mining" | "escort" | "passenger" | "research" | "arc" | "ground" | "repair";

export interface Mission {
  id: string;
  kind: MissionKind;
  title: string;
  desc: string;
  fromStationId: string;
  targetSystemId: string;
  targetStationId?: string;
  commodityId?: string;
  qty?: number;
  killsNeeded?: number;
  kills?: number;
  reward: number;
  accepted: boolean;
  done: boolean;
  escortDone?: boolean;
  passengerName?: string;
  passengerKind?: "vip" | "refugee" | "fugitive" | "tourist" | "courier";
  sightPlanetIdx?: number;  // tourists want to orbit this planet in the target system first
  sightSeen?: boolean;
  sightKind?: SightKind;    // what the tourists booked to see
  sights?: string[];        // everything they saw on the way (pays extra)
  mood?: number;            // 0..100: how the journey is going for them
  demand?: string | null;   // a commodity they'd like brought aboard
  patience?: number;        // dockings before they start to sour
  docksAboard?: number;
  party?: number;           // how many of them there are
  anomalyId?: string;
  syndicate?: string;                  // contract issued by an AI syndicate (tag)
  tenderDone?: boolean;                // repair tenders: the work is done, collect at the station
  shipTotal?: number;                  // standing orders: shipments in the contract
  shipDone?: number;
  lives?: number;
  syndicateTarget?: string;            // bounty against this syndicate: they will remember
  groundPlanetIdx?: number;            // ground contracts: which world
  groundGoal?: "flora" | "probe" | "outcrop";
  groundNeed?: number;
  groundDone?: number;
  arcFaction?: string;
  arcStage?: number;
  repReward?: number;
  tier?: number; // 0 civilian, 1 trusted, 2 military
}

export interface NewsItem {
  headline: string;
  body: string;
}

export interface WorldEvent {
  t: number;
  kind: "murder" | "rescue" | "seizure" | "shock" | "war" | "peace" | "discovery" | "arc" | "raid";
  systemId: string;
  text: string;
}

export interface War {
  a: string; b: string;
  systemId: string;
  until: number;
}

export type ShipSystemId = "engines" | "life" | "weapons" | "cargo" | "reactor" | "comms";

export interface ShipSystem {
  id: ShipSystemId;
  name: string;
  health: number;
}

export interface PlayerState {
  credits: number;
  systemId: string;
  x: number; y: number;
  vx: number; vy: number;
  angle: number;
  hull: number; hullMax: number;
  shield: number; shieldMax: number;
  fuel: number; fuelMax: number;
  oxygen: number; oxygenMax: number;
  cargo: Record<string, number>;
  cargoMax: number;
  systems: ShipSystem[];
  missions: Mission[];
  dockedAt: string | null;
  kills: number;
  wanted: number;
  navTarget?: string | null;
  hullId: string;
  rep: Record<string, number>;
  hints: Record<string, boolean>;
  crew: CrewMember[];
  skills: { piloting: number; engineering: number };
  storage: Record<string, Record<string, number>>;
  discoveries: number;
  breaches: { tx: number; ty: number }[];
  fires: { tx: number; ty: number }[];
  arcs: Record<string, number>; // faction id → completed stage count
  tutorial?: number; // flight school step; -1 = off/done
  torpedoes?: number; // homing torpedo ammo
  flags?: Record<string, boolean>;   // one-off deeds for achievements
  achievements?: string[];
  dailyDone?: string;                // UTC date key of the last daily completed
  modules?: string[];                // fitted module ids (data/modules.ts)
  heat?: number;                     // 0..100+, from stars and scooping
  expData?: number;                  // unsold exploration data, in credits
  expLog?: Record<string, number>;   // system id → scan level (1 arrival, 2 detailed)
  expSold?: number;                  // lifetime exploration data sold (explorer rank)
  tradeRevenue?: number;             // lifetime market sales (trader rank)
  mined?: number;                    // lifetime ore units cracked (miner rank)
  firsts?: Record<string, string>;   // system id → call sign of the first discoverer (learned)
  marketMemory?: Record<string, { t: number; systemId: string; prices: Record<string, [number, number]> }>; // station id → last seen buy/sell
  bookmarks?: string[];              // system ids
  shipName?: string;
  paint?: string;                    // accent colour override for your ship's sprite
  rareRevenue?: number;              // credits from rares sold away from origin
  seismic?: number;                  // seismic charges for core asteroids
  materials?: Record<string, number>;
  engineering?: Record<string, number>; // blueprint id → grade
  goalContrib?: Record<string, number>; // community goal id → units contributed
  fleet?: StoredShip[];              // hulls parked at stations
  ground?: Record<string, GroundState>; // ground map key → what's been taken/charted
  codex?: Record<string, number>;    // "flora:<species>", "biome:<name>" → count
  synRep?: Record<string, number>;   // syndicate tag → standing
  warPayout?: { tag: string; value: number } | null; // squadron treasury share owed after a won war
  encounters?: Record<string, number>; // encounter id → times seen
  homesteads?: Homestead[];                           // claims staked on charted regions
  repairs?: number;                                   // ships brought back to life
  lives?: number;                                     // people your medic pulled through
  rescues?: number;                                   // distress calls answered, crises broken
  charters?: string[];                                // factions that granted you a charter (+15% their mission pay)
  envoySeen?: Record<string, number>;                 // faction → world time of the last envoy card
  log?: { t: number; text: string }[];                // captain's log: things worth remembering
  tows?: number;
  evacuees?: { n: number; from: string } | null;      // survivors aboard, paid out at the next dock
  story?: number;                                     // The Signal: stage index; -1 = declined
  story2?: number;                                    // The Missing Convoy: stage index
  convoyTrack?: { tag: string; rivalTag: string; partnerStationId: string; laneSystemId: string } | null;
  storyTarget?: { systemId: string; planetIdx: number; poiId: string } | null;
  storyVeil?: string | null;
  storyOrigin?: string | null;
  ious?: { credits: number; text: string }[];       // debts paid to you at the next dock
  routes?: { from: string; to: string; commodityId: string; t: number }[]; // base trade runs (station ids)
  lastDockedAt?: string;             // previous station id, for route bookkeeping
  wear?: number;                     // 0..100+: hours and jumps since the last yard service
  berthLog?: { stationId: string; t: number; wear: number; cost: number }[]; // signed yard services
  shoreCrew?: ShoreLeave[];          // crew waiting for you at a station
  alumni?: Alumnus[];                // crew who served and went home
  infraEarned?: number;              // lifetime tolls and fuel sales collected
  fares?: number;                    // passengers carried to their destination
  kits?: Record<string, number>;     // infrastructure kits aboard (beacon, depot)
}

// ---------- Infrastructure: a lighthouse in a dead system ----------
// A beacon or a fuel depot planted where nobody else has built. Traffic reroutes
// through it and pays; pirates notice. Owned by a call sign so a shared galaxy
// can carry it later.
export type InfraKind = "beacon" | "depot";
export interface Infra {
  id: string; kind: InfraKind; systemId: string; x: number; y: number;
  owner: string; builtAt: number;
  health: number;      // 0..100; below 30 it's dark and earns nothing
  till: number;        // credits waiting to be collected
  stock: number;       // depot fuel units for sale (beacons: 0)
  earned: number;      // lifetime
  lastT: number;
}
export const INFRA_KITS: Record<InfraKind, { name: string; price: number; desc: string }> = {
  beacon: { name: "Beacon Kit", price: 2500, desc: "A nav beacon for a system with no station. Traffic reroutes through it and pays tolls; jumps in and out cost a fifth less fuel." },
  depot: { name: "Fuel Depot Kit", price: 4000, desc: "An unmanned fuel depot for a dead system. Stock it with fuel cells; passing ships buy at a premium, and so can you." },
};
export const DEPOT_CAP = 120;
export const DEPOT_PRICE = 30; // what traffic pays per unit
export function infraAt(w: World, systemId: string): Infra[] {
  return (w.infra ?? []).filter((i) => i.systemId === systemId);
}
export function canBuildInfra(w: World, systemId: string): string | null {
  const sys = w.systems[systemId];
  if (!sys) return "NO SUCH SYSTEM";
  if (sys.stations.length) return "SOMEBODY ALREADY BUILT HERE - DEAD SYSTEMS ONLY";
  if (infraAt(w, systemId).length >= 2) return "TWO STRUCTURES IS ALL A SYSTEM WILL BEAR";
  return null;
}
export function buildInfra(w: World, kind: InfraKind, x: number, y: number, owner: string): Infra | string {
  const p = w.player;
  const why = canBuildInfra(w, p.systemId);
  if (why) return why;
  if (infraAt(w, p.systemId).some((i) => i.kind === kind)) return `THERE'S ALREADY A ${kind.toUpperCase()} HERE`;
  if (((p.kits ?? {})[kind] ?? 0) <= 0) return `NO ${INFRA_KITS[kind].name.toUpperCase()} ABOARD`;
  p.kits![kind]--;
  const inf: Infra = { id: `${kind}-${p.systemId}-${Math.floor(w.time)}`, kind, systemId: p.systemId, x, y, owner, builtAt: w.time, health: 100, till: 0, stock: 0, earned: 0, lastT: w.time };
  (w.infra ??= []).push(inf);
  return inf;
}
// How much traffic a dead system would see: the stations next door, and syndicate partners.
export function infraTraffic(w: World, systemId: string): number {
  const sys = w.systems[systemId];
  if (!sys) return 0;
  let t = 0;
  for (const l of sys.links) { const o = w.systems[l]; if (!o) continue; t += o.stations.length; if ((w.syndicates ?? []).some((s) => s.systemId === o.id)) t += 2; }
  return t;
}
export function infraLit(inf: Infra): boolean { return inf.health >= 30; }
// Every so often the till fills; depots sell fuel from stock; pirate neighbourhoods wear structures down.
export function tickInfra(w: World, rng: RNG): string[] {
  const out: string[] = [];
  for (const inf of w.infra ?? []) {
    const elapsed = w.time - inf.lastT; inf.lastT = w.time;
    if (elapsed <= 0) continue;
    const traffic = infraTraffic(w, inf.systemId);
    if (infraLit(inf)) {
      if (inf.kind === "beacon") { const c = Math.round(traffic * 1.5 * (elapsed / 60)); inf.till += c; inf.earned += c; }
      else if (inf.stock > 0) { const sold = Math.min(inf.stock, Math.max(0, Math.round(traffic * 0.4 * (elapsed / 60)))); inf.stock -= sold; inf.till += sold * DEPOT_PRICE; inf.earned += sold * DEPOT_PRICE; }
    }
    const sys = w.systems[inf.systemId];
    const piracy = sys?.pirateActivity ?? 0;
    if (rng.chance(0.08 + piracy * 0.25)) {
      inf.health = Math.max(0, inf.health - rng.int(10, 30));
      const name = `${inf.kind} in ${sys?.name ?? "?"}`;
      out.push(inf.health < 30 ? `YOUR ${name.toUpperCase()} IS DARK - RAIDERS STRIPPED IT. BRING SPARE PARTS.` : `RAIDERS HIT YOUR ${name.toUpperCase()} - ${inf.health}% AND STILL LIT`);
      pushEvent(w, { t: w.time, kind: "raid", systemId: inf.systemId, text: `Corsairs raided the ${inf.kind} at ${sys?.name ?? "?"}` });
    } else if (inf.health < 100 && rng.chance(0.2)) inf.health = Math.min(100, inf.health + 5); // passing crews patch a lit beacon
  }
  return out;
}
export function collectInfra(inf: Infra, p: PlayerState): number {
  const c = Math.round(inf.till); inf.till = 0; p.credits += c; p.infraEarned = (p.infraEarned ?? 0) + c; return c;
}
export function repairInfra(inf: Infra, p: PlayerState): boolean {
  if (inf.health >= 100) return false;
  if (!removeCargo(p, "parts", 1)) return false;
  inf.health = Math.min(100, inf.health + 35); return true;
}
export function stockDepot(inf: Infra, p: PlayerState, units: number): number {
  if (inf.kind !== "depot") return 0;
  const n = Math.min(units, DEPOT_CAP - inf.stock, p.cargo.fuel ?? 0);
  if (n <= 0) return 0;
  removeCargo(p, "fuel", n); inf.stock += n; return n;
}
export function drawDepot(inf: Infra, p: PlayerState): number {
  if (inf.kind !== "depot") return 0;
  const n = Math.min(inf.stock, Math.max(0, Math.floor(p.fuelMax - p.fuel)));
  if (n <= 0) return 0;
  inf.stock -= n; p.fuel += n; return n;
}
// Beacons guide jumps: a fifth off the fuel for anyone jumping in or out of a lit system.
export function beaconDiscount(w: World, fromId: string, toId: string): number {
  const lit = (id: string) => infraAt(w, id).some((i) => i.kind === "beacon" && infraLit(i));
  return lit(fromId) || lit(toId) ? 0.8 : 1;
}

export interface ShoreLeave { member: CrewMember; stationId: string; docks: number }
export interface Alumnus { name: string; role: CrewRole; docks: number; stationId: string; t: number }

// ---------- Passengers: the liner trade ----------
export type SightKind = "planet" | "drifter" | "comet" | "festival";
export const PASSENGER_BASE_CAP = 1;
export function passengerCap(p: PlayerState): number {
  return PASSENGER_BASE_CAP + ((p.modules ?? []).includes("cabins") ? 2 : 0);
}
export function passengersAboard(p: PlayerState): Mission[] {
  return p.missions.filter((m) => m.kind === "passenger" && m.accepted && !m.done);
}
const FARE_DEMANDS: Record<string, string[]> = { vip: ["lux", "lux", "med"], tourist: ["lux", "food"], refugee: ["food", "med"], fugitive: ["med"], courier: ["data", "lux"] };
// The lounge: two to four people who want to be somewhere else. Tourists book a sight;
// couriers want speed; VIPs want comfort; refugees want out.
export function genFares(w: World, station: StationDef, rng: RNG): Mission[] {
  const sys = Object.values(w.systems).find((s) => s.stations.some((st) => st.id === station.id));
  if (!sys) return [];
  const one = sys.links.map((l) => w.systems[l]).filter(Boolean);
  const two = one.flatMap((s) => s.links.map((l) => w.systems[l])).filter((s) => s && s.id !== sys.id && !one.includes(s));
  const pool = [...one, ...one, ...two].filter((s) => s.stations.length);
  if (!pool.length) return [];
  const fares: Mission[] = [];
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const target = rng.pick(pool);
    const tStation = rng.pick(target.stations);
    const pk = rng.pick(["vip", "tourist", "tourist", "refugee", "courier", "fugitive"] as const);
    const name = genPersonName(rng);
    const hops = one.includes(target) ? 1 : 2;
    let sightKind: SightKind | undefined, sightIdx: number | undefined, sightText = "";
    if (pk === "tourist") {
      const ev = w.galaxyEvent;
      const gas = target.planets.map((pl, idx) => ({ pl, idx })).filter((x) => x.pl.palette >= 6);
      if (ev && ev.kind === "comet" && ev.systemId === target.id && rng.chance(0.7)) { sightKind = "comet"; sightText = `the comet crossing ${target.name}`; }
      else if (ev && ev.kind === "festival" && ev.stationId === tStation.id && rng.chance(0.7)) { sightKind = "festival"; sightText = `the festival at ${tStation.name}`; }
      else if (gas.length && rng.chance(0.4)) { sightKind = "drifter"; sightIdx = rng.pick(gas).idx; sightText = `the void drifters off ${target.planets[sightIdx].name} (hold V near one)`; }
      else if (target.planets.length) { sightKind = "planet"; sightIdx = rng.int(0, target.planets.length - 1); sightText = `${target.planets[sightIdx].name} from orbit`; }
      else { sightKind = "festival"; sightText = tStation.name; }
    }
    const party = pk === "tourist" ? rng.int(2, 4) : pk === "refugee" ? rng.int(1, 3) : 1;
    const base = pk === "vip" ? 700 + rng.int(0, 400) : pk === "refugee" ? 100 + rng.int(0, 80) * party : pk === "tourist" ? 500 + rng.int(0, 300) + party * 120 : pk === "courier" ? 450 + rng.int(0, 250) : 550 + rng.int(0, 450);
    fares.push({
      id: `fare-${station.id}-${w.missionCounter++}`, kind: "passenger", accepted: false, done: false, tier: 0,
      title: `${pk === "vip" ? "VIP" : pk === "refugee" ? "Refugee" : pk === "tourist" ? "Sightseeing" : pk === "courier" ? "Business" : "Discreet"} fare: ${name}${party > 1 ? ` +${party - 1}` : ""}`,
      desc: pk === "vip" ? `${name} wants ${tStation.name}, ${target.name}, in comfort. Luxuries aboard would be noticed.`
        : pk === "refugee" ? `${name}${party > 1 ? ` and ${party - 1} others` : ""} need passage to ${tStation.name}, ${target.name}. Can't pay much.`
        : pk === "tourist" ? `${name}'s party want to see ${sightText}, then ${tStation.name}, ${target.name}. Every sight on the way pays extra.`
        : pk === "courier" ? `${name} has a meeting at ${tStation.name}, ${target.name}. Wants it in ${hops + 1} dockings or less.`
        : `${name} needs ${tStation.name}, ${target.name}, and needs the gate scanners to miss them.`,
      fromStationId: station.id, targetSystemId: target.id, targetStationId: tStation.id,
      passengerName: name, passengerKind: pk, sightPlanetIdx: sightIdx, sightKind, sightSeen: false, sights: [],
      mood: 60, demand: rng.chance(0.6) ? rng.pick(FARE_DEMANDS[pk]) : null, patience: pk === "courier" ? hops + 1 : hops + 3, docksAboard: 0, party,
      reward: Math.round(base * (hops === 2 ? 1.5 : 1)),
      repReward: pk === "refugee" ? 6 : pk === "tourist" ? 4 : 3,
    });
  }
  return fares;
}
// Each dock, the passengers take stock. Demands met from the hold cheer them up; a long trip or a battered hull sours them.
export function settlePassengers(p: PlayerState): string[] {
  const out: string[] = [];
  for (const m of passengersAboard(p)) {
    const name = (m.passengerName ?? "YOUR PASSENGER").toUpperCase();
    m.mood ??= 60; m.docksAboard = (m.docksAboard ?? 0) + 1;
    if (m.demand && (p.cargo[m.demand] ?? 0) > 0) { removeCargo(p, m.demand, 1); m.mood = Math.min(100, m.mood + 30); out.push(`${name} NOTICES THE ${(COMMODITIES.find((c) => c.id === m.demand)?.name ?? m.demand).toUpperCase()}. MOOD UP.`); m.demand = null; }
    if (m.docksAboard > (m.patience ?? 4)) { m.mood = Math.max(0, m.mood - 12); out.push(`${name} ASKS, AGAIN, HOW MUCH LONGER.`); }
    if (p.hull < p.hullMax * 0.4) { m.mood = Math.max(0, m.mood - 10); out.push(`${name} HAS SEEN THE HULL READOUT. NOT HAPPY.`); }
  }
  return out;
}
// Sights along the way: tourists pay for what they saw. Their booked sight also completes the fare.
export function logSight(p: PlayerState, kind: SightKind, label: string, systemId: string, planetIdx?: number): boolean {
  let any = false;
  for (const m of passengersAboard(p)) {
    if (m.passengerKind !== "tourist") continue;
    m.sights ??= [];
    if (!m.sights.includes(label)) { m.sights.push(label); any = true; m.mood = Math.min(100, (m.mood ?? 60) + 8); }
    if (!m.sightSeen && m.sightKind === kind && m.targetSystemId === systemId && (kind !== "planet" && kind !== "drifter" || m.sightPlanetIdx === planetIdx)) { m.sightSeen = true; any = true; }
  }
  return any;
}
export function passengerPay(m: Mission): number {
  const mood = m.mood ?? 60;
  const extra = m.passengerKind === "tourist" ? Math.min(3, Math.max(0, (m.sights?.length ?? 0) - 1)) * 0.15 : 0;
  return Math.round(m.reward * (0.6 + (mood / 100) * 0.6 + extra));
}

// ---------- Wear: a ship wants a yard now and then ----------
// Wear climbs with hours under way and with every jump; an engineer slows it.
// Past 50 the engines lose their edge; past 70 things start to fail.
export const WEAR_SERVICE_FROM = 10;
export function wearRate(p: PlayerState): number {
  const eng = crewBonus(p, "engineer");
  return 0.012 * Math.max(0.4, 1 - 0.15 * eng);
}
export function tickWear(p: PlayerState, dt: number): void {
  p.wear = Math.min(130, (p.wear ?? 0) + wearRate(p) * dt);
}
export function jumpWear(p: PlayerState): void {
  p.wear = Math.min(130, (p.wear ?? 0) + 2);
}
export function wearThrust(p: PlayerState): number {
  return 1 - Math.max(0, (p.wear ?? 0) - 50) / 50 * 0.1;
}
export function wearFault(p: PlayerState, rng: RNG): string | null {
  const wear = p.wear ?? 0;
  if (wear < 70) return null;
  if (!rng.chance((wear - 60) / 100)) return null;
  const sys = rng.pick(p.systems.filter((s) => s.health > 20));
  if (!sys) return null;
  sys.health = Math.max(0, sys.health - rng.int(8, 16));
  return `${sys.name.toUpperCase()} FAULT - WEAR ${Math.round(wear)}%, SHE WANTS A YARD`;
}
export function servicePrice(p: PlayerState, discount = 1): number {
  return Math.round((p.wear ?? 0) * 6 * discount);
}
export function serviceHull(p: PlayerState, stationId: string, t: number, cost: number): void {
  (p.berthLog ??= []).push({ stationId, t, wear: Math.round(p.wear ?? 0), cost });
  if (p.berthLog.length > 20) p.berthLog.shift();
  p.wear = 0;
  for (const s of p.systems) s.health = Math.max(s.health, 70);
}

// ---------- Crew with lives ----------
export function crewSick(c: CrewMember, now: number): boolean {
  return !!c.sick && now < c.sick.until;
}
// A dock is where illness shows. Low morale and empty galleys make it likelier; a medic shortens it.
export function crewFallsIll(p: PlayerState, c: CrewMember, now: number, rng: RNG): string | null {
  if (crewSick(c, now)) return null;
  const hungry = (p.cargo.food ?? 0) <= 0;
  const chance = 0.05 + (c.morale < 30 ? 0.06 : 0) + (hungry ? 0.05 : 0);
  if (!rng.chance(chance)) return null;
  const s = rng.pick(SICKNESS);
  const medic = crewBonus(p, "medic") > 0;
  c.sick = { kind: s.kind, until: now + s.days * (medic ? 0.5 : 1) };
  return s.kind;
}
export function crewRecover(c: CrewMember, now: number): boolean {
  if (c.sick && now >= c.sick.until) { c.sick = null; return true; }
  return false;
}
export function crewTreat(p: PlayerState, c: CrewMember): boolean {
  if (!c.sick) return false;
  if (!removeCargo(p, "med", 1)) return false;
  c.sick = null; c.morale = Math.min(100, c.morale + 5);
  return true;
}
export function retireCrew(p: PlayerState, c: CrewMember, stationId: string, t: number): Alumnus {
  const a: Alumnus = { name: c.name, role: c.role, docks: c.docks ?? 0, stationId, t };
  (p.alumni ??= []).push(a);
  if (p.alumni.length > 30) p.alumni.shift();
  p.crew = p.crew.filter((x) => x !== c);
  return a;
}
export function sendOnLeave(p: PlayerState, c: CrewMember, stationId: string): void {
  p.crew = p.crew.filter((x) => x !== c);
  (p.shoreCrew ??= []).push({ member: c, stationId, docks: 0 });
}
// Docking: crew on leave here come back aboard; crew waiting elsewhere wait a little less patiently.
export function collectShoreCrew(p: PlayerState, stationId: string, berths: number): { back: CrewMember[]; gone: CrewMember[] } {
  const back: CrewMember[] = [], gone: CrewMember[] = [];
  const keep: ShoreLeave[] = [];
  for (const s of p.shoreCrew ?? []) {
    if (s.stationId === stationId && p.crew.length < berths) {
      s.member.morale = Math.min(100, s.member.morale + 30); s.member.loyalty = (s.member.loyalty ?? 0) + 1;
      p.crew.push(s.member); back.push(s.member);
    } else if (++s.docks >= LEAVE_DOCKS) gone.push(s.member);
    else keep.push(s);
  }
  p.shoreCrew = keep;
  return { back, gone };
}
export function berthsUsed(p: PlayerState): number {
  return p.crew.length + (p.shoreCrew ?? []).length;
}

export interface GroundState { taken: number[]; charted: boolean; scanned: number[] }

// A claim on a charted region: it works the region's resource while you're away
export interface Homestead { key: string; systemId: string; planetIdx: number; regionIdx: number; resource: string; stock: number; lastT: number; name: string }
export const HOMESTEAD_PRICE = 2000;
export const HOMESTEAD_CAP = 30;
export function homesteadYield(h: Homestead, now: number): number {
  const rate = 2 / 600; // two units per ten minutes of play
  return Math.min(HOMESTEAD_CAP, h.stock + Math.max(0, now - h.lastT) * rate);
}
export function settleHomestead(h: Homestead, now: number): void { h.stock = homesteadYield(h, now); h.lastT = now; }

export interface StoredShip { hullId: string; stationId: string; name?: string; hull: number; torpedoes: number }

// NPC syndicates: AI squadrons with a home base, partners and rivals. Always
// labelled (AI) in the UI and never mixed into the human boards.
export type SyndicateStyle = "trade" | "salvage" | "mining" | "pirate";
// Humanitarian crisis: a station needs a commodity before the clock runs out
export interface Crisis { stationId: string; systemId: string; commodityId: string; need: number; delivered: number; until: number; kind: "outbreak" | "famine" | "blackout" }
export const CRISIS_PREMIUM = 2.5;
export function crisisAt(w: World, stationId: string): Crisis | null {
  const c = w.crisis;
  return c && c.stationId === stationId && c.delivered < c.need && w.time < c.until ? c : null;
}
export function tickCrisis(w: World, rng: RNG): void {
  const c = w.crisis;
  if (c) {
    if (c.delivered >= c.need) return; // resolved; cleared when a new one starts
    if (w.time >= c.until) {
      const f = findStation(w, c.stationId);
      pushEvent(w, { t: w.time, kind: "shock", systemId: c.systemId, text: `${f?.st.name ?? "A station"}'s ${c.kind} runs its course unanswered. ${c.need - c.delivered} units short.` });
      adjustRep(w, f?.st.factionId ?? "tsc", -2);
      w.crisis = null;
    }
    return;
  }
  if (!rng.chance(0.35)) return;
  const all = Object.values(w.systems).flatMap((s) => s.stations.filter((st) => !st.military).map((st) => ({ sys: s, st })));
  if (!all.length) return;
  const { sys, st } = rng.pick(all);
  const kind = rng.pick(["outbreak", "famine", "blackout"] as const);
  const commodityId = kind === "outbreak" ? "med" : kind === "famine" ? "food" : "fuel";
  const need = rng.int(6, 12);
  w.crisis = { stationId: st.id, systemId: sys.id, commodityId, need, delivered: 0, until: w.time + 900, kind };
  const what = kind === "outbreak" ? "an outbreak: med supplies" : kind === "famine" ? "a famine: provisions" : "a reactor blackout: fuel cells";
  pushEvent(w, { t: w.time, kind: "shock", systemId: sys.id, text: `CRISIS: ${st.name} in ${sys.name} reports ${what} needed, ${need} units, paying ${CRISIS_PREMIUM}x` });
}

export interface SynWar {
  attacker: string; defender: string; systemId: string; // fought in the defender's home system
  score: number;      // -100 (defender wins) .. 100 (attacker wins)
  until: number;      // world time when it resolves regardless
  contrib: Record<string, number>; // player's contribution per side tag
  backed?: string;    // side the player's squadron declared for
  backedBy?: string;  // that squadron's tag
}
export interface Syndicate {
  tag: string; name: string; color: string; style: SyndicateStyle;
  systemId: string; stationId: string;
  partners: string[];   // partner station ids in linked systems
  rivals: string[];     // rival tags
  treasury: number;
  holdings?: string[];  // extra stations taken in wars; they trade like the home base
}

export interface World {
  version: number;
  savedAt?: number;
  galaxyLy?: number;
  hardcore?: boolean; // destruction erases the save
  rareOrigin?: Record<string, string>; // rare commodity id → station id
  syndicates?: Syndicate[];
  synRelations?: Record<string, number>; // "A|B" (sorted tags) → -100..100; allies ≥ 50, feud ≤ -30
  synWar?: SynWar | null;            // at most one syndicate war at a time
  crisis?: Crisis | null;            // a station in trouble: goods needed, fast
  galaxyEvent?: GalaxyEvent | null;  // one colourful thing at a time
  infra?: Infra[];                   // beacons and depots people have built
  infraTick?: number;
  infraNews?: string[];              // lines from the last infra tick, for the HUD to toast
  seed: number;
  time: number;
  realGalaxy: boolean;
  systems: Record<string, SystemDef>;
  player: PlayerState;
  news: NewsItem[];
  events: WorldEvent[];
  wars: War[];
  missionCounter: number;
  synTick?: number;
  crisisTick?: number;
  eventTick?: number;
  econTick: number;
  shockTick: number;
  warTick: number;
}

export const SYSTEM_SIZE = 6000;
export const START_CREDITS = 600;

// ---------- Economy ----------

function baselineStock(type: StationType, id: string): number {
  const mult = ECONOMY[type][id] ?? 1;
  return mult < 1 ? 80 : mult > 1.1 ? 10 : 25;
}

// Price rises as stock falls below the station's natural baseline.
export function stationPrice(st: StationDef, id: string): number {
  const c = COMMODITIES.find((x) => x.id === id);
  if (!c) return 0;
  if (c.rare) return st.rare === id ? Math.round(c.base * 0.8) : 0;
  const mult = ECONOMY[st.type][id] ?? 1;
  if (mult === 0) return 0;
  const base = c.base * mult;
  const ratio = (st.stock[id] ?? 0) / baselineStock(st.type, id);
  const f = clamp(1.5 - 0.5 * ratio, 0.6, 1.9);
  return Math.max(1, Math.round(base * f));
}

export function refreshPrices(st: StationDef): void {
  for (const id of Object.keys(st.prices)) {
    if (id === st.rare) continue; // rares hold their origin price
    st.prices[id] = stationPrice(st, id);
  }
}

export function buyPrice(st: StationDef, id: string, rep: number): number {
  return Math.max(1, Math.round(stationPrice(st, id) * (1 - clamp(rep, -100, 100) * 0.002)));
}

export function sellPrice(st: StationDef, id: string, rep: number): number {
  return Math.max(1, Math.round(stationPrice(st, id) * 0.92 * (1 + clamp(rep, -100, 100) * 0.001)));
}

// Rare goods appreciate with distance from their origin: carry them far.
export function rareSellPrice(w: World, st: StationDef, id: string, rep: number): number {
  const c = COMMODITIES.find((x) => x.id === id);
  if (!c?.rare) return sellPrice(st, id, rep);
  const originId = w.rareOrigin?.[id];
  const origin = originId ? findStation(w, originId) : null;
  if (!origin || origin.st.id === st.id) return Math.max(1, Math.round(c.base * 0.7));
  const here = findStation(w, st.id);
  const d = here ? Math.hypot(here.sys.gx - origin.sys.gx, here.sys.gy - origin.sys.gy) : 0;
  const factor = 1 + clamp(d / 45, 0, 2.2);
  return Math.max(1, Math.round(c.base * factor * (1 + clamp(rep, -100, 100) * 0.001)));
}

export function stationExports(st: StationDef): string[] {
  return Object.keys(st.prices).filter((id) => (ECONOMY[st.type][id] ?? 1) < 1);
}

function genStock(rng: RNG, type: StationType): { prices: Record<string, number>; stock: Record<string, number> } {
  const prices: Record<string, number> = {};
  const stock: Record<string, number> = {};
  for (const c of COMMODITIES) {
    if (c.rare) continue;
    const mult = ECONOMY[type][c.id] ?? 1;
    if (mult === 0) continue;
    const base = baselineStock(type, c.id);
    stock[c.id] = Math.max(0, Math.round(base * rng.range(0.6, 1.4)));
    prices[c.id] = 0;
  }
  return { prices, stock };
}

// Called every frame from flight; does coarse-grained work on a timer.
export function tickWorld(w: World, dt: number): void {
  w.econTick += dt;
  if (w.econTick >= 30) {
    w.econTick = 0;
    for (const sys of Object.values(w.systems)) {
      const atWar = w.wars.some((x) => x.systemId === sys.id);
      for (const st of sys.stations) {
        for (const id of Object.keys(st.prices)) {
          if (id === st.rare) { st.stock[id] = Math.min(8, (st.stock[id] ?? 0) + 1); continue; }
          const base = baselineStock(st.type, id) * (atWar ? 0.6 : 1);
          const cur = st.stock[id] ?? 0;
          st.stock[id] = Math.max(0, Math.round(cur + (base - cur) * 0.08));
        }
        refreshPrices(st);
      }
    }
  }
  tickWear(w.player, dt);
  w.infraTick = (w.infraTick ?? 0) + dt;
  if (w.infraTick >= 60 && w.infra?.length) { w.infraTick = 0; w.infraNews = tickInfra(w, new RNG((w.seed ^ Math.floor(w.time * 13)) >>> 0)); }
  w.eventTick = (w.eventTick ?? 0) + dt;
  if (w.eventTick >= 180) { w.eventTick = 0; tickGalaxyEvents(w, new RNG((w.seed ^ Math.floor(w.time * 11)) >>> 0)); }
  w.crisisTick = (w.crisisTick ?? 0) + dt;
  if (w.crisisTick >= 120) { w.crisisTick = 0; tickCrisis(w, new RNG((w.seed ^ Math.floor(w.time * 5)) >>> 0)); }
  w.synTick = (w.synTick ?? 0) + dt;
  if (w.synTick >= 150) {
    w.synTick = 0;
    tickSyndicates(w, new RNG((w.seed ^ Math.floor(w.time * 3)) >>> 0));
  }
  w.shockTick += dt;
  if (w.shockTick >= 120) {
    w.shockTick = 0;
    const rng = new RNG((w.seed ^ Math.floor(w.time)) >>> 0);
    const all = Object.values(w.systems).flatMap((s) => s.stations.map((st) => ({ sys: s, st })));
    if (all.length && rng.chance(0.7)) {
      const { sys, st } = rng.pick(all);
      const ids = Object.keys(st.prices).filter((x) => !x.startsWith("r_"));
      const id = rng.pick(ids);
      const c = COMMODITIES.find((x) => x.id === id)!;
      st.stock[id] = Math.max(0, Math.round((st.stock[id] ?? 0) * 0.15));
      refreshPrices(st);
      pushEvent(w, { t: w.time, kind: "shock", systemId: sys.id, text: `${st.name} reports a ${c.name} shortage — prices spiking in ${sys.name}` });
    }
  }
  w.warTick += dt;
  if (w.warTick >= 200) {
    w.warTick = 0;
    const rng = new RNG((w.seed ^ Math.floor(w.time * 7)) >>> 0);
    w.wars = w.wars.filter((war) => {
      if (w.time < war.until) return true;
      const sys = w.systems[war.systemId];
      sys.pirateActivity = Math.max(0.05, sys.pirateActivity - 0.3);
      // sometimes the raiders win: the system changes hands, stations and all
      if (rng.chance(0.3) && war.b !== "vex" && sys.id !== w.player.systemId) {
        const from = sys.factionId;
        sys.factionId = war.b;
        sys.permit = false;
        for (const st of sys.stations) st.factionId = war.b;
        for (const pl of sys.planets) for (const r of pl.surface?.regions ?? []) if (r.factionId === from) r.factionId = war.b;
        pushEvent(w, { t: w.time, kind: "war", systemId: sys.id, text: `${facName(war.b)} annexes ${sys.name}: ${facName(from)} withdraws, stations change flags` });
        return false;
      }
      pushEvent(w, { t: w.time, kind: "peace", systemId: sys.id, text: `Ceasefire in ${sys.name}: ${facName(war.a)} and ${facName(war.b)} stand down` });
      return false;
    });
    if (w.wars.length < 2 && rng.chance(0.5)) {
      const candidates = Object.values(w.systems).filter((s) => s.factionId !== "vex" && !w.wars.some((x) => x.systemId === s.id));
      if (candidates.length) {
        const sys = rng.pick(candidates);
        const others = FACTIONS.filter((f) => f.id !== sys.factionId && f.id !== "vex");
        const enemy = rng.pick(others);
        w.wars.push({ a: sys.factionId, b: enemy.id, systemId: sys.id, until: w.time + 240 });
        sys.pirateActivity = Math.min(1, sys.pirateActivity + 0.3);
        pushEvent(w, { t: w.time, kind: "war", systemId: sys.id, text: `${facName(enemy.id)} forces raid ${sys.name} — ${facName(sys.factionId)} declares a defense emergency` });
      }
    }
  }
}

function facName(id: string): string {
  return FACTIONS.find((f) => f.id === id)?.name ?? id;
}

export function pushEvent(w: World, e: WorldEvent): void {
  w.events.push(e);
  if (w.events.length > 40) w.events.splice(0, w.events.length - 40);
  w.news = newsFromEvents(w);
}

// ---------- Reputation & law ----------

export function adjustRep(w: World, factionId: string, delta: number): void {
  const p = w.player;
  p.rep[factionId] = clamp((p.rep[factionId] ?? 0) + delta, -100, 100);
}

export function repLabel(rep: number): string {
  if (rep >= 75) return "ALLIED";
  if (rep >= 40) return "TRUSTED";
  if (rep >= 10) return "FRIENDLY";
  if (rep > -10) return "NEUTRAL";
  if (rep > -40) return "SUSPECT";
  if (rep > -75) return "HOSTILE";
  return "OUTLAW";
}

// 0 clear, 1 wanted (patrols pursue), 2 shoot on sight
export function lawLevelFor(w: World, systemId: string): number {
  const p = w.player;
  const fac = w.systems[systemId].factionId;
  if (fac === "vex") return 0;
  const rep = p.rep[fac] ?? 0;
  if (rep <= -75 || p.wanted >= 0.95) return 2;
  if (p.wanted > 0.5 || rep <= -40) return 1;
  return 0;
}

// Black markets: Veil stations and trade hubs in pirate-heavy systems fence
// illegal goods at a premium and ask no questions. Everywhere else, customs
// might be watching.
const piracyThreshold = new WeakMap<World, number>();
export function blackMarket(w: World, st: StationDef): boolean {
  if (st.military) return false;
  if (st.factionId === "vex") return true;
  const sys = findStation(w, st.id)?.sys;
  if (!sys) return false;
  // the roughest fifth of the galaxy runs a fence in its civilian hubs
  let thr = piracyThreshold.get(w);
  if (thr === undefined) {
    const sorted = Object.values(w.systems).map((s) => s.pirateActivity).sort((a, b) => b - a);
    thr = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.2))] ?? 1;
    piracyThreshold.set(w, thr);
  }
  return sys.pirateActivity >= thr && (st.type === "trade" || st.type === "mining" || st.type === "refinery");
}

export function missionTier(rep: number): number {
  return rep >= 60 ? 2 : rep >= 25 ? 1 : 0;
}

// ---------- Crew ----------

export function crewBonus(p: PlayerState, role: CrewRole): number {
  let total = 0;
  for (const c of p.crew ?? []) {
    if (c.role !== role) continue;
    if (c.sick) continue; // laid up: cleared at the next dock once it has run its course
    const eff = c.morale < 30 ? 0.5 : 1;
    total += c.skill * eff;
  }
  return total;
}

export function crewWages(p: PlayerState): number {
  return (p.crew ?? []).reduce((a, c) => a + c.wage, 0);
}

export function genCrewCandidate(rng: RNG): CrewMember {
  const roles: CrewRole[] = ["engineer", "gunner", "pilot", "medic"];
  const role = rng.pick(roles);
  const skill = rng.chance(0.15) ? 3 : rng.chance(0.45) ? 2 : 1;
  return {
    name: genPersonName(rng),
    role, skill,
    morale: rng.int(55, 85),
    wage: ROLE_INFO[role].baseWage * skill,
    trait: rng.pick(CREW_TRAITS),
    docks: 0,
  };
}

// ---------- Fuel-range navigation ----------

export function jumpFuelCost(w: World, fromId: string, toId: string): number {
  const ly = w.systems[fromId]?.ly?.[toId];
  const tuned = (1 - 0.08 * (w.player?.engineering?.fsd ?? 0)) * (hull(w.player?.hullId).fuelEff ?? 1);
  const beacon = beaconDiscount(w, fromId, toId);
  if (ly === undefined) return Math.max(4, Math.round(10 * tuned * beacon));
  return clamp(Math.round((4 + ly * 1.4) * tuned * beacon), 3, 40);
}

// Dijkstra on fuel cost; returns path + total fuel. Falls back to hop BFS.
// Permit systems: a faction's inner sanctum, open only to allies.
export function permitDenied(w: World, sysId: string): string | null {
  const sys = w.systems[sysId];
  if (!sys?.permit) return null;
  const rep = w.player.rep?.[sys.factionId] ?? 0;
  return rep >= 50 ? null : sys.factionId;
}

export function navRoute(w: World, fromId: string, toId: string): string[] | null {
  if (fromId === toId) return [fromId];
  const cost = new Map<string, number>([[fromId, 0]]);
  const prev = new Map<string, string>();
  const open = new Set<string>([fromId]);
  const done = new Set<string>();
  while (open.size) {
    let cur = "";
    let best = Infinity;
    for (const id of open) { const c = cost.get(id)!; if (c < best) { best = c; cur = id; } }
    open.delete(cur);
    done.add(cur);
    if (cur === toId) break;
    for (const l of w.systems[cur].links) {
      if (done.has(l)) continue;
      if (l !== toId && permitDenied(w, l)) continue; // route around closed space
      const nc = best + jumpFuelCost(w, cur, l);
      if (nc < (cost.get(l) ?? Infinity)) { cost.set(l, nc); prev.set(l, cur); open.add(l); }
    }
  }
  if (!cost.has(toId)) return null;
  const path = [toId];
  let p = toId;
  while (prev.has(p)) { p = prev.get(p)!; path.unshift(p); }
  return path;
}

export function routeFuel(w: World, path: string[]): number {
  let f = 0;
  for (let i = 0; i < path.length - 1; i++) f += jumpFuelCost(w, path[i], path[i + 1]);
  return f;
}

// ---------- Planet surfaces ----------

const REGION_NAMES = ["Highlands", "Basin", "Coast", "Ridge", "Plateau", "Marches", "Expanse", "Reach", "Shelf", "Tundra"];
const CITY_NAMES = ["New Halden", "Port Ismay", "Vaska", "Corran", "Delphi Landing", "Tessaly", "Marrow", "Oskar's Hope", "Ilium", "Redoubt"];

function genSurface(rng: RNG, sysFaction: string, planetIdx: number): PlanetSurface {
  const nRegions = rng.int(4, 7);
  const regions: Region[] = [];
  const palette = ["#3a6ea5", "#a5683a", "#3aa55e", "#7a5aa5", "#a53a3a", "#9aa5bd", "#c7a54a", "#4a7c8c"];
  for (let i = 0; i < nRegions; i++) {
    const roll = rng.next();
    const factionId = sysFaction === "vex" ? (roll < 0.5 ? "vex" : null) : roll < 0.65 ? sysFaction : roll < 0.8 ? rng.pick(FACTIONS.filter((f) => f.id !== "vex")).id : null;
    regions.push({
      name: `${rng.pick(REGION_NAMES)} ${["I", "II", "III", "IV", "V", "VI", "VII"][i]}`,
      factionId,
      lat: rng.range(-70, 70), lon: rng.range(-180, 180),
      resource: rng.pick(["ore", "water", "metals", "food", "bio", "data"]),
      color: rng.pick(palette),
    });
  }
  const pois: Poi[] = [];
  const nPois = rng.int(3, 6);
  for (let i = 0; i < nPois; i++) {
    const regionIdx = rng.int(0, nRegions - 1);
    const r = regions[regionIdx];
    const kind: PoiKind = r.factionId
      ? rng.pick(["city", "mine", "research", "defense", "outpost"] as PoiKind[])
      : rng.pick(["ruin", "mine", "outpost", "research"] as PoiKind[]);
    pois.push({
      id: `poi${planetIdx}-${i}`,
      name: kind === "city" ? rng.pick(CITY_NAMES) : `${kind === "ruin" ? "Ruins of" : kind === "mine" ? "Mine" : kind === "research" ? "Research Post" : kind === "defense" ? "Battery" : "Outpost"} ${rng.pick(REGION_NAMES)}`,
      kind,
      lat: clamp(r.lat + rng.range(-20, 20), -80, 80),
      lon: r.lon + rng.range(-30, 30),
      regionIdx,
      landable: kind !== "defense",
      surveyed: false,
    });
  }
  return { regions, pois, satellites: rng.int(2, 6), scanned: false };
}

// ---------- System generation ----------

function genSystem(rng: RNG, id: string, gx: number, gy: number, factionId: string, name: string, sunColor: string, starClass?: string): SystemDef {
  const sys: SystemDef = {
    id, name, gx, gy, factionId,
    sunColor, sunRadius: rng.int(26, 44), starClass,
    planets: [], stations: [], asteroids: [], jumpPoints: [], wrecks: [], anomalies: [],
    pirateActivity: factionId === "vex" ? rng.range(0.6, 1) : rng.range(0.05, 0.45),
    links: [], ly: {},
  };
  const nPlanets = rng.int(2, 5);
  let orbit = 700;
  for (let i = 0; i < nPlanets; i++) {
    orbit += rng.range(500, 900);
    sys.planets.push({
      name: planetName(name, i),
      orbit,
      angle: rng.range(0, Math.PI * 2),
      speed: rng.range(0.002, 0.01) * (rng.chance(0.5) ? 1 : -1),
      radius: rng.int(10, 26),
      palette: rng.int(0, 7),
      surface: genSurface(rng.fork(i + 11), factionId, i),
    });
  }
  const nStations = factionId === "vex" ? 1 : rng.int(1, 3);
  const types: StationType[] = ["mining", "agri", "refinery", "research", "trade"];
  for (let i = 0; i < nStations; i++) {
    const military = factionId !== "vex" && rng.chance(FACTIONS.find((f) => f.id === factionId)!.military * 0.5);
    const type: StationType = military ? "military" : rng.pick(types);
    const { prices, stock } = genStock(rng, type);
    const patrons: string[] = [];
    for (let p = 0; p < rng.int(2, 4); p++) patrons.push(genPersonName(rng));
    const st: StationDef = {
      id: `${id}-st${i}`,
      name: genStationName(rng, military),
      type, military,
      orbit: sys.planets[i % sys.planets.length].orbit + rng.range(120, 260),
      angle: rng.range(0, Math.PI * 2),
      speed: rng.range(0.003, 0.008),
      factionId,
      prices, stock,
      fuelPrice: rng.int(2, 4),
      repairPrice: rng.int(3, 6),
      barPatrons: patrons,
    };
    refreshPrices(st);
    sys.stations.push(st);
  }
  const nBelts = rng.int(1, 2);
  for (let b = 0; b < nBelts; b++) {
    const beltR = rng.range(1200, SYSTEM_SIZE * 0.75);
    const count = rng.int(30, 60);
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = beltR + rng.range(-260, 260);
      const rich = rng.chance(0.3);
      sys.asteroids.push({
        x: Math.cos(a) * r, y: Math.sin(a) * r,
        radius: rng.int(4, 12), rich, core: rich && rng.chance(0.35), ore: rng.int(3, 10),
        spriteSeed: rng.int(0, 1e9), rot: rng.range(0, Math.PI * 2), rotSpeed: rng.range(-0.3, 0.3),
      });
    }
  }
  const nWrecks = rng.int(0, 2) + (factionId === "vex" ? 1 : 0);
  for (let i = 0; i < nWrecks; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(1500, SYSTEM_SIZE * 0.8);
    const loot: { id: string; qty: number }[] = [
      { id: rng.pick(["parts", "metals", "fuel", "med"]), qty: rng.int(2, 5) },
    ];
    if (rng.chance(0.5)) loot.push({ id: rng.pick(["data", "bio", "contra", "lux"]), qty: rng.int(1, 3) });
    sys.wrecks.push({
      id: `${id}-wk${i}`, x: Math.cos(a) * r, y: Math.sin(a) * r,
      looted: false, loot, hazard: rng.range(0.2, 0.9),
      name: `${rng.pick(["ISV", "MV", "CSV", "FDM"])} ${rng.pick(["Halcyon", "Perdita", "Sable", "Oren", "Kestrel", "Juno"])}`,
    });
  }
  const nAnom = rng.int(1, 3);
  for (let i = 0; i < nAnom; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(1000, SYSTEM_SIZE * 0.9);
    const kind: AnomalyKind = rng.pick(["data", "derelict", "survey"]);
    sys.anomalies.push({
      id: `${id}-an${i}`,
      name: `${rng.pick(["Signal", "Echo", "Contact", "Return"])} ${rng.pick(["Alpha", "Kilo", "Sigma", "Zeta", "Nine", "Tango"])}`,
      kind, x: Math.cos(a) * r, y: Math.sin(a) * r,
      discovered: false, claimed: false,
      reward: rng.int(150, 450),
    });
  }
  return sys;
}

// ---------- Galaxy generation ----------

export interface GenOptions {
  realGalaxy?: boolean;
  maxLy?: number; // real galaxy radius (default 20)
  hardcore?: boolean;
}

function assignFactions(rng: RNG, positions: { x: number; y: number }[]): string[] {
  const seeds = FACTIONS.slice(0, 4).map(() => ({ x: rng.range(40, 280), y: rng.range(40, 180) }));
  return positions.map((pos) => {
    let fi = 0, best = Infinity;
    seeds.forEach((s, j) => {
      const d = (s.x - pos.x) ** 2 + (s.y - pos.y) ** 2;
      if (d < best) { best = d; fi = j; }
    });
    return best > 90 * 90 && rng.chance(0.6) ? "vex" : FACTIONS[fi].id;
  });
}

function connect(rng: RNG, systems: Record<string, SystemDef>, ids: string[], positions: { x: number; y: number }[], lyOf: (i: number, j: number) => number): void {
  const N = ids.length;
  for (let i = 0; i < N; i++) {
    const dists = ids
      .map((id, j) => ({ id, d: (positions[i].x - positions[j].x) ** 2 + (positions[i].y - positions[j].y) ** 2, j }))
      .filter((e) => e.j !== i)
      .sort((a, b) => a.d - b.d);
    const want = rng.int(1, 3);
    for (let k = 0; k < Math.min(want, dists.length); k++) {
      const other = dists[k].id;
      const j = dists[k].j;
      if (!systems[ids[i]].links.includes(other)) systems[ids[i]].links.push(other);
      if (!systems[other].links.includes(ids[i])) systems[other].links.push(ids[i]);
      const ly = lyOf(i, j);
      systems[ids[i]].ly[other] = ly;
      systems[other].ly[ids[i]] = ly;
    }
  }
  const visited = new Set<string>([ids[0]]);
  const queue = [ids[0]];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const l of systems[cur].links) if (!visited.has(l)) { visited.add(l); queue.push(l); }
  }
  for (const id of ids) {
    if (!visited.has(id)) {
      const target = [...visited][rng.int(0, visited.size - 1)];
      systems[id].links.push(target);
      systems[target].links.push(id);
      const ly = lyOf(ids.indexOf(id), ids.indexOf(target));
      systems[id].ly[target] = ly;
      systems[target].ly[id] = ly;
      visited.add(id);
    }
  }
  for (const id of ids) {
    const sys = systems[id];
    sys.links.forEach((l, k) => {
      const a = (k / sys.links.length) * Math.PI * 2 + 0.7;
      const r = SYSTEM_SIZE * 0.85;
      sys.jumpPoints.push({
        id: `${id}-jp${k}`, x: Math.cos(a) * r, y: Math.sin(a) * r,
        targetSystemId: l, guarded: sys.factionId !== "vex",
      });
    });
  }
}

export function generateWorld(seed: number, opts: GenOptions = {}): World {
  const rng = new RNG(seed);
  const systems: Record<string, SystemDef> = {};
  const ids: string[] = [];
  const positions: { x: number; y: number }[] = [];
  const sunColors = ["#ffd75a", "#ffb347", "#ff8a5a", "#8ec9f0", "#f2f4ff", "#ff5a5a"];
  let lyOf: (i: number, j: number) => number;

  if (opts.realGalaxy) {
    // Sol neighbourhood: project the catalog top-down (x,y in ly) onto the map
    const stars = STARS.filter((s) => s.ly <= (opts.maxLy ?? 20));
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const xy = stars.map((s) => { const [x, y] = starXYZ(s); return { x, y }; });
    for (const q of xy) { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y); }
    stars.forEach((s, i) => {
      const id = `star${i}`;
      ids.push(id);
      positions.push({
        x: 30 + ((xy[i].x - minX) / (maxX - minX || 1)) * 260,
        y: 30 + ((xy[i].y - minY) / (maxY - minY || 1)) * 160,
      });
    });
    const factions = assignFactions(rng, positions);
    stars.forEach((s, i) => {
      // Sol is Compact home; nothing pirate within 6 ly of home
      const fac = i === 0 ? "tsc" : s.ly < 6 ? "tsc" : factions[i];
      systems[ids[i]] = genSystem(rng.fork(i + 1), ids[i], positions[i].x, positions[i].y, fac, s.name, s.color, s.cls);
    });
    lyOf = (i, j) => Math.round(starDistance(stars[i], stars[j]) * 10) / 10;
  } else {
    const N = 10;
    for (let i = 0; i < N; i++) {
      let x = 0, y = 0, ok = false;
      for (let tries = 0; tries < 50 && !ok; tries++) {
        x = rng.range(30, 290);
        y = rng.range(30, 190);
        ok = positions.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 > 55 * 55);
      }
      positions.push({ x, y });
      ids.push(`sys${i}`);
    }
    const factions = assignFactions(rng, positions);
    for (let i = 0; i < N; i++) {
      const r2 = rng.fork(i + 1);
      systems[ids[i]] = genSystem(r2, ids[i], positions[i].x, positions[i].y, factions[i], genSystemName(r2), r2.pick(sunColors));
    }
    lyOf = (i, j) => Math.round(Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y) / 9 * 10) / 10;
  }
  connect(rng, systems, ids, positions, lyOf);

  const startId = ids.find((i) => systems[i].factionId !== "vex" && systems[i].stations.length > 0) ?? ids[0];
  const startSys = systems[startId];
  const st = startSys.stations[0];
  const sx = Math.cos(st.angle) * st.orbit;
  const sy = Math.sin(st.angle) * st.orbit;
  const h = hull("scout");

  const player: PlayerState = {
    credits: START_CREDITS,
    systemId: startId,
    x: sx + 80, y: sy + 40,
    vx: 0, vy: 0, angle: 0,
    hull: h.hullMax, hullMax: h.hullMax,
    shield: h.shieldMax, shieldMax: h.shieldMax,
    fuel: h.fuelMax, fuelMax: h.fuelMax,
    oxygen: 100, oxygenMax: 100,
    cargo: { food: 3, parts: 1 },
    cargoMax: h.cargoMax,
    systems: defaultSystems(),
    missions: [],
    dockedAt: null,
    kills: 0,
    wanted: 0,
    hullId: "scout",
    rep: {},
    hints: {},
    crew: [],
    skills: { piloting: 0, engineering: 0 },
    storage: {},
    discoveries: 0,
    breaches: [],
    fires: [],
    arcs: {},
    tutorial: 0,
    torpedoes: 2,
    flags: {},
    achievements: [],
    modules: [],
    heat: 0,
    expData: 0,
    expLog: {},
    expSold: 0,
    tradeRevenue: 0,
    mined: 0,
  };

  const world: World = {
    version: 0, seed, time: 0, realGalaxy: !!opts.realGalaxy, galaxyLy: opts.realGalaxy ? (opts.maxLy ?? 20) : undefined, hardcore: !!opts.hardcore,
    rareOrigin: assignRares(systems, new RNG((seed ^ 0x5a5e) >>> 0)),
    syndicates: assignSyndicates(systems, startId, new RNG((seed ^ 0x51d1) >>> 0)),
    ...(assignPermits(systems, startId, new RNG((seed ^ 0x9e3d) >>> 0)), {}),
    systems, player, news: [], events: [], wars: [],
    missionCounter: 0, econTick: 0, shockTick: 0, warTick: 0,
  };
  world.news = newsFromEvents(world);
  return world;
}

export function defaultSystems(): ShipSystem[] {
  return [
    { id: "reactor", name: "Reactor Core", health: 100 },
    { id: "engines", name: "Main Engines", health: 100 },
    { id: "life", name: "Air Scrubbers", health: 100 },
    { id: "weapons", name: "Weapon Mounts", health: 100 },
    { id: "cargo", name: "Cargo Bay", health: 100 },
    { id: "comms", name: "Comms Array", health: 100 },
  ];
}

// ---------- Missions ----------

export const ARCS: Record<string, { title: string; stages: { title: string; desc: string; kind: MissionKind; reward: number }[] }> = {
  tsc: {
    title: "The Quiet Gate",
    stages: [
      { title: "Compact: Courier Run", desc: "Carry sealed Compact dispatches to a neighbouring station. Do not open them.", kind: "delivery", reward: 500 },
      { title: "Compact: Clear the Lane", desc: "Corsairs are choking a Compact supply lane. Break them.", kind: "bounty", reward: 900 },
      { title: "Compact: The Quiet Gate", desc: "Survey the anomaly the Compact has been hiding from the news net. What you find decides who controls this gate.", kind: "research", reward: 1800 },
    ],
  },
  fdm: {
    title: "Belt Fever",
    stages: [
      { title: "Guild: Ore Quota", desc: "The Guild needs ore and needs it quiet. Fill the quota.", kind: "mining", reward: 450 },
      { title: "Guild: Ride Shotgun", desc: "A Guild hauler is carrying something worth killing for. Get it home.", kind: "escort", reward: 900 },
      { title: "Guild: Belt Fever", desc: "Board the derelict the Guild lost in the belt. Bring back what the crew died for.", kind: "research", reward: 1600 },
    ],
  },
  hex: {
    title: "Ledger of Glass",
    stages: [
      { title: "Combine: Audit Run", desc: "Carry Combine ledgers to a partner station. They're encrypted. They're also very heavy for what they are.", kind: "delivery", reward: 550 },
      { title: "Combine: Hostile Takeover", desc: "Someone is raiding Combine freighters with suspiciously good intel. Remove the raiders.", kind: "bounty", reward: 950 },
      { title: "Combine: Ledger of Glass", desc: "The intel came from an anomaly the Combine seeded years ago. Find it before their rivals do.", kind: "research", reward: 1900 },
    ],
  },
  ora: {
    title: "Free Drift",
    stages: [
      { title: "Autonomy: Fill the Silos", desc: "The Ring feeds itself or it doesn't eat. Bring ore.", kind: "mining", reward: 480 },
      { title: "Autonomy: Ride Along", desc: "A Ring hauler is running the blockade. Get it home.", kind: "escort", reward: 950 },
      { title: "Autonomy: Free Drift", desc: "Deliver what the hauler was really carrying. Don't ask what it is. Don't get scanned.", kind: "delivery", reward: 2200 },
    ],
  },
  vex: {
    title: "The Veil Accord",
    stages: [
      { title: "Veil: Proof of Nerve", desc: "Run contraband through a guarded gate for the Corsairs. No scans, no seizures.", kind: "delivery", reward: 700 },
      { title: "Veil: Blood Debt", desc: "A Compact patrol killed a Corsair captain. The Veil wants a patrol in return.", kind: "bounty", reward: 1200 },
      { title: "Veil: The Accord", desc: "Broker the Veil's terms at a Compact star base. If they'll let you dock.", kind: "delivery", reward: 2500 },
    ],
  },
};

export function genMissionsFor(world: World, station: StationDef, rng: RNG): Mission[] {
  const missions: Mission[] = [];
  const sys = Object.values(world.systems).find((s) => s.stations.includes(station))!;
  const linked = sys.links.map((l) => world.systems[l]);
  const rep = world.player.rep[station.factionId] ?? 0;
  const tier = missionTier(rep);
  const n = rng.int(2, 4) + tier;
  const kinds: MissionKind[] = ["delivery", "bounty", "mining", "escort", "passenger", "ground"];
  if (tier >= 1) kinds.push("research", "research");
  if (station.type === "research") kinds.push("ground");
  if (station.military) kinds.push("bounty", "bounty");
  for (let i = 0; i < n; i++) {
    const kind = rng.pick(kinds);
    const idn = `m${world.missionCounter++}`;
    const payMult = 1 + tier * 0.35;
    if (kind === "delivery" && linked.length) {
      const target = rng.pick(linked);
      const tStation = target.stations.length ? rng.pick(target.stations) : null;
      if (!tStation) continue;
      const com = rng.pick(COMMODITIES.filter((c) => !c.rare && (!c.illegal || rng.chance(0.15))));
      const qty = rng.int(3, 10);
      missions.push({
        id: idn, kind, accepted: false, done: false, tier,
        title: `Deliver ${qty} ${com.name}`,
        desc: `Take ${qty}x ${com.name} to ${tStation.name} in ${target.name}.${com.illegal ? " Discreetly. Avoid gate scans." : ""}`,
        fromStationId: station.id, targetSystemId: target.id, targetStationId: tStation.id,
        commodityId: com.id, qty,
        reward: Math.round((com.base * qty * 1.6 + 120 + (com.illegal ? 400 : 0)) * payMult),
        repReward: 3,
      });
    } else if (kind === "bounty") {
      const target = linked.length && rng.chance(0.6) ? rng.pick(linked) : sys;
      const kills = rng.int(2, 4) + tier;
      missions.push({
        id: idn, kind, accepted: false, done: false, tier,
        title: `${station.military ? "Military " : ""}Bounty: ${kills} corsairs`,
        desc: `Destroy ${kills} Veil Corsair raiders in ${target.name}. Payment on return.`,
        fromStationId: station.id, targetSystemId: target.id,
        killsNeeded: kills, kills: 0,
        reward: Math.round((250 * kills + rng.int(0, 200)) * payMult),
        repReward: 4,
      });
    } else if (kind === "mining") {
      const qty = rng.int(6, 14);
      missions.push({
        id: idn, kind, accepted: false, done: false, tier,
        title: `Mining: ${qty} Raw Ore`,
        desc: `Deliver ${qty}x Raw Ore to ${station.name}. Mine it or buy it — we don't care.`,
        fromStationId: station.id, targetSystemId: sys.id, targetStationId: station.id,
        commodityId: "ore", qty,
        reward: Math.round((26 * qty + rng.int(20, 120)) * payMult),
        repReward: 2,
      });
    } else if (kind === "escort" && sys.stations.length > 1) {
      const dest = rng.pick(sys.stations.filter((s) => s !== station));
      missions.push({
        id: idn, kind, accepted: false, done: false, tier,
        title: `Escort freighter to ${dest.name}`,
        desc: `A freighter leaves when you undock. Keep it alive until it reaches ${dest.name}. Corsairs will come.`,
        fromStationId: station.id, targetSystemId: sys.id, targetStationId: dest.id,
        reward: Math.round((380 + rng.int(0, 220)) * payMult),
        repReward: 5,
      });
    } else if (kind === "passenger" && linked.length) {
      const target = rng.pick(linked);
      const tStation = target.stations.length ? rng.pick(target.stations) : null;
      if (!tStation) continue;
      const pk = rng.pick(["vip", "refugee", "fugitive", "tourist", "tourist"] as const);
      const name = genPersonName(rng);
      const sightIdx = pk === "tourist" && target.planets.length ? rng.int(0, target.planets.length - 1) : undefined;
      const sight = sightIdx !== undefined ? target.planets[sightIdx] : null;
      missions.push({
        id: idn, kind, accepted: false, done: false, tier,
        title: `${pk === "vip" ? "VIP" : pk === "refugee" ? "Refugee" : pk === "tourist" ? "Sightseeing" : "Discreet"} transport: ${name}`,
        desc: pk === "vip" ? `${name} wants ${tStation.name} in ${target.name}, in comfort. Expects to arrive alive.`
          : pk === "refugee" ? `${name} needs passage to ${tStation.name}. Can't pay much. Won't say why.`
          : pk === "tourist" ? `${name} and party want to see ${sight?.name ?? target.name} up close: enter orbit there, then drop them at ${tStation.name}, ${target.name}.`
          : `${name} needs to reach ${tStation.name} without a gate scan finding them aboard.`,
        fromStationId: station.id, targetSystemId: target.id, targetStationId: tStation.id,
        passengerName: name, passengerKind: pk, sightPlanetIdx: sightIdx, sightSeen: false,
        reward: pk === "vip" ? 600 + rng.int(0, 300) : pk === "refugee" ? 120 + rng.int(0, 80) : pk === "tourist" ? 700 + rng.int(0, 400) : 500 + rng.int(0, 400),
        repReward: pk === "refugee" ? 6 : pk === "tourist" ? 4 : 3,
      });
    } else if (kind === "ground") {
      const pool = [sys, ...linked].filter((s) => s.planets.some((pl) => pl.surface));
      const gsys = rng.pick(pool);
      const pIdx = gsys.planets.findIndex((pl) => pl.surface);
      if (pIdx < 0) continue;
      const pl = gsys.planets[pIdx];
      const goal = rng.pick(["flora", "probe", "outcrop"] as const);
      const need = goal === "flora" ? rng.int(2, 4) : goal === "probe" ? rng.int(1, 2) : rng.int(3, 5);
      const what = goal === "flora" ? "scan" : goal === "probe" ? "recover" : "mine";
      const thing = goal === "flora" ? "alien flora" : goal === "probe" ? "crashed probes" : "mineral outcrops";
      missions.push({
        id: idn, kind, accepted: false, done: false, tier,
        title: `${goal === "flora" ? "Field survey" : goal === "probe" ? "Recovery" : "Prospecting"}: ${pl.name}`,
        desc: `Drop a rover on ${pl.name} in ${gsys.name} (L from orbit) and ${what} ${need} ${thing}. Any region counts. Report back here.`,
        fromStationId: station.id, targetSystemId: gsys.id, targetStationId: station.id,
        groundPlanetIdx: pIdx, groundGoal: goal, groundNeed: need, groundDone: 0,
        reward: Math.round((300 + need * (goal === "probe" ? 220 : 110) + rng.int(0, 150)) * payMult),
        repReward: 4,
      });
    } else if (kind === "research") {
      const pool = Object.values(world.systems).filter((s) => s === sys || sys.links.includes(s.id));
      const anomSys = rng.pick(pool);
      const an = anomSys.anomalies.find((a) => !a.claimed);
      if (!an) continue;
      missions.push({
        id: idn, kind, accepted: false, done: false, tier,
        title: `Research: survey ${an.name}`,
        desc: `Deep-scan ${anomSys.name} (hold V) to locate ${an.name}, investigate it, and report back here.`,
        fromStationId: station.id, targetSystemId: anomSys.id, targetStationId: station.id,
        anomalyId: an.id,
        reward: Math.round((420 + rng.int(0, 300)) * payMult),
        repReward: 5,
      });
    }
  }
  // standing orders: a supply contract in several shipments, pay climbing each time
  if (tier >= 1 && rng.chance(0.4) && linked.length) {
    const target = rng.pick(linked);
    const tStation = target.stations.length ? rng.pick(target.stations) : null;
    if (tStation) {
      const com = rng.pick(COMMODITIES.filter((c) => !c.illegal && !c.rare && c.id !== "relics"));
      const qty = rng.int(4, 8), total = rng.int(3, 5);
      missions.push({
        id: `order-${world.missionCounter++}`, kind: "mining", accepted: false, done: false, tier,
        title: `Standing order: ${qty} ${com.name} x${total}`,
        desc: `${tStation.name} in ${target.name} wants ${qty}x ${com.name} delivered ${total} times. Source it yourself. Each shipment pays more than the last.`,
        fromStationId: station.id, targetSystemId: target.id, targetStationId: tStation.id, commodityId: com.id, qty,
        shipTotal: total, shipDone: 0,
        reward: Math.round(com.base * qty * 1.4 + 120), repReward: 2,
      });
    }
  }

  // engineering tenders: the station's own systems need hands
  if (!station.military && rng.chance(0.3)) {
    const what = rng.pick(["reactor coolant loop", "life support scrubbers", "docking bay actuators", "main engines"]);
    missions.push({
      id: `tender-${world.missionCounter++}`, kind: "repair", accepted: false, done: false, tier: 0,
      title: `Engineering tender: ${what}`,
      desc: `${station.name}'s ${what} are failing and the yard is short-handed. Suit up, walk the plant, and bring three systems back. Paid on completion, here.`,
      fromStationId: station.id, targetSystemId: sys.id, targetStationId: station.id,
      reward: Math.round((380 + rng.int(0, 220)) * (1 + tier * 0.35)), repReward: 5,
    });
  }

  // AI syndicate contracts at its base: convoy runs to partners, bounties on rivals
  const sy = syndicateAt(world, station.id);
  if (sy) {
    const goods: Record<SyndicateStyle, string[]> = { trade: ["lux", "parts", "med"], salvage: ["metals", "parts"], mining: ["ore", "metals"], pirate: ["contra", "lux"] };
    for (const pid of sy.partners.slice(0, 2)) {
      const f = findStation(world, pid);
      if (!f) continue;
      const wantId = rng.pick(goods[sy.style]);
      const com = COMMODITIES.find((c) => c.id === wantId)!;
      const qty = rng.int(4, 8);
      missions.push({
        id: `syn-${sy.tag}-${world.missionCounter++}`, kind: "delivery", accepted: false, done: false, tier: 0, syndicate: sy.tag,
        title: `[${sy.tag}] Convoy run: ${qty} ${com.name}`,
        desc: `${sy.name} wants ${qty}x ${com.name} at ${f.st.name} in ${f.sys.name}. Their goods, their route, your ship.${com.illegal ? " Don't get scanned." : ""}`,
        fromStationId: station.id, targetSystemId: f.sys.id, targetStationId: f.st.id, commodityId: com.id, qty,
        reward: Math.round((com.base * qty * 1.9 + 200) * (1 + Math.max(0, effectiveSynStanding(world, sy.tag)) / 100)),
        repReward: 0,
      });
    }
    const rival = sy.rivals.map((t) => syndicateByTag(world, t)).find((r) => !!r);
    if (rival) {
      const kills = rng.int(2, 3);
      missions.push({
        id: `syn-${sy.tag}-${world.missionCounter++}`, kind: "bounty", accepted: false, done: false, tier: 0, syndicate: sy.tag,
        title: `[${sy.tag}] Bounty: ${kills} raiders in ${world.systems[rival.systemId].name}`,
        desc: `${sy.name} pays for ${kills} corsairs destroyed in ${world.systems[rival.systemId].name}, home of their rivals [${rival.tag}] ${rival.name}.`,
        fromStationId: station.id, targetSystemId: rival.systemId, killsNeeded: kills, kills: 0,
        reward: Math.round(380 * kills * (1 + Math.max(0, effectiveSynStanding(world, sy.tag)) / 100)),
        syndicateTarget: rival.tag,
        repReward: 0,
      });
    }
  }

  // faction narrative arc: next stage if reputation allows
  const arc = ARCS[station.factionId];
  const stage = world.player.arcs[station.factionId] ?? 0;
  if (arc && stage < arc.stages.length && rep >= stage * 25 && !world.player.missions.some((m) => m.kind === "arc" && m.arcFaction === station.factionId)) {
    const s = arc.stages[stage];
    const m: Mission = {
      id: `arc-${station.factionId}-${stage}`, kind: "arc", accepted: false, done: false, tier: stage,
      title: s.title, desc: s.desc,
      fromStationId: station.id, targetSystemId: sys.id, targetStationId: station.id,
      reward: s.reward, arcFaction: station.factionId, arcStage: stage, repReward: 15,
    };
    if (s.kind === "delivery") {
      const target = linked.length ? rng.pick(linked) : sys;
      const tStation = target.stations[0];
      if (tStation) {
        m.targetSystemId = target.id; m.targetStationId = tStation.id;
        m.commodityId = station.factionId === "vex" || station.factionId === "ora" ? "contra" : "data"; m.qty = 3;
        m.desc += ` Destination: ${tStation.name}, ${target.name}.`;
      }
    } else if (s.kind === "bounty") {
      m.killsNeeded = 4; m.kills = 0;
      const target = linked.length ? rng.pick(linked) : sys;
      m.targetSystemId = target.id;
      m.desc += ` Hunting grounds: ${target.name}.`;
    } else if (s.kind === "mining") {
      m.commodityId = "ore"; m.qty = 12;
    } else if (s.kind === "escort") {
      const dest = sys.stations.find((x) => x !== station) ?? station;
      m.targetStationId = dest.id;
    } else if (s.kind === "research") {
      const an = sys.anomalies.find((a) => !a.claimed) ?? linked.flatMap((l) => l.anomalies).find((a) => !a.claimed);
      if (an) {
        m.anomalyId = an.id;
        const asys = Object.values(world.systems).find((x) => x.anomalies.includes(an))!;
        m.targetSystemId = asys.id;
        m.desc += ` Signal last placed in ${asys.name}.`;
      }
    }
    missions.unshift(m);
  }
  return missions;
}

const SYNDICATE_POOL: { tag: string; name: string; color: string; style: SyndicateStyle }[] = [
  { tag: "VULT", name: "Vulture Cartel", color: "#ff9a3a", style: "pirate" },
  { tag: "ORBT", name: "Orbital Freight Guild", color: "#5ab3ff", style: "trade" },
  { tag: "KRAK", name: "Kraken Salvage", color: "#63f2c8", style: "salvage" },
  { tag: "DRIL", name: "Deepcore Drillers", color: "#ffd75a", style: "mining" },
  { tag: "HALO", name: "Halo Logistics", color: "#e060ff", style: "trade" },
  { tag: "ASHN", name: "Ashen Hand", color: "#ff5a5a", style: "pirate" },
];

// Four AI syndicates per galaxy, each based at a civilian station in its own
// system (never the start system), trading with two partner stations nearby.
export function assignSyndicates(systems: Record<string, SystemDef>, startId: string, rng: RNG): Syndicate[] {
  const out: Syndicate[] = [];
  const pool = [...SYNDICATE_POOL];
  const used = new Set<string>([startId]);
  const candidates = Object.values(systems).filter((s) => s.id !== startId && s.stations.some((st) => !st.military && !st.rare));
  for (let i = 0; i < 4 && pool.length && candidates.length; i++) {
    const open = candidates.filter((s) => !used.has(s.id));
    if (!open.length) break;
    const sys = rng.pick(open);
    used.add(sys.id);
    const st = rng.pick(sys.stations.filter((x) => !x.military && !x.rare));
    const def = pool.splice(rng.int(0, pool.length - 1), 1)[0];
    const partners: string[] = [];
    for (const l of sys.links) { const o = systems[l]; const cand = o?.stations.filter((x) => !x.military) ?? []; if (cand.length) partners.push(rng.pick(cand).id); if (partners.length >= 2) break; }
    out.push({ ...def, systemId: sys.id, stationId: st.id, partners, rivals: [], treasury: rng.int(20000, 60000) });
  }
  // rivals: pirate syndicates against everyone else; others against the next one
  for (const sy of out) {
    sy.rivals = sy.style === "pirate" ? out.filter((o) => o !== sy).map((o) => o.tag)
      : out.filter((o) => o !== sy && o.style === "pirate").map((o) => o.tag);
    if (!sy.rivals.length) { const other = out.find((o) => o !== sy); if (other) sy.rivals = [other.tag]; }
  }
  return out;
}

export function syndicateAt(w: World, stationId: string): Syndicate | null {
  return w.syndicates?.find((s) => s.stationId === stationId || s.holdings?.includes(stationId)) ?? null;
}
export function syndicateByTag(w: World, tag: string): Syndicate | null {
  return w.syndicates?.find((s) => s.tag === tag) ?? null;
}
export function synStanding(w: World, tag: string): number { return w.player.synRep?.[tag] ?? 0; }

// ---------- Syndicate diplomacy ----------
export function relKey(a: string, b: string): string { return a < b ? `${a}|${b}` : `${b}|${a}`; }
export function synRelation(w: World, a: string, b: string): number {
  if (a === b) return 100;
  const r = w.synRelations?.[relKey(a, b)];
  if (r !== undefined) return r;
  // seed from the static rivalry lists until history moves it
  const sa = syndicateByTag(w, a);
  return sa?.rivals.includes(b) ? -40 : 10;
}
export function shiftRelation(w: World, a: string, b: string, delta: number): { before: number; after: number } {
  w.synRelations ??= {};
  const k = relKey(a, b);
  const before = synRelation(w, a, b);
  const after = Math.max(-100, Math.min(100, before + delta));
  w.synRelations[k] = after;
  const sa = syndicateByTag(w, a), sb = syndicateByTag(w, b);
  if (sa && sb) {
    // rivalry lists follow the relation so raids and bounties track diplomacy
    const feud = after <= -30;
    sa.rivals = feud ? Array.from(new Set([...sa.rivals, b])) : sa.rivals.filter((t) => t !== b);
    sb.rivals = feud ? Array.from(new Set([...sb.rivals, a])) : sb.rivals.filter((t) => t !== a);
    const wasAllied = before >= 50, isAllied = after >= 50;
    if (!wasAllied && isAllied) pushEvent(w, { t: w.time, kind: "peace", systemId: sa.systemId, text: `[${a}] ${sa.name} and [${b}] ${sb.name} sign an alliance - convoys share lanes` });
    if (wasAllied && !isAllied) pushEvent(w, { t: w.time, kind: "war", systemId: sa.systemId, text: `The [${a}]-[${b}] alliance collapses` });
    if (before > -30 && feud) pushEvent(w, { t: w.time, kind: "war", systemId: sb.systemId, text: `[${a}] ${sa.name} declares a feud with [${b}] ${sb.name}` });
  }
  return { before, after };
}
export function synAllies(w: World, tag: string): string[] {
  return (w.syndicates ?? []).filter((o) => o.tag !== tag && synRelation(w, tag, o.tag) >= 50).map((o) => o.tag);
}
// Perks flow through alliances: a PARTNER of an ally counts as an AFFILIATE here
export function effectiveSynStanding(w: World, tag: string): number {
  const own = synStanding(w, tag);
  const viaAlly = Math.max(0, ...synAllies(w, tag).map((t) => synStanding(w, t) >= 60 ? 30 : 0));
  return Math.max(own, viaAlly);
}
export function synStandingLabel(v: number): string { return v >= 60 ? "PARTNER" : v >= 30 ? "AFFILIATE" : v >= 10 ? "KNOWN" : v <= -20 ? "MARKED" : "STRANGER"; }
export function adjustSynRep(w: World, tag: string, delta: number): void {
  w.player.synRep ??= {};
  w.player.synRep[tag] = Math.max(-100, Math.min(100, (w.player.synRep[tag] ?? 0) + delta));
}

// Permits: one closed system per faction (never the start, never a dead end that
// would strand a route), holding a military station and richer pickings.
export function assignPermits(systems: Record<string, SystemDef>, startId: string, rng: RNG): void {
  const byFaction = new Map<string, SystemDef[]>();
  for (const sys of Object.values(systems)) {
    if (sys.id === startId || sys.links.length < 2 || !sys.stations.some((st) => st.military)) continue;
    if (sys.links.includes(startId)) continue;
    const arr = byFaction.get(sys.factionId) ?? [];
    arr.push(sys); byFaction.set(sys.factionId, arr);
  }
  // Closing a system must not cut anyone off: every other system stays reachable
  // through open space, and the closed one still borders open space.
  const chosen = new Set<string>();
  const keepsConnected = (cand: string): boolean => {
    const blocked = new Set([...chosen, cand]);
    const seen = new Set<string>([startId]);
    const stack = [startId];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const l of systems[cur].links) if (!blocked.has(l) && !seen.has(l)) { seen.add(l); stack.push(l); }
    }
    for (const id of Object.keys(systems)) if (!blocked.has(id) && !seen.has(id)) return false;
    return systems[cand].links.some((l) => seen.has(l));
  };
  for (const [, arr] of byFaction) {
    const ok = arr.filter((s) => keepsConnected(s.id));
    if (!ok.length) continue;
    const sys = rng.pick(ok);
    chosen.add(sys.id);
    sys.permit = true;
    // worth the standing: better stock and a fatter belt
    for (const st of sys.stations) for (const id of Object.keys(st.stock)) st.stock[id] = Math.round(st.stock[id] * 1.5);
    for (const a of sys.asteroids) { a.rich = a.rich || rng.chance(0.4); a.ore += 3; }
  }
}

// Rare goods: spread the pool over civilian stations, one origin each.
export function assignRares(systems: Record<string, SystemDef>, rng: RNG): Record<string, string> {
  const out: Record<string, string> = {};
  const civ = Object.values(systems).flatMap((s) => s.stations).filter((st) => !st.military);
  const pool = [...RARES];
  const picks = Math.min(pool.length, Math.max(3, Math.round(civ.length * 0.4)));
  for (let i = 0; i < picks && civ.length; i++) {
    const st = civ.splice(rng.int(0, civ.length - 1), 1)[0];
    const c = pool.splice(rng.int(0, pool.length - 1), 1)[0];
    st.rare = c.id;
    st.stock[c.id] = rng.int(3, 7);
    st.prices[c.id] = Math.round(c.base * 0.8);
    out[c.id] = st.id;
  }
  return out;
}

// ---------- Ranks & exploration ----------
// Three non-combat careers, nine grades each, Elite at the top.

export type RankKind = "explorer" | "trader" | "miner" | "rescuer";
export const RANK_TITLES: Record<RankKind, string[]> = {
  explorer: ["AIMLESS", "MOSTLY AIMLESS", "SCOUT", "SURVEYOR", "TRAILBLAZER", "PATHFINDER", "RANGER", "PIONEER", "ELITE"],
  trader: ["PENNILESS", "MOSTLY PENNILESS", "PEDDLER", "DEALER", "MERCHANT", "BROKER", "ENTREPRENEUR", "TYCOON", "ELITE"],
  miner: ["PROSPECT", "DIGGER", "DRILLER", "EXCAVATOR", "CORE CUTTER", "FOREMAN", "MAGNATE", "BARON", "ELITE"],
  rescuer: ["BYSTANDER", "GOOD SAMARITAN", "FIRST RESPONDER", "LIFELINE", "SALVOR", "SHIPWRIGHT", "GUARDIAN", "SAVIOUR", "ELITE"],
};
const RANK_STEPS: Record<RankKind, number[]> = {
  explorer: [0, 300, 1000, 2500, 5000, 10000, 20000, 40000, 80000],
  trader: [0, 1000, 3000, 8000, 20000, 50000, 100000, 250000, 500000],
  miner: [0, 20, 60, 150, 300, 600, 1200, 2500, 5000],
  rescuer: [0, 3, 8, 16, 30, 50, 80, 120, 200],
};

// rescue points: lives, repairs, tows, crises, survivors, maydays answered
export function rescuePoints(p: PlayerState): number {
  return (p.lives ?? 0) + (p.repairs ?? 0) * 2 + (p.tows ?? 0) * 2 + (p.rescues ?? 0);
}
export function rankValue(p: PlayerState, kind: RankKind): number {
  return kind === "explorer" ? p.expSold ?? 0 : kind === "trader" ? p.tradeRevenue ?? 0 : kind === "rescuer" ? rescuePoints(p) : p.mined ?? 0;
}

export function rankOf(p: PlayerState, kind: RankKind): { idx: number; title: string; next: number | null } {
  const v = rankValue(p, kind);
  const steps = RANK_STEPS[kind];
  let idx = 0;
  for (let i = 0; i < steps.length; i++) if (v >= steps[i]) idx = i;
  return { idx, title: RANK_TITLES[kind][idx], next: idx + 1 < steps.length ? steps[idx + 1] : null };
}

// Log a system at a scan level; returns the exploration data (credits) earned.
export function logSystem(p: PlayerState, sys: SystemDef, level: 1 | 2): number {
  p.expLog ??= {};
  const have = p.expLog[sys.id] ?? 0;
  if (level <= have) return 0;
  const value = (level === 1 ? 60 : 160) + sys.planets.length * 25 + (sys.starClass ? 20 : 0) - (have === 1 ? 60 : 0);
  p.expLog[sys.id] = level;
  p.expData = (p.expData ?? 0) + value;
  return value;
}

// ---------- Community goal ----------
// One goal a week for the whole galaxy: a station type needs a commodity.
// Progress lives on the edge; contributions come from market sales.

export interface CommunityGoal { id: string; title: string; desc: string; commodityId: string; stationType: StationType; target: number; premium: number }

export function weekKey(now = Date.now()): string {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export function communityGoal(now = Date.now()): CommunityGoal {
  const key = weekKey(now);
  const rng = new RNG(hashStr(`goal:${key}`));
  const pool = COMMODITIES.filter((c) => !c.illegal && !c.rare && c.id !== "relics");
  const com = rng.pick(pool);
  const type = rng.pick(["research", "refinery", "trade", "agri", "mining"] as StationType[]);
  const target = 300 + rng.int(0, 5) * 100;
  const names: Record<string, string> = { research: "research posts", refinery: "refineries", trade: "trade hubs", agri: "agri stations", mining: "mining stations" };
  return {
    id: `cg-${key}`, commodityId: com.id, stationType: type, target, premium: 0.25,
    title: `Community goal: ${com.name} for ${names[type]}`,
    desc: `Week of ${key}: every pilot's sales of ${com.name} at ${names[type]} count toward ${target} units. Sales pay 25% over market while the goal runs.`,
  };
}

// Ground contract progress: called by the rover when it scans, recovers or mines
export function groundProgress(w: World, planetIdx: number, goal: "flora" | "probe" | "outcrop"): Mission | null {
  const p = w.player;
  for (const m of p.missions) {
    if (m.kind !== "ground" || !m.accepted || m.done || m.groundGoal !== goal) continue;
    if (m.targetSystemId !== p.systemId || m.groundPlanetIdx !== planetIdx) continue;
    if ((m.groundDone ?? 0) >= (m.groundNeed ?? 1)) continue;
    m.groundDone = (m.groundDone ?? 0) + 1;
    return m;
  }
  return null;
}

// ---------- Base demand (trade routes) ----------
// Every base (AI syndicate or squadron) wants three goods this week at +30%.

export function baseDemand(key: string, now = Date.now()): string[] {
  const rng = new RNG(hashStr(`demand:${key}:${weekKey(now)}`));
  const pool = COMMODITIES.filter((c) => !c.illegal && !c.rare && c.id !== "relics").map((c) => c.id);
  const out: string[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return out;
}
export const ROUTE_PREMIUM = 0.3;

// A squadron with a base declares for a side: the front moves, and members' work counts more
export function backWar(w: World, side: string, squadron: string): boolean {
  const war = w.synWar;
  if (!war || war.backed || (side !== war.attacker && side !== war.defender)) return false;
  war.backed = side; war.backedBy = squadron;
  war.score += side === war.attacker ? 10 : -10;
  const sy = syndicateByTag(w, side);
  pushEvent(w, { t: w.time, kind: "war", systemId: war.systemId, text: `Squadron [${squadron}] declares for [${side}] ${sy?.name ?? side} in the war at ${w.systems[war.systemId].name}` });
  return true;
}

// Player-facing war contributions: kills of a side's raiders, runs for a side
export function warContribute(w: World, side: string, amount: number): SynWar | null {
  const war = w.synWar;
  if (!war || (side !== war.attacker && side !== war.defender)) return null;
  if (war.backed === side) amount = Math.round(amount * 1.5); // a declared squadron fights harder
  war.contrib[side] = (war.contrib[side] ?? 0) + amount;
  war.score += side === war.attacker ? amount : -amount;
  war.score = Math.max(-100, Math.min(100, war.score));
  return war;
}

function resolveSynWar(w: World, rng: RNG): void {
  const war = w.synWar;
  if (!war) return;
  const atk = syndicateByTag(w, war.attacker), def = syndicateByTag(w, war.defender);
  w.synWar = null;
  if (!atk || !def) return;
  const attackerWins = war.score > 0;
  const winner = attackerWins ? atk : def, loser = attackerWins ? def : atk;
  const take = Math.round(loser.treasury * 0.2);
  loser.treasury -= take; winner.treasury += take;
  const lost = loser.partners.find((pid) => !winner.partners.includes(pid));
  if (lost) { loser.partners = loser.partners.filter((x) => x !== lost); winner.partners.push(lost); }
  // a rout takes the base itself: the loser falls back to a partner station
  let routed = false;
  if (war.score >= 100 && attackerWins) { // only a decisive attack takes ground; a repelled attacker keeps its home
    const fallback = loser.partners.find((pid) => !syndicateAt(w, pid));
    const f = fallback ? findStation(w, fallback) : null;
    if (f) {
      winner.holdings = Array.from(new Set([...(winner.holdings ?? []), loser.stationId]));
      loser.stationId = f.st.id; loser.systemId = f.sys.id;
      loser.partners = loser.partners.filter((x) => x !== fallback);
      routed = true;
    }
  }
  w.synRelations ??= {};
  w.synRelations[relKey(atk.tag, def.tag)] = -25; // truce, still cool
  atk.rivals = atk.rivals.filter((t) => t !== def.tag); def.rivals = def.rivals.filter((t) => t !== atk.tag);
  const sys = w.systems[war.systemId];
  pushEvent(w, { t: w.time, kind: "peace", systemId: sys.id, text: `Syndicate war over: [${winner.tag}] ${winner.name} beats [${loser.tag}] ${loser.name} in ${sys.name}${routed ? ` and takes their base - [${loser.tag}] falls back to ${w.systems[loser.systemId].name}` : lost ? `, taking their ${findStation(w, lost)?.st.name ?? "partner"} lane` : ""}` });
  // pilots who fought for the winner are remembered
  const mine = war.contrib[winner.tag] ?? 0;
  if (mine > 0) { adjustSynRep(w, winner.tag, 15); w.player.credits += Math.round(mine * 60); w.player.flags = { ...(w.player.flags ?? {}), warVeteran: true }; }
  else if ((war.contrib[loser.tag] ?? 0) > 0) adjustSynRep(w, loser.tag, 8);
  // a declared squadron shares the spoils, or the grudge
  if (war.backed && war.backedBy) {
    if (war.backed === winner.tag) {
      w.player.warPayout = { tag: war.backedBy, value: Math.min(5000, Math.round(mine * 40) + 500) };
      w.player.flags = { ...(w.player.flags ?? {}), squadWarWin: true };
      pushEvent(w, { t: w.time, kind: "peace", systemId: sys.id, text: `[${winner.tag}] ${winner.name} pays squadron [${war.backedBy}] for its part in the war` });
    } else {
      adjustSynRep(w, winner.tag, -10);
      pushEvent(w, { t: w.time, kind: "war", systemId: sys.id, text: `[${winner.tag}] ${winner.name} marks squadron [${war.backedBy}] for backing the losing side` });
    }
  }
  void rng;
}

// Syndicate rivalry: every so often raiders hit a convoy, treasuries move, the news says so
export function tickSyndicates(w: World, rng: RNG): void {
  const list = w.syndicates ?? [];
  if (!list.length) return;
  // wars: start on a deep feud, drift with treasuries, resolve on time or a decisive score
  if (w.synWar) {
    const war = w.synWar;
    const atk = syndicateByTag(w, war.attacker), def = syndicateByTag(w, war.defender);
    if (atk && def) war.score += Math.sign(atk.treasury - def.treasury) * rng.int(1, 4);
    if (w.time >= war.until || Math.abs(war.score) >= 100) { resolveSynWar(w, rng); return; }
  } else {
    for (const a of list) for (const b of list) {
      if (a === b || a.style === "pirate" && b.style === "pirate") continue;
      if (synRelation(w, a.tag, b.tag) <= -60 && rng.chance(0.5)) {
        w.synWar = { attacker: a.tag, defender: b.tag, systemId: b.systemId, score: 0, until: w.time + 900, contrib: {} };
        const sys = w.systems[b.systemId];
        sys.pirateActivity = Math.min(1, sys.pirateActivity + 0.2);
        pushEvent(w, { t: w.time, kind: "war", systemId: sys.id, text: `Syndicate war: [${a.tag}] ${a.name} moves on [${b.tag}] ${b.name} at ${sys.name} - pilots can pick a side` });
        return;
      }
    }
  }
  const sy = rng.pick(list);
  // diplomacy drift: traders warm to each other, everyone cools toward pirates
  const other = rng.pick(list.filter((o) => o !== sy));
  if (other) shiftRelation(w, sy.tag, other.tag, sy.style === "pirate" || other.style === "pirate" ? -rng.int(1, 4) : rng.int(1, 3));
  if (sy.style === "pirate") {
    const victim = list.find((o) => sy.rivals.includes(o.tag) && rng.chance(0.6)) ?? list.find((o) => o !== sy);
    if (!victim) return;
    const take = Math.min(victim.treasury, rng.int(1500, 4500));
    victim.treasury -= take; sy.treasury += take;
    shiftRelation(w, sy.tag, victim.tag, -3);
    const sys = w.systems[victim.systemId];
    sys.pirateActivity = Math.min(1, sys.pirateActivity + 0.05);
    pushEvent(w, { t: w.time, kind: "raid", systemId: sys.id, text: `[${sy.tag}] ${sy.name} raiders hit an [${victim.tag}] convoy off ${sys.name} - ${take} CR in goods lost` });
  } else {
    const gain = rng.int(800, 2500);
    sy.treasury += gain;
    if (rng.chance(0.35)) pushEvent(w, { t: w.time, kind: "shock", systemId: sy.systemId, text: `[${sy.tag}] ${sy.name} posts a strong week: convoys clear ${gain} CR` });
  }
}

// ---------- Station life: a profile and a local bulletin, seeded, never stored ----------
export function stationProfile(w: World, st: StationDef): { population: number; founded: number; knownFor: string; quirk: string } {
  const rng = new RNG(hashStr(`profile:${w.seed}:${st.id}`));
  const population = st.military ? rng.int(400, 3000) : rng.int(2000, 90000);
  const founded = 2140 + rng.int(0, 180);
  const known: Record<string, string[]> = {
    mining: ["ore that comes up already half-refined", "the deepest shafts in the sector", "a belt that never quite runs dry"],
    agri: ["hydroponic tomatoes people cross systems for", "the last real coffee for twenty light-years", "vat protein nobody complains about"],
    refinery: ["alloys the shipyards fight over", "a smell you stop noticing after a week", "fuel cells with a perfect safety record"],
    research: ["papers nobody outside understands", "a telescope pointed somewhere it shouldn't be", "the best med bay this side of the core"],
    trade: ["a market that never closes", "brokers who remember your face", "the cheapest berth fees in the lane"],
    military: ["drills at all hours", "a very short list of tolerated behaviours", "the sector's only working dry dock"],
  };
  const quirks = ["gravity that's a shade too light", "a bar where the regulars vote on the music", "corridors painted by a captain who never came back", "a cat", "an annual race around the outer ring", "a chapel to a saint nobody can name", "a mural of the founding crew, one face scratched out", "docking chimes tuned to a minor key"];
  return { population, founded, knownFor: rng.pick(known[st.type] ?? known.trade), quirk: rng.pick(quirks) };
}

export function stationBulletin(w: World, st: StationDef, now = Date.now()): string[] {
  const rng = new RNG(hashStr(`bulletin:${w.seed}:${st.id}:${dailyKey(now)}`));
  const lines: string[] = [];
  const pool = [
    () => `LOST: ${rng.pick(["a grey tabby", "a set of docking keys", "one pilot's dignity", "a crate marked FRAGILE, sadly"])} near bay ${rng.int(1, 9)}. Reward.`,
    () => `HIRING: ${rng.pick(["deck hands", "a night-shift medic", "someone who can read a reactor gauge", "tug pilots, no questions"])}. Ask at the bar.`,
    () => `NOTICE: ${rng.pick(["the outer ring is closed for painting", "the water ration is lifted", "berth fees rise Monday", "gravity maintenance 0300-0400, hold onto something"])}.`,
    () => `FOR SALE: ${rng.pick(["one Wren Scout, lightly shot", "hydroponic seedlings, assorted", "a telescope, slightly haunted", "cargo racks, no rust to speak of"])}.`,
    () => `${rng.pick(["Birthday", "Wake", "Wedding", "Retirement"])} for ${rng.pick(["Chief Okonkwo", "the harbourmaster", "old Vask", "the whole night shift"])} in the mess, all welcome.`,
  ];
  const picks = new Set<number>();
  while (picks.size < 3) picks.add(rng.int(0, pool.length - 1));
  for (const i of picks) lines.push(pool[i]());
  const cr = crisisAt(w, st.id);
  if (cr) lines.unshift(`URGENT: ${cr.kind.toUpperCase()} - ${cr.need - cr.delivered} ${COMMODITIES.find((c) => c.id === cr.commodityId)?.name ?? cr.commodityId} still needed. Bring what you have.`);
  const ev = galaxyEventAt(w, findStation(w, st.id)?.sys.id ?? "");
  if (ev?.stationId === st.id) lines.unshift(ev.kind === "festival" ? "FESTIVAL WEEK: the ring is open all night. Mind the tourists." : "STRIKE: the yard is picketed. Fuel and repairs at double rates until it's settled.");
  return lines;
}

export const STORY_LEN = 7;

// ---------- Faction politics ----------
export function embargoed(w: World, factionId: string): boolean {
  const rep = w.player.rep[factionId] ?? 0;
  return factionId !== "vex" && rep <= -40 && rep > -60; // below -60 they don't let you dock at all
}
export function hasCharter(w: World, factionId: string): boolean {
  return (w.player.charters ?? []).includes(factionId);
}

// Settlement needs: two goods a settlement pays a premium for this week
export const SETTLEMENT_PREMIUM = 0.4;
export function settlementNeeds(w: World, poi: Poi, now = Date.now()): string[] {
  const rng = new RNG(hashStr(`needs:${w.seed}:${poi.id}:${weekKey(now)}`));
  const pool = COMMODITIES.filter((c) => !c.illegal && !c.rare && c.id !== "relics" && c.id !== "ore").map((c) => c.id);
  const out: string[] = [];
  while (out.length < 2 && pool.length) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return out;
}

// Settlement mood: a line for outposts and cities, seeded per site and day
export function settlementLine(w: World, poi: Poi, region: Region, now = Date.now()): string {
  const rng = new RNG(hashStr(`settle:${w.seed}:${poi.id}:${dailyKey(now)}`));
  const res = COMMODITIES.find((c) => c.id === region.resource)?.name ?? region.resource;
  const cr = w.crisis;
  if (cr) { const f = findStation(w, cr.stationId); if (f && f.sys.id === w.player.systemId) return `Word from orbit: ${f.st.name} has ${cr.kind === "outbreak" ? "an outbreak" : cr.kind === "famine" ? "a famine" : "a blackout"}. Every shuttle that can fly is flying.`; }
  const pool = poi.kind === "city" ? [
    `Market day. The ${res.toLowerCase()} lorries came in before dawn and the square smells of it.`,
    "The tram is down again. Everyone walks; everyone complains; everyone gets there.",
    `A ${rng.pick(["wedding", "funeral", "strike vote", "festival"])} in the lower district. Bring nothing sharp.`,
    "Curfew talk in the council. Nobody expects it to pass. Nobody expected the last one either.",
    "Kids are flying kites off the ridge. Mind them when you lift off.",
  ] : [
    `Shift change. The ${res.toLowerCase()} rigs run hot and the crews run tired.`,
    "Dust storm two valleys over. The rover shed is full of people waiting it out.",
    `Somebody found ${rng.pick(["a fossil", "an old survey marker", "a crate nobody will claim", "a second entrance"])} in the workings.`,
    "The cook has provisions and opinions. Both are strong.",
    "Comms to orbit are patchy. The relay tech blames the weather; the weather blames the tech.",
  ];
  return rng.pick(pool);
}

// ---------- Captain's log ----------
export function logEntry(w: World, text: string): void {
  const p = w.player;
  p.log ??= [];
  p.log.push({ t: w.time, text: text.slice(0, 120) });
  if (p.log.length > 60) p.log.shift();
}

// ---------- Galaxy events (not wars): comets, flares, festivals, strikes ----------
export type GalaxyEventKind = "comet" | "flare" | "festival" | "strike";
export interface GalaxyEvent { kind: GalaxyEventKind; systemId: string; stationId?: string; until: number }
export function galaxyEventAt(w: World, systemId: string): GalaxyEvent | null {
  const e = w.galaxyEvent;
  return e && e.systemId === systemId && w.time < e.until ? e : null;
}
export function tickGalaxyEvents(w: World, rng: RNG): void {
  if (w.galaxyEvent && w.time >= w.galaxyEvent.until) {
    const e = w.galaxyEvent; w.galaxyEvent = null;
    const sys = w.systems[e.systemId];
    if (e.kind === "comet") for (const a of sys.asteroids) { a.rich = a.rich && rng.chance(0.4); }
    if (e.kind === "strike" && e.stationId) { const f = findStation(w, e.stationId); if (f) { f.st.fuelPrice = Math.max(1, Math.round(f.st.fuelPrice / 2)); f.st.repairPrice = Math.max(1, Math.round(f.st.repairPrice / 2)); } }
    pushEvent(w, { t: w.time, kind: "peace", systemId: sys.id, text: e.kind === "comet" ? `The comet has passed ${sys.name}; the belt settles` : e.kind === "flare" ? `${sys.name}'s star quietens` : e.kind === "festival" ? `The festival at ${findStation(w, e.stationId ?? "")?.st.name ?? sys.name} winds down` : `The strike at ${findStation(w, e.stationId ?? "")?.st.name ?? sys.name} ends` });
    return;
  }
  if (w.galaxyEvent || !rng.chance(0.3)) return;
  const sys = rng.pick(Object.values(w.systems));
  const kind = rng.pick(["comet", "flare", "festival", "strike"] as GalaxyEventKind[]);
  const st = sys.stations.length ? rng.pick(sys.stations) : null;
  if ((kind === "festival" || kind === "strike") && !st) return;
  w.galaxyEvent = { kind, systemId: sys.id, stationId: st?.id, until: w.time + 720 };
  if (kind === "comet") { for (const a of sys.asteroids) { a.rich = a.rich || rng.chance(0.5); a.ore += 4; } pushEvent(w, { t: w.time, kind: "discovery", systemId: sys.id, text: `A comet crosses ${sys.name}: the belt is seeded with rich ore for a while` }); }
  if (kind === "flare") pushEvent(w, { t: w.time, kind: "shock", systemId: sys.id, text: `Solar flare warning for ${sys.name}: hulls run hot, scanners struggle` });
  if (kind === "festival" && st) { for (const id of ["lux", "food"]) st.stock[id] = Math.max(0, Math.round((st.stock[id] ?? 0) * 0.3)); refreshPrices(st); pushEvent(w, { t: w.time, kind: "discovery", systemId: sys.id, text: `Festival week at ${st.name}: luxuries and provisions sell dear, tourists pay double` }); }
  if (kind === "strike" && st) { st.fuelPrice *= 2; st.repairPrice *= 2; pushEvent(w, { t: w.time, kind: "shock", systemId: sys.id, text: `Dock workers strike at ${st.name}: fuel and repairs cost double` }); }
}

// ---------- Daily contract ----------
// One contract everyone in the galaxy sees today: same goods, same quantity, same pay.

export function dailyKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function dailyContract(w: World, now = Date.now()): Mission {
  const key = dailyKey(now);
  const rng = new RNG(hashStr(`daily:${key}`));
  const pool = COMMODITIES.filter((c) => !c.illegal && !c.rare && c.id !== "relics");
  const com = rng.pick(pool);
  const qty = rng.int(6, 16);
  return {
    id: `daily-${key}`, kind: "mining", accepted: false, done: false, tier: 0,
    title: `Daily: ${qty} ${com.name}`,
    desc: `Today's galaxy-wide contract (${key}): hand in ${qty}x ${com.name} at any station. Every pilot sees the same one.`,
    fromStationId: "daily", targetSystemId: w.player.systemId, targetStationId: "any",
    commodityId: com.id, qty,
    reward: Math.round(com.base * qty * 1.2 + 400),
    repReward: 4,
  };
}

// Whether an accepted mission can be turned in at this station
export function missionDeliverable(world: World, m: Mission, station: StationDef): boolean {
  const p = world.player;
  if (!m.accepted || m.done) return false;
  if (m.id.startsWith("daily-")) return !!m.commodityId && !!m.qty && (p.cargo[m.commodityId] ?? 0) >= m.qty;
  if (m.kind === "bounty" || (m.kind === "arc" && m.killsNeeded)) {
    return (m.kills ?? 0) >= (m.killsNeeded ?? 1) && m.fromStationId === station.id;
  }
  if (m.kind === "escort" || (m.kind === "arc" && m.arcStage === 1 && m.arcFaction === "fdm")) {
    return !!m.escortDone && m.fromStationId === station.id;
  }
  if (m.kind === "research" || (m.kind === "arc" && m.anomalyId)) {
    if (m.fromStationId !== station.id) return false;
    const an = Object.values(world.systems).flatMap((s) => s.anomalies).find((a) => a.id === m.anomalyId);
    return !!an && an.claimed;
  }
  if (m.kind === "passenger") return m.targetStationId === station.id && (m.passengerKind !== "tourist" || !!m.sightSeen);
  if (m.kind === "ground") return m.targetStationId === station.id && (m.groundDone ?? 0) >= (m.groundNeed ?? 1);
  if (m.kind === "repair") return m.targetStationId === station.id && !!m.tenderDone;
  if (m.targetStationId !== station.id) return false;
  if (m.commodityId && m.qty) return (p.cargo[m.commodityId] ?? 0) >= m.qty;
  return false;
}

// ---------- News ----------

const NEWS_TEMPLATES = [
  (a: string, b: string) => ({ headline: `TENSIONS RISE IN ${a.toUpperCase()}`, body: `Patrols doubled at jump points after corsair sightings near ${b}.` }),
  (a: string, b: string) => ({ headline: `TRADE ACCORD SIGNED`, body: `${a} and ${b} slash docking fees for guild-registered haulers.` }),
  (a: string) => ({ headline: `GATE MAINTENANCE`, body: `Expect scan delays at ${a} jump points through the cycle.` }),
];

const EVENT_HEADLINES: Record<WorldEvent["kind"], string> = {
  murder: "CIVILIAN VESSEL DESTROYED",
  rescue: "FREIGHTER SAVED FROM CORSAIRS",
  seizure: "CONTRABAND SEIZED AT GATE",
  shock: "MARKET SHOCK",
  war: "FACTION HOSTILITIES",
  peace: "CEASEFIRE DECLARED",
  discovery: "ANOMALY SURVEYED",
  arc: "GALNET SPECIAL REPORT",
  raid: "RAID ON SUPPLY LANE",
};

export function newsFromEvents(w: World): NewsItem[] {
  const items: NewsItem[] = [];
  const recent = w.events.slice(-6).reverse();
  for (const e of recent) {
    items.push({ headline: `${EVENT_HEADLINES[e.kind]} — ${w.systems[e.systemId]?.name.toUpperCase() ?? ""}`, body: e.text });
  }
  const rng = new RNG((w.seed ^ 0xbeef ^ w.events.length) >>> 0);
  const names = Object.values(w.systems).map((s) => s.name);
  while (items.length < 5) {
    const t = rng.pick(NEWS_TEMPLATES);
    items.push(t(rng.pick(names), rng.pick(names)));
  }
  return items;
}

// ---------- Cargo & storage helpers ----------

export function cargoUsed(p: PlayerState): number {
  return Object.values(p.cargo).reduce((a, b) => a + b, 0);
}

export function addCargo(p: PlayerState, id: string, qty: number): boolean {
  if (cargoUsed(p) + qty > p.cargoMax) return false;
  p.cargo[id] = (p.cargo[id] ?? 0) + qty;
  return true;
}

export function removeCargo(p: PlayerState, id: string, qty: number): boolean {
  if ((p.cargo[id] ?? 0) < qty) return false;
  p.cargo[id] -= qty;
  if (p.cargo[id] <= 0) delete p.cargo[id];
  return true;
}

export function hasIllegalCargo(p: PlayerState): boolean {
  const illegalGoods = Object.entries(p.cargo).some(([id, q]) => q > 0 && COMMODITIES.find((c) => c.id === id)?.illegal);
  const fugitive = p.missions.some((m) => m.kind === "passenger" && m.accepted && !m.done && m.passengerKind === "fugitive");
  return illegalGoods || fugitive;
}

export function findStation(world: World, stationId: string): { sys: SystemDef; st: StationDef } | null {
  for (const sys of Object.values(world.systems)) {
    const st = sys.stations.find((s) => s.id === stationId);
    if (st) return { sys, st };
  }
  return null;
}

// Swap hulls: stats reset to the new hull's, cargo must fit
export function applyHull(p: PlayerState, hullId: string): void {
  const h = hull(hullId);
  p.hullId = hullId;
  p.hullMax = h.hullMax; p.hull = h.hullMax;
  p.shieldMax = h.shieldMax; p.shield = h.shieldMax;
  p.fuelMax = h.fuelMax; p.fuel = Math.min(p.fuel, h.fuelMax);
  p.cargoMax = h.cargoMax;
  // fitted modules move across with you
  for (const id of p.modules ?? []) {
    const m = moduleDef(id);
    if (!m) continue;
    p.fuelMax += m.fuel ?? 0; p.cargoMax += m.cargo ?? 0;
    p.shieldMax = Math.round(p.shieldMax * (1 + (m.shield ?? 0)));
  }
  // engineering grades are part of the pilot, not the hull
  p.shieldMax = Math.round(p.shieldMax * (1 + 0.1 * (p.engineering?.shields ?? 0)));
  p.cargoMax += 5 * (p.engineering?.cargo ?? 0);
  p.shield = p.shieldMax;
  p.systems = defaultSystems();
  p.breaches = [];
  p.fires = [];
}

export { hashStr };
