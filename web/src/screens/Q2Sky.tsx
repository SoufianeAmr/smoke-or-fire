// 03a · The second question: Which looks like your sky? A rising column or Not sure goes to Call 911 now; grey haze
// or only a smell goes on to what is burning nearby.
import type { CSSProperties, ReactNode } from "react";
import { useApp, useT } from "../app/state";
import { ReplayBanner } from "../components/ReplayBanner";
import { Screen } from "../components/Screen";
import { Sticky911 } from "../components/Sticky911";
import { TopBar } from "../components/TopBar";
import type { StringKey } from "../i18n";
import { q2Voice } from "../listen/speech";
import { About, Answer, Answers, GRID, ICON_TILE, MAIN, Steps, TILE, TILE_LABEL, TITLE, useTitleFocus, whole } from "../look/parts";
import { ColumnSky, Disc, HazeSky, QuestionMark, SmellSky } from "../look/pictures";
import { Q2_ANSWERS, ROUTES, type Q2Answer } from "../look/routing";

// The words under a picture, in the middle of what is left of the tile. Two words a line at most: not evened out.
const CAPTION: CSSProperties = { ...TILE_LABEL, margin: "auto 0", padding: "8px 8px 10px", textWrap: "pretty" };
// The night picture runs to the tile's rounded corners: navy under its top, so no white shows along their curve.
const NIGHT: CSSProperties = { ...TILE, backgroundImage: "linear-gradient(#1B2A4A, #1B2A4A)", backgroundSize: "100% 40px", backgroundRepeat: "no-repeat" };
// Not sure has no picture: the question mark and its words, in a tile of the same size.
const UNSURE: CSSProperties = { ...ICON_TILE, gap: "10px", padding: "12px 8px" };

/** The three sky pictures: what each shows (said by a screen reader before its caption), and the words under it. */
const SKIES: Partial<Record<Q2Answer, { picture: (label: string) => ReactNode; alt: StringKey; caption: StringKey; tile?: CSSProperties }>> = {
  column: { picture: (label) => <ColumnSky label={label} />, alt: "q2.column.alt", caption: "q2.column" },
  haze: { picture: (label) => <HazeSky label={label} />, alt: "q2.haze.alt", caption: "q2.haze" },
  smell: { picture: (label) => <SmellSky label={label} />, alt: "q2.smell.alt", caption: "q2.smell", tile: NIGHT },
};

export function Q2Sky() {
  const { lang } = useApp();
  const t = useT();
  const title = useTitleFocus();
  return (
    <Screen>
      <ReplayBanner />
      <TopBar back="/q1" listen={q2Voice(lang)}>
        <Steps n={2} />
      </TopBar>
      <main className="look-main" style={MAIN}>
        <h1 id="look-q" className="look-title" tabIndex={-1} ref={title} style={TITLE}>{whole(t("q2.title"))}</h1>
        <Answers style={GRID}>
          {Q2_ANSWERS.map((answer) => {
            const sky = SKIES[answer];
            return sky ? (
              <Answer key={answer} answer={answer} to={ROUTES.q2[answer]} shape="tile" style={sky.tile ?? TILE}>
                {sky.picture(t(sky.alt))}
                <span className="look-caption" style={CAPTION}>{t(sky.caption)}</span>
              </Answer>
            ) : (
              <Answer key={answer} answer={answer} to={ROUTES.q2[answer]} shape="tile" style={UNSURE}>
                <Disc tone="amber" size={64}><QuestionMark /></Disc>
                <span className="look-label" style={TILE_LABEL}>{t("look.notSure")}</span>
              </Answer>
            );
          })}
        </Answers>
        <About />
      </main>
      <Sticky911 />
    </Screen>
  );
}
