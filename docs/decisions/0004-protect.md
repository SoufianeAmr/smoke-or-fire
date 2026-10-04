# 0004. Protect your home

- **Status:** accepted on `feat/protect`, Oct 4, 2026. Decided alone overnight; every decision below is open to the owner's review.
- **Feature:** what a person can do at home in the next five minutes, in icons, tailored only if they choose.

## Context

The verdict says where the smoke comes from. It did not say what to do at home, except behind "Why?", in one paragraph.
The brief asked for three to four icon tiles on the verdict screen, a private "I have asthma or COPD" switch, and
advice that is sourced, never invented. The North Star, sent after the brief, asks for one decision per screen, text of
18 px or more that holds at 200% zoom, Listen on every screen, a forgiving Back, ECCC data first, and nothing personal
leaving the phone. An independent review of the first version then asked for the changes marked "(review)" below.

## Decisions

### 1. A screen of its own, one button on the verdict

"Protect your home from smoke" is a screen at `/protect`. The verdict screen gains one button after "Why?".

Four tiles, a switch and a second Listen button on the verdict screen would have broken "one decision per screen", and
the verdict's rule that Call 911 is the largest thing to tap when nothing explains the smoke. On its own screen the
feature has room for 18 px text, its own Listen, the usual Back, and the 911 bar.

- The title and the button say "from smoke" (review). Beside "The fire is close to you", "Protect your home" alone
  could be read as defending the house from the fire.
- The button is quiet at low risk (white, as "Why?") and filled navy from moderate up. Its name takes two lines at
  most, so Call 911 stays the largest target, down to a 320 px phone.
- With no reading, the button and the tiles follow the verdict, as the verdict's own advice does: clear when smoke is
  likely or possibly drifting in, quiet when nothing explains it (review).
- Opened by its address with no check made, the screen goes back to Check, as the verdict does: it never shows a band
  it does not have.
- When the fire is under 25 km away, the verdict's notice ("Follow official instructions…") and its link to "Told to
  leave" come first on the screen, and first in Listen (review). Advice about staying in never stands alone there.

### 2. Every sentence of advice is quoted, and a test holds it

- The pages are saved as text in `web/src/protect/sources/`, with their address, their "date modified" and the day
  they were retrieved. `web/scripts/protect-sources.mjs` fetches them again; `sources.json` holds what the screen cites.
- `content.json` holds each sentence with the id of its source. No advice is written in a component.
- `view.test.ts` fails if a sentence is not in its source file, on one line of it (one paragraph, list item or table
  cell). `protect.spec.ts` checks the same thing on the rendered screen, and that every other word on the screen is one
  of the screen's own strings.
- "Word for word" allows two differences, both the app's typography: a curly apostrophe for a straight one, and a
  no-break space for a space. Letters, case, words and punctuation are compared as they are.
- A tile's label is the opening of its first sentence, word for word, capital included, and it keeps the words that
  limit the advice: "as much as possible", "such as bathroom fans", "that your ventilation system can handle" (review).
- The screen's own words (title, hints, the switch, what is saved) give no advice. A test looks for instructions in
  them.

### 3. Sources

Retrieved 2026-10-04.

| Id | Publisher | Page | Date modified | Address |
|---|---|---|---|---|
| `eccc-aqhi-messages` | Environment and Climate Change Canada | Air Quality Health Index Messages | 2026-09-03 | https://www.weather.gc.ca/airquality/healthmessage_e.html |
| | | Messages de la Cote air santé | 2026-09-03 | https://www.meteo.gc.ca/airquality/healthmessage_f.html |
| `hc-smoke-heat` | Health Canada | Wildfire smoke with extreme heat | 2025-07-30 | https://www.canada.ca/en/health-canada/services/publications/healthy-living/combine-wildfire-smoke-heat.html |
| | Santé Canada | Fumée des feux de forêt et chaleur extrême | 2025-07-30 | https://www.canada.ca/fr/sante-canada/services/publications/vie-saine/effets-combines-fumee-feux-foret-chaleur.html |
| `hc-air-cleaner` | Health Canada | Using a portable air cleaner to improve indoor air | 2021-12-24 | https://www.canada.ca/en/health-canada/services/air-quality/indoor-air-contaminants/choosing-portable-purifier.html |
| | Santé Canada | Utiliser un purificateur d’air portatif pour améliorer l’air intérieur | 2021-12-24 | https://www.canada.ca/fr/sante-canada/services/qualite-air/contaminants-air-interieur/choisir-purificateur-portatif.html |

The two Health Canada pages are the fact sheets published as "Wildfire smoke 101: …" until 2024 ("Combined wildfire
smoke and heat", "Using an air purifier to filter wildfire smoke"). The 2024 editions dropped the prefix; the Internet
Archive's copies of February 2022 and June 2023 carry it. The air cleaner page says "Published: 2024-05-31" in its text
and gives 2021-12-24 as its date modified; the screen shows the date modified, as the page does.

Canada.ca's terms, which the ECCC weather pages link to as well, allow non-commercial reproduction if the copy is
accurate, names the title and the author, and says where the original is
(https://www.canada.ca/en/transparency/terms.html, modified 2025-09-05). Each quoted passage is followed by its
publisher, its page's title, its date modified and a link to the page. No official symbol is used.

### 4. Four tiles, in the order a person can do them

| # | Label | Quoted from | Why here |
|---|---|---|---|
| 1 | Keep windows and doors closed as much as possible | `hc-smoke-heat` | No cost, done at once. Health Canada gives this advice with a second sentence, "When there’s an extreme heat event occurring with a wildfire smoke event, prioritize keeping cool." That sentence shows under the label without a tap, so the label is never read alone. |
| 2 | Limit the use of exhaust fans, such as bathroom fans | `hc-smoke-heat` | No cost, done at once. The whole sentence is the label: "limit fans" alone would work against keeping cool. |
| 3 | Use a certified portable air cleaner | `hc-smoke-heat`, `hc-air-cleaner` | For someone who has one. Its details are the page's list: doors and windows closed, a room where you spend a lot of time, the manufacturer's instructions. |
| 4 | Use the highest quality air filter that your ventilation system can handle | `hc-smoke-heat` | Needs a filter and a ventilation system. |

The order is ours, by effort. Health Canada does not rank these, and the screen does not say it does: there are no
numbers on the tiles.

**Left out, because no current source says it:**

- **HVAC on recirculate, fresh-air intake off.** The 2023 edition of "Wildfire smoke and your health" said "Use
  recirculation settings on your HVAC system to prevent smoke from entering your home." The current edition (modified
  2025-08-12) does not. Health Canada's recirculation guidance today is in "Guidance for Cleaner Air Spaces during
  Wildfire Smoke Events", for public buildings with staff who watch the air and bring fresh air back in. Quoting a
  withdrawn sentence, or guidance written for another setting, would be advice beyond the sources. Tiles 2 and 4 are
  what the current fact sheets say about a home's ventilation.
- **A clean room.** The fact sheets do not use the term. The nearest sentence, "operate your portable air cleaner in a
  room where you spend a lot of time", is shown inside tile 3. It has no tile of its own.

### 5. The band is ECCC's, in words

The screen opens on the AQHI category the engine already returns, as "Air quality: high risk". A tap shows the
reading, the station, when it was measured, ECCC as the source, and a link. "AQHI" is not on the first view.

- Low risk: outlined. Moderate and above: filled navy. No reading in the last 2 hours: a dashed outline and "no recent
  reading", never a level; no message is picked.
- The level is always a word and a needle position on the gauge, never the fill alone.
- No red, orange or amber anywhere on the screen: red stays Call 911's.
- When nothing explains the smoke, the app's existing note is shown without a tap: the reading is area-wide, and smoke
  from a nearby source can be much stronger.

### 6. The switch is health information, so it stays on the device

- Off by default. On, it shows the band, then "Official message for people at risk:", then ECCC's message for the
  at-risk population at that band, ECCC's own line about heart or breathing problems and a doctor's advice, and ECCC's
  page. The message is in the screen's ordinary weight: a quoted line, not a headline.
- **Low risk is never an all-clear** (review). ECCC's message at low risk is "Enjoy your usual outdoor activities."
  A person with COPD who smells smoke must not read that alone, so the app's area-wide note stands beside it at low
  risk, on every verdict, and Listen says it after the message.
- Kept as one entry in `localStorage` (`smoke-or-fire.protect.at-risk` = `on`). Off is no entry: nothing says "not at
  risk". Not a cookie (a cookie is sent with every request), not the address, not the app's session state.
- "Forget my answer" removes the entry; so does switching off. The screen then says the answer is no longer on the
  device, and keeps saying it until the switch is turned on again.
- The screen claims only what the device did (review). Where the browser refuses to store, the switch works while the
  screen is open and the screen says it will be forgotten on leaving it. Where the browser refuses to remove, the
  screen says so and how to clear the site's data.
- Tests: the taps send no request; the same visit with the switch on and off makes the same requests, the engine's
  included, and no request names it; no cookie exists. `atRisk.test.ts` also reads the code for the usual ways out: a
  tripwire, not the proof.
- Turning the switch on fetches no font file: the at-risk strings use the weights the screen already shows, and no
  character outside the Latin subset the page has already loaded.

Asthma and COPD are breathing problems; ECCC's page says "People with heart or breathing problems are at greater
risk", and that sentence is shown with the message. The switch is narrower than ECCC's group: see "For the owner" in
the report.

### 7. Listen

The screen's Listen button reads, in order: the title; the fire-close notice when there is one; ECCC's band (and the
area-wide note); then "Here is Health Canada’s advice…" and every tile's sentences as written; then the at-risk part;
then the 911 line the verdict uses. The band is said before Health Canada is named, so it is never put under its name
(review). Every sentence said is one of the screen's own or is in a source file; a test holds that too.

The at-risk part is where speech could leak. In Chrome and Edge the voices the app prefers ("Google …", "… Online
(Natural)") are voice services: the words go to a server to be spoken. So:

- On this screen Listen uses a voice the browser says works on the device (`SpeechSynthesisVoice.localService`)
  whenever there is one, switch on or off (review): which voice reads tells nothing. `ListenButton` takes `onDevice`
  for this and says nothing if the voice has gone by the time of the tap.
- The at-risk message is read only by such a voice. With none, Listen says exactly what it says with the switch off,
  and the message stays on the screen. The switch-off words only say that the switch exists.
- The voice names whose message it is ("Environment and Climate Change Canada’s message for people at risk"). It never
  says the person has a condition, nor that their switch is on (review): a phone read aloud in a waiting room should not
  announce either.
- Flipping the switch stops a reading when what is read changes with it.

## Consequences

- When Health Canada or ECCC changes a page, `node scripts/protect-sources.mjs` (from `web/`) saves the new text, and
  the tests name every sentence that is no longer in it. Someone then decides what to quote.
- The verdict screen is one button longer. On a small phone the button is below the 911 bar as the screen opens.
- Labels are long, because they are Health Canada's words with their limits, and longer in French. The tiles are one
  under the other so that they fit, at any text size.
- `ListenButton` and `TopBar` gained one optional prop each. Other screens are unchanged.

## Alternatives considered

- **The tiles on the verdict screen, as the brief described.** Rejected after the North Star: see decision 1.
- **Short invented labels ("Close windows"), then short quoted ones ("Keep windows and doors closed").** Rejected: a
  label is advice a person may act on without a tap, and the short quotes dropped the words that limit it.
- **Compact tiles, two or four across.** Rejected: French words such as "ventilateurs" do not fit at 18 px, and nothing
  holds at twice the text size.
- **Showing ECCC's general-population message when the switch is off.** Not done: the brief asks for the at-risk
  message when on, and the general message is already in "What to do".
- **A Listen button for the feature on the verdict screen.** Rejected: two Listen buttons on one screen, and one voice
  stopping the other.
- **The taller Call 911 bar on this screen after an unexplained verdict.** Not done: the screen keeps the slim bar the
  other screens have. Open to the owner.

## Found on the way, not changed

- ECCC's French page reads "idéale pour les activités en plein air." for low risk, general population; the app's
  existing string `advice.general.low` says "Qualité de l’air idéale pour les activités en plein air." This feature
  does not show that message. The string is in the shared strings file and is left as it is.
- The existing "What to do" card's `todo.doctor` line paraphrases ECCC's sentence. This feature quotes it.
- Listen on the other screens picks the most natural voice, which in Chrome and Edge can be a voice service. What it
  reads there includes the town that was checked and, on "Told to leave", an address. Reading with on-device voices
  only (`onDevice`, added here) is one line per screen. Left for the owner: it changes how every screen sounds.
  **Decided by the owner on Oct 4, 2026, and done:** on every screen Listen reads with a voice that works on the
  device when the language has one, however natural a voice service sounds. Where the language has only a voice
  service, the first reading says so in one sentence ("This voice works over the internet, so what I read is sent to
  a voice service."), once, until the page is loaded again; a notice cut short is said again. This screen's at-risk
  line is unchanged: it is read by a voice on the device or not at all, and says nothing instead of the notice.
- `web/index.html` loads Inter from Google Fonts on every screen. A stylesheet from another site could, in principle,
  react to what a page shows. Hosting the font with the app removes that trust. It predates this feature.
- A second tab that had the switch on keeps showing "saved" after the first tab forgets it, until it is opened again.
- In the browser tests, a check sometimes stays on the loading screen for more than 45 seconds, more often when it is
  not the first check in the page. It showed in the existing tests before any change here, on a machine shared with
  other test runs. It was not reproduced alone. Worth a look on a quiet machine: if it is real, a person would be
  left on "Tracing the air…".
