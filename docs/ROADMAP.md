# FarSpace Roadmap

## Milestone 0 — Foundation ✅ (this session)
- [x] Repo, Vite + TypeScript, zero-dependency runtime
- [x] Pixel renderer: 480×270 internal, crisp integer upscale
- [x] Seeded RNG, bitmap pixel font, procedural sprite generation
- [x] Scene manager (galaxy / system-flight / station / ship interior)

## Milestone 1 — Vertical Slice ✅ (this session)
- [x] Procedural galaxy: named systems, factions, jump-point graph
- [x] System view: sun, orbiting planets, asteroid belts, stations, jump points
- [x] WSAD Newtonian flight with momentum, flip-and-burn assist
- [x] Combat: projectile weapons, pirate AI, hull/shield/system damage
- [x] Mining: asteroid ore → cargo hold
- [x] Docking + station services: trade, refuel, repair, missions, bar, news net
- [x] Jump gates with faction contraband scans
- [x] Walkable ship interior: panels for engines, life support, weapons, cargo;
      physical repairs consume spare parts
- [x] Missions: delivery, bounty, mining contracts
- [x] Save/load (localStorage), galaxy map with nav routes
- [x] Walkable station promenades: kiosks, wandering NPCs, airlock
- [x] Nav path system: plot a course on the galaxy map, radar guides you gate to gate
- [x] Defense platforms around stations, guarded gates, and controlled orbits
- [x] Station-aligned fighter wings; protected-space safe zones around civilization
- [x] Procedural WebAudio SFX (lasers, mining, docking, jumps, UI)
- [x] Flight radar: edge markers for stations, gates, and nearby hostiles
- [x] Mouse support in menus
- [x] Deployed to https://fsociety.work

## Milestone 2 — The Living Economy
- [ ] NPC trade ships actually flying supply lanes between stations
- [ ] Prices move with simulated supply/demand + events
- [ ] Piracy against real traffic; escort missions protect real ships
- [ ] Salvage fields, wreck interiors, data/biological cargo with legal heat
- [ ] Station storage, player warehouses
- [ ] Ship buying: multiple hulls (freighter, interceptor, prospector)

## Milestone 3 — Factions & Law
- [ ] Reputation per faction; warrants, bribes, clean-record fees
- [ ] Gate security escalation: scan → pursuit → shoot on sight
- [ ] Faction wars over territory shown on galaxy map
- [ ] Star bases (military stations): restricted docking, military missions
- [ ] News net reflects real sim events

## Milestone 4 — Crew & Interiors II
- [ ] Recruitable crew with skills (engineer, gunner, medic, pilot)
- [ ] Crew conversations, needs (food, sleep, morale)
- [ ] Passengers as cargo-with-opinions; VIP transport
- [ ] Bigger hulls with multi-room decks; fires, hull breaches, O2 sim per room
- [ ] Study/sleep/eat verbs with gameplay effects

## Milestone 5 — Planets
- [ ] Orbitable planet globe with territories, cities, resources, defenses
- [ ] Pin/target regions and POIs from orbit
- [ ] Orbital shell layer: satellites, defense platforms
- [ ] Landing at surface outposts; research outposts
- [ ] Planet scanning/exploration gameplay

## Milestone 6 — The Real Galaxy
- [ ] Galaxy map driven by real star catalog data (Gaia/NASA) for local ~100 ly
- [ ] Nav-path planning with fuel range constraints
- [ ] Deep scanning; discoverable anomalies
- [ ] Endgame faction narrative arcs

## Tech debt / stretch
- [ ] Gamepad support, touch controls
- [ ] Audio: procedural SFX + ambient soundtrack
- [ ] Cloud saves (Workers KV)
- [ ] Performance: spatial hashing for entities, offscreen culling
