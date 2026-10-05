// 02 · The first question: Do you see flames? Yes and Not sure go to Call 911 now; No goes on to the sky. The three
// answers are cards of one size and one style: colour is their icon's alone, so no answer is pressed on the person.
import type { CSSProperties, ReactNode } from "react";
import { useApp, useT } from "../app/state";
import { ReplayBanner } from "../components/ReplayBanner";
import { Screen } from "../components/Screen";
import { Sticky911 } from "../components/Sticky911";
import { TopBar } from "../components/TopBar";
import type { StringKey } from "../i18n";
import { q1Voice } from "../listen/speech";
import { About, Answer, Answers, MAIN, Steps, TITLE, useTitleFocus, whole } from "../look/parts";
import { CrossMark, Disc, FlameMark, QuestionMark } from "../look/pictures";
import { Q1_ANSWERS, ROUTES, type Q1Answer } from "../look/routing";

// Three rows of one height, whatever their words: white, with a navy edge and navy words.
const ROWS: CSSProperties = { display: "grid", gridAutoRows: "1fr", gap: "16px" };
const ROW: CSSProperties = { display: "flex", alignItems: "center", gap: "16px", minHeight: "128px", padding: "12px 20px", borderRadius: "18px", textDecoration: "none", background: "#FFFFFF", border: "3px solid #1B2A4A", color: "#1B2A4A" };
const LABEL: CSSProperties = { fontSize: "30px", fontWeight: "800", lineHeight: "1.05", letterSpacing: "-0.01em" };

// A red flame, a calm cross, an amber question mark.
const LOOK: Record<Q1Answer, { label: StringKey; disc: ReactNode }> = {
  yes: { label: "q1.yes", disc: <Disc tone="flame" size={64}><FlameMark /></Disc> },
  no: { label: "q1.no", disc: <Disc tone="navy" size={64}><CrossMark /></Disc> },
  notSure: { label: "look.notSure", disc: <Disc tone="amber" size={64}><QuestionMark /></Disc> },
};

export function Q1Flames() {
  const { lang } = useApp();
  const t = useT();
  const title = useTitleFocus();
  return (
    <Screen>
      <ReplayBanner />
      <TopBar back="/" listen={q1Voice(lang)} words>
        <Steps n={1} />
      </TopBar>
      <main className="look-main" style={MAIN}>
        <h1 id="look-q" className="look-title" tabIndex={-1} ref={title} style={TITLE}>{whole(t("q1.title"))}</h1>
        <Answers style={ROWS}>
          {Q1_ANSWERS.map((answer) => (
            <Answer key={answer} answer={answer} to={ROUTES.q1[answer]} shape="row" style={ROW}>
              {LOOK[answer].disc}
              <span className="look-label" style={LABEL}>{t(LOOK[answer].label)}</span>
            </Answer>
          ))}
        </Answers>
        <About />
      </main>
      <Sticky911 />
    </Screen>
  );
}
