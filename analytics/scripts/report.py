"""Print what the Snowflake views say; with --write-tech-facts, also write the Snowflake section of TECH-FACTS.md.

    uv run python scripts/report.py                       (from analytics/; needs analytics/.env)
    uv run python scripts/report.py --write-tech-facts

Every number printed or written is a query result: the dedupe cross-check against the engine's merge
counts, the H3 cells with heat on the most days (and where the refinery point's cell ranks), the Long Lake
fire pass by pass, and the rows loaded. The section in the repo-root TECH-FACTS.md sits between
<!-- snowflake:start --> and <!-- snowflake:end -->, before "## Tests"; a re-run replaces it.
"""

import argparse

from snow import ANALYTICS_DIR, connect

TECH_FACTS = ANALYTICS_DIR.parent / "TECH-FACTS.md"
START, END = "<!-- snowflake:start -->", "<!-- snowflake:end -->"
TYPE_LABELS = (
    ("type_0_vegetation", "type 0 (presumed vegetation fire)"),
    ("type_1_volcano", "type 1 (active volcano)"),
    ("type_2_static_land", "type 2 (other static land source)"),
    ("type_3_offshore", "type 3 (offshore)"),
)


def query(cur, sql: str) -> list[dict]:
    cur.execute(sql)
    names = [c[0].lower() for c in cur.description]
    return [dict(zip(names, row)) for row in cur.fetchall()]


def facts(cur) -> dict:
    return {
        "context": query(cur, "SELECT CURRENT_DATABASE() AS db, CURRENT_SCHEMA() AS sch, CURRENT_WAREHOUSE() AS wh")[0],
        "warehouse": query(cur, "SHOW WAREHOUSES LIKE 'SMOKE_OR_FIRE_WH'"),
        "season": query(cur, """
            SELECT doc:bbox::VARCHAR AS bbox, doc:season:firstDay::VARCHAR AS first_day,
                   doc:season:lastDay::VARCHAR AS last_day, ARRAY_SIZE(OBJECT_KEYS(doc:files)) AS files
            FROM RAW_JSON WHERE file_name LIKE '%firms_season/manifest.json%'"""),
        "manifest_rows": query(cur, """
            SELECT f.value:source::VARCHAR AS dataset, SUM(f.value:"rows"::NUMBER) AS row_count
            FROM RAW_JSON r, LATERAL FLATTEN(input => r.doc:files) f
            WHERE r.file_name LIKE '%firms_season/manifest.json%'
            GROUP BY 1 ORDER BY 1"""),
        "detections": query(cur, """
            SELECT source, collection, dataset, COUNT(*) AS row_count, COUNT_IF(confident) AS confident,
                   TO_CHAR(MIN(detected_at), 'YYYY-MM-DD') AS first_day, TO_CHAR(MAX(detected_at), 'YYYY-MM-DD') AS last_day
            FROM DETECTIONS GROUP BY 1, 2, 3 ORDER BY 2 DESC, 1, 3"""),
        "tables": {
            t: query(cur, f"SELECT COUNT(*) AS n FROM {t}")[0]["n"]
            for t in ("REPLAY_VERDICTS", "VALIDATION", "ENGINE_REFERENCE")
        },
        "crosscheck": query(cur, "SELECT * FROM DEDUPE_CROSSCHECK ORDER BY rule"),
        "top": query(cur, """
            SELECT *, TO_CHAR(first_day, 'YYYY-MM-DD') AS first_text, TO_CHAR(last_day, 'YYYY-MM-DD') AS last_text
            FROM PERSISTENT_HEAT ORDER BY rank_by_days, detections DESC, h3_cell LIMIT 10"""),
        "cells": query(cur, "SELECT COUNT(*) AS n FROM PERSISTENT_HEAT")[0]["n"],
        "refinery_cell": query(cur, """
            SELECT *, TO_CHAR(first_day, 'YYYY-MM-DD') AS first_text, TO_CHAR(last_day, 'YYYY-MM-DD') AS last_text
            FROM PERSISTENT_HEAT WHERE is_refinery_cell"""),
        # the cells holding any season detection within 2 km of the refinery point, best-ranked first
        "refinery_near": query(cur, """
            WITH ref AS (
              SELECT ST_MAKEPOINT(MAX(IFF(item = 'refinery_lon', value, NULL)), MAX(IFF(item = 'refinery_lat', value, NULL))) AS point
              FROM ENGINE_REFERENCE
            )
            SELECT h.*
            FROM PERSISTENT_HEAT h
            WHERE h.h3_cell IN (
              SELECT H3_LATLNG_TO_CELL_STRING(d.lat, d.lon, 7)
              FROM DETECTIONS d CROSS JOIN ref
              WHERE d.collection = 'SEASON_2025' AND d.source = 'FIRMS' AND ST_DWITHIN(d.geog, ref.point, 2000)
            )
            ORDER BY h.rank_by_days, h.detections DESC, h.h3_cell"""),
        "long_lake": query(cur, """
            SELECT COUNT(*) AS passes, SUM(detections) AS detections, SUM(confident_detections) AS confident,
                   SUM(total_frp_mw) AS total_frp, SUM(type_0_vegetation) AS type_0,
                   TO_CHAR(MIN(pass_start), 'YYYY-MM-DD HH24:MI') AS first_pass,
                   TO_CHAR(MAX(pass_start), 'YYYY-MM-DD HH24:MI') AS last_pass,
                   COUNT(DISTINCT pass_start::DATE) AS days
            FROM LONG_LAKE_TIMELINE""")[0],
        "long_lake_first_last": query(cur, """
            SELECT satellite, TO_CHAR(pass_start, 'YYYY-MM-DD HH24:MI') AS pass_start, detections, total_frp_mw
            FROM LONG_LAKE_TIMELINE
            QUALIFY pass_start = MIN(pass_start) OVER () OR pass_start = MAX(pass_start) OVER ()
            ORDER BY pass_start, satellite"""),
        "long_lake_top": query(cur, """
            SELECT satellite, TO_CHAR(pass_start, 'YYYY-MM-DD HH24:MI') AS pass_start, daynight, detections, total_frp_mw
            FROM LONG_LAKE_TIMELINE ORDER BY total_frp_mw DESC NULLS LAST, pass_start LIMIT 1"""),
    }


def types(cell: dict) -> str:
    return ", ".join(f"{label} {cell[key]}" for key, label in TYPE_LABELS if cell[key])


def mw(x) -> str:
    return f"{x:,.1f} MW"


def show(f: dict) -> None:
    print("DEDUPE_CROSSCHECK")
    for r in f["crosscheck"]:
        print(f"  {r['rule']}: SQL {r['sql_count']}, engine {r['engine_count']}, {'match' if r['matches'] else 'NO MATCH'}")
        print(f"    {r['detail']}")

    print(f"\nPERSISTENT_HEAT: top 10 of {f['cells']} H3 cells (resolution 7) by distinct UTC days")
    for c in f["top"]:
        print(
            f"  #{c['rank_by_days']} {c['h3_cell']} ({c['center_lat']:.4f}, {c['center_lon']:.4f}): {c['distinct_days']} days, "
            f"{c['detections']} detections, {types(c)}; {c['first_text']} to {c['last_text']}; "
            f"{c['km_from_refinery']:.1f} km from the refinery point{' (refinery cell)' if c['is_refinery_cell'] else ''}"
        )
    for c in f["refinery_cell"]:
        print(f"\nRefinery point's cell {c['h3_cell']}: rank {c['rank_by_days']}, {c['distinct_days']} days, "
              f"{c['detections']} detections, {types(c)}")
    if not f["refinery_cell"]:
        print("\nRefinery point's cell: no season detection in it")
    print("Cells with a detection within 2 km of the refinery point:")
    for c in f["refinery_near"]:
        print(f"  {c['h3_cell']}: rank {c['rank_by_days']}, {c['distinct_days']} days, {c['detections']} detections, "
              f"{types(c)}{' (refinery cell)' if c['is_refinery_cell'] else ''}")

    ll = f["long_lake"]
    print(f"\nLONG_LAKE_TIMELINE: {ll['passes']} passes on {ll['days']} days, {ll['detections']} detections "
          f"({ll['confident']} confident, {ll['type_0']} type 0), total FRP {mw(ll['total_frp'] or 0)}")
    for p in f["long_lake_first_last"]:
        print(f"  {p['pass_start']} UTC {p['satellite']}: {p['detections']} detections, {mw(p['total_frp_mw'] or 0)}")
    for p in f["long_lake_top"]:
        print(f"  top pass by FRP: {p['pass_start']} UTC {p['satellite']} ({p['daynight']}), "
              f"{p['detections']} detections, {mw(p['total_frp_mw'] or 0)}")

    print("\nDETECTIONS (source, collection, dataset)")
    for d in f["detections"]:
        confident = f", {d['confident']} confident" if d["source"] == "FIRMS" else ""
        print(f"  {d['source']} {d['collection']} {d['dataset']}: {d['row_count']} rows{confident}, {d['first_day']} to {d['last_day']}")
    for m in f["manifest_rows"]:
        print(f"  manifest firms_season {m['dataset']}: {m['row_count']} rows listed")
    for table, n in f["tables"].items():
        print(f"{table}: {n} rows")


def section(f: dict) -> list[str]:
    ctx = f["context"]
    wh = f["warehouse"][0] if f["warehouse"] else {}
    season = f["season"][0] if f["season"] else {}
    season_sets = [d for d in f["detections"] if d["collection"] == "SEASON_2025"]
    replay_sets = [d for d in f["detections"] if d["collection"] == "REPLAY_2025_08_25"]
    top = f["top"][0] if f["top"] else None
    ll = f["long_lake"]
    lines = [
        START,
        "## Snowflake",
        "",
        f"A data room in `analytics/`, in Snowflake: database `{ctx['db']}`, schema `{ctx['sch']}`, warehouse "
        f"`{ctx['wh']}` ({wh.get('size', '')}, auto-suspend {wh.get('auto_suspend', '')} s), "
        f"Streamlit app `DATA_ROOM`. Every number in this section comes from SQL over the raw files in "
        f"`analytics/data/`. To regenerate: `uv run python scripts/report.py --write-tech-facts` (from `analytics/`).",
        "",
        "- Loaded: NASA FIRMS standard processing (SP), all confidence levels, "
        + (f"bbox `{season.get('bbox')}`, {season.get('first_day')} to {season.get('last_day')} "
           f"({season.get('files')} files): " if season else "")
        + ", ".join(f"`{d['dataset']}` {d['row_count']} rows" for d in season_sets)
        + (f"; the Moncton replay ({min(d['first_day'] for d in replay_sets)} to {max(d['last_day'] for d in replay_sets)}): "
           if replay_sets else "; the Moncton replay: ")
        + ", ".join(f"`{d['dataset']}` {d['row_count']} rows" for d in replay_sets)
        + f"; {f['tables']['REPLAY_VERDICTS']} replay verdicts and {f['tables']['VALIDATION']} validation rows.",
    ]
    cc = {r["rule"]: r for r in f["crosscheck"]}
    parts = [f"{r['rule'].split(' (')[0].lower()}: SQL {r['sql_count']}, engine {r['engine_count']}" for r in cc.values()]
    all_match = bool(cc) and all(r["matches"] for r in cc.values())
    lines.append(
        "- Dedupe cross-check, the engine's merge rules recomputed in SQL for the Moncton replay check "
        f"(view `DEDUPE_CROSSCHECK`): {'; '.join(parts)}. {'All match.' if all_match else 'Not all match: see `DEDUPE_PAIRS`.'}"
    )
    if top:
        heat = (
            f"- Persistent heat, H3 resolution 7, FIRMS detections of any confidence (view `PERSISTENT_HEAT`, "
            f"{f['cells']} cells): the top cell, `{top['h3_cell']}` ({top['center_lat']:.4f}, {top['center_lon']:.4f}), "
            f"had detections on {top['distinct_days']} UTC days ({top['detections']} detections: {types(top)})."
        )
        for c in f["refinery_cell"]:
            heat += (
                f" The cell of the refinery point in east Saint John, `{c['h3_cell']}`, ranks {c['rank_by_days']} with "
                f"{c['distinct_days']} days ({c['detections']} detections: {types(c)})."
            )
        near = f["refinery_near"]
        if len(near) > 1:
            ranks = ", ".join(f"rank {c['rank_by_days']} ({c['distinct_days']} days)" for c in near)
            heat += f" The {len(near)} cells with a detection within 2 km of the refinery point: {ranks}."
        lines.append(heat)
    if ll["passes"]:
        lines.append(
            f"- Long Lake, FIRMS detections within 15 km of the fire point (view `LONG_LAKE_TIMELINE`): "
            f"{ll['passes']} satellite passes on {ll['days']} days, {ll['detections']} detections, total FRP "
            f"{mw(ll['total_frp'] or 0)}; first pass {ll['first_pass']} UTC, last pass {ll['last_pass']} UTC."
        )
    lines += ["", END]
    return lines


def write_tech_facts(lines: list[str]) -> None:
    raw = TECH_FACTS.read_bytes().decode("utf-8")
    newline = "\r\n" if "\r\n" in raw else "\n"
    text = raw.replace("\r\n", "\n")
    block = "\n".join(lines) + "\n"
    if START in text and END in text:
        before, rest = text.split(START, 1)
        after = rest.split(END, 1)[1].lstrip("\n")
        text = before + block + "\n" + after
    elif "\n## Tests" in text:
        before, after = text.split("\n## Tests", 1)
        text = before.rstrip("\n") + "\n\n" + block + "\n## Tests" + after
    else:
        text = text.rstrip("\n") + "\n\n" + block
    TECH_FACTS.write_bytes(text.replace("\n", newline).encode("utf-8"))
    print(f"\nwrote the Snowflake section of {TECH_FACTS.name}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--write-tech-facts", action="store_true", help="write the Snowflake section of TECH-FACTS.md")
    args = parser.parse_args()
    conn = connect()
    f = facts(conn.cursor())
    conn.close()
    show(f)
    if args.write_tech_facts:
        write_tech_facts(section(f))


if __name__ == "__main__":
    main()
