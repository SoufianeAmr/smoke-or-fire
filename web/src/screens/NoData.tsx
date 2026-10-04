// 09b · We can't check the air right now (design/screens/09b-error-no-data.html)
import { useLocation, useNavigate } from "react-router";
import { useApp, useT } from "../app/state";
import type { LiveFailure } from "../data/live";
import { noDataVoice } from "../listen/speech";
import { ReplayBanner } from "../components/ReplayBanner";
import { Screen } from "../components/Screen";
import { CLEAR_OF_BAR, Sticky911 } from "../components/Sticky911";
import { TopBar } from "../components/TopBar";

export function NoData() {
  const { lang } = useApp();
  const t = useT();
  const navigate = useNavigate();
  // Why there is no verdict (from Loading): the engine's own no-data answer, or no answer at all in time.
  const reason = (useLocation().state as { reason?: LiveFailure } | null)?.reason;
  return (
    <Screen>
      <ReplayBanner />
      <TopBar back="/location" listen={noDataVoice(lang)} />
      <main className="nodata-main" style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "16px", padding: `4px 16px ${CLEAR_OF_BAR}` }}>
        <div className="nodata-head" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "0 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ flexShrink: "0", width: "52px", height: "52px", borderRadius: "16px", background: "#E9EDF5", color: "#1B2A4A", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg className="ic" width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 3l18 18" />
                <path d="M8.2 8.2A5 5 0 0 0 7 18h10" />
                <path d="M11 6.2A5.5 5.5 0 0 1 17 9a4.5 4.5 0 0 1 3.3 7.4" />
              </svg>
            </span>
            <p style={{ margin: "0", fontSize: "22px", fontWeight: "700", letterSpacing: "0.06em", color: "#1B2A4A" }}>{t("noData.label")}</p>
          </div>
          <h1 style={{ margin: "0", fontSize: "34px", fontWeight: "800", lineHeight: "1.12", letterSpacing: "-0.02em", textWrap: "balance" }}>{t("noData.title")}</h1>
          <p style={{ margin: "0", fontSize: "18px", lineHeight: "1.45" }}>{t(reason === "notAnswering" ? "noData.sub.notAnswering" : "noData.sub")}</p>
        </div>
        <div className="nodata-callout" style={{ padding: "18px 20px", borderRadius: "18px", background: "#FFFFFF", border: "2px solid #1A1D21", display: "flex", flexDirection: "column", gap: "6px" }}>
          <p style={{ margin: "0", fontSize: "22px", fontWeight: "700", lineHeight: "1.3" }}>{t("noData.notNoFire")}</p>
          <p style={{ margin: "0", fontSize: "18px", lineHeight: "1.45" }}>{t("noData.lookOutside")}</p>
        </div>
        <button type="button" onClick={() => navigate("/loading")} className="press" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", minHeight: "60px", border: "0", borderRadius: "18px", background: "#1B2A4A", color: "#FFFFFF", fontFamily: "inherit", fontSize: "22px", fontWeight: "700", cursor: "pointer" }}>
          <svg className="ic" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 12a8 8 0 1 1-2.4-5.7" />
            <path d="M20 4v5h-5" />
          </svg>
          {t("noData.retry")}
        </button>
        <a href={t("todo.officialLink.url")} className="press" style={{ display: "flex", alignItems: "center", gap: "14px", minHeight: "64px", padding: "10px 18px", borderRadius: "18px", background: "#FFFFFF", color: "#1A1D21", textDecoration: "none", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)" }}>
          <span style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontSize: "18px", fontWeight: "700" }}>{t("todo.officialLink")}</span>
            <span style={{ fontSize: "16px", color: "#4F5561" }}>{t("todo.officialLink.host")}</span>
          </span>
          <svg className="ic" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ color: "#1B2A4A" }}>
            <path d="M14 4h6v6" />
            <path d="M20 4l-9 9" />
            <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
          </svg>
        </a>
      </main>
      <Sticky911 />
    </Screen>
  );
}
