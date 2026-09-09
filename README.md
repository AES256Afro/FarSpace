# FarSpace

A pixel-art space sim about scale — fly, trade, mine, fight, and walk the corridors
of your own ship across a living galaxy.

**Play it:** https://farspace.fsociety.work

![FarSpace](docs/screenshot.png)

## The idea

One continuous universe you can zoom through: galaxy map → star system → dogfight →
dock at a station → walk your own ship's deck and repair the systems that got shot up.
Flight is top-down WSAD with real momentum — Battlestar Galactica meets The Expanse.
Ships are more than health bars: they're places.

See [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) for the full design and
[docs/ROADMAP.md](docs/ROADMAP.md) for milestones.

## Controls

| Context | Keys |
|---|---|
| Flight | **W/S** thrust · **A/D** rotate · **Space** fire · **M** mining laser · **X** brake assist · **V** (hold) deep scan · **E** dock / jump / orbit / board wreck · **Tab** system map · **G** galaxy map · **I** board ship |
| Ship / station / wreck / outpost | **WASD** walk · **E** interact · **E** (hold) repair, seal, extinguish |
| Orbit | **↑/↓** or click to target a site · **V** (hold) survey scan · **E** land · **Esc** leave orbit |
| Station menus | **↑/↓ / ←/→** or click · **Enter** select · **B/S** buy/sell · **P** walk the deck · **Esc** undock |
| Galaxy map | click a system for intel · click again (or **N**) to plot a course |
| Global | **F5** save (local + cloud) · **F9** load · **H** music · touch: left stick + on-screen buttons · gamepad: sticks/D-pad, A use, X fire, Y mine, RB brake, LB scan, LT map, Start galaxy, Select ship |

## What's in the game

**Cloud saves:** on the title screen, CREATE SAVE CODE; the game autosaves on every
dock and jump (F5 any time), locally and to the cloud.
Enter the code on another device (LINK WITH A CODE) and CONTINUE picks the newer
copy. Works from fsociety.work and from self-hosted copies. **Fleet Wire:** choose
a call sign and your arc completions, rescues, surveys and relic hauls appear on
every player's WIRE tab and the title ticker, with leaderboards for discoveries,
arcs, credits and kills.

Four hulls, a dynamic economy with shocks and faction wars, reputation with five
factions and a law ladder from routine scans to shoot-on-sight, escort and
passenger and research missions, three faction story arcs, recruitable crew who
talk and quit, ship interiors with fires and breaches, derelicts to board,
planets to orbit and survey with landable outposts, and a "Sol Neighbourhood"
galaxy of real nearby stars (20 or 50 light-years) with fuel-range course
plotting, city districts, ruin dungeons, a carrier with escort drones, cloud
saves, gamepad and touch, and a shared Fleet Wire. Full list in
the [roadmap](docs/ROADMAP.md).

## Development

```bash
npm install
npm run dev      # local dev server
npm run build    # typecheck + production build to dist/
npm run deploy   # build + deploy to Cloudflare (fsociety.work) — CI does this on push to main
```

Self-host it: `ghcr.io/aes256afro/farspace` (nginx, port 8080) or the BoxPilot
App Catalog manifest in `deploy/boxpilot/`. See [docs/DEPLOY.md](docs/DEPLOY.md).

Zero runtime dependencies. TypeScript + Canvas 2D, 480×270 internal resolution
integer-upscaled for crisp pixels. Every sprite — ships, planets, stations,
portraits — is procedurally generated from the world seed.

## Status

Milestones 1–9 are live (v0.9). See the [roadmap](docs/ROADMAP.md) for what's next.

```bash
npm test         # vitest: world-gen, routing, economy, law, missions, save migrations
```
