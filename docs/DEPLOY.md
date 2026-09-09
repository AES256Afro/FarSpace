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

## CI / auto-deploy

`.github/workflows/ci.yml` runs typecheck, tests, and a build on every push and
pull request. On a push to `main` it also deploys to Cloudflare, but only when
the repository secret `CLOUDFLARE_API_TOKEN` exists. One-time setup:

1. **Create the token** (Cloudflare dashboard → profile icon, top right →
   *My Profile* → *API Tokens* → *Create Token* → use the **"Edit Cloudflare
   Workers"** template). Scope it to account `Chris@chriscourtney.guru's Account`
   (c3975c2a296ba301ef3ec984049ceb5b) and zone `fsociety.work`. That template
   grants Workers Scripts:Edit, Workers Routes:Edit, and the account/zone reads
   wrangler needs for custom domains. Copy the token — it is shown once.
2. **Add it as a GitHub Actions secret**, either in the browser
   (repo → *Settings* → *Secrets and variables* → *Actions* → *New repository
   secret*, name `CLOUDFLARE_API_TOKEN`) or from a terminal where `gh` is
   logged in as AES256Afro:

   ```bash
   gh secret set CLOUDFLARE_API_TOKEN --repo AES256Afro/FarSpace
   ```

   (it prompts for the value; nothing lands in shell history).
3. Push to `main`, or re-run the latest workflow. The `deploy` job's log should
   end with `Deployed farspace triggers` and the custom domains.

The account ID is already in the workflow; no other secrets are needed.
**Status: configured (2026-09-09).** Every push to `main` that passes tests
deploys to fsociety.work automatically. `npm run deploy` still works from a
machine with `wrangler login` as a manual fallback.

## B. BoxPilot App Catalog (bigbox)

FarSpace ships as a container image, `ghcr.io/aes256afro/farspace:<version>`,
built by `.github/workflows/image.yml` whenever a `v<version>` tag matching
`package.json` is pushed (multi-arch, amd64 + arm64). The BoxPilot manifest is
[deploy/boxpilot/farspace.yaml](../deploy/boxpilot/farspace.yaml); the same file
is submitted to the BoxPilot catalog so it appears under **Games** in the App
Catalog on any BoxPilot release that includes it.

To add it to a BoxPilot box before that release ships (the catalog directory is
re-read within seconds; no restart):

```bash
sudo curl -fsSL https://raw.githubusercontent.com/AES256Afro/FarSpace/main/deploy/boxpilot/farspace.yaml \
  -o /opt/boxpilot/catalog/farspace.yaml
```

Then open BoxPilot → App Catalog → Games → FarSpace → Install. It binds the game
on LAN port 8139 (changeable at install), runs as the unprivileged nginx user,
and stores nothing on the host.

Releasing a new version: bump `package.json` version, bump the two version
fields in the manifest, commit, then `git tag v<version> && git push --tags`.

## C. bigbox as a Cloudflare Tunnel origin (legacy, Gridless-style)

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
