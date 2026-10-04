// What a screen has open (a raised sheet, a panel), kept in the browser's history: Back closes it, and coming back to
// the screen from another finds it as it was left. Nothing is stored anywhere else.
import { useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router";

/**
 * A value that lives in this history entry's state under `key`; without one it is `closed`. Leaving `closed` adds an
 * entry, so Back returns to it; a change between two open values replaces the entry; going back to `closed` is Back.
 */
export function useBackState<T extends string>(key: string, closed: T): [T, (next: T) => void] {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (typeof location.state === "object" && location.state !== null ? location.state : {}) as Record<string, unknown>;
  const value = (typeof state[key] === "string" ? state[key] : closed) as T;
  // A change is asked from one history entry and lands a moment later. Until it has, a second ask (a double tap, a key
  // held down) is the same ask: without this, two Backs would leave the screen. If nothing lands, a second later the
  // ask can be made again.
  const asked = useRef<{ from: string; at: number } | null>(null);
  const set = useCallback(
    (next: T) => {
      if (next === value) return;
      if (asked.current?.from === location.key && Date.now() - asked.current.at < 1000) return;
      asked.current = { from: location.key, at: Date.now() };
      if (next === closed) navigate(-1);
      else navigate(location.pathname + location.search, { state: { ...state, [key]: next }, replace: value !== closed });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, closed, key, navigate, location.key, location.pathname, location.search, location.state],
  );
  return [value, set];
}
