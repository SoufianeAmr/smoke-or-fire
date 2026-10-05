# Decision record: the dispatch board (`/dispatch`)

**Status: built** (Oct 4, 2026), and merged into `main` the same day with the changes of Decision 3. Code: `web/src/screens/Dispatch.tsx`, `web/src/dispatch/`. Tests: `web/src/dispatch/*.test.ts`, `web/e2e/dispatch.spec.ts`.

## Why it exists

On the morning of Aug 25, 2025, Moncton, Dieppe and Riverview fire departments took about 300 smoke calls, and call takers screened each one by asking the caller what they saw. The public app answers one person. The board answers the call taker: one place typed, the same answer the caller would get, the three questions as a script, and, when the smoke is a known event, a message the fire department can post so fewer people need to call to find out.

## What it is

A page for a 911 call taker at a desk, worked by keyboard. It is not linked from any public screen, loads only when its address is opened, and asks search engines not to list it.

1. **Type a place, get the answer.** The known-smoke card (the public verdict card's line, shape and colour), then four facts, each with what was found, who says so, when, and a link: the fire and its distance, ECCC's air-quality alert with ECCC's reading for the area, the burn status, and the wind trace.
2. **Ask the caller.** The public app's three questions, one at a time, with its routing.
3. **Copy for call notes.** Plain text: the place, the time, the answer, every fact with its source, time and link, the caller's answers, and the banner's sentence.
4. **Known smoke event (surge mode).** A person marks the event; the board drafts a public message in English and in French, and an image of the card and the map for each. Both can be changed. Nothing is posted.

The banner, "Decision support only. Your dispatch protocol governs.", is on every state of the page, in English and French.

## Decisions

### 1. The board says what the public app says

- The answer is the engine's `GET /verdict` answer (live) or the recorded one (replay), read by the same `verdictView` the verdict screen uses. The card's line, the fire, the distance and every source line are the public app's own words.
- The questions' routing is imported from `web/src/look/routing.ts`, not copied. A unit test walks all 72 answer combinations against the public app's `outcome()`.
- **Why:** a caller looking at the app and a call taker looking at the board must never be told two different things.
- **One difference, on purpose, in the replay only:** for Aug 25, 2025 the public app's burn badge reads "not checked" (it shows only what the province's status service says, and the province keeps no past status), while the board shows the ban the province announced that day, said to be from its news release (Decision 3).

### 2. The result is "Dispatch" or the trace's answer. It is never a "no".

| The caller's answers | The public app | The board |
|---|---|---|
| Any yes or not sure | Call 911 now | **Dispatch** |
| A neighbour's fire pit or bonfire | Call 911 if it is out of control or burning is banned | **Dispatch** where burning is banned (today: the engine's "No burning" for the county; in the replay: a ban on record); otherwise "Dispatch if it is out of control, or if burning is banned. Burn status: …", with the status as far as it is known ("burning only from 8 p.m. to 8 a.m.", "burning permitted", "not checked") |
| No flames, haze or only a smell, nothing burning | On to the trace | "Caller reports no fire nearby", then what the trace says: it fits the known smoke, the trace is unclear, or no known fire explains it |

- The third row states what the caller reported and what the trace found. It gives no instruction. Unit and browser tests search every result, every string and the page's text, in both languages, for any wording that tells a call taker not to respond.
- The questions do not wait for the place: a call taker can ask them first.
- The second question is asked in words ("smoke rising from one spot, grey haze everywhere, or only a smell?"): the app shows pictures, a caller on the phone sees none. The answers are the app's.

### 3. Burn status: the engine's today, a news release in the replay, or "not checked"

- **Today (live): one source of truth.** The board reads the `burn` field of the engine's answer, through the same view the public app's burn badge and burn card are built from (`web/src/burn/view.ts`, `web/src/burn/badge.ts`): New Brunswick's burn category for the caller's county, with what the province allows, until when, who was asked and when, and Fire Watch. The fact is named as the badge is ("Burning: No burn"). A restriction in effect is filled, none is outlined, not checked is dashed; the board has no green.
- **The replay (Aug 25, 2025): the province's news release, and it says so.** The engine could record no status for that day. There, and only there, the board reads `web/src/dispatch/burn-status.json`: bans the provinces announced, hand-curated, each shown only on the days its release supports, with the line "From the province's news release of 2025-08-25 (Government of New Brunswick)." and the link "The province's news release of 2025-08-25". A record is never shown for a live check, even on a day it covers (a unit test holds it).
- **Anything else reads "Burn status: not checked"**, with "That does not mean burning is allowed" and a link to the province's own page: a live check outside New Brunswick, an older engine, a replay town with no record.
- **Prince Edward Island has no record.** Its news release (Aug 11, 2025) could not be read from the province's site, which turns away automated readers, and the owner has not confirmed the link: the record was removed at the merge, and Charlottetown's replay reads "not checked". It comes back when a person has confirmed the release. The link to the province's general page about burning stays under "not checked" (the owner's decision): it is the province's own page, and it is where a call taker would look.
- **A fire pit when burning is restricted to the night ("Burning only from 8 p.m. to 8 a.m.") is not routed to Dispatch by itself:** the result names the status and keeps the public app's two conditions, and the call taker judges by the hour (the owner's decision). So the hours are in the result itself and in the call notes: "Burn status: burning only from 8 p.m. to 8 a.m." / « Statut : brûlage seulement de 20 h à 8 h. » ("Statut", not "Brûlage", because the status begins with that word). Unit and browser tests hold both languages.

| Province | Record (replay only) | Source |
|---|---|---|
| N.B. | Aug 25, 2025 | Government of New Brunswick, Aug 25, 2025: "A burn ban, however, will remain in place." (English and French releases) |
| N.S. | Jul 30 to Sep 25, 2025 | Province of Nova Scotia, Jul 30, 2025: "Nova Scotia has proclaimed a provincewide burn ban." Lifted Sep 26 except in Annapolis County. No French release found. |

- Where only an English release or page was found, the French board links to it and says "(en anglais)".

### 4. Surge mode drafts only what the trace supports, and posts nothing

- **A person marks the event.** The board never marks one by itself.
- **A draft only for drifting smoke from a fire 25 km away or more.** Unexplained smoke and unclear get no draft: the board will not write "the smoke comes from…" when the trace does not say so. A fire under 25 km gets no draft either: people there need official instructions, not a message about distant smoke. The page says which of these it is.
- **The message:** where the smoke comes from and how far that is, when to call 911, then ECCC's alert in ECCC's own words when one is in effect. For Moncton it opens with the sentence fire departments needed that morning: "The smoke in Moncton today comes from the Long Lake fire in Nova Scotia, 159 km away. If you see flames or smoke from a building or vehicle, call 911."
- **English and French, side by side,** whatever the board's language.
- **Editable, and forgiving:** "Back to the first draft" undoes edits; unmarking and marking again keeps them; another town's answer does not overwrite the message until "Draft again for …" is pressed.
- **Never posted.** The only actions are "Copy the text" and "Download the image". There is no link to any social network and no request leaves the page (a browser test watches every request).
- **The image** (1200 × 675 PNG) is drawn on a canvas in the app's own colours and type. It carries the 911 sentence, because an image is often shared without its text, and the sources. Its description is shown under it, for the post's alt text. It never imitates a Government of Canada look.

### 5. Nothing about a call is stored

- The place, the caller's answers, the mark and the drafts are the page's own state. They are never written to the app's session state, `localStorage`, cookies or the address. A reload starts empty. A browser test reads the browser's storage after a full call.
- As on every screen, the tab remembers the language and live-or-replay. Nothing else.
- Live mode asks the engine about the town's public coordinates (from the bundled list of communities). Nothing about the caller is sent. Replay asks nothing.
- **Listen reads on the device only** (the owner's decision). What it reads names the caller's town, and some of a browser's voices are voice services: the words go to a server to be spoken. On the public app Listen may use one, after saying so. On the board it never does: it reads only with a voice the browser says works on the device, for the board's language. Where there is none (only voice services, no voice listed, a voice that does not say where it works, or a browser that cannot speak) the button is off and says why, in words shown with it and read with it by a screen reader: "Listen is off: this browser has no English voice that works on the device, and the board sends nothing to a voice service." Off, it can still take the keyboard's focus, and pressing it does nothing. So the footer's "Nothing about a call is stored or sent" is true whatever voices the browser has.
- It follows the browser's list of voices: a voice that arrives turns Listen on, one that goes turns it off, and the two languages are told apart (English may have a voice on the device when French has none). A browser may list no voice for its first moments: the button is shown off only once the list has changed, or after one second, so the reason does not flash on every load. Where it then appears, the header grows by its lines, once. A reading in progress is never cut by it: Stop stays Stop.

### 6. Keyboard first

- The place box has the keyboard as the page opens. It is a combobox: arrow keys, Enter for the first match, Escape.
- Enter moves the keyboard on to the first question. The answers are buttons, numbered: while one of them has the keyboard, its number answers. The numbers are not page-wide shortcuts (WCAG 2.1.4).
- A held key answers one question only, and the Enter that picks a place answers none.
- "Change" takes an answer back. "New call" clears the answers and returns to the place box with its text selected: typing replaces it, Enter checks the same town again.
- The answer is announced to a screen reader when it arrives; the result takes the focus when the questions end.

### 7. One screen, read in five seconds

- The card is first and largest. The result of the questions sits above them, beside the card, so both show without scrolling on a 1366 × 768 screen.
- Every state has a colour, a shape and a word: the card's circle, diamond or triangle; a fact's icon filled (found or in effect), outlined (none) or dashed (not checked), with the same state in its name; a red triangle for Dispatch.
- All text is 18 px or more. Under 980 px wide, which is also a 200% zoom on a desk screen, the page is one column with no sideways scrolling (tested at 683 × 384, 390 × 844 and 320 × 256).
- Listen reads the place, the answer, how sure it is, the alert, the burn status and the banner, with a voice on the device only (Decision 5).
- Replay shows an amber strip: "Replay · Aug 25, 2025. Recorded data, not today's." Switching between live and replay clears the board, so one day's answer is never left under the other's label.

### 8. The board's text is its own file

- `web/src/dispatch/en.json` and `fr.json`, loaded with the board, so the public app does not carry them. The same rules apply and are tested: equal keys, French spacing, curly apostrophes, never "safe", never a word against calling 911.
- French uses "la personne qui appelle" for the caller.

## Left out, on purpose

- **A burn status outside New Brunswick.** The engine reads New Brunswick's service only; for Nova Scotia and Prince Edward Island "not checked", with the province's own page, is the honest answer for today.
- **A draft for an unclear trace.** A hedged public message ("may be coming from") is weaker than no message from the board; the department can still write its own.
- **Posting, scheduling or "share to" links.** A person posts.
- **Anything stored:** no call log, no history, no counts of calls.
- **An address or the caller's exact position.** The board works at the level of a town, like the public app's search.
- **A link from the public app.** The board is reached by its address.

## Limits

- The replay has 14 towns; Riverview is not one of them. The page lists the towns it has.
- A live answer is as fresh as the engine's data. The card shows when it was checked; Enter on the same town checks again.
- The engine names a fire only from `data/places/fire-names.json`; an unnamed fire is drafted as "a fire near …".
- The French message with ECCC's alert is about 305 characters, over some networks' limits. The page shows the count; the person trims.
