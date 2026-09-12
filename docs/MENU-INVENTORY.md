# M418 menu inventory

Baseline: v0.262.0, inspected September 12, 2026. This is a source inventory;
native acceptance is recorded per migration. M418 is still open.

| Surface | Current behavior | Remaining work | Acceptance state |
| --- | --- | --- | --- |
| Title and save library | Native HTML pages retain page, focus and scroll; save operations are explicit. The former slots scene is absent. | Preserve M416/M417 regressions; audit long names and child returns when shared rules change. | Previous release checks; current 587 test suite passes. |
| Workshop | Native HTML inventory, research and jobs preserve scroll and action focus on stock changes. | Include in shared key ownership and return checks. | v0.261 native checks; current regression suite passes. |
| Station market and shipyard | Existing selection and viewport fixes retain scrolling. | Audit other station tabs, dynamic row identity and transaction hit areas. | Existing station scrolling and fleet tests pass. |
| Settings | Existing full option and binding scrolling. | Preserve binding input ownership and caller return during later menu work. | Existing regression suite passes. |
| Roster | Cursor is an array index, reset on entry. Every crew card is drawn; there is no viewport or pointer selection. Review and bonus actions use the cursor. | Add stable crew selection, visible rows, wheel/page/pointer navigation, bounded labels and return restoration. Preserve the actual member across insertion/removal. | Source issue identified. First implementation target. |
| Chronicle | All text is wrapped and clipped with wheel/up/down scrolling. Any mouse click closes the page. | Move to shared reader behavior or equivalent; add explicit Back hit area, paging and complete search. Body clicks must be inert. | Source issue identified. |
| What's new | Separate canvas reader with a large historical notes array. | Inspect paging/search and caller behavior; migrate to ReaderScene where suitable. | Needs focused audit. |
| Help, handbook and service file | ReaderScene provides bounded scrolling, sections, search and page controls. | Preserve caller and search cleanup on external scene changes; use as the reference for other text pages. | Existing reference and service tests pass. |
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
