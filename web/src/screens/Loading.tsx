// 06 · Tracing the air (design/screens/06-loading.html)
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useApp, useT } from "../app/state";
import { LiveError, loadLiveVerdict } from "../data/live";
import { loadReplayVerdict } from "../data/replay";
import { ReplayBanner } from "../components/ReplayBanner";
import { Screen } from "../components/Screen";
import { CLEAR_OF_BAR, Sticky911 } from "../components/Sticky911";
import { TopBar } from "../components/TopBar";
import { circleBox, textBox } from "../map/labels";
import { Basemap, USER_XY, frameProjection, round } from "../map/basemap";
import type { StringKey } from "../i18n";
import { loadingVoice } from "../listen/speech";
import { loadVerdictScreen } from "./verdictScreen";

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
  // Live: the engine has not answered yet (asleep on its free host), and the screen says it is waking up.
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    if (!place) return;
    let cancelled = false;
    const leaving = new AbortController();
    // Measured by the page's own clock, which only runs forward: the phone's clock can be set back mid-check (a time
    // sync), and the screen would then stay for as long as the clock stepped.
    const started = performance.now();
    setResult(null);
    setWaking(false);
    // The verdict screen's own file, and the map behind it, are fetched while this screen shows. The map is an extra:
    // if it cannot be had, the verdict opens on the outline map.
    const screen = loadVerdictScreen();
    screen.then((verdict) => verdict.warmMap()).catch(() => {});
    const load = mode === "replay" ? loadReplayVerdict(place) : loadLiveVerdict(place, () => !cancelled && setWaking(true), { signal: leaving.signal });
    Promise.all([load, screen])
      .then(([json, verdict]) => {
        if (cancelled) return;
        // The map itself, started ahead on the frame it will open on. Whatever goes wrong there, the answer is
        // still given.
        try {
          verdict.startMap(json, lang);
        } catch {
          // the verdict opens on the outline map
        }
        setResult(json);
        setTimeout(() => !cancelled && navigate("/verdict"), Math.min(MIN_SHOW_MS, Math.max(0, MIN_SHOW_MS - (performance.now() - started))));
      })
      // Screen 9b, which says why: the engine's own no-data answer, or no answer at all in time.
      .catch((error: unknown) => !cancelled && navigate("/no-data", { state: { reason: error instanceof LiveError ? error.kind : "noData" } }));
    return () => {
      cancelled = true;
      leaving.abort();
    };
    // The map's names start in the language of this moment: the verdict screen sets them again as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, place, navigate, setResult]);

  if (!place) return <Navigate to="/location" replace />;

  const projection = frameProjection(place, 358, 210);
  const path = result ? result.path.points.map((p) => projection([p.lon, p.lat])!) : [];
  const points = path.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");

  return (
    <Screen>
      <ReplayBanner />
      <TopBar back="/location" listen={loadingVoice(lang, waking)} />
      <main aria-live="polite" style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "16px", padding: `4px 16px ${CLEAR_OF_BAR}` }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "0 4px" }}>
          <h1 style={{ margin: "0", fontSize: "34px", fontWeight: "800", lineHeight: "1.12", letterSpacing: "-0.02em", textWrap: "balance" }}>{t("loading.title")}</h1>
          <p style={{ margin: "0", fontSize: "18px", lineHeight: "1.45", color: "#4F5561", textWrap: "pretty" }}>{t("loading.sub")}</p>
          {/* Said plainly while the engine wakes up, and read by a screen reader as it appears. */}
          {waking && (
            <p role="status" className="loading-waking" style={{ margin: "4px 0 0", fontSize: "18px", fontWeight: "700", lineHeight: "1.45", color: "#1B2A4A", textWrap: "pretty" }}>
              {t("loading.waking")}
            </p>
          )}
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
