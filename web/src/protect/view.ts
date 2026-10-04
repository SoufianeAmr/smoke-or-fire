// Everything the "Protect your home" screen says, from the engine's answer. Pure: no React, no DOM.
//
// The advice is never written here. content.json holds each sentence with the source it is quoted from, and
// sources.json who published that page, its address and its date modified (web/scripts/protect-sources.mjs saves the
// pages in sources/). view.test.ts fails if a sentence is not in its page, word for word.
import { translate, type Lang, type StringKey } from "../i18n";
import { lowerFirst, script } from "../listen/speech";
import type { AqhiCategory, VerdictJson } from "../verdict/types";
import { verdictView } from "../verdict/view";
import content from "./content.json";
import sources from "./sources.json";

type SourceId = keyof typeof sources;
type OwnKey = keyof typeof content.strings;
export type IconId = "window" | "fan" | "cleaner" | "filter";

type Words = Record<Lang, string>;
/** A passage quoted from a source page: its sentences, and the list items it introduces. */
export interface Passage extends Words {
  source: string;
  items?: Words[];
}
/** A tile as content.json holds it. `note`: a sentence of its first passage, shown under the label without a tap. */
export interface Tile {
  id: string;
  icon: string;
  label: Words;
  note?: Words;
  quotes: Passage[];
}
export const TILES: Tile[] = content.tiles;

/** How loud the screen and the verdict's button are. */
export type Tone = "calm" | "raised";
/**
 * Quiet at low risk, clear from moderate up. With no reading, as the verdict's own advice goes: clear when the air
 * likely or possibly carries a fire's smoke (drifting, unclear), quiet when nothing explains it.
 */
export const toneOf = (json: Pick<VerdictJson, "aqhi" | "verdict">): Tone =>
  (json.aqhi ? json.aqhi.category !== "low" : json.verdict !== "unexplained") ? "raised" : "calm";

/** Where a sentence comes from: who, the page, when it was modified, and its link. */
export interface SourceView {
  id: string;
  by: string;
  title: string;
  dated: string;
  host: string;
  url: string;
}
/** One quoted passage: its sentences, and under it the list items it introduces, as the page has them. */
export interface QuoteView {
  text: string;
  items: string[];
  source: SourceView;
}
export interface TileView {
  id: string;
  icon: IconId;
  /** The opening of its first sentence, as the page has it. */
  label: string;
  /** A sentence of its first passage that shows under the label without a tap: Health Canada's line on heat. */
  note: string | null;
  quotes: QuoteView[];
}
/** The app's own caution about the reading: it is area-wide. */
type AreaWide = { lead: string; text: string };

export interface ProtectView {
  title: string;
  intro: string;
  /** The name of the list of tiles, for a screen reader. */
  tilesName: string;
  /** The fire is under 25 km away: the verdict's notice, here too, before any advice about staying in. */
  notice: { text: string; link: string } | null;
  /** ECCC's air quality band for the spot that was checked. A tap shows `lines` (the reading, who, when) and `link`. */
  band: {
    category: AqhiCategory | null;
    tone: Tone;
    label: string;
    lines: string[];
    /** On a verdict nothing explains: the reading is area-wide. */
    note: AreaWide | null;
    link: { label: string; host: string; url: string };
  };
  tiles: TileView[];
  atRisk: {
    label: string;
    yes: string;
    no: string;
    help: string;
    /** The band again, beside the message it picks: "Air quality: high risk"; null with no reading. */
    band: string | null;
    /** "Official message for people at risk:"; null with no reading. */
    kicker: string | null;
    /** ECCC's message for the at-risk population at this band; null with no reading. */
    message: string | null;
    /** At low risk, beside the message: the reading is area-wide. A person who smells smoke is not given an all-clear. */
    note: AreaWide | null;
    noReading: string | null;
    doctor: string;
    source: SourceView;
    saved: string;
    notSaved: string;
    forget: string;
    forgotten: string;
    notForgotten: string;
  };
  /** What Listen says, one sentence per item. `off` is the same whatever the switch's state; `on` holds the at-risk
   *  message, and is only ever read by a voice that works on the device (Protect.tsx). */
  voice: { off: string[]; on: string[] };
}

/** No-break hyphen: a date ("2025‑07‑30") stays whole on one line. */
const NBH = String.fromCharCode(0x2011);

/** Sentences: split after . ? or ! followed by a space (as the app's other scripts are). */
const sentences = (text: string) => text.split(/(?<=[.?!])\s+(?=\S)/).filter((sentence) => sentence.trim() !== "");

/** "2025-08-25, 08:00 (Atlantic time)", "2025-08-25, 8 h 00 (heure de l’Atlantique)": as the verdict's badges say a time. */
function atlantic(iso: string, lang: Lang): string {
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const part = Object.fromEntries(format.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return translate(lang, "time.atlantic", { date: `${part.year}-${part.month}-${part.day}`, hour: lang === "fr" ? Number(part.hour) : part.hour, minute: part.minute });
}

export function protectView(json: VerdictJson, lang: Lang): ProtectView {
  const own = (key: OwnKey, vars: Record<string, string | number> = {}) => content.strings[key][lang].replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
  const app = (key: StringKey) => translate(lang, key);
  const source = (id: string): SourceView => {
    const page = sources[id as SourceId];
    return {
      id,
      by: own("source.by", { publisher: page.publisher[lang] }),
      title: page.title[lang],
      dated: own("source.modified", { date: page.modified[lang].replaceAll("-", NBH) }),
      host: page.url[lang].split("/")[2].replace(/^www\./, ""),
      url: page.url[lang],
    };
  };

  // A fire close by: the verdict's own notice and its words, so this screen never says "stay in" without them.
  const notice = verdictView(json, lang).notice;

  // The band: ECCC's reading for the spot, as the verdict has it. No reading in the last 2 hours is said, not guessed.
  const aq = json.aqhi;
  const category = aq ? aq.category : null;
  // The level's name as the app has it ("High risk"), in lower case after a colon, as the verdict's badges are.
  const risk = aq ? lowerFirst(app(`aq.risk.${aq.category}` as StringKey), lang) : null;
  const areaWide: AreaWide = { lead: app("aq.areaWide.lead"), text: app("aq.areaWide.text") };
  const band: ProtectView["band"] = {
    category,
    tone: toneOf(json),
    label: risk ? own("band", { risk }) : own("band.none"),
    lines: aq ? [own("band.detail", { n: aq.display, station: lang === "fr" ? aq.station.nameFr : aq.station.nameEn, when: atlantic(aq.observedAt, lang) }), app("aq.source")] : [app("todo.noReading")],
    note: json.verdict === "unexplained" ? areaWide : null,
    link: { label: app("todo.officialLink"), host: app("todo.officialLink.host"), url: app("todo.officialLink.url") },
  };

  const tiles: TileView[] = TILES.map((tile) => ({
    id: tile.id,
    icon: tile.icon as IconId,
    label: tile.label[lang],
    note: tile.note ? tile.note[lang] : null,
    quotes: tile.quotes.map((quote) => ({ text: quote[lang], items: (quote.items ?? []).map((item) => item[lang]), source: source(quote.source) })),
  }));

  const message = category ? content.atRisk.messages[category][lang] : null;
  const doctor = content.atRisk.doctor[lang];
  const atRisk: ProtectView["atRisk"] = {
    label: own("atRisk.label"),
    yes: own("atRisk.yes"),
    no: own("atRisk.no"),
    help: own("atRisk.help"),
    band: risk ? band.label : null,
    kicker: risk ? own("atRisk.kicker") : null,
    message,
    note: category === "low" ? areaWide : null,
    noReading: aq ? null : own("atRisk.noReading"),
    doctor,
    source: source(content.atRisk.source),
    saved: own("atRisk.saved"),
    notSaved: own("atRisk.notSaved"),
    forget: own("atRisk.forget"),
    forgotten: own("atRisk.forgotten"),
    notForgotten: own("atRisk.notForgotten"),
  };

  // Listen. The fire-close notice first; then ECCC's band (and the app's note on it); then, named as Health Canada's,
  // each tile's sentences as written; then the at-risk part: that there is a switch (the same words whatever its
  // state), or ECCC's message for the band, named as ECCC's, and its doctor's-advice line. Then 911, as on the verdict.
  const start = [
    own("voice.title"),
    ...(notice ? script(lang, "voice.verdict.notice", { link: notice.link }) : []),
    ...(risk ? sentences(own("voice.band", { risk })) : sentences(own("voice.band.none"))),
    ...(band.note && risk ? [band.note.lead, band.note.text] : []),
    ...sentences(own("voice.intro")),
    ...tiles.flatMap((tile) => tile.quotes.flatMap((quote) => [...sentences(quote.text), ...quote.items])),
    ...sentences(own("voice.tap")),
  ];
  const call = sentences(app("voice.verdict.call"));
  // The area-wide note is said once: after the band when nothing explains the smoke, else beside the low-risk message.
  const lowNote = atRisk.note && !band.note ? [atRisk.note.lead, atRisk.note.text] : [];
  const voice = {
    off: [...start, ...sentences(own("voice.atRisk.off")), ...call],
    on: [...start, ...sentences(own(message ? "voice.atRisk.on" : "voice.atRisk.none")), ...(message ? [...sentences(message), ...lowNote] : []), ...sentences(doctor), ...call],
  };

  return { title: own("title"), intro: own("intro"), tilesName: own("tiles"), notice, band, tiles, atRisk, voice };
}
