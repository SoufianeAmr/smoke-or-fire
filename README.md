# Smoke or Fire? / Fumée ou feu ?

Smell smoke in the Maritimes? The app traces the air you are breathing back 24 hours and checks whether it passed a known fire.

- `engine/`: the verdict engine (FastAPI, `GET /verdict`).
- `web/`: the web app.
- `data/`: recorded replay data (Moncton, Aug 25, 2025), demo verdicts and place data.
- `design/`: the frozen screens and the design lock.

## Data credits

- **Natural Resources Canada, Canadian Wildland Fire Information System (CWFIS)**: active fires and satellite hotspots. Open Government Licence – Canada.
- **NASA FIRMS**: satellite fire detections (VIIRS and MODIS). We acknowledge the use of data from NASA’s Fire Information for Resource Management System (FIRMS) (https://www.earthdata.nasa.gov/data/tools/firms), part of NASA’s Earth Science Data and Information System (ESDIS).
- **Environment and Climate Change Canada (ECCC)**: Air Quality Health Index observations and stations. Open Government Licence – Canada.
- **Open-Meteo**: hourly wind (GFS 0.25°). Weather data by Open-Meteo.com, CC BY 4.0.
- **NRCan Canadian Geographical Names Database (CGNDB)**: community names and locations. Open Government Licence – Canada.
- **Natural Earth**: province, state and marine area outlines. Public domain.
