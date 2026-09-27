# Hurdles

- MODIS CSVs name their columns `brightness` and `bright_t31`, not `bright_ti4` and `bright_ti5`, and archive (SP) files add a `type` column: the parser reads only the columns it needs, by name.
- `acq_time` has no leading zeros (`6` is 00:06 UTC, `508` is 05:08): it is read as a number and split into hours and minutes.
- FIRMS has no NOAA-21 archive (SP) source: the replay uses NOAA-20, Suomi NPP and MODIS, and the manifest records NOAA-21 SP as missing.
- httpx logs every request URL at INFO, and the FIRMS MAP_KEY sits in the URL: a log filter masks it as `***`, and every error is masked before it is logged, stored or raised.
- FIRMS answers a bad key or an exceeded limit with HTTP 200 and plain text: an answer counts only if it starts with the CSV header.
- Many CWFIS hotspots are FIRMS detections republished. A CWFIS row within 50 m of a FIRMS detection with the same FRP is merged into that twin; otherwise a CWFIS hotspot from the same satellite within 1 km and 30 minutes is merged. In the replay's 24 hours that is 148 merges (128 twins, 20 same-satellite), not the 225 first reported.
- The first merge rule (1 km and 30 minutes, any satellite) joined passes of different satellites: 101 of its 225 merges paired two satellites (e.g. NOAA-21 with Suomi NPP). A merge now needs the same satellite; detections from different satellites are independent observations and both count.
- Git converts line endings on Windows checkouts: `.gitattributes` keeps the raw FIRMS CSVs byte for byte.
- `lastSeen` was already a time string on each fire: it became the object with the time, satellite and latency class, and `lastSeen.time` holds the old value.
- Merging decides which detections make up the Long Lake fire, so its centre moves slightly and a shown distance can change by 1 km (Halifax 127 → 128 km; Moncton 159 → 158 → 159 km): the view tests use the rebuilt demo values; no verdict changed.
- CWFIS gives only a report time (`rep_date`; the layer has no observation-time field), and it can be hours late: the 9 `NASA_w` rows at Long Lake reported at 07:00 UTC, with no satellite named, are FIRMS's Terra detections from 00:06 UTC (same spots within 7 m, same FRP). They now merge into their FIRMS twins and take the acquisition time and satellite. A report time counts toward the 24-hour window but never as when a satellite saw a fire, so Long Lake reads “Terra saw it burning 10 hours ago” (01:43 UTC), not “in the last 5 hours”, and the badge names Terra.
- A fire with no satellite observation says it is on Canada's official active fire list only when it has a CWFIS fire record.
- The region's newest FIRMS detection in the replay (NOAA-20, 06:31 UTC) is in Massachusetts, not at Long Lake: the badge only ever uses the fire's own newest detection, never a region-wide one.
