// 09a · Location is turned off (design/screens/09a-error-location-off.html)
import { useState } from "react";
import { useNavigate } from "react-router";
import { useApp, useT } from "../app/state";
import { searchPlaces } from "../data/replay";
import { usePlaces } from "../data/places";
import { ReplayBanner } from "../components/ReplayBanner";
import { Screen } from "../components/Screen";
import { CLEAR_OF_BAR, Sticky911 } from "../components/Sticky911";
import { TopBar } from "../components/TopBar";
import { locationOffVoice } from "../listen/speech";

export function LocationOff() {
  const { mode, lang, setPlace } = useApp();
  const t = useT();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const places = usePlaces(mode);

  // "Check this place" checks the first town matching what was typed (replay: the replay towns).
  const check = (event: React.MouseEvent) => {
    event.preventDefault();
    const place = searchPlaces(places, query)[0];
    if (!place) return;
    setPlace({ ...place, source: "search" });
    navigate("/loading");
  };

  return (
    <Screen>
      <ReplayBanner />
      <TopBar back="/q1" listen={locationOffVoice(lang)} />
      <main style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "20px", padding: `8px 16px ${CLEAR_OF_BAR}` }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "0 4px" }}>
          <span style={{ width: "64px", height: "64px", borderRadius: "18px", background: "#E9EDF5", color: "#1B2A4A", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg className="ic" width="34" height="34" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 22s7-6.2 7-12a7 7 0 0 0-11.8-5.1" />
              <path d="M5.3 7.8A7 7 0 0 0 5 10c0 5.8 7 12 7 12" />
              <path d="M3 3l18 18" />
            </svg>
          </span>
          <h1 style={{ margin: "0", fontSize: "34px", fontWeight: "800", lineHeight: "1.12", letterSpacing: "-0.02em" }}>{t("locationOff.title")}</h1>
          <p style={{ margin: "0", fontSize: "18px", lineHeight: "1.45" }}>{t("locationOff.sub")}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <label htmlFor="loc-search-2" style={{ fontSize: "18px", fontWeight: "700", padding: "0 4px" }}>{t("location.label")}</label>
          <div style={{ position: "relative" }}>
            <svg className="ic" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" style={{ position: "absolute", left: "16px", top: "18px", color: "#4F5561" }}>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            <input id="loc-search-2" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("location.placeholder")} autoComplete="off" style={{ width: "100%", height: "60px", borderRadius: "16px", border: "2px solid #1B2A4A", padding: "0 16px 0 52px", fontFamily: "inherit", fontSize: "20px", fontWeight: "500", color: "#1A1D21", background: "#FFFFFF", boxShadow: "0 0 0 4px rgba(27, 42, 74, 0.14)", outline: "none" }} />
          </div>
        </div>
        <a href="/loading" onClick={check} className="press" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", minHeight: "60px", borderRadius: "18px", background: "#1B2A4A", color: "#FFFFFF", textDecoration: "none", fontSize: "22px", fontWeight: "700" }}>
          {t("locationOff.check")}
        </a>
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", padding: "16px", borderRadius: "18px", background: "#FFFFFF", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)" }}>
          <svg className="ic" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" style={{ marginTop: "2px", color: "#1B2A4A" }}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5.5" />
            <path d="M12 7.6h.01" />
          </svg>
          <p style={{ margin: "0", fontSize: "18px", lineHeight: "1.45" }}>{t("locationOff.help")}</p>
        </div>
      </main>
      <Sticky911 />
    </Screen>
  );
}
