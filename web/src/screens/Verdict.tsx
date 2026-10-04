// 07a–07d · Verdict: the answer lives on the map. The map fills the screen between the top bar and the 911 bar; over
// its foot a sheet holds the answer, at three heights:
//   peek  the glance card (and the fire-is-close notice): what the screen opens on;
//   half  the three source badges and "Why?";
//   full  everything screens 7a–7d say (design/screens/07a-verdict-drifting.html, 07b, 07c, 07d, 07a-fr).
// The sheet moves by its buttons ("Sources and why", "Show the map", "Why?"); a flick on its handle does the same.
// Back lowers it. Call 911 stays at the foot of the screen at every height.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Link, Navigate } from "react-router";
import { useBackState } from "../app/back";
import { useApp, useT } from "../app/state";
import { Boundary } from "../components/Boundary";
import { ReplayBanner } from "../components/ReplayBanner";
import { Screen } from "../components/Screen";
import { Sticky911 } from "../components/Sticky911";
import { LangToggle } from "../components/TopBar";
import { BackIcon, ChevronDownIcon, ChevronRightIcon, ChevronUpIcon } from "../components/icons";
import type { Lang } from "../i18n";
import { ListenButton } from "../listen/ListenButton";
import { script } from "../listen/speech";
import { Legend } from "../map/Legend";
import { MapStage } from "../map/MapStage";
import { readMap } from "../map/model";
import { mapText, type Basemap } from "../map/text";
import { startMap as startMapFor } from "../map/warm";
import { AnswerInFull, Badges, GlanceLine, GlanceShape, Why } from "../verdict/card";
import { AirQualityCard, ConfidenceCard, TwoPossibilitiesCard, WhatToDoCard, WhyCard } from "../verdict/cards";
import { GLANCE } from "../verdict/glance";
import { VERDICT_ICONS } from "../verdict/marks";
import { room, useOpenedHeight } from "../verdict/room";
import type { VerdictJson } from "../verdict/types";
import { VerdictMap } from "../verdict/VerdictMap";
import { verdictView } from "../verdict/view";

// The Loading screen fetches this file while it shows, and starts the map with these.
export { warmMap } from "../map/warm";
export const startMap = (json: VerdictJson, lang: Lang) => startMapFor(readMap(json), lang);

/** How high the sheet stands. */
export type Detent = "peek" | "half" | "full";
/** A flick on the handle this long, up or down, moves the sheet one height. */
const FLICK_PX = 24;
/** The click that ends a flick comes within this long of it; a later one is a press of its own. */
const FLICK_CLICK_MS = 500;
/** Less map than this above the sheet shows nothing a person can read (it is the room the Legend button needs). */
const MIN_MAP_PX = 84;

const TOP_LINK: CSSProperties = { minHeight: "56px", display: "flex", alignItems: "center", gap: "4px", padding: "0 10px 0 6px", color: "#1A1D21", fontSize: "18px", fontWeight: "700", textDecoration: "none" };

export function Verdict() {
  const { result, lang, reset, place, mode } = useApp();
  const t = useT();
  const height = useOpenedHeight();
  const [detent, setDetent] = useBackState<Detent>("sheet", "peek");
  const [legend, setLegend] = useBackState<"closed" | "open">("legend", "closed");
  const [basemap, setBasemap] = useState<Basemap>("outline");
  // `peek`: how tall the sheet was the last time it held only the card (not known when the screen comes back raised).
  const [space, setSpace] = useState<{ stage: number; sheet: number; top: number; peek: number | null }>({ stage: 0, sheet: 0, top: 64, peek: null });
  const [bar, setBar] = useState(72);
  const sheet = useRef<HTMLDivElement>(null);
  const held = useRef<HTMLDivElement>(null);

  // A town picked from the search is named as picked, and so is every replay town (its verdict is for the town's
  // own point, even when "Use my location" chose it). A live GPS location takes the engine's name for the spot.
  const town = place && (place.source === "search" || mode === "replay") ? place.name : undefined;
  const view = useMemo(() => (result ? verdictView(result, lang, town) : null), [result, lang, town]);
  const model = useMemo(() => (result ? readMap(result) : null), [result]);
  const text = useMemo(() => (result && view && model ? mapText(result, view, model, lang, basemap) : null), [result, view, model, lang, basemap]);
  const shown = result !== null;
  const open = detent === "full";
  // Everything "Why?" opens. Drawn once for an answer, not again each time the screen measures itself or the map
  // reports in: it is out of sight until "Why?" is pressed, and it holds a map of its own.
  const whyAll = useMemo(
    () =>
      result && view ? (
        <>
          {/* Opened, "Why?" moves to the top of the sheet: Listen is under it, and reads everything below. It is
              there only while "Why?" is open, so closing it stops the reading. */}
          {open && <ListenButton sentences={view.voice} style={{ alignSelf: "flex-start" }} />}
          <AnswerInFull view={view} />
          <VerdictMap json={result} view={view} />
          <ConfidenceCard view={view} />
          {view.twoPossibilities && <TwoPossibilitiesCard view={view} />}
          <WhatToDoCard view={view} />
          <AirQualityCard view={view} />
          <WhyCard view={view} startOpen />
        </>
      ) : null,
    [result, view, open],
  );

  // How much of the map the sheet covers, and how tall the 911 bar is (its French line can wrap): the map's frame and
  // the room kept at the foot of the screen follow them.
  useLayoutEffect(() => {
    const [panel, inside, callBar] = [sheet.current, held.current, document.querySelector<HTMLElement>("[data-bar911]")];
    if (!panel || !inside || !panel.parentElement || !callBar) return;
    const wrap = panel.parentElement;
    const topBar = wrap.querySelector<HTMLElement>(".glance-top")!;
    const measure = () => {
      const top = Math.round(topBar.getBoundingClientRect().height);
      // The stage is the room under the top bar: the map's.
      const tall = Math.round(inside.getBoundingClientRect().height);
      setSpace((was) => {
        const next = { stage: Math.round(wrap.getBoundingClientRect().height) - top, sheet: tall, top, peek: panel.dataset.detent === "peek" ? tall : was.peek };
        return was.stage === next.stage && was.sheet === next.sheet && was.top === next.top && was.peek === next.peek ? was : next;
      });
      setBar(Math.round(callBar.getBoundingClientRect().height));
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const el of [wrap, topBar, inside, callBar]) observer.observe(el);
    return () => observer.disconnect();
  }, [shown]);
  // A strip of map too thin to show anything is not shown: the sheet then stands over the whole of it. Raised, a
  // sheet that holds more than the map's room rises over the top bar too (always when "Why?" is open: more room to
  // read); the bar's links are then out of reach, as they are out of sight, until the sheet is lowered. With only the
  // card showing it never does: New check and EN/FR stay in reach, and a card taller than the room scrolls in it.
  const whole = detent === "full" || space.stage - space.sheet < MIN_MAP_PX;
  const covered = whole ? space.stage : space.sheet;
  const overTop = detent === "full" || (detent === "half" && space.sheet > space.stage);
  // Whether lowering the sheet shows the map: not on a screen with no room for both (a small window at 200% zoom).
  const mapAtPeek = space.peek === null || space.stage - space.peek >= MIN_MAP_PX;

  // As the screen opens, the answer takes the focus: a screen reader starts with it, not with the map above it.
  useEffect(() => {
    performance.mark("verdict:shown"); // the map's own marks are timed from here (e2e/perf.spec.ts)
    document.getElementById("verdict-h")?.focus({ preventScroll: true });
  }, []);

  // The sheet opens each height at its top; a change of height is said aloud, once (never as the screen opens).
  const before = useRef(detent);
  const [said, setSaid] = useState<Detent | null>(null);
  useEffect(() => {
    if (before.current === detent) return;
    before.current = detent;
    setSaid(detent);
    if (detent !== "full") sheet.current?.scrollTo({ top: 0 });
  }, [detent]);

  // Closed, the legend gives the focus back to its button.
  const legendWas = useRef(legend);
  useEffect(() => {
    if (legendWas.current === "open" && legend === "closed") document.querySelector<HTMLElement>(".map-head .map-button")?.focus();
    legendWas.current = legend;
  }, [legend]);

  const flick = useRef<{ y: number; done: number | null } | null>(null); // `done`: when a flick moved the sheet
  if (!result || !view || !model || !text) return <Navigate to="/" replace />;

  // Orange circle drifting, amber diamond unclear, red triangle unexplained (7b, 7d).
  const look = GLANCE[view.card.state];
  const raise = () => setDetent(detent === "peek" ? "half" : "full");
  const lower = () => setDetent(detent === "full" ? "half" : "peek");
  const onHandle = () => {
    // The click that ends a flick: the flick already moved the sheet. (A flick by touch ends with no click: one that
    // comes later is a press of its own.)
    const flicked = flick.current?.done ?? null;
    flick.current = null;
    if (flicked !== null && Date.now() - flicked < FLICK_CLICK_MS) return;
    setDetent(detent === "peek" ? "half" : "peek");
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    if (event.key === "ArrowUp" && detent !== "full") raise();
    if (event.key === "ArrowDown" && detent !== "peek") lower();
  };
  const onDown = (event: PointerEvent) => {
    flick.current = { y: event.clientY, done: null };
    // The handle keeps the pointer: a flick ends off the handle, over the map or the card.
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onUp = (event: PointerEvent) => {
    const moved = flick.current ? event.clientY - flick.current.y : 0;
    if (Math.abs(moved) < FLICK_PX) return;
    flick.current = { y: event.clientY, done: Date.now() };
    if (moved < 0 && detent !== "full") raise();
    if (moved > 0 && detent !== "peek") lower();
  };
  // What Listen says with only the card showing: the answer, what the map shows, where the rest is, then 911.
  const peekVoice = [...view.card.lead, ...text.said, ...script(lang, "voice.card.more", { more: t("sheet.more") }), ...view.card.call];

  return (
    // How much room there is: a tighter card on a small phone (verdict/room.ts, styles.css). The screen is as tall as
    // the phone and does not scroll: the sheet does.
    <Screen className={`verdict-screen ${room(height, view.notice !== null)}`} style={{ minHeight: "0", paddingBottom: `${bar}px` }}>
      <ReplayBanner />
      <div className="stage-wrap">
        <div className="glance-top" inert={overTop} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px 0 4px", height: "64px" }}>
          <Link to="/" onClick={reset} style={TOP_LINK}>
            <BackIcon size={26} />
            {t("nav.newCheck")}
          </Link>
          <LangToggle />
        </div>
        {/* The map is an extra: if it breaks while drawing, the answer under it is still given, and a note says so. */}
        <Boundary
          fallback={
            <section className="map-stage" aria-label={t("map.region")} data-broken="true">
              <div className="map-head">
                <p className="map-note" role="status">{t("map.note.broken")}</p>
              </div>
            </section>
          }
        >
          <MapStage json={result} view={view} model={model} covered={covered} hidden={whole || legend === "open"} legendOpen={legend === "open"} onLegend={() => setLegend("open")} onBasemap={setBasemap} />
        </Boundary>
        <div ref={sheet} className="answer-sheet" data-detent={detent} data-whole={whole || undefined} inert={legend === "open"}>
          <div ref={held}>
          <button type="button" className="sheet-handle" onClick={onHandle} onKeyDown={onKey} onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => (flick.current = null)}>
            <span className="sheet-grip" aria-hidden="true" />
            <span className="sheet-handle-label">
              {detent === "peek" ? t("sheet.more") : mapAtPeek ? t("sheet.less") : t("sheet.close")}
              {detent === "peek" ? <ChevronUpIcon size={22} /> : <ChevronDownIcon size={22} />}
            </span>
          </button>
          <section aria-labelledby="verdict-h" className="glance" data-state={view.card.state} style={{ background: look.background, color: look.ink, padding: "14px 20px 20px", display: "flex", flexDirection: "column" }}>
            {/* Listen reads the line, then what shows under it: the map at peek, the badges' names at half. With "Why?"
                open it sits there, with what it then reads. */}
            <div className="glance-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px" }}>
              <GlanceShape state={view.card.state} />
              {detent !== "full" && <ListenButton sentences={detent === "peek" ? peekVoice : view.card.voice} />}
            </div>
            <GlanceLine card={view.card} />
          </section>
          <main className="verdict-main" style={{ display: detent === "peek" && !view.notice ? "none" : "flex", flexDirection: "column", gap: "16px", padding: "16px" }}>
            {view.notice && (
              // The fire is under 25 km away: follow officials, and what to do if told to leave, for this place. It stays
              // in front at every height: it is what to do, not why.
              <section style={{ background: "#FFFFFF", borderRadius: "18px", padding: "18px 20px 8px", display: "flex", flexDirection: "column", gap: "4px", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)" }}>
                <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  <span style={{ flexShrink: "0", width: "44px", height: "44px", borderRadius: "50%", background: "#1B2A4A", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg className="ic" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: "2.3" }}>{VERDICT_ICONS.warning}</svg>
                  </span>
                  <p style={{ margin: "0", fontSize: "18px", fontWeight: "700", lineHeight: "1.45", textWrap: "pretty" }}>{view.notice.text}</p>
                </div>
                <Link to="/leave" style={{ alignSelf: "flex-start", minHeight: "56px", display: "flex", alignItems: "center", gap: "6px", marginLeft: "58px", fontSize: "18px", fontWeight: "700", lineHeight: "1.3", color: "#1B2A4A" }}>
                  {view.notice.link}
                  <ChevronRightIcon size={20} />
                </Link>
              </section>
            )}
            {/* Out of reach at peek, not only out of sight: nothing in it takes the focus. */}
            <div className="sheet-more" hidden={detent === "peek"}>
              <Badges badges={view.badges} title={t("badges.title")} />
              <Why card={view.card} open={open} onToggle={() => setDetent(open ? "half" : "full")}>
                {whyAll}
              </Why>
            </div>
          </main>
          </div>
        </div>
        {legend === "open" && (
          <Boundary fallback={null} onError={() => setLegend("closed")}>
            <Legend text={text} onClose={() => setLegend("closed")} />
          </Boundary>
        )}
      </div>
      <p className="sr-only" role="status">{said ? t(said === "peek" && !mapAtPeek ? "sheet.status.peek.noMap" : `sheet.status.${said}`) : ""}</p>
      <Sticky911 callFirst={view.card.callFirst} />
    </Screen>
  );
}
