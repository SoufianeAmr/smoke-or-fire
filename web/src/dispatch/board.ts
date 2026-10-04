// The dispatch board (/dispatch): the three questions as a script and where the caller's answers end, what the board
// says of the engine's answer, the plain text for call notes, and the public message and share image of surge mode.
// Every fact is the engine's, with its source; in the replay the burn status is a province's news release, and says
// so. The routing is the public app's own (look/routing.ts). Pure: no React, no DOM.
import { burnBadge } from "../burn/badge";
import { burnView } from "../burn/view";
import { translate, type Lang, type StringKey, type Vars } from "../i18n";
import { lowerFirst, spokenKm } from "../listen/speech";
import { Q1_ANSWERS, Q2_ANSWERS, Q3_ANSWERS, ROUTES, type End, type Q1Answer, type Q2Answer, type Q3Answer } from "../look/routing";
import { ofTown, townLine } from "../look/where";
import type { BadgeTone } from "../verdict/glance";
import type { BurnState, Fire, VerdictJson } from "../verdict/types";
import { verdictView, type VerdictView } from "../verdict/view";
import { atlanticDate, boardBurn, type BoardBurn } from "./burn";
import { dt, type DispatchKey } from "./strings";

const NBSP = String.fromCharCode(0xa0);

// --- The three questions ------------------------------------------------------------------------------------------

export type Step = 1 | 2 | 3;
export interface Answers {
  q1?: Q1Answer;
  q2?: Q2Answer;
  q3?: Q3Answer;
}

/** The question to ask next, or where the answers end. A Yes or Not sure ends the questions at once, as in the app. */
export function progress(answers: Answers): { ask: Step; end: null } | { ask: null; end: End } {
  if (!answers.q1) return { ask: 1, end: null };
  const first = ROUTES.q1[answers.q1];
  if (first !== "/q2") return { ask: null, end: first };
  if (!answers.q2) return { ask: 2, end: null };
  const second = ROUTES.q2[answers.q2];
  if (second !== "/q3") return { ask: null, end: second };
  if (!answers.q3) return { ask: 3, end: null };
  return { ask: null, end: ROUTES.q3[answers.q3] };
}

export interface Question {
  n: Step;
  /** What the call taker says. */
  text: string;
  answers: { id: string; label: string }[];
}

/** The script: the public app's questions and answers, in its order. The sky is asked in words: a caller sees no pictures. */
export function questions(lang: Lang): Question[] {
  const label = (n: Step, id: string) => translate(lang, (id === "notSure" ? "look.notSure" : `q${n}.${id}`) as StringKey);
  const answers = (n: Step, ids: readonly string[]) => ids.map((id) => ({ id, label: label(n, id) }));
  return [
    { n: 1, text: translate(lang, "q1.title"), answers: answers(1, Q1_ANSWERS) },
    { n: 2, text: dt(lang, "script.q2"), answers: answers(2, Q2_ANSWERS) },
    { n: 3, text: translate(lang, "q3.title"), answers: answers(3, Q3_ANSWERS) },
  ];
}

/** The answer given to question `n`, if any. */
export const given = (answers: Answers, n: Step): string | undefined => answers[`q${n}` as keyof Answers];

// --- The answer for a place ---------------------------------------------------------------------------------------

/** One fact under the card: what was found, then who says so and when, then the links. */
export interface Fact {
  id: "fire" | "alert" | "burn" | "trace";
  /** Told by the icon's outline and by a word in the label: filled, outlined, dashed. */
  tone: BadgeTone;
  icon: "satellite" | "flame" | "wind" | "bell" | "firePit";
  label: string;
  /** The fire and its distance from the town. */
  headline: string | null;
  /** Where the fire is. */
  sub: string | null;
  lines: string[];
  links: { label: string; host: string; url: string }[];
}

export interface Board {
  town: string;
  /** "Moncton, NB" */
  place: string;
  /** When the engine checked, in Atlantic time. */
  checked: string;
  replay: boolean;
  /** Everything the public verdict screen says of this answer: the card's line, its shape, its badges. */
  view: VerdictView;
  /** The featured fire is under 25 km from the town: said under the card, and no public message is drafted. */
  close: string | null;
  /** The featured fire, as the sentences name it: "the Long Lake fire" / "du feu de Long Lake". */
  fireThe: string | null;
  burn: BoardBurn;
  facts: Fact[];
  /** What Listen says. */
  voice: string[];
}

// The engine's burn status in the board's three looks (filled, outlined, dashed): a restriction in effect is filled.
// The board has no green: that is the public app's burn badge's alone.
const BURN_TONE: Record<BurnState, BadgeTone> = { no_burn: "active", restricted: "active", permitted: "none", season_closed: "none", not_checked: "notChecked" };

const PROVINCES = ["NB", "NS", "PE", "QC", "ME"];
/** "in Nova Scotia" / "en Nouvelle-Écosse"; nothing for a province the strings do not have. */
const areaIn = (lang: Lang, code: string | null) => (code && PROVINCES.includes(code) ? translate(lang, `area.in.${code}` as StringKey) : "");

/** A fire in words, as the verdict screen names it: by its name, else the community it is near, else its province. */
function fireWords(lang: Lang, fire: Fire, form: "the" | "plain" | "title"): string {
  return fire.name
    ? translate(lang, `fire.${form}.named` as StringKey, { name: fire.name })
    : fire.nearCommunity
      ? translate(lang, `fire.${form}.near` as StringKey, { community: fire.nearCommunity })
      : translate(lang, `fire.${form}.in` as StringKey, { where: areaIn(lang, fire.province) });
}

/** "2025-08-25, 09:00 (Atlantic time)" / "2025-08-25, 9 h 00 (heure de l’Atlantique)", as the badges write a time. */
function at(iso: string, lang: Lang): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return translate(lang, "time.atlantic", { date: atlanticDate(iso), hour: lang === "fr" ? Number(p.hour) : p.hour, minute: p.minute });
}

const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/** What the board says of the engine's answer for the town the call taker typed. */
export function board(json: VerdictJson, lang: Lang, place: { name: string; province: string }): Board {
  const t = (key: StringKey, vars?: Vars) => translate(lang, key, vars);
  const d = (key: DispatchKey, vars?: Vars) => dt(lang, key, vars);
  const town = place.name;
  const view = verdictView(json, lang, town);
  const [fireBadge, traceBadge, alertBadge] = view.badges;
  const fire = view.fire;
  const row = view.fireRow;

  // Fire and distance. A fire the answer features (drifting, unclear) is named with how far and which way it is.
  const featured = row.kind === "fire" && fire !== null;
  const fireFact: Fact = {
    id: "fire",
    tone: fireBadge.tone,
    icon: fireBadge.icon === "flame" ? "flame" : "satellite",
    label: fireBadge.label,
    headline: featured
      ? fire.km < 1 // no compass direction under 1 km
        ? `${row.title}${NBSP}· ${row.km}`
        : d("fire.where", { fire: row.title, km: row.km, direction: row.side, town, ofTown: ofTown(town) })
      : null,
    sub: featured && (fire.locality ?? fire.nearCommunity) ? row.subtitle : null,
    lines: fireBadge.lines,
    links: fireBadge.links,
  };

  // ECCC's alert, then ECCC's reading for the area (the nearest station's AQHI), then the source line.
  const aq = json.aqhi;
  const reading = aq
    ? d("air.reading", { value: aq.display, risk: lowerFirst(view.aqhi.risk, lang), station: lang === "fr" ? aq.station.nameFr : aq.station.nameEn, when: at(aq.observedAt, lang) })
    : t("todo.noReading");
  const alertFact: Fact = {
    id: "alert",
    tone: alertBadge.tone,
    icon: "bell",
    label: alertBadge.label,
    headline: null,
    sub: null,
    lines: [...alertBadge.lines.slice(0, -1), reading, alertBadge.lines[alertBadge.lines.length - 1]],
    links: alertBadge.links,
  };

  // Burn status. Today's is the engine's, in the words of the public app's burn badge: one source of truth. The
  // replay's day shows a ban the province announced, said to be from its news release, with the release's date and
  // link. Anything else is "not checked", with the province's own page.
  const burn = boardBurn(json, place.province, lang, burnView(json, lang, { town }));
  const pill = burn.view ? burnBadge(burn.view, lang) : null;
  const page = burn.page ? [{ label: burn.page.english ? d("burn.page.english", { label: burn.page.label }) : burn.page.label, host: host(burn.page.url), url: burn.page.url }] : [];
  const burnFact: Fact =
    burn.release
      ? {
          id: "burn",
          tone: "active",
          icon: "firePit",
          label: d("burn.ban"),
          headline: null,
          sub: null,
          lines: [d("burn.ban.body", { inProvince: areaIn(lang, burn.province) }), d("burn.ban.source", { who: burn.release.authority, date: burn.release.published })],
          links: [{ label: d(burn.release.english ? "burn.release.english" : "burn.release", { date: burn.release.published }), host: host(burn.release.url), url: burn.release.url }, ...page],
        }
      : burn.view && pill
        ? { id: "burn", tone: BURN_TONE[burn.view.state], icon: "firePit", label: pill.label, headline: null, sub: null, lines: pill.lines, links: pill.links }
        : { id: "burn", tone: "notChecked", icon: "firePit", label: d("burn.notChecked"), headline: null, sub: null, lines: [d("burn.notChecked.body")], links: page };

  const traceFact: Fact = { id: "trace", tone: traceBadge.tone, icon: "wind", label: traceBadge.label, headline: null, sub: null, lines: traceBadge.lines, links: traceBadge.links };

  const close = view.notice && fire ? d("answer.close", { km: row.kind === "none" ? "" : row.km }) : null;
  const fireThe = fire ? fireWords(lang, fire, "the") : null;

  // Listen: the place, the answer in spoken words, how sure, then the alert and the burn status by their names.
  const spoken =
    view.variant === "7a"
      ? fire!.km < 1
        ? d("voice.drifting.under", { town, fire: fireThe! })
        : d("voice.drifting", { town, fire: fireThe!, distance: spokenKm(fire!.km, lang), direction: t(`compass.at.${fire!.compass}` as StringKey) })
      : view.variant === "7c"
        ? d("voice.unclear", { town, fire: fireThe! })
        : d("voice.unexplained", { town });
  const voice = [spoken, `${view.confidence.chip}.`, ...(close ? [close] : []), `${alertFact.label}.`, `${burnFact.label}.`, d("banner")];

  return {
    town,
    place: townLine(lang, place),
    checked: at(json.time, lang),
    replay: json.mode === "replay",
    view,
    close,
    fireThe,
    burn,
    facts: [fireFact, alertFact, burnFact, traceFact],
    voice,
  };
}

// --- Where the caller's answers end -------------------------------------------------------------------------------

/** The board's answer for the place: none typed yet, on its way, not loaded, or ready. */
export type Answer = { status: "none" } | { status: "loading" } | { status: "error" } | { status: "ready"; board: Board };

export interface Outcome {
  /** dispatch: a yes or a not sure. firePit: a neighbour's fire pit, and no ban known. noFire: the trace's answer stands. */
  kind: "dispatch" | "firePit" | "noFire";
  title: string;
  text: string;
}

/**
 * What the script ends on, by the public app's routing. Any yes or not sure: dispatch (the app's "Call 911 now"). A fire
 * pit or bonfire: the app says to call 911 if it is out of control or burning is banned, so where burning is banned
 * (the engine's "No burning" today, or in the replay a ban on record) it is dispatch too; otherwise the result names
 * the burn status. Only "no, haze or smell, nothing" leaves the trace's answer standing, and it is never a "no".
 */
export function outcome(end: End, lang: Lang, answer: Answer): Outcome {
  const d = (key: DispatchKey, vars?: Vars) => dt(lang, key, vars);
  const ready = answer.status === "ready" ? answer.board : null;
  if (end === "/emergency") return { kind: "dispatch", title: d("outcome.dispatch"), text: d("outcome.dispatch.text") };
  if (end === "/nearby-fire") {
    const burn = ready?.burn;
    if (burn?.release) return { kind: "dispatch", title: d("outcome.dispatch"), text: d("outcome.dispatch.ban", { inProvince: areaIn(lang, burn.province) }) };
    if (burn?.view && burn.ban) return { kind: "dispatch", title: d("outcome.dispatch"), text: d("outcome.dispatch.noBurn", { where: burn.view.county ?? burn.view.word }) };
    // Not banned, or not known: the public app's two conditions, and the status as far as it is known.
    return { kind: "firePit", title: d("outcome.pit"), text: d("outcome.pit.text", { status: burn?.view ? lowerFirst(burn.view.word, lang).replace(/[.]$/, "") : d("burn.notChecked.word") }) };
  }
  const title = d("outcome.noFire");
  if (!ready) return { kind: "noFire", title, text: d(answer.status === "error" ? "outcome.noFire.notChecked" : "outcome.noFire.noPlace") };
  const { view, fireThe } = ready;
  const km = view.fireRow.kind === "none" ? "" : view.fireRow.km;
  const text =
    view.variant === "7a"
      ? d("outcome.noFire.drifting", { fire: fireThe!, km })
      : view.variant === "7c"
        ? d("outcome.noFire.unclear", { fire: fireThe! })
        : d("outcome.noFire.unexplained");
  return { kind: "noFire", title, text };
}

// --- Call notes ---------------------------------------------------------------------------------------------------

/** Plain text for a call-taking system: no-break spaces and hyphens become ordinary ones. */
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, " ").replace(/\u2011/g, "-");

/**
 * "Copy for call notes": the place, when it was checked, the answer and how sure, then every fact with its source,
 * its time and its link, the caller's answers if any were given, and the banner's sentence.
 */
export function callNotes(lang: Lang, b: Board, answers: Answers, result: Outcome | null): string {
  const d = (key: DispatchKey, vars?: Vars) => dt(lang, key, vars);
  const lines = [
    `${d("notes.head")} · ${translate(lang, "check.title")}`,
    d("notes.place", { place: b.place }),
    d("notes.checked", { when: b.checked }),
    ...(b.replay ? [d("notes.replay")] : []),
    d("notes.answer", { line: b.view.card.line }),
    `${b.view.confidence.chip}. ${b.view.confidence.text}`,
    ...(b.close ? [b.close] : []),
  ];
  for (const fact of b.facts) {
    lines.push("", fact.label);
    for (const line of [fact.headline, fact.sub, ...fact.lines]) if (line) lines.push(`- ${line}`);
    for (const link of fact.links) lines.push(`- ${link.label}: ${link.url}`);
  }
  const asked = questions(lang).filter((q) => given(answers, q.n));
  if (asked.length > 0) {
    lines.push("", d("notes.caller"));
    for (const q of asked) lines.push(`- ${q.text} ${q.answers.find((a) => a.id === given(answers, q.n))!.label}`);
    if (result) lines.push(d("notes.result", { title: result.title, text: result.text }));
  }
  lines.push("", d("banner"));
  return plain(lines.join("\n"));
}

// --- Surge mode: a known smoke event ------------------------------------------------------------------------------

/**
 * Whether the board drafts a public message for this answer. Only when the trace links the smoke to a known fire
 * (drifting smoke), and that fire is not close: people near a fire need official instructions, not a message about
 * distant smoke.
 */
export function surgeCheck(b: Board): "ok" | "notDrifting" | "close" {
  if (b.view.variant !== "7a") return "notDrifting";
  return b.view.notice ? "close" : "ok";
}

/** ECCC writes its alert names with a straight apostrophe ("qualité de l'air"). */
const curly = (text: string) => text.replace(/'/g, "’");

/**
 * The message for the fire department's social media, in one language: where the smoke comes from and how far that
 * is, when to call 911, then ECCC's alert when one is in effect, in ECCC's own words. A draft: a person reads it,
 * changes it and posts it. For a drifting-smoke answer only (surgeCheck).
 */
export function publicMessage(json: VerdictJson, lang: Lang, town: string): string {
  const fire = json.closestApproach!.fire;
  // "a fire in Nova Scotia" already says where it is.
  const inProvince = fire.name || fire.nearCommunity ? areaIn(lang, fire.province) : "";
  const km = fire.km < 1 ? translate(lang, "unit.lessThanOne") : fire.km;
  const smoke = dt(lang, inProvince ? "msg.smoke" : "msg.smoke.noProvince", { town, fire: fireWords(lang, fire, "the"), inProvince, km });
  const check = json.alerts?.airQuality;
  const alert = check?.state === "active" ? check.alert : null;
  const [name, zone] = alert ? (lang === "fr" ? [alert.nameFr, alert.zoneFr] : [alert.nameEn, alert.zoneEn]) : [null, null];
  return [smoke, dt(lang, "msg.call"), ...(name && zone ? [dt(lang, "msg.alert", { alert: curly(name), zone: curly(zone) })] : [])].join(" ");
}

export interface ShareImage {
  lang: Lang;
  /** The card: its line's parts, and the arrow from the town toward the fire. */
  parts: string[];
  arrowDeg: number | null;
  /** "Moncton · Aug 25, 2025" */
  where: string;
  townLabel: string;
  fireLabel: string;
  /** When to call 911: on the image too, which may be shared without the message. */
  call: string;
  sources: string;
  /** What the image shows, for a screen reader here and for the post's alt text. */
  alt: string;
  fileName: string;
}

/** The share image's words, in one language: the card and the map with their labels, the 911 sentence, the sources. */
export function shareImage(json: VerdictJson, lang: Lang, town: string): ShareImage {
  const view = verdictView(json, lang, town);
  const fire = json.closestApproach!.fire;
  const date = new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-US", { timeZone: "America/Halifax", year: "numeric", month: "short", day: "numeric" }).format(new Date(json.time));
  const call = dt(lang, "msg.call");
  const slug = town.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    lang,
    parts: view.card.parts,
    arrowDeg: view.card.arrow?.deg ?? null,
    where: `${town}${NBSP}· ${date}`,
    townLabel: town,
    fireLabel: view.map.fireLabel ?? "",
    call,
    sources: dt(lang, "img.sources"),
    alt: dt(lang, "surge.alt", { line: view.card.line, fire: fireWords(lang, fire, "plain"), town, call }),
    fileName: `${lang === "fr" ? "fumee" : "smoke"}-${slug}-${atlanticDate(json.time)}-${lang}.png`,
  };
}
