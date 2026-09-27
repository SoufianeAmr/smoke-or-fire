# Validation on real events

We ran the engine, unchanged, on 5 days in 2025 when wildfire smoke was publicly reported in a Maritimes community, and on 2 quiet control days. Nothing was tuned for this test: the rules, the events and the controls were committed (commit `f83e49f`) before the engine was run on any of them.

## Rules

- A reported smoke event matches if the verdict is drifting smoke or unclear.
- A control matches if the verdict is unexplained smoke and no fire is within 50 km of the air's path.
- The check runs at 9:00 a.m. Atlantic Daylight Time (UTC−3) on the date of the report, which is 12:00 UTC. Morning is when people wake up to haze and the smell of smoke, and two of the reports speak of the morning. The Maritimes kept daylight time from March 9 to November 2, 2025, which covers every date here, so 9:00 a.m. is always 12:00 UTC. It is also the hour of the app's Moncton replay.
- The place is the community's point in the Canadian Geographical Names Database.
- Each date has its own recording of the sources the live app uses (hourly wind, Canada's active fire records and satellite hotspots, NASA's archived satellite fire detections, air quality readings), kept raw with a manifest in `data/replay/`. The engine's full answers are in `data/validation/answers/`.

## Results

4 of 5 reported smoke events matched. 2 of 2 controls matched.

| Event | Source | Place | Time (UTC) | Verdict | Confidence | Closest km | Fire | Forward trace agrees | Match |
|---|---|---|---|---|---|---|---|---|---|
| Air quality statement for Moncton and southeast N.B. | [CBC News, 2025-08-24](https://www.cbc.ca/news/canada/new-brunswick/wildfire-update-nb-august-24-1.7616548) | Moncton, NB | 2025-08-24 12:00 | Drifting smoke | Medium | 3 | near Midwood, NB † | yes | yes |
| Smoke from Nova Scotia over Moncton; about 300 smoke calls | [CBC News, 2025-08-25](https://www.cbc.ca/news/canada/new-brunswick/two-evacuation-advisories-still-in-place-for-eastern-nb-1.7616825) | Moncton, NB | 2025-08-25 12:00 | Drifting smoke | Low | 19 | Long Lake, NS | yes | yes |
| Long Lake fire smoke over Halifax | [CBC News, 2025-08-26](https://www.cbc.ca/news/canada/nova-scotia/air-quality-annapolis-county-wildfire-1.7617762) | Halifax, NS | 2025-08-26 12:00 | Unexplained smoke | Low | 205 | near Fowlies Mill, NB | no | no |
| Smoke prompts calls to the Charlottetown Fire Department | [CBC News, 2025-08-15](https://www.cbc.ca/news/canada/prince-edward-island/pei-smoky-skies-wildfires-1.7609827) | Charlottetown, PE | 2025-08-14 12:00 | Drifting smoke | High | 9 | Long Lake, NS | yes | yes |
| Smoke drifting over Fredericton prompts 9-1-1 calls | [City of Fredericton, 2025-08-16](https://www.fredericton.ca/city-government/news/drifting-smoke-other-maritime-wildfires-prompting-fire-calls-fredericton) | Fredericton, NB | 2025-08-16 12:00 | Unclear | Low | 2 | near Grandview Industrial Park, NB † | yes | yes |
| Control: quiet day | [control check](#controls) | Charlottetown, PE | 2025-05-24 12:00 | Unexplained smoke | Low | — | none within 500 km | — | yes |
| Control: quiet day | [control check](#controls) | Moncton, NB | 2025-10-27 12:00 | Unexplained smoke | Low | — | none within 500 km | — | yes |

Closest km is how close the air's path, traced back 24 hours, came to that fire. The forward trace follows the fire's smoke forward to the time of the check; it agrees when the smoke came within 25 km of the place. It never changes the verdict.
† The Irving Oil refinery in east Saint John, not a wildfire: see Misses.

## Misses

Halifax, Aug. 26: unexplained smoke. The report blames the Long Lake fire, but its newest detections in the recording are from 01:43 UTC (NASA) and 07:00 UTC (a Canadian hotspot report) on Aug. 25, more than 24 hours before the check, and Canada's active fire list has no record for it, so the engine did not count it as burning. The closest the traced air came to any fire was 205 km. Two matches are right by the rules but for the wrong reason: in Moncton on Aug. 24 (3 km) and Fredericton on Aug. 16 (2 km), the “fire” the air passed is the Irving Oil refinery in east Saint John. NASA labels most of its detections there (2 of 3, and 4 of 5) a “static land source” (industrial heat), not a vegetation fire; the engine does not read that label. The reports blame a Nova Scotia wildfire (Long Lake, Annapolis County) and wildfires in Nova Scotia and other parts of New Brunswick.

## Events

Five events, picked from the reports found before any run: the two in the brief (Moncton on Aug. 24 and Aug. 25), then one report each for Nova Scotia (Halifax), Prince Edward Island (Charlottetown) and western New Brunswick (Fredericton). Each source names the place and the date and describes smoke there on that day.

- **Moncton, NB, 2025-08-24.** CBC News, 2025-08-24, [N.B. residents in two areas told to be ready to evacuate due to potential threat of fires](https://www.cbc.ca/news/canada/new-brunswick/wildfire-update-nb-august-24-1.7616548): “An air quality statement is in place for the Fundy National Park, Moncton and southeast New Brunswick due to smoke from a Nova Scotia wildfire drifting toward the areas.”
  Also: Acadia News, 2025-08-25, [Increased calls to fire departments due to N.S. wildfire smoke](https://d2940.cms.socastsrm.com/2025/08/25/128945/): “This part of the province was right in the path of the high winds blowing in from the Annapolis Valley on Sunday, and that caused the haze and smell of smoke.” Published Monday, Aug. 25; “Sunday” is Aug. 24.
- **Moncton, NB, 2025-08-25.** CBC News, 2025-08-25, [Restrictions on N.B. Crown land end at midnight, provincewide burn ban remains](https://www.cbc.ca/news/canada/new-brunswick/two-evacuation-advisories-still-in-place-for-eastern-nb-1.7616825): “Normally, it is possible to see the Université de Moncton campus from this location but wildfire smoke from Nova Scotia has reduced visibility and air quality. This photo was taken on the morning of Aug. 25.”
  Also: Acadia News, 2025-08-25, [Increased calls to fire departments due to N.S. wildfire smoke](https://d2940.cms.socastsrm.com/2025/08/25/128945/): “Moncton Fire Deputy Chief Keith Guptill says on Monday morning, Moncton, Dieppe and Riverview departments received around 300 calls.” Published Monday, Aug. 25.
- **Halifax, NS, 2025-08-26.** CBC News, 2025-08-26, [Air quality drops as smoke spreads from Annapolis County wildfire](https://www.cbc.ca/news/canada/nova-scotia/air-quality-annapolis-county-wildfire-1.7617762): “Thick smoke from the Long Lake fire in Nova Scotia's Annapolis County is shown over Halifax on Tuesday, Aug. 26, 2025.”
  Same article: “Ian Hubbard, a meteorologist with Environment Canada, said the smoke that many people could see and smell in the Halifax area Tuesday morning was simply driven east by the wind.”
- **Charlottetown, PE, 2025-08-14.** CBC News, 2025-08-15, [Less wildfire smoke in P.E.I. skies, but Islanders still advised to take precautions](https://www.cbc.ca/news/canada/prince-edward-island/pei-smoky-skies-wildfires-1.7609827): “The smoke on Thursday prompted calls to the Charlottetown Fire Department.” Published Friday, Aug. 15; “Thursday” is Aug. 14.
  Same article: “Skies were hazy across P.E.I. on Thursday as winds carried smoke from wildfires burning in Nova Scotia and New Brunswick into this province.”
- **Fredericton, NB, 2025-08-16.** City of Fredericton, 2025-08-16, [Drifting smoke from other Maritime wildfires prompting fire calls in Fredericton](https://www.fredericton.ca/city-government/news/drifting-smoke-other-maritime-wildfires-prompting-fire-calls-fredericton): “Smoke from wildfires in Nova Scotia and other parts of New Brunswick is drifting over Fredericton, prompting widespread fire calls to 9-1-1.” Dated Saturday, Aug. 16; it says the smoke will continue “through Saturday afternoon”.

Found but not run:

- Saint John, NB, Aug. 25: CBC News and the City of Saint John's air quality alert. Same date and fire as the Moncton event on Aug. 25.
- Oromocto, Harvey and Upper Kingsclear, NB, Aug. 16: CBC News, from an Oromocto Fire Department post. Same date and area as the Fredericton event.
- Halifax, NS, Aug. 12: smoke from the Bayers Lake (Susies Lake) fire, CBC News, Global News and the Halifax Regional Municipality. Halifax is already covered by Aug. 26.
- Miramichi, NB, Aug. 12: CBC News photo of a plume from the Oldfield Road fire. A plume seen over the area, not smoke reported in the town's air.
- Fredericton, NB, June 5: CBC News, “A line of smoke from Western Canada lingered over Fredericton on Thursday morning”. Smoke from fires in Western Canada, thousands of kilometres away. The engine looks for fires within 500 km only, so this smoke is outside what it can trace to a fire.
- Wolfville area, Annapolis Valley, Saint John (Aug. 29–30), Kentville (Sept. 29) and northern New Brunswick towns (Aug. 3). The place is a region, or the wording is a forecast or smoke seen from a distance.

## Controls

A control day is a community and date with no public smoke report and nothing recorded within 500 km of the community over the two UTC days recorded (the day before and the day itself): no NASA satellite detection of any confidence, no Canadian hotspot, and no Canadian fire record out of control or being held. The two controls come from a scan of May to October 2025 around Charlottetown, Moncton, Summerside, Amherst and Sackville, towns whose whole 500 km circle lies inside the area the NASA detections are downloaded for. From June to September only June 8 passed for any of them, and it was dropped: Moncton's AQHI reached 7 that day, a sign of smoke. The two picked are a spring day and an autumn day with low AQHI.

- **Charlottetown, PE, 2025-05-24.** From May 23 00:00 to May 25 00:00 UTC, within 500 km: 0 NASA satellite detections (0 in the whole region), 0 Canadian hotspots (4 in the whole area fetched), 0 fire records out of control or being held (0 in the whole area). 2 fire records under control, which the engine does not count, the closest 148 km away. Highest AQHI at the Charlottetown station (under 1 km away): 2. A news search for smoke in Charlottetown on May 24, 2025 found no report.
- **Moncton, NB, 2025-10-27.** From Oct. 26 00:00 to Oct. 28 00:00 UTC, within 500 km: 0 NASA satellite detections (1 in the whole region), 0 Canadian hotspots (13 in the whole area fetched), 0 fire records out of control or being held (2 in the whole area). 3 fire records under control, which the engine does not count, the closest 18 km away. Highest AQHI at the Moncton station (2 km away): 2. A news search for smoke in Moncton on Oct. 27, 2025 found no report.

Checked on 2026-09-27T03:14:01Z, before the engine ran. With no fire within 500 km the engine can only answer unexplained smoke, so these controls show that it does not invent a fire on a quiet day; they cannot test a close call.
