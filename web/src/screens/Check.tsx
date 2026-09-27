// 01 · Check (design/screens/01-check.html)
import type { CSSProperties } from "react";
import { Link } from "react-router";
import { useApp, useT } from "../app/state";
import { Screen } from "../components/Screen";
import { LangToggle } from "../components/TopBar";
import { ChevronRightIcon, DoorOpenIcon } from "../components/icons";

const SEGMENT: CSSProperties = { minHeight: "56px", border: "0", borderRadius: "14px", font: "inherit", fontSize: "18px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer" };
const SELECTED: CSSProperties = { background: "#FFFFFF", color: "#1B2A4A", boxShadow: "inset 0 0 0 2px #1B2A4A" };
const UNSELECTED: CSSProperties = { background: "transparent", color: "#1A1D21" };
const NOTE: CSSProperties = { margin: "12px 4px 0", fontSize: "18px", lineHeight: "1.45", color: "#4F5561", textWrap: "pretty" };

const ReplayIcon = () => (
  <svg className="ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.5 4.5v4.5H8" />
  </svg>
);

export function Check() {
  const { mode, setMode, reset } = useApp();
  const t = useT();
  const isReplay = mode === "replay";

  return (
    <Screen>
      <div aria-hidden="true" style={{ position: "absolute", inset: "0", zIndex: "0", pointerEvents: "none" }}>
        <div className="haze" style={{ width: "460px", height: "300px", left: "-120px", top: "150px", background: "#E6DDD0", opacity: "0.85" }} />
        <div className="haze haze2" style={{ width: "380px", height: "260px", left: "120px", top: "360px", background: "#DDD6CC", opacity: "0.7" }} />
        <div className="haze haze3" style={{ width: "420px", height: "240px", left: "-60px", top: "560px", background: "#E9E1D5", opacity: "0.8" }} />
      </div>
      <div style={{ position: "relative", zIndex: "1", display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "8px 12px 0 4px", height: "68px" }}>
        <LangToggle />
      </div>
      <main style={{ position: "relative", zIndex: "1", flexGrow: "1", display: "flex", flexDirection: "column", padding: "8px 20px 20px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "12px" }}>
          <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
            <rect x="0" y="0" width="64" height="64" rx="18" style={{ fill: "#1B2A4A" }} />
            <path d="M25 50c-5-5 5-9 0-15s5-9 0-15" style={{ fill: "none", stroke: "#FFFFFF", strokeWidth: "3.5", strokeLinecap: "round" }} />
            <path d="M38 50c-5-5 5-9 0-15s5-9 0-15" style={{ fill: "none", stroke: "#FFFFFF", strokeWidth: "3.5", strokeLinecap: "round", opacity: "0.6" }} />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <h1 lang="en" style={{ margin: "0", fontSize: "34px", fontWeight: "800", lineHeight: "1.1", letterSpacing: "-0.02em" }}>Smoke or Fire?</h1>
            <p lang="fr" style={{ margin: "0", fontSize: "22px", fontWeight: "600", lineHeight: "1.3", color: "#4F5561" }}>Fumée ou feu&nbsp;?</p>
          </div>
        </div>
        <p style={{ margin: "28px 0 0", fontSize: "22px", fontWeight: "500", lineHeight: "1.4", textWrap: "pretty" }}>{t("check.tagline")}</p>
        <div style={{ flexGrow: "1" }} />
        <Link to="/q1" onClick={reset} className="press" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "14px", minHeight: "104px", borderRadius: "18px", background: "#1B2A4A", color: "#FFFFFF", textDecoration: "none", fontSize: "28px", fontWeight: "800", letterSpacing: "-0.01em", boxShadow: "0 12px 28px rgba(27, 42, 74, 0.28)" }}>
          <svg className="ic" width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: "2.2" }}>
            <path d="M8 21c-2-2.5 2-4.5 0-7.5s2-5 0-8" />
            <path d="M13 21c-2-2.5 2-4.5 0-7.5s2-5 0-8" />
            <path d="M18 21c-2-2.5 2-4.5 0-7.5s2-5 0-8" />
          </svg>
          {t("check.cta")}
        </Link>
        <div role="group" aria-label={t("check.modeGroup")} style={{ marginTop: "20px", display: "flex", gap: "4px", padding: "4px", borderRadius: "18px", background: "#EDE6DA" }}>
          <button type="button" aria-pressed={!isReplay} onClick={() => isReplay && setMode("live")} style={{ flex: "1 1 0", ...SEGMENT, ...(isReplay ? UNSELECTED : SELECTED) }}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              {isReplay
                ? <circle cx="6" cy="6" r="4.5" style={{ fill: "none", stroke: "#1A1D21", strokeWidth: "2" }} />
                : <circle cx="6" cy="6" r="5" style={{ fill: "#1B2A4A" }} />}
            </svg>
            {t("check.live")}
          </button>
          <button type="button" aria-pressed={isReplay} onClick={() => !isReplay && setMode("replay")} style={{ flex: "1.7 1 0", ...SEGMENT, ...(isReplay ? SELECTED : UNSELECTED) }}>
            <ReplayIcon />
            {t("check.replay")}
          </button>
        </div>
        <p style={NOTE}>{isReplay ? t("check.replayNote") : t("check.liveNote")}</p>
        <Link to="/leave" className="press" style={{ marginTop: "16px", minHeight: "56px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", padding: "8px 16px", borderRadius: "18px", border: "2px solid #1B2A4A", color: "#1B2A4A", textDecoration: "none", fontSize: "18px", fontWeight: "700", lineHeight: "1.3", textAlign: "center" }}>
          <DoorOpenIcon size={24} />
          {t("leave.entry")}
        </Link>
        <Link to="/how-it-works" style={{ alignSelf: "center", marginTop: "8px", minHeight: "56px", display: "flex", alignItems: "center", gap: "6px", padding: "0 12px", fontSize: "18px", fontWeight: "700", color: "#1B2A4A" }}>
          {t("check.howItWorks")}
          <ChevronRightIcon size={20} />
        </Link>
      </main>
    </Screen>
  );
}
