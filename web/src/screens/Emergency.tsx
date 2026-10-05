// 04 · Emergency — Call 911 now, as a call card (design/DESIGN-LOCK.md, "Amendment: the questions' top bar, the first
// question's answers, and Call 911 now as a call card"): the Call 911 button first, then what the dispatcher will ask,
// with where the phone is to read out. A calm white page: red is the button's alone.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import { useApp, useT } from "../app/state";
import type { StringKey } from "../i18n";
import { Screen } from "../components/Screen";
import { TopBar } from "../components/TopBar";
import { ChevronRightIcon, FlameIcon, MapPinIcon } from "../components/icons";
import { loadCommunities } from "../data/places";
import { ListenButton } from "../listen/ListenButton";
import { emergencyVoice } from "../listen/speech";
import { About, useSettled, useTitleFocus, whole, type AboutWords } from "../look/parts";
import { isFresh, nearLine, townLine, whereNow, type Fix, type Spot } from "../look/where";

const NAVY = "#1B2A4A";
// The white strip the Call 911 button sits on. It stays at the top of the screen when the page is taller than the
// phone, as wide as the screen, so what scrolls under it never shows beside the button.
const PLATE: CSSProperties = { position: "sticky", top: "0", zIndex: "2", margin: "0 -20px", padding: "4px 20px 12px", background: "linear-gradient(#FFFFFF calc(100% - 12px), rgba(255, 255, 255, 0))" };
const CALL: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: "14px", minHeight: "104px", borderRadius: "18px", background: "#D92D20", color: "#FFFFFF", textDecoration: "none", fontSize: "34px", fontWeight: "800", letterSpacing: "-0.01em", boxShadow: "0 10px 24px rgba(217, 45, 32, 0.22)" };
const PHONE = "M5.5 3.5h3l1.8 4.6-2.2 1.4a11 11 0 0 0 6.4 6.4l1.4-2.2 4.6 1.8v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3.5 5.7a2 2 0 0 1 2-2.2z";
const CARD: CSSProperties = { display: "flex", flexDirection: "column", gap: "12px", padding: "16px", borderRadius: "18px", border: "1.5px solid #D6CDBF", background: "#FAF6F0", color: "#1A1D21" };
const HEADING: CSSProperties = { margin: "0", fontSize: "22px", fontWeight: "700", lineHeight: "1.25", textWrap: "balance" };
const HINTS: CSSProperties = { listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" };
const HINT: CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", fontSize: "16px", fontWeight: "600", lineHeight: "1.25", textAlign: "center", textWrap: "balance" };
const LINE: CSSProperties = { margin: "0", fontSize: "18px", lineHeight: "1.4", textWrap: "balance" };

const hint = (children: ReactNode) => (
  <svg className="ic" width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" style={{ color: NAVY }}>
    {children}
  </svg>
);
// What 911 will also ask, each with a small drawing: an eye, a person, a phone.
const ALSO: [StringKey, ReactNode][] = [
  ["emergency.ask.see", hint(<><path d="M2.5 12c2.6-4.4 5.8-6.6 9.5-6.6s6.9 2.2 9.5 6.6c-2.6 4.4-5.8 6.6-9.5 6.6S5.1 16.4 2.5 12z" /><circle cx="12" cy="12" r="3" /></>)],
  ["emergency.ask.danger", hint(<><circle cx="12" cy="7.5" r="3.5" /><path d="M5 20.5c.6-4 3.2-6 7-6s6.4 2 7 6" /></>)],
  ["emergency.ask.phone", hint(<path d={PHONE} />)],
];
// Where the card's words come from: New Brunswick's own 911 page, and the day it was read.
const ABOUT: AboutWords = { label: "emergency.about", body: "emergency.about.body", source: "emergency.about.source", url: "emergency.about.source.url" };

export function Emergency() {
  const { lang } = useApp();
  const t = useT();
  const title = useTitleFocus();
  // The button comes up where the top of an answer was on the question before: a double tap there must not dial. For
  // the screen's first moments it takes no tap, as the answers do; opened by its address, it takes one at once.
  const settled = useSettled(false);
  useEffect(() => {
    document.body.classList.add("emergency");
    return () => document.body.classList.remove("emergency");
  }, []);

  return (
    <div className="emergency" style={{ display: "contents" }}>
      <Screen style={{ background: "#FFFFFF", overflow: "visible" }}>
        {/* Back is the screen the person came from, whichever question that was. Opened directly (a link or bookmark),
            there is none: the link goes to the first question. */}
        <TopBar back={-1} direct="/q1" listen={emergencyVoice(lang)} words />
        <main className="emergency-main" style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "16px", padding: "0 20px 24px" }}>
          {/* The screen's title, for a screen reader (it takes the focus, so the reader says where the tap led): the
              button under it says the same to the eye. */}
          <h1 ref={title} tabIndex={-1} className="sr-only">{t("emergency.title")}</h1>
          <div style={PLATE}>
            <a href="tel:911" className="emergency-call press" onClick={(event) => { if (!settled) event.preventDefault(); }} style={CALL}>
              <svg className="ic" width="36" height="36" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: "2.4" }}><path d={PHONE} /></svg>
              {t("emergency.call")}
            </a>
          </div>
          <section aria-labelledby="ask-h" className="emergency-card" style={CARD}>
            <h2 id="ask-h" style={HEADING}>{t("emergency.ask.first")}</h2>
            <Where />
          </section>
          <section aria-labelledby="also-h" className="emergency-also" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "0 4px" }}>
            <h2 id="also-h" style={{ ...HEADING, fontSize: "18px" }}>{t("emergency.ask.also")}</h2>
            <ul style={HINTS}>
              {ALSO.map(([words, drawing]) => (
                <li key={words} style={HINT}>{drawing}{t(words)}</li>
              ))}
            </ul>
          </section>
          <p className="emergency-close" style={{ ...LINE, display: "flex", alignItems: "center", gap: "10px", padding: "0 4px", fontWeight: "600" }}>
            <FlameIcon size={28} style={{ color: NAVY }} />
            <span>{t("emergency.close")}</span>
          </p>
          <p className="emergency-lead" style={{ ...LINE, padding: "0 4px" }}>{t("emergency.lead")}</p>
          <Link to="/leave" style={{ alignSelf: "flex-start", minHeight: "56px", display: "flex", alignItems: "center", gap: "6px", padding: "0 4px", fontSize: "18px", fontWeight: "700", lineHeight: "1.3" }}>
            <span style={{ textWrap: "balance" }}>{t("leave.entry")}</span>
            <ChevronRightIcon size={20} />
          </Link>
          <About words={ABOUT} />
        </main>
      </Screen>
    </div>
  );
}

/** How long the phone has to answer. */
const GPS_TIMEOUT_MS = 8000;

const PLAIN: CSSProperties = { display: "flex", flexDirection: "column", gap: "10px" };
// Room for the place, both coordinate lines and the button from the start: nothing under the card moves when the
// position arrives or is refused.
const BOX: CSSProperties = { ...PLAIN, minHeight: "168px" };
// The place in large type: it is the first thing to say.
const NAME: CSSProperties = { margin: "0", fontSize: "26px", fontWeight: "800", lineHeight: "1.2", letterSpacing: "-0.01em" };
// Beneath it, with digits of one width, each line whole: they are read aloud, one figure at a time.
const COORDS: CSSProperties = { margin: "0", display: "flex", flexDirection: "column", fontSize: "20px", fontWeight: "700", lineHeight: "1.3", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const OFF: CSSProperties = { margin: "0", fontSize: "18px", fontWeight: "600", lineHeight: "1.4" };
const PIN: CSSProperties = { alignSelf: "center", display: "flex", color: "#8A8F98" };
// Outlined navy, as Listen: the red Call 911 button stays the one thing to tap on this screen.
const SHOW: CSSProperties = { minHeight: "56px", padding: "6px 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", borderRadius: "14px", border: "2px solid #1B2A4A", background: "#FFFFFF", color: "#1B2A4A", fontFamily: "inherit", fontSize: "18px", fontWeight: "700", lineHeight: "1.2", textAlign: "center", cursor: "pointer" };
const HEAR: CSSProperties = { borderRadius: "14px", marginLeft: "auto" };

/**
 * Where the phone is, under "Where are you?": the nearest community and the coordinates, to read to the dispatcher.
 * Asked of the phone on a tap only, never by itself, and shown while the position is fresh (ten minutes); one already
 * shared this session shows without a tap. A town typed in live mode is shown by its name; a replay town never is.
 * Refused, timed out or too coarse to say anything: "not available" (an earlier position goes too), and the screen
 * stays as it is. "Hear it" says what is shown, with a voice that works on the phone and no other: where there is
 * none, there is no such button. Nothing here touches the Call 911 button.
 */
function Where() {
  const { mode, lang, place, shared, setShared } = useApp();
  const t = useT();
  const [can] = useState(() => "geolocation" in navigator);
  const [step, setStep] = useState<"tap" | "locating" | "off">("tap");
  // The last request gave nothing to show; it stays so until one succeeds.
  const [failed, setFailed] = useState(false);
  // The button sits where an answer was on the question before: a double tap there must not ask the phone.
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
  // What "Hear it" says: the place, then each coordinate line.
  const aloud = [...(name ? [name] : []), ...(coords ?? [])];

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
      {aloud.length > 0 && (
        // Close under the name: one thing to read, top to bottom, with "Hear it" beside the coordinates.
        <div className="where-read" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px", marginTop: name ? "-4px" : undefined }}>
          {coords && (
            <p className="where-coords" style={COORDS}>
              <span>{coords[0]}</span>
              <span>{coords[1]}</span>
            </p>
          )}
          <ListenButton sentences={aloud} text={t("emergency.hear")} hiddenWithoutVoice style={HEAR} />
        </div>
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
