// /dispatch · The dispatch board, for a 911 call taker at a desk, by keyboard. Not linked from the public flow.
// Type the caller's town: the answer and its sources. Ask the three questions: where the public app's routing ends.
// Mark a known smoke event: a message and an image to post, drafted and never posted. Decision support only.
// Nothing about a call is kept: the place, the answers and the drafts are this screen's own state, gone on reload.
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Link } from "react-router";
import { useApp, useT, type Place } from "../app/state";
import { LangToggle } from "../components/TopBar";
import { BellIcon, ExternalIcon, FlameIcon, SatelliteIcon, WindIcon } from "../components/icons";
import { loadLiveVerdict } from "../data/live";
import { usePlaces } from "../data/places";
import { REPLAY_TOWNS, loadReplayVerdict, searchPlaces } from "../data/replay";
import { board, callNotes, given, outcome, progress, publicMessage, questions, shareImage, surgeCheck, type Answer, type Answers, type Board, type Fact, type Outcome, type Step } from "../dispatch/board";
import "../dispatch/dispatch.css";
import { downloadPng, drawShare, SHARE_HEIGHT, SHARE_WIDTH } from "../dispatch/share";
import { dt, type DispatchKey } from "../dispatch/strings";
import type { Lang, StringKey, Vars } from "../i18n";
import { ListenButton } from "../listen/ListenButton";
import { FirePitMark } from "../look/pictures";
import { GlanceShape } from "../verdict/card";
import { GLANCE } from "../verdict/glance";
import type { Verdict, VerdictJson } from "../verdict/types";

const NBSP = String.fromCharCode(0xa0);
const LANGS: Lang[] = ["en", "fr"];

type Loaded = { status: "none" } | { status: "loading" } | { status: "error" } | { status: "ready"; json: VerdictJson };
/** A known smoke event: the answer it was marked on, and the two messages as the person has them now. */
interface Surge {
  marked: boolean;
  place: Place;
  json: VerdictJson;
  text: Record<Lang, string>;
}

function useD() {
  const { lang } = useApp();
  return useCallback((key: DispatchKey, vars?: Vars) => dt(lang, key, vars), [lang]);
}

const drafts = (json: VerdictJson, town: string): Record<Lang, string> => ({ en: publicMessage(json, "en", town), fr: publicMessage(json, "fr", town) });

/** Copy text by the person's own click. False when the browser does not allow it. */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function Dispatch() {
  const { mode, lang, setMode } = useApp();
  const t = useT();
  const d = useD();
  const places = usePlaces(mode);
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [loaded, setLoaded] = useState<Loaded>({ status: "none" });
  const [answers, setAnswers] = useState<Answers>({});
  const [surge, setSurge] = useState<Surge | null>(null);
  const run = useRef(0); // the current check; an answer to an older one is dropped
  const placeBox = useRef<HTMLInputElement>(null);
  const script = useRef<{ focus: () => void }>(null);

  // The page's own title, and no place in a search engine: it is not part of the public flow.
  useEffect(() => {
    const before = document.title;
    document.title = d("pageTitle");
    return () => void (document.title = before);
  }, [d]);
  useEffect(() => {
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex";
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);

  const check = useCallback(
    (chosen: Place) => {
      const id = ++run.current;
      setPlace(chosen);
      setLoaded({ status: "loading" });
      (mode === "replay" ? loadReplayVerdict(chosen) : loadLiveVerdict(chosen)).then(
        (json) => run.current === id && setLoaded({ status: "ready", json }),
        () => run.current === id && setLoaded({ status: "error" }),
      );
    },
    [mode],
  );

  // Live and replay are different days: the place, its answer, the caller's answers and the mark start again.
  const switchMode = (next: typeof mode) => {
    if (next === mode) return;
    run.current++;
    setMode(next);
    setQuery("");
    setPlace(null);
    setLoaded({ status: "none" });
    setAnswers({});
    setSurge(null);
  };

  const choose = (chosen: Place) => {
    setQuery(chosen.name);
    check({ ...chosen, source: "search" });
    script.current?.focus(); // straight on to the questions; the answer is said by the live region
  };
  // The next caller: the questions start again and the place box takes the keyboard, its text selected. Typing replaces
  // it; Enter on the same town checks it again.
  const newCall = () => {
    setAnswers({});
    placeBox.current?.focus();
    placeBox.current?.select();
  };

  const view = useMemo(() => (loaded.status === "ready" && place ? board(loaded.json, lang, place) : null), [loaded, lang, place]);
  const answer: Answer = view ? { status: "ready", board: view } : loaded.status === "ready" ? { status: "none" } : loaded;
  const { end } = progress(answers);
  const result = end ? outcome(end, lang, answer) : null;
  const isReplay = mode === "replay";
  // The mark shows on any later answer that features the same fire.
  const sameFire = surge?.marked && view?.view.fire && view.view.fire.id === surge.json.closestApproach?.fire.id;

  const said =
    loaded.status === "loading" && place
      ? d("answer.loading", { town: place.name })
      : loaded.status === "error"
        ? `${d("answer.error.title")}. ${d("answer.error")}`
        : view
          ? `${view.place}: ${view.view.card.line}`
          : "";

  return (
    <div className="dispatch">
      <p className="d-banner">{d("banner")}</p>
      {isReplay && <p className="d-replay">{d("replay.strip")}</p>}
      <div className="d-page">
        <header className="d-head">
          <svg width="48" height="48" viewBox="0 0 64 64" aria-hidden="true">
            <rect x="0" y="0" width="64" height="64" rx="18" style={{ fill: "#1B2A4A" }} />
            <path d="M25 50c-5-5 5-9 0-15s5-9 0-15" style={{ fill: "none", stroke: "#FFFFFF", strokeWidth: "3.5", strokeLinecap: "round" }} />
            <path d="M38 50c-5-5 5-9 0-15s5-9 0-15" style={{ fill: "none", stroke: "#FFFFFF", strokeWidth: "3.5", strokeLinecap: "round", opacity: "0.6" }} />
          </svg>
          <div className="d-head-words">
            <h1>{d("title")}</h1>
            <p>{d("intro")}</p>
          </div>
          <div className="d-head-tools">
            <div role="group" aria-label={t("check.modeGroup")} className="d-modes">
              <button type="button" aria-pressed={!isReplay} onClick={() => switchMode("live")}>{t("check.live")}</button>
              <button type="button" aria-pressed={isReplay} onClick={() => switchMode("replay")}>{t("check.replay")}</button>
            </div>
            <ListenButton sentences={view ? view.voice : [d("voice.intro"), d("banner")]} />
            <LangToggle />
          </div>
        </header>

        <PlaceBox ref={placeBox} places={places} query={query} setQuery={setQuery} choose={choose} replay={isReplay} />
        <p className="d-sr" role="status">{said}</p>

        <div className="d-grid">
          <section className="d-answer" aria-labelledby="d-answer-h">
            <h2 id="d-answer-h" className="d-sr">{d("answer.title")}</h2>
            {loaded.status === "none" && <p className="d-card d-empty">{d("answer.empty")}</p>}
            {loaded.status === "loading" && place && <p className="d-card d-empty" aria-busy="true">{d("answer.loading", { town: place.name })}</p>}
            {loaded.status === "error" && place && (
              <div className="d-card d-error">
                <h3>{d("answer.error.title")}</h3>
                <p>{d("answer.error")}</p>
                <button type="button" className="d-btn" onClick={() => check(place)}>{t("noData.retry")}</button>
              </div>
            )}
            {view && <AnswerCard view={view} marked={!!sameFire} answers={answers} result={result} />}
          </section>
          <Script ref={script} answers={answers} setAnswers={setAnswers} result={result} look={view ? view.view.card.state : null} newCall={newCall} />
        </div>

        <SurgePanel view={view} place={place} json={loaded.status === "ready" ? loaded.json : null} surge={surge} setSurge={setSurge} />

        <footer className="d-foot">
          <p>{d("stored")}</p>
          <p>
            {d("public")} <Link to="/">{d("public.link")}</Link>
          </p>
        </footer>
      </div>
    </div>
  );
}

// --- The place --------------------------------------------------------------------------------------------------

/**
 * The caller's town: a box that lists matching places as it is typed in. Arrow keys move through the list, Enter takes
 * the one marked (the first, unless moved), Escape closes the list. It has the keyboard when the page opens.
 */
function PlaceBox({ ref, places, query, setQuery, choose, replay }: { ref: Ref<HTMLInputElement>; places: Place[]; query: string; setQuery: (q: string) => void; choose: (p: Place) => void; replay: boolean }) {
  const t = useT();
  const d = useD();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = open ? searchPlaces(places, query) : [];
  const none = open && query.trim() !== "" && results.length === 0 && places.length > 0;
  const pick = (chosen: Place) => {
    setOpen(false);
    choose(chosen);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return setOpen(true);
      if (results.length > 0) setActive((active + (event.key === "ArrowDown" ? 1 : results.length - 1)) % results.length);
    } else if (event.key === "Enter") {
      // The keyboard goes on to the questions with this press: without this, the same press would also press the
      // answer it lands on.
      event.preventDefault();
      // Enter on a town already typed in full checks it again.
      const found = open ? results : searchPlaces(places, query);
      const chosen = found[open ? Math.min(active, found.length - 1) : 0];
      if (chosen) pick(chosen);
      else setOpen(true);
    } else if (event.key === "Escape") {
      if (open) setOpen(false);
      else setQuery("");
    }
  };
  return (
    <div className="d-place">
      <label htmlFor="d-place">{d("place.label")}</label>
      <input
        id="d-place"
        ref={ref}
        type="text"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls="d-places"
        aria-autocomplete="list"
        aria-activedescendant={results.length > 0 ? `d-place-${Math.min(active, results.length - 1)}` : undefined}
        aria-describedby="d-place-hint"
        autoFocus
        autoComplete="off"
        spellCheck={false}
        value={query}
        placeholder={t("location.placeholder")}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      <p id="d-place-hint" className="d-hint">{d("place.hint")}</p>
      <ul id="d-places" role="listbox" aria-label={t("location.results")} hidden={results.length === 0}>
        {results.map((result, i) => (
          // The pointer picks on the way down, before the box loses the keyboard and the list closes.
          <li key={`${result.name}-${result.province}-${result.lat}`} id={`d-place-${i}`} role="option" aria-selected={i === Math.min(active, results.length - 1)} onPointerDown={(event) => { event.preventDefault(); pick(result); }}>
            <strong>{result.name}, {t(`province.${result.province}` as StringKey)}</strong>
            {result.county && <span>{t("location.county", { county: result.county })}</span>}
          </li>
        ))}
      </ul>
      {none && <p className="d-none" role="status">{replay ? d("place.none.replay", { towns: REPLAY_TOWNS.map((town) => town.name).join(", ") }) : d("place.none")}</p>}
    </div>
  );
}

// --- The answer -------------------------------------------------------------------------------------------------

const FACT_ICONS: Record<Fact["icon"], ReactNode> = {
  satellite: <SatelliteIcon size={26} />,
  flame: <FlameIcon size={26} />,
  wind: <WindIcon size={26} />,
  bell: <BellIcon size={26} />,
  firePit: <FirePitMark />,
};

/** A line that is a name (an alert, a forecast zone) ends with a full stop when it is set among sentences. */
const sentence = (line: string) => (/[.!?…:]$/.test(line) ? line : `${line}.`);

/** The glance card's state as a small tile: the shape on its colour. */
function StateTile({ state }: { state: Verdict }) {
  return (
    <span className="d-tile" style={{ background: GLANCE[state].background }}>
      <GlanceShape state={state} />
    </span>
  );
}

/** The known-smoke card, the facts with their sources, and the copy for call notes. */
function AnswerCard({ view, marked, answers, result }: { view: Board; marked: boolean; answers: Answers; result: Outcome | null }) {
  const { lang } = useApp();
  const d = useD();
  const [copied, setCopied] = useState<"no" | "yes" | "failed">("no");
  const [shown, setShown] = useState(false);
  const notesBox = useRef<HTMLTextAreaElement>(null);
  const notes = callNotes(lang, view, answers, result);
  // What was copied is these notes: any change to them (another place, another answer) takes the word back.
  useEffect(() => setCopied("no"), [notes]);
  useEffect(() => {
    if (copied === "failed") notesBox.current?.select();
  }, [copied]);
  const copyNotes = async () => {
    const ok = await copy(notes);
    setCopied(ok ? "yes" : "failed");
    if (!ok) setShown(true);
  };
  const look = GLANCE[view.view.card.state];
  const { card, confidence } = view.view;
  return (
    <>
      <div className="d-known" data-state={card.state} style={{ background: look.background, color: look.ink }}>
        <p className="d-known-for">{d("answer.for", { place: view.place, when: view.checked })}</p>
        <div className="d-known-main">
          <GlanceShape state={card.state} />
          <h3 className="d-known-line">
            {card.parts.map((part, i) => (
              <span key={i}>
                <span className="d-part">
                  {part}
                  {i < card.parts.length - 1 ? `${NBSP}·` : card.arrow && <>{NBSP}<Arrow deg={card.arrow.deg} label={card.arrow.label} /></>}
                </span>{" "}
              </span>
            ))}
          </h3>
        </div>
        <p className="d-known-sure">
          <strong>{confidence.chip}.</strong> {confidence.text}
        </p>
        {view.close && <p className="d-known-note">{view.close}</p>}
        {marked && <p className="d-known-mark">{d("answer.marked")}</p>}
      </div>

      <div className="d-card">
        <h3 className="d-sr">{d("facts.title")}</h3>
        <ul className="d-facts">
          {view.facts.map((fact) => (
            <li key={fact.id} data-fact={fact.id} data-tone={fact.tone}>
              <span className="d-fact-icon" aria-hidden="true">{FACT_ICONS[fact.icon]}</span>
              <div>
                <h4>{fact.label}</h4>
                {fact.headline && <p className="d-fact-headline">{fact.headline}</p>}
                <p>{[fact.sub, ...fact.lines].filter((line) => line !== null).map(sentence).join(" ")}</p>
                {fact.links.length > 0 && (
                  <p className="d-links">
                    {fact.links.map((link) => (
                      <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">
                        {link.label}
                        <span className="d-host">{link.host}</span>
                        <ExternalIcon size={18} />
                      </a>
                    ))}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="d-card d-notes">
        <div className="d-row">
          <button type="button" className="d-btn d-btn-main" onClick={copyNotes}>{d("notes.copy")}</button>
          <button type="button" className="d-btn" aria-expanded={shown} aria-controls="d-notes" onClick={() => setShown(!shown)}>{d("notes.show")}</button>
        </div>
        <p className="d-status" role="status">{copied === "yes" ? d("notes.copied") : copied === "failed" ? d("notes.failed") : ""}</p>
        <div id="d-notes" hidden={!shown}>
          <label htmlFor="d-notes-text" className="d-sr">{d("notes.label")}</label>
          <textarea id="d-notes-text" ref={notesBox} readOnly rows={12} value={notes} />
        </div>
      </div>
    </>
  );
}

/** Beside the distance: an arrow from the town toward the fire (up is north), named for a screen reader. */
function Arrow({ deg, label }: { deg: number; label: string }) {
  return (
    <svg role="img" aria-label={label} width="26" height="26" viewBox="-12 -12 24 24" style={{ verticalAlign: "-3px", transform: `rotate(${deg}deg)`, fill: "none", stroke: "currentColor", strokeWidth: "3.2", strokeLinecap: "round", strokeLinejoin: "round" }}>
      <path d="M0 9V-9" />
      <path d="M-6-3 0-9 6-3" />
    </svg>
  );
}

// --- The three questions ----------------------------------------------------------------------------------------

/**
 * The script: one question to ask at a time, its answers as buttons (and as the numbers 1, 2, 3… while one of them has
 * the keyboard). An answered question shows its answer and a Change button. Where the answers end is the public app's
 * routing, shown above the questions; it never says not to respond.
 */
function Script({ ref, answers, setAnswers, result, look, newCall }: { ref: Ref<{ focus: () => void }>; answers: Answers; setAnswers: (a: Answers) => void; result: Outcome | null; look: Verdict | null; newCall: () => void }) {
  const { lang } = useApp();
  const t = useT();
  const d = useD();
  const { ask } = progress(answers);
  const current = useRef<HTMLDivElement>(null);
  const resultTitle = useRef<HTMLHeadingElement>(null);
  const move = useRef(false); // an answer was just given or taken back: the keyboard follows to what comes next
  const focus = useCallback(() => {
    // Brought into view with as little scrolling as it takes: the answer for the place stays where it is.
    const target = current.current?.querySelector("button") ?? resultTitle.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest" });
  }, []);
  useImperativeHandle(ref, () => ({ focus }), [focus]);
  useEffect(() => {
    if (!move.current) return;
    move.current = false;
    focus();
  });

  const set = (n: Step, id: string | undefined) => {
    move.current = true;
    // An answer changed: the questions after it are asked again.
    const kept: Answers = { ...(n > 1 && { q1: answers.q1 }), ...(n > 2 && { q2: answers.q2 }) };
    setAnswers(id ? ({ ...kept, [`q${n}`]: id } as Answers) : kept);
  };

  return (
    <section className="d-card d-script" aria-labelledby="d-script-h">
      <div className="d-row d-script-head">
        <h2 id="d-script-h">{d("script.title")}</h2>
        <button type="button" className="d-btn" onClick={newCall}>{d("newCall")}</button>
      </div>
      <p className="d-hint">{d("script.about")}</p>
      {/* Where the answers end, above them: it is what the eye wants next, and it shows without scrolling. */}
      {result && (
        <div className="d-result" data-kind={result.kind}>
          {result.kind === "dispatch" ? <GlanceShape state="unexplained" /> : result.kind === "firePit" ? <GlanceShape state="unclear" /> : look && <StateTile state={look} />}
          <div>
            <h3 ref={resultTitle} tabIndex={-1}>
              <span className="d-sr">{d("outcome.title")} </span>
              {result.title}
            </h3>
            <p>{result.text}</p>
          </div>
        </div>
      )}
      <ol className="d-questions">
        {questions(lang).map((q) => {
          const answered = given(answers, q.n);
          const state = answered ? "answered" : ask === q.n ? "current" : "waiting";
          // A yes or a not sure ended the questions: the ones after it are never asked, and are not shown.
          if (!answered && ask === null) return null;
          return (
            <li key={q.n} data-question={q.n} data-state={state}>
              <p id={`d-q${q.n}`} className="d-question">
                <span className="d-number" aria-hidden="true">{q.n}</span>
                <span>
                  <span className="d-sr">{t("look.step", { n: q.n })}. </span>
                  {q.text}
                </span>
              </p>
              {state === "current" && (
                <div
                  ref={current}
                  role="group"
                  aria-labelledby={`d-q${q.n}`}
                  className="d-answers"
                  onKeyDown={(event) => {
                    const picked = q.answers[Number(event.key) - 1];
                    // A key held down answers one question, not the next one too.
                    if (event.repeat && (picked || event.key === "Enter" || event.key === " ")) return event.preventDefault();
                    if (picked && !event.ctrlKey && !event.metaKey && !event.altKey) {
                      event.preventDefault(); // the press ends here, not on the next question's answer
                      set(q.n, picked.id);
                    }
                  }}
                >
                  {q.answers.map((a, i) => (
                    <button key={a.id} type="button" className="d-btn d-pick" data-answer={a.id} aria-keyshortcuts={String(i + 1)} onClick={() => set(q.n, a.id)}>
                      <kbd aria-hidden="true">{i + 1}</kbd>
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
              {state === "answered" && (
                <p className="d-given">
                  <strong>{d("script.answer", { answer: q.answers.find((a) => a.id === answered)!.label })}</strong>
                  <button type="button" className="d-btn d-small" aria-label={d("script.change.aria", { n: q.n })} onClick={() => set(q.n, undefined)}>{d("script.change")}</button>
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {ask !== null && <p className="d-hint">{d("script.keys")}</p>}
    </section>
  );
}

// --- Surge mode -------------------------------------------------------------------------------------------------

/**
 * A known smoke event. Marked, the board drafts the message for the fire department's social media, in English and
 * in French, with an image of the card and the map. Both can be changed; nothing here posts anything.
 */
function SurgePanel({ view, place, json, surge, setSurge }: { view: Board | null; place: Place | null; json: VerdictJson | null; surge: Surge | null; setSurge: (s: Surge | null) => void }) {
  const { lang } = useApp();
  const d = useD();
  const able = view && place && json ? surgeCheck(view) : null;
  const km = view && view.view.fireRow.kind !== "none" ? view.view.fireRow.km : "";
  // The messages as first drafted: for the answer the mark was made on, and for the answer on the board now.
  const first = surge ? drafts(surge.json, surge.place.name) : null;
  const fresh = able === "ok" && place && json ? drafts(json, place.name) : null;
  const same = first && fresh && LANGS.every((code) => first[code] === fresh[code]);
  const changed = surge && first && LANGS.some((code) => surge.text[code] !== first[code]);
  const start = () => fresh && place && json && setSurge({ marked: true, place, json, text: fresh });

  const toggle = () => {
    if (surge?.marked) return setSurge({ ...surge, marked: false });
    // Marked again with nothing new to say: the messages are as the person left them.
    if (surge && same) return setSurge({ ...surge, marked: true });
    start();
  };

  return (
    <section className="d-card d-surge" aria-labelledby="d-surge-h">
      <h2 id="d-surge-h">{d("surge.title")}</h2>
      <p>{d("surge.intro")}</p>
      {(surge?.marked || able === "ok") && (
        <button type="button" className="d-btn d-mark" aria-pressed={!!surge?.marked} onClick={toggle}>
          <span className="d-check" aria-hidden="true" />
          {d("surge.mark")}
        </button>
      )}
      {!surge?.marked && able !== "ok" && (
        <p className="d-why">
          {able === null ? d("surge.no.answer") : able === "close" ? d("surge.no.close", { town: view!.town, km }) : d("surge.no.notDrifting", { town: view!.town })}
        </p>
      )}
      {surge?.marked && (
        <>
          <p className="d-marked">
            <strong>{d("surge.marked", { town: surge.place.name, fire: shareImage(surge.json, lang, surge.place.name).fireLabel })}</strong>
          </p>
          <p>{d("surge.never")}</p>
          <div className="d-drafts">
            {LANGS.map((code) => (
              <Draft key={code} code={code} surge={surge} setText={(text) => setSurge({ ...surge, text: { ...surge.text, [code]: text } })} />
            ))}
          </div>
          <div className="d-row">
            {changed && <button type="button" className="d-btn" onClick={() => setSurge({ ...surge, text: first! })}>{d("surge.reset")}</button>}
            {/* Another town, or newer facts, on the board: the messages can be drafted again for it. */}
            {fresh && place && !same && <button type="button" className="d-btn" onClick={start}>{d("surge.redraft", { town: place.name })}</button>}
          </div>
        </>
      )}
    </section>
  );
}

/** One language's message, to read and change, and its image. Copy and download are the person's own clicks. */
function Draft({ code, surge, setText }: { code: Lang; surge: Surge; setText: (text: string) => void }) {
  const d = useD();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState<"no" | "yes" | "failed">("no");
  const image = useMemo(() => shareImage(surge.json, code, surge.place.name), [surge.json, surge.place.name, code]);
  useEffect(() => {
    if (canvas.current) void drawShare(canvas.current, surge.json, image);
  }, [surge.json, image]);
  const text = surge.text[code];
  useEffect(() => setCopied("no"), [text]);
  return (
    <div className="d-draft" data-lang={code}>
      <label htmlFor={`d-msg-${code}`}>{d(`surge.label.${code}` as DispatchKey)}</label>
      <textarea id={`d-msg-${code}`} lang={code} rows={5} value={text} onChange={(event) => setText(event.target.value)} />
      <p className="d-hint">{d("surge.count", { n: text.length })}</p>
      <canvas ref={canvas} width={SHARE_WIDTH} height={SHARE_HEIGHT} role="img" aria-label={image.alt} lang={code} />
      <p className="d-alt">
        {d("surge.alt.lead")} <span lang={code}>{image.alt}</span>
      </p>
      <div className="d-row">
        <button type="button" className="d-btn d-btn-main" onClick={async () => setCopied((await copy(text)) ? "yes" : "failed")}>{d("surge.copy")}</button>
        <button type="button" className="d-btn" onClick={() => canvas.current && downloadPng(canvas.current, image.fileName)}>{d("surge.download")}</button>
      </div>
      <p className="d-status" role="status">{copied === "yes" ? d("surge.copied") : copied === "failed" ? d("surge.failed") : ""}</p>
    </div>
  );
}
