// The second question's three sky pictures, and the icons on the three questions and on Nearby fire.
// Every drawing in this file is original to this repo: no path comes from an icon library or from design/.
import type { CSSProperties, ReactNode } from "react";

// A picture fills the top of its tile, and runs a pixel under the tile's edge so no hairline of white shows beside it.
// It keeps its ground at the bottom: a shorter tile cuts sky off the top.
const PICTURE: CSSProperties = { display: "block", width: "calc(100% + 2px)", height: "auto", margin: "-1px -1px 0", aspectRatio: "4 / 3" };

const sky = (label: string, children: ReactNode) => (
  <svg className="look-picture" role="img" aria-label={label} viewBox="0 0 160 120" preserveAspectRatio="xMidYMax slice" style={PICTURE}>
    {children}
  </svg>
);

/** The same small house in all three pictures, so only the sky differs: walls, roof and door, and a window. */
const house = (walls: string, roof: string, glass: string) => (
  <>
    <rect x="23" y="75" width="32" height="21" style={{ fill: walls, stroke: roof, strokeWidth: "2" }} />
    <path d="M16 77 39 58l23 19z" style={{ fill: roof }} />
    <rect x="43" y="83" width="7" height="13" style={{ fill: roof }} />
    <rect x="28" y="81" width="9" height="8" style={{ fill: glass }} />
  </>
);

/** A clear day, and dark smoke billowing up from one spot on the ground, wider as it rises. */
export function ColumnSky({ label }: { label: string }) {
  return sky(
    label,
    <>
      <rect width="160" height="120" style={{ fill: "#E9EDF5" }} />
      <circle cx="26" cy="32" r="9" style={{ fill: "#F79009" }} />
      <rect y="96" width="160" height="24" style={{ fill: "#E6DFD3" }} />
      <g style={{ fill: "#8A8F98" }}>
        <circle cx="122" cy="68" r="8" />
        <circle cx="128" cy="50" r="11" />
        <circle cx="137" cy="32" r="13" />
        <circle cx="88" cy="24" r="11" />
        <circle cx="146" cy="12" r="14" />
      </g>
      <g style={{ fill: "#2D2926" }}>
        <path d="M105 96h6l11-58H95z" />
        <circle cx="108" cy="90" r="5" />
        <circle cx="109" cy="81" r="7" />
        <circle cx="107" cy="71" r="9" />
        <circle cx="112" cy="60" r="11" />
        <circle cx="106" cy="48" r="13" />
        <circle cx="116" cy="37" r="15" />
        <circle cx="103" cy="25" r="16" />
        <circle cx="123" cy="19" r="17" />
        <circle cx="107" cy="6" r="17" />
        <circle cx="131" cy="2" r="16" />
      </g>
      <path d="M0 96h160" style={{ fill: "none", stroke: "#8A8F98", strokeWidth: "2" }} />
      {house("#FFFFFF", "#1B2A4A", "#E9EDF5")}
    </>,
  );
}

/** Grey everywhere: bands of haze across the whole scene, a dim sun, the house faint, and no source in sight. */
export function HazeSky({ label }: { label: string }) {
  return sky(
    label,
    <>
      <rect width="160" height="120" style={{ fill: "#E6DFD3" }} />
      <circle cx="112" cy="36" r="12" style={{ fill: "#F79009", opacity: "0.55" }} />
      <rect y="96" width="160" height="24" style={{ fill: "#8A8F98", opacity: "0.5" }} />
      <g style={{ opacity: "0.45" }}>{house("#F3EEE6", "#4F5561", "#8A8F98")}</g>
      <g style={{ fill: "#8A8F98", opacity: "0.6" }}>
        <rect x="-12" y="19" width="92" height="10" rx="5" />
        <rect x="74" y="33" width="110" height="9" rx="4.5" />
        <rect x="-12" y="49" width="128" height="12" rx="6" />
        <rect x="50" y="67" width="130" height="11" rx="5.5" />
        <rect x="-12" y="83" width="112" height="11" rx="5.5" />
        <rect x="66" y="102" width="110" height="10" rx="5" />
      </g>
      <rect width="160" height="120" style={{ fill: "#8A8F98", opacity: "0.22" }} />
    </>,
  );
}

/** Night: a moon, a few stars, a lit window, no smoke to see. Three small wavy lines stand for the smell. */
export function SmellSky({ label }: { label: string }) {
  return sky(
    label,
    <>
      <rect width="160" height="120" style={{ fill: "#1B2A4A" }} />
      <circle cx="124" cy="36" r="13" style={{ fill: "#F3EEE6" }} />
      <circle cx="130" cy="31" r="11" style={{ fill: "#1B2A4A" }} />
      <g style={{ fill: "#FFFFFF" }}>
        <circle cx="24" cy="30" r="1.6" />
        <circle cx="52" cy="46" r="1.3" />
        <circle cx="78" cy="24" r="1.6" />
        <circle cx="96" cy="52" r="1.3" />
        <circle cx="146" cy="62" r="1.6" />
      </g>
      <rect y="96" width="160" height="24" style={{ fill: "#2D2926" }} />
      {house("#4F5561", "#8A8F98", "#F79009")}
      <g style={{ fill: "none", stroke: "#E9EDF5", strokeWidth: "2.5", strokeLinecap: "round" }}>
        <path d="M84 88c-5-4 5-8 0-12s5-8 0-12" />
        <path d="M100 82c-5-4 5-8 0-12s5-8 0-12" />
        <path d="M116 88c-5-4 5-8 0-12s5-8 0-12" />
      </g>
    </>,
  );
}

const DISC: CSSProperties = { flexShrink: "0", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" };
// Pale red with a red flame for Yes; pale navy for the plain answers; amber with a near-black mark for Not sure;
// navy with a white icon at the head of a screen.
const TONES = {
  flame: { background: "#FEE4E2", color: "#D92D20" },
  navy: { background: "#E9EDF5", color: "#1B2A4A" },
  amber: { background: "#F79009", color: "#1A1D21" },
  ink: { background: "#1B2A4A", color: "#FFFFFF" },
};

/** An icon in a round disc, never read aloud: the words beside it say what the answer is. */
export function Disc({ tone, size, children }: { tone: keyof typeof TONES; size: number; children: ReactNode }) {
  return (
    <span className="look-disc" aria-hidden="true" style={{ ...DISC, ...TONES[tone], width: `${size}px`, height: `${size}px` }}>
      {children}
    </span>
  );
}

// Line icons, drawn on the 24 × 24 grid of the other icons. Each takes two thirds of its disc.
const icon = (children: ReactNode, strokeWidth = "2") => (
  <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" style={{ width: "66%", height: "66%", strokeWidth }}>
    {children}
  </svg>
);

const FLAME = "M12.6 2.6C13 6 17.8 8.6 17.8 14a5.8 5.8 0 0 1-11.6 0c0-2.4 1.2-4 2.4-5.4.4 1.5 1 2.4 2 2.8-.4-3.4.2-6.4 2-8.8z";

export const FlameMark = () => icon(<path d={FLAME} />, "2.2");

export const CrossMark = () => icon(<path d="M7 7l10 10M17 7 7 17" />, "2.6");

export const QuestionMark = () =>
  icon(
    <>
      <path d="M8.8 9a3.3 3.3 0 1 1 5 2.8c-1.1.7-1.8 1.4-1.8 2.9" />
      <path d="M12 18.6h.01" />
    </>,
    "2.6",
  );

/** A fire bowl on its legs, with a flame. */
export const FirePitMark = () =>
  icon(
    <>
      <path d="M12.3 2c.3 2.4 3.3 4 3.3 7.2a3.6 3.6 0 0 1-7.2 0c0-1.5.7-2.5 1.5-3.4.3 1 .7 1.5 1.3 1.8-.2-2 .1-4 1.1-5.6z" />
      <path d="M3.5 14.6h17" />
      <path d="M5 14.6c.4 3.1 3.2 4.9 7 4.9s6.6-1.8 7-4.9" />
      <path d="M8.3 19l-1.3 2.5M15.7 19l1.3 2.5" />
    </>,
  );

/** A low, lumpy pile on the ground, with two wisps of smoke. */
export const MulchMark = () =>
  icon(
    <>
      <path d="M2.5 20.5h19" />
      <path d="M4 20.5c.6-2.4 2-3.9 4-3.9 1.2 0 1.6.6 2.6.6 1.3 0 2-1.6 3.9-1.6 2 0 2.4 1.5 3.4 2 1.4.6 2 1.5 2.4 2.9" />
      <path d="M9 13.4c-1.4-1.3 1.4-2.3 0-3.6s1.4-2.3 0-3.6" />
      <path d="M14.6 12.2c-1.4-1.3 1.4-2.3 0-3.6s1.4-2.3 0-3.6" />
    </>,
  );

/** Two people standing. */
export const PeopleMark = () =>
  icon(
    <>
      <circle cx="7.5" cy="5.6" r="2.3" />
      <path d="M4 21v-7.4a3.5 3.5 0 0 1 7 0V21" />
      <circle cx="16.5" cy="5.6" r="2.3" />
      <path d="M13 21v-7.4a3.5 3.5 0 0 1 7 0V21" />
    </>,
  );

/** A flame and a plus: something else. */
export const OtherFireMark = () =>
  icon(
    <>
      <path d="M10.4 5.2c.4 3 4.6 5.2 4.6 9.8a5 5 0 0 1-10 0c0-2 1-3.4 2-4.6.4 1.3.9 2 1.8 2.4-.4-2.8.1-5.5 1.6-7.6z" />
      <path d="M19 2.8v5.4M16.3 5.5h5.4" />
    </>,
  );

/** A flame struck through: nothing is burning. */
export const NoFireMark = () =>
  icon(
    <>
      <path d={FLAME} />
      <path d="M3.5 4.5l17 16" />
    </>,
  );
