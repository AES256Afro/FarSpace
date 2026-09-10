// Fleet presence: a WebSocket room per star system. Pilots with a call sign
// see each other's ships (ghosts) and share a text channel. Best-effort:
// silence for a few seconds and a ghost fades; the socket reconnects on its own.

import { cloudBase } from "./cloud";
import { getCallsign, getSquadron } from "./wire";
import { settings } from "./settings";
import type { PlayerState } from "../world";

export interface Ghost { callsign: string; x: number; y: number; angle: number; vx: number; vy: number; hull: string; name: string; tag: string; t: number }
export interface ChatLine { from: string; text: string; t: number }
export interface RoomEvent { t: "xfer" | "wing"; from: string; to?: string; kind: string; id?: string; qty?: number; x?: number; y?: number; tag?: string; at: number }

class Presence {
  ws: WebSocket | null = null;
  system: string | null = null;
  ghosts = new Map<string, Ghost>();
  chat: ChatLine[] = [];      // drained by the flight scene
  events: RoomEvent[] = [];   // transfers and wing events, drained by the flight scene
  lastSend = 0;
  retryAt = 0;
  status: "off" | "connecting" | "on" | "error" = "off";

  enabled(): boolean {
    return settings().presence && !!getCallsign() && typeof WebSocket !== "undefined";
  }

  join(system: string): void {
    if (!this.enabled()) { this.leave(); return; }
    if (this.system === system && this.ws && this.ws.readyState <= 1) return;
    this.leave();
    this.system = system;
    const base = cloudBase() || location.origin;
    const url = `${base.replace(/^http/, "ws")}/api/room/${encodeURIComponent(system)}`;
    try {
      this.status = "connecting";
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => { if (this.ws === ws) this.status = "on"; };
      ws.onmessage = (ev) => this.onMessage(String(ev.data));
      ws.onerror = () => { if (this.ws === ws) this.status = "error"; };
      ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.status = this.status === "error" ? "error" : "off"; this.retryAt = Date.now() + 5000; } };
    } catch { this.ws = null; this.status = "error"; this.retryAt = Date.now() + 10000; }
  }

  leave(): void {
    if (this.ws) { try { this.ws.close(); } catch { /* fine */ } }
    this.ws = null;
    this.system = null;
    this.ghosts.clear();
    this.status = "off";
  }

  onMessage(raw: string): void {
    let m: Record<string, unknown>;
    try { m = JSON.parse(raw) as Record<string, unknown>; } catch { return; }
    const me = getCallsign();
    if (m.t === "pos" || m.t === "roster") {
      const list = m.t === "roster" ? (m.pilots as Record<string, unknown>[]) : [m];
      for (const p of list) {
        const cs = String(p.callsign ?? "");
        if (!cs || cs === me) continue;
        this.ghosts.set(cs, {
          callsign: cs, x: Number(p.x) || 0, y: Number(p.y) || 0, angle: Number(p.angle) || 0,
          vx: Number(p.vx) || 0, vy: Number(p.vy) || 0, hull: String(p.hull ?? "scout"), name: String(p.name ?? ""), tag: String(p.tag ?? ""), t: Date.now(),
        });
      }
    } else if (m.t === "bye") {
      this.ghosts.delete(String(m.callsign));
    } else if (m.t === "xfer" || m.t === "wing") {
      this.events.push({
        t: m.t, from: String(m.callsign), to: m.to ? String(m.to) : undefined, kind: String(m.kind ?? ""), id: m.id ? String(m.id) : undefined,
        qty: Number(m.qty) || 0, x: Number(m.x) || 0, y: Number(m.y) || 0, tag: m.tag ? String(m.tag) : undefined, at: Date.now(),
      });
      if (this.events.length > 30) this.events.shift();
    } else if (m.t === "chat") {
      this.chat.push({ from: String(m.callsign), text: String(m.text), t: Date.now() });
      if (this.chat.length > 20) this.chat.shift();
    }
  }

  // Called every flight frame: keeps the socket alive, sends position at 4 Hz,
  // ages ghosts out.
  tick(p: PlayerState, systemName: string): void {
    const now = Date.now();
    if (!this.enabled()) { if (this.ws) this.leave(); return; }
    if (!this.ws && this.system === systemName && now > this.retryAt) { this.system = null; this.join(systemName); }
    if (this.system !== systemName) this.join(systemName);
    if (this.ws && this.ws.readyState === 1 && now - this.lastSend > 250) {
      this.lastSend = now;
      try {
        this.ws.send(JSON.stringify({ t: "pos", callsign: getCallsign(), x: p.x, y: p.y, angle: p.angle, vx: p.vx, vy: p.vy, hull: p.hullId, name: p.shipName ?? "", tag: getSquadron() ?? "" }));
      } catch { /* fine */ }
    }
    for (const [k, g] of this.ghosts) if (now - g.t > 6000) this.ghosts.delete(k);
  }

  say(text: string): boolean {
    if (!this.ws || this.ws.readyState !== 1) return false;
    const t = text.trim().slice(0, 120);
    if (!t) return false;
    try { this.ws.send(JSON.stringify({ t: "chat", callsign: getCallsign(), text: t })); return true; } catch { return false; }
  }

  send(obj: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== 1) return false;
    try { this.ws.send(JSON.stringify({ ...obj, callsign: getCallsign() })); return true; } catch { return false; }
  }

  // Ghost position now, extrapolated from its last report
  at(g: Ghost): { x: number; y: number } {
    const dt = Math.min(1.5, (Date.now() - g.t) / 1000);
    return { x: g.x + g.vx * dt, y: g.y + g.vy * dt };
  }
}

export const presence = new Presence();
