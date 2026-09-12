import type { HullDef } from "./hulls";
import type { ShipSystemId } from "../world";

// Deck layouts per hull. # wall . floor D door C cockpit E engines L scrubbers
// W weapons G cargo R reactor M comms B bunk K galley S study c crew spot p passenger seat
export const DECKS: Record<HullDef["deck"], string[]> = {
  scout: [
    "##############################",
    "#..........##........#....M..#",
    "#..B.......##...R....#.......#",
    "#..........D.........D....C..#",
    "#..K..S....##........#.......#",
    "#..p.......##...L....#..c....#",
    "######D#######D###############",
    "#........#..........#....W...#",
    "#..G.....D..........D........#",
    "#........#....E.....#........#",
    "#........#..........#........#",
    "##############################",
  ],
  prospector: [
    "################################",
    "#....G.....#........#.....M....#",
    "#..........#...R....#..........#",
    "#....G.....D........D.....C....#",
    "#..........#........#..........#",
    "#....G.....#...L....#..c..c....#",
    "#####D#######D##########D#######",
    "#.........#.........#..........#",
    "#..B..K...D....E....D...S..p...#",
    "#.........#.........#....W.....#",
    "################################",
  ],
  freighter: [
    "######################################",
    "#....G....G....#........#.....M......#",
    "#..............#...R....#............#",
    "#....G....G....D........D.....C......#",
    "#..............#........#............#",
    "#....G....G....#...L....#..c..c..c...#",
    "#######D#########D##########D#########",
    "#.......#..........#..........#......#",
    "#..B.B..D....E.....D..K...S...D..p...#",
    "#.......#..........#..........#..W...#",
    "######################################",
  ],
  carrier: [
    "##########################################",
    "#....G....G....#.........#......M........#",
    "#..............#....R....#...............#",
    "#....G....G....D.........D.......C.......#",
    "#..............#.........#...............#",
    "#..B..B..B.....#....L....#..c..c..c..c..c#",
    "#######D###########D###########D##########",
    "#.......#.............#........#.........#",
    "#..K..S.D......E......D..H..H..D...p.....#",
    "#.......#.............#........#....W....#",
    "#.......#.............#..H..H..#.........#",
    "##########################################",
  ],
  interceptor: [
    "##########################",
    "#....M....#.....#....C...#",
    "#.........D..R..D........#",
    "#..W......#.....#..c.....#",
    "####D#######D#####D#######",
    "#......#........#........#",
    "#..B...D...E....D..K..S..#",
    "#..G...#...L....#..p..c..#",
    "##########################",
  ],
};

export interface PanelDef { ch: string; sysId: ShipSystemId | null; label: string; desc: string }
export const PANELS: PanelDef[] = [
  { ch: "A", sysId: null, label: "AIRLOCK", desc: "Return to flight view" },
  { ch: "C", sysId: null, label: "COCKPIT", desc: "Take the helm" },
  { ch: "E", sysId: "engines", label: "MAIN ENGINES", desc: "Thrust output" },
  { ch: "L", sysId: "life", label: "AIR SCRUBBERS", desc: "O2 recycling" },
  { ch: "R", sysId: "reactor", label: "REACTOR CORE", desc: "Ship power" },
  { ch: "W", sysId: "weapons", label: "WEAPON MOUNTS", desc: "Cannon feeds" },
  { ch: "G", sysId: "cargo", label: "CARGO BAY", desc: "Stowed goods" },
  { ch: "M", sysId: "comms", label: "COMMS ARRAY", desc: "Listen to the band" },
  { ch: "B", sysId: null, label: "BUNK", desc: "Sleep (skips 60s)" },
  { ch: "K", sysId: null, label: "GALLEY", desc: "Eat (needs provisions)" },
  { ch: "S", sysId: null, label: "STUDY TERMINAL", desc: "Senior staff briefing once a leg; train a skill" },
  { ch: "H", sysId: null, label: "HANGAR BAY", desc: "Escort drones" },
];


export function shipDeck(kind: HullDef["deck"], crewSlots = 0): string[] {
  const rows=DECKS[kind],width=Math.max(...rows.map(r=>r.length));
  const deck=rows.map(r=>r.padEnd(width,"#"));
  if(deck[3][1]===".")deck[3]=deck[3].slice(0,1)+"A"+deck[3].slice(2);
  let seats = deck.join("").split("c").length - 1;
  // Extra berths share the hull layout without displacing panels or doors.
  for (let y = 5; y < deck.length - 1 && seats < crewSlots; y++) {
    for (let x = deck[y].length - 3; x > 1 && seats < crewSlots; x -= 2) {
      if (deck[y][x] !== ".") continue;
      deck[y] = deck[y].slice(0, x) + "c" + deck[y].slice(x + 1);
      seats++;
    }
  }
  return deck;
}
