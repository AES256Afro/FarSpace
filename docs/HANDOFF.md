# FarSpace handoff, September 11, 2026

## Current checkpoint

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
