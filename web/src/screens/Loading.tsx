// 06 · Tracing the air (design/screens/06-loading.html)
import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router";
import { useApp, useT } from "../app/state";
import { loadReplayVerdict } from "../data/replay";
import { ReplayBanner } from "../components/ReplayBanner";
import { Screen } from "../components/Screen";
import { Sticky911 } from "../components/Sticky911";
import { TopBar } from "../components/TopBar";
import { circleBox, textBox } from "../map/labels";
import { Basemap, USER_XY, frameProjection, round } from "../map/basemap";
import type { StringKey } from "../i18n";

// The screen shows at least until the hour counter reaches 24 (80% of its 4.8 s animation).
const MIN_SHOW_MS = 3900;
const ARROW = "M-5 -4.5L5 0L-5 4.5Z";
const CHECK = (
  <span style={{ flexShrink: "0", width: "30px", height: "30px", borderRadius: "50%", background: "#1B2A4A", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
    <svg className="ic" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: "3" }}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  </span>
);

export function Loading() {
  const { mode, lang, place, result, setResult } = useApp();
  const t = useT();
  // The chip counts the hours in CSS (counter(h)); the words around the number come from the strings file.
  const [hourBefore, hourAfter] = t("loading.hour").split("{n}");
  const navigate = useNavigate();

  useEffect(() => {
    if (!place) return;
    let cancelled = false;
    const started = Date.now();
    setResult(null);
    const load = mode === "replay" ? loadReplayVerdict(place) : Promise.reject(new Error("live mode not built yet"));
    load
      .then((json) => {
        if (cancelled) return;
        setResult(json);
        setTimeout(() => !cancelled && navigate("/verdict"), Math.max(0, MIN_SHOW_MS - (Date.now() - started)));
      })
      .catch(() => !cancelled && navigate("/no-data"));
    return () => {
      cancelled = true;
    };
  }, [mode, place, navigate, setResult]);

  if (!place) return <Navigate to="/location" replace />;

  const projection = frameProjection(place, 358, 210);
  const path = result ? result.path.points.map((p) => projection([p.lon, p.lat])!) : [];
  const points = path.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");

  return (
    <Screen>
      <ReplayBanner />
      <TopBar back="/location" />
      <main aria-live="polite" style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "16px", padding: "4px 16px 152px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "0 4px" }}>
          <h1 style={{ margin: "0", fontSize: "34px", fontWeight: "800", lineHeight: "1.12", letterSpacing: "-0.02em", textWrap: "balance" }}>{t("loading.title")}</h1>
          <p style={{ margin: "0", fontSize: "18px", lineHeight: "1.45", color: "#4F5561", textWrap: "pretty" }}>{t("loading.sub")}</p>
        </div>
        <div style={{ position: "relative", background: "#FFFFFF", borderRadius: "18px", overflow: "hidden", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)" }}>
          <svg viewBox="0 0 358 210" width="100%" role="img" aria-label={t("loading.mapAria", { town: place.name })} style={{ display: "block" }}>
            <defs>
              <mask id="trace-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="358" height="210">
                <polyline className="drawmask" points={points} />
              </mask>
            </defs>
            <Basemap projection={projection} width={358} height={210} lang={lang} labels="loading" avoid={[circleBox(USER_XY[0], USER_XY[1], 18), textBox(place.name, USER_XY[0] + 16, USER_XY[1] + 6)]} />
            <g mask="url(#trace-mask)">
              <polyline className="trail" points={points} />
              {path.slice(1, -1).map(([x, y], i) => {
                const [tx, ty] = path[i];
                const angle = (Math.atan2(ty - y, tx - x) * 180) / Math.PI;
                return <path key={i} className="arr" d={ARROW} transform={`translate(${round(x)} ${round(y)}) rotate(${Math.round(angle)})`} />;
              })}
            </g>
            <circle className="pulse" cx={USER_XY[0]} cy={USER_XY[1]} r="16" style={{ fill: "#1B2A4A" }} />
            <circle cx={USER_XY[0]} cy={USER_XY[1]} r="9" style={{ fill: "#1B2A4A", stroke: "#FFFFFF", strokeWidth: "3" }} />
            <text className="lbl" x={USER_XY[0] + 16} y={USER_XY[1] + 6}>{place.name}</text>
          </svg>
          <span className="hours" data-before={hourBefore} data-after={hourAfter} aria-hidden="true" style={{ position: "absolute", left: "12px", top: "12px", height: "36px", padding: "0 14px", borderRadius: "999px", background: "#1B2A4A", color: "#FFFFFF", fontSize: "16px", fontWeight: "700", fontVariantNumeric: "tabular-nums", display: "flex", alignItems: "center", boxShadow: "0 4px 12px rgba(26, 29, 33, 0.2)" }} />
        </div>
        <ul style={{ listStyle: "none", margin: "0", padding: "4px 16px", background: "#FFFFFF", borderRadius: "18px", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)", display: "flex", flexDirection: "column" }}>
          <li style={{ display: "flex", alignItems: "center", gap: "14px", minHeight: "54px", borderBottom: "1px solid #EEE7DC" }}>
            {CHECK}
            <span style={{ fontSize: "18px", lineHeight: "1.35" }}>
              <strong>{t("loading.found")}</strong> {place.name}, {t(`province.${place.province}` as StringKey)}
            </span>
          </li>
          <li style={{ display: "flex", alignItems: "center", gap: "14px", minHeight: "54px", borderBottom: "1px solid #EEE7DC" }}>
            {CHECK}
            <span style={{ fontSize: "18px", lineHeight: "1.35" }}>
              <strong>{t("loading.fires")}</strong> {t("loading.firesSource")}
            </span>
          </li>
          <li style={{ display: "flex", alignItems: "center", gap: "14px", minHeight: "54px" }}>
            <span style={{ flexShrink: "0", width: "30px", height: "30px", display: "flex", alignItems: "center", justifyContent: "center", color: "#1B2A4A" }}>
              <svg className="spin" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" style={{ fill: "none", stroke: "#E1DACE", strokeWidth: "3" }} />
                <path d="M12 3a9 9 0 0 1 9 9" style={{ fill: "none", stroke: "#1B2A4A", strokeWidth: "3", strokeLinecap: "round" }} />
              </svg>
            </span>
            <span style={{ fontSize: "18px", lineHeight: "1.35" }}>
              <strong>{t("loading.tracing")}</strong>
            </span>
          </li>
        </ul>
      </main>
      <Sticky911 />
    </Screen>
  );
}
