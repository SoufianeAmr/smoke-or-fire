"""Deploy the data room (analytics/streamlit/) as the Streamlit in Snowflake app SMOKE_OR_FIRE.SEASON_2025.DATA_ROOM.

    uv run python scripts/deploy_streamlit.py [--runtime container|warehouse]     (from analytics/; needs analytics/.env)

Uploads streamlit_app.py, pyproject.toml (container runtime) and environment.yml (warehouse runtime) to
@APP_STAGE/data_room/, creates the app from them (CREATE STREAMLIT ... FROM, or the older ROOT_LOCATION form
if the account does not take FROM), makes it live and prints where to open it. Re-running replaces the app
with the current files.
"""

import argparse

from snowflake.connector.errors import ProgrammingError

from snow import ANALYTICS_DIR, connect, settings

SCHEMA = "SMOKE_OR_FIRE.SEASON_2025"
STAGE = f"{SCHEMA}.APP_STAGE"
APP = f"{SCHEMA}.DATA_ROOM"
APP_FILES = ["streamlit_app.py", "pyproject.toml", "environment.yml"]
RUNTIMES = {
    # Python 3.11 container on Snowflake's CPU pool; dependencies from pyproject.toml
    "container": "RUNTIME_NAME = 'SYSTEM$ST_CONTAINER_RUNTIME_PY3_11' COMPUTE_POOL = SYSTEM_COMPUTE_POOL_CPU",
    # the query warehouse runs the app; dependencies from environment.yml (Snowflake Anaconda channel)
    "warehouse": "RUNTIME_NAME = 'SYSTEM$WAREHOUSE_RUNTIME'",
}
TITLE = "Smoke or Fire? — data room"


def main(runtime: str) -> None:
    warehouse = settings().get("SNOWFLAKE_WAREHOUSE", "SMOKE_OR_FIRE_WH")
    conn = connect()
    cur = conn.cursor()

    cur.execute(f"CREATE STAGE IF NOT EXISTS {STAGE} COMMENT = 'Source files of the DATA_ROOM Streamlit app'")
    for name in APP_FILES:
        path = (ANALYTICS_DIR / "streamlit" / name).as_posix()
        cur.execute(f"PUT 'file://{path}' @{STAGE}/data_room/ AUTO_COMPRESS=FALSE OVERWRITE=TRUE")
        row = cur.fetchone()  # source, target, sizes, compressions, status, message
        print(f"  put {row[0]}: {row[6]}")

    try:
        cur.execute(
            f"CREATE OR REPLACE STREAMLIT {APP} FROM '@{STAGE}/data_room' MAIN_FILE = 'streamlit_app.py' "
            f"QUERY_WAREHOUSE = {warehouse} TITLE = '{TITLE}' {RUNTIMES[runtime]}"
        )
        print(f"  created {APP} FROM @{STAGE}/data_room, {runtime} runtime")
    except ProgrammingError as error:
        print(f"  CREATE STREAMLIT ... FROM was refused ({error.msg}); using ROOT_LOCATION")
        cur.execute(
            f"CREATE OR REPLACE STREAMLIT {APP} ROOT_LOCATION = '@{STAGE}/data_room' MAIN_FILE = 'streamlit_app.py' "
            f"QUERY_WAREHOUSE = {warehouse} TITLE = '{TITLE}' {RUNTIMES[runtime]}"
        )
        print(f"  created {APP} ROOT_LOCATION = @{STAGE}/data_room")

    try:
        cur.execute(f"ALTER STREAMLIT {APP} ADD LIVE VERSION FROM LAST")
        print("  live version added")
    except ProgrammingError as error:
        print(f"  no live version to add ({error.msg}); the app is live as created")

    cur.execute("SELECT CURRENT_ORGANIZATION_NAME(), CURRENT_ACCOUNT_NAME()")
    org, account = cur.fetchone()
    conn.close()
    print("\nOpen it in Snowsight: Projects -> Streamlit -> DATA_ROOM, or")
    print(f"https://app.snowflake.com/{org.lower()}/{account.lower()}/#/streamlit-apps/{APP}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Deploy the DATA_ROOM Streamlit app.")
    parser.add_argument("--runtime", choices=sorted(RUNTIMES), default="warehouse")
    main(parser.parse_args().runtime)
