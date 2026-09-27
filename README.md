# Smoke or Fire? / Fumée ou feu ?

Smell smoke in the Maritimes? The app traces the air you are breathing back 24 hours and checks whether it passed a known fire.

- `engine/`: the verdict engine (FastAPI, `GET /verdict`).
- `web/`: the web app.
- `data/`: recorded replay data (Moncton, Aug 25, 2025, and the validation dates), demo verdicts, validation results and place data.
- `design/`: the frozen screens and the design lock.

## How it works (technical)

The engine traces the air arriving at your spot backward on hourly winds, at several heights, and measures how close it passed to each active fire; the verdict follows the table in `design/DESIGN-LOCK.md`. It also traces the fire's smoke forward in time as a second check, which never changes the verdict. The web app draws the engine's answer.

"If you’re told to leave" (from Check and Emergency) shows the evacuation centres officials announced, from `web/src/data/evacuation-events.json`: hand-curated from official releases, each item with its source, shown only on the dates it was active. Replay (Aug 25, 2025) shows the centres announced for the Long Lake fire; live mode, with no event active, says where officials announce centres. The app plans no routes: "Get directions" hands the address to the phone's maps app. Nothing is looked up at runtime.

[TECH-FACTS.md](TECH-FACTS.md) has the architecture, the method, the data sources and their limits, the Moncton replay facts and the test counts. It is generated from the code, the data and actual test runs by `engine/scripts/tech_facts.py`.

[VALIDATION.md](VALIDATION.md) tests the unchanged engine against 2025 reports of wildfire smoke in Maritimes communities and two quiet control days, with rules fixed before the run.

## Data credits

- **Natural Resources Canada, Canadian Wildland Fire Information System (CWFIS)**: active fires and satellite hotspots. Open Government Licence – Canada.
- **NASA FIRMS**: satellite fire detections (VIIRS and MODIS). We acknowledge the use of data from NASA’s Fire Information for Resource Management System (FIRMS) (https://www.earthdata.nasa.gov/data/tools/firms), part of NASA’s Earth Science Data and Information System (ESDIS).
- **Environment and Climate Change Canada (ECCC)**: Air Quality Health Index observations and stations. Open Government Licence – Canada.
- **Open-Meteo**: hourly wind (GFS 0.25°). Weather data by Open-Meteo.com, CC BY 4.0.
- **NRCan Canadian Geographical Names Database (CGNDB)**: community names and locations. Open Government Licence – Canada.
- **Natural Earth**: province, state and marine area outlines. Public domain.
- **Municipality of the County of Annapolis (Annapolis REMO)**: the Long Lake evacuation centres, phone lines and alert wording, from its news releases of August and September 2025.
- **NRCan Geolocation Service**: the centres' approximate coordinates, geocoded once from their addresses. Open Government Licence – Canada.
