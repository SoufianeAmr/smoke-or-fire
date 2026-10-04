# 0006. Best time to air out your home

- **Status:** accepted on `feat/clear`, Oct 4, 2026. Decided alone; every decision below is open to the owner's review.
- **Feature:** ECCC's FireWork smoke forecast turned into one answer, "Best time to air out your home: Mon 5 to 8 a.m.",
  with the 48 hours it comes from under it.

## Context

The verdict says where the smoke comes from. Its advice says "keep windows and doors closed as much as possible"
(Health Canada). The next question a person has is when they can open them again. Environment and Climate Change
Canada (ECCC) forecasts wildfire smoke hour by hour with its FireWork model and publishes it as maps of North America:
official, but not an answer for one home.

The North Star asks for one decision per screen, plain words, text of 18 px or more that holds at 200% zoom, Listen on
every screen, every fact sourced with ECCC first, "not checked" instead of a guess, nothing that discourages calling 911,
no personal data leaving the phone, English and French as equals, and our own look.

## Decisions

### 1. The source: ECCC's own forecast, from MSC GeoMet, no key

| | |
|---|---|
| Service | MSC GeoMet, WMS 1.3.0: `https://geo.weather.gc.ca/geomet` |
| Layer | `RAQDPS.Sfc_PM2.5-WildfireSmokePlume`: "Total concentrations associated with forest fire and vegetation plumes: surface PM2.5 [kg/m³]" |
| Model | Regional Air Quality Deterministic Prediction System with wildfire emissions (FireWork): a run at 00 and 12 UTC, hourly, 72 hours ahead, 10 km grid |
| Request | `GetFeatureInfo`, one point and one hour: the middle pixel of a 3 × 3 map 0.1° wide (`engine/smoke_engine/feeds/sources.py`, `firework_params`) |
| Answer | GeoJSON: `value` (kg/m³), `class` (the class of ECCC's legend, e.g. `1 - 10 [ug/m3]`), `time`, `dim_reference_time` (the model run) |
| Licence | Environment and Climate Change Canada Data Services End-use Licence. "Data Source: Environment and Climate Change Canada" |
| Live sample | `data/samples/smoke-forecast-moncton.json`: GeoMet's 48 answers for Moncton, fetched 2026-10-04 06:24 UTC, with the two request addresses. Written by `engine/scripts/fetch_smoke_forecast.py`; read by the tests |

Why this door and not another:

- MSC's OGC API (`api.weather.gc.ca`), which the app already uses for alerts and the AQHI, has no collection for this
  model (checked Oct 4, 2026).
- The MSC Datamart has the same forecast as GRIB2 files of all North America. Reading them needs a GRIB decoder on the
  engine's free 512 MB service, for one number per hour. GeoMet answers that number directly.
- ECCC's documentation still names the layer `RAQDPS-FW.SFC_PM2.5-DIFF`; GeoMet answers "Layer not available" to it.
  The layer above is the one GeoMet's capabilities list today (see HURDLES.md).

What GeoMet does that the code has to know (each is a test):

- One hour per request: a range or a list of times is refused. 48 hours are 48 requests.
- An error comes back with HTTP 200, as XML. A point outside the model's domain comes back as `{}`.
- It serves the last two days of runs. Asked with no run, it answers from the newest.

### 2. The scale is ECCC's, read from ECCC's answer

Each hour's level is the class ECCC's own answer names (`class`), from the legend of the layer's default style
(`PM2.5_0to100ugm3_Dis`): under 1 µg/m³ nothing is drawn, then 1 to 10, 10 to 20, and so on to 90 to 100, and
100 or more. That is level 0 (no smoke shown) to level 11. The engine does not classify the value itself: it checks
that the value sits in the class ECCC gave it. A change of units upstream (the value is in kg/m³, the legend in µg/m³)
would fail that check and give "not available", not a wrong bar.

The bars use the legend's colours, read from ECCC's legend image on Oct 4, 2026 (`ECCC_COLOURS` in
`web/src/airout/view.ts`). The screen links the legend itself:
`https://geo.weather.gc.ca/geomet?version=1.3.0&service=WMS&request=GetLegendGraphic&sld_version=1.1.0&layer=RAQDPS.Sfc_PM2.5-WildfireSmokePlume&format=image/png&STYLE=PM2.5_0to100ugm3_Dis`
(`&lang=fr` for French).

ECCC's public FireWork maps (weather.gc.ca/firework) draw the same classes up to 100 in another palette, with greens.
The app uses the layer's own legend: it is the one the answers name, and it has no green (DESIGN-LOCK: no green, smoke
is never "all clear"). A test holds that no colour of the scale is green.

ECCC's legend has numbers, no words. The app adds none of its own ("light", "moderate", "heavy" would be ours, not
ECCC's): a level is "no smoke" or "smoke level 3 of 11", with ECCC's numbers one tap away.

### 3. The rule

In `engine/smoke_engine/smoke_forecast.py`, `best_window`. The 48 hours start with the hour of the check.

1. Look for hours at level 0: ECCC's map shows no smoke there.
2. The best time is the first stretch of level 0 that lasts 3 hours or more, from its first forecast hour to its last
   (4 hourly values in a row).
3. If there is none, do the same with hours at level 1 or lower (under 10 µg/m³: ECCC's lowest class).
4. If there is none either: no useful window. "Keep windows closed for now".

| The forecast | The answer |
|---|---|
| Smoke until Monday 5 a.m., clear until 8 a.m., smoke again | Mon 5 to 8 a.m. |
| Clear for 2 hours, then smoke | too short: the next stretch, or none |
| Never clear, but the lowest class from 10 p.m. to 6 a.m. | Sun 10 p.m. to Mon 6 a.m., and the screen says "a little, not none" |
| Light smoke soon, clear tomorrow | tomorrow: clear comes before light |
| Clear from 11 a.m. to the forecast's last hour | From Sun 11 a.m. (the end is not known) |
| Clear now | Now, if the smell is gone |
| 10 µg/m³ or more for 48 hours | Keep windows closed for now |

Why these numbers:

- **Level 0 first, level 1 at most.** The only thresholds are ECCC's own class limits. No health threshold is invented.
  Level 1 is allowed because in a smoke episode of several days the air is never at zero, and Health Canada's
  guidance for buildings is to "draw in fresh air when the smoke plume abates". The screen then says the smoke is "a
  little, not none".
- **3 hours.** A plume's forecast hour can be off. A break of an hour or two is not worth planning around; 3 hours
  leaves room on both sides. The number is the engine's (`rules.minWindowHours`) and is shown from the engine's answer.
- **The first stretch, not the longest.** The person wants to know when they can open the windows next. The strip
  shows the rest.
- **The end is the last low hour.** If 8:00 is clear and 9:00 is not, the smoke arrives in between: the answer says
  "to 8", not "to 9".
- **No preference for daytime.** The strip marks day and night so the person can choose.

The rule is informational: it is computed after the verdict and never changes it
(`test_the_forecast_never_changes_the_verdict`).

The rule is ours, not ECCC's, and the screen says so in one sentence, with the engine's number: "How the best time is
chosen: the first 3 hours or more in a row with the least smoke in ECCC's forecast. It is this app's reading of the
forecast, not advice from ECCC."

### 4. "Now", when the person smells smoke

The person opened the app because they smell smoke. If the forecast shows none now, either the model is wrong or the
smoke comes from close by, which the model does not know. The app does not say "open your windows now". It says
**"Now, if the smell is gone"**, and under it: "Still smell smoke? Keep windows closed. A forecast can be wrong, and
smoke from close by is not in it." Every other window carries: "A forecast can be wrong. If you see or smell smoke
then, keep windows closed."

The screen also says what the forecast leaves out: it only includes smoke from wildfires already detected (FireWork
takes its fires from the Canadian Wildland Fire Information System), and it ends on "If you see flames or a smoke
column, call 911". The 911 bar is on the screen, as everywhere.

### 5. Never a guess

The answer has three states: `window`, `none`, `not_available`. It is `not_available` unless all 48 hours were read for
certain:

- every hour answered, for the hour asked, on the right layer, with one value;
- every hour from the same model run, made before the hours it forecasts. The first hour's answer names the newest run
  and the other 47 are asked for that run by name, so a run published in between cannot mix in;
- every value a number, zero or more, sitting in the class ECCC gave it.

`test_a_forecast_that_cannot_be_read_for_certain_is_not_available_and_the_verdict_is_still_given` holds 22 such cases,
and `test_when_geomet_fails_live_says_not_available_and_still_gives_the_verdict` 7 more at the HTTP level. In each the
verdict is still given. The web app reads a missing field (an older engine) as not available too.

"Not available" on screen: "The smoke forecast could not be read just now. That does not mean the air is clear."

### 6. The replay says "forecast not available"

GeoMet keeps a model run about two days (on Oct 4, 2026 its capabilities listed the runs from Oct 2 00 UTC to Oct 4
00 UTC). ECCC's long archive of the Datamart (`hpfx.collab.science.gc.ca`) went back to Aug 14, 2026. The forecast of
Aug 25, 2025 cannot be fetched from either, so the replay has none, and says: "This is a replay of Aug 25, 2025. Smoke
forecasts are kept for about two days, so there is none for that day."

So that the next replay can have one, `engine/scripts/fetch_smoke_forecast.py --towns all --out
../data/replay/<day>/smoke-forecast.json` records the forecast on the day itself, and the replay feed reads that file
(`test_a_replay_day_recorded_with_its_forecast_gives_the_best_time`). A recorded forecast answers only for its own
place and hours.

### 7. Privacy and cost

- The browser never calls ECCC. It asks the engine for the verdict, as before, with the spot and nothing else
  (a browser test watches every request).
- The engine sends ECCC the spot rounded to 0.1° (about 8 by 11 km, one cell of the model's 10 km grid), never the
  exact one. The forecast is the same anywhere in a cell.
- 48 requests, 6 at a time: about 1 second. 8 seconds at most for all of them, 5 for each; past that, "not available"
  and the verdict goes out. A failed forecast is not kept.
- A cell's forecast is kept one hour, so neighbours share it: at most 24 fetches a day for a cell. MSC's usage policy
  asks to be contacted at 86,400 requests a day: that is 1,800 forecasts a day.
- No key, no new library, no new service to run. The engine names itself in its `User-Agent`, as the policy asks.

### 8. One tile on the verdict, a screen of its own

The verdict screen gains one tile under "Why?": the question, small, and its one answer, large. A tap opens
`/air-out`: the answer as the screen's title, what the forecast shows, the caution, then the strip, then the sources.
The card, the badges and "Why?" keep their places (a browser test holds it on a 375 × 667 phone).

A strip of 48 bars, a legend, the sources and a second Listen button on the verdict screen would have broken "one
decision per screen". On its own screen the answer has Listen, Back and the 911 bar.

**When nothing explains the smoke, the tile waits behind "Why?"**, as its last block. On that verdict Call 911 is the
screen's main action and must be the largest thing to tap (DESIGN-LOCK, and a test in `glance.spec.ts` that the first
version of the tile broke: the tile was larger than the button). It is also where the forecast says least: it only
knows fires already detected, and this smoke is from none of them. `airout.spec.ts` holds both: Call 911 the largest
target as the screen opens, and the tile one tap away.

The mark beside the answer tells its state by shape as well as by words, as the badges do: an open window in a filled
circle (a best time), a shut window in a filled square (keep windows closed), a window in a dashed circle (not
available).

### 9. The strip

- **One row for each day, 24 clock hours across** ("Today", "Tomorrow", then the weekday). The same hour sits in the
  same place on every row, so "tomorrow morning" is found at a glance, and nothing scrolls sideways: no gesture is
  needed. Under each row: 6 a.m., noon, 6 p.m.
- **A bar for each hour.** ECCC's colour for its class, a dark outline (a pale yellow bar must show on white), a
  height that rises with each class, and a pattern by ECCC's colour families: dots (1 to 30), lines (30 to 60),
  cross-hatching (60 to 100), solid (100 or more). No smoke is a low hollow box. Colour is never alone.
- **Day and night:** a band over the bars, pale with a sun or navy with a moon, and both in the legend. The sun's
  position is computed in the engine with NOAA's general solar position equations
  (`sun_is_up`), checked against Open-Meteo's sunrise and sunset for Moncton, Edmundston and Halifax: within 3 minutes.
- **The best time:** a navy outline around its bars, named in the legend.
- **Plainly a forecast:** "A forecast, not a measurement: Environment and Climate Change Canada's FireWork model",
  then the model run and when ECCC was read, in Atlantic time.
- **For a screen reader** the strip is one picture, named with the answer. "Show the forecast as a list" gives the
  same hours in words to everyone: "Sun 6 to 10 a.m.: smoke level 1 of 11 (1 to 10 µg/m³)". "PM2.5" and "µg/m³"
  appear only there.
- **Clock changes:** the hour said twice in November has two bars in its place; the hour that does not exist in March
  has none.

### 10. Words

- "Smoke", "smoke level", never "PM2.5" on the first view (a unit test and a browser test hold it).
- Times follow the Canada.ca style: "5 to 8 a.m.", "noon", "midnight", "to" in place of a dash; in French "5 h à
  8 h", "midi", "minuit". A stretch that starts at midnight starts at "12 a.m." ("0 h") of the new day; one that ends
  at midnight ends at "midnight" of the day it started. Weekday names are in the strings files, not the browser's, so
  every phone says "Sun", not "Sun." on one and "Sun" on another.
- Times are Atlantic time, as everywhere in the app, and the screen says so.
- The advice to air out is Health Canada's: "Once outdoor air quality improves, ensure good indoor air quality by: …
  opening doors and windows to replace indoor air with fresh outdoor air" (see Sources). The screen says it in plain
  words, names Health Canada and links the page.
- Listen says the time in full ("Monday, from 5 to 8 a.m."), the caution, how to read the chart, who made the
  forecast, and ends on how to call 911, as every screen does. Numbers to call are spelled out for the voice.

### 11. The link to "Protect your home"

"Protect your home" (`feat/protect`, record 0004) is a screen at `/protect`, in `web/src/protect/Protect.tsx`. Its
first tile is "Keep windows and doors closed": this screen is the other half of that advice.

- From here to there: `/air-out` shows a "Protect your home" link above Health Canada's advice **once
  `src/protect/Protect.tsx` is in the app**, and not before (`import.meta.glob` finds it at build time). Never a link
  to nowhere. `e2e/airout.spec.ts` has one test that turns over with it: today it holds that there is no link; once
  the file is there, that the link opens `/protect`.
- From there to here: `AirOutTile` (`web/src/airout/parts.tsx`) takes `airOutView(result, lang)` and links to
  `/air-out`. It can sit under the windows tile on the Protect screen. That edit belongs to the merge, not to this
  branch.

## Sources

Retrieved 2026-10-04.

| What | Publisher | Address |
|---|---|---|
| The forecast | ECCC, MSC GeoMet | https://geo.weather.gc.ca/geomet (layer `RAQDPS.Sfc_PM2.5-WildfireSmokePlume`) |
| The model: runs, hours ahead, grid | ECCC, MSC Open Data | https://eccc-msc.github.io/open-data/msc-data/nwp_raqdps/readme_raqdps_en/ and https://eccc-msc.github.io/open-data/msc-data/nwp_raqdps-fw/readme_raqdps-fw_en/ |
| The legend | ECCC, MSC GeoMet | the `GetLegendGraphic` address in decision 2 |
| The public maps | ECCC | https://weather.gc.ca/firework/index_e.html, https://meteo.gc.ca/firework/index_f.html |
| Licence | ECCC | https://eccc-msc.github.io/open-data/licence/readme_en/ (version 2.1.1) |
| Usage policy | ECCC, MSC Open Data | https://eccc-msc.github.io/open-data/usage-policy/readme_en/ |
| Airing out after smoke | Health Canada, "Wildfire smoke, air quality and your health: Protecting your physical and mental health", modified 2026-07-20 | https://www.canada.ca/en/services/health/healthy-living/environment/air-quality/wildfire-smoke/protecting-your-physical-mental-health.html (French: https://www.canada.ca/fr/services/sante/vie-saine/environnement/qualite-air/fumee-feux-foret/protegez-votre-sante-physique-mentale.html) |
| Fresh air when the plume abates | Health Canada, "Guidance for Cleaner Air Spaces during Wildfire Smoke Events", modified 2020-11-13 | https://www.canada.ca/en/health-canada/services/publications/healthy-living/guidance-cleaner-air-spaces-during-wildfire-smoke-events.html |
| The sun's position | NOAA Global Monitoring Laboratory, "General Solar Position Calculations" | https://gml.noaa.gov/grad/solcalc/solareqns.PDF |

## Known limits

- The forecast only knows fires already detected, and its hour for a plume can be off. The screen says both.
- All 48 hours must come from one run. If ECCC misses a run, the newest one no longer reaches 48 hours ahead and the
  answer is "not available" until the next. A shorter strip was not built.
- Times are Atlantic time for every place on the wind grid, including the parts of Quebec and Maine on Eastern time.
- French and English wording was written with care and has not been reviewed by a translator or by ECCC.
- The shared top bar (Back, Listen, EN/FR) is about 310 px wide and is not changed by this branch. On a phone zoomed
  to 200% (195 px wide) it is cut off on the other screens. On this screen two CSS rules, scoped to it, put its three
  controls one under the other below 300 px, each whole and 56 px tall; the screen's own content holds at that width
  and at twice the text size (browser tests). The other screens need the same care.
- `TECH-FACTS.md` is generated and runs every test suite: regenerate it once after the merge
  (`engine/scripts/tech_facts.py` already writes the forecast's row and rule).
