// Crew roles, what they do for you, and what they say.

export type CrewRole = "engineer" | "gunner" | "pilot" | "medic";

export interface CrewMember {
  name: string;
  role: CrewRole;
  skill: number;   // 1..3
  morale: number;  // 0..100
  wage: number;    // credits per docking
  request?: CrewRequest | null; // a personal ask, pending
  loyalty?: number; // grows when you look after them; loyal crew don't quit over one bad week
  home?: string;    // station id where they signed on; where their people are
  trait?: string;   // one line of who they are off duty
  docks?: number;   // dockings served aboard this ship
  sick?: { kind: string; until: number } | null; // laid up until world time; no bonus while sick
  retireAsked?: boolean; // the retirement talk has happened
}

// What crew ask for, and how long they wait. Each is honoured at a docking.
export type CrewRequest =
  | { kind: "visit"; stationId: string; docks: number }                 // pass by their people
  | { kind: "goods"; commodityId: string; qty: number; docks: number }  // bring something aboard
  | { kind: "letter"; stationId: string; docks: number };              // carry a letter home

export const CREW_TRAITS = [
  "hums old hymns in the engine room", "reads in the galley after lights-out", "keeps a plant alive in the bunk room",
  "writes letters home every dock", "plays cards for matchsticks", "sleeps through anything but alarms",
  "names every drone", "collects station stamps", "cooks on the reactor housing", "sketches the crew when they think nobody sees",
  "talks to the ship like it listens", "knows a song for every gate", "keeps a tally of near misses on the bulkhead",
  "never sits with their back to the airlock", "sends money home and never says so", "runs laps of the deck before a jump",
];

// Things crew catch. Days here are world seconds; a medic aboard halves them.
export const SICKNESS = [
  { kind: "dock fever", days: 360 }, { kind: "a coolant rash", days: 240 }, { kind: "gate sickness", days: 180 },
  { kind: "a cracked rib", days: 480 }, { kind: "the grey flu", days: 420 },
];

export const RETIRE_DOCKS = 30;   // a tour long enough to think about going home
export const LEAVE_DOCKS = 8;     // dockings they'll wait for you before finding another ship

export const ROLE_INFO: Record<CrewRole, { label: string; effect: string; baseWage: number }> = {
  engineer: { label: "ENGINEER", effect: "Faster repairs; patches systems mid-flight", baseWage: 40 },
  gunner:   { label: "GUNNER", effect: "Auto-turret on nearby corsairs; +20% damage", baseWage: 55 },
  pilot:    { label: "PILOT", effect: "+15% thrust and turn rate", baseWage: 50 },
  medic:    { label: "MEDIC", effect: "Slow hull triage between fights; keeps morale up", baseWage: 35 },
};

export const CREW_LINES: Record<CrewRole, { high: string[]; mid: string[]; low: string[] }> = {
  engineer: {
    high: ["Reactor's purring. Don't touch anything.", "I re-routed the coolant. You're welcome.", "Best engine room I've had. Don't get it shot."],
    mid: ["Could use more spare parts, Captain.", "Scrubbers are fine. For now.", "I'll get to the comms array after lunch."],
    low: ["I'm not paid enough to breathe recycled air.", "When's the last time we ate real food?", "I've had offers, you know."],
  },
  gunner: {
    high: ["Turret's warm. Point me at something.", "Three corsairs last week. Three.", "Nice shooting back there. Almost as good as mine."],
    mid: ["Ammo feeds are fine. Aim's on you.", "Quiet out here. Too quiet.", "Wake me if there's a fight."],
    low: ["You fly like a freighter pilot.", "I signed on to shoot pirates, not haul ore.", "Morale's in the bilge, Captain."],
  },
  pilot: {
    high: ["Let me take her through the belt. Trust me.", "Smooth burn today. Felt good.", "I've plotted a better route. Check the map."],
    mid: ["Fuel's tight. Watch the gates.", "Standing by at the helm.", "You always brake so late?"],
    low: ["I could be flying for the Compact.", "This hull handles like a brick.", "Sleep would be nice. Real sleep."],
  },
  medic: {
    high: ["Everyone's healthy. Boring. Perfect.", "I restocked the med bay from cargo. Hope that's fine.", "You're welcome for the hull patch. It's not really medicine."],
    mid: ["Crew needs a hot meal, Captain.", "Minor burns from the reactor. Nothing dramatic.", "Morale's a medical issue too."],
    low: ["We're one bad jump from a funeral.", "I've seen better-run ships. In wrecks.", "Buy food. Please."],
  },
};
