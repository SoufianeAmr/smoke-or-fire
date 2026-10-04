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
- **Unexplained smoke: Call 911 is the main action.** The 911 bar stays and becomes it: "Look outside. See flames or a smoke column?" above a Call 911 button as wide as the bar. Still one Call 911 button per view.

## Amendment: the answer lives on the map (Oct 4, 2026)

The verdict screen (7a–7d) opens on a map. Nothing it said is gone; where it sits has changed. The reasons are in [docs/decisions/0003-map.md](../docs/decisions/0003-map.md).

- **The screen.** The top bar (New check, EN/FR), the map, and over the map's foot a sheet; the 911 bar under it, as before. The screen is as tall as the phone and does not scroll: the sheet does. With only the card showing, the sheet never covers the top bar: New check and EN/FR stay in reach.
- **The sheet has three heights, each as tall as what it holds.** Peek: the glance card, and the fire-is-close notice, which stays in front. Half: the three badges in one row, and "Why?". Full: everything "Why?" opens, unchanged, in the same order. The screen opens at peek.
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

## Hard rules (unchanged)
- Never "safe". Never "don't call 911" or any paraphrase.
- 911 on every screen; one Call 911 button per view.
- No green.
- Colour + icon + word for every status.
- Tokens:
  - Colours: bg #FAF6F0, cards #FFFFFF, text #1A1D21, navy #1B2A4A, orange #E8590C, red #D92D20, amber #F79009.
  - White text only on red and navy. On orange, white only for bold 24px+. On amber, always near-black.
  - Inter. 34px extrabold headlines, 22px bold titles, 18px body.
  - 56px+ targets, 18px radius, 480px max width.
