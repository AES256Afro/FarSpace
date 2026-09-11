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

## Milestone 69 — The Band ✅ (Sep 2026)
- [x] The comms array aboard plays the serial, the news and the wire

## Milestone 70 — Passage ✅ (Sep 2026)
- [x] L on the SHIPS tab: take a liner to your nearest parked hull (fare per
      jump and head, time passes, this ship parks here)

## Milestone 71 — Ghosts on the Lanes ✅ (Sep 2026)
- [x] Other real pilots' recent wire posts from this system spawn their ship
      here, labelled and hailing once

## Milestone 72 — The Guestbook ✅ (Sep 2026)
- [x] Passengers sign a guestbook on landing; happy ones return as fares by
      name; P on RECORD reads the book

## Milestone 73 — What the Void Keeps ✅ (Sep 2026)
- [x] A destroyed ship leaves a named wreck with half the hold; lost crew on
      the wall and at remembrance

## Milestone 74 — Salvage on the Wire ✅ (Sep 2026)
- [x] Lost ships post a wreck light; other pilots' wrecks appear in your
      systems under their call sign with salvage

## Milestone 75 — The Regatta ✅ (Sep 2026)
- [x] Three-course racing campaign across three stations with a title,
      tracked on the MISSIONS board

## Milestone 76 — Stakes ✅ (Sep 2026)
- [x] Buy shares in stations; dividends on docking; holdings on NEWS;
      SHAREHOLDER

## Milestone 77 — The Vote ✅ (Sep 2026)
- [x] A weekly question per faction on the NEWS tab; standing-weighted votes;
      results change patrols, yard prices and night promenades

## Milestone 78 — Handbook and Small Sounds ✅ (Sep 2026)
- [x] Controls screen covers stakes, votes, the liner, the guestbook, the
      race, the roster, the viewport, cards and the band; tannoy chime, mess
      call blip; shorter vote toast

## Milestone 79 — A Trade of Their Own ✅ (Sep 2026)
- [x] Crew specialties at skill three, two per role, chosen aboard; effects on
      heat, wear, damage, corsairs, jump fuel, thrust, illness and passengers

## Milestone 80 — Fleet at Work ✅ (Sep 2026)
- [x] W on a parked hull: it runs your best known route as a charter; release
      returns the hull

## Milestone 81 — Holding Short ✅ (Sep 2026)
- [x] Docking behind traffic: control holds you short of the bay, then calls
      you in

## Milestone 82 — Maydays on the Wire ✅ (Sep 2026)
- [x] Dry tanks post a six-hour mayday light; other pilots find the stranded
      ship and pass fuel for a Fund bounty; the stranded ship receives it

## Milestone 83 — Notes at the Wonders ✅ (Sep 2026)
- [x] `/api/notes`: one line per pilot per system, tied to a wonder, read by
      whoever sights it next

## Milestone 84 — Favours ✅ (Sep 2026)
- [x] Friends in the lounge hand you errands; no fee, a letter and gift later,
      disposition up

## Milestone 85 — Second Stories ✅ (Sep 2026)
- [x] A second crew arc per role, about races, mess call, the viewport,
      maydays and the vote

## Milestone 86 — The Border ✅ (Sep 2026)
- [x] A weekly contested seam system; deliveries, votes and stakes push;
      Monday settles it and can flip the system's faction

## Milestone 87 — The Rally ✅ (Sep 2026)
- [x] Rally supply missions at contested stations with a big push; tannoy
      and gossip about the contest

## Milestone 88 — The Week ✅ (Sep 2026)
- [x] W on RECORD: votes, the border, the regatta, holdings, charters and
      fleet on one page

## Milestone 89 — Handbook Pages ✅ (Sep 2026)
- [x] Seven in-game handbook sections for life aboard, the post, the race,
      stakes and the vote, the border, fleet and passage, the wire

## Milestone 90 — The Convoy ✅ (Sep 2026)
- [x] A real escort activity: three haulers form on your stern and pay at the
      gate; SHEPHERD

## Milestone 91 — Pictures Wanted ✅ (Sep 2026)
- [x] Photo missions completed by F7 postcards in the right place; STRINGER

## Milestone 92 — Lost and Found ✅ (Sep 2026)
- [x] The cat slips out on the promenade; left behind she waits or comes home
      in a crate; band chatter about the border, convoys and maydays

## Milestone 93 — More Wonders ✅ (Sep 2026)
- [x] The Loom, the Clock and the Choir: three new wonder kinds with their own
      looks and sounds

## Milestone 94 — Docs Refresh ✅ (Sep 2026)
- [x] README feature summary regrouped with a Politics section and every
      system from milestones 56–93

## Milestone 95 — More Voices ✅ (Sep 2026)
- [x] A batch of new gossip, tannoy, crew, passenger and ship's-voice lines
      about everything the ship does now

## Milestone 96 — Encounters Batch 3 ✅ (Sep 2026)
- [x] An old probe, the lantern ships, a stranded liner, a survey crew's cairn

## Milestone 97 — Traffic Control ✅ (Sep 2026)
- [x] Control calls real ships in and out of bays on the band when you're
      close enough to hear

## Milestone 98 — Ports Remember You ✅ (Sep 2026)
- [x] The harbourmaster's office lists your dockings, stake, fares landed,
      vote and ring times at this station

## Milestone 99 — Gentle Lanes ✅ (Sep 2026)
- [x] A lanes setting (gentle / normal / rough) for corsair density; a
      strategy-layer soak test over twelve simulated weeks

## Milestone 100 — Family ✅ (Sep 2026)
- [x] Crew members' families on the promenade at their home ports; a gift
      and a lift once a week

## Milestone 101 — Scrap ✅ (Sep 2026)
- [x] X on a parked hull scraps her for credits

## Milestone 102 — The Border on the Title ✅ (Sep 2026)
- [x] The title ticker shows this week's contested system and the standing

## Milestone 103 — Hum ✅ (Sep 2026)
- [x] Tannoy while docked; watch changes called on the band in flight; the
      lounge on the band

## Milestone 104 — Calls and Courses ✅ (Sep 2026)
- [x] Calls for help on the galaxy map; N on the market plots a course to the
      best known sell

## Milestone 105 — Small Touches ✅ (Sep 2026)
- [x] Specialties in the chronicle, the border on the band card, a hardcore
      loss leaves a wreck light, your name on postcards

## Milestone 106 — The Chronicle's Week ✅ (Sep 2026)
- [x] The chronicle carries the week's votes, border, holdings, times and
      counts as prose

## Milestone 107 — Deeds and Slots ✅ (Sep 2026)
- [x] Five more deeds (the band, family, cards, the breakers, mess call); the
      save slots show your name on the lanes

## Milestone 108 — Writing Back ✅ (Sep 2026)
- [x] R on the NEWS tab replies to letters; captains and old shipmates notice

## Milestone 109 — Loose Ends ✅ (Sep 2026)
- [x] Record holders write when beaten; race day pays half again; tourists
      love a postcard of their sight

## Milestone 110 — Guide Contents ✅ (Sep 2026)
- [x] A grouped contents block at the top of the player's guide; border
      results with your push go to the wire

## Milestone 111 — Tidy ✅ (Sep 2026)
- [x] Handbook lines for scrapping and writing back; ship's voice on family
      and letters; a header for the block in What's New

## Milestone 112 — The Pacer ✅ (Sep 2026)
- [x] A record-pace ghost marker during ring races; the new week announced on
      the first dock

## Milestone 113 — Cheques in the Post ✅ (Sep 2026)
- [x] Remote stake dividends at a quarter rate on any docking; the guestbook
      readable aboard at the passenger seat

## Milestone 114 — The Grand Course ✅ (Sep 2026)
- [x] The regatta's third course is eight wide rings; the convoy lead talks
      on the way to the gate

## Milestone 115 — Unread ✅ (Sep 2026)
- [x] The title marks What's New when unread; race day on the tannoy; the
      ship on the pacer

## Milestone 116 — The Marshal's Challenge ✅ (Sep 2026)
- [x] A wager card that doubles the next under-par race prize; a bay of your
      own at a station you hold a big stake in

## Milestone 117 — The Lanes Report ✅ (Sep 2026)
- [x] A weekly letter from your home port's harbour office

## Milestone 118 — People in the Codex ✅ (Sep 2026)
- [x] Captains, notables, old shipmates and families on the codex page

## Milestone 119 — Odds and Ends II ✅ (Sep 2026)
- [x] The champion in the crowd and on the tannoy; the week page notes the
      marshal's wager; fares impressed by a record holder; the roster marks
      families met

## Milestone 120 — Convoy on the Board ✅ (Sep 2026)
- [x] Convoy missions on station boards; accept and launch

## Milestone 121 — Tidy II ✅ (Sep 2026)
- [x] The title summary carries your name on the lanes; handbook lines for
      the pacer, the wager and convoys on the board

## Milestone 122 — Handbook Index ✅ (Sep 2026)
- [x] The handbook header lists its sections; the ship has a word on a new
      week

## Milestone 123 — Keepsakes II ✅ (Sep 2026)
- [x] The chronicle carries the guestbook; the wall of record lists ring
      times and the regatta title; the roster totals wages

## Milestone 124 — Pictures in the Museum ✅ (Sep 2026)
- [x] Picture jobs turned in at research stations hang in the museum

## Milestone 125 — Convoy Manners ✅ (Sep 2026)
- [x] Docking with a convoy or a race running ends it with a word on the band

## Milestone 126 — Paging ✅ (Sep 2026)
- [x] The tannoy pages the docked captain: mail, the cat, waiting family,
      a consignment due here, a leaking hull, an empty tank

## Milestone 127 — Berth Neighbours ✅ (Sep 2026)
- [x] Captains you know walk the promenade when their ship is in the bays:
      a word, a spare or a settled round once a week; the rival has words too

## Milestone 128 — Station Hours Matter ✅ (Sep 2026)
- [x] Night rate and early shift at the yard, a fuller lounge after dark,
      night control on the way in

## Milestone 129 — The Dock-hand ✅ (Sep 2026)
- [x] A dock-hand by your bay reads the hull aloud; regulars get a small job
      on the house once a week

## Milestone 130 — Requests from the Lounge ✅ (Sep 2026)
- [x] Passengers ask for a hot meal, a quiet run or a view; met requests tip
      on top of the fare, missed ones dent the mood

## Milestone 131 — Lost Property ✅ (Sep 2026)
- [x] Fares leave things in the cabin; hand them in at a harbour office or
      keep them after four dockings as keepsakes on the wall

## Milestone 132 — Deeds III ✅ (Sep 2026)
- [x] Six achievements for the new evening: on the house, lost and found,
      finders keepers, good service, berth neighbours, night owl

## Milestone 133 — The Galley Menu ✅ (Sep 2026)
- [x] Meals depend on what's aboard: luxuries make a dinner, a rare tea, wine
      or mead is poured after, the cook helps, the fares eat too; the chronicle
      counts meals and keepsakes

## Milestone 134 — Talk of the Deck ✅ (Sep 2026)
- [x] Crew chatter and concourse gossip cover keepsakes, lost property, the
      dock-hand, berth neighbours, open requests and the yard's shift rate

## Milestone 135 — Something of Theirs ✅ (Sep 2026)
- [x] An encounter: the owner of lost property chases the ship down; hand it
      over or keep it

## Milestone 136 — Handbook III ✅ (Sep 2026)
- [x] Help and handbook cover the harbour: hours, paging, the dock-hand,
      neighbours, lost property, requests, the galley; the ship has lines too

## Milestone 137 — The Harbour View ✅ (Sep 2026)
- [x] O on RECORD: the clock and rate, who's in the bays, lost property and
      keepsakes, open requests, and what the tannoy would page you about

## Milestone 138 — Requests on the HUD ✅ (Sep 2026)
- [x] A fare's open request rides on their line on the flight HUD: wanted,
      done, or a quiet run broken

## Milestone 139 — Away Teams ✅ (Sep 2026)
- [x] Ten encounter cards with a Trek / Expanse / Orville flavour: first
      contact, the quiet world, the rock hopper, hard burn, lounge night,
      the sim rig, the diplomat, the anomaly, the old temple, the outpost bar

## Milestone 140 — Captain's Log and Number One ✅ (Sep 2026)
- [x] The chronicle and the log open with a stardate; the longest-serving
      crew member is Number One; bridge banter, a deadpan ship, belt gossip

## Milestone 141 — Envoy Fares ✅ (Sep 2026)
- [x] Envoys carry treaties between two factions on a deadline; land them in
      time and unshot for rep on both sides, or the talks fail

## Milestone 142 — The Juice ✅ (Sep 2026)
- [x] Clinics sell burn juice; a hard burn from the pause menu lasts until
      you dock or jump: faster cruise, keener thrust, the crew and the frame pay

## Milestone 143 — Medical Runs ✅ (Sep 2026)
- [x] Patient fares: get them to the clinic that can treat them within their
      dockings; a medic aboard buys one more; late halves the fare

## Milestone 144 — Senior Staff ✅ (Sep 2026)
- [x] E at the study with two crew aboard, once a leg: each department
      reports and the captain sets a focus (engines, sickbay, tactical, helm)

## Milestone 145 — The Sim Rig ✅ (Sep 2026)
- [x] A furnishing by the study: four programs, an hour somewhere else once
      a leg; the fares come to the opera; it jams sometimes

## Milestone 146 — The Singers ✅ (Sep 2026)
- [x] A first-contact arc in three cards: answer the singing hull, guide it
      to a light, take what it leaves; a CONTACTS page in the codex

## Milestone 147 — Bridge Banter ✅ (Sep 2026)
- [x] Two of the crew trade a line on the band in flight now and then; the
      codex page fits its six groups

## Milestone 148 — The Belt Remembers ✅ (Sep 2026)
- [x] Mining and refinery stations are the belt: their own tannoy, and a
      yard rate 10% under for anyone who shared air or water with a hopper

## Milestone 149 — Alert Status ✅ (Sep 2026)
- [x] Y cycles green, yellow and red alert in flight: faster shields, guns
      +10% on red, a morale drain, a banner, and the crew calling it

## Milestone 150 — Passing Hails ✅ (Sep 2026)
- [x] The unnamed traffic hails as it passes: patrols formal, haulers belt or
      business, liners smug, and everybody has a word about the cat

## Milestone 151 — Receptions ✅ (Sep 2026)
- [x] Dock with standing and the faction throws a reception now and then:
      a speech, a gift from the hold, or an early night

## Milestone 152 — She Has a Name ✅ (Sep 2026)
- [x] Ask the ship at the wall of record what it wants to be called; its
      voice signs its lines with that name from then on

## Milestone 153 — The Star Up Close, and the Loop ✅ (Sep 2026)
- [x] A fourth lounge request: take them near the star; a card that repeats
      the same minute until you do something different

## Milestone 154 — Reviews ✅ (Sep 2026)
- [x] V on the roster: a review in the study once a week per crew member;
      commend, counsel, or make them Number One

## Milestone 155 — Lounge Diplomacy ✅ (Sep 2026)
- [x] Two cards: fares at war in the lounge (seat them apart, a captain's
      dinner, or let them have it out) and an inner and a belter in the crew

## Milestone 156 — Away Team ✅ (Sep 2026)
- [x] A ground card that asks who walks in: the engineer, the medic, the
      gunner, or you; each has its own way of going right or wrong

## Milestone 157 — The Unwinnable, and the Trap ✅ (Sep 2026)
- [x] A sim program nobody passes unless the engineer changes the conditions;
      an unverified distress call that is real or an ambush

## Milestone 158 — The Translator Core, and Yellow by Default ✅ (Sep 2026)
- [x] A translator module: first contacts always land and the singers say
      more; tactical calls yellow alert on its own when a hostile closes

## Milestone 159 — Diplomatic Passage ✅ (Sep 2026)
- [x] An envoy aboard waves their seal at customs and nobody opens the hold;
      the klaxon keeps going at red

## Milestone 160 — Supplemental ✅ (Sep 2026)
- [x] At every clamp the captain's log gets a supplemental entry tallying
      the leg: jumps, fire taken, alerts, burns, cards, rescues, the crew's mood

## Milestone 161 — The Envoy's Rite ✅ (Sep 2026)
- [x] A card while an envoy is aboard: the galley for an hour, join them, or
      refuse; belt and inner traits for the crew, with lines

## Milestone 162 — Bridge Protocol ✅ (Sep 2026)
- [x] A ship's counsellor specialty for medics; Number One acknowledges hails
      while the autopilot has the conn; the helm answers when cruise engages

## Milestone 163 — Rank and Registry ✅ (Sep 2026)
- [x] A command rank from deeds (skipper to admiral) and a registry for the
      hull; control reads both out, the chronicle and the harbour view carry them

## Milestone 164 — The Crew Want a Word ✅ (Sep 2026)
- [x] When morale sinks the crew meet you at the clamp: a bonus round, a
      night ashore, or your foot down (and maybe somebody walks)

## Milestone 165 — The Village ✅ (Sep 2026)
- [x] A prime-directive card on the ground: back out quietly, go down and
      say hello, or help with the fire; What's New reflows as paragraphs

## Milestone 166 — A Visitor on the Bridge ✅ (Sep 2026)
- [x] A trickster card that keeps coming back until you refuse or throw them
      off; the ship reads the old log back on the night watch

## Milestone 167 — Strange Readings ✅ (Sep 2026)
- [x] Three new anomaly kinds among the signals: a fold that skips the clock,
      a lens that lights the whole system, an echo that plays the log back

## Milestone 168 — Patrol Orders ✅ (Sep 2026)
- [x] Military stations post patrol orders to ranked captains: hold station
      in a system off cruise, show the flag, report back

## Milestone 169 — Belt Work ✅ (Sep 2026)
- [x] Boards near the belt post water, ration, clinic and filter runs in the
      rock's own words; a rock loses its spin now and then and the yard pays
      for an engineer up the spoke

## Milestone 170 — Parley ✅ (Sep 2026)
- [x] E near a corsair opens a channel: pay the toll, bluff a patrol
      callsign, offer them a way out as an ace, or open fire

## Milestone 171 — Small Voices ✅ (Sep 2026)
- [x] A counsellor aboard takes a low crew member into the study once a leg;
      the helm calls the flip and burn; the cat has the conn

## Milestone 172 — Science Officer ✅ (Sep 2026)
- [x] A third pilot specialty: the deep scan reaches half again as far and
      strange readings pay more; the ship reports at the briefing; a hostage
      on the band

## Milestone 173 — The Band on the Promenade ✅ (Sep 2026)
- [x] On the night shift a band plays the promenade; E to stand for a set,
      once a week per station, for the crew and the fares

## Milestone 174 — All Hands ✅ (Sep 2026)
- [x] Address the crew from the pause menu once a leg: rally, warn or thank
      them; the engineer gives a damage report the first time the hull drops
      under half

## Milestone 175 — Boarding Party ✅ (Sep 2026)
- [x] Boarding a derelict asks who comes through the lock: the engineer
      slows the leaks and the fires, the medic brings a spare tank, the gunner
      clears the fires by the lock

## Milestone 176 — Shore Leave ✅ (Sep 2026)
- [x] L at the lander with crew aboard: an hour on the ground, a photo by
      the lander for the keepsakes, or back to work

## Milestone 177 — The Quiet Ones ✅ (Sep 2026)
- [x] A second contact, on the ground: lights on a ridge that answer the
      rover's headlights, then a line of lights that leads somewhere

## Milestone 178 — A Line on the Roster ✅ (Sep 2026)
- [x] Once it has a name, the ship asks to be on the roster; say yes and it
      gets a line at the bottom with its own mood

## Milestone 179 — The Rock's Own ✅ (Sep 2026)
- [x] A galaxy event: a belt rock declares itself independent for the week;
      water, rations and medicine pay, and a register by the clamp asks who's
      with it

## Milestone 180 — Second Acts ✅ (Sep 2026)
- [x] Every faction arc has two more stages after the third, at rep 75 and
      100: envoys' roads, dry rocks, ledgers' debts, outer signals, the hull
      that sang

## Milestone 181 — The Clinic and the Ready Room ✅ (Sep 2026)
- [x] Where the crisis is medicine the clamp asks for your medic or your
      crates; the ready room on the pause menu is a word with Number One

## Milestone 182 — Keeping II ✅ (Sep 2026)
- [x] The chronicle carries the log's last five entries; the codex counts
      envoys landed and patients saved; at commodore and up an inspection
      walks your deck now and then instead of a reception

## Milestone 183 — The Pool ✅ (Sep 2026)
- [x] A card: a jar on the console and a list headed "what the skipper does
      next"; take it, let it ride, or double it and pick a line

## Milestone 184 — Damage Control ✅ (Sep 2026)
- [x] At red alert an engineer works the worst system back up while the guns
      are busy; a card: a ship like yours, with your voice, saying don't

## Milestone 185 — Freeman of the Belt ✅ (Sep 2026)
- [x] A standing with the rocks (hoppers, spins, registers, runs); at three
      the belt calls you a freeman and its yards go to fifteen under; the
      science officer labels folds, lenses and echoes on the chart

## Milestone 186 — Science Postings ✅ (Sep 2026)
- [x] Research stations post the strange readings first, at a better rate;
      a captain's chair for the bridge

## Milestone 187 — Requisition ✅ (Sep 2026)
- [x] At commander and up, naval stations sign for a full service once a
      week; Number One's conn goes in the supplemental log

## Milestone 188 — Company ✅ (Sep 2026)
- [x] At mess call the captain sits with whoever's nearest, once a week
      each, for loyalty; a sixth sim program, the pictures, for the bonds

## Milestone 189 — Small Ceremonies ✅ (Sep 2026)
- [x] A promotion lifts the whole crew; Number One lays in the course when
      the autopilot engages; a counsellor eases the fares every docking

## Milestone 190 — The Reactor Is Scramming ✅ (Sep 2026)
- [x] A card when the core is low: the engineer restarts it by hand, vent
      and cold-start, or ride it out; Number One objects to a red alert with
      a clear scanner

## Milestone 191 — The Scrubbers Are Failing ✅ (Sep 2026)
- [x] A card when the air scrubbers are low: swap the filters, breathe
      shallow to port, or open the greenhouse to the deck

## Milestone 192 — Emergencies ✅ (Sep 2026)
- [x] Two more system cards: the hold depressurising (seal it, suit up, or
      dump the bay) and the drive coughing (retune, burn it clean, or nurse it)

## Milestone 193 — Emergencies II ✅ (Sep 2026)
- [x] Comms down (the engineer, the sim rig's emitter, or fly quiet) and the
      mounts jammed (the gunner, a hard cycle, or run without guns)

## Milestone 194 — What the Yard Would Say ✅ (Sep 2026)
- [x] The harbour view lists the systems the yard would like a word about;
      the HUD's top-left warnings already flag anything under forty

## Milestone 195 — Through the Lines ✅ (Sep 2026)
- [x] An envoy bound for a system at war pays half again and the rep is
      better; a ship on the roster reviews the captain at the wall of record

## Milestone 196 — Stations ✅ (Sep 2026)
- [x] The HUD names who has the conn on autopilot, who's at tactical and
      on damage control at red; the helm says steady as she goes

## Milestone 197 — Standing Orders ✅ (Sep 2026)
- [x] Two standing orders in settings: leave the clamp at green or yellow;
      Number One answers hails on autopilot, or the captain does

## Milestone 198 — The Lounge Knows Who It Carries ✅ (Sep 2026)
- [x] Envoys and patients have their own lines for each crew role in the
      lounge; the ship has read the standing orders

## Milestone 199 — Word Gets Round ✅ (Sep 2026)
- [x] The bulletin carries the register and the freemen; the tannoy shows
      off a ship that passed inspection; the concourse knows a freeman

## Milestone 200 — The Bridge, in the Handbook ✅ (Sep 2026)
- [x] A handbook section for everything the bridge learned this block, and
      two more lines under life aboard

## Milestone 201 — Letters From the Braid and the Belt ✅ (Sep 2026)
- [x] The rock's council writes when the belt makes you a freeman (water
      money and a tab); the inspectorate writes after a good ship (two spares)

## Milestone 202 — A Board of Inquiry ✅ (Sep 2026)
- [x] Naval stations convene a board for every crew member who didn't make
      the pod: tell it straight, let Number One speak, blame the hull, or
      decline; rep, loyalty and morale follow (deed "no fault")

## Milestone 203 — Card Night ✅ (Sep 2026)
- [x] Once a week, with two crew fit, the galley table is a card table: deal
      in for fifty, play for matches, watch who bluffs, or cook instead

## Milestone 204 — The Plaque ✅ (Sep 2026)
- [x] A dedication plaque by the airlock (name, registry, commissioning
      stardate) with a motto chosen at the wall of record: four off the yard's
      list or your own; the chronicle quotes it (deed "a line by the airlock")

## Milestone 205 — The Voice Settings ✅ (Sep 2026)
- [x] Somebody reprograms the ship's voice: let it run a leg (insufferable
      lines on the band until the timer runs out), find out who, or reset it

## Milestone 206 — Quarantine, the Fold, the Envoy's Companion ✅ (Sep 2026)
- [x] Three cards: a freighter with a fever that's really a quarantine (a line,
      a suit, an escort, or no); a ship like yours out of a fold with a line
      from a day you haven't had; an envoy's companion loose in the vents

## Milestone 207 — Number One's Report ✅ (Sep 2026)
- [x] The senior staff briefing has a sixth line when there's a Number One:
      who's quiet, whether that was enough red alerts, whether the tin is light

## Milestone 208 — A Signal Fire, a Garden ✅ (Sep 2026)
- [x] Two ground cards: another faction's survey team on a dead beacon (take
      them up, fix the beacon, drop food, or leave); a century-old garden that
      kept going (sample it, pick for the galley, or leave it growing)

## Milestone 209 — The Personal Log ✅ (Sep 2026)
- [x] Dictate a log entry in your own words at the wall of record; it goes in
      the record with the stardate (deed "personal log")

## Milestone 210 — Birthdays Aboard ✅ (Sep 2026)
- [x] Every crew member has a birthday every thirty ship-days; the galley does
      something with ration sugar and a candle (morale, loyalty, a log line)

## Milestone 211 — Salvage Rights ✅ (Sep 2026)
- [x] Now and then another cutter is already latched to a derelict: half each
      by belt rules, buy their claim, stand your ground (a gunner settles it),
      or leave it to them and let the belt hear you were fair

## Milestone 212 — Emergencies ✅ (Sep 2026)
- [x] A new board mission: a station in the next system needs a ship's
      engineer at the clamp inside three hours; full pay on time, half after;
      the HUD counts the minutes; lives, engineer XP, a deed

## Milestone 213 — The Office ✅ (Sep 2026)
- [x] Every fold, echo, loop and mirror gets a letter from the office of
      anomalous incidents asking for a form; the third opens a file (deed)

## Milestone 214 — Water Is Standing ✅ (Sep 2026)
- [x] Water sold at a belt rock counts toward belt standing; fifty units and
      the belt calls you waterbearer

## Milestone 215 — Prisoner Transfers ✅ (Sep 2026)
- [x] Naval stations post prisoner transfers: in irons in the bunk room, a
      gunner keeps it simple, no gunner and they may walk at a clamp; a word
      from the bunk room on the way (listen, let them walk at a rock, double
      the watch); chatter, HUD tag, deeds

## Milestone 187 — Requisition ✅ (Sep 2026)
- [x] At commander and up, naval stations sign for a full service once a
      week; Number One's conn goes in the supplemental log

## Later: Trek / Expanse / Orville

- A second story arc per faction (first contact proper: the singers' home)
- A science officer role, or a science specialty for pilots: better scans,
  anomaly readings on the HUD
- Shore leave on the ground with the crew: a beach that isn't a sim
- A second contact on the ground (the quiet ones: trade in light)
- Belt politics: a rock that goes independent, and what the inners do
- The ship's AI as crew: a seat on the roster, an opinion at the briefing
- Talent night II: the band tours the promenade at night
- A hostage negotiation card; a boarding party with a chosen crew member

## Later
