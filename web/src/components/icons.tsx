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

export const DarkSmokeIcon = ({ size, style }: IconProps) =>
  svg(size, <path d="M5.5 18.5a3.5 3.5 0 0 1-.4-6.98A5 5 0 0 1 14.5 9a4 4 0 0 1 6 3.4 3.1 3.1 0 0 1-1.5 6.1z" style={{ fill: "#2D2926" }} />, style);

export const PhoneIcon = ({ size, style }: IconProps) =>
  svg(size, <path d="M5.5 3.5h3l1.8 4.6-2.2 1.4a11 11 0 0 0 6.4 6.4l1.4-2.2 4.6 1.8v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3.5 5.7a2 2 0 0 1 2-2.2z" />, style);

export const CloseIcon = ({ size, style }: IconProps) => svg(size, <path d="M6 6l12 12M18 6L6 18" />, style);

export const BackIcon = ({ size, style }: IconProps) => svg(size, <path d="M15 5l-7 7 7 7" />, style);

export const ChevronRightIcon = ({ size, style }: IconProps) => svg(size, <path d="M9 5l7 7-7 7" />, style);

export const ChevronDownIcon = ({ size, style }: IconProps) => svg(size, <path d="M6 9l6 6 6-6" />, style);

export const ChevronUpIcon = ({ size, style }: IconProps) => svg(size, <path d="M6 15l6-6 6 6" />, style);
