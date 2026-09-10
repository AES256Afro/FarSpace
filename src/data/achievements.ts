// Achievements: pure checks over the world. Unlocks are stored on the player and
// announced on the Fleet Wire.

import type { World } from "../world";

export interface Achievement { id: string; title: string; desc: string; check: (w: World) => boolean }

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_blood", title: "FIRST BLOOD", desc: "Destroy a corsair", check: (w) => w.player.kills >= 1 },
  { id: "ace", title: "ACE", desc: "Destroy 25 corsairs", check: (w) => w.player.kills >= 25 },
  { id: "hunter", title: "HEADHUNTER", desc: "Destroy a named corsair captain", check: (w) => !!w.player.flags?.captain },
  { id: "torpedo", title: "FISH IN THE WATER", desc: "Kill with a torpedo", check: (w) => !!w.player.flags?.torpedoKill },
  { id: "samaritan", title: "GOOD SAMARITAN", desc: "Answer a distress call", check: (w) => !!w.player.flags?.rescue },
  { id: "surveyor", title: "SURVEYOR", desc: "Log 10 discoveries", check: (w) => w.player.discoveries >= 10 },
  { id: "cartographer", title: "CARTOGRAPHER", desc: "Log 40 discoveries", check: (w) => w.player.discoveries >= 40 },
  { id: "tomb", title: "TOMB RAIDER", desc: "Clear a ruin of relics", check: (w) => !!w.player.flags?.ruinCleared },
  { id: "scavenger", title: "SCAVENGER", desc: "Strip a derelict", check: (w) => !!w.player.flags?.wreckLooted },
  { id: "captain", title: "CAPTAIN", desc: "Crew a full ship", check: (w) => w.player.crew.length >= 3 },
  { id: "upgrade", title: "TRADED UP", desc: "Buy a new hull", check: (w) => w.player.hullId !== "scout" },
  { id: "carrier", title: "FLAG OFFICER", desc: "Command the Aegis Carrier", check: (w) => w.player.hullId === "carrier" },
  { id: "rich", title: "TEN THOUSAND", desc: "Hold 10,000 credits", check: (w) => w.player.credits >= 10000 },
  { id: "arc", title: "STORYTELLER", desc: "Complete a faction arc", check: (w) => Object.values(w.player.arcs).some((v) => v >= 3) },
  { id: "allied", title: "ALLIED", desc: "Reach ALLIED standing with a faction", check: (w) => Object.values(w.player.rep).some((v) => v >= 75) },
  { id: "outlaw", title: "OUTLAW", desc: "Reach OUTLAW standing with a faction", check: (w) => Object.values(w.player.rep).some((v) => v <= -75) },
  { id: "daily", title: "REGULAR", desc: "Complete a daily contract", check: (w) => !!w.player.flags?.daily },
  { id: "hardcore", title: "COLD VOID", desc: "Reach 5,000 credits in hardcore", check: (w) => !!w.hardcore && w.player.credits >= 5000 },
];
