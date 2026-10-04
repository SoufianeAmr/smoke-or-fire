// 02 · The first question: Do you see flames? Yes and Not sure go to Call 911 now; No goes on to the sky.
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

// Three rows of one height, whatever their words.
const ROWS: CSSProperties = { display: "grid", gridAutoRows: "1fr", gap: "16px" };
const ROW: CSSProperties = { display: "flex", alignItems: "center", gap: "16px", minHeight: "128px", padding: "12px 20px", borderRadius: "18px", textDecoration: "none" };
// Red is for Yes alone. Its border is red too, so its disc and word line up with the two rows under it.
const RED: CSSProperties = { ...ROW, background: "#D92D20", border: "3px solid #D92D20", color: "#FFFFFF", boxShadow: "0 10px 24px rgba(217, 45, 32, 0.22)" };
const PLAIN: CSSProperties = { ...ROW, background: "#FFFFFF", border: "3px solid #1B2A4A", color: "#1B2A4A" };
const LABEL: CSSProperties = { fontSize: "30px", fontWeight: "800", lineHeight: "1.05", letterSpacing: "-0.01em" };

const LOOK: Record<Q1Answer, { label: StringKey; style: CSSProperties; disc: ReactNode }> = {
  yes: { label: "q1.yes", style: RED, disc: <Disc tone="flame" size={64}><FlameMark /></Disc> },
  no: { label: "q1.no", style: PLAIN, disc: <Disc tone="navy" size={64}><CrossMark /></Disc> },
  notSure: { label: "look.notSure", style: PLAIN, disc: <Disc tone="amber" size={64}><QuestionMark /></Disc> },
};

export function Q1Flames() {
  const { lang } = useApp();
  const t = useT();
  const title = useTitleFocus();
  return (
    <Screen>
      <ReplayBanner />
      <TopBar back="/" listen={q1Voice(lang)}>
        <Steps n={1} />
      </TopBar>
      <main className="look-main" style={MAIN}>
        <h1 id="look-q" className="look-title" tabIndex={-1} ref={title} style={TITLE}>{whole(t("q1.title"))}</h1>
        <Answers style={ROWS}>
          {Q1_ANSWERS.map((answer) => (
            <Answer key={answer} answer={answer} to={ROUTES.q1[answer]} shape="row" style={LOOK[answer].style}>
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
