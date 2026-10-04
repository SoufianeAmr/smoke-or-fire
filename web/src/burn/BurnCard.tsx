// "Is burning allowed today?": the province's burn status for the person's county, on one small card under "Why?" on
// the verdict screen. Prevention, in one glance: a shape, a colour and a word; the time it is valid until; the town's
// own rules; three tips; Fire Watch. Shown in New Brunswick only. It never changes the verdict.
import { useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDownIcon, ChevronUpIcon, ExternalIcon } from "../components/icons";
import { ListenButton } from "../listen/ListenButton";
import { BurnShape } from "./Shape";
import { BURN_LOOK, type BurnTip, type BurnView } from "./view";

const NAVY = "#1B2A4A";
const CARD: CSSProperties = { background: "#FFFFFF", borderRadius: "18px", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)", padding: "20px", display: "flex", flexDirection: "column", gap: "12px" };
// Every word on the card is 18 px or more.
const BODY: CSSProperties = { margin: "0", fontSize: "18px", lineHeight: "1.45", textWrap: "pretty" };
const LINK: CSSProperties = { minHeight: "56px", display: "flex", alignItems: "center", gap: "12px", padding: "8px 16px", borderRadius: "18px", border: `2px solid ${NAVY}`, color: NAVY, textDecoration: "none" };

// A flame and a cigarette, each struck through; a drop of water.
const TIPS: Record<BurnTip, ReactNode> = {
  fire: (
    <>
      <path d="M12 20.5c3.3 0 5.5-2.2 5.5-5.3 0-2.5-1.5-4.5-2.9-5.9-.3 1.3-1 2.2-1.9 2.7.3-2.7-.9-5.3-3.2-7.5.2 2.9-1.3 4.6-2.5 6.2-1 1.3-1.7 2.7-1.7 4.5 0 3.1 2.2 5.3 5.5 5.3z" />
      <path d="M4 4l16 16" />
    </>
  ),
  drop: <path d="M12 3.5c3 3.6 5.5 6.7 5.5 10a5.5 5.5 0 0 1-11 0c0-3.3 2.5-6.4 5.5-10z" />,
  butt: (
    <>
      <path d="M2.5 13.5h15V17h-15z" />
      <path d="M6.5 13.5V17" />
      <path d="M20.5 13.5V17" />
      <path d="M17.5 10c0-2-1.8-2.2-1.8-4.2" />
      <path d="M4 4l16 16" />
    </>
  ),
};

function Out({ link }: { link: { label: string; host: string; url: string } }) {
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer" className="press" style={LINK}>
      <span style={{ flexGrow: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
        <span style={{ fontSize: "18px", fontWeight: "700", lineHeight: "1.3" }}>{link.label}</span>
        <span style={{ fontSize: "18px", lineHeight: "1.3", color: "#4F5561", overflowWrap: "anywhere" }}>{link.host}</span>
      </span>
      <ExternalIcon size={22} />
    </a>
  );
}

/** `view`: the screen's (burn/useBurn.ts), which the badge in the row is built from too. */
export function BurnCard({ view }: { view: BurnView }) {
  const [open, setOpen] = useState(false);
  const look = BURN_LOOK[view.state];
  return (
    <section className="burn" aria-labelledby="burn-h" data-state={view.state} data-reason={view.reason ?? undefined} style={CARD}>
      {/* The title and Listen share a line where there is room; at 200% zoom Listen goes under the title. */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px 12px" }}>
        <h2 id="burn-h" style={{ margin: "0", flex: "1 1 180px", fontSize: "22px", fontWeight: "700", lineHeight: "1.25", textWrap: "balance" }}>{view.title}</h2>
        <ListenButton sentences={view.voice} label={view.listen} />
      </div>
      {view.county && <p className="burn-county" style={{ ...BODY, fontWeight: "700", color: NAVY }}>{view.county}</p>}
      <div className="burn-status" style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 16px", borderRadius: "14px", background: look.fill, color: look.ink, border: look.border }}>
        <BurnShape state={view.state} />
        <p className="burn-word" style={{ margin: "0", fontSize: "22px", fontWeight: "800", lineHeight: "1.2", textWrap: "balance" }}>{view.word}</p>
      </div>
      <p className="burn-detail" style={BODY}>{view.detail}</p>
      {view.until && <p className="burn-until" style={BODY}>{view.until}</p>}
      <p className="burn-town" style={{ ...BODY, fontWeight: "700" }}>{view.town.text}</p>
      <Out link={view.town.link} />
      <h3 style={{ margin: "8px 0 0", fontSize: "18px", fontWeight: "700", lineHeight: "1.3" }}>{view.tipsTitle}</h3>
      {/* role="list": without bullets, some screen readers no longer say it is a list. */}
      <ul className="burn-tips" role="list" style={{ listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column", gap: "12px" }}>
        {view.tips.map((tip) => (
          <li key={tip.icon} data-tip={tip.icon} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ flexShrink: "0", width: "44px", height: "44px", borderRadius: "50%", background: "#F3EEE6", color: NAVY, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg className="ic" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">{TIPS[tip.icon]}</svg>
            </span>
            <span style={BODY}>{tip.text}</span>
          </li>
        ))}
      </ul>
      <Out link={view.fireWatch} />
      <button type="button" className="burn-sources-toggle" aria-expanded={open} aria-controls="burn-sources" onClick={() => setOpen(!open)} style={{ minHeight: "56px", margin: "0 -8px -8px", padding: "0 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", border: "0", borderRadius: "12px", background: "transparent", fontFamily: "inherit", fontSize: "18px", fontWeight: "700", color: NAVY, cursor: "pointer", textAlign: "left" }}>
        {view.sources.label}
        {open ? <ChevronUpIcon size={24} /> : <ChevronDownIcon size={24} />}
      </button>
      {/* No display here: it would show the sources while they are hidden. */}
      <div id="burn-sources" hidden={!open}>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingTop: "8px" }}>
          {view.sources.lines.map((line, i) => (
            <p key={i} style={BODY}>{line}</p>
          ))}
          {view.sources.links.map((link) => (
            <Out key={link.url} link={link} />
          ))}
        </div>
      </div>
    </section>
  );
}
