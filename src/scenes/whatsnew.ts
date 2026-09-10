// What's new: a short changelog for returning pilots, reachable from the title.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";

const NOTES: [string, string[]][] = [
  ["0.14 - SQUADRON BASES", [
    "A SQUADRON CAN POOL CREDITS AND BUY A CIVILIAN STATION: SHARED VAULT, HALF-PRICE SERVICES,",
    "UPGRADES (DEFENSE GRID, FUEL DEPOT, MARKET STAKE, DEEP VAULT). UNDEFENDED BASES DRAW RAIDERS.",
    "TWO NEW HULLS: ALBATROSS EXPLORER AND OX MINING BARGE. LOST WARS CAN CHANGE A SYSTEM'S FLAG.",
    "WEEKLY BASE CONTRACT AND SQUADRON BOUNTY PAY THE TREASURY. /S TALKS ON YOUR SQUADRON CHANNEL ANYWHERE.",
    "THREE SAVE SLOTS FROM THE TITLE SCREEN, EACH WITH ITS OWN CLOUD CODE. O IN SHIPS PAINTS YOUR TRIM.",
    "MAYDAY: A PILOT UNDER 25% HULL HAILS THE SYSTEM AND OTHERS GET A MARKER. ROVER SUSPENSION AND BATTERY BLUEPRINTS.",
  ]],
  ["0.13 - OTHER PILOTS", [
    "PILOTS IN THE SAME SYSTEM SEE EACH OTHER'S SHIPS. T OPENS THE SYSTEM CHANNEL.",
    "/GIVE AND /PAY HAND OVER GOODS AND CREDITS. KILLS NEAR A WINGMATE ARE SHARED.",
    "SQUADRONS: A SHARED TAG THAT RANKS TOGETHER. THE BEST-STANDING SQUADRON BECOMES",
    "A FACTION'S PATRON. THE GALAXY MAP SHOWS WHERE PILOTS ARE. OPT OUT IN SETTINGS.",
  ]],
  ["0.12 - GROUNDSIDE", [
    "L FROM ORBIT DROPS A ROVER ON ANY REGION: BIOMES, STORMS, NIGHT, OUTCROPS, FLORA,",
    "PROBES, WRECKS. OUTPOSTS, CITIES AND RUINS ARE DOORS ON THE GROUND.",
    "GROUND CONTRACTS ON MISSION BOARDS. A CODEX OF SPECIES AND BIOMES.",
  ]],
  ["0.11 - THE QUIET PROFESSIONS", [
    "TWELVE SHIP MODULES, FUEL SCOOPING, CRUISE (J) AND AUTOPILOT (N), EXPLORATION DATA",
    "AND CAREER RANKS, RARE GOODS, MATERIALS AND AN ENGINEER BAY, CORE MINING WITH",
    "SEISMIC CHARGES, FLEET PARKING, PERMIT SPACE, BLACK MARKETS, WEEKLY COMMUNITY GOAL.",
  ]],
  ["0.10 - DEPTH", [
    "ACHIEVEMENTS, DAILY CONTRACT, HARDCORE MODE, FIVE FACTION ARCS, KEY REBINDING,",
    "MOUSE TURRET AIM, TORPEDOES, PIRATE CAPTAINS, A NEW STARSHIP HUM.",
  ]],
];

export class WhatsNewScene implements Scene {
  touchMode = "menu" as const;
  update(g: Game, dt: number): void {
    void dt;
    if (g.input.wasPressed("Escape") || g.input.wasPressed("Enter") || g.input.mousePressed) g.setScene("title");
  }
  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    void g;
    ctx.fillStyle = PAL.uiPanel; ctx.fillRect(0, 0, VW, VH);
    drawText(ctx, "WHAT'S NEW", 12, 8, PAL.white);
    drawText(ctx, "ESC BACK", VW - textWidth("ESC BACK") - 12, 8, PAL.greyDark);
    let y = 24;
    for (const [title, lines] of NOTES) {
      drawText(ctx, title, 12, y, PAL.ui); y += 9;
      for (const l of lines) { drawText(ctx, l.slice(0, 112), 12, y, PAL.grey); y += 8; }
      y += 6;
    }
    drawText(ctx, "FULL ROADMAP: GITHUB.COM/AES256AFRO/FARSPACE", 12, VH - 14, PAL.greyDark);
  }
}
