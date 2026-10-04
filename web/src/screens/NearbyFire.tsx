// 03c · Nearby fire: a neighbour's fire pit or bonfire may explain the smell. Call 911 is the thing to tap; a link
// under it goes on to the trace.
import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { useApp, useT } from "../app/state";
import { ReplayBanner } from "../components/ReplayBanner";
import { Screen } from "../components/Screen";
import { TopBar } from "../components/TopBar";
import { ChevronRightIcon, PhoneIcon } from "../components/icons";
import { nearbyFireVoice } from "../listen/speech";
import { GUARD_MS, useTitleFocus } from "../look/parts";
import { Disc, FirePitMark } from "../look/pictures";

export function NearbyFire() {
  const { lang } = useApp();
  const t = useT();
  const title = useTitleFocus();
  const navigate = useNavigate();
  // The link leads on only once a double tap is over. On the next screen the 911 bar is under the finger (its button is
  // as wide as the screen on a narrow phone), and the search box: a second tap must not land there.
  const leaving = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(leaving.current), []);
  const onCheck = (event: React.MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; // a new tab or window: left to the browser
    event.preventDefault();
    if (leaving.current === undefined) leaving.current = window.setTimeout(() => navigate("/location"), GUARD_MS);
  };
  return (
    // Not clipped, so the Call 911 button can stay on screen (sticky), as on Call 911 now. No 911 bar: that button is it.
    <Screen style={{ overflow: "visible" }}>
      <ReplayBanner />
      <TopBar back="/q3" listen={nearbyFireVoice(lang)} />
<main className="nearby-main" style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "16px", padding: "12px 20px 24px" }}>
        <Disc tone="ink" size={60}><FirePitMark /></Disc>
        <h1 ref={title} tabIndex={-1} style={{ margin: "0", fontSize: "30px", fontWeight: "800", lineHeight: "1.15", letterSpacing: "-0.02em", textWrap: "balance", outline: "none" }}>{t("nearby.title")}</h1>
        <p style={{ margin: "0", fontSize: "20px", fontWeight: "500", lineHeight: "1.4", textWrap: "pretty" }}>{t("nearby.sub")}</p>
        <div style={{ flexGrow: "1" }} />
        <a href="tel:911" className="press nearby-call" style={{ position: "sticky", bottom: "calc(12px + env(safe-area-inset-bottom))", zIndex: "1", display: "flex", alignItems: "center", justifyContent: "center", gap: "14px", minHeight: "104px", borderRadius: "18px", background: "#D92D20", color: "#FFFFFF", textDecoration: "none", fontSize: "34px", fontWeight: "800", letterSpacing: "-0.01em", boxShadow: "0 12px 30px rgba(217, 45, 32, 0.3)" }}>
          <PhoneIcon size={36} style={{ strokeWidth: "2.4" }} />
          {t("emergency.call")}
        </a>
        <Link to="/location" onClick={onCheck} style={{ alignSelf: "center", minHeight: "56px", display: "flex", alignItems: "center", gap: "6px", padding: "0 12px", fontSize: "18px", fontWeight: "700", lineHeight: "1.3", textAlign: "center", color: "#1B2A4A" }}>
          <span style={{ textWrap: "balance" }}>{t("nearby.check")}</span>
          <ChevronRightIcon size={20} />
        </Link>
      </main>
    </Screen>
  );
}
