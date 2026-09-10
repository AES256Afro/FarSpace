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

See [docs/PLAYING.md](docs/PLAYING.md) for a guide by career,
[docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) for the full design and
[docs/ROADMAP.md](docs/ROADMAP.md) for milestones.

## Controls

| Context | Keys |
|---|---|
| Flight | **W/S** thrust · **A/D** rotate · **mouse** aims the turret (left-click fire, right-click mine) or **Space** fire / **M** mine in keyboard mode · **R** torpedo · **C** seismic charge · **X** brake assist · **J** cruise · **N** autopilot to your course · **V** (hold) deep scan (logs the system) · **E** dock / jump / orbit / board wreck · **T** hail the system channel · **Tab** system map · **G** galaxy map · **I** board ship · **F** fullscreen |
| Ship / station / wreck / outpost | **WASD** walk · **E** interact · **E** (hold) repair, seal, extinguish |
| Orbit | **↑/↓** or click to target a site · **V** (hold) survey scan · **E** land at the site · **L** drop the rover in its region · **Esc** leave orbit |
| Groundside (rover) | **WASD** drive · **E** mine / salvage / enter a site / lift off at the lander · **V** (hold) scan flora · **R** patch the rover at the lander |
| Station menus | **↑/↓ / ←/→** or click · **Enter** select · **B/S** buy/sell · **P** walk the deck · **Esc** undock · SURVEY sells exploration data · ENGINEER (research/refinery) spends materials · RECORD shows achievements and ranks · **N** in SHIPS names your ship |
| Galaxy map | click a system for intel · click again (or **N**) to plot a course · **B** bookmark |
| Global | **F5** save (local + cloud) · **F9** load · **H** music (off by default) · every flight key can be rebound in SETTINGS · touch: left stick + on-screen buttons · gamepad: sticks, A use, X fire, Y mine, RB brake, LB scan, LT map, Start galaxy, Select ship, L3 autopilot, R3 cruise, D-pad torpedo / charge / hail / music |

## What's in the game

**Cloud saves:** on the title screen, CREATE SAVE CODE; the game autosaves on every
dock and jump (F5 any time), locally and to the cloud.
Enter the code on another device (LINK WITH A CODE) and CONTINUE picks the newer
copy. Works from fsociety.work and from self-hosted copies. **Fleet Wire:** choose
a call sign and your arc completions, rescues, surveys and relic hauls appear on
every player's WIRE tab and the title ticker, with leaderboards for discoveries,
arcs, credits and kills.

**The Signal:** a seven-stage campaign that starts once you've logged a few
systems and ends beside a star with a warship that has no faction. Fourteen
encounter cards interrupt flight and rover drives with choices that matter.

**Other pilots:** with a call sign set, everyone in the same star system sees
each other's ships and shares a text channel (T), with /give and /pay to hand
over cargo or credits and wing shares on kills. Squadrons are a shared tag that
ranks members together and pools their standing: the best-standing squadron
becomes a faction's patron and trades at its stations like an ally. A squadron
can pool credits to buy a station as its base, with a shared vault, free
services and a defense grid. Four AI syndicates (always labelled AI) run
bases, convoys and rivalries of their own; every base wants three goods a week
at a premium, and your trade runs draw on the galaxy map. The galaxy map also
shows where pilots are right now. No accounts, switch presence off in Settings. **Groundside:** drop a rover on any region of any
world and drive it: biomes, storms, day and night, outcrops, alien flora,
geysers, wrecks, and the region's outposts, cities and ruins as doors.

**The non-combat game** (the Elite Dangerous side): twelve ship modules
(fuel scoop, docking computer, collector and prospector limpets, refinery,
discovery and surface scanners, racks, tanks, thrusters), fuel scooping off
stars with a heat model, cruise drive with mass lock and an autopilot, core
asteroids cracked with seismic charges, six materials and an engineer bay with
seven three-grade blueprints, exploration data sold at cartographics with
first-discovery tags shared across all players, Explorer/Trader/Miner career
ranks up to ELITE, fourteen rare goods that appreciate with distance, market
memory with best-known-sell and best-run hints, bookmarks, ship naming,
sightseeing charters, a parked fleet of hulls, permit-locked systems, black
markets with customs stings, a weekly galaxy-wide community goal and a daily contract.

Seven hulls, a dynamic economy with shocks and faction wars that can change a
system's flag, reputation with five
factions and a law ladder from routine scans to shoot-on-sight, escort and
passenger and research missions, five faction story arcs, pirate captains and
homing torpedoes, achievements, a hardcore
mode where destruction erases the save, recruitable crew who
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

Milestones 1–16 are live (v0.16). See the [roadmap](docs/ROADMAP.md) for what's next.

```bash
npm test         # vitest: world-gen, routing, economy, law, missions, save migrations
```
