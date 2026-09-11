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

## Milestone 216 — Answer the Hail ✅ (Sep 2026)
- [x] A passing hail can be answered from the pause menu for two minutes: a
      civil word (rep, morale, deed at ten), belt manners (standing, if there
      are rocks about), or clear the band (a patrol notes it)

## Milestone 217 — Marines ✅ (Sep 2026)
- [x] Two marines on every naval promenade with lines about the brig, the
      board, the emergency call and who gets saluted

## Milestone 218 — The Service in the Handbook ✅ (Sep 2026)
- [x] Handbook section "The service and the belt"; a help line for naval
      stations and belt standing

## Milestone 219 — The Captain's Table ✅ (Sep 2026)
- [x] Talk to a fare during a mess call and there's a chair at your end of the
      table: sit with me (mood up, a story by kind), sit with the crew, or the
      lounge; envoys, patients and prisoners have lines aboard now (a crash
      fixed: they had none)

## Milestone 220 — A Representative ✅ (Sep 2026)
- [x] After the third letter the office sends someone to the clamp, once, with
      four questions and orders not to sit down

## Milestone 221 — Transfer Requests ✅ (Sep 2026)
- [x] At a naval station a long-serving, unhappy crew member asks for a posting
      ashore: sign it (rep, a letter later), talk them round, or refuse

## Milestone 222 — Observation Posts ✅ (Sep 2026)
- [x] Research stations post observation orders: hold a quiet orbit over a
      world for a minute or so, no cruise, no red alert (red in orbit halves
      the pay and resets the clock); the HUD counts; deed "nobody looked up"

## Milestone 223 — Rock Kids ✅ (Sep 2026)
- [x] Two kids on every belt promenade with questions about the dent, the
      well, the tank and the airlock button

## Milestone 224 — The Ship Notices ✅ (Sep 2026)
- [x] Eight more ship's-voice lines keyed on the plaque, the irons, the board,
      the birthday, the office, answered hails, water to the belt and a guarded
      prisoner

## Milestone 225 — Before the Room ✅ (Sep 2026)
- [x] At a reception, commend your longest-serving crew member before the
      room: loyalty and morale, XP, rep, a deed

## Milestone 226 — The Drought ✅ (Sep 2026)
- [x] A galaxy event for belt rocks: the ice line fails, water stock goes to
      nothing, the tannoy says ration; water sold there counts triple toward
      belt standing (deed "the tank came in")

## Milestone 227 — Evacuations ✅ (Sep 2026)
- [x] Stations in a crisis, a strike, a storm or a drought post evacuation
      fares: a party of up to eight at a head rate, rep, lives counted at the
      far clamp (deeds at one party and thirty people)

## Milestone 228 — Any Other Business ✅ (Sep 2026)
- [x] The briefing ends with a motion from one of the staff: run the drive
      hot, a rest day, a live-fire drill, the long way round the star; grant,
      deny, or table it

## Milestone 229 — One Quiet Leg ✅ (Sep 2026)
- [x] Once on the roster the ship asks for a leg with no red alert and no
      fire; keep the promise and it tightens something itself (wear -6, deed)

## Milestone 230 — Third Contact ✅ (Sep 2026)
- [x] The quiet ones set up shop: a crate in the ring for a trading stone
      (codex contact 3, data, a keepsake), or take it and the lights go out

## Milestone 231 — Number One's Note ✅ (Sep 2026)
- [x] The chronicle carries a paragraph from Number One about the captain:
      rescues against fights, the crew's state, the boards stood before

## Milestone 232 — The Council Asks ✅ (Sep 2026)
- [x] Freemen in a belt system get the council's question on the water tariff:
      hold (belt up, faction down), fold for the clinic, or split it (a coin)

## Milestone 233 — A Pod With an Officer in It ✅ (Sep 2026)
- [x] A card: an officer from the far side of a border in a failing pod;
      bring them aboard (rep with their people), tow the pod sealed, or log it

## Milestone 234 — Across the Bow ✅ (Sep 2026)
- [x] A parley option: one warning shot; a gunner and a record help; fail and
      they open up early

## Milestone 235 — The Galley Door ✅ (Sep 2026)
- [x] The ship keeps a newsletter (wall of record, once it has a name or a
      roster line): card night, the band, who the captain sat with, moods,
      the office, hails, the last log lines, corrections none

## Milestone 236 — Freeman's Runs ✅ (Sep 2026)
- [x] Freemen see rock-to-rock runs at a freeman's rate (+40%); inners need
      not apply

## Milestone 237 — The New Hand ✅ (Sep 2026)
- [x] A fresh hire gets sent for a left-handed spanner: let it run (morale,
      bonds), call it off, or go and help them look (loyalty)

## Milestone 238 — Belt Words ✅ (Sep 2026)
- [x] A handbook glossary: inners, the well, a rock, the spin, beratna, the
      ice line, freemen, the minutes, belt rules and manners, the juice

## Milestone 239 — The Promenade Talks ✅ (Sep 2026)
- [x] Concourse gossip about you: the plaque, Number One, prisoners fed, the
      board, the warning shot, the minutes, the captain's table, the drought

## Milestone 240 — A Hull in the Corona ✅ (Sep 2026)
- [x] A mayday from sunward: go in (hull -12, three lives, rep), send the
      engineer's drone with a line (a part, two lives), or call it in

## Milestone 241 — Cadet Rate ✅ (Sep 2026)
- [x] A stowaway behind the water tank: sign them on as a cadet (a berth, a
      cadet's wage, no dockings, and the crew's spanner), put them ashore fed,
      or hand them to the marines

## Milestone 242 — The Word ✅ (Sep 2026)
- [x] Choose the word you give on undock at the wall of record; the helm, or
      Number One, or the ship answers it on the band; cards must have unique
      ids (a test)

## Milestone 243 — A Wake ✅ (Sep 2026)
- [x] After a crew member is lost the galley holds a wake: say the name
      (morale, loyalty, a log line), stand with them, or send them to stations

## Milestone 244 — Talent Night ✅ (Sep 2026)
- [x] With three fit crew and a galley, once a week: three acts by role, the
      captain judges (morale, bonds), or calls a draw and the ship says coward

## Milestone 245 — The Board of Ethics ✅ (Sep 2026)
- [x] The survey's board of ethics writes once after a first contact broken
      (a child drew your lander) and once after one kept (a grant; they
      invented the wheel)

## Milestone 246 — On the Chart ✅ (Sep 2026)
- [x] The finder names the find: after a scan turns up an anomaly the pause
      menu offers NAME THE FIND; the chart keeps it (deed "on the chart")

## Milestone 247 — The Crew Talk ✅ (Sep 2026)
- [x] Crew chatter about the undock word, the plaque, Number One's conn, the
      cadet's spare gravity, the cup on the table, seconds for the prisoner

## Milestone 248 — The Counsellor's Hour ✅ (Sep 2026)
- [x] With a counsellor aboard and a rough leg (two red alerts or three
      fights) they knock with two cups: take the hour (loyalty, the leg reads
      calmer), ten minutes, or "I'm fine" (they write it down)

## Milestone 249 — Commissioning ✅ (Sep 2026)
- [x] Every hull you take at a yard gets a commissioning stardate on the
      plaque and a bell the yard keeps for this (deed at three hulls)

## Milestone 250 — The Ship Gets Even ✅ (Sep 2026)
- [x] After the voice-settings prank the ship retaliates: every alarm at
      once; log it as even, tell it that's enough, or declare a prank war

## Milestone 251 — Contacts in the Codex ✅ (Sep 2026)
- [x] The office of anomalous incidents and the survey's board of ethics
      appear under CONTACTS with their letter counts

## Milestone 252 — The Other Council ✅ (Sep 2026)
- [x] A freeman in a system with a syndicate rock gets the other council's
      ask: look the other way (syndicate up, faction down), tell the patrol
      (the reverse, and a berth number painted wrong), or neither

## Milestone 253 — The Anniversary ✅ (Sep 2026)
- [x] Every hundred hours under way since commissioning the ship notes it at
      the clamp and turns the galley lights up (morale, a deed)

## Milestone 254 — A Capsule in a Decaying Orbit ✅ (Sep 2026)
- [x] A first astronaut from a world that has never met a ship: grapple and
      set them down (the rule broken, kindly), nudge the orbit unseen (the
      engineer's trick, the rule kept), or watch and record

## Milestone 255 — Ribbons ✅ (Sep 2026)
- [x] When a reception speech lands the harbourmaster pins a faction ribbon
      on, crooked; it stays aboard as a keepsake (deed at three)

## Milestone 256 — Number One at the Parley ✅ (Sep 2026)
- [x] With a Number One aboard the parley card carries their word at your
      shoulder: bluff, the bow shot, pay, or fight, by the odds and the hold

## Milestone 257 — The Ship, in Its Own Words ✅ (Sep 2026)
- [x] Once the ship has a name or a roster line, the chronicle carries a
      paragraph from it: wear, hails, the one it remembers, the plaque

## Milestone 258 — Doris ✅ (Sep 2026)
- [x] The engineer has names for the systems; put them on the board and the
      HUD warnings and the briefing use them (BIG RED (REACTOR CORE) 40%)

## Milestone 259 — A Message in a Bottle ✅ (Sep 2026)
- [x] An old captain's recorder on a dead survey pod: listen to all of it
      (data, a keepsake, a line), add your own entry and leave it, or log it

## Milestone 260 — The Handbook Catches Up ✅ (Sep 2026)
- [x] Handbook lines for naming finds, the counsellor, wakes, talent night,
      commissioning, the anniversary and ribbons

## Milestone 261 — With a Dog in It ✅ (Sep 2026)
- [x] Talk to a rock kid on a belt promenade and their mam writes later with
      a drawing of the ship (a keepsake, belt standing, a deed)

## Milestone 262 — Number One's Chair ✅ (Sep 2026)
- [x] When the captain retires, Number One is first in line for the ship

## Milestone 263 — The Galley Door II ✅ (Sep 2026)
- [x] Newsletter lines for the system names, ribbons, the anniversary, the
      cup, the cadet's column and the undock word

## Milestone 264 — The Long Ship ✅ (Sep 2026)
- [x] A generation ship in a cradle off a rock takes donations: parts, water,
      or an hour of the engineer; your name on a plate nobody reads for two
      centuries (belt standing, a keepsake, XP)

## Milestone 265 — The Envoy's Pen ✅ (Sep 2026)
- [x] After a treaty is signed the envoy writes: the pen (a keepsake) and a
      little money

## Milestone 266 — The Crew's Pick ✅ (Sep 2026)
- [x] A note on the console, signed by everyone: a port underlined twice;
      dock there next and morale and loyalty go up (the bar does the thing
      with the eggs)

## Milestone 267 — Still Warm ✅ (Sep 2026)
- [x] Some derelicts keep their recorder: E on the blinking box for the last
      entry (a log line, data, a keepsake, a deed); stable across re-entry

## Milestone 268 — The Rule, Tallied ✅ (Sep 2026)
- [x] First contacts kept and broken are counted and shown in the harbour
      view, with the board of ethics' opinion

## Milestone 269 — Help Lines ✅ (Sep 2026)
- [x] Help lines for card night, talent night, the wall of record and the
      pause menu's flight actions

## Milestone 270 — The Same Leave ✅ (Sep 2026)
- [x] Two crew who are close ask for the same leave at the clamp: grant it
      (loyalty, the bond), one at a time, or grant it with the ship's card

## Milestone 271 — A Third of Your Air ✅ (Sep 2026)
- [x] The cadet can come through a derelict's lock: less air, more skill,
      and a story they'll tell for years

## Milestone 272 — War-Zone Yellow ✅ (Sep 2026)
- [x] Arriving in a system where a syndicate war is on, tactical goes to
      yellow and says so

## Milestone 273 — Fleet Review ✅ (Sep 2026)
- [x] A galaxy event for naval stations: hulls in line abreast; captains with
      a rank take station at the end of the line (rep, a ribbon, an hour),
      dip the lights past, or go round to the clamp; tannoy lines

## Milestone 274 — Hails That Know the Week ✅ (Sep 2026)
- [x] Passing hails mention a drought, a fleet review, and the freeman's hull

## Milestone 275 — The Crew Photo ✅ (Sep 2026)
- [x] A photographer's skiff at the gate: forty credits, everybody on the
      bridge, a keepsake with every name in it

## Milestone 276 — Sickbay's Note ✅ (Sep 2026)
- [x] With a medic aboard the chronicle carries their paragraph: the cots,
      the lives on the count, patients landed, and whether the captain sleeps

## Milestone 277 — Sing Along ✅ (Sep 2026)
- [x] At the comms band aboard: sing along, badly; the crew come in wronger;
      the ship isn't recording this (morale, a deed)

## Milestone 278 — I'll Keep It ✅ (Sep 2026)
- [x] Hand the ship to Number One at retirement and they say so on the band;
      a log line and a deed

## Milestone 279 — Six Moods ✅ (Sep 2026)
- [x] With an undock word chosen, one talent-night act is the captain saying
      it in six moods, ending with "resigned"

## Milestone 280 — The Dock-Hand Has Noticed ✅ (Sep 2026)
- [x] Dock-hand lines about the plaque, the freeman's rate, the kid's
      drawing, the recorder, the marines, and what the reactor is called

## Milestone 281 — The Hundredth ✅ (Sep 2026)
- [x] At a hundred lives on the ship's count the medic turns the slate round:
      read it aloud (morale, loyalty, a keepsake) or ask for the hundred and
      first

## Milestone 282 — The Place ✅ (Sep 2026)
- [x] Board a wreck of your own where a crew member was lost and the crew go
      quiet in the lock: say the name and leave something (loyalty, a
      keepsake given up), or work the wreck the way they'd have wanted

## Milestone 283 — Number One Has the Ship ✅ (Sep 2026)
- [x] Pause menu: give Number One the ship for the leg; the HUD reads ACTING
      CAPTAIN, autopilot takes it, and they hand it back at the clamp with a
      word about the weather

## Milestone 284 — The Crew in the Handbook ✅ (Sep 2026)
- [x] A handbook section for everything the crew do now

## Milestone 285 — The Stardate Aboard ✅ (Sep 2026)
- [x] The interior header carries the ship's name and the stardate

## Milestone 286 — The Paper on Undock ✅ (Sep 2026)
- [x] Once the ship has a name or a roster line, a third of undocks it reads
      a line from the galley door on the band

## Milestone 287 — Codex Sweep ✅ (Sep 2026)
- [x] The long ship and the rock's council get codex entries

## Milestone 288 — Three Copies ✅ (Sep 2026)
- [x] The crew fill in the office's form in four hands with a diagram; sign
      it (data, a letter back: the office has pinned up the drawing) or burn
      it

## Milestone 289 — Letters to the Editor ✅ (Sep 2026)
- [x] Newsletter letters from crew by trait: the tap, the plant, the ration
      bars, the cards, the box, the laps

## Milestone 290 — The Minutes ✅ (Sep 2026)
- [x] After the council's vote the rock writes with the minutes; your name
      is in them

## Milestone 291 — Cleared by Rank ✅ (Sep 2026)
- [x] On a clean approach, control clears you by rank and bay, welcomes
      regulars back, and on a rock says hello to a freeman

## Milestone 292 — To the Churn ✅ (Sep 2026)
- [x] With a rock-born or spin-sick hand at the table, card night opens with
      a toast nobody explains

## Milestone 293 — The Medic's Word ✅ (Sep 2026)
- [x] The HUD's low-morale warning is the medic's line when a medic is aboard

## Milestone 294 — Once, for the Log ✅ (Sep 2026)
- [x] Number One objects to the captain landing, once per Number One, for
      the log; then "mind the step"

## Milestone 295 — The Hull With the Dent ✅ (Sep 2026)
- [x] The rock kid who drew your ship turns up at sixteen in a skiff and asks
      to sign on: a rock-born cadet at cadet rate, or not yet

## Milestone 296 — The Ship Notices II ✅ (Sep 2026)
- [x] Ship's-voice lines for the crew photo, the hundredth, the place,
      Number One's leg, the rock cadet's drawing and the fleet review

## Milestone 297 — The Second Sitting ✅ (Sep 2026)
- [x] What's New reads 0.56 to 0.200; the second sitting's notes under their
      own header

## Milestone 298 — A Hundred Deeds ✅ (Sep 2026)
- [x] A deed for a hundred deeds

## Milestone 299 — Number One's Note II ✅ (Sep 2026)
- [x] Number One's chronicle note mentions the leg they were given, the same
      leave, and the cadet

## Milestone 300 — Everyone Is a Cat ✅ (Sep 2026)
- [x] A seventh sim program the engineer wrote at three in the morning

## Milestone 301 — The Inspector Credits the Plaque ✅ (Sep 2026)
- [x] An engraved plaque and a ribbon count for the bare-deck check

## Milestone 302 — Ribbons and All ✅ (Sep 2026)
- [x] With three ribbons, the harbour greeting says so

## Milestone 303 — The Science Report ✅ (Sep 2026)
- [x] A science specialist reports at the briefing: unscanned signals,
      strange readings, finds on the chart under your name

## Milestone 304 — The Scaffold Watch ✅ (Sep 2026)
- [x] Once you've given to the long ship, its scaffold hails you on the rocks

## Milestone 305 — The Same Colour ✅ (Sep 2026)
- [x] The cadet vents the wrong tank: fix the labels (loyalty), a week on the
      scrubbers, or shout and apologise to the corridor

## Milestone 306 — The Bar's Book ✅ (Sep 2026)
- [x] A cadet's first docking: the crew buy the drink and make them sign the
      bar's book (morale, loyalty, a deed)

## Milestone 307 — The Promenade Talks II ✅ (Sep 2026)
- [x] Gossip about the long ship's plate, the end of the line, the hundredth
      and the cadet's first docking

## Milestone 308 — The Ship Notices III ✅ (Sep 2026)
- [x] Ship's-voice lines for the cat program, the valve labels, the science
      officer and the bar's book

## Milestone 309 — The Ready Room Knows the Ship ✅ (Sep 2026)
- [x] Number One's ready-room lines cover the cadet, a prisoner with no
      gunner, the ship's quiet leg, the cup, and the crew's pick

## Milestone 310 — The Rock's Tannoy II ✅ (Sep 2026)
- [x] Belt tannoy lines for the long ship, freeman's runs and the kids'
      drawings on the clamp wall

## Milestone 311 — The Crew Talk III ✅ (Sep 2026)
- [x] Chatter about the cat program, the valves, talent night and the bar's
      book

## Milestone 312 — The Belt Tank ✅ (Sep 2026)
- [x] The harbour view counts water sold to the belt

## Milestone 313 — Who's Aboard ✅ (Sep 2026)
- [x] The harbour view lists the cadet, a prisoner (guarded or not), Number
      One and the undock word

## Milestone 314 — The Ship's Voice Page ✅ (Sep 2026)
- [x] A handbook section for the ship's voice; What's New reads to 0.205

## Milestone 315 — The README's Second Sitting ✅ (Sep 2026)
- [x] A paragraph in the README for everything since the bridge

## Milestone 316 — Tests for the Second Sitting ✅ (Sep 2026)
- [x] Eight tests over the new pure functions: inquiries, transfers, the
      same leave, anniversaries, birthdays, droughts, reviews, the office,
      the newsletter, prisoners, the plaque, nicknames, briefings, the cats
      program, observation, emergency and freeman missions

## Milestone 317 — The Commissioning Line ✅ (Sep 2026)
- [x] The chronicle notes the commissioning stardate and hours under way

## Milestone 318 — The Ship's Review II ✅ (Sep 2026)
- [x] The ship's review of the captain adds a line for the quiet leg kept,
      the hundredth, the ribbons or the undock word

## Milestone 319 — Stardates in the Log ✅ (Sep 2026)
- [x] The RECORD log shows a stardate on every entry instead of minutes

## Milestone 320 — The Hull With the Dent ✅ (Sep 2026)
- [x] With the hull under three quarters, passing hails sometimes call the
      ship by its dent

## Milestone 321 — The Long Leg ✅ (Sep 2026)
- [x] Past six hours since the clamp, crew morale drains a point every ten
      minutes; the HUD reads LONG LEG; a log line the first time

## Milestone 322 — Naming the Rivets ✅ (Sep 2026)
- [x] Chatter for the long leg, the beach that wasn't a sim, and the dent

## Milestone 323 — The Dent, Ashore ✅ (Sep 2026)
- [x] The dock-hand offers to take the dent out (you'd lose the name); the
      promenade has heard

## Milestone 324 — Any Port ✅ (Sep 2026)
- [x] At eight hours since the clamp Number One asks for a port on the chart,
      once per leg

## Milestone 325 — The Counsellor on a Long Leg ✅ (Sep 2026)
- [x] The counsellor's hour also comes after eight hours under way

## Milestone 326 — When It Counts ✅ (Sep 2026)
- [x] A hot meal on a long leg is worth three more morale, and says so

## Milestone 327 — Round Trip ✅ (Sep 2026)
- [x] A test that everything the second sitting adds to the save survives a
      JSON round trip and every new function runs on the result

## Milestone 328 — The Third Sitting's Backlog ✅ (Sep 2026)
- [x] The roadmap's Trek/Expanse/Orville backlog rewritten for what's next

## Milestone 329 — The Ship's Hint ✅ (Sep 2026)
- [x] The ship says so on a long leg: not a complaint, a hint

## Milestone 330 — Standing Orders II ✅ (Sep 2026)
- [x] Two more orders in settings: Number One takes the leg at eight hours
      (off by default: they ask), and objects to landings once (on)

## Milestone 331 — On Its Way ✅ (Sep 2026)
- [x] Once you've given to the long ship, a galaxy event may see it leave
      its cradle: the last hail kept aboard, every plate gone with it, tannoy

## Milestone 332 — Seconds-in-Command ✅ (Sep 2026)
- [x] Your rival's Number One writes to yours, once: first round's theirs

## Milestone 333 — A Hearing ✅ (Sep 2026)
- [x] Naval stations hold a hearing for every first contact broken: let
      Number One speak (rep, loyalty), say you'd do it again (rep down here,
      the board writes), or pay the survey's fine (the crew notice)

## Milestone 334 — The Tithe ✅ (Sep 2026)
- [x] At a rock's harbour office, a unit of water for the tank: belt
      standing, a line in the book, a deed

## Milestone 335 — The Board Says Nothing ✅ (Sep 2026)
- [x] After "I'd do it again" the board of ethics writes to say nothing, with
      thirty data's worth of it

## Milestone 336 — The Ship on the Crew ✅ (Sep 2026)
- [x] S on the roster, once the ship is on it: the ship's line on every crew
      member (the cadet and the coaming, the medic who never asks)

## Milestone 337 — The Ship's Vote ✅ (Sep 2026)
- [x] At any other business the ship votes on the motion, by role

## Milestone 338 — Roster Help ✅ (Sep 2026)
- [x] A help line for V and S on the roster

## Milestone 339 — Who Comes Down? ✅ (Sep 2026)
- [x] Every fresh landing with fit crew asks who takes the seat beside you:
      an engineer makes the battery last, a science hand pays more per scan,
      a medic softens a bad landing, a gunner is company

## Milestone 340 — Away on the HUD ✅ (Sep 2026)
- [x] The surface header shows who's in the rover with you

## Milestone 341 — One Seat Beside You ✅ (Sep 2026)
- [x] At lift-off the away partner's loyalty and morale go up, with a log
      line and a deed

## Milestone 342 — Mam, Come and See ✅ (Sep 2026)
- [x] Run a rock's rings under par or for the record and the kids cheer on
      the band; belt standing; a deed

## Milestone 343 — The Ring Board ✅ (Sep 2026)
- [x] A rock's tannoy reads your best time; the kids have chalked it up

## Milestone 344 — Rings in the Handbook ✅ (Sep 2026)
- [x] A handbook line for racing at a rock

## Milestone 345 — Not Ours ✅ (Sep 2026)
- [x] The singers and the quiet ones teach a word per contact; the ship keeps
      them (deed "not ours")

## Milestone 346 — Words on the Wall ✅ (Sep 2026)
- [x] The wall of record lists the words learned; the chronicle keeps them

## Milestone 347 — The Ship Sings One ✅ (Sep 2026)
- [x] A ship's-voice line: it sings the first word to the gate, quietly

## Milestone 348 — The Gift Is a Chart ✅ (Sep 2026)
- [x] The singers' third gift points at a system two gates or more away

## Milestone 349 — Follow the Light ✅ (Sep 2026)
- [x] Research stations post orders to hold ninety seconds of quiet orbit
      over that system's first world

## Milestone 350 — The Roll-Call ✅ (Sep 2026)
- [x] The orbit ends in a meeting: hundreds of ships rising in a spiral;
      sing every word you know (a berth-token, rep with everyone, data) or
      listen (data, contact 4)

## Milestone 351 — The Lanes Heard ✅ (Sep 2026)
- [x] Gossip, hails, the dock-hand and the ship's voice on the singers' home

## Milestone 352 — Contacts in the Chronicle ✅ (Sep 2026)
- [x] The chronicle lists every contact with its count, and where the
      singers' chart points

## Milestone 353 — Follow the Light, in the Handbook ✅ (Sep 2026)
- [x] Handbook and help lines for the singers' chart and the survey's orders

## Milestone 354 — The Commission ✅ (Sep 2026)
- [x] Commodores and admirals leaving a naval station get a service cutter on
      their quarter: it shadows the ship and engages corsairs until the gate

## Milestone 355 — As Far as the Gate ✅ (Sep 2026)
- [x] The cutter peels off at the jump with a word

## Milestone 356 — The Commission in the Handbook ✅ (Sep 2026)
- [x] A handbook line under the bridge for the cutter

## Milestone 357 — The Name Taken Back ✅ (Sep 2026)
- [x] A freeman whose belt standing falls too far loses the name at the next
      clamp (a letter, the inners' yard rate); earn it back and the belt says
      twice is rarer (a deed)

## Milestone 358 — A Certificate of Compliance ✅ (Sep 2026)
- [x] Signing the office's form earns its first certificate, framed, aboard

## Milestone 359 — Standing in the Chronicle ✅ (Sep 2026)
- [x] The chronicle's Standing paragraph: rank by deeds, belt standing,
      ribbons, boards, hearings, prisoners, people carried out

## Milestone 360 — A Command of Their Own ✅ (Sep 2026)
- [x] At a naval station the service offers a long-serving, loyal Number One
      a cutter: send them (a friendly captain in the lanes who knows your
      hull, a letter, rep), ask them to stay plainly (loyalty), or leave it
      to them (a coin)

## Milestone 361 — Cadet No Longer ✅ (Sep 2026)
- [x] Cadets become crew proper at ten dockings: full wage, a skill, a deed

## Milestone 362 — Now Commanding ✅ (Sep 2026)
- [x] The chronicle's "served and went home" notes who commands their own
      ship now

## Milestone 363 — From Their Own Chair ✅ (Sep 2026)
- [x] Your old Number One hails from their own cutter when you pass: the
      port mount, the plaque, the spanner; the crew wave (a deed)

## Milestone 364 — The Lanes Know Their Name ✅ (Sep 2026)
- [x] Gossip and the ship's voice on the Number One who has a cutter now

## Milestone 365 — What They Learned From the Chair ✅ (Sep 2026)
- [x] Help them in the lanes and their letter says what the chair taught
      them

## Milestone 366 — Seconds in Command Only ✅ (Sep 2026)
- [x] Review week has a bar for Numbers One: send yours (loyalty, morale,
      one thing to report, a rivalry a degree warmer) or keep the schedule

## Milestone 367 — The Cadet's Mam ✅ (Sep 2026)
- [x] A cadet with a home port writes home after the first docking, and
      their mam writes to you

## Milestone 368 — The Galley Door III ✅ (Sep 2026)
- [x] Newsletter lines for the Number One who has a ship and the singers'
      home

## Milestone 369 — Tests for the Third Sitting ✅ (Sep 2026)
- [x] Command offers, words learned, and the singers' chart under test

## Milestone 370 — The Crew Page Catches Up ✅ (Sep 2026)
- [x] A handbook line for the command offer, cadets and the away partner

## Milestone 371 — Read to 0.224 ✅ (Sep 2026)
- [x] What's New and the README's second-sitting paragraph carry the night's
      later work

## Milestone 372 — The Cadet's Mam ✅ (Sep 2026)
- [x] At a cadet's home port their mam is on the promenade, with opinions
      about eating and the dent

## Milestone 373 — The Board on the Roll-Call ✅ (Sep 2026)
- [x] After the singers' home the board of ethics writes: no rule, a grant

## Milestone 374 — The Cutter Speaks ✅ (Sep 2026)
- [x] The service cutter calls a corsair on the scope and takes it

## Milestone 375 — Number One's Note III ✅ (Sep 2026)
- [x] The note mentions the chair they turned down and the seconds' bar

## Milestone 376 — A Crew Makes a Bridge ✅ (Sep 2026)
- [x] The first hire shows a hint for alerts, the briefing, the roster and
      the ready room

## Milestone 377 — Standing II ✅ (Sep 2026)
- [x] Standing counts landings with someone in the seat beside, and the
      freeman's name earned twice

## Milestone 187 — Requisition ✅ (Sep 2026)
- [x] At commander and up, naval stations sign for a full service once a
      week; Number One's conn goes in the supplemental log

## Later: Trek / Expanse / Orville (the third sitting)

Everything in the first list shipped (M139–M329). Next, in rough order of
value:

- The singers' home: a proper first-contact arc with a destination, a
  language you learn card by card, and an embassy berth at the end
- A naval commission: at commodore rank, a squadron of your own parked hulls
  with orders, and a fleet review where you're in the middle of the line
- The belt's own board of deeds: rock hopper races with the kids cheering,
  a tithe of water at every rock, a seat on the council you can lose
- A courtroom: a hearing at a naval station over a first contact broken,
  with Number One as your advocate and the board of ethics as witness
- Away missions with a chosen team: pick who goes down, and what they bring
  back (the surface scene with two crew sprites following the rover)
- A rival captain with a Number One of their own, met at receptions and
  reviews, who writes to yours
- The generation ship leaves: an event, a last hail from the scaffold, and
  your plate going with it
- Standing orders II: a settings page of orders for Number One (answer
  hails, take the leg at eight hours, keep the quiet leg)
- The ship's voice as a real crew line on the roster (mood, a review of
  every crew member, a vote at the briefing)

## Later
