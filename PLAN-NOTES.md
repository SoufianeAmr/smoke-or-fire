# Plan notes: Feature 3a, "the answer lives on the map"

Branch `feat/map`, worktree `sof-map`. Overnight lane of Oct 4, 2026: no approvals, local commits only, browser
tests on port 4175 (`E2E_PORT=4175`). This file is the plan, the decisions taken alone and the running log.

## What ships

The verdict screen opens on a map. The answer card sits in a sheet at the bottom; the map shows the air's path
(the ribbon), the fire detections, the official fires, the person and ECCC's alert zone.

| Piece | What it is |
|---|---|
| Basemap | Self-hosted PMTiles extract (tile zooms 0 to 10) drawn by MapLibre GL JS, in our own colours, no green |
| Fallback | The outline map (d3-geo, bundled outlines) with the same overlay and a plain note saying why |
| Overlay | One SVG over either basemap: ribbon (three heights as trails, hourly beads), ember dots sized by fire power, a flame per official fire, a soft dot for the person, ECCC's alert zone as a dashed outline |
| Sheet | Three detents. Peek: the card (and the fire-is-close notice). Half: the three source badges and "Why?". Full: everything "Why?" says |
| Controls | Buttons only: Recentre (no GPS call), zoom in, zoom out, "What the map shows" |
| Engine | An informational, versioned `map` key in `GET /verdict`, with a JSON Schema |

No animation in 3a (3b later).

## North Star (owner's addendum, applies to everything built here)

- Simple enough for a worried 80-year-old: one decision per screen, text 18 px or more and fine at 200% zoom,
  plain words, Listen on every screen, a button for every action (never a gesture alone), forgiving Back, no
  time pressure.
- Trustworthy enough for ECCC: every fact sourced (who, when, link), ECCC first, "not checked" instead of a
  guess, nothing discourages calling 911, no personal data leaves the phone.
- Ready to adopt: EN/FR as equals, WCAG 2.1 AA, plain language, tested, a decision record, cheap to run, our
  own visual identity (never mistaken for a Government of Canada site).
- Calm, not alarming: colour + shape + word.
- Last check before finishing: would a fire chief, an ECCC director and a grandmother each understand the
  screen in five seconds?

## Decisions taken alone (each one is also in the report)

1. **The screen opens at peek.** The card is the answer; the map gets the room. The badges and "Why?" move one
   tap up ("Sources and why"). This replaces yesterday's "badges and Why? show as the screen opens": they now
   show whole above the 911 bar at the half detent. The fire-is-close notice stays in front, at peek.
2. **Detents are content-sized, not percentages.** Peek fits the card; half fits card, badges and "Why?";
   full fills the room between the top bar and the 911 bar and scrolls inside.
3. **Buttons first, gestures as shortcuts.** The sheet's handle is a labelled button; a flick on it also works.
   Zoom has + and − buttons. Dragging the map is an extra; the arrow keys pan it.
4. **Badges share one row on phones** (under 980 px tall, was 800): a column of three would leave no map at
   the half detent. The column with full names stays on tall screens.
5. **Basemap extract = the engine's wind grid** (`-72,41,-56,51`, tile zooms 0 to 10, 46 MB), from Protomaps
   build `20260928` (the first build of tile schema 4.15.2: Protomaps keeps the first build of each schema
   version, so the pin stays downloadable). Extracted with go-pmtiles 1.31.2, checksums pinned.
6. **MapLibre GL JS 6.12.0 served as its own three ES modules** (`/vendor/maplibre-gl-6.12.0/`), not bundled:
   its worker imports the same shared module as the page, so bundling would ship that module twice (about
   450 KB gzip instead of 306 KB).
7. **Map labels drawn with the page's own Inter**: with no "glyphs" address MapLibre 6 draws the letters
   itself, so there is no glyph server and no font file to ship. (An earlier plan to self-host a font file for
   the map was dropped. The page's Inter still comes from Google Fonts, as before the map: the tiles are the
   app's own, so no third party learns which part of the map is looked at.)
8. **One overlay for both basemaps**, in SVG, moved with a CSS transform during gestures and redrawn once
   when the gesture ends.
9. **The verdict screen becomes a lazy route**, loaded while the Loading screen shows. That is what keeps
   the main bundle from growing; the engine answer and the replay file are already fetched there.
10. **ECCC's zone outline is a second, optional request**, made only when an alert is active. The existing
    alert check (query, timeout, "not checked" rules) is untouched.
11. **The static map card behind "Why?" stays as it is** (with the forward smoke): "Why?" still says
    everything screens 7a to 7d said. It goes when 3b puts the forward smoke on the main map.
12. **Not deployed.** The lane is local-only, so the extract was not put on Vercel. Range behaviour is checked
    against the live site's existing static files and against the local preview server; the report gives the
    one command to confirm it after the next deploy.
13. **The map is started during the Loading screen**, off the screen, on the frame the verdict is expected to
    open on; the verdict screen takes it as it is. Its library starts coming one screen earlier, while the
    person picks their place (not on a phone that asks to save data). On a slow first visit the library
    (306 kB) and the first tiles cannot both arrive within the Loading screen otherwise.
14. **+ and − zoom about the person's dot** while it is on the map: closer to their place, with no drag needed.
15. **No buttons to move the map sideways.** A drag or the arrow keys do it. WCAG 2.1 AA does not ask for a
    button here (2.5.1 covers multipoint and path-based gestures); WCAG 2.2 (2.5.7) would. Left for the owner:
    every button on the map competes with the ribbon. The design lock's rule now says what is true: a button
    for everything the map is needed for.
16. **MapLibre's `maxBounds` is not used**: it holds the whole picture inside its bounds, the part under the
    sheet too, and pushed the frame under the sheet when no fire was in range. The centre is held instead.
17. **With only the card showing, the sheet never covers the top bar.** Raised, it may (one press lowers it).
18. **The map's words never claim an absence when a source was not checked.**
19. **The host keeps the built files for good** (`/assets/`, with `/tiles/` and `/vendor/`), and a missing
    file under them is "not found", never the app's own page.
20. **Left as they are, from the review's matters of taste**: with "Why?" open the top bar is out of reach
    until the sheet is lowered; on a small map the credit is behind Legend; the legend covers the
    fire-is-close notice while it is open.

## The `map` key (version 1)

Informational: built after the verdict, never read by it. A failure gives `"map": null`, never a failed answer.
Schema: `engine/smoke_engine/schemas/map.v1.schema.json`. Every layer must name its source and its time.

```
map.version        1
map.you            {lat, lon}
map.focus          {lat, lon} | null          the fire the verdict features
map.trails[]       {height, chosen, points[{lat, lon, hoursAgo}]}      one per height
map.detections[]   {lat, lon, time, observed, frp, by}                 last 24 h, within 500 km
map.fires[]        {id, lat, lon, stage, sizeHa, name}                 Canada's official list (BH, OC)
map.alertZone      {rings[[[lon, lat], …]]} | null
map.layers         trails{source, model, run, recordedAt}
                   detections{hours, radiusKm, count, shown, newest, firms{ok, checkedAt}, cwfis{ok, checkedAt}}
                   fires{source, ok, checkedAt, count}
                   alertZone{source, state, issued, checkedAt, outline}
```

## Budgets and how each is measured

| Budget | Measured by | Result |
|---|---|---|
| Map chunk ≤ 350 KB gzip | `web/e2e/map.spec.ts` ("budgets"), on the test build | 316,539 bytes: MapLibre's three modules 306,349, the app's own map code 10,190 |
| Main bundle ≤ today (175,860 bytes gzip -9) | same tests | 168,331 bytes: 7,529 smaller. The verdict screen is a file of its own, 22,945 |
| Map interactive ≤ 1.5 s after the verdict, throttled | `npm run e2e:perf` (CPU 4×, Slow 4G), User Timing marks | Met in 4 runs of 6; see below |
| No re-render while panning | a test: no DOM change inside the overlay during a drag, only its transform | 0 changes, every run |

### The map's timings

Phone profile: processor 4 times slower, 1.6 Mbit/s down, 750 kbit/s up, 150 ms each way (Lighthouse's
mobile profile). A first visit, nothing in the browser's cache; each run is 5 visits; the figure is the run's
median, in ms from the moment the verdict screen showed. "Interactive": the map, already drawn, is on the stage.
"Shown": it has taken the outline map's place on the screen and takes gestures. The budget is held to "shown".

| Run | Graphics | Machine's processor load as the run started | Interactive | Shown | Budget (1,500 ms) |
|---|---|---|---|---|---|
| A | Graphics card (Intel Iris Xe) | not noted | 397 | 734 | met |
| B | Software (SwiftShader) | not noted | 508 | 981 | met |
| C | Graphics card | not noted | 1,060 | 1,911 | missed |
| D | Graphics card | 25% | 767 | 1,173 | met |
| E | Graphics card | 100% | 717 | 1,470 | met |
| F | Graphics card | 100% | 1,492 | 2,243 | missed |

The machine was shared all night with other test runs (7.7 GB of memory, 0.1 to 0.8 GB free), and the
processor slow-down multiplies whatever they take: the same code measured 734 ms and 2,243 ms an hour apart.
Read: about 0.7 to 1.2 s on a machine that is not saturated; not shown to hold on one that is. Before the map
was started during the Loading screen, the same measure was 4,990 to 7,452 ms (software graphics).

Dragging, processor 4 times slower: with the graphics card a median frame of 16.7 ms (60 a second), 95th
percentile 33 to 50 ms, worst 50 to 167 ms; in software 50 ms, 67 to 83 ms, 117 to 150 ms. Changes inside the
overlay while dragging: 0, in every run.

## Order of work (test first, commit when green)

- [x] 0. Port override; tiles fetch script; vendor copy; dependencies (commits efe15f9, 5a2616a)
- [x] 1. Engine: schema, `map` key, alert zone, tests (never changes a verdict, live/replay parity), rebuilt
      demo and validation answers (commit 9a7af38; engine 223 passed)
- [x] 2. Web, pure parts: map model, Mercator view maths, palette (contrast, colour-blindness), summary
- [x] 3. Web, screen: lazy verdict route, sheet, stage, overlay, outline fallback, controls, legend,
      strings EN/FR, Listen
- [x] 4. Web, MapLibre: style, PMTiles protocol, the map started during Loading
- [x] 5. Browser tests: detents, resilience (tiles, WebGL, map key, library), provenance, accessibility, frame,
      parity, pan; budgets; performance run; pictures
- [x] 6. Docs: decision record 0003, DESIGN-LOCK amendment, README, HURDLES, TECH-FACTS
- [x] 7. Independent adversarial review; fixes (14 defects and the smaller ones, each with a test)
- [x] 8. Report

## Baseline (commit 6b77886)

- Engine 166 passed. Web unit and browser: see the log below.
- Main bundle `index-*.js`: 576,152 bytes, 175,860 gzip -9.

## Log

- 02:40 Read the repo. No earlier PLAN-NOTES.md: the mission text is the plan.
- 03:05 Port 4173 is held by another lane: `E2E_PORT` added to `playwright.config.ts` (default unchanged).
- 03:20 The machine is shared with the other lanes and close to its memory limit (commit 26 to 30 of 31.7 GB,
  under 0.1 GB of RAM free). At the untouched commit, 9 of the first 145 browser tests failed for that reason
  alone (timeouts, a crashed browser). Browser tests are run with `E2E_WORKERS=2`, a spec at a time.
- 03:25 A background test run that hit the tool's 10-minute limit kept running without its server: found and
  stopped (my own processes only). Long runs are now started detached, with a log.
- 03:40 Engine green (223). Long Lake has no CWFIS record in the recorded data: no flame for it, by the data.
- 04:20 Three commits: port, engine, web groundwork (web unit 369).
- 04:50 First render in a real browser: MapLibre 6 draws the tiles; names drawn with Inter and no glyph files.
- 05:15 Decided alone, after looking at small phones: the credit sits in the map's bottom-left corner and gives
  way to Recentre once the map is moved (OSM's guidelines allow a credit to collapse on map interaction when it
  stays one tap away); on a map too small for everything the zoom buttons, then the credit, give way to the
  marks; a strip of map under 84 px is not shown (the sheet covers it); the sheet may stand over the top bar.
- 05:40 `glance.spec.ts` adapted to the sheet: 116 passed.
- 05:50 Vercel, read-only check of the live site: a byte range of a static file answers 206 with Content-Range;
  a path with no file answers 206 with the app's own page (text/html). The app treats that as "the tiles did not
  load". `vercel.json`: `/tiles/` and `/vendor/` cached for good (their names carry their versions).
- 06:20 The independent review came back: Call 911 and the map's separation from the verdict hold; fourteen
  defects elsewhere, the worst being the opening frame with no fire in range (pushed under the sheet by
  MapLibre's `maxBounds`), the top bar out of reach with only the card showing on small screens, and "No
  satellite saw fire" said when NASA FIRMS had not answered.
- 06:25 ECCC's API asked (read-only) for real zone outlines: 80 to 801 points each today, simplified in 1 to
  11 ms. One is kept as a test fixture.
- 07:00 Every finding fixed, each with a test. Engine 228 passed; web unit 383.
- 07:27 Browser tests: 715 of 716 in one run; the one that failed (an existing test that starts the full
  Chromium) timed out starting the browser on this crowded machine, and passes alone. Committed.
- 07:35 Timings with the map started during Loading: 1.8 s. The marks showed why: the library and the first
  tiles could not both arrive within the Loading screen, and the verdict screen waited a turn before taking
  the map. The library now starts on the Location screen; the ready map is taken on the first pass; the
  hidden "Why?" content is no longer drawn again each time the screen measures itself.
- 08:05 Timings: see the table above. The machine's load decides the figure as much as the code does.
- 08:20 Map tests on the final code: 61 of 61. Pictures of every screen retaken (`web/screenshots/`, not in
  git): 76, the map's are 30 to 40, in English and French.
- 09:36 TECH-FACTS.md regenerated; its own run of every suite on the final code: engine 228 passed, web unit
  383 passed, browser 713 passed and 4 failed. The machine had no free memory during that run (0.0 GB, the
  processor at 99%). The four: "Keep it on your phone: a tap outside closes it", "Listen, FR, Told to leave",
  "the file opens but its tiles fail" (map) and "the same manifest without its icons is not installable" (an
  existing test that starts the full Chromium). Run again on their own, the first three pass; the fourth
  could not start its browser this time, and passed alone at 07:30. None of the four fails for a reason in
  the code that could be found. TECH-FACTS.md says what its run saw.
- 10:10 A second regeneration, one browser at a time, was stopped part way: two other tests (in glance.spec)
  had already timed out under the same load. Their group passes alone, 49 of 49. TECH-FACTS.md is left as the
  09:36 run wrote it; a run on a quiet machine (`uv run python -m scripts.tech_facts`, from `engine/`) is the
  way to a clean count.

---

# Plan notes: Feature 4, "Protect your home"

Overnight lane, branch `feat/protect`, worktree `sof-protect`. Nothing is pushed. Browser tests run on port 4176
(`E2E_PORT=4176 npm run e2e`, from `web/`). The decisions are in `docs/decisions/0004-protect.md`; the report for the
owner is `docs/reports/0004-protect.md`.

## What it is

One button on the verdict screen, "Protect your home from smoke", opens a screen of its own (`/protect`):

1. The air quality band the app already has (ECCC's AQHI category), in words, with who measured it and when.
2. Four icon tiles, in the order a person can do them (no cost and at once first). The label of each is the opening
   words of Health Canada's sentence; a tap shows the whole sentence and its source (who, when, link). The line on heat
   shows under the windows tile without a tap.
3. A switch, "I have asthma or COPD", off by default, kept on the device only, with "Forget this". On, it shows ECCC's
   message for the at-risk population at the current band.

## Why a screen of its own (North Star)

The brief asks for a row on the verdict screen. The North Star, sent after, asks for one decision per screen, text of
18 px or more that holds at 200% zoom, Listen on every screen and a forgiving Back. Four tiles, a switch and a second
Listen button on the verdict screen fail the first three. A screen of its own meets all four, and the verdict screen
gains one button and two lines of code.

## Sources (retrieved 2026-10-04)

| Id | Who | Page | Modified |
|---|---|---|---|
| `eccc-aqhi-messages` | ECCC | Air Quality Health Index Messages / Messages de la Cote air santé | 2026-09-03 |
| `hc-smoke-heat` | Health Canada | Wildfire smoke with extreme heat | 2025-07-30 |
| `hc-air-cleaner` | Health Canada | Using a portable air cleaner to improve indoor air | 2021-12-24 |

The two Health Canada pages are the fact sheets published as "Wildfire smoke 101: …" until 2024; the 2024 editions
dropped the prefix (the Internet Archive's 2022 and 2023 copies carry it).

## Tiles

| # | Tile | Source sentence |
|---|---|---|
| 1 | Windows and doors | "Keep windows and doors closed as much as possible. …prioritize keeping cool." |
| 2 | Exhaust fans | "Limit the use of exhaust fans, such as bathroom fans." |
| 3 | Portable air cleaner | "Use a certified portable air cleaner that can filter fine particles." and how to get the most out of it |
| 4 | Air filter | "Use the highest quality air filter that your ventilation system can handle…" |

Left out, with no tile:

- **HVAC on recirculate, fresh-air intake off.** Not in the current fact sheets. The 2023 edition said "Use
  recirculation settings on your HVAC system"; the 2024 edition removed it. Health Canada's recirculation guidance
  today is for staffed public buildings only.
- **A clean room.** The fact sheets do not use the term. The nearest sentence, "operate your portable air cleaner in a
  room where you spend a lot of time", is shown inside tile 3.

## Rules held by tests

- Every sentence of advice on the screen, and every sentence Listen says of it, is found word for word in its saved
  source file, on one line of it. Only the apostrophe's shape and the kind of space may differ (the app's typography).
- A tile's label is the opening of its first sentence, word for word, with the words that limit the advice.
- Low risk is never an all-clear: the area-wide note stands beside the at-risk message. A fire under 25 km: the
  verdict's notice comes first.
- The switch: off by default; one key in `localStorage`; never a cookie, the address or the app's session state; the
  same network requests with it on and off; "Forget this" removes the key.
- Listen reads the at-risk message only with a voice that works on the device; with none it says what it says with
  the switch off.
- Text 18 px or more; targets 56 px or more; no sideways scroll at 320 px, nor at twice the text size.
- Low risk and no reading: calm (outlined, dashed). Moderate and above: filled. The band is always a word too.

## Steps (test first)

1. Baseline: web unit 294 passed; browser 632 passed, 12 failed by timeout (see "Blocked").
2. `web/scripts/protect-sources.mjs`: fetch the pages, save their text with URL, date modified, retrieval date.
3. Unit tests (red), then `content.json`, `sources.json`, `view.ts` (pure), `atRisk.ts` (the device store).
4. Browser tests (red), then `Protect.tsx` (the screen), `ProtectLink.tsx` (the verdict's button), icons, route.
5. Green: unit, browser (4176), type check. Commit locally.
6. Independent review of the diff (medical overreach, privacy, wording): 13 findings, listed in the report with what
   was done for each; fix; commit.
7. Decision record, the report with screenshots and demo script; commit.

## Shared files touched (for tomorrow's merge)

Listed in the report with line numbers: `web/src/screens/Verdict.tsx`, `web/src/App.tsx`,
`web/src/components/TopBar.tsx`, `web/src/listen/ListenButton.tsx`, `web/playwright.config.ts`, `README.md`.
Not touched: `styles.css`, the strings files, `verdict/view.ts`, the existing specs, `package.json`, `DESIGN-LOCK.md`,
`TECH-FACTS.md` (generated; regenerate once after the merge).

## Blocked, and what was done instead

- **canada.ca stalls a request that names a browser without being one.** The fetch script uses curl under its own name.
- **The machine was shared with four other lanes' test runs** (4 cores, 8 GB, under 100 MB free). Browser tests timed
  out for reasons that have nothing to do with the code: before any change here, 12 of the 644 existing browser tests
  failed by timeout, and 7 of those 12 passed when run again alone. A test worker also died once, out of memory. The
  new specs wait longer than the existing ones (`TEST_TIMEOUT`, `expect` in `e2e/protect.ts`), and were run with one
  worker. Run the whole suite again on a quiet machine before the merge.
- **French, low risk, general population.** ECCC's page reads "idéale pour les activités en plein air." where the
  app's existing string says "Qualité de l’air idéale pour les activités en plein air." Not shown by this feature.
  Reported, not changed: it is in the shared strings file.

---

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
