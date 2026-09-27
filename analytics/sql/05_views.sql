-- The views the data room shows: the dedupe cross-check against the engine, persistent heat by H3 cell,
-- and the Long Lake fire pass by pass.

USE WAREHOUSE SMOKE_OR_FIRE_WH;
USE SCHEMA SMOKE_OR_FIRE.SEASON_2025;

-- What the engine's merge count (engine/scripts/tech_facts.py merges()) reads for the Moncton replay check at
-- 2025-08-25 12:00 UTC: every confident FIRMS row of the replay's three SP files acquired up to the check, and
-- every CWFIS hotspot reported up to the check (neither cut at 24 hours before). LIST_INDEX is the position in
-- the engine's lists, from 0: FIRMS in file order (feeds/replay.py reads firms/*.csv sorted by name: MODIS_SP,
-- VIIRS_NOAA20_SP, VIIRS_SNPP_SP), then CSV row; CWFIS in hotspots.json feature order.
CREATE OR REPLACE VIEW DEDUPE_INPUTS AS
WITH params AS (
  SELECT
    TO_TIMESTAMP_NTZ('2025-08-25 12:00:00') AS at_time,
    DATEADD(hour, -24, TO_TIMESTAMP_NTZ('2025-08-25 12:00:00')) AS since_time
)
SELECT
  d.source,
  ROW_NUMBER() OVER (PARTITION BY d.source ORDER BY d.dataset, d.file_row) - 1 AS list_index,
  d.dataset,
  d.file_row,
  d.satellite,
  d.frp,
  d.lat,
  d.lon,
  d.geog,
  d.detected_at,
  d.detected_at > p.since_time AS in_window,
  p.at_time,
  p.since_time
FROM DETECTIONS d
CROSS JOIN params p
WHERE d.collection = 'REPLAY_2025_08_25'
  AND d.detected_at <= p.at_time
  AND (d.source = 'CWFIS' OR d.confident);

-- Every CWFIS row the engine's rules merge into a FIRMS detection (smoke_engine/detections.py match()):
-- 1. Republished twin: the nearest FIRMS detection within 0.05 km whose FRP is within 0.05 MW (ties: lower
--    FIRMS index). Many CWFIS rows may twin one detection.
-- 2. Same-satellite duplicate: the CWFIS rows with no twin, in feature order, each take the nearest FIRMS
--    detection within 1 km from the same satellite, within 30 minutes, that is no twin and not already taken.
-- IN_WINDOW: the FIRMS detection was acquired in the 24 hours before the check (what the engine counts).
CREATE OR REPLACE VIEW DEDUPE_PAIRS AS
WITH RECURSIVE
firms AS (
  SELECT * FROM DEDUPE_INPUTS WHERE source = 'FIRMS'
),
cwfis AS (
  SELECT * FROM DEDUPE_INPUTS WHERE source = 'CWFIS'
),
twin_candidates AS (
  SELECT
    c.list_index AS cwfis_index,
    f.list_index AS firms_index,
    HAVERSINE_KM(c.lat, c.lon, f.lat, f.lon) AS distance_km
  FROM cwfis c
  JOIN firms f ON ST_DWITHIN(c.geog, f.geog, 100)
  WHERE c.frp IS NOT NULL
    AND f.frp IS NOT NULL
    AND ABS(c.frp - f.frp) <= 0.05::FLOAT
),
twins AS (
  SELECT cwfis_index, firms_index, distance_km
  FROM twin_candidates
  WHERE distance_km <= 0.05::FLOAT
  QUALIFY ROW_NUMBER() OVER (PARTITION BY cwfis_index ORDER BY distance_km, firms_index) = 1
),
rule2_candidates AS (
  SELECT
    c.list_index AS cwfis_index,
    f.list_index AS firms_index,
    HAVERSINE_KM(c.lat, c.lon, f.lat, f.lon) AS distance_km
  FROM cwfis c
  JOIN firms f ON ST_DWITHIN(c.geog, f.geog, 1100)
  WHERE c.list_index NOT IN (SELECT cwfis_index FROM twins)
    AND f.list_index NOT IN (SELECT firms_index FROM twins)
    AND c.satellite IS NOT NULL
    AND c.satellite = f.satellite
    AND ABS(DATEDIFF(second, c.detected_at, f.detected_at)) <= 30 * 60
),
rule2_steps AS (
  -- each CWFIS row's eligible FIRMS detections, nearest first, and its turn in feature order
  SELECT
    cwfis_index,
    ARRAY_AGG(firms_index) WITHIN GROUP (ORDER BY distance_km, firms_index) AS candidates,
    ROW_NUMBER() OVER (ORDER BY cwfis_index) AS step
  FROM rule2_candidates
  WHERE distance_km <= 1.0::FLOAT
  GROUP BY cwfis_index
),
greedy (step, cwfis_index, pick, taken) AS (
  SELECT
    s.step,
    s.cwfis_index,
    GET(s.candidates, 0),
    ARRAY_CONSTRUCT_COMPACT(GET(s.candidates, 0))
  FROM rule2_steps s
  WHERE s.step = 1
  UNION ALL
  SELECT
    s.step,
    s.cwfis_index,
    GET(FILTER(s.candidates, k -> NOT ARRAY_CONTAINS(k, g.taken)), 0),
    ARRAY_CAT(g.taken, ARRAY_CONSTRUCT_COMPACT(GET(FILTER(s.candidates, k -> NOT ARRAY_CONTAINS(k, g.taken)), 0)))
  FROM greedy g
  JOIN rule2_steps s ON s.step = g.step + 1
),
pairs AS (
  SELECT 'Republished twin (within 50 m, FRP within 0.05 MW)'::VARCHAR AS rule, cwfis_index, firms_index, distance_km
  FROM twins
  UNION ALL
  SELECT 'Same-satellite duplicate (within 1 km and 30 min)'::VARCHAR, g.cwfis_index, g.pick::NUMBER, r.distance_km
  FROM greedy g
  JOIN rule2_candidates r ON r.cwfis_index = g.cwfis_index AND r.firms_index = g.pick::NUMBER
  WHERE g.pick::NUMBER IS NOT NULL
)
SELECT
  p.rule,
  c.file_row AS cwfis_feature_index,
  c.detected_at AS cwfis_rep_date,
  c.satellite AS cwfis_satellite,
  c.frp AS cwfis_frp,
  f.dataset AS firms_dataset,
  f.file_row AS firms_file_row,
  f.satellite AS firms_satellite,
  f.detected_at AS firms_detected_at,
  f.frp AS firms_frp,
  p.distance_km,
  f.in_window
FROM pairs p
JOIN cwfis c ON c.list_index = p.cwfis_index
JOIN firms f ON f.list_index = p.firms_index;

-- The merge counts recomputed in SQL next to the counts the engine published in TECH-FACTS.md.
CREATE OR REPLACE VIEW DEDUPE_CROSSCHECK AS
WITH counted AS (
  SELECT
    COUNT_IF(rule LIKE 'Republished%' AND in_window) AS twins,
    COUNT_IF(rule LIKE 'Republished%' AND NOT in_window) AS twins_before,
    COUNT_IF(rule LIKE 'Same-satellite%' AND in_window) AS same_satellite,
    COUNT_IF(rule LIKE 'Same-satellite%' AND NOT in_window) AS same_satellite_before
  FROM DEDUPE_PAIRS
),
inputs AS (
  SELECT
    COUNT_IF(source = 'FIRMS') AS firms_rows,
    COUNT_IF(source = 'FIRMS' AND in_window) AS firms_in_window,
    COUNT_IF(source = 'CWFIS') AS cwfis_rows,
    TO_CHAR(MAX(at_time), 'YYYY-MM-DD HH24:MI') AS at_text
  FROM DEDUPE_INPUTS
),
engine AS (
  SELECT
    MAX(IFF(item = 'merges_twins', value, NULL))::NUMBER AS twins,
    MAX(IFF(item = 'merges_same_satellite', value, NULL))::NUMBER AS same_satellite,
    MAX(IFF(item = 'merges_total', value, NULL))::NUMBER AS total
  FROM ENGINE_REFERENCE
),
rules AS (
  SELECT
    'Republished twin (within 50 m, FRP within 0.05 MW)'::VARCHAR AS rule,
    c.twins AS sql_count,
    e.twins AS engine_count,
    'CWFIS rows whose FIRMS twin was acquired in the 24 hours before ' || i.at_text || ' UTC. '
      || c.twins_before || ' more CWFIS rows twin FIRMS detections acquired earlier; like the engine, they are not counted.'
      AS detail
  FROM counted c CROSS JOIN engine e CROSS JOIN inputs i
  UNION ALL
  SELECT
    'Same-satellite duplicate (within 1 km and 30 min)'::VARCHAR,
    c.same_satellite,
    e.same_satellite,
    'FIRMS detections acquired in the 24 hours before ' || i.at_text || ' UTC that took an untwinned CWFIS row, '
      || 'nearest first, rows in feature order, one row each. ' || c.same_satellite_before
      || ' more were taken by FIRMS detections acquired earlier.'
  FROM counted c CROSS JOIN engine e CROSS JOIN inputs i
  UNION ALL
  SELECT
    'Total merges'::VARCHAR,
    c.twins + c.same_satellite,
    e.total,
    'Inputs, as the engine reads them: ' || i.firms_rows || ' confident FIRMS rows acquired up to ' || i.at_text
      || ' UTC (' || i.firms_in_window || ' of them in the 24 hours before) from MODIS_SP, VIIRS_NOAA20_SP and '
      || 'VIIRS_SNPP_SP, and ' || i.cwfis_rows || ' CWFIS hotspot rows reported up to ' || i.at_text || ' UTC.'
  FROM counted c CROSS JOIN engine e CROSS JOIN inputs i
)
SELECT
  rule,
  sql_count,
  engine_count,
  IFF(engine_count IS NULL, FALSE, sql_count = engine_count) AS matches,
  detail
FROM rules;

-- H3 cells (resolution 7) with FIRMS detections of any confidence on the most distinct UTC days of
-- the 2025 season, with NASA's type labels: 0 presumed vegetation fire, 1 active volcano, 2 other static land
-- source, 3 offshore.
CREATE OR REPLACE VIEW PERSISTENT_HEAT AS
WITH refinery AS (
  SELECT
    MAX(IFF(item = 'refinery_lat', value, NULL)) AS lat,
    MAX(IFF(item = 'refinery_lon', value, NULL)) AS lon
  FROM ENGINE_REFERENCE
),
located AS (
  SELECT
    H3_LATLNG_TO_CELL_STRING(lat, lon, 7) AS h3_cell,
    detected_at,
    confident,
    type,
    satellite
  FROM DETECTIONS
  WHERE collection = 'SEASON_2025'
    AND source = 'FIRMS'
),
per_cell AS (
  SELECT
    h3_cell,
    COUNT(DISTINCT detected_at::DATE) AS distinct_days,
    COUNT(*) AS detections,
    COUNT_IF(confident) AS confident_detections,
    MIN(detected_at)::DATE AS first_day,
    MAX(detected_at)::DATE AS last_day,
    COUNT_IF(type = 0) AS type_0_vegetation,
    COUNT_IF(type = 1) AS type_1_volcano,
    COUNT_IF(type = 2) AS type_2_static_land,
    COUNT_IF(type = 3) AS type_3_offshore,
    COUNT(DISTINCT satellite) AS satellites
  FROM located
  GROUP BY h3_cell
),
placed AS (
  SELECT
    p.*,
    ST_Y(H3_CELL_TO_POINT(p.h3_cell)) AS center_lat,
    ST_X(H3_CELL_TO_POINT(p.h3_cell)) AS center_lon,
    TO_JSON(ST_ASGEOJSON(H3_CELL_TO_BOUNDARY(p.h3_cell))) AS boundary_geojson,
    p.h3_cell = H3_LATLNG_TO_CELL_STRING(r.lat, r.lon, 7) AS is_refinery_cell,
    r.lat AS refinery_lat,
    r.lon AS refinery_lon
  FROM per_cell p
  CROSS JOIN refinery r
)
SELECT
  h3_cell,
  distinct_days,
  detections,
  confident_detections,
  first_day,
  last_day,
  type_0_vegetation,
  type_1_volcano,
  type_2_static_land,
  type_3_offshore,
  satellites,
  RANK() OVER (ORDER BY distinct_days DESC) AS rank_by_days,
  center_lat,
  center_lon,
  boundary_geojson,
  is_refinery_cell,
  HAVERSINE_KM(center_lat, center_lon, refinery_lat, refinery_lon) AS km_from_refinery
FROM placed;

-- FIRMS detections of the 2025 season within 15 km of the Long Lake fire point (data/places/fire-names.json),
-- grouped into satellite passes: per satellite in time order, a new pass starts after a gap of more than
-- 30 minutes since that satellite's previous detection.
CREATE OR REPLACE VIEW LONG_LAKE_TIMELINE AS
WITH fire AS (
  SELECT ST_MAKEPOINT(
    MAX(IFF(item = 'long_lake_lon', value, NULL)),
    MAX(IFF(item = 'long_lake_lat', value, NULL))
  ) AS point
  FROM ENGINE_REFERENCE
),
nearby AS (
  SELECT d.satellite, d.instrument, d.detected_at, d.daynight, d.confident, d.frp, d.type, d.file_name, d.file_row
  FROM DETECTIONS d
  CROSS JOIN fire f
  WHERE d.collection = 'SEASON_2025'
    AND d.source = 'FIRMS'
    AND ST_DWITHIN(d.geog, f.point, 15000)
),
marked AS (
  SELECT
    *,
    IFF(
      DATEDIFF(
        minute,
        LAG(detected_at) OVER (PARTITION BY satellite ORDER BY detected_at, file_name, file_row),
        detected_at
      ) <= 30,
      0,
      1
    ) AS new_pass
  FROM nearby
),
numbered AS (
  SELECT
    *,
    SUM(new_pass) OVER (
      PARTITION BY satellite ORDER BY detected_at, file_name, file_row
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS pass_number
  FROM marked
)
SELECT
  satellite,
  MIN(instrument) AS instrument,
  pass_number,
  MIN(detected_at) AS pass_start,
  MAX(detected_at) AS pass_end,
  MIN_BY(daynight, detected_at) AS daynight,
  COUNT(*) AS detections,
  COUNT_IF(confident) AS confident_detections,
  SUM(frp) AS total_frp_mw,
  MAX(frp) AS max_frp_mw,
  COUNT_IF(type = 0) AS type_0_vegetation
FROM numbered
GROUP BY satellite, pass_number;
