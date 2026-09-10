// Track three: The Keeper. A lighthouse in a dead system whose keeper has died.
// Relight it, read what they left, see what the light saw, and decide whose
// light it is. Begins once you have kept a light of your own for a while, or
// simply flown long enough.

import type { Game } from "../game";
import type { World, Infra } from "../world";
import { findStation, infraAt, infraLit, repairInfra, pushEvent, logEntry, adjustRep, hasCharter, upgradeInfra } from "../world";
import type { StoryStage } from "./story";
import type { Encounter } from "../data/encounters";
import type { EncounterScene } from "../scenes/encounter";
import { RNG, hashStr } from "./rng";
import { flag } from "./achievements";
import * as wire from "./wire";

const p = (g: Game) => g.world.player;
export const KEEPER_OWNER = "THE KEEPER";
export interface KeeperTrack { systemId: string; wreckSystemId: string; wreckId: string; contactId: string }

function keeperInfra(w: World): Infra | null { return (w.infra ?? []).find((i) => i.owner === KEEPER_OWNER) ?? null; }
function deadSystem(w: World, rng: RNG): string | null {
  const start = w.player.systemId;
  const pool = Object.values(w.systems).filter((s) => !s.stations.length && s.id !== start && s.links.some((l) => w.systems[l]?.stations.length));
  const pool2 = pool.length ? pool : Object.values(w.systems).filter((s) => s.id !== start && s.links.length);
  return pool2.length ? rng.pick(pool2).id : null;
}
// Ready when: you've kept a lit structure for ten minutes, or three hours have passed, and The Signal is past its first beats
export function keeperReady(w: World): boolean {
  const mine = (w.infra ?? []).filter((i) => i.owner !== KEEPER_OWNER && infraLit(i) && w.time - i.builtAt > 600);
  return (mine.length > 0 || w.time > 10800) && (w.player.story ?? 0) !== 1;
}
export function startKeeper(w: World): KeeperTrack | null {
  const rng = new RNG(hashStr(`keeper:${w.seed}`));
  const sysId = deadSystem(w, rng); if (!sysId) return null;
  const sys = w.systems[sysId];
  const a = rng.range(0, Math.PI * 2), r = rng.range(1200, 2600);
  if (!keeperInfra(w)) (w.infra ??= []).push({ id: `keeper-${sysId}`, kind: "beacon", systemId: sysId, x: Math.cos(a) * r, y: Math.sin(a) * r, owner: KEEPER_OWNER, builtAt: 0, health: 12, till: 0, stock: 0, earned: 0, lastT: w.time });
  const wreckSys = sys.links.length ? w.systems[rng.pick(sys.links)] : sys;
  const wreckId = `keeper-ship-${sysId}`;
  if (!wreckSys.wrecks.some((x) => x.id === wreckId)) wreckSys.wrecks.push({ id: wreckId, x: rng.range(-2400, 2400), y: rng.range(-2400, 2400), looted: false, loot: [{ id: "data", qty: 2 }, { id: "relics", qty: 1 }], hazard: 0.1, name: "The Keeper's Lantern" });
  const track: KeeperTrack = { systemId: sysId, wreckSystemId: wreckSys.id, wreckId, contactId: `keeper-contact-${sysId}` };
  w.player.keeper = track; w.player.story3 = 0;
  pushEvent(w, { t: w.time, kind: "arc", systemId: sysId, text: `The old keeper of the ${sys.name} light has died at their post; the beacon is failing` });
  return track;
}
const sysName = (w: World, id?: string) => (w.systems[id ?? ""]?.name ?? "the dark").toUpperCase();

export const KEEPER: StoryStage[] = [
  { title: "A LIGHT GOES OUT", objective: (w) => `RELIGHT THE KEEPER'S BEACON IN ${sysName(w, w.player.keeper?.systemId)} (BRING SPARE PARTS, PRESS E BESIDE IT)`,
    check: (g) => { const k = keeperInfra(g.world); return !!k && infraLit(k) && !!p(g).flags?.keeperRelit; },
    card: (g) => { const t = p(g).keeper!; return `THE BEACON COMES BACK SLOWLY, ONE LIGHT AT A TIME, AND ON THE LAST ONE IT PLAYS A RECORDING: A VOICE, OLD AND CALM. 'IF YOU'RE HEARING THIS, I'M PAST CARING WHO. MY SHIP IS IN ${sysName(g.world, t.wreckSystemId)}. THE LOG IS IN THE ENGINE ROOM. READ IT BEFORE YOU DECIDE ANYTHING.'\n\nFIND THE KEEPER'S LANTERN IN ${sysName(g.world, t.wreckSystemId)} AND WALK IT.`; } },
  { title: "THE KEEPER'S LOG", objective: (w) => `WALK THE WRECK OF THE KEEPER'S LANTERN IN ${sysName(w, w.player.keeper?.wreckSystemId)} (E BESIDE IT)`,
    check: (g) => { const t = p(g).keeper; return !!t && !!g.world.systems[t.wreckSystemId]?.wrecks.find((x) => x.id === t.wreckId)?.looted; },
    card: (g) => { const t = p(g).keeper!; return `THE LOG IS FORTY YEARS LONG AND MOSTLY WEATHER. THEN, EVERY YEAR TO THE DAY: 'IT CROSSED AGAIN. SLOW. DARK. IT DOES NOT ANSWER. I LOG IT SO SOMEONE WILL KNOW IT WAS HERE.' THE LAST ENTRY IS THREE WEEKS OLD. 'IT IS EARLY THIS YEAR. I THINK IT KNOWS I'M DONE.'\n\nGO BACK TO THE BEACON IN ${sysName(g.world, t.systemId)} AND DEEP-SCAN (HOLD V) BESIDE IT.`; } },
  { title: "WHAT THE LIGHT SAW", objective: (w) => `DEEP-SCAN (HOLD V) BESIDE THE KEEPER'S BEACON IN ${sysName(w, w.player.keeper?.systemId)}, THEN CLAIM WHAT IT FINDS (E)`,
    check: (g) => { const t = p(g).keeper; return !!t && g.world.systems[t.systemId].anomalies.some((a) => a.id === t.contactId && a.claimed); },
    card: () => null }, // the decision is its own card
  { title: "WHOSE LIGHT", objective: () => "DECIDE WHOSE LIGHT IT IS", check: (g) => !!p(g).flags?.keeperDone, card: () => null },
];
export const KEEPER_LEN = KEEPER.length;
export function keeperObjective(w: World): string | null {
  const s = w.player.story3 ?? -1;
  if (s >= 0 && s < KEEPER.length) return `THE KEEPER - ${KEEPER[s].title}: ${KEEPER[s].objective(w)}`;
  return null;
}
function showCard(g: Game, title: string, text: string, returnTo: string, options?: Encounter["options"]): void {
  const enc: Encounter = { id: `keeper-${title}`, where: "space", title, text, weight: 0, options: options ?? [{ label: "CONTINUE", result: () => "" }] };
  (g.scenes["encounter"] as EncounterScene).open(g, enc, returnTo, true);
}
// The contact: a dark shape that answers the scanner once, beside the light
export function keeperScan(g: Game): boolean {
  const t = p(g).keeper; const w = g.world;
  if (!t || (p(g).story3 ?? -1) !== 2 || p(g).systemId !== t.systemId) return false;
  const k = keeperInfra(w); if (!k) return false;
  if (Math.hypot(p(g).x - k.x, p(g).y - k.y) > 400) return false;
  const sys = w.systems[t.systemId];
  if (!sys.anomalies.some((a) => a.id === t.contactId)) {
    const rng = new RNG(hashStr(`keeper-contact:${w.seed}`));
    sys.anomalies.push({ id: t.contactId, name: "The Crossing", kind: "data", x: k.x + rng.range(-300, 300), y: k.y + rng.range(-300, 300), discovered: true, claimed: false, reward: 0 });
    g.toast("THE SCANNER FINDS SOMETHING THE LIGHT HAS BEEN WATCHING FOR FORTY YEARS. IT IS VERY CLOSE. IT IS VERY SLOW.");
    return true;
  }
  return false;
}
export function keeperFinale(g: Game): void {
  const w = g.world; const t = p(g).keeper!; const k = keeperInfra(w)!;
  const sys = w.systems[t.systemId];
  const fac = sys.factionId;
  const text = `THE CROSSING IS A HULL THE SIZE OF A STATION, DARK, COLD, AND OLDER THAN ANY FLAG. IT PASSES THE BEACON AT WALKING PACE AND, AS IT PASSES, EVERY LIGHT ON THE MAST GOES OUT AND COMES BACK ON. IT DOES NOT ANSWER. IT NEVER HAS. THE KEEPER LOGGED IT FORTY TIMES SO THAT SOMEONE WOULD KNOW.\n\nNOW SOMEONE DOES. THE BEACON IS YOURS TO GIVE.`;
  const opts: Encounter["options"] = [
    { label: "KEEP THE LIGHT. IT'S MINE NOW.", hint: "The beacon becomes yours, and a waystation", result: (g2) => { k.owner = wire.getCallsign() ?? p(g2).captainName ?? "YOU"; k.health = 100; upgradeInfra(k, { ...p(g2), credits: 99999, cargo: { parts: 99 } }); k.upgraded = true; (p(g2).flags ??= {}).keeperDone = true; flag(g2, "keeper"); logEntry(g2.world, `Took over the Keeper's light in ${sys.name}`); void wire.post("discover", `took up the Keeper's light in ${sys.name}`, sys.name); return `YOU SIGN THE BEACON OVER TO YOURSELF IN THE KEEPER'S OWN HAND. THE WAYSTATION GOES UP ON THEIR BONES. YOU WILL LOG THE CROSSING NEXT YEAR. SOMEONE HAS TO.`; } },
    { label: `GIVE IT TO THE ${(findStation(w, sys.links.map((l) => w.systems[l]).find((s) => s?.stations.length)?.stations[0]?.id ?? "")?.st.factionId ?? fac).toUpperCase()} - LET THEM KEEP IT`, hint: "Standing, and a charter if you have none", result: (g2) => { const f2 = findStation(w, sys.links.map((l) => w.systems[l]).find((s) => s?.stations.length)?.stations[0]?.id ?? "")?.st.factionId ?? fac; adjustRep(g2.world, f2, 20); if (!hasCharter(g2.world, f2)) (p(g2).charters ??= []).push(f2); k.owner = f2.toUpperCase(); k.health = 100; (p(g2).flags ??= {}).keeperDone = true; flag(g2, "keeper"); logEntry(g2.world, `Gave the Keeper's light to the ${f2}`); return `THE FLAG GOES UP THE MAST WITHIN THE WEEK, AND A KEEPER WITH IT, YOUNG AND NERVOUS. THEY'LL LEARN. STANDING UP; A CHARTER, IF YOU HADN'T ONE.`; } },
    { label: "LET IT GO DARK. SOME THINGS SHOULDN'T BE WATCHED.", hint: "The Veil pay well for silence", result: (g2) => { k.health = 0; adjustRep(g2.world, "vex", 15); p(g2).credits += 4000; (p(g2).flags ??= {}).keeperDone = true; flag(g2, "keeper"); logEntry(g2.world, `Let the Keeper's light go dark in ${sys.name}`); return `YOU PULL THE CELLS AND THE MAST GOES DARK FOR THE FIRST TIME IN FORTY YEARS. A VEIL CUTTER, WATCHING FROM THE GATE, FLASHES ITS LIGHTS TWICE AND WIRES YOU 4000CR. THE CROSSING WILL COME AGAIN. NOBODY WILL LOG IT.`; } },
  ];
  showCard(g, "THE KEEPER - WHOSE LIGHT", text, g.sceneName === "station" ? "station" : "flight", opts);
}
export function keeperUpdate(g: Game): void {
  const pl = p(g); const w = g.world;
  if ((pl.tutorial ?? -1) >= 0 || g.sceneName === "encounter") return;
  const s = pl.story3 ?? -1;
  if (s < 0) { if (!pl.flags?.keeperDone && keeperReady(w) && g.sceneName === "station") { if (startKeeper(w)) showCard(g, "THE KEEPER - A LIGHT GOES OUT", `A LINE ON THE WIRE, THEN A LINE ON EVERY BAND: THE OLD KEEPER OF THE ${sysName(w, pl.keeper?.systemId)} LIGHT HAS DIED AT THEIR POST. FORTY YEARS OUT THERE ALONE, AND THE BEACON IS FAILING WITH NOBODY TO TEND IT.\n\nSOMEONE WITH SPARE PARTS SHOULD GO. YOU KNOW LIGHTS. GO.`, "station"); } return; }
  if (s >= KEEPER.length) return;
  // relit: mark it once the keeper's beacon is lit by your hand
  if (s === 0) { const k = keeperInfra(w); if (k && infraLit(k) && !pl.flags?.keeperRelit) { (pl.flags ??= {}).keeperRelit = true; } }
  if (s === 2 && KEEPER[2].check(g) && !pl.flags?.keeperFinale) { (pl.flags ??= {}).keeperFinale = true; pl.story3 = 3; keeperFinale(g); return; }
  if (!KEEPER[s].check(g)) return;
  pl.story3 = s + 1;
  const text = KEEPER[s].card(g);
  if (text) showCard(g, `THE KEEPER - ${KEEPER[s].title}`, text, g.sceneName === "station" ? "station" : "flight");
}
export { repairInfra, infraAt };
