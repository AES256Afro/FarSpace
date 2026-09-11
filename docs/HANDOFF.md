# FarSpace handoff — end of the Sep 10–11 2026 block

Written 04:30 CDT, Sep 11 2026. Everything below was true at that moment.

## State

- **Code:** `main` at v0.232.0 plus one untagged test commit (`334e7bc`, the
  loaded-ship encounter soak). Working tree clean, everything pushed to
  `github.com/AES256Afro/FarSpace`.
- **Milestones:** 1–392 shipped. This block covered M126–M392 (v0.125.0 →
  v0.232.0), all browser-verified against the dev tab, themed on Star Trek,
  The Expanse and The Orville (original names and lines only).
- **Tests:** 153 vitest tests pass (`npx vitest run`). `npx tsc --noEmit` and
  `npx vite build` are clean.
- **Performance:** worst frame ~10.4 ms in flight (20 NPCs, red alert),
  interior, promenade (13 NPCs) and station views.
- **Live site:** farspace.fsociety.work serves 0.232.0 (Cloudflare Pages
  follows `main`).
- **BoxPilot catalog:** merged through **0.221.0**. Tagged but not yet
  catalogued: **0.222.0 – 0.232.0**. Their container images are built
  (`ghcr.io/aes256afro/farspace:<version>`), so only the catalog PRs remain.

## First thing to do next session

Catalogue the eleven pending versions with one sequential chain, from the
session scratchpad copy of `catalog.sh` (or restore it from memory notes):

```bash
for v in 0.222.0 0.223.0 0.224.0 0.225.0 0.226.0 0.227.0 0.228.0 0.229.0 0.230.0 0.231.0 0.232.0; do bash catalog.sh $v "Milestones through $v"; done
```

Run a hang guard beside it: any "Container image" workflow run in progress
for more than nine minutes is hung and should be cancelled (`gh run cancel`);
the chain then reports "image run failed" for that version and moves on. Use
`gh run list --limit 40` in the guard so old tags stay visible. Never run two
catalog PRs at once. Roughly one image build in three hung tonight.

Versions superseded and never catalogued (safe to ignore): 0.119–0.124,
0.125.1–0.127.0, 0.129, 0.130, 0.133, 0.138, 0.139, 0.141, 0.145, 0.153,
0.160, 0.162, 0.165–0.167, 0.175, 0.176, 0.183, 0.188, 0.191, 0.193, 0.198,
0.202.

## Release procedure (unchanged)

1. Edit, then gate: `npx tsc --noEmit && npx vitest run`, commit, push.
2. Bump `package.json` and the README "Milestones 1–N are live (vX)" line.
3. Tag only via `scratchpad/tag.sh <version>`; it refuses unless package.json
   and README carry the version (two tags failed the workflow guard before
   this script existed).
4. `catalog.sh <version> "<summary>"` waits for the image run, opens the
   BoxPilot PR, polls checks (reruns a failing check once), squash-merges.
5. BoxPilot's `validate` check now takes ~5–8 minutes; budget ~10 minutes per
   version.

## Gotchas learned this block (also in memory)

- macOS `grep -qs pattern fileA fileB` returns exit 2 when fileB is missing,
  even on a match. Waiters built on it hung silently. Grep exactly one
  existing file.
- A guard with `--limit 6` never saw a hung run once six newer tags existed.
- Waiter shells carry `catalog.sh X` in their argv; `pgrep -f catalog.sh`
  shows waiters as if chains were running. Check `ps` for the real process.
- Story cards opened on flight entry ("THE SIGNAL - STATIC") block flight
  updates in browser tests; dismiss with Enter first.
- A dynamic `import("/src/core/settings.ts")` in the dev console is a
  different module instance from the app's; test settings through the
  settings scene keys.
- `window.game` becomes the `<canvas id="game">` element when `main.ts` fails
  to load; if `g.setScene` is undefined, reload and read the console.
- Python `sub()` edits assert their anchors; a failed assert leaves earlier
  edits applied. Re-run only the remaining edits.

## Where things live

- `src/world.ts` — pure sim (missions, fares, crew, belt standing, letters,
  chronicle, newsletter, briefing, standing orders' effects).
- `src/scenes/station.ts` — the station enter chain (inspection → inquiry →
  hearing → reception → grievance → spin outage → register → overrun → …),
  mission completion, harbour view, drawLog.
- `src/scenes/flight/index.ts` — alerts, parley, hails, pause menu actions,
  observation/patrol ticks, the long leg, the service cutter, the singers'
  home.
- `src/scenes/interior.ts` — study/briefing/motions, card and talent night,
  the captain's table, the wall of record (plaque, motto, log, newsletter,
  undock word).
- `src/scenes/stationwalk.ts` — promenade crowds (marines, rock kids, the
  cadet's mam), the harbour office (tithe), the band.
- `src/scenes/surface.ts` — landings, who comes down, shore leave.
- `src/scenes/wreck.ts` — boarding party (incl. the cadet), salvage rights,
  the recorder, the place.
- `src/data/encounters.ts` — ~100 cards; a test asserts unique ids and that
  every option returns a line under a fake Game (`g.toast` may be absent:
  guard with `typeof g.toast === "function"`).
- `src/data/{hails,gossip,tannoy,dockhand,chatter,achievements,almanac}.ts`,
  `src/core/shipvoice.ts` — flavour pools keyed on player state.
- `tests/second-sitting.test.ts`, `tests/encounter-soak.test.ts` — the new
  pure-function and loaded-ship tests.
- `docs/ROADMAP.md` — every milestone, plus "Later: Trek / Expanse /
  Orville (the fourth sitting)" as the next backlog. `docs/PLAYING.md` — the
  player-facing guide (new sections are prepended, so it reads
  newest-first). `src/scenes/whatsnew.ts` — in-game notes; the second
  sitting is one long entry headed "0.167 TO 0.232".

## Housekeeping notes

- The dev tab (localhost:5199) had no callsign and no cloud-base override,
  so nothing was posted to prod KV and nothing needs purging. Its settings
  were toggled during tests and restored to defaults.
- Save data: all new fields are optional; `SAVE_VERSION` unchanged; a
  round-trip test covers the new state.
- Memory files: `farspace-state.md` (summary at top, append log below; some
  "CDT" stamps in the log drifted, trust `date`), `trek-expanse-orville.md`
  (the directive and the done list), `release-chain-gotcha.md`.
