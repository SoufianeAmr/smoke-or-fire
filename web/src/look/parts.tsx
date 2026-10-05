// What the three questions share: answers that ignore a tap in the screen's first moments, the three-dot progress
// mark, "About these questions" (a small info button), and the question taking the focus when it follows another screen.
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { useT } from "../app/state";
import type { StringKey } from "../i18n";
import { CLEAR_OF_BAR } from "../components/Sticky911";
import { ExternalIcon, InfoIcon } from "../components/icons";

export const MAIN: CSSProperties = { flexGrow: "1", display: "flex", flexDirection: "column", gap: "16px", padding: `8px 16px ${CLEAR_OF_BAR}` };
// The question has the focus after a tap on the screen before: it shows no ring of its own.
export const TITLE: CSSProperties = { margin: "0", padding: "0 4px", fontSize: "34px", fontWeight: "800", lineHeight: "1.12", letterSpacing: "-0.02em", textWrap: "balance", outline: "none" };
// Two tiles across; every row as tall as the tallest, so all the tiles are one size.
export const GRID: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gridAutoRows: "1fr", gap: "12px" };
export const TILE: CSSProperties = { display: "flex", flexDirection: "column", borderRadius: "18px", background: "#FFFFFF", border: "3px solid #1B2A4A", color: "#1B2A4A", textDecoration: "none", overflow: "hidden" };
// A tile with an icon above its words, both in the middle.
export const ICON_TILE: CSSProperties = { ...TILE, alignItems: "center", justifyContent: "center" };
export const TILE_LABEL: CSSProperties = { fontSize: "18px", fontWeight: "700", lineHeight: "1.25", textAlign: "center", textWrap: "balance" };

/** The same words, with each short hyphenated one kept on one line: "peut-être", "Est-ce" and "N.-B." are never cut at
 *  the hyphen. A long one (a place name such as Saint-Jean-Baptiste-de-Restigouche) still wraps, or it would not fit. */
export const whole = (text: string) =>
  text.split(/(\S+-\S+)/).map((part, i) => (i % 2 && part.length <= 12 ? <span key={i} style={{ whiteSpace: "nowrap" }}>{part}</span> : part));

// A double tap's second tap lands on the next screen, where what is under the finger is something else: for a moment
// after a screen appears, its answers take no tap.
export const GUARD_MS = 400;
const Ready = createContext(true);

/** False for the first moment after the screen appears (always, or only when it follows another screen), then true. */
export function useSettled(always = true) {
  const inApp = useLocation().key !== "default";
  const [settled, setSettled] = useState(!always && !inApp);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), GUARD_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return settled;
}

/** The answers to the question on screen, as a group named by it. `data-ready` says when they take taps. */
export function Answers({ style, children }: { style: CSSProperties; children: ReactNode }) {
  const ready = useSettled();
  return (
    <Ready.Provider value={ready}>
      <div className="look-answers" role="group" aria-labelledby="look-q" data-ready={ready} style={style}>
        {children}
      </div>
    </Ready.Provider>
  );
}

// Scrolled into view by Tab or a screen reader, an answer keeps its focus ring clear of the 911 bar.
const ANSWER: CSSProperties = { scrollMargin: "8px" };

/** One answer: a link to the screen it leads to. Nothing about the tap is kept: the address says where, not why. */
export function Answer({ answer, to, shape, style, children }: { answer: string; to: string; shape: "row" | "tile"; style: CSSProperties; children: ReactNode }) {
  const ready = useContext(Ready);
  return (
    <Link to={to} className={`press look-answer look-${shape}`} data-answer={answer} onClick={(event) => { if (!ready) event.preventDefault(); }} style={{ ...ANSWER, ...style }}>
      {children}
    </Link>
  );
}

// Small, and drawn into the blank right of the Back arrow: the bar also holds Listen and the language. It takes no tap: where
// it sits over the edge of the Back link, the tap is Back's.
const STEPS: CSSProperties = { flexShrink: "0", display: "flex", alignItems: "center", gap: "5px", margin: "0 auto 0 -10px", pointerEvents: "none" };
const DOT: CSSProperties = { width: "8px", height: "8px", borderRadius: "999px", border: "2px solid #1B2A4A" };
const CURRENT: CSSProperties = { ...DOT, width: "20px", background: "#1B2A4A" };

/** Which of the three questions this is: three dots in the top bar, the current one a wider filled pill. No words. */
export function Steps({ n }: { n: 1 | 2 | 3 }) {
  const t = useT();
  return (
    <span className="look-steps" role="img" aria-label={t("look.step", { n })} style={STEPS}>
      {[1, 2, 3].map((dot) => (
        <span key={dot} className="look-dot" data-current={dot === n ? "true" : undefined} style={dot === n ? CURRENT : DOT} />
      ))}
    </span>
  );
}

/** For a screen's h1 (the three questions and the two screens they end on): it takes the focus when the screen follows
 *  another one, so a screen reader says where the tap led. Not when the app opens on it. */
export function useTitleFocus() {
  const title = useRef<HTMLHeadingElement>(null);
  const inApp = useLocation().key !== "default";
  useEffect(() => {
    if (inApp) title.current?.focus({ preventScroll: true });
  }, [inApp]);
  return title;
}

const SMALL: CSSProperties = { fontSize: "16px", lineHeight: "1.45", color: "#1B2A4A" };
// A small button, not a text link: an "i" and its words in a navy outline, 48 px tall. It is there to read, not to act
// on, so it is the one thing to tap on these screens that is under 56 px.
const INFO: CSSProperties = { ...SMALL, display: "flex", alignItems: "center", gap: "8px", minHeight: "48px", padding: "4px 16px 4px 12px", border: "1.5px solid #1B2A4A", borderRadius: "999px", background: "transparent", fontFamily: "inherit", fontWeight: "600", lineHeight: "1.25", textAlign: "left", cursor: "pointer" };
// A source: a row to tap, 56 px or more, with the mark of a page that opens outside the app.
const SOURCE: CSSProperties = { ...SMALL, display: "flex", alignItems: "center", gap: "10px", minHeight: "56px", marginTop: "8px", padding: "8px 14px", border: "1.5px solid #1B2A4A", borderRadius: "14px", background: "#FFFFFF", fontWeight: "600", lineHeight: "1.3", textDecoration: "none" };

/** The words of an "About" note: its button, its line, and each source with the source's address. */
export type AboutWords = { label: StringKey; body: StringKey; sources: [words: StringKey, url: StringKey][] };
const QUESTIONS: AboutWords = { label: "look.about", body: "look.about.body", sources: [["look.about.source", "look.about.source.url"]] };

/** "About these questions": where they come from, closed until asked for. Opened, it scrolls clear of the 911 bar.
 *  `words`: another screen's own note, made the same way ("About this card"). */
export function About({ words = QUESTIONS }: { words?: AboutWords }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const text = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) text.current?.scrollIntoView({ block: "nearest" });
  }, [open]);
  return (
    <div className="look-about" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "8px", padding: "0 4px" }}>
      <button type="button" className="look-about-toggle" aria-expanded={open} aria-controls="look-about-text" onClick={() => setOpen(!open)} style={INFO}>
        <InfoIcon size={22} />
        {t(words.label)}
      </button>
      {/* No display here: it would show the text while it is hidden. */}
      <div id="look-about-text" ref={text} hidden={!open}>
        <p style={{ ...SMALL, margin: "0", color: "#1A1D21" }}>{t(words.body)}</p>
        {words.sources.map(([source, url]) => (
          <a key={source} href={t(url)} target="_blank" rel="noopener noreferrer" className="look-about-source" style={SOURCE}>
            <ExternalIcon size={20} />
            <span>{t(source)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
