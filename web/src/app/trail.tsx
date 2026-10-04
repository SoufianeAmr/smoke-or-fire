// The screen the person was on just before this one. Remembered while the app is open, and nowhere else.
import { createContext, useContext, useState, type ReactNode } from "react";
import { useLocation } from "react-router";

const Before = createContext<string | null>(null);

/** Follows the address, inside the router. Nothing is stored: after a reload there is no screen before. */
export function Trail({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [trail, setTrail] = useState<{ now: string; before: string | null }>({ now: pathname, before: null });
  // Another screen: the one that was showing is now the one before.
  if (trail.now !== pathname) setTrail({ now: pathname, before: trail.now });
  return <Before.Provider value={trail.before}>{children}</Before.Provider>;
}

/** The address of the screen before this one; null when the app opened on this screen. */
export function useScreenBefore(): string | null {
  return useContext(Before);
}
