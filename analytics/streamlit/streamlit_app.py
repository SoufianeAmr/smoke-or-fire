"""Smoke or Fire? data room: a Streamlit in Snowflake page over the SEASON_2025 views.

Runs inside Snowflake (Snowsight -> Projects -> Streamlit -> DATA_ROOM); deploy it with
"uv run python scripts/deploy_streamlit.py" from analytics/. Every number on the page comes from a SQL query.
"""

import math

import altair as alt
import pandas as pd
import pydeck as pdk
import streamlit as st
from snowflake.snowpark.context import get_active_session
from streamlit.errors import StreamlitAPIException

SCHEMA = "SMOKE_OR_FIRE.SEASON_2025"
TITLE = "Smoke or Fire? — data room"
CREDITS = (
    "Data: NASA FIRMS (VIIRS and MODIS standard-processing archive); "
    "NRCan CWFIS (Canadian Wildland Fire Information System)."
)

# FIRMS writes the satellite as a short code in the VIIRS files.
SATELLITE_NAMES = {"N": "Suomi NPP", "N20": "NOAA-20", "N21": "NOAA-21", "A": "Aqua", "T": "Terra"}
SATELLITE_ORDER = ["NOAA-20", "Suomi NPP", "Aqua", "Terra"]
SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"]
SERIES_SHAPES = ["circle", "square", "diamond", "triangle-up", "cross", "triangle-down", "circle", "square"]
DAYS_RAMP = ["#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281"]
REFINERY_OUTLINE = [235, 104, 52]
INK = [11, 11, 11]
MUTED_INK = [82, 81, 78]
TOWN_DOT = [137, 135, 129]
# Carto's light basemap without place names: the page labels the replay towns itself.
BASEMAP = "https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json"
# At the opening zoom, points closer than this overlap, so they share one label.
RANK_GROUP_KM = 25
TOWN_GROUP_KM = 15


@st.cache_data(ttl=600)
def query(sql: str) -> pd.DataFrame:
    return get_active_session().sql(sql).to_pandas()


def numbers(df: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    """NUMBER columns can arrive as Decimal; make them plain floats or ints."""
    for column in columns:
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors="coerce")
    return df


def is_true(value) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in ("true", "yes", "y", "1", "match")
    return bool(value) if pd.notna(value) else False


def yes_no(value) -> str:
    if value is None or (not isinstance(value, str) and pd.isna(value)):
        return ""
    if isinstance(value, str) and value.strip().lower() not in ("true", "false", "1", "0"):
        return value
    return "yes" if is_true(value) else "no"


def whole(value) -> str:
    return "" if pd.isna(value) else f"{value:,.0f}"


def day(value) -> str:
    return "" if pd.isna(value) else pd.Timestamp(value).strftime("%Y-%m-%d")


def minute(value) -> str:
    if value is None or (not isinstance(value, str) and pd.isna(value)):
        return ""
    try:
        return pd.Timestamp(value).strftime("%Y-%m-%d %H:%M")
    except (TypeError, ValueError):
        return str(value)


def h3_hex(cell) -> str:
    """H3 index as the hex string deck.gl expects, whether SQL gave a string or an integer."""
    return cell if isinstance(cell, str) else format(int(cell), "x")


def km_between(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(a))


def shared_labels(lats, lons, texts, group_km: float) -> list[str]:
    """One label per group of nearby points ("2, 4, 5"), on the group's first point; the others get none."""
    labels, anchors = [], []
    for lat, lon, text in zip(lats, lons, texts):
        group = next((i for i, (a_lat, a_lon) in anchors if km_between(lat, lon, a_lat, a_lon) < group_km), None)
        if group is None:
            anchors.append((len(labels), (lat, lon)))
            labels.append(text)
        else:
            labels[group] += f", {text}"
            labels.append("")
    return labels


def ramp_color(days: float, low: float, high: float) -> list[int]:
    share = 0.0 if high <= low else (days - low) / (high - low)
    hex_color = DAYS_RAMP[round(share * (len(DAYS_RAMP) - 1))]
    return [int(hex_color[i : i + 2], 16) for i in (1, 3, 5)]


def wide_chart(chart) -> None:
    """Full width: width="stretch" on current Streamlit, use_container_width on the 1.2x releases."""
    try:
        st.altair_chart(chart, width="stretch")
    except (TypeError, StreamlitAPIException):
        st.altair_chart(chart, use_container_width=True)


st.set_page_config(layout="wide")  # Streamlit in Snowflake has no page_title; the STREAMLIT object's TITLE names the app
st.title(TITLE)
st.caption(
    "The 2025 Maritimes fire season, June 1 to Sept. 30. "
    f"Each section below is a SQL query over the raw files loaded into {SCHEMA}."
)

# 1. Long Lake timeline
st.subheader("Long Lake fire, 2025: satellite passes within 15 km")
st.caption(
    "One mark per satellite pass: the total fire radiative power (FRP) of the NASA FIRMS standard-processing "
    "detections within 15 km of the Long Lake fire (West Dalhousie, N.S.), from the SQL view LONG_LAKE_TIMELINE."
)
passes = query(f"SELECT * FROM {SCHEMA}.LONG_LAKE_TIMELINE ORDER BY PASS_START")
passes = numbers(passes, ["DETECTIONS", "CONFIDENT_DETECTIONS", "TOTAL_FRP_MW", "MAX_FRP_MW", "TYPE_0_VEGETATION"])
if passes.empty:
    st.markdown("The view LONG_LAKE_TIMELINE has no rows.")
else:
    passes["PASS_START"] = pd.to_datetime(passes["PASS_START"])
    passes["SATELLITE_NAME"] = passes["SATELLITE"].map(lambda s: SATELLITE_NAMES.get(s, s))
    passes["ZERO"] = 0

    tiles = st.columns(5)
    tiles[0].metric("Passes", f"{len(passes):,}")
    tiles[1].metric("Detections", whole(passes["DETECTIONS"].sum()))
    tiles[2].metric("Total FRP (MW)", whole(passes["TOTAL_FRP_MW"].sum()))
    tiles[3].metric("First pass (UTC)", day(passes["PASS_START"].min()))
    tiles[4].metric("Last pass (UTC)", day(passes["PASS_START"].max()))

    present = set(passes["SATELLITE_NAME"])
    domain = [s for s in SATELLITE_ORDER if s in present] + sorted(present - set(SATELLITE_ORDER))
    color = alt.Color(
        "SATELLITE_NAME:N",
        title="Satellite",
        scale=alt.Scale(domain=domain, range=SERIES_COLORS[: len(domain)]),
        legend=alt.Legend(orient="top"),
    )
    shape = alt.Shape(
        "SATELLITE_NAME:N",
        title="Satellite",
        scale=alt.Scale(domain=domain, range=SERIES_SHAPES[: len(domain)]),
        legend=alt.Legend(orient="top"),
    )
    tooltip = [
        alt.Tooltip("SATELLITE_NAME:N", title="Satellite"),
        alt.Tooltip("INSTRUMENT:N", title="Instrument"),
        alt.Tooltip("PASS_START:T", title="Pass start (UTC)", format="%Y-%m-%d %H:%M"),
        alt.Tooltip("DETECTIONS:Q", title="Detections"),
        alt.Tooltip("TOTAL_FRP_MW:Q", title="Total FRP (MW)", format=",.1f"),
    ]
    x = alt.X("PASS_START:T", title="Pass start (UTC)", axis=alt.Axis(format="%b %d", labelAngle=0))
    base = alt.Chart(passes.sort_values("TOTAL_FRP_MW", ascending=False))  # small passes drawn last, on top
    stems = base.mark_rule(strokeWidth=2).encode(
        x=x, y=alt.Y("TOTAL_FRP_MW:Q", title="Total FRP (MW)"), y2="ZERO", color=color, tooltip=tooltip
    )
    heads = base.mark_point(filled=True, size=70, opacity=1, stroke="#fcfcfb", strokeWidth=1).encode(
        x=x, y="TOTAL_FRP_MW:Q", color=color, shape=shape, tooltip=tooltip
    )
    wide_chart((stems + heads).properties(height=360))

    with st.expander("The passes as a table"):
        table = pd.DataFrame(
            {
                "Pass start (UTC)": passes["PASS_START"].dt.strftime("%Y-%m-%d %H:%M"),
                "Satellite": passes["SATELLITE_NAME"],
                "Instrument": passes["INSTRUMENT"],
                "Day or night": passes["DAYNIGHT"].map({"D": "day", "N": "night"}).fillna(passes["DAYNIGHT"]),
                "Detections": passes["DETECTIONS"],
                "Total FRP (MW)": passes["TOTAL_FRP_MW"].round(1),
                "Largest FRP (MW)": passes["MAX_FRP_MW"].round(1),
            }
        )
        st.dataframe(table.set_index("Pass start (UTC)"))

# 2. Persistent heat
st.subheader("Persistent heat: the 10 cells seen on the most days")
st.caption(
    "H3 cells (resolution 7, about 5 km² each) ranked by the number of distinct days with a NASA FIRMS "
    "standard-processing detection, with NASA's type labels, from the SQL view PERSISTENT_HEAT."
)
cells = query(
    f"SELECT * FROM {SCHEMA}.PERSISTENT_HEAT ORDER BY RANK_BY_DAYS, DETECTIONS DESC, H3_CELL LIMIT 10"
)
cells = numbers(
    cells,
    [
        "RANK_BY_DAYS", "DISTINCT_DAYS", "DETECTIONS", "CONFIDENT_DETECTIONS", "TYPE_0_VEGETATION",
        "TYPE_1_VOLCANO", "TYPE_2_STATIC_LAND", "TYPE_3_OFFSHORE", "CENTER_LAT", "CENTER_LON", "KM_FROM_REFINERY",
    ],
)
towns = numbers(query(f"SELECT TOWN, PROVINCE, LAT, LON FROM {SCHEMA}.REPLAY_VERDICTS ORDER BY TOWN"), ["LAT", "LON"])
if cells.empty:
    st.markdown("The view PERSISTENT_HEAT has no rows.")
else:
    refinery = cells["IS_REFINERY_CELL"].map(is_true)
    low, high = cells["DISTINCT_DAYS"].min(), cells["DISTINCT_DAYS"].max()
    points = pd.DataFrame(
        {
            "H3": cells["H3_CELL"].map(h3_hex),
            "LAT": cells["CENTER_LAT"],
            "LON": cells["CENTER_LON"],
            "FILL": [ramp_color(d, low, high) for d in cells["DISTINCT_DAYS"]],
            "LABEL": shared_labels(
                cells["CENTER_LAT"], cells["CENTER_LON"], [f"{r:.0f}" for r in cells["RANK_BY_DAYS"]], RANK_GROUP_KM
            ),
            "TIP": [
                f"Rank {r:.0f}: {d:.0f} days, {n:,.0f} detections, {day(first)} to {day(last)}"
                for r, d, n, first, last in zip(
                    cells["RANK_BY_DAYS"], cells["DISTINCT_DAYS"], cells["DETECTIONS"],
                    cells["FIRST_DAY"], cells["LAST_DAY"],
                )
            ],
        }
    )
    refinery_points = points[refinery.values].assign(NAME="Irving Oil refinery")
    town_points = pd.DataFrame(
        {
            "LAT": towns["LAT"],
            "LON": towns["LON"],
            "LABEL": shared_labels(towns["LAT"], towns["LON"], towns["TOWN"].astype(str), TOWN_GROUP_KM),
        }
    )
    layers = [
        pdk.Layer(
            "H3HexagonLayer",
            data=points,
            get_hexagon="H3",
            get_fill_color="FILL",
            get_line_color=[255, 255, 255],
            line_width_min_pixels=1,
            stroked=True,
            filled=True,
            extruded=False,
            opacity=0.9,
        ),
        pdk.Layer(
            "H3HexagonLayer",
            data=refinery_points,
            get_hexagon="H3",
            get_line_color=REFINERY_OUTLINE,
            line_width_min_pixels=3,
            stroked=True,
            filled=False,
            extruded=False,
        ),
        pdk.Layer(
            "ScatterplotLayer",
            data=town_points,
            get_position="[LON, LAT]",
            get_fill_color=TOWN_DOT,
            get_radius=1500,
            radius_min_pixels=3,
            radius_max_pixels=5,
        ),
        pdk.Layer(
            "TextLayer",
            data=town_points[town_points["LABEL"] != ""],
            get_position="[LON, LAT]",
            get_text="LABEL",
            get_color=MUTED_INK,
            get_size=12,
            get_alignment_baseline=pdk.types.String("top"),
            get_pixel_offset=[0, 9],
            background=True,
            get_background_color=[255, 255, 255, 150],
        ),
        # At the regional zoom a resolution-7 hexagon is under 2 pixels wide, so each cell also gets a dot.
        pdk.Layer(
            "ScatterplotLayer",
            data=points,
            get_position="[LON, LAT]",
            get_fill_color="FILL",
            get_line_color=[255, 255, 255],
            get_radius=900,
            radius_min_pixels=7,
            line_width_min_pixels=1,
            stroked=True,
            pickable=True,
        ),
        pdk.Layer(
            "ScatterplotLayer",
            data=refinery_points,
            get_position="[LON, LAT]",
            get_line_color=REFINERY_OUTLINE,
            get_radius=1400,
            radius_min_pixels=11,
            line_width_min_pixels=3,
            stroked=True,
            filled=False,
        ),
        pdk.Layer(
            "TextLayer",
            data=points[points["LABEL"] != ""],
            get_position="[LON, LAT]",
            get_text="LABEL",
            get_color=INK,
            get_size=14,
            get_text_anchor=pdk.types.String("start"),
            get_alignment_baseline=pdk.types.String("center"),
            get_pixel_offset=[12, 0],
            background=True,
            get_background_color=[255, 255, 255, 220],
        ),
        pdk.Layer(
            "TextLayer",
            data=refinery_points,
            get_position="[LON, LAT]",
            get_text="NAME",
            get_color=INK,
            get_size=13,
            get_text_anchor=pdk.types.String("end"),
            get_alignment_baseline=pdk.types.String("center"),
            get_pixel_offset=[-16, 0],
            background=True,
            get_background_color=[255, 255, 255, 220],
        ),
    ]
    st.pydeck_chart(
        pdk.Deck(
            layers=layers,
            initial_view_state=pdk.ViewState(latitude=45.5, longitude=-64.5, zoom=5.3),
            map_style=BASEMAP,
            tooltip={"text": "{TIP}"},
        )
    )
    st.caption(
        f"Numbers are ranks (cells under {RANK_GROUP_KM} km apart share a label); darker blue means more days; the orange ring "
        "marks the Irving Oil refinery cell in east Saint John. Grey: the replay towns, for reference. "
        "Zoom in to see each cell's hexagon; hover a dot for its days and detections."
    )

    heat_table = pd.DataFrame(
        {
            "Rank": cells["RANK_BY_DAYS"].astype(int),
            "Days": cells["DISTINCT_DAYS"].astype(int),
            "Detections": cells["DETECTIONS"].astype(int),
            "Vegetation fire (type 0)": cells["TYPE_0_VEGETATION"].fillna(0).astype(int),
            "Static land source (type 2)": cells["TYPE_2_STATIC_LAND"].fillna(0).astype(int),
            "Offshore (type 3)": cells["TYPE_3_OFFSHORE"].fillna(0).astype(int),
            "First day": cells["FIRST_DAY"].map(day),
            "Last day": cells["LAST_DAY"].map(day),
            "Km from the refinery": cells["KM_FROM_REFINERY"].round(1),
            "Irving Oil refinery cell": refinery.map({True: "yes", False: "no"}),
        }
    )
    st.dataframe(heat_table.set_index("Rank"))

# 3. Duplicate check
st.subheader("Duplicate check: CWFIS hotspots that are FIRMS detections (Aug 24–25, 2025 replay window)")
st.caption(
    "The engine's merge rules recomputed in SQL over the replay window's NASA FIRMS detections and CWFIS hotspots "
    "(view DEDUPE_CROSSCHECK), next to the counts the engine reported."
)
crosscheck = numbers(query(f"SELECT * FROM {SCHEMA}.DEDUPE_CROSSCHECK"), ["SQL_COUNT", "ENGINE_COUNT"])
if crosscheck.empty:
    st.markdown("The view DEDUPE_CROSSCHECK has no rows.")
else:
    total_rows = crosscheck["RULE"].astype(str).str.contains(r"\btotal\b|^all\b", case=False, regex=True)
    counted = crosscheck[total_rows] if total_rows.any() else crosscheck
    sql_total, engine_total = counted["SQL_COUNT"].sum(), counted["ENGINE_COUNT"].sum()
    all_match = bool(crosscheck["MATCHES"].map(is_true).all())
    verdict = "match" if all_match else "they differ (see Detail)"
    st.markdown(f"**SQL finds {sql_total:,.0f} merges; the engine found {engine_total:,.0f}: {verdict}.**")
    st.dataframe(
        pd.DataFrame(
            {
                "Rule": crosscheck["RULE"],
                "SQL count": crosscheck["SQL_COUNT"],
                "Engine count": crosscheck["ENGINE_COUNT"],
                "Match": crosscheck["MATCHES"].map(yes_no),
                "Detail": crosscheck["DETAIL"],
            }
        ).set_index("Rule")
    )

# 4. Validation
st.subheader("Validation on real events")
st.caption(
    "News-reported smoke events, the engine's verdict for each and whether it matches the report, "
    "from the repo's VALIDATION.md table (table VALIDATION)."
)
validation = numbers(query(f"SELECT * FROM {SCHEMA}.VALIDATION ORDER BY ROW_ORDER"), ["ROW_ORDER", "CLOSEST_KM"])
if validation.empty:
    st.markdown("The table VALIDATION has no rows.")
else:
    st.dataframe(
        pd.DataFrame(
            {
                "#": validation["ROW_ORDER"].astype(int),
                "Event": validation["EVENT"],
                "Source": validation["SOURCE_LABEL"],
                "Link": validation["SOURCE_URL"],
                "Place": validation["PLACE"],
                "Time (UTC)": validation["TIME_UTC"].map(minute),
                "Verdict": validation["VERDICT"],
                "Confidence": validation["CONFIDENCE"],
                "Closest to a fire (km)": validation["CLOSEST_KM"],
                "Fire": validation["FIRE"],
                "Fire is the Irving Oil refinery": validation["FIRE_IS_REFINERY"].map(yes_no),
                "Forward run agrees": validation["FORWARD_AGREES"].map(yes_no),
                "Matches the report": validation["MATCH"].map(yes_no),
            }
        ).set_index("#")
    )

st.markdown("---")
st.caption(CREDITS)
