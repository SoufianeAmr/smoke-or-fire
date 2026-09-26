// 02 · Question 1 — Do you see flames? (design/screens/02-q1-flames.html)
import { Link } from "react-router";
import { useT } from "../app/state";
import { ReplayBanner } from "../components/ReplayBanner";
import { Screen } from "../components/Screen";
import { Sticky911 } from "../components/Sticky911";
import { TopBar } from "../components/TopBar";
import { FlameIcon } from "../components/icons";

export function Q1Flames() {
  const t = useT();
  return (
    <Screen>
      <ReplayBanner />
      <TopBar back="/" />
      <main className="q1-main" style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "28px", padding: "12px 16px 152px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "0 4px" }}>
          <p style={{ margin: "0", fontSize: "18px", fontWeight: "600", color: "#4F5561" }}>{t("q1.step")}</p>
          <h1 style={{ margin: "0", fontSize: "34px", fontWeight: "800", lineHeight: "1.12", letterSpacing: "-0.02em" }}>{t("q1.title")}</h1>
          <p style={{ margin: "0", fontSize: "18px", lineHeight: "1.45", color: "#4F5561" }}>{t("q1.hint")}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Link to="/emergency" className="press" style={{ display: "flex", alignItems: "center", gap: "18px", minHeight: "136px", padding: "20px 24px", borderRadius: "18px", background: "#D92D20", color: "#FFFFFF", textDecoration: "none", boxShadow: "0 10px 24px rgba(217, 45, 32, 0.22)" }}>
            <span style={{ flexShrink: "0", width: "68px", height: "68px", borderRadius: "50%", background: "#FFFFFF", color: "#D92D20", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FlameIcon size={36} />
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "34px", fontWeight: "800", lineHeight: "1" }}>{t("q1.yes")}</span>
              <span style={{ fontSize: "18px", fontWeight: "600", lineHeight: "1.35" }}>{t("q1.yesSub")}</span>
            </span>
          </Link>
          <Link to="/q2" className="press" style={{ display: "flex", alignItems: "center", gap: "18px", minHeight: "136px", padding: "20px 24px", borderRadius: "18px", background: "#FFFFFF", border: "3px solid #1B2A4A", color: "#1B2A4A", textDecoration: "none" }}>
            <span style={{ flexShrink: "0", width: "68px", height: "68px", borderRadius: "50%", background: "#E9EDF5", color: "#1B2A4A", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg className="ic" width="34" height="34" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 3l18 18" />
                <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c5 0 8.5 4.2 9.5 7-.4 1.2-1.3 2.7-2.6 4" />
                <path d="M6.6 6.6C4.6 8 3.1 10 2.5 12c1 2.8 4.5 7 9.5 7 1.9 0 3.6-.6 5-1.5" />
                <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
              </svg>
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "34px", fontWeight: "800", lineHeight: "1" }}>{t("q1.no")}</span>
              <span style={{ fontSize: "18px", fontWeight: "600", lineHeight: "1.35" }}>{t("q1.noSub")}</span>
            </span>
          </Link>
        </div>
      </main>
      <Sticky911 />
    </Screen>
  );
}
