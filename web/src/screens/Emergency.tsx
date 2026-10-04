// 04 · Emergency — Call 911 now (design/screens/04-emergency.html), with where the phone is, to read to the dispatcher.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useApp, useT } from "../app/state";
import type { StringKey } from "../i18n";
import { Screen } from "../components/Screen";
import { LangToggle } from "../components/TopBar";
import { BackIcon, ChevronRightIcon, MapPinIcon } from "../components/icons";
import { loadCommunities } from "../data/places";
import { ListenButton } from "../listen/ListenButton";
import { emergencyVoice } from "../listen/speech";
import { useSettled, useTitleFocus, whole } from "../look/parts";
import { isFresh, nearLine, townLine, whereNow, type Fix, type Spot } from "../look/where";

const NUMBER: CSSProperties = { flexShrink: "0", width: "30px", height: "30px", borderRadius: "50%", background: "#1A1D21", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "700" };
const ITEM: CSSProperties = { display: "flex", gap: "12px", alignItems: "flex-start" };
// The red strip under the Call 911 button. Its margins take back its padding, so it adds no height to the page.
const PLATE: CSSProperties = { position: "sticky", bottom: "0", zIndex: "1", margin: "-16px -20px calc(-12px - env(safe-area-inset-bottom))", padding: "16px 20px calc(12px + env(safe-area-inset-bottom))", background: "linear-gradient(rgba(217, 45, 32, 0), #D92D20 16px)" };
const PHONE = "M5.5 3.5h3l1.8 4.6-2.2 1.4a11 11 0 0 0 6.4 6.4l1.4-2.2 4.6 1.8v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3.5 5.7a2 2 0 0 1 2-2.2z";

export function Emergency() {
  const { lang } = useApp();
  const t = useT();
  const navigate = useNavigate();
  // Back is the screen the person came from, whichever question that was. Opened directly (a link or bookmark), there
  // is none: the link goes to the first question.
  const inApp = useLocation().key !== "default";
  const title = useTitleFocus();
  useEffect(() => {
    document.body.classList.add("emergency");
    return () => document.body.classList.remove("emergency");
  }, []);

  const items: [StringKey, StringKey][] = [
    ["emergency.tell1.lead", "emergency.tell1"],
    ["emergency.tell2.lead", "emergency.tell2"],
    ["emergency.tell3.lead", "emergency.tell3"],
    ["emergency.tell4.lead", "emergency.tell4"],
  ];

  return (
    <div className="emergency" style={{ display: "contents" }}>
      <Screen style={{ background: "#D92D20", color: "#FFFFFF", overflow: "visible" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px 0 4px", height: "68px" }}>
          <Link to="/q1" onClick={inApp ? (e) => { e.preventDefault(); navigate(-1); } : undefined} aria-label={t("nav.back")} style={{ width: "56px", height: "56px", display: "flex", alignItems: "center", justifyContent: "center", color: "#FFFFFF", borderRadius: "14px" }}>
            <BackIcon size={28} />
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ListenButton sentences={emergencyVoice(lang)} />
            <LangToggle on="band" />
          </div>
        </div>
        <main className="emergency-main" style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "20px", padding: "8px 20px 24px" }}>
          <div className="emergency-head" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <span className="emergency-disc" style={{ flexShrink: "0", width: "60px", height: "60px", borderRadius: "50%", background: "#FFFFFF", color: "#D92D20", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg className="ic" width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: "2.2" }}><path d={PHONE} /></svg>
              </span>
              <p style={{ margin: "0", fontSize: "22px", fontWeight: "700", letterSpacing: "0.06em" }}>{t("emergency.label")}</p>
            </div>
            <h1 ref={title} tabIndex={-1} className="emergency-title" style={{ margin: "4px 0 0", fontSize: "34px", fontWeight: "800", lineHeight: "1.1", letterSpacing: "-0.02em", outline: "none" }}>{t("emergency.title")}</h1>
            <p style={{ margin: "0", fontSize: "20px", fontWeight: "500", lineHeight: "1.4", textWrap: "pretty" }}>{t("emergency.sub")}</p>
          </div>
          <section aria-labelledby="tell-h" className="emergency-card" style={{ background: "#FFFFFF", color: "#1A1D21", borderRadius: "18px", padding: "20px", display: "flex", flexDirection: "column", gap: "14px", boxShadow: "0 10px 28px rgba(80, 10, 5, 0.25)" }}>
            <h2 id="tell-h" style={{ margin: "0", fontSize: "22px", fontWeight: "700" }}>{t("emergency.tell")}</h2>
            <ol style={{ listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column", gap: "12px" }}>
              {items.map(([lead, rest], i) => (
                // "Where you are" holds the location block, on a row of its own under the words.
                <li key={lead} style={i === 0 ? { ...ITEM, flexWrap: "wrap" } : ITEM}>
                  <span style={NUMBER}>{i + 1}</span>
                  <span style={{ flex: "1 1 0", minWidth: "0", fontSize: "18px", lineHeight: "1.4" }}><strong>{t(lead)}</strong> {t(rest)}</span>
                  {i === 0 && <Where />}
                </li>
              ))}
            </ol>
          </section>
          <div style={{ flexGrow: "1" }} />
          {/* The button stays at the bottom of the screen when the page is taller than the phone. It sits on a red strip
              as wide as the screen, so the white card passing under it never runs into the white button. */}
          <div style={PLATE}>
            <a href="tel:911" className="emergency-call" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "14px", minHeight: "104px", borderRadius: "18px", background: "#FFFFFF", color: "#D92D20", textDecoration: "none", fontSize: "34px", fontWeight: "800", letterSpacing: "-0.01em", boxShadow: "0 12px 30px rgba(80, 10, 5, 0.3)" }}>
              <svg className="ic" width="36" height="36" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: "2.4" }}><path d={PHONE} /></svg>
              {t("emergency.call")}
            </a>
          </div>
          <p style={{ margin: "-6px 0 0", textAlign: "center", fontSize: "18px", fontWeight: "500", lineHeight: "1.4", textWrap: "balance" }}>{t("emergency.stay")}</p>
          <Link to="/leave" style={{ alignSelf: "center", minHeight: "56px", display: "flex", alignItems: "center", gap: "6px", padding: "0 12px", fontSize: "18px", fontWeight: "700", lineHeight: "1.3", textAlign: "center" }}>
            <span style={{ textWrap: "balance" }}>{t("leave.entry")}</span>
            <ChevronRightIcon size={20} />
          </Link>
        </main>
      </Screen>
    </div>
  );
}

/** How long the phone has to answer. */
const GPS_TIMEOUT_MS = 8000;

const PLAIN: CSSProperties = { flex: "0 0 100%", display: "flex", flexDirection: "column", gap: "12px", padding: "12px", borderRadius: "14px", background: "#F3EEE6" };
// Room for the place, both coordinate lines and the button from the start: nothing under the block moves, the Call 911
// button least of all, when the position arrives or is refused.
const BOX: CSSProperties = { ...PLAIN, minHeight: "186px" };
const NAME: CSSProperties = { margin: "0", fontSize: "20px", fontWeight: "700", lineHeight: "1.3" };
// Large, with digits of one width, each line whole: they are read aloud, one figure at a time.
const COORDS: CSSProperties = { margin: "0", display: "flex", flexDirection: "column", fontSize: "22px", fontWeight: "700", lineHeight: "1.3", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const OFF: CSSProperties = { margin: "0", fontSize: "18px", fontWeight: "600", lineHeight: "1.4" };
const PIN: CSSProperties = { alignSelf: "center", display: "flex", color: "#8A8F98" };
// Outlined navy, as Listen: the white Call 911 button stays the one thing to tap on this screen.
const SHOW: CSSProperties = { minHeight: "56px", padding: "6px 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", borderRadius: "14px", border: "2px solid #1B2A4A", background: "#FFFFFF", color: "#1B2A4A", fontFamily: "inherit", fontSize: "18px", fontWeight: "700", lineHeight: "1.2", textAlign: "center", cursor: "pointer" };

/**
 * Where the phone is, under "Where you are": the nearest community and the coordinates, to read to the dispatcher. Asked
 * of the phone on a tap only, never by itself, and shown while the position is fresh (ten minutes); one already shared
 * this session shows without a tap. A town typed in live mode is shown by its name; a replay town never is. Refused,
 * timed out or too coarse to say anything: "not available" (an earlier position goes too), and the screen stays as it
 * is. Nothing here touches the Call 911 button.
 */
function Where() {
  const { mode, lang, place, shared, setShared } = useApp();
  const t = useT();
  const [can] = useState(() => "geolocation" in navigator);
  const [step, setStep] = useState<"tap" | "locating" | "off">("tap");
  // The last request gave nothing to show; it stays so until one succeeds.
  const [failed, setFailed] = useState(false);
  // The button sits where "Not sure" was on the question before: a double tap there must not ask the phone.
  const settled = useSettled(false);
  // The request being answered: when it was asked, and how to finish it (once).
  const asking = useRef<{ at: number; finish: (fix: Fix | null) => void } | null>(null);
  // The time, kept current: a position stops being shown ten minutes after it was taken.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  // The communities, to name the spot: loaded once there is a position to name, or one is on its way. If the list
  // can't be loaded there is no name: the coordinates alone.
  const [list, setList] = useState<Spot[] | null>(null);
  const wanted = step === "locating" || isFresh(shared, now);
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    loadCommunities().then((all) => !cancelled && setList(all), () => !cancelled && setList([]));
    return () => {
      cancelled = true;
    };
  }, [wanted]);

  const where = whereNow({ shared, place, mode, now, lang, list });
  // After a request that failed, an earlier position is not shown as if it were the answer: the person may have moved.
  const fix = where.kind === "fix" && !failed ? where : null;
  const name = fix ? fix.near && nearLine(lang, fix.near) : where.kind === "town" ? townLine(lang, where) : null;
  const coords = fix ? fix.coords : null;
  // A position too coarse for coordinates has only a name to show: until the list is in, the block says nothing yet
  // (not "not available", which the name would then replace).
  const busy = step === "locating" || (fix !== null && !coords && list === null);
  const off = !busy && (fix ? !name && !coords : step === "off");
  const label = busy ? "leave.family.locating" : fix && (name || coords) ? "emergency.where.update" : "emergency.where.show";

  const onClick = () => {
    if (!settled) return;
    if (step === "locating") {
      // A tap while asking is a double tap, until the timeout has passed: then the browser may never answer (a
      // permission prompt dismissed in Firefox), so this tap ends the wait.
      if (asking.current && Date.now() - asking.current.at >= GPS_TIMEOUT_MS) asking.current.finish(null);
      return;
    }
    setStep("locating");
    const finish = (found: Fix | null) => {
      if (asking.current?.finish !== finish) return; // already finished: a late answer changes nothing
      asking.current = null;
      // Remembered for the session, as "Use my location" is. After the screen was left, that is all a late answer does.
      if (found) setShared(found);
      const time = Date.now();
      setNow(time);
      // A position whose own time is not the last ten minutes (the phone's clock is off) can't be shown: say so.
      const shown = found !== null && isFresh(found, time);
      setFailed(!shown);
      setStep(shown ? "tap" : "off");
    };
    asking.current = { at: Date.now(), finish };
    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) => finish({ lat: coords.latitude, lon: coords.longitude, at: timestamp, accuracy: coords.accuracy }),
      () => finish(null),
      { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 0 },
    );
  };

  return (
    <div className="where-box" role="status" aria-busy={busy} style={can ? BOX : PLAIN}>
      {name && <p className="where-name" style={NAME}>{whole(name)}</p>}
      {coords && (
        // Close under the name: one thing to read, top to bottom.
        <p className="where-coords" style={name ? { ...COORDS, marginTop: "-8px" } : COORDS}>
          <span>{coords[0]}</span>
          <span>{coords[1]}</span>
        </p>
      )}
      {off && <p className="where-off" style={OFF}>{t("emergency.where.off")}</p>}
      {/* Nothing to show yet: a pin holds the room the position will take. */}
      {can && !name && !coords && !off && <span aria-hidden="true" style={PIN}><MapPinIcon size={36} /></span>}
      {/* Mounted through every state, so the keyboard focus stays on it. */}
      {can && (
        <button type="button" className="press where-show" onClick={onClick} style={SHOW}>
          <svg className="ic" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="7" />
            <circle cx="12" cy="12" r="2.5" style={{ fill: "currentColor" }} />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
          {t(label)}
        </button>
      )}
    </div>
  );
}
