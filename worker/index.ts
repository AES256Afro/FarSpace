// FarSpace edge worker: serves the static game and a tiny cloud-save API.
//   GET  /api/save/:code   -> { updatedAt, world } | 404
//   PUT  /api/save/:code   <- world JSON; stored with updatedAt
//   GET  /api/health
//   GET  /api/wire            -> last 40 Fleet Wire events (shared by every player)
//   POST /api/wire            <- { callsign, kind, text, system }  (rate limited per IP)
//   GET  /api/board/:name     -> top 20 { callsign, score }
//   POST /api/board/:name     <- { callsign, score }  keeps each call sign's best
// Codes are the only secret (like a share link). CORS is open so self-hosted
// copies of the game (BoxPilot, etc.) can use the same cloud.

interface KVNamespace {
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}
interface Env {
  SAVES: KVNamespace;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const CODE = /^[A-Z2-7]{8,12}$/;
const MAX_BYTES = 3 * 1024 * 1024;
const TTL_SECONDS = 60 * 60 * 24 * 365; // a year of inactivity, then it expires

const CALLSIGN = /^[A-Z0-9][A-Z0-9 _-]{1,15}$/;
const WIRE_KINDS = new Set(["arc", "discovery", "rescue", "relics", "war", "bounty", "hull", "achievement", "daily"]);
const BOARDS = new Set(["discoveries", "arcs", "credits", "kills"]);
const WIRE_MAX = 40;

interface WireEvent { t: number; callsign: string; kind: string; text: string; system: string }
interface BoardEntry { callsign: string; score: number; t: number }

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
        events.push({ t: Date.now(), callsign, kind, text, system });
        while (events.length > WIRE_MAX) events.shift();
        await env.SAVES.put("wire", JSON.stringify(events));
        return json({ ok: true, count: events.length });
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
        const mine = entries.find((e) => e.callsign === callsign);
        if (mine) { if (score > mine.score) { mine.score = score; mine.t = Date.now(); } }
        else entries.push({ callsign, score, t: Date.now() });
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
