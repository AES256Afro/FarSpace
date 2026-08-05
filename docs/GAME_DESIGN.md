# FarSpace — Game Design Document

> A pixel-art space sim about scale. One continuous universe you can zoom through:
> galaxy → star system → planet → orbital station → the corridors of your own ship.

## Vision

FarSpace blends the strategic map layer of a 4X (Civ-style territories, resources,
supply lines, trade) with a lived-in, physical space sim (Battlestar Galactica meets
The Expanse). Ships are not health bars — they are places. The player can fly a dogfight,
then walk to the engine room and patch the coolant line that got shot out mid-fight.

## The Zoom Continuum

The core structural idea: every layer of the game is one camera away from the next.

1. **Planet surface / globe** — orbitable globe with territories, resources, cities,
   defenses, supply lines, research outposts. Pin and target regions or Points of
   Interest (POIs).
2. **Orbital shell** — satellites, defense platforms, orbital infrastructure.
3. **Star system** — sun, planets, moons, asteroid belts, mining ops, supply lanes,
   defense points, jump points, star bases, space stations. This is also the flight
   layer: top-down WSAD momentum flight with real inertia.
4. **Galaxy map** — star systems, faction territories, nav-path planning. Long-term
   goal: match real NASA/Gaia star data to the galaxy map.
5. **Interiors** — zoom into a station to dock and walk its decks; zoom into your own
   ship to walk the corridors.

## Flight Model

- Top-down, WSAD thrust, momentum-conserving (Newtonian). You drift; flip-and-burn to
  decelerate. Inertial dampers can be toggled for arcade-ish assist.
- Combat is positional: manage velocity vectors, not just aim.
- Zoom out mid-flight to the system map to set nav paths; zoom in to fight or dock.

## Ships Are Places

Every ship has an interior deck the player can walk (WSAD) and interact with:

- **Systems as physical panels**: reactor, engines, air scrubbers, O2, comms, weapons,
  fuel lines, operating fluids. Damage in combat maps to specific panels that must be
  physically repaired with tools and spare parts.
- **Consumables**: food, water, oxygen, provisions, fuel, spares, personal items.
- **Crew and passengers**: converse, assign, manage morale; passengers from missions.
- **Player verbs inside**: repair, upgrade, study, sleep, eat, converse.
- Switch seamlessly: external (fly/shoot) ↔ internal (repair/manage/roleplay).

## Stations & Star Bases

Stations are the social/economic hubs. Star bases are the military variant — bigger,
better armed, tighter security, same core services.

Services:
- **Docking control** — request clearance, pay fees, ship stored safely.
- **Trade** — commodity market with per-station prices driven by local supply/demand;
  trade routes emerge from price differentials.
- **Shipyard** — repair, refuel, upgrades, buy/sell ships.
- **Mission board** — delivery ("take this to X"), trade runs, bounty/pirate hunting,
  mining contracts, research missions, faction missions, salvage claims. Special finds:
  sensitive data caches, biological samples — high pay, high heat.
- **Bar / lounge** — rumors, contacts, secure meetings, recruitable crew.
- **News net** — procedurally generated galactic news reflecting actual world-sim
  events (wars, price spikes, pirate activity, discoveries).
- **People** — visitors, employees, engineers, security personnel, military (mix
  depends on station ownership, system, and region).
- **Security** — scans on docking; contraband and warrants matter.

## Factions, Law & Territory

- Regions of the galaxy are controlled by factions; jump points are guarded by the
  controlling faction (or contractors/pirates where control has slipped).
- Passing a gate normally means a routine contraband scan — unless you carry a warrant
  with the gate's allied forces, in which case things escalate.
- Reputation per faction gates missions, prices, docking rights, and how much heat a
  scan brings.

## Economy

- Commodities with per-station supply/demand and prices; stations produce and consume
  based on type (mining, agri, refinery, research, military).
- Mining: asteroid belts have ore types; mining lasers fill cargo; refineries buy.
- Salvage: wrecks drop cargo, data cores, biological material.
- Supply lanes between stations are real ships NPCs fly — piracy and escort missions
  operate on actual traffic.

## Long-Term Systems (post-slice)

- Planetary landing: globe view with territories, cities, ground POIs.
- Deep scanning, planet survey/exploration gameplay.
- Fleet management, carriers, capital ships with multi-room interiors.
- Real star catalog (Gaia/NASA data) for the galaxy map.
- Multiplayer-lite: shared universe events.

## Art Direction

- Beautiful chunky pixel art. Internal render at 480×270, integer-upscaled, crisp.
- All sprites procedurally generated with seeded RNG — every ship, planet, station,
  and portrait is unique but consistent per seed.
- Palette: deep-space blues/blacks, neon signal colors for UI, warm interior tones.

## Controls (current slice)

| Context | Keys |
|---|---|
| Flight | W/S thrust, A/D rotate, Space fire, M mining laser, X flip-and-burn assist, E dock/jump/interact, Tab system map, G galaxy map, I board own ship |
| Interior | WASD walk, E interact |
| Station | Arrows/mouse navigate tabs, E/Enter select, Esc undock |
| Global | F5 save, F9 load, Esc back |
