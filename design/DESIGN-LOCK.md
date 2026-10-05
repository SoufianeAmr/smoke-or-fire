# Design lock: Smoke or Fire? / Fumée ou feu ?

**Status: FROZEN** (Sept 26, 2026, 3 PM ADT). `design/smoke-or-fire.html` is the final visual reference.

- It has 15 screens, including a new live-mode "no active fires in range" state.
- No further design rounds.
- Everything below the "Applied" section is build work, not design work.

## Applied in this revision (verified by rendering every screen)

1. **Smoke column icon.** The "V" was redrawn as a billowing plume in all 12 sticky bars, the Q2 card and the explainer sheet. The source is `design/icons/smoke-column.svg`.
2. **FR Q2 option.** "Brume partout" read as fog. It is now "Voile de fumée partout" with "L’air est voilé de fumée…".
3. **New screen 7d: live mode with no active fires in range** (the likely state this weekend):
   - Red layout, no replay banner.
   - No fire marker on the map.
   - Fire row reads "Active fires near you: None reported within 500 km".
4. **Map borders are now solid and light.** Only the air path is dashed.
5. **Orange path shows the older part of the trace,** faded, continuing past the fire (EN and FR).
6. **Emergency footer:**
   - EN: "Stay on the line and follow the dispatcher. If the fire is close to you, move away while you talk."
7. **Check screen:**
   - The selected mode segment is white with a navy outline, so only one filled navy block remains.
   - Tagline: "Find out where the smoke is coming from, in 60 seconds."
8. **Health advice is now ECCC's official AQHI wording, EN and FR.**
   - General message in "What to do".
   - At-risk message, who is at higher risk, and doctor's-advice footnote in the expander.
   - Expander label: "Advice for people at higher risk" / "Conseils pour les personnes plus à risque".
9. **811 nurse line added** as a text link, not a button: "Not an emergency but feeling unwell? Call 811 to talk to a nurse."
10. **FireWork claims removed** (How it works and Why). Why item 3 is now "The wind stayed steady", which the engine computes.
11. **Postal code dropped:** "Town or city", "e.g. Moncton".
12. **French fixes:**
    - Sticky label "Panache".
    - Explainer: "La fumée lointaine forme un voile ; un panache veut dire que le feu est proche."
    - Headline: "Elle vient probablement du feu de Long Lake".
13. **Sweep of all screens:** no "safe", no "don't call 911" (EN or FR), no green hue.

## Already correct in the HTML (the PDF export misrepresented them)

- **Loading counter:** "Hour N of 24" animates. The PDF captured it empty.
- **Hit areas:** 56 px on the EN/FR toggle, back, Exit, close ×, New check and How it works.
- **Type floor:** 16 px minimum everywhere; 18 px body.
- **Chip text:** near-black on orange.
- **Reduced motion:** the path animation already stops when the device asks for reduced motion.

## Build contract (code must match the screens)

**Verdict and confidence:**

| Closest approach | Wind steady | Wind unsteady |
|---|---|---|
| ≤ 25 km | Drifting smoke. High if ≤ 10 km, else Medium | Unclear, Low |
| 25–50 km | Unclear, Medium | Unclear, Low |
| > 50 km or no fire | Unexplained, Medium | Unexplained, Low |

- "Closest approach" = the shortest distance between the traced path and a fire, counting only fires whose closest point on the path comes after the start (hoursAgo > 0). A fire whose closest point is the start itself (the user's position) is near the user but not on the air's path: it does not count for the verdict and is reported only as the nearest fire.
- "Unsteady" = the circular standard deviation of hourly wind direction along the path is above 45°.
- No active fire within 500 km → screen 7d.

**Health advice:**
- Keyed by AQHI category: Low 1–3, Moderate 4–6, High 7–10, Very high 10+.
- Use ECCC's official EN/FR text only.
- The "Official advice for an AQHI of N" line is computed.

**Every number on screen comes from the engine.** Mockup numbers are sample data.

**French parity:**
- Only 3 screens exist in French in the mockup.
- Every string gets a reviewed French version in the strings file.
- Use a non-breaking space before `? ! : ;`.

**Build simplifications:**
- **Map:** static SVG of NB/NS/PEI from bundled GeoJSON (d3-geo), not tiles.
- **Town search:** bundled list of Maritimes communities, no geocoder.
- **Location off:** inline message on the Location screen.
- **Mode:** the judging QR code opens `?mode=replay`; the plain URL opens live.

## Amendment: the verdict as one glance (Oct 3, 2026)

Screens 7a–7d keep every word, card and number above, behind one button. What opens first is new:

- **The card.** The band holds a large icon in its own white shape and one line of about 8 words, the screen's title: "Drifting smoke · Long Lake fire · 159 km SSW". Each verdict the engine returns has its own icon, shape and colour: drifting = wind lines in a circle on orange; unclear = question mark in a diamond on amber; unexplained (7b and 7d) = exclamation mark in a triangle on red. An arrow beside the distance points from the person toward the fire and is named for screen readers ("toward the south-southwest").
- **Badges** under the card, 56 px or more, one tap to show a source, its time and a link: satellite fire detection, wind trace, ECCC air-quality alert. A badge's state is told by shape and word: active = filled navy pill, none in effect = outlined, not checked = dashed outline.
- **Small phones** (a screen under 800 px tall as it opens, which is most phones inside a browser): the three badges share one row, an icon above a word or two, so all three and "Why?" show above the 911 bar as the screen opens, from about 550 px tall. The word says the state, as the outline does: the badge's own word when something was found ("Fire", "Wind", "Alert"), else "None" or "Not checked". The full name shows on a tap, at the head of the panel, and is what a screen reader says. At 740 px or less the card's shape and line are smaller; at 660 px or less everything is tighter, and the bar whose main action is Call 911 has its line in 16 px above a 60 px button. The layout is chosen once, as the screen opens, so it never jumps when a browser's bars slide away. **One exception:** with the fire-is-close notice in front, the notice comes first; on a 375 × 667 phone the three badges still show under it and "Why?" needs a scroll, and on a smaller phone the badges need a scroll too.
- **"Why?"** opens everything screens 7a–7d say, unchanged, in the same order. The old headline becomes a second-level heading. Listen reads the card's line and the badges' names; with "Why?" open, the script it always read.
- **The fire-is-close notice** stays in front of "Why?".
- **Unexplained smoke: Call 911 is the main action.** The 911 bar stays and becomes it: "Look outside. See flames or thick smoke rising?" above a Call 911 button as wide as the bar (the words until Oct 5, 2026: "a smoke column"). Still one Call 911 button per view.

## Amendment: Loading while the engine wakes up (Oct 4, 2026)

The engine's free host puts it to sleep when idle and wipes its disk, so the first live check after a quiet spell can take up to about three minutes. Screen 06 keeps its title, map and list; when the engine has not answered within 10 seconds, or answers that it is not ready, one line under the subtitle says so plainly: "Waking up the smoke engine… this can take a few minutes." / « Réveil du moteur de fumée… cela peut prendre quelques minutes. » Listen adds the same. The app keeps asking, with backoff, for up to three minutes, a whole cold start; the 911 bar stays. Screen 9b is kept for the engine’s own no-data answer; after three minutes without any answer it opens with "The smoke engine didn’t answer in time. It may still be waking up: try again in a minute." The first screen sends one quiet request to the engine's health endpoint as the app opens in live mode, so the engine is usually awake by the end of the three questions. Replay never calls the engine.

## Amendment: the answer lives on the map (Oct 4, 2026)

The verdict screen (7a–7d) opens on a map. Nothing it said is gone; where it sits has changed. The reasons are in [docs/decisions/0003-map.md](../docs/decisions/0003-map.md).

- **The screen.** The top bar (New check, EN/FR), the map, and over the map's foot a sheet; the 911 bar under it, as before. The screen is as tall as the phone and does not scroll: the sheet does. With only the card showing, the sheet never covers the top bar: New check and EN/FR stay in reach.
- **The sheet has three heights, each as tall as what it holds.** Peek: the glance card, and the fire-is-close notice, which stays in front. Half: the badges in one row, and "Why?" (and, since the amendment "The sheet at half is compact" below, two chips between them). Full: everything "Why?" opens, unchanged, in the same order. The screen opens at peek.
- **It moves by buttons with words.** The handle reads "Sources and why", then "Show the map"; "Why?" opens and closes the full height. A flick on the handle and the arrow keys do the same. Back lowers the sheet, and coming back from another screen finds it as it was left. On a screen with no room for a map (a small window at 200% zoom) the handle reads "Show less", not "Show the map".
- **This replaces one line of the Oct 3 amendment.** "The three badges and Why? show above the 911 bar as the screen opens" becomes: they show above it with the sheet at half, on the same phones (from about 550 px tall; on the smallest the sheet then stands over the top bar). The badges share one row on every phone (under 980 px tall); the column with their full names stays on taller screens. The fire-is-close exception is as it was: the notice first, and "Why?" may need a scroll.
- **The map.** The Maritimes from OpenStreetMap, in the app's colours: land, water, built-up areas, main roads, borders, place names in the app's language. No green.
- **On the map, in this order from the bottom:** ECCC's forecast zone under an active alert, a near-black dashed outline; the satellite detections, orange dots with a dark edge whose area grows with the fire power measured (3.5 to 12 px); the air's path at three heights (the ribbon): the height that gave the verdict as a navy line in a white casing with a white bead each hour, the other two thinner; a white flame on a black disc for each fire on Canada's official list, and only for those; the person, a navy dot in a soft halo. Labels on small white plates: "You", the fire's name, and the far end of the path in hours.
- **The ribbon is the hero.** It is the darkest and widest mark; the basemap is quiet under it.
- **The frame.** The map opens on the person and the fire, both whole above the sheet and under no button. With no fire in range it holds the path. "Recentre" brings it back, and never asks for the phone's location.
- **Buttons on the map**, white with a navy outline, 56 px: Legend; + and − (closer to the person's place, or farther from it: their dot stays where it is); Recentre, once the map has been moved, in the corner of the map's credit. On a map too small for all of them, the buttons give way to the marks.
- **Legend** ("What the map shows"): the map in words, then each layer with its mark, what it is, who it comes from, when, and a link. ECCC's first. "None", "not checked" and "not on the map" are said in words, and nothing is said to be absent when its source was not checked.
- **When the detailed map cannot be drawn** (no WebGL, the map did not load, or the engine sent no map details): the outline map, with the same overlay and a note that says why. The detailed map is never seen half-drawn: the outline map shows until its first picture is whole.
- **Tokens added, the ember palette:** land #EFE7DA and water #D8E3EE (as the outline map), ember #E8590C with edge #7A2E06, place names #454036, water names #2F4763. No red on the map: red stays Call 911's, and the unexplained card's.
- **Added to the hard rules, for the map:** words 18 px or more; the map is never the only place something is said; a button for everything the map is needed for (the sheet, Legend, + and −, Recentre). Dragging and pinching the map are extras: nothing depends on them.

## Amendment: "Is burning allowed today?" (Oct 4, 2026)

One card on the verdict screen, after "Why?", in New Brunswick only ([docs/decisions/0005-burn.md](../docs/decisions/0005-burn.md)). Nothing above it moves. With the sheet at half the same status is the fourth badge of the row (the amendment "The sheet at half is compact", below).

- **The status block:** a 48 px shape and the status in a few words, 22 px extrabold. No burning = white octagon with a red cross, on red, white text. Restricted = white triangle, outlined near-black, with a clock, on amber, near-black text. Burning permitted = a green flame in a green ring, on white with a green outline, its words green. Fire season closed = outlined navy square with a bar. Not checked = dashed navy ring with a question mark, as on the source badges.
- **Green: the one exception to "No green".** #1E7B3A, for the province's "Burning permitted" only: an outline, a flame and a word, never a fill, and never about the smoke. Its exact scope is in the amendment "The sheet at half is compact", below. **No check mark:** under a verdict that says to look outside, a tick could read as "all is well".
- **Type:** every word on the card is 18 px or more, hosts under links included.
- **Its own Listen**, named "Listen: is burning allowed today?" for a screen reader. One voice at a time: starting one Listen stops the other.

## Amendment: the sheet at half is compact (Oct 4, 2026)

With "Protect your home", "Best time to air out" and the burn card in the sheet, its half height stood over the whole map. It is now small enough that the map stays in view on a phone. Nothing is gone: the full height holds everything, as before.

- **Half, top to bottom:** the handle, with Listen beside it; the card, small (its shape beside its line: 56 px and 26 px; on a phone 740 px tall or less, 48 px and 22 px); the badges in one row; one row of two chips; "Why?". Listen reads the card's line and the badges' names, the burn badge's after the other three.
- **The burn status is the fourth badge**, in New Brunswick only: "Burning: No burn" / « Brûlage : interdit ». Its state's own shape above one or two words: No burn, Restricted, Permitted, Season closed, Not checked / Interdit, Restreint, Permis, Hors saison, Non vérifié. A tap shows, as on the other badges, its name, then the shape, the status in full, the county, what the province allows, until when, who was asked and when, and Fire Watch. No burning is a filled red pill with white words; restricted a filled amber pill with near-black words; permitted a white pill outlined in green; season closed is outlined navy; not checked is dashed navy. Four badges are each as wide as their word needs, never under 56 px; under 360 px wide they are two by two, and a panel opens under its own row.
- **The two chips**, 56 px or more, words 18 px, outlined navy on white: "Protect your home" / « Protégez votre maison » (for a screen reader its name is the button's, "Protect your home from smoke") and "When to air out" / « Quand aérer » with the answer in a few words under it ("Mon 5 to 8 a.m.", "Not now", "Not available"). The first is filled navy when the air calls for it (moderate risk and up), as the button is.
- **Full:** everything "Why?" opens, then the button to Protect your home, the air-out tile and the burn card, unchanged. The chips are at half only; the button, the tile and the card at full only.
- **Unexplained smoke:** Call 911 stays the main action and the largest thing to tap at every height. Both chips are outlined, never filled. On a phone 740 px tall or less this screen takes the tighter layout (the top bar 56 px, the bar's line in 16 px above a 60 px Call 911 button), so the map still shows; the button to Protect your home is then in 18 px with no icon, and stays smaller than Call 911.
- **What is tested:** on 390 × 844 and 375 × 667, in English and French, with the sheet at half the map shows the person and the fire, whole above the sheet and under no button: Moncton (four badges), Halifax (unexplained smoke), Fredericton (both). Measured in the replay: 174 px of map or more on 390 × 844, 87 px or more on 375 × 667.
- **Where the map does not show at half:** with the fire-is-close notice in front (the notice comes first, as before); on a phone 660 px tall or less, where there is room for it only in some answers (there the chips come after "Why?", so the badges and "Why?" still show above the 911 bar); and wherever less than 84 px of map would be left: the sheet then stands over it, as before.
- **Green: its exact scope.** #1E7B3A is used for the province's "Burning permitted" and nothing else, and on the burn badge only: its outline, its flame and its word ("Permitted" on the pill; "Burning permitted" in the pill's panel and on the same status block at the head of the burn card). Never a fill: the pill, the disc under the flame and the block are white. Never on the verdict card, nor on the map, a chip, a button or the 911 bar. It is about burning, never about the smoke: it never means the smoke is safe. No check mark.

## Amendment: Listen keeps what it reads on the phone (Oct 4, 2026)

Some of a browser's voices are voice services: the words go to a server to be spoken. On every screen Listen reads with a voice that works on the device when the language has one, however natural a service sounds. Where the language has only a voice service, the first reading starts with one sentence, said once until the page is loaded again: "This voice works over the internet, so what I read is sent to a voice service." / « Cette voix fonctionne par Internet, alors ce que je lis est envoyé à un service vocal. » Stopped before its end, it is said again. Nothing about it is stored. The at-risk line of "Protect your home" is still read by a voice on the device or not at all. One page is stricter: the dispatch board promises that nothing about a call is sent, so its Listen reads only with a voice on the device, and without one it is off (greyed, still reachable by keyboard) with one sentence beside it that says why.

## Amendment: the home screen (Oct 4 and 5, 2026)

Screen 01 (Check) has a layout of its own, in the app's colours and Inter. `design/screens/01-check.html` is no longer its reference. Every other screen is as it was, and what this screen does is as it was: Listen, the language, I smell smoke, Live or the replay, How it works, the two links, and Call 911.

- **Tokens:** the app's own (below). Nothing moves.
- **The top, a tenth of the screen (56 px or more):** on the left the app's mark, 24 px (the navy tile of the home-screen icon), and its name, 14 px. The name is the screen's title, and it is nowhere else on the screen. On the right, as words on one line: Listen, then the other language named in itself ("Français" on the English screen, "English" on the French one), underlined, with no flag. Where the two sides do not fit on one row (a narrow phone, large text), Listen and the language go under the name.
- **The card:** white on the beige page, with a soft shadow, and no taller than what it holds. First a drawing as wide as the card, then one line: "Find out where the smoke is coming from." The card says what the app is for, not what the air is like: nothing has been checked yet, so the first screen states no finding. The line promises no time either ("in 60 seconds" is gone): an engine that is waking can take longer. Nor do Listen on this screen ("A few quick questions first.") or the message Send to someone sends ("tells you where the smoke is coming from").
- **The drawing** explains the idea at a glance: far off and upwind, a small fire; an arrow for the wind; a house standing in light grey haze. Calm: navy, the app's beiges, light greys, and for the fire the map's ember orange with its dark edge, never the red of Call 911. A screen reader is told it is an illustration, in English and French. Its height is the room the screen has left: all of it (half as tall as it is wide) on a tall phone; on a short one the strip at its foot, where the fire, the arrow and the house are, 80 px at least.
- **Live or the replay: one switch,** under the line. Two options the same size, "Live" and "Replay · Aug 25, 2025". The one in use is filled navy with a tick, and pressed for a screen reader. On a phone the replay's name and its day sit one over the other; from 480 px wide they are on one line, with their dot. In the replay, one line under the switch: "A recorded day, for demonstration."
- **Two actions, 64 px or more.** "I smell smoke", filled navy, with the two wisps of smoke of the app's mark; under it one line, "Your location is used only for this check." Then "I see active flames / Call 911", outlined red on white, with a flame: it dials 911 and says so. Red is on this screen for nothing else.
- **Call 911 is this screen's own button, so the screen has no 911 bar** (as Call 911 now and Nearby fire). Still one Call 911 button per view, and it stays on the screen however short the window is. The steps for Add to home screen cover it, and keep their own.
- **Words that say only what is so:** the button starts the check and is not named "Report" (the app sends no report); the line under it does not say the location is anonymized (in live mode the engine is sent the place as it is).
- **Sizes that differ from the rules below, on this screen only:** the name at the top, the switch's words, the replay's line and the line about location are 14 px; the switch's options are 48 px to tap. Listen, the language, How it works and the two links keep 56 px.
- **Short phones (up to 740 px tall):** less room around the line and the switch, and the drawing is shorter, so at 375 × 667 everything is on the screen with nothing to scroll, in English and French.
- **What is tested** (`web/e2e/keep.spec.ts`): at 375 × 667 and 390 × 844, in English and French, live and replay, everything is on the screen, nothing overlaps and nothing scrolls; the card has no gap of more than 16 px; the drawing's fire, arrow and house are whole and in that order; the switch's options are the same size, the one in use filled and ticked, and it works by tap and by keyboard; the colours and the typeface; red is on nothing but Call 911; the mark and the name; the language link's name, its `lang`, and that it switches.

## Amendment: the questions' top bar, the first question's answers, and Call 911 now as a call card (Oct 5, 2026)

`design/screens/02-q1-flames.html` and `04-emergency.html` are no longer the reference for these two screens. Where each answer leads is as it was, and so is the 911 bar on the three questions.

- **The three questions have the home screen's top bar:** the same height and margins, Listen as words, and one link that names the other language, in the same place and type. Back is where the home screen has its name, and the three dots stay beside it (under it on a narrow phone). The other screens keep their bar.
- **The first question's three answers are one style:** cards of one size, white with a navy edge and navy words. Colour is the icon's alone: a red flame for Yes, a navy cross for No, a question mark on amber for Not sure. No answer is filled or larger than another. Listen names the answers by their words, not by a colour.
- **Call 911 now is a call card on a white page.** Red is the Call 911 button's alone. From the top: the home screen's top bar, with Back; the Call 911 button, first, as wide as the page and the largest thing on it (104 px or more), which stays at the top of the screen when the page is taller than the phone; one card, "911 will ask first where you are.", with Show my location, then the place in large type and the coordinates beneath; "They'll also ask", one row of three drawings with a few words each (What you see, Your name, Your phone number); one line with a drawing, "Fire close? Move away while you talk."; "Stay on the line. Keep your phone on after."; Told to leave, a button as wide as the page with a door and its words; and a small info button, "About this card". The screen's title, "Call 911 now", is kept for a screen reader, which is told where the tap led.
- **Hear it** reads the place and the coordinates aloud with a voice that works on the phone and no other, since what is read is where the person is. Where the language has no such voice, there is no button.
- **About this card** is closed until asked for, as "About these questions". Opened, it gives two sources in their own words, each read on Oct 5, 2026, and each a row to tap that opens its page. New Brunswick's own 911 page (gnb.ca): the operator answers "911 Where is your emergency?", "will ask what your emergency is, your location and your full 10-digit phone number", and "Keep your phone on after you hang up in case the 911 operator needs to call you back". The University of New Brunswick's page on calling 911 from its Fredericton campus (unb.ca, in English only): "Provide your name, telephone number and location", state "what you have observed", and "Do not hang up until the operator tells you to do so", which is where "Your name" and "Stay on the line" come from. The French page of gnb.ca has the answer and the phone kept on, but not the three things asked, and the French note says so. The card's heading is the app's plain wording of that first question. So each of the three things the card says 911 will also ask is in a source the note quotes. Not from either page, and not said to be: "Fire close? Move away while you talk." (The middle one of the three was "Anyone in danger" for a few hours on Oct 5. No source was found for it: the Moncton story the questions come from was read in full and does not have it. The owner replaced it with "Your name".)
- **The location rules are as they were:** asked of the phone on a tap only; shown while fresh (ten minutes); coordinates only when the phone is sure enough of them; the nearest community's name; a town typed in live mode by its name alone, a replay town never; "not available" otherwise.
- **A double tap must not dial.** On a short phone the Call 911 button comes up where the top of the Yes answer was on the question before. For the screen's first moments (0.4 s, as the answers) it takes no tap; opened by its address, it takes one at once.
- **Gone from this screen:** the red page, the "EMERGENCY" label, the title to the eye, the line "When in doubt, call 911." and the numbered list "Tell the dispatcher".
- **What is tested** (`web/e2e/look-911.spec.ts`, `look.spec.ts`, `listen.spec.ts`, `small-screens.spec.ts`): the Call 911 button is first, red on white, the largest thing to tap and whole on the screen as it opens; red is on nothing else; the card, the row of three and the two lines; About this card, its words and its link in each language; every location rule, as before; Hear it with a voice on the phone, and none with only a voice service; a double tap on Yes dials nothing, and a tap a moment later calls; the first question's three answers are one style and one size; Listen is words on the three questions and here.

## Amendment: every action a large button; "If you're told to leave"; thick smoke rising (Oct 5, 2026)

**The rule.** In an emergency, everything to act on is a large button: 56 px or taller, with an icon and its words, acting on the phone (a call, a text message, a tick, another screen of the app). No small text links. It holds on Call 911 now, on "If you're told to leave", and on the fire-is-close notice.

- **One thing is smaller, and it is not an action:** the info button ("About these questions" on the three questions, "About this card" on Call 911 now) is an "i" and its words in a navy outline, 48 px tall. Opened, its sources are rows to tap, 56 px or taller, each with the mark of a page that opens outside the app.
- **Call 911 now:** Told to leave is a button as wide as the page, with a door and its words, navy on white. Red stays the Call 911 button's alone.
- **The fire-is-close notice** (on the verdict, and where the "protect yourself" screen shows it again): Told to leave is the same button, as wide as the notice. It was a text link with an arrow.
- **"If you're told to leave" has the home screen's top bar,** as the three questions and Call 911 now. "Not in Moncton? Change" is a button with a pin.
- **No evacuation for this person** (a replay town far from the fire, and live mode, where the app knows of none). The replay's explanation is one sentence: "The evacuation for the Long Lake fire, 159 km from Moncton, doesn't apply to you." Then the page where officials announce where to go, as an outlined button that says it opens that site (in Moncton, live, the City's alerts first), and "Call 211 · Shelters and help", a filled navy button that dials 211. On a phone its two parts are two lines.
- **Near the fire** (within the event's radius: the Bridgetown replay). Nothing opens a web page or a maps app. The map stays: you, the fire and the centres officials announced. "Get directions" is gone; in its place, one line between the map and the centres: "Follow the route officials give. Roads may be closed." Each centre's card has its name, address and services, then how far it is and which way from you: whole kilometres in a straight line, the nearest of eight compass points, and an arrow turned that way with north up, as on the map ("About 21 km northeast of you"). Under 1 km there is no direction ("Less than 1 km from you"): the centre's point and the town's are both approximate. Then "As announced in August 2025.": the record holds the month the centres were announced, not a day or an hour. The Call 211 button is added, above the event's two phone lines, which are buttons too. The source is plain words at the end: who announced the centres, and when.
- **"What to take" is a list to tick:** six rows, each 56 px or taller, the whole row to tap, with a square of 40 px that fills navy and shows a white tick. What is ticked is kept on the phone and nowhere else, in the page's session storage under its own name (`smoke-or-fire-take`): it is there after a reload, another town or another screen, and gone when the page is closed. Nothing is written until a box is ticked, and nothing is sent. "Tell family you're OK" stays as it was.
- **Thick smoke rising.** The second question's first answer is "Thick smoke rising" / "Fumée épaisse qui monte" (it was "Rising column"), and the 911 bar's line is "See flames or thick smoke rising?". So that one sign has one name, every sentence of the app that said "a smoke column" says "thick smoke rising": the bar in both its forms, the fire-is-close notice, the unexplained verdict's line, the no-data screen, How it works, the air-out card's limits, the dispatch board's line to the public, Listen wherever it says them, and the README. (For a few hours on Oct 5 the word was "dark". The owner chose "thick": a wildfire's column can be white or grey as well as dark.) The screen files in `design/screens/` keep the old words. The French words are longer ("de la fumée épaisse qui monte"), and three things keep the layout as it was: on a phone under 430 px wide the bar's French line is 16 px, so the bar is still about 73 px tall; on a short phone the fire-is-close notice is closer set, so its six French lines and its button are whole above the bar as the screen opens; and on a phone under 360 px wide the second question's French captions are 16 px, so "Fumée épaisse qui monte" keeps to two lines.
- **The second question's third picture is a clear day,** not a night: the same pale sky and sun as the first picture, the same house, and three wavy lines beside it for the smell. Under "I only smell it" is a small second line, "or it's too dark to see". The picture is lower than the other two, so the tile, with one more line of words, is the same height as the others and the four answers still clear the 911 bar as the screen opens.
- **What is tested** (`web/e2e/leave.spec.ts`, `look.spec.ts`, `look-911.spec.ts`, `listen.spec.ts`; `web/src/data/evacuation.test.ts`): near the fire, no link in the screen opens a web page or a maps app, and the source is a paragraph, not a link; each centre's distance, compass point and arrow, from Bridgetown and from West Dalhousie; the Call 211 button dials 211; the province's page is an outlined button with its site's name; everything to tap is 56 px or taller with a drawing and words, and nothing is underlined; the tick list by tap and by keyboard, what it keeps and where, and that a new page starts with none; the info button's 48 px and its source rows; the third picture's sky, its second line and its height; Told to leave as a button in the fire-is-close notice, on the verdict (`glance.spec.ts`) and on the protect screen (`protect.spec.ts`); the 911 bar no taller than 76 px in French (`small-screens.spec.ts`).

## Hard rules (unchanged)
- Never "safe". Never "don't call 911" or any paraphrase.
- 911 on every screen; one Call 911 button per view.
- No green. (One exception, the province's "Burning permitted" on the burn badge: see "The sheet at half is compact".)
- Colour + icon + word for every status.
- Tokens:
  - Colours: bg #FAF6F0, cards #FFFFFF, text #1A1D21, navy #1B2A4A, orange #E8590C, red #D92D20, amber #F79009.
  - White text only on red and navy. On orange, white only for bold 24px+. On amber, always near-black.
  - Inter. 34px extrabold headlines, 22px bold titles, 18px body.
  - 56px+ targets, 18px radius, 480px max width. (One exception, the small info button, 48 px: see "every action a large button".)
