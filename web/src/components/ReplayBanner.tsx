import { useNavigate } from "react-router";
import { useApp, useT } from "../app/state";

/** Navy "Replay · <town> · Aug 25, 2025 · Exit" bar shown on every replay screen but the first. */
export function ReplayBanner() {
  const { mode, place, setMode } = useApp();
  const t = useT();
  const navigate = useNavigate();
  if (mode !== "replay") return null;

  const exit = (event: React.MouseEvent) => {
    event.preventDefault();
    setMode("live");
    navigate("/");
  };

  return (
    <div style={{ minHeight: "44px", background: "#1B2A4A", color: "#FFFFFF", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", columnGap: "6px", padding: "0 12px", fontSize: "16px", fontWeight: "600", lineHeight: "1.3" }}>
      <span>{place ? t("banner.replayTown", { town: place.name }) : t("banner.replayNoTown")}</span>
      <a href="/" onClick={exit} style={{ position: "relative", zIndex: "2", height: "56px", margin: "-6px 0", display: "flex", alignItems: "center", padding: "0 8px", color: "#FFFFFF", fontWeight: "700", textDecoration: "underline" }}>
        {t("banner.exit")}
      </a>
    </div>
  );
}
