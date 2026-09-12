import type { Game } from "../../game";
import type { FlightScene } from "./index";
import { flightDisplay, FLIGHT_RECORD } from "./display";
import { drawText } from "../../gfx/font";
import { PAL } from "../../gfx/palette";
import { clippedText, mapButton } from "../../core/mapview";
import { wrapText } from "../../core/text";
import { clamp } from "../../core/mathx";
import { recoveryTow } from "../../core/shiprecovery";

export function renderFlightHud(fs: FlightScene, g: Game, ctx: CanvasRenderingContext2D): void {
  const d = flightDisplay(fs, g), p = g.world.player;
  const panel = (y: number, h: number) => { ctx.fillStyle = "rgba(8,12,22,0.93)"; ctx.fillRect(0, y, 480, h); };
  const text = (value: string, x: number, y: number, width: number, color: string = PAL.grey) => drawText(ctx, clippedText(value.toUpperCase(), width), x, y, color);
  panel(0, 28);
  text(d.ship, 6, 4, 145, PAL.ui);
  text(`NOSE ${d.nose}`, 160, 4, 80, PAL.white);
  text(`DRIFT ${d.drift}`, 246, 4, 92, PAL.gold);
  text(`AIM ${d.aim}`, 342, 4, 70, PAL.info);
  text(`${d.speed} M/S`, 420, 4, 56, PAL.white);
  text(d.route, 6, 18, 404, fs.autopilot ? PAL.ui : PAL.grey);
  mapButton(ctx, FLIGHT_RECORD, "L RECORD", false);
  const notices = d.notices.slice(0, 2), activity = d.activity[0];
  let y = 32;
  for (const n of notices) { panel(y - 2, 10); text(`! ${n.text}`, 6, y, 468, n.color); y += 10; }
  if (activity) { panel(y - 2, 10); text(activity.text, 6, y, 468, activity.color); y += 10; }
  const hidden = Math.max(0, d.notices.length - 2) + Math.max(0, d.activity.length - 1);
  if (hidden) { panel(y - 2, 10); text(`${hidden} MORE STATUS ITEMS / L RECORD`, 6, y, 468, PAL.grey); y += 10; }
  if (!d.urgent) {
    const guidance = d.tutorial ?? d.objectives[0];
    if (guidance) {
      const lines = wrapText(guidance.toUpperCase(), 112).slice(0, 2);
      panel(y - 2, lines.length * 9 + 3); lines.forEach((line, i) => text(line, 6, y + i * 9, 468, PAL.gold));
    }
  }
  // The tow line is a world cue. Status text stays inside its assigned region.
  const tow = fs.towing ?? recoveryTow(g.world);
  if (tow) { ctx.strokeStyle = PAL.warn; ctx.globalAlpha = .7; ctx.beginPath(); ctx.moveTo(240, 135); ctx.lineTo(240 + (tow.x - p.x) * fs.zoom, 135 + (tow.y - p.y) * fs.zoom); ctx.stroke(); ctx.globalAlpha = 1; }
  if (d.urgent) {
    panel(203, 10); text(`MESSAGES AND LESSONS HELD / L RECORD (${fs.commsLog.length})`, 6, 205, 468, PAL.grey);
  } else {
    const message = fs.comms.at(-1), value = g.toastTimer > 0 ? g.toastMsg : message ? `${message.from}: ${message.text}` : g.hint;
    if (value) { const lines = wrapText(value.toUpperCase(), 112).slice(0, 2); panel(193, 20); lines.forEach((line, i) => text(line, 6, 195 + i * 9, 468, message?.color ?? PAL.ui)); }
  }
  panel(215, 55);
  const action = wrapText(d.action.toUpperCase(), 112).slice(0, 2);
  action.forEach((line, i) => text(line, 6, 218 + i * 9, 468, PAL.gold));
  ctx.fillStyle = PAL.uiBorder; ctx.fillRect(0, 237, 480, 1);
  const bar = (x: number, label: string, value: number, max: number, color: string) => {
    text(`${label} ${Math.ceil(value)}/${max}`, x, 242, 64, color);
    ctx.fillStyle = PAL.greyDark; ctx.fillRect(x, 253, 60, 4);
    ctx.fillStyle = color; ctx.fillRect(x, 253, Math.round(60 * clamp(value / Math.max(1, max), 0, 1)), 4);
  };
  bar(6, "HULL", p.hull, p.hullMax, p.hull < 30 ? PAL.danger : PAL.good);
  bar(76, "SHLD", p.shield, p.shieldMax, PAL.shield);
  bar(146, "FUEL", p.fuel, p.fuelMax, p.fuel < 15 ? PAL.danger : PAL.thrust);
  bar(216, "O2", p.oxygen, p.oxygenMax, p.oxygen < 40 ? PAL.danger : PAL.info);
  text(`${p.credits}CR / TORP ${p.torpedoes ?? 0}${p.seismic ? ` / CHG ${p.seismic}` : ""}`, 290, 242, 184, PAL.gold);
  text(d.system, 290, 253, 184, PAL.grey);
  text(`${d.security} / ${g.cloudStatus || "ESC MENU / F2 WORKSHOP"}${d.channel ? " / T CHANNEL" : ""}`, 6, 263, 468, PAL.greyDark);
}
