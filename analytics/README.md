# Smoke or Fire? data room (Snowflake)

A Snowflake analytics layer over real fire data for the 2025 Maritimes season: NASA's archived satellite
fire detections for June to September, the app's own Aug 24–25 replay recording, the engine's saved
verdicts for the 14 replay towns, and the validation table. Everything is loaded raw and every number is
computed in SQL. A Streamlit in Snowflake page, `DATA_ROOM` ("Smoke or Fire? — data room"), shows the results.

This folder never changes the app: nothing here writes to `engine/`, `web/` or `data/`, and Render's
`buildFilter` in `render.yaml` lists only `engine/**`, `data/**` and `render.yaml`, so a change here does not
redeploy the engine. The one file outside this folder it can write is the Snowflake section of the repo-root
`TECH-FACTS.md`, and only with `report.py --write-tech-facts`.

## Layout

| Path | What |
|---|---|
| `data/firms_season/<SOURCE>/<first day>_<N>d.csv` | NASA FIRMS area API answers, bytes as sent: `VIIRS_NOAA20_SP`, `VIIRS_SNPP_SP`, `MODIS_SP`, bbox `-72,41,-56,51`, 2025-06-01 to 2025-09-30 in 5-day requests |
| `data/firms_season/manifest.json` | Per file: URL (key masked), bbox, first day, day range, download time, rows, bytes, SHA-256, header; FIRMS data availability |
| `data/repo/` | Copies of the repo's own data, unchanged: the replay's FIRMS SP files and CWFIS hotspots, `data/demo/`, the validation results, `VALIDATION.md`, `TECH-FACTS.md`, the fire names; `manifest.json` records the source path, commit and SHA-256 of each |
| `sql/01_setup.sql` | Warehouse `SMOKE_OR_FIRE_WH` (X-Small, auto-suspend 60 s), database `SMOKE_OR_FIRE`, schema `SEASON_2025` |
| `sql/02_raw.sql` | Stage `RAW`, file formats, raw tables `RAW_FIRMS`, `RAW_JSON`, `RAW_TEXT` |
| `sql/03_copy.sql` | `COPY INTO` the raw tables from the staged files |
| `sql/04_tables.sql` | `DETECTIONS`, `REPLAY_VERDICTS`, `VALIDATION`, `ENGINE_REFERENCE` and the functions `HAVERSINE_KM`, `SATELLITE_NAME`, `UTC_NTZ` |
| `sql/05_views.sql` | `DEDUPE_INPUTS`, `DEDUPE_PAIRS`, `DEDUPE_CROSSCHECK`, `PERSISTENT_HEAT`, `LONG_LAKE_TIMELINE` |
| `scripts/` | `fetch_firms_season.py`, `copy_repo_data.py`, `load.py`, `deploy_streamlit.py`, `report.py`; `snow.py` is the shared connection |
| `streamlit/` | The `DATA_ROOM` app |

## One-time setup: key-pair login

The scripts log in with a key pair, never a password.

1. Generate a private key and its public key (from `analytics/`; `*.p8` is gitignored: never commit the private key):

   ```
   openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out rsa_key.p8 -nocrypt
   openssl rsa -in rsa_key.p8 -pubout -out rsa_key.pub
   ```

2. In a Snowsight worksheet, register the public key (the text between the `BEGIN` and `END` lines of
   `rsa_key.pub`, on one line) on your user:

   ```sql
   ALTER USER <your user> SET RSA_PUBLIC_KEY = 'MIIBIjANBgkqh...';
   DESC USER <your user>;  -- RSA_PUBLIC_KEY_FP is now set
   ```

3. Fill `analytics/.env` (gitignored, never committed):

   ```
   SNOWFLAKE_ACCOUNT=<orgname>-<accountname>
   SNOWFLAKE_USER=<your user>
   SNOWFLAKE_ROLE=<a role that can create a warehouse and a database>
   SNOWFLAKE_WAREHOUSE=SMOKE_OR_FIRE_WH
   SNOWFLAKE_DATABASE=SMOKE_OR_FIRE
   SNOWFLAKE_SCHEMA=SEASON_2025
   SNOWFLAKE_PRIVATE_KEY_B64=<rsa_key.p8, base64 on one line>
   ```

   `SNOWFLAKE_PRIVATE_KEY_B64` is the whole PEM file base64-encoded, for example
   `base64 -w0 rsa_key.p8` (Git Bash) or
   `[Convert]::ToBase64String([IO.File]::ReadAllBytes("rsa_key.p8"))` (PowerShell).

## Run order

From `analytics/`, with [uv](https://docs.astral.sh/uv/):

```
uv run python scripts/fetch_firms_season.py   # NASA FIRMS SP season, raw, with manifest (MAP_KEY from engine/.env)
uv run python scripts/copy_repo_data.py       # the repo's own data, unchanged, with manifest
uv run python scripts/load.py                 # setup, PUT, COPY, tables, views; prints row counts
uv run python scripts/deploy_streamlit.py     # the DATA_ROOM app; prints where to open it
uv run python scripts/report.py               # what the views say (--write-tech-facts: TECH-FACTS.md section)
```

`load.py --skip-put` reloads from the files already staged; `load.py --only-views` recreates the views.

To open the app: Snowsight → Projects → Streamlit → `DATA_ROOM` (`deploy_streamlit.py` prints the direct link).

## Tables and views

- `DETECTIONS`: one row per detection. FIRMS rows of the season (`SEASON_2025`) and of the replay
  (`REPLAY_2025_08_25`), all confidence levels, with NASA's `type`, and `CONFIDENT` by the engine's rule
  (VIIRS nominal or high, MODIS 30 or more); CWFIS hotspots of the replay, whose time is a report time.
  Times are UTC (`TIMESTAMP_NTZ`); `GEOG` is a `GEOGRAPHY` point.
- `REPLAY_VERDICTS`: the engine's saved answer for each of the 14 replay towns: verdict, confidence, closest
  approach per height, the fire, and whether the forward trace agrees.
- `VALIDATION`: the Results table of `VALIDATION.md`, parsed in SQL.
- `ENGINE_REFERENCE`: numbers the engine published (merge counts and the refinery point in `TECH-FACTS.md`,
  the Long Lake fire point in `data/places/fire-names.json`), read in SQL.
- `DEDUPE_CROSSCHECK`: the engine's two merge rules (a CWFIS row within 50 m of a FIRMS detection with FRP
  within 0.05 MW is that detection republished; otherwise one from the same satellite within 1 km and
  30 minutes is a duplicate) recomputed in SQL for the Moncton replay check, next to the engine's counts.
  `DEDUPE_PAIRS` lists every merged pair; `DEDUPE_INPUTS` the rows both read.
- `PERSISTENT_HEAT`: H3 cells (resolution 7) ranked by the number of distinct UTC days with a FIRMS
  detection in the season, with NASA's type label counts and the distance to the refinery point.
- `LONG_LAKE_TIMELINE`: FIRMS detections within 15 km of the Long Lake fire, grouped into satellite passes,
  with total fire radiative power per pass.

## Credits

- NASA FIRMS (Fire Information for Resource Management System): VIIRS (NOAA-20, Suomi NPP) and MODIS
  (Terra, Aqua) active fire detections, standard-processing archive.
- NRCan CWFIS (Canadian Wildland Fire Information System): satellite hotspots.
