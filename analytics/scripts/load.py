"""Load analytics/data into Snowflake and build the tables and views, all in SQL.

    uv run python scripts/load.py                 (from analytics/; needs analytics/.env)
    uv run python scripts/load.py --skip-put      (reload from the files already staged)
    uv run python scripts/load.py --only-views    (recreate the views only: sql/05_views.sql)

Runs sql/01_setup.sql (warehouse, database, schema), sql/02_raw.sql (stage, file formats, raw tables),
PUTs every raw file to @RAW at its path under analytics/data, then sql/03_copy.sql (COPY INTO the raw
tables), sql/04_tables.sql (DETECTIONS, REPLAY_VERDICTS, VALIDATION, ENGINE_REFERENCE) and
sql/05_views.sql, and prints the row counts. Before any PUT it checks that every FIRMS CSV starts with
one of the two FIRMS standard-processing headers.
"""

import argparse
from pathlib import Path

from snow import DATA_DIR, connect, run_sql_file

FIRMS_HEADERS = {
    "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type",
    "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type",
}
FIRMS_DIRS = [
    *sorted(p for p in (DATA_DIR / "firms_season").glob("*") if p.is_dir()),
    DATA_DIR / "repo" / "replay_2025-08-25" / "firms",
]


def firms_csvs() -> list[Path]:
    return [f for d in FIRMS_DIRS for f in sorted(d.glob("*.csv"))]


def check_headers(files: list[Path]) -> None:
    """Stop before anything is uploaded if a FIRMS CSV is not a FIRMS answer (an error page, a changed format)."""
    if not files:
        raise SystemExit(f"no FIRMS CSV under {DATA_DIR}: run fetch_firms_season.py and copy_repo_data.py first")
    for f in files:
        with f.open(encoding="utf-8", newline="") as text:
            header = text.readline().lstrip("﻿").rstrip("\r\n")
        if header not in FIRMS_HEADERS:
            raise SystemExit(f"{f.relative_to(DATA_DIR).as_posix()}: not a FIRMS SP header: {header[:120]!r}")
    print(f"{len(files)} FIRMS CSVs, headers checked")


def other_files() -> list[Path]:
    """Every JSON and Markdown file under analytics/data (manifests, CWFIS hotspots, demo verdicts, docs)."""
    return sorted(f for pattern in ("*.json", "*.md") for f in DATA_DIR.rglob(pattern))


def put(cur, files: list[Path]) -> None:
    """PUT the files to the same paths under @RAW, gzipped: one PUT per directory and file type."""
    groups: dict[tuple[Path, str], int] = {}
    for f in files:
        groups[(f.parent, f.suffix)] = groups.get((f.parent, f.suffix), 0) + 1
    for (directory, suffix), expected in sorted(groups.items()):
        target = directory.relative_to(DATA_DIR).as_posix()
        cur.execute(f"PUT 'file://{directory.as_posix()}/*{suffix}' @RAW/{target}/ AUTO_COMPRESS=TRUE OVERWRITE=TRUE")
        rows = cur.fetchall()  # source, target, sizes, compressions, status, message
        uploaded = [row for row in rows if row[6] == "UPLOADED"]
        if len(uploaded) != expected:
            raise SystemExit(f"PUT {target}/*{suffix}: {len(uploaded)} of {expected} uploaded: {[row[6] for row in rows]}")
        print(f"  put {expected:3d} {suffix} files to @RAW/{target}/")


def counts(cur) -> None:
    cur.execute(
        "SELECT source, collection, dataset, COUNT(*), COUNT_IF(confident), "
        "TO_CHAR(MIN(detected_at), 'YYYY-MM-DD HH24:MI'), TO_CHAR(MAX(detected_at), 'YYYY-MM-DD HH24:MI') "
        "FROM DETECTIONS GROUP BY 1, 2, 3 ORDER BY 1, 2, 3"
    )
    print("DETECTIONS (source, collection, dataset: rows, confident, first, last, UTC)")
    for source, collection, dataset, rows, confident, first, last in cur.fetchall():
        print(f"  {source} {collection} {dataset}: {rows} rows, {confident} confident, {first} to {last}")
    for table in ("REPLAY_VERDICTS", "VALIDATION", "ENGINE_REFERENCE"):
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        print(f"{table}: {cur.fetchone()[0]} rows")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--skip-put", action="store_true", help="reload from the files already staged in @RAW")
    parser.add_argument("--only-views", action="store_true", help="recreate the views (sql/05_views.sql) only")
    args = parser.parse_args()

    if args.only_views:
        conn = connect()
        print("05_views.sql")
        run_sql_file(conn, "05_views.sql")
        conn.close()
        return

    files = firms_csvs()
    check_headers(files)
    files += other_files()

    conn = connect(with_context=False)
    print("01_setup.sql")
    run_sql_file(conn, "01_setup.sql")
    conn.close()

    conn = connect()
    cur = conn.cursor()
    print("02_raw.sql")
    run_sql_file(conn, "02_raw.sql")
    if not args.skip_put:
        cur.execute("REMOVE @RAW")
        put(cur, files)
    for name in ("03_copy.sql", "04_tables.sql", "05_views.sql"):
        print(name)
        run_sql_file(conn, name)
    counts(cur)
    conn.close()


if __name__ == "__main__":
    main()
