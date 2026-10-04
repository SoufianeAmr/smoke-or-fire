# Report: Feature 4, "Protect your home"

Overnight lane, Oct 4, 2026. Branch `feat/protect`, worktree `sof-protect`. Committed locally; nothing pushed, no
other branch touched. Decision record: [docs/decisions/0004-protect.md](../decisions/0004-protect.md).

## What was built

One button under the answer, **Protect your home from smoke**, opens a screen of its own (`/protect`):

1. **ECCC's air quality level, in words.** "Air quality: high risk". A tap shows the reading, the station, the time, the
   source and a link. Outlined at low risk, filled navy from moderate up, dashed with no reading.
2. **Four icon tiles**, in the order a person can do them. Each label is the opening of Health Canada's own sentence,
   with the words that limit it. A tap shows the whole passage and its source: who, the page, its date modified, a link.
3. **"I have asthma or COPD"**, a switch, off by default. On, it shows ECCC's message for the at-risk population at the
   current level. It is kept on the device only, with **Forget my answer** beside it.

Listen reads the tiles and the at-risk line. English and French throughout. When the fire is under 25 km away, the
verdict's notice to follow official instructions comes first.

## Decisions made alone

| # | Decision | Why | To undo |
|---|---|---|---|
| 1 | A screen of its own, not a row on the verdict screen | The North Star arrived after the brief: one decision per screen, 18 px text, Listen on every screen, a forgiving Back. Four tiles, a switch and a second Listen on the verdict screen fail those, and would outgrow Call 911 where it must be the largest target. | The screen's parts are separate components in `Protect.tsx`. |
| 2 | The title is "Protect your home from smoke" | The brief names the feature "Protect your home". Beside "The fire is close to you", that could be read as defending the house from the fire. The reviewer raised it; "from smoke" settles it. | `title` and `voice.title` in `content.json`. |
| 3 | Tile labels are Health Canada's own words, with their limits | A label is advice a person may act on without a tap. "Keep windows and doors closed as much as possible" is the page's text; "Close windows" would be ours. The cost: labels are long, longer in French. | `label` in `content.json`; `view.test.ts` holds the rule. |
| 4 | The heat line shows under the windows tile without a tap | Health Canada gives "keep windows closed" and "prioritize keeping cool" together, in one bullet. A label alone could send an 80-year-old to close up a hot house. | Remove `note` from the windows tile. |
| 5 | No "HVAC on recirculate" tile, no "clean room" tile | No current source says either (see below). The brief: leave the tile out and say so. | Needs a source first. |
| 6 | Four tiles: windows, exhaust fans, air cleaner, air filter | They are the four smoke lines of Health Canada's list. Exhaust fans and the filter are what the current fact sheet says about a home's ventilation. | `content.json`. |
| 7 | Order by effort: free and immediate first | Health Canada does not rank them; the screen does not claim it does (no numbers). | Reorder `tiles`. |
| 8 | "Word for word" allows a curly apostrophe and a no-break space | The app's strings rules require both; the pages use straight apostrophes. Nothing else may differ: not a letter, not its case. | `typography()` in `view.test.ts`. |
| 9 | At low risk, the app's area-wide note stands beside ECCC's message | ECCC's low-risk message for the at-risk population is "Enjoy your usual outdoor activities." Alone, to a person with COPD who smells smoke, that reads as an all-clear. The note is the app's existing sentence. Reviewer's blocker. | `atRisk.note` in `view.ts`. |
| 10 | With the switch off, no ECCC message is shown here | The brief asks for the at-risk message when on. The general message is already in "What to do". | `view.ts`. |
| 11 | `localStorage`, one entry, removed when off | It must outlive the visit to be worth a "forget" control, and must never travel: a cookie is sent with every request. Off stores nothing, so nothing says "not at risk". | `atRisk.ts`. |
| 12 | The control reads "Forget my answer" | The brief says a visible "forget this" control. "This" has nothing to point at for an 80-year-old; the French was already "Oublier ma réponse". | `atRisk.forget`. |
| 13 | On this screen Listen uses a voice that works on the device; the at-risk line is read only by one | In Chrome and Edge the voices the app prefers are voice services: the words go to a server. With no on-device voice, Listen says what it says with the switch off. | `listenOnDevice` in `Protect.tsx`. |
| 14 | The voice never says "you have asthma", nor that the switch is on | A phone read aloud in a waiting room should not announce either. It names ECCC and reads the message. | `voice.atRisk.on`. |
| 15 | Near a fire, the verdict's notice comes first on this screen | Advice about staying in must not stand alone when officials may say to leave. | `notice` in `view.ts`. |
| 16 | Opened with no check made, the screen goes back to Check | It has no band to show, and must not guess one. The verdict screen does the same. | `Protect.tsx`. |
| 17 | The sources are saved as text, by a script | A reviewer can read them, a diff shows what a page changed, and the test needs no network. | `web/scripts/protect-sources.mjs`. |
| 18 | `TECH-FACTS.md` not regenerated; `DESIGN-LOCK.md` not amended | Both are shared, and the other lanes change them tonight. The design is in the decision record. | `uv run python -m scripts.tech_facts` from `engine/`, after the merge. |
| 19 | `E2E_PORT` in `playwright.config.ts` | The brief asked for port 4176 by an env override; the config had the port fixed. Default unchanged (4173). | Three lines. |
| 20 | The new browser tests wait longer, and make a stalled check again once | The machine was shared with other lanes' test runs, and a check sometimes stays on the loading screen (see "For the owner"). The retry is in the helper that reaches the verdict, not around this feature's own checks. | `verdictFor` in `e2e/protect.ts`. |

## Sources

Retrieved 2026-10-04, saved in `web/src/protect/sources/` with address, date modified and retrieval date.

| Publisher | Page | Date modified | Used for |
|---|---|---|---|
| Environment and Climate Change Canada | [Air Quality Health Index Messages](https://www.weather.gc.ca/airquality/healthmessage_e.html) · [Messages de la Cote air santé](https://www.meteo.gc.ca/airquality/healthmessage_f.html) | 2026-09-03 | The at-risk message at each level; the heart-or-breathing-problems line |
| Health Canada | [Wildfire smoke with extreme heat](https://www.canada.ca/en/health-canada/services/publications/healthy-living/combine-wildfire-smoke-heat.html) · [Fumée des feux de forêt et chaleur extrême](https://www.canada.ca/fr/sante-canada/services/publications/vie-saine/effets-combines-fumee-feux-foret-chaleur.html) | 2025-07-30 | The four tiles' sentences, and the line on heat |
| Health Canada | [Using a portable air cleaner to improve indoor air](https://www.canada.ca/en/health-canada/services/air-quality/indoor-air-contaminants/choosing-portable-purifier.html) · [Utiliser un purificateur d’air portatif pour améliorer l’air intérieur](https://www.canada.ca/fr/sante-canada/services/qualite-air/contaminants-air-interieur/choisir-purificateur-portatif.html) | 2021-12-24 | Where and how to run an air cleaner |

The two Health Canada pages are the "Wildfire smoke 101" fact sheets under their 2024 titles (the Internet Archive's
2022 and 2023 copies carry the old ones: "Wildfire smoke 101: Combined wildfire smoke and heat", "Wildfire smoke 101:
Using an air purifier to filter wildfire smoke"). The air cleaner page says "Published: 2024-05-31" in its text and
gives 2021-12-24 as its date modified; the screen shows the page's date modified.

Reproduction: Canada.ca's terms (modified 2025-09-05; the ECCC weather pages link to the same terms) allow
non-commercial reproduction that is accurate, names the title and the author, and says where the original is. Each
quote on the screen is followed by exactly that.

### Tiles left out, as the brief asked

- **HVAC on recirculate, or fresh-air intake off.** Not in any current Health Canada fact sheet for homes. The 2023
  edition of "Wildfire smoke and your health" said "Use recirculation settings on your HVAC system to prevent smoke
  from entering your home"; the current edition (modified 2025-08-12) removed it. Recirculation appears today only in
  "Guidance for Cleaner Air Spaces during Wildfire Smoke Events", for staffed public buildings.
- **A clean room.** The fact sheets do not use the term. "operate your portable air cleaner in a room where you spend
  a lot of time" is shown inside the air cleaner tile.

## Shared files touched, for the merge

Line numbers are in this branch's files. Everything else is new files under `web/src/protect/`, `web/e2e/protect*`,
`web/scripts/protect-sources.mjs` and `docs/`.

| File | Lines | Change |
|---|---|---|
| `web/src/screens/Verdict.tsx` | 12 | new: `import { ProtectLink } from "../protect/ProtectLink";` |
| | 83 | new, after `</Why>`: `<ProtectLink />` |
| `web/src/App.tsx` | 5 | new: `import { Protect } from "./protect/Protect";` |
| | 44 | new, after the `/verdict` route: `<Route path="/protect" element={<Protect />} />` |
| `web/src/components/TopBar.tsx` | 37–38, 40, 53 | an optional `listenOnDevice` prop, passed to the Listen button; the comment says so |
| `web/src/listen/ListenButton.tsx` | 16–20, 65–66 | an optional `onDevice` prop: only voices that work on the device; with none, nothing is said |
| `web/playwright.config.ts` | 4–6, 13, 15, 17 | `E2E_PORT` (default 4173) |
| | 22 | `protect` added to the `flow` project's `testMatch` |
| `README.md` | 44; 200–201 | one paragraph before "Built for seniors"; two rows after "Wildfire smoke advice" in the credits table |

Not touched: `styles.css` (the feature has its own `protect.css`), `i18n/en.json`, `i18n/fr.json`, `verdict/view.ts`,
`package.json`, any existing spec, `DESIGN-LOCK.md`, `TECH-FACTS.md`.

**If the map lane rewrote the verdict screen:** the only requirement is that `<ProtectLink />` sits in
`<main className="verdict-main">` after "Why?" and what it opens. It takes no props: it reads the engine's answer from
the app's state. `protect.spec.ts` checks the order of badges, "Why?" and the button, not the exact list of the
screen's parts, so a new part on the screen does not fail it.

**If the map lane also added a port override to `playwright.config.ts`:** keep either one; they do the same thing.

## Tests

On the committed code (`551ce41`), from actual runs this morning:

| Suite | Before | Now | Result |
|---|---|---|---|
| Web unit (Vitest) | 294 | 369 | 369 passed. New: `view.test.ts` 67, `atRisk.test.ts` 8. |
| Browser (Playwright, `flow` and `small-screens`, port 4176) | 644 | 744 | 739 passed first time, 5 passed on a second try, none failed. New: `protect.spec.ts` 100, all passed first time. |
| Type check (`tsc --noEmit`) | | | Clean. |
| Engine (pytest) | 166 | 166 | 166 passed. No engine file was changed. |
| Pictures (`protect-screenshots.spec.ts`, not part of `npm run e2e`) | | 34 | 34 saved. |

How the browser suite was run, from `web/`:
`E2E_PORT=4176 npx playwright test --project=flow --project=small-screens --workers=3 --retries=1`.

**The five second tries are existing tests, and so were the baseline's failures.** Before any change here, the same
suite gave 632 passed and 12 failed, each waiting on a screen that had not come; 7 of those 12 passed when run again
alone. This morning's five: `glance.spec.ts` (2), `look-911.spec.ts` (2), `look.spec.ts` (1). The machine was shared
all night with four other lanes' test runs (4 cores, 8 GB, under 100 MB free at times; one test worker died out of
memory). See "For the owner", item 2.

What the new tests hold:

- **Never invented.** Every sentence of advice, in `content.json` and on the rendered screen at every level with the
  switch on and each tile open, is in its saved page, on one line of it. Every other word on the screen is one of the
  screen's own strings. Each band's message is the one in its row of ECCC's table, in the at-risk column. Labels open
  their sentence and keep its limits. Every sentence Listen says is the screen's own or quoted.
- **The band.** Its word at each level; outlined, filled or dashed; a needle position of its own; no red, orange,
  amber or green at any level.
- **The switch.** Off by default; each level's message, in ordinary weight; the area-wide note at low risk; forget;
  remembered across checks and reloads; a button that takes a tap or a key; a device that refuses to store, and one
  that refuses to remove.
- **Private.** The taps send nothing. One `localStorage` entry; no cookie; not in the address or the session state.
  The same visit with the switch on and off: the pages make the same requests, the engine's included. Source links
  are the page's plain address with no referrer.
- **Listen.** The order; ECCC named; the device's voice whenever there is one; a browser with voice services only says
  the same words on and off; voices that arrive late; a voice gone before the tap; French where only English has a
  device voice.
- **Built for an 80-year-old.** Every word 18 px or more; every target 56 px or more; nothing wider than the screen at
  375, 320 and at twice the text size; contrast 4.5 to 1 or more; nothing moves under reduced motion.
- **On the verdict.** The button after "Why?"; Call 911 larger than it at 390, 375 and 320 px wide, in both languages.

## Independent review

A fresh agent read the whole diff with no part in writing it. It checked all 30 quoted strings against the saved pages
by eye, fetched four official pages itself, and traced every path the switch's state could take. Its verdict: every
quote is verbatim, the at-risk messages are on the right AQHI rows, and it found no path by which the switch's state
leaves the device. It then listed 13 findings. All but one were fixed; one is the owner's call.

| # | Finding | Severity | What was done |
|---|---|---|---|
| 1 | At low risk, "Enjoy your usual outdoor activities." in bold, on a screen that also says to keep windows closed, read as an all-clear to someone with COPD who smells smoke | Blocker | The app's area-wide note now stands beside the message at low risk on every verdict, and Listen says it. The message is in ordinary weight. |
| 2 | Near a fire, "Protect your home" is ambiguous, and the screen gave stay-home advice with no pointer to official instructions | Should fix | Title and button: "Protect your home from smoke". The verdict's notice and its "Told to leave" link come first on the screen and in Listen. |
| 3 | Three labels dropped a qualifier; the French windows label was not the sentence's opening | Should fix | Labels are the opening of the sentence with its limits. The "first capital" exception is gone. |
| 4 | Listen put ECCC's band under "Health Canada's advice", never named ECCC for the at-risk message, and announced that the switch was on | Should fix | Reordered; ECCC is named; the switch's state is no longer said. |
| 5 | The switch is narrower than ECCC's at-risk group | Owner's call | Not changed. See "For the owner". |
| 6 | "Forgotten when the app is closed" was false (it is forgotten on leaving the screen); "Forgotten" was claimed even where the device refused to remove the entry | Should fix | Both fixed; a new sentence says the entry is still there and how to clear it. |
| 7 | Wording: "risk" twice in one line, "your level", "Turn on" with no object, "Tap one", sentence fragments, English and French that differed | Should fix | All applied. The band and "Official message for people at risk:" are on two lines. |
| 8 | The privacy tests missed voices that arrive late, a voice that vanishes before the tap, and a language switch; the static check was a deny-list presented as proof; one pattern could never match "évitez" | Should fix | Three browser tests added. The static check is named a tripwire and widened to the two shared files. Pattern fixed, with a check of the check. |
| 9 | Which voice read depended on the switch | Nit | On this screen the device's voice reads whenever there is one, switch on or off. |
| 10 | The air cleaner list showed two of the page's three items | Nit | Third item added (the manufacturer's instructions). |
| 11 | No reading was styled like low risk | Nit | Follows the verdict's own rule: clear when smoke is likely or possibly drifting in. The band itself stays dashed. |
| 12 | README and decision record against the code | Nit | Corrected. |
| 13 | The Google Fonts stylesheet could, in principle, react to what a page shows | Nit, predates this work | Not changed. See "For the owner". |

Also raised and not taken: the taller Call 911 bar on this screen after an unexplained verdict. The screen keeps the
slim bar every other screen has.

## Screenshots

In `web/screenshots/` (not committed, as the app's other pictures are not). To make them again, from `web/`:
`E2E_PORT=4176 npx playwright test e2e/protect-screenshots.spec.ts --project=screenshots`. Each shows the whole page.

| | Switch off, EN | Switch on, EN | Switch off, FR | Switch on, FR |
|---|---|---|---|---|
| **Low** | ![](../../web/screenshots/32-protect-low-off-en.png) | ![](../../web/screenshots/33-protect-low-on-en.png) | ![](../../web/screenshots/32-protect-low-off-fr.png) | ![](../../web/screenshots/33-protect-low-on-fr.png) |
| **Moderate** | ![](../../web/screenshots/34-protect-moderate-off-en.png) | ![](../../web/screenshots/35-protect-moderate-on-en.png) | ![](../../web/screenshots/34-protect-moderate-off-fr.png) | ![](../../web/screenshots/35-protect-moderate-on-fr.png) |
| **High** | ![](../../web/screenshots/36-protect-high-off-en.png) | ![](../../web/screenshots/37-protect-high-on-en.png) | ![](../../web/screenshots/36-protect-high-off-fr.png) | ![](../../web/screenshots/37-protect-high-on-fr.png) |
| **Very high** | ![](../../web/screenshots/38-protect-very-high-off-en.png) | ![](../../web/screenshots/39-protect-very-high-on-en.png) | ![](../../web/screenshots/38-protect-very-high-off-fr.png) | ![](../../web/screenshots/39-protect-very-high-on-fr.png) |

More, each in English and French (`-en.png`, `-fr.png`):

| Picture | File |
|---|---|
| The verdict's button at very high risk (Moncton): filled | `30-protect-verdict-button-very-high` |
| The verdict's button at low risk (Halifax): quiet, under Call 911 as the main action | `31-protect-verdict-button-low` |
| A tile open: the air cleaner, its passages and their two sources | `40-protect-tile-open` |
| The band open: the reading, who measured it and when, ECCC's page | `41-protect-band-open` |
| No reading in the last 2 hours, switch on: no message is picked | `42-protect-no-reading-on` |
| A small phone (375 × 667), as the screen opens | `43-protect-small` |
| Nothing explains the smoke (Halifax), low risk, switch on: the area-wide note twice | `44-protect-unexplained-low-on` |
| After "Forget my answer" | `45-protect-forgotten` |
| A fire close by (Bridgetown): the notice comes first | `46-protect-fire-close` |

## Demo script (20 seconds)

Replay mode, Moncton.

1. **0–4 s.** The verdict: "Drifting smoke · Long Lake fire · 159 km SSW". Tap **Protect your home from smoke**, the navy button under "Why?".
2. **4–9 s.** "Air quality: very high risk": ECCC's level, in words. Four things to do, each in Health Canada's own words. Tap **Keep windows and doors closed as much as possible**: the whole passage, who wrote it, when, and the link.
3. **9–15 s.** Scroll to **I have asthma or COPD** and switch it on: ECCC's message for people at risk at this level. "Your answer is saved on this device only." **Forget my answer** is right there.
4. **15–20 s.** Tap **Listen**: it reads the tiles, then the at-risk line. Say: "Every sentence is checked against the official page, word for word. And nothing about you leaves the phone: a test makes the same visit with the switch on and off and finds the same requests."

## For the owner

1. **The switch is narrower than the group ECCC means.** ECCC's at-risk population includes people with heart
   problems, and its messages name "the elderly". Most people this app is built for are over 65. An 80-year-old with
   heart disease leaves the switch off and sees no ECCC message here. The brief fixed the label, so it stays. The
   reviewer's two options: (A) ECCC's words, "I have a heart or breathing problem" / "J’ai une maladie cardiaque ou
   respiratoire"; (B) keep the label and show "People with heart or breathing problems are at greater risk." above
   the switch when it is off. Either is a change to `content.json` and one test.
2. **A check sometimes stays on the loading screen.** In browser tests, about 1 check in 100 never left "Tracing the
   air…" within 45 seconds. It showed in the existing tests before any change here (12 of 644 failed that way in the
   baseline run), on a machine shared with four other lanes' test runs, with almost no free memory. It could not be
   reproduced alone, and the cause is not found. If it is real, a person would be left on that screen. Worth an hour
   on a quiet machine.
3. **Listen on the other screens can send what it reads to a voice service.** In Chrome and Edge the "natural" voices
   the app prefers are cloud voices. What Listen reads elsewhere includes the town that was checked and, on "Told to
   leave", an address. `onDevice` now exists on the Listen button; turning it on everywhere is one line per screen,
   and changes how the app sounds. **Closed on Oct 4, 2026:** Listen now reads with a voice on the device first on
   every screen, and says so once before reading where only a voice service exists (decision record 0004).
4. **The Google Fonts stylesheet.** `index.html` loads Inter from Google on every screen. Hosting the font with the app
   removes a third party from every page. It predates this work.
5. **Two existing strings differ from ECCC's pages.** French, low risk, general population: the page reads "idéale
   pour les activités en plein air."; the app says "Qualité de l’air idéale pour les activités en plein air." And
   `todo.doctor` paraphrases ECCC's sentence. Both are in the shared strings files; neither was changed.
6. **Before the merge:** run the whole suite once on a quiet machine. After it: regenerate `TECH-FACTS.md`.
7. **By ear:** how French voices say "MPOC" in the one spoken sentence that has it. Spell it out if it is read as a word.
8. **Not done, your call:** the taller Call 911 bar on this screen after an unexplained verdict; a `docs/` line in the
   README's repository tree.
