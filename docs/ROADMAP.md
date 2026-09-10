# FarSpace Roadmap

Ordering principle: make the existing loop worth returning to before adding
new layers. Each milestone has a goal (what a player can do or feel that they
couldn't before) and a definition of done.

## Milestone 0 — Foundation ✅ (Aug 2026)
- [x] Repo, Vite + TypeScript, zero-dependency runtime
- [x] Pixel renderer: 480×270 internal, crisp integer upscale
- [x] Seeded RNG, bitmap pixel font, procedural sprite generation
- [x] Scene manager (galaxy / system-flight / station / ship interior)

## Milestone 1 — Vertical Slice ✅ (Aug 2026)
- [x] Procedural galaxy: named systems, factions, jump-point graph
- [x] System view: sun, orbiting planets, asteroid belts, stations, jump points
- [x] WSAD Newtonian flight with momentum, flip-and-burn assist
- [x] Combat: projectile weapons, pirate AI with aim leading, hull/shield/system damage
- [x] Mining: asteroid ore → cargo hold
- [x] Docking + station services: trade, refuel, repair, missions, bar, news net
- [x] Jump gates with faction contraband scans
- [x] Walkable ship interior: system panels, physical repairs consume spare parts
- [x] Walkable station promenades: kiosks, wandering NPCs, airlock
- [x] Missions: delivery, bounty, mining contracts; distress-call rescues
- [x] Nav path system: plot a course on the galaxy map, radar guides gate to gate
- [x] Defense platforms + station fighter wings; protected-space safe zones
- [x] Save/load (localStorage), procedural SFX, radar, mouse menus, nebulae
- [x] Deployed to https://farspace.fsociety.work

## Milestone 2 — Worth a Second Session ✅ (Sep 2026)
**Goal:** a new player finds the core loop in 5 minutes, has a reason to come
back tomorrow, and can play on a phone.

- [x] Four hulls with real trade-offs (Wren Scout, Magpie Prospector, Bastion
      Freighter, Kestrel Interceptor); buy/sell with trade-in at any shipyard;
      hull picks the interior deck and crew berths
- [x] Dynamic prices: stock drifts toward each station's baseline every cycle,
      your trades move the local price, market shocks spike it, wars starve it
- [x] Traders carry real cargo drawn from their origin station's exports and
      restock the station they arrive at; destroying one drops the hold
- [x] Save schema `version` + migrations (v0 Milestone-1 saves still load)
- [x] First-run hints: contextual one-time guidance for flight, docking, first
      jump, trading, repair, orbit, scanning, crew
- [x] Flight School: a six-step objective card for new pilots (thrust/brake →
      dock → buy → accept a mission → jump → board your ship) that completes
      off real game state, pays 700 credits in total, and is skippable with T;
      existing saves start with it off (save v5)
- [x] Touch controls: virtual stick + fire/mine/brake/use/map buttons, tap menus;
      fractional canvas scaling so phones fill the width
- [x] Balance: 600 starting credits, starter food/parts; first hull reachable in
      a session of bounties and trade runs

## Milestone 3 — Living Economy & Law ✅ (Sep 2026)
**Goal:** the galaxy visibly reacts to what the player does.

- [x] Per-faction reputation (−100..100, ALLIED → OUTLAW) from missions, kills,
      crimes; gates prices, docking rights (star bases lock at SUSPECT), mission
      tiers (CIVILIAN / TRUSTED / MILITARY); bribes and clean-record fees
- [x] Gate security ladder: routine scan → warrant flagged + pursuit → shoot on
      sight (platforms and fighters engage) after prolonged pursuit or OUTLAW rep;
      good standing means lazier contraband scans
- [x] Supply lanes: traders run station-to-station with cargo; escort missions
      protect a freighter that pirates actively hunt; corsairs prey on traffic
- [x] Salvage: derelicts in every system with walkable interiors, spreading
      fires, breached compartments draining suit O2, crates of parts/data/bio
- [x] Star bases: docking denied below neutral standing; military bounty tier
- [x] News net generated from real sim events (shortages, wars, ceasefires,
      seizures, rescues, murders, discoveries, arc progress)
- [x] Station warehouses: store and reload goods per station
- [x] Faction wars: raids flare between factions, pirate pressure and prices
      shift in the contested system, ceasefires end them

## Milestone 4 — Crew & Interiors II ✅ (Sep 2026)
**Goal:** the ship interior is a place people spend time in, not a repair menu.

- [x] Recruitable crew at bars: engineer (repair speed, mid-flight patching),
      gunner (auto-turret, +damage), pilot (+thrust/turn), medic (hull triage).
      Signing bonus + wages every docking
- [x] Crew morale: fed at each docking from your provisions, meals in the
      galley, conversations; unpaid or unfed crew lose morale, quit at 5, and
      may not make it to the pod when the ship is destroyed
- [x] Crew conversations by role and mood at their deck stations
- [x] Passengers: VIP, refugee, and fugitive transport; they sit in the bunk
      room and talk; fugitives count as contraband at gate scans
- [x] Multi-room decks per hull; fires that spread and damage systems,
      hull breaches that vent a compartment's O2; hold E to extinguish or seal
- [x] Study terminal (piloting / engineering skills), sleep (60s time skip,
      economy ticks), eat (hull + crew morale)

## Milestone 5 — Planets ✅ (Sep 2026)
**Goal:** fill the zoom continuum's missing layer.

- [x] Enter orbit from flight (E near a planet): rendered spinning globe with
      lit terminator, territories tinted by controlling faction, orbital shell
      of satellites
- [x] Territories with resources; POIs (cities, mines, research posts,
      batteries, ruins, outposts) pinned on the globe and in a target list
- [x] Survey scan from orbit (hold V) pays per site; landing denied in regions
      hostile to you or at military batteries
- [x] Surface outposts: walkable landing site with trade desk (region resource
      cheap, supplies dear), survey office, bunkhouse, locals to talk to

## Milestone 6 — The Real Galaxy ✅ (Sep 2026)
**Goal:** the map is the actual neighbourhood of the Sun.

- [x] "Sol Neighbourhood" new game: 50 real stars within 20 ly (Alpha Centauri,
      Barnard's, Sirius, Tau Ceti, Epsilon Eridani…) from catalog RA/Dec/distance,
      spectral-class sun colours, real light-year link distances
- [x] Fuel-range navigation: jump cost scales with light-years; Dijkstra course
      plotting minimises fuel; galaxy map shows fuel per leg, route total vs
      aboard, and marks refuel stations along the route
- [x] Deep scanning (hold V in flight) reveals anomalies: data caches, derelict
      salvage, survey bounties; research missions send you to find them
- [x] Faction narrative arcs: The Quiet Gate (Compact), Belt Fever (Guild), The
      Veil Accord (Corsairs) — three-stage chains gated by reputation, reported
      on the news net, big reputation payoff on completion

## Engineering track ✅
- [x] `flight.ts` split into `scenes/flight/{index,ai,render,types}.ts`;
      shared walking code in `scenes/walkbase.ts`
- [x] Tests (vitest): world-gen determinism, connectivity, real-galaxy layout,
      routing, fuel costs, economy, cargo, hull swap, law, missions, save migrations
- [x] GitHub Actions: typecheck + test + build on push/PR; auto-deploys to
      fsociety.work on every green push to main
- [x] Save schema versioning with migrations
- [x] Bitmap font M/W glyphs redrawn

## Milestone 7 — Feel & Persistence ✅ (Sep 2026)
**Goal:** the game feels finished in the hands, and your progress follows you
between devices.

- [x] Cloud saves: a Cloudflare Worker + KV behind fsociety.work keyed by a
      10-character share code (no accounts). F5 saves locally and to the cloud;
      CONTINUE takes whichever copy is newer; LINK DEVICE enters a code. CORS is
      open so the self-hosted BoxPilot copy shares the same cloud.
- [x] Save file export/import (JSON download / file picker) for offline moves
- [x] Gamepad: sticks and D-pad drive the same key layer as touch; A/B/X/Y,
      bumpers, triggers, Start/Select mapped for flight, walking, and menus
- [x] Ambient soundtrack: procedural WebAudio pads keyed to the faction whose
      space you're in, a low pulse that rises with nearby hostiles, silence in
      the void; H toggles, preference remembered
- [x] Spatial hash for bullet/NPC collisions so escort fights and war zones
      hold frame rate on phones

**Done when:** you can start on the phone, continue on the desktop, play a
bounty with a controller and music on, and the frame rate holds in a war zone.

## Milestone 8 — Boots on the Ground ✅ (Sep 2026)
**Goal:** planets are places, not menus.

- [x] City interiors: land at a city POI for a larger walkable district with a
      market, a bar that hires crew, a mission board with planet-side contracts,
      residents to talk to; landing routes by POI kind (city / ruins / outpost)
- [x] Ruins as dungeons: procedurally generated rooms and corridors, dormant
      sentries that wake on line of sight (hold E beside one to disarm), gas
      pockets that eat suit O2, fog of war, relic caches (a new commodity that
      research posts and trade hubs buy at a premium), one way out
- [x] Aegis Carrier hull: hangar that launches two escort drones which fight
      pirates and re-arm at dock; a multi-deck interior; five crew berths

## Milestone 9 — Shared Universe ✅ (Sep 2026)
**Goal:** other pilots exist.

- [x] Fleet Wire: a global event feed (arc completions, discoveries, rescues,
      wars) every player sees on the news net and the title screen, posted
      under a chosen call sign; per-IP rate limits, no accounts; station WIRE tab
- [x] Leaderboards: discoveries, arcs, credits, kills — top 20 per board, each
      call sign's best kept; scores post on every save
- [x] Bigger neighbourhood: catalog extended to ~50 ly (76 systems) as a third
      new-game option; 20 ly stays the default

## Milestone 10 — Depth ✅ (Sep 2026)
**Goal:** reasons to come back, and a fight worth having.

- [x] Better combat: pirate variants (cutters, raiders, named captains with
      twin guns and a 400 CR bounty), homing torpedoes (R; restock at
      shipyards), damage numbers and shield-hit floaters, hit flash, hull smoke,
      pirates that break off and run at 30% hull, taunts and patrol hails on
      GalNet, docking clearance hails
- [x] Desktop-first controls: mouse turret aim with a reticle (left-click fire,
      right-click mine; keyboard aim stays an option), F fullscreen, engine
      rumble, a Settings screen with key rebinding
- [x] The hum: brown-noise starship ambience with sub tones and a breathing
      filter instead of the old sine pad; combat throb; per-faction moods
- [x] Achievements: 18 deeds tracked in a station RECORD tab; unlocks are
      announced on the Fleet Wire
- [x] Daily contract: one date-seeded delivery every pilot sees on every board,
      turned in at any station; completions hit the wire
- [x] Hardcore mode ("Cold Void"): chosen in Settings for new games; enemies hit
      1.5x and destruction erases the save, locally and in the cloud
- [x] Two more faction arcs: Hexagon Combine "Ledger of Glass" and Outer Ring
      Autonomy "Free Drift" (five arcs, fifteen stages)

## Milestone 11 — The Quiet Professions ✅ (Sep 2026)
**Goal:** a full non-combat game in the Elite Dangerous mould.

- [x] Outfitting: twelve modules at every shipyard (fuel scoop, radiators,
      tank, rack, docking computer, collector + prospector limpets, refinery,
      discovery + surface scanners, tuned thrusters, shield capacitor); fittings
      carry across hull changes
- [x] Fuel scooping and heat: stars cook the hull, a scoop turns the corona into
      fuel; overheating hurts
- [x] Cruise drive (J) with mass lock, and an autopilot (N) that flies your
      plotted course gate to gate and brakes at the end
- [x] Exploration: nav logs on arrival, detailed scans, orbital surveys and
      first discoveries earn data sold at the SURVEY tab; research posts pay
      more; first-discovery tags are shared galaxy-wide through the wire
- [x] Careers: Explorer, Trader and Miner ranks, nine grades to ELITE
- [x] Mining: core asteroids (seismic charges, C), prospector readouts, refinery
      yields, materials from every rock
- [x] Engineering: six materials, seven blueprints with three grades each at
      research and refinery stations (jump range, drives, scoop, mining, cargo,
      shields, heat vents)
- [x] Trade: fourteen rare goods with distance pricing, market memory with
      best-known-sell and best-run hints, bookmarks, ship naming
- [x] Passengers: sightseeing charters that require an orbit before drop-off
- [x] Fleet: park hulls at stations (K in SHIPS) and swap back later
- [x] Permit space: one closed system per faction, ALLIED standing to enter
- [x] Black markets in Veil and pirate-heavy hubs fence illegal goods at +30%;
      customs may seize illegal sales elsewhere
- [x] Community goal: one shared weekly target for the whole galaxy with a
      contributor board and a sales premium; daily contract; achievements for
      all of it

## Milestone 12 — Groundside ✅ (Sep 2026)
**Goal:** worlds you can drive across.

- [x] Region-scale ground maps (96x72 tiles) generated per region from the
      planet's biome: seas, sand, plains, hills, mountains, biome hazards
- [x] Rover with power (recharge at the lander) and integrity (patch with parts)
- [x] Sites: outcrops (materials), alien flora (scan for exploration data),
      geysers, crashed probes, rover wrecks, resource caches; the region's
      outposts, cities and ruins are entrances that return you to the ground
- [x] Fog of war, minimap, day/night with headlights, storms per biome
- [x] Charting and fully working a region pays exploration data; ground state
      is saved
- [x] Ground contracts on mission boards: field surveys (scan flora),
      recoveries (crashed probes) and prospecting (outcrops) on a named world
- [x] Wind and storm ambience, rover drivetrain loop; codex of species and
      biomes with first-find bonuses

## Milestone 13 — Other Pilots ✅ (Sep 2026)
**Goal:** the shared universe becomes visible.

- [x] Presence rooms: a Durable Object per star system relays positions over
      WebSockets; pilots in the same system see each other's ships with call
      sign and ship name, and edge markers when off-screen
- [x] System channel: T hails everyone in the system; lines appear on GalNet
- [x] Opt-out in Settings; nothing is stored server-side
- [x] Trading between pilots: /give and /pay on the system channel (within 300m)
- [x] Wing shares: a pirate kill near another pilot pays them a share and
      credits their bounty contracts

- [x] Squadrons: a shared 2-5 letter tag on the title screen; shown on ghosts,
      wire posts and boards; squadrons rank together (credits, discoveries,
      kills of their members) on the WIRE tab

## Later
- [ ] Squadron standing with NPC factions and squadron-owned stations
