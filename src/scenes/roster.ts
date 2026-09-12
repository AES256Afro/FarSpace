// The roster: everyone aboard, how they're doing, and a bonus when they've
// earned one. Reached with R aboard or in the lounge, or from the pause menu.

import { Game, Scene, VW, VH } from "../game";
import { drawText } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { ROLE_INFO, XP_STEPS_LABEL, SPECIALTIES } from "../data/crew";
import { bond, bondLabel, findStation, ledger, XP_STEPS, onWatch, captainNickname, firstOfficer, reviewDue, reviewCrew, shipVoiceName } from "../world";
import type { Encounter } from "../data/encounters";
import type { EncounterScene } from "./encounter";
import { flag } from "../core/achievements";
import { arcObjective } from "../core/crewarcs";
import { lastLegObjective, plotLastLeg } from "../core/lastleg";
import { sfx } from "../core/sfx";
import { ListView } from "../core/listview";
import { clamp } from "../core/mathx";
import type { CrewMember } from "../data/crew";
import type { World } from "../world";
import { wrapText as wrap } from "../core/text";

const LIST = { x: 8, y: 36, width: 148, rowHeight: 22 };
const DETAIL_ROWS = 19;
const short = (s: string, n: number) => s.length > n ? s.slice(0, n - 3) + "..." : s;

export class RosterScene implements Scene {
  touchMode = "menu" as const;
  view = new ListView<CrewMember>(8);
  detailScroll = 0;
  private world?: World;
  private detailMember?: CrewMember;
  get cursor(): number { return this.view.index; }
  set cursor(index: number) { this.view.select(index); }

  enter(g?: Game): void { if (g) this.sync(g); }
  sync(g: Game): void {
    if (this.world !== g.world) {
      this.world = g.world; this.view = new ListView<CrewMember>(8); this.detailMember = undefined;
    }
    this.view.sync([...g.world.player.crew, ...(g.world.player.shoreCrew ?? []).map(s => s.member)]);
    this.refreshDetail(g);
  }
  private refreshDetail(g: Game): void {
    if (this.detailMember !== this.view.selected) { this.detailMember = this.view.selected; this.detailScroll = 0; }
    this.detailScroll = clamp(this.detailScroll, 0, Math.max(0, this.details(g).length - DETAIL_ROWS));
  }
  details(g: Game): string[] {
    const c = this.view.selected;
    if (!c) return wrap("NOBODY ABOARD BUT YOU. THE LOUNGE AT ANY STATION HAS PEOPLE LOOKING FOR A BERTH.", 72);
    const p = g.world.player, i = p.crew.indexOf(c), shore = p.shoreCrew?.find(s => s.member === c);
    const home = c.home ? findStation(g.world, c.home)?.st.name ?? "UNKNOWN PORT" : "NO HOME PORT";
    const family = c.home && Object.keys(p.flags ?? {}).some(k => k.startsWith(`family:${c.home}:${c.name}:`));
    const wear = Math.round(p.wear ?? 0), mood = wear > 70 ? "ACHING" : p.hull < p.hullMax * 0.5 ? "HOLED" : p.fuel < p.fuelMax * 0.2 ? "HUNGRY" : "FINE";
    const xp = c.xp ?? 0, need = c.skill < 3 ? XP_STEPS[c.skill] : 0;
    const relations = p.crew.filter(o => o !== c && bond(c, o) !== 0).map(o => `${o.name}: ${bondLabel(bond(c, o))}`).join(". ");
    return [
      c.name, `${ROLE_INFO[c.role].label} ${"*".repeat(c.skill)}${firstOfficer(p) === c ? " / NUMBER ONE" : ""}`,
      shore ? `ON LEAVE AT ${findStation(g.world, shore.stationId)?.st.name ?? "UNKNOWN PORT"}. ${shore.docks} DOCKINGS SO FAR.`
        : c.sick ? `LAID UP: ${c.sick.kind}` : p.crew.length >= 2 ? (onWatch(p, i, g.world.time) ? "ON WATCH" : "OFF WATCH") : "ABOARD",
      "", `MORALE ${Math.round(c.morale)} / LOYALTY ${(c.loyalty ?? 0).toFixed(1)} / WAGE ${c.wage}CR`,
      `${c.docks ?? 0} DOCKINGS / HOME ${home}${family ? " (FAMILY MET)" : ""}`,
      need ? `${XP_STEPS_LABEL} ${xp}/${need}` : "AT THEIR BEST",
      c.specialty ? `SPECIALTY: ${SPECIALTIES[c.role].find(x => x.id === c.specialty)?.name ?? c.specialty}`
        : c.skill >= 3 ? "HAS A CHOICE TO MAKE. TALK ABOARD." : "", "",
      c.trait ?? "", relations, c.request ? "HAS AN ASK. TALK ABOARD." : "",
      c.arc?.done ? "STORY TOLD." : arcObjective(g.world, c) ?? "",
      lastLegObjective(g.world, c) ?? "",
      shore ? "BONUSES AND REVIEWS ARE AVAILABLE WHEN THEY RETURN ABOARD." : "",
      p.flags?.shipCrew ? `${shipVoiceName(p)} / THE SHIP / EVERY WATCH / WEAR ${wear}% / ${mood}` : "",
      captainNickname(g.world) ? `THE LANES CALL YOU ${captainNickname(g.world)}` : "",
    ].filter(Boolean).flatMap(line => wrap(line.toUpperCase(), 72));
  }
  update(g: Game, dt: number): void {
    void dt; this.sync(g);
    const p = g.world.player, inp = g.input;
    const click = (x: number, y: number, width: number, height = 15) => inp.mousePressed && inp.mouseX >= x && inp.mouseX < x + width && inp.mouseY >= y && inp.mouseY < y + height;
    if (inp.wasPressed("Escape") || inp.wasPressed("r") || click(416, 3, 64)) {
      const back = g.settingsReturn; g.settingsReturn = "title";
      if (back === "flight") (g.scenes.flight as unknown as { resumeNext: boolean }).resumeNext = true;
      g.setScene(back); return;
    }
    const before = this.view.selected;
    if (inp.wasPressed("ArrowDown")) this.view.move(1);
    if (inp.wasPressed("ArrowUp")) this.view.move(-1);
    if (inp.wasPressed("PageDown") || click(82, 219, 74)) this.view.page(1);
    if (inp.wasPressed("PageUp") || click(8, 219, 70)) this.view.page(-1);
    if (inp.wasPressed("Home")) this.view.select(0);
    if (inp.wasPressed("End")) this.view.select(this.view.keys.length - 1);
    if (inp.wheel && inp.mouseX >= LIST.x && inp.mouseX < LIST.x + LIST.width && inp.mouseY >= LIST.y && inp.mouseY < 212) this.view.move(Math.sign(inp.wheel));
    if (inp.mousePressed) { const row = this.view.hit(inp.mouseX, inp.mouseY, LIST); if (row !== undefined) this.view.select(row); }
    if (before !== this.view.selected) sfx.blip();
    this.refreshDetail(g);
    const detailDelta = (Number(inp.wasPressed("ArrowRight") || click(394, 198, 74)) - Number(inp.wasPressed("ArrowLeft") || click(168, 198, 74))) * (DETAIL_ROWS - 1)
      + (inp.wheel && inp.mouseX >= 168 && inp.mouseX < 472 && inp.mouseY >= 36 && inp.mouseY < 195 ? Math.sign(inp.wheel) * 3 : 0);
    this.detailScroll = clamp(this.detailScroll + detailDelta, 0, Math.max(0, this.details(g).length - DETAIL_ROWS));
    const c = this.view.selected;
    if (!c) return;
    if (inp.wasPressed("n") || click(372, 219, 96)) {
      if (!p.crew.includes(c)) { g.toast("THIS CREW MEMBER IS ON LEAVE."); return; }
      g.toast(plotLastLeg(g.world, c) ? "FINAL JOURNEY COURSE SET. N IN FLIGHT TAKES THE ROUTE."
        : c.lastLeg ? "THE ROUTE IS CLOSED. THE PROMISE CAN WAIT." : "THIS CREW MEMBER HAS NO FINAL JOURNEY PLANNED.");
      g.autosave(); return;
    }
    if ((g.input.wasPressed("s") || click(246, 236, 150)) && p.flags?.shipCrew && p.crew.length) {
      const lines = p.crew.map((c) => { const n = c.name.split(" ")[0].toUpperCase(); const bd = c.trait ?? ""; const line = c.wasCadet && firstOfficer(p) === c ? `${n}: CAME ABOARD FOR A LEFT-HANDED SPANNER AND ENDED UP WITH THE CONN. I WATCHED THE WHOLE THING. I'D WATCH IT AGAIN.` : c.sick ? `${n}: COUGHING IN THE BUNK ROOM. I'VE WARMED THE AIR. I'D LIKE THEM BETTER.` : (c.docks ?? 0) === 0 ? `${n}: NEW. WALKS INTO THE SAME HATCH COAMING EVERY WATCH. I'VE STOPPED MOVING IT.` : c.morale < 40 ? `${n}: QUIET LATELY. SITS AT THE VIEWPORT ON THE OFF-WATCH. I LEAVE THE LIGHTS LOW FOR THEM.` : (c.loyalty ?? 0) >= 2 ? `${n}: WOULD FLY ME INTO A STAR IF YOU ASKED, AND FIX THE PAINT AFTER. I'D LET THEM.` : bd.includes("cooks") ? `${n}: THE GALLEY SMELLS OF SOMETHING WHEN THEY'RE ON. I DON'T EAT. I NOTICE.` : bd.includes("rock") ? `${n}: TALKS TO ME IN BELT WORDS WHEN NOBODY'S LISTENING. I ANSWER IN THE HUM.` : c.role === "engineer" ? `${n}: KNOWS WHERE I ACHE BEFORE I DO. THAT'S EITHER SKILL OR LISTENING. I'LL TAKE EITHER.` : c.role === "pilot" ? `${n}: FLIES ME LIKE I'M BORROWED. I MEAN THAT KINDLY. MOSTLY.` : c.role === "medic" ? `${n}: HAS NEVER ONCE ASKED HOW I AM. I'M NOT HURT BY THAT. I'M A LITTLE HURT BY THAT.` : `${n}: STANDS AT TACTICAL LIKE THE GUNS ARE THEIRS. THEY ARE, I SUPPOSE. I'M THE ONE THAT FLINCHES.`; return line; });
      const enc: Encounter = { id: "shipreviewcrew", where: "space", title: `${shipVoiceName(p)} ON THE CREW`, weight: 0, text: lines.join("\n"), options: [{ label: "THANK YOU", result: (g2) => { flag(g2, "shipreviewcrew"); return "'I HAVE MORE. I'LL SAVE IT FOR THE NEWSLETTER.'"; } }] };
      (g.scenes["encounter"] as EncounterScene).open(g, enc, "roster", true); sfx.select();
      return;
    }
    if (g.input.wasPressed("v") || click(274, 219, 94)) {
      if (!p.crew.includes(c)) { g.toast("THIS CREW MEMBER IS ON LEAVE."); return; }
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
    if (g.input.wasPressed("Enter") || click(168, 219, 102)) {
      if (!p.crew.includes(c)) { g.toast("THIS CREW MEMBER IS ON LEAVE."); return; }
      if (p.credits < 100) { g.toast("NOT ENOUGH CREDITS FOR A BONUS"); return; }
      p.credits -= 100; ledger(p, "crew", -100); c.morale = Math.min(100, c.morale + 15); c.loyalty = (c.loyalty ?? 0) + (c.morale >= 100 ? 0 : 0.5);
      g.toast(`${c.name.toUpperCase()} POCKETS 100CR. MORALE UP.`); sfx.pickup(); g.autosave();
    }
  }
  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    const p = g.world.player, c = this.view.selected, aboard = !!c && p.crew.includes(c);
    ctx.fillStyle = PAL.uiPanel; ctx.fillRect(0, 0, VW, VH);
    drawText(ctx, "THE ROSTER", 12, 8, PAL.white);
    drawText(ctx, "[ ESC BACK ]", 420, 8, PAL.ui);
    drawText(ctx, `${p.crew.length} ABOARD / ${p.shoreCrew?.length ?? 0} ON LEAVE / ${p.credits}CR`, 12, 22, PAL.grey);
    drawText(ctx, "UP/DOWN: CREW   LEFT/RIGHT: DETAILS", 276, 22, PAL.greyDark);
    ctx.strokeStyle = PAL.uiBorder; ctx.strokeRect(7, 35, 150, 178); ctx.strokeRect(163, 35, 309, 160);
    for (let i = this.view.offset; i < this.view.end; i++) {
      const member = this.view.keys[i], y = LIST.y + (i - this.view.offset) * LIST.rowHeight;
      if (member === c) { ctx.fillStyle = "#132b43"; ctx.fillRect(LIST.x, y, LIST.width, LIST.rowHeight); }
      drawText(ctx, short(member.name.toUpperCase(), 34), 12, y + 4, member === c ? PAL.white : PAL.ui);
      drawText(ctx, `${ROLE_INFO[member.role].label} / ${p.crew.includes(member) ? "ABOARD" : "ON LEAVE"}`, 12, y + 13, p.crew.includes(member) ? PAL.grey : PAL.gold);
    }
    const lines = this.details(g), max = Math.max(0, lines.length - DETAIL_ROWS);
    ctx.save(); ctx.beginPath(); ctx.rect(168, 39, 297, 152); ctx.clip();
    lines.slice(this.detailScroll, this.detailScroll + DETAIL_ROWS).forEach((line, i) => drawText(ctx, line, 168, 40 + i * 8, this.detailScroll + i === 0 ? PAL.white : PAL.grey));
    ctx.restore();
    if (max) {
      const thumb = Math.max(8, 152 * DETAIL_ROWS / lines.length);
      ctx.fillStyle = PAL.uiBorder; ctx.fillRect(468, 39, 2, 152);
      ctx.fillStyle = PAL.ui; ctx.fillRect(468, 39 + this.detailScroll / max * (152 - thumb), 2, thumb);
    }
    drawText(ctx, `[ PREV ]`, 168, 203, this.detailScroll > 0 ? PAL.ui : PAL.greyDark);
    drawText(ctx, `${lines.length ? this.detailScroll + 1 : 0}-${Math.min(lines.length, this.detailScroll + DETAIL_ROWS)} OF ${lines.length} LINES`, 258, 203, PAL.greyDark);
    drawText(ctx, `[ NEXT ]`, 422, 203, this.detailScroll < max ? PAL.ui : PAL.greyDark);
    drawText(ctx, "[ PAGE UP ]", 12, 224, this.view.index > 0 ? PAL.ui : PAL.greyDark);
    drawText(ctx, "[ PAGE DOWN ]", 88, 224, this.view.index < this.view.keys.length - 1 ? PAL.ui : PAL.greyDark);
    drawText(ctx, `[ BONUS 100CR ]`, 172, 224, aboard && p.credits >= 100 ? PAL.ui : PAL.greyDark);
    drawText(ctx, `[ V REVIEW ]`, 280, 224, aboard ? PAL.ui : PAL.greyDark);
    drawText(ctx, `[ N COURSE ]`, 380, 224, aboard && c?.lastLeg ? PAL.ui : PAL.greyDark);
    drawText(ctx, `${this.view.keys.length ? this.view.offset + 1 : 0}-${this.view.end} OF ${this.view.keys.length} / HOME: FIRST / END: LAST`, 12, 241, PAL.greyDark);
    if (p.flags?.shipCrew) drawText(ctx, "[ S SHIP'S REPORT ]", 250, 241, PAL.ui);
    drawText(ctx, `ENTER: BONUS / WAGES ${p.crew.reduce((a, member) => a + member.wage, 0)}CR A DOCKING / CAT ${short(p.cat?.name.toUpperCase() ?? "NONE", 24)}`, 12, 258, PAL.greyDark);
  }
}
