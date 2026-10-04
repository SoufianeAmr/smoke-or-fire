// 03b · The third question: Is anything burning nearby? Only "Nothing" goes on to the trace; a neighbour's fire pit has
// its own short screen; every other answer goes to Call 911 now.
import type { CSSProperties, ReactNode } from "react";
import { useApp, useT } from "../app/state";
import { ReplayBanner } from "../components/ReplayBanner";
import { Screen } from "../components/Screen";
import { Sticky911 } from "../components/Sticky911";
import { TopBar } from "../components/TopBar";
import type { StringKey } from "../i18n";
import { q3Voice } from "../listen/speech";
import { About, Answer, Answers, GRID, ICON_TILE, MAIN, Steps, TILE_LABEL, TITLE, useTitleFocus, whole } from "../look/parts";
import { Disc, FirePitMark, MulchMark, NoFireMark, OtherFireMark, PeopleMark, QuestionMark } from "../look/pictures";
import { Q3_ANSWERS, ROUTES, type Q3Answer } from "../look/routing";

// The space around the icon and the words is theirs, not the tile's: short phones tighten it (styles.css).
const ICON: CSSProperties = { display: "flex", margin: "12px 0 8px" };
const LABEL: CSSProperties = { ...TILE_LABEL, margin: "0 6px 12px" };

const LOOK: Record<Q3Answer, { label: StringKey; disc: ReactNode }> = {
  firePit: { label: "q3.firePit", disc: <Disc tone="navy" size={48}><FirePitMark /></Disc> },
  mulch: { label: "q3.mulch", disc: <Disc tone="navy" size={48}><MulchMark /></Disc> },
  people: { label: "q3.people", disc: <Disc tone="navy" size={48}><PeopleMark /></Disc> },
  other: { label: "q3.other", disc: <Disc tone="navy" size={48}><OtherFireMark /></Disc> },
  nothing: { label: "q3.nothing", disc: <Disc tone="navy" size={48}><NoFireMark /></Disc> },
  notSure: { label: "look.notSure", disc: <Disc tone="amber" size={48}><QuestionMark /></Disc> },
};

export function Q3Nearby() {
  const { lang } = useApp();
  const t = useT();
  const title = useTitleFocus();
  return (
    <Screen>
      <ReplayBanner />
      <TopBar back="/q2" listen={q3Voice(lang)}>
        <Steps n={3} />
      </TopBar>
      <main className="look-main" style={MAIN}>
        <h1 id="look-q" className="look-title" tabIndex={-1} ref={title} style={TITLE}>{whole(t("q3.title"))}</h1>
        <Answers style={GRID}>
          {Q3_ANSWERS.map((answer) => (
            <Answer key={answer} answer={answer} to={ROUTES.q3[answer]} shape="tile" style={ICON_TILE}>
              <span className="look-icon" style={ICON}>{LOOK[answer].disc}</span>
              <span className="look-label" style={LABEL}>{whole(t(LOOK[answer].label))}</span>
            </Answer>
          ))}
        </Answers>
        <About />
      </main>
      <Sticky911 />
    </Screen>
  );
}
