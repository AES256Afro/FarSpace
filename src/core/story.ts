// The Signal: a main campaign told in short cards, advanced by real play.
// Stages check game state each frame (like Flight School); beats are shown on
// the encounter card with a single CONTINUE, except the finale, which offers a
// fight or a parley.

import type { Game } from "../game";
import type { World, SystemDef } from "../world";
import { adjustRep, findStation, adjustSynRep, shiftRelation, logEntry } from "../world";
import { RNG, hashStr } from "./rng";
import { keeperObjective } from "./keeper";
import type { EncounterScene } from "../scenes/encounter";
import type { Encounter } from "../data/encounters";
import * as wire from "./wire";
import { flag } from "./achievements";

export interface StoryStage { title: string; objective: (w: World) => string; check: (g: Game) => boolean; card: (g: Game) => string | null }

const p = (g: Game) => g.world.player;

function pickTarget(w: World): { systemId: string; planetIdx: number; poiId: string } | null {
  const rng = new RNG(hashStr(`story:${w.seed}`));
  const cands: { systemId: string; planetIdx: number; poiId: string }[] = [];
  for (const sys of Object.values(w.systems)) {
    if (sys.id === w.player.systemId) continue;
    sys.planets.forEach((pl, i) => { for (const poi of pl.surface?.pois ?? []) if (poi.kind === "ruin") cands.push({ systemId: sys.id, planetIdx: i, poiId: poi.id }); });
  }
  return cands.length ? rng.pick(cands) : null;
}
function pickOrigin(w: World, avoid: string): string {
  const rng = new RNG(hashStr(`origin:${w.seed}`));
  const far = Object.values(w.systems).filter((s) => s.id !== avoid && s.id !== w.player.systemId);
  const permit = far.filter((s) => s.permit);
  return (permit.length ? rng.pick(permit) : rng.pick(far)).id;
}
function veilStation(w: World): SystemDef | null {
  const vex = Object.values(w.systems).filter((s) => s.factionId === "vex" && s.stations.length);
  if (vex.length) return vex.sort((a, b) => a.gx - b.gx)[0];
  return Object.values(w.systems).filter((s) => s.stations.length).sort((a, b) => b.pirateActivity - a.pirateActivity)[0] ?? null;
}

export const STORY: StoryStage[] = [
  { title: "STATIC", objective: () => "LOG THREE SYSTEMS (ARRIVE, OR HOLD V TO SCAN)",
    check: (g) => Object.keys(p(g).expLog ?? {}).length >= 3,
    card: () => "THE THIRD TIME YOU LOG A SYSTEM, THE NAV COMPUTER FLAGS SOMETHING IT SHOULDN'T BE ABLE TO HEAR: A SLOW PULSE ON NO KNOWN BAND, RIDING UNDER THE STARLIGHT. IT IS THE SAME IN EVERY SYSTEM. IT IS COUNTING.\n\nTHE DEEP SCANNER MIGHT FIND WHERE IT'S LOUDEST." },
  { title: "THE NUMBERS", objective: () => "DEEP-SCAN (HOLD V) UNTIL YOU FIND AN ANOMALY, THEN CLAIM IT (FLY TO IT, PRESS E)",
    check: (g) => Object.values(g.world.systems).some((s) => s.anomalies.some((a) => a.claimed)),
    card: (g) => { const t = pickTarget(g.world); if (!t) return null; p(g).storyTarget = t; const sys = g.world.systems[t.systemId]; const pl = sys.planets[t.planetIdx]; return `THE ANOMALY'S CORE IS FULL OF THE SAME PULSE, BUT OLDER, AND UNDERNEATH IT: COORDINATES. THEY RESOLVE TO ${sys.name.toUpperCase()}, A WORLD CALLED ${pl.name.toUpperCase()}, AND A RUIN NOBODY HAS CATALOGUED.\n\nPLOT A COURSE. ORBIT ${pl.name.toUpperCase()} AND LAND AT THE RUIN.`; } },
  { title: "THE VAULT", objective: (w) => { const t = w.player.storyTarget; if (!t) return "FIND THE RUIN"; const sys = w.systems[t.systemId]; return `CLEAR THE RELICS FROM THE RUIN ON ${sys.planets[t.planetIdx].name.toUpperCase()}, ${sys.name.toUpperCase()}`; },
    check: (g) => { const t = p(g).storyTarget; if (!t) return false; const poi = g.world.systems[t.systemId]?.planets[t.planetIdx]?.surface?.pois.find((x) => x.id === t.poiId); return !!poi?.looted; },
    card: () => "THE LAST RELIC IS NOT A RELIC. IT IS A RECEIVER, AND IT IS WARM. WHEN YOU LIFT IT THE PULSE IN YOUR HELMET GOES QUIET FOR THE FIRST TIME IN WEEKS, THEN STARTS AGAIN, FASTER.\n\nSOMEONE AT A RESEARCH POST WILL WANT TO SEE THIS. DOCK AT ONE." },
  { title: "DECIPHERMENT", objective: () => "DOCK AT ANY RESEARCH STATION",
    check: (g) => { const st = p(g).dockedAt ? findStation(g.world, p(g).dockedAt!)?.st : null; return st?.type === "research"; },
    card: (g) => { const v = veilStation(g.world); p(g).storyVeil = v?.id ?? null; return `THE RESEARCHERS RUN THE RECEIVER FOR SIX HOURS AND COME BACK GREY. 'IT'S A COUNTDOWN. IT'S BEEN RUNNING FOR LONGER THAN THIS STATION HAS EXISTED. AND IT ISN'T OURS.'\n\nONE OF THEM SAYS THE VEIL HAVE HEARD IT TOO. ${v ? `THEY KEEP A STATION IN ${v.name.toUpperCase()}. GO CAREFULLY.` : "FIND WHERE THE VEIL LISTEN."}`; } },
  { title: "THE VEIL KNOWS", objective: (w) => w.player.storyVeil ? `DOCK IN ${w.systems[w.player.storyVeil].name.toUpperCase()}` : "DOCK AT A VEIL STATION",
    check: (g) => !!p(g).dockedAt && !!p(g).storyVeil && p(g).systemId === p(g).storyVeil,
    card: (g) => { const o = pickOrigin(g.world, p(g).storyTarget?.systemId ?? ""); p(g).storyOrigin = o; const sys = g.world.systems[o]; adjustRep(g.world, "vex", 5); return `THE VEIL DO NOT NEGOTIATE. THEY SIMPLY TELL YOU. 'IT IS A BEACON. IT WAS LEFT TO BE FOUND. THE COUNT ENDS AT ${sys.name.toUpperCase()}. WE WILL NOT GO. WE ARE NOT FOOLS.'\n\nGO TO ${sys.name.toUpperCase()} AND DEEP-SCAN. THE BEACON WILL ANSWER THE RECEIVER.${sys.permit ? " IT IS PERMIT SPACE: YOU WILL NEED ALLIED STANDING, OR ANOTHER WAY IN." : ""}`; } },
  { title: "THE BEACON", objective: (w) => w.player.storyOrigin ? `DEEP-SCAN (HOLD V) IN ${w.systems[w.player.storyOrigin].name.toUpperCase()}, THEN CLAIM THE BEACON` : "FIND THE BEACON",
    check: (g) => { const o = p(g).storyOrigin; if (!o) return false; const an = g.world.systems[o].anomalies.find((a) => a.id === "the-beacon"); return !!an?.claimed; },
    card: () => null }, // the finale is its own card with choices (see storyFinale)
  { title: "THE ANSWER", objective: () => "THE HERALD IS HERE. DESTROY IT, OR FIND ANOTHER WAY",
    check: (g) => !!p(g).flags?.storyHerald || !!p(g).flags?.storyParley,
    card: (g) => { p(g).credits += 5000; p(g).expData = (p(g).expData ?? 0) + 1000; flag(g, "theSignal"); void wire.post("arc", p(g).flags?.storyParley ? "answered the Signal and sent the Herald home" : "answered the Signal and broke the Herald", g.world.systems[p(g).systemId].name); return p(g).flags?.storyParley ? "THE HERALD TAKES THE RELIC AND THE COUNT STOPS. IN EVERY SYSTEM AT ONCE, THE PULSE UNDER THE STARLIGHT GOES SILENT. YOU ARE THE ONLY PILOT WHO WILL EVER KNOW WHY.\n\n+5000CR, +1000 EXPLORATION DATA. THE SIGNAL IS OVER." : "THE HERALD COMES APART SLOWLY, LIKE IT HAS ALL THE TIME IN THE WORLD. THE COUNT STOPS. SOMEWHERE, SOMETHING NOTES THAT THE ANSWER WAS NO.\n\n+5000CR, +1000 EXPLORATION DATA. THE SIGNAL IS OVER."; } },
];

// ---------- Track two: The Missing Convoy (syndicate arc) ----------
export const CONVOY: StoryStage[] = [
  { title: "A CONVOY IS LATE", objective: (w) => { const t = w.player.convoyTrack; return t ? `DEEP-SCAN (HOLD V) THE LANE IN ${w.systems[t.laneSystemId].name.toUpperCase()}` : "EARN STANDING WITH A SYNDICATE"; },
    check: (g) => { const t = p(g).convoyTrack; if (!t) return false; return g.world.systems[t.laneSystemId].anomalies.some((a) => a.id === `convoy-${t.tag}` && a.claimed); },
    card: (g) => { const t = p(g).convoyTrack!; const rival = g.world.syndicates?.find((s) => s.tag === t.rivalTag); const f = findStation(g.world, t.partnerStationId); return `THE WRECK IS CONVOY NINE, ALL RIGHT. HULLED FROM CLOSE RANGE BY SHIPS WEARING [${t.rivalTag}] ${rival?.name.toUpperCase() ?? ""} COLOURS. EXCEPT THE BLACK BOX KEPT THE TRANSPONDER HANDSHAKES, AND THE RAIDERS WERE CLEARED THROUGH THE LANE BY ${(f?.st.name ?? "THE PARTNER STATION").toUpperCase()}'S OWN HARBOURMASTER.

SOMEBODY ON THE INSIDE SOLD THAT CONVOY. DOCK AT ${(f?.st.name ?? "THE PARTNER STATION").toUpperCase()}.`; } },
  { title: "THE HARBOURMASTER", objective: (w) => { const t = w.player.convoyTrack; const f = t ? findStation(w, t.partnerStationId) : null; return f ? `DOCK AT ${f.st.name.toUpperCase()}, ${f.sys.name.toUpperCase()}` : "FIND THE HARBOURMASTER"; },
    check: (g) => { const t = p(g).convoyTrack; return !!t && p(g).dockedAt === t.partnerStationId; },
    card: () => null }, // the confrontation is its own card
  { title: "THE LANE", objective: () => "DECIDE WHAT THE BLACK BOX IS WORTH",
    check: (g) => !!p(g).flags?.convoyDone, card: () => null },
];
export const CONVOY_LEN = CONVOY.length;

function startConvoyTrack(g: Game): boolean {
  const w = g.world; const pl = p(g);
  const tag = Object.entries(pl.synRep ?? {}).filter(([, v]) => v >= 20).map(([t]) => t).find((t) => w.syndicates?.some((s) => s.tag === t && s.style !== "pirate"));
  if (!tag) return false;
  const sy = w.syndicates!.find((s) => s.tag === tag)!;
  const partner = sy.partners.map((id) => findStation(w, id)).find((f) => !!f);
  const rival = w.syndicates!.find((s) => s.rivals.includes(tag) || sy.rivals.includes(s.tag)) ?? w.syndicates!.find((s) => s.tag !== tag);
  if (!partner || !rival) return false;
  pl.convoyTrack = { tag, rivalTag: rival.tag, partnerStationId: partner.st.id, laneSystemId: partner.sys.id };
  pl.story2 = 0;
  showCard(g, "THE MISSING CONVOY - A CONVOY IS LATE", `[${tag}] DISPATCH, ON A PRIVATE CHANNEL. 'CONVOY NINE IS THREE DAYS LATE ON THE LANE TO ${partner.st.name.toUpperCase()}. NO BEACON, NO WRECK, NO RANSOM. YOU'VE DONE RIGHT BY US. FIND IT. WE'LL PAY FOR THE TRUTH, WHATEVER IT IS.'

DEEP-SCAN THE LANE IN ${partner.sys.name.toUpperCase()}.`, g.sceneName === "station" ? "station" : "flight");
  return true;
}

function convoyFinale(g: Game): void {
  const pl = p(g); const t = pl.convoyTrack!; const w = g.world;
  const sy = w.syndicates!.find((s) => s.tag === t.tag)!;
  const rival = w.syndicates!.find((s) => s.tag === t.rivalTag);
  const done = (g2: Game, text: string) => { g2.world.player.flags = { ...(g2.world.player.flags ?? {}), convoyDone: true, theLane: true }; g2.world.player.story2 = CONVOY_LEN; logEntry(g2.world, `The missing convoy: ${text}`); return text; };
  const options: Encounter["options"] = [
    { label: `HAND THE BOX TO [${t.tag}]`, hint: "The truth, and a purge", result: (g2) => { g2.world.player.credits += 1500; adjustSynRep(g2.world, t.tag, 20); if (rival) shiftRelation(g2.world, t.tag, rival.tag, 15); void wire.post("arc", `found [${t.tag}]'s missing convoy and the traitor who sold it`, g2.world.systems[g2.world.player.systemId].name); return done(g2, `THE HARBOURMASTER IS GONE BY MORNING. [${t.tag}] PAYS 1500CR AND STOPS BLAMING [${t.rivalTag}]. YOU ARE A PARTNER NOW, IN EVERYTHING BUT NAME.`); } },
    { label: "TAKE THE HARBOURMASTER'S MONEY", hint: "2500 credits and a quiet lane", result: (g2) => { g2.world.player.credits += 2500; adjustSynRep(g2.world, t.tag, -12); if (rival) shiftRelation(g2.world, t.tag, rival.tag, -10); return done(g2, `2500CR, NO QUESTIONS. [${t.tag}] KEEPS BLAMING [${t.rivalTag}], AND THE HARBOURMASTER KEEPS HIS JOB. YOU KNOW WHAT YOU DID.`); } },
    { label: `SELL THE BOX TO [${t.rivalTag}]`, hint: "They were framed; they'll pay to prove it", result: (g2) => { g2.world.player.credits += 1200; adjustSynRep(g2.world, t.rivalTag, 25); adjustSynRep(g2.world, t.tag, -25); if (rival) shiftRelation(g2.world, t.tag, rival.tag, -20); return done(g2, `[${t.rivalTag}] BROADCASTS THE HANDSHAKES ON EVERY BAND. [${t.tag}] IS HUMILIATED, AND KNOWS WHO DID IT. 1200CR, AND A NEW FRIEND WHO WAS AN ENEMY.`); } },
  ];
  showCard(g, "THE MISSING CONVOY - THE HARBOURMASTER", `THE HARBOURMASTER MEETS YOU IN A BAY THAT ISN'T ON THE MANIFEST. HE KNOWS WHAT YOU FOUND. 'CONVOYS GET HIT. THAT'S THE LANE. THE QUESTION IS WHAT THE BLACK BOX IS WORTH, AND TO WHOM.'

${sy.name.toUpperCase()} WOULD PAY FOR THE TRUTH. HE'LL PAY MORE FOR SILENCE. AND ${rival?.name.toUpperCase() ?? "THEIR RIVALS"} WOULD PAY TO CLEAR THEIR NAME.`, "station", options);
}

export function convoyObjective(w: World): string | null {
  const s = w.player.story2 ?? -1;
  return s >= 0 && s < CONVOY.length ? `${CONVOY[s].title}: ${CONVOY[s].objective(w)}` : null;
}

export function convoyUpdate(g: Game): void {
  const pl = p(g);
  if ((pl.tutorial ?? -1) >= 0 || g.sceneName === "encounter") return;
  const s = pl.story2 ?? -1;
  if (s < 0) { if (g.sceneName === "station" && !pl.flags?.convoyDone) startConvoyTrack(g); return; }
  if (s >= CONVOY.length) return;
  const t = pl.convoyTrack;
  if (!t) return;
  if (s === 0) {
    const sys = g.world.systems[t.laneSystemId];
    if (!sys.anomalies.some((a) => a.id === `convoy-${t.tag}`)) {
      const rng = new RNG(hashStr(`convoy:${g.world.seed}:${t.tag}`));
      sys.anomalies.push({ id: `convoy-${t.tag}`, name: "Convoy Nine", kind: "derelict", x: rng.range(-2000, 2000), y: rng.range(-2000, 2000), discovered: false, claimed: false, reward: 0 });
    }
  }
  if (s === 1 && CONVOY[1].check(g) && !pl.flags?.convoyConfront) { pl.flags = { ...(pl.flags ?? {}), convoyConfront: true }; pl.story2 = 2; convoyFinale(g); return; }
  if (!CONVOY[s].check(g)) return;
  pl.story2 = s + 1;
  const text = CONVOY[s].card(g);
  if (text) showCard(g, `THE MISSING CONVOY - ${CONVOY[s].title}`, text, g.sceneName === "station" ? "station" : "flight");
}

export function storyStage(g: Game): number { return p(g).story ?? 0; }
export function storyActive(g: Game): boolean { const s = storyStage(g); return s >= 0 && s < STORY.length; }
export function storyObjective(w: World): string | null {
  const s = w.player.story ?? 0;
  if (s >= 0 && s < STORY.length) return `${STORY[s].title}: ${STORY[s].objective(w)}`;
  return convoyObjective(w) ?? keeperObjective(w);
}

function showCard(g: Game, title: string, text: string, returnTo: string, options?: Encounter["options"]): void {
  const enc: Encounter = { id: `story-${title}`, where: "space", title, text, weight: 0, options: options ?? [{ label: "CONTINUE", result: () => "" }] };
  (g.scenes["encounter"] as EncounterScene).open(g, enc, returnTo, true);
}

// Called every frame from the main loop
export function storyUpdate(g: Game): void {
  const pl = p(g);
  if ((pl.tutorial ?? -1) >= 0) return; // Flight School first
  const s = pl.story ?? 0;
  if (s < 0 || s >= STORY.length) return;
  if (g.sceneName === "encounter") return;
  // the beacon only exists once you're looking for it
  if (s === 5 && pl.storyOrigin) {
    const sys = g.world.systems[pl.storyOrigin];
    if (!sys.anomalies.some((a) => a.id === "the-beacon")) {
      const rng = new RNG(hashStr(`beacon:${g.world.seed}`));
      sys.anomalies.push({ id: "the-beacon", name: "The Beacon", kind: "data", x: rng.range(-2200, 2200), y: rng.range(-2200, 2200), discovered: false, claimed: false, reward: 0 });
    }
    if (sys.anomalies.find((a) => a.id === "the-beacon")?.claimed && !pl.flags?.storyFinale) {
      pl.flags = { ...(pl.flags ?? {}), storyFinale: true };
      pl.story = 6;
      storyFinale(g);
      return;
    }
  }
  if (!STORY[s].check(g)) return;
  pl.story = s + 1;
  const text = STORY[s].card(g);
  const returnTo = g.sceneName === "station" || g.sceneName === "ruin" || g.sceneName === "orbit" ? g.sceneName : "flight";
  if (text) showCard(g, `THE SIGNAL - ${STORY[s].title}`, text, returnTo);
}

function storyFinale(g: Game): void {
  const options: Encounter["options"] = [
    { label: "STAND AND FIGHT", hint: "The Herald is a warship", result: (g2) => { (g2.scenes?.flight as unknown as { spawnHerald?: (g: Game) => void } | undefined)?.spawnHerald?.(g2); return "THE HERALD'S WEAPONS TRACK YOU. IT IS NOT IN A HURRY."; } },
    { label: "OFFER THE RECEIVER", hint: "Costs one relic; the Herald leaves", requires: (g2) => (g2.world.player.cargo.relics ?? 0) >= 1, result: (g2) => { g2.world.player.cargo.relics = (g2.world.player.cargo.relics ?? 1) - 1; if (!g2.world.player.cargo.relics) delete g2.world.player.cargo.relics; g2.world.player.flags = { ...(g2.world.player.flags ?? {}), storyParley: true }; return "YOU EJECT THE RECEIVER INTO THE DARK BETWEEN YOU. THE HERALD TAKES IT INTO ITSELF AND TURNS AWAY."; } },
  ];
  showCard(g, "THE SIGNAL - THE ANSWER", "THE BEACON WAKES. THE PULSE STOPS, AND IN THE SILENCE SOMETHING VAST DROPS OUT OF THE DARK BESIDE THE STAR: A SHIP THE SIZE OF A STATION, NO LIGHTS, NO HAIL, ONE INTENT.\n\nTHE HERALD HAS COME FOR THE RECEIVER. IT DOES NOT CARE WHO IS HOLDING IT.", "flight", options);
}
