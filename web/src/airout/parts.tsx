// "Best time to air out your home": its mark, its tile on the verdict screen, and the 48-hour strip of its own screen.
import { useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon } from "../components/icons";
import { ECCC_COLOURS, pattern, type AirOutView, type Bar } from "./view";

const NAVY = "#1B2A4A";
const CARD: CSSProperties = { background: "#FFFFFF", borderRadius: "18px", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)" };

// Path data from Lucide "sun" and "moon" (ISC licence).
const SUN = (
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </>
);
const MOON = <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />;
// A window of four panes on its sill: with air moving beside it, or alone and shut.
const WINDOW_OPEN = (
  <>
    <path d="M2.5 4h10.5v12.5H2.5z" />
    <path d="M7.75 4v12.5" />
    <path d="M2.5 10.25h10.5" />
    <path d="M1 20.5h13.5" />
    <path d="M16.5 7.5c1.7-1.4 3.1 1.4 5.2 0" />
    <path d="M16.5 12c1.7-1.4 3.1 1.4 5.2 0" />
    <path d="M16.5 16.5c1.7-1.4 3.1 1.4 5.2 0" />
  </>
);
const WINDOW_SHUT = (
  <>
    <path d="M5 3.5h14v14H5z" />
    <path d="M12 3.5v14" />
    <path d="M5 10.5h14" />
    <path d="M2.5 21.5h19" />
  </>
);

const icon = (size: number, children: React.ReactNode, strokeWidth = "2") => (
  <svg className="ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth }}>{children}</svg>
);

/**
 * The answer's mark, told by shape as well as by its words: an open window in a filled circle (a best time), a shut
 * window in a filled square (keep windows closed), a window in a dashed circle (not available, as a badge that was not
 * checked).
 */
export function AirOutMark({ state, size }: { state: AirOutView["state"]; size: number }) {
  const shape: CSSProperties =
    state === "window"
      ? { borderRadius: "50%", background: NAVY, color: "#FFFFFF", border: `2px solid ${NAVY}` }
      : state === "none"
        ? { borderRadius: "22%", background: NAVY, color: "#FFFFFF", border: `2px solid ${NAVY}` }
        : { borderRadius: "50%", background: "#FFFFFF", color: NAVY, border: `2px dashed ${NAVY}` };
  return (
    <span className="airout-mark" data-state={state} style={{ flexShrink: "0", width: `${size}px`, height: `${size}px`, display: "flex", alignItems: "center", justifyContent: "center", ...shape }}>
      {icon(Math.round(size * 0.56), state === "window" ? WINDOW_OPEN : WINDOW_SHUT)}
    </span>
  );
}

/** On the verdict screen: the one answer, and a tap to its screen. */
export function AirOutTile({ view }: { view: AirOutView }) {
  return (
    <Link to="/air-out" className="airout-tile press" data-state={view.state} style={{ ...CARD, minHeight: "72px", display: "flex", alignItems: "center", gap: "14px", padding: "12px 14px 12px 16px", color: "#1A1D21", textDecoration: "none" }}>
      <AirOutMark state={view.state} size={44} />
      <span style={{ flexGrow: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
        <span style={{ fontSize: "18px", lineHeight: "1.3" }}>{view.label}</span>
        <span style={{ fontSize: "22px", fontWeight: "700", lineHeight: "1.2", textWrap: "balance" }}>{view.answer}</span>
      </span>
      <ChevronRightIcon size={24} style={{ color: NAVY }} />
    </Link>
  );
}

// A bar is one hour: ECCC's colour for its class, its height and its pattern rising with it. Level 0 is a low hollow
// box: an hour the forecast covers, with no smoke in it.
const BAR_STEP = 5;
const barHeight = (level: number) => (level === 0 ? 6 : 14 + (level - 1) * BAR_STEP);
// The pattern's ink: dark on ECCC's light colours, white on its dark ones.
const DARK_FILL = new Set([3, 9, 10, 11]);

/** `height`: in the legend, where a bar is a small sample of itself. */
function StripBar({ bar, height = barHeight(bar.level) }: { bar: Bar; height?: number }) {
  const style = { height: `${height}px`, ...(bar.level > 0 ? { backgroundColor: ECCC_COLOURS[bar.level - 1], "--ink": DARK_FILL.has(bar.level) ? "rgba(255, 255, 255, 0.85)" : "rgba(26, 29, 33, 0.62)" } : {}) };
  return <span className="strip-bar" data-level={bar.level} data-pattern={pattern(bar.level)} data-best={bar.best || undefined} style={style as CSSProperties} />;
}

/**
 * The strip: one row for each day, 24 clock hours across, so the same hour sits in the same place on every row. Over
 * the bars, a band says day or night with a sun or a moon; around the best time's bars, an outline. The whole is one
 * picture to a screen reader, named by `aria`; the list under it says the same hour by hour, in words.
 */
export function Strip({ strip }: { strip: NonNullable<AirOutView["strip"]> }) {
  const [list, setList] = useState(false);
  const swatch: CSSProperties = { flexShrink: "0", width: "30px", height: "30px", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "2px", borderBottom: "2px solid #1A1D21" };
  const item: CSSProperties = { display: "flex", alignItems: "center", gap: "10px", fontSize: "18px", lineHeight: "1.3" };
  return (
    <section aria-labelledby="strip-h" className="strip-card" style={{ ...CARD, padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <h2 id="strip-h" style={{ margin: "0", fontSize: "22px", fontWeight: "700", lineHeight: "1.25" }}>{strip.title}</h2>
      <div role="img" aria-label={strip.aria} className="strip" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {strip.rows.map((row) => (
          <div key={row.name} className="strip-day" aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "18px", fontWeight: "700", lineHeight: "1.2" }}>{row.name}</span>
            <div className="strip-row">
              {row.sky.map((stretch) => (
                <span key={stretch.from} className="strip-sky" data-sky={stretch.day ? "day" : "night"} style={{ gridColumn: `${stretch.from + 1} / ${stretch.to + 2}` }}>
                  {/* A stretch of one hour has no room for its picture: its band still tells it. */}
                  {stretch.to > stretch.from && icon(20, stretch.day ? SUN : MOON, "2.2")}
                </span>
              ))}
              {row.cells.map((bars, hour) => (
                <span key={hour} className="strip-cell" data-hour={hour} data-empty={bars.length === 0 || undefined} style={{ gridColumn: `${hour + 1}` }}>
                  {bars.map((bar, i) => <StripBar key={i} bar={bar} />)}
                </span>
              ))}
              {row.best && <span className="strip-best" style={{ gridColumn: `${row.best.from + 1} / ${row.best.to + 2}` }} />}
              {strip.ticks.map((tick) => (
                <span key={tick.hour} className="strip-tick" data-noon={tick.hour === 12 || undefined} style={{ gridColumn: `${tick.hour - 2} / span 6` }}>{tick.label}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <ul className="strip-legend" style={{ listStyle: "none", margin: "0", padding: "0", display: "flex", flexWrap: "wrap", gap: "10px 20px" }}>
        <li style={item}>
          <span style={swatch}><StripBar bar={{ level: 0, best: false }} /></span>
          {strip.legend.none}
        </li>
        <li style={item}>
          <span style={swatch}>{[1, 5, 9].map((level, i) => <StripBar key={level} bar={{ level, best: false }} height={10 + i * 8} />)}</span>
          {strip.legend.more}
        </li>
        {strip.legend.best && (
          <li style={item}>
            <span style={{ flexShrink: "0", width: "30px", height: "30px", border: `3px solid ${NAVY}`, borderRadius: "10px", background: "rgba(27, 42, 74, 0.09)" }} />
            {strip.legend.best}
          </li>
        )}
        <li style={item}>
          <span className="strip-sky" data-sky="day" style={{ flexShrink: "0", width: "30px" }}>{icon(20, SUN, "2.2")}</span>
          {strip.legend.day}
        </li>
        <li style={item}>
          <span className="strip-sky" data-sky="night" style={{ flexShrink: "0", width: "30px" }}>{icon(20, MOON, "2.2")}</span>
          {strip.legend.night}
        </li>
      </ul>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {strip.by.map((line, i) => (
          <p key={i} style={{ margin: "0", fontSize: "18px", lineHeight: "1.45", fontWeight: i === 0 ? "700" : "400", color: i === 0 ? "#1A1D21" : "#4F5561", textWrap: "pretty" }}>{line}</p>
        ))}
      </div>
      <button type="button" onClick={() => setList(!list)} aria-expanded={list} aria-controls="strip-list" style={{ margin: "0 -20px -20px", width: "calc(100% + 40px)", minHeight: "60px", padding: "0 20px", border: "0", borderTop: "1px solid #EEE7DC", background: "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", fontFamily: "inherit", fontSize: "18px", fontWeight: "700", color: NAVY, textAlign: "left", cursor: "pointer" }}>
        <span style={{ textWrap: "balance" }}>{list ? strip.list.hide : strip.list.show}</span>
        {list ? <ChevronUpIcon size={24} /> : <ChevronDownIcon size={24} />}
      </button>
      {list && (
        <div id="strip-list" style={{ paddingTop: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <ul style={{ margin: "0", padding: "0 0 0 22px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "18px", lineHeight: "1.45" }}>
            {strip.list.items.map((text, i) => <li key={i}>{text}</li>)}
          </ul>
          <p style={{ margin: "0", fontSize: "18px", lineHeight: "1.45", color: "#4F5561", textWrap: "pretty" }}>{strip.list.numbers}</p>
        </div>
      )}
    </section>
  );
}
