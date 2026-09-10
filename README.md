# FarSpace

A pixel space sim. Fly, trade, mine, fight, and walk the corridors
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
| Flight | **W/S** thrust · **A/D** rotate · **mouse** aims the turret (left-click fire, right-click mine) or **Space** fire / **M** mine in keyboard mode · **R** torpedo · **C** seismic charge · **X** brake assist · **J** cruise · **N** autopilot to your course · **V** (hold) deep scan (logs the system) · **E** dock / jump / orbit / board wreck · **T** hail · **L** comms log the system channel · **Tab** system map · **G** galaxy map · **I** board ship · **F** fullscreen |
| Ship / station / wreck / outpost | **WASD** walk · **E** interact · **E** (hold) repair, seal, extinguish |
| Orbit | **↑/↓** or click to target a site · **V** (hold) survey scan · **E** land at the site · **L** drop the rover in its region · **Esc** leave orbit |
| Groundside (rover) | **WASD** drive · **E** mine / salvage / enter a site / lift off at the lander · **V** (hold) scan flora · **R** patch the rover at the lander |
| Station menus | **↑/↓ / ←/→** or click · **Enter** select (at the MARKET it sells what you hold, else buys) · **B/S** buy/sell explicitly · **Shift** for bulk · **P** walk the deck · **F7** postcard · **Esc** undock · SURVEY sells exploration data · ENGINEER (research/refinery) spends materials · RECORD shows achievements and ranks · **N** in SHIPS names your ship |
| Galaxy map | click a system for intel · click again (or **N**) to plot a course · **B** bookmark |
| Global | **F5** save (local + cloud) · **F9** load · **H** music (off by default) · every flight key can be rebound in SETTINGS · touch: left stick + on-screen buttons · gamepad: sticks, A use, X fire, Y mine, RB brake, LB scan, LT map, Start galaxy, Select ship, L3 autopilot, R3 cruise, D-pad torpedo / charge / hail / music |

## What's in the game

FarSpace is a pixel-art space sim where ships are places, the galaxy keeps
going while you sleep, and almost nothing has to be a fight. The short version,
grouped; the long version is the [player's guide](docs/PLAYING.md) and the
[roadmap](docs/ROADMAP.md).

**Flying and docking.** Seven hulls, a cruise drive with mass lock, fuel-range
course plotting and an autopilot, fuel scooping with a heat model, docking as a
glide into a cleared bay with control on the band, a launch on the way out, a
pause menu, a comms log, gamepad and touch, and a real "Sol Neighbourhood"
galaxy of nearby stars (20 or 50 light-years) or a procedural one.

**Trade and industry.** A dynamic economy with shocks, strikes, crises and
faction wars; market memory with best-known-sell and best-run hints; fourteen
rare goods; black markets and customs stings; bulk trading; twelve ship
modules; core asteroids, seismic charges, materials and an engineer bay;
charter haulers that run your best routes while you fly; a ledger of where the
money came from and went; beacons, fuel depots and waystations of your own in
dead systems, with tolls, a bar, a bunk and the regulars dropping in.

**People.** Crew with homes, traits, skills that grow from work, illnesses,
shore leave, lists, letters, friendships and feuds, personal three-beat
stories, and retirement after a full tour. Passengers with moods and demands,
notables whose journeys matter, a ship's cat, a dozen regular captains who
remember being helped and become friends (or one who took against you), and a
crew who walk the deck, eat, sleep, argue and sing.

**Places.** Walkable ship interiors with a wall of record, furnishings,
crates in the hold and luggage by the seat; station promenades dressed for
their trade with a lounge, a clinic, a harbourmaster and crowds that match the
day; outposts that grow into towns and cities on your trade, with projects you
fund; worlds to orbit and drive, wonders to find by rumour and see with your
own eyes, and the Ark to board.

**Stories.** Three campaigns (The Signal, The Missing Convoy, The Keeper),
thirty-nine encounter cards, ten GalNet serials that develop over dockings and
end in something you can act on, faction envoys, four AI syndicates with
convoys, feuds and wars, a weekly calendar of occasions shared by everyone,
and a line of history for every system and world.

**Keeping.** Postcards on F7, a chronicle you can read in-game or export,
achievements and four career ladders to ELITE, a home port, museums that take
your relics with your name, and a line of captains: retire at the wall of
record and the galaxy carries on under whoever takes the chair.

**Sharing.** Cloud saves by code, the Fleet Wire with leaderboards, presence
and a text channel with pilots in the same system, squadrons with bases,
pacts and rivalries, first-discovery tags and first wonder sightings shared
across all players, and lights other pilots have planted showing on your chart.
Multiplayer proper is shelved; everything above is built so it can plug in.

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

Milestones 1–70 are live (v0.70.0). See the [roadmap](docs/ROADMAP.md) for what's next.

```bash
npm test         # vitest: world-gen, routing, economy, law, missions, save migrations
```
