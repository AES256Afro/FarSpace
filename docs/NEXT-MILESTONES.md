# FarSpace: next development plan

Date: September 11, 2026. Status: approved implementation sequence.
Baseline: v0.255.0, M415, release 9bef5b4540c4393de3654a710053bf6d0b66fb06.
The preceding release has 404 passing tests and a verified hosted deployment.
M416 and M417 are released through v0.257.1 with 473 passing tests and a verified hosted deployment.
M418-M427 remain planned. The user approved implementation after reviewing
the three title concepts and choosing random selection between them.

The next development cycle should make FarSpace easier to enter, understand
and return to, then deepen the consequences of helping people. Single-player
immersion remains the priority. Existing save, law, economy, crew and service
systems supply the state for these changes.

The user's title preference is explicit: randomly alternate between an
orbital ship scene, station traffic and a bridge-window scene. The title
menu keeps one layout across all three.

## Findings that determine the order

| Evidence in the current checkout | Consequence for the plan |
| --- | --- |
| `src/scenes/title.ts` puts new-game variants, identity, cloud, save tools and reference pages in one list. | Give the opening screen five primary destinations and move related tools into focused pages. |
| Title rows start at y104, compress to eight-pixel spacing, and use thirteen-pixel vertical pointer areas without horizontal bounds. The footer starts at y232. | Fix title geometry and input as part of the visual redesign. Long account/save states require their own acceptance fixtures. |
| Title selection changes on hover every frame. Station and Settings required the same repair in M413/M415. | Establish common selection and viewport rules, then migrate remaining menus in small groups. |
| `refreshSummary` caches by slot number and save presence, without saved time; its nickname also reads the active world rather than the loaded summary world. | Give previews one consistent source and invalidate when that source changes. |
| `SlotsScene.update` writes the active world when activating another slot. `Game` creates a placeholder world when no save exists. | Separate browsing from activation and explicitly verify empty-slot handling before expanding the save UI. This is a code-level risk, not a reproduced loss report. |
| The ten-step Flight School already exists. Its first stage can complete after 45 world seconds, without demonstrating a successful stop. | Improve and test the existing course rather than adding a second tutorial. |
| Flight already has heading/drift markers, service objectives, mission markers, law cooldowns, parley, comms and contextual actions. | Improve priority, discovery and consistency before adding more HUD text or another journal. |
| Regular captains, rescue/repair, real trade stock, port memories and crew relationships already exist. | New immersion milestones connect these systems and make their outcomes visible. |

Sources: `src/scenes/title.ts`, `src/scenes/slots.ts`, `src/save.ts`,
`src/game.ts`, `src/core/tutorial.ts`, `src/scenes/flight/{index,render,types}.ts`,
`src/scenes/chronicle.ts`, and completed milestones in `docs/ROADMAP.md`.

## Title direction

Retain the pixel-art world, mint navigation accents and recognizable ship
profiles. Use a larger wordmark, calmer background behind the controls,
stronger text contrast and enough space to distinguish each action. Replace
the current combat-led strapline with a line about the ship, crew and journey.
The design concept uses: "Your ship. Your crew. Your way home."

At desktop widths, put the menu on the left and the principal scene detail
on the right. At narrow widths, stack the content and allow normal vertical
scrolling. Essential controls must not shrink with the flight canvas.

| Scene | Composition | Motion and sound |
| --- | --- | --- |
| Orbit | The player's hull above a planet limb, with a readable nose, canopy and engines. The planet stays clear of menu text. | Slow orbital drift and occasional navigation lights. Quiet ambient hum if music is enabled. |
| Station | A readable station silhouette, lit bays and a few ships on coherent arrival/departure paths. | Sparse traffic with distinct routes. Optional muted station ambience. |
| Bridge | A window frame and restrained console lighting around a view into space. Use hull-specific bridge treatment where assets exist. | Small instrument changes and slow external motion. The menu remains stationary. |

Scene-selection policy:

- Use a shuffled set of the three scenes. Each appears once per cycle; avoid
  the previous scene at the boundary between cycles. This provides variety
  without long runs of the same view.
- Select on cold launch or an explicit return from gameplay to the title.
  Opening Settings, Help or save tools and returning preserves the scene,
  menu position and focus.
- Keep a scene stable while the user is interacting. A quiet "Change view"
  action can advance it on request. No timed rotation behind open forms.
- Use a presentation RNG separate from world generation and simulation.
  Title traffic is decorative, bounded and unable to trade, fight or save.
- Use the selected save's hull, name and location only after a valid preview
  is available. When the actual planet/location is unavailable, label the
  image as an illustration. Do not invent a ship status or location.
- A fresh player gets a neutral Wren scene and New voyage as the primary
  action. Reduced motion gives a composed still scene. Honor the current
  music setting and browser gesture requirements.

Main navigation:

| Destination | Contents |
| --- | --- |
| Continue voyage | Selected save, ship and location, save age and an explicit loading/error state. Hidden when no valid save is available. |
| New voyage | Sol 20 ly, Sol 50 ly and Uncharted, with short comparisons, current difficulty and destination slot. |
| Save library | Three slots, details, import/export and cloud tools. Callsign and squadron identity remain available from a secondary identity area. |
| Settings | Flight/controls, sound/display and world/crew groups. |
| Help & handbook | Controls, Handbook and Flight School guidance. |

Keep version, What's new, music state and optional scene change in a quiet
footer. Put the Chronicle under the selected save's details. Fleet Wire and
identity stay secondary; network availability cannot delay local play.
Cloud codes belong in their intentional management view, not the opening
screen or decorative ticker.

Technical approach: prototype a semantic HTML menu overlay above the existing
Canvas2D artwork. It provides normal focus, text scaling, scrolling and pointer
targets while preserving the 480x270 world renderer. Add a small scene-owned
mount/dispose interface and suppress game hotkeys while forms own focus.
Keep drawing and input ownership explicit. Test this approach on desktop and
narrow viewports in M416 before extending it elsewhere. Existing canvas menus
can share a pure selection model without all being rewritten as HTML.

## Milestone sequence

Effort describes implementation scope, not a delivery promise. A slice includes
code, meaningful tests, native verification, documentation and release checks.
Small is one slice; medium is two or three; large is four to six. Art review,
physical device testing and external service failures can extend elapsed time.
Use measured effort from M416-M418 to estimate later dates.

| Milestone | Outcome | Depends on | Effort / risk |
| --- | --- | --- | --- |
| M416: The opening view | Three randomized title scenes and a clear, consistent main menu. | M415 baseline | Large / medium |
| M417: A clear save library | Trustworthy previews, understandable starts and explicit save operations. | M416 | Large / high |
| M418: Menus with one set of rules | Shared navigation behavior and complete remaining lists. | M416, M417 | Large / medium |
| M419: A readable flight deck | Clear priorities for heading, route, threats and messages. | M418 | Medium / medium |
| M420: Know the contact | Explain who a contact is, what it is doing and what the player can do. | M419 | Medium / medium |
| M421: The first useful voyage | A reliable, optional first-session loop using real game actions. | M417-M420 | Medium / medium |
| M422: Pick up the journey | A short truthful recap and one player-selected objective across screens. | M417, M419, M420 | Medium / medium |
| M423: Work worth answering | Three complete support/rescue job chains with persistent outcomes. | M420, M422 | Large / high |
| M424: The port changes | Visible port state that follows existing economy and rescue outcomes. | M423 | Large / medium |
| M425: A ship you can read | Consistent interior identity, room navigation and visible ship condition. | M418, M419 | Large / medium |
| M426: Comfortable across devices | Measured input, readability, motion and performance improvements. | M416-M425 | Large / medium |
| M427: A voyage that holds together | Release candidate validated across new, old and long-running saves. | All preceding milestones | Medium / high |

M416-M418 form the first delivery group. M419-M422 form the second. Scope
M423-M425 against playtest findings from those groups. Accessibility and
performance checks begin with M416; M426 completes the device matrix and
cross-scene review. M427 adds cross-system validation to the tests performed
throughout implementation.

### M416: The opening view

Implement the scene selector, three bounded backdrops, main menu grouping,
new/returning-player states and scene-owned input lifecycle. Reuse
`genShip`, hull profiles, station/planet drawing and palette choices.
Route every existing title action to its new home before removing the old
flat list. A grouped route may initially open its existing functional page.

Acceptance:

- All three views can be selected deterministically in tests. Three launches
  cover the set; a cycle boundary does not repeat the previous view.
- The same menu occupies the same location in every desktop composition.
  Primary controls remain reachable at 320px width and with enlarged text.
- Keyboard, pointer and native tab focus work without resting-pointer resets.
  Decorative clicks cannot activate a row. Submenu return restores focus.
- No save, empty save, malformed save, linked cloud and long identity/name
  fixtures show correct actions without overlap or clipped footer content.
- Twenty minutes on the title does not advance the saved world, create saves,
  accumulate traffic entities or change the world's RNG sequence.
- Offline local Continue remains available; reduced motion and music-off
  states are honored. No screen-reader support claim before native review.

### M417: A clear save library

Build one read-only preview model from each save's actual bytes and timestamp.
Separate preview, selection, activation, copy, import and replacement. Preserve
per-slot cloud-code ownership. Refresh details after writes, imports and
remote selection, including when a slot stays nonempty throughout.

Acceptance:

- Merely opening or selecting a save preview writes no world or cloud state.
  Activating an empty slot does not save the generated placeholder world into
  another slot. Export names the selected saved game.
- New voyage states its target slot and difficulty. Replacing an occupied
  slot requires a concrete choice and preserves a recoverable local copy.
- Show local and remote timestamps when they differ. State which copy will
  load. A failed/timed-out cloud lookup still permits the valid local save.
- A delayed cloud response cannot replace a different selected slot or a
  newly started voyage. Repeated activation cannot load or write twice.
- Invalid imports, unsupported versions, storage write failures and corrupted
  previews produce an explanation without replacing the last valid save.
- Verify all three slots, both directions of copy, schema migration and
  restoration from the recovery copy with synthetic fixtures.

### M418: Menus with one set of rules

Extract a small selection/viewport model: stable item identity, visible range,
row geometry, paging, scroll bounds and focus restoration. Keep domain actions
in each scene. M416 supplies the first consumer; M413/M415 supply regressions
that must continue passing.

Audit and migrate title subpages, slots, roster, letters, Chronicle, What's
new and any remaining station/service panels according to the inventory.
Reuse ReaderScene for suitable long-form content. Avoid a universal menu
framework with scene-specific branches.

Acceptance:

- Every action is reachable with its advertised input at each list size,
  including empty, one row, many rows, long labels and dynamic removal.
- A selected item stays selected when an earlier row is added or removed.
  When the item itself disappears, choose a documented adjacent item.
- Wheel, page, keyboard and pointer actions target the displayed item.
  Information, margins and headers cannot trigger transactions.
- Text input owns its keys. Escape closes the innermost interaction first.
  Return preserves the correct caller and existing flight population.
- Maintain a scene inventory with each migration and native check recorded.

### M419: A readable flight deck

Give the HUD explicit display regions and priorities. Always retain hull
heading, actual drift, essential condition, current destination and urgent
contact status. Show one relevant action prompt. Queue ordinary crew lines
and economic news in the existing comms log when urgent information needs
the space. Make font and contrast choices consistent with the new menus.

Acceptance:

- A fixture combining tutorial, low fuel, law pursuit, a rescue and chatter
  keeps emergency state and the next possible action readable.
- Nose, drift and aim remain distinct at minimum and maximum zoom and when
  the ship is stopped. Color is paired with shape or text.
- A suppressed message remains available in the log. Time-sensitive state
  updates correctly rather than leaving a stale instruction on screen.
- Resizing and switching scenes preserve display priorities and input.

### M420: Know the contact

Create one contact presentation model from existing AI, law and interaction
rules. Show identity, relationship, present intent, distance and available
actions: hail, dock, board, send help or leave. Explain hostility with its
actual cause and show a valid route out when one exists.

Acceptance:

- "Patrol checking cargo", "returning to bay", "needs fuel" and equivalent
  descriptions agree with the actor's current state. Unknown remains unknown.
- The displayed primary action matches what E will do when several entities
  are close. Target change updates both description and action together.
- Law cooldown, paid settlement and pirate passage show the correct party,
  requirements and remaining time. Their existing state machines remain the
  authority; pirate passage must not be presented as law clearance.
- Expired agreements, departed contacts and newly unavailable services clear
  stale actions. A manual truce-breaking hit is explained after it happens.

### M421: The first useful voyage

Revise Flight School around a complete first job and safe return: understand
nose/drift, stop, choose a reachable port, dock, trade or accept suitable work,
finish it and save. Offer small optional branches for exploration and helping
a ship. Keep free exploration available from the start.

Acceptance:

- The initial lesson verifies thrust and an actual controlled stop. Elapsed
  time alone cannot mark it learned. Hints explain missed prerequisites.
- Test Sol 20 ly, Sol 50 ly and multiple Uncharted seeds for reachable targets,
  usable resources and sufficient capacity. Existing saves stay opted out.
- Reloading, skipping or revisiting a lesson cannot pay its reward twice.
  Rebinding controls changes the instructions the player sees.
- Observe at least one fresh player completing a job and returning without
  developer coaching. If that review is unavailable, record it as pending.

### M422: Pick up the journey

Build a short return briefing from existing event history, missions, passenger
manifest, service orders and ship condition. Let the player focus one existing
objective and carry that focus between the log, route display and flight HUD.
Link to the current full records rather than creating another journal.

Acceptance:

- The briefing answers where the ship is, what is aboard, what was last
  completed and what the chosen next action needs. Every line has a source.
- Objectives reference their owning system's identifiers. Completion, failed
  work or a missing destination removes or resolves the focus cleanly.
- Viewing or pinning does not accept work, collect rewards, advance time or
  start autopilot. The player deliberately chooses travel actions.
- Persist only the optional focus and genuinely missing event receipts.
  Older saves get a conservative reconstruction, without invented history.

### M423: Work worth answering

Build three bounded job chains using existing services: a disabled freighter
needing parts and an engineer, a casualty transfer needing a medic and berth,
and a stranded transport needing fuel or tow assistance. Each has a visible
request, player choice, physical completion and a port follow-through.

Acceptance:

- Each chain can complete through support actions without mandatory combat.
  Choices explain resource, crew and berth requirements before commitment.
- Leaving to obtain supplies, opening menus, reloading mid-job, changing hull
  and returning to the contact preserve or explicitly resolve the job.
- Give accepted contacts persistent identity and a minimal encounter record;
  reconcile it with existing live NPCs to avoid duplicate ships on reload.
  Do not serialize the whole transient flight population.
- Consume materials and pay each phase once. Partial help, refusal, a lost
  target and full cargo have explicit outcomes. Apply existing rescue and
  captain relationship rules once, with no parallel reputation ledger.
- Record a compact completion receipt for the return briefing and port state.

### M424: The port changes

Make existing economic and social state visible in station space. Start with
three compositions: ordinary operation, shortage and recovery. Use signage,
cargo activity, room occupancy and a few specific conversations to show what
changed after a delivery or rescue.

Acceptance:

- Market prices, stock, news and the visible shortage/recovery state refer to
  the same economy event and station. Visual activity cannot change stock.
- The player can identify a concrete result of a completed support job and
  revisit it later. Use existing port memory and captain/crew records.
- State survives save/load and control changes. Repeated docking cannot repeat
  payment, wages or relationship rewards. M403 remains the arrival authority.
- Bound actors and event history. A busy port remains within the measured
  frame budget and does not block a walking route or interaction point.

### M425: A ship you can read

Extend external hull identity into interiors: clear room entrances, consistent
labels, recognizable bridge/engineering/medical/hold areas and visible
condition. Start with Wren and Bastion to prove small and large layouts, then
apply the style to the remaining hulls. Integrate existing keepsakes, wear and
crew stations into those layouts.

Acceptance:

- The player can find the airlock, bridge and a damaged system without reading
  every panel. Doors and interactive equipment differ from decoration.
- Normal, damaged and repaired states have distinct visual and sound cues.
  Reduced motion and quiet settings preserve the relevant information.
- Crew movement and room access remain valid after hull transfers, cutter
  loans, staffing changes, fires and repairs. Existing owned items persist.
- This pass adds no independent relationship system or cosmetic inventory.
  Additional customization follows only if the layout work calls for it.

### M426: Comfortable across devices

Complete a deliberate desktop, narrow-window, touch and gamepad review. Apply
text scaling, contrast, motion and input lessons across scenes. Profile title,
busy flight, ports and large saves before deciding which assets/modules to
cache or load on demand.

Acceptance:

- Native checks cover keyboard-only, mouse, physical touch and a physical
  gamepad. Record unavailable devices as pending rather than passed.
- Verify menu names, focus order, focus return, modal key ownership, readable
  zoom and screen-reader behavior where semantic UI exists. Full-game
  screen-reader support is a separate scope decision.
- Report cold-load bytes/time, frame-time percentiles, entity counts and memory
  against the same baseline fixtures and named hardware. Set device budgets
  from those measurements, then enforce them in repeatable checks.
- No visual enhancement may silently disable local play when offline.
  Title renderers stop or dispose when hidden; traffic and assets stay bounded.

### M427: A voyage that holds together

Run a release candidate through complete player journeys and long-session
state transitions. Treat this as a release gate for the planned cycle, while
continuing to release verified improvements during the cycle.

Acceptance:

- Fresh start to first completed job, old-save return, cloud failure with local
  resume, loaded freighter trade, rescue mid-job reload, pursuit cooldown,
  pirate passage, cutter return, fleet transfer and interior repair all pass.
- Run a real-time two-hour session and a separate deterministic simulation
  soak. Check repeated menu visits, dock/undock settlement, long event history,
  outstanding jobs and storage failures. Do not call accelerated time a native
  long-session playtest.
- Each save migration and round trip preserves capacity, credits, cargo, crew,
  accepted jobs and narrative state. Investigate differences with receipts.
- Resolve critical progress/save/input defects before release. Record minor
  visual issues with their affected configurations and next action.
- Tests, typecheck, build, native evidence, documentation, exact main/tag,
  actual hosted deploy, matching live assets and container image are separate
  release records. Update the BoxPilot catalog after its checks pass.

## Delivery and scope controls

The first implementation pass is M416's title navigation and scene selection.
Build the final main-menu structure with one complete orbital view, then add
station and bridge views behind the same interface. Release M416 only when
all three scenes and the required start/save states pass. M417 then makes the
save library's deeper behavior explicit. Do not introduce unrelated gameplay
changes while proving the new title lifecycle.

Every milestone has one primary state owner. Presentation reads domain state;
UI adapters do not own economy, hostility, arrival settlement or job rewards.
Use explicit command functions for actions and plain serializable records for
new persistent state. This keeps future multiplayer options open without
introducing real-time synchronization now.

Maintain a small synthetic fixture collection: fresh profile, populated and
empty slots, malformed save, long names, linked/offline cloud, large fleet,
full hold, law pursuit, pirate passage, wounded contact and an old schema save.
Never use personal cloud codes or player saves in fixtures, screenshots or CI.

Review after M418 and M422. Ask whether users can enter and resume a voyage,
reach every action, identify their heading, understand an attack and finish a
useful job. If these remain unclear, adjust the next slice before expanding
content. Keep combat expansion, additional hull tiers, another relationship
system and real-time multiplayer outside this cycle.

## Existing work to reuse

| Proposed work | Existing owner to extend |
| --- | --- |
| M416 artwork | M414 hull profiles, `src/gfx/sprites.ts`, `src/gfx/shipdesign.ts` |
| M417 save UI | Three-slot model and migrations in `src/save.ts`; cloud commands in `src/core/cloud.ts` |
| M418 menus | M407-M415 viewport fixes and `ReaderScene` |
| M419/M420 flight clarity | M405/M406 law and passage, M414 headings, existing flight actions and AI |
| M421 onboarding | Ten-step `src/core/tutorial.ts` |
| M422 recap/objectives | Mission log, Chronicle, Service file and the existing world event log |
| M423 support | Existing repair/medic/tow/fuel actions, M396 population continuity and regular captains |
| M424 port response | Real stock/economy, M97 traffic control, M98 port memory, M403 visit settlement |
| M425 interiors | Existing hull decks, crew stations, keepsakes, wear and fitted-hull transfer rules |

## Current release follow-through

v0.257.1 is deployed. The title and save-library milestones are complete.
M418 is next in the approved sequence. No new timed automation was created.

BoxPilot PR259 targets 0.257.1. Local checks passed with 1,632 tests. The
catalog registry check resolved FarSpace with HTTP 200, then failed on the
unchanged MinIO image returning HTTP 401. Keep the PR open until its registry
check passes. This catalog issue does not affect the hosted FarSpace release.
