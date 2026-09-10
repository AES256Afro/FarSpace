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

- [x] Where everyone is: rooms publish head counts, the galaxy map marks
      systems with pilots in them and the title shows how many are flying;
      docked pilots stay visible and the WIRE tab lists who's in the system
- [x] Squadrons: a shared 2-5 letter tag on the title screen; shown on ghosts,
      wire posts and boards; squadrons rank together (credits, discoveries,
      kills of their members) on the WIRE tab

- [x] Squadron standing: members' faction reputation is pooled; the
      best-standing squadron becomes a faction's patron, named on its stations
      and the galaxy map, and its members trade there like allies and get
      half-price fuel and repairs at its yards

## Milestone 14 — Squadron Bases ✅ (Sep 2026)
**Goal:** a place that belongs to your squadron.

- [x] Treasury: members fund it from anywhere; one civilian station per
      squadron can be bought (price by station type); ownership is global
- [x] Base perks: half-price services for members, a shared vault (deposit and
      withdraw cargo), a base log, the tag on the galaxy map and station header
- [x] Upgrades from the treasury: Defense Grid (extra platforms for everyone),
      Fuel Depot (free services), Market Stake (+8% sales), Deep Vault (600)

- [x] Two more hulls: Albatross Explorer (260 fuel, sips it, built-in
      discovery scanner) and Ox Mining Barge (four mining heads, 160 cargo)
- [x] Living galaxy: a lost war can hand a system to the raiders; stations and
      regions change flags and the news says so

- [x] Base raids: without a defense grid, corsairs probe a base whenever piracy
      is up; clearing them posts to the wire and earns DEFENDER

- [x] Weekly base contract: the base needs a commodity; members filling the
      vault to the target pay the treasury once a week

- [x] Weekly squadron bounty: six corsair captains by any member pay the
      treasury

- [x] Squadron channel (/s) across the galaxy; squadron board shows base and
      treasury

- [x] Three save slots with their own cloud codes (title screen)
- [x] Rover engineering: suspension and battery blueprints; base milestones
      post to the Fleet Wire
- [x] Mayday: a pilot under 25% hull automatically hails the system; others get
      a comms line and a blinking marker for 30 s
- [x] Paint jobs (O in SHIPS); prompts never throw in sandboxed embeds

## Milestone 15 — Syndicates and Trade Routes ✅ (Sep 2026)
**Goal:** the galaxy has its own squadrons, and bases trade with each other.

- [x] Four AI syndicates per galaxy (always labelled AI, never on the pilot
      boards): a home base with extra platforms, convoys around it, raiders in
      rival space, treasuries, partners and rivals; rivalry events in the news
- [x] Syndicate contracts at their bases (convoy runs, rival bounties) build
      standing: affiliates buy like allies, partners get +10% on wanted goods
- [x] Base-to-base trade routes: every base (AI or squadron) wants three goods
      a week at +30%; sales feed the base treasury; your runs draw on the
      galaxy map, syndicate partner lanes too
- [x] Save v9 adds syndicates to existing galaxies

- [x] Syndicate diplomacy: relations drift, raids sour them, your contracts
      move them; alliances share convoy lanes and perks (a partner of an ally
      counts as an affiliate), feuds spawn raiders; marked pilots get hunted

- [x] Syndicate wars: a deep feud starts a war in the defender's system with
      raiders and convoys; kills and supply runs move the front; the winner
      takes a partner lane and a fifth of the treasury; veterans of the
      winning side are paid and remembered

- [x] Territory: a rout takes the loser's base as a holding; the loser falls
      back to a partner station; holdings trade like a home base

- [x] Squadrons at war: a squadron with a base declares for a side (front
      +10, members' work counts 1.5x); winning pays the treasury, losing gets
      the squadron marked; base raids are led by the pirate syndicate that
      likes you least, and repelling them costs their standing

## Milestone 16 — The Signal ✅ (Sep 2026)
**Goal:** a reason to cross the galaxy that isn't a price table.

- [x] Encounters: fourteen choice cards in flight and on the ground with real
      consequences (crew, cargo, standing, materials, damage, IOUs paid later)
- [x] The Signal: a seven-stage campaign told in cards and advanced by play
      (log systems, claim an anomaly, clear a ruin, a research post, the Veil,
      the beacon, the Herald) with a fight or a parley finale; objective on the
      HUD, the MISSIONS tab and the galaxy map

- [x] Crew with lives: requests on docking (a bonus, a visit home, a course,
      family trouble) as cards; loyalty that survives a bad week; skills that
      grow when you look after people
- [x] Homesteads: stake up to three claims on charted regions; they work the
      region's resource while you're away, recharge and repair the rover fast

- [x] Helping ships: disabled freighters call for help; board them and bring
      three dead systems back on a suit clock, or send your engineer across
      and hold off the corsairs while they work; pass damaged ships a spare
      part; rewards, standing, sometimes a new crew member

- [x] More ways to help: tow a disabled ship into dock, take survivors aboard,
      engineering tenders at stations (walk the plant and fix three systems),
      and station crises (outbreak, famine, blackout) that pay 2.5x for the
      goods they need before the clock runs out

- [x] Medics matter: freighters call in casualties; send your medic across,
      pass med supplies, or take the wounded aboard; lives saved are counted
- [x] Standing orders: multi-shipment supply contracts with climbing pay

## Milestone 17 — A Living Galaxy ✅ (Sep 2026)
**Goal:** the world keeps happening whether you're there or not.

- [x] Rescuer career: a fourth ladder built from lives saved, repairs, tows,
      crises broken and distress calls answered
- [x] Galaxy events: comets seed rich belts, solar flares cook hulls and
      shorten scans, festival weeks pay tourists double and drain luxuries,
      dock strikes double yard prices; marked on the galaxy map
- [x] Bar rumours point at real things: the crisis, the comet, the war
- [x] Captain's log: encounters, rescues and campaign beats remembered

- [x] Faction politics: envoys sell amnesties, grant charters at 75 standing
      (+15% contract pay, yards at cost) and enforce embargoes between -40 and
      -60 (fuel and repairs only)
- [x] Sound pass: station PA chimes, gate arrival cracks, drifter song

- [x] The Missing Convoy: a second campaign thread for pilots a syndicate
      trusts: find the wreck on the lane, read the black box, and decide what
      the truth is worth to the syndicate, the traitor, or their rivals

- [x] Settlements with lives: weekly needs at the outpost trade desk (+40%),
      a foreman at the survey office with sample runs, outcrop runs and a
      plant to fix, paid on your return

## Milestone 18 — A Life Aboard ✅ (Sep 2026)
Time passes for the people on the ship, and for the ship.

- [x] Crew count their dockings, have a home port and a trait, and ask for
      shore leave (they keep their berth and wait for you), goods for the
      galley or an anniversary, and letters carried home
- [x] Illness: dock fever, gate sickness, the grey flu. No bonus while laid up;
      med supplies cure it at the next dock, a medic halves it
- [x] Retirement after thirty dockings: how you part matters to the rest of the
      crew; alumni wave from the lounge and earn a plaque on the wall of record
- [x] Wear: hours under way and every jump wear the ship. Past 50 the thrusters
      lose their edge, past 70 systems fault. Yard service at any shipyard,
      signed into a berth log; an engineer slows the wear

## Milestone 19 — Passengers and the Liner Trade ✅ (Sep 2026)
- [x] Fares in every station lounge: VIPs, tourists, refugees, couriers,
      fugitives; two to four hops; a Passenger Cabins module for three at once
- [x] Moods: demands met from the hold, patience, hull state; pay 60–120% by
      mood, tips and standing for the happiest, complaints for the worst
- [x] Sights: booked sights (planet, drifters, comet, festival) complete the
      fare; every extra sight on the way pays 15% more
- [x] Passengers live in the bunk room with their own lines by mood

## Milestone 20 — The Lighthouse ✅ (Sep 2026)
- [x] Beacon and fuel depot kits from any shipyard, planted in dead systems
- [x] Beacons: through-traffic, tolls in a till, cheaper jumps for everyone;
      depots: stock fuel cells, sell to traffic, draw for yourself
- [x] Raids in pirate space wear structures down; dark below 30% until you
      bring spare parts; galaxy map and HUD show lit, dark and a full till
- [x] Owned by call sign, so a shared galaxy can carry them later

## Increments after Milestone 20
- [x] Cross-squadron pacts and rivalries from the BASE tab: a pact signed by
      both sides sells at +5% at each other's base, a rivalry charges the
      other squadron's members more; every wire hears the declaration
- [x] Six more encounter cards: a stowaway, an old shipmate, a light in the
      dark, pilgrims, a claim jumper, the wall of dust
- [x] The title screen tells the story so far above CONTINUE
- [x] The SHIPS tab previews your hull with its paint

## Milestone 21 — Legacy ✅ (Sep 2026)
- [x] Retire the captain from the wall of record: a crew member takes the
      chair (their skill becomes yours) or the yard finds a new name
- [x] Pension, handed-back contracts, halved standings; the ship, structures,
      alumni and the galaxy's memory carry on; the line of captains on the wall
- [x] Retired captains walk the promenade where they stepped down

## Milestone 22 — Life on the Deck ✅ (Sep 2026)
- [x] Crew skills grow from the work they do
- [x] Rest at a dock: ten minutes of ship time in a moment
- [x] A ship's cat: found in the hold or adopted at agri stations; wanders the
      deck, lifts morale, gets talked about
- [x] Ion storms: radar and charts blind unless a lit beacon holds the picture
- [x] Fares wait on the promenade with their luggage

## Milestone 23 — Serials ✅ (Sep 2026)
- [x] Six GalNet serials that develop over dockings, kept on the NEWS tab
- [x] Each ends in a hook at its station: a contract, a market premium, or a
      skilled recruit in the lounge

## Milestone 24 — Keepsakes ✅ (Sep 2026)
- [x] Postcards (F7): the frame with a caption, saved as a PNG
- [x] Furnishings for the deck, drawn aboard, with morale and mood effects
- [x] Fame: the comms band and station control know a ship by its deeds

## Milestone 25 — Shipmates ✅ (Sep 2026)
- [x] Crew bonds: friendships and feuds that drift at every dock, shape the
      banter, and can be mediated at the captain's table
- [x] A clinic on the promenade for sick crew
- [x] The chronicle: the whole career exported as a text file (X on RECORD)

## Milestone 26 — Settlements Grow ✅ (Sep 2026)
- [x] Growth from trade, foreman work and surveys; outpost → town → city
- [x] Towns get a luxuries row, more faces and more lights; cities switch to the
      city scene; the patron's name is on the plaque and in the mood lines

## Milestone 27 — Charters ✅ (Sep 2026)
- [x] Hire haulers to run your best known routes while you fly; a cut of every
      trip's margin, paid at dock; prices move, corsairs take their share
- [x] Charters on the SHIPS tab and dotted on the galaxy map

## Milestone 28 — Wonders ✅ (Sep 2026)
- [x] A handful of unique landmarks per galaxy, drawn large in flight, with
      rumours in the bars and markers on the galaxy map
- [x] Sightings pay data, fill the codex, complete tourist fares and name
      postcards; old saves get their wonders on load

## Milestone 29 — Approach and Launch ✅ (Sep 2026)
- [x] Docking is an approach: control clears a bay, the ship glides in
- [x] Undocking is a launch: the bay releases you, control calls you clear
- [x] The Ark can be boarded and walked; its crates and a codex entry inside

## Milestone 30 — Contacts ✅ (Sep 2026)
- [x] A dozen regular captains per galaxy who remember being helped
- [x] Friends: hails, a seat in the lounge with tips, letters with gifts
      delivered at a later dock

## Milestone 31 — The Waystation ✅ (Sep 2026)
- [x] Upgrade a lit beacon or depot into a small walkable waystation: till,
      bar, bunk, airlock; tolls rise and the bar earns
- [x] The regular captains drink there, friends first
- [x] What's New scrolls

## Milestone 32 — Handbook and Voice ✅ (Sep 2026)
- [x] An in-game handbook on the title screen, one section per system
- [x] The ship's own voice on the comms band
- [x] A greenhouse module that grows provisions under way

## Milestone 33 — Rivals and the Harbourmaster ✅ (Sep 2026)
- [x] A rival captain who competes without shooting: fares, sights, routes,
      hostile hails; won round by helping them
- [x] The harbourmaster's office on the promenade

## Milestone 34 — Belonging ✅ (Sep 2026)
- [x] Friends ride along for three dockings
- [x] A home port with cheaper yard services and settled crew
- [x] Museums at research stations that take relics with your name

## Milestone 35 — Rhythms ✅ (Sep 2026)
- [x] Seven weekly occasions keyed to the real calendar, shared by everyone
- [x] Hulls with histories; beacons that pacify the lanes they light

## Milestone 36 — Second Hour ✅ (Sep 2026)
- [x] Flight School grows to ten lessons: the lounge, the promenade, a fare
      or a rescue
- [x] Sounds for the cat and the post

## Milestone 37 — Shared Sky and the Log ✅ (Sep 2026)
- [x] Wonder first-sightings shared through the wire in the real galaxy
- [x] A comms log overlay in flight (L)

## Milestone 38 — Crew Arcs ✅ (Sep 2026)
- [x] One personal story per crew role, offered to loyal crew, advanced by
      real play, ending in a plaque and a crew member at their best

## Milestone 39 — Faces ✅ (Sep 2026)
- [x] Three notables per galaxy who turn up as fares, with consequences by mood
- [x] Promenade crowds that match the day and the event

## Milestone 40 — Quiet Moments ✅ (Sep 2026)
- [x] A pause menu in flight (ESC): resume, save, settings, handbook, quit
- [x] Sounds for the wonders

## Milestone 41 — The Keeper ✅ (Sep 2026)
- [x] A third campaign: a dying lighthouse, its keeper's log, what the light
      saw, and whose light it is

## Milestone 42 — Town Projects ✅ (Sep 2026)
- [x] Fund a school, a clinic, a second pad or a chapel at a town: growth,
      effects on the deck and on your crew, a building to see

## Milestone 43 — Places with Detail ✅ (Sep 2026)
- [x] Crates in the hold, crew belongings by their bunks, passengers' luggage
- [x] Promenades dressed by station type

## Milestone 44 — Company ✅ (Sep 2026)
- [x] Crew wander the deck; passengers ask for detours to wonders; alumni write

## Milestone 45 — The Ledger ✅ (Sep 2026)
- [x] Lifetime credits in and out by source, on the RECORD tab (B)

## Milestone 46 — Small Kindnesses ✅ (Sep 2026)
- [x] The Crossing returns to a kept light; the cat brings gifts; the wall
      records all three campaigns

## Milestone 47 — Comfort ✅ (Sep 2026)
- [x] Settings for the comms band and the ship's voice; galaxy map layers (V);
      touch pause and log buttons; a title for Elite in every trade

## Milestone 48 — Other Keepers ✅ (Sep 2026)
- [x] Lights planted in the real galaxy are shared through the wire and shown
      on every pilot's chart

## Milestone 49 — Music and Slots ✅ (Sep 2026)
- [x] Moods for the waystation, the Ark and the wonders
- [x] The story so far on every save slot

## Milestone 50 — The Chronicle Room ✅ (Sep 2026)
- [x] The chronicle as an in-game page: RECORD tab, title screen, pause menu

## Milestone 51 — More of Everything ✅ (Sep 2026)
- [x] Four more serials (ten), four more encounters (twenty-four), two more
      wonder kinds, six crew traits, two furnishings, three lines for the ship

## Milestone 52 — Lore ✅ (Sep 2026)
- [x] A line of history for every system and world, read out on arrival

## Milestone 53 — Passengers Underfoot ✅ (Sep 2026)
- [x] Passengers stretch their legs aboard; talk to whoever you're beside

## Milestone 54 — Regulars ✅ (Sep 2026)
- [x] Stations count your dockings: bulletin lines about you, passenger
      reviews, a regular's rate at the yard, a greeting from control

## Milestone 55 — Odds and Ends ✅ (Sep 2026)
- [x] Hull personalities for the ship's voice; retirement posted to the wire;
      a legend on the galaxy map; deeds counted on the title line

## Milestone 56 — The Roster ✅ (Sep 2026)
- [x] A crew roster screen with morale, loyalty, skill progress, bonds, asks
      and stories, and a bonus on Enter

## Milestone 57 — Encounters ✅ (Sep 2026)
- [x] Ten new non-combat encounter cards: buoy, lost drone, walk-us-to-the-gate,
      pod with a note, the late show, meteor shower, birthday, spacesick,
      hot pool, someone else's rover

## Milestone 58 — Corridor Talk ✅ (Sep 2026)
- [x] Crew talk to each other aboard: role, bond, ship-state and trait lines
      as speech bubbles; solo habits
- [x] Deck path-finding so crew walk between rooms
- [x] Mess call: the crew gather at the galley; eat with them for morale

## Milestone 59 — Concourse Gossip ✅ (Sep 2026)
- [x] Station promenade crowds gossip from world state (crisis, events, war,
      wonders, prices, patrols, your reputation); overheard within earshot;
      E beside any walker for a line

## Milestone 60 — The Ring Race ✅ (Sep 2026)
- [x] Six-ring time trial around any civil station, entered from the lounge;
      par, prize, best time per station, RING RUNNER achievement, wire post

## Milestone 61 — Watches ✅ (Sep 2026)
- [x] Watch rotation every four minutes; on-watch crew keep to their posts;
      roster shows ON/OFF WATCH
- [x] Passengers path-find and question the crew; crew answer by role

## Milestone 62 — The Course Record ✅ (Sep 2026)
- [x] Local record holder per course (a named captain); beating it is
      remembered and rivals take it personally
- [x] Wire course records: `/api/race` GET/POST, top five per station, shown
      in the lounge

## Milestone 63 — Windows and Bays ✅ (Sep 2026)
- [x] The viewport scene: look out of the ship by bearing, with captions and
      company
- [x] Your ship and parked hulls visible in the promenade bays; shuttle traffic

## Milestone 64 — The Post ✅ (Sep 2026)
- [x] Mail bag missions at every civil station: no cargo, small pay, standing,
      letters from strangers; THE POSTMAN achievement

## Milestone 65 — Rites of Passage ✅ (Sep 2026)
- [x] A wedding, a birth, a passing among passengers; a crew wedding; all
      logged in the chronicle

## Milestone 66 — A Name on the Lanes ✅ (Sep 2026)
- [x] Earned captain nicknames used by control, friends, the crowd, the crew
      and the chronicle; talk of the ship catches up on races, post, watches
      and weddings

## Milestone 67 — Cards After Watch ✅ (Sep 2026)
- [x] C beside crew: a hand of cards for matchsticks or a round; the cook's
      meal

## Milestone 68 — Station Hours ✅ (Sep 2026)
- [x] Per-station clocks from real UTC; night shift dims the promenade and
      thins the crowd; the tannoy ticker

## Later
