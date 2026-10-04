// The icons of "Protect your home", drawn for this app on a 32 × 32 grid: lines only, round ends, as the app's other
// icons are (.ic in styles.css). None is copied from an icon set.
import type { ReactNode } from "react";
import type { AqhiCategory } from "../verdict/types";
import type { IconId } from "./view";

const art = (icon: string, size: number, children: ReactNode) => (
  <svg className="ic protect-art" data-icon={icon} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={{ strokeWidth: "2.2" }}>
    {children}
  </svg>
);

// A window, shut: its frame, the two sashes meeting in the middle, a handle on each, and the sill.
const WINDOW = (
  <>
    <rect x="5" y="4" width="22" height="21" rx="2.5" />
    <path d="M16 4v21" />
    <path d="M12.6 13v3.4M19.4 13v3.4" />
    <path d="M3 29h26" />
  </>
);

// An exhaust fan in its housing: the hub and three blades.
const BLADE = "M16 13.4c-1.3-3.3-.2-6.4 2.5-6.9 2.4-.4 3.9 1.8 2.9 3.9-.9 1.9-2.9 2.9-5.4 3z";
const FAN = (
  <>
    <rect x="4" y="4" width="24" height="24" rx="6" />
    <circle cx="16" cy="16" r="2.4" />
    <path d={BLADE} />
    <path d={BLADE} transform="rotate(120 16 16)" />
    <path d={BLADE} transform="rotate(240 16 16)" />
  </>
);

// A portable air cleaner: a tower with its grille and its light, and clean air rising from the top.
const CLEANER = (
  <>
    <rect x="9" y="11.5" width="14" height="17.5" rx="3.5" />
    <path d="M13 20.5h6M13 24.5h6" />
    <path d="M16 15.6h.01" />
    <path d="M11 7.5V5M16 7.5V3M21 7.5V5" />
  </>
);

// A ventilation system's filter: the frame and its pleats.
const FILTER = (
  <>
    <rect x="4" y="7" width="24" height="18" rx="2.5" />
    <path d="M8 20.5l2.7-9 2.7 9 2.6-9 2.7 9 2.6-9 2.7 9" />
  </>
);

const TILES: Record<IconId, ReactNode> = { window: WINDOW, fan: FAN, cleaner: CLEANER, filter: FILTER };

/** A tile's icon. The label beside it says the same: the icon is not read aloud. */
export const TileIcon = ({ icon, size }: { icon: IconId; size: number }) => art(icon, size, TILES[icon]);

/** The verdict's button: a house, its roof, its walls and its door. */
export const HomeIcon = ({ size }: { size: number }) =>
  art(
    "home",
    size,
    <>
      <path d="M4 15.5 16 5l12 10.5" />
      <path d="M7.5 13v14h17V13" />
      <path d="M13.5 27v-7.5h5V27" />
    </>,
  );

// Where the gauge's needle points, by band: further right as the risk rises. No reading: no needle.
const NEEDLE: Record<AqhiCategory, string> = {
  low: "M16 22 8.7 18.6",
  moderate: "M16 22l-3.4-7.3",
  high: "M16 22l3.4-7.3",
  very_high: "M16 22l7.3-3.4",
};

/** The band's gauge: a dial, and a needle whose position says the level as the word beside it does. */
export const GaugeIcon = ({ band, size }: { band: AqhiCategory | null; size: number }) =>
  art(
    "gauge",
    size,
    <>
      <path d="M5 22a11 11 0 0 1 22 0" />
      {band && <path className="protect-needle" d={NEEDLE[band]} />}
      <path d="M16 22h.01" style={{ strokeWidth: "3.4" }} />
    </>,
  );
