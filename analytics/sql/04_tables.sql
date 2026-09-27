-- Tables derived in SQL from the raw tables: DETECTIONS, REPLAY_VERDICTS, VALIDATION and ENGINE_REFERENCE,
-- and the small functions they and the views use.

USE WAREHOUSE SMOKE_OR_FIRE_WH;
USE SCHEMA SMOKE_OR_FIRE.SEASON_2025;

-- Great-circle distance in km, the engine's formula (smoke_engine/geo.py distance_km, R = 6371.0 km).
CREATE OR REPLACE FUNCTION HAVERSINE_KM(LAT1 FLOAT, LON1 FLOAT, LAT2 FLOAT, LON2 FLOAT)
RETURNS FLOAT
AS
$$
  2 * 6371.0 * ASIN(SQRT(
    SQUARE(SIN((RADIANS(LAT2) - RADIANS(LAT1)) / 2))
    + COS(RADIANS(LAT1)) * COS(RADIANS(LAT2)) * SQUARE(SIN(RADIANS(LON2 - LON1) / 2))
  ))
$$;

-- Satellite names as the engine gives them (smoke_engine/detections.py SATELLITE_NAMES), for FIRMS and CWFIS codes.
CREATE OR REPLACE FUNCTION SATELLITE_NAME(CODE VARCHAR)
RETURNS VARCHAR
AS
$$
  CASE CODE
    WHEN 'N' THEN 'Suomi NPP'
    WHEN 'N20' THEN 'NOAA-20'
    WHEN 'N21' THEN 'NOAA-21'
    WHEN 'A' THEN 'Aqua'
    WHEN 'T' THEN 'Terra'
    WHEN 'S3A' THEN 'Sentinel-3A'
    WHEN 'S3B' THEN 'Sentinel-3B'
    ELSE CODE
  END
$$;

-- An ISO 8601 time ending in Z (UTC), as the engine reads it, to TIMESTAMP_NTZ in UTC. Fails on any other shape.
CREATE OR REPLACE FUNCTION UTC_NTZ(ISO VARCHAR)
RETURNS TIMESTAMP_NTZ
AS
$$
  CONVERT_TIMEZONE('UTC', TO_TIMESTAMP_TZ(REGEXP_REPLACE(ISO, 'Z$', ' +00:00'), 'YYYY-MM-DD"T"HH24:MI:SS TZH:TZM'))::TIMESTAMP_NTZ
$$;

-- One row per satellite detection: every FIRMS CSV row (all confidence levels, with the engine's confidence
-- rule in CONFIDENT) and every CWFIS hotspot with a rep_date (as the engine reads them).
CREATE OR REPLACE TABLE DETECTIONS AS
WITH firms AS (
  SELECT
    'FIRMS' AS source,
    CASE
      WHEN file_name LIKE '%firms_season/%' THEN 'SEASON_2025'
      WHEN file_name LIKE '%repo/replay_2025-08-25/%' THEN 'REPLAY_2025_08_25'
    END AS collection,
    COALESCE(
      REGEXP_SUBSTR(file_name, 'firms_season/([A-Z0-9_]+)/', 1, 1, 'e', 1),
      REGEXP_SUBSTR(file_name, 'firms/([A-Z0-9_]+)[.]csv', 1, 1, 'e', 1)
    ) AS dataset,
    SATELLITE_NAME(satellite) AS satellite,
    instrument,
    confidence,
    CASE
      WHEN instrument = 'MODIS' THEN TRY_TO_DOUBLE(confidence) >= 30
      ELSE COALESCE(LOWER(LEFT(TRIM(confidence), 1)), '') <> 'l'
    END AS confident,
    TO_DOUBLE(frp) AS frp,
    TO_NUMBER(type) AS type,
    daynight,
    -- acq_time is HHMM in UTC with leading zeros dropped ("104" is 01:04)
    TO_TIMESTAMP_NTZ(
      acq_date || ' ' || LEFT(LPAD(acq_time, 4, '0'), 2) || ':' || RIGHT(LPAD(acq_time, 4, '0'), 2),
      'YYYY-MM-DD HH24:MI'
    ) AS detected_at,
    'acquired' AS time_kind,
    TO_DOUBLE(latitude) AS lat,
    TO_DOUBLE(longitude) AS lon,
    version,
    CASE
      WHEN version LIKE '%URT' THEN 'URT'
      WHEN version LIKE '%NRT' THEN 'NRT'
      WHEN version LIKE '%RT' THEN 'RT'
      ELSE 'SP'
    END AS latency_class,
    file_name,
    -- the CSV data row, from 1, whatever row number the header line took
    rf.file_row - MIN(rf.file_row) OVER (PARTITION BY rf.file_name) + 1 AS file_row,
    NULL::VARCHAR AS cwfis_source,
    NULL::VARCHAR AS agency
  FROM RAW_FIRMS rf
),
cwfis AS (
  SELECT
    'CWFIS' AS source,
    CASE WHEN r.file_name LIKE '%repo/replay_2025-08-25/%' THEN 'REPLAY_2025_08_25' END AS collection,
    'CWFIS_HOTSPOTS' AS dataset,
    SATELLITE_NAME(NULLIF(f.value:properties:satellite::VARCHAR, '')) AS satellite,
    f.value:properties:sensor::VARCHAR AS instrument,
    NULL::VARCHAR AS confidence,
    NULL::BOOLEAN AS confident,
    f.value:properties:frp::FLOAT AS frp,
    NULL::NUMBER AS type,
    NULL::VARCHAR AS daynight,
    UTC_NTZ(f.value:properties:rep_date::VARCHAR) AS detected_at,
    'reported' AS time_kind,
    f.value:properties:lat::FLOAT AS lat,
    f.value:properties:lon::FLOAT AS lon,
    NULL::VARCHAR AS version,
    NULL::VARCHAR AS latency_class,
    r.file_name,
    f.index AS file_row,
    f.value:properties:source::VARCHAR AS cwfis_source,
    f.value:properties:agency::VARCHAR AS agency
  FROM RAW_JSON r,
    LATERAL FLATTEN(input => r.doc:features) f
  WHERE r.file_name LIKE '%repo/replay_2025-08-25/hotspots.json%'
    AND NULLIF(f.value:properties:rep_date::VARCHAR, '') IS NOT NULL
),
unioned AS (
  SELECT * FROM firms
  UNION ALL
  SELECT * FROM cwfis
)
SELECT
  source, collection, dataset, satellite, instrument, confidence, confident, frp, type, daynight,
  detected_at, time_kind, lat, lon, ST_MAKEPOINT(lon, lat) AS geog, version, latency_class,
  file_name, file_row, cwfis_source, agency
FROM unioned;

-- The engine's saved answers for the 14 replay towns (data/demo/), one row per town file.
CREATE OR REPLACE TABLE REPLAY_VERDICTS AS
WITH town_index AS (
  SELECT
    t.value:file::VARCHAR AS town_file,
    t.value:town::VARCHAR AS town,
    t.value:province::VARCHAR AS province,
    t.index + 1 AS town_order
  FROM RAW_JSON r,
    LATERAL FLATTEN(input => r.doc:towns) t
  WHERE r.file_name LIKE '%repo/demo/index.json%'
),
answers AS (
  SELECT REGEXP_SUBSTR(file_name, 'repo/demo/([^/]+[.]json)', 1, 1, 'e', 1) AS town_file, doc
  FROM RAW_JSON
  WHERE file_name LIKE '%repo/demo/%'
    AND file_name NOT LIKE '%repo/demo/index.json%'
)
SELECT
  COALESCE(i.town, a.doc:location:name::VARCHAR) AS town,
  COALESCE(i.province, a.doc:location:province::VARCHAR) AS province,
  a.doc:location:name::VARCHAR AS place_name,
  a.town_file,
  i.town_order,
  a.doc:location:lat::FLOAT AS lat,
  a.doc:location:lon::FLOAT AS lon,
  UTC_NTZ(a.doc:time::VARCHAR) AS check_time,
  a.doc:verdict::VARCHAR AS verdict,
  a.doc:confidence::VARCHAR AS confidence,
  a.doc:heights:chosen::VARCHAR AS chosen_height,
  a.doc:heights:agree::BOOLEAN AS heights_agree,
  a.doc:closestApproach:km::FLOAT AS closest_km,
  a.doc:heights:results:"100m":closestApproachKm::FLOAT AS closest_km_100m,
  a.doc:heights:results:"925hPa":closestApproachKm::FLOAT AS closest_km_925hpa,
  a.doc:heights:results:"850hPa":closestApproachKm::FLOAT AS closest_km_850hpa,
  CASE
    WHEN a.doc:closestApproach:km::FLOAT IS NULL THEN NULL
    WHEN a.doc:closestApproach:fire:name::VARCHAR IS NOT NULL THEN a.doc:closestApproach:fire:name::VARCHAR
    ELSE 'near ' || a.doc:closestApproach:fire:nearCommunity::VARCHAR || ', ' || a.doc:closestApproach:fire:province::VARCHAR
  END AS fire,
  a.doc:closestApproach:fire:lat::FLOAT AS fire_lat,
  a.doc:closestApproach:fire:lon::FLOAT AS fire_lon,
  a.doc:forward:agrees::BOOLEAN AS forward_agrees,
  a.doc:forward:closestKm::FLOAT AS forward_closest_km,
  a.doc:noFiresInRange::BOOLEAN AS no_fires_in_range
FROM answers a
LEFT JOIN town_index i ON i.town_file = a.town_file;

-- The Results table of VALIDATION.md, parsed line by line (the rows after the header and its separator,
-- up to the first line that is not a table row).
CREATE OR REPLACE TABLE VALIDATION AS
WITH doc AS (
  SELECT line_no, RTRIM(line, CHR(13)) AS line
  FROM RAW_TEXT
  WHERE file_name LIKE '%repo/VALIDATION.md%'
),
header AS (
  SELECT MIN(line_no) AS line_no FROM doc WHERE line LIKE '| Event |%'
),
table_end AS (
  SELECT MIN(d.line_no) AS line_no
  FROM doc d CROSS JOIN header h
  WHERE d.line_no > h.line_no AND COALESCE(d.line, '') NOT LIKE '|%'
),
table_rows AS (
  SELECT d.line_no, d.line
  FROM doc d CROSS JOIN header h CROSS JOIN table_end e
  WHERE d.line_no > h.line_no
    AND (e.line_no IS NULL OR d.line_no < e.line_no)
    AND d.line LIKE '| %'
),
cells AS (
  SELECT
    line_no,
    TRIM(SPLIT_PART(line, '|', 2)) AS event,
    TRIM(SPLIT_PART(line, '|', 3)) AS source_cell,
    TRIM(SPLIT_PART(line, '|', 4)) AS place,
    TRIM(SPLIT_PART(line, '|', 5)) AS time_cell,
    TRIM(SPLIT_PART(line, '|', 6)) AS verdict,
    TRIM(SPLIT_PART(line, '|', 7)) AS confidence,
    TRIM(SPLIT_PART(line, '|', 8)) AS closest_cell,
    TRIM(SPLIT_PART(line, '|', 9)) AS fire_cell,
    TRIM(SPLIT_PART(line, '|', 10)) AS forward_agrees,
    TRIM(SPLIT_PART(line, '|', 11)) AS match_cell
  FROM table_rows
),
links AS (
  SELECT
    *,
    REGEXP_SUBSTR(source_cell, '^[[]([^]]*)[]]', 1, 1, 'e', 1) AS link_label,
    REGEXP_SUBSTR(source_cell, '[]][(]([^)]*)[)]', 1, 1, 'e', 1) AS link_target
  FROM cells
)
SELECT
  ROW_NUMBER() OVER (ORDER BY line_no) AS row_order,
  IFF(event LIKE 'Control%', 'control', 'event') AS kind,
  event,
  COALESCE(link_label, source_cell) AS source_label,
  IFF(link_target LIKE '#%', NULL, link_target) AS source_url,
  place,
  TO_TIMESTAMP_NTZ(time_cell, 'YYYY-MM-DD HH24:MI') AS time_utc,
  verdict,
  confidence,
  TRY_TO_NUMBER(closest_cell) AS closest_km,
  TRIM(REPLACE(fire_cell, '†', '')) AS fire,
  CONTAINS(fire_cell, '†') AS fire_is_refinery,
  forward_agrees,
  match_cell = 'yes' AS match
FROM links;

-- Numbers the engine published, read from its own files: the merge counts and the refinery point from
-- TECH-FACTS.md, the Long Lake fire point from data/places/fire-names.json.
CREATE OR REPLACE TABLE ENGINE_REFERENCE AS
WITH facts AS (
  SELECT line_no, RTRIM(line, CHR(13)) AS line
  FROM RAW_TEXT
  WHERE file_name LIKE '%repo/TECH-FACTS.md%'
),
merges AS (
  SELECT line
  FROM facts
  WHERE line LIKE '- Merges over the 24 hours before the check%'
  QUALIFY ROW_NUMBER() OVER (ORDER BY line_no) = 1
),
refinery AS (
  SELECT line
  FROM facts
  WHERE line LIKE '%Irving Oil refinery in east Saint John (%'
  QUALIFY ROW_NUMBER() OVER (ORDER BY line_no) = 1
),
long_lake AS (
  SELECT f.value AS fire
  FROM RAW_JSON r,
    LATERAL FLATTEN(input => r.doc:fires) f
  WHERE r.file_name LIKE '%repo/places/fire-names.json%'
    AND f.value:name::VARCHAR = 'Long Lake'
  QUALIFY ROW_NUMBER() OVER (ORDER BY f.index) = 1
)
SELECT 'merges_total'::VARCHAR AS item, TO_DOUBLE(REGEXP_SUBSTR(line, ': ([0-9]+) CWFIS rows', 1, 1, 'e', 1)) AS value,
       'repo/TECH-FACTS.md' AS source_file, line AS source_line
FROM merges
UNION ALL
SELECT 'merges_twins', TO_DOUBLE(REGEXP_SUBSTR(line, '([0-9]+) of them republished', 1, 1, 'e', 1)),
       'repo/TECH-FACTS.md', line
FROM merges
UNION ALL
SELECT 'merges_same_satellite', TO_DOUBLE(REGEXP_SUBSTR(line, 'and ([0-9]+) same-satellite', 1, 1, 'e', 1)),
       'repo/TECH-FACTS.md', line
FROM merges
UNION ALL
SELECT 'refinery_lat', TO_DOUBLE(REGEXP_SUBSTR(line, 'Saint John [(](-?[0-9.]+), (-?[0-9.]+)[)]', 1, 1, 'e', 1)),
       'repo/TECH-FACTS.md', line
FROM refinery
UNION ALL
SELECT 'refinery_lon', TO_DOUBLE(REGEXP_SUBSTR(line, 'Saint John [(](-?[0-9.]+), (-?[0-9.]+)[)]', 1, 1, 'e', 2)),
       'repo/TECH-FACTS.md', line
FROM refinery
UNION ALL
SELECT 'long_lake_lat', fire:lat::FLOAT, 'repo/places/fire-names.json', TO_JSON(fire)
FROM long_lake
UNION ALL
SELECT 'long_lake_lon', fire:lon::FLOAT, 'repo/places/fire-names.json', TO_JSON(fire)
FROM long_lake;
