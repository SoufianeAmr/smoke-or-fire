"""Snowflake connection from analytics/.env, with key-pair authentication.

analytics/.env (gitignored) holds SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_ROLE, SNOWFLAKE_WAREHOUSE,
SNOWFLAKE_DATABASE, SNOWFLAKE_SCHEMA and SNOWFLAKE_PRIVATE_KEY_B64 (a PKCS#8 PEM private key, base64 on one line).
Nothing here prints a secret.
"""

import base64
import os
from pathlib import Path

import snowflake.connector
from cryptography.hazmat.primitives import serialization

ANALYTICS_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = ANALYTICS_DIR / ".env"
SQL_DIR = ANALYTICS_DIR / "sql"
DATA_DIR = ANALYTICS_DIR / "data"


def settings() -> dict[str, str]:
    """KEY=VALUE lines of analytics/.env; the environment wins over the file."""
    values = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip()
    values.update({k: v for k, v in os.environ.items() if k.startswith("SNOWFLAKE_")})
    return values


def _private_key_der(b64: str) -> bytes:
    key = serialization.load_pem_private_key(base64.b64decode(b64), password=None)
    return key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )


def connect(with_context: bool = True) -> snowflake.connector.SnowflakeConnection:
    """A connection as SNOWFLAKE_USER; with_context=False skips the warehouse, database and schema
    (for the setup script that creates them)."""
    s = settings()
    missing = [k for k in ("SNOWFLAKE_ACCOUNT", "SNOWFLAKE_USER", "SNOWFLAKE_PRIVATE_KEY_B64") if not s.get(k)]
    if missing:
        raise SystemExit(f"analytics/.env is missing {', '.join(missing)}")
    options = {
        "account": s["SNOWFLAKE_ACCOUNT"],
        "user": s["SNOWFLAKE_USER"],
        "private_key": _private_key_der(s["SNOWFLAKE_PRIVATE_KEY_B64"]),
        "role": s.get("SNOWFLAKE_ROLE") or None,
        "session_parameters": {"TIMEZONE": "UTC", "QUERY_TAG": "smoke-or-fire-analytics"},
    }
    if with_context:
        options.update(
            warehouse=s.get("SNOWFLAKE_WAREHOUSE", "SMOKE_OR_FIRE_WH"),
            database=s.get("SNOWFLAKE_DATABASE", "SMOKE_OR_FIRE"),
            schema=s.get("SNOWFLAKE_SCHEMA", "SEASON_2025"),
        )
    return snowflake.connector.connect(**options)


def run_sql_file(conn: snowflake.connector.SnowflakeConnection, name: str) -> None:
    """Run every statement of analytics/sql/<name>, in order, printing the first line of each."""
    text = (SQL_DIR / name).read_text(encoding="utf-8")
    for cursor in conn.execute_string(text, remove_comments=True):
        first = (cursor.query or "").strip().splitlines()[0][:100] if cursor.query else ""
        print(f"  ok: {first}")
