// "What the map shows": the legend. Each layer with its mark, what it is, who it comes from, when, and a link, ECCC's
// first. It opens over the map and the sheet and leaves the top bar and the 911 bar in reach: it is not a modal.
import { useEffect, useRef, type CSSProperties } from "react";
import { useT } from "../app/state";
import { CloseIcon, ExternalIcon } from "../components/icons";
import { ListenButton } from "../listen/ListenButton";
import { Swatch } from "./Overlay";
import type { MapText } from "./text";

const NAVY = "#1B2A4A";
const LINK: CSSProperties = { minHeight: "56px", display: "flex", alignItems: "center", gap: "12px", padding: "8px 16px", borderRadius: "18px", border: `2px solid ${NAVY}`, color: NAVY, textDecoration: "none" };

export function Legend({ text, onClose }: { text: MapText; onClose: () => void }) {
  const t = useT();
  const title = useRef<HTMLHeadingElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // Opened, its title takes the focus, so a screen reader starts there: once, never again while it is read (the
  // screen behind it may draw again). Escape closes it.
  useEffect(() => {
    title.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="map-legend" role="dialog" aria-modal="false" aria-labelledby="legend-h">
      <div className="map-legend-head">
        <h2 id="legend-h" ref={title} tabIndex={-1} style={{ margin: "0", fontSize: "22px", fontWeight: "700", lineHeight: "1.25", outline: "none" }}>{t("map.panel.title")}</h2>
        <button type="button" className="map-button press" onClick={onClose} style={{ flexShrink: "0" }}>
          <CloseIcon size={24} />
          {t("map.panel.close")}
        </button>
      </div>
      <ListenButton sentences={text.voice} style={{ alignSelf: "flex-start" }} />
      <p style={{ margin: "0", fontSize: "18px", lineHeight: "1.45", textWrap: "pretty" }}>{text.summary.join(" ")}</p>
      <ul style={{ listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column", gap: "12px" }}>
        {text.rows.map((row) => (
          <li key={row.id} data-row={row.id} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px", borderRadius: "18px", background: "#FFFFFF", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Swatch id={row.id} />
              <h3 style={{ margin: "0", fontSize: "20px", fontWeight: "700", lineHeight: "1.25" }}>{row.title}</h3>
            </div>
            {row.lines.map((line, i) => (
              <p key={i} style={{ margin: "0", fontSize: "18px", lineHeight: "1.45", color: i === 0 ? "#1A1D21" : "#3F4550", textWrap: "pretty" }}>{line}</p>
            ))}
            {row.links.map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="press" style={LINK}>
                <span style={{ flexGrow: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "18px", fontWeight: "700", lineHeight: "1.3" }}>{link.label}</span>
                  <span style={{ fontSize: "18px", color: "#3F4550", overflowWrap: "anywhere" }}>{link.host}</span>
                </span>
                <ExternalIcon size={22} />
              </a>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
