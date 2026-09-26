import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translate, type Lang, type StringKey, type Vars } from "../i18n";
import type { VerdictJson } from "../verdict/types";

export type Mode = "live" | "replay";

/** The engine for live mode (GET /verdict), e.g. VITE_ENGINE_URL=http://localhost:8000. Unset: replay only. */
export const ENGINE_URL: string = import.meta.env.VITE_ENGINE_URL ?? "";

export interface Place {
  name: string;
  province: string;
  county: string;
  lat: number;
  lon: number;
  /** Replay only: the file in data/demo/ holding this town's recorded verdict. */
  replayFile?: string;
}

interface Stored {
  mode: Mode;
  lang: Lang;
  place: Place | null;
}

interface AppState extends Stored {
  result: VerdictJson | null;
  setMode: (mode: Mode) => void;
  setLang: (lang: Lang) => void;
  setPlace: (place: Place | null) => void;
  setResult: (result: VerdictJson | null) => void;
  /** Start a new check: keep mode and language, forget the place and result. */
  reset: () => void;
}

const KEY = "smoke-or-fire";
const AppContext = createContext<AppState | null>(null);

function initialState(): Stored {
  let stored: Partial<Stored> = {};
  try {
    stored = JSON.parse(sessionStorage.getItem(KEY) ?? "{}");
  } catch {
    stored = {};
  }
  const urlMode = new URLSearchParams(location.search).get("mode");
  // A build without an engine URL is replay-only: it starts in replay (the QR code also opens ?mode=replay).
  const fallback: Mode = ENGINE_URL ? "live" : "replay";
  const mode: Mode = urlMode === "replay" || urlMode === "live" ? urlMode : stored.mode ?? fallback;
  return { mode, lang: stored.lang ?? "en", place: stored.place ?? null };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Stored>(initialState);
  const [result, setResult] = useState<VerdictJson | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(stored));
    } catch {
      // Private mode or blocked storage: the app still works for this visit.
    }
    document.documentElement.lang = stored.lang;
  }, [stored]);

  const setMode = useCallback((mode: Mode) => {
    setStored((s) => ({ ...s, mode, place: null }));
    setResult(null);
  }, []);
  const setLang = useCallback((lang: Lang) => setStored((s) => ({ ...s, lang })), []);
  const setPlace = useCallback((place: Place | null) => setStored((s) => ({ ...s, place })), []);
  const reset = useCallback(() => {
    setStored((s) => ({ ...s, place: null }));
    setResult(null);
  }, []);

  const value = useMemo(
    () => ({ ...stored, result, setMode, setLang, setPlace, setResult, reset }),
    [stored, result, setMode, setLang, setPlace, reset],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const state = useContext(AppContext);
  if (!state) throw new Error("useApp must be used inside AppProvider");
  return state;
}

export function useT() {
  const { lang } = useApp();
  return useCallback((key: StringKey, vars?: Vars) => translate(lang, key, vars), [lang]);
}
