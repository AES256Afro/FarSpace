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
glide into a cleared bay with control on the band (and a hold short of the bay
behind traffic), a launch on the way out, a pause menu, a comms log, gamepad and
touch, and a real "Sol Neighbourhood" galaxy of nearby stars (20 or 50
light-years) or a procedural one. The ring race: six rings round any civil
station against the clock, course records local and on the wire, and a
three-course regatta with a title at the end. Convoys of slow haulers that form
on your stern and pay at the gate.

**Trade and industry.** A dynamic economy with shocks, strikes, crises and
faction wars; market memory with best-known-sell and best-run hints; fourteen
rare goods; black markets and customs stings; bulk trading; twelve ship
modules; core asteroids, seismic charges, materials and an engineer bay;
charter haulers that run your best routes while you fly, or your own parked
hulls put to work; a liner to wherever your other ship is; stakes in stations
that pay a dividend every docking; a ledger of where the money came from and
went; beacons, fuel depots and waystations of your own in dead systems, with
tolls, a bar, a bunk and the regulars dropping in; the post, and picture jobs
done with a postcard in the right place.

**People.** Crew with homes, traits, skills that grow from work, a specialty at
the top of their trade, illnesses, shore leave, lists, letters, friendships and
feuds, two personal stories per role, and retirement after a full tour. A
roster, watches, corridor talk, mess call, cards after watch, and the band on
the comms array. Passengers with moods and demands who walk the deck and
question the crew, a guestbook they sign on the way out and come back through,
notables whose journeys matter, a ship's cat who sometimes slips out on the
promenade, a dozen regular captains who remember being helped and become
friends (with favours to carry) or one who took against you, and a name the
lanes give you for what you do most.

**Places.** Walkable ship interiors with a wall of record, a viewport to look
out of, furnishings, crates in the hold and luggage by the seat; station
promenades with their own clock and night shift, a tannoy, a lounge, a clinic,
a harbourmaster, gossiping crowds that match the day, and your ship in the bay;
outposts that grow into towns and cities on your trade, with projects you fund;
worlds to orbit and drive, twelve kinds of wonder to find by rumour and see with
your own eyes, and the Ark to board.

**Stories.** Three campaigns (The Signal, The Missing Convoy, The Keeper),
forty-four encounter cards including weddings, a birth and a passing aboard,
ten GalNet serials that develop over dockings and end in something you can act
on, faction envoys, four AI syndicates with convoys, feuds and wars, a weekly
calendar of occasions shared by everyone, and a line of history for every
system and world.

**Politics.** A weekly question from every faction, decided by standing-
weighted votes and felt on the lanes until Monday; one contested seam system a
week where deliveries, votes, stakes and rally runs push, and Monday can flip
the system, stations and all; and a page on the record that shows the week.

**On the bridge.** A captain's log with a stardate and a supplemental entry
at every clamp, a Number One, a command rank from deeds and a registry that
control reads out, alert status on Y with a klaxon and the crew calling
stations, parley with corsairs before anyone fires, senior staff briefings
that set a focus for the leg, reviews in the study, a counsellor, a ship that
signs its lines with the name it asked for. Envoys with treaties on a
deadline, patients for the clinic over the next gate, patrol orders for a
ranked captain, the belt's water and filter runs, a hard burn on the juice.
Away teams, a quiet world, a village where the survey said geology, a hull
that sings in no known tongue, a visitor on the bridge, a loop, a sim rig
stuck on a western, talent night, the lounge at war. The unnamed traffic hails
as it passes and everybody has a word about the cat.

**The second sitting.** The belt has freemen, droughts, a council with minutes and a long ship taking donations; the service has boards of inquiry, prisoner transfers, emergencies, fleet reviews and transfer requests; the office of anomalous incidents and the survey's board of ethics write letters; and aboard there are card and talent nights, wakes, birthdays, the captain's table, a plaque with a motto, a newsletter on the galley door, an undock word the helm answers, the engineer's names for the systems, a counsellor who knocks, a cadet who vents the wrong tank, and a Number One who objects once, for the log, and takes the ship for a leg when asked.

**Keeping.** Postcards on F7, a chronicle you can read in-game or export,
achievements and four career ladders to ELITE, a home port, museums that take
your relics with your name, wrecks that stay where your ships fell, and a line
of captains: retire at the wall of record and the galaxy carries on under
whoever takes the chair.

**Sharing.** Cloud saves by code, the Fleet Wire with leaderboards, presence
and a text channel with pilots in the same system, squadrons with bases,
pacts and rivalries, first-discovery tags and first wonder sightings shared
across all players, lights other pilots have planted on your chart, their
ships passing through where they posted, their wrecks to salvage, their
maydays to answer with fuel, and notes tied to the wonders for whoever comes
next. Multiplayer proper is shelved; everything above is built so it can plug
in.

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

Milestones 1–350 are live (v0.217.0). See the [roadmap](docs/ROADMAP.md) for what's next.

```bash
npm test         # vitest: world-gen, routing, economy, law, missions, save migrations
```
