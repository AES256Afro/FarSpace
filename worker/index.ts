// FarSpace edge worker: serves the static game and a tiny cloud-save API.
//   GET  /api/save/:code   -> { updatedAt, world } | 404
//   PUT  /api/save/:code   <- world JSON; stored with updatedAt
//   GET  /api/health
// Codes are the only secret (like a share link). CORS is open so self-hosted
// copies of the game (BoxPilot, etc.) can use the same cloud.

interface KVNamespace {
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}
interface Env {
  SAVES: KVNamespace;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const CODE = /^[A-Z2-7]{8,12}$/;
const MAX_BYTES = 3 * 1024 * 1024;
const TTL_SECONDS = 60 * 60 * 24 * 365; // a year of inactivity, then it expires

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
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
