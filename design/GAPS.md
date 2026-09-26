# Screen gaps for the frontend step

The engine (`engine/`, `GET /verdict`) returns data that the frozen screens (7a–7d) do not yet have a design or wording for. None of these are solved here. Each needs a reviewed EN and FR string, following the hard rules in `DESIGN-LOCK.md`.

Field names refer to the `/verdict` JSON.

## Missing states

1. **AQHI not available.** `aqhi` is `null` when the nearest ECCC station has no reading within 2 hours before the check time. The "What to do" and "Air quality" cards have no design for this. The health advice is keyed by AQHI category, so it has no text to show either.
2. **Trace shorter than 24 hours.** A path stops early when it leaves the wind grid (41–51°N, 72–56°W), and `path.stoppedAtGridEdge` is `true`. Why item 1 must read "We traced the air back {path.hoursTraced} hours" instead of a fixed 24.
3. **Fire with no name.** CWFIS has no fire names. A fire gets `name` only from `data/places/fire-names.json`; otherwise `name` is `null` and `nearCommunity` is set. The headline, fire row, map label, Why item 2 and "Two possibilities" all need a "fire near {nearCommunity}" version. Fires outside N.B., N.S. and P.E.I. (Quebec, Maine) can also have `nearCommunity: null`, leaving only `province`.
4. **No recent satellite detection.** 7a's "Satellites saw it burning in the last 12 hours" becomes "…in the last {fire.lastSeenHoursAgo} hours". It has no source when the fire is a CWFIS record with no hotspot in the last 24 h (`lastSeen: null`).

## Wording that only fits the mockup's sample case

5. **Unclear has three cases, and 7c's text covers only a mix of them.** 7c's text assumes the air passed 25–50 km from the fire *and* the wind was unsteady. The engine also returns Unclear for:
   - ≤ 25 km with unsteady wind (Low): "not close enough to be sure" is wrong here.
   - 25–50 km with steady wind (Medium): "Winds shifted overnight" is wrong here.
6. **Confidence lowered because the three heights disagree.** The engine traces the air at 100 m, 925 hPa and 850 hPa. When their verdicts differ, confidence drops one level (`heights.agree: false`). The confidence sentence ("winds were steady all day") needs a version that says the heights disagreed. The Moncton replay is this case: the 100 m path passed 22 km from Long Lake (drifting), the 925 hPa and 850 hPa paths passed 30 km and 44 km (unclear), so confidence is Low.
7. **"Overnight".** The engine gives the time of the biggest wind shift in UTC (`wind.biggestShift.time`). The frontend has to word it in local time: overnight, this morning, yesterday afternoon.
8. **"Central New Brunswick".** Areas come back as province, state or water body codes (`NB`, `NS`, `PE`, `QC`, `ME`, `BAY_OF_FUNDY`, `GULF_OF_ST_LAWRENCE`, `GULF_OF_MAINE`). There is no "central" region, so the copy becomes "from New Brunswick", "up the Bay of Fundy", and so on.
9. **Open ocean has no area.** Points over the Atlantic outside the three named water bodies come back with `area: null`. The Moncton replay's 100 m path hits this: its origin, 20 h back and south of Nova Scotia, is `null`. Why item 1 ("It reached Moncton from …") and the map edge label need wording for it.

## Map

10. **Three paths.** The engine returns a path for each height (`heights.paths`). The map draws the chosen one (`heights.chosen`, the same as the top-level `path`). Whether the other two are drawn, and how, is a design decision.
11. **Edge label.** "13 h ago · central N.B." is the last point of the path inside the map frame. The frontend picks that point after framing the map and reads its `hoursAgo` and `area`.

## Numbers

12. **AQHI above 10.** `aqhi.display` is `"10+"` and `aqhi.segments` is 11.
13. **Rounded distances near a threshold.** Distances are whole km. When rounding would cross a threshold, the number is rounded the other way (25.3 km shows as 26 km), so "farther than the 25 km we need" never sits next to "25 km".
14. **"0 hours ago".** A fire counts when its closest point on the path is after the start, even by minutes, so `closestApproach.hoursAgo` can round to 0 (Miramichi replay: 0.07 h). "About 0 hours ago" needs wording, e.g. "within the last hour".
