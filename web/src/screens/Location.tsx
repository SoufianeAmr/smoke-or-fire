// 05 · Where are you? (design/screens/05-location.html)
import { useState } from "react";
import { useNavigate } from "react-router";
import { useApp, useT, type Place } from "../app/state";
import { REPLAY_TOWNS, nearestReplayTown, searchPlaces } from "../data/replay";
import { loadCommunities, placeAt, usePlaces } from "../data/places";
import { ReplayBanner } from "../components/ReplayBanner";
import { Screen } from "../components/Screen";
import { Sticky911 } from "../components/Sticky911";
import { TopBar } from "../components/TopBar";
import { ChevronRightIcon } from "../components/icons";
import { circleBox, textBox } from "../map/labels";
import { Basemap, USER_XY, frameProjection } from "../map/basemap";
import type { StringKey } from "../i18n";
import { locationVoice } from "../listen/speech";

export function PlaceSearch({ id, places, query, setQuery, choose, href = "/loading" }: { id: string; places: Place[]; query: string; setQuery: (q: string) => void; choose: (p: Place) => void; href?: string }) {
  const t = useT();
  // Replay searches only the replay towns; live mode searches every Maritimes community.
  const results = searchPlaces(places, query);
  return (
    <>
      <div style={{ position: "relative" }}>
        <svg className="ic" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" style={{ position: "absolute", left: "16px", top: "18px", color: "#4F5561" }}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
        <input id={id} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("location.placeholder")} autoComplete="off" style={{ width: "100%", height: "60px", borderRadius: "16px", border: "2px solid #1B2A4A", padding: "0 16px 0 52px", fontFamily: "inherit", fontSize: "20px", fontWeight: "500", color: "#1A1D21", background: "#FFFFFF", boxShadow: "0 0 0 4px rgba(27, 42, 74, 0.14)", outline: "none" }} />
      </div>
      {results.length > 0 && (
        <div role="listbox" aria-label={t("location.results")} style={{ background: "#FFFFFF", borderRadius: "18px", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)", overflow: "hidden" }}>
          {results.map((place) => (
            <a key={`${place.name}-${place.province}-${place.lat}`} role="option" aria-selected="false" href={href} onClick={(e) => { e.preventDefault(); choose({ ...place, source: "search" }); }} className="row" style={{ display: "flex", alignItems: "center", gap: "14px", minHeight: "68px", padding: "8px 16px", color: "#1A1D21", textDecoration: "none" }}>
              <svg className="ic" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" style={{ color: "#1B2A4A" }}>
                <path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              <span style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "20px", fontWeight: "700" }}>{place.name}, {t(`province.${place.province}` as StringKey)}</span>
                {place.county && <span style={{ fontSize: "16px", color: "#4F5561" }}>{t("location.county", { county: place.county })}</span>}
              </span>
              <ChevronRightIcon size={22} style={{ color: "#4F5561" }} />
            </a>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * "Use my location": asks the phone where it is, remembers that for the text to family, and passes on the place
 * to check: in replay the nearest replay town, in live mode the spot itself, named after the nearest town.
 */
export function useLocate(onPlace: (place: Place) => void, onOff: () => void) {
  const { mode, setShared } = useApp();
  return (event: React.MouseEvent) => {
    event.preventDefault();
    if (!("geolocation" in navigator)) return onOff();
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setShared({ lat: coords.latitude, lon: coords.longitude });
        if (mode === "replay") return onPlace({ ...nearestReplayTown(coords.latitude, coords.longitude), source: "gps" });
        loadCommunities().then((list) => onPlace({ ...placeAt(list, coords.latitude, coords.longitude), source: "gps" }));
      },
      onOff,
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  };
}

export function Location() {
  const { mode, lang, place, setPlace } = useApp();
  const t = useT();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const places = usePlaces(mode);

  const choose = (chosen: Place) => {
    setPlace(chosen);
    navigate("/loading");
  };

  const useMyLocation = useLocate(choose, () => navigate("/location-off"));

  const pin = searchPlaces(places, query)[0] ?? place ?? REPLAY_TOWNS[0];
  const projection = frameProjection(pin, 358, 140);

  return (
    <Screen>
      <ReplayBanner />
      <TopBar back="/q2" listen={locationVoice(lang)} />
      <main style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "16px", padding: "4px 16px 152px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "0 4px" }}>
          <h1 style={{ margin: "0", fontSize: "34px", fontWeight: "800", lineHeight: "1.12", letterSpacing: "-0.02em" }}>{t("location.title")}</h1>
          <p style={{ margin: "0", fontSize: "18px", lineHeight: "1.45", color: "#4F5561" }}>{t("location.sub")}</p>
        </div>
        <a href="/loading" onClick={useMyLocation} className="press" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", minHeight: "64px", borderRadius: "18px", background: "#1B2A4A", color: "#FFFFFF", textDecoration: "none", fontSize: "22px", fontWeight: "700", boxShadow: "0 8px 20px rgba(27, 42, 74, 0.22)" }}>
          <svg className="ic" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="7" />
            <circle cx="12" cy="12" r="2.5" style={{ fill: "currentColor" }} />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
          {t("location.useMine")}
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#4F5561", fontSize: "18px", fontWeight: "600" }}>
          <span style={{ flexGrow: "1", height: "1px", background: "#DDD4C6" }} />
          {t("location.or")}
          <span style={{ flexGrow: "1", height: "1px", background: "#DDD4C6" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <label htmlFor="loc-search" style={{ fontSize: "18px", fontWeight: "700", padding: "0 4px" }}>{t("location.label")}</label>
          <PlaceSearch id="loc-search" places={places} query={query} setQuery={setQuery} choose={choose} />
        </div>
        <div style={{ background: "#FFFFFF", borderRadius: "18px", overflow: "hidden", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)" }}>
          <svg viewBox="0 0 358 140" width="100%" role="img" aria-label={t("location.mapAria", { town: pin.name })} style={{ display: "block" }}>
            <Basemap projection={projection} width={358} height={140} lang={lang} labels="location" avoid={[circleBox(USER_XY[0], USER_XY[1], 18), textBox(pin.name, USER_XY[0] + 16, USER_XY[1] + 6)]} />
            <circle cx={USER_XY[0]} cy={USER_XY[1]} r="18" style={{ fill: "#1B2A4A", opacity: "0.14" }} />
            <circle cx={USER_XY[0]} cy={USER_XY[1]} r="9" style={{ fill: "#1B2A4A", stroke: "#FFFFFF", strokeWidth: "3" }} />
            <text className="lbl" x={USER_XY[0] + 16} y={USER_XY[1] + 6}>{pin.name}</text>
          </svg>
        </div>
      </main>
      <Sticky911 />
    </Screen>
  );
}
