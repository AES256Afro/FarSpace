// The week has a shape. One occasion a day, the same for every galaxy and every
// pilot (it keys off the real calendar), each with a small effect and a line.

export type OccasionId = "founders" | "silence" | "lantern" | "market" | "remembrance" | "yard" | "lanes";
export interface Occasion { id: OccasionId; name: string; line: string; effect: string }
export const OCCASIONS: Occasion[] = [
  { id: "founders", name: "FOUNDERS' DAY", line: "Every station remembers who built it. Fares pay half again; crews get the day.", effect: "FARES +50%, CREW MORALE +5 AT DOCK" },
  { id: "silence", name: "THE LONG SILENCE", line: "One day a year the band goes quiet for the ones who never called in. Ships talk to themselves.", effect: "LESS CHATTER; THE SHIP SPEAKS MORE" },
  { id: "lantern", name: "LANTERN NIGHT", line: "Lights hung on every beacon and mast. Pictures taken tonight are kept.", effect: "BEACONS EARN DOUBLE; POSTCARDS PAY 60 DATA" },
  { id: "market", name: "MARKET DAY", line: "Warehouses open their back doors. There is more of everything, for a day.", effect: "STOCK +25% EVERYWHERE" },
  { id: "remembrance", name: "REMEMBRANCE", line: "Names read out on every promenade. The wall of record has more to say.", effect: "ALUMNI AND OLD CAPTAINS REMEMBERED" },
  { id: "yard", name: "YARD DAY", line: "Every yard in the sector works at cost, by old agreement.", effect: "REPAIRS, FUEL AND SERVICE -20%" },
  { id: "lanes", name: "OPEN LANES", line: "The gates run wide today. Jumps cost less for everyone.", effect: "JUMP FUEL -10%" },
];
export function occasionFor(now = Date.now()): Occasion {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0, shared by everyone
  return OCCASIONS[day % OCCASIONS.length];
}
export function isOccasion(id: OccasionId, now = Date.now()): boolean { return occasionFor(now).id === id; }
