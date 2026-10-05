// SVG icons, path data copied from design/screens/*.html.
import type { CSSProperties } from "react";

interface IconProps {
  size: number;
  style?: CSSProperties;
}

const svg = (size: number, children: React.ReactNode, style?: CSSProperties) => (
  <svg className="ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={style}>
    {children}
  </svg>
);

export const FlameIcon = ({ size, style }: IconProps) =>
  svg(size, <path d="M12 21.5c3.9 0 6.5-2.6 6.5-6.3 0-3-1.8-5.3-3.4-7-.4 1.6-1.2 2.6-2.3 3.2.4-3.2-1-6.3-3.8-8.9.2 3.4-1.5 5.4-3 7.3-1.2 1.6-2 3.2-2 5.4 0 3.7 2.6 6.3 6.5 6.3z" />, style);

export const SmokeColumnIcon = ({ size, style }: IconProps) =>
  svg(
    size,
    <>
      <path d="M6.5 21h11" />
      <path d="M10 20.5a1.8 1.8 0 0 1-1-3.7a2.3 2.3 0 0 1-.4-4.2a2.6 2.6 0 0 1 1.2-4.6a2.8 2.8 0 0 1 3.7-3.8a2.6 2.6 0 0 1 4.7 1a2.6 2.6 0 0 1 .2 4.8a2.4 2.4 0 0 1-3.6 2.6a2.3 2.3 0 0 1-2.2 3.9a1.9 1.9 0 0 1-.8 4" />
    </>,
    style,
  );

export const PhoneIcon = ({ size, style }: IconProps) =>
  svg(size, <path d="M5.5 3.5h3l1.8 4.6-2.2 1.4a11 11 0 0 0 6.4 6.4l1.4-2.2 4.6 1.8v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3.5 5.7a2 2 0 0 1 2-2.2z" />, style);

// The three wind lines of the drifting-smoke state, for the wind trace's badge.
export const WindIcon = ({ size, style }: IconProps) =>
  svg(
    size,
    <>
      <path d="M3 8h10a3 3 0 1 0-3-3" />
      <path d="M3 12h15a3 3 0 1 1-3 3" />
      <path d="M3 16h7" />
    </>,
    style,
  );

// Path data from Lucide “bell” (ISC licence).
export const BellIcon = ({ size, style }: IconProps) =>
  svg(
    size,
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>,
    style,
  );

// A link that opens another site.
export const ExternalIcon = ({ size, style }: IconProps) =>
  svg(
    size,
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>,
    style,
  );

// Path data from Lucide “satellite” (ISC licence).
export const SatelliteIcon = ({ size, style }: IconProps) =>
  svg(
    size,
    <>
      <path d="M13 7 9 3 5 7l4 4" />
      <path d="m17 11 4 4-4 4-4-4" />
      <path d="m8 12 4 4 6-6-4-4Z" />
      <path d="m16 8 3-3" />
      <path d="M9 21a6 6 0 0 0-6-6" />
    </>,
    style,
  );

export const CloseIcon = ({ size, style }: IconProps) => svg(size, <path d="M6 6l12 12M18 6L6 18" />, style);

export const BackIcon = ({ size, style }: IconProps) => svg(size, <path d="M15 5l-7 7 7 7" />, style);

export const ChevronRightIcon = ({ size, style }: IconProps) => svg(size, <path d="M9 5l7 7-7 7" />, style);

export const ChevronDownIcon = ({ size, style }: IconProps) => svg(size, <path d="M6 9l6 6 6-6" />, style);

export const ChevronUpIcon = ({ size, style }: IconProps) => svg(size, <path d="M6 15l6-6 6 6" />, style);

// Drawn here, from plain shapes: an "i" in a ring (a note to read), a tick, an arrow that points up (turned to point
// any way), and a road sign on its post.
export const InfoIcon = ({ size, style }: IconProps) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 7.5h.01" />
    </>,
    style,
  );

export const TickIcon = ({ size, style }: IconProps) => svg(size, <path d="M5 12.5l4.5 4.5L19 7.5" />, style);

export const ArrowUpIcon = ({ size, style }: IconProps) => svg(size, <path d="M12 20V5M6 11l6-6 6 6" />, style);

export const RoadSignIcon = ({ size, style }: IconProps) =>
  svg(
    size,
    <>
      <path d="M12 2.5l6.5 6.5-6.5 6.5L5.5 9z" />
      <path d="M12 15.5v6" />
    </>,
    style,
  );

// "If you’re told to leave": path data from Lucide (ISC licence): door-open, house, coffee, navigation,
// message-circle, pill, wallet, key-round, smartphone, glasses, paw-print.
export const DoorOpenIcon = ({ size, style }: IconProps) =>
  svg(
    size,
    <>
      <path d="M10 21H2" />
      <path d="M10 3H7a2 2 0 0 0-2 2v16" />
      <path d="M14 12h.01" />
      <path d="M19 21V5a2 2 0 0 0-1.675-1.974l-6.163-1.013A1 1 0 0 0 10 3v18a1 1 0 0 0 1.124.992z" />
      <path d="M22 21h-3" />
    </>,
    style,
  );

export const HouseIcon = ({ size, style }: IconProps) =>
  svg(
    size,
    <>
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>,
    style,
  );

export const CoffeeIcon = ({ size, style }: IconProps) =>
  svg(
    size,
    <>
      <path d="M10 2v2" />
      <path d="M14 2v2" />
      <path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" />
      <path d="M6 2v2" />
    </>,
    style,
  );

export const NavigationIcon = ({ size, style }: IconProps) => svg(size, <polygon points="3 11 22 2 13 21 11 13 3 11" />, style);

// "Listen": path data from Lucide "volume-2" (ISC licence); Stop is a filled square.
export const SpeakerIcon = ({ size, style }: IconProps) =>
  svg(
    size,
    <>
      <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
      <path d="M16 9a5 5 0 0 1 0 6" />
      <path d="M19.364 18.364a9 9 0 0 0 0-12.728" />
    </>,
    style,
  );

export const StopIcon = ({ size, style }: IconProps) => svg(size, <rect x="6" y="6" width="12" height="12" rx="2" style={{ fill: "currentColor" }} />, style);

// A break from the smoke, map searches near you: path data from Lucide "map-pin" (ISC licence).
export const MapPinIcon = ({ size, style }: IconProps) =>
  svg(
    size,
    <>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </>,
    style,
  );

export const MessageIcon = ({ size, style }: IconProps) =>
  svg(size, <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" />, style);

export const PillIcon = ({ size, style }: IconProps) =>
  svg(
    size,
    <>
      <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
      <path d="m8.5 8.5 7 7" />
    </>,
    style,
  );

export const WalletIcon = ({ size, style }: IconProps) =>
  svg(
    size,
    <>
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </>,
    style,
  );

export const KeyIcon = ({ size, style }: IconProps) =>
  svg(
    size,
    <>
      <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" />
      <circle cx="16.5" cy="7.5" r=".5" style={{ fill: "currentColor" }} />
    </>,
    style,
  );

export const SmartphoneIcon = ({ size, style }: IconProps) =>
  svg(
    size,
    <>
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
      <path d="M12 18h.01" />
    </>,
    style,
  );

export const GlassesIcon = ({ size, style }: IconProps) =>
  svg(
    size,
    <>
      <circle cx="6" cy="15" r="4" />
      <circle cx="18" cy="15" r="4" />
      <path d="M14 15a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
      <path d="M2.5 13 5 7c.7-1.3 1.4-2 3-2" />
      <path d="M21.5 13 19 7c-.7-1.3-1.5-2-3-2" />
    </>,
    style,
  );

export const PawIcon = ({ size, style }: IconProps) =>
  svg(
    size,
    <>
      <circle cx="11" cy="4" r="2" />
      <circle cx="18" cy="8" r="2" />
      <circle cx="20" cy="16" r="2" />
      <path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" />
    </>,
    style,
  );
