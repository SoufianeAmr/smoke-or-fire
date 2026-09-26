"""Where the engine's outside data comes from: live services, or recorded replay files.

A feed returns each service's answer as-is (Open-Meteo JSON, CWFIS GeoJSON,
ECCC GeoJSON), so live and replay go through the same parsing.
"""


class FeedUnavailable(Exception):
    """An outside data service did not answer usably."""
