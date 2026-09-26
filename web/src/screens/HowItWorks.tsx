// 08 · How it works (design/screens/08-how-it-works.html)
import type { CSSProperties, ReactNode } from "react";
import { useT } from "../app/state";
import type { StringKey } from "../i18n";
import { ReplayBanner } from "../components/ReplayBanner";
import { Screen } from "../components/Screen";
import { Sticky911 } from "../components/Sticky911";
import { TopBar } from "../components/TopBar";
import { VERDICT_ICONS } from "../verdict/cards";

const CARD: CSSProperties = { background: "#FFFFFF", borderRadius: "18px", padding: "20px", display: "flex", flexDirection: "column", gap: "12px", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)" };
const BODY: CSSProperties = { margin: "0", fontSize: "18px", lineHeight: "1.45" };
const TILE: CSSProperties = { background: "#F3EEE6", borderRadius: "14px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "2px" };
const CHIP: CSSProperties = { display: "flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 14px 0 10px", borderRadius: "999px", fontSize: "18px", fontWeight: "700" };
const FLAME = "M12 21.5c3.9 0 6.5-2.6 6.5-6.3 0-3-1.8-5.3-3.4-7-.4 1.6-1.2 2.6-2.3 3.2.4-3.2-1-6.3-3.8-8.9.2 3.4-1.5 5.4-3 7.3-1.2 1.6-2 3.2-2 5.4 0 3.7 2.6 6.3 6.5 6.3z";

function Step({ n, title, children, gap = "12px" }: { n: number; title: string; children: ReactNode; gap?: string }) {
  return (
    <li style={{ ...CARD, gap }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <span style={{ flexShrink: "0", width: "40px", height: "40px", borderRadius: "50%", background: "#1B2A4A", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: "800" }}>{n}</span>
        <h2 style={{ margin: "0", fontSize: "22px", fontWeight: "700", lineHeight: "1.25" }}>{title}</h2>
      </div>
      {children}
    </li>
  );
}

function Tiles({ items }: { items: [string, string][] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
      {items.map(([big, small]) => (
        <div key={small} style={TILE}>
          <span style={{ fontSize: "34px", fontWeight: "800", lineHeight: "1.1" }}>{big}</span>
          <span style={{ fontSize: "18px", lineHeight: "1.35" }}>{small}</span>
        </div>
      ))}
    </div>
  );
}

export function HowItWorks() {
  const t = useT();
  const source = (name: StringKey, body: StringKey, padding: string, last = false) => (
    <li style={{ display: "flex", flexDirection: "column", gap: "2px", padding, ...(last ? {} : { borderBottom: "1px solid #EEE7DC" }) }}>
      <span style={{ fontSize: "18px", fontWeight: "700" }}>{t(name)}</span>
      <span style={{ fontSize: "18px", lineHeight: "1.45", color: "#4F5561" }}>{t(body)}</span>
    </li>
  );
  const verdict = (background: string, color: string, icon: ReactNode, label: StringKey, body: StringKey) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "8px" }}>
      <span style={{ ...CHIP, background, color }}>
        <svg className="ic" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: "2.3" }}>{icon}</svg>
        {t(label)}
      </span>
      <p style={BODY}>{t(body)}</p>
    </div>
  );

  return (
    <Screen>
      <ReplayBanner />
      <TopBar back={-1} />
      <main className="how" style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "8px 16px 160px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "0 4px 8px" }}>
          <h1 style={{ margin: "0", fontSize: "34px", fontWeight: "800", lineHeight: "1.12", letterSpacing: "-0.02em" }}>{t("how.title")}</h1>
          <p style={{ margin: "0", fontSize: "20px", lineHeight: "1.45", textWrap: "pretty" }}>{t("how.intro")}</p>
        </div>
        <ol style={{ listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column", gap: "16px" }}>
          <Step n={1} title={t("how.step1")}>
            <p style={BODY}>{t("how.step1.body")}</p>
          </Step>
          <Step n={2} title={t("how.step2")}>
            <p style={BODY}>{t("how.step2.body")}</p>
            <Tiles items={[["24 h", t("how.lookedBack")], ["24", t("how.hourlySteps")]]} />
          </Step>
          <Step n={3} title={t("how.step3")}>
            <p style={BODY}>{t("how.step3.before")} <strong>{t("how.step3.term")}</strong>{t("how.step3.after")}</p>
            <svg viewBox="0 0 318 96" width="100%" role="img" aria-label={t("how.diagramAria")} style={{ display: "block", maxWidth: "318px" }}>
              <rect x="0" y="0" width="318" height="96" rx="14" style={{ fill: "#F3EEE6" }} />
              <polyline points="16,76 70,62 124,50 178,44 232,40 300,30" style={{ fill: "none", stroke: "#1B2A4A", strokeWidth: "3.5", strokeLinecap: "round", strokeDasharray: "9 7" }} />
              <path className="arr" d="M-5 -4.5L5 0L-5 4.5Z" transform="translate(70 62) rotate(-14)" />
              <path className="arr" d="M-5 -4.5L5 0L-5 4.5Z" transform="translate(124 50) rotate(-9)" />
              <path className="arr" d="M-5 -4.5L5 0L-5 4.5Z" transform="translate(232 40) rotate(-7)" />
              <line x1="178" y1="44" x2="178" y2="78" style={{ stroke: "#1A1D21", strokeWidth: "1.75", strokeDasharray: "3 4", strokeLinecap: "round" }} />
              <circle cx="178" cy="44" r="5.5" style={{ fill: "#FFFFFF", stroke: "#1A1D21", strokeWidth: "2.5" }} />
              <circle cx="178" cy="80" r="11" style={{ fill: "#1A1D21" }} />
              <svg x="170" y="72" width="16" height="16" viewBox="0 0 24 24">
                <path d={FLAME} style={{ fill: "#FFFFFF" }} />
              </svg>
              <text x="196" y="72" style={{ fontFamily: "Inter,sans-serif", fontSize: "16px", fontWeight: "700", fill: "#1A1D21" }}>{t("how.closest")}</text>
            </svg>
            <Tiles items={[["25 km", t("how.closeEnough")], ["50 km", t("how.howFar")]]} />
          </Step>
          <Step n={4} title={t("how.step4")} gap="14px">
            {verdict("#E8590C", "#1A1D21", VERDICT_ICONS.wind, "how.drifting", "how.drifting.body")}
            {verdict(
              "#F79009",
              "#1A1D21",
              <>
                <circle cx="12" cy="12" r="9" />
                <path d="M9.5 9.3a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.1 1-1.1 1.7v.6" />
                <path d="M12 17h.01" />
              </>,
              "how.unclear",
              "how.unclear.body",
            )}
            {verdict("#D92D20", "#FFFFFF", VERDICT_ICONS.warning, "how.unexplained", "how.unexplained.body")}
            <p style={{ ...BODY, paddingTop: "14px", borderTop: "1px solid #EEE7DC" }}>{t("how.aqhi")}</p>
          </Step>
        </ol>
        <section aria-labelledby="src-h" style={{ ...CARD, gap: "14px" }}>
          <h2 id="src-h" style={{ margin: "0", fontSize: "22px", fontWeight: "700" }}>{t("how.sources")}</h2>
          <ul style={{ listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column" }}>
            {source("how.nrcan", "how.nrcan.body", "12px 0")}
            {source("how.firms", "how.firms.body", "12px 0")}
            {source("how.eccc", "how.eccc.body", "12px 0")}
            {source("how.openMeteo", "how.openMeteo.body", "12px 0 0", true)}
          </ul>
        </section>
        <section aria-labelledby="lim-h" style={{ ...CARD, gap: "10px" }}>
          <h2 id="lim-h" style={{ margin: "0", fontSize: "22px", fontWeight: "700" }}>{t("how.limits")}</h2>
          <p style={BODY}>{t("how.limits.body")}</p>
        </section>
      </main>
      <Sticky911 />
    </Screen>
  );
}
