// Cards below the map on screens 7a–7d (design/screens/07*.html).
import { useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, PhoneIcon } from "../components/icons";
import type { Confidence } from "./types";
import type { AreaWide, VerdictView } from "./view";

const CARD: CSSProperties = { background: "#FFFFFF", borderRadius: "18px", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)" };
const BODY: CSSProperties = { margin: "0", fontSize: "18px", lineHeight: "1.45" };

// "This is an area-wide reading. …", on unexplained verdicts (7b, 7d).
function AreaWideNote({ note }: { note: AreaWide }) {
  return (
    <p style={{ margin: "0", padding: "14px 16px", borderRadius: "14px", background: "#F3EEE6", fontSize: "18px", lineHeight: "1.45" }}>
      <strong>{note.lead}</strong> {note.text}
    </p>
  );
}

// Confidence chip icons: three bars, filled up to the level (7a high, 7b medium, 7c low).
const BARS: Record<Confidence, [boolean, boolean, boolean]> = { high: [true, true, true], medium: [true, true, false], low: [true, false, false] };

export function ConfidenceCard({ view }: { view: VerdictView }) {
  const [one, two, three] = BARS[view.confidence.level];
  return (
    <section aria-labelledby="conf-h" style={{ ...CARD, padding: "20px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "12px" }}>
      <span id="conf-h" style={{ display: "flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 16px 0 12px", borderRadius: "999px", background: "#E9EDF5", color: "#1B2A4A", fontSize: "18px", fontWeight: "700" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          {one && <rect x="3" y="14" width="4.5" height="7" rx="1" style={{ fill: "currentColor" }} />}
          {two ? <rect x="9.75" y="9" width="4.5" height="12" rx="1" style={{ fill: "currentColor" }} /> : <rect x="10.45" y="9.7" width="3.1" height="10.6" rx="0.8" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.5" }} />}
          {three ? <rect x="16.5" y="4" width="4.5" height="17" rx="1" style={{ fill: "currentColor" }} /> : <rect x="17.2" y="4.7" width="3.1" height="15.6" rx="0.8" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.5" }} />}
        </svg>
        {view.confidence.chip}
      </span>
      <p style={{ ...BODY, textWrap: "pretty" }}>{view.confidence.text}</p>
    </section>
  );
}

const WIND_ICON = (
  <>
    <path d="M3 8h10a3 3 0 1 0-3-3" />
    <path d="M3 12h15a3 3 0 1 1-3 3" />
    <path d="M3 16h7" />
  </>
);
const WARNING_ICON = (
  <>
    <path d="M12 3.5L2.5 20h19L12 3.5z" />
    <path d="M12 10v4.5" />
    <path d="M12 17.3h.01" />
  </>
);
export const VERDICT_ICONS = { wind: WIND_ICON, warning: WARNING_ICON };

export function TwoPossibilitiesCard({ view }: { view: VerdictView }) {
  const two = view.twoPossibilities!;
  const box: CSSProperties = { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "10px", padding: "16px", borderRadius: "14px", border: "1.5px solid #E6DFD3" };
  const chip = (background: string, color: string): CSSProperties => ({ display: "flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 14px 0 10px", borderRadius: "999px", background, color, fontSize: "18px", fontWeight: "700" });
  return (
    <section aria-labelledby="poss-h" style={{ ...CARD, padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <h2 id="poss-h" style={{ margin: "0", fontSize: "22px", fontWeight: "700" }}>{two.title}</h2>
      <div style={box}>
        <span style={chip("#E8590C", "#1A1D21")}>
          <svg className="ic" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: "2.3" }}>{WIND_ICON}</svg>
          {two.driftingChip}
        </span>
        <p style={BODY}><strong>{two.driftingLead}</strong> {two.driftingText}</p>
      </div>
      <div style={box}>
        <span style={chip("#D92D20", "#FFFFFF")}>
          <svg className="ic" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: "2.3" }}>{WARNING_ICON}</svg>
          {two.unexplainedChip}
        </span>
        <p style={BODY}><strong>{two.unexplainedLead}</strong> {two.unexplainedText}</p>
      </div>
      <p style={{ ...BODY, fontWeight: "700" }}>{two.lookOutside}</p>
    </section>
  );
}

export function WhatToDoCard({ view }: { view: VerdictView }) {
  const [open, setOpen] = useState(false);
  const todo = view.todo;
  const nurse = (
    <a href="tel:811" style={{ alignSelf: "flex-start", minHeight: "56px", display: "flex", alignItems: "center", gap: "10px", fontSize: "18px", fontWeight: "700", lineHeight: "1.3", color: "#1B2A4A" }}>
      <PhoneIcon size={22} />
      <span>{todo.nurse}</span>
    </a>
  );
  return (
    <section aria-labelledby="todo-h" style={{ ...CARD, padding: todo.kind === "advice" ? "20px 20px 0" : "20px", display: "flex", flexDirection: "column", gap: "8px", overflow: "hidden" }}>
      <h2 id="todo-h" style={{ margin: "0", fontSize: "22px", fontWeight: "700" }}>{todo.title}</h2>
      <p style={BODY}>{todo.general}</p>
      {todo.kind === "advice" ? (
        <>
          <p style={{ margin: "0", fontSize: "16px", lineHeight: "1.4", color: "#4F5561" }}>{todo.official}</p>
          {todo.areaWide && <AreaWideNote note={todo.areaWide} />}
          {nurse}
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="groups" style={{ margin: "8px -20px 0", width: "calc(100% + 40px)", minHeight: "60px", padding: "0 20px", border: "0", borderTop: "1px solid #EEE7DC", background: "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", fontFamily: "inherit", fontSize: "18px", fontWeight: "700", color: "#1B2A4A", textAlign: "left", cursor: "pointer" }}>
            <span style={{ textWrap: "balance" }}>{todo.groupsLabel}</span>
            {open ? <ChevronUpIcon size={24} /> : <ChevronDownIcon size={24} />}
          </button>
          {open && (
            <div id="groups" style={{ padding: "4px 0 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <p style={BODY}>{todo.atRisk}</p>
              <p style={BODY}><strong>{todo.higherRiskLead}</strong> {todo.higherRisk}</p>
              <p style={{ margin: "0", fontSize: "16px", lineHeight: "1.45", color: "#4F5561" }}>{todo.doctor}</p>
            </div>
          )}
        </>
      ) : (
        <>
          <a href={todo.linkUrl} className="press" style={{ display: "flex", alignItems: "center", gap: "14px", minHeight: "64px", padding: "10px 18px", borderRadius: "18px", background: "#FFFFFF", color: "#1A1D21", textDecoration: "none", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)" }}>
            <span style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "18px", fontWeight: "700" }}>{todo.linkText}</span>
              <span style={{ fontSize: "16px", color: "#4F5561" }}>{todo.linkHost}</span>
            </span>
            <svg className="ic" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ color: "#1B2A4A" }}>
              <path d="M14 4h6v6" />
              <path d="M20 4l-9 9" />
              <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
            </svg>
          </a>
          {nurse}
        </>
      )}
    </section>
  );
}

export function AirQualityCard({ view }: { view: VerdictView }) {
  const aq = view.aqhi;
  return (
    <section aria-labelledby="aqhi-h" style={{ ...CARD, padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px" }}>
        <h2 id="aqhi-h" style={{ margin: "0", fontSize: "22px", fontWeight: "700" }}>{aq.title}</h2>
        <span style={{ fontSize: "16px", color: "#4F5561" }}>{aq.station}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <span style={{ flexShrink: "0", width: "72px", height: "72px", borderRadius: "18px", background: "#1B2A4A", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: aq.display.length > 2 ? "34px" : "42px", fontWeight: "800" }}>{aq.display}</span>
        <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "22px", fontWeight: "700" }}>
            <svg className="ic" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 18a8 8 0 1 1 16 0" />
              {aq.needle && <path d={aq.needle} />}
            </svg>
            {aq.risk}
          </span>
          <span style={{ fontSize: "16px", color: "#4F5561" }}>{aq.scale}</span>
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(11, minmax(0, 1fr))", gap: "4px" }}>
          {Array.from({ length: 11 }, (_, i) => (
            <span key={i} style={{ height: "12px", borderRadius: "4px", background: i < aq.segments ? "#1B2A4A" : "#E6E0D6" }} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "16px", color: "#4F5561" }}>
          <span>{aq.scaleLow}</span>
          <span>{aq.scaleHigh}</span>
        </div>
      </div>
      {aq.areaWide && <AreaWideNote note={aq.areaWide} />}
      <p style={{ margin: "0", fontSize: "16px", color: "#4F5561" }}>{aq.source}</p>
    </section>
  );
}

export function WhyCard({ view }: { view: VerdictView }) {
  const [open, setOpen] = useState(false);
  return (
    <section style={{ ...CARD, overflow: "hidden" }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="why-body" style={{ width: "100%", minHeight: "72px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "0 20px", border: "0", background: "transparent", fontFamily: "inherit", fontSize: "22px", fontWeight: "700", color: "#1A1D21", cursor: "pointer", textAlign: "left" }}>
        {view.why.title}
        {open ? <ChevronUpIcon size={26} /> : <ChevronDownIcon size={26} />}
      </button>
      {open && (
        <div id="why-body" style={{ padding: "0 20px 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <ol style={{ listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column", gap: "18px" }}>
            {view.why.items.map((item, i) => (
              <li key={i} style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                <span style={{ flexShrink: "0", width: "32px", height: "32px", borderRadius: "50%", background: "#1B2A4A", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "700" }}>{i + 1}</span>
                <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {item.title && <span style={{ fontSize: "18px", fontWeight: "700" }}>{item.title}</span>}
                  <span style={{ fontSize: "18px", lineHeight: "1.45" }}>{item.body}</span>
                  {item.detail && <span style={{ fontSize: "18px", lineHeight: "1.45", marginTop: "4px" }}>{item.detail}</span>}
                </span>
              </li>
            ))}
          </ol>
          <Link to="/how-it-works" style={{ alignSelf: "flex-start", minHeight: "56px", display: "flex", alignItems: "center", gap: "6px", fontSize: "18px", fontWeight: "700", color: "#1B2A4A" }}>
            {view.why.howLink}
            <ChevronRightIcon size={20} />
          </Link>
        </div>
      )}
    </section>
  );
}
