"""Verdict and confidence, exactly as the table in design/DESIGN-LOCK.md."""

HIGH_CONFIDENCE_KM = 10.0
DRIFTING_KM = 25.0
SEARCH_KM = 50.0


def classify(closest_km: float | None, steady: bool) -> tuple[str, str]:
    """Return (verdict, confidence) for a closest approach and wind steadiness.

    closest_km is the unrounded closest approach between the traced path and
    any fire, or None when there is no fire.
    """
    if closest_km is not None and closest_km <= DRIFTING_KM:
        if not steady:
            return "unclear", "low"
        return "drifting", "high" if closest_km <= HIGH_CONFIDENCE_KM else "medium"
    if closest_km is not None and closest_km <= SEARCH_KM:
        return "unclear", "medium" if steady else "low"
    return "unexplained", "medium" if steady else "low"


LOWER_CONFIDENCE = {"high": "medium", "medium": "low", "low": "low"}


def across_heights(results: dict[str, tuple[str, str]], chosen: str) -> tuple[str, str, bool]:
    """Verdict and confidence from the chosen height, one confidence level lower
    when the heights do not all give the same verdict.

    Returns (verdict, confidence, heights_agree).
    """
    verdict, confidence = results[chosen]
    agree = len({v for v, _ in results.values()}) == 1
    return verdict, confidence if agree else LOWER_CONFIDENCE[confidence], agree


def choose_height(closest_km_by_height: dict[str, float | None]) -> str:
    """The height whose path came closest to a fire.

    Ties, including no fire at any height, go to the first height listed.
    """
    heights = list(closest_km_by_height)
    return min(heights, key=lambda h: (closest_km_by_height[h] is None, closest_km_by_height[h] or 0.0, heights.index(h)))


def display_km(km: float) -> int:
    """Whole km for the screen, never rounded across a verdict threshold.

    25.3 km is past the 25 km line, so it shows as 26, not 25.
    """
    shown = int(km + 0.5)
    for threshold in (HIGH_CONFIDENCE_KM, DRIFTING_KM, SEARCH_KM):
        if km > threshold and shown <= threshold:
            shown = int(threshold) + 1
    return shown
