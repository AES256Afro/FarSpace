import type { Game, Scene } from "../game";
import { VW, VH } from "../game";
import { clamp } from "../core/mathx";
import { acceptCouncilMandate, castCouncilVote, councilAt, councilBallot, councilIssue, councilObjective, councilRecipient, councilStanding, councilVoteReason, plotCouncilMandate, reportCouncilMandate, takeCouncilSeat, withdrawCouncilMandate } from "../core/council";
import { findStation, weekKey } from "../world";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { wrap } from "./encounter";
import type { EncounterScene } from "./encounter";
import type { World } from "../world";
import type { StationWalkScene } from "./stationwalk";

interface Action { label: string; detail: string; run: () => string }
const LEFT = 230, TOP = 43, ROW = 25;

export class CouncilScene implements Scene {
  touchMode = "menu" as const;
  stationId = "";
  cursor = 0;
  seated = false;
  message = "";
  time = 0;
  resumeNext = false;
  private world?: World;

  enter(g: Game): void {
    const st = councilAt(g.world);
    if (!st || findStation(g.world, st.id)?.sys.id !== g.world.player.systemId) { g.setScene("station"); return; }
    const resume = this.resumeNext && this.world === g.world && this.stationId === st.id;
    this.resumeNext = false; this.world = g.world;
    if (resume) return;
    this.stationId = st.id; this.cursor = 0; this.seated = false; this.time = 0;
    this.message = "THE CLERK IS COUNTING CHAIRS. 'WE ALWAYS HAVE ENOUGH OPINIONS. CHAIRS VARY.'";
  }
  leave(g: Game): void {
    g.setScene("stationwalk");
    const walk = g.scenes.stationwalk as StationWalkScene;
    walk.px = 145; walk.py = 35;
  }
  actions(g: Game, now = Date.now()): Action[] {
    const w = g.world, state = w.player.council, st = councilAt(w, this.stationId)!;
    const issue = councilIssue(w, this.stationId, now), rows: Action[] = [];
    if (!this.seated) rows.push({ label: "TAKE THE CHAIR", detail: councilStanding(w) ? "A SEAT FOR A FREEMAN" : "OBSERVERS MAY LISTEN; THREE STANDING TO SIT", run: () => {
      const line = takeCouncilSeat(w, this.stationId);
      this.seated = councilStanding(w) && w.player.council?.stationId === this.stationId;
      this.cursor = 0; return line;
    } });
    else {
      const reason = councilVoteReason(w, this.stationId, now);
      if (!reason) rows.push({ label: "READ THIS WEEK'S AGENDA", detail: issue.title, run: () => {
        const stationId = this.stationId, week = weekKey(now);
        this.resumeNext = true;
        (g.scenes.encounter as EncounterScene).open(g, { id: "council-agenda", where: "space", weight: 0,
          title: issue.title, text: `${issue.text} Your vote sets the request this rock will send to the inner office. One council vote each week, even if you move your seat.`,
          options: [...issue.choices.map((choice, index) => ({ label: choice.label,
            hint: `Belt ${choice.belt > 0 ? "+" : ""}${choice.belt}, ${st.factionId} standing ${choice.rep > 0 ? "+" : ""}${choice.rep}. YOUR WORD GOES INTO THE REQUEST.`,
            result: (g2: Game) => { const line = castCouncilVote(g2.world, stationId, week, issue.id, index); g2.autosave(); return line; },
          })), { label: "LISTEN A LITTLE LONGER", result: () => "THE CLERK SETS DOWN THE PEN. SOMEONE PUTS THE KETTLE BACK ON." }],
        }, "council", true);
        return "";
      } });
      const ballot = councilBallot(w, now);
      if (!state?.mandate && ballot?.stationId === this.stationId && (!state?.lastMandateWeek || state.lastMandateWeek < ballot.week)) {
        const dest = councilRecipient(w, this.stationId);
        rows.push({ label: "SPEAK FOR THE ROCK", detail: dest ? `TO ${dest.st.name.toUpperCase()} / NO DEADLINE` : "NO REACHABLE INNER OFFICE", run: () => acceptCouncilMandate(w, this.stationId, ballot.week) });
      }
      rows.push({ label: "READ THE LAST MINUTES", detail: state?.lastVoteWeek ? `LAST VOTE ${state.lastVoteWeek} / MONDAY UTC` : "NO VOTE RECORDED", run: () => {
        const last = w.player.council?.ballots.at(-1);
        return last ? `${last.week}: ${last.resolution.toUpperCase()}` : "THE PAGE HAS YOUR NAME AT THE TOP AND NOTHING UNDER IT YET.";
      } });
    }
    if (state?.mandate?.fromStationId === this.stationId) {
      const m = state.mandate;
      if (m.stage === "return") rows.push({ label: "READ BACK THE OFFICE'S REPLY", detail: "300CR EXPENSES / +1 BELT", run: () => reportCouncilMandate(w, m) });
      rows.push({ label: "HAND THE PAPERS BACK UNFINISHED", detail: "NO PAYMENT / NO PENALTY", run: () => withdrawCouncilMandate(w, m) });
    }
    if (state?.mandate) rows.push({ label: "PLOT THE COUNCIL JOURNEY", detail: "N IN FLIGHT FOLLOWS THE COURSE", run: () => plotCouncilMandate(w) ? "COUNCIL COURSE RESTORED. N IN FLIGHT TAKES THE ROUTE." : "THE ROUTE IS CLOSED. THE PAPERS CAN WAIT." });
    rows.push({ label: "BACK TO THE PROMENADE", detail: "THE KETTLE WILL STILL BE HERE", run: () => { this.leave(g); return ""; } });
    return rows;
  }
  update(g: Game, dt: number): void {
    this.time += dt;
    const inp = g.input;
    if (inp.wasPressed("Escape")) { this.leave(g); return; }
    if (inp.wasPressed("F5")) g.save();
    if (inp.wasPressed("F9")) { g.load(); return; }
    if (!councilAt(g.world, this.stationId) || g.world.player.dockedAt !== this.stationId) { g.setScene("station"); return; }
    const rows = this.actions(g);
    this.cursor = clamp(this.cursor, 0, rows.length - 1);
    if (inp.wasPressed("ArrowDown") || inp.wheel > 0) this.cursor = (this.cursor + 1) % rows.length;
    if (inp.wasPressed("ArrowUp") || inp.wheel < 0) this.cursor = (this.cursor + rows.length - 1) % rows.length;
    const row = Math.floor((inp.mouseY - TOP) / ROW);
    const click = inp.mousePressed && inp.mouseX >= LEFT && inp.mouseX < VW - 12 && row >= 0 && row < rows.length;
    const chair = inp.mousePressed && !this.seated && inp.mouseX >= 93 && inp.mouseX < 137 && inp.mouseY >= 137 && inp.mouseY < 172;
    if (click) this.cursor = row;
    if (chair) this.cursor = 0;
    if (click || chair || inp.wasPressed("Enter") || inp.wasPressed(" ")) {
      this.message = rows[this.cursor].run();
      if (g.sceneName === "council") g.autosave();
    }
  }
  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    const w = g.world, st = councilAt(w, this.stationId); if (!st) return;
    const issue = councilIssue(w, this.stationId), state = w.player.council;
    ctx.fillStyle = "#090d18"; ctx.fillRect(0, 0, VW, VH);
    drawText(ctx, "THE ROCK'S COUNCIL", 12, 9, PAL.gold);
    drawText(ctx, `${st.name.toUpperCase()} / WEEK OF ${weekKey()}`, 12, 22, PAL.grey);
    ctx.fillStyle = "#171f2d"; ctx.fillRect(12, 40, 204, 144);
    ctx.strokeStyle = "#465264"; ctx.strokeRect(12, 40, 204, 144);
    ctx.fillStyle = "#050915"; ctx.fillRect(22, 48, 184, 18);
    for (let i = 0; i < 20; i++) { ctx.fillStyle = i % 3 ? PAL.greyDark : PAL.starMid; ctx.fillRect(24 + i * 9, 50 + (i * 7) % 12, 1, 1); }
    ctx.fillStyle = "#57452e"; ctx.fillRect(60, 90, 108, 35);
    ctx.fillStyle = "#8a7450"; ctx.fillRect(61, 90, 106, 2);
    const person = (x: number, y: number, col: string) => {
      ctx.fillStyle = "#e8b48c"; ctx.fillRect(x - 2, y - 8, 5, 5);
      ctx.fillStyle = col; ctx.fillRect(x - 4, y - 3, 9, 8);
      ctx.fillStyle = "#222c40"; ctx.fillRect(x - 3, y + 5, 2, 4); ctx.fillRect(x + 2, y + 5, 2, 4);
    };
    [[76, 80], [114, 80], [153, 80], [43, 109], [187, 109]].forEach(([x, y], i) => person(x, y, ["#c7a54a", "#a53a3a", "#3aa55e", "#7a5aa5", "#5d6680"][i]));
    ctx.fillStyle = "#c8bea5"; ctx.fillRect(79, 100, 15, 10); ctx.fillRect(120, 107, 13, 8);
    ctx.fillStyle = "#596b74"; ctx.fillRect(144, 97, 8, 9); ctx.fillRect(150, 98, 4, 3);
    ctx.fillStyle = PAL.grey; ctx.fillRect(144, 94 - Math.floor(this.time % 2), 1, 2);
    ctx.fillStyle = this.seated ? "#745f30" : "#36445d"; ctx.fillRect(104, 141, 21, 17);
    if (this.seated) person(114, 147, "#c7a54a");
    const chair = this.seated ? "YOUR CHAIR" : "TAKE THE CHAIR";
    drawText(ctx, chair, 114 - textWidth(chair) / 2, 167, this.seated ? PAL.gold : PAL.ui);
    const rows = this.actions(g);
    rows.forEach((row, i) => {
      const y = TOP + i * ROW;
      if (i === this.cursor) { ctx.fillStyle = "#213043"; ctx.fillRect(LEFT, y, VW - LEFT - 12, ROW - 2); }
      drawText(ctx, `${i === this.cursor ? ">" : " "} ${row.label}`.slice(0, 58), LEFT + 4, y + 4, i === this.cursor ? PAL.gold : PAL.white);
      drawText(ctx, row.detail.slice(0, 57), LEFT + 8, y + 14, PAL.greyDark);
    });
    drawText(ctx, `${issue.title} / BELT ${(w.player.beltStanding ?? 0).toFixed(1)} / ${state?.represented ?? 0} REPLIES BROUGHT HOME`, 12, 193, PAL.gold);
    const text = state?.mandate ? councilObjective(w)! : councilBallot(w)
      ? state?.lastMandateWeek === weekKey() ? "THIS SITTING'S REQUEST HAS LEFT YOUR HANDS. THE MINUTES KEEP YOUR WORD. NEXT VOTE MONDAY UTC."
        : "YOUR WORD IS IN THIS WEEK'S MINUTES. NEXT VOTE MONDAY UTC. YOU CAN READ THE RECORD OR CARRY THE REQUEST."
      : issue.text.toUpperCase();
    wrap(text, 112).slice(0, 3).forEach((line, i) => drawText(ctx, line, 12, 205 + i * 8, PAL.grey));
    wrap(this.message, 112).slice(0, 3).forEach((line, i) => drawText(ctx, line, 12, 232 + i * 8, PAL.ui));
    drawText(ctx, "ARROWS / WHEEL MOVE   ENTER / CLICK CHOOSE   ESC DECK   F5 SAVE", 12, 259, PAL.greyDark);
  }
}
