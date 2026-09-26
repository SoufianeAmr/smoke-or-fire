"""The verdict and confidence table from design/DESIGN-LOCK.md, cell by cell.

| Closest approach   | Wind steady                                  | Wind unsteady     |
| ≤ 25 km            | Drifting smoke. High if ≤ 10 km, else Medium | Unclear, Low      |
| 25–50 km           | Unclear, Medium                              | Unclear, Low      |
| > 50 km or no fire | Unexplained, Medium                          | Unexplained, Low  |
"""

import pytest

from smoke_engine.verdict import classify


@pytest.mark.parametrize(
    ("closest_km", "steady", "expected"),
    [
        # ≤ 25 km, steady: drifting, high if ≤ 10 km
        (0.0, True, ("drifting", "high")),
        (4.0, True, ("drifting", "high")),
        (10.0, True, ("drifting", "high")),
        (10.01, True, ("drifting", "medium")),
        (25.0, True, ("drifting", "medium")),
        # ≤ 25 km, unsteady
        (4.0, False, ("unclear", "low")),
        (25.0, False, ("unclear", "low")),
        # 25–50 km
        (25.01, True, ("unclear", "medium")),
        (38.0, True, ("unclear", "medium")),
        (50.0, True, ("unclear", "medium")),
        (38.0, False, ("unclear", "low")),
        (50.0, False, ("unclear", "low")),
        # > 50 km
        (50.01, True, ("unexplained", "medium")),
        (155.0, True, ("unexplained", "medium")),
        (50.01, False, ("unexplained", "low")),
        # no fire
        (None, True, ("unexplained", "medium")),
        (None, False, ("unexplained", "low")),
    ],
)
def test_verdict_and_confidence_follow_the_design_lock_table(closest_km, steady, expected):
    assert classify(closest_km, steady) == expected
