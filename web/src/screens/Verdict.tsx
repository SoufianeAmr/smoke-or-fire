// 07a–07d · Verdict: the glance card, its source badges, and behind "Why?" everything screens 7a–7d say
// (design/screens/07a-verdict-drifting.html, 07b, 07c, 07d, 07a-fr).
import { useState, type CSSProperties } from "react";
import { Link, Navigate } from "react-router";
import { useApp, useT } from "../app/state";
import { ReplayBanner } from "../components/ReplayBanner";
import { Screen } from "../components/Screen";
import { CLEAR_OF_BAR, CLEAR_OF_CALL, Sticky911 } from "../components/Sticky911";
import { LangToggle } from "../components/TopBar";
import { BackIcon, ChevronRightIcon } from "../components/icons";
import { ListenButton } from "../listen/ListenButton";
import { ProtectLink } from "../protect/ProtectLink";
import { AnswerInFull, Badges, GlanceLine, GlanceShape, Why } from "../verdict/card";
import { AirQualityCard, ConfidenceCard, TwoPossibilitiesCard, VERDICT_ICONS, WhatToDoCard, WhyCard } from "../verdict/cards";
import { GLANCE } from "../verdict/glance";
import { room, useOpenedHeight } from "../verdict/room";
import { VerdictMap } from "../verdict/VerdictMap";
import { verdictView } from "../verdict/view";

export function Verdict() {
  const { result, lang, reset, place, mode } = useApp();
  const t = useT();
  const [why, setWhy] = useState(false);
  const height = useOpenedHeight();
  if (!result) return <Navigate to="/" replace />;

  // A town picked from the search is named as picked, and so is every replay town (its verdict is for the town's
  // own point, even when "Use my location" chose it). A live GPS location takes the engine's name for the spot.
  const view = verdictView(result, lang, place && (place.source === "search" || mode === "replay") ? place.name : undefined);
  // Orange circle drifting, amber diamond unclear, red triangle unexplained (7b, 7d).
  const look = GLANCE[view.card.state];
  const link: CSSProperties = { minHeight: "56px", display: "flex", alignItems: "center", gap: "4px", padding: "0 10px 0 6px", color: look.ink, fontSize: "18px", fontWeight: "700", textDecoration: "none" };

  return (
    // How much room there is: the badges in one row and a tighter card on a small phone (verdict/room.ts, styles.css).
    <Screen className={room(height, view.notice !== null)}>
      <ReplayBanner />
      <section aria-labelledby="verdict-h" className="glance" data-state={view.card.state} style={{ background: look.background, color: look.ink, padding: "4px 20px 24px", display: "flex", flexDirection: "column" }}>
        <div className="glance-top" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 -8px 0 -16px", height: "64px" }}>
          <Link to="/" onClick={reset} style={link}>
            <BackIcon size={26} />
            {t("nav.newCheck")}
          </Link>
          <LangToggle on="band" />
        </div>
        {/* Listen reads the line and the badges' names. With "Why?" open it sits there, with what it then reads. */}
        <div className="glance-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", marginTop: "4px" }}>
          <GlanceShape state={view.card.state} />
          {!why && <ListenButton sentences={view.card.voice} />}
        </div>
        <GlanceLine card={view.card} />
      </section>
      <main className="verdict-main" style={{ display: "flex", flexDirection: "column", gap: "16px", padding: `16px 16px ${view.card.callFirst ? CLEAR_OF_CALL : CLEAR_OF_BAR}` }}>
        {view.notice && (
          // The fire is under 25 km away: follow officials, and what to do if told to leave, for this place. It stays
          // in front of "Why?": it is what to do, not why.
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
        <Badges badges={view.badges} title={t("badges.title")} />
        <Why card={view.card} open={why} onToggle={() => setWhy(!why)}>
          {/* Opened, "Why?" moves to the top of the screen: Listen is under it, and reads everything below. It is
              there only while "Why?" is open, so closing it stops the reading. */}
          {why && <ListenButton sentences={view.voice} style={{ alignSelf: "flex-start" }} />}
          <AnswerInFull view={view} />
          <VerdictMap json={result} view={view} />
          <ConfidenceCard view={view} />
          {view.twoPossibilities && <TwoPossibilitiesCard view={view} />}
          <WhatToDoCard view={view} />
          <AirQualityCard view={view} />
          <WhyCard view={view} startOpen />
        </Why>
        <ProtectLink />
      </main>
      <Sticky911 callFirst={view.card.callFirst} />
    </Screen>
  );
}
