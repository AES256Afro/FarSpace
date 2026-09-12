# M418 menu inventory

Baseline: v0.267.0, inspected September 12, 2026. Native acceptance is recorded
per migration. M418 is still open.

| Surface | Current behavior | Remaining work | Acceptance state |
| --- | --- | --- | --- |
| Title and save library | Native HTML pages retain page, focus and scroll; save operations are explicit. The former slots scene is absent. | Preserve M416/M417 regressions; audit long names and child returns when shared rules change. | Previous release checks; current regression suite passes. |
| Workshop | Native HTML inventory, research and jobs preserve scroll and action focus on stock changes. | Include in shared key ownership and return checks. | v0.261 native checks; current regression suite passes. |
| Station market and shipyard | Existing selection and viewport fixes retain scrolling. | Audit other station tabs, dynamic row identity and transaction hit areas. | Existing station scrolling and fleet tests pass. |
| Settings | Existing full option and binding scrolling. | Preserve binding input ownership and caller return during later menu work. | Existing regression suite passes. |
| Roster | Stable member identity, eight visible rows, full wrapped details, pointer actions, wheel and page navigation. Crew on leave are readable but cannot receive aboard actions. | Preserve this model while migrating other lists. | Native empty and 21 member fixtures; full details, page and wheel controls, insertion, exact bonus recipient, review return and leave restrictions passed. |
| Chronicle | Shared ReaderScene, complete export text grouped by its existing headings. Explicit Back, search, section navigation and paging. | Preserve read-only behavior. | Native body click, End at log entry 99 and complete matching sections passed. |
| What's new | Shared ReaderScene retains all historical release sections with paging and search. | Preserve title return and the seen version setting. | Production End reached 0.10; search found 0.261; body click stayed open. |
| Help, handbook and service file | Shared reader closes search on external scene changes and resumes the current flight. Long headings and unbroken text wrap completely. | Keep scene-specific regression coverage. | Native search entry and cancellation passed. First Escape now cancels even a populated search field. Unit tests cover external cleanup and flight resume. |
| Letters | Newest first live list with stable message identity, paging, Home/End and complete text wrapping. | Preserve station caller and read-state regressions. | Native new arrival kept Ari Sen at paragraph 18, left new mail unread, and End reached paragraph 129. Home returned to the top. |
| Orbit | Separate six row Site and Territory lists, stable keys and fixed landing controls. Full details and all objectives use a nested reader. | Preserve domain landing and Q focus tests. | Native 25 sites and 20 territories; Q selected site 24 on the last page; Land entered that ruin; Rover entered territory 19. Details retained selection and globe rotation. |
| Galaxy and system maps | Bounded maps and explicit navigation. Local I reads all destination quests; O reads every system objective. Contact updates retain selection and top row. | Finish galaxy selection/removal and other map acceptance checks alongside M419/M420. | Native 12 shared station quests, final material requirement, search, and exact camera/selection/course/time preservation. Contact insertion/removal tests pass. |
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
