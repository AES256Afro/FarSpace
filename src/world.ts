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
import { ROLE_INFO, CREW_TRAITS, SICKNESS, LEAVE_DOCKS, SPECIALTIES } from "./data/crew";
import { tickSerial, type SerialState } from "./data/serials";
import { isOccasion } from "./data/occasions";

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
  growth?: number;  // settlements: trade and work bring people; 100 makes a town, 250 a city
  tier?: number;    // 0 outpost, 1 town, 2 city (kind becomes "city")
  patron?: string;  // who pushed it over the last line
  projects?: string[]; // town projects funded: school, clinic, pad, chapel
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

export interface MuseumPiece { by: string; item: string; t: number }
export interface StationDef {
  museum?: MuseumPiece[];            // research stations: relics donated, with the donor's name
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

export type AnomalyKind = "data" | "derelict" | "survey" | "fold" | "lens" | "echo";
// named?: the finder gave it a name; the chart keeps it

export interface AnomalyDef {
  id: string;
  name: string;
  kind: AnomalyKind;
  x: number; y: number;
  discovered: boolean;
  claimed: boolean;
  reward: number;
  named?: boolean;  // the finder gave it a name; the chart keeps it
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

export type MissionKind = "delivery" | "bounty" | "mining" | "escort" | "passenger" | "research" | "arc" | "ground" | "repair" | "post" | "photo" | "convoy" | "patrol" | "emergency" | "observe";

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
  passengerKind?: "vip" | "refugee" | "fugitive" | "tourist" | "courier" | "envoy" | "patient" | "prisoner";
  freed?: boolean;                    // a prisoner you let go at a rock; no fare, and the service remembers
  dined?: boolean;                    // sat at the captain's table at a mess call
  evac?: boolean;                     // an evacuation party: a head rate, lives counted at the far clamp
  treaty?: { a: string; b: string };  // an envoy between two factions: land them unshot and on time
  patrolT?: number;                   // seconds held on station in the target system
  patrolNeed?: number;
  patrolDone?: boolean;
  byT?: number;                       // emergencies: world time the clamp needs the engineer by; half pay after
  observeBlown?: boolean;             // observation posts: went to red alert in orbit; the world below noticed
  riteDone?: boolean;                 // the envoy's rite has been offered a room
  sightPlanetIdx?: number;  // tourists want to orbit this planet in the target system first
  sightSeen?: boolean;
  sightKind?: SightKind;    // what the tourists booked to see
  sights?: string[];        // everything they saw on the way (pays extra)
  notable?: string;         // one of the galaxy's notables is aboard (id)
  sightSystemId?: string;   // a detour: the sight is in this system rather than the destination
  detourAsked?: boolean;
  request?: PaxRequest;     // what they asked for on the way: a hot meal, a quiet run, a view
  requestMet?: boolean;
  requestSettled?: boolean;
  tookFire?: boolean;       // the hull was hit while they were aboard
  tip?: number;             // paid on top of the fare at the end
  mood?: number;            // 0..100: how the journey is going for them
  demand?: string | null;   // a commodity they'd like brought aboard
  patience?: number;        // dockings before they start to sour
  docksAboard?: number;
  party?: number;           // how many of them there are
  returning?: boolean;      // rode with you before and asked for you by name
  favourFor?: string;       // a post run carried as a favour for this captain (NpcCaptain id)
  rally?: boolean;          // a border rally: supplies for a contested station, a big push for its faction
  photo?: { systemId: string; wonderId?: string; planetIdx?: number; label: string }; // a picture wanted (F7 in the right place)
  photoDone?: boolean;
  postcarded?: boolean;     // a tourist party that got a picture of their sight
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
  cat?: { name: string; since: number } | null; // the ship's cat, if one has adopted you
  furnishings?: string[];            // things bought for the deck (FURNISHINGS)
  haulers?: Charter[];               // haulers you pay to run your routes while you fly
  mail?: Letter[];                   // letters received (last 20)
  companion?: { name: string; ship: string; docks: number } | null; // a friend flying alongside for a few dockings
  homePort?: string;                 // station id: cheaper yard, happier crew, a place the chronicle names
  racePending?: string | null;       // station whose ring race you've entered; rings appear when you launch
  raceBest?: Record<string, number>; // station id -> best time in seconds
  races?: number;                    // ring races finished
  raceBeaten?: Record<string, true>; // stations where you've beaten the local record
  postRuns?: number;                 // mail bags delivered
  guestbook?: GuestEntry[];          // the last dozen passengers and what they wrote on the way out
  lost?: { name: string; role: string; where: string; t: number }[]; // crew who didn't make it to the pod
  stakes?: Record<string, number>;   // station id -> shares held; they pay a dividend every time you dock there
  votes?: Record<string, "yes" | "no">; // "<week>:<faction>" -> how you voted
  mayday?: { system: string; t: number } | null; // your own mayday on the wire, until somebody answers it
  racesUnderPar?: number;            // ring races finished under par
  influence?: Record<string, number>; // "<week>:<system>:<faction>" -> your push in this week's border contest
  lastWeekSeen?: string;             // the week key last announced at a dock
  marshalWager?: boolean;            // the marshal's challenge: the next under-par race pays double
  convoyPending?: string | null;     // mission id of a convoy that forms on your stern when you launch
  messes?: number;                   // mess calls you sat down for
  mealsCooked?: number;              // galley meals you cooked
  vistaViews?: number;               // times you looked out of the viewport
  convoys?: number;                  // convoys walked through a gate
  catAway?: string | null;           // station id where the cat got left behind; she turns up again
  juice?: number;                    // doses of burn juice from a clinic: one hard burn each
  voiceName?: string;                // what the ship asked to be called; its lines come from that name
  leg?: LegLog;                      // what happened since the last clamp, for the supplemental log
  envoys?: number;                   // treaties landed clean
  beltStanding?: number;             // what the rocks owe you: hoppers helped, spins restarted, registers signed, runs made
  patients?: number;                 // patients landed in time
  numberOne?: string;                // a first officer chosen at review, by name; otherwise the longest-serving
  focus?: FocusKind | null;          // the senior staff's focus for this leg, set at the briefing, cleared at the clamp
  briefed?: boolean;                 // the briefing has been held this leg
  simUsed?: boolean;                 // the sim rig has run this leg
  lostProperty?: LostItem[];         // what fares left in the cabin; hand it in, or keep it
  keepsakes?: string[];              // small things that stayed aboard: unclaimed lost property
  inquiries?: number;                // boards of inquiry sat through, one per crew member lost
  wakes?: number;                    // wakes held in the galley, one per crew member lost
  named?: number;                    // finds the captain named for the survey
  hullsCommissioned?: number;        // hulls taken at a yard under this captain
  ribbons?: number;                  // ribbons pinned on at receptions
  systemNicks?: Record<string, string>; // what the engineer calls the reactor; the HUD uses it
  crewPick?: string;                 // the port the crew voted for; docking there first pleases them
  numberOneLeg?: boolean;            // Number One has the ship for this leg; settled at the next clamp
  ruleKept?: number;                 // first contacts left as found
  ruleBroken?: number;               // first contacts made, kindly or otherwise
  motto?: string;                    // the line on the dedication plaque by the airlock
  prisoners?: number;                // prisoners delivered to a brig
  evacuated?: number;                // people carried out of a bad week
  hailsAnswered?: number;            // passing hails answered with a civil word
  waterToBelt?: number;              // units of water sold to belt rocks; the belt keeps count
  catchphrase?: string;              // the word the captain gives on undock; the helm answers
  shipAskedQuiet?: boolean;          // the ship asked for one quiet leg; settled at the next clamp
  officeLetters?: number;            // letters from the office of anomalous incidents; three and they open a file
  commissionedAt?: number;           // world time this captain took the ship; stardate on the plaque
  prankUntil?: number;               // somebody reprogrammed the ship's voice; it's insufferable until then
  regatta?: number;                  // the regatta: 0 entered, 1 first course won, 2 second, 3 champion
  regattaCourse?: string[];          // the three stations of your regatta, set when you're entered
  wrecksOfMine?: string[];           // wreck ids of ships you lost; they stay where they fell
  donations?: number;                // relics given to museums
  hullHistory?: { previous: string; quirk: string } | null; // who flew this hull before you, and what they left
  jumpStreak?: number;               // gates in a row without a dock (a pilot's arc counts them)
  ledger?: Record<string, number>;   // credits in and out by source, lifetime
  dockings?: Record<string, number>; // station id → times docked; regulars get remembered
  lastFareMood?: Record<string, number>; // station id → mood of the last fare you landed there
  story3?: number;                   // The Keeper: stage index; -1 = not started
  keeper?: { systemId: string; wreckSystemId: string; wreckId: string; contactId: string } | null;
  crossingT?: number;                // when the Crossing was last logged at the kept light
  lastOrbit?: { systemId: string; planetIdx: number } | null;
  grown?: number;                    // crates of provisions the greenhouse has grown
  postcards?: number;                // pictures taken
  lineage?: Captain[];               // captains who sat in this chair before
  captainName?: string;              // who sits in it now (a crew member who took over), if not you
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
  upgraded?: boolean;  // a waystation: a deck, a bar, a bunk; the regulars stop by
}
export const WAYSTATION_CREDITS = 5000, WAYSTATION_PARTS = 12;
export function canUpgradeInfra(inf: Infra, p: PlayerState): string | null {
  if (inf.upgraded) return "ALREADY A WAYSTATION";
  if (!infraLit(inf)) return "RELIGHT IT FIRST";
  if (p.credits < WAYSTATION_CREDITS) return `${WAYSTATION_CREDITS}CR TO BUILD A WAYSTATION`;
  if ((p.cargo.parts ?? 0) < WAYSTATION_PARTS) return `${WAYSTATION_PARTS} SPARE PARTS TO BUILD A WAYSTATION (${p.cargo.parts ?? 0} ABOARD)`;
  return null;
}
export function upgradeInfra(inf: Infra, p: PlayerState): boolean {
  if (canUpgradeInfra(inf, p)) return false;
  p.credits -= WAYSTATION_CREDITS; removeCargo(p, "parts", WAYSTATION_PARTS);
  inf.upgraded = true; inf.health = 100;
  return true;
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
      if (inf.kind === "beacon") { const c = Math.round(traffic * (inf.upgraded ? 2.5 : 1.5) * (elapsed / 60) * (isOccasion("lantern") ? 2 : 1)); inf.till += c; inf.earned += c; }
      // a lit lane is a watched lane: piracy eases while the light is on
      { const sys2 = w.systems[inf.systemId]; if (sys2) sys2.pirateActivity = Math.max(0.05, sys2.pirateActivity - 0.004 * (elapsed / 60) * (inf.upgraded ? 2 : 1)); }
      if (inf.upgraded) { const bar = Math.round(traffic * 0.8 * (elapsed / 60)); inf.till += bar; inf.earned += bar; } // the bar takes money too
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
  const c = Math.round(inf.till); inf.till = 0; p.credits += c; p.infraEarned = (p.infraEarned ?? 0) + c; ledger(p, "tolls", c); return c;
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
export interface Alumnus { name: string; role: CrewRole | "captain"; docks: number; stationId: string; t: number }
export interface Captain { name: string; from: number; to: number; stationId: string; credits: number; deeds: number }

// ---------- The ledger: where the money comes from and goes ----------
export const LEDGER_LABELS: Record<string, string> = {
  trade: "TRADE SALES", buys: "TRADE PURCHASES", fares: "FARES AND TIPS", contracts: "CONTRACTS", rescues: "RESCUES AND SALVAGE", races: "THE RING RACE",
  tolls: "TOLLS AND THE TILL", charters: "CHARTER HAULERS", stakes: "STAKES AND DIVIDENDS", letters: "LETTERS AND GIFTS", crew: "CREW WAGES AND BONUSES", yard: "YARD, FUEL AND OUTFITTING",
  settlements: "SETTLEMENTS", other: "EVERYTHING ELSE",
};
export function ledger(p: PlayerState, source: string, delta: number): void {
  if (!delta) return;
  (p.ledger ??= {})[source] = Math.round(((p.ledger ?? {})[source] ?? 0) + delta);
}
// Attribute whatever a block of code did to the credits
export function ledgerAround<T>(p: PlayerState, source: string, fn: () => T): T {
  const before = p.credits;
  const r = fn();
  ledger(p, source, p.credits - before);
  return r;
}

// ---------- Crew learn by doing ----------
// A specialty aboard counts when its holder is fit for duty
export function hasSpecialty(p: PlayerState, id: string): boolean {
  return (p.crew ?? []).some((c) => c.specialty === id && !c.sick && c.morale >= 30);
}
export function chooseSpecialty(w: World, c: CrewMember, id: string): string | null {
  const def = SPECIALTIES[c.role].find((x) => x.id === id);
  if (!def || c.skill < 3 || c.specialty) return null;
  c.specialty = id; c.morale = Math.min(100, c.morale + 10); c.loyalty = (c.loyalty ?? 0) + 1;
  logEntry(w, `${c.name} took a trade of their own: ${def.name.toLowerCase()}`);
  return `${c.name.toUpperCase()}, ${def.name}. ${def.desc.toUpperCase()}`;
}
// A repair, a kill, a jump, a patient: each is a mark toward the next skill.
export const XP_STEPS = [0, 12, 34];
export function crewXp(p: PlayerState, role: CrewRole, n = 1): string | null {
  let line: string | null = null;
  for (const c of p.crew) {
    if (c.role !== role || c.sick) continue;
    c.xp = (c.xp ?? 0) + n;
    if (c.skill < 3 && c.xp >= XP_STEPS[c.skill]) {
      c.skill++; c.xp = 0; c.wage += ROLE_INFO[role].baseWage; c.morale = Math.min(100, c.morale + 10);
      for (const o of p.crew) if (o !== c && !o.sick) o.morale = Math.min(100, o.morale + 2);
      line = `${c.name.toUpperCase()} HAS GOT BETTER AT THIS. ${ROLE_INFO[role].label} SKILL ${c.skill}, WAGE ${c.wage}CR.${p.crew.length > 1 ? " THE CREW STAND THEM A DRINK." : ""}`;
    }
  }
  return line;
}

// ---------- Crew get on, or don't ----------
// Every dock, one pair drifts: toward each other on a good ship, apart on a bad one.
export function bond(a: CrewMember, b: CrewMember): number { return a.bonds?.[b.name] ?? 0; }
export function bondLabel(v: number): string { return v >= 2 ? "FRIENDS" : v <= -2 ? "FEUDING" : v > 0 ? "WARM" : v < 0 ? "COOL" : ""; }
export function shiftBond(a: CrewMember, b: CrewMember, d: number): void {
  (a.bonds ??= {})[b.name] = Math.max(-3, Math.min(3, (a.bonds[b.name] ?? 0) + d));
  (b.bonds ??= {})[a.name] = Math.max(-3, Math.min(3, (b.bonds[a.name] ?? 0) + d));
}
export function tickBonds(p: PlayerState, rng: RNG): string[] {
  const out: string[] = [];
  const crew = p.crew;
  if (crew.length < 2) return out;
  const a = rng.pick(crew); const b = rng.pick(crew.filter((c) => c !== a));
  const good = (a.morale + b.morale) / 2 >= 55 || !!p.cat || (p.furnishings ?? []).includes("jukebox");
  const before = bond(a, b);
  shiftBond(a, b, rng.chance(good ? 0.7 : 0.35) ? 1 : -1);
  const after = bond(a, b);
  if (before < 2 && after >= 2) out.push(`${a.name.toUpperCase()} AND ${b.name.toUpperCase()} ARE FAST FRIENDS NOW. MORALE UP FOR BOTH.`);
  if (before > -2 && after <= -2) out.push(`${a.name.toUpperCase()} AND ${b.name.toUpperCase()} AREN'T SPEAKING. SOMEBODY SHOULD DO SOMETHING.`);
  // standing effects
  for (const c of crew) for (const o of crew) {
    if (c === o) continue;
    const v = bond(c, o);
    if (v >= 2) c.morale = Math.min(100, c.morale + 1);
    else if (v <= -2) c.morale = Math.max(0, c.morale - 2);
  }
  return out;
}
export function feuds(p: PlayerState): [CrewMember, CrewMember][] {
  const out: [CrewMember, CrewMember][] = [];
  for (let i = 0; i < p.crew.length; i++) for (let j = i + 1; j < p.crew.length; j++) if (bond(p.crew[i], p.crew[j]) <= -2) out.push([p.crew[i], p.crew[j]]);
  return out;
}

// ---------- The chronicle: a captain's career as text ----------
// The supplemental log: the leg's tally, written in the captain's voice at the next clamp.
export interface LegLog { jumps: number; fights: number; cards: number; alerts: number; burns: number; rescues0: number; t0: number }
export function newLeg(p: PlayerState, t: number): LegLog { return (p.leg = { jumps: 0, fights: 0, cards: 0, alerts: 0, burns: 0, rescues0: p.rescues ?? 0, t0: t }); }
export function noteLeg(p: PlayerState, key: "jumps" | "fights" | "cards" | "alerts" | "burns", t = 0): void { (p.leg ??= newLeg(p, t))[key]++; }
export function legSummary(w: World): string | null {
  const p = w.player; const l = p.leg; if (!l) return null;
  const rescues = (p.rescues ?? 0) - l.rescues0;
  if (!l.jumps && !l.fights && !l.cards && !l.alerts && !l.burns && !rescues) return null;
  const parts: string[] = [];
  if (l.jumps) parts.push(`${l.jumps} jump${l.jumps > 1 ? "s" : ""}`);
  if (l.fights) parts.push(l.fights > 3 ? "fire taken, more than once" : "fire taken");
  if (l.alerts) parts.push(`red alert x${l.alerts}`);
  if (l.burns) parts.push("a hard burn");
  if (l.cards) parts.push(`${l.cards} card${l.cards > 1 ? "s" : ""} on the lane`);
  if (rescues) parts.push(`${rescues} rescue${rescues > 1 ? "s" : ""}`);
  const hours = Math.max(0, (w.time - l.t0) / 3600);
  const mood = p.crew.length ? Math.round(p.crew.reduce((a, c) => a + c.morale, 0) / p.crew.length) : 0;
  const close = !p.crew.length ? "Alone, and fine with it." : mood >= 70 ? "Crew in good heart." : mood >= 45 ? "Crew tired, and say so." : "Crew worn thin; a meal and a port would help.";
  const fo = firstOfficer(p); if (fo && l.jumps >= 2) parts.push(`${fo.name.split(" ")[0]} had the conn for part of it`);
  const head = `Supplemental, stardate ${stardate(w)}, ${hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(hours * 60)}m`} since the clamp: ${parts.join(", ")}.`;
  return (head + " " + close).length <= 118 ? head + " " + close : head.slice(0, 118);
}
// Strange readings: the phenomena among the anomalies. Each does something when you reach it.
// The office: every fold, echo and loop gets a letter from a department nobody has met, asking for a form.
export function officeWrites(w: World, what: string): void {
  const p = w.player; const n = (p.officeLetters ?? 0) + 1; p.officeLetters = n;
  const form = `${27 + n}-${"BCDEFGH"[n % 7]}`;
  const text = n === 1 ? `Re: ${what}. This office notes the incident. Please complete the enclosed form ${form} (three copies) describing what you did, what you did not do, and whether you would do it again. Do not discuss the incident with yourself.`
    : n === 2 ? `Re: ${what}. Second incident. The office reminds you that form ${form} supersedes the previous form, which you did not return. We are aware of the irony. Please do not point it out.`
    : `Re: ${what}. The office has opened a file with your registry on the cover. It is the thickest file we have. Form ${form} enclosed. A representative will not be visiting. That is not a threat. It is a budget.`;
  (w.mailQueue ??= []).push({ dueT: w.time + 500 + n * 100, from: "the office of anomalous incidents", text, gift: n === 3 ? { data: 30 } : undefined });
  (p.codex ??= {})["contact:THE OFFICE OF ANOMALOUS INCIDENTS"] = n;
  if (n === 3) (p.flags ??= {}).office = true;
}
export function strangeReading(w: World, an: AnomalyDef, rng: RNG): string | null {
  const p = w.player;
  if (an.kind === "fold" || an.kind === "echo") officeWrites(w, `${an.name}, ${w.systems[p.systemId]?.name ?? "somewhere"}`);
  const sci = hasSpecialty(p, "science") ? 1.5 : 1;
  const gain = (n: number) => { p.expData = (p.expData ?? 0) + Math.round(n * sci); };
  if (an.kind === "fold") { w.time += 900; gain(60); (p.codex ??= {})["signal:A FOLD IN THE LANE"] = ((p.codex ?? {})["signal:A FOLD IN THE LANE"] ?? 0) + 1; logEntry(w, `${an.name}: a fold in the lane; the clock jumped fifteen minutes nobody remembers`); return `${an.name.toUpperCase()}: THE STARS BEND, THE CLOCK JUMPS FIFTEEN MINUTES, AND NOBODY ABOARD REMEMBERS THEM. +60 DATA. THE CODEX HAS A SIGNAL.`; }
  if (an.kind === "lens") { let n = 0; for (const o of w.systems[p.systemId].anomalies) if (!o.discovered) { o.discovered = true; n++; } gain(40); logEntry(w, `${an.name}: a gravity lens; the whole system lit up on the scanner`); return `${an.name.toUpperCase()}: A LENS OF BENT LIGHT. FOR A MOMENT THE SCANNER SEES THE WHOLE SYSTEM${n ? `: ${n} MORE SIGNAL${n > 1 ? "S" : ""} ON THE CHART` : ""}. +40 DATA.`; }
  if (an.kind === "echo") { const e = (p.log ?? []).length ? rng.pick(p.log!) : null; gain(50); for (const c of p.crew) c.morale = Math.min(100, c.morale + 3); logEntry(w, `${an.name}: an echo that played the ship's own band back`); return `${an.name.toUpperCase()}: THE BAND PLAYS BACK SOMETHING THIS SHIP SAID ONCE${e ? `: "${e.text.toUpperCase().slice(0, 60)}"` : ""}. THE CREW GO QUIET, THEN LAUGH. +50 DATA, MORALE UP.`; }
  return null;
}
// Parley: the odds a corsair buys a bluff or takes a way out. A gunner helps, a rank helps, a reputation helps most.
export function parleyChance(p: PlayerState): number {
  let c = 0.35;
  if (p.crew.some((x) => x.role === "gunner" && !x.sick)) c += 0.2;
  const rk = commandRank(p); if (rk === "COMMANDER" || rk === "CAPTAIN" || rk === "COMMODORE" || rk === "ADMIRAL") c += 0.15;
  if (p.kills >= 25) c += 0.2;
  return Math.min(0.9, c);
}
// Command rank, by deeds on the wall: the lanes' own ladder, nothing to do with any navy. And a registry
// for the hull, so control has something to read out.
export const COMMAND_RANKS: [number, string][] = [[0, "SKIPPER"], [10, "LIEUTENANT"], [25, "COMMANDER"], [45, "CAPTAIN"], [70, "COMMODORE"], [100, "ADMIRAL"]];
export function commandRank(p: PlayerState): string {
  const n = (p.achievements ?? []).length; let r = "SKIPPER";
  for (const [at, name] of COMMAND_RANKS) if (n >= at) r = name;
  return r;
}
export const MOTTOS = [
  "Bring them home.", "Further out, and back.", "No hand left on the hull.", "The hum is the promise.", "Every light we leave stays lit.",
  "Slow is smooth.", "Ask the belt.", "Not all who drift are lost.", "We answer hails.", "First to the wreck, last to leave it.",
  "A ship is a place.", "Doors open both ways.", "Somebody has to.", "Steady as she hums.", "Water, air, and each other.",
];
// The dedication plaque by the airlock: name, registry, when, and the motto.
export function dedication(w: World): string {
  const p = w.player; const name = (p.shipName ?? hull(p.hullId).name).toUpperCase();
  return `${name} - ${registry(w)} - COMMISSIONED SD ${(41000 + (p.commissionedAt ?? 0) / 360).toFixed(1)}${p.motto ? ` - "${p.motto.toUpperCase()}"` : ""}`;
}
// What the crew call a system: the engineer's name for it if there is one, else the yard's.
export function systemLabel(p: PlayerState, s: ShipSystem): string { const n = (p.systemNicks ?? {})[s.id]; return n ? `${n.toUpperCase()} (${s.name.toUpperCase()})` : s.name.toUpperCase(); }
export const SYSTEM_NICKS: Record<string, string[]> = {
  reactor: ["Doris", "The Old Girl", "Big Red", "Mother"], engines: ["The Twins", "Bess", "Thunder", "The Mules"], shields: ["The Umbrella", "Nan", "Wall"],
  weapons: ["The Argument", "Persuasion", "Left and Right"], sensors: ["The Nose", "Owl", "Gladys"], comms: ["The Gossip", "Parrot", "Mouth"],
  life: ["Lungs", "The Garden", "Breath"], cargo: ["The Belly", "Hold Your Horses", "Pockets"],
};
export function registry(w: World): string { return `FS-${1000 + hashStr(`reg:${w.seed}:${w.player.hullId}:${w.player.shipName ?? ""}`) % 9000}`; }
// A stardate for the log: hours under way, to a tenth, on a base that looks the part.
export function stardate(w: World): string { return (41000 + w.time / 360).toFixed(1); }
// Number One: the longest-serving crew member, once there are two aboard and they have three dockings.
export function firstOfficer(p: PlayerState): CrewMember | null {
  if (p.crew.length < 2) return null;
  if (p.numberOne) { const chosen = p.crew.find((c) => c.name === p.numberOne); if (chosen) return chosen; }
  const c = [...p.crew].sort((a, b) => (b.docks ?? 0) - (a.docks ?? 0) || b.skill - a.skill)[0];
  return c && (c.docks ?? 0) >= 3 ? c : null;
}
export function chronicleText(w: World, callsign: string | null): string {
  const p = w.player;
  const h = Math.floor(w.time / 3600), m = Math.floor((w.time % 3600) / 60);
  const name = (p.captainName ?? callsign ?? "The Captain");
  const lines: string[] = [];
  lines.push(`FARSPACE CHRONICLE - ${(p.shipName ?? hull(p.hullId).name).toUpperCase()}`);
  lines.push(`Captain's log, stardate ${stardate(w)}. ${registry(w)}, ${commandRank(p).toLowerCase()} commanding.${firstOfficer(p) ? ` First officer: ${firstOfficer(p)!.name}.` : ""}`);
  const nick = captainNickname(w);
  lines.push(`Captain: ${name}${nick ? `, called ${nick.toLowerCase()} on the lanes` : ""}. ${h}h ${m}m under way. ${p.credits} credits. ${w.realGalaxy ? "The real stars." : "An uncharted galaxy."}${p.homePort ? ` Home port: ${findStation(w, p.homePort)?.st.name ?? "?"}.` : ""}`);
  lines.push("");
  lines.push(`Ranks: explorer ${rankOf(p, "explorer").title}, trader ${rankOf(p, "trader").title}, miner ${rankOf(p, "miner").title}, rescuer ${rankOf(p, "rescuer").title}.`);
  lines.push(`Rescues ${p.rescues ?? 0}, repairs ${p.repairs ?? 0}, tows ${p.tows ?? 0}, lives ${p.lives ?? 0}, fares ${p.fares ?? 0}, first discoveries ${Object.values(p.firsts ?? {}).filter(Boolean).length}, postcards ${p.postcards ?? 0}.`);
  if (p.lineage?.length) { lines.push(""); lines.push("Captains before:"); for (const c of p.lineage) lines.push(`  ${c.name}, retired at ${findStation(w, c.stationId)?.st.name ?? "a station"} with ${c.credits} credits and ${c.deeds} deeds.`); }
  {
    // this week on the lanes: the strategy layer, as prose
    const wk = weekKey();
    const votes = Object.entries(p.votes ?? {}).filter(([k]) => k.startsWith(wk + ":")).map(([k, v]) => `${facName(k.split(":")[1])}: ${v}`);
    const bs = borderStanding(w);
    const parts: string[] = [];
    if (votes.length) parts.push(`Voted this week: ${votes.join("; ")}.`);
    if (bs) parts.push(`The border: ${w.systems[bs.c.systemId]?.name ?? "?"} is contested, ${facName(bs.c.incumbent)} ${bs.inc} to ${facName(bs.c.challenger)} ${bs.chal}${bs.yoursInc || bs.yoursChal ? ` (your push: ${bs.yoursInc ? `+${bs.yoursInc} to hold` : ""}${bs.yoursInc && bs.yoursChal ? ", " : ""}${bs.yoursChal ? `+${bs.yoursChal} to flip` : ""})` : ""}.`);
    for (const b of (w.borderLog ?? []).slice(-3)) parts.push(`Week of ${b.week}: ${w.systems[b.systemId]?.name ?? "?"} ${b.flipped ? `fell to the ${facName(b.to)}` : `held for the ${facName(b.from)}`}${b.yours ? ` with your push of ${b.yours}` : ""}.`);
    const holdings = Object.entries(p.stakes ?? {}).map(([id, n]) => `${findStation(w, id)?.st.name ?? "?"} ${n}`);
    if (holdings.length) parts.push(`Holdings: ${holdings.join(", ")}.`);
    if ((p.keepsakes ?? []).length) parts.push(`Kept aboard: ${(p.keepsakes ?? []).slice(-3).join("; ")}.`);
    if (p.motto) parts.push(`The plaque by the airlock reads "${p.motto}".`);
    if (p.commissionedAt !== undefined) parts.push(`Commissioned stardate ${(41000 + p.commissionedAt / 360).toFixed(1)}, ${Math.floor((w.time - p.commissionedAt) / 3600)} hours under way since.`);
    if ((p.mealsCooked ?? 0) > 0) parts.push(`${p.mealsCooked} meals cooked in the galley.`);
    const bests = Object.entries(p.raceBest ?? {}).slice(0, 4).map(([id, t]) => `${findStation(w, id)?.st.name ?? "?"} ${t.toFixed(1)}s`);
    if (bests.length) parts.push(`Ring times: ${bests.join(", ")}${p.regatta === 3 ? "; regatta champion" : p.regatta !== undefined ? `; regatta ${p.regatta}/3` : ""}.`);
    if ((p.postRuns ?? 0) || (p.convoys ?? 0) || (p.races ?? 0)) parts.push(`${p.postRuns ?? 0} mail bags, ${p.convoys ?? 0} convoys walked, ${p.races ?? 0} races run.`);
    if (parts.length) { lines.push(""); lines.push("The week:"); for (const x of parts) lines.push(`  ${x}`); }
  }
  { const fo = firstOfficer(p); if (fo) { const kills = p.kills ?? 0, rescues = p.rescues ?? 0; const mood = Math.round(p.crew.reduce((a, c) => a + c.morale, 0) / Math.max(1, p.crew.length));
    const verdict = rescues > kills * 2 ? "pulls people out of the black more than they put them in it, and the crew fly like they know it" : kills > rescues * 2 ? "fights more than I'd like and wins more than I'd expect; the crew have stopped flinching, which worries me more than the fighting" : "keeps the ship between the lanes and the wrecks, which is where a ship should be";
    const crewLine = mood >= 70 ? "The crew would follow them through a gate with the lights off." : mood >= 45 ? "The crew are tired and say so, which is healthy." : "The crew are worn thin. I've said so. I'll say so again.";
    const you = (p.inquiries ?? 0) ? ` We've buried ${p.inquiries === 1 ? "one" : String(p.inquiries)} and stood before the board for ${p.inquiries === 1 ? "them" : "each"}; the captain told it straight.` : "";
    const more = `${p.flags?.numberoneleg ? " They've given me the ship for a leg, which is trust, or tiredness, and I'll take either." : ""}${p.flags?.sameleave ? " They let two of ours take the same leave without a speech. Crews notice what a captain doesn't say." : ""}${p.crew.some((c) => (c.docks ?? 0) === 0) ? " There's a cadet aboard. I've told them the captain doesn't bite. I've told the captain the same." : ""}`;
    lines.push(""); lines.push(`Number One's note, ${fo.name}:`); lines.push(`  The captain ${verdict}. ${crewLine}${you}${more}`); } }
  if (p.voiceName || p.flags?.shipCrew) { const name = shipVoiceName(p); const wear = Math.round(p.wear ?? 0);
    const body = `${wear > 70 ? "I ache, and I'd like that written down somewhere the yard will read it." : wear > 35 ? "I'm holding. Ask me after the next long burn." : "I feel new, which at my age is a compliment to somebody."} ${(p.hailsAnswered ?? 0) >= 3 ? "The lanes know my name now, because the captain answers hails." : "I'd like the captain to answer more hails. I like hearing my name on the band."} ${(p.lost ?? []).length ? `I remember ${p.lost![p.lost!.length - 1].name}. I keep the bunk warm. Nobody asked me to.` : p.crew.length >= 2 ? "The crew sing in the galley. I've stopped pretending I don't listen." : "It's quiet aboard. I don't mind quiet. I'd mind it more if it stayed."} ${p.motto ? `The plaque says '${p.motto}'. I'm trying.` : "There's a blank line on the plaque by the airlock. I have suggestions."}`;
    lines.push(""); lines.push(`${name}, in its own words:`); lines.push(`  ${body}`); }
  { const med = p.crew.find((c) => c.role === "medic"); if (med) { const sick = p.crew.filter((c) => c.sick).length; const lives = p.lives ?? 0; const couns = med.specialty === "counsellor";
    const body = `${sick ? `${sick} on the cots this week, which is ${sick > 1 ? "too many" : "one too many"} for a hull this size.` : "Nobody on the cots, which I'd like noted before somebody spoils it."} ${lives >= 20 ? `${lives} lives on the ship's count. I signed for most of them. I'd sign again.` : lives ? `${lives} ${lives === 1 ? "life" : "lives"} on the ship's count. It adds up. It's meant to.` : "No lives on the count yet. The count is there for a reason. Fly toward it."} ${(p.patients ?? 0) ? `${p.patients} patient${p.patients === 1 ? "" : "s"} landed at the clinic in time.` : ""}${couns ? " The captain took the hour, or didn't. I've written down which." : " The captain doesn't sleep enough. I've written that down too."}`;
    lines.push(""); lines.push(`Sickbay, ${med.name}:`); lines.push(`  ${body.trim()}`); } }
  if ((p.log ?? []).length) { lines.push(""); lines.push("Captain's log, last entries:"); for (const e of (p.log ?? []).slice(-5).reverse()) lines.push(`  ${e.text}`); }
  if ((p.guestbook ?? []).length) { lines.push(""); lines.push("Guestbook, last signatures:"); for (const e of (p.guestbook ?? []).slice(-5).reverse()) lines.push(`  ${e.name} (${e.kind}), ${e.from} to ${e.to}: "${e.line}"`); }
  if (p.crew.length) { lines.push(""); lines.push("Crew aboard:"); for (const c of p.crew) lines.push(`  ${c.name}, ${ROLE_INFO[c.role].label.toLowerCase()}${c.specialty ? ` (${(SPECIALTIES[c.role].find((x) => x.id === c.specialty)?.name ?? c.specialty).toLowerCase()})` : ""}, skill ${c.skill}, ${c.docks ?? 0} dockings${c.trait ? `, ${c.trait}` : ""}.`); }
  if (p.alumni?.length) { lines.push(""); lines.push("Served and went home:"); for (const a of p.alumni) lines.push(`  ${a.name}, ${a.role}, ${a.docks} dockings, at ${findStation(w, a.stationId)?.st.name ?? "a station"}.`); }
  if (p.cat) { lines.push(""); lines.push(`Ship's cat: ${p.cat.name}.`); }
  if (w.infra?.length) { lines.push(""); lines.push("Structures:"); for (const i of w.infra) lines.push(`  ${i.kind} in ${w.systems[i.systemId]?.name ?? "?"}, ${i.health}%, ${i.earned} credits earned.`); }
  if (p.achievements?.length) { lines.push(""); lines.push(`Achievements (${p.achievements.length}): ${p.achievements.join(", ")}.`); }
  if (p.log?.length) { lines.push(""); lines.push("Captain's log:"); for (const l of p.log) { const lh = Math.floor(l.t / 3600), lm = Math.floor((l.t % 3600) / 60); lines.push(`  [${lh}h${String(lm).padStart(2, "0")}] ${l.text}`); } }
  return lines.join("\n");
}

// ---------- Resting at a dock ----------
// Ten minutes of ship time pass in a moment: markets breathe, tills fill, the sick mend.
export function restAtDock(w: World, seconds = 600): string[] {
  const out: string[] = [];
  for (let i = 0; i < seconds; i += 10) { w.time += 10; tickWorld(w, 10); }
  const p = w.player;
  for (const c of p.crew) c.morale = Math.min(100, c.morale + 3);
  p.oxygen = p.oxygenMax; p.shield = p.shieldMax;
  if (w.infraNews?.length) { out.push(...w.infraNews); w.infraNews = []; }
  return out;
}

// ---------- Charters: a hauler runs your route while you fly ----------
// You know a good run; a hauler with a crew of three runs it for a cut. Prices
// move with every trip, corsairs take their share, and the till pays out when
// you next dock anywhere.
export interface Charter { id: string; name: string; from: string; to: string; commodityId: string; qty: number; tripSecs: number; lastT: number; trips: number; earned: number; till: number; health: number; raided: number; hullId?: string; own?: boolean; shipName?: string }
export const OWN_HULL_CREW_FEE = 600;
export const CHARTER_PRICE = 3000;
export const CHARTER_CAP = 3;
export const CHARTER_CUT = 0.6; // your share of each trip's margin
const HAULER_NAMES = ["Margit", "Okonkwo", "Blue-4", "Steady Hand II", "Long Patience", "Ferrous Dawn", "Quiet Ledger", "Salt and Iron"];
export function charterName(rng: RNG): string { return `Hauler ${rng.pick(HAULER_NAMES)}`; }
export function charterRoute(w: World, fromId: string, toId: string): { hops: number; piracy: number } {
  const from = findStation(w, fromId), to = findStation(w, toId);
  if (!from || !to) return { hops: 1, piracy: 0.3 };
  const route = navRoute(w, from.sys.id, to.sys.id);
  const ids = route ?? [from.sys.id, to.sys.id];
  const piracy = ids.reduce((a, id) => Math.max(a, w.systems[id]?.pirateActivity ?? 0), 0);
  return { hops: Math.max(1, ids.length - 1), piracy };
}
export function hireCharter(w: World, fromId: string, toId: string, commodityId: string, rng: RNG): Charter | string {
  const p = w.player;
  if ((p.haulers ?? []).length >= CHARTER_CAP) return `THREE CHARTERS IS ALL YOUR LEDGER WILL BEAR`;
  if (p.credits < CHARTER_PRICE) return `A CHARTER COSTS ${CHARTER_PRICE}CR UP FRONT`;
  if (fromId === toId) return "A ROUTE NEEDS TWO ENDS";
  p.credits -= CHARTER_PRICE;
  const { hops } = charterRoute(w, fromId, toId);
  const c: Charter = { id: `ch-${Math.floor(w.time)}-${rng.int(0, 9999)}`, name: charterName(rng), from: fromId, to: toId, commodityId, qty: 10, tripSecs: 180 + hops * 120, lastT: w.time, trips: 0, earned: 0, till: 0, health: 100, raided: 0 };
  (p.haulers ??= []).push(c);
  return c;
}
// Put one of your own parked hulls to work on a run: a crew's fee instead of a charter price,
// a hold sized to the hull, and the ship comes back to you when you release it.
export function crewOwnHull(w: World, ship: StoredShip, fromId: string, toId: string, commodityId: string, rng: RNG): Charter | string {
  const p = w.player;
  if ((p.haulers ?? []).length >= CHARTER_CAP) return `THREE CHARTERS IS ALL YOUR LEDGER WILL BEAR`;
  if (p.credits < OWN_HULL_CREW_FEE) return `A CREW FOR HER COSTS ${OWN_HULL_CREW_FEE}CR UP FRONT`;
  if (fromId === toId) return "A ROUTE NEEDS TWO ENDS";
  if (!(p.fleet ?? []).includes(ship)) return "THAT HULL ISN'T HERE";
  p.credits -= OWN_HULL_CREW_FEE; ledger(p, "charters", -OWN_HULL_CREW_FEE);
  p.fleet = (p.fleet ?? []).filter((f) => f !== ship);
  const h = hull(ship.hullId);
  const { hops } = charterRoute(w, fromId, toId);
  const c: Charter = { id: `own-${Math.floor(w.time)}-${rng.int(0, 9999)}`, name: ship.name ?? h.name, from: fromId, to: toId, commodityId, qty: Math.max(6, Math.min(24, Math.round(h.cargoMax / 3))), tripSecs: 180 + hops * 120, lastT: w.time, trips: 0, earned: 0, till: 0, health: Math.max(40, Math.round(100 * ship.hull / h.hullMax)), raided: 0, hullId: ship.hullId, own: true, shipName: ship.name };
  (p.haulers ??= []).push(c);
  return c;
}
// A trip: buy at one end at today's price, sell at the other, move the stock both ways, take the cut.
export function runCharterTrip(w: World, c: Charter, rng: RNG): string | null {
  const from = findStation(w, c.from), to = findStation(w, c.to);
  if (!from || !to) return null;
  const { piracy } = charterRoute(w, c.from, c.to);
  c.trips++;
  if (rng.chance(0.04 + piracy * 0.25)) {
    c.raided++; c.health = Math.max(0, c.health - rng.int(15, 35));
    pushEvent(w, { t: w.time, kind: "raid", systemId: from.sys.id, text: `Corsairs hit the ${c.name} on the ${from.st.name}-${to.st.name} run` });
    if (c.health <= 0) { w.player.haulers = (w.player.haulers ?? []).filter((x) => x !== c); return `${c.name.toUpperCase()} IS A WRECK ON THE ${from.st.name.toUpperCase()} RUN. THE CREW GOT OFF. THE CHARTER IS OVER.`; }
    return `${c.name.toUpperCase()} WAS HIT ON THE ${from.st.name.toUpperCase()} RUN: CARGO LOST, HULL AT ${c.health}%`;
  }
  const qty = Math.min(c.qty, from.st.stock[c.commodityId] ?? 0);
  if (qty <= 0) return null; // nothing to carry this trip; the hauler waits
  { const r = rivalOf(w); if (r && rng.chance(0.12)) return `${r.name.toUpperCase()} UNDERCUT THE ${from.st.name.toUpperCase()} RUN THIS TRIP. ${c.name.toUpperCase()} CAME BACK EMPTY.`; }
  const buy = stationPrice(from.st, c.commodityId), sell = stationPrice(to.st, c.commodityId);
  from.st.stock[c.commodityId] = (from.st.stock[c.commodityId] ?? 0) - qty; refreshPrices(from.st);
  to.st.stock[c.commodityId] = (to.st.stock[c.commodityId] ?? 0) + qty; refreshPrices(to.st);
  const margin = Math.round((sell - buy) * qty * CHARTER_CUT);
  const repair = c.health < 100 ? Math.min(Math.max(0, margin), (100 - c.health) * 4) : 0;
  c.health = Math.min(100, c.health + Math.floor(repair / 4));
  const net = margin - repair;
  c.till += net; c.earned += net;
  return null;
}
export function tickCharters(w: World, rng: RNG): string[] {
  const out: string[] = [];
  for (const c of [...(w.player.haulers ?? [])]) {
    while (w.time - c.lastT >= c.tripSecs) { c.lastT += c.tripSecs; const line = runCharterTrip(w, c, rng); if (line) out.push(line); if (!(w.player.haulers ?? []).includes(c)) break; }
  }
  return out;
}
export function collectCharters(p: PlayerState): { total: number; lines: string[] } {
  let total = 0; const lines: string[] = [];
  for (const c of p.haulers ?? []) {
    if (c.till === 0) continue;
    const n = Math.round(c.till); c.till = 0; total += n; p.credits += n; ledger(p, "charters", n);
    lines.push(`${c.name.toUpperCase()}: ${n >= 0 ? "+" : ""}${n}CR FROM THE ${c.trips} TRIP${c.trips === 1 ? "" : "S"} SO FAR`);
  }
  return { total, lines };
}
export function releaseCharter(p: PlayerState, c: Charter): void {
  p.haulers = (p.haulers ?? []).filter((x) => x !== c);
  if (c.own && c.hullId) { const h = hull(c.hullId); (p.fleet ??= []).push({ hullId: c.hullId, stationId: c.from, name: c.shipName, hull: Math.round(h.hullMax * Math.max(0.3, c.health / 100)), torpedoes: 0 }); }
}

// ---------- Furnishings: a deck you'd want to live on ----------
export const FURNISHINGS: { id: string; name: string; price: number; desc: string; tile: string }[] = [
  { id: "plant", name: "A Plant", price: 150, desc: "Something green by the bunks. Crew morale up a little every dock.", tile: "B" },
  { id: "rug", name: "A Rug", price: 200, desc: "In the bunk room. Passengers settle in better.", tile: "p" },
  { id: "jukebox", name: "A Jukebox", price: 400, desc: "In the galley. The crew argue about the music, happily.", tile: "K" },
  { id: "viewport", name: "A Viewport", price: 600, desc: "A real window on the bridge. Passengers and crew both look out of it.", tile: "C" },
  { id: "shelf", name: "A Trophy Shelf", price: 300, desc: "By the wall of record, for the things you've brought back.", tile: "M" },
  { id: "hammock", name: "A Hammock", price: 180, desc: "Slung in the hold. Somebody is always in it.", tile: "G" },
  { id: "mural", name: "A Mural", price: 350, desc: "The crew paint the corridor with everywhere the ship has been.", tile: "E" },
  { id: "chair", name: "A Captain's Chair", price: 500, desc: "On the bridge, bolted down. The crew stand a little straighter; morale +1 more every dock.", tile: "C" },
  { id: "simrig", name: "A Sim Rig", price: 700, desc: "An environment rig by the study. An hour somewhere else, once a leg. It jams sometimes.", tile: "S" },
];

// The sim rig: an hour somewhere else. Each program has its own way of going right, and its own way of going wrong.
export type SimProgram = "beach" | "frontier" | "opera" | "home" | "unwinnable" | "pictures" | "cats";
export const SIM_PROGRAMS: { id: SimProgram; name: string; blurb: string }[] = [
  { id: "beach", name: "THE BEACH", blurb: "Sand, a sea that isn't wet, and a sun that doesn't burn" },
  { id: "frontier", name: "FRONTIER TOWN", blurb: "Dust, a saloon, and a duel at noon that nobody wins" },
  { id: "opera", name: "THE OPERA HOUSE", blurb: "Velvet seats and a soprano; the fares are invited" },
  { id: "home", name: "HOME PORT, SPRING", blurb: "The promenade of wherever you call home, on a good day" },
  { id: "unwinnable", name: "THE UNWINNABLE", blurb: "A training scenario nobody has passed. That's the point. Probably." },
  { id: "pictures", name: "THE PICTURES", blurb: "An old film, the whole crew, the same jokes at the same lines" },
  { id: "cats", name: "THE BRIDGE, BUT EVERYONE IS A CAT", blurb: "A program the engineer wrote at three in the morning. Nobody has deleted it." },
];
export function runSim(w: World, program: SimProgram, rng: RNG): string {
  const p = w.player; p.simUsed = true;
  const all = (n: number) => { for (const c of p.crew) c.morale = Math.min(100, c.morale + n); };
  logEntry(w, `An hour in the sim rig: ${SIM_PROGRAMS.find((x) => x.id === program)?.name.toLowerCase() ?? program}`);
  if (program === "cats") { all(7); (p.flags ??= {}).simCats = true; return rng.pick([`THE BRIDGE, BUT EVERYONE IS A CAT. THE GUNNER-CAT SITS ON THE TACTICAL CONSOLE AND REFUSES TO FIRE. THE PILOT-CAT KNOCKS THE COURSE OFF THE TABLE. ${p.cat ? `${p.cat.name.toUpperCase()}, WHO IS ALREADY A CAT, IS THE CAPTAIN, AND IS BETTER AT IT. ` : ""}MORALE UP. NOBODY DELETES THE PROGRAM.`, "AN HOUR AS CATS. THE ENGINEER-CAT FIXES NOTHING AND IS PRAISED FOR IT. THE MEDIC-CAT SLEEPS IN THE SUN THAT ISN'T THERE. THE CREW COME OUT STRETCHING. MORALE UP."]); }
  if (program === "beach") { all(6); return rng.pick([`AN HOUR ON THE BEACH. ${p.cat ? `${p.cat.name.toUpperCase()} HUNTS A CRAB THAT ISN'T THERE. ` : ""}EVERYBODY COMES OUT SQUINTING. MORALE UP.`, "AN HOUR ON THE BEACH. THE RIG ADDED A HORSE. NOBODY ASKED FOR THE HORSE. THE HORSE STAYS. MORALE UP."]); }
  if (program === "frontier") { all(5); const g = p.crew.find((c) => c.role === "gunner"); if (g) g.morale = Math.min(100, g.morale + 4); return rng.pick(["HIGH NOON IN FRONTIER TOWN. YOU LOSE THE DUEL TO THE PIANO PLAYER. TWICE. THE CREW WILL NOT LET THIS GO. MORALE UP.", `FRONTIER TOWN. ${g ? g.name.toUpperCase() + " WINS THE DUEL AND KEEPS THE HAT." : "THE SHERIFF'S HAT COMES OUT OF THE RIG SOMEHOW."} MORALE UP.`]); }
  if (program === "opera") { all(4); for (const m of passengersAboard(p)) m.mood = Math.min(100, (m.mood ?? 60) + 8); return passengersAboard(p).length ? "THE OPERA HOUSE. THE FARES DRESS UP FROM NOTHING AND WEEP AT THE SECOND ACT. MOOD UP ALL ROUND. THE CREW FALL ASLEEP IN THE BOX." : "THE OPERA HOUSE, EMPTY BUT FOR YOU AND THE CREW. THE SOPRANO SINGS TO SIX PEOPLE LIKE IT'S SIX THOUSAND. MORALE UP."; }
  if (program === "pictures") {
    all(4); for (const a of p.crew) for (const b of p.crew) if (a !== b) shiftBond(a, b, 0.15);
    for (const m of passengersAboard(p)) m.mood = Math.min(100, (m.mood ?? 60) + 4);
    return rng.pick(["THE PICTURES: A FILM SO OLD THE SHIPS IN IT HAVE FINS. EVERYONE LAUGHS AT THE SAME LINES AND SOMEBODY CRIES AT THE END EVERY TIME. MORALE UP, AND THE CREW A LITTLE CLOSER.", "THE PICTURES: THE ONE WITH THE DOG. NOBODY WILL SAY WHICH ONE. THE DOG IS FINE. MORALE UP, AND THE CREW A LITTLE CLOSER."]);
  }
  if (program === "unwinnable") {
    const pil = p.crew.find((c) => c.role === "pilot"); const eng = p.crew.find((c) => c.role === "engineer" && !c.sick);
    const x = crewXp(p, "pilot", 2);
    if (eng && rng.chance(0.3)) { (p.flags ??= {}).conditions = true; all(6); logEntry(w, "Changed the conditions of the unwinnable scenario. Passed it"); return `THE SCENARIO: A FREIGHTER IN TROUBLE ON THE WRONG SIDE OF A LINE, AND EVERYTHING THAT COMES FOR YOU IF YOU CROSS IT. ${eng.name.toUpperCase()} REPROGRAMS THE RIG FROM INSIDE AND YOU WIN. "I CHANGED THE CONDITIONS." THE CREW ARE DELIGHTED AND APPALLED.${x ? " " + x : ""}`; }
    all(-2); if (pil) pil.morale = Math.min(100, pil.morale + 4);
    return `THE SCENARIO: A FREIGHTER IN TROUBLE ON THE WRONG SIDE OF A LINE, AND EVERYTHING THAT COMES FOR YOU IF YOU CROSS IT. YOU CROSS IT. YOU LOSE. EVERYBODY LOSES. THAT IS THE POINT, THE RIG SAYS, AND WON'T SAY WHAT THE POINT IS.${x ? " " + x : ""} MORALE DOWN, PRIDE UP.`;
  }
  const home = p.homePort ? findStation(w, p.homePort)?.st.name : null;
  all(home ? 8 : 5); for (const c of p.crew) if (c.home) c.loyalty = (c.loyalty ?? 0) + 0.2;
  return home ? `${home.toUpperCase()} IN SPRING, THE PROMENADE ON A GOOD DAY. NOBODY SAYS MUCH. MORALE UP, A LOT.` : "A PROMENADE SOMEWHERE, IN SPRING. THE RIG GUESSED AT A HOME PORT AND GOT IT ALMOST RIGHT. MORALE UP.";
}

// ---------- The ship's cat ----------
// Now and then the cat brings something up from the hold. It is usually useful.
export function catGift(p: PlayerState, rng: RNG): string | null {
  if (!p.cat || !rng.chance(0.1)) return null;
  const name = p.cat.name.toUpperCase();
  const roll = rng.int(0, 3);
  if (roll === 0 && addCargo(p, "parts", 1)) return `${name} HAS DRAGGED A SPARE PART OUT FROM BEHIND THE REACTOR HOUSING. NOBODY KNEW IT WAS THERE.`;
  if (roll === 1) { for (const c of p.crew) c.morale = Math.min(100, c.morale + 4); return `${name} SAT ON EVERY BUNK IN TURN THIS DOCKING. MORALE UP.`; }
  if (roll === 2) { p.expData = (p.expData ?? 0) + 40; return `${name} WAS FOUND ASLEEP ON THE SCANNER. IT LOGGED SOMETHING. +40 DATA.`; }
  return `${name} HAS LEFT A DEAD SOMETHING ON THE CAPTAIN'S CHAIR. IT IS A GIFT. YOU SAY THANK YOU.`;
}
export const CAT_NAMES = ["Biscuit", "Ferrule", "Moth", "Sprocket", "Halyard", "Nebula", "Ratchet", "Comet", "Pixel", "Grommet", "Ballast", "Ember"];
export function adoptCat(p: PlayerState, name: string, now: number): void {
  p.cat = { name, since: now };
  for (const c of p.crew) c.morale = Math.min(100, c.morale + 8);
}

// ---------- Legacy: a captain retires, a crew member takes the chair ----------
// The galaxy carries on: systems, structures, alumni, syndicate memory. The
// ship and its wall of record pass to the successor with a share of the
// credits; the rest is the old captain's pension. Reputations soften.
export const RETIRE_AFTER = 3600; // an hour under way before the chair can pass
export function canRetireCaptain(w: World): string | null {
  const p = w.player;
  if (!p.dockedAt) return "RETIRE AT A DOCK, NOT UNDER WAY";
  if (w.time < RETIRE_AFTER) return "TOO SOON. THE SHIP BARELY KNOWS YOU.";
  if (p.wanted > 0.5) return "NOT WITH THAT RECORD. CLEAR IT FIRST.";
  return null;
}
export function retireCaptain(w: World, name: string, successor: CrewMember | null): Captain {
  const p = w.player;
  const stationId = p.dockedAt ?? p.lastDockedAt ?? "";
  const deeds = (p.repairs ?? 0) + (p.tows ?? 0) + (p.rescues ?? 0) + (p.fares ?? 0) + (p.achievements ?? []).length;
  const cap: Captain = { name, from: (p.lineage ?? []).reduce((a, c) => Math.max(a, c.to), 0), to: w.time, stationId, credits: p.credits, deeds };
  (p.lineage ??= []).push(cap);
  (p.alumni ??= []).push({ name, role: "captain", docks: (p.lineage.length ? 0 : 0) + Math.max(1, Math.round(w.time / 400)), stationId, t: w.time });
  // the successor leaves the crew list and takes the chair; their skill seeds the new captain's hand
  if (successor) {
    p.crew = p.crew.filter((c) => c !== successor);
    if (successor.role === "pilot") p.skills.piloting = Math.max(p.skills.piloting ?? 0, successor.skill * 1.5);
    if (successor.role === "engineer") p.skills.engineering = Math.max(p.skills.engineering ?? 0, successor.skill * 1.5);
    p.captainName = successor.name;
  } else p.captainName = undefined;
  // pension: the old captain keeps sixty percent
  p.credits = Math.round(p.credits * 0.4);
  // open contracts and passengers are handed back; the rest of the crew stay, unsettled
  p.missions = p.missions.filter((m) => m.done);
  for (const c of p.crew) { c.morale = Math.max(20, c.morale - 15); c.loyalty = Math.max(0, (c.loyalty ?? 0) - 1); }
  // reputations soften toward neutral; the galaxy remembers the ship, not the pilot
  for (const k of Object.keys(p.rep)) p.rep[k] = Math.round(p.rep[k] * 0.5);
  for (const k of Object.keys(p.synRep ?? {})) p.synRep![k] = Math.round(p.synRep![k] * 0.5);
  p.wanted = 0;
  p.charters = [];
  p.tutorial = -1;
  logEntry(w, `${name} retired at ${findStation(w, stationId)?.st.name ?? "a station"}${successor ? `; ${successor.name} took the chair` : ""}`);
  pushEvent(w, { t: w.time, kind: "arc", systemId: p.systemId, text: `${name} has retired; ${successor ? successor.name : "a new captain"} now commands ${p.shipName ?? "the ship"}` });
  return cap;
}

// ---------- Passengers: the liner trade ----------
export type SightKind = "planet" | "drifter" | "comet" | "festival" | "wonder";
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
export interface GuestEntry { name: string; kind: string; from: string; to: string; mood: number; line: string; t: number }
const GUEST_LINES = {
  high: ["Best crew on the lanes. Sat with the cat the whole way.", "Slept. First time in a month. Thank you.", "Will ask for this ship by name.", "The engineer showed my kids the reactor. They haven't stopped talking.", "Smooth as glass. Even the gate.", "So that's what they mean on the lanes. Now I know."],
  mid: ["Got there. That's what I paid for.", "Fine. The coffee could be better.", "No complaints that I'll put in writing.", "Bit of a rattle over the belt. Otherwise fine."],
  low: ["Never again.", "I have been on prison barges with better manners.", "Late, cold, and somebody was singing.", "I'll be writing to the harbourmaster."],
};
// What the void keeps: when a ship is lost, its wreck stays in the system with what was in the hold,
// and whoever didn't make it to the pod goes on the wall.
export function leaveWreck(w: World, x: number, y: number, lostCrew: { name: string; role: string } | null): WreckDef {
  const p = w.player; const sys = w.systems[p.systemId];
  const loot = Object.entries(p.cargo).filter(([, q]) => q > 0).map(([id, q]) => ({ id, qty: Math.max(1, Math.floor(q / 2)) })).slice(0, 4);
  if (!loot.length) loot.push({ id: "parts", qty: 1 });
  const name = `the ${p.shipName ?? hull(p.hullId).name}, yours`;
  const wd: WreckDef = { id: `wreck-mine-${Math.floor(w.time)}`, x: Math.round(x), y: Math.round(y), looted: false, loot, hazard: 0.35, name };
  sys.wrecks.push(wd);
  (p.wrecksOfMine ??= []).push(wd.id);
  if (lostCrew) (p.lost ??= []).push({ name: lostCrew.name, role: lostCrew.role, where: sys.name, t: w.time });
  logEntry(w, `Lost ${name.replace(", yours", "")} off ${sys.name}${lostCrew ? `; ${lostCrew.name} didn't make it to the pod` : ""}. The wreck is still there.`);
  return wd;
}
// Somebody answered your mayday on the wire: their rescue post names you
export function maydayAnswered(events: { kind: string; text: string; t: number; callsign: string }[], callsign: string, since: number): string | null {
  const needle = `answered ${callsign.toLowerCase()}'s mayday`;
  const e = events.find((x) => x.kind === "rescue" && x.t >= since && x.text.toLowerCase().includes(needle));
  return e ? e.callsign : null;
}
// Other pilots' lost ships, from the wire: a wreck under their call sign, once per system, a little salvage
export function addWireWrecks(w: World, lights: { callsign: string; kind: string; t?: number }[]): number {
  const sys = w.systems[w.player.systemId]; let n = 0;
  for (const l of lights) {
    if (l.kind !== "wreck") continue;
    const id = `wreck-wire-${l.callsign}`;
    if (sys.wrecks.some((x) => x.id === id)) continue;
    const rng = new RNG(hashStr(`${id}:${sys.id}`));
    const a = rng.range(0, Math.PI * 2), r = rng.int(700, 1600);
    sys.wrecks.push({ id, x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r), looted: false, hazard: 0.4, name: `the wreck of ${l.callsign}'s ship`, loot: [{ id: rng.pick(["parts", "metals", "fuel", "med"]), qty: rng.int(1, 3) }, { id: "parts", qty: 1 }] });
    n++;
  }
  return n;
}
export function signGuestbook(w: World, m: Mission, stationName: string, rng: RNG): GuestEntry {
  const p = w.player;
  const mood = m.mood ?? 60;
  const line = rng.pick(mood >= 75 ? GUEST_LINES.high : mood >= 35 ? GUEST_LINES.mid : GUEST_LINES.low);
  const e: GuestEntry = { name: m.passengerName ?? "A passenger", kind: m.passengerKind ?? "vip", from: findStation(w, m.fromStationId)?.st.name ?? "?", to: stationName, mood: Math.round(mood), line, t: w.time };
  (p.guestbook ??= []).push(e); if (p.guestbook.length > 12) p.guestbook.shift();
  return e;
}
export function genFares(w: World, station: StationDef, rng: RNG): Mission[] {
  const sys = Object.values(w.systems).find((s) => s.stations.some((st) => st.id === station.id));
  if (!sys) return [];
  const one = sys.links.map((l) => w.systems[l]).filter(Boolean);
  const two = one.flatMap((s) => s.links.map((l) => w.systems[l])).filter((s) => s && s.id !== sys.id && !one.includes(s));
  const pool = [...one, ...one, ...two].filter((s) => s.stations.length);
  if (!pool.length) return [];
  const fares: Mission[] = [];
  const n = rng.int(2, 4);
  { const target = rng.pick(pool); const nf = notableFare(w, station, target, rng.pick(target.stations), rng); if (nf) fares.push(nf); }
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
      const wonder = wondersIn(w, target.id)[0];
      if (wonder && rng.chance(0.6)) { sightKind = "wonder"; sightText = `${wonder.name} (fly within sight of it)`; }
      else if (ev && ev.kind === "comet" && ev.systemId === target.id && rng.chance(0.7)) { sightKind = "comet"; sightText = `the comet crossing ${target.name}`; }
      else if (ev && ev.kind === "festival" && ev.stationId === tStation.id && rng.chance(0.7)) { sightKind = "festival"; sightText = `the festival at ${tStation.name}`; }
      else if (gas.length && rng.chance(0.4)) { sightKind = "drifter"; sightIdx = rng.pick(gas).idx; sightText = `the void drifters off ${target.planets[sightIdx].name} (hold V near one)`; }
      else if (target.planets.length) { sightKind = "planet"; sightIdx = rng.int(0, target.planets.length - 1); sightText = `${target.planets[sightIdx].name} from orbit`; }
      else { sightKind = "festival"; sightText = tStation.name; }
    }
    const party = pk === "tourist" ? rng.int(2, 4) : pk === "refugee" ? rng.int(1, 3) : 1;
    const base = pk === "vip" ? 700 + rng.int(0, 400) : pk === "refugee" ? 100 + rng.int(0, 80) * party : pk === "tourist" ? (sightKind === "wonder" ? 900 : 500) + rng.int(0, 300) + party * 120 : pk === "courier" ? 450 + rng.int(0, 250) : 550 + rng.int(0, 450);
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
  // an envoy: a treaty between this station's faction and the target's, on a deadline, and no fire taken
  if (rng.chance(0.3)) {
    const target = rng.pick(pool.filter((s) => s.factionId !== sys.factionId && s.factionId !== "vex")) ?? null;
    if (target) {
      const tStation = rng.pick(target.stations); const name = genPersonName(rng); const hops = one.includes(target) ? 1 : 2;
      const war = (w.wars ?? []).some((x) => x.systemId === target.id && w.time < x.until);
      fares.push({
        id: `fare-${station.id}-${w.missionCounter++}`, kind: "passenger", accepted: false, done: false, tier: 0,
        title: `Envoy${war ? " through the lines" : ""}: ${name}`,
        desc: `${name} carries a treaty between the ${facNameW(sys.factionId)} and the ${facNameW(target.factionId)} to ${tStation.name}, ${target.name}. Late (more than ${hops + 1} dockings) or shot at on the way, and the talks fail. Land it clean and both sides remember.${war ? ` ${target.name} is at war this week: the treaty matters more, the lanes are worse, and the fare is half again.` : ""}`,
        fromStationId: station.id, targetSystemId: target.id, targetStationId: tStation.id,
        passengerName: name, passengerKind: "envoy", sightSeen: false, sights: [],
        mood: 60, demand: null, patience: hops + 1, docksAboard: 0, party: 1,
        treaty: { a: sys.factionId, b: target.factionId },
        reward: Math.round((900 + rng.int(0, 400)) * (hops === 2 ? 1.4 : 1) * (war ? 1.5 : 1)),
        repReward: war ? 6 : 4,
      });
    }
  }
  // an evacuation: a crisis, a strike or a drought at this station, and people who want out on any hull with seats
  { const ev = w.galaxyEvent; const bad = crisisAt(w, station.id) || (ev && ev.stationId === station.id && w.time < ev.until && (ev.kind === "strike" || ev.kind === "drought" || ev.kind === "storm"));
    if (bad && rng.chance(0.7)) {
      const target = rng.pick(pool); const tStation = rng.pick(target.stations); const name = genPersonName(rng); const hops = one.includes(target) ? 1 : 2;
      const party = Math.max(2, Math.min(rng.int(4, 8), passengerCap(w.player) - passengersAboard(w.player).reduce((a, m) => a + (m.party ?? 1), 0)));
      fares.push({
        id: `fare-${station.id}-${w.missionCounter++}`, kind: "passenger", accepted: false, done: false, tier: 0,
        title: `Evacuation: ${name} +${party - 1}`,
        desc: `${name} and ${party - 1} others want off ${station.name} on the first hull with seats: ${tStation.name}, ${target.name}, or anywhere with water. The harbourmaster pays a head rate and the ${facNameW(station.factionId)} remember the ships that carried people out.`,
        fromStationId: station.id, targetSystemId: target.id, targetStationId: tStation.id,
        passengerName: name, passengerKind: "refugee", sightSeen: false, sights: [], evac: true,
        mood: 45, demand: "water", patience: hops + 1, docksAboard: 0, party,
        reward: 70 * party + rng.int(0, 120), repReward: 6,
      });
    } }
  // a prisoner transfer: the navy wants somebody moved, in irons, and pays a ship that has a gunner to watch them
  if (station.military && rng.chance(0.4)) {
    const target = rng.pick(pool); const tStation = rng.pick(target.stations); const name = genPersonName(rng); const hops = one.includes(target) ? 1 : 2;
    const crime = rng.pick(["smuggling, twice", "a mutiny that didn't take", "salvage that wasn't theirs", "a fight at a clamp that ended badly", "papers that weren't"]);
    fares.push({
      id: `fare-${station.id}-${w.missionCounter++}`, kind: "passenger", accepted: false, done: false, tier: 0,
      title: `Prisoner transfer: ${name}`,
      desc: `${name}, held for ${crime}, to the brig at ${tStation.name}, ${target.name}. In irons, in the bunk room, fed. A gunner aboard keeps it simple. No gunner and they may walk at a docking, and the service will want to know why.`,
      fromStationId: station.id, targetSystemId: target.id, targetStationId: tStation.id,
      passengerName: name, passengerKind: "prisoner", sightSeen: false, sights: [],
      mood: 40, demand: null, patience: hops + 1, docksAboard: 0, party: 1,
      reward: Math.round((500 + rng.int(0, 300)) * (hops === 2 ? 1.3 : 1)),
      repReward: 4,
    });
  }
  // a patient: the clinic here can't do it; the one at the target can, if they get there in time
  if (rng.chance(0.25)) {
    const target = rng.pick(pool); const tStation = rng.pick(target.stations); const name = genPersonName(rng); const hops = one.includes(target) ? 1 : 2;
    const what = rng.pick(["a crushed hand from a loader", "a fever the clinic can't name", "a reactor burn", "a pressure injury from a bad seal", "a heart that needs a machine this station doesn't have"]);
    fares.push({
      id: `fare-${station.id}-${w.missionCounter++}`, kind: "passenger", accepted: false, done: false, tier: 0,
      title: `Patient: ${name}`,
      desc: `${name} has ${what}. The clinic at ${tStation.name}, ${target.name}, can treat it; this one can't. ${hops} docking${hops > 1 ? "s" : ""}, no more, or it goes bad. A medic aboard buys one more. Med supplies aboard help.`,
      fromStationId: station.id, targetSystemId: target.id, targetStationId: tStation.id,
      passengerName: name, passengerKind: "patient", sightSeen: false, sights: [],
      mood: 50, demand: "med", patience: hops, docksAboard: 0, party: 1,
      reward: Math.round((600 + rng.int(0, 300)) * (hops === 2 ? 1.4 : 1)),
      repReward: 5,
    });
  }
  // a happy passenger comes back and asks for you by name
  const happy = (w.player.guestbook ?? []).filter((e) => e.mood >= 75 && !passengersAboard(w.player).some((m) => m.passengerName === e.name));
  if (happy.length && fares.length && rng.chance(0.35)) {
    const e = rng.pick(happy); const f = fares[fares.length - 1];
    f.passengerName = e.name; f.passengerKind = e.kind as Mission["passengerKind"]; f.returning = true; f.mood = 72;
    f.title = `Returning fare: ${e.name}${(f.party ?? 1) > 1 ? ` +${(f.party ?? 1) - 1}` : ""}`;
    f.desc = `${e.name} rode with you before ("${e.line}") and asked for you by name. ${f.desc.split(". ").slice(0, 1).join(". ").replace(/^[^ ]+( and \d+ others)?('s party)?/, e.name + (f.desc.includes("'s party") ? "'s party" : ""))}.`;
    f.reward = Math.round(f.reward * 1.3);
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
    if (m.docksAboard > (m.patience ?? 4)) { m.mood = Math.max(0, m.mood - 12); out.push(m.treaty ? `${name} SAYS THE OTHER DELEGATION WON'T WAIT. THE TREATY IS ALREADY LATE.` : `${name} ASKS, AGAIN, HOW MUCH LONGER.`); }
    else if (m.treaty && m.docksAboard === (m.patience ?? 2)) out.push(`${name} CHECKS THE CASE AND THE CLOCK. ONE MORE DOCKING AND THE TALKS ARE OFF.`);
    if (m.passengerKind === "patient" && m.docksAboard === patientDeadline(p, m) && m.targetStationId !== p.dockedAt) out.push(`${name}'S READINGS ARE SLIPPING. THE NEXT DOCKING HAS TO BE THE CLINIC.`);
    if (p.hull < p.hullMax * 0.4) { m.mood = Math.max(0, m.mood - 10); out.push(`${name} HAS SEEN THE HULL READOUT. NOT HAPPY.`); }
    if (hasSpecialty(p, "counsellor")) m.mood = Math.min(100, m.mood + 3);
  }
  settleRequests(p, out);
  return out;
}
// Reviews: once a week per crew member, a word in the study. Commend them, counsel them, or make them Number One.
export type ReviewKind = "commend" | "counsel" | "numberone";
export function reviewDue(p: PlayerState, c: CrewMember, now = Date.now()): boolean { return !(p.flags ?? {})[`review:${c.name}:${weekKey(now)}`]; }
export function reviewCrew(w: World, c: CrewMember, kind: ReviewKind, now = Date.now()): string {
  const p = w.player; (p.flags ??= {})[`review:${c.name}:${weekKey(now)}`] = true;
  const first = c.name.split(" ")[0].toUpperCase();
  const couns = hasSpecialty(p, "counsellor");
  if (kind === "commend") { c.morale = Math.min(100, c.morale + (couns ? 12 : 8)); c.loyalty = (c.loyalty ?? 0) + 0.5; logEntry(w, `Commended ${c.name} at review`); return `YOU TELL ${first} WHAT THEY DID RIGHT, SPECIFICALLY, AND WATCH THEM NOT KNOW WHERE TO LOOK. IT GOES IN THE LOG. MORALE AND LOYALTY UP.`; }
  if (kind === "counsel") { c.morale = Math.max(0, c.morale - (couns ? 1 : 3)); const x = crewXp(p, c.role, 2); logEntry(w, `Counselled ${c.name} at review`); return `YOU TELL ${first} WHAT THEY COULD DO BETTER, SPECIFICALLY. THEY TAKE IT THE WAY PEOPLE DO, AND THEN THEY TAKE IT.${x ? " " + x : ""} MORALE DIPS A LITTLE; THE WORK WON'T.`; }
  p.numberOne = c.name; c.morale = Math.min(100, c.morale + 6); c.loyalty = (c.loyalty ?? 0) + 1; logEntry(w, `Made ${c.name} Number One`);
  return `"${first}, YOU HAVE THE DECK WHEN I DON'T." A LONG PAUSE. "AYE." THE REST OF THE CREW FIND OUT WITHIN THE MINUTE AND START CALLING THEM NUMBER ONE TO THEIR FACE. MORALE AND LOYALTY UP.`;
}
// The ship's own name: what its voice signs its lines with. Until it's asked, it's the hull's name.
export function shipVoiceName(p: PlayerState): string { return (p.voiceName ?? p.shipName ?? hull(p.hullId).name).toUpperCase(); }
export function nameTheShip(w: World, name: string): string {
  const n = name.trim().slice(0, 16); if (n.length < 2) return "THE SHIP WAITS. IT CAN WAIT A LONG TIME.";
  w.player.voiceName = n; logEntry(w, `Asked the ship what it wanted to be called. It said ${n}`);
  return `"${n.toUpperCase()}." A PAUSE ON THE BAND. "YES. THAT'S IT. THAT'S THE ONE. I'VE BEEN SAYING IT TO MYSELF FOR A WHILE. THANK YOU FOR ASKING."`;
}
// The spin's gone: a belt station loses its rotation for an hour now and then. Somebody with a tool roll is welcome.
export function spinOutageDue(w: World, st: StationDef, now = Date.now()): boolean {
  if (!isBeltStation(st)) return false;
  const key = `spin:${st.id}:${weekKey(now)}`;
  if ((w.player.flags ?? {})[key]) return false;
  return hashStr(`${key}:${w.seed}`) % 100 < 12;
}
export function spinOutageSeen(w: World, st: StationDef, now = Date.now()): void { (w.player.flags ??= {})[`spin:${st.id}:${weekKey(now)}`] = true; }
// The crew want a word: when morale has sunk low enough, they say so at the next clamp, once a week.
export function grievanceDue(w: World, now = Date.now()): boolean {
  const p = w.player; if (p.crew.length < 2) return false;
  const avg = p.crew.reduce((a, c) => a + c.morale, 0) / p.crew.length;
  return avg < 32 && !(p.flags ?? {})[`grievance:${weekKey(now)}`];
}
// The ship's newsletter: what the ship would put on the galley door if it had a galley door and a printer.
export function shipNewsletter(w: World): string[] {
  const p = w.player; const out: string[] = []; const week = weekKey();
  const flagsThisWeek = Object.keys(p.flags ?? {}).filter((k) => k.endsWith(`:${week}`));
  out.push(`${shipVoiceName(p)} - THE GALLEY DOOR - STARDATE ${stardate(w)}`);
  const cards = flagsThisWeek.some((k) => k.startsWith("cards:")); const band = flagsThisWeek.some((k) => k.startsWith("band:")); const dine = flagsThisWeek.filter((k) => k.startsWith("dine:")).map((k) => k.split(":")[1].split(" ")[0]);
  if (cards) out.push("CARD NIGHT HAPPENED. THE EDITOR DECLINES TO SAY WHO WON. THE EDITOR WAS DEALT IN.");
  if (band) out.push("THE BAND WAS ON THE PROMENADE AND SOMEBODY FROM THIS SHIP STAYED FOR THE ENCORE. AGAIN.");
  if (dine.length) out.push(`THE CAPTAIN SAT WITH ${dine.map((n) => n.toUpperCase()).join(" AND ")} AT MESS. FAVOURITISM IS NOTED. FAVOURITISM IS FINE.`);
  const bday = Object.keys(p.flags ?? {}).filter((k) => k.startsWith("bday:")).slice(-1)[0]; if (bday) out.push(`A BIRTHDAY WAS CELEBRATED WITH RATION SUGAR. THE SUGAR IS STILL ON THE DECK. THE EDITOR HAS OPINIONS.`);
  const low = [...p.crew].sort((a, b) => a.morale - b.morale)[0]; const high = [...p.crew].sort((a, b) => b.morale - a.morale)[0];
  if (p.crew.length >= 2 && high && low && high !== low) out.push(`MOOD OF THE WEEK: ${high.name.split(" ")[0].toUpperCase()} (UP). ${low.name.split(" ")[0].toUpperCase()} WOULD LIKE A PORT, A MEAL, OR BOTH.`);
  if (p.prankUntil !== undefined) out.push("THE VOICE SETTINGS REMAIN 'ADJUSTED'. THE EDITOR IS THE VOICE. THE EDITOR IS ENJOYING THIS.");
  if ((p.officeLetters ?? 0) > 0) out.push(`LETTERS FROM THE OFFICE: ${p.officeLetters}. FORMS RETURNED: 0. THE EDITOR IS NOT WORRIED. THE EDITOR IS A LITTLE WORRIED.`);
  if ((p.hailsAnswered ?? 0) > 0) out.push(`HAILS ANSWERED CIVILLY THIS CAREER: ${p.hailsAnswered}. THE LANES ARE KEEPING COUNT TOO.`);
  if (p.systemNicks && Object.keys(p.systemNicks).length) out.push(`THE EDITOR REMINDS THE CREW THAT ${Object.values(p.systemNicks)[0].toUpperCase()} IS A SYSTEM, NOT A PERSON, AND WOULD LIKE TO STOP BEING ASKED HOW SHE IS.`);
  if ((p.ribbons ?? 0) > 0) out.push(`RIBBONS ABOARD: ${p.ribbons}. ALL CROOKED. THE EDITOR HAS OFFERED TO STRAIGHTEN THEM AND BEEN REFUSED.`);
  if (p.flags?.anniversary) out.push("THE ANNIVERSARY WAS MARKED. THE EDITOR TURNED THE GALLEY LIGHTS UP. NOBODY NOTICED. THE EDITOR NOTICED.");
  if ((p.wakes ?? 0) > 0) out.push("THE CUP IS STILL ON THE TABLE. THE EDITOR WILL NOT BE PRINTING ANYTHING FUNNY ABOUT THE CUP.");
  if (p.crew.some((c) => (c.docks ?? 0) === 0)) out.push("THE CADET HAS ASKED THE EDITOR FOR A COLUMN. THE EDITOR HAS SAID 'AFTER YOUR FIRST DOCKING'. THE EDITOR IS FAIR.");
  { const t = (c: CrewMember, s: string) => (c.trait ?? "").includes(s); const L: string[] = [];
    for (const c of p.crew) { const n = c.name.split(" ")[0].toUpperCase(); if (t(c, "litres")) L.push(`LETTER FROM ${n}: "SOMEBODY LEFT THE TAP RUNNING. TWO LITRES. THE EDITOR KNOWS WHO." THE EDITOR DOES.`); else if (t(c, "plant")) L.push(`LETTER FROM ${n}: "THE PLANT HAS A NEW LEAF. NOBODY TOUCH IT." THE EDITOR HAS TOUCHED IT.`); else if (t(c, "cooks")) L.push(`LETTER FROM ${n}: "TONIGHT'S RATION BARS ARE A SURPRISE." THE EDITOR ADVISES CAUTION.`); else if (t(c, "cards")) L.push(`LETTER FROM ${n}: "CARDS AFTER WATCH. MATCHSTICKS." THE EDITOR NOTES THE SIXES ARE STILL MARKED.`); else if (t(c, "bird")) L.push(`LETTER FROM ${n}: "DON'T OPEN THE BOX." THE EDITOR HAS NOT OPENED THE BOX. THE EDITOR WOULD LIKE TO.`); else if (t(c, "laps")) L.push(`LETTER FROM ${n}: "THREE LAPS BEFORE THE JUMP. ANYONE?" THE EDITOR IS A SHIP AND CANNOT RUN.`); }
    if (L.length) out.push(L[Math.floor(w.time / 3600) % L.length]); }
  if (p.catchphrase) out.push(`THE CAPTAIN'S UNDOCK WORD REMAINS '${p.catchphrase.toUpperCase()}'. THE EDITOR HAS STOPPED COUNTING. THE EDITOR HAS NOT STOPPED COUNTING.`);
  const last = (p.log ?? []).slice(-3).reverse().map((e) => e.text); for (const t of last) out.push(`FROM THE LOG: ${t.toUpperCase()}`.slice(0, 118));
  if (out.length === 1) out.push("NOTHING HAPPENED THIS WEEK. THE EDITOR WOULD LIKE SOMETHING TO HAPPEN. NOT A FIRE.");
  out.push("CORRECTIONS: NONE. THE EDITOR IS NEVER WRONG. THE EDITOR IS THE SHIP.");
  return out;
}
// The ship's anniversary: every hundred hours under way since commissioning, the ship notes it, once each.
export function anniversaryDue(w: World): string | null {
  const p = w.player; const since = w.time - (p.commissionedAt ?? 0); const n = Math.floor(since / 360000);
  if (n < 1) return null; const key = `anniv:${n}`; if ((p.flags ?? {})[key]) return null;
  (p.flags ??= {})[key] = true; p.flags.anniversary = true;
  for (const c of p.crew) c.morale = Math.min(100, c.morale + 4);
  logEntry(w, `${(p.shipName ?? hull(p.hullId).name)}: ${n * 100} hours under way since commissioning`);
  return `${shipVoiceName(p)}: ${n * 100} HOURS UNDER WAY SINCE THE BELL. I DIDN'T EXPECT ANYONE TO REMEMBER. I'VE TURNED THE GALLEY LIGHTS UP A LITTLE. MORALE UP.`;
}
// Birthdays: every crew member has one every thirty ship-days, and the galley notices. Once each.
export function birthdaysDue(w: World): string[] {
  const p = w.player; const day = Math.floor(w.time / 86400); const period = Math.floor(day / 30); const out: string[] = [];
  for (const c of p.crew) {
    if (hashStr(`bday:${c.name}`) % 30 !== day % 30) continue;
    const key = `bday:${c.name}:${period}`; if ((p.flags ?? {})[key]) continue;
    (p.flags ??= {})[key] = true; p.flags.birthday = true;
    c.morale = Math.min(100, c.morale + 10); c.loyalty = (c.loyalty ?? 0) + 0.2;
    for (const o of p.crew) if (o !== c) o.morale = Math.min(100, o.morale + 3);
    logEntry(w, `${c.name}'s birthday aboard; the galley did something about it`);
    out.push(`IT'S ${c.name.split(" ")[0].toUpperCase()}'S BIRTHDAY. THE GALLEY HAS DONE SOMETHING WITH RATION SUGAR AND A CANDLE. MORALE UP.`);
  }
  return out;
}
// A board of inquiry: the navy convenes one at its own stations for every crew member who didn't make it to the pod.
export function inquiryDue(w: World, st: StationDef): boolean { const p = w.player; return !!st.military && (p.lost ?? []).length > (p.inquiries ?? 0); }
// Two crew who are close ask for the same leave, at a station with something to do, once a week.
export function leavePair(w: World, now = Date.now()): [CrewMember, CrewMember] | null {
  const p = w.player; if (p.crew.length < 3 || (p.flags ?? {})[`leavepair:${weekKey(now)}`]) return null;
  for (let i = 0; i < p.crew.length; i++) for (let j = i + 1; j < p.crew.length; j++) { const a = p.crew[i], b = p.crew[j]; if (!a.sick && !b.sick && bond(a, b) >= 2) return [a, b]; }
  return null;
}
// A transfer request: a crew member with a long record and a low mood asks, at a naval station, for a posting ashore.
export function transferRequest(w: World): CrewMember | null {
  const p = w.player;
  return p.crew.find((c) => c.morale < 40 && (c.docks ?? 0) >= 5 && !c.sick && !(p.flags ?? {})[`transfer:${c.name}`]) ?? null;
}
export function grievanceHeard(w: World, now = Date.now()): void { (w.player.flags ??= {})[`grievance:${weekKey(now)}`] = true; }
// Receptions: dock with standing (rep 20+) and now and then the faction throws one in your honour, once a week.
export function receptionDue(w: World, st: StationDef, now = Date.now()): boolean {
  const p = w.player; if (st.factionId === "vex" || (p.rep[st.factionId] ?? 0) < 20) return false;
  const key = `reception:${st.factionId}:${weekKey(now)}`;
  if ((p.flags ?? {})[key]) return false;
  return hashStr(`${key}:${w.seed}:${st.id}`) % 100 < 35;
}
export function inspectionDue(w: World, st: StationDef, now = Date.now()): boolean {
  const rk = commandRank(w.player); if (rk !== "COMMODORE" && rk !== "ADMIRAL") return false;
  return receptionDue(w, st, now) && hashStr(`inspect:${st.factionId}:${weekKey(now)}:${w.seed}`) % 100 < 40;
}
export function inspectionScore(p: PlayerState): { score: number; notes: string[] } {
  const notes: string[] = []; let score = 0;
  if ((p.wear ?? 0) < 40) score++; else notes.push("THE FRAME RATTLES");
  const mood = p.crew.length ? p.crew.reduce((a, c) => a + c.morale, 0) / p.crew.length : 60; if (mood >= 60) score++; else notes.push("THE CREW LOOK WORN");
  if ((p.furnishings ?? []).length >= 2 || (p.motto && (p.ribbons ?? 0) > 0)) score++; else notes.push(p.motto ? "THE DECK IS BARE, THOUGH THE PLAQUE IS ENGRAVED" : "THE DECK IS BARE");
  if (p.hull >= p.hullMax * 0.7) score++; else notes.push("THE HULL IS PATCHED");
  return { score, notes };
}
export function receptionHeld(w: World, st: StationDef, now = Date.now()): void { (w.player.flags ??= {})[`reception:${st.factionId}:${weekKey(now)}`] = true; }
// Alert status: green, yellow, red. Yellow readies the shields; red readies everything and wears the crew down.
export type AlertLevel = 0 | 1 | 2;
export const ALERT_NAME: Record<AlertLevel, string> = { 0: "GREEN", 1: "YELLOW ALERT", 2: "RED ALERT" };
export function alertMods(level: AlertLevel): { shield: number; dmg: number; morale: number } {
  return level === 2 ? { shield: 2, dmg: 1.1, morale: -1 } : level === 1 ? { shield: 1.5, dmg: 1, morale: 0 } : { shield: 1, dmg: 1, morale: 0 };
}
// The Belt: mining and refinery stations run on air, water and grudges. Share once and the belt remembers.
export function isBeltStation(st: StationDef): boolean { return st.type === "mining" || st.type === "refinery"; }
export const BELT_FREEMAN_AT = 3;
export function beltRate(p: PlayerState, st: StationDef): number { return isBeltStation(st) ? ((p.beltStanding ?? 0) >= BELT_FREEMAN_AT ? 0.85 : p.flags?.belt ? 0.9 : 1) : 1; }
// Standing with the rocks, in small steps. At three the belt calls you a freeman and the yards go to 15% under.
export function beltGain(w: World, n: number): string | null {
  const p = w.player; const before = p.beltStanding ?? 0; p.beltStanding = Math.min(9, before + n); p.flags ??= {}; p.flags.belt = true;
  if (before < BELT_FREEMAN_AT && p.beltStanding >= BELT_FREEMAN_AT) { p.flags.freeman = true; (p.codex ??= {})["contact:THE ROCK'S COUNCIL"] = ((p.codex ?? {})["contact:THE ROCK'S COUNCIL"] ?? 0) + 1; logEntry(w, "The belt calls me a freeman now"); (w.mailQueue ??= []).push({ dueT: w.time + 400, from: "the rock's council, three rocks", text: "We don't write to inners. We're writing to you. Three rocks say you're one of ours now, and three rocks are never wrong at once. There's water in this for your tank and a tab at every bar with a spin. Don't make us regret the letter.", gift: { credits: 300 } }); return "THE BELT CALLS YOU A FREEMAN. EVERY ROCK'S YARD IS FIFTEEN UNDER FOR YOU FROM HERE ON, AND THE TANNOY WILL SAY SO."; }
  return null;
}
// Senior staff: at the study, once a leg, each department reports and the captain picks a focus until the next dock.
export type FocusKind = "engines" | "sickbay" | "tactical" | "helm";
export const FOCUS_LABEL: Record<FocusKind, string> = { engines: "ENGINES: WEAR ACCRUES 20% SLOWER", sickbay: "SICKBAY: MORALE +4, THE SICK MEND FASTER", tactical: "TACTICAL: SHIELDS RECHARGE HALF AGAIN AS FAST", helm: "HELM: THE NEXT JUMPS COST 10% LESS FUEL" };
export function briefingReports(w: World): string[] {
  const p = w.player; const out: string[] = [];
  const by = (role: CrewRole) => p.crew.find((c) => c.role === role && !c.sick);
  const eng = by("engineer"); const med = by("medic"); const pil = by("pilot"); const gun = by("gunner");
  const worst = [...p.systems].sort((a, b) => a.health - b.health)[0];
  out.push(eng ? `${eng.name.split(" ")[0].toUpperCase()} (ENGINES): WEAR AT ${Math.round(p.wear ?? 0)}%${worst && worst.health < 70 ? `, ${systemLabel(p, worst)} AT ${Math.round(worst.health)}%` : ", ALL SYSTEMS GREEN"}. ${(p.wear ?? 0) > 60 ? "SHE NEEDS A YARD, CAPTAIN." : "SHE'LL HOLD."}` : `NO ENGINEER ABOARD. WEAR AT ${Math.round(p.wear ?? 0)}%.`);
  const sick = p.crew.filter((c) => c.sick).length; const morale = p.crew.length ? Math.round(p.crew.reduce((a, c) => a + c.morale, 0) / p.crew.length) : 0;
  out.push(med ? `${med.name.split(" ")[0].toUpperCase()} (SICKBAY): ${sick ? `${sick} ON THE COTS` : "NOBODY ON THE COTS"}, MORALE ${morale}. ${morale < 50 ? "THEY NEED A WIN, OR A MEAL." : "THEY'RE ALL RIGHT."}` : `NO MEDIC ABOARD. ${sick ? `${sick} SICK.` : "NOBODY SICK."} MORALE ${morale}.`);
  out.push(pil ? `${pil.name.split(" ")[0].toUpperCase()} (HELM): FUEL ${Math.round(p.fuel)}/${p.fuelMax}${p.navTarget ? `, COURSE FOR ${w.systems[p.navTarget]?.name.toUpperCase() ?? "?"}` : ", NO COURSE PLOTTED"}. ${p.fuel < p.fuelMax * 0.3 ? "WE'RE THIN ON FUEL." : "WE'RE GOOD FOR THE LEG."}` : `NO PILOT ABOARD. FUEL ${Math.round(p.fuel)}/${p.fuelMax}.`);
  out.push(`${shipVoiceName(p)} (THE SHIP): ${(p.wear ?? 0) > 70 ? "I ACHE. I DON'T SAY THAT LIGHTLY." : p.fuel < p.fuelMax * 0.2 ? "I'M HUNGRY. THAT'S THE TECHNICAL TERM." : p.hull < p.hullMax * 0.5 ? "I'M HOLED. I'D LIKE THAT ON THE RECORD." : "I'M FINE. ASK ME AGAIN AFTER THE JUMP."}`);
  { const sci = p.crew.find((c) => c.specialty === "science" && !c.sick); if (sci) { const sys = w.systems[p.systemId]; const unscanned = sys ? sys.anomalies.filter((a) => !a.discovered).length : 0; const strange = sys ? sys.anomalies.filter((a) => a.discovered && !a.claimed && (a.kind === "fold" || a.kind === "lens" || a.kind === "echo")).length : 0; out.push(`${sci.name.split(" ")[0].toUpperCase()} (SCIENCE): ${unscanned ? `${unscanned} SIGNAL${unscanned > 1 ? "S" : ""} STILL UNSCANNED IN ${sys?.name.toUpperCase() ?? "SYSTEM"}` : `${sys?.name.toUpperCase() ?? "THE SYSTEM"} IS SCANNED OUT`}${strange ? `, ${strange} STRANGE READING${strange > 1 ? "S" : ""} WORTH A LOOK` : ""}. ${(p.named ?? 0) ? `${p.named} FIND${p.named === 1 ? "" : "S"} ON THE CHART UNDER OUR NAME.` : "WE HAVEN'T NAMED ANYTHING YET. I'D LIKE TO."}`); } }
  const fo = firstOfficer(p);
  if (fo) { const low = [...p.crew].filter((c) => c !== fo).sort((a, b) => a.morale - b.morale)[0]; const l = p.leg; out.push(`${fo.name.split(" ")[0].toUpperCase()} (NUMBER ONE): ${low && low.morale < 45 ? `KEEP AN EYE ON ${low.name.split(" ")[0].toUpperCase()}, THEY'RE QUIET.` : "THE CREW ARE STEADY."} ${l && l.alerts >= 2 ? "THAT'S ENOUGH RED ALERTS FOR ONE LEG." : l && l.fights ? "WE TOOK FIRE. THEY NOTICED YOU DIDN'T FLINCH." : (p.credits ?? 0) < 200 ? "WAGES ARE DUE AND THE TIN IS LIGHT. THEY KNOW." : "NOTHING YOU DON'T ALREADY KNOW, CAPTAIN. I'LL SAY IT ANYWAY: SLEEP."}`); }
  out.push(gun ? `${gun.name.split(" ")[0].toUpperCase()} (TACTICAL): SHIELDS ${Math.round(p.shield)}/${p.shieldMax}, ${p.kills} ON THE BOARD. ${p.hull < p.hullMax * 0.6 ? "THE HULL WON'T TAKE A SECOND FIGHT." : "READY IF IT COMES."}` : `NO GUNNER ABOARD. SHIELDS ${Math.round(p.shield)}/${p.shieldMax}.`);
  return out;
}
export function setFocus(w: World, kind: FocusKind): string {
  const p = w.player; p.focus = kind; p.briefed = true;
  if (kind === "sickbay") { for (const c of p.crew) { c.morale = Math.min(100, c.morale + 4); if (c.sick) c.sick.until = w.time + Math.max(0, c.sick.until - w.time) * 0.5; } }
  logEntry(w, `Senior staff briefing: focus on ${kind}`);
  return `THE ROOM AGREES. ${FOCUS_LABEL[kind]}, UNTIL THE NEXT DOCK. "DISMISSED."`;
}
// The juice: a clinic sells it, a dose a time. One hard burn per leg: faster cruise, keener thrust,
// and the crew and the frame pay for it.
export const JUICE_PRICE = 150, JUICE_CAP = 3;
export function buyJuice(p: PlayerState): string {
  if ((p.juice ?? 0) >= JUICE_CAP) return "CLINIC: 'THREE DOSES IS THE LIMIT. THAT'S NOT A RULE, IT'S ADVICE.'";
  if (p.credits < JUICE_PRICE) return `CLINIC: 'BURN JUICE IS ${JUICE_PRICE}CR A DOSE. YOU'RE SHORT. GOOD.'`;
  p.credits -= JUICE_PRICE; p.juice = (p.juice ?? 0) + 1;
  return `CLINIC: ONE DOSE OF BURN JUICE, -${JUICE_PRICE}CR. 'COUCHES, STRAPS, AND NOBODY EATS FIRST. ${p.juice} ABOARD.'`;
}
export function takeJuice(p: PlayerState): string | null {
  if ((p.juice ?? 0) <= 0) return null;
  p.juice = (p.juice ?? 0) - 1; p.wear = (p.wear ?? 0) + 4;
  for (const c of p.crew) c.morale = Math.max(0, c.morale - 4);
  return "THE JUICE GOES IN AND THE COUCHES TAKE THE WEIGHT. HARD BURN UNTIL YOU DOCK OR JUMP. THE CREW WILL HATE YOU FOR AN HOUR.";
}
// Lost property: fares leave things in the cabin. The harbour office where they got off takes it back
// for a small reward; after four dockings unclaimed, it's the ship's.
export interface LostItem { name: string; owner: string; stationId: string; t: number; docks: number }
export const LOST_ITEMS = ["a scarf", "a paperback with the ending torn out", "a child's drawing of the ship", "a harmonica", "one glove", "a pocket chess set, mid-game", "a tin of real coffee, half full", "a data slate, locked", "a flower, pressed flat", "a ticket stub from a liner"];
export const LOST_KEEP_AFTER = 4, LOST_REWARD = 50, LOST_FORWARD = 20;
export function leaveLostItem(p: PlayerState, m: Mission, stationId: string, t: number, rng: RNG): string | null {
  if (m.kind !== "passenger" || !rng.chance(0.25) || (p.lostProperty ?? []).length >= 4) return null;
  const owner = m.passengerName ?? "a passenger";
  const item = { name: rng.pick(LOST_ITEMS), owner, stationId, t, docks: 0 };
  (p.lostProperty ??= []).push(item);
  return `${owner.toUpperCase()} LEFT ${item.name.toUpperCase()} IN THE CABIN. THE HARBOUR OFFICE HERE WOULD TAKE IT.`;
}
export function tickLostProperty(p: PlayerState): string[] {
  const out: string[] = [];
  for (const it of [...(p.lostProperty ?? [])]) {
    it.docks++;
    if (it.docks >= LOST_KEEP_AFTER) { p.lostProperty = (p.lostProperty ?? []).filter((x) => x !== it); (p.keepsakes ??= []).push(`${it.name}, left by ${it.owner}`); if (p.keepsakes.length > 8) p.keepsakes.shift(); out.push(`NOBODY CLAIMED ${it.owner.toUpperCase()}'S ${it.name.toUpperCase().split(",")[0]}. IT'S THE SHIP'S NOW.`); }
  }
  return out;
}
export function handInLostItem(w: World, it: LostItem, stationId: string): string {
  const p = w.player;
  p.lostProperty = (p.lostProperty ?? []).filter((x) => x !== it);
  const home = it.stationId === stationId;
  p.credits += home ? LOST_REWARD : LOST_FORWARD;
  logEntry(w, `Handed in ${it.name} that ${it.owner} left aboard, at ${findStation(w, stationId)?.st.name ?? "a harbour office"}`);
  return home ? `THE HARBOUR OFFICE HAS ${it.owner.toUpperCase()} ON FILE. THEY'LL GET ${it.name.toUpperCase().split(",")[0]} BACK. +${LOST_REWARD}CR FOR YOUR TROUBLE.` : `THEY'LL FORWARD IT. IT'LL TAKE A WHILE. +${LOST_FORWARD}CR, AND A NOD.`;
}
const facNameW = (id: string): string => FACTIONS.find((f) => f.id === id)?.name ?? id;
// The patient lands: in time (a medic aboard buys a docking) and the clinic takes over; late, and it went bad on the way.
export function patientDeadline(p: PlayerState, m: Mission): number { return (m.patience ?? 1) + (p.crew.some((c) => c.role === "medic" && !c.sick) ? 1 : 0); }
export function patientOutcome(w: World, m: Mission): { ok: boolean; lines: string[] } {
  if (m.passengerKind !== "patient") return { ok: true, lines: [] };
  const p = w.player; const name = (m.passengerName ?? "THE PATIENT").toUpperCase();
  const ok = (m.docksAboard ?? 0) <= patientDeadline(p, m);
  const medic = p.crew.find((c) => c.role === "medic" && !c.sick);
  if (ok) { m.mood = Math.min(100, (m.mood ?? 50) + 25); p.lives = (p.lives ?? 0) + 1; p.patients = (p.patients ?? 0) + 1; logEntry(w, `Landed the patient ${m.passengerName ?? ""} at the clinic in time`); return { ok, lines: [`${name} GOES DOWN THE GANGWAY ON A STRETCHER, AWAKE, AND THE CLINIC TAKES OVER.${medic ? ` ${medic.name.toUpperCase()} HANDS OVER THE NOTES.` : ""} ONE LIFE.`] }; }
  m.mood = Math.max(0, (m.mood ?? 50) - 25); adjustRep(w, findStation(w, m.targetStationId ?? "")?.st.factionId ?? "", -1);
  logEntry(w, `The patient ${m.passengerName ?? ""} arrived late; the clinic is doing what it can`);
  return { ok, lines: [`${name} ARRIVES TOO LATE FOR THE EASY VERSION. THE CLINIC IS DOING WHAT IT CAN. HALF THE FARE, AND A LONG WALK BACK TO THE SHIP.`] };
}
// The prisoner lands, or doesn't: no gunner aboard and there's a fair chance they walked at some clamp on the way.
export function prisonerOutcome(w: World, m: Mission, rng: RNG): { ok: boolean; lines: string[] } {
  if (m.passengerKind !== "prisoner") return { ok: true, lines: [] };
  const p = w.player; const name = (m.passengerName ?? "THE PRISONER").toUpperCase();
  const gunner = p.crew.some((c) => c.role === "gunner" && !c.sick);
  const walked = !gunner && (m.docksAboard ?? 0) >= 1 && rng.chance(0.3);
  if (!walked) { p.prisoners = (p.prisoners ?? 0) + 1; logEntry(w, `Delivered the prisoner ${m.passengerName ?? ""} to the brig`); return { ok: true, lines: [`${name} GOES DOWN THE GANGWAY BETWEEN TWO MARINES WITHOUT LOOKING BACK. THE SERVICE SIGNS FOR THEM LIKE FREIGHT.`] }; }
  m.reward = 0; m.mood = 0; adjustRep(w, findStation(w, m.targetStationId ?? "")?.st.factionId ?? "", -4);
  logEntry(w, `The prisoner ${m.passengerName ?? ""} walked at a clamp on the way; no gunner aboard`);
  return { ok: false, lines: [`THE BUNK ROOM IS EMPTY AND THE IRONS ARE ON THE PILLOW. ${name} WALKED AT THE LAST CLAMP WHILE NOBODY WAS WATCHING, BECAUSE NOBODY WAS. NO FARE. THE SERVICE WANTS A WORD.`] };
}
// The envoy lands: on time and unshot, the treaty holds and both factions remember; otherwise the talks fail.
export function envoyOutcome(w: World, m: Mission): { ok: boolean; lines: string[] } {
  const t = m.treaty; if (!t) return { ok: true, lines: [] };
  const late = (m.docksAboard ?? 0) > (m.patience ?? 2);
  const ok = !late && !m.tookFire;
  const name = (m.passengerName ?? "THE ENVOY").toUpperCase();
  if (ok) { adjustRep(w, t.a, 4); adjustRep(w, t.b, 4); m.mood = Math.min(100, (m.mood ?? 60) + 25); w.player.envoys = (w.player.envoys ?? 0) + 1; logEntry(w, `Landed the envoy ${m.passengerName ?? ""} in time and unshot; the treaty between the ${facNameW(t.a)} and the ${facNameW(t.b)} holds`); return { ok, lines: [`${name} WALKS DOWN THE GANGWAY WITH THE CASE AND THE TALKS BEGIN ON TIME. REP UP WITH THE ${facNameW(t.a).toUpperCase()} AND THE ${facNameW(t.b).toUpperCase()}.`] }; }
  adjustRep(w, t.a, -2); adjustRep(w, t.b, -2); m.mood = Math.max(0, (m.mood ?? 60) - 30);
  logEntry(w, `The envoy ${m.passengerName ?? ""} arrived ${late ? "late" : "shot at"}; the talks failed`);
  return { ok, lines: [late ? `${name} IS TOO LATE. THE OTHER DELEGATION HAS GONE HOME. THE TREATY GOES BACK IN THE CASE. REP DOWN ON BOTH SIDES.` : `${name} ARRIVES WITH SCORCH ON THE HULL BEHIND THEM AND THE TALKS COLLAPSE BEFORE THEY START. 'THEY SHOT AT A TREATY.' REP DOWN ON BOTH SIDES.`] };
}
// Passenger requests: somebody in the lounge wants something on this leg. Meet it and they tip at the end.
export type PaxRequest = "meal" | "quiet" | "view" | "star";
export const PAX_REQUEST_LINES: Record<PaxRequest, string> = {
  star: "MY PEOPLE GREET EVERY NEW STAR UP CLOSE. TAKE ME NEAR THE STAR HERE, CLOSE ENOUGH TO FEEL IT. I'LL SING. YOU'LL LIVE.",
  meal: "ANY CHANCE OF A HOT MEAL BEFORE WE ARRIVE? SHIP'S FOOD, I DON'T MIND. JUST HOT.",
  quiet: "I'D PAY EXTRA FOR A QUIET RUN. NO HOLES IN THE HULL BETWEEN HERE AND THERE.",
  view: "I HEAR THERE ARE THINGS WORTH SEEING OUT HERE. SHOW ME ONE AND I'LL REMEMBER YOU AT THE END.",
};
export function askPassengerRequest(p: PlayerState, rng: RNG): { m: Mission; text: string } | null {
  const pax = passengersAboard(p).filter((m) => !m.request);
  if (!pax.length) return null;
  const m = rng.pick(pax);
  const kinds: PaxRequest[] = ["quiet", "view", "star"]; if (p.crew.filter((c) => !c.sick).length >= 2) kinds.push("meal");
  m.request = rng.pick(kinds); m.requestMet = false; m.tip = 40 + Math.round(m.reward * 0.15);
  return { m, text: PAX_REQUEST_LINES[m.request] };
}
// The galley: a meal from what's aboard. Provisions always; luxuries make it a dinner; a rare tea, wine or
// mead aboard is poured after (not used up). The cook aboard makes it better. Fares eat too.
export function cookMeal(p: PlayerState): string[] | null {
  if ((p.cargo.food ?? 0) <= 0) return null;
  removeCargo(p, "food", 1);
  const dinner = (p.cargo.lux ?? 0) > 0; if (dinner) removeCargo(p, "lux", 1);
  const after = (["r_tea", "r_wine", "r_mead"] as const).find((id) => (p.cargo[id] ?? 0) > 0);
  const cook = p.crew.find((c) => c.trait?.includes("cooks"));
  const gain = (dinner ? 14 : 10) + (cook ? 2 : 0) + (after ? 2 : 0);
  p.hull = Math.min(p.hullMax, p.hull + 5);
  p.mealsCooked = (p.mealsCooked ?? 0) + 1;
  for (const c of p.crew) c.morale = Math.min(100, c.morale + gain);
  for (const m of passengersAboard(p)) if (dinner) m.mood = Math.min(100, (m.mood ?? 60) + 10);
  const who = cook ? `${cook.name.toUpperCase()} COOKS.` : "";
  const what = dinner ? "A PROPER DINNER, LUXURIES AND ALL." : cook ? "NOBODY KNOWS WHAT IT IS. EVERYBODY HAS SECONDS." : p.crew.length ? "A HOT MEAL FOR EVERYONE." : "A HOT MEAL.";
  const pour = after === "r_tea" ? " TEA AFTER, THE REAL STUFF." : after === "r_wine" ? " A GLASS OF THE WINE AFTER." : after === "r_mead" ? " MEAD AFTER. SINGING, PROBABLY." : "";
  const out = [`${who ? who + " " : ""}${what}${pour} ${p.crew.length ? `MORALE +${gain}, ` : ""}+5 HULL${dinner && passengersAboard(p).length ? ", THE FARES ARE DELIGHTED" : ""}`.trim()];
  out.push(...passengersFed(p));
  return out;
}
export function passengersFed(p: PlayerState): string[] {
  const out: string[] = [];
  for (const m of passengersAboard(p)) if (m.request === "meal" && !m.requestMet) { m.requestMet = true; m.mood = Math.min(100, (m.mood ?? 60) + 10); out.push(`${(m.passengerName ?? "YOUR PASSENGER").toUpperCase()} GOT THEIR HOT MEAL. THEY'LL REMEMBER IT.`); }
  return out;
}
export function passengersTookFire(p: PlayerState): void { for (const m of passengersAboard(p)) m.tookFire = true; }
function settleRequests(p: PlayerState, out: string[]): void {
  for (const m of passengersAboard(p)) {
    if (!m.request || m.requestSettled) continue;
    if (m.request === "quiet") m.requestMet = !m.tookFire;
    if (m.request === "view") m.requestMet = (m.sights?.length ?? 0) > 0 || !!m.sightSeen;
    const name = (m.passengerName ?? "YOUR PASSENGER").toUpperCase();
    m.requestSettled = true;
    const what = m.request === "meal" ? "HOT MEAL" : m.request === "quiet" ? "QUIET RUN" : m.request === "star" ? "STAR UP CLOSE" : "VIEW";
    if (m.requestMet) { m.mood = Math.min(100, (m.mood ?? 60) + 15); out.push(`${name} GOT THE ${what} THEY ASKED FOR. +${m.tip ?? 0}CR TIP AT THE END OF THE FARE.`); }
    else { m.tip = 0; m.mood = Math.max(0, (m.mood ?? 60) - 6); out.push(`${name} ASKED FOR A ${what} AND DIDN'T GET ONE. NOTED, QUIETLY.`); }
  }
}
// Sights along the way: tourists pay for what they saw. Their booked sight also completes the fare.
export function logSight(p: PlayerState, kind: SightKind, label: string, systemId: string, planetIdx?: number): boolean {
  let any = false;
  for (const m of passengersAboard(p)) {
    if (m.request === "view" && !m.requestMet) { m.requestMet = true; any = true; }
    if (m.passengerKind !== "tourist") continue;
    m.sights ??= [];
    if (!m.sights.includes(label)) { m.sights.push(label); any = true; m.mood = Math.min(100, (m.mood ?? 60) + 8); }
    if (!m.sightSeen && m.sightKind === kind && (m.sightSystemId ?? m.targetSystemId) === systemId && (kind !== "planet" && kind !== "drifter" || m.sightPlanetIdx === planetIdx)) { m.sightSeen = true; any = true; }
  }
  return any;
}
export function passengerPay(m: Mission): number {
  const mood = m.mood ?? 60;
  const extra = m.passengerKind === "tourist" ? Math.min(3, Math.max(0, (m.sights?.length ?? 0) - 1)) * 0.15 : 0;
  return Math.round(m.reward * (0.6 + (mood / 100) * 0.6 + extra)) + (m.requestMet ? (m.tip ?? 0) : 0);
}

// ---------- Notables: passengers whose journeys matter ----------
export type NotableKind = "senator" | "heir" | "singer";
export interface Notable { id: string; kind: NotableKind; name: string; factionId: string; synTag?: string; carried: number; lastMood: number }
export function assignNotables(w: Pick<World, "systems" | "syndicates">, rng: RNG): Notable[] {
  const facs = [...new Set(Object.values(w.systems).map((s) => s.factionId).filter((f) => f !== "vex"))];
  const syn = (w.syndicates ?? [])[0];
  const out: Notable[] = [
    { id: "senator", kind: "senator", name: `Senator ${genPersonName(rng).split(" ")[1] ?? "Vance"}`, factionId: facs.length ? rng.pick(facs) : "tsc", carried: 0, lastMood: 60 },
    { id: "heir", kind: "heir", name: genPersonName(rng), factionId: facs.length ? rng.pick(facs) : "tsc", synTag: syn?.tag, carried: 0, lastMood: 60 },
    { id: "singer", kind: "singer", name: genPersonName(rng), factionId: facs.length ? rng.pick(facs) : "tsc", carried: 0, lastMood: 60 },
  ];
  return out;
}
export function notableById(w: World, id?: string): Notable | null { return id ? (w.notables ?? []).find((n) => n.id === id) ?? null : null; }
// Sometimes one of them wants a ship: a VIP fare with a name the galaxy knows
export function notableFare(w: World, station: StationDef, target: SystemDef, tStation: StationDef, rng: RNG): Mission | null {
  const pool = (w.notables ?? []).filter((n) => n.carried < 3);
  if (!pool.length || !rng.chance(0.15)) return null;
  const n = rng.pick(pool);
  const desc = n.kind === "senator" ? `${n.name} of the ${facName(n.factionId)} needs ${tStation.name}, ${target.name}, quietly and in comfort. Luxuries aboard would be noticed. Friends in high places would too.`
    : n.kind === "heir" ? `${n.name}, heir to ${n.synTag ? `the [${n.synTag}] concern` : "a trading house"}, wants ${tStation.name}, ${target.name}. Wants it fast. Pays like it.`
    : `${n.name}, the singer, is playing ${tStation.name}, ${target.name}. The crew will want to be aboard for this one.`;
  return {
    id: `fare-notable-${n.id}-${w.missionCounter++}`, kind: "passenger", accepted: false, done: false, tier: 0,
    title: `${n.kind === "senator" ? "Senator" : n.kind === "heir" ? "The heir" : "The singer"}: ${n.name}`, desc,
    fromStationId: station.id, targetSystemId: target.id, targetStationId: tStation.id,
    passengerName: n.name, passengerKind: n.kind === "heir" ? "courier" : "vip", sightSeen: false, sights: [],
    mood: 60, demand: n.kind === "senator" ? "lux" : n.kind === "singer" ? "food" : null, patience: n.kind === "heir" ? 2 : 4, docksAboard: 0, party: n.kind === "singer" ? 3 : 1,
    reward: 1500 + rng.int(0, 600), repReward: 4, notable: n.id,
  };
}
// Delivered: what a happy or a sour notable does about it
export function notableOutcome(w: World, m: Mission): string | null {
  const n = notableById(w, m.notable);
  if (!n) return null;
  const p = w.player; const mood = m.mood ?? 60;
  n.carried++; n.lastMood = mood;
  if (mood >= 80) {
    if (n.kind === "senator") { if (!hasCharter(w, n.factionId)) { (p.charters ??= []).push(n.factionId); return `${n.name.toUpperCase()} MAKES A CALL FROM THE RAMP. BY MORNING YOU HOLD A ${facName(n.factionId).toUpperCase()} CHARTER. 'FRIENDS IN HIGH PLACES,' THEY SAID.`; } adjustRep(w, n.factionId, 15); return `${n.name.toUpperCase()} SPEAKS WELL OF YOU WHERE IT COUNTS. ${facName(n.factionId).toUpperCase()} STANDING UP.`; }
    if (n.kind === "heir") { if (n.synTag) { p.synRep ??= {}; p.synRep[n.synTag] = Math.min(100, (p.synRep[n.synTag] ?? 0) + 20); return `${n.name.toUpperCase()} WIRES THE FAMILY. [${n.synTag}] REMEMBERS WHO GOT THE HEIR HOME ON TIME. STANDING +20.`; } p.credits += 800; return `${n.name.toUpperCase()} TIPS LIKE AN HEIR. +800CR.`; }
    for (const c of p.crew) c.morale = Math.min(100, c.morale + 15);
    pushEvent(w, { t: w.time, kind: "discovery", systemId: p.systemId, text: `${n.name} played a set in the bunk room of ${p.shipName ?? "an independent ship"} on the way in; the crew are still humming it` });
    return `${n.name.toUpperCase()} SINGS ONE FOR THE CREW BEFORE THE RAMP GOES DOWN. NOBODY WILL SHUT UP ABOUT IT. MORALE UP.`;
  }
  if (mood < 30) {
    if (n.kind === "senator") { adjustRep(w, n.factionId, -8); return `${n.name.toUpperCase()} LEAVES WITHOUT A WORD. A ${facName(n.factionId).toUpperCase()} MEMO ABOUT YOUR SHIP GOES OUT BEFORE YOU'VE REFUELLED.`; }
    if (n.kind === "heir" && n.synTag) { p.synRep ??= {}; p.synRep[n.synTag] = Math.max(-100, (p.synRep[n.synTag] ?? 0) - 10); return `${n.name.toUpperCase()} TELLS THE FAMILY EXACTLY HOW LONG IT TOOK. [${n.synTag}] STANDING -10.`; }
    pushEvent(w, { t: w.time, kind: "shock", systemId: p.systemId, text: `${n.name} wrote a song about a ship. It is not a kind song.` });
    return `${n.name.toUpperCase()} WRITES A SONG ABOUT THE TRIP. IT IS NOT A KIND SONG. IT IS, UNFORTUNATELY, CATCHY.`;
  }
  return `${n.name.toUpperCase()} DISEMBARKS WITH A NOD. YOU'LL HEAR THEIR NAME AGAIN.`;
}

// ---------- Contacts: the pilots you keep meeting ----------
// A galaxy has a dozen captains who fly its lanes. Help one and they remember;
// help them twice and they're a friend: warm hails, a seat in the lounge at
// their home station, a letter now and then with something in it.
export interface NpcCaptain { id: string; name: string; ship: string; homeStationId: string; disposition: number; met: number; helped: number; lastSeen: number }
export interface Letter { dueT: number; from: string; text: string; gift?: { credits?: number; parts?: number; data?: number }; read?: boolean; replied?: boolean }
// Write back. Captains remember it; old shipmates pass it round the bar; the crew like a ship that answers its mail.
export function replyToLetter(w: World, m: Letter): string {
  const p = w.player;
  if (m.replied) return "YOU'VE ALREADY WRITTEN BACK. THEY'LL ANSWER IN THEIR OWN TIME.";
  m.replied = true;
  const name = m.from.split(",")[0].trim();
  const cap = (w.captains ?? []).find((c) => c.name === name);
  if (cap) { cap.disposition = Math.min(5, cap.disposition + 1); cap.met++; logEntry(w, `Wrote back to ${cap.name}`); return `A LINE BACK TO ${cap.name.toUpperCase()} ON THE ${cap.ship.toUpperCase()}. CAPTAINS REMEMBER WHO WRITES.`; }
  const al = (p.alumni ?? []).find((a) => a.name === name);
  if (al) { for (const c of p.crew) c.morale = Math.min(100, c.morale + 2); logEntry(w, `Wrote back to ${al.name}`); return `A LINE BACK TO ${al.name.toUpperCase()}. THE CREW HEAR THE OLD HAND STILL GETS POST FROM THIS SHIP. MORALE UP.`; }
  logEntry(w, `Wrote back to ${name}`);
  return `A LINE BACK TO ${name.toUpperCase()}. IT'LL FIND THEM, OR IT WON'T. YOU WROTE IT.`;
}
const SHIP_NAMES = ["Long Patience", "Salt and Iron", "Quiet Ledger", "Ferrous Dawn", "Blue Hour", "Second Chance", "Margit's Folly", "Stubborn Mule", "Halfway House", "Late Supper", "Old Argument", "Tin Sparrow"];
export function assignCaptains(systems: Record<string, SystemDef>, rng: RNG): NpcCaptain[] {
  const stations = Object.values(systems).flatMap((s) => s.stations.filter((st) => !st.military));
  const out: NpcCaptain[] = [];
  if (!stations.length) return out;
  const n = Math.min(12, Math.max(6, Math.round(stations.length / 2)));
  for (let i = 0; i < n; i++) {
    const st = rng.pick(stations);
    out.push({ id: `cap${i}`, name: genPersonName(rng), ship: SHIP_NAMES[i % SHIP_NAMES.length], homeStationId: st.id, disposition: 0, met: 0, helped: 0, lastSeen: -1e9 });
  }
  return out;
}
export function captainByName(w: World, name: string | undefined): NpcCaptain | null {
  if (!name) return null;
  return (w.captains ?? []).find((c) => c.name === name) ?? null;
}
export function isFriend(c: NpcCaptain): boolean { return c.disposition >= 2; }
// A trader spawning: sometimes it's one of the regulars, likelier near their home
export function pickCaptainFor(w: World, systemId: string, rng: RNG): NpcCaptain | null {
  const caps = w.captains ?? [];
  if (!caps.length || !rng.chance(0.35)) return null;
  const local = caps.filter((c) => findStation(w, c.homeStationId)?.sys.id === systemId);
  const c = local.length && rng.chance(0.6) ? rng.pick(local) : rng.pick(caps);
  c.met++; c.lastSeen = w.time;
  return c;
}
const HELP_LINES: Record<string, string[]> = {
  repair: ["Engines lit, thanks to you. I owe you one, and I keep count.", "You didn't have to stop. Most don't. I'll remember the hull."],
  medic: ["Two of mine are alive because you had a medic and the decency to send them. That doesn't get forgotten.", "The kid's sitting up and complaining about the food. That's you. Thank you."],
  tow: ["Towed home like a barge. I'll never live it down, and I'll never forget it.", "The yard says another hour and the reactor would have gone. You didn't wait an hour."],
  escort: ["Never seen a corsair turn away so fast. Fly with me again any time.", "Made it in with all the cargo. First time this month. That's your doing."],
  part: ["A spare part off your own shelf. I know what those cost out here.", "One part, passed across a line, and I'm home. Small things."],
};
export function helpCaptain(w: World, name: string | undefined, kind: keyof typeof HELP_LINES, rng: RNG): string | null {
  const c = captainByName(w, name);
  if (!c) return null;
  c.disposition = Math.min(3, c.disposition + 1); c.helped++; c.lastSeen = w.time;
  const home = findStation(w, c.homeStationId)?.st.name ?? "somewhere";
  const gift = rng.chance(0.5) ? { credits: rng.int(150, 400) } : rng.chance(0.5) ? { parts: 2 } : { data: 120 };
  (w.mailQueue ??= []).push({ dueT: w.time + rng.int(300, 900), from: `${c.name}, ${c.ship}`, text: `${rng.pick(HELP_LINES[kind])} Look me up at ${home}.`, gift });
  if (c.disposition >= 2 && c.helped === 2) return `${c.name.toUpperCase()} OF THE ${c.ship.toUpperCase()} CALLS YOU A FRIEND NOW. THEIR HOME IS ${home.toUpperCase()}.`;
  return null;
}
// A favour for a friend: something of theirs carried to a nearby station. No fee; a letter and a gift later,
// and a captain who remembers.
export function favourFor(w: World, cap: NpcCaptain, station: StationDef, rng: RNG): Mission | null {
  const sys = findStation(w, station.id)?.sys; if (!sys) return null;
  const pool = sys.links.map((l) => w.systems[l]).filter(Boolean).flatMap((s2) => s2.stations.filter((x) => !x.military).map((st) => ({ sys: s2, st })));
  if (!pool.length) return null;
  const t = rng.pick(pool);
  const item = rng.pick(["a sealed letter", "a box of seedlings", "a repaired clock", "a photograph in a frame", "a bottle of something older than either of you", "a child's drawing, folded twice"]);
  return {
    id: `favour-${cap.id}-${Math.floor(w.time)}`, kind: "post", accepted: false, done: false, tier: 0,
    title: `A favour for ${cap.name}: ${t.st.name}`,
    desc: `${item.charAt(0).toUpperCase() + item.slice(1)} for someone at ${t.st.name}, ${t.sys.name}. ${cap.name} can't get there this month. No fee; they'll remember.`,
    fromStationId: station.id, targetSystemId: t.sys.id, targetStationId: t.st.id, reward: 0, repReward: 1, favourFor: cap.id,
  };
}
export function favourDone(w: World, m: Mission, rng: RNG): string | null {
  const cap = (w.captains ?? []).find((c) => c.id === m.favourFor); if (!cap) return null;
  cap.helped++; cap.disposition = Math.min(5, cap.disposition + 1); cap.met++;
  const home = findStation(w, cap.homeStationId)?.st.name ?? "home";
  const gift = rng.chance(0.5) ? { credits: rng.int(150, 400) } : rng.chance(0.5) ? { parts: 2 } : { data: 80 };
  (w.mailQueue ??= []).push({ dueT: w.time + rng.int(200, 700), from: `${cap.name}, ${cap.ship}`, text: rng.pick([`It got there. She cried. I owe you more than this, but take this. Look me up at ${home}.`, `You didn't have to. That's why it matters. Drinks are on me for a year.`, `They said the box arrived in one piece. Nobody's managed that before. Thank you.`]), gift });
  logEntry(w, `Carried a favour for ${cap.name}`);
  return `${cap.name.toUpperCase()} WILL HEAR IT ARRIVED. THAT'S THE KIND OF THING THAT COMES BACK AROUND.`;
}
// A picture turned in at a research station hangs in its museum, under your name
export function hangPicture(w: World, st: StationDef, m: Mission, by: string): string | null {
  if (st.type !== "research" || !m.photo) return null;
  (st.museum ??= []).push({ by, item: `a picture of ${m.photo.label}`, t: w.time }); if (st.museum.length > 12) st.museum.shift();
  w.player.donations = (w.player.donations ?? 0) + 1;
  logEntry(w, `A picture of ${m.photo.label} hangs in the ${st.name} museum`);
  return `THE MUSEUM HANGS YOUR PICTURE OF ${m.photo.label.toUpperCase()} WITH YOUR NAME UNDER IT.`;
}
// A postcard taken: any picture missions it satisfies are marked done
export function photoTaken(w: World, where: { systemId: string; x: number; y: number; orbitPlanetIdx?: number; inOrbit: boolean }): string[] {
  const out: string[] = [];
  // tourists aboard who've just seen their sight love a picture of it
  for (const m of passengersAboard(w.player)) {
    if (m.passengerKind !== "tourist" || !m.sightSeen || m.postcarded || m.sightSystemId !== undefined && m.sightSystemId !== where.systemId) continue;
    if (m.targetSystemId !== where.systemId && m.sightSystemId !== where.systemId) continue;
    m.postcarded = true; m.mood = Math.min(100, (m.mood ?? 60) + 8);
    out.push(`${(m.passengerName ?? "YOUR TOURISTS").toUpperCase()}'S PARTY WANTS A COPY OF THAT ONE. MOOD UP.`);
  }
  for (const m of w.player.missions) {
    if (m.kind !== "photo" || !m.accepted || m.done || m.photoDone || !m.photo || m.photo.systemId !== where.systemId) continue;
    const ok = m.photo.wonderId ? !where.inOrbit && wondersIn(w, where.systemId).some((wd) => wd.id === m.photo!.wonderId && Math.hypot(wd.x - where.x, wd.y - where.y) <= WONDER_RANGE)
      : where.inOrbit && where.orbitPlanetIdx === m.photo.planetIdx;
    if (ok) { m.photoDone = true; out.push(`THAT'S THE PICTURE: ${m.photo.label.toUpperCase()}. TURN IT IN AT ${findStation(w, m.fromStationId)?.st.name.toUpperCase() ?? "THE STATION"}`); }
  }
  return out;
}
// Carry the post and sometimes a letter in the bag is for you: a stranger who saw your name on the manifest
export function postDelivered(w: World, rng: RNG): string | null {
  const p = w.player;
  p.postRuns = (p.postRuns ?? 0) + 1;
  if (!rng.chance(0.3)) return null;
  const from = genPersonName(rng);
  const text = rng.pick([
    "You don't know me. I saw your ship's name on the manifest and my grandmother flew one called that. Thank you for carrying this.",
    "The last three bags came late or not at all. Yours came. There's a coffee waiting for you here whenever.",
    "I write to every ship that carries the post. Most don't answer. You don't have to. Safe lanes.",
    "My son is on a hauler out past the gate. If you ever pass the Long Patience, tell him his mother says eat.",
  ]);
  (w.mailQueue ??= []).push({ dueT: w.time + rng.int(60, 400), from, text, gift: rng.chance(0.4) ? { credits: rng.int(40, 120) } : undefined });
  return `SOMEBODY AT THE POST OFFICE SLIPS A NOTE INTO YOUR HAND. IT'LL FIND YOU AT A DOCK.`;
}
export function tickMail(w: World): string[] {
  const p = w.player; const out: string[] = [];
  const due = (w.mailQueue ?? []).filter((m) => w.time >= m.dueT);
  w.mailQueue = (w.mailQueue ?? []).filter((m) => w.time < m.dueT);
  for (const m of due) {
    (p.mail ??= []).push(m); if (p.mail.length > 20) p.mail.shift();
    const g = m.gift ?? {};
    if (g.credits) { p.credits += g.credits; ledger(p, "letters", g.credits); }
    if (g.parts) addCargo(p, "parts", g.parts);
    if (g.data) p.expData = (p.expData ?? 0) + g.data;
    const giftText = g.credits ? ` (${g.credits}CR ENCLOSED)` : g.parts ? ` (${g.parts} SPARE PARTS IN THE CRATE)` : g.data ? ` (${g.data} DATA ON A CHIP)` : "";
    out.push(`LETTER FROM ${m.from.toUpperCase()}${giftText} - READ IT ON THE NEWS TAB`);
  }
  return out;
}
// A friend can be asked to fly alongside for a few dockings. Their ship follows
// yours, engages corsairs, and peels off for home when the time is up.
export const RIDE_ALONG_DOCKS = 3;
export function askRideAlong(p: PlayerState, c: NpcCaptain): string {
  if (p.companion) return `${p.companion.name.toUpperCase()} IS ALREADY FLYING WITH YOU`;
  p.companion = { name: c.name, ship: c.ship, docks: RIDE_ALONG_DOCKS };
  return `${c.name.toUpperCase()}: 'THE ${c.ship.toUpperCase()} IS FUELLED. THREE DOCKINGS, THEN I'VE GOT MY OWN RUNS. LEAD ON.'`;
}
export function tickRideAlong(p: PlayerState): string | null {
  if (!p.companion) return null;
  p.companion.docks--;
  if (p.companion.docks <= 0) { const n = p.companion.name.toUpperCase(); p.companion = null; return `${n} PEELS OFF FOR HOME. 'ANY TIME. I MEAN THAT.'`; }
  return null;
}
// A used hull remembers its last captain
export const HULL_QUIRKS = ["a dent in the galley bulkhead nobody will explain", "a lucky charm wired to the console", "a smell of coffee that never quite leaves", "a name scratched under the pilot's seat", "a playlist still in the comms buffer", "a plant, dead, still in its pot by the airlock", "a tally of jumps carved by the bunk", "a scorch on the reactor housing, old and painted over"];
export function hullHistoryFor(w: World, rng: RNG): { previous: string; quirk: string } | null {
  if (!rng.chance(0.6)) return null;
  const caps = w.captains ?? [];
  const previous = caps.length && rng.chance(0.5) ? rng.pick(caps).name : genPersonName(rng);
  return { previous, quirk: rng.pick(HULL_QUIRKS) };
}
// Home port: one station you call yours
export function setHomePort(p: PlayerState, stationId: string): void { p.homePort = stationId; }

// A name on the lanes: what the stations call you, earned by what you've done most.
export function captainNickname(w: World): string | null {
  const p = w.player;
  if ((["explorer", "trader", "miner", "rescuer"] as const).every((k) => rankOf(p, k).title === "ELITE")) return "MASTER OF THE LANES";
  if (p.regatta === 3) return "THE CHAMPION";
  if ((p.rescues ?? 0) >= 5) return "THE LIFEBOAT";
  if ((p.postRuns ?? 0) >= 10) return "THE POSTMAN";
  if ((p.races ?? 0) >= 3 && Object.keys(p.raceBeaten ?? {}).length) return "RING RUNNER";
  if ((p.fares ?? 0) >= 10) return "THE LINER";
  if (p.discoveries >= 5) return "THE PATHFINDER";
  if ((p.tows ?? 0) >= 3) return "THE TUG";
  if ((w.infra ?? []).some((i) => i.owner !== "THE KEEPER")) return "THE LAMPLIGHTER";
  if ((p.donations ?? 0) >= 3) return "THE CURATOR";
  if ((p.lineage ?? []).length >= 2) return "OF THE LINE";
  if ((p.alumni ?? []).length >= 3) return "THE OLD HAND";
  return null;
}

// Watches: with two or more aboard, half the crew are on watch at any time and the
// rest are off. The watch changes every four minutes of ship time.
export const WATCH_LEN = 240;
export function watchIndex(time: number): number { return Math.floor(time / WATCH_LEN); }
export function onWatch(p: PlayerState, i: number, time: number): boolean {
  if (p.crew.length < 2) return true;
  return (i + watchIndex(time)) % 2 === 0;
}

// The ring race: six rings laid out around a station, flown in order against the clock.
// The course is fixed when you launch; the station drifts a little underneath it and nobody minds.
export const RACE_GATES = 6;
export function raceCourse(st: StationDef, seed: number, rings = RACE_GATES, spread = 1): { x: number; y: number }[] {
  const rng = new RNG(hashStr(`race:${seed}:${st.id}:${rings}`));
  const cx = Math.cos(st.angle) * st.orbit, cy = Math.sin(st.angle) * st.orbit;
  const r = (260 + rng.int(0, 90)) * spread, a0 = rng.next() * Math.PI * 2, dir = rng.chance(0.5) ? 1 : -1;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < rings; i++) {
    const a = a0 + dir * (i / rings) * Math.PI * 2, rr = r * (0.7 + rng.next() * 0.6);
    out.push({ x: Math.round(cx + Math.cos(a) * rr), y: Math.round(cy + Math.sin(a) * rr) });
  }
  return out;
}
// Par is a brisk, clean run: the course length at a modest cruise, plus a second a ring for the turns
export function racePar(gates: { x: number; y: number }[]): number {
  let len = 0;
  for (let i = 1; i < gates.length; i++) len += Math.hypot(gates[i].x - gates[i - 1].x, gates[i].y - gates[i - 1].y);
  return Math.round(len / 150 + gates.length);
}
export function racePrize(t: number, par: number, now = Date.now()): number {
  return Math.round((250 + (t <= par ? 200 : 0) + Math.max(0, par - t) * 25) * (isOccasion("lanes", now) ? 1.5 : 1));
}
// The border: every week one system on a faction seam is contested. The house lean of each side plus
// what captains do there (deliveries, votes, stakes) decides it on Monday; if the challenger wins, the
// system and its stations change hands. Your push is remembered and rewarded by the side that took it.
export function borderContest(w: World, now = Date.now()): { systemId: string; incumbent: string; challenger: string } | null {
  const wk = weekKey(now);
  const seams = Object.values(w.systems).filter((s) => s.factionId && s.factionId !== "vex" && s.stations.length && s.links.some((l) => { const o = w.systems[l]; return o && o.factionId && o.factionId !== "vex" && o.factionId !== s.factionId; }));
  if (!seams.length) return null;
  const sys = seams[hashStr(`border:${wk}:${w.seed}`) % seams.length];
  const rivals = [...new Set(sys.links.map((l) => w.systems[l]?.factionId).filter((f): f is string => !!f && f !== "vex" && f !== sys.factionId))];
  if (!rivals.length) return null;
  return { systemId: sys.id, incumbent: sys.factionId!, challenger: rivals[hashStr(`chal:${wk}:${sys.id}`) % rivals.length] };
}
export function pushInfluence(w: World, systemId: string, factionId: string, n: number, now = Date.now()): boolean {
  const c = borderContest(w, now);
  if (!c || c.systemId !== systemId || (factionId !== c.incumbent && factionId !== c.challenger)) return false;
  const k = `${weekKey(now)}:${systemId}:${factionId}`;
  (w.player.influence ??= {})[k] = ((w.player.influence ?? {})[k] ?? 0) + n;
  return true;
}
export function borderStanding(w: World, now = Date.now()): { c: { systemId: string; incumbent: string; challenger: string }; inc: number; chal: number; yoursInc: number; yoursChal: number } | null {
  const c = borderContest(w, now); if (!c) return null;
  const wk = weekKey(now);
  const lean = 8 + (hashStr(`lean:${wk}:${c.systemId}`) % 9); // the house: 8..16 for the incumbent
  const push = 6 + (hashStr(`push:${wk}:${c.systemId}`) % 9); // the challenger's own effort: 6..14
  const yoursInc = w.player.influence?.[`${wk}:${c.systemId}:${c.incumbent}`] ?? 0;
  const yoursChal = w.player.influence?.[`${wk}:${c.systemId}:${c.challenger}`] ?? 0;
  return { c, inc: lean + yoursInc, chal: push + yoursChal, yoursInc, yoursChal };
}
// A letter from your home port's harbour office each week: the vote, the border, your holdings, a word
export function lanesReport(w: World, now = Date.now()): Letter | null {
  const p = w.player;
  const home = p.homePort ? findStation(w, p.homePort) : null;
  if (!home) return null;
  const bs = borderStanding(w, now);
  const holdings = Object.entries(p.stakes ?? {}).map(([id, n]) => `${findStation(w, id)?.st.name ?? "?"} ${n}`).join(", ");
  const bits: string[] = [];
  if (bs) bits.push(`${w.systems[bs.c.systemId]?.name ?? "?"} is contested this week: ${facName(bs.c.incumbent)} ${bs.inc}, ${facName(bs.c.challenger)} ${bs.chal}.`);
  if (holdings) bits.push(`Your holdings: ${holdings}.`);
  bits.push((p.dockings ?? {})[home.st.id] ? `Your berth is kept.` : `Your berth is kept, though we haven't seen you in a while.`);
  return { dueT: w.time + 30, from: `${home.st.name} harbour office`, text: `The lanes report. ${bits.join(" ")}`, gift: (p.stakes?.[home.st.id] ?? 0) >= 10 ? { credits: 50 } : undefined };
}
// Called at a dock: settles any week that has ended since the last time
export function resolveBorder(w: World, now = Date.now()): string | null {
  const wk = weekKey(now);
  if (w.borderWeek === wk) return null;
  const prevWeek = w.borderWeek;
  w.borderWeek = wk;
  if (!prevWeek) return null;
  const prevNow = new Date(prevWeek + "T12:00:00Z").getTime();
  const st = borderStanding(w, prevNow); if (!st) return null;
  const sys = w.systems[st.c.systemId]; if (!sys) return null;
  const flipped = st.chal > st.inc;
  const yours = flipped ? st.yoursChal : st.yoursInc;
  if (flipped) { sys.factionId = st.c.challenger; for (const s2 of sys.stations) s2.factionId = st.c.challenger; }
  (w.borderLog ??= []).push({ week: prevWeek, systemId: sys.id, from: st.c.incumbent, to: st.c.challenger, flipped, yours });
  if (w.borderLog.length > 12) w.borderLog.shift();
  const winner = flipped ? st.c.challenger : st.c.incumbent;
  if (yours > 0) adjustRep(w, winner, Math.min(10, 2 + yours));
  const text = flipped ? `${sys.name} changes hands: the ${facName(st.c.challenger)} take it from the ${facName(st.c.incumbent)}` : `${sys.name} holds: the ${facName(st.c.incumbent)} see off the ${facName(st.c.challenger)}`;
  w.news.unshift({ headline: text.toUpperCase().slice(0, 60), body: `${text}. ${yours ? `Captains who pushed for the winning side, you among them, are remembered.` : "The captains who pushed for it are remembered."}` });
  if (w.news.length > 12) w.news.pop();
  logEntry(w, text + (yours ? ` (your push: ${yours})` : ""));
  return `THE BORDER: ${sys.name.toUpperCase()} ${flipped ? `FALLS TO THE ${facName(st.c.challenger).toUpperCase()}` : `HOLDS FOR THE ${facName(st.c.incumbent).toUpperCase()}`}${yours ? ". YOUR PUSH COUNTED: STANDING UP" : ""}`.slice(0, 96);
}

// Stakes: buy into a station. Shares cost what the place is worth; every docking there pays a dividend
// on what it's doing, and the crowd starts calling you one of the owners.
export const STAKE_CAP = 50;
export function stakePrice(w: World, st: StationDef): number {
  const pr = stationProfile(w, st);
  const held = w.player.stakes?.[st.id] ?? 0;
  return Math.round((300 + pr.population / 120) * (1 + held * 0.04));
}
export function stakeDividend(w: World, st: StationDef): number {
  const held = w.player.stakes?.[st.id] ?? 0;
  if (!held) return 0;
  const pr = stationProfile(w, st);
  const busy = crisisAt(w, st.id) ? 0.5 : galaxyEventAt(w, findStation(w, st.id)?.sys.id ?? "")?.kind === "festival" ? 1.6 : galaxyEventAt(w, findStation(w, st.id)?.sys.id ?? "")?.kind === "strike" ? 0.3 : 1;
  return Math.round(held * (3 + pr.population / 9000) * busy);
}
export function buyStake(w: World, st: StationDef, n: number): string {
  const p = w.player;
  if (st.military) return "THE NAVY DOESN'T SELL SHARES";
  const held = p.stakes?.[st.id] ?? 0;
  if (held + n > STAKE_CAP) return `${STAKE_CAP} SHARES IS ALL ONE CAPTAIN MAY HOLD HERE`;
  let cost = 0; for (let i = 0; i < n; i++) cost += Math.round((300 + stationProfile(w, st).population / 120) * (1 + (held + i) * 0.04));
  if (p.credits < cost) return `${n} SHARE${n > 1 ? "S" : ""} HERE COSTS ${cost}CR. YOU'RE SHORT`;
  p.credits -= cost; ledger(p, "stakes", -cost);
  (p.stakes ??= {})[st.id] = held + n;
  { const sys = findStation(w, st.id)?.sys; if (sys) pushInfluence(w, sys.id, st.factionId, n); }
  if (held === 0) logEntry(w, `Bought into ${st.name}`);
  return `${n} SHARE${n > 1 ? "S" : ""} IN ${st.name.toUpperCase()} FOR ${cost}CR. ${held + n} HELD`;
}
export function collectStake(w: World, st: StationDef): number {
  const d = stakeDividend(w, st);
  if (d) { w.player.credits += d; ledger(w.player, "stakes", d); }
  return d;
}
// Your other holdings pay a quarter on any docking: the post carries the cheques
export function collectRemoteStakes(w: World, hereId: string): { total: number; n: number } {
  let total = 0, n = 0;
  for (const id of Object.keys(w.player.stakes ?? {})) {
    if (id === hereId) continue;
    const st = findStation(w, id)?.st; if (!st) continue;
    const d = Math.round(stakeDividend(w, st) / 4);
    if (d) { total += d; n++; }
  }
  if (total) { w.player.credits += total; ledger(w.player, "stakes", total); }
  return { total, n };
}
export function totalShares(p: PlayerState): number { return Object.values(p.stakes ?? {}).reduce((a, b) => a + b, 0); }

// The regatta: three courses, three stations, a title at the end. Entered by finishing any race.
export function enterRegatta(w: World, firstStationId: string): string | null {
  const p = w.player;
  if (p.regatta !== undefined) return null;
  const first = findStation(w, firstStationId); if (!first) return null;
  const rng = new RNG(hashStr(`regatta:${w.seed}:${firstStationId}`));
  const civil = (sys: SystemDef) => sys.stations.filter((st) => !st.military && st.id !== firstStationId);
  const rival = rivalOf(w);
  const rivalHome = rival ? findStation(w, rival.homeStationId) : null;
  const linked = first.sys.links.map((l) => w.systems[l]).filter((s2) => s2 && civil(s2).length);
  const second = rivalHome && rivalHome.st.id !== firstStationId ? rivalHome.st : linked.length ? rng.pick(civil(rng.pick(linked))) : civil(first.sys)[0];
  if (!second) return null;
  const far = Object.values(w.systems).filter((s2) => s2.id !== first.sys.id && civil(s2).some((st) => st.id !== second.id));
  const third = far.length ? rng.pick(civil(rng.pick(far)).filter((st) => st.id !== second.id)) : null;
  if (!third) return null;
  p.regatta = 0; p.regattaCourse = [firstStationId, second.id, third.id];
  return `THE MARSHAL: 'YOU'VE GOT THE HANDS FOR THE REGATTA. THREE COURSES. FIRST, UNDER PAR HERE AT ${first.st.name.toUpperCase()}.'`;
}
export function regattaObjective(w: World): string | null {
  const p = w.player;
  if (p.regatta === undefined || !p.regattaCourse) return null;
  const name = (i: number) => (findStation(w, p.regattaCourse![i])?.st.name ?? "?").toUpperCase();
  const sysName = (i: number) => (findStation(w, p.regattaCourse![i])?.sys.name ?? "?").toUpperCase();
  if (p.regatta === 0) return `THE REGATTA 1/3: RUN THE RINGS UNDER PAR AT ${name(0)}, ${sysName(0)}`;
  if (p.regatta === 1) return `THE REGATTA 2/3: TAKE THE COURSE RECORD AT ${name(1)}, ${sysName(1)}`;
  if (p.regatta === 2) return `THE REGATTA 3/3: THE GRAND COURSE AT ${name(2)}, ${sysName(2)} - 15% UNDER PAR`;
  return null;
}
export function regattaProgress(w: World, stationId: string, t: number, par: number, beatRecord: boolean): string | null {
  const p = w.player;
  if (p.regatta === undefined || !p.regattaCourse) return null;
  const c = p.regattaCourse;
  if (p.regatta === 0 && stationId === c[0] && t <= par) { p.regatta = 1; return `THE REGATTA: FIRST COURSE DONE. NEXT, THE RECORD AT ${(findStation(w, c[1])?.st.name ?? "?").toUpperCase()}.`; }
  if (p.regatta === 1 && stationId === c[1] && beatRecord) { p.regatta = 2; return `THE REGATTA: THE RECORD IS YOURS. ONE COURSE LEFT: ${(findStation(w, c[2])?.st.name ?? "?").toUpperCase()}, FIFTEEN UNDER PAR.`; }
  if (p.regatta === 2 && stationId === c[2] && t <= par * 0.85) { p.regatta = 3; logEntry(w, "Won the regatta: three courses, three stations, one title"); return "THE REGATTA: CHAMPION. THREE COURSES, THREE STATIONS. THE BARS WILL KNOW THE NAME BEFORE YOU DOCK."; }
  return null;
}

// Every course has a local record holder: a named captain with a time a shade over par.
// Beat it and the bar hears; if the holder is your rival, they hear too.
export function raceHolder(w: World, st: StationDef): { name: string; t: number; captain: NpcCaptain | null } {
  const rng = new RNG(hashStr(`holder:${w.seed}:${st.id}`));
  const caps = w.captains ?? [];
  const local = caps.filter((c) => c.homeStationId === st.id);
  const captain = local.length ? rng.pick(local) : caps.length ? rng.pick(caps) : null;
  const par = racePar(raceCourse(st, w.seed));
  const t = Math.round(par * (1.04 + rng.next() * 0.12) * 10) / 10;
  return { name: captain?.name ?? rng.pick(["Old Marrow", "Tess Okonkwo", "The Harbourmaster's Kid"]), t, captain };
}
export function beatHolder(w: World, st: StationDef, t: number): string | null {
  const h = raceHolder(w, st);
  if (t >= h.t) return null;
  const p = w.player;
  if ((p.raceBeaten ??= {})[st.id]) return null;
  p.raceBeaten[st.id] = true;
  if (h.captain && isRival(h.captain)) { h.captain.disposition = Math.max(-5, h.captain.disposition - 1); (w.mailQueue ??= []).push({ dueT: w.time + 300, from: `${h.captain.name}, ${h.captain.ship}`, text: "You took my time at the rings. Fine. I'll take it back. Don't get comfortable." }); return `${h.captain.name.toUpperCase()}: 'ENJOY IT WHILE IT LASTS.'`; }
  if (h.captain) { h.captain.met++; (w.mailQueue ??= []).push({ dueT: w.time + 300, from: `${h.captain.name}, ${h.captain.ship}`, text: "You took my time at the rings. Fair and square. First round's on me, next port we share.", gift: { credits: 80 } }); return `${h.captain.name.toUpperCase()}: 'ABOUT TIME SOMEBODY DID. DRINKS ON ME, NEXT TIME WE'RE IN TOGETHER.'`; }
  return `THE BAR HEARS ABOUT IT BEFORE YOU'VE DOCKED. ${h.name.toUpperCase()}'S TIME HAD STOOD FOR YEARS.`;
}
// Returns true when this is a new best at that station
export function recordRace(p: PlayerState, stationId: string, t: number): boolean {
  p.races = (p.races ?? 0) + 1;
  const best = (p.raceBest ??= {})[stationId];
  const tt = Math.round(t * 10) / 10;
  if (best === undefined || tt < best) { p.raceBest[stationId] = tt; return true; }
  return false;
}
export function isHome(p: PlayerState, stationId: string): boolean { return p.homePort === stationId; }
// Museums at research stations take relics and remember who brought them
export function donateRelic(w: World, st: StationDef, by: string): string | null {
  if (st.type !== "research") return null;
  const p = w.player;
  if (!removeCargo(p, "relics", 1)) return null;
  const item = `${["a carved stone", "a sealed data slate", "a drifter bone", "a coin from no mint", "a lamp that still burns", "a child's toy, very old"][(p.donations ?? 0) % 6]}`;
  (st.museum ??= []).push({ by, item, t: w.time }); if (st.museum.length > 12) st.museum.shift();
  p.donations = (p.donations ?? 0) + 1;
  adjustRep(w, st.factionId, 4);
  pushEvent(w, { t: w.time, kind: "discovery", systemId: findStation(w, st.id)?.sys.id ?? p.systemId, text: `${st.name}'s museum unveils ${item}, donated by ${by}` });
  return `THE CURATOR TAKES ${item.toUpperCase()} WITH BOTH HANDS. A CARD WITH YOUR NAME GOES UNDER THE GLASS. STANDING UP.`;
}

// A rival: a regular who took against you (one starts that way). They grab fares,
// beat you to sights, undercut your routes and talk on the wire. Helping them
// when they're in trouble is the way back; disposition is one number for both.
// Berth neighbours: captains you know whose ships are in the bays this week. Home-port captains
// you have met, the rival whenever they are home, and now and then a friend passing through.
export function berthedCaptains(w: World, stationId: string, now = Date.now()): NpcCaptain[] {
  const wk = weekKey(now);
  return (w.captains ?? []).filter((c) => (c.homeStationId === stationId && (c.met > 0 || isRival(c))) || (isFriend(c) && hashStr(`berth:${c.id}:${stationId}:${wk}`) % 6 === 0)).slice(0, 2);
}
export function rivalOf(w: World): NpcCaptain | null {
  const caps = (w.captains ?? []).filter((c) => c.disposition <= -1);
  if (!caps.length) return null;
  return caps.sort((a, b) => a.disposition - b.disposition)[0];
}
export function isRival(c: NpcCaptain): boolean { return c.disposition <= -1; }
export function seedRival(w: World, rng: RNG): NpcCaptain | null {
  const caps = w.captains ?? [];
  if (!caps.length || caps.some(isRival)) return null;
  const c = rng.pick(caps);
  c.disposition = -2;
  return c;
}
// At a dock: the rival may have been through first and taken the best fare
export function rivalTakesFare(w: World, fares: Mission[], rng: RNG): string | null {
  const r = rivalOf(w);
  if (!r || fares.length < 2 || !rng.chance(0.3)) return null;
  const best = [...fares].sort((a, b) => b.reward - a.reward)[0];
  fares.splice(fares.indexOf(best), 1);
  return `${r.name.toUpperCase()} OF THE ${r.ship.toUpperCase()} TOOK THE ${best.title.toUpperCase()} AN HOUR BEFORE YOU DOCKED. THEY LEFT A NOTE: 'TOO SLOW.'`;
}
// On a first sighting: the rival may have logged it already, and the wire knows
export function rivalBeatsYouTo(w: World, wd: Wonder, rng: RNG): boolean {
  const r = rivalOf(w);
  if (!r || wd.seen || !rng.chance(0.25)) return false;
  wd.seen = true; wd.seenBy = r.name;
  pushEvent(w, { t: w.time, kind: "discovery", systemId: wd.systemId, text: `${r.name} logged ${wd.name} first, and made sure everyone heard` });
  return true;
}
// Rivalry ends the day you help them; a run of good deeds makes a friend of an enemy
export function rivalryLine(w: World, c: NpcCaptain, rng: RNG): string {
  if (isRival(c)) return rng.pick(["SO YOU'RE THE ONE. STAY OUT OF MY LANES.", "I'VE HEARD ABOUT YOU. NONE OF IT GOOD, AND I MADE SURE OF THAT.", "THAT FARE WAS MINE. THE NEXT ONE WILL BE TOO."]);
  return "WE'RE SQUARE. FOR NOW.";
}
// Old shipmates write now and then: how's the ship, here's a little something
export function tickAlumniMail(w: World, rng: RNG): void {
  const p = w.player;
  const al = p.alumni ?? [];
  if (!al.length || !rng.chance(0.08)) return;
  const a = rng.pick(al);
  const home = findStation(w, a.stationId)?.st.name ?? "somewhere";
  const text = a.role === "captain" ? rng.pick([`How's my ship? Don't tell me. Tell me the crew are eating.`, `The pension's fine. The quiet is worse. Fly her well.`]) : rng.pick([`${home} is quiet. I miss the reactor hum. Is the ${p.cat ? p.cat.name : "galley"} still on the console?`, `They asked me here who taught me. I said the ship did. Give my best to the wall.`, `Found this in my kit. It's yours by rights.`]);
  (w.mailQueue ??= []).push({ dueT: w.time + rng.int(120, 600), from: `${a.name}, ${home}`, text, gift: rng.chance(0.5) ? { credits: rng.int(60, 200) } : rng.chance(0.5) ? { parts: 1 } : undefined });
}
export function friendsAt(w: World, stationId: string): NpcCaptain[] {
  return (w.captains ?? []).filter((c) => c.homeStationId === stationId && isFriend(c));
}

// ---------- Lore: a line of history for every system and world ----------
export function systemLore(w: World, sys: SystemDef): string {
  const rng = new RNG(hashStr(`lore:${w.seed}:${sys.id}`));
  const fac = FACTIONS.find((f) => f.id === sys.factionId)?.name ?? "nobody";
  const st = sys.stations[0]?.name;
  const pool = [
    `${sys.name} was charted by a survey ship that never filed the report; the name is from the captain's diary.`,
    `${sys.name} changed hands ${rng.int(2, 5)} times before the ${fac} kept it. The gates still carry the old codes.`,
    st ? `${st} began as a fuel dump for the first gate crews. The dump is still there, under the promenade.` : `${sys.name} has no station because the first three burned. Nobody says why.`,
    `The belt at ${sys.name} is younger than the stations: a moon came apart within living memory.`,
    `${sys.name}'s star was worshipped, once, by people who are gone. Their word for it meant "the patient one".`,
    `Every ship that jumps into ${sys.name} hears a half-second of an old song on the band. The relay engineers have given up.`,
    `${sys.name} was a prison system for a decade. The prisoners stayed and became the ${st ? "harbour office" : "belt crews"}.`,
    `The first child born in ${sys.name} is ${rng.int(60, 90)} now and still refuses to leave.`,
    `${sys.name} is where the ${fac} signed the gate treaty. The pen is in a museum somewhere else.`,
    `A comet split over ${sys.name} in the old calendar; half the settlements still keep the anniversary.`,
  ];
  return rng.pick(pool);
}
export function planetLore(w: World, sys: SystemDef, idx: number): string {
  const pl = sys.planets[idx]; if (!pl) return "";
  const rng = new RNG(hashStr(`plore:${w.seed}:${sys.id}:${idx}`));
  const gas = pl.palette >= 6;
  const pool = gas ? [
    `${pl.name} sings in radio: a slow chord that changes with the seasons. Drifters seem to like it.`,
    `The storms on ${pl.name} are older than the stations that watch them.`,
    `${pl.name} has ${rng.int(11, 60)} moons on the charts and, by most counts, more.`,
  ] : [
    `${pl.name} was named by a pilot who lost a bet. The name stuck; the pilot didn't.`,
    `The first landing on ${pl.name} took ${rng.int(3, 20)} attempts. The lander is a monument now.`,
    `${pl.name}'s day is ${rng.int(9, 40)} hours long and every settlement keeps a different clock.`,
    `Something on ${pl.name} sings at dusk. The survey lists it as wind. The settlers don't.`,
    `${pl.name} exports ${rng.pick(["a dye nobody can synthesise", "a stone that stays warm", "a grain that grows in the dark", "silence, mostly"])}.`,
  ];
  return rng.pick(pool);
}

// ---------- Wonders: the places people cross a galaxy to see ----------
export type WonderKind = "ring" | "pulsar" | "ark" | "glass" | "twins" | "nursery" | "cathedral" | "lantern" | "garden" | "loom" | "clock" | "choir";
export interface Wonder { id: string; kind: WonderKind; name: string; systemId: string; x: number; y: number; seen: boolean; seenBy?: string; desc: string }
export const WONDER_DEFS: Record<WonderKind, { names: string[]; desc: string }> = {
  ring: { names: ["The Halo", "Saint Iver's Ring", "The Coronet"], desc: "A ring of ice and dust a thousand kilometres across, lit from inside by something that isn't a star." },
  pulsar: { names: ["The Metronome", "Old Faithful", "The Drummer"], desc: "A dead star that ticks. Every ship within a light-year keeps its clocks by it." },
  ark: { names: ["The Ark Meridian", "The Sleeper", "Long Voyage"], desc: "A generation ship ten kilometres long, dark for centuries, still very slowly turning." },
  glass: { names: ["The Glass Belt", "The Shatter", "Mirrorfield"], desc: "An asteroid belt of pure glass. At the right angle the whole arc lights up like a second sun." },
  twins: { names: ["The Twins", "The Dancers", "Two Lamps"], desc: "A pair of stars so close they share an atmosphere, trading fire across a bridge you can see from here." },
  nursery: { names: ["The Nursery", "The Comet Garden", "Snowfield"], desc: "Ten thousand comets in a slow cloud, tails all pointing the same way. Drifters come here to breed." },
  cathedral: { names: ["The Cathedral", "The Pillars", "Stone Choir"], desc: "Rock spires kilometres tall standing in open space. Nobody built them. Everybody argues about it." },
  loom: { names: ["The Loom", "The Threads", "Weaver's Field"], desc: "Filaments of glowing gas a hundred kilometres long, drifting past each other, weaving and unweaving something." },
  clock: { names: ["The Clock", "The Great Wheel", "Turning Point"], desc: "A ring of worked metal wider than a station, turning once an hour, older than anyone's records. Nobody knows what it measures." },
  choir: { names: ["The Choir", "Singing Stones", "The Bell Field"], desc: "An asteroid field that rings. Every rock hums a note when the light hits it, and the light is always hitting some of them." },
  lantern: { names: ["The Lantern", "The Ember Cloud", "Saint Elmo's"], desc: "A cloud of gas lit from within, orange and slow, that brightens when a ship passes as if it were pleased." },
  garden: { names: ["The Hanging Garden", "The Green Shard", "Orchard Rock"], desc: "A fragment of a world, green side up, still growing under a sky that isn't there any more." },
};
export function assignWonders(systems: Record<string, SystemDef>, startId: string, rng: RNG): Wonder[] {
  const ids = Object.keys(systems).filter((id) => id !== startId);
  const kinds = [...Object.keys(WONDER_DEFS)] as WonderKind[];
  for (let i = kinds.length - 1; i > 0; i--) { const j = rng.int(0, i); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  const n = Math.min(kinds.length, Math.max(3, Math.round(ids.length / 6)));
  const out: Wonder[] = [];
  const used = new Set<string>();
  for (let i = 0; i < n && ids.length; i++) {
    let sysId = rng.pick(ids); let tries = 0;
    while (used.has(sysId) && tries++ < 20) sysId = rng.pick(ids);
    used.add(sysId);
    const kind = kinds[i];
    const a = rng.range(0, Math.PI * 2), r = rng.range(2200, SYSTEM_SIZE * 0.85);
    out.push({ id: `w-${kind}-${sysId}`, kind, name: rng.pick(WONDER_DEFS[kind].names), systemId: sysId, x: Math.cos(a) * r, y: Math.sin(a) * r, seen: false, desc: WONDER_DEFS[kind].desc });
  }
  return out;
}
export function wondersIn(w: World, systemId: string): Wonder[] { return (w.wonders ?? []).filter((x) => x.systemId === systemId); }
export const WONDER_RANGE = 420;
// Close enough to see it properly: the codex, the data, the tourists, the wire.
export function seeWonder(w: World, wd: Wonder, by: string): { first: boolean; data: number } {
  const p = w.player;
  const first = !wd.seen;
  wd.seen = true; wd.seenBy ??= by;
  const key = `wonder:${wd.name}`;
  (p.codex ??= {})[key] = ((p.codex ?? {})[key] ?? 0) + 1;
  const data = first ? 400 : 40;
  p.expData = (p.expData ?? 0) + data;
  if (first) { pushEvent(w, { t: w.time, kind: "discovery", systemId: wd.systemId, text: `${by} logged ${wd.name} in ${w.systems[wd.systemId]?.name ?? "?"}: ${wd.desc}` }); logEntry(w, `Saw ${wd.name}`); }
  return { first, data };
}

// ---------- Wear: a ship wants a yard now and then ----------
// Wear climbs with hours under way and with every jump; an engineer slows it.
// Past 50 the engines lose their edge; past 70 things start to fail.
export const WEAR_SERVICE_FROM = 10;
export function wearRate(p: PlayerState): number {
  const eng = crewBonus(p, "engineer");
  return 0.012 * Math.max(0.4, 1 - 0.15 * eng) * (hasSpecialty(p, "framewright") ? 0.7 : 1);
}
export function tickWear(p: PlayerState, dt: number): void {
  p.wear = Math.min(130, (p.wear ?? 0) + wearRate(p) * dt * (p.focus === "engines" ? 0.8 : 1));
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
  c.sick = { kind: s.kind, until: now + s.days * (hasSpecialty(p, "surgeon") ? 0.25 : medic ? 0.5 : 1) };
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
  serial?: SerialState | null;       // the GalNet serial running now
  wonders?: Wonder[];                // the galaxy's landmarks: a handful, unique, worth the trip
  captains?: NpcCaptain[];           // the recurring pilots of this galaxy, who remember you
  notables?: Notable[];              // a few people whose journeys matter: a senator, an heir, a singer
  mailQueue?: Letter[];              // letters on their way, delivered at a dock after dueT
  longLegTick?: number;              // the long-leg clock: past six hours since the clamp, morale drains a point per ten minutes
  borderWeek?: string;               // the last week whose border contest was resolved
  borderLog?: { week: string; systemId: string; from: string; to: string; flipped: boolean; yours: number }[];
  serialsSeen?: string[];
  serialTick?: number;
  greenTick?: number;
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
  { const p = w.player; w.longLegTick = (w.longLegTick ?? 0) + dt; if (w.longLegTick >= 600) { w.longLegTick = 0; const hours = p.leg ? (w.time - p.leg.t0) / 3600 : 0; if (hours > 6 && p.crew.length) { for (const c of p.crew) c.morale = Math.max(0, c.morale - 1); if (!(p.flags ?? {}).longLegNoted) { (p.flags ??= {}).longLegNoted = true; logEntry(w, "Six hours since the clamp; the crew are starting to count"); } } } }
  if ((w.player.modules ?? []).includes("greenhouse")) {
    w.greenTick = (w.greenTick ?? 0) + dt;
    if (w.greenTick >= 300) { w.greenTick = 0; if (addCargo(w.player, "food", 1)) w.player.grown = (w.player.grown ?? 0) + 1; }
  }
  w.serialTick = (w.serialTick ?? 0) + dt;
  if (w.serialTick >= 60) { w.serialTick = 0; tickSerial(w, new RNG((w.seed ^ Math.floor(w.time * 19)) >>> 0)); }
  w.infraTick = (w.infraTick ?? 0) + dt;
  if (w.infraTick >= 60) {
    w.infraTick = 0;
    const news: string[] = [];
    if (w.infra?.length) news.push(...tickInfra(w, new RNG((w.seed ^ Math.floor(w.time * 13)) >>> 0)));
    if (w.player.haulers?.length) news.push(...tickCharters(w, new RNG((w.seed ^ Math.floor(w.time * 23)) >>> 0)));
    if (news.length) w.infraNews = [...(w.infraNews ?? []), ...news].slice(-6);
  }
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
  const beacon = beaconDiscount(w, fromId, toId) * (isOccasion("lanes") ? 0.9 : 1) * (w.player && hasSpecialty(w.player, "gaterunner") ? 0.9 : 1) * (w.player?.focus === "helm" ? 0.9 : 1);
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
    const kind: AnomalyKind = rng.pick(["data", "derelict", "survey", "data", "derelict", "survey", "fold", "lens", "echo"]);
    sys.anomalies.push({
      id: `${id}-an${i}`,
      name: `${kind === "fold" ? "Fold" : kind === "lens" ? "Lens" : kind === "echo" ? "Echo" : rng.pick(["Signal", "Contact", "Return"])} ${rng.pick(["Alpha", "Kilo", "Sigma", "Zeta", "Nine", "Tango"])}`,
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
    wonders: assignWonders(systems, startId, new RNG((seed ^ 0x77d3) >>> 0)),
    notables: assignNotables({ systems, syndicates: assignSyndicates(systems, startId, new RNG((seed ^ 0x51d1) >>> 0)) }, new RNG((seed ^ 0x9b1e) >>> 0)),
    captains: (() => { const caps = assignCaptains(systems, new RNG((seed ^ 0xc4b7) >>> 0)); const r = new RNG((seed ^ 0x71a1) >>> 0); const rv = caps.length ? r.pick(caps) : null; if (rv) rv.disposition = -2; return caps; })(),
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
      { title: "Compact: The Envoy's Road", desc: "Second act. The Compact's council wants a treaty carried where no envoy will go: sealed data to a neighbouring station, and a captain who won't open it.", kind: "delivery", reward: 2200 },
      { title: "Compact: First Contact Protocol", desc: "The council has heard about the singing hulls. Survey the next signal and bring back readings they can build a protocol on. Nobody says 'first contact' out loud.", kind: "research", reward: 2600 },
    ],
  },
  fdm: {
    title: "Belt Fever",
    stages: [
      { title: "Guild: Ore Quota", desc: "The Guild needs ore and needs it quiet. Fill the quota.", kind: "mining", reward: 450 },
      { title: "Guild: Ride Shotgun", desc: "A Guild hauler is carrying something worth killing for. Get it home.", kind: "escort", reward: 900 },
      { title: "Guild: Belt Fever", desc: "Board the derelict the Guild lost in the belt. Bring back what the crew died for.", kind: "research", reward: 1600 },
      { title: "Guild: The Dry Rock", desc: "Second act. A Guild rock has stopped answering and the Guild wants its ore quota filled before the inners notice. Fill it, and ask the rock what happened.", kind: "mining", reward: 2000 },
      { title: "Guild: The Register's Price", desc: "The rock that went independent has corsairs at its door, and the Guild would rather it came back alive. Clear them. The Guild will settle the politics after.", kind: "bounty", reward: 2500 },
    ],
  },
  hex: {
    title: "Ledger of Glass",
    stages: [
      { title: "Combine: Audit Run", desc: "Carry Combine ledgers to a partner station. They're encrypted. They're also very heavy for what they are.", kind: "delivery", reward: 550 },
      { title: "Combine: Hostile Takeover", desc: "Someone is raiding Combine freighters with suspiciously good intel. Remove the raiders.", kind: "bounty", reward: 950 },
      { title: "Combine: Ledger of Glass", desc: "The intel came from an anomaly the Combine seeded years ago. Find it before their rivals do.", kind: "research", reward: 1900 },
      { title: "Combine: The Ledger's Debt", desc: "Second act. The Combine owes a station it would rather forget. Carry the payment, in data, and don't read the ledger.", kind: "delivery", reward: 2100 },
      { title: "Combine: Hexagon Protocol", desc: "Somebody has been selling the Combine's routes to the corsairs. The Combine knows which lane they use. Clear it.", kind: "bounty", reward: 2500 },
    ],
  },
  ora: {
    title: "Free Drift",
    stages: [
      { title: "Autonomy: Fill the Silos", desc: "The Ring feeds itself or it doesn't eat. Bring ore.", kind: "mining", reward: 480 },
      { title: "Autonomy: Ride Along", desc: "A Ring hauler is running the blockade. Get it home.", kind: "escort", reward: 950 },
      { title: "Autonomy: Free Drift", desc: "Deliver what the hauler was really carrying. Don't ask what it is. Don't get scanned.", kind: "delivery", reward: 2200 },
      { title: "Autonomy: The Outer Signal", desc: "Second act. A signal on the far side of the Ring that the Autonomy would like surveyed before anyone else surveys it.", kind: "research", reward: 2100 },
      { title: "Autonomy: What the Ring Owes", desc: "The Autonomy pays its debts in kind. Carry the kind. Discreetly.", kind: "delivery", reward: 2500 },
    ],
  },
  vex: {
    title: "The Veil Accord",
    stages: [
      { title: "Veil: Proof of Nerve", desc: "Run contraband through a guarded gate for the Corsairs. No scans, no seizures.", kind: "delivery", reward: 700 },
      { title: "Veil: Blood Debt", desc: "A Compact patrol killed a Corsair captain. The Veil wants a patrol in return.", kind: "bounty", reward: 1200 },
      { title: "Veil: The Accord", desc: "Broker the Veil's terms at a Compact star base. If they'll let you dock.", kind: "delivery", reward: 2500 },
      { title: "Corsairs: The Patrol's Price", desc: "Second act. A patrol has been leaning on the Veil's lanes. The Veil would like it leaned on back.", kind: "bounty", reward: 2200 },
      { title: "Corsairs: The Hull That Sang", desc: "The Veil has heard about the singing hulls too, and wants a survey of the next signal before the Compact gets its protocol. The Veil's interest is not scientific.", kind: "research", reward: 2600 },
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
  if (station.military && commandRank(world.player) !== "SKIPPER") kinds.push("patrol", "patrol");
  if (tier >= 1 && linked.length && rng.chance(0.4)) kinds.push("emergency");
  if (station.type === "research" && rng.chance(0.6)) kinds.push("observe");
  // a picture wanted: a magazine, a museum, a family; a postcard (F7) taken in the right place
  if (!station.military && (station.type === "research" || station.type === "trade") && rng.chance(0.5)) {
    const pool: { systemId: string; wonderId?: string; planetIdx?: number; label: string }[] = [];
    for (const s2 of [sys, ...linked]) {
      for (const wd of wondersIn(world, s2.id)) pool.push({ systemId: s2.id, wonderId: wd.id, label: `${wd.seen ? wd.name : "the thing they call " + wd.name} in ${s2.name}` });
      s2.planets.forEach((pl, i) => { if (pl.palette >= 6 || rng.chance(0.25)) pool.push({ systemId: s2.id, planetIdx: i, label: `${pl.name} from orbit, ${s2.name}` }); });
    }
    if (pool.length) {
      const ph = rng.pick(pool);
      const client = rng.pick(["The Lanes Gazette", "A family who can't travel", "The station museum", "A postcard press", "Somebody's grandmother"]);
      missions.push({
        id: `photo-${station.id}-${world.missionCounter++}`, kind: "photo", accepted: false, done: false, tier: 0,
        title: `Picture wanted: ${ph.label}`,
        desc: `${client} wants a picture of ${ph.label}. Take a postcard (F7) ${ph.wonderId ? "within sight of it" : "from its orbit"} and bring it back here.`,
        fromStationId: station.id, targetSystemId: ph.systemId, targetStationId: station.id, photo: ph,
        reward: (ph.wonderId ? 520 : 320) + rng.int(0, 160), repReward: 2,
      });
    }
  }
  // a convoy on the board: slow haulers leaving for the gate who'd pay for company
  if (!station.military && sys.jumpPoints.length && rng.chance(0.5)) {
    const jp = rng.pick(sys.jumpPoints); const to = world.systems[jp.targetSystemId];
    const pay = 200 + Math.round(sys.pirateActivity * 320) + rng.int(0, 60);
    missions.push({
      id: `convoy-${station.id}-${world.missionCounter++}`, kind: "convoy", accepted: false, done: false, tier: 0,
      title: `Convoy leaving for the ${to?.name ?? "gate"} gate`,
      desc: `Three haulers, no guns, and a long way to the gate. Launch and they form on your stern; keep them close and jump. ${pay}cr on the other side, more if all three make it.`,
      fromStationId: station.id, targetSystemId: sys.id, targetStationId: station.id, reward: pay, repReward: 3,
    });
  }
  // the rally: a contested station wants supplies, and the faction remembers who brings them
  { const bc = borderContest(world); if (bc && bc.systemId === sys.id && !station.military) {
    const exports = new Set(stationExports(station));
    const want = COMMODITIES.filter((c) => !c.rare && !c.illegal && !exports.has(c.id) && !["ore", "relics", "data", "bio"].includes(c.id));
    if (want.length) {
      const com = rng.pick(want); const qty = rng.int(6, 10);
      missions.push({
        id: `rally-${station.id}-${weekKey()}`, kind: "delivery", accepted: false, done: false, tier: 0, rally: true,
        title: `Rally: ${qty}x ${com.name} for ${station.name}`,
        desc: `${sys.name} is contested this week. ${station.name} wants ${qty} ${com.name} from anywhere, fast; the ${facName(station.factionId)} count every crate toward holding the system.`,
        fromStationId: station.id, targetSystemId: sys.id, targetStationId: station.id, commodityId: com.id, qty,
        reward: Math.round(com.base * qty * 1.6 + 200), repReward: 4,
      });
    }
  } }
  // the mail bag: every civil station has one waiting for the next ship out. No hold space, small pay, good standing.
  if (!station.military) {
    const pool = [...linked.flatMap((s2) => s2.stations.filter((x) => !x.military).map((x) => ({ sys: s2, st: x, hops: 1 }))), ...sys.stations.filter((x) => x !== station && !x.military).map((x) => ({ sys, st: x, hops: 0 }))];
    if (pool.length) {
      const t = rng.pick(pool);
      missions.push({
        id: `post-${station.id}-${t.st.id}`, kind: "post", accepted: false, done: false, tier: 0,
        title: `Mail bag for ${t.st.name}`,
        desc: `${rng.int(30, 260)} letters and a parcel that rattles. The post office pays ${t.hops ? "a jump's worth" : "a short hop's worth"} and remembers who carried it.`,
        fromStationId: station.id, targetSystemId: t.sys.id, targetStationId: t.st.id,
        reward: (t.hops ? 180 : 90) + rng.int(0, 60), repReward: 2,
      });
    }
  }
  for (let i = 0; i < n; i++) {
    const kind = rng.pick(kinds);
    const idn = `m${world.missionCounter++}`;
    const payMult = 1 + tier * 0.35;
    if (kind === "delivery" && linked.length) {
      const target = rng.pick(linked);
      const tStation = target.stations.length ? rng.pick(target.stations) : null;
      if (!tStation) continue;
      const beltRun = isBeltStation(tStation) && rng.chance(0.6);
      const freemanRun = beltRun && !!world.player.flags?.freeman && isBeltStation(station);
      const beltNeed = rng.pick(["water", "food", "med", "parts"]);
      const com = beltRun ? (COMMODITIES.find((c) => c.id === beltNeed) ?? COMMODITIES[0]) : rng.pick(COMMODITIES.filter((c) => !c.rare && (!c.illegal || rng.chance(0.15))));
      const qty = rng.int(3, 10);
      missions.push({
        id: idn, kind, accepted: false, done: false, tier,
        title: beltRun ? `${freemanRun ? "Freeman's " : ""}${com.id === "water" ? "Water" : com.id === "food" ? "Ration" : com.id === "med" ? "Clinic" : "Filter"} run: ${qty} ${com.name}` : `Deliver ${qty} ${com.name}`,
        desc: beltRun ? `${tStation.name} in ${target.name} is a rock, and the rock is ${com.id === "water" ? "dry" : com.id === "food" ? "hungry" : com.id === "med" ? "coughing" : "breathing through old filters"}. ${qty}x ${com.name}, and nobody there will forget who brought it.` : `Take ${qty}x ${com.name} to ${tStation.name} in ${target.name}.${com.illegal ? " Discreetly. Avoid gate scans." : ""}`,
        fromStationId: station.id, targetSystemId: target.id, targetStationId: tStation.id,
        commodityId: com.id, qty,
        reward: Math.round((com.base * qty * 1.6 + 120 + (com.illegal ? 400 : 0)) * payMult * (freemanRun ? 1.4 : 1)),
        repReward: 3,
      });
      if (freemanRun) missions[missions.length - 1].desc += " Rock to rock, freeman's rate: inners need not apply.";
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
    } else if (kind === "patrol") {
      // standing orders for a captain with a rank: hold station in a system and show the flag
      const target = linked.length && rng.chance(0.7) ? rng.pick(linked) : sys;
      const need = 90 + tier * 30;
      missions.push({
        id: idn, kind, accepted: false, done: false, tier,
        title: `Patrol: ${target.name}`,
        desc: `Orders from the ${station.name} watch: hold station in ${target.name} for ${need} seconds, no cruise, and show the flag. Report back here. The lanes are quieter for a hull that's seen.`,
        fromStationId: station.id, targetSystemId: target.id,
        patrolT: 0, patrolNeed: need, reward: Math.round((300 + tier * 150 + rng.int(0, 120)) * payMult), repReward: 4,
      });
    } else if (kind === "observe") {
      // an observation post: hold a quiet orbit over a world that doesn't know anyone is up here, and don't be seen
      const ts = rng.chance(0.6) && linked.length ? rng.pick(linked) : sys;
      if (!ts.planets.length) continue;
      const pi = rng.int(0, ts.planets.length - 1); const pl = ts.planets[pi]; const need = 60 + tier * 20;
      missions.push({
        id: idn, kind, accepted: false, done: false, tier,
        title: `Observation: ${pl.name}`,
        desc: `The survey wants ${need} seconds of quiet orbit over ${pl.name}, ${ts.name}: close, no cruise, no red alert. There may be somebody down there who doesn't know about ships. Don't be the one who tells them. Report back here.`,
        fromStationId: station.id, targetSystemId: ts.id, sightPlanetIdx: pi,
        patrolT: 0, patrolNeed: need, reward: Math.round((450 + tier * 150 + rng.int(0, 150)) * payMult), repReward: 4,
      });
    } else if (kind === "emergency") {
      // a call on the long band: somebody's reactor, somebody's air plant, and their engineer on a cot
      const ts = rng.pick(linked); const tst = ts.stations.length ? rng.pick(ts.stations) : null;
      if (!tst) continue;
      const what = rng.pick(["reactor is running hot", "air plant has dropped a scrubber", "spin bearing is screaming", "main bus is arcing"]);
      const hours = 3;
      missions.push({
        id: idn, kind, accepted: false, done: false, tier,
        title: `Emergency: ${tst.name}`,
        desc: `${tst.name}'s ${what} and their engineer is on a cot. They need a ship's engineer at the clamp inside ${hours} hours. Bring one, fit. Full pay on time, half after.`,
        fromStationId: station.id, targetStationId: tst.id, targetSystemId: ts.id,
        byT: world.time + hours * 3600, reward: Math.round((700 + tier * 200 + rng.int(0, 200)) * payMult), repReward: 6,
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
      const strange = station.type === "research" ? anomSys.anomalies.find((a) => !a.claimed && (a.kind === "fold" || a.kind === "lens" || a.kind === "echo")) : undefined;
      const an = strange ?? anomSys.anomalies.find((a) => !a.claimed);
      if (!an) continue;
      missions.push({
        id: idn, kind, accepted: false, done: false, tier,
        title: strange ? `Science posting: the ${an.kind} in ${anomSys.name}` : `Research: survey ${an.name}`,
        desc: strange ? `The science council wants readings from ${an.name}, a ${an.kind} in ${anomSys.name}: deep-scan (hold V), reach the marker, take what it gives, and bring the tape back here. A science officer aboard reads more.` : `Deep-scan ${anomSys.name} (hold V) to locate ${an.name}, investigate it, and report back here.`,
        fromStationId: station.id, targetSystemId: anomSys.id, targetStationId: station.id,
        anomalyId: an.id,
        reward: Math.round((strange ? 700 : 420 + rng.int(0, 300)) * payMult),
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

export const REGULAR_AT = 5, OLD_HAND_AT = 10;
export function dockingsAt(p: PlayerState, stationId: string): number { return (p.dockings ?? {})[stationId] ?? 0; }
export function stationBulletin(w: World, st: StationDef, now = Date.now()): string[] {
  const rng = new RNG(hashStr(`bulletin:${w.seed}:${st.id}:${dailyKey(now)}`));
  const lines: string[] = [];
  // the station's own notices about you, once it knows you
  {
    const p = w.player; const n = dockingsAt(p, st.id); const ship = (p.shipName ?? "an independent ship").toUpperCase();
    const mood = (p.lastFareMood ?? {})[st.id];
    if (mood !== undefined) lines.push(mood >= 80 ? `REVIEW: "${ship}. Five stars. ${p.cat ? "The cat." : "The crew."}" - a passenger, last week.` : mood < 30 ? `REVIEW: "${ship}. Never again." - a passenger, last week. The lounge has opinions.` : `REVIEW: "${ship}. Got me there." - a passenger, last week.`);
    if (n >= OLD_HAND_AT) lines.push(`The harbourmaster keeps a bay warm for the ${ship}: ${n} dockings. Yard work at a regular's rate.`);
    else if (n >= REGULAR_AT) lines.push(`Regulars this month include the ${ship} (${n} dockings). The bar knows the order.`);
  }
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
  if (ev?.kind === "secession" && ev.stationId === st.id) lines.unshift("INDEPENDENT THIS WEEK: the register is by the clamp. Water, rations and medicine pay. The inners are not amused.");
  if (isBeltStation(st) && w.player.flags?.freeman) lines.unshift("A freeman of the belt is berthed. The yard has its rate ready and the bar has the tab open.");
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
  const pool = COMMODITIES.filter((c) => !c.illegal && !c.rare && c.id !== "relics" && c.id !== "ore" && !((poi.projects ?? []).includes("clinic") && c.id === "med")).map((c) => c.id);
  const out: string[] = [];
  while (out.length < 2 && pool.length) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return out;
}

// ---------- Settlements grow ----------
// Trade at the desk, work for the foreman, a survey filed: people come. A hundred
// makes a town, two hundred and fifty a city, and the globe gets a few more lights.
export const GROWTH_TOWN = 100, GROWTH_CITY = 250;
export function settlementTierLabel(poi: Poi): string { return poi.kind === "city" ? "CITY" : (poi.tier ?? 0) >= 1 ? "TOWN" : poi.kind.toUpperCase(); }
export function growSettlement(w: World, poi: Poi, amount: number, by: string): string | null {
  if (poi.kind !== "outpost" && poi.kind !== "city") return null;
  poi.growth = (poi.growth ?? 0) + amount;
  const tier = poi.tier ?? 0;
  if (tier < 1 && poi.growth >= GROWTH_TOWN) {
    poi.tier = 1; poi.patron = by;
    pushEvent(w, { t: w.time, kind: "discovery", systemId: w.player.systemId, text: `${poi.name} has grown into a town; the new quarter went up on ${by}'s trade` });
    return `${poi.name.toUpperCase()} IS A TOWN NOW. THE NEW QUARTER WENT UP ON YOUR TRADE. THEY'VE NAMED A STREET.`;
  }
  if (tier < 2 && poi.growth >= GROWTH_CITY) {
    poi.tier = 2; poi.kind = "city"; poi.patron = by;
    pushEvent(w, { t: w.time, kind: "discovery", systemId: w.player.systemId, text: `${poi.name} is a city now, with a market square and a council, and a plaque with ${by}'s name on it` });
    return `${poi.name.toUpperCase()} IS A CITY. A MARKET SQUARE, A COUNCIL, AND A PLAQUE WITH YOUR NAME ON IT.`;
  }
  return null;
}

// Town projects: what a patron can fund once a settlement is a town
export const PROJECTS: { id: string; name: string; credits: number; goods: { id: string; qty: number }; desc: string; growth: number }[] = [
  { id: "school", name: "A School", credits: 1500, goods: { id: "metals", qty: 4 }, desc: "Two rooms and a teacher. Children stop leaving.", growth: 30 },
  { id: "clinic", name: "A Clinic", credits: 1200, goods: { id: "med", qty: 2 }, desc: "Sick crew are treated when you land. Med supplies stop being a need.", growth: 25 },
  { id: "pad", name: "A Second Pad", credits: 2000, goods: { id: "parts", qty: 6 }, desc: "More traffic, more faces, water ice on the desk.", growth: 40 },
  { id: "chapel", name: "A Chapel", credits: 800, goods: { id: "lux", qty: 2 }, desc: "Somewhere quiet. Crew come back aboard steadier.", growth: 15 },
];
export function projectDef(id: string) { return PROJECTS.find((p) => p.id === id); }
export function canFundProject(p: PlayerState, poi: Poi, id: string): string | null {
  const def = projectDef(id); if (!def) return "NO SUCH PROJECT";
  if ((poi.tier ?? 0) < 1) return "IT NEEDS TO BE A TOWN FIRST";
  if ((poi.projects ?? []).includes(id)) return "ALREADY BUILT";
  if (p.credits < def.credits) return `${def.credits}CR NEEDED`;
  if ((p.cargo[def.goods.id] ?? 0) < def.goods.qty) return `${def.goods.qty} ${COMMODITIES.find((c) => c.id === def.goods.id)?.name.toUpperCase() ?? def.goods.id} NEEDED ABOARD`;
  return null;
}
export function fundProject(w: World, poi: Poi, id: string, by: string): string | null {
  const p = w.player; const def = projectDef(id)!;
  if (canFundProject(p, poi, id)) return null;
  p.credits -= def.credits; removeCargo(p, def.goods.id, def.goods.qty);
  (poi.projects ??= []).push(id);
  const line = growSettlement(w, poi, def.growth, by);
  pushEvent(w, { t: w.time, kind: "discovery", systemId: p.systemId, text: `${poi.name} raised ${def.name.toLowerCase()} on ${by}'s credit` });
  logEntry(w, `Funded ${def.name.toLowerCase()} at ${poi.name}`);
  return line ?? `${def.name.toUpperCase()} GOES UP AT ${poi.name.toUpperCase()} OVER A WEEK OF SHIFTS. ${def.desc.toUpperCase()}`;
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
  if ((poi.tier ?? 0) >= 1 && poi.patron) pool.push(`The new quarter went up on ${poi.patron}'s trade. There's talk of a second pad.`, `Somebody's kids were born here now. That makes it a place.`);
  if ((poi.growth ?? 0) > 0 && (poi.tier ?? 0) < 2 && rng.chance(0.4)) return `${poi.growth}/${(poi.tier ?? 0) < 1 ? GROWTH_TOWN : GROWTH_CITY} toward ${(poi.tier ?? 0) < 1 ? "a town" : "a city"}: every crate landed and every job done counts.`;
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
export type GalaxyEventKind = "comet" | "flare" | "festival" | "strike" | "storm" | "secession" | "drought" | "review";
export function fleetReviewAt(w: World, stationId: string): GalaxyEvent | null {
  const e = w.galaxyEvent; return e && e.kind === "review" && e.stationId === stationId && w.time < e.until ? e : null;
}
export function droughtAt(w: World, stationId: string): GalaxyEvent | null {
  const e = w.galaxyEvent; return e && e.kind === "drought" && e.stationId === stationId && w.time < e.until ? e : null;
}
// A belt rock has declared itself independent for the week: water, rations and medicine pay, and the register is open.
export function secessionAt(w: World, stationId: string): GalaxyEvent | null {
  const e = w.galaxyEvent; return e && e.kind === "secession" && e.stationId === stationId && w.time < e.until ? e : null;
}
// An ion storm blinds radar and the system map unless a lit beacon holds the picture.
export function stormBlind(w: World, systemId: string): boolean {
  return galaxyEventAt(w, systemId)?.kind === "storm" && !infraAt(w, systemId).some((i) => i.kind === "beacon" && infraLit(i));
}
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
    if (e.kind === "secession" && e.stationId) { const f = findStation(w, e.stationId); if (f) pushEvent(w, { t: w.time, kind: "peace", systemId: sys.id, text: `${f.st.name} is back in the fold, or says it is; the register is closed` }); return; }
    pushEvent(w, { t: w.time, kind: "peace", systemId: sys.id, text: e.kind === "comet" ? `The comet has passed ${sys.name}; the belt settles` : e.kind === "flare" ? `${sys.name}'s star quietens` : e.kind === "storm" ? `The ion storm over ${sys.name} has blown through` : e.kind === "festival" ? `The festival at ${findStation(w, e.stationId ?? "")?.st.name ?? sys.name} winds down` : `The strike at ${findStation(w, e.stationId ?? "")?.st.name ?? sys.name} ends` });
    return;
  }
  if (w.galaxyEvent || !rng.chance(0.3)) return;
  const sys = rng.pick(Object.values(w.systems));
  const kind = rng.pick(["comet", "flare", "festival", "strike", "storm", "secession", "drought", "review"] as GalaxyEventKind[]);
  const belt = sys.stations.filter((s) => isBeltStation(s) && s.factionId !== "vex");
  const naval = sys.stations.filter((s) => s.military);
  const st = kind === "secession" || kind === "drought" ? (belt.length ? rng.pick(belt) : null) : kind === "review" ? (naval.length ? rng.pick(naval) : null) : sys.stations.length ? rng.pick(sys.stations) : null;
  if ((kind === "festival" || kind === "strike" || kind === "secession" || kind === "drought" || kind === "review") && !st) return;
  w.galaxyEvent = { kind, systemId: sys.id, stationId: st?.id, until: w.time + 720 };
  if (kind === "comet") { for (const a of sys.asteroids) { a.rich = a.rich || rng.chance(0.5); a.ore += 4; } pushEvent(w, { t: w.time, kind: "discovery", systemId: sys.id, text: `A comet crosses ${sys.name}: the belt is seeded with rich ore for a while` }); }
  if (kind === "flare") pushEvent(w, { t: w.time, kind: "shock", systemId: sys.id, text: `Solar flare warning for ${sys.name}: hulls run hot, scanners struggle` });
  if (kind === "festival" && st) { for (const id of ["lux", "food"]) st.stock[id] = Math.max(0, Math.round((st.stock[id] ?? 0) * 0.3)); refreshPrices(st); pushEvent(w, { t: w.time, kind: "discovery", systemId: sys.id, text: `Festival week at ${st.name}: luxuries and provisions sell dear, tourists pay double` }); }
  if (kind === "strike" && st) { st.fuelPrice *= 2; st.repairPrice *= 2; pushEvent(w, { t: w.time, kind: "shock", systemId: sys.id, text: `Dock workers strike at ${st.name}: fuel and repairs cost double` }); }
  if (kind === "review" && st) { pushEvent(w, { t: w.time, kind: "discovery", systemId: sys.id, text: `Fleet review at ${st.name} this week: the service's hulls in line abreast, and any captain with a rank is expected` }); }
  if (kind === "drought" && st) { st.stock.water = 0; refreshPrices(st); pushEvent(w, { t: w.time, kind: "shock", systemId: sys.id, text: `${st.name}'s ice line has failed: the rock is on ration until a tank comes in. Water pays, and the belt remembers who brings it` }); }
  if (kind === "storm") pushEvent(w, { t: w.time, kind: "shock", systemId: sys.id, text: `Ion storm over ${sys.name}: radar and charts are blind there unless a beacon holds the picture` });
  if (kind === "secession" && st) { for (const id of ["water", "food", "med"]) st.stock[id] = Math.max(0, Math.round((st.stock[id] ?? 0) * 0.4)); refreshPrices(st); pushEvent(w, { t: w.time, kind: "shock", systemId: sys.id, text: `${st.name} declares itself independent for the week: water, rations and medicine pay, the register is open, and the inners are not amused` }); }
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
  if (m.kind === "post") return m.targetStationId === station.id;
  if (m.kind === "patrol") return m.fromStationId === station.id && (m.patrolT ?? 0) >= (m.patrolNeed ?? 90);
  if (m.kind === "emergency") return m.targetStationId === station.id && p.crew.some((c) => c.role === "engineer" && !c.sick);
  if (m.kind === "observe") return m.fromStationId === station.id && !!m.patrolDone;
  if (m.kind === "photo") return !!m.photoDone && m.fromStationId === station.id;
  if (m.kind === "convoy") return false; // settled at the gate, never turned in
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
    items.push({ headline: `${EVENT_HEADLINES[e.kind]} - ${w.systems[e.systemId]?.name.toUpperCase() ?? ""}`, body: e.text });
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
