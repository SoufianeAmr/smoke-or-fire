// The burn status as the verdict screen shows it, for the badge in the row and for the card: one view, on one clock,
// so the two never differ.
import { useEffect, useState } from "react";
import { useApp } from "../app/state";
import type { VerdictJson } from "../verdict/types";
import { burnView, type BurnView } from "./view";

/** The phone's clock, read again each minute and when the page is shown again: a screen left open must not keep
 *  saying "valid until 2 p.m. tomorrow" the day after. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const read = () => setNow(Date.now());
    const timer = window.setInterval(read, 60_000);
    document.addEventListener("visibilitychange", read);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", read);
    };
  }, []);
  return now;
}

/** Null outside New Brunswick, and for an answer from an older engine: no badge, no card. */
export function useBurnView(json: VerdictJson | null): BurnView | null {
  const { lang, place, mode, shared } = useApp();
  const now = useNow();
  if (!json) return null;
  return burnView(json, lang, {
    // The town as the verdict names it: the one picked from the search, or the replay town.
    town: place && (place.source === "search" || mode === "replay") ? place.name : undefined,
    now,
    // The phone's own spot (live, "Use my location"): how sure the phone was of it.
    accuracy: mode === "live" && place?.source === "gps" ? shared?.accuracy : undefined,
  });
}
