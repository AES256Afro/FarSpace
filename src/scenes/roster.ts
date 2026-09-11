// The roster: everyone aboard, how they're doing, and a bonus when they've
// earned one. Reached with R aboard or in the lounge, or from the pause menu.

import { Game, Scene, VW, VH } from "../game";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { ROLE_INFO, XP_STEPS_LABEL, SPECIALTIES } from "../data/crew";
import { bond, bondLabel, findStation, ledger, XP_STEPS, onWatch, captainNickname, firstOfficer, reviewDue, reviewCrew, shipVoiceName } from "../world";
import type { Encounter } from "../data/encounters";
import type { EncounterScene } from "./encounter";
import { flag } from "../core/achievements";
import { arcObjective } from "../core/crewarcs";
import { lastLegObjective, plotLastLeg } from "../core/lastleg";
import { sfx } from "../core/sfx";

export class RosterScene implements Scene {
  touchMode = "menu" as const;
  cursor = 0;
  enter(): void { this.cursor = 0; }
  update(g: Game, dt: number): void {
    void dt;
    const p = g.world.player;
    if (g.input.wasPressed("Escape") || g.input.wasPressed("r")) { const back = g.settingsReturn; g.settingsReturn = "title"; if (back === "flight") (g.scenes.flight as unknown as { resumeNext: boolean }).resumeNext = true; g.setScene(back); return; }
    const n = p.crew.length;
    if (!n) return;
    if (g.input.wasPressed("n")) {
      const c = p.crew[this.cursor];
      g.toast(plotLastLeg(g.world, c) ? "FINAL JOURNEY COURSE SET. N IN FLIGHT TAKES THE ROUTE."
        : c.lastLeg ? "THE ROUTE IS CLOSED. THE PROMISE CAN WAIT." : "THIS CREW MEMBER HAS NO FINAL JOURNEY PLANNED.");
      g.autosave(); return;
    }
    if (g.input.wasPressed("ArrowDown")) { this.cursor = (this.cursor + 1) % n; sfx.blip(); }
    if (g.input.wasPressed("ArrowUp")) { this.cursor = (this.cursor + n - 1) % n; sfx.blip(); }
    if (g.input.wasPressed("s") && p.flags?.shipCrew && p.crew.length) {
      const lines = p.crew.map((c) => { const n = c.name.split(" ")[0].toUpperCase(); const bd = c.trait ?? ""; const line = c.wasCadet && firstOfficer(p) === c ? `${n}: CAME ABOARD FOR A LEFT-HANDED SPANNER AND ENDED UP WITH THE CONN. I WATCHED THE WHOLE THING. I'D WATCH IT AGAIN.` : c.sick ? `${n}: COUGHING IN THE BUNK ROOM. I'VE WARMED THE AIR. I'D LIKE THEM BETTER.` : (c.docks ?? 0) === 0 ? `${n}: NEW. WALKS INTO THE SAME HATCH COAMING EVERY WATCH. I'VE STOPPED MOVING IT.` : c.morale < 40 ? `${n}: QUIET LATELY. SITS AT THE VIEWPORT ON THE OFF-WATCH. I LEAVE THE LIGHTS LOW FOR THEM.` : (c.loyalty ?? 0) >= 2 ? `${n}: WOULD FLY ME INTO A STAR IF YOU ASKED, AND FIX THE PAINT AFTER. I'D LET THEM.` : bd.includes("cooks") ? `${n}: THE GALLEY SMELLS OF SOMETHING WHEN THEY'RE ON. I DON'T EAT. I NOTICE.` : bd.includes("rock") ? `${n}: TALKS TO ME IN BELT WORDS WHEN NOBODY'S LISTENING. I ANSWER IN THE HUM.` : c.role === "engineer" ? `${n}: KNOWS WHERE I ACHE BEFORE I DO. THAT'S EITHER SKILL OR LISTENING. I'LL TAKE EITHER.` : c.role === "pilot" ? `${n}: FLIES ME LIKE I'M BORROWED. I MEAN THAT KINDLY. MOSTLY.` : c.role === "medic" ? `${n}: HAS NEVER ONCE ASKED HOW I AM. I'M NOT HURT BY THAT. I'M A LITTLE HURT BY THAT.` : `${n}: STANDS AT TACTICAL LIKE THE GUNS ARE THEIRS. THEY ARE, I SUPPOSE. I'M THE ONE THAT FLINCHES.`; return line; });
      const enc: Encounter = { id: "shipreviewcrew", where: "space", title: `${shipVoiceName(p)} ON THE CREW`, weight: 0, text: lines.join("\n"), options: [{ label: "THANK YOU", result: (g2) => { flag(g2, "shipreviewcrew"); return "'I HAVE MORE. I'LL SAVE IT FOR THE NEWSLETTER.'"; } }] };
      (g.scenes["encounter"] as EncounterScene).open(g, enc, "roster", true); sfx.select();
      return;
    }
    if (g.input.wasPressed("v")) {
      const c = p.crew[this.cursor];
      if (!reviewDue(p, c)) { g.toast(`${c.name.toUpperCase()} HAD THEIR REVIEW THIS WEEK. NEXT WEEK.`); return; }
      const fo = firstOfficer(p);
      const enc: Encounter = { id: "review", where: "space", title: `REVIEW: ${c.name.toUpperCase()}`, weight: 0,
        text: `${c.name}, ${ROLE_INFO[c.role].label.toLowerCase()}, ${c.docks ?? 0} docking${(c.docks ?? 0) === 1 ? "" : "s"} aboard, morale ${Math.round(c.morale)}, loyalty ${(c.loyalty ?? 0).toFixed(1)}.${fo === c ? " Number One." : ""} A chair in the study, the door shut, the kettle on. They know what this is.`,
        options: [
          { label: "COMMEND THEM", hint: "Morale +8, loyalty +0.5, a line in the log", result: (g2) => { sfx.pickup(); flag(g2, "review"); return reviewCrew(g2.world, c, "commend"); } },
          { label: "COUNSEL THEM", hint: "Morale -3, a step toward the next skill", result: (g2) => { sfx.select(); flag(g2, "review"); return reviewCrew(g2.world, c, "counsel"); } },
          ...(fo !== c && p.crew.length >= 2 ? [{ label: "MAKE THEM NUMBER ONE", hint: "The deck when you don't have it; the crew will hear", result: (g2: Game) => { sfx.pickup(); flag(g2, "review"); return reviewCrew(g2.world, c, "numberone"); } }] : []),
          { label: "JUST THE KETTLE", result: () => "YOU TALK ABOUT NOTHING FOR TEN MINUTES, WHICH IS ALSO A KIND OF REVIEW." },
        ] };
      (g.scenes["encounter"] as EncounterScene).open(g, enc, "roster", true);
      return;
    }
    if (g.input.wasPressed("Enter")) {
      const c = p.crew[this.cursor];
      if (p.credits < 100) { g.toast("NOT ENOUGH CREDITS FOR A BONUS"); return; }
      p.credits -= 100; ledger(p, "crew", -100); c.morale = Math.min(100, c.morale + 15); c.loyalty = (c.loyalty ?? 0) + (c.morale >= 100 ? 0 : 0.5);
      g.toast(`${c.name.toUpperCase()} POCKETS 100CR. MORALE UP.`); sfx.pickup();
    }
  }
  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    const p = g.world.player; const w = g.world;
    ctx.fillStyle = PAL.uiPanel; ctx.fillRect(0, 0, VW, VH);
    drawText(ctx, `THE ROSTER - ${p.crew.length} ABOARD${(p.shoreCrew ?? []).length ? `, ${(p.shoreCrew ?? []).length} ON LEAVE` : ""} - ENTER: 100CR BONUS - V REVIEW - ESC BACK`, 12, 8, PAL.white);
    if (!p.crew.length) { drawText(ctx, "NOBODY ABOARD BUT YOU. THE LOUNGE AT ANY STATION HAS PEOPLE LOOKING FOR A BERTH.", 12, 30, PAL.greyDark); }
    let y = 24;
    p.crew.forEach((c, i) => {
      const sel = i === this.cursor;
      if (sel) { ctx.fillStyle = "#13203a"; ctx.fillRect(6, y - 3, VW - 12, 40); }
      const home = c.home ? `${findStation(w, c.home)?.st.name ?? "?"}${Object.keys(p.flags ?? {}).some((k) => k.startsWith(`family:${c.home}:${c.name}:`)) ? " (FAMILY MET)" : ""}` : "no home port";
      drawText(ctx, `${c.name.toUpperCase()}${firstOfficer(p) === c ? " (NUMBER ONE)" : ""} - ${ROLE_INFO[c.role].label} ${"*".repeat(c.skill)}${c.specialty ? " - " + (SPECIALTIES[c.role].find((x) => x.id === c.specialty)?.name ?? "") : c.skill >= 3 ? " - HAS A CHOICE TO MAKE (TALK ABOARD)" : ""}${c.sick ? " - LAID UP (" + c.sick.kind.toUpperCase() + ")" : p.crew.length >= 2 ? (onWatch(p, i, w.time) ? " - ON WATCH" : " - OFF WATCH") : ""}`, 12, y, sel ? PAL.white : PAL.ui);
      drawText(ctx, `MORALE ${Math.round(c.morale)}   LOYALTY ${(c.loyalty ?? 0).toFixed(0)}   WAGE ${c.wage}CR   ${c.docks ?? 0} DOCKINGS   HOME ${home.toUpperCase()}`, 12, y + 9, PAL.grey);
      const xp = c.xp ?? 0, need = c.skill < 3 ? XP_STEPS[c.skill] : 0;
      ctx.fillStyle = PAL.greyDark; ctx.fillRect(300, y + 1, 80, 3); ctx.fillStyle = c.morale >= 65 ? PAL.good : c.morale >= 30 ? PAL.warn : PAL.danger; ctx.fillRect(300, y + 1, Math.round(c.morale * 0.8), 3); drawText(ctx, "MORALE", 384, y - 1, PAL.greyDark);
      if (need) { ctx.fillStyle = PAL.greyDark; ctx.fillRect(300, y + 10, 80, 3); ctx.fillStyle = PAL.info; ctx.fillRect(300, y + 10, Math.round(80 * Math.min(1, xp / need)), 3); drawText(ctx, `${XP_STEPS_LABEL} ${xp}/${need}`, 384, y + 8, PAL.greyDark); }
      else drawText(ctx, "AT THEIR BEST", 384, y + 8, PAL.gold);
      const rel = p.crew.filter((o) => o !== c && bond(c, o) !== 0).map((o) => `${o.name} ${bondLabel(bond(c, o)).toLowerCase()}`).join(", ");
      const arc = arcObjective(w, c);
      drawText(ctx, `${c.trait ? c.trait.toUpperCase() + ". " : ""}${rel ? rel.toUpperCase() + ". " : ""}${c.request ? "HAS AN ASK. " : ""}${c.arc?.done ? "STORY TOLD." : arc ? arc.split(": ").slice(1).join(": ").slice(0, 50) : ""}`.slice(0, 112), 12, y + 18, PAL.greyDark);
      const last = lastLegObjective(w, c);
      if (last) drawText(ctx, `${last} - N: PLOT`.slice(0, 112), 12, y + 28, PAL.gold);
      y += 44;
    });
    for (const s of p.shoreCrew ?? []) { drawText(ctx, `${s.member.name.toUpperCase()} - ON LEAVE AT ${(findStation(w, s.stationId)?.st.name ?? "?").toUpperCase()} (${s.docks} DOCKINGS SO FAR)`, 12, y, PAL.gold); y += 10; }
    if (p.flags?.shipCrew) { const wear = Math.round(p.wear ?? 0); const mood = wear > 70 ? "ACHING" : p.hull < p.hullMax * 0.5 ? "HOLED" : p.fuel < p.fuelMax * 0.2 ? "HUNGRY" : "FINE"; const line = `${shipVoiceName(p)} - THE SHIP - EVERY WATCH - WEAR ${wear}% - ${mood} - "${wear > 70 ? "A YARD, WHEN YOU CAN." : "I'M GOOD AT SHORT."}"`; drawText(ctx, line, 12, VH - 22, PAL.uiDim); }
    drawText(ctx, `CREDITS ${p.credits}   WAGES ${p.crew.reduce((a, c) => a + c.wage, 0)}CR A DOCKING   CAT ${p.cat ? p.cat.name.toUpperCase() : "NONE"}   BERTHS ${p.crew.length + (p.shoreCrew ?? []).length}${captainNickname(w) ? `   THE LANES CALL YOU ${captainNickname(w)}` : ""}`, 12, VH - 12, PAL.greyDark);
    void textWidth;
  }
}
