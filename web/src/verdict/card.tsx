// The glance card on the verdict screen: a large icon in its own shape, the answer in one line, the source badges
// under it, and the "Why?" button that opens everything screens 7a–7d say.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BurnShape } from "../burn/Shape";
import { BellIcon, ChevronDownIcon, ChevronUpIcon, ExternalIcon, FlameIcon, SatelliteIcon, WindIcon } from "../components/icons";
import { GLANCE, type BadgeTone } from "./glance";
import type { Verdict } from "./types";
import type { Badge, VerdictView } from "./view";

const NBSP = String.fromCharCode(0xa0);
const NAVY = "#1B2A4A";

/** The state's icon in its own white shape: a circle (drifting), a diamond (unclear), a triangle (unexplained). */
export function GlanceShape({ state }: { state: Verdict }) {
  const { shape, mark } = GLANCE[state];
  const stroke: CSSProperties = { fill: "none", stroke: mark, strokeLinecap: "round", strokeLinejoin: "round" };
  return (
    <svg className="glance-shape" data-shape={shape} width="96" height="96" viewBox="0 0 96 96" aria-hidden="true" style={{ flexShrink: "0" }}>
      {shape === "circle" && (
        <>
          <circle cx="48" cy="48" r="46" style={{ fill: "#FFFFFF" }} />
          <g transform="translate(48 48) scale(2.3) translate(-12 -12)" style={{ ...stroke, strokeWidth: "2" }}>
            <path d="M3 8h10a3 3 0 1 0-3-3" />
            <path d="M3 12h15a3 3 0 1 1-3 3" />
            <path d="M3 16h7" />
          </g>
        </>
      )}
      {shape === "diamond" && (
        <>
          <rect x="15" y="15" width="66" height="66" rx="9" transform="rotate(45 48 48)" style={{ fill: "#FFFFFF" }} />
          <g transform="translate(48 48) scale(3.6) translate(-12 -12.2)" style={{ ...stroke, strokeWidth: "1.5" }}>
            <path d="M9.5 9.3a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.1 1-1.1 1.7v.6" />
            <path d="M12 17h.01" />
          </g>
        </>
      )}
      {shape === "triangle" && (
        <>
          <path d="M48 10 90 84H6Z" style={{ fill: "#FFFFFF", stroke: "#FFFFFF", strokeWidth: "10", strokeLinejoin: "round" }} />
          <path d="M48 36v24" style={{ ...stroke, strokeWidth: "8" }} />
          <path d="M48 74h.01" style={{ ...stroke, strokeWidth: "9" }} />
        </>
      )}
    </svg>
  );
}

/** Beside the distance: an arrow from the person toward the fire (up is north), named for a screen reader. */
function Arrow({ arrow }: { arrow: NonNullable<VerdictView["card"]["arrow"]> }) {
  return (
    <svg className="glance-arrow" role="img" aria-label={arrow.label} data-deg={arrow.deg} width="30" height="30" viewBox="-12 -12 24 24" style={{ verticalAlign: "-3px", transform: `rotate(${arrow.deg}deg)`, fill: "none", stroke: "currentColor", strokeWidth: "3.2", strokeLinecap: "round", strokeLinejoin: "round" }}>
      <path d="M0 9V-9" />
      <path d="M-6-3 0-9 6-3" />
    </svg>
  );
}

/** The line, as the screen's title. Each part stays whole where it fits: the line breaks at the dots first. It can take
 *  the focus (never by Tab): the verdict screen puts it there as it opens, so a screen reader starts with the answer. */
export function GlanceLine({ card }: { card: VerdictView["card"] }) {
  const last = card.parts.length - 1;
  return (
    <h1 id="verdict-h" className="glance-line" tabIndex={-1} style={{ margin: "14px 0 0", fontSize: "34px", fontWeight: "800", lineHeight: "1.14", letterSpacing: "-0.02em" }}>
      {card.parts.map((part, i) => (
        <span key={i}>
          <span className="glance-part" style={{ display: "inline-block" }}>
            {part}
            {/* A space before the arrow: a screen reader says "SSW", then the arrow's words. */}
            {i < last ? `${NBSP}·` : card.arrow && <>{NBSP}<Arrow arrow={card.arrow} /></>}
          </span>
          {i < last && " "}
        </span>
      ))}
    </h1>
  );
}

// A badge's state is told by its outline and by a word, never by colour alone: filled (active), outlined (none in
// effect), dashed (not checked). The word is in its name; on a small phone, where the name shows on a tap, it is the
// short word under the icon ("None", "Not checked").
const TONE: Record<BadgeTone, CSSProperties> = {
  active: { background: NAVY, color: "#FFFFFF", border: `2px solid ${NAVY}` },
  none: { background: "#FFFFFF", color: NAVY, border: `2px solid ${NAVY}` },
  notChecked: { background: "#FFFFFF", color: NAVY, border: `2px dashed ${NAVY}` },
  // The burn badge's own three (burn/badge.ts), as the burn card's status block: the two restrictions fill the pill.
  // "Permitted" is the app's one green: an outline, the flame and the word, on white. Never a fill.
  noBurn: { background: "#D92D20", color: "#FFFFFF", border: "2px solid #D92D20" },
  restricted: { background: "#F79009", color: "#1A1D21", border: "2px solid #F79009" },
  permitted: { background: "#FFFFFF", color: "#1E7B3A", border: "2px solid #1E7B3A" },
};
// Size, layout and type are in styles.css (.badge): one under the other with their names, or one row on a small phone.
const PILL: CSSProperties = { borderRadius: "28px", fontFamily: "inherit", fontWeight: "700", lineHeight: "1.25", cursor: "pointer" };
const ICONS: Record<Badge["icon"], (size: number) => ReactNode> = {
  satellite: (size) => <SatelliteIcon size={size} />,
  flame: (size) => <FlameIcon size={size} />,
  wind: (size) => <WindIcon size={size} />,
  bell: (size) => <BellIcon size={size} />,
  burn: (size) => <FlameIcon size={size} />, // the burn badge draws its state's own shape instead (below)
};
const SOURCE_LINK: CSSProperties = { minHeight: "56px", display: "flex", alignItems: "center", gap: "12px", padding: "8px 16px", borderRadius: "18px", border: `2px solid ${NAVY}`, color: NAVY, textDecoration: "none" };

/**
 * The badges. A tap on one shows its source, its time and its link; one is open at a time. On a tall phone they are one
 * under the other, each with its name. On a small one (styles.css) they share one row, an icon above one word, so all
 * three and "Why?" show above the 911 bar; the full name is still the button's name for a screen reader, and heads the
 * panel a tap opens.
 */
export function Badges({ badges, title }: { badges: Badge[]; title: string }) {
  const [open, setOpen] = useState<Badge["id"] | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Opened, the panel scrolls clear of the 911 bar. One taller than the room above the bar starts under its badge,
  // which stays in view (the panel's scroll margin, styles.css), and the page scrolls on to its end.
  useEffect(() => {
    const shown = panel.current;
    if (!open || !shown) return;
    shown.scrollIntoView({ block: "nearest" });
    // Where that leaves the panel's end out of sight, or its badge behind the sheet's handle (two rows of badges on a
    // narrow phone: a panel of the first row closing moves the second), the badge goes right under the handle, its
    // panel under it.
    const [sheet, tapped] = [shown.closest(".answer-sheet"), shown.previousElementSibling];
    const top = sheet?.querySelector(".sheet-top");
    if (!sheet || !tapped || !top) return;
    if (tapped.getBoundingClientRect().top < top.getBoundingClientRect().bottom || shown.getBoundingClientRect().bottom > sheet.getBoundingClientRect().bottom + 0.5) tapped.scrollIntoView({ block: "start" });
  }, [open]);
  return (
    <div className="badges" role="group" aria-label={title} data-count={badges.length}>
      {badges.map((badge) => (
        <div key={badge.id} className="badge-slot">
          {/* The name is given as the label too: the short word a small phone shows instead is not part of it. */}
          <button type="button" className="badge press" data-badge={badge.id} data-tone={badge.tone} data-burn={badge.burn} aria-label={badge.label} aria-expanded={open === badge.id} aria-controls={`badge-${badge.id}`} onClick={() => setOpen(open === badge.id ? null : badge.id)} style={{ ...PILL, ...TONE[badge.tone] }}>
            {badge.burn ? <BurnShape state={badge.burn} size={24} /> : ICONS[badge.icon](24)}
            <span className="badge-label">{badge.label}</span>
            <span className="badge-short">{badge.short}</span>
            <span className="badge-chevron">{open === badge.id ? <ChevronUpIcon size={22} /> : <ChevronDownIcon size={22} />}</span>
          </button>
          {/* No display here: it would show the panel while it is hidden. */}
          <div id={`badge-${badge.id}`} className="badge-panel" ref={open === badge.id ? panel : undefined} hidden={open !== badge.id}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "8px 0 4px", padding: "16px", borderRadius: "18px", background: "#FFFFFF", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)" }}>
              <div className="badge-name">{badge.label}</div>
              {/* The burn badge's panel opens on its state's shape, as its card does, and its word in the same ink. */}
              {badge.burn && <BurnShape state={badge.burn} size={40} />}
              {badge.lines.map((line, i) => (
                <p key={i} style={{ margin: "0", fontSize: i === badge.lines.length - 1 ? "16px" : "18px", fontWeight: i === 0 ? "700" : "400", lineHeight: "1.45", color: i === badge.lines.length - 1 ? "#4F5561" : i === 0 && badge.burn === "permitted" ? TONE.permitted.color : "#1A1D21", textWrap: "pretty" }}>{line}</p>
              ))}
              {badge.links.map((link) => (
                <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="press" style={SOURCE_LINK}>
                  <span style={{ flexGrow: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "18px", fontWeight: "700", lineHeight: "1.3" }}>{link.label}</span>
                    <span style={{ fontSize: "16px", color: "#4F5561", overflowWrap: "anywhere" }}>{link.host}</span>
                  </span>
                  <ExternalIcon size={22} />
                </a>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** "Why?": opens everything the verdict screen says, under it. Opened, it moves to the top of the screen. */
export function Why({ card, open, onToggle, children }: { card: VerdictView["card"]; open: boolean; onToggle: () => void; children: ReactNode }) {
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) toggle.current?.scrollIntoView({ block: "start" });
  }, [open]);
  return (
    <>
      <button type="button" ref={toggle} className="why-toggle press" aria-expanded={open} aria-controls="why-all" onClick={onToggle} style={{ width: "100%", minHeight: "64px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "0 20px", borderRadius: "18px", border: "0", background: "#FFFFFF", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)", fontFamily: "inherit", fontSize: "22px", fontWeight: "700", color: "#1A1D21", cursor: "pointer", textAlign: "left", scrollMargin: "8px" }}>
        {card.why}
        {open ? <ChevronUpIcon size={26} /> : <ChevronDownIcon size={26} />}
      </button>
      {/* No display here: it would show the answer while it is hidden. */}
      <div id="why-all" role="region" aria-label={card.answer} hidden={!open}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>{children}</div>
      </div>
    </>
  );
}

/** What the band of screens 7a–7d said, word for word, as the first block behind "Why?". */
export function AnswerInFull({ view }: { view: VerdictView }) {
  const look = GLANCE[view.card.state];
  return (
    <section aria-labelledby="answer-h" style={{ background: look.background, color: look.ink, borderRadius: "18px", padding: "20px", display: "flex", flexDirection: "column" }}>
      <p style={{ margin: "0", fontSize: "18px", fontWeight: "700", letterSpacing: "0.06em", lineHeight: "1.2" }}>{view.band.label}</p>
      <h2 id="answer-h" style={{ margin: "10px 0 0", fontSize: "28px", fontWeight: "800", lineHeight: "1.15", letterSpacing: "-0.02em", textWrap: "balance" }}>{view.band.headline}</h2>
      <p style={{ margin: "10px 0 0", fontSize: "18px", fontWeight: "500", lineHeight: "1.4", textWrap: "pretty" }}>{view.band.sub}</p>
    </section>
  );
}
