import type { CSSProperties } from "react";
import { useT } from "../app/state";
import { FIXED_BOTTOM } from "./Screen";
import { PhoneIcon } from "./icons";

/** Room kept under a screen's content for the bar (about 72 px, plus the phone's home-indicator area). */
export const CLEAR_OF_BAR = "calc(96px + env(safe-area-inset-bottom))";

const BAR: CSSProperties = { ...FIXED_BOTTOM, bottom: "0", zIndex: "5", minHeight: "72px", background: "#FFFFFF", borderTop: "1px solid #E6DFD3", boxShadow: "0 -8px 24px rgba(26, 29, 33, 0.08)", padding: "8px 12px calc(8px + env(safe-area-inset-bottom)) 16px", display: "flex", alignItems: "center", gap: "12px" };
const CALL: CSSProperties = { flexShrink: "0", minHeight: "56px", maxWidth: "150px", padding: "6px 14px", display: "flex", alignItems: "center", gap: "8px", borderRadius: "16px", background: "#D92D20", color: "#FFFFFF", textDecoration: "none", fontSize: "20px", fontWeight: "800", lineHeight: "1.1" };

/**
 * "See flames or a smoke column?" and the red Call 911 button, at the bottom of every screen but Call 911 now and Nearby
 * fire, whose own big button is their Call 911. Under 360 px wide, the button alone, filling the bar (styles.css).
 */
export function Sticky911() {
  const t = useT();
  return (
    <div style={BAR}>
      <p className="sticky-title" style={{ flexGrow: "1", minWidth: "0", margin: "0", fontSize: "18px", fontWeight: "700", lineHeight: "1.25", textWrap: "balance" }}>{t("sticky.title")}</p>
      <a href="tel:911" className="press sticky-call" style={CALL}>
        <PhoneIcon size={26} />
        <span style={{ textWrap: "balance" }}>{t("sticky.call")}</span>
      </a>
    </div>
  );
}
