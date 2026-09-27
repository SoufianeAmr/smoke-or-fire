-- Copy the staged files into the raw tables. Staged names end in .gz (PUT ... AUTO_COMPRESS = TRUE).
-- METADATA$FILENAME is the path inside the stage, for example firms_season/MODIS_SP/2025-06-01_5d.csv.gz.

USE WAREHOUSE SMOKE_OR_FIRE_WH;
USE SCHEMA SMOKE_OR_FIRE.SEASON_2025;

-- FIRMS CSVs: the season archive (firms_season/<SOURCE>/) and the Aug 24-25 replay (repo/replay_2025-08-25/firms/).
COPY INTO RAW_FIRMS (
  latitude, longitude, bright_3, scan, track, acq_date, acq_time, satellite, instrument,
  confidence, version, bright_12, frp, daynight, type, file_name, file_row
)
FROM (
  SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
         METADATA$FILENAME, METADATA$FILE_ROW_NUMBER
  FROM @RAW
)
PATTERN = '.*(firms_season/[A-Z0-9_]+|replay_2025-08-25/firms)/[^/]+[.]csv([.]gz)?'
FILE_FORMAT = (FORMAT_NAME = 'FIRMS_CSV')
FORCE = TRUE;

-- JSON documents: CWFIS hotspots of the replay, the 14 demo verdicts and their index, the fire names,
-- the validation results and the manifests.
COPY INTO RAW_JSON (file_name, doc)
FROM (
  SELECT METADATA$FILENAME, $1
  FROM @RAW
)
PATTERN = '.*[.]json([.]gz)?'
FILE_FORMAT = (FORMAT_NAME = 'WHOLE_JSON')
FORCE = TRUE;

-- Markdown, line by line: VALIDATION.md (its Results table) and TECH-FACTS.md (the engine's published numbers).
COPY INTO RAW_TEXT (file_name, line_no, line)
FROM (
  SELECT METADATA$FILENAME, METADATA$FILE_ROW_NUMBER, $1
  FROM @RAW
)
PATTERN = '.*repo/(VALIDATION|TECH-FACTS)[.]md([.]gz)?'
FILE_FORMAT = (FORMAT_NAME = 'TEXT_LINES')
FORCE = TRUE;
