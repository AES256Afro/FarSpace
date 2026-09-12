import type { Game } from "../../game";
import type { FlightScene } from "./index";
import { flightDisplay, FLIGHT_RECORD } from "./display";
import { drawText } from "../../gfx/font";
import { PAL } from "../../gfx/palette";
import { clippedText, mapButton } from "../../core/mapview";
import { wrapText } from "../../core/text";
import { clamp } from "../../core/mathx";
import { recoveryTow } from "../../core/shiprecovery";
import { displaySettings } from "../../core/settings";

type Display = ReturnType<typeof flightDisplay>;

// Edge labels must stay in open space when panels become translucent.
export function flightHudBounds(d: Display, hasToast: boolean) {
  const { hudDensity: density } = displaySettings();
  const guidance = d.focus ?? d.tutorial ?? d.objectives[0];
  let top = 28;
  if (density === "full") {
    const rows = Math.min(2, d.notices.length) + Math.min(1, d.activity.length)
      + (d.notices.length > 2 || d.activity.length > 1 ? 1 : 0);
    top = rows ? 30 + rows * 10 : 28;
    if (!d.urgent && guidance) top = 33 + rows * 10 + Math.min(2, wrapText(guidance.toUpperCase(), 112).length) * 9;
  } else {
    const rows = Math.min(2, [...d.notices, ...d.activity].filter(n => density !== "minimal" || n.priority >= 70).length);
    top = rows ? 30 + rows * 10 : 28;
    if (density === "compact" && !d.urgent && guidance) top = 40 + rows * 10;
  }
  const bottom = density === "full" ? 181 : hasToast && !d.urgent ? 216
    : density === "compact" ? d.contacts.length ? 228 : 238 : 246;
  return { top: top + 4, bottom: bottom - 4 };
}

export function renderFlightHud(fs: FlightScene, g: Game, ctx: CanvasRenderingContext2D, d = flightDisplay(fs, g)): void {
  const p = g.world.player;
  const { hudDensity: density, hudOpacity } = displaySettings();
  const allStatus = [...d.notices, ...d.activity].sort((a, b) => b.priority - a.priority);
  const shownStatus = (density === "minimal" ? allStatus.filter(n => n.priority >= 70) : allStatus).slice(0, 2);
  const hiddenStatus = density === "full" ? 0 : allStatus.length - shownStatus.length;
  const panel = (y: number, h: number) => { ctx.fillStyle = `rgba(8,12,22,${hudOpacity / 100})`; ctx.fillRect(0, y, 480, h); };
  const text = (value: string, x: number, y: number, width: number, color: string = PAL.grey) => drawText(ctx, clippedText(value.toUpperCase(), width), x, y, color);
  // The tow line is a world cue in every HUD mode.
  const tow = fs.towing ?? recoveryTow(g.world);
  if (tow) { ctx.strokeStyle = PAL.warn; ctx.globalAlpha = .7; ctx.beginPath(); ctx.moveTo(240, 135); ctx.lineTo(240 + (tow.x - p.x) * fs.zoom, 135 + (tow.y - p.y) * fs.zoom); ctx.stroke(); ctx.globalAlpha = 1; }
  panel(0, 28);
  text(d.ship, 6, 4, 145, PAL.ui);
  text(`NOSE ${d.nose}`, 160, 4, 80, PAL.white);
  text(`DRIFT ${d.drift}`, 246, 4, 92, PAL.gold);
  text(`AIM ${d.aim}`, 342, 4, 70, PAL.info);
  text(`${d.speed} M/S`, 420, 4, 56, PAL.white);
  text(d.route, 6, 18, hiddenStatus ? 320 : 404, fs.autopilot ? PAL.ui : PAL.grey);
  if (hiddenStatus) text(`+${hiddenStatus} IN RECORD`, 330, 18, 82, PAL.grey);
  mapButton(ctx, FLIGHT_RECORD, "L RECORD", false);
  if (density !== "full") {
    // Reserve two status rows at most. The complete list remains in the record.
    let y = 32;
    for (const n of shownStatus) { panel(y - 2, 10); text(`! ${n.text}`, 6, y, 468, n.color); y += 10; }
    const guidance = d.focus ?? d.tutorial ?? d.objectives[0];
    if (density === "compact" && !d.urgent && guidance) {
      panel(y - 2, 10); text(guidance, 6, y, 468, PAL.gold);
    }
    const contact = d.contacts[0];
    if (density === "compact" && contact) {
      panel(228, 10); text(`${contact.name} / ${Math.round(contact.distance)}M / ${contact.relationship} / ${contact.intent}`, 6, 230, 468, PAL.info);
    }
    // Temporary confirmations stay visible. Background chatter is in L Record.
    if (!d.urgent && g.toastTimer > 0) {
      panel(216, 10); text(g.toastMsg, 6, 218, 468, PAL.ui);
    }
    const minimal = density === "minimal";
    panel(minimal ? 246 : 238, minimal ? 24 : 32);
    text(d.action, 6, minimal ? 248 : 240, 468, PAL.gold);
    const vitals = [
      [6, "HULL", p.hull, p.hullMax, p.hull < 30 ? PAL.danger : PAL.good],
      [76, "SHLD", p.shield, p.shieldMax, PAL.shield],
      [146, "FUEL", p.fuel, p.fuelMax, p.fuel < 15 ? PAL.danger : PAL.thrust],
      [216, "O2", p.oxygen, p.oxygenMax, p.oxygen < 40 ? PAL.danger : PAL.info],
    ] as const;
    for (const [x, label, value, max, color] of vitals) {
      text(`${label} ${Math.ceil(value)}/${max}`, x, minimal ? 260 : 254, 64, color);
      if (!minimal) {
        ctx.fillStyle = PAL.greyDark; ctx.fillRect(x, 264, 60, 3);
        ctx.fillStyle = color; ctx.fillRect(x, 264, Math.round(60 * clamp(value / Math.max(1, max), 0, 1)), 3);
      }
    }
    text(`${p.credits}CR / TORP ${p.torpedoes ?? 0}${p.seismic ? ` / CHG ${p.seismic}` : ""}`, 290, minimal ? 260 : 254, 184, PAL.gold);
    if (!minimal) text(d.system, 290, 264, 184, PAL.grey);
    return;
  }
  const notices = d.notices.slice(0, 2), activity = d.activity[0];
  let y = 32;
  for (const n of notices) { panel(y - 2, 10); text(`! ${n.text}`, 6, y, 468, n.color); y += 10; }
  if (activity) { panel(y - 2, 10); text(activity.text, 6, y, 468, activity.color); y += 10; }
  const hidden = Math.max(0, d.notices.length - 2) + Math.max(0, d.activity.length - 1);
  if (hidden) { panel(y - 2, 10); text(`${hidden} MORE STATUS ITEMS / L RECORD`, 6, y, 468, PAL.grey); y += 10; }
  if (!d.urgent) {
    const guidance = d.focus ?? d.tutorial ?? d.objectives[0];
    if (guidance) {
      const lines = wrapText(guidance.toUpperCase(), 112).slice(0, 2);
      panel(y - 2, lines.length * 9 + 3); lines.forEach((line, i) => text(line, 6, y + i * 9, 468, PAL.gold));
    }
  }
  const contact = d.contacts[0];
  if (contact) { panel(181, 10); text(`${contact.name} / ${Math.round(contact.distance)}M / ${contact.relationship} / ${contact.intent} / L RECORD`, 6, 183, 468, PAL.info); }
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
  text(`${d.security} / ${g.cloudStatus || "F4 VOYAGE / F2 WORKSHOP"}${d.channel ? " / T CHANNEL" : ""}`, 6, 263, 468, PAL.greyDark);
}
