"""Server entry point.

    uv run uvicorn smoke_engine.main:app --port 8000     (from engine/)

Live mode loads the saved wind grid (engine/.cache/live-wind.json) if it is
under 6 hours old and answers at once. Otherwise the first grid takes about
2 minutes, and until then live requests answer 503 "wind_data_unavailable"
with "status": "warming" and Retry-After: 15, so the app keeps trying instead
of showing "no data". Render wipes the disk whenever the free service spins
down, so every wake-up starts this way. /health shows whether the live grid
is ready. Replay mode works at once.

NASA FIRMS needs FIRMS_MAP_KEY: from the environment (Render), or engine/.env
locally. Without it, live verdicts use CWFIS alone (sources.firms.ok is false).
"""

import logging

from smoke_engine.app import create_app
from smoke_engine.feeds import sources
from smoke_engine.feeds.live import LiveFeeds
from smoke_engine.feeds.replay import ReplayFeeds

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)  # it logs every full grid URL otherwise

live = LiveFeeds(firms_key=sources.firms_key())
app = create_app({"live": live, "replay": ReplayFeeds()}, lifespan=live.lifespan)
