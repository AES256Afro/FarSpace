import type { Game } from "../game";
import type { StationScene } from "./station";
import * as W from "../world";
import * as wire from "../core/wire";
import { presence } from "../core/presence";
import { faction } from "../data/data";
import { hull } from "../data/hulls";
import { ACHIEVEMENTS } from "../data/achievements";
import { occasionFor } from "../data/occasions";
import { serialLines } from "../data/serials";
import { stationHour, clockText, hoursRate } from "../data/tannoy";
import { dockhandLines } from "../data/dockhand";
import { weeklyIssue, myVote, voteResult } from "../data/votes";
import { RNG, hashStr } from "../core/rng";

export type StationRecord = { id: string; title: string; lines: string[] };
const record = (id: string, title: string, ...lines: string[]): StationRecord => ({ id, title, lines });
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n}`;

function vote(w: W.World, id: string): StationRecord {
  const issue = weeklyIssue(w, id), mine = myVote(w, id), result = voteResult(w, id);
  return record(`vote:${id}`, `${faction(id).name}: ${issue.title}`, issue.text,
    `For: ${issue.yes}`, `Against: ${issue.no}`,
    mine ? `You voted ${mine}. ${result.passed ? "Passed" : "Failed"}: ${result.passed ? issue.yes : issue.no}`
      : `Not voted. Your weight: ${Math.round(result.weight * 100)}% of the house. The house leans ${result.lean >= 0.5 ? "for" : "against"}.`);
}

export function stationRecords(g: Game, scene: StationScene, key: (o: object) => string): StationRecord[] {
  const w = g.world, p = w.player, st = scene.station;
  const port = (id: string) => W.findStation(w, id)?.st.name ?? id;
  const rows: StationRecord[] = [];
  if (scene.tab === 9) {
    const profile = W.stationProfile(w, st), time = stationHour(st), occasion = occasionFor();
    rows.push(record("port", st.name, `Population ${profile.population.toLocaleString()}. Founded ${profile.founded}. ${clockText(time)} station time, ${time.label}.`,
      `Known for ${profile.knownFor}. Also: ${profile.quirk}.`), record("bulletin", "Local bulletin", ...W.stationBulletin(w, st)),
      record("occasion", `Today: ${occasion.name}`, occasion.effect));
    if (!st.military && st.factionId !== "vex") rows.push(vote(w, st.factionId));
    if (W.totalShares(p)) rows.push(record("holdings", `Your holdings: ${W.totalShares(p)} shares`, ...Object.entries(p.stakes ?? {}).map(([id, n]) => `${port(id)}: ${n} shares.`)));
    if (st.museum?.length) rows.push(record("museum", `Museum: ${st.museum.length} pieces`, ...st.museum.map(m => `${m.item}, donated by ${m.by}.`)));
    for (const m of [...(p.mail ?? [])].reverse()) rows.push(record(`letter:${key(m)}`, `Letter from ${m.from}`, m.text, m.replied ? "Answered." : "Awaiting an answer. L opens letters. R answers the newest unanswered letter."));
    const serial = serialLines(w);
    if (serial) rows.push(record("serial", `Galnet serial: ${serial.title}`, serial.where, ...serial.parts.map((part, i) => `Part ${i + 1}: ${part}`), ...(serial.hook ? [serial.hook] : [])));
    for (const news of w.news) rows.push(record(`news:${key(news)}`, news.headline, news.body));
    return rows;
  }
  if (scene.tab === 10) {
    rows.push(record("wire", "Fleet Wire", `Call sign: ${wire.getCallsign() ?? "none"}. C changes your call sign.`,
      scene.wireEvents.length ? `${scene.wireEvents.length} retained transmissions.` : scene.wireLoaded ? "Nothing on the wire yet, or the connection is unavailable." : "Tuning..."));
    const duplicate = new Map<string, number>();
    for (const e of scene.wireEvents) {
      const identity = JSON.stringify([e.t, e.callsign, e.kind, e.text, e.system, e.tag]), n = duplicate.get(identity) ?? 0; duplicate.set(identity, n + 1);
      rows.push(record(`wire:${identity}:${n}`, `${e.tag ? `[${e.tag}] ` : ""}${e.callsign}: ${e.kind}`, e.text, `${e.system}. ${wire.ageLabel(e.t) === "NOW" ? "Just now" : wire.ageLabel(e.t) + " ago"}.`));
    }
    for (const [id, entries] of Object.entries(scene.boards)) rows.push(record(`board:${id}`, `${id}: leaderboard`, ...entries.map((e, i) => `${i + 1}. ${e.tag ? `[${e.tag}] ` : ""}${e.callsign}: ${e.score}`)));
    rows.push(record("nearby", "Pilots in this system", ...([...presence.ghosts.values()].map(e => `${e.tag ? `[${e.tag}] ` : ""}${e.callsign}`).length
      ? [...presence.ghosts.values()].map(e => `${e.tag ? `[${e.tag}] ` : ""}${e.callsign}`) : [presence.status === "on" ? "No other pilots here right now." : "Presence is offline."])));
    for (const sq of scene.squadrons) rows.push(record(`squadron:${sq.tag}`, `[${sq.tag}]${wire.getSquadron() === sq.tag ? " Your squadron" : ""}`,
      `${sq.members} pilots. ${sq.score} points. ${sq.credits} credits. ${sq.discoveries} discoveries. ${sq.kills} kills.`,
      ...(sq.base ? [`Base: ${sq.base.stationName}, ${sq.base.systemName}. Treasury ${sq.base.treasury}CR.`] : []),
      ...Object.entries(sq.standing ?? {}).map(([id, value]) => `${faction(id)?.name ?? id}: ${signed(value)} standing.`),
      ...Object.entries(scene.patrons).filter(([, tag]) => tag === sq.tag).map(([id]) => `Patron of ${faction(id)?.name ?? id}.`)));
    return rows;
  }
  if (scene.tab === 5) {
    if (scene.surveyView === "data") {
      const worth = Math.round(p.expData ?? 0), paid = Math.round(worth * (st.type === "research" ? 1.25 : 1));
      rows.push(record("data", "Exploration data", `${worth} unsold data. This station pays ${paid}CR${st.type === "research" ? ", including its 25% research bonus" : ""}. Enter or Sell data makes the sale.`,
        "Arrive to make a navigation log. Hold V in flight for a detailed scan. Survey worlds from orbit and make first discoveries.",
        "A discovery scanner logs fully on arrival. A surface scanner doubles survey pay. Research posts pay 25% more."));
      for (const kind of ["explorer", "trader", "miner", "rescuer"] as const) {
        const rank = W.rankOf(p, kind), value = Math.round(W.rankValue(p, kind)), unit = kind === "miner" ? "units" : kind === "rescuer" ? "points" : "CR";
        rows.push(record(`career:${kind}`, `${kind}: ${rank.title}`, `${value} ${unit}. ${rank.next ? `Next rank at ${rank.next} ${unit}.` : "Top rank reached."}`));
      }
      rows.push(record("logged", `Logged systems: ${Object.keys(p.expLog ?? {}).length}/${Object.keys(w.systems).length}`, "Each logged system follows below. C opens the codex."));
      for (const [id, level] of Object.entries(p.expLog ?? {})) rows.push(record(`system:${id}`, w.systems[id]?.name ?? id, level === 2 ? "Detailed scan." : "Basic navigation log.", ...(p.firsts?.[id] ? [`First discovered by ${p.firsts[id]}.`] : [])));
    } else {
      const entries = Object.entries(p.codex ?? {}), known = new Set<string>();
      for (const [prefix, title, blurb] of [
        ["flora:", "Flora", "Scan with the rover by holding V. Each new species pays 120 data."],
        ["fauna:", "Fauna", "Animals met on the ground."], ["biome:", "Biomes", "A new biome visited pays 120 data."],
        ["signal:", "Signals", "Signals heard on no known band."], ["wonder:", "Wonders", "A first sight pays 400 data."],
        ["contact:", "Contacts", "Contacts met on the lanes. The number records how far each went."],
      ]) {
        const items = entries.filter(([id]) => id.startsWith(prefix));
        rows.push(record(`group:${prefix}`, `${title}: ${items.length}`, blurb, ...items.map(([id, value]) => { known.add(id); return `${id.slice(prefix.length)}: ${value}`; })));
      }
      const other = entries.filter(([id]) => !known.has(id));
      if (other.length) rows.push(record("other", "Other codex entries", ...other.map(([id, value]) => `${id}: ${value}`)));
      const caps = (w.captains ?? []).filter(c => c.met > 0), notables = (w.notables ?? []).filter(n => n.carried > 0);
      rows.push(record("people", "People", `${caps.length} captains: ${caps.filter(W.isFriend).length} friends, ${caps.filter(W.isRival).length} rivals. ${notables.length} notables carried. ${(p.alumni ?? []).length} old hands.`,
        `${Object.keys(p.flags ?? {}).filter(id => id.startsWith("family:")).length} family visits. ${p.envoys ?? 0} envoys. ${p.patients ?? 0} patients.`,
        ...caps.map(c => `${c.name}, aboard ${c.ship}, met ${c.met} times${W.isFriend(c) ? ", friend" : W.isRival(c) ? ", rival" : ""}.`)));
    }
    rows.push(record("discovery-record", "Discovery record", `${Object.values(p.firsts ?? {}).filter(c => c === wire.getCallsign()).length} first discoveries. ${Object.values(p.ground ?? {}).filter(s => s.charted).length} regions charted. ${Object.values(p.encounters ?? {}).reduce((a, b) => a + b, 0)} encounters. ${p.lives ?? 0} lives saved.`));
    return rows;
  }
  if (scene.tab !== 11) return rows;
  switch (scene.recordView) {
    case "log":
      rows.push(record("log", `Captain's log: stardate ${W.stardate(w)}`, `${(p.log ?? []).length} retained entries. X exports your Chronicle.`));
      for (const e of [...(p.log ?? [])].reverse()) rows.push(record(`log:${key(e)}`, `Stardate ${(41000 + e.t / 360).toFixed(1)}`, e.text));
      break;
    case "guestbook":
      rows.push(record("guestbook", "The guestbook", `${p.fares ?? 0} fares landed. ${(p.guestbook ?? []).length} signatures.`, "The lounge at a station has people who need a ride."));
      for (const e of [...(p.guestbook ?? [])].reverse()) rows.push(record(`guest:${key(e)}`, e.name, `${e.kind}. ${e.from} to ${e.to}. Mood ${e.mood}.`, e.line));
      break;
    case "ledger": {
      const entries = Object.entries(p.ledger ?? {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      const income = entries.filter(([, v]) => v > 0).reduce((sum, [, v]) => sum + v, 0), outgo = entries.filter(([, v]) => v < 0).reduce((sum, [, v]) => sum + v, 0);
      rows.push(record("ledger", "Lifetime ledger", `In ${income}CR. Out ${outgo}CR. Net ${income + outgo}CR. Aboard now ${p.credits}CR.`));
      for (const [id, value] of entries) rows.push(record(`ledger:${id}`, W.LEDGER_LABELS[id] ?? id, `${signed(value)}CR`));
      break;
    }
    case "week": {
      rows.push(record("week", `The week of ${W.weekKey()}`, "Votes, border changes, races and holdings."));
      for (const id of new Set(Object.values(w.systems).map(s => s.factionId).filter((f): f is string => !!f && f !== "vex"))) rows.push(vote(w, id));
      const border = W.borderStanding(w);
      rows.push(record("border", "The border", ...(border ? [`${w.systems[border.c.systemId].name}: ${faction(border.c.incumbent).name} ${border.inc} versus ${faction(border.c.challenger).name} ${border.chal}. Your push: ${border.yoursInc} to hold, ${border.yoursChal} to change control.`] : ["No current border contest."]),
        ...[...(w.borderLog ?? [])].reverse().map(b => `${b.week}: ${w.systems[b.systemId]?.name ?? b.systemId} ${b.flipped ? `fell to ${faction(b.to).name}` : `held for ${faction(b.from).name}`}. Your push ${b.yours}.`)));
      rows.push(record("lanes", "The lanes", W.regattaObjective(w) ?? (p.regatta === 3 ? "Regatta champion." : "Regatta not entered. Finish any ring race."),
        ...(p.marshalWager ? ["Marshal's wager: the next run under par pays double."] : []),
        ...Object.entries(p.raceBest ?? {}).map(([id, t]) => `${port(id)} best time: ${t.toFixed(1)} seconds.`),
        `The lanes call you ${W.captainNickname(w) ?? "by your name"}. ${p.postRuns ?? 0} mail bags, ${p.fares ?? 0} fares, ${p.rescues ?? 0} rescues, ${p.races ?? 0} races.`));
      rows.push(record("holdings", "Holdings", ...Object.entries(p.stakes ?? {}).map(([id, n]) => `${port(id)}: ${n} shares.`), "V on the Market tab buys shares."),
        record("charters", "Charters", ...(p.haulers ?? []).map(c => `${c.name}: ${c.trips} trips, till ${Math.round(c.till)}CR.`)),
        record("fleet", "Fleet", ...(p.fleet ?? []).map(f => `${f.name ?? hull(f.hullId).name} at ${port(f.stationId)}.`)));
      break;
    }
    case "harbour": return harbourRecords(w, st);
    default: {
      const have = new Set(p.achievements ?? []);
      rows.push(record("service", `Service record${w.hardcore ? ": Hardcore" : ""}`, `${W.registry(w)}, ${W.commandRank(p)}.`,
        `Kills ${p.kills}. Discoveries ${p.discoveries}. Arcs ${Object.values(p.arcs).reduce((a, b) => a + b, 0)}/25. Credits ${p.credits}. Crew ${p.crew.length}. Hull ${hull(p.hullId).name}.`,
        `Time ${Math.floor(w.time / 60)} minutes. Achievements ${have.size}/${ACHIEVEMENTS.length}.`,
        ...(["explorer", "trader", "miner", "rescuer"] as const).map(kind => `${kind}: ${W.rankOf(p, kind).title}.`)));
      for (const a of ACHIEVEMENTS) rows.push(record(`achievement:${a.id}`, `${have.has(a.id) ? "Earned" : "Locked"}: ${a.title}`, a.desc));
    }
  }
  return rows;
}

function harbourRecords(w: W.World, st: W.StationDef): StationRecord[] {
  const p = w.player, time = stationHour(st), rate = hoursRate(st), caps = W.berthedCaptains(w, st.id), parked = (p.fleet ?? []).filter(f => f.stationId === st.id);
  const aboard: string[] = [], pages: string[] = [];
  const cadet = p.crew.find(c => (c.docks ?? 0) === 0);
  if (cadet) aboard.push(`Cadet ${cadet.name}: no dockings yet.`);
  if (p.missions.some(m => m.passengerKind === "prisoner" && m.accepted && !m.done)) aboard.push(`A prisoner in irons. ${p.crew.some(c => c.role === "gunner" && !c.sick) ? "Guarded." : "No guard."}`);
  if (p.numberOne) aboard.push(`Number One: ${p.numberOne}.`);
  if (p.catchphrase) aboard.push(`The word: ${p.catchphrase}`);
  if ((p.ruleKept ?? 0) + (p.ruleBroken ?? 0)) aboard.push(`The rule: kept ${p.ruleKept ?? 0}, broken ${p.ruleBroken ?? 0}.`);
  if (W.isBeltStation(st) || (p.beltStanding ?? 0) > 0) aboard.push(`Belt standing ${Math.min(W.BELT_FREEMAN_AT, p.beltStanding ?? 0)}/${W.BELT_FREEMAN_AT}. ${(p.beltStanding ?? 0) >= W.BELT_FREEMAN_AT ? "Freeman of the Belt." : "Hoppers, spins, registers and runs count."}`);
  if (p.waterToBelt) aboard.push(`Water to the Belt: ${p.waterToBelt} units.${p.waterToBelt >= 50 ? " Waterbearer." : ""}`);
  for (const item of p.lostProperty ?? []) aboard.push(`Lost property: ${item.name}, owner ${item.owner}${item.stationId === st.id ? ", got off here" : ""}.`);
  for (const item of p.keepsakes ?? []) aboard.push(`Kept aboard: ${item}`);
  for (const s of p.systems.filter(s => s.health < 60)) aboard.push(`Yard attention: ${s.name}, ${Math.round(s.health)}% health.`);
  for (const m of W.passengersAboard(p).filter(m => m.request && !m.requestSettled)) aboard.push(`${m.passengerName ?? "A fare"} wants ${m.request === "meal" ? "a hot meal" : m.request === "quiet" ? "a quiet run" : m.request === "star" ? "the star up close" : "a view"}${m.requestMet ? " (done)" : ""}.`);
  if ((p.mail ?? []).some(m => !m.replied)) pages.push("A letter waits for an answer. News, R.");
  if (p.cat && p.catAway === st.id) pages.push(`${p.cat.name} is on the promenade.`);
  for (const c of p.crew.filter(c => c.home === st.id && !c.sick && !(p.flags ?? {})[`family:${st.id}:${c.name}:${W.weekKey()}`])) pages.push(`${c.name}'s people are on the promenade.`);
  if (p.missions.some(m => m.accepted && !m.done && m.targetStationId === st.id)) pages.push("A consignment is due here. Missions tab.");
  if (p.hull < p.hullMax * 0.4) pages.push("The hull needs repair. Shipyard tab.");
  if (p.fuel < p.fuelMax * 0.15) pages.push("Fuel is low. Shipyard tab.");
  return [record("clock", `${st.name} harbour`, `${W.registry(w)}, ${W.commandRank(p)}.`,
    `${clockText(time)} station time, ${time.label}. Yard: ${rate.label || "standard rate"}${rate.mul !== 1 ? ` (${signed(Math.round((rate.mul - 1) * 100))}%)` : ""}. The lounge is ${rate.lounge >= 0.75 ? "full" : rate.lounge <= 0.35 ? "quiet" : "busy enough"}.`),
    record("bays", "In the bays", `${p.shipName ?? hull(p.hullId).name} in bay 4.`, ...parked.map(f => `Your ${f.name ?? hull(f.hullId).name} across the deck.`),
      ...caps.map(c => `${c.name} off the ${c.ship}${W.isRival(c) ? ", rival" : W.isFriend(c) ? ", friend" : ""}.`)),
    record("dockhand", "The dockhand", ...dockhandLines(w, st, new RNG(hashStr(`dh:${st.id}:${W.weekKey()}`)))),
    record("aboard", "On your ship", ...(aboard.length ? aboard : ["No outstanding cabin requests."])),
    record("paging", "Paging", ...(pages.length ? pages : ["Nothing for you on the tannoy."]))];
}
