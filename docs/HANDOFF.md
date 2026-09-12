# FarSpace handoff, September 12, 2026

## Current checkpoint: v0.279.0, adjustable flight display

The user requested more flight screen space after the earlier work window.
This is a scoped display follow-up. The nine hour continuation stays paused.

- Settings begins with Flight HUD, HUD Background and Screen Size. Full keeps
  the expanded HUD; Compact moves gauges and contacts to the edges; Minimal
  keeps headings, course, vital numbers and current action. Critical status
  appears in every mode. L Record retains the complete status and messages.
- Defaults are Compact, Fit Window and 90 percent background opacity. Panel
  opacity can range from 30 to 100 percent; text stays opaque. Preferences
  persist outside the voyage save. Missing or invalid values use safe defaults.
- Fit Window preserves the 480:270 aspect ratio. At 1920x911 it displays a
  1620x911 canvas; Whole Pixels retains 1440x810. Simulation coordinates and
  camera zoom are unchanged. Edge destination labels stay clear of HUD bands.
- All 863 tests in 57 files, typecheck and production build pass. Browser
  checks cover Full, Compact, Minimal, immediate resizing from Settings,
  return to the same position/course, critical hull/fuel with 40 percent
  opacity, and the Record button at fractional scale. Record pauses flight
  and retains hidden Yellow Alert status. No browser warnings or errors.
- Browser fixtures isolate storage in memory and disable online requests.
  Actual saves and identity are untouched. Save schema remains 19.
- Published commit b0c12a5649666558d656b175c766c20c975e4f7d, tag v0.279.0.
  CI 34703785022 passed, including Cloudflare deployment. Container publication
  34703784919 passed. Hosted title shows v0.279.0 and health returns ok.
  Hosted index-BGOQal_8.js matches local SHA-256
  3db36f313804c4003ecb5ae8a282922dde241f7132823107ec511133ccf4ac7e.
  Hosted Settings shows the defaults; clicking Minimal and returning to flight
  preserves critical hull/fuel warnings. Record opens and retains hidden
  status. No browser errors. Local keyboard arrows adjust display settings;
  returning keeps autopilot and its destination. Dev5199 now runs v0.279.0
  in session 74653. Temporary viewport override was reset.
- This does not complete M426 portrait, physical device or performance and
  accessibility acceptance. Other remaining milestones are unchanged.

## Closed work window

The authorized window ran from 2026-09-12 02:31:03 UTC to 11:31:03 UTC,
06:31:03 America/Chicago. Implementation stopped before the deadline; the
final release was verified on the public site. The continuation
farspace-six-hour-development, named FarSpace nine hour milestones, was
paused after the deadline and its persisted PAUSED state was verified.
Do not resume or extend this window without a new user instruction.

Read the current status table in NEXT-MILESTONES.md and the closing entry in
WORKLOG-2026-09-12.md. M421 player acceptance, M426-M427 and M433-M435 remain
open. INDUSTRY-ORDERS.md contains the source-based plan for the industry work.
The final checkpoint of that window was v0.278.1. No BigBox service or unrelated infrastructure was changed.

## Previous checkpoint: v0.278.1, final focus cleanup

- Losing focus now clears pending mouse clicks, wheel input, text events and
  the last raw key as well as held controls. The focus regression covers all
  of these queues, preventing a stale action after switching windows.
- All 853 tests in 56 files, typecheck and production build pass. Save schema
  remains 19. Published f57c1a2079ce4a0cc829f02c4e02f7984a198e94, tag
  v0.278.1. CI 34691008627 passed, including Cloudflare deployment; container
  34691008535 passed. Hosted health is ok. Normal TLS download matches
  index-DdspceZN.js, SHA-256
  5d83b09bd349f590dd8b277dfa41ec78ec245a327ff5f83d80c9866d41ed6080.
  CSS remains index-CwZdn5Vi.css, SHA-256
  4f9ba0bcb103d7e5d276c53d483e014ca4cc6c86a417f6d91da0474ff6e1e085.
- Local and hosted browser fixtures queued a click on Deck guide, a wheel
  event and a key before dispatching blur. All pending queues cleared; focus
  return did not open the reader. The hosted title showed v0.278.1. No browser
  warnings/errors. Temporary tabs closed; storage stayed in memory and online
  calls were disabled. Actual saves, identity and user tabs were untouched.
- The industry order plan is in INDUSTRY-ORDERS.md. It identifies existing
  state owners, the asteroid identity gap, mining and collection ranges,
  interruption behavior, inventory ownership and acceptance for M433-M435.
- Remaining acceptance is unchanged: M421 uncoached play; M426 portrait and
  physical device/accessibility/performance coverage; M427 native two-hour
  journey and full release matrix; M433-M435 implementation.

## Previous checkpoint: v0.278.0, M426 input follow-up

- Walking gamepad input is separate from flight input. D-pad movement no
  longer also sends roster, cards, channel or music actions. On a ship, X
  opens the roster, Y selects damage, LT opens the guide, Start selects the
  airlock and L3 the bridge. A uses, B returns, LB looks out and RB plays cards.
- Keyboard, gamepad and touch retain separate holds. Releasing one device
  cannot release another device's held key. Physical key aliases release
  independently. Focus loss clears held and pressed input. A controller
  requires neutral input after changing modes or losing focus; a held button
  cannot activate an action in the newly opened menu.
- Paused readers inside walking scenes use menu mode. A mode change or blur
  resets touch gestures. A touch button remains held until its last finger
  lifts. Top deck buttons accept touches on either side of the screen.
  Walking scenes now render their touch controls; formerly only flight did.
- Windows below two-times scale use the available width. An 800x600 viewport
  now displays an 800x450 canvas instead of 480x270. A 1280x720 viewport keeps
  the existing 960x540 canvas. Portrait 390x844 stays 390x219.
- Ten new tests cover independent device holds, shared touch buttons, focus,
  neutral input after mode changes, D-pad walking, stick/menu transitions,
  top guide clicks, paused scene modes and small-window sizing. All 853 tests
  in 56 files, typecheck and build pass. Save schema stays 19.
- Native 390x844 title review found all buttons visible. Tab reached Settings,
  Enter opened it, End reached cursor 33, and Escape restored focus to the
  Settings button. Canvas Settings text remains too small in portrait.
- At 800x600 the game filled the available width. A synthetic browser pad
  moved the Wren from (255,35) to (255,13.0275) using D-up without opening the
  roster. LT opened the deck reader in menu mode; D-down scrolled to 13 and B
  returned to the same position with no held keys.
- The in-app browser does not support native touch injection. Explicit
  synthetic TouchEvents exercised the actual handlers: a held stick walked
  left, a second finger opened the top guide button, and menu entry released
  movement. Touch end and reader close retained the walking position and
  left no held keys. Walking touch controls were visible in the final build.
- No browser warnings/errors. Temporary tab closed and viewport/touch
  emulation reset. Fixture storage stayed in memory; online calls were off.
- M426 remains partial: portrait canvas readability, physical touch and pad
  use, screen reader scope and the complete measured performance matrix are
  pending. M427 still needs its native two-hour journey and full release gate.
  M433-M435 and M421 uncoached player acceptance remain open. No automated
  check or accelerated soak is evidence of those player/device acceptances.
- Published 4352b45316da81e34bf3dac9a498a41194537af7, tag v0.278.0.
  CI 34690651703 passed, including Cloudflare deployment. Container
  34690651898 passed. Hosted health is ok and normal TLS downloads match dist.
  JS index-ClIg0zaC.js SHA-256
  18a5ba0238f9f4f7078b417111127e15240f86c81eeba20bffef045d38731ae9;
  CSS index-CwZdn5Vi.css SHA-256
  4f9ba0bcb103d7e5d276c53d483e014ca4cc6c86a417f6d91da0474ff6e1e085.
- The fresh hosted title displayed v0.278.0. An isolated instance of the
  reported city template spawned at (315,75), walked through actual held A
  input to (64.7445,75), and E opened Contracts. Closing the desk retained
  movement; held D moved to (81.7835,75). Escape returned to orbit. A repeat
  city entry again spawned at (315,75), and E returned through the landing pad.
  Credits and cargo stayed at 600cr and two parts. No warnings/errors.
  The temporary tab was closed and actual saves remained untouched.

## Previous checkpoint: v0.277.0, M425 interior navigation

- All hulls have room labels, floor colours, visible door edges, an airlock
  panel and a marked helm. Owned paint colours the hull edges. Existing wear,
  cargo props, keepsakes, furnishings and crew stations remain on the deck.
- B selects the bridge, G the airlock and Q the next damaged system, fire or
  breach. Pointer panel selection uses the same guide. Floor dots follow
  walkable doors, avoid fires and end where E selects the intended panel.
  Guidance never moves the character. Unreachable targets say no safe route.
- Static damage marks and numeric health accompany existing repair sounds.
  Reduced motion freezes flashing decoration; quiet audio retains all
  condition information. Interaction text has a fixed panel below the deck
  and no longer overlaps room names. Hold E repairs before nearby crew talk.
- Tab opens full deck instructions, condition and owned item records in the
  paused searchable reader. Closing returns to the same walking position.
  F9 now loads the saved voyage briefing from the interior too.
- Deck rows are rectangular. Spawn sits in the centre of free floor beside
  the helm. Extra seats cover larger crews in shared layouts. Hull changes
  and loaded worlds reset local crew, passenger and cat walking positions.
- Thirteen tests cover every hull and service cutter, spawn hitboxes, all
  panel endpoints, every crew station, hull/cutter transitions, owned items,
  fire avoidance, repair costs/sounds, nearby crew interaction and paused
  long records. All 843 tests in 55 files, typecheck and build pass. Save
  schema stays 19. The existing bundle size advisory remains.
- Native Wren walked from (255,35) through sixteen route tiles to the engine
  room, then held E to restore 40 percent engines to 100 using one part.
  A corrected twenty-three tile airlock walk ended near (25,35), where E
  returned to flight. An initial diagonal endpoint selected the galley;
  the endpoint regression now checks the actual nearest interaction.
- Native Bastion walked from (295,35) through twenty tiles to engineering.
  The final fixed interaction panel remained separate from the ENGINES room
  name. With reduced motion and music, effects and voice off, holding E
  restored 40 percent engines to 100, leaving two of three parts.
- Bastion then walked the twenty tile return route and E took the helm. F5
  and F9 from its interior retained the repaired engines, two parts, hull,
  keepsake and hammock through the voyage briefing. A fifty-item deck record
  reached its last item and furnishing at scroll 405; reading left the whole
  world unchanged and closed at the same walking position.
- A 120-frame Bastion draw sample averaged 0.443ms, p95 0.800ms and max
  0.900ms on this Mac. These are draw CPU timings, not full-frame or device
  acceptance. No browser warnings/errors. Temporary tab closed; storage stayed
  in memory and online calls were disabled. Real saves were untouched.
- Published commit 1a0b352370c120e0d15190a0221a5a6d1dd25d9d, tag v0.277.0.
  CI 34690138256 passed, including Cloudflare; container 34690138293 passed.
  Hosted health is ok. Normal TLS download matched index-Ccf5gCAK.js,
  SHA-256 9108779a18792e5448439292d993dd40198fb84942525cbcc1b8bdf74287bebe.
  CSS remains index-CwZdn5Vi.css, SHA-256
  4f9ba0bcb103d7e5d276c53d483e014ca4cc6c86a417f6d91da0474ff6e1e085.
- Fresh hosted title displayed v0.277.0. Pointer Airlock selected its
  twenty-nine tile Bastion route. The full fifty-item record reached offset
  405. Repaired engines remained at 100 percent and two parts remained.
  No warnings/errors. The isolated temporary tab was closed.
- M426-M427, M433-M435 and M421 uncoached player acceptance remain open.
  The original deadline is 2026-09-12 11:31:03 UTC.

## Previous checkpoint: v0.276.0, M424 visible port response

- The promenade reads ordinary, shortage and recovery states from the current
  station stock, the existing crisis request and completed support jobs at
  that station. Stock comparisons use the same baseline as stationPrice.
  A crisis shows its exact remaining demand, separate from general stock.
- A fixed operations panel, filled or empty store racks, clinic intake lights
  and up to two intake workers distinguish states. Two static staff open
  stores or clinic records with E. I and the pointer Port record button open
  all records, including previous aid handoffs. The harbourmaster reads them
  too. No extra port ledger, stock simulation or reward system was added.
- The reader pauses voyage updates, supports search and paging, and returns to
  the same walking position and actors. F9 on the promenade uses the saved
  voyage load path. Nearby interaction labels take priority over unrelated
  names and gossip, avoiding the overlap seen during the first native check.
- Current shortages take visual priority over aid recovery. Older handoffs
  remain in the record after the recent activity display ends. Stable station
  ids preserve the association through faction control changes. Rendering and
  reading cannot change stock, credits, reputation or completed requests.
- Eight new tests cover ordinary and depleted stock, pricing baseline parity,
  actual market crisis completion, station identity, control changes, saved
  handoffs, old records, missing patients, paused readers, staff and pointer
  access, and walking routes to service desks. All 830 tests in 54 files pass;
  TypeScript and production build pass. The existing Vite bundle size
  advisory remains.
- Native fixture walked from airlock (370,35) to the stores clerk near (135,75)
  using held movement keys. E opened the complete stores record. Reading left
  the whole world unchanged and returned to the same position.
- A medical shortage fixture displayed twelve supplies still needed. The
  player walked to the market and sold one unit, then the remaining stack of
  eleven with Shift held across game frames. Actual market code moved stock
  from zero to twelve, filled the existing crisis request and recorded its
  normal reward. The promenade changed to recovery with 12/12 delivered.
  F5/F9 and return to the same visit retained twelve delivered and 4036cr.
- A twelve-handoff history fixture reached its oldest complete entry with End
  at reader offset 196. Credits remained unchanged. A 120-frame draw sample
  on this Mac averaged 0.334ms, p95 0.600ms, max 0.700ms, with twelve existing
  walkers, two staff and two intake actors. These are draw CPU timings, not
  a full device performance or physical touch/gamepad acceptance result.
- No browser warnings/errors. Temporary tab closed; storage stayed in memory
  and online requests were disabled. Real saves and identity were untouched.
- Published 6a3a3b9793b9619962e03873d68490b1790de9a3, tag v0.276.0. CI
  34689270094 passed, including Cloudflare deployment. Container 34689270533
  passed. Hosted health is ok; normal TLS downloads matched dist. JS
  index-CryTAg1v.js SHA-256
  a4df774a3b72afa949957bbe99f3d26fbf3b396ce5fd71d44c4fe164d70e40cd;
  CSS index-CwZdn5Vi.css SHA-256
  4f9ba0bcb103d7e5d276c53d483e014ca4cc6c86a417f6d91da0474ff6e1e085.
- Fresh hosted title showed v0.276.0. The completed delivery fixture displayed
  recovery and 12/12 supplied. Pointer Port record opened complete records;
  End reached offset 12, with the whole world unchanged and 4036cr retained.
  No warnings/errors. Temporary tab closed; storage and online isolation kept.
- M425-M427, M433-M435
  and M421 uncoached acceptance remain open. Deadline remains unchanged.

## Previous checkpoint: v0.275.0, M423 support continuity

- Accepted repair, medical and fuel requests save a stable identity and minimal
  contact state. At most four requests remain active, with retained history
  bounded to sixteen total records. Restore reuses the matching ship; report-only jobs do
  not respawn. Missing systems or destroyed ships resolve explicitly.
- Parts or medicines can be delivered before crew work. Two units are consumed
  once. A fit engineer repairs for 400cr; a fit medic stabilises two casualties
  for 300cr. Crew work pauses outside 200m or when its worker is unavailable.
  Reload retains progress and requires a fresh hail to resume. Self repair
  uses the existing generated deck and retains its seed and panel condition.
  The delivered kit prevents additional automatic parts consumption aboard.
- The critical patient needs a fit medic and one available berth. Taking them
  reserves that berth from new passenger fares. Actual DockVisit arrival
  delivers the patient, records the third life and pays 200cr once.
- A stranded transport accepts ten fuel when at least fifteen are aboard, for
  300cr, or a tow to port for 550cr. Accepted tows restore inside 420m; a broken
  line leaves the ship at its last position. Towed contacts no longer take E
  priority away from the receiving station. DockVisit remains payout owner.
- Fuel, repair and medical calls can occur locally in peaceful systems without
  the wire. Accepted work does not add mandatory combat waves. Existing rescue,
  captain relationship, crew experience and reputation functions remain in use.
- Quest locations, local contacts, HUD and F4 read accepted work. Port closure
  records a compact support receipt without another payment. Schema 19 adds
  optional support state and validates ids, phases, progress and saved decks.
- Twenty one new regressions cover full cargo, partial help, refusal, stale
  recipients/resources, sick or missing workers, hull changes, deck retention,
  exact costs, repeated restores, missing patients, berth capacity, payments,
  port receipts, peaceful calls, lost contacts and read-only projections.
  All 822 tests in 53 files, TypeScript and production build pass. The existing
  Vite bundle size advisory remains.
- Native repair fixture accepted a ship through E, delivered two parts, sent
  Ada, saved around 20 percent and loaded through the paused briefing. The
  restored ship kept aid:423:1 and its position. Resuming completed the work
  for 400cr, with two parts still aboard and no duplicate contact.
- Native medical fixture sent Lin, consumed two medicines, paid 300cr and
  stabilised two people. E transferred the critical patient, then the actual
  local map Fly there and docking brought them to Kepler Depot. Credits moved
  from 600 to 1100; lives reached three, the berth cleared and a receipt was
  recorded. Station F5/F9 and continuation kept the same payment and receipt.
- Native fuel fixture transferred ten from eighty fuel and paid 300cr. A second
  transport was attached for tow, saved and loaded with its same id and unpaid
  delivery. Actual Fly there and E docking paid 550cr, making 1450cr total,
  and closed both reports. Station F5/F9 retained 1450cr and one completed tow.
  E was queued at the automatic stop because the port continues moving.
- These were scripted developer fixtures. Storage writes stayed in memory and
  online requests were disabled. No browser warnings/errors. Temporary tab
  closed; real saves, identity and user tabs were untouched.
- Published 59073427198181bf6a3207e6e80f4d1e0a2f55d3, tag v0.275.0. CI
  34688520479 passed, including Cloudflare deployment. Container 34688519670
  passed. Hosted health returned ok. Normal TLS downloads matched dist:
  JS index-C6uTyKb7.js SHA-256
  64d25279c1e53f002f7b536100d1a3344c3fbd5231f5f4862a4c9a3a85ae674c;
  CSS index-CwZdn5Vi.css SHA-256
  4f9ba0bcb103d7e5d276c53d483e014ca4cc6c86a417f6d91da0474ff6e1e085.
- Fresh hosted title showed v0.275.0. Native E delivered two parts to a
  disposable contact. F5/F9 showed the same job and supplied state in the
  briefing; continuing restored one ship at its saved position, two parts
  remaining, 600cr and schema 19. No warnings/errors; temporary tab closed.
  Storage stayed in memory and online requests were disabled. Dev5199 now
  runs v0.275.0 in session 93474.
- M424 through M427,
  M433 through M435 and M421 uncoached acceptance remain open. The original
  deadline remains 2026-09-12 11:31:03 UTC.

## Previous checkpoint: v0.274.0, M422 return briefing

- Continue, local load and accepted imports enter a paused voyage briefing.
  F4 opens the same screen during flight or at a station. Escape continues to
  the saved location or the existing visit. Opening it preserves the current
  flight population. Station F9 now uses the same saved voyage load path.
- The briefing reads location, ship condition, cargo, materials, crew,
  passengers and survivors from the current world. L opens complete records,
  contract terms and the existing captain's log. No second journal is stored.
- Enter pins one existing objective, C clears it. The seven row list supports
  wheel, arrows, paging, Home/End and search. Pinning retains list position.
  A removed row cannot pin the adjacent objective. Readers own their search
  input and hold the full voyage state while open.
- The chosen objective appears in the flight HUD, flight record and mission
  log. A star marks its system and local contact on the maps; selected system
  details place its terms first. The focus does not change the actual course,
  accept a contract, pay rewards or start autopilot. Explicit map travel stays
  with the existing navigation controls.
- Save schema 18 adds only optional objectiveFocusId and lastContractReceipt.
  Actual port contract completion records the receipt once. Existing saves do
  not reconstruct missing history from credit or activity counters. Mission,
  service and council identities follow their owners; crew identities use
  name, role, home and arc rather than mutable roster indices. Ambiguous
  identities cannot be pinned. Finished or unavailable work clears the focus.
- Fourteen new tests cover source reads, no mutation on viewing/pinning,
  identity changes, missing targets, duplicate owners, actual payment,
  paused runtime, load routing, late rows, stale selection, complete readers,
  input ownership and schema validation. All 801 tests in 52 files pass.
  TypeScript and production build pass with the existing bundle size advisory.
- Native isolated browser checks loaded an 80-objective save, reached row 80,
  pinned it at offset 73, searched the full terms and reached END TERMS 79.
  Reading and pinning kept world time at zero. F4 from active flight preserved
  the population; the complete world remained unchanged while it was open.
  The HUD and both maps showed the chosen objective; galaxy F9 restored its
  saved selection. No course was set and autopilot stayed off.
- A native port fixture used the actual mission board to consume one part and
  pay 300cr, moving credits from 600 to 900. The receipt appeared, focus cleared,
  and F5 then the new station F9 restored the same receipt, 16 parts and 900cr
  into the paused briefing. No app warnings/errors. Fixture storage was in
  memory, online calls disabled and both temporary tabs closed.
- Correction to the prior M421 note: station F9 was absent in v0.273.1, so that
  earlier keypress did not prove a reload. The saved school bytes were checked.
  Station F9 is implemented and its actual scene transition verified here.
- Release 5cdd5e11425223340c35a133983998a3b00c53fa, tag v0.274.0: CI
  34686397009 passed, including all 801 tests and Cloudflare deployment.
  Container 34686397048 passed. Hosted health is ok; assets match dist using
  normal TLS through system curl. JS index-DfHpUi-x.js SHA-256
  56426620561ef6274b0ee64fbca915970e5ce5ab71d4769756fb51614462d8ea;
  CSS index-CwZdn5Vi.css SHA-256
  4f9ba0bcb103d7e5d276c53d483e014ca4cc6c86a417f6d91da0474ff6e1e085.
- A fresh hosted title showed v0.274.0. An isolated 15-objective save loaded
  through Continue; End selected row 15, Enter pinned it at offset 8, and the
  saved bytes contained the same focus. Time stayed zero, credits 600 and
  autopilot off. No app warnings/errors. Temporary tab closed; real saves and
  online identity were untouched. Dev5199 runs v0.274.0 in session 77773.
- Next is M423 support job continuity. Only a source audit has begun. Current
  offerHelp, repairJob and towing live in FlightScene; resetPopulation clears
  transient aid state. updateSos creates disabled and medical contacts; wire
  maydays are a separate fuel source. Station enter pays survivor/tow handoffs
  under DockVisit. Persist accepted contact identity and minimal job progress;
  avoid serializing the whole population or repeating existing payouts.
- M421 uncoached player acceptance, M423-M427 and M433-M435 remain open.
  Deadline remains 2026-09-12 11:31:03 UTC. No extension.

## Previous checkpoint: v0.273.1, M421 first voyage implementation

- Flight School is six lessons: real thrust and braking, dock at the starting
  port, accept First post, deliver and collect payment, return home, then save.
  Elapsed time, autopilot motion, a stationary brake tap and input in menus do
  not complete the opening lesson. Instructions use physical flight bindings.
- First post is a deterministic port offer with no cargo space or crew required.
  It prefers a local civilian destination, otherwise a permitted adjacent port
  within the starter ship's round trip jump budget plus 20 fuel reserve. Full
  terms state the port, jump cost and payment. Acceptance and actual mission
  completion feed the lesson. A lost job can be posted again without another
  lesson payment. Exploration, rescue and market trading remain optional.
- School destinations use existing quest locations for the initial port and
  return. The accepted postal contract supplies the delivery marker, avoiding
  duplicate markers for the same work. Instructions explain galaxy versus local
  navigation and Shipyard refuelling. Readers retain the complete guidance.
- Save schema 17 adds per-voyage FlightSchoolState: home, selected contract and
  destination, manoeuvre evidence, paid lessons, delivery and save completion.
  No module-global progress crosses worlds. Existing saves without this state
  remain opted out. Invalid lesson state is rejected when decoding. Final manual
  save includes completion in the saved bytes and rolls it back if writing fails.
  Automatic saves do not complete the final lesson.
- Eleven new regressions cover real inputs, reload, separate worlds, repeated
  lessons, skipped school, failed saves, actual acceptance/payment, lost work and
  migration. A 120-world matrix covers Sol 20 ly, Sol 50 ly and forty Uncharted
  seeds, including a full cargo hold and no crew. Every generated start had a
  suitable postal destination. All 787 tests in 51 files pass, plus TypeScript
  and production build. The existing Vite bundle size advisory remains.
- Native isolated Sol 20 ly seed 421 voyage used held keyboard input through the
  real flight router: thrust reached 112.64m/s, braking reached 3.40m/s and paid
  the first lesson once. Native map selection and Fly there approached Onyx
  Haven. An E event at arrival requested docking while the port moved. First
  post was accepted through Missions, then the galaxy quest marker guided the
  jump to Alpha Centauri and local quest filtering selected Sable Post. Actual
  autopilot flight, automatic stops and docking completed both legs without
  moving the player through fixtures or invoking mission completion directly.
- Native payment advanced the return lesson; the return marker selected Sol and
  Onyx Haven. The ship returned with 100 hull, 54.57 fuel and 1230cr from 600cr
  initially. F5 completed school; F9 loaded the same completed state and credits.
  All five paid lesson ids persisted. No app warnings/errors. Temporary tab
  closed; storage was in memory and online calls disabled to protect real saves.
- This was a scripted developer playtest. Observation of an uncoached new player
  is unavailable and remains pending M421 acceptance. Do not label that passed.
- Release 8c092753aad19434bdf84f8355f95b5aeadfbad8, tag v0.273.1: CI
  34685306144 passed, including Cloudflare deployment and all 787 tests.
  Container 34685306188 passed. Title help was corrected to six lessons; all
  34 title checks passed locally after that copy change. Hosted assets match dist,
  health is ok and a fresh title shows v0.273.1. JS index-BRT47ago.js SHA-256
  50b0cbcdb72ff1d930ec9c5e90de985a27d67eac3d0fb8d92fb2bb2f038d7ade;
  CSS index-CwZdn5Vi.css SHA-256
  4f9ba0bcb103d7e5d276c53d483e014ca4cc6c86a417f6d91da0474ff6e1e085.
- Hosted isolated input check reached 112.49m/s under thrust, then 3.26m/s under
  braking; school advanced once to stage one with 650cr. L opened the complete
  record. No app warnings/errors; temporary tab closed. Dev5199 runs v0.273.1.
- Next implementation is M422 return briefing and selected objective. Avoid
  PlayerState.focus, which already belongs to the senior staff system. Current
  mission log is a ReaderScene populated by StationScene.openMissionLog. Local
  title continue, Game.load and adoptWorld enter station/flight directly. F4 has
  no current binding. M426 should also audit legacy hints with fixed key names.
  M422-M427 and M433-M435 were open at this checkpoint, alongside M421
  player acceptance. Deadline remains
  2026-09-12 11:31:03 UTC. No extension.

## Previous checkpoint: v0.272.0, M420 contact presentation

- FlightContacts presents identity, distance, relationship, current task and
  available help or location services. The first contact follows the same E
  selection as FlightInteraction, then other live contacts within 1400m sort by
  distance. The HUD keeps a compact contact line above messages; L reads every
  nearby contact with complete names and requirements. Drawing changes no state.
- Intent descriptions follow updateNpcs branch precedence: convoy formation,
  pirate escape/platform avoidance/interception/prey, escort targets, port
  defence, disabled or injured traders, transit runs and cargo destinations.
  Missing destinations remain unknown. Customs checks are attributed to guarded
  jumps, not invented as patrol activity. Tow and active repair details are shown.
- Contact and passage terms name the jurisdiction, pursuit cause, free cooldown
  distance/time, exact settlement quote and funds aboard. Corsair passage has its
  own timer and explicitly leaves law pursuit intact. Expired passage, payment,
  departed ships and obsolete actions update on the next flight frame. Existing
  manual truce break notices and retained history explain the triggering hit.
- Rescue answers revalidate world, system, selected live ship, range, condition,
  crew, evacuees and current requirements before acting. Answered calls cannot
  transfer supplies or pay again. Current record condition values now round up
  consistently with the HUD. Save schema stays 16.
- Fourteen new regressions cover interaction priority, AI behavior, cargo and
  escort tasks, unknown destination, contact removal, full names, rounded values,
  settlement, cooldown, passage expiry and break, obsolete aid and duplicate aid.
  All 776 tests in 50 files pass; TypeScript and production build pass. The usual
  Vite bundle size advisory remains.
- Native isolated local fixture showed Hesperus at 30m, civilian, dry fuel tanks,
  with the matching E offer. E opened Hesperus' mayday. L search showed exact fuel
  requirements and payment. Serialized world stayed unchanged while reading.
  Removing the ship cleared both contact and action. Separate law/passage terms
  showed jurisdiction, 31s pursuit cooldown, 66s corsair passage and a 1000cr quote
  against 600cr aboard. No app warnings/errors. Temporary tab closed; real saves
  and identity protected with memory storage and disabled online calls.
- Release 3af0c6d2b84bb29ec75d06e255b2d45c50020cbd, tag v0.272.0: CI
  34683965123 passed including Cloudflare deployment. Container 34683965548
  passed. Hosted assets match dist; health is ok and fresh title shows v0.272.0.
  JS index-DIilBEh3.js SHA-256
  0e28df4a98ed60c267fd5b9cdcca127b7b891fd4ae796e75c774c11b95dad8a6;
  CSS index-CwZdn5Vi.css SHA-256
  4f9ba0bcb103d7e5d276c53d483e014ca4cc6c86a417f6d91da0474ff6e1e085.
- Hosted isolated check showed the Hesperus identity/task/distance, complete
  searchable fuel requirements and matching native E mayday. Serialized world
  stayed unchanged in the reader. No app warnings/errors. Temporary tabs closed.
  Dev5199 restarted at v0.272.0. The earlier v0.271.0 docs CI 34683095875 passed.
- M421 audit: core/tutorial.ts still lets stage zero pass after 45 world seconds,
  and its module-level baselines can cross world changes. Revise around a real
  thrust/stop, reachable first job and safe return. Use settings keymap for
  physical key labels; station accept/complete paths and save confirmation must
  supply truthful progress. Fresh-player observation remains separate acceptance.
- M420 implementation and local acceptance complete. Next: M421 first useful
  voyage. M421 through M427 and M433 through M435 remain open. Deadline remains
  2026-09-12 11:31:03 UTC. No extension.

## Previous checkpoint: v0.271.0, M419 flight display

- Fixed regions retain ship name, nose, drift, aim, speed, course and numeric
  hull/shield/fuel/oxygen. Two ranked warning rows and a separate activity row
  keep pursuit, fuel and rescue visible together. Additional current state is
  counted and fully readable in the flight record. Ordinary messages and lesson
  text yield their display space during urgent states. Condition bars remain.
- FlightDisplay reads current state without cleaning or changing navigation.
  Missing assignments are reported without cancelling autopilot during draw.
  Near seismic charges take priority and replace the action with escape advice.
  Mining instructions account for range, cruise and charge inventory. Bearings
  remain independent of zoom; stopped drift does not invent a bearing.
- FlightInteraction selects the same actor/location in the existing E order:
  singers, rescue, parley, station, gate, ark, wreck, signal, planet, structure,
  construction. tryInteract consumes that selection. Duplicated world E labels
  are removed, leaving one current action line. Existing settlement and combat
  consequences remain in their original handlers. M420 will extend contact
  identity, intent and hostility explanations using this selection.
- L or the bounded Record button opens complete current status, objectives,
  contract terms, lesson and all retained comms. Notices and guidance are also
  retained, with repeated held notices coalesced. The existing sixty message
  limit remains. Search and Home/End retain complete text. Reader input runs
  before world/AI updates; runtime production also pauses. Closing keeps the
  same flight objects and course; external scene changes clean pending search.
  Flight map, pause and record modes now advertise menu input.
- Native isolated fixture combined low fuel, law cooldown, a disabled freighter,
  Flight School and chatter. Nose/drift/aim stayed distinct and all urgent rows
  were readable. At 800x600 with zoom .25 and 1920x1080 with zoom 2, the layout
  remained bounded. Adding a patrol changed cooldown to BREAK CONTACT; native E
  opened the displayed freighter rescue conversation. The viewport was reset.
- Forty messages with 35 paragraphs each reached FINAL MESSAGE 39 at the end.
  Search returned its single complete section. The entire serialized world and
  NPC references stayed unchanged while reading, then returned to flight.
  No app errors or warnings. Fixture storage was in memory, online calls were
  disabled and all temporary tabs closed, preserving real saves and identity.
- 762 tests in 49 files pass. TypeScript and production build pass. Coverage
  includes interaction order, occupied repair, jump limits, read-only drawing,
  expired state, record cleanup, full text, pause and pixel bounds. Save schema
  remains 16. Physical controller/touch acceptance remains M426.
- Release faa4dc234bc49afe96bf1d9ac04af8ef25a48e4d, tag v0.271.0: CI
  34682861943 passed including Cloudflare deployment; container 34682861929
  passed. Hosted assets match dist and health is ok. Fresh title shows v0.271.0.
  JS index-Guqny0kV.js SHA-256
  93ae50727131c7cd941f06f8b9066c7d26fc6b50dd642e169e44d2c2bdf8665e;
  CSS index-CwZdn5Vi.css SHA-256
  4f9ba0bcb103d7e5d276c53d483e014ca4cc6c86a417f6d91da0474ff6e1e085.
- Hosted isolated fixture showed simultaneous law cooldown, low fuel and the
  disabled freighter action. L opened the complete record; End reached the last
  retained guidance. Serialized world stayed unchanged while reading. Escape
  returned to flight. No app warnings/errors; fixture tab closed. A minor copy
  follow-up for M420: round fractional condition values in the complete record
  to match the HUD, which already rounds them. Dev5199 serves v0.271.0.
- M419 implementation and native acceptance are complete. Next is M420 contact
  presentation, then the remaining documented sequence. The authorized deadline
  remains 2026-09-12 11:31:03 UTC. Do not extend it.

## Previous checkpoint: v0.270.1, city arrival collision fix

- User reported that the Delphi Landing city template prevented all walking.
  CityScene placed the character at 320,75, overlapping the solid A kiosk at
  tile 32,7. Both movement axes rejected the hitbox. Arrival now uses the clear
  adjacent floor centre at 315,75. Kiosks and walls remain solid.
- Five regressions cover hitbox clearance, immediate movement, actual walking
  routes to market/cantina/contracts and their E actions, desk close movement,
  landing pad exit to orbit/surface and a repeat visit. Four failed before the
  fix; all five pass after it. All 751 tests in 48 files and production build
  pass. Save schema remains 16.
- Isolated browser fixture used held keyboard events to walk from 315,75 to
  63.37,75 at the contracts office. Native E opened that desk; Escape closed it
  and returned to orbit. No application warnings/errors. Real saves and identity
  were protected by memory storage and disabled online calls. Fixture tab closed.
  Release 3bee10a8b32bab225f695575fc5b249981267f0c, tag v0.270.1: CI
  34681393935 passed including Cloudflare deployment. Container 34681393932
  passed. Hosted assets match dist, health is ok and a fresh title shows v0.270.1.
  JS index-B4CcO_mZ.js SHA-256
  78b509246cf0114f10f43a31be96326c0678a6bc5b56650b5d76616177fe8d06;
  CSS index-CwZdn5Vi.css SHA-256
  4f9ba0bcb103d7e5d276c53d483e014ca4cc6c86a417f6d91da0474ff6e1e085.
- Hosted held-key fixture compared the old position in all four directions:
  each remained 320,75. Corrected arrival moved from 315,75 to 311.381,75;
  repeat entry restored clear 315,75. Native E returned to orbit. No app errors
  or warnings. All temporary tabs closed. Dev5199 runs v0.270.1.
- This reported defect took priority over M419. Resume the documented milestone
  sequence after the patch; the nine hour deadline stays 11:31:03 UTC.

## Previous checkpoint: v0.270.0, M418 menu audit complete

- Galaxy search uses stable system ids, twelve row pages, Home/End and explicit
  Select. A row click only selects. Closing search stops applying its text
  query to map selection. Changed results retain the selected and top ids;
  removal consumes a queued action before an adjacent destination can execute.
  Galaxy and local contact removal guards survive a draw before the input.
- I reads complete selected system details and O reads every galaxy objective.
  Long unspaced names wrap completely. All retained pilot lights are included.
  Closing readers preserves camera, selection and course. Quest filtering keeps
  an eligible selection; a completed destination remains inspectable with zero
  current objectives. Missing destinations do not plot or start flight.
- Global music and postcard shortcuts respect canvas search, active rebinding
  and focused HTML text fields. Input captured at frame start stays owned even
  when that interaction closes. Settings explicitly pauses voyage updates and
  requests the existing flight on return. The normal flight pause menu already
  requested a resume before opening Settings; the return guard covers every
  entry path rather than documenting a reproduced population reset.
- Native isolated 51 system fixture: End reached result 51 at offset 39; Select
  inspected it with no course or autopilot. Typing h left music muted. Fourteen
  objectives at one station were complete in I; O contained all 15 galaxy
  objectives and search found Delivery 14, including its 15 provisions. Camera,
  course and world time stayed unchanged. Completing those fourteen kept the
  selected system and existing course while the quest count fell to one.
- Settings End reached the final row; binding h left music muted and world
  time unchanged. Return kept all thirteen nearby ship objects and position.
  Workshop retained scrollTop 507.5 when six material stocks changed to 60 and
  returned to the same flight. Title Settings restored Settings focus; Handbook
  reached its final section and returned to the same title help page and focus.
  No application warnings/errors. Temporary tabs closed. Memory storage and
  disabled online calls preserved actual saves and identity.
- 746 tests in 48 files pass. TypeScript and production build pass. The 55 title
  and reader checks also pass after Help and What's new text updates. Save schema
  remains 16. Release c6460cd9aaedc08a938e6b9bacafd2f91cef9306, tag v0.270.0:
  CI 34680467225 passed including Deploy to Cloudflare. Container publication
  34680467282 passed. Hosted JS and CSS match the tested build; health returned
  ok. JS index-DB_4k5rQ.js SHA-256
  43445c7ab14e454ff4942a8a41cf550d2c3eed050a7e300b094738aa7580e214;
  CSS index-CwZdn5Vi.css SHA-256
  4f9ba0bcb103d7e5d276c53d483e014ca4cc6c86a417f6d91da0474ff6e1e085.
- Fresh public title showed v0.270.0. Its isolated fixture read all fourteen
  quest objectives through the final 14 provisions requirement at scroll 354.
  Credits stayed 50000, course stayed empty and the reader pause was active.
  Search End selected the tenth system; Enter inspected it without plotting or
  starting autopilot. No application warnings/errors. Temporary tabs closed;
  actual saves and identity unchanged. Dev5199 runs v0.270.0.
  M418 implementation and native acceptance are complete across the menu
  inventory. Physical controller/touch acceptance remains M426. Next is M419
  flight display priorities, then M420 contact presentation, followed by the
  documented dependency order. The nine hour deadline remains 11:31:03 UTC.

## Previous checkpoint: v0.269.0, M418 complete station records

- News, Wire, Survey and Record use six row pages and stable record identities.
  All retained text is available through I selected details or F3 Read all,
  including search and section navigation. Rows select; Enter reads an entry
  except Cartographics, where its existing data sale is retained and named.
  Record subviews and information tabs preserve separate selections/viewports.
  Arrivals retain the selected record; a removed entry needs fresh input.
- Complete sources replace the former display limits: all news and letters,
  museum donations, serial parts, Wire transmissions, board rankings, squadron
  records, survey logs, codex groups, achievements, log entries, ledger sources,
  guestbook messages, weekly records and harbour notices. Full reader snapshots
  remain stable while open. No save schema change.
- Voting, letters, newest reply, callsign and Record subviews have bounded
  buttons. Survey now quotes the final payment including the research bonus.
  Readers pause voyage systems through every current nested ReaderOverlay
  parent, plus standalone ReaderScene and LettersScene. The flight owner
  exposes its local map reader pause. Existing caller cleanup stays in place.
- Native: 30 guestbook messages and 40 log entries, independent viewports,
  complete Guest 0 message, 217 section achievement search, all 24 dispatches,
  FINAL DISPATCH 23, letter return to the same dispatch, explicit vote and reply,
  50 logged systems, 35 species and ten squadron records. The last system,
  species and squadron were readable. Survey displayed and paid 500CR for 400
  data. Readers consumed action keys without voting or selling. No application
  warnings/errors. All temporary tabs closed; memory storage and disabled
  online calls protected actual saves and identity. A synthetic large survey
  log triggered its normal story card before the fixture disabled story
  progression; this was not a reader failure.
- 731 tests in 47 files pass. TypeScript and production build pass. Published
  92e62c94b95762f0649b0592705036bd9d3beab2, tag v0.269.0. CI 34679057292
  passed including Deploy to Cloudflare. Container workflow 34679057384 passed.
  Hosted assets match the tested build: JS index-DbyOs6ct.js, SHA-256
  0b3c943f53e095d99f1e4342a81b4b8932a80c4c05e53616e996838d08f7ccf0;
  CSS index-CwZdn5Vi.css, SHA-256
  4f9ba0bcb103d7e5d276c53d483e014ca4cc6c86a417f6d91da0474ff6e1e085.
  Health returned ok. Fresh public title showed v0.269.0. Its isolated fixture
  reached Passenger 0 from thirty messages, read FINAL MESSAGE 0 at the bottom,
  retained the selected row and offset 25, and opened all 31 guestbook sections.
  Credits stayed at 50000 and the reader pause was active. No application
  warnings/errors. All temporary tabs closed. Dev5199 runs v0.269.0.
  Physical touch/gamepad acceptance remain M426. M418 is still open.
- Next: finish galaxy selection/removal, then the final global input/caller
  inventory. Station transaction and text migrations are complete for M418.
  Source audit: GalaxyScene search still uses numeric searchIndex and has no
  page or Home/End controls while searching; pointer results use current indices
  rather than drawn ids. infoLines dereferences a missing selected system and
  its local wrapper does not break long unspaced words. Reproduce these with
  quest filtering, changed results, empty results and full destination terms.
  Check Workshop, Settings, title child returns and map ownership using the
  existing models. Then continue M419 flight priorities and M420 contacts,
  followed by the documented dependency order. The nine hour continuation
  remains active until 2026-09-12 11:31:03 UTC. Do not extend it.

## Previous checkpoint: v0.268.1, M418 station transactions

- Station transaction tabs use stable keys, page controls and Home/End. Row
  clicks, including right click, select without transacting. Explicit buttons
  and keyboard commands run existing domain actions. Drawn identity handles
  insertion; removed selections require fresh input. Nonoverlapping row bounds
  match visible rows. Yard action ids do not depend on quantity or price text.
- I reads all selected terms; V now buys market shares. The seven row lounge
  retains portraits and has O for its full reply. Mission descriptions are
  selectable. Warehouse transfers preserve direction and selected commodity
  when loading creates a new held row. Working hull controls still use the
  existing confirmation and settlement functions.
- A station reader sets Scene.pausesVoyage. Runtime production, tutorial and
  story updates stop while it owns input, then resume on close. It preserves
  selection/viewport and cleans pending search on scene changes. A new world
  or dock visit resets the adapter. Flight school stays in the footer/details;
  its K skip cannot trigger the Ships K purchase. The explicit Keep old hull
  button works during school. Record P now opens the guestbook. Workshop/mail
  pointer bounds include the right edge.
- Native: 26 goods, 37 yard actions, 18 owned hulls, 15 missions and 15 crew
  offers. Exact rare sale, 800CR/+25 shield purchase, Owned Ship 17 boarding,
  Delivery 14 acceptance, Crew Member 14 hire, stable medical supply loading
  and Rover Battery upgrade passed. Full mission requirement 34 and final crew
  terms remained readable. Guestbook P and paused/resumed production passed.
  Test fixtures used memory storage and disabled online calls. No application
  warnings/errors; actual saves and identity unchanged. Full evidence is in
  MENU-INVENTORY.md. The base action viewport is unit tested without requests.
- Final input audit restored Survey pointer sales as an explicit named button
  in v0.268.1. Native research sale paid 500CR for 400 data once; outside clicks
  and repeated clicks made no further sale. The codex position is inert.
- 709 tests in 46 files pass. TypeScript and production build pass. Published
  82440cce9f7795b7ae25a5ba20fc92f46c350af2, tag v0.268.1. CI 34677574050
  passed including Deploy to Cloudflare. Container workflow 34677573971 passed.
  Hosted assets match the tested build: JS index--R7kKBil.js, SHA-256
  a8d713f3df2920131b59a8c4e72fe96a7f39643c998f70e1638715d7215cd6f4;
  CSS index-CwZdn5Vi.css, SHA-256
  4f9ba0bcb103d7e5d276c53d483e014ca4cc6c86a417f6d91da0474ff6e1e085.
  Health returned ok. A fresh public tab showed v0.268.1. Its isolated market
  fixture selected Provisions, read complete details without transacting, then
  sold exactly one unit for 25CR. Survey outside click did nothing; the button
  paid 500CR for 400 data once and a second click paid nothing. No application
  warnings/errors. All temporary tabs closed. Dev5199 runs v0.268.1.
  Save schema remains 16. M418 remains open; physical touch/gamepad stays M426.
  The nine hour continuation remains active with its original deadline.
- Next: finish News, Wire, Survey and Record text in StationScene. Their source
  still clips or truncates longer records; reuse complete readers and preserve
  selection/return state. The guestbook shortcut is fixed but its text audit
  remains open. Then finish galaxy selection/removal and global input/caller
  checks, including other nested readers' runtime ownership. Continue M419
  onward in dependency order. The existing nine hour deadline is unchanged.

## Previous checkpoint: v0.267.0, M418 conversations

- Conversation cards fit within the canvas. Eight story lines and four visible
  answers have separate paging. Outcomes show twenty lines with scroll and
  Home/End. I reads full answer terms; O reads the complete story and outcome.
  Nested readers retain selection and text position and clean pending search.
- Stable EncounterOption object identity survives conditional filtering and
  duplicate labels. Drawn row identity prevents stale pointer targeting. Rows
  select; Enter/Choose executes. Removed answers require fresh input before
  choosing a replacement. Both pointer axes are bounded; outcome text and
  margins are inert. Empty choices allow return; available choices still require
  an answer, preserving existing consequences.
- A resolution guard prevents reentrant callbacks. Parent results cannot replace
  a newly opened child conversation or reopen a caller after a scene/world
  change. SurfaceScene continues to consume rover damage once on return.
  The exported legacy wrap helper remains unchanged for other scenes.
- Native fixture: 13 answers, long label and terms, page navigation, final term
  and paragraph, exact answer 10 chosen once, forty paragraph outcome and
  empty flight return all passed. Flight kept the same NPC objects and player
  position. No application warnings/errors. Memory storage and disabled online
  calls protected real saves and identity. Physical touch/gamepad stays M426.
- 682 tests in 45 files pass. TypeScript and production build pass. Published
  051cf0c0ee85aa6afff76240a6449fc6ac56a75c, tag v0.267.0. CI 34675595695
  passed including Deploy to Cloudflare. Container workflow 34675595781 passed.
  Hosted assets match the tested build: JS index-Ml57qqOe.js, SHA-256
  05d9a3bbdc243b34a0570ed7557973ff02c9fa130473d20a42f92291d3b4617b;
  CSS index-CwZdn5Vi.css, SHA-256
  4f9ba0bcb103d7e5d276c53d483e014ca4cc6c86a417f6d91da0474ff6e1e085.
  Health returned ok. A fresh public tab showed v0.267.0. Its isolated fixture
  unlocked an option above the selected PAY 50CR answer without shifting that
  selection. I read the complete terms without payment. Choose paid 50CR once;
  a body click kept the outcome open, then Enter returned to flight. No app
  warnings/errors. All temporary tabs are closed. Dev5199 is v0.267.0.
  Save schema remains 16. Bigbox and its catalog PR remain unchanged.
  The nine hour continuation is still active. M418 remains open.
- Next: audit remaining StationScene tabs for stable selection, bounded text,
  input ownership and caller returns. Source inspection: station.ts update
  still uses one numeric cursor and drawn row indices; a left row click also
  executes a transaction. Page Up/Down and Home/End are absent there. The
  Workshop pointer shortcut checks no upper X bound, and the global P shortcut
  precedes the RECORD guestbook action. Reproduce and fix applicable gaps while
  preserving current visit, fleet, mission, cargo and trade behavior. Then
  complete galaxy selection/removal and the final M418 input audit. Continue
  M419 onward in dependency order. Use curl for normal TLS hosted reads;
  this Python 3.14 installation lacks a usable local issuer chain.

## Previous checkpoint: v0.266.0, M418 office records and returns

- Service and council desks use six visible action rows with stable explicit
  ids, drawn row identity, arrows/wheel, paging and Home/End. Rows select;
  Enter/Do this executes. Removing a selected action requires fresh input
  before executing its adjacent replacement. Domain rules remain in scenes.
- I reads complete selected terms; O opens full office records and the latest
  reply. Service records include all retained reports and current orders.
  Council records include all minutes, the current sitting, mandate and reply.
  Readers preserve parent state and close pending search on scene changes.
- Service file and fare conversations retain action/viewport on return using
  a world/station guarded resume. Council retains its guarded chair return.
  File, fare and agenda callbacks preserve the latest reply for O.
- Foreman return preserves position and the selected good, refreshes newly
  constructed facilities and skips repeated clinic/chapel/oxygen effects.
  Plant repair follows that return state and still pays once. A queued plant
  repair cannot start after loading another world.
- Native service fixture: eight actions, return order and cutter loan; End
  and Page Down reached the depot action. Service archive End reached receipt
  49 of report 0; return retained history selection and viewport offset two.
  Reporting paid the displayed 950CR once. Declining a fare retained its offer.
  Council chair and cancelled agenda returned correctly; O read 20 minutes,
  the final paragraph and the last reply. Search found FINAL MINUTE 19.
  Escape returned to promenade 145,35. Two foreman conversations kept player
  position 165,35, morale 50 and oxygen eight. Waystation E and Escape kept
  all nine NPC objects and player position 3000,3000. Compare NPC objects,
  not the containing array, which AI filters each tick. No application errors.
- 667 tests in 44 files pass. The cutter pointer test was updated for explicit
  execution. Plant settlement and queued load cancellation are unit tested.
  Fixtures used memory storage and disabled online calls. No actual saves or
  identity changed. Save schema remains 16. Physical touch/gamepad stays M426.
- Production build passed. Published 9dc9aa70b062524cc9f166bb22e67234409c88d8,
  tag v0.266.0. CI 34674411003 passed including Deploy to Cloudflare.
  Container workflow 34674411280 passed. Hosted files match the tested build:
  JS index-D3K8FFat.js, SHA-256
  3e5856d77aa68568c85ddf31186963bd9dbea88bf7753cc5a22aa31b6483e298;
  CSS index-CwZdn5Vi.css, SHA-256
  4f9ba0bcb103d7e5d276c53d483e014ca4cc6c86a417f6d91da0474ff6e1e085.
  Health returned ok. A fresh public tab showed v0.266.0. In its isolated
  service fixture, I showed the full 750CR report terms and returned with the
  report selected. Enter paid 750CR once; O retained the complete reply.
  No application warnings/errors. All temporary tabs are closed. Dev5199
  restarted at v0.266.0. Bigbox and its catalog PR remain unchanged.
  The original nine hour continuation remains active. M418 remains open.
- Next: EncounterScene still sizes its dialog from all text/options without
  bounding to the screen. Long bodies/outcomes and many choices can overflow.
  Its click action checks row Y without checking X, and numeric selection can
  shift when requires filters change. Migrate those concrete cases while
  preserving its one-time outcome handling, domain callbacks and caller.
  Then audit remaining station tabs, galaxy selection/removal and final
  input/caller checks. Service, council, city, outpost and waystation acceptance
  is recorded in MENU-INVENTORY.md.

## Previous checkpoint: v0.265.0, M418 settlement desks

- City markets, cantina crew offers, contracts and outpost goods use six row
  pages with arrows, wheel, Page Up/Down and Home/End. Pointer rows select;
  explicit Buy, Sell, Hire and Accept/Turn in controls perform transactions.
  Headers and margins are inert. Hover no longer changes keyboard selection.
- DeskMenu shares geometry and drawn row identity; domain actions stay in
  their scenes. Goods use commodity ids, offers use CrewMember objects and
  contracts use mission ids plus acceptance/hand-in state. Dynamic removal
  picks an adjacent item and requires fresh input before acting on it.
- I opens full details in ReaderOverlay. Closing retains the parent and list
  without replaying arrival effects. Desk input uses menu mode, then restores
  walking mode. City hiring counts reserved leave berths. Transactions update
  the existing ledger and autosave; outpost premiums and growth remain.
- Native acceptance: 20 goods at both desks, 15 crew offers including a long
  name and 15 long contracts. Exact last good buy/sell, last crew hire and
  contract acceptance passed. Full details reached requirement 39 plus the
  final contract marker. Wanted provisions paid 30CR and six growth; purchase
  was unavailable and spent nothing. Nested Escape returned to orbit.
- 646 tests in 43 files pass. TypeScript and production build pass. Native
  fixtures used memory storage and disabled online calls. No application
  errors. Actual saves and identity unchanged. Save schema stays 16.
- Published 6ebdc2482abc1c1256afa743c481d0af86b7b484, tag v0.265.0.
  CI 34673030263 passed, including Deploy to Cloudflare. Container workflow
  34673030030 passed. Hosted assets match the tested production build:
  JS index-CfFWItQP.js, SHA-256
  e75f8175a4afcd730a5d798fe6d1220e744dd57b46aa5986445c640ddc52d4ae;
  CSS index-CwZdn5Vi.css, SHA-256
  4f9ba0bcb103d7e5d276c53d483e014ca4cc6c86a417f6d91da0474ff6e1e085.
  Health returned ok. A fresh public tab showed v0.265.0. Its isolated city
  fixture selected Luxuries with End, bought one for 79CR, and returned from
  details with Luxuries still selected. No application warnings/errors.
  All temporary tabs are closed. Dev5199 restarted at v0.265.0. Bigbox and
  the catalog PR are unchanged. The nine hour continuation remains ACTIVE.
- M418 remains open. Next audit
  ServiceScene and CouncilScene, then remaining station tabs, galaxy removal,
  waystation and final input/caller returns. Include outpost foreman return:
  it enters the parent again after an encounter, unlike ReaderOverlay.
- ServiceScene actions need stable explicit ids, selected row retention and
  complete details. ServiceFileScene.open currently sets settingsReturn and
  enters a separate reader; its return calls ServiceScene.enter and resets
  cursor/scroll. Service fare encounters do the same. Preserve its actual
  order, fare and cutter rules while fixing return state. Council already
  has a world/station guarded resumeNext for agenda encounters; preserve it.
  Council action rows and response text are truncated without a full reader.

## Previous checkpoint: v0.264.0, M418 locations and objectives

- Orbit now separates Sites and Territories into six row pages. Tab switches
  lists; arrows/wheel/pointer select; Page Up/Down and Home/End reach all rows.
  E Land, L Rover and I Details stay fixed. Rover selection follows the active
  territory or the selected site's territory. Military/hostile rules remain.
- Site identity uses POI ids. Territory identity uses the live Region object.
  A replaced planet resets selection. Pointer rows resolve their drawn identity.
  Disappearing locations choose an adjacent row, with a fresh action required
  before landing/travel if removal occurs in the same input frame.
- Q still selects the exact quest site and holds globe rotation. I shows full
  location details and related quests; O lists every objective on the planet.
  ReaderOverlay keeps the parent alive and does not replay entry effects.
  Closing it restores the same selected site, viewport and rotation.
- System map I shows every quest at the selected destination, with full
  requirements. O lists all system objectives. Returning preserves camera,
  selection, list scroll, course and paused time. Unknown signals remain
  search areas. Parent flight changes close pending reader search dialogs.
- Letters retain message identity and reading position across new arrivals.
  Only the displayed message is marked read. Home/End reach the entire body;
  full sender text is included when it exceeds the fixed header.
- Native checks used 25 sites, 20 territories, 12 quests at one station and a
  130 paragraph letter. Land entered test-site-24; Rover entered territory 19.
  All 12 station objectives were readable; camera, course and time were
  unchanged after search. New mail kept Ari Sen at paragraph 18 and stayed
  unread. End reached paragraph 129. No application warnings/errors.
- A stale ruin hint appeared after returning to orbit. Orbit entry now clears
  the prior surface hint before showing its own. Tests cover that return.
- 622 tests in 42 files pass; TypeScript passes. Fixture writes use memory
  storage with online calls disabled. No actual save or identity changed.
  Save schema remains 16. M418 remains open for the station/location audits.
- Production build and browser acceptance passed. Published
  c99035a3756da1509c8fcb1258b984d07f3da7c7, tag v0.264.0. CI 34671740188
  passed including Deploy to Cloudflare. Container workflow 34671740324 passed.
  Hosted assets match the build, health returned ok, and a fresh public tab
  showed v0.264.0 with no application warnings/errors. Assets:
  index-sHWv4-dA.js, SHA-256
  7fcc2a5deea9fc02537ae02c1b0076a6aba54cfc4ff7ddc8f24c4ae53f18add6;
  index-CwZdn5Vi.css, SHA-256
  4f9ba0bcb103d7e5d276c53d483e014ca4cc6c86a417f6d91da0474ff6e1e085.
- Production Q selected release-site-24, I showed its full quest instructions,
  pointer Land entered that same ruin, and Escape returned to orbit with the
  site still selected and the stale hint cleared. All temporary tabs and
  preview5198 are closed. Dev5199 was restarted at v0.264.0. Bigbox and the
  catalog PR are unchanged. The original nine hour continuation stays active.
- Next: CityScene.updatePanel and OutpostScene.update still move selection
  under a hovering pointer every frame. Their click transaction checks use a
  matching Y row without requiring the click's X coordinate inside the panel.
  Fix those concrete cases, empty lists and scrolling first. City market,
  candidates and mission rows need distinct stable identities. Preserve
  purchases, hiring, mission settlement and outpost growth behavior.
- Then audit ServiceScene and CouncilScene: service actions reset cursor/scroll
  after running; council draws every action without a viewport. Waystation
  uses fixed walking interactions and at most three visitors, rather than a
  list menu. Finish the remaining station tab, input and return checks before
  marking M418 complete.

## Previous checkpoint: v0.263.0, M418 first slice

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
- Published a32ec7d5ae9bdbfe5cf00ecdc5241e19f31abb97, tag v0.263.0.
  CI 34670112694 passed, including Deploy to Cloudflare. Container workflow
  34670112707 passed. A fresh hosted tab showed v0.263.0 with no warnings or
  errors, and /api/health returned ok. Hosted assets match the tested build:
  index-DbUZBtX6.js, SHA-256
  49f7ce1b45185c6fab2adcfe7df5964e60dac3fea2f313d3058443c35196d07f;
  index-CwZdn5Vi.css, SHA-256
  4f9ba0bcb103d7e5d276c53d483e014ca4cc6c86a417f6d91da0474ff6e1e085.
- Temporary tabs and preview5198 are closed. Dev5199 was restarted at
  v0.263.0. Bigbox and its catalog PR are unchanged. The continuation remains
  active through the original deadline.
- Next source findings: OrbitScene uses unbounded territory and POI arrays,
  adjacent inclusive hit rows, and index selection. Empty POIs can produce
  invalid arrow selection. Its landing and rover controls follow the lists
  downward. Bound those panels, preserve actual POI ids in pointer rows,
  retain the M436 Q focus behavior and keep both landing controls visible.

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
