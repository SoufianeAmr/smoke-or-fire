-- The stage the raw files are PUT to, the file formats that read them, and the raw tables they are copied into.
-- Every raw table keeps the staged file name, so each row can be traced back to a file in analytics/data.

USE WAREHOUSE SMOKE_OR_FIRE_WH;
USE SCHEMA SMOKE_OR_FIRE.SEASON_2025;

-- Kept between runs so that load.py --skip-put can reload from files already staged; a full load.py run
-- empties it (REMOVE @RAW) before the PUTs.
CREATE STAGE IF NOT EXISTS RAW
  COMMENT = 'Raw files from analytics/data, unchanged (PUT with AUTO_COMPRESS)';

-- NASA FIRMS area API answers: CSV with one header line, no quoting.
CREATE OR REPLACE FILE FORMAT FIRMS_CSV
  TYPE = CSV
  FIELD_DELIMITER = ','
  SKIP_HEADER = 1
  FIELD_OPTIONALLY_ENCLOSED_BY = '"'
  EMPTY_FIELD_AS_NULL = TRUE
  TRIM_SPACE = FALSE
  ENCODING = 'UTF8';

-- One JSON document per file, kept whole.
CREATE OR REPLACE FILE FORMAT WHOLE_JSON
  TYPE = JSON
  STRIP_OUTER_ARRAY = FALSE;

-- Plain text, one row per line, nothing split, unquoted or unescaped.
CREATE OR REPLACE FILE FORMAT TEXT_LINES
  TYPE = CSV
  FIELD_DELIMITER = NONE
  SKIP_HEADER = 0
  FIELD_OPTIONALLY_ENCLOSED_BY = NONE
  ESCAPE = NONE
  ESCAPE_UNENCLOSED_FIELD = NONE
  EMPTY_FIELD_AS_NULL = FALSE
  SKIP_BLANK_LINES = FALSE
  TRIM_SPACE = FALSE
  ENCODING = 'UTF8';

-- The 15 FIRMS columns as sent (VIIRS and MODIS standard processing share the positions; bright_3 is
-- bright_ti4 or brightness, bright_12 is bright_ti5 or bright_t31).
CREATE OR REPLACE TABLE RAW_FIRMS (
  latitude VARCHAR,
  longitude VARCHAR,
  bright_3 VARCHAR,
  scan VARCHAR,
  track VARCHAR,
  acq_date VARCHAR,
  acq_time VARCHAR,
  satellite VARCHAR,
  instrument VARCHAR,
  confidence VARCHAR,
  version VARCHAR,
  bright_12 VARCHAR,
  frp VARCHAR,
  daynight VARCHAR,
  type VARCHAR,
  file_name VARCHAR,
  file_row NUMBER
);

CREATE OR REPLACE TABLE RAW_JSON (
  file_name VARCHAR,
  doc VARIANT
);

CREATE OR REPLACE TABLE RAW_TEXT (
  file_name VARCHAR,
  line_no NUMBER,
  line VARCHAR
);
