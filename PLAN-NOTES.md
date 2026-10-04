# Plan notes: Feature 5, "Is burning allowed today?"

Branch `feat/burn`, worktree `sof-burn`. Written before the code; kept up to date as the work went. The decisions and
their reasons are in `docs/decisions/0005-burn.md`; what was done and seen is in `docs/reports/0005-burn.md`.

## 1. Source (checked first, 2026-10-04)

- GNB's Fire Watch page (`https://www.gnb.ca/en/emergency/fire-watch.html`) links the public "Wildfire Dashboard"
  (ArcGIS item `7bb8645cf75c4aa2b7a43a3123f9e17f`). Its web map reads GNB's own ArcGIS Server:
  `https://gis-erd-der.gnb.ca/gisserver/rest/services/FireWeather/BurnCategories/MapServer`
  - layer 0 `County`: the 15 county polygons, `NAME`, `PUBLICCATEGORY` (1 No burn, 2 Restricted burn 8 PM to 8 AM,
    3 Burn permitted: the layer's own coded values), `VALIDDATE`.
  - layer 1 `No Current Category`: the same fields; empty today.
- Official, machine-readable, public, no key. So the feature goes ahead.
- `VALIDDATE` is the end of validity (the next 2 p.m.), stored as Atlantic wall-clock time and served as if UTC.
- No licence on the service. No history: the replay says "not checked".

## 2. Rules (each one a test)

1. County from the person's point, with the province's own polygons (downloaded once, bundled). The point is never
   sent to the province: the engine asks for the 15-county table, kept 15 minutes.
2. Outside New Brunswick: the field is null, the card is hidden.
3. Category 1, 2, 3 only as the layer's own labels name them, word for word; anything else: not checked.
4. Older than 26 h (now later than `VALIDDATE` + 2 h): not checked. Also on a screen left open.
5. The province's category wins over the calendar. "Fire season closed" only when the province lists the county with
   no category, November to March. (Changed after the review: the first plan followed the calendar, third Monday of
   April to October 31, which the province's own April 1 opening contradicts.)
6. Any failure, any shape never seen: not checked. Never a guess. Never changes the verdict.
7. Replay: not checked (no archived official status), county still named.

## 3. Shape

- Engine: `smoke_engine/burn.py`, `feeds.burn_categories(at)`, the answer's `burn` field,
  `scripts/build_counties.py`, `data/places/nb-counties.geojson`, `tests/test_burn.py`.
- Web: `src/burn/` (view, card, tests), `burn.*` strings, one line in `Verdict.tsx` under "Why?".

## 4. Order, as it went

1. Source research. Done.
2. Engine: county data, module, feed, field, tests; `data/demo/` and `data/validation/answers/` rebuilt. Done.
3. Web: view and tests, card, strings, Listen, browser tests on port 4177 (`E2E_PORT`), screenshots. Done.
4. Independent review: 19 findings; fixed (see the decision record's table). Done.
5. Decision record, report, README, DESIGN-LOCK amendment, TECH-FACTS; committed locally.

## 5. Blocked, and what was done instead

- The machine had under 1 GB of memory free while other checkouts ran their tests: browser tests failed with
  "insufficient resources" and "target crashed" in screens this feature does not touch. Re-run alone, they pass.
- Nothing could be tested from Render (no deploy, no push): noted as a known limit.
