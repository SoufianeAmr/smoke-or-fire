// The burn status's own shape, on the badge (24 px), in its panel and on the card (48 px): an octagon with a cross (no
// burning), a triangle with a clock (restricted), a flame in a ring (permitted), a square with a bar (season closed), a
// dashed ring with a question mark (not checked). No two states share a shape, so none is told by colour alone. No
// check mark anywhere: under a verdict that says to look outside, a tick could read as "all is well".
import type { CSSProperties } from "react";
import type { BurnState } from "../verdict/types";
import { BURN_LOOK } from "./view";

export function BurnShape({ state, size = 48 }: { state: BurnState; size?: number }) {
  const { shape, accent } = BURN_LOOK[state];
  const line = (stroke: string, width: number): CSSProperties => ({ fill: "none", stroke, strokeWidth: String(width), strokeLinecap: "round", strokeLinejoin: "round" });
  return (
    <svg className="burn-shape" data-shape={shape} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: "0" }}>
      {shape === "octagon" && (
        <>
          <path d="M15 3h18l12 12v18L33 45H15L3 33V15z" style={{ fill: "#FFFFFF" }} />
          <path d="M17 17l14 14M31 17L17 31" style={line(accent, 5)} />
        </>
      )}
      {shape === "triangle" && (
        <>
          {/* White on amber is too faint a pair: the triangle has a dark outline. */}
          <path d="M24 5 45 42H3Z" style={{ fill: "#FFFFFF", stroke: "#1A1D21", strokeWidth: "3", strokeLinejoin: "round" }} />
          <circle cx="24" cy="30" r="7" style={line("#1A1D21", 2.6)} />
          <path d="M24 26v4.2l2.7 1.7" style={line("#1A1D21", 2.6)} />
        </>
      )}
      {shape === "circle" && (
        <>
          {/* Green is an outline and a flame here, never a fill: a white disc in a green ring, a green flame in it. */}
          <circle cx="24" cy="24" r="20.5" style={{ fill: "#FFFFFF", stroke: accent, strokeWidth: "3" }} />
          <path d="M24 36.5c4.7 0 7.9-3.2 7.9-7.6 0-3.6-2.2-6.5-4.2-8.5-.4 1.9-1.4 3.2-2.7 3.9.4-3.9-1.2-7.6-4.6-10.8.3 4.2-1.9 6.6-3.6 8.9-1.4 1.9-2.4 3.9-2.4 6.5 0 4.4 3.2 7.6 7.9 7.6z" style={{ fill: accent }} />
        </>
      )}
      {shape === "square" && (
        <>
          <rect x="4" y="4" width="40" height="40" rx="8" style={{ fill: "#FFFFFF", stroke: accent, strokeWidth: "3" }} />
          <path d="M15 24h18" style={line(accent, 5)} />
        </>
      )}
      {shape === "ring" && (
        <>
          <circle cx="24" cy="24" r="20.5" style={{ fill: "#FFFFFF", stroke: accent, strokeWidth: "3", strokeDasharray: "7 5" }} />
          <path d="M18.5 19a5.6 5.6 0 1 1 7.8 5.2c-1.5.7-2.3 2.1-2.3 3.6v.7" style={line(accent, 3.6)} />
          <path d="M24 34.5h.01" style={line(accent, 4.4)} />
        </>
      )}
    </svg>
  );
}
