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
- [x] Deployed to https://fsociety.work

## Milestone 2 — Worth a Second Session
**Goal:** a new player finds the core loop in 5 minutes, has a reason to come
back tomorrow, and can play on a phone.

- [ ] Ship hulls: prospector (big mining yield, weak), freighter (cargo, slow),
      interceptor (fast, thin). Buy/sell at shipyards; hull determines interior deck.
- [ ] Dynamic prices: station stock drifts toward its economy-type demand each
      cycle; player trades move the local price; events (from M3 news) spike it.
- [ ] Traders carry real cargo drawn from their origin station's exports;
      destroying one drops it. Pirates loot traders, not thin air.
- [ ] Save schema `version` field + migration functions. Old saves never break.
- [ ] First-run guidance: contextual hints for first dock, first jump, first
      repair, first mission. Dismissable, saved.
- [ ] Touch controls: virtual stick, fire/mine/interact buttons, tap-to-select
      in menus. Playable on a phone in portrait or landscape.
- [ ] Balance pass: mission rewards vs. upgrade costs so a session of ~45 min
      reaches the first hull purchase.

**Done when:** a first-time player on a phone can dock, trade, take a mission,
complete it, and buy a hull upgrade without reading the README.

## Milestone 3 — Living Economy & Law
**Goal:** the galaxy visibly reacts to what the player does.

- [ ] Per-faction reputation (−100..100). Gates prices, docking rights, mission
      tiers, and gate-scan severity. Bribes and clean-record fees at non-military
      stations.
- [ ] Gate security ladder: routine scan → pursuit + fine → shoot on sight,
      keyed to reputation and warrant level.
- [ ] Supply lanes: traders run scheduled routes between stations with cargo;
      escort missions protect that traffic; piracy targets it.
- [ ] Salvage fields with wreck interiors (walkable, hazardous); data cores and
      bio samples as high-value, high-heat cargo.
- [ ] Star bases: restricted docking by reputation; military mission tier.
- [ ] News net generated from real sim events (price spikes, piracy, seizures,
      faction skirmishes) instead of templates.
- [ ] Station storage: player warehouses for staging trade runs.

**Done when:** a player can be locked out of a faction's space by their own
actions and buy their way back in, and the news reports what they did.

## Milestone 4 — Crew & Interiors II
**Goal:** the ship interior is a place people spend time in, not a repair menu.

- [ ] Recruitable crew from bars: engineer (repair speed), gunner (turret),
      pilot (handling), medic. Wages.
- [ ] Crew conversations with state (morale, opinion of the player); food and
      sleep needs with gameplay effects.
- [ ] Passengers as cargo-with-opinions: VIP transport, refugees, fugitives.
- [ ] Multi-room hulls: fires spread, hull breaches vent, O2 simulated per room.
- [ ] Study (skill progression), sleep (time skip), eat (buffs) with effects.

**Done when:** losing a crew member in a fight feels like a loss.

## Milestone 5 — Planets
**Goal:** fill the zoom continuum's missing layer.

- [ ] Orbitable planet globe (rendered sphere with procedural surface) with
      territories, cities, resources, defenses.
- [ ] Pin/target regions and POIs from orbit; orbital shell layer with
      satellites and platforms.
- [ ] Landing at surface outposts: research posts, mining camps, colony hubs
      with their own walkable interiors and services.
- [ ] Planet scanning/exploration: survey missions, discoverable sites.

**Done when:** a player can zoom from galaxy → system → orbit → surface
outpost → its bar, and back, without a loading screen.

## Milestone 6 — The Real Galaxy
**Goal:** the map is the actual neighbourhood of the Sun.

- [ ] Galaxy map from Gaia/NASA catalog data for the local ~100 ly; real star
      names, types, and positions drive sun color/size.
- [ ] Nav-path planning with fuel-range constraints and refuel stops.
- [ ] Deep scanning; discoverable anomalies and derelicts.
- [ ] Endgame faction narrative arcs.

## Engineering track (runs alongside M2)
- [ ] Split `src/scenes/flight.ts` (1,142 lines) into `entities/`, `ai/`,
      `render/` modules before M2 features land on it.
- [ ] Tests: world-gen determinism per seed, `navRoute`, cargo/economy math,
      save migrations.
- [ ] GitHub Actions: typecheck + build on push; deploy to Cloudflare on main.
- [ ] bigbox: the `chris` account is currently unavailable (Sept 2026). Either
      restore it and enable the tunnel, or retire that path from DEPLOY.md.
- [ ] Bitmap font: redraw M/W glyphs; consider a 5-wide font for readability.
- [ ] Performance: spatial hash for bullets/NPCs once entity counts grow.
- [ ] Cloud saves (Workers KV) once the save schema is versioned.
- [ ] Gamepad support.
- [ ] Ambient soundtrack (procedural pads per faction space).
