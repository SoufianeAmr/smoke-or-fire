"""NASA FIRMS detections: parsing the CSV the area API returns."""

from datetime import datetime, timezone

import pytest

from smoke_engine.detections import parse_firms_csv
from smoke_engine.feeds.replay import REPLAY_DIR


def saved_row(source: str, row: str) -> str:
    """The header and one row of a FIRMS CSV saved for the replay, checked to be in the file."""
    lines = (REPLAY_DIR / "firms" / f"{source}.csv").read_text(encoding="utf-8").splitlines()
    assert row in lines
    return f"{lines[0]}\n{row}\n"


def test_a_saved_viirs_row_becomes_one_detection_at_its_utc_overpass_time():
    text = saved_row("VIIRS_NOAA20_SP", "44.64941,-65.18841,331.92,0.48,0.48,2025-08-24,1633,N20,VIIRS,n,2,298.81,5.33,D,0")

    [d] = parse_firms_csv(text)

    assert (d.lat, d.lon, d.time, d.satellite, d.instrument, d.confidence, d.frp, d.daynight, d.latency_class, d.source) == (
        44.64941, -65.18841, datetime(2025, 8, 24, 16, 33, tzinfo=timezone.utc), "NOAA-20", "VIIRS", "n", 5.33, "D", "SP", "FIRMS"
    )


def test_a_saved_modis_row_just_after_midnight_utc_keeps_its_date():
    # acq_time "6" is 00:06 UTC.
    text = saved_row("MODIS_SP", "44.7108,-65.224,341.5,4.7,2,2025-08-25,6,Terra,MODIS,100,61.03,294.3,412.5,N,0")

    [d] = parse_firms_csv(text)

    assert (d.time, d.satellite, d.instrument, d.confidence, d.frp, d.daynight, d.latency_class) == (
        datetime(2025, 8, 25, 0, 6, tzinfo=timezone.utc), "Terra", "MODIS", "100", 412.5, "N", "SP"
    )


VIIRS_HEADER = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight"
MODIS_HEADER = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type"


@pytest.mark.parametrize(
    ("header", "row", "kept"),
    [
        (VIIRS_HEADER, "45.1,-64.2,330.1,0.4,0.4,2026-09-26,1712,N21,VIIRS,l,2.0NRT,290.2,3.1,D", False),
        (VIIRS_HEADER, "45.1,-64.2,330.1,0.4,0.4,2026-09-26,1712,N21,VIIRS,n,2.0NRT,290.2,3.1,D", True),
        (VIIRS_HEADER, "45.1,-64.2,330.1,0.4,0.4,2026-09-26,1712,N21,VIIRS,h,2.0NRT,290.2,3.1,D", True),
        (VIIRS_HEADER, "45.1,-64.2,300.4,0.4,0.4,2026-09-26,612,N21,VIIRS,n,2.0NRT,280.2,1.1,N", True),
        (MODIS_HEADER, "45.1,-64.2,320.5,1.0,1.0,2026-09-26,1540,Aqua,MODIS,29,6.1NRT,290.0,9.0,D,0", False),
        (MODIS_HEADER, "45.1,-64.2,320.5,1.0,1.0,2026-09-26,1540,Aqua,MODIS,30,6.1NRT,290.0,9.0,D,0", True),
        (MODIS_HEADER, "45.1,-64.2,310.5,1.0,1.0,2026-09-26,245,Terra,MODIS,30,6.1NRT,285.0,4.0,N,0", True),
    ],
    ids=["viirs-low", "viirs-nominal", "viirs-high", "viirs-night", "modis-29", "modis-30", "modis-night"],
)
def test_low_confidence_detections_are_dropped_and_night_ones_kept(header, row, kept):
    assert len(parse_firms_csv(f"{header}\n{row}\n")) == (1 if kept else 0)
