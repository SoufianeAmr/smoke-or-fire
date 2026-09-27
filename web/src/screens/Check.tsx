// 01 · Check (design/screens/01-check.html)
import type { CSSProperties } from "react";
import { Link } from "react-router";
import { useApp, useT } from "../app/state";
import { Screen } from "../components/Screen";
import { LangToggle } from "../components/TopBar";
import { ChevronRightIcon } from "../components/icons";
import { useInstall } from "../keep/keep";
import { KeepOnPhone } from "../keep/KeepOnPhone";
import { ListenButton } from "../listen/ListenButton";
import { checkVoice } from "../listen/speech";

// A segment's label wraps onto two lines when it doesn't fit ("Reprise : / 25 août 2025" on a phone).
const SEGMENT: CSSProperties = { minHeight: "56px", border: "0", borderRadius: "14px", padding: "4px 12px", font: "inherit", fontSize: "18px", fontWeight: "700", lineHeight: "1.25", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer" };
const SELECTED: CSSProperties = { background: "#FFFFFF", color: "#1B2A4A", boxShadow: "inset 0 0 0 2px #1B2A4A" };
const UNSELECTED: CSSProperties = { background: "transparent", color: "#1A1D21" };

const ReplayIcon = () => (
  <svg className="ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.5 4.5v4.5H8" />
  </svg>
);

export function Check() {
  const { mode, lang, setMode, reset } = useApp();
  const t = useT();
  const isReplay = mode === "replay";
  const install = useInstall();

  return (
    <Screen>
      {/* The haze covers the whole window, beyond the 480 px column on a wide screen, so it has no edge. The blobs keep
          the design's shapes at 390 px wide (sizes and offsets as fractions of the window's width). */}
      <div aria-hidden="true" style={{ position: "fixed", inset: "0", zIndex: "0", overflow: "hidden", pointerEvents: "none" }}>
        <div className="haze" style={{ width: "118vw", height: "300px", left: "-31vw", top: "150px", background: "#E6DDD0", opacity: "0.85" }} />
        <div className="haze haze2" style={{ width: "97vw", height: "260px", left: "31vw", top: "360px", background: "#DDD6CC", opacity: "0.7" }} />
        <div className="haze haze3" style={{ width: "108vw", height: "240px", left: "-15vw", top: "560px", background: "#E9E1D5", opacity: "0.8" }} />
      </div>
      <div style={{ position: "relative", zIndex: "1", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px", padding: "8px 20px 0", height: "68px" }}>
        <ListenButton sentences={checkVoice(lang, isReplay, install.offered)} />
        <LangToggle />
      </div>
      <main style={{ position: "relative", zIndex: "1", flexGrow: "1", display: "flex", flexDirection: "column", padding: "8px 20px 20px" }}>
        <div className="check-head" style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "12px" }}>
          <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
            <rect x="0" y="0" width="64" height="64" rx="18" style={{ fill: "#1B2A4A" }} />
            <path d="M25 50c-5-5 5-9 0-15s5-9 0-15" style={{ fill: "none", stroke: "#FFFFFF", strokeWidth: "3.5", strokeLinecap: "round" }} />
            <path d="M38 50c-5-5 5-9 0-15s5-9 0-15" style={{ fill: "none", stroke: "#FFFFFF", strokeWidth: "3.5", strokeLinecap: "round", opacity: "0.6" }} />
          </svg>
          <h1 style={{ margin: "0", fontSize: "34px", fontWeight: "800", lineHeight: "1.1", letterSpacing: "-0.02em" }}>{t("check.title")}</h1>
        </div>
        <p className="check-tagline" style={{ margin: "28px 0 0", fontSize: "22px", fontWeight: "500", lineHeight: "1.4", textWrap: "pretty" }}>{t("check.tagline")}</p>
        {/* At least 16 px between the tagline and I smell smoke, however short the screen. */}
        <div style={{ flexGrow: "1", minHeight: "16px" }} />
        <Link to="/q1" onClick={reset} className="press" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "14px", minHeight: "104px", borderRadius: "18px", background: "#1B2A4A", color: "#FFFFFF", textDecoration: "none", fontSize: "28px", fontWeight: "800", letterSpacing: "-0.01em", boxShadow: "0 12px 28px rgba(27, 42, 74, 0.28)" }}>
          <svg className="ic" width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: "2.2" }}>
            <path d="M8 21c-2-2.5 2-4.5 0-7.5s2-5 0-8" />
            <path d="M13 21c-2-2.5 2-4.5 0-7.5s2-5 0-8" />
            <path d="M18 21c-2-2.5 2-4.5 0-7.5s2-5 0-8" />
          </svg>
          {t("check.cta")}
        </Link>
        <div role="group" aria-label={t("check.modeGroup")} className="check-modes" style={{ marginTop: "20px", display: "flex", gap: "4px", padding: "4px", borderRadius: "18px", background: "#EDE6DA" }}>
          <button type="button" aria-pressed={!isReplay} onClick={() => isReplay && setMode("live")} style={{ flex: "0 0 auto", ...SEGMENT, ...(isReplay ? UNSELECTED : SELECTED) }}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              {isReplay
                ? <circle cx="6" cy="6" r="4.5" style={{ fill: "none", stroke: "#1A1D21", strokeWidth: "2" }} />
                : <circle cx="6" cy="6" r="5" style={{ fill: "#1B2A4A" }} />}
            </svg>
            {t("check.live")}
          </button>
          <button type="button" aria-pressed={isReplay} onClick={() => !isReplay && setMode("replay")} style={{ flex: "1 1 0", minWidth: "0", ...SEGMENT, ...(isReplay ? SELECTED : UNSELECTED) }}>
            <ReplayIcon />
            {t("check.replay")}
          </button>
        </div>
        <Link to="/how-it-works" style={{ alignSelf: "center", marginTop: "8px", minHeight: "56px", display: "flex", alignItems: "center", gap: "6px", padding: "0 12px", fontSize: "18px", fontWeight: "700", color: "#1B2A4A" }}>
          {t("check.howItWorks")}
          <ChevronRightIcon size={20} />
        </Link>
        <KeepOnPhone offered={install.offered} platform={install.platform} />
      </main>
    </Screen>
  );
}
