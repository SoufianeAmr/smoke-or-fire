// "What to take", as a list to tick. Which boxes are ticked is kept on the phone and nowhere else, in the browser's
// storage for this page's session: it is there after a reload or a look at another screen, and gone when the page is
// closed. Nothing is written until a box is ticked, and nothing is left once the last one is unticked.
import { useCallback, useEffect, useState } from "react";

const KEY = "smoke-or-fire-take";

function read(): string[] {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function write(ticked: string[]) {
  try {
    if (ticked.length > 0) sessionStorage.setItem(KEY, JSON.stringify(ticked));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Private mode or blocked storage: the ticks last while the screen is open.
  }
}

/** The ticked items, and a way to tick or untick one. */
export function useTicks(): [ticked: ReadonlySet<string>, toggle: (item: string) => void] {
  const [ticked, setTicked] = useState<string[]>(read);
  useEffect(() => write(ticked), [ticked]);
  const toggle = useCallback((item: string) => setTicked((now) => (now.includes(item) ? now.filter((other) => other !== item) : [...now, item])), []);
  return [new Set(ticked), toggle];
}
