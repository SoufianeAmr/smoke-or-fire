import { useState, type CSSProperties, type ReactNode } from "react";
import { useT } from "../app/state";
import type { StringKey } from "../i18n";
import { FIXED_BOTTOM } from "./Screen";
import { CloseIcon, DarkSmokeIcon, FlameIcon, PhoneIcon, SmokeColumnIcon } from "./icons";

type Tip = "flames" | "column" | "dark";

const TILE: CSSProperties = { position: "relative", minHeight: "78px", padding: "6px 2px", border: "0", borderRadius: "12px", background: "#F3EEE6", color: "#1A1D21", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", cursor: "pointer" };
const TILE_LABEL: CSSProperties = { fontSize: "16px", fontWeight: "600", lineHeight: "1.15", textAlign: "center" };
const TILE_SELECTED: CSSProperties = { position: "absolute", inset: "0", border: "2.5px solid #1B2A4A", borderRadius: "12px" };
const CARD: CSSProperties = { ...FIXED_BOTTOM, bottom: "calc(144px + env(safe-area-inset-bottom))", zIndex: "6", padding: "0 12px", pointerEvents: "none" };
const CARD_INNER: CSSProperties = { pointerEvents: "auto", background: "#FFFFFF", borderRadius: "18px", boxShadow: "0 16px 40px rgba(26, 29, 33, 0.22), 0 2px 6px rgba(26, 29, 33, 0.08)", padding: "14px 6px 18px 18px", display: "flex", flexDirection: "column", gap: "4px" };

const TIPS: Record<Tip, { icon: (size: number) => ReactNode; title: StringKey; body: StringKey; tile: StringKey }> = {
  flames: { icon: (s) => <FlameIcon size={s} />, title: "tip.flames.title", body: "tip.flames.body", tile: "sticky.flames" },
  column: { icon: (s) => <SmokeColumnIcon size={s} />, title: "tip.column.title", body: "tip.column.body", tile: "sticky.column" },
  dark: { icon: (s) => <DarkSmokeIcon size={s} />, title: "tip.dark.title", body: "tip.dark.body", tile: "sticky.dark" },
};

/** "Call 911 if you see:" bar with the three tiles, their explainer cards, and the Call 911 button. */
export function Sticky911() {
  const t = useT();
  const [tip, setTip] = useState<Tip | null>(null);
  const toggle = (name: Tip) => setTip(tip === name ? null : name);

  return (
    <>
      {tip && (
        <div style={CARD}>
          <div role="dialog" aria-label={t(TIPS[tip].title)} style={CARD_INNER}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {TIPS[tip].icon(26)}
              <p style={{ flexGrow: "1", margin: "0", fontSize: "20px", fontWeight: "700" }}>{t(TIPS[tip].title)}</p>
              <button type="button" onClick={() => setTip(null)} aria-label={t("tip.close")} style={{ width: "56px", height: "56px", margin: "-10px 0", border: "0", background: "transparent", color: "#1A1D21", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <CloseIcon size={24} />
              </button>
            </div>
            <p style={{ margin: "0", paddingRight: "12px", fontSize: "18px", lineHeight: "1.45" }}>{t(TIPS[tip].body)}</p>
          </div>
        </div>
      )}
      <div style={{ ...FIXED_BOTTOM, bottom: "0", zIndex: "5", background: "#FFFFFF", borderTop: "1px solid #E6DFD3", boxShadow: "0 -8px 24px rgba(26, 29, 33, 0.08)", padding: "10px 16px calc(14px + env(safe-area-inset-bottom))", display: "flex", alignItems: "stretch", gap: "10px" }}>
        <div style={{ flexGrow: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "6px" }}>
          <p style={{ margin: "0", fontSize: "18px", fontWeight: "700", lineHeight: "1.2" }}>{t("sticky.title")}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "6px" }}>
            {(Object.keys(TIPS) as Tip[]).map((name) => (
              <button key={name} type="button" className="tile" onClick={() => toggle(name)} aria-expanded={tip === name} style={TILE}>
                {TIPS[name].icon(28)}
                <span style={TILE_LABEL}>{t(TIPS[name].tile)}</span>
                {tip === name && <span aria-hidden="true" style={TILE_SELECTED} />}
              </button>
            ))}
          </div>
        </div>
        <a href="tel:911" className="press" style={{ flexShrink: "0", width: "104px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px", borderRadius: "18px", background: "#D92D20", color: "#FFFFFF", textDecoration: "none", fontSize: "20px", fontWeight: "800", lineHeight: "1.1", textAlign: "center" }}>
          <PhoneIcon size={28} />
          {t("sticky.call")}
        </a>
      </div>
    </>
  );
}
