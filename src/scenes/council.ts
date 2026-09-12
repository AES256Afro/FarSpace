import type { Game, Scene } from "../game";
import { VW, VH } from "../game";
import { OfficeMenu, type OfficeAction as Action } from "./officemenu";
import { ReaderOverlay } from "./reader";
import { clippedText } from "../core/mapview";
import { acceptCouncilMandate, castCouncilVote, councilAt, councilBallot, councilIssue, councilObjective, councilRecipient, councilStanding, councilVoteReason, plotCouncilMandate, reportCouncilMandate, takeCouncilSeat, withdrawCouncilMandate } from "../core/council";
import { findStation, weekKey } from "../world";
import { drawText, textWidth } from "../gfx/font";
import { PAL } from "../gfx/palette";
import type { EncounterScene } from "./encounter";
import type { World } from "../world";
import type { StationWalkScene } from "./stationwalk";

export class CouncilScene implements Scene {
  touchMode = "menu" as const;
  stationId = "";
  menu = new OfficeMenu();
  get cursor(): number { return this.menu.view.index; }
  set cursor(index: number) { this.menu.view.select(index); }
  info?: ReaderOverlay;
  get pausesVoyage(): boolean { return !!this.info; }
  lastReply = "";
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
    if (resume) { this.menu.view.sync(this.actions(g).map(row => row.id)); return; }
    this.onSceneLeave(); this.menu = new OfficeMenu(); this.stationId = st.id; this.seated = false; this.time = 0;
    this.message = "THE CLERK IS COUNTING CHAIRS. 'WE ALWAYS HAVE ENOUGH OPINIONS. CHAIRS VARY.'";
    this.lastReply = this.message; this.menu.view.sync(this.actions(g).map(row => row.id));
  }
  leave(g: Game): void {
    this.resumeNext = false;
    g.setScene("stationwalk");
    const walk = g.scenes.stationwalk as StationWalkScene;
    walk.px = 145; walk.py = 35;
  }
  actions(g: Game, now = Date.now()): Action[] {
    const w = g.world, state = w.player.council, st = councilAt(w, this.stationId)!;
    const issue = councilIssue(w, this.stationId, now), rows: Action[] = [];
    if (!this.seated) rows.push({ id: "chair", label: "TAKE THE CHAIR", detail: councilStanding(w) ? "A SEAT FOR A FREEMAN" : "OBSERVERS MAY LISTEN; THREE STANDING TO SIT", run: () => {
      const line = takeCouncilSeat(w, this.stationId);
      this.seated = councilStanding(w) && w.player.council?.stationId === this.stationId;
      this.cursor = 0; return line;
    } });
    else {
      const reason = councilVoteReason(w, this.stationId, now);
      if (!reason) rows.push({ id: `agenda:${weekKey(now)}:${issue.id}`, label: "READ THIS WEEK'S AGENDA", detail: `${issue.title}. ${issue.text}`, run: () => {
        const stationId = this.stationId, week = weekKey(now);
        this.resumeNext = true;
        (g.scenes.encounter as EncounterScene).open(g, { id: "council-agenda", where: "space", weight: 0,
          title: issue.title, text: `${issue.text} Your vote sets the request this rock will send to the inner office. One council vote each week, even if you move your seat.`,
          options: [...issue.choices.map((choice, index) => ({ label: choice.label,
            hint: `Belt ${choice.belt > 0 ? "+" : ""}${choice.belt}, ${st.factionId} standing ${choice.rep > 0 ? "+" : ""}${choice.rep}. YOUR WORD GOES INTO THE REQUEST.`,
            result: (g2: Game) => { const line = castCouncilVote(g2.world, stationId, week, issue.id, index); g2.autosave(); this.lastReply = this.message = line; return line; },
          })), { label: "LISTEN A LITTLE LONGER", result: () => this.lastReply = this.message = "THE CLERK SETS DOWN THE PEN. SOMEONE PUTS THE KETTLE BACK ON." }],
        }, "council", true);
        return "";
      } });
      const ballot = councilBallot(w, now);
      if (!state?.mandate && ballot?.stationId === this.stationId && (!state?.lastMandateWeek || state.lastMandateWeek < ballot.week)) {
        const dest = councilRecipient(w, this.stationId);
        rows.push({ id: `accept:${ballot.week}:${ballot.issueId}`, label: "SPEAK FOR THE ROCK", detail: dest ? `TO ${dest.st.name.toUpperCase()} / NO DEADLINE` : "NO REACHABLE INNER OFFICE", run: () => acceptCouncilMandate(w, this.stationId, ballot.week) });
      }
      rows.push({ id: `minutes:${state?.lastVoteWeek ?? "none"}`, label: "READ THE LAST MINUTES", detail: state?.lastVoteWeek ? `LAST VOTE ${state.lastVoteWeek} / MONDAY UTC` : "NO VOTE RECORDED", run: () => {
        const last = w.player.council?.ballots.at(-1);
        return last ? `${last.week}: ${last.resolution.toUpperCase()}` : "THE PAGE HAS YOUR NAME AT THE TOP AND NOTHING UNDER IT YET.";
      } });
    }
    if (state?.mandate?.fromStationId === this.stationId) {
      const m = state.mandate;
      if (m.stage === "return") rows.push({ id: `report:${m.week}:${m.fromStationId}`, label: "READ BACK THE OFFICE'S REPLY", detail: `300CR EXPENSES / +1 BELT. ${m.reply ?? ""}`, run: () => reportCouncilMandate(w, m) });
      rows.push({ id: `withdraw:${m.week}:${m.fromStationId}`, label: "HAND THE PAPERS BACK UNFINISHED", detail: "NO PAYMENT / NO PENALTY", run: () => withdrawCouncilMandate(w, m) });
    }
    if (state?.mandate) rows.push({ id: `plot:${state.mandate.week}:${state.mandate.fromStationId}`, label: "PLOT THE COUNCIL JOURNEY", detail: `${councilObjective(w)}. N IN FLIGHT FOLLOWS THE COURSE.`, run: () => plotCouncilMandate(w) ? "COUNCIL COURSE RESTORED. N IN FLIGHT TAKES THE ROUTE." : "THE ROUTE IS CLOSED. THE PAPERS CAN WAIT." });
    rows.push({ id: "leave", label: "BACK TO THE PROMENADE", detail: "THE KETTLE WILL STILL BE HERE", run: () => { this.leave(g); return ""; } });
    return rows;
  }
  onSceneLeave(): void { this.info?.onSceneLeave(); this.info = undefined; }

  openInfo(g: Game, record = false): void {
    const w = g.world, state = w.player.council, issue = councilIssue(w, this.stationId);
    const row = this.actions(g).find(row => row.id === this.menu.view.selected);
    const sections: [string, string[]][] = record ? [
      ["THIS SITTING", [findStation(w, this.stationId)?.st.name ?? this.stationId, `WEEK OF ${weekKey()}. BELT STANDING: ${(w.player.beltStanding ?? 0).toFixed(1)}.`, issue.title, issue.text, councilVoteReason(w, this.stationId) ?? "THE AGENDA IS OPEN FOR YOUR VOTE."]],
      ["CURRENT JOURNEY", [councilObjective(w) ?? "NO REQUEST IN YOUR CUSTODY.", ...(state?.mandate ? [state.mandate.resolution, state.mandate.reply ?? "THE INNER OFFICE HAS NOT REPLIED."] : [])]],
      ...[...(state?.ballots ?? [])].reverse().map(ballot => [`MINUTES: ${ballot.week}`, [findStation(w, ballot.stationId)?.st.name ?? ballot.stationId, ballot.resolution]] as [string, string[]]),
      ["LAST REPLY", [this.lastReply]],
    ] : row ? [[row.label, [row.detail, "ESC RETURNS TO THE DESK. ENTER AT THE DESK PERFORMS THIS ACTION."]]] : [];
    this.info = new ReaderOverlay(record ? "COUNCIL RECORD" : "ACTION DETAILS", sections, () => { this.info = undefined; });
  }

  update(g: Game, dt: number): void {
    if (this.info) { this.info.update(g); return; }
    this.time += dt; const inp = g.input;
    if (inp.wasPressed("Escape")) { this.leave(g); return; }
    if (inp.wasPressed("F5")) g.save();
    if (inp.wasPressed("F9")) { g.load(); return; }
    if (!councilAt(g.world, this.stationId) || g.world.player.dockedAt !== this.stationId || findStation(g.world, this.stationId)?.sys.id !== g.world.player.systemId) { g.setScene("station"); return; }
    const rows = this.actions(g), previous = this.menu.view.selected, command = this.menu.update(rows, inp);
    if (previous !== this.menu.view.selected) this.message = "";
    if (command === "details" || command === "record") { this.openInfo(g, command === "record"); return; }
    const chair = inp.mousePressed && !this.seated && inp.mouseX >= 93 && inp.mouseX < 137 && inp.mouseY >= 137 && inp.mouseY < 172;
    const row = rows.find(row => row.id === (chair ? "chair" : this.menu.view.selected));
    if ((command === "run" || chair) && row) {
      const message = row.run();
      if (message) { this.message = message; this.lastReply = message; }
      if (g.sceneName === "council") { this.menu.view.sync(this.actions(g).map(row => row.id)); g.autosave(); }
    }
  }
  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    if (this.info) { this.info.draw(g, ctx); return; }
    const w = g.world, st = councilAt(w, this.stationId); if (!st) return;
    const issue = councilIssue(w, this.stationId), state = w.player.council;
    ctx.fillStyle = "#090d18"; ctx.fillRect(0, 0, VW, VH);
    drawText(ctx, "THE ROCK'S COUNCIL", 12, 9, PAL.gold);
    drawText(ctx, clippedText(`${st.name.toUpperCase()} / WEEK OF ${weekKey()}`, 456), 12, 22, PAL.grey);
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
    drawText(ctx, clippedText(`BELT ${(w.player.beltStanding ?? 0).toFixed(1)} / ${state?.represented ?? 0} REPLIES BROUGHT HOME`, 204), 12, 196, PAL.gold);
    this.menu.draw(ctx, this.actions(g), this.message);
  }
}
