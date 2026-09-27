// If you’re told to leave: the Emergency screen's card layout on the beige page, with the 911 bar.
// It first asks where you are, unless a place was chosen this session. Then:
// - within an active event's radius of its fire (replay, Aug 25, 2025: Long Lake): the centres officials announced
//   (data/evacuation-events.json);
// - farther away: that evacuation doesn't apply, and where officials announce centres in your province;
// - no event active (live): where officials announce centres, the City of Moncton's alerts first in Moncton.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useApp, useT, type Place } from "../app/state";
import { ReplayBanner } from "../components/ReplayBanner";
import { Screen } from "../components/Screen";
import { CLEAR_OF_BAR, Sticky911 } from "../components/Sticky911";
import { TopBar } from "../components/TopBar";
import { DoorOpenIcon, GlassesIcon, KeyIcon, MessageIcon, NavigationIcon, PawIcon, PhoneIcon, PillIcon, SmartphoneIcon, WalletIcon } from "../components/icons";
import { usePlaces } from "../data/places";
import { centreOf, clockTime, directionsUrl, eventFor, familyMessage, isNear, kmBetween, monthName, smsUrl, telUrl, type Centre, type EvacuationEvent, type Hours, type LatLon } from "../data/evacuation";
import { platformOf } from "../keep/keep";
import type { Lang, StringKey } from "../i18n";
import { LeaveMap, MarkerBadge } from "../leave/LeaveMap";
import { leaveVoice } from "../listen/speech";
import { PlaceSearch, useLocate } from "./Location";

const CARD: CSSProperties = { background: "#FFFFFF", color: "#1A1D21", borderRadius: "18px", padding: "20px", display: "flex", flexDirection: "column", gap: "14px", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)" };
const H2: CSSProperties = { margin: "0", fontSize: "22px", fontWeight: "700", lineHeight: "1.25" };
const BODY: CSSProperties = { margin: "0", fontSize: "18px", lineHeight: "1.45" };
const NOTE: CSSProperties = { ...BODY, padding: "14px 16px", borderRadius: "14px", background: "#F3EEE6" };
const BUTTON: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", minHeight: "64px", padding: "10px 18px", borderRadius: "18px", textDecoration: "none", fontSize: "20px", fontWeight: "700", lineHeight: "1.25", textAlign: "center" };
// Navy: Call 911 in the bar below stays the only red button.
const FILLED: CSSProperties = { ...BUTTON, background: "#1B2A4A", color: "#FFFFFF", boxShadow: "0 8px 20px rgba(27, 42, 74, 0.22)" };
const OUTLINED: CSSProperties = { ...BUTTON, background: "#FFFFFF", color: "#1B2A4A", border: "3px solid #1B2A4A" };
const TEXT_LINK: CSSProperties = { alignSelf: "flex-start", minHeight: "56px", display: "flex", alignItems: "center", gap: "12px", fontSize: "18px", fontWeight: "700", lineHeight: "1.3", color: "#1B2A4A" };

const TAKE: [StringKey, (size: number) => ReactNode][] = [
  ["leave.take.medication", (s) => <PillIcon size={s} />],
  ["leave.take.wallet", (s) => <WalletIcon size={s} />],
  ["leave.take.keys", (s) => <KeyIcon size={s} />],
  ["leave.take.phone", (s) => <SmartphoneIcon size={s} />],
  ["leave.take.glasses", (s) => <GlassesIcon size={s} />],
  ["leave.take.pets", (s) => <PawIcon size={s} />],
];

/** Official pages where each province announces where to go: [link text, host, URL] string keys. P.E.I. has none:
 *  princeedwardisland.ca could not be confirmed (its pages sit behind a bot check); its guide sends people to 211. */
type Official = [StringKey, StringKey, StringKey];
const PROVINCE_LINKS: Record<string, Official[]> = {
  NB: [["leave.link.nb", "leave.link.nb.host", "leave.link.nb.url"]],
  NS: [["leave.link.ns", "leave.link.ns.host", "leave.link.ns.url"]],
  PE: [],
};
const MONCTON: Official = ["leave.link.moncton", "leave.link.moncton.host", "leave.link.moncton.url"];
// The City of Moncton, as the town search and "Use my location" name it.
const inMoncton = (place: Place) => place.name === "Moncton" && place.province === "NB";
/** Where officials announce centres for this place: the City of Moncton's alerts first (live), then the province's. */
const officialLinks = (place: Place, live: boolean): Official[] => [...(live && inMoncton(place) ? [MONCTON] : []), ...(PROVINCE_LINKS[place.province] ?? [])];

export function Leave() {
  const { mode, lang, place, setPlace } = useApp();
  const t = useT();
  const event = eventFor(mode);
  const near = event !== null && place !== null && isNear(event, place);

  // Listen: the guided voice for what this screen shows. The 211 line and the official links are said only when shown.
  const reception = event && near ? centreOf(event, "reception") : null;
  const links = place ? officialLinks(place, mode === "live") : [];
  const call211 = !!place && !!PROVINCE_LINKS[place.province];
  const listen = leaveVoice(
    lang,
    !place
      ? { kind: "where" }
      : reception
        ? { kind: "near", name: reception.name, address: reception.address }
        : event && !near
          ? { kind: "far", ...farVars(event, place, lang), links: links.length > 0, call211 }
          : { kind: "none", links: links.length > 0, call211 },
  );

  return (
    <Screen>
      <ReplayBanner />
      <TopBar back={-1} listen={listen} />
      <main style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "16px", padding: `4px 16px ${CLEAR_OF_BAR}` }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "0 4px 4px" }}>
          <span style={{ width: "60px", height: "60px", borderRadius: "50%", background: "#1B2A4A", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <DoorOpenIcon size={30} />
          </span>
          <h1 style={{ margin: "0", fontSize: "34px", fontWeight: "800", lineHeight: "1.12", letterSpacing: "-0.02em", textWrap: "balance" }}>{t("leave.title")}</h1>
          <p style={{ margin: "0", fontSize: "20px", fontWeight: "500", lineHeight: "1.4", textWrap: "pretty" }}>{t("leave.intro")}</p>
          {place && (
            <button type="button" onClick={() => setPlace(null)} style={{ ...TEXT_LINK, padding: "0", border: "0", background: "transparent", fontFamily: "inherit", textDecoration: "underline", cursor: "pointer" }}>
              {t("leave.change", { town: place.name })}
            </button>
          )}
        </div>
        {!place ? (
          <WhereAreYou />
        ) : (
          <>
            {event && near ? <Announced event={event} place={place} replay={mode === "replay"} /> : <Elsewhere place={place} event={event} live={mode === "live"} />}
            <TakeCard officials={near} />
            <TellFamily />
            {event && near && (
              <a href={event.source} target="_blank" rel="noopener noreferrer" style={{ minHeight: "56px", display: "flex", alignItems: "center", padding: "0 4px", fontSize: "18px", lineHeight: "1.45", color: "#1B2A4A" }}>
                {t("leave.source", { authority: event.authority[lang], month: monthName(event.announced, lang) })}
              </a>
            )}
          </>
        )}
      </main>
      <Sticky911 />
    </Screen>
  );
}

/** How long to wait for the phone's position before sending the message without it. */
const GPS_TIMEOUT_MS = 6000;

/**
 * "Tell family you’re OK": a text message that says where the phone really is. That is the phone's GPS position, never
 * the replay town, at full precision (the person chooses who gets it). If it isn't known this session, the tap asks for
 * it first; denied or timed out, the message goes without it. On an iPhone, Safari won't open Messages once it had to
 * wait for the position, so that tap only gets it, and the button becomes "Send message with my location". Elsewhere the
 * message opens at once, and the button stays a plain link to it in case the browser didn't open it.
 */
function TellFamily() {
  const { lang, shared, setShared } = useApp();
  const t = useT();
  const [step, setStep] = useState<"tap" | "locating" | "ready">("tap");
  const [iphone] = useState(() => platformOf(navigator.userAgent, navigator.maxTouchPoints) === "iphone");
  const href = smsUrl(familyMessage(lang, shared));
  // The request being answered: when it was asked, and how to finish it (once).
  const asking = useRef<{ at: number; finish: (at: LatLon | null) => void } | null>(null);
  // Left the screen: a late answer is still remembered, but opens nothing on another screen.
  const gone = useRef(false);
  useEffect(() => {
    gone.current = false;
    return () => void (gone.current = true);
  }, []);

  const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (step === "locating") {
      event.preventDefault();
      // A tap while asking is a double tap, until the timeout has passed: then the browser may never answer (a
      // permission prompt dismissed in Firefox), so this tap sends the message without the location.
      if (asking.current && Date.now() - asking.current.at >= GPS_TIMEOUT_MS) asking.current.finish(null);
      return;
    }
    if (shared || step === "ready" || !("geolocation" in navigator)) return; // the link opens the message
    event.preventDefault();
    setStep("locating");
    const finish = (at: LatLon | null) => {
      if (asking.current?.finish !== finish) return; // already finished: a late answer changes nothing
      asking.current = null;
      if (at) setShared(at);
      setStep("ready");
      if (!iphone && !gone.current) window.location.href = smsUrl(familyMessage(lang, at));
    };
    asking.current = { at: Date.now(), finish };
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => finish({ lat: coords.latitude, lon: coords.longitude }),
      () => finish(null),
      { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 0 },
    );
  };

  const label = step === "locating" ? "leave.family.locating" : step === "ready" ? (shared ? "leave.family.send" : "leave.family.sendPlain") : "leave.family";
  return (
    <a href={href} onClick={onClick} aria-busy={step === "locating"} className="press" style={OUTLINED}>
      <MessageIcon size={26} />
      {t(label)}
    </a>
  );
}

/** Where are you? "Use my location" or the town search; the answer stays for the session. */
function WhereAreYou() {
  const { mode, setPlace } = useApp();
  const t = useT();
  const [query, setQuery] = useState("");
  const [off, setOff] = useState(false);
  const places = usePlaces(mode);
  const locate = useLocate(setPlace, () => setOff(true));
  return (
    <section aria-labelledby="where-h" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <h2 id="where-h" style={{ margin: "8px 4px 0", fontSize: "28px", fontWeight: "800", lineHeight: "1.15" }}>{t("location.title")}</h2>
      <a href="/leave" onClick={locate} className="press" style={FILLED}>
        <svg className="ic" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2.5" style={{ fill: "currentColor" }} />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
        {t("location.useMine")}
      </a>
      {off && (
        <p role="status" style={NOTE}>
          <strong>{t("locationOff.title")}.</strong> {t("locationOff.sub")}
        </p>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#4F5561", fontSize: "18px", fontWeight: "600" }}>
        <span style={{ flexGrow: "1", height: "1px", background: "#DDD4C6" }} />
        {t("location.or")}
        <span style={{ flexGrow: "1", height: "1px", background: "#DDD4C6" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <label htmlFor="leave-search" style={{ fontSize: "18px", fontWeight: "700", padding: "0 4px" }}>{t("location.label")}</label>
        <PlaceSearch id="leave-search" places={places} query={query} setQuery={setQuery} choose={setPlace} href="/leave" />
      </div>
    </section>
  );
}

/** "10 a.m. to 4 p.m. daily" / "tous les jours de 10 h à 16 h". */
const daily = (hours: Hours, lang: Lang, t: ReturnType<typeof useT>) => t("leave.hours.daily", { open: clockTime(hours.open, lang), close: clockTime(hours.close, lang) });

/** Near the fire: the map, both centres, roads, and the event's phone lines. */
function Announced({ event, place, replay }: { event: EvacuationEvent; place: Place; replay: boolean }) {
  const { lang } = useApp();
  const t = useT();
  const centres = [centreOf(event, "reception"), centreOf(event, "comfort")].filter((c): c is Centre => c !== null);
  const phone = (label: StringKey, number: string, hours?: Hours) => (
    <a href={telUrl(number)} style={TEXT_LINK}>
      <PhoneIcon size={22} />
      <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        <span>{t(label)}</span>
        <span style={{ fontWeight: "500" }}>{hours ? t("leave.withHours", { what: number, hours: daily(hours, lang, t) }) : number}</span>
      </span>
    </a>
  );
  return (
    <>
      <h2 style={{ ...H2, margin: "4px 4px 0", fontSize: "24px", fontWeight: "800" }}>{t("leave.near.title", { fire: event.fire.name, area: event.area[lang] })}</h2>
      <LeaveMap event={event} user={place} />
      {/* Replay: the phone is not in the chosen town, so the route starts there. Live: from where the phone is. */}
      {centres.map((centre) => <CentreCard key={centre.type} centre={centre} origin={replay ? place : undefined} />)}
      <section style={{ ...CARD, gap: "4px" }}>
        <p style={{ ...BODY, marginBottom: "6px" }}>{t("leave.roads")}</p>
        {phone("leave.phone.info", event.phones.information.number, event.phones.information.hours)}
        {phone("leave.phone.overnight", event.phones.overnight)}
      </section>
    </>
  );
}

function CentreCard({ centre, origin }: { centre: Centre; origin?: LatLon }) {
  const { lang } = useApp();
  const t = useT();
  const list = centre.services.map((s) => t(`leave.service.${s}` as StringKey)).join(", ");
  const services = list.charAt(0).toUpperCase() + list.slice(1);
  const hours = centre.hours && daily(centre.hours, lang, t);
  const id = `${centre.type}-h`;
  return (
    <section aria-labelledby={id} style={CARD}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <MarkerBadge kind={centre.type} size={48} />
        <h3 id={id} style={H2}>{t(centre.type === "reception" ? "leave.reception.title" : "leave.comfort.title")}</h3>
      </div>
      <p style={BODY}>
        <strong>{centre.name}</strong>
        <br />
        {centre.address}
      </p>
      <p style={BODY}>{hours ? t("leave.withHours", { what: services, hours }) : services}</p>
      {centre.register && <p style={NOTE}>{t("leave.register")}</p>}
      <a href={directionsUrl(centre, origin)} target="_blank" rel="noopener noreferrer" aria-describedby={id} className="press" style={FILLED}>
        <NavigationIcon size={24} />
        {t("leave.directions")}
      </a>
    </section>
  );
}

/** "de Moncton" / "d’Edmundston" / "d’Halifax": French elides "de" before a vowel or a silent h. Only Halifax is listed:
 *  some place names start with a sounded h, which keeps "de". */
const ofTown = (town: string) => (/^([aeiouyàâäéèêëîïôöùûü]|halifax\b)/i.test(town) ? `d’${town}` : `de ${town}`);

/** "This evacuation was for people near the Long Lake fire in Annapolis County, 159 km from Moncton." */
const farVars = (event: EvacuationEvent, place: Place, lang: Lang) => ({
  fire: event.fire.name,
  area: event.area[lang],
  km: Math.round(kmBetween(place, event.fire)),
  town: place.name,
  ofTown: ofTown(place.name),
});

/** Away from an active event (it doesn't apply), or none active (live): where officials announce centres, and 211. */
function Elsewhere({ place, event, live }: { place: Place; event: EvacuationEvent | null; live: boolean }) {
  const { lang } = useApp();
  const t = useT();
  const official = ([text, host, url]: Official) => (
    <a key={text} href={t(url)} target="_blank" rel="noopener noreferrer" className="press" style={{ display: "flex", alignItems: "center", gap: "14px", minHeight: "64px", padding: "10px 16px", borderRadius: "14px", border: "1.5px solid #E6DFD3", color: "#1A1D21", textDecoration: "none" }}>
      <span style={{ flexGrow: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
        <span style={{ fontSize: "18px", fontWeight: "700" }}>{t(text)}</span>
        {/* A long host (emergencyinfo.novascotia.ca) may wrap after a dot rather than push the icon out. */}
        <span style={{ fontSize: "18px", color: "#4F5561", overflowWrap: "anywhere" }}>
          {t(host).split(".").map((part, i, all) => (i < all.length - 1 ? <span key={i}>{part}.<wbr /></span> : part))}
        </span>
      </span>
      <svg className="ic" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ color: "#1B2A4A" }}>
        <path d="M14 4h6v6" />
        <path d="M20 4l-9 9" />
        <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
      </svg>
    </a>
  );
  const links = officialLinks(place, live);
  const far = event && farVars(event, place, lang);
  return (
    <section style={CARD}>
      {far && <p style={{ ...BODY, fontWeight: "700" }}>{t("leave.far", far)}</p>}
      <p style={BODY}>{t(far ? "leave.far.area" : "leave.none")}</p>
      {links.map(official)}
      {/* 211 answers in New Brunswick, Nova Scotia and P.E.I., in English or French. */}
      {PROVINCE_LINKS[place.province] && (
        <a href="tel:211" style={TEXT_LINK}>
          <PhoneIcon size={22} />
          {t("leave.211")}
        </a>
      )}
    </section>
  );
}

function TakeCard({ officials }: { officials: boolean }) {
  const t = useT();
  return (
    <section aria-labelledby="take-h" style={CARD}>
      <h2 id="take-h" style={H2}>{t("leave.take.title")}</h2>
      {officials && <p style={BODY}>{t("leave.take.officials")}</p>}
      <ul style={{ listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column", gap: "10px" }}>
        {TAKE.map(([key, icon]) => (
          <li key={key} style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "18px", lineHeight: "1.35" }}>
            <span style={{ flexShrink: "0", width: "44px", height: "44px", borderRadius: "50%", background: "#E9EDF5", color: "#1B2A4A", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon(24)}</span>
            {t(key)}
          </li>
        ))}
      </ul>
      <p style={{ ...BODY, fontWeight: "700" }}>{t("leave.take.noDelay")}</p>
    </section>
  );
}
