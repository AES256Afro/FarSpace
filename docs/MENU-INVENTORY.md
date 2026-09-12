# M418 menu inventory

Baseline: v0.270.0, inspected September 12, 2026. M418 implementation and
native acceptance are complete. Release verification is pending below.

| Surface | Current behavior | Remaining work | Acceptance state |
| --- | --- | --- | --- |
| Title and save library | Native HTML pages retain page, focus and scroll; save operations are explicit. The former slots scene is absent. | Preserve M416/M417 regressions. | Current native Settings and Handbook return restored caller page and focus; title and library regression suite passes. |
| Workshop | Native HTML inventory, research and jobs preserve scroll and action focus on stock changes. | Preserve industry and form input tests. | Native inventory changes retained scroll 507.5; return kept the same flight. Current regression suite passes. |
| Station transaction tabs | Stable goods, yard actions, hulls, missions, crew, fares, warehouse entries, blueprints and base actions. Page controls, Home/End, full details and explicit execution. | Preserve domain and reader tests. | Native market sale, exact yard purchase, owned hull boarding, mission acceptance, crew hire, warehouse transfer and engineering upgrade passed. Base viewport and absence of requests covered by an isolated unit fixture. |
| Station records | Six row pages for News, Wire, Survey and every Record subview. Stable ids, separate viewports, full selected readers and searchable Read all. Existing votes, replies and sales use explicit controls. | Preserve caller and input tests. | Native complete guestbook, logs, achievements search, dispatches, letters, Survey, codex and squadron records passed. |
| Settings | Existing full option and binding scrolling. | Preserve binding input ownership and caller return. | Native final row, h binding without music change, world pause and same flight objects/position passed. |
| Roster | Stable member identity, eight visible rows, full wrapped details, pointer actions, wheel and page navigation. Crew on leave are readable but cannot receive aboard actions. | Preserve this model while migrating other lists. | Native empty and 21 member fixtures; full details, page and wheel controls, insertion, exact bonus recipient, review return and leave restrictions passed. |
| Chronicle | Shared ReaderScene, complete export text grouped by its existing headings. Explicit Back, search, section navigation and paging. | Preserve read-only behavior. | Native body click, End at log entry 99 and complete matching sections passed. |
| What's new | Shared ReaderScene retains all historical release sections with paging and search. | Preserve title return and the seen version setting. | Production End reached 0.10; search found 0.261; body click stayed open. |
| Help, handbook and service file | Shared reader closes search on external scene changes and resumes the current flight. Long headings and unbroken text wrap completely. | Keep scene-specific regression coverage. | Native search entry and cancellation passed. First Escape now cancels even a populated search field. Unit tests cover external cleanup and flight resume. |
| Letters | Newest first live list with stable message identity, paging, Home/End and complete text wrapping. | Preserve station caller and read-state regressions. | Native new arrival kept Ari Sen at paragraph 18, left new mail unread, and End reached paragraph 129. Home returned to the top. |
| Orbit | Separate six row Site and Territory lists, stable keys and fixed landing controls. Full details and all objectives use a nested reader. | Preserve domain landing and Q focus tests. | Native 25 sites and 20 territories; Q selected site 24 on the last page; Land entered that ruin; Rover entered territory 19. Details retained selection and globe rotation. |
| Galaxy and system maps | Bounded maps and explicit navigation. Local I reads all destination quests; O reads every system objective. Contact updates retain selection and top row. | Preserve map and quest selection tests; M419/M420 cover flight/contact presentation. | Native 51 system paging and selection, typing ownership, 15 full objectives, search, completion and camera/course/time preservation passed. Missing and changing destination tests pass. |
| Service and council desks | Six row action pages with explicit execution, stable ids, full terms and complete office records. Service file and conversation returns retain selection. | Preserve service, fare, cutter and council domain tests. | Native eight action service fixture, exact 950CR report, complete archive and fare return; council chair, agenda return, 20 minutes, search and promenade return passed. |
| City and outpost desks | Six visible rows, stable selection, full details and explicit transactions. Desk input switches to menu controls while open. | Preserve domain trade, hiring, mission and growth tests. Foreman and plant repair returns now retain position, refresh facilities and avoid repeated arrival effects. | Native 20 goods, 15 crew offers and 15 long contracts; exact trade/hire/accept, wanted premium, reader return and orbit return passed. |
| Waystation | Fixed walking interactions and at most three visitors. | Preserve flight resume behavior. | Native airlock E and Escape retained all nine NPC objects and the player position at 3000,3000. AI rebuilds the containing array each tick. |
| Conversations | Fixed text area, four answer rows, stable option identity, explicit choice and complete text readers. | Preserve consequence, callback and caller tests. Physical touch/gamepad remains M426. | Native 13 answers, full final terms, complete 30 paragraph story, 40 paragraph outcome, inert margins/body, exact answer 10 and empty flight return passed. |

## Implementation sequence

1. Add a small reusable selection and viewport model. Identity, adjacent
   fallback, visible range and pointer row lookup belong there; domain actions
   remain in each scene. Use it for the roster first.
2. Migrate Chronicle and What's new to the shared reader behavior. Preserve
   all content and add native checks for body clicks, search and caller return.
3. Complete the orbit and remaining station/location inventories, migrate
   demonstrated gaps, then run empty, single, long and dynamic list fixtures.
4. Record native evidence for each changed surface. M418 closes only after
   this inventory has no unresolved action reachability or selection issues.

## v0.263.0 implementation evidence

ListView uses the CrewMember object as its live key. Duplicate names remain
separate. A replaced world resets selection. Insertion or removal above the
selected person preserves that person and the visible top item where possible.
If the selected person disappears, selection uses the item at the old index,
or the preceding item at the end. The selected person stays visible.
Page controls move both the viewport and selection by eight rows. Pointer
row lookup excludes the header, margins and empty rows. Domain transactions
remain in RosterScene; a row click only selects. Bonuses autosave after payment.

ReaderScene retains complete sections for search. The native check found that
a search input consumed the first Escape by clearing its value. SearchBox now
prevents that default and cancels the dialog, preserving the reader's prior
query and position. Input does not reach game shortcuts. Chronicle includes
all source text; What's new retains every historical release entry.

The local map now pages seven contacts, matching its seven visible rows.
Its shared-location objective and dynamic removal audit is still pending.
All 603 tests pass. TypeScript and production build pass. Temporary browser
fixtures use memory storage and disabled online calls. No physical touch or
gamepad acceptance has been performed for this slice.

## v0.264.0 implementation evidence

Orbital sites use persistent POI ids. Territory selection uses the live Region
object, and a changed planet resets both viewports. Pointer rows resolve the
identity that was drawn, including an insertion before the click. Empty lists
keep valid selection bounds. If a selected location disappears in the same
frame as a landing or travel command, the adjacent selection is shown and the
command waits for a fresh input. Military and hostile landing rules remain.

ReaderOverlay reuses paging and search within the parent screen. Closing it
does not enter the parent again, reset its camera or repeat arrival effects.
Parent scene changes remove an open search dialog. Local objective text is
complete; undiscovered signals remain search areas. Orbital return also clears
a stale surface hint found during native testing.

Letters use live message identity, preserve the current paragraph across new
arrivals, and keep new mail unread until displayed. Full sender text remains
available when it exceeds the header. Home/End reach the complete message.

622 tests in 42 files pass. Native acceptance uses isolated memory storage and
disabled online calls. Remaining M418 work focuses on the other station tabs,
service and council desks, city/outpost/waystation lists and the final input
and return audit. Earlier title, Settings and workshop regressions remain.

## v0.265.0 implementation evidence

DeskMenu shares six row geometry, drawn row identity, selection and paging.
City market and outpost goods use commodity ids. City crew offers use live
member identity, so duplicate names stay separate. Contract keys include the
mission id and whether the action is acceptance or hand-in. If an entry
vanishes in the input frame, its adjacent replacement requires a fresh action.
Rows only select; Buy, Sell, Hire and Accept/Turn in are separate controls.
Headers and margins cannot trigger transactions. Empty lists remain inert.

City hiring respects crew on leave. Completed trades, recruitment and contracts
update the existing ledger and autosave. Outpost premiums and settlement growth
keep their existing values. Failed purchases or sales keep credits and cargo.
ReaderOverlay shows complete entries without repeating arrival effects or
resetting selection. Open desks use menu input, then restore walking input.

Native checks used 20 goods at each desk, 15 crew offers including a long name,
and 15 contracts with 40 requirements each. End reached Crystal Lattice;
buying cost 29CR and selling returned 24CR. The last crew offer was hired and
selection moved to the adjacent offer. Contract 14 showed its final requirement
and acceptance added that exact mission. A wanted outpost provision sold for
30CR and added six growth; the unavailable purchase spent nothing. Escape
closed details, then the desk, then returned to orbit. No application errors.
Fixture storage was in memory and online calls were disabled.

646 tests in 43 files pass. TypeScript and production build pass. Physical
controller and touch acceptance remain scheduled for M426. M418 still needs
service/council, remaining station tabs, galaxy selection/removal and the final
caller audit. Outpost foreman return is included in that audit.

Release CI 34673030263, container publication and Cloudflare deployment passed.
Hosted assets match the tested build. Production v0.265.0 accepted a pointer
purchase of the selected Luxuries row for 79CR and retained selection across
full details. No application warnings/errors. Temporary tabs are closed.

## v0.266.0 implementation evidence

OfficeMenu uses six visible action rows and explicit execution. Stable ids
include service order destinations, loan serials and council weeks where the
underlying action can change. Drawn row identity survives insertion; removal
requires fresh execution input for the adjacent replacement. Hover is inert.
I reads full action terms; O includes current journeys, all retained reports
or minutes, and the latest reply. Search and closing keep parent state.

Service file and fare conversation returns use a world/station guarded resume.
Council keeps its existing guarded agenda return and records the latest reply.
Outpost foreman return retains walk position and selection while refreshing
constructed facilities. It does not repeat clinic, chapel or oxygen arrival
benefits. Plant repair retains that return state and pays once. A queued repair
cannot open after loading another world.

Native service acceptance reached all eight actions with an active return
order and cutter loan. Full archive End reached receipt 49 of report 0, and
return retained the history action at viewport offset two. Reporting paid
950CR once. A declined fare conversation retained its offer. Council seating
and agenda cancellation retained the chair. O included 20 minutes; End reached
the final minute and last reply; search found the complete requested minute.
Escape returned to promenade position 145,35. Two foreman conversations
retained position 165,35, morale 50 and oxygen eight. Waystation E and Escape
retained all nine individual flight ships and player position. No application
warnings/errors. Fixtures used memory storage and disabled online calls.

667 tests in 44 files pass. The cutter pointer test now selects its row and
uses the explicit action control. Plant repair settlement and queued load
cancellation are tested. Physical controller/touch acceptance remains M426.
M418 stays open for conversation lists, remaining station tabs, galaxy
selection/removal and final input/caller checks.

Release CI 34674411003, container publication and Cloudflare deployment passed.
Hosted v0.266.0 matches the tested build. Its isolated service fixture read the
full 750CR report terms, retained selection on return, collected that amount
and showed the full reply in O. No application warnings/errors.

## v0.267.0 implementation evidence

EncounterScene uses a fixed card with eight story lines and four answer rows.
Outcomes use twenty lines. Left/right, text controls and wheel over the text
scroll the story; answer paging and Home/End keep every choice reachable.
I opens complete selected terms; O opens the complete story and outcome in
ReaderOverlay. Closing a reader retains selection and text position. Pending
search is cleaned on scene changes. The existing exported wrap helper remains
unchanged for other scenes.

Option objects provide identity across conditional filtering, including duplicate
labels. Pointer lookup uses drawn option identity and both X and Y bounds. Rows
select only. A removed selection requires another input before choosing its
replacement. Empty answers permit a return without choosing or producing NaN.
An unresolved conversation with available answers still requires a choice.
Outcome body and margin clicks are inert; Continue, Enter or Escape returns.

Resolution guards prevent reentrant execution and stale replies after a callback
opens a child conversation, changes scenes or replaces the world. The original
encounter supplies its log entry. SurfaceScene still consumes rover damage on
return exactly once. Flight returns preserve the existing flight scene.

Native isolated fixture: 13 answers and long labels/terms; Page Down reached
answer four and End reached answer 12 at offset nine. I showed FINAL TERM 12;
closing retained answer 12. O and End showed paragraph 29 and FINAL BODY.
A click beside the choices did nothing. Clicking answer 10 selected it without
execution; Choose executed answer 10 once. Body click kept its outcome open,
and End reached result 39 with FINAL RESULT 10. An empty conversation returned
to flight through Escape with the same NPC objects and player position.
No application warnings/errors. Fixtures used memory storage and disabled
online calls, preserving real saves and identity. 682 tests in 45 files pass.
Physical touch/gamepad acceptance remains M426. M418 remains open for the
remaining station tabs, galaxy selection/removal and final input/caller checks.

Release 051cf0c, tag v0.267.0: CI 34675595695, Cloudflare deployment and
container publication 34675595781 passed. Hosted assets match the tested build;
health returned ok. A fresh public browser showed v0.267.0. Its isolated fixture
kept PAY 50CR selected when a conditional option appeared above it. Reading
terms spent nothing. Choose paid exactly 50CR, body click preserved the outcome,
and Enter returned to flight with one callback invocation. No app warnings or
errors. All temporary tabs closed; no actual saves or identity changed.

## v0.268.1 implementation evidence

StationList adapts the existing numeric domain cursor to ListView keys and drawn
row identity. Goods use ids; yard actions have explicit ids independent of price
or quantity labels. Hulls and crew retain live object identity; fleet categories,
mission acceptance/hand-in state and storage direction remain part of identity.
A removed selection requires fresh input before executing its replacement.
Per-tab page sizes match the visible rows. Both mouse buttons select only;
explicit footer buttons and keyboard actions execute. Adjacent row bounds do
not overlap. Mission and lounge descriptions are part of their selectable row.

I opens complete selected text, including long hull names, yard conditions,
mission requirements, crew/fare terms, warehouse direction and blueprint costs.
V replaces the former I share purchase shortcut. Market B/S and Shift behavior
remain. The lounge has seven visible rows with portraits and O for its complete
last reply. Reader return preserves selection and viewport without replaying a
dock visit. Scene.pausesVoyage stops runtime production, tutorial and story
updates while this nested station reader owns input. Flight school stays visible
in the footer and readable in details. Its K skip cannot also buy a hull; the
explicit Keep old hull button remains available. P on Record now reaches the
guestbook. Workshop and mail hit areas include their right edge bounds.

Native isolated checks: 26 market goods and the final carried rare; row click
made no trade, then Sell reduced only that rare. The 37th yard action displayed
800CR and added exactly 25 shield for that price, retaining its stable id.
A fleet with 18 owned hulls boarded Owned Ship 17 with its 17 torpedoes. Fifteen
mission postings retained the selected final entry; I reached requirement 34
and FINAL INSTRUCTION 14, then Accept took only Delivery 14. Fifteen crew offers
reached Crew Member 14 and its complete trait text, then hired that person for
120CR. Two warehouse loads kept stored medical supplies selected and conserved
food, medical supplies and water. Rover Battery grade one consumed five carbon
and two nickel. Record P kept the station open and displayed the guestbook.
Production progress stayed at zero in details and resumed after closing them.

All 709 tests in 46 files pass. The existing pointer tests now select a row and
then use the action control. New coverage includes dynamic insertion/removal,
duplicate ship names, storage direction, complete readers, world replacement,
shortcut ownership and a 25 action base fixture that sends no requests. Save
schema stays 16. Native fixtures used memory storage and disabled online calls;
actual saves and identity were unchanged. No application warnings/errors.
M418 remains open for remaining station text, galaxy selection/removal and final
input/caller checks. Physical touch/gamepad acceptance remains M426.

The final input audit caught a Survey pointer regression in the shared update.
v0.268.1 restores the data sale as an explicit named button. Tests cover both
axis bounds, one payout at the research premium and no sale from the codex.
The Survey text audit remains open.
Native research sale paid 500CR for 400 data once. Outside and repeated clicks
made no extra payment. The codex click was inert. No application errors.

Release 82440cc, tag v0.268.1: CI 34677574050 including Cloudflare deployment
and container publication 34677573971 passed. Hosted JS and CSS match the tested
build; health returned ok. Fresh public title showed v0.268.1. Isolated hosted
Provisions details changed no cargo or credits; Sell moved one unit for 25CR.
The hosted Survey button paid 500CR for 400 data once, with no sale outside its
bounds or on a repeat click. No application warnings/errors. Temporary tabs
closed, with actual saves and identity unchanged. Dev5199 runs v0.268.1.

## v0.269.0 implementation evidence

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

## v0.270.0 implementation evidence

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
- 746 tests in 48 files pass. TypeScript and production build pass. Save schema remains
  16. Release CI, container publication, deployment and hosted checks are pending.
  M418 implementation and native acceptance are complete across the menu
  inventory. Physical controller/touch acceptance remains M426. Next is M419
  flight display priorities, then M420 contact presentation, followed by the
  documented dependency order. The nine hour deadline remains 11:31:03 UTC.
