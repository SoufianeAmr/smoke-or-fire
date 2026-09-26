// 04 · Emergency — Call 911 now (design/screens/04-emergency.html)
import { useEffect, type CSSProperties } from "react";
import { Link } from "react-router";
import { useT } from "../app/state";
import type { StringKey } from "../i18n";
import { Screen } from "../components/Screen";
import { LangToggle } from "../components/TopBar";
import { BackIcon } from "../components/icons";

const NUMBER: CSSProperties = { flexShrink: "0", width: "30px", height: "30px", borderRadius: "50%", background: "#1A1D21", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "700" };
const PHONE = "M5.5 3.5h3l1.8 4.6-2.2 1.4a11 11 0 0 0 6.4 6.4l1.4-2.2 4.6 1.8v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3.5 5.7a2 2 0 0 1 2-2.2z";

export function Emergency() {
  const t = useT();
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
      <Screen style={{ background: "#D92D20", color: "#FFFFFF" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px 0 4px", height: "68px" }}>
          <Link to="/q1" aria-label={t("nav.back")} style={{ width: "56px", height: "56px", display: "flex", alignItems: "center", justifyContent: "center", color: "#FFFFFF", borderRadius: "14px" }}>
            <BackIcon size={28} />
          </Link>
          <LangToggle on="band" />
        </div>
        <main style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "20px", padding: "8px 20px 24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <span style={{ flexShrink: "0", width: "60px", height: "60px", borderRadius: "50%", background: "#FFFFFF", color: "#D92D20", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg className="ic" width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: "2.2" }}><path d={PHONE} /></svg>
              </span>
              <p style={{ margin: "0", fontSize: "22px", fontWeight: "700", letterSpacing: "0.06em" }}>{t("emergency.label")}</p>
            </div>
            <h1 style={{ margin: "4px 0 0", fontSize: "34px", fontWeight: "800", lineHeight: "1.1", letterSpacing: "-0.02em" }}>{t("emergency.title")}</h1>
            <p style={{ margin: "0", fontSize: "20px", fontWeight: "500", lineHeight: "1.4", textWrap: "pretty" }}>{t("emergency.sub")}</p>
          </div>
          <section aria-labelledby="tell-h" style={{ background: "#FFFFFF", color: "#1A1D21", borderRadius: "18px", padding: "20px", display: "flex", flexDirection: "column", gap: "14px", boxShadow: "0 10px 28px rgba(80, 10, 5, 0.25)" }}>
            <h2 id="tell-h" style={{ margin: "0", fontSize: "22px", fontWeight: "700" }}>{t("emergency.tell")}</h2>
            <ol style={{ listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column", gap: "12px" }}>
              {items.map(([lead, rest], i) => (
                <li key={lead} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <span style={NUMBER}>{i + 1}</span>
                  <span style={{ fontSize: "18px", lineHeight: "1.4" }}><strong>{t(lead)}</strong> {t(rest)}</span>
                </li>
              ))}
            </ol>
          </section>
          <div style={{ flexGrow: "1" }} />
          <a href="tel:911" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "14px", minHeight: "104px", borderRadius: "18px", background: "#FFFFFF", color: "#D92D20", textDecoration: "none", fontSize: "34px", fontWeight: "800", letterSpacing: "-0.01em", boxShadow: "0 12px 30px rgba(80, 10, 5, 0.3)" }}>
            <svg className="ic" width="36" height="36" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: "2.4" }}><path d={PHONE} /></svg>
            {t("emergency.call")}
          </a>
          <p style={{ margin: "-6px 0 0", textAlign: "center", fontSize: "18px", fontWeight: "500", lineHeight: "1.4", textWrap: "balance" }}>{t("emergency.stay")}</p>
        </main>
      </Screen>
    </div>
  );
}
