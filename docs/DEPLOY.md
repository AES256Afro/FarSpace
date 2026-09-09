# Deploying FarSpace

Two supported targets. Both serve the same static Vite build.

## A. Cloudflare Workers (current production for fsociety.work)

The Worker serves `dist/` as static assets with custom domains
`fsociety.work` and `www.fsociety.work` (configured in `wrangler.jsonc`).

```bash
npm run deploy   # = build + wrangler deploy
```

Requires a wrangler login on the Cloudflare account that owns the
fsociety.work zone (account c3975c2a296ba301ef3ec984049ceb5b).

## CI

`.github/workflows/ci.yml` runs typecheck, tests, and a build on every push and
pull request. On `main` it also deploys to Cloudflare — but only if the repo
secret `CLOUDFLARE_API_TOKEN` exists (Workers Scripts:Edit + Workers Routes:Edit
on account c3975c2a296ba301ef3ec984049ceb5b). Until that secret is added the
deploy step prints a skip notice and `npm run deploy` from a logged-in machine
remains the release path.

## B. bigbox (Docker + Cloudflare Tunnel), Gridless-style

> Status (Sept 2026): SSH to bigbox as `chris` returns "This account is
> currently not available". The container there is stale. Restore the account
> and re-run the sync below, or treat Cloudflare Workers as the only origin.

Topology once the tunnel is enabled:

```text
fsociety.work -> Cloudflare edge -> Cloudflare Tunnel (outbound from bigbox)
  -> docker service farspace:8080 -> dist/ files
```

The web container binds only to `127.0.0.1:8095` on bigbox — no router
port-forwarding, no public A/AAAA record, read-only container, all caps
dropped, `no-new-privileges`.

### Sync + build + run on bigbox

```bash
rsync -a --delete --exclude node_modules --exclude dist --exclude .git \
  ~/Projects/FarSpace/ bigbox:~/Projects/FarSpace/
ssh bigbox 'cd ~/Projects/FarSpace && docker compose build && docker compose up -d farspace'
ssh bigbox 'curl -s http://127.0.0.1:8095/healthz'   # -> ok
```

### Enable the tunnel (one manual step)

The Cloudflare API token available to automation cannot mint tunnel
tokens, so this needs a human once:

1. Cloudflare dashboard → Zero Trust → Networks → Tunnels → Create tunnel
   (Cloudflared connector).
2. Add a public hostname: `fsociety.work` → `http://farspace:8080`.
3. Copy the tunnel token into `~/Projects/FarSpace/secrets/cloudflare-tunnel-token`
   on bigbox (single line, no newline issues, `chmod 600`).
4. `ssh bigbox 'cd ~/Projects/FarSpace && docker compose --profile tunnel up -d'`
5. Remove the Workers custom domain for fsociety.work (or keep Workers as
   the production origin and skip all of this — either works).

## CI note

`npm run build` runs `tsc --noEmit` first; a type error fails the build.
