// The map's own icons, drawn like the others (components/icons.tsx): 24 px grid, round 2 px strokes.
import type { CSSProperties, ReactNode } from "react";

const icon = (size: number, children: ReactNode, style?: CSSProperties) => (
  <svg className="ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={style}>
    {children}
  </svg>
);

export const PlusIcon = ({ size }: { size: number }) => icon(size, <path d="M12 5v14M5 12h14" />, { strokeWidth: "2.6" });
export const MinusIcon = ({ size }: { size: number }) => icon(size, <path d="M5 12h14" />, { strokeWidth: "2.6" });

/** Recentre: a ring with four ticks, the frame closing back on its middle. */
export const RecentreIcon = ({ size }: { size: number }) =>
  icon(
    size,
    <>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5" />
      <circle cx="12" cy="12" r="1.2" style={{ fill: "currentColor" }} />
    </>,
  );

/** Legend: three rows, each a mark and its line. */
export const LegendIcon = ({ size }: { size: number }) =>
  icon(
    size,
    <>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <circle cx="5" cy="6" r="1.4" style={{ fill: "currentColor" }} />
      <circle cx="5" cy="12" r="1.4" style={{ fill: "currentColor" }} />
      <circle cx="5" cy="18" r="1.4" style={{ fill: "currentColor" }} />
    </>,
  );
