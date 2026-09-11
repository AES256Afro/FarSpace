// The week's vote. Every faction puts one question to its captains each week;
// your standing is your weight. Whatever passes shapes the lanes until Monday.

import type { World } from "../world";
import { weekKey, adjustRep, logEntry } from "../world";
import { faction } from "./data";
import { hashStr } from "../core/rng";

export interface Issue { id: string; title: string; text: string; yes: string; no: string; effect: "patrol" | "yard" | "curfew" }
export const ISSUES: Issue[] = [
  { id: "patrols", title: "THE PATROL LEVY", text: "Double the patrols on the lanes, paid for by a levy on every manifest.", yes: "Patrols doubled: half the corsairs on our lanes this week.", no: "Levy refused: the corsairs know it, and there are more of them.", effect: "patrol" },
  { id: "yard", title: "THE YARD SUBSIDY", text: "Subsidise yard services at every station in the faction, for a week, from the treasury.", yes: "Yard services a quarter off across the faction.", no: "No subsidy: the yards raise their rates to make the point.", effect: "yard" },
  { id: "curfew", title: "THE NIGHT CURFEW", text: "Close the promenades on the night shift, except the bars, for the sake of the day crews' sleep.", yes: "Curfew in force: quiet promenades after dark, and the bars fuller.", no: "No curfew: the promenades stay open all night, and the day crews grumble.", effect: "curfew" },
  { id: "tolls", title: "THE GATE TOLL", text: "A toll at every gate, spent on lights in the dark systems.", yes: "Toll levied: the patrols get the money, and the lanes are safer for it.", no: "Toll refused: the dark systems stay dark, and the corsairs like it that way.", effect: "patrol" },
];

export function weeklyIssue(w: World, factionId: string, now = Date.now()): Issue {
  return ISSUES[hashStr(`issue:${weekKey(now)}:${factionId}`) % ISSUES.length];
}
const key = (factionId: string, now: number) => `${weekKey(now)}:${factionId}`;
export function myVote(w: World, factionId: string, now = Date.now()): "yes" | "no" | null {
  return w.player.votes?.[key(factionId, now)] ?? null;
}
// The house lean plus your weight decides it; your weight is your standing, capped
export function voteResult(w: World, factionId: string, now = Date.now()): { passed: boolean; lean: number; weight: number } {
  const issue = weeklyIssue(w, factionId, now);
  const lean = 0.35 + (hashStr(`lean:${weekKey(now)}:${factionId}:${issue.id}`) % 31) / 100;
  const rep = w.player.rep[factionId] ?? 0;
  const weight = Math.max(0.05, Math.min(0.3, rep / 100));
  const mine = myVote(w, factionId, now);
  const total = lean + (mine === "yes" ? weight : mine === "no" ? -weight : 0);
  return { passed: total >= 0.5, lean, weight };
}
export function castVote(w: World, factionId: string, yes: boolean, now = Date.now()): string {
  const p = w.player;
  const k = key(factionId, now);
  if (p.votes?.[k]) return "YOU'VE VOTED THIS WEEK. THE COUNT STANDS.";
  (p.votes ??= {})[k] = yes ? "yes" : "no";
  const r = voteResult(w, factionId, now);
  const issue = weeklyIssue(w, factionId, now);
  const withHouse = (r.passed && yes) || (!r.passed && !yes);
  adjustRep(w, factionId, withHouse ? 4 : 2);
  logEntry(w, `Voted ${yes ? "for" : "against"} ${issue.title.toLowerCase()} in the ${faction(factionId).name}; it ${r.passed ? "passed" : "failed"}`);
  return `${issue.title}: ${r.passed ? "PASSED" : "FAILED"}. ${withHouse ? "YOU VOTED WITH THE HOUSE. +4 STANDING" : "AGAINST THE HOUSE, BUT YOU TURNED UP. +2 STANDING"}`.toUpperCase();
}
// What this week's result does to the lanes of that faction
export function voteMods(w: World, factionId: string, now = Date.now()): { patrol: number; yard: number; curfew: boolean } {
  if (factionId === "vex") return { patrol: 1, yard: 1, curfew: false };
  const issue = weeklyIssue(w, factionId, now);
  const r = voteResult(w, factionId, now);
  return {
    patrol: issue.effect === "patrol" ? (r.passed ? 0.5 : 1.3) : 1,
    yard: issue.effect === "yard" ? (r.passed ? 0.75 : 1.15) : 1,
    curfew: issue.effect === "curfew" && r.passed,
  };
}
