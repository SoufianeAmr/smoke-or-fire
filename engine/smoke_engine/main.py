"""Server entry point.

    uv run uvicorn smoke_engine.main:app --port 8000     (from engine/)

Live mode loads the saved wind grid (engine/.cache/live-wind.json) if it is
under 6 hours old and answers at once. Otherwise the first grid takes about
2 minutes, and until then live requests answer 503 "wind_data_unavailable".
/health shows whether the live grid is ready. Replay mode works at once.
"""

import logging

from smoke_engine.app import create_app
from smoke_engine.feeds.live import LiveFeeds
from smoke_engine.feeds.replay import ReplayFeeds

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)  # it logs every full grid URL otherwise

live = LiveFeeds()
app = create_app({"live": live, "replay": ReplayFeeds()}, lifespan=live.lifespan)
