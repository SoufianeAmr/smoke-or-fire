// 07a–07d · Verdict (design/screens/07a-verdict-drifting.html, 07b, 07c, 07d, 07a-fr)
import type { CSSProperties } from "react";
import { Link, Navigate } from "react-router";
import { useApp, useT } from "../app/state";
import { ReplayBanner } from "../components/ReplayBanner";
import { Screen } from "../components/Screen";
import { Sticky911 } from "../components/Sticky911";
import { LangToggle } from "../components/TopBar";
import { BackIcon, ChevronRightIcon } from "../components/icons";
import { ListenButton } from "../listen/ListenButton";
import { AirQualityCard, ConfidenceCard, TwoPossibilitiesCard, VERDICT_ICONS, WhatToDoCard, WhyCard } from "../verdict/cards";
import { VerdictMap } from "../verdict/VerdictMap";
import { verdictView, type Variant } from "../verdict/view";

// Band colours: orange drifting (7a), amber unclear (7c), red unexplained (7b, 7d).
const BAND: Record<Variant, { background: string; color: string; iconColor: string }> = {
  "7a": { background: "#E8590C", color: "#1A1D21", iconColor: "#1A1D21" },
  "7c": { background: "#F79009", color: "#1A1D21", iconColor: "#1A1D21" },
  "7b": { background: "#D92D20", color: "#FFFFFF", iconColor: "#D92D20" },
  "7d": { background: "#D92D20", color: "#FFFFFF", iconColor: "#D92D20" },
};

function BandIcon({ variant }: { variant: Variant }) {
  return (
    <svg className="ic" width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: "2.3" }}>
      {variant === "7a" && VERDICT_ICONS.wind}
      {(variant === "7b" || variant === "7d") && VERDICT_ICONS.warning}
      {variant === "7c" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.3a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.1 1-1.1 1.7v.6" />
          <path d="M12 17h.01" />
        </>
      )}
    </svg>
  );
}

export function Verdict() {
  const { result, lang, reset, place, mode } = useApp();
  const t = useT();
  if (!result) return <Navigate to="/" replace />;

  // A town picked from the search is named as picked, and so is every replay town (its verdict is for the town's
  // own point, even when "Use my location" chose it). A live GPS location takes the engine's name for the spot.
  const view = verdictView(result, lang, place && (place.source === "search" || mode === "replay") ? place.name : undefined);
  const band = BAND[view.variant];
  const link: CSSProperties = { minHeight: "56px", display: "flex", alignItems: "center", gap: "4px", padding: "0 10px 0 6px", color: band.color, fontSize: "18px", fontWeight: "700", textDecoration: "none" };

  return (
    <Screen>
      <ReplayBanner />
      <section aria-labelledby="verdict-h" style={{ background: band.background, color: band.color, padding: "4px 20px 28px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 -8px 0 -16px", height: "64px" }}>
          <Link to="/" onClick={reset} style={link}>
            <BackIcon size={26} />
            {t("nav.newCheck")}
          </Link>
          <LangToggle on="band" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "8px" }}>
          <span style={{ flexShrink: "0", width: "56px", height: "56px", borderRadius: "50%", background: "#FFFFFF", color: band.iconColor, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BandIcon variant={view.variant} />
          </span>
          <p style={{ margin: "0", fontSize: "22px", fontWeight: "700", letterSpacing: "0.06em", lineHeight: "1.2" }}>{view.band.label}</p>
        </div>
        <h1 id="verdict-h" style={{ margin: "16px 0 0", fontSize: "34px", fontWeight: "800", lineHeight: "1.12", letterSpacing: "-0.02em", textWrap: "balance" }}>{view.band.headline}</h1>
        <p style={{ margin: "10px 0 0", fontSize: "20px", fontWeight: "500", lineHeight: "1.4", textWrap: "pretty" }}>{view.band.sub}</p>
      </section>
      <main style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px 16px 160px" }}>
        {/* The band's top row has no room left (New check, EN/FR): Listen starts the card list. */}
        <ListenButton sentences={view.voice} style={{ alignSelf: "flex-start" }} />
        {view.notice && (
          // The fire is under 25 km away: follow officials, and what to do if told to leave, for this place.
          <section style={{ background: "#FFFFFF", borderRadius: "18px", padding: "18px 20px 8px", display: "flex", flexDirection: "column", gap: "4px", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)" }}>
            <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
              <span style={{ flexShrink: "0", width: "44px", height: "44px", borderRadius: "50%", background: "#1B2A4A", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg className="ic" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: "2.3" }}>{VERDICT_ICONS.warning}</svg>
              </span>
              <p style={{ margin: "0", fontSize: "18px", fontWeight: "700", lineHeight: "1.45", textWrap: "pretty" }}>{view.notice.text}</p>
            </div>
            <Link to="/leave" style={{ alignSelf: "flex-start", minHeight: "56px", display: "flex", alignItems: "center", gap: "6px", marginLeft: "58px", fontSize: "18px", fontWeight: "700", lineHeight: "1.3", color: "#1B2A4A" }}>
              {view.notice.link}
              <ChevronRightIcon size={20} />
            </Link>
          </section>
        )}
        <VerdictMap json={result} view={view} />
        <ConfidenceCard view={view} />
        {view.twoPossibilities && <TwoPossibilitiesCard view={view} />}
        <WhatToDoCard view={view} />
        <AirQualityCard view={view} />
        <WhyCard view={view} />
      </main>
      <Sticky911 />
    </Screen>
  );
}
