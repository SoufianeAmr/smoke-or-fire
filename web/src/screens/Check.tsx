// 01 · Check, the home screen: a layout of its own, in the app's colours and Inter (design/DESIGN-LOCK.md, "Amendment:
// the home screen"). Its rules are in styles.css, under "01 Check".
import { useEffect, type CSSProperties } from "react";
import { Link } from "react-router";
import { useApp, useT } from "../app/state";
import { Screen } from "../components/Screen";
import { ChevronRightIcon, FlameIcon } from "../components/icons";
import { wakeEngine } from "../data/live";
import type { Lang } from "../i18n";
import { useInstall } from "../keep/keep";
import { KeepOnPhone } from "../keep/KeepOnPhone";
import { ListenButton } from "../listen/ListenButton";
import { checkVoice } from "../listen/speech";

// Listen as words beside the language link, with no outline. Its 56 px to tap stay.
const LISTEN: CSSProperties = { padding: "0 12px 0 4px", border: "0", borderRadius: "4px", background: "transparent", fontSize: "16px" };

/** The language the screen is not in, named in its own words: "Français" on the English screen, "English" on the French. */
const OTHER: Record<Lang, { code: Lang; name: "lang.fr" | "lang.en" }> = {
  en: { code: "fr", name: "lang.fr" },
  fr: { code: "en", name: "lang.en" },
};

const NBSP = String.fromCharCode(0xa0);

// Two wisps of smoke, the second fainter: the app's mark, and the sign on "I smell smoke".
const Wisps = () => (
  <>
    <path d="M25 50c-5-5 5-9 0-15s5-9 0-15" />
    <path d="M38 50c-5-5 5-9 0-15s5-9 0-15" style={{ opacity: "0.6" }} />
  </>
);

// The app's mark, small: the navy tile with the two wisps, as on the home-screen icon.
const Logo = () => (
  <svg className="home-logo" viewBox="0 0 64 64" aria-hidden="true">
    <rect x="0" y="0" width="64" height="64" rx="18" style={{ fill: "#1B2A4A" }} />
    <g style={{ fill: "none", stroke: "#FFFFFF", strokeWidth: "3.5", strokeLinecap: "round" }}>
      <Wisps />
    </g>
  </svg>
);

// The mark's two wisps alone, in the colour of the button's words.
const SmokeIcon = () => (
  <svg className="ic" width="30" height="30" viewBox="14 17 36 36" aria-hidden="true" style={{ strokeWidth: "3.5" }}>
    <Wisps />
  </svg>
);

/**
 * What the app is for, at a glance: far off and upwind, a small fire; the wind carries its smoke to a house, which
 * stands in the haze. The story is in the foot of the drawing (from 88 down, of 168), so a short phone shows that strip
 * alone: the sky above it is cut, never the house, the arrow or the fire. Its colours are in styles.css. The flame is
 * FlameIcon's.
 */
const Picture = ({ label }: { label: string }) => (
  <svg className="home-picture" viewBox="0 0 336 168" preserveAspectRatio="xMidYMax slice" role="img" aria-label={label}>
    <path className="pic-hill" d="M0 138C16 126 34 119 52 121C74 124 92 138 124 151H0z" />
    <path className="pic-haze" d="M50 110C46 92 64 80 96 74C150 64 230 44 336 30V150H208C178 150 162 140 136 131C104 122 70 126 50 110z" />
    <g className="pic-smoke">
      <path d="M50 110C50 94 72 88 100 86C140 83 176 76 214 66C196 86 160 100 122 106C92 110 66 118 50 110z" />
      <rect x="170" y="50" width="112" height="7" rx="3.5" />
      <rect x="236" y="70" width="100" height="6" rx="3" />
      <rect x="112" y="126" width="58" height="6" rx="3" />
    </g>
    <path className="pic-ground" d="M0 151C60 147 110 150 168 150S276 148 336 150V168H0z" />
    <g className="pic-trees">
      <path d="M15 128l5-15 5 15z" />
      <path d="M25 126l6-18 6 18z" />
      <path d="M62 128l5-14 5 14z" />
    </g>
    <path
      className="pic-fire"
      transform="translate(39.8 105.7) scale(.85)"
      d="M12 21.5c3.9 0 6.5-2.6 6.5-6.3 0-3-1.8-5.3-3.4-7-.4 1.6-1.2 2.6-2.3 3.2.4-3.2-1-6.3-3.8-8.9.2 3.4-1.5 5.4-3 7.3-1.2 1.6-2 3.2-2 5.4 0 3.7 2.6 6.3 6.5 6.3z"
    />
    <g className="pic-wind">
      <path d="M104 108h86M178 96l12 12-12 12" />
      <path className="pic-gust" d="M84 97h26M92 119h18" />
    </g>
    <g className="pic-house">
      <rect className="pic-wall" x="247" y="121" width="44" height="29" />
      <path className="pic-roof" d="M239 122l30-23 30 23z" />
      <rect x="264" y="132" width="10" height="18" />
      <rect x="279" y="129" width="7" height="7" />
    </g>
    {/* Wisps in front of the house, at its sides: it stands in the haze, not before it. */}
    <g className="pic-smoke">
      <rect x="222" y="137" width="36" height="7" rx="3.5" />
      <rect x="288" y="127" width="40" height="6" rx="3" />
      <rect x="296" y="141" width="40" height="6" rx="3" />
    </g>
  </svg>
);

const Tick = () => (
  <svg className="ic" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: "3" }}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export function Check() {
  const { mode, lang, setMode, setLang, reset } = useApp();
  const t = useT();
  const isReplay = mode === "replay";
  const install = useInstall();
  const other = OTHER[lang];
  // Live: one quiet request wakes the engine as the app opens, so it is usually up by the end of the three questions.
  // Replay never calls the engine, not even for this.
  useEffect(() => {
    if (!isReplay) wakeEngine();
  }, [isReplay]);

  return (
    <Screen className="home">
      <header className="home-top">
        {/* The screen's title: the app's name, small. */}
        <h1 className="home-brand">
          <Logo />
          <span className="home-brand-name">{t("check.title")}</span>
        </h1>
        <div className="home-tools">
          <ListenButton sentences={checkVoice(lang, isReplay, install.offered)} style={LISTEN} />
          <button type="button" lang={other.code} onClick={() => setLang(other.code)} className="home-lang">{t(other.name)}</button>
        </div>
      </header>
      <main className="home-main">
        {/* What the app is for, in a drawing and a line: nothing has been checked yet, so the card states no finding. */}
        <section className="home-status">
          <Picture label={t("check.picture")} />
          <p className="home-status-text">{t("check.tagline")}</p>
          <div className="home-data">
            {/* Which data the check reads: today's, or the recorded day. One switch; the option in use is filled and
                ticked. The replay's two parts sit one over the other, so both options are the same size on a phone. */}
            <div role="group" aria-label={t("check.modeGroup")} className="home-switch">
              <button type="button" aria-pressed={!isReplay} onClick={() => isReplay && setMode("live")} className="home-option">
                {!isReplay && <Tick />}
                {t("check.live")}
              </button>
              <button type="button" aria-pressed={isReplay} aria-describedby={isReplay ? "home-recorded" : undefined} onClick={() => !isReplay && setMode("replay")} className="home-option">
                {isReplay && <Tick />}
                <span className="home-option-words">
                  <span>{t("check.replayName")}</span>
                  <span className="home-option-dot">{`${NBSP}· `}</span>
                  <span className="home-option-day">{t("check.replayDay")}</span>
                </span>
              </button>
            </div>
            {isReplay && <p id="home-recorded" className="home-recorded">{t("check.replayNote")}</p>}
          </div>
        </section>
        <Link to="/q1" onClick={reset} aria-describedby="home-privacy" className="home-action home-check press">
          <SmokeIcon />
          {t("check.cta")}
        </Link>
        <p id="home-privacy" className="home-note">{t("check.privacy")}</p>
        {/* This screen's Call 911: its own button, so there is no 911 bar under it (as on Call 911 now). It says the
            number it dials. */}
        <a href="tel:911" className="home-action home-call press">
          <FlameIcon size={28} />
          <span className="home-call-words">
            <span>{t("check.flames")}</span>
            <span className="home-call-number">{t("sticky.call")}</span>
          </span>
        </a>
        <Link to="/how-it-works" className="home-how">
          {t("check.howItWorks")}
          <ChevronRightIcon size={18} />
        </Link>
        <KeepOnPhone offered={install.offered} platform={install.platform} />
      </main>
    </Screen>
  );
}
