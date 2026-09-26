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

## Hard rules (unchanged)
- Never "safe". Never "don't call 911" or any paraphrase.
- 911 on every screen after the first; one Call 911 button per view.
- No green.
- Colour + icon + word for every status.
- Tokens:
  - Colours: bg #FAF6F0, cards #FFFFFF, text #1A1D21, navy #1B2A4A, orange #E8590C, red #D92D20, amber #F79009.
  - White text only on red and navy. On orange, white only for bold 24px+. On amber, always near-black.
  - Inter. 34px extrabold headlines, 22px bold titles, 18px body.
  - 56px+ targets, 18px radius, 480px max width.
