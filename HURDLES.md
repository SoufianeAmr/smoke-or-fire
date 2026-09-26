# Hurdles

- MODIS CSVs name their columns `brightness` and `bright_t31`, not `bright_ti4` and `bright_ti5`, and archive (SP) files add a `type` column: the parser reads only the columns it needs, by name.
- `acq_time` has no leading zeros (`6` is 00:06 UTC, `508` is 05:08): it is read as a number and split into hours and minutes.
- FIRMS has no NOAA-21 archive (SP) source: the replay uses NOAA-20, Suomi NPP and MODIS, and the manifest records NOAA-21 SP as missing.
- httpx logs every request URL at INFO, and the FIRMS MAP_KEY sits in the URL: a log filter masks it as `***`, and every error is masked before it is logged, stored or raised.
- FIRMS answers a bad key or an exceeded limit with HTTP 200 and plain text: an answer counts only if it starts with the CSV header.
- Many CWFIS hotspots are the same NASA VIIRS and MODIS detections: a FIRMS detection and a CWFIS hotspot within 1 km and 30 minutes are merged (225 duplicates in the replay's 24 hours).
- Git converts line endings on Windows checkouts: `.gitattributes` keeps the raw FIRMS CSVs byte for byte.
- `lastSeen` was already a time string on each fire: it became the object with the time, satellite and latency class, and `lastSeen.time` holds the old value.
- FIRMS points moved the Long Lake fire's centre about 150 m, so two shown distances changed by 1 km (Moncton 159 → 158 km, Halifax 127 → 128 km): the view tests use the rebuilt demo values; no verdict changed.
- The Long Lake fire's newest detection in the replay is a CWFIS hotspot with no satellite name: Why item 2 keeps the “Satellites saw it burning in the last 5 hours” sentence there.
