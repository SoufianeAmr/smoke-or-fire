# Smoke or Fire? / Fumée ou feu ?

Smell smoke in the Maritimes? The app traces the air you are breathing back 24 hours and checks whether it passed a known fire.

- `engine/`: the verdict engine (FastAPI, `GET /verdict`).
- `web/`: the web app.
- `data/`: recorded replay data (Moncton, Aug 25, 2025, and the validation dates), demo verdicts, validation results and place data.
- `design/`: the frozen screens and the design lock.

## How it works (technical)

The engine traces the air arriving at your spot backward on hourly winds, at several heights, and measures how close it passed to each active fire; the verdict follows the table in `design/DESIGN-LOCK.md`. It also traces the fire's smoke forward in time as a second check, which never changes the verdict. The web app draws the engine's answer.

"If you’re told to leave" (from Check, Emergency, and verdicts with the fire under 25 km away) first asks where you are, unless a place was chosen this session. It shows the evacuation centres officials announced, from `web/src/data/evacuation-events.json`: hand-curated from official releases, each item with its source, shown only on the dates the event was active and within its radius of the fire (40 km). In replay (Aug 25, 2025), Bridgetown and West Dalhousie, N.S. get the Long Lake centres; farther away the screen says that evacuation doesn't apply and where officials announce centres for the province, as live mode does. The app plans no routes: "Get directions" hands the address to the phone's maps app. Nothing is looked up at runtime.

When the AQHI is moderate or worse, or there is no reading and the smoke is likely or possibly from a fire, "What to do" adds Health Canada's advice on keeping windows closed (heat comes first) and taking a break from the smoke. Two buttons open a Google Maps search for libraries and community centres around the spot that was checked, rounded to about 100 m. No address is stored or looked up by the app.

"Listen", on every screen, is a guided voice: it explains the screen and says which button to tap, with the browser's built-in speech. Its scripts are the `voice.*` strings in `web/src/i18n/`, filled with what the screen shows. It uses the most natural voice installed for the app's language (Canadian first), speaks one sentence at a time with a short pause, and says phone numbers digit by digit. It never starts by itself, stops when you tap it again, tap a phone number, change screen or leave the page, and is hidden when the browser can't speak.

[TECH-FACTS.md](TECH-FACTS.md) has the architecture, the method, the data sources and their limits, the Moncton replay facts and the test counts. It is generated from the code, the data and actual test runs by `engine/scripts/tech_facts.py`.

[VALIDATION.md](VALIDATION.md) tests the unchanged engine against 2025 reports of wildfire smoke in Maritimes communities and two quiet control days, with rules fixed before the run.

## Data credits

- **Natural Resources Canada, Canadian Wildland Fire Information System (CWFIS)**: active fires and satellite hotspots. Open Government Licence – Canada.
- **NASA FIRMS**: satellite fire detections (VIIRS and MODIS). We acknowledge the use of data from NASA’s Fire Information for Resource Management System (FIRMS) (https://www.earthdata.nasa.gov/data/tools/firms), part of NASA’s Earth Science Data and Information System (ESDIS).
- **Environment and Climate Change Canada (ECCC)**: Air Quality Health Index observations and stations. Open Government Licence – Canada.
- **Health Canada**: the windows and break-from-the-smoke advice, from its page "Wildfire smoke with extreme heat".
- **Open-Meteo**: hourly wind (GFS 0.25°). Weather data by Open-Meteo.com, CC BY 4.0.
- **NRCan Canadian Geographical Names Database (CGNDB)**: community names and locations. Open Government Licence – Canada.
- **Natural Earth**: province, state and marine area outlines. Public domain.
- **Municipality of the County of Annapolis (Annapolis REMO)**: the Long Lake evacuation centres, phone lines and alert wording, from its news releases of August and September 2025.
- **NRCan Geolocation Service**: the centres' approximate coordinates, geocoded once from their addresses. Open Government Licence – Canada.
