# FarSpace handoff, September 11, 2026

## Active work window

The user authorized nine hours on all remaining milestones, with quest location
visibility first. Start: 2026-09-12 02:31:03 UTC. Deadline: 2026-09-12 11:31:03
UTC, or 06:31:03 America/Chicago. The task continuation uses the existing id
farspace-six-hour-development, renamed FarSpace nine hour milestones, and is
active every ten minutes. Read WORKLOG-2026-09-12.md on each continuation.
At the deadline, stop new implementation, finish a safe checkpoint and pause.
M418 through M427 and M433 through M435 remain open in NEXT-MILESTONES.md.

## Current implementation: v0.263.0, M418 first slice

- Roster uses a small ListView model keyed by live CrewMember identity. It
  shows eight rows and a separate scrollable record. Pointer rows only select;
  Bonus, Review and Course buttons perform the existing domain actions.
  Bonuses autosave. Crew on leave remain readable with aboard actions blocked.
- Selection survives insertions, removal of earlier entries and review return.
  If the selected person disappears, use the old index or the last remaining
  person. A replaced world resets selection. Details retain their position.
- Chronicle and What's new now extend ReaderScene. Complete text and release
  history remain present. Search includes whole sections; long headings and
  names wrap. Explicit Back replaces accidental closure on body clicks.
- First Escape cancels a populated search input immediately. External scene
  changes remove a pending dialog. Returning to flight sets resumeNext.
  The local system list pages seven rows to match its actual visible count.
- 603 tests in 40 files pass. TypeScript and production build pass. Native
  fixtures verified empty and long rosters, detail paging, wheel selection,
  page movement, leave restrictions, exact bonus recipient after insertion,
  review return, reader body clicks, the last Chronicle entry, historical
  notes, search submission and one Escape cancellation. No browser errors.
- All fixture storage writes stayed in memory and online calls were disabled.
  No actual save, identity or cloud state changed. Physical touch and gamepad
  checks remain for M426. Save schema remains 16.
- M418 is still open. Continue MENU-INVENTORY.md with orbit, letters and all
  objectives at shared local contacts, then station and other location menus.
  The nine hour window and deadline above remain unchanged.
- Publication verification will be added after release workflows complete.

## Previous checkpoint: v0.262.0, M436

- Quest destinations come from a shared read-only projection of active
  contracts, stories, crew journeys, service orders and council journeys.
  Markers follow survey, discovery, delivery and return stages. Unaccepted
  and completed contracts do not appear. Quest viewing does not mutate saves.
- Galaxy and system maps add diamond markers, Q labels and a Q quest filter.
  Galaxy details list complete quest instructions before general information.
  Local quest contacts sort first and show the next action beside the target.
  Green diamonds identify contracts that can be handed in.
- Hidden signals stay system search areas until scanned. Explicit quest wrecks
  remain visible beyond ordinary scanner range, without revealing other wrecks.
  Flight adds local quest markers; orbit marks exact quest sites. Q selects
  the site, turns it into view and holds that view until manual selection.
- The browser exposed a station moving out of reach after an automatic stop.
  Local station targets now stop within 40 metres, leaving interaction margin.
  The production approach stopped at 33.29 metres, zero velocity, and E began
  docking. Another fixture used Q to select the exact ruin and E to land there.
- 587 tests in 37 files pass. TypeScript and build pass. Browser checks covered
  both map filters, full galaxy objective details, local Fly there, docking
  and the orbital quest site. Fixtures used memory storage with online calls
  disabled. No actual save or identity changed. No browser warnings or errors.
- Published as ba9be5364c43eb14b1204423bae4712919c4b135, tag v0.262.0.
  CI 34668649526 passed, including the actual Cloudflare deployment step.
  Container run 34668649569 passed. Hosted assets match the tested build,
  health returned ok, and a fresh public tab showed v0.262.0 without errors.
- Save schema remains 16; quest locations add no persistent state. Assets:
  index-DnR_t85b.js and index-CwZdn5Vi.css. Dev5199 was restarted at v0.262.0.
  Temporary tabs and preview5198 are closed. Bigbox and its catalog PR are
  unchanged. The nine hour continuation is ACTIVE, with the deadline above.
- M418 has a source inventory in MENU-INVENTORY.md. First work: stable roster
  selection and a bounded viewport, then Chronicle and What's new readers.
  Roster currently draws all cards without scrolling. Chronicle closes on
  any mouse click. Do not mark M418 complete until its inventory is accepted.

## Previous checkpoint: v0.261.0

The user requested clearer material uses, better mining, crafting, research,
production automation and map travel that starts and stops automatically.

- F2 opens the Workshop from flight, stations or salvage. The station also
  has a pointer control. Materials & loot shows each material's source, uses,
  current stock and separate capacity. Craft, Research tree, Production and
  Ship upgrades share a scrollable HTML interface with preserved focus.
- Fourteen recipes consume minerals and cargo for parts, metals, fuel, data,
  medical supplies, ammunition and mining fittings. Basic recipes work from
  the start. Inputs are spent with output settlement; capacity or shortages
  retain unfinished work. Mining equipment requires docking before fitting.
- Fabrication opens Metallurgy, Field supplies and Production control.
  Further research unlocks Mining systems, Material storage and Reactor
  chemistry. Storage rises from 60 to 120 of each material. Production control
  allows five queued jobs with up to twenty batches each. Work pauses on
  title, maps and pause screens; there is no offline production.
- Mining shows its actual target, range and extraction progress. Prospectors
  reveal deterministic mineral yields. Laser and core deposits retain cargo
  and material overflow on the asteroid, including across saves. A full hold
  pauses drilling. Collectors recover nearby deposits; refineries convert one
  ore from each ordinary or rich rock into a refined metal.
- Both maps offer Fly there or A. Local travel stops inside interaction range;
  galaxy travel follows gates through intermediate systems and stops after
  the last jump. Manual controls or N cancel. Fuel and tow checks give a
  reason when travel cannot start. Docking, landing and boarding still use E.
- Save schema 16 validates research and production. Schema 15 saves migrate
  without changing existing materials or cargo. New optional asteroid state
  records partial extraction and remaining stock. Older clients reject v16.
- 571 tests in 36 files pass. TypeScript and production build pass. Native
  browser checks completed research, five batches, mining, local arrival and
  a galaxy gate approach. The local ship stopped 24.09 metres from a wreck
  with zero velocity. At 390px width the final research node was reachable
  without horizontal overflow. Browser warnings and errors: none.
- Fixtures used memory storage and disabled online requests. Actual saves,
  callsign, cloud codes and the user's public tab were not changed. Physical
  touch and gamepad checks remain unperformed.
- M428 through M432 are implemented and locally verified. M418 through M427
  remain open; M433 through M435 cover mining orders, cargo logistics and
  experimental technology. See NEXT-MILESTONES.md for order and acceptance.
- Published as `f8f82f8ea2b15862fbcd835907e2cd2a7ef36dc8`, tag `v0.261.0`.
  CI `34666198457` passed, including the actual Cloudflare deployment step.
  Container run `34666198353` passed. A fresh hosted tab showed v0.261.0
  with no warnings or errors. Health returned ok and live JS/CSS hashes
  match the tested build. See the work log for exact asset hashes.
- Assets: index-B0OQn4Xt.js and index-CwZdn5Vi.css. Dev5199 now runs v0.261.0.
  Temporary browser fixtures and production preview 5198 are closed. Bigbox
  and the BoxPilot catalog PR remain unchanged.

## Previous checkpoint: v0.260.0

The user requested a chance to disable combat ships and either salvage their
parts or recover the hull for keeping or selling.

- An eligible ship has a 35 percent chance to survive a finishing player gun
  hit as a disabled hull; torpedoes have a 10 percent chance. Story targets,
  escorts, drones, other pilots and ships already disabled retain their rules.
  Disabling does not grant a kill, bounty progress or a second cargo drop.
  Attacking civilians or patrols still has law and reputation consequences.
- The disabled hull persists as a wreck with a generated boarding deck. Board,
  evacuate the survivor, restore emergency power and seal breaches. Then use
  Recover the hull in the salvage panel. Cargo can be recovered before towing.
- Recovery allows one tow, reduces top speed to 55 percent, and blocks cruise
  and jumps. E at the hull can detach the line. A separation over 420 metres
  snaps it; the hull remains on the map. Docking brings it into the local fleet
  once, at 20 percent hull condition. Remaining contents go with it to the yard.
- The Ships tab supports Enter to board the recovered hull or X to sell it.
  Offers use 45 percent of the catalogue value, scaled by hull condition with
  a 20 percent condition floor and a 150 credit minimum. Previously the floor
  was 50 percent. The displayed quote and sale use the same calculation.
- Starting an exterior cut requires a second selection to confirm that whole
  hull recovery will be lost. Only actual paid work commits this choice;
  a full hold does not. Cutting and recovering cannot pay for the same hull.
- Save schema 15 preserves the hull, work and tow. Schema 14 voyages migrate
  without changing existing cargo, fleets or wrecks. Older clients reject
  schema 15 so they cannot lose recovery ownership during later saves.
- 536 tests pass, including 26 combat and recovery cases. TypeScript and the
  production build pass. Browser checks completed a finishing shot, boarding,
  power restoration, rescue, towing, docking and a single 522 credit sale.
  The production build also completed recovery through the docking animation.
  Fixtures used memory storage and disabled online requests. Physical touch
  and gamepad checks remain unperformed.
- Published as `d7a4ea3696832fa382f9bf723ce2d03806ac7939`, tag `v0.260.0`.
  CI `34659401991` passed, including the actual Cloudflare deploy step.
  Container run `34659402122` passed. The hosted title displays v0.260.0;
  live JS and CSS hashes match the tested build and health returned ok.
- JavaScript: `index-D8tVguXP.js`. CSS: `index-DLwGHPCy.css`. The work log
  records hashes and browser evidence. Dev5199 runs v0.260.0. Temporary
  fixtures and preview 5198 are closed. The release manifest targets 0.260.0.
  Bigbox and the BoxPilot catalog PR are unchanged.

## Previous checkpoint: v0.259.0

The user requested salvage features for wrecks. This release adds finite
exterior salvage alongside the existing generated boarding interiors.

- E near an ordinary wreck or a derelict signal opens a salvage panel. B or
  the first row boards it. Leaving the deck returns to the panel; Esc from
  the panel resumes the same flight population and jobs.
- Drive assemblies yield spare parts, hull plating yields refined metals,
  control circuits yield germanium, and reactor shielding yields nickel,
  carbon or vanadium. Stocks vary deterministically by wreck and world seed.
- Each unit takes four seconds and 0.5 fuel. An available engineer reduces
  the time to 2.8 seconds. Select a section and Enter or click to cut or pause.
  Cutting continues until paused, that section is stripped, storage is full,
  or fuel is exhausted. Paid partial work remains on the wreck.
- Cargo and material capacity are checked before spending fuel. Survivors
  must be rescued first. Existing salvage claims cover exterior stock too.
  Occupied arks cannot be stripped. Old cleared wrecks do not gain stock.
- `WreckDef.looted` still means the interior is recovered for story checks.
  Flight, radar and maps use `wreckAvailable` to retain a contact while any
  exterior stock remains. Wreck salvage state survives schema 14 saves.
- 510 tests pass, including 16 salvage cases. TypeScript and build pass.
  Browser checks used temporary voyages with storage intercepted in memory
  and online requests disabled. No actual saves or identity settings changed.
  Physical touch and gamepad checks remain unperformed.
- Published as `fcb029292df2842f3d6049b5c01bd231e22c7086`, tag `v0.259.0`.
  CI `34657574910` passed, including Cloudflare deployment. Container run
  `34657574848` passed. The hosted title displays v0.259.0; live JS and CSS
  hashes match the tested build. The health endpoint returned ok.
- JavaScript: `index-CFCvbOmC.js`. CSS: `index-DLwGHPCy.css`. The work log
  records hashes and browser evidence. Dev5199 runs v0.259.0; temporary
  fixtures and the production preview on 5198 are closed. Bigbox and the
  BoxPilot catalog PR were not changed.

## Previous checkpoint: v0.258.0

The user requested more wreck and derelict actions, generated repair interiors,
and improvements to both maps. This follow-up is implemented in v0.258.0.
The remaining M418-M427 plan is still open; this release covers portions of
map navigation and boarding work, not those entire milestones.

- Both maps use bounded viewports, zoom, pan and labels placed without overlap.
  Galaxy selection and plotting are separate. F searches names. Details scroll
  independently. N plots a course, B bookmarks, Home fits the chart.
- The system map lists and filters contacts. N sets a local destination; close
  the map and press N to engage autopilot. Local destinations use live object
  positions and interaction ranges. Missing targets stop autopilot.
- Ship repair jobs and derelicts use seeded decks with six connected rooms.
  Room sizes, doors, room assignments and airlock side vary. All required work
  remains reachable. A repaired ship retains its layout seed for later faults.
- Wreck work includes emergency power, breach sealing, fuel recovery, recorders,
  cargo and occasional survivor rescue. Power must be restored before opening
  a cryo pod. Sealing a breach consumes one part. Derelict signals produce
  boardable ships instead of loose cargo alone.
- Wreck progress and station tender panel progress survive saves. NPC repair
  progress lasts with that live ship during the current system visit; NPCs are
  still rebuilt on load or a real system entry. Save schema remains 14.
- 494 tests pass. TypeScript and production build pass. Connectivity checks
  cover 300 repair decks and 150 wreck decks with crates left in place.
- Browser checks used isolated in-memory voyages. A repair walk restored all
  three systems in 19.657 real seconds and returned to the same live freighter.
  A production-build wreck walk restored power, evacuated a survivor, recovered
  fuel, both crates and a recorder, and sealed both breaches. Progress survived
  a JSON save round trip. No real player saves or identity settings were written.
- Release commit/tag: `e87a7da543d88c6b12c3f54d06105a0e724eff41`, `v0.258.0`.
  CI `34656222577` and container workflow `34656222168` passed. The public
  title displays v0.258.0; the live JS and CSS hashes match the tested build.
- Current JavaScript: `index-Du38lKfO.js`. CSS: `index-DLwGHPCy.css`.
  Release deployment evidence is recorded in the September 11 work log.
  Dev5199 was restarted for v0.258.0. Temporary fixtures are closed.
- Bigbox remains a separate installation. This task does not update its running
  container. The FarSpace release manifest targets 0.258.0.

## Previous checkpoint: v0.257.1

- Release: **v0.257.1**, milestones through **M417**. M416 and M417 shipped
  together; the patch also repairs cloud-code generation.
- Release commit/tag: `28bb0ef4f40a9d5d369fa014ac28f97cb1f376bf`, `v0.257.1`.
  Documentation checkpoints may advance `main` beyond that release commit.
- Repository: `https://github.com/AES256Afro/FarSpace`.
- Local workspace: `/Users/chris/Projects/FarSpace`.
- Tests: **473 passing**. TypeScript and production build passed.
- JavaScript: `index-CnOESIfc.js`, 1242.31 kB raw / 438.78 kB gzip,
  SHA-256 `1aab1fd10f95a2813d711dd1f7bc9a2fe210ca87644dc8b23a8c8c7f0d4a7704`.
- CSS: `index-DLwGHPCy.css`, 3.68 kB raw / 1.29 kB gzip,
  SHA-256 `24cedb831f94187ee7d3f4b1266b1d7e5d61324f770628c19e261646023bb73f`.
  The existing Vite bundle-size notice remains.
- Hosted CI `34649585007` passed, including the actual Cloudflare deploy step.
  Container workflow `34649584851` passed for v0.257.1.
- Live site: <https://farspace.fsociety.work>. Hosted HTML references those
  assets; both hashes match the tested build. `/api/health` returned ok.
  Native browser verification displayed v0.257.1 and changed title scenes
  without console errors.
- BoxPilot PR259 now targets 0.257.1 at
  `8879c0ab68aca73ccd31a49b7614ca26b8a85375`. Local `npm run check` passed,
  including 1,632 tests. Catalog image run `34649742916` resolved FarSpace
  0.257.1 with HTTP 200 and failed on the unchanged
  `minio/minio:RELEASE.2025-09-07T16-13-09Z` with HTTP 401. Keep the PR open
  until registry resolution passes for its exact head. Remote BoxPilot main
  still references 0.254.0. Bigbox was not restarted or redeployed.
- Save schema remains **14**. Local, cloud and imported saves share required
  playable-shape validation, including the Tern service cutter. Future
  schemas are rejected; version-zero migration is covered.
- Dev preview: <http://127.0.0.1:5199>, restarted at 0.257.1. Temporary
  production servers on 5197/5198 are stopped. All synthetic browser fixtures
  are closed. Preserved builds and logs: `/private/tmp/farspace-title-20260911`.

## Approved plan and next implementation

The user approved [M416-M427](NEXT-MILESTONES.md) after choosing random
selection between the orbital, station and bridge-window title concepts.
M416 and M417 are complete. Continue with M418's shared menu selection and
viewport rules, then M419's HUD priorities and M420's contact intent/actions.
M421-M427 remain planned. Do not report the entire plan as shipped.

- The title uses scene-owned HTML controls over bounded pixel artwork. It
  selects each scene once per cycle without consecutive repeats, preserves
  view/page/focus/scroll through child menus, and honors reduced motion.
- Native checks cover the three views, Settings return, 320x568 scrolling,
  doubled menu text, long names and form key ownership. A frozen title build
  ran 1203.133 real seconds with unchanged world JSON and saved bytes, zero
  save writes, unchanged entity/cache counts and no scene rotation.
- Save previews, slot choice and loading are separate. Copy/import/clear/start
  over keep one recovery copy per affected slot. Restore swaps the bytes;
  export can retain damaged originals. Cloud codes stay with their slots.
- A failed cloud lookup offers local continuation. Slot changes and changed
  local bytes invalidate open replacement choices. Failed persistence keeps
  the previous save and active world. Save and quit stays paused on failure.
- Native synthetic checks covered copying, recovery, cloud fallback, normal
  flight return and quota failure. Test save/identity writes were captured
  only in memory. Physical touch, physical gamepad and screen-reader operation
  have not been exercised; M426 retains that device matrix.

The authorized work window was 12:34:39 to 18:34:39 UTC on September 11
(07:34:39 to 13:34:39 CDT). The continuation automation is
`farspace-six-hour-development`, attached to task
`01a08fcd-5c4c-7161-85da-481557fa6a42`. It is paused. M413 (station scrolling),
M414 (ship appearance and heading), and M415 (settings scrolling) are separate
user-requested follow-ups.

The detailed release and native-test evidence is in
[the September 11 work log](WORKLOG-2026-09-11.md). Earlier handoff content is
available in Git history at `4aa3cff:docs/HANDOFF.md`.

## User's attack-on-sight request

M405 and M406 implement two separate ways to end pursuit.

- Law: break contact for **60 flight seconds**. Keep 900m from patrols and
  fighters, and 500m from hostile law platforms on a severe warrant. The HUD
  shows contact or the remaining countdown. An offence or renewed contact
  resets progress. Free cooling preserves reputation, closes existing cases,
  and reopens civilian docking. That closed record does not restart pursuit
  by itself. Military access can still depend on standing.
- Immediate settlement: **U in flight**, or Traffic control in the pause menu,
  presents the current quote. Payment closes cases, stops law fire, and
  restores affected faction standings to neutral or better. It is reachable
  from space when docking is refused. Insufficient credits do not pay.
- Pirates: **E within 260m** opens parley. Payment is **120cr per nearby
  corsair**; a successful bluff, warning or reputation appeal also works.
  Successful parley grants **180 flight seconds of safe passage in that
  system**. Replacement pirates and Veil platforms respect it, as do your
  automatic gunner and escorts. A manual hit on a corsair breaks the temporary
  agreement. Flight elsewhere consumes time; menus and docking do not.
- Both mechanisms persist through saves. Law payment does not buy pirate
  passage. Veil standing of 40 also keeps pirates peaceful.

Source: `src/core/law.ts`, `src/core/piracy.ts`, and
`src/scenes/flight/{index,ai,combat,render}.ts`. Regression suites:
`tests/law-cooldown.test.ts` and `tests/pirate-passage.test.ts`. The work log
records full unaccelerated 60-second and 180-second native tests, payment,
insufficient funds, save migration, replacement ships and manual truce break.
The final v0.252.0 bundle also passed a paid-settlement and natural-cooldown
integration check: 60.018 flight seconds to close pursuit, with a story scene
pausing the timer, unchanged credits and retained -85 standing.

## Work completed in this window

Twenty incremental releases, v0.233.0 through v0.252.0:

| Milestones | Result |
| --- | --- |
| M393 | Two-person ground teams, visible companions and combined role benefits. |
| M394-M395 | Dockable singers' home, light economy, passenger journey and guestbook. |
| M396 | Flight contacts and rescue state survive temporary scenes; changed worlds rebuild them. |
| M397 | An old shipmate's final journey, chosen retirement port and complete letters. |
| M398 | Belt council votes, representation journey and physical council room. |
| M399 | Ship-specific simulation with saved choices and once-per-leg crew rewards. |
| M400-M402 | Voluntary service career, assignments and reports, borrowed cutter, explicit choice between orders and booked fares. |
| M403-M404 | Docking settles once per actual arrival; purchased fittings survive hull transfers and loans. |
| M405-M406 | Free law cooldown, paid settlement and pirate safe passage. |
| M407 | Complete fleet list, selected charter release, exact remote-ship liner travel and shipyard pointer repair. |
| M408 | Searchable Controls and Handbook, full scrolling and section navigation. |
| M409 | Crew arrival dialogue finishes before a pending port audience; no duplicate docking settlement. |
| M410 | Complete current service orders and every retained report. |
| M411 | Complete warehouse list with stable selection and one-unit transfers. |
| M412 | Complete mission board and searchable mission log; singer fares cannot be handed in at human stations. |

M397 also changed the Docker build stage to run Node on the build platform.
The earlier arm64-emulated Node build crashed with an illegal instruction;
subsequent multi-platform image workflows passed. The original fourth-sitting
backlog, M387-M402, is complete. Reconcile new ideas against the existing
roadmap before adding more overlapping milestones.

## M413 follow-up: station scrolling

The user reported shipyard and market scrolling returning to the top. Native
wheel events with one-pixel pointer drift reproduced the reset. Station rows
now select by click; pointer motion cannot overwrite wheel or keyboard
selection. The marketplace also uses a twelve-row viewport for all goods,
including carried rares. Its range count and information remain below the
list, outside trade hit areas.

Seven new tests cover pointer drift during and after scrolling, keyboard
selection, every market row, the exact scrolled trade and inert information
clicks. The native production preview reached all 37 shipyard entries and all
26 market goods, bought the final shield upgrade, and sold only the selected
Thal Root. No console errors. This follow-up adds no save state.

## M414 follow-up: ships and heading

Each of the eight hulls now has a defined profile, forward canopy and rear
engine bank, with class-appropriate plates and paint. The design generator
is shared by player, other pilots, NPC classes and shipyard previews.

A solid white chevron marks the nose, independent of turret aim. A hollow
amber diamond marks actual drift; below 2 m/s it is hidden. HUD bearings use
screen-up as north and clockwise degrees. Heading remains visible at minimum
zoom, and the system-map player arrow is oriented too. Forward and retro
exhaust are tied to actual burns in FlightScene; no handling values changed.

All eight hulls were inspected at detail and flight scales. The exact release
preview covered perpendicular and opposite drift, minimum zoom, a carrier at
maximum zoom, native wheel/map/pointer actions, and held-control fixtures for
turning, thrust, retros and braking. The held-key checks used temporary input
state with normal animation frames, since the browser tool's key press does
not remain down across an update. Physical held-key feel, touch and gamepad
were not tested. No console errors or persistent test saves.

## M415 follow-up: settings scrolling

Settings previously drew all 34 rows past the canvas, ignored the wheel and
let pointer hover replace keyboard selection. It now shows fourteen rows,
scrolls with wheel/arrows, and supports page keys, Home/End and pointer page
controls. The selected row stays visible. The range count and scroll
indicator show position, and the bindings heading follows the actual group.

Ten tests cover navigation, scrolled actions, inert clicks, reset, cancellation,
volume and return routing. Native input on the exact release preview reached
every row with pointer drift, rebound and reset the final flight key, cancelled
bindings both ways, adjusted volume and returned to title and flight. Test
writes stayed in memory; persistent settings were unchanged and no save was
created. The work log has the full evidence. Touch/gamepad remain untested.

## State boundaries to preserve

- `SettingsScene` keeps fourteen actual row indices in view. Its section
  headings derive from row metadata. Pointer motion cannot select a row;
  click hit areas must remain aligned after scrolling. While binding, Back
  cancels instead of leaving the menu. Navigation must not save settings.

- Ship profiles live in `src/gfx/shipdesign.ts`; `genShip` must receive the hull
  id in every preview and flight path. The nose is +x before rotation.
  `flightDirections` reads hull angle and velocity separately. Keep screen
  marker sizes legible at zoom 0.25 and independent of turret aim.
  Burn state is transient and must reset before flight's early return paths.

- `FlightScene.enter` and `resetPopulation` own world/system population state.
  `doJump` has a direct entry path and must follow the same rules. Temporary
  scenes must preserve ship identity, rescue work, escorts and projectiles.
- `src/core/docking.ts` identifies real arrivals. `StationScene.enter` may
  rebuild views after loading, but cannot repeat wages, food, passenger stops
  or leg resets for a settled visit. `portAudiencePending` lets the second
  arrival conversation wait for the first without another settlement.
- Fitted capacities come from `fittedHullStats` and `refreshFittedStats`.
  Yard fittings are explicit saved bonuses. Check cargo and reserved crew
  berths before changing a hull, including service loans and remote liners.
- Service state lives in `src/core/service.ts` and `src/core/serviceloan.ts`.
  Booked-fare receipts stay attached to the accepted order. Reading the file
  cannot file a report, collect pay or return a cutter.
- `ReaderScene` handles Controls, Handbook, Service file and Mission log.
  Search uses `src/core/searchbox.ts`, an in-page field. Native window.prompt
  did not open in the test host; avoid adding that dependency to this reader.
- Scrolled station rows must keep their actual indices in `rowBoxes`.
  `shipWindow`, `marketWindow`, `storageWindow` and `missionWindow` are
  the current examples.
  Do not interpret a visible row number as an index in the complete list.

## Verification and release procedure

1. Inspect the checkout and `git status`; preserve any active work.
2. Run `npm test` and `npm run build` for substantive changes. Use native
   browser keys/pointer for the affected player flow. Tests run in Node and
   are excluded from the TypeScript source build, so use actual model types.
3. Update `package.json`, `package-lock.json`, README milestone/version,
   roadmap, player guide, in-game notes and the work log as applicable.
4. Commit and publish to `main`. The tag helper is currently at:
   `/private/tmp/claude-501/-Users-chris-Projects-FarSpace/a99b5ff3-5c95-4912-af91-c13c47022b3f/scratchpad/tag.sh`.
   Inspect it before using it. Run from the explicit FarSpace workspace.
5. Query workflows with the full release SHA. Check the actual Deploy to
   Cloudflare step, not just the parent workflow's green status. Check the
   container image separately. Preserve the exact local JS and CSS assets before
   another build replaces `dist`.
6. Compare the live asset bytes with that preserved build and check API health.
   Python's local CA lookup failed during this session; `curl --fail` worked.
   Do not bypass certificate verification.
7. Update `catalog/farspace.yaml` in an isolated BoxPilot checkout only after
   the image workflow succeeds. Run a single catalog chain, wait for required
   checks, merge the exact checked commit, then verify remote main.

The earlier six-hour catalog helper is
`/private/tmp/farspace-six-hour-20260911/catalog-queue.mjs`, with `catalog.log`
and `catalog-current.json` beside it. It contains this session's deadline;
read it before reusing it for another authorized window. The old 0.222.0 image
was cancelled and superseded. Initial successful catalog backlog versions
were handled sequentially; do not revive the old handoff's pending list.

Earlier browser fixtures used temporary worlds with autosaves disabled.
M416/M417 fixtures captured save and identity writes in memory, preserving
the browser's stored saves and links. Close test tabs when done. Physical touch, gamepad and
VoiceOver use were not performed. Hosted deployment, native browser behavior,
and a Bigbox installation are separate claims.

## Local runtime and next work

Dev5199 runs v0.257.1. Production preview servers 5197/5198 are stopped.
All synthetic browser fixtures are closed; test save and cloud-code writes
were captured only in memory. The live release was separately checked in a
fresh browser tab.

Continue with M418 in the [approved plan](NEXT-MILESTONES.md). Its first pass
should inventory the remaining menu owners, establish stable item selection
and viewport rules, then migrate one bounded group while preserving the
station, Settings, reader and title regressions. M419 addresses the remaining
HUD overlap and information priority seen in the native flight check.

The active catalog checkout for PR259 is
`/private/tmp/farspace-settings-20260911/boxpilot`. The branch name still
contains 0.255.0, but its manifest and PR now target 0.257.1. Do not restart
Bigbox or bypass the registry check to complete this catalog update.
