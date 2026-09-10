// FarSpace edge worker: serves the static game and a tiny cloud-save API.
//   GET  /api/save/:code   -> { updatedAt, world } | 404
//   PUT  /api/save/:code   <- world JSON; stored with updatedAt
//   GET  /api/health
//   GET  /api/wire            -> last 40 Fleet Wire events (shared by every player)
//   POST /api/wire            <- { callsign, kind, text, system }  (rate limited per IP)
//   GET  /api/board/:name     -> top 20 { callsign, score }
//   POST /api/board/:name     <- { callsign, score }  keeps each call sign's best
//   GET  /api/discover?system= / POST { system, callsign }  first-discovery tags
//   GET  /api/goal?id= / POST { id, callsign, amount }      weekly community goal
//   WS   /api/room/:system    presence + chat, one Durable Object per system
// Codes are the only secret (like a share link). CORS is open so self-hosted
// copies of the game (BoxPilot, etc.) can use the same cloud.

interface KVNamespace {
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}
interface DurableObjectId { toString(): string }
interface DurableObjectStub { fetch(request: Request): Promise<Response> }
interface DurableObjectNamespace { idFromName(name: string): DurableObjectId; get(id: DurableObjectId): DurableObjectStub }
interface DurableObjectState { acceptWebSocket(ws: WebSocket, tags?: string[]): void; getWebSockets(tag?: string): WebSocket[] }
interface RoomSocket extends WebSocket { serializeAttachment(v: unknown): void; deserializeAttachment(): unknown }
declare const WebSocketPair: { new (): { 0: WebSocket; 1: WebSocket } };
interface Env {
  SAVES: KVNamespace;
  ASSETS: { fetch(request: Request): Promise<Response> };
  ROOMS: DurableObjectNamespace;
}

// One room per star system: pilots in the same system see each other's ships
// and share a text channel. Nothing is stored; a room is just the sockets in it.
// Hibernation API keeps idle rooms free.
export class SystemRoom {
  constructor(private state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return json({ error: "websocket only" }, 426);
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1] as RoomSocket;
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ callsign: null, last: 0 });
    // tell the newcomer who's already here
    const here: unknown[] = [];
    for (const o of this.state.getWebSockets()) {
      const a = (o as RoomSocket).deserializeAttachment() as { callsign: string | null; pos?: unknown } | null;
      if (a?.callsign && a.pos) here.push(a.pos);
    }
    try { server.send(JSON.stringify({ t: "roster", pilots: here })); } catch { /* fine */ }
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }

  broadcast(from: WebSocket, msg: string): void {
    for (const o of this.state.getWebSockets()) {
      if (o === from) continue;
      try { o.send(msg); } catch { /* closing */ }
    }
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== "string" || message.length > 700) return;
    let m: Record<string, unknown>;
    try { m = JSON.parse(message) as Record<string, unknown>; } catch { return; }
    const sock = ws as RoomSocket;
    const att = (sock.deserializeAttachment() as { callsign: string | null; last: number; pos?: unknown }) ?? { callsign: null, last: 0 };
    const callsign = clean(m.callsign, 16).toUpperCase();
    if (!CALLSIGN.test(callsign)) return;
    const now = Date.now();
    if (m.t === "pos") {
      if (now - att.last < 120) return; // 8 Hz cap per pilot
      const pos = {
        t: "pos", callsign, x: num(m.x), y: num(m.y), angle: num(m.angle), vx: num(m.vx), vy: num(m.vy),
        hull: clean(m.hull, 16), name: clean(m.name, 18), tag: clean(m.tag, 5).toUpperCase(), at: now,
      };
      sock.serializeAttachment({ callsign, last: now, pos });
      this.broadcast(ws, JSON.stringify(pos));
    } else if (m.t === "xfer" || m.t === "wing") {
      // pilot-to-pilot transfers and wing events: relayed as-is (shape-checked), clients decide what to do
      const out: Record<string, unknown> = { t: m.t, callsign, at: now };
      if (m.t === "xfer") {
        const to = clean(m.to, 16).toUpperCase();
        if (!CALLSIGN.test(to)) return;
        out.to = to; out.kind = clean(m.kind, 8); out.id = clean(m.id, 16); out.qty = Math.max(0, Math.min(999999, Math.floor(num(m.qty))));
      } else {
        out.kind = clean(m.kind, 12); out.x = num(m.x); out.y = num(m.y); out.tag = clean(m.tag, 16);
      }
      sock.serializeAttachment({ ...att, callsign });
      this.broadcast(ws, JSON.stringify(out));
    } else if (m.t === "chat") {
      if (now - att.last < 0) return;
      const text = clean(m.text, 120);
      if (!text) return;
      sock.serializeAttachment({ ...att, callsign });
      const out = JSON.stringify({ t: "chat", callsign, text, at: now });
      this.broadcast(ws, out);
      try { ws.send(out); } catch { /* fine */ }
    }
  }

  webSocketClose(ws: WebSocket): void { this.goodbye(ws); }
  webSocketError(ws: WebSocket): void { this.goodbye(ws); }
  goodbye(ws: WebSocket): void {
    const att = (ws as RoomSocket).deserializeAttachment() as { callsign: string | null } | null;
    if (att?.callsign) this.broadcast(ws, JSON.stringify({ t: "bye", callsign: att.callsign }));
    try { ws.close(); } catch { /* already */ }
  }
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

const CODE = /^[A-Z2-7]{8,12}$/;
const MAX_BYTES = 3 * 1024 * 1024;
const TTL_SECONDS = 60 * 60 * 24 * 365; // a year of inactivity, then it expires

const CALLSIGN = /^[A-Z0-9][A-Z0-9 _-]{1,15}$/;
const WIRE_KINDS = new Set(["arc", "discovery", "rescue", "relics", "war", "bounty", "hull", "achievement", "daily"]);
const BOARDS = new Set(["discoveries", "arcs", "credits", "kills", "explorers", "traders"]);
const WIRE_MAX = 40;

interface WireEvent { t: number; callsign: string; kind: string; text: string; system: string; tag?: string }
interface BoardEntry { callsign: string; score: number; t: number; tag?: string }
const SQUAD = /^[A-Z0-9]{2,5}$/;

function clean(s: unknown, max: number): string {
  return String(s ?? "").replace(/[^\x20-\x7e]/g, "").trim().slice(0, max);
}

// KV's minimum TTL is 60s, so the window is enforced by comparing the stored timestamp.
async function rateLimited(env: Env, request: Request, bucket: string, seconds: number): Promise<boolean> {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const key = `rl:${bucket}:${ip}`;
  const last = Number(await env.SAVES.get(key, "text"));
  if (last && Date.now() - last < seconds * 1000) return true;
  await env.SAVES.put(key, String(Date.now()), { expirationTtl: 60 });
  return false;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...cors } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (url.pathname === "/api/health") return json({ ok: true });

    // Presence rooms: ws(s)://host/api/room/<system name>
    const rm = url.pathname.match(/^\/api\/room\/(.{1,40})$/);
    if (rm) {
      const name = clean(decodeURIComponent(rm[1]), 40).toLowerCase();
      if (!name) return json({ error: "room?" }, 400);
      const id = env.ROOMS.idFromName(name);
      return env.ROOMS.get(id).fetch(request);
    }

    if (url.pathname === "/api/wire") {
      if (request.method === "GET") {
        const raw = await env.SAVES.get("wire", "text");
        return json({ events: raw ? (JSON.parse(raw) as WireEvent[]) : [] });
      }
      if (request.method === "POST") {
        if (await rateLimited(env, request, "wire", 20)) return json({ error: "slow down" }, 429);
        let body: Record<string, unknown>;
        try { body = (await request.json()) as Record<string, unknown>; } catch { return json({ error: "not json" }, 400); }
        const callsign = clean(body.callsign, 16).toUpperCase();
        const kind = clean(body.kind, 16);
        const text = clean(body.text, 140);
        const system = clean(body.system, 32);
        if (!CALLSIGN.test(callsign)) return json({ error: "bad callsign" }, 400);
        if (!WIRE_KINDS.has(kind) || !text) return json({ error: "bad event" }, 400);
        const raw = await env.SAVES.get("wire", "text");
        const events: WireEvent[] = raw ? JSON.parse(raw) : [];
        const tag = clean(body.tag, 5).toUpperCase();
        events.push({ t: Date.now(), callsign, kind, text, system, ...(SQUAD.test(tag) ? { tag } : {}) });
        while (events.length > WIRE_MAX) events.shift();
        await env.SAVES.put("wire", JSON.stringify(events));
        return json({ ok: true, count: events.length });
      }
      return json({ error: "method" }, 405);
    }

    // Community goal: a weekly shared counter with a small contributor board.
    if (url.pathname === "/api/goal") {
      const GOAL = /^cg-\d{4}-\d{2}-\d{2}$/;
      const load = async (id: string): Promise<{ progress: number; contributors: Record<string, number> }> => {
        const raw = await env.SAVES.get(`goal:${id}`, "text");
        return raw ? JSON.parse(raw) : { progress: 0, contributors: {} };
      };
      const view = (id: string, g: { progress: number; contributors: Record<string, number> }) => ({
        id, progress: g.progress,
        top: Object.entries(g.contributors).map(([callsign, amount]) => ({ callsign, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5),
      });
      if (request.method === "GET") {
        const id = clean(url.searchParams.get("id"), 16);
        if (!GOAL.test(id)) return json({ error: "bad goal" }, 400);
        return json(view(id, await load(id)));
      }
      if (request.method === "POST") {
        if (await rateLimited(env, request, "goal", 3)) return json({ error: "slow down" }, 429);
        let body: Record<string, unknown>;
        try { body = (await request.json()) as Record<string, unknown>; } catch { return json({ error: "not json" }, 400); }
        const id = clean(body.id, 16);
        const callsign = clean(body.callsign, 16).toUpperCase() || "ANONYMOUS";
        const amount = Math.floor(Number(body.amount));
        if (!GOAL.test(id)) return json({ error: "bad goal" }, 400);
        if (!Number.isFinite(amount) || amount < 1 || amount > 60) return json({ error: "bad amount" }, 400);
        const g = await load(id);
        g.progress += amount;
        g.contributors[callsign] = (g.contributors[callsign] ?? 0) + amount;
        await env.SAVES.put(`goal:${id}`, JSON.stringify(g), { expirationTtl: 60 * 60 * 24 * 21 });
        return json(view(id, g));
      }
      return json({ error: "method" }, 405);
    }

    // First discovery tags: one call sign per system name, first come first served.
    if (url.pathname === "/api/discover") {
      if (request.method === "GET") {
        const system = clean(url.searchParams.get("system"), 40);
        if (!system) return json({ error: "system?" }, 400);
        const by = await env.SAVES.get(`disc:${system.toLowerCase()}`, "text");
        return json({ system, by });
      }
      if (request.method === "POST") {
        if (await rateLimited(env, request, "discover", 30)) return json({ error: "slow down" }, 429);
        let body: Record<string, unknown>;
        try { body = (await request.json()) as Record<string, unknown>; } catch { return json({ error: "not json" }, 400); }
        const callsign = clean(body.callsign, 16).toUpperCase();
        const system = clean(body.system, 40);
        if (!CALLSIGN.test(callsign)) return json({ error: "bad callsign" }, 400);
        if (!system) return json({ error: "bad system" }, 400);
        const key = `disc:${system.toLowerCase()}`;
        const by = await env.SAVES.get(key, "text");
        if (by) return json({ first: false, by });
        await env.SAVES.put(key, callsign);
        return json({ first: true, by: callsign });
      }
      return json({ error: "method" }, 405);
    }

    // Squadrons: call signs that share a tag, ranked by their members' board scores
    if (url.pathname === "/api/squadrons") {
      const acc = new Map<string, { tag: string; members: Set<string>; credits: number; discoveries: number; kills: number }>();
      for (const name of ["credits", "discoveries", "kills"] as const) {
        const raw = await env.SAVES.get(`board:${name}`, "text");
        const entries: BoardEntry[] = raw ? JSON.parse(raw) : [];
        for (const e of entries) {
          if (!e.tag) continue;
          const sq = acc.get(e.tag) ?? { tag: e.tag, members: new Set<string>(), credits: 0, discoveries: 0, kills: 0 };
          sq.members.add(e.callsign);
          sq[name] += e.score;
          acc.set(e.tag, sq);
        }
      }
      const squadrons = [...acc.values()].map((sq) => ({
        tag: sq.tag, members: sq.members.size, credits: sq.credits, discoveries: sq.discoveries, kills: sq.kills,
        score: Math.round(sq.credits / 100 + sq.discoveries * 10 + sq.kills * 5),
      })).sort((a, b) => b.score - a.score).slice(0, 20);
      return json({ squadrons });
    }

    const bm = url.pathname.match(/^\/api\/board\/([a-z]+)$/);
    if (bm) {
      const name = bm[1];
      if (!BOARDS.has(name)) return json({ error: "no such board" }, 404);
      const key = `board:${name}`;
      if (request.method === "GET") {
        const raw = await env.SAVES.get(key, "text");
        return json({ board: name, entries: raw ? (JSON.parse(raw) as BoardEntry[]) : [] });
      }
      if (request.method === "POST") {
        if (await rateLimited(env, request, `board-${name}`, 10)) return json({ error: "slow down" }, 429);
        let body: Record<string, unknown>;
        try { body = (await request.json()) as Record<string, unknown>; } catch { return json({ error: "not json" }, 400); }
        const callsign = clean(body.callsign, 16).toUpperCase();
        const score = Number(body.score);
        if (!CALLSIGN.test(callsign)) return json({ error: "bad callsign" }, 400);
        if (!Number.isFinite(score) || score < 0 || score > 1e9) return json({ error: "bad score" }, 400);
        const raw = await env.SAVES.get(key, "text");
        let entries: BoardEntry[] = raw ? JSON.parse(raw) : [];
        const tag = clean(body.tag, 5).toUpperCase();
        const mine = entries.find((e) => e.callsign === callsign);
        if (mine) { if (score > mine.score) { mine.score = score; mine.t = Date.now(); } mine.tag = SQUAD.test(tag) ? tag : undefined; }
        else entries.push({ callsign, score, t: Date.now(), ...(SQUAD.test(tag) ? { tag } : {}) });
        entries = entries.sort((a, b) => b.score - a.score || a.t - b.t).slice(0, 20);
        await env.SAVES.put(key, JSON.stringify(entries));
        const rank = entries.findIndex((e) => e.callsign === callsign) + 1;
        return json({ ok: true, rank: rank || null });
      }
      return json({ error: "method" }, 405);
    }

    const m = url.pathname.match(/^\/api\/save\/([A-Za-z0-9]+)$/);
    if (m) {
      const code = m[1].toUpperCase();
      if (!CODE.test(code)) return json({ error: "bad code" }, 400);
      const key = `save:${code}`;
      if (request.method === "GET") {
        const raw = await env.SAVES.get(key, "text");
        if (!raw) return json({ error: "not found" }, 404);
        return new Response(raw, { headers: { "content-type": "application/json", "cache-control": "no-store", ...cors } });
      }
      if (request.method === "PUT") {
        const len = Number(request.headers.get("content-length") ?? 0);
        if (len > MAX_BYTES) return json({ error: "too large" }, 413);
        const text = await request.text();
        if (text.length > MAX_BYTES) return json({ error: "too large" }, 413);
        let world: { player?: unknown; systems?: unknown; version?: unknown };
        try { world = JSON.parse(text); } catch { return json({ error: "not json" }, 400); }
        if (!world || typeof world !== "object" || !world.player || !world.systems) return json({ error: "not a save" }, 400);
        const updatedAt = Date.now();
        await env.SAVES.put(key, JSON.stringify({ updatedAt, world }), { expirationTtl: TTL_SECONDS });
        return json({ ok: true, updatedAt });
      }
      return json({ error: "method" }, 405);
    }
    return json({ error: "not found" }, 404);
  },
};
