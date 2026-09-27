// If you’re told to leave: the Emergency screen's card layout on the beige page, with the 911 bar.
// Replay: the centres officials announced for the Long Lake fire (data/evacuation-events.json).
// Live: no event in that file is active today, so it says where officials announce centres.
import type { CSSProperties, ReactNode } from "react";
import { useApp, useT } from "../app/state";
import { ReplayBanner } from "../components/ReplayBanner";
import { Screen } from "../components/Screen";
import { Sticky911 } from "../components/Sticky911";
import { TopBar } from "../components/TopBar";
import { DoorOpenIcon, GlassesIcon, KeyIcon, MessageIcon, NavigationIcon, PawIcon, PhoneIcon, PillIcon, SmartphoneIcon, WalletIcon } from "../components/icons";
import { centreOf, clockTime, directionsUrl, eventFor, mapLink, monthName, smsUrl, telUrl, type Centre, type EvacuationEvent, type Hours, type LatLon } from "../data/evacuation";
import type { Lang, StringKey } from "../i18n";
import { LeaveMap, MarkerBadge } from "../leave/LeaveMap";

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

export function Leave() {
  const { mode, lang, place, shared } = useApp();
  const t = useT();
  const event = eventFor(mode);
  // The text to family carries a location only if the person shared the phone's location this session.
  const message = [t("leave.family.sms"), shared && t("leave.family.location", { mapLink: mapLink(shared) })].filter(Boolean).join(" ");

  return (
    <Screen>
      <ReplayBanner />
      <TopBar back={-1} />
      <main style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "16px", padding: "4px 16px 160px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "0 4px 4px" }}>
          <span style={{ width: "60px", height: "60px", borderRadius: "50%", background: "#1B2A4A", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <DoorOpenIcon size={30} />
          </span>
          <h1 style={{ margin: "0", fontSize: "34px", fontWeight: "800", lineHeight: "1.12", letterSpacing: "-0.02em", textWrap: "balance" }}>{t("leave.title")}</h1>
          <p style={{ margin: "0", fontSize: "20px", fontWeight: "500", lineHeight: "1.4", textWrap: "pretty" }}>{t("leave.intro")}</p>
        </div>
        {/* You on the map: where the phone is, if shared; else the place being checked. */}
        {event ? <Announced event={event} user={shared ?? place} /> : <NoneAnnounced />}
        <TakeCard officials={event !== null} />
        <a href={smsUrl(message)} className="press" style={OUTLINED}>
          <MessageIcon size={26} />
          {t("leave.family")}
        </a>
        {event && (
          <a href={event.source} target="_blank" rel="noopener noreferrer" style={{ minHeight: "56px", display: "flex", alignItems: "center", padding: "0 4px", fontSize: "18px", lineHeight: "1.45", color: "#1B2A4A" }}>
            {t("leave.source", { authority: event.authority[lang], month: monthName(event.announced, lang) })}
          </a>
        )}
      </main>
      <Sticky911 />
    </Screen>
  );
}

/** "10 a.m. to 4 p.m. daily" / "tous les jours de 10 h à 16 h". */
const daily = (hours: Hours, lang: Lang, t: ReturnType<typeof useT>) => t("leave.hours.daily", { open: clockTime(hours.open, lang), close: clockTime(hours.close, lang) });

/** Replay: the map, both centres, roads, and the event's phone lines. */
function Announced({ event, user }: { event: EvacuationEvent; user: (LatLon & { name?: string }) | null }) {
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
      <LeaveMap event={event} user={user} />
      {centres.map((centre) => <CentreCard key={centre.type} centre={centre} />)}
      <section style={{ ...CARD, gap: "4px" }}>
        <p style={{ ...BODY, marginBottom: "6px" }}>{t("leave.roads")}</p>
        {phone("leave.phone.info", event.phones.information.number, event.phones.information.hours)}
        {phone("leave.phone.overnight", event.phones.overnight)}
      </section>
    </>
  );
}

function CentreCard({ centre }: { centre: Centre }) {
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
        <h2 id={id} style={H2}>{t(centre.type === "reception" ? "leave.reception.title" : "leave.comfort.title")}</h2>
      </div>
      <p style={BODY}>
        <strong>{centre.name}</strong>
        <br />
        {centre.address}
      </p>
      <p style={BODY}>{hours ? t("leave.withHours", { what: services, hours }) : services}</p>
      {centre.register && <p style={NOTE}>{t("leave.register")}</p>}
      <a href={directionsUrl(centre)} target="_blank" rel="noopener noreferrer" aria-describedby={id} className="press" style={FILLED}>
        <NavigationIcon size={24} />
        {t("leave.directions")}
      </a>
    </section>
  );
}

/** No event active: where officials announce centres, and 211. */
function NoneAnnounced() {
  const t = useT();
  const official = (text: StringKey, host: StringKey, url: StringKey) => (
    <a href={t(url)} target="_blank" rel="noopener noreferrer" className="press" style={{ display: "flex", alignItems: "center", gap: "14px", minHeight: "64px", padding: "10px 16px", borderRadius: "14px", border: "1.5px solid #E6DFD3", color: "#1A1D21", textDecoration: "none" }}>
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
  return (
    <section style={CARD}>
      <p style={BODY}>{t("leave.none")}</p>
      {official("leave.link.nb", "leave.link.nb.host", "leave.link.nb.url")}
      {official("leave.link.ns", "leave.link.ns.host", "leave.link.ns.url")}
      <a href="tel:211" style={TEXT_LINK}>
        <PhoneIcon size={22} />
        {t("leave.211")}
      </a>
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
      <p style={{ ...BODY, fontWeight: "700" }}>{t("leave.take.never")}</p>
    </section>
  );
}
