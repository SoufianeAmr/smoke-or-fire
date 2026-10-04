// Best time to air out your home: one answer from ECCC's FireWork smoke forecast, and under it the 48 hours it comes
// from. Opened from its tile on the verdict screen.
import type { CSSProperties } from "react";
import { Link, Navigate } from "react-router";
import { useApp } from "../app/state";
import { AirOutMark, Strip } from "../airout/parts";
import { airOutView } from "../airout/view";
import { ReplayBanner } from "../components/ReplayBanner";
import { Screen } from "../components/Screen";
import { CLEAR_OF_BAR, Sticky911 } from "../components/Sticky911";
import { TopBar } from "../components/TopBar";
import { ChevronRightIcon, ExternalIcon, HouseIcon } from "../components/icons";

const NAVY = "#1B2A4A";
const CARD: CSSProperties = { background: "#FFFFFF", borderRadius: "18px", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)" };
const BODY: CSSProperties = { margin: "0", fontSize: "18px", lineHeight: "1.45", textWrap: "pretty" };
const OUTLINED: CSSProperties = { minHeight: "56px", display: "flex", alignItems: "center", gap: "12px", padding: "8px 16px", borderRadius: "18px", border: `2px solid ${NAVY}`, color: NAVY, textDecoration: "none" };

// "Protect your home" (what to do at home while the windows stay closed) is a screen of its own, built on another
// branch (feat/protect: src/protect/Protect.tsx, at /protect). Its link shows here once that screen is in the app, and
// not before: never a link to nowhere. e2e/airout.spec.ts then checks that the link opens it.
const PROTECT = Object.keys(import.meta.glob("../protect/Protect.tsx")).length > 0 ? "/protect" : null;

export function AirOut() {
  const { result, lang } = useApp();
  if (!result) return <Navigate to="/" replace />;
  const view = airOutView(result, lang);

  return (
    <Screen>
      <ReplayBanner />
      {/* On a phone zoomed to 200% the bar's three controls go one under the other, each whole (styles.css). */}
      <div className="airout-top"><TopBar back={-1} listen={view.voice} /></div>
      {/* A long word breaks before it runs off a narrow screen (a phone zoomed to 200%). */}
      <main className="airout" data-state={view.state} style={{ display: "flex", flexDirection: "column", gap: "16px", padding: `8px 16px ${CLEAR_OF_BAR}`, overflowWrap: "break-word" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "0 4px" }}>
          <AirOutMark state={view.state} size={64} />
          {/* One title: what was asked, small, then the answer. */}
          <h1 aria-label={view.title} style={{ margin: "0", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "20px", fontWeight: "700", lineHeight: "1.3" }}>{view.label}</span>
            <span className="airout-answer" style={{ fontSize: "34px", fontWeight: "800", lineHeight: "1.14", letterSpacing: "-0.02em", textWrap: "balance" }}>{view.answer}</span>
          </h1>
          {view.lines.map((line, i) => <p key={i} style={{ ...BODY, fontSize: "20px" }}>{line}</p>)}
        </div>
        {view.strip && <Strip strip={view.strip} />}
        {/* What to do with the answer, what the forecast leaves out, and where each comes from. */}
        <div className="airout-more" style={{ ...CARD, padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {PROTECT && (
            <Link to={PROTECT} className="press" style={{ ...OUTLINED, fontSize: "18px", fontWeight: "700", lineHeight: "1.3" }}>
              <HouseIcon size={24} />
              <span style={{ flexGrow: "1" }}>{view.protect}</span>
              <ChevronRightIcon size={22} />
            </Link>
          )}
          {view.rule && <p style={BODY}>{view.rule}</p>}
          <p style={BODY}>{view.advice}</p>
          <p style={BODY}>{view.limits}</p>
          {view.links.map((link) => (
            <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="press" style={OUTLINED}>
              <span style={{ flexGrow: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "18px", fontWeight: "700", lineHeight: "1.3" }}>{link.label}</span>
                <span style={{ fontSize: "18px", color: "#4F5561", overflowWrap: "anywhere" }}>{link.host}</span>
              </span>
              <ExternalIcon size={22} />
            </a>
          ))}
        </div>
      </main>
      <Sticky911 />
    </Screen>
  );
}
