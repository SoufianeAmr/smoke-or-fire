import type { CSSProperties, ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useApp, useT } from "../app/state";
import type { Lang } from "../i18n";
import { ListenButton } from "../listen/ListenButton";
import { BackIcon } from "./icons";

const GROUP_ON_PAGE: CSSProperties = { display: "flex", alignItems: "center", height: "44px", padding: "3px", borderRadius: "999px", background: "#FFFFFF", border: "1.5px solid #D6CDBF" };
const GROUP_ON_BAND: CSSProperties = { display: "flex", alignItems: "center", height: "44px", padding: "3px", borderRadius: "999px", background: "#FFFFFF" };
const BUTTON: CSSProperties = { height: "56px", margin: "-10px 0", padding: "0", border: "0", background: "transparent", display: "flex", alignItems: "center", font: "inherit", cursor: "pointer" };

/** EN / FR switch. "page" is the bordered one on the beige screens; "band" sits on a verdict band. */
export function LangToggle({ on = "page" }: { on?: "page" | "band" }) {
  const { lang, setLang } = useApp();
  const t = useT();
  const pill = (active: boolean): CSSProperties => ({
    display: "flex", alignItems: "center", justifyContent: "center", width: "56px",
    height: on === "band" ? "38px" : "35px", borderRadius: "999px",
    ...(active ? { background: "#1B2A4A", color: "#FFFFFF" } : { color: "#1A1D21" }),
    fontSize: "18px", fontWeight: "700",
  });
  const button = (code: Lang, label: string, ariaLabel?: string) => (
    <button type="button" aria-pressed={lang === code} lang={code} aria-label={ariaLabel} onClick={() => setLang(code)} style={BUTTON}>
      <span style={pill(lang === code)}>{label}</span>
    </button>
  );
  return (
    <div role="group" aria-label={t("lang.group")} style={on === "band" ? GROUP_ON_BAND : GROUP_ON_PAGE}>
      {button("en", "EN")}
      {button("fr", "FR", t("lang.fr"))}
    </div>
  );
}

// Listen as words beside the language link, with no outline. Its 56 px to tap stay.
const LISTEN: CSSProperties = { padding: "0 12px 0 4px", border: "0", borderRadius: "4px", background: "transparent", fontSize: "16px" };

/** The language the screen is not in, named in its own words: "Français" on the English screen, "English" on the French. */
const OTHER: Record<Lang, { code: Lang; name: "lang.fr" | "lang.en" }> = {
  en: { code: "fr", name: "lang.fr" },
  fr: { code: "en", name: "lang.en" },
};

/**
 * The right of the home screen's top bar, and of every bar made like it: Listen as words, then one link that names the
 * other language. With `listen`, those sentences are said aloud. Its rules are in styles.css, under "01 Check".
 */
export function Tools({ listen }: { listen?: string[] }) {
  const { lang, setLang } = useApp();
  const t = useT();
  const other = OTHER[lang];
  return (
    <div className="home-tools">
      {listen && <ListenButton sentences={listen} style={LISTEN} />}
      <button type="button" lang={other.code} onClick={() => setLang(other.code)} className="home-lang">{t(other.name)}</button>
    </div>
  );
}

/**
 * Back arrow on the left, language switch on the right (screens 02–06, 08, 09). `back` is a route, or -1 for the previous
 * screen. With `listen`, a Listen button before the language switch says those sentences aloud (`listenOnDevice`: only
 * with a voice that works on the device). Children sit right after the Back link (the questions' progress mark).
 * `words`: the home screen's top bar, with Back where its name is (the three questions and Call 911 now): the same
 * height and margins, Listen as words and the language as one link. `direct`: where Back leads when the screen was
 * opened by its address and `back` is -1 (Check, unless said).
 */
export function TopBar({ back, listen, listenOnDevice, words, direct = "/", children }: { back: string | -1; listen?: string[]; listenOnDevice?: boolean; words?: boolean; direct?: string; children?: ReactNode }) {
  const t = useT();
  const navigate = useNavigate();
  // Opened directly (a link or bookmark), there is no previous screen in the app: the link goes to Check, or to `direct`.
  const inApp = useLocation().key !== "default";
  const onClick = back === -1 && inApp ? (e: React.MouseEvent) => { e.preventDefault(); navigate(-1); } : undefined;
  if (words) {
    return (
      <header className="home-top">
        <Link to={back === -1 ? direct : back} onClick={onClick} aria-label={t("nav.back")} className="home-back">
          <BackIcon size={28} />
        </Link>
        {children}
        <Tools listen={listen} />
      </header>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 12px 0 4px", height: "64px" }}>
      <Link to={back === -1 ? direct : back} onClick={onClick} aria-label={t("nav.back")} style={{ width: "56px", height: "56px", display: "flex", alignItems: "center", justifyContent: "center", color: "#1A1D21", borderRadius: "14px" }}>
        <BackIcon size={28} />
      </Link>
      {children}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {listen && <ListenButton sentences={listen} onDevice={listenOnDevice} />}
        <LangToggle />
      </div>
    </div>
  );
}
