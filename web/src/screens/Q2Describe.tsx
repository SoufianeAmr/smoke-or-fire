// 03 · Question 2 — What best describes it? (design/screens/03-q2-describe.html, 03-fr-q2-describe.html)
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router";
import { useT } from "../app/state";
import type { StringKey } from "../i18n";
import { ReplayBanner } from "../components/ReplayBanner";
import { Screen } from "../components/Screen";
import { Sticky911 } from "../components/Sticky911";
import { TopBar } from "../components/TopBar";
import { SmokeColumnIcon } from "../components/icons";

const OPTION: CSSProperties = { display: "flex", alignItems: "center", gap: "16px", minHeight: "112px", padding: "18px", borderRadius: "18px", background: "#FFFFFF", color: "#1A1D21", textDecoration: "none", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)" };
const OPTION_URGENT: CSSProperties = { ...OPTION, padding: "16px", border: "2px solid #D92D20" };
const ICON_BOX: CSSProperties = { flexShrink: "0", width: "64px", height: "64px", borderRadius: "16px", background: "#F3EEE6", display: "flex", alignItems: "center", justifyContent: "center" };

function Option({ to, style, iconColor, icon, title, sub }: { to: string; style: CSSProperties; iconColor?: string; icon: ReactNode; title: StringKey; sub: StringKey }) {
  const t = useT();
  return (
    <Link to={to} className="opt" style={style}>
      <span style={{ ...ICON_BOX, ...(iconColor ? { color: iconColor } : {}) }}>{icon}</span>
      <span style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
        <span style={{ fontSize: "22px", fontWeight: "700", lineHeight: "1.25" }}>{t(title)}</span>
        <span style={{ fontSize: "18px", lineHeight: "1.4", color: "#4F5561" }}>{t(sub)}</span>
      </span>
    </Link>
  );
}

export function Q2Describe() {
  const t = useT();
  return (
    <Screen>
      <ReplayBanner />
      <TopBar back="/q1" />
      <main style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "16px", padding: "4px 16px 152px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "0 4px" }}>
          <p style={{ margin: "0", fontSize: "18px", fontWeight: "600", color: "#4F5561" }}>{t("q2.step")}</p>
          <h1 style={{ margin: "0", fontSize: "34px", fontWeight: "800", lineHeight: "1.12", letterSpacing: "-0.02em", textWrap: "balance" }}>{t("q2.title")}</h1>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <Option
            to="/location"
            style={OPTION}
            title="q2.haze"
            sub="q2.hazeSub"
            icon={
              <svg className="ic" width="36" height="36" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 7c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" />
                <path d="M3 12c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" />
                <path d="M3 17c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" />
              </svg>
            }
          />
          <Option
            to="/location"
            style={OPTION}
            title="q2.smell"
            sub="q2.smellSub"
            icon={
              <svg className="ic" width="36" height="36" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 20c-1.6-2.2 1.6-4 0-6.2s1.6-4 0-6.3" />
                <path d="M12 18c-1.6-2.2 1.6-4 0-6.2s1.6-4 0-6.3" />
                <path d="M17 20c-1.6-2.2 1.6-4 0-6.2s1.6-4 0-6.3" />
              </svg>
            }
          />
          <Option to="/emergency" style={OPTION_URGENT} iconColor="#D92D20" title="q2.column" sub="q2.columnSub" icon={<SmokeColumnIcon size={36} style={{ strokeWidth: "2.3" }} />} />
        </div>
      </main>
      <Sticky911 />
    </Screen>
  );
}
