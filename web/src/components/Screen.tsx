import type { CSSProperties, ReactNode } from "react";

// The root <div> of every screen file, adapted from a fixed 390 × 844 px frame to a phone:
// full width up to the 480 px maximum (DESIGN-LOCK), at least the height of the screen.
export const SCREEN: CSSProperties = {
  width: "100%",
  maxWidth: "480px",
  minHeight: "100dvh",
  margin: "0 auto",
  position: "relative",
  overflow: "hidden",
  background: "#FAF6F0",
  color: "#1A1D21",
  fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif",
  display: "flex",
  flexDirection: "column",
};

export function Screen({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...SCREEN, ...style }}>{children}</div>;
}

// The sticky 911 bar and tip cards sit at the bottom of the frame in the screen files
// (position: absolute). On a scrolling page they are fixed to the bottom of the viewport,
// inside the same 480 px column.
export const FIXED_BOTTOM: CSSProperties = {
  position: "fixed",
  left: "50%",
  transform: "translateX(-50%)",
  width: "100%",
  maxWidth: "480px",
};
