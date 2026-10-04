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
