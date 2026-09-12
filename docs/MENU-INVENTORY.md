# M418 menu inventory

Baseline: v0.263.0, inspected September 12, 2026. Native acceptance is recorded
per migration. M418 is still open.

| Surface | Current behavior | Remaining work | Acceptance state |
| --- | --- | --- | --- |
| Title and save library | Native HTML pages retain page, focus and scroll; save operations are explicit. The former slots scene is absent. | Preserve M416/M417 regressions; audit long names and child returns when shared rules change. | Previous release checks; current 587 test suite passes. |
| Workshop | Native HTML inventory, research and jobs preserve scroll and action focus on stock changes. | Include in shared key ownership and return checks. | v0.261 native checks; current regression suite passes. |
| Station market and shipyard | Existing selection and viewport fixes retain scrolling. | Audit other station tabs, dynamic row identity and transaction hit areas. | Existing station scrolling and fleet tests pass. |
| Settings | Existing full option and binding scrolling. | Preserve binding input ownership and caller return during later menu work. | Existing regression suite passes. |
| Roster | Stable member identity, eight visible rows, full wrapped details, pointer actions, wheel and page navigation. Crew on leave are readable but cannot receive aboard actions. | Preserve this model while migrating other lists. | Native empty and 21 member fixtures; full details, page and wheel controls, insertion, exact bonus recipient, review return and leave restrictions passed. |
| Chronicle | Shared ReaderScene, complete export text grouped by its existing headings. Explicit Back, search, section navigation and paging. | Preserve read-only behavior. | Native body click, End at log entry 99 and complete matching sections passed. |
| What's new | Shared ReaderScene retains all 181 release sections with paging and search. | Preserve title return and the seen version setting. | Production End reached 0.10; search found 0.261; body click stayed open. |
| Help, handbook and service file | Shared reader closes search on external scene changes and resumes the current flight. Long headings and unbroken text wrap completely. | Keep scene-specific regression coverage. | Native search entry and cancellation passed. First Escape now cancels even a populated search field. Unit tests cover external cleanup and flight resume. |
| Letters | Newest first snapshot; explicit page and letter buttons, wheel and keyboard scrolling. Reading marks the current letter read. | Add Home/End, check stable letter selection on refresh and caller restoration. | Existing letters tests pass. |
| Orbit | Territory and POI rows draw directly; quest Q targets a real POI and keeps it visible. | Bound long site lists, maintain visible selection, separate territory/site hit areas and keep landing controls reachable. | Quest Q and E verified in v0.262; general long lists remain open. |
| Galaxy and system maps | Bounded map and list panels, explicit inspect/plot/fly actions, quest filtering. | Verify selected identity and scroll after contact removal; show every local objective at shared locations. Preserve camera and route under scrolling. | v0.262 quest filters and travel checked; map tests pass. |
| Service and council desks | Dedicated action menus. Service history uses ReaderScene. | Audit dynamic rows, scrolling and all action hit areas against current state. | Needs focused audit. |
| City, outpost and waystation | Dedicated location menus. | Inventory long lists, return paths and empty states before migration. | Needs focused audit. |

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
