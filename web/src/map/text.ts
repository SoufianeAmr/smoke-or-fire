// Everything the map says in words: what it shows (for a screen reader, for Listen and at the head of the legend),
// the labels drawn on it, and the legend's rows, where each layer names who it comes from, when, and a link.
// ECCC's layer comes first. Pure: no React, no DOM.
import { translate, type Lang, type StringKey, type Vars } from "../i18n";
import { aloud } from "../listen/speech";
import type { VerdictJson } from "../verdict/types";
import { atlanticTime, type VerdictView } from "../verdict/view";
import type { MapModel } from "./model";
import TILES from "./tiles.json";

/** Which basemap is on the screen: the detailed one (tiles) or the outline map. */
export type Basemap = "tiles" | "outline";
/** Why the outline map is shown in place of the detailed one. "reduced": the engine sent no map details. */
export type Fallback = "tiles" | "webgl" | "reduced";

type Link = { label: string; host: string; url: string };
export interface LegendRow {
  id: "zone" | "path" | "detections" | "fires" | "you" | "base";
  title: string;
  /** What the mark is, then how much of it there is, then its time and its source. */
  lines: string[];
  links: Link[];
}

export interface MapText {
  /** What the map shows, one sentence per item. */
  summary: string[];
  /** The summary as Listen says it: one sentence per utterance, distances in full. */
  said: string[];
  labels: { you: string; fire: string | null; end: (hoursAgo: number) => string };
  rows: LegendRow[];
  /** What Listen says in the legend: the summary, then each row's name and what its mark is, a sentence at a time. */
  voice: string[];
}

const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

export function mapText(json: VerdictJson, view: VerdictView, model: MapModel, lang: Lang, basemap: Basemap): MapText {
  const t = (key: StringKey, vars?: Vars) => translate(lang, key, vars);
  const at = (iso: string) => atlanticTime(lang, iso);
  const town = view.town;
  const link = (key: "badge.fire.link.firms" | "badge.fire.link.cwfis" | "layer.base.link.protomaps" | "layer.base.link.naturalEarth"): Link => ({ label: t(key), host: t(`${key}.host` as StringKey), url: t(`${key}.url` as StringKey) });
  const badge = (id: "trace" | "alert") => view.badges.find((b) => b.id === id)!;
  const layers = model.layers;
  const replay = json.mode === "replay";
  /** When a live source was fetched; for the replay, that the data is recorded; else nothing to say. */
  const checked = (when: string | null) => (when ? [t("layer.checked", { when: at(when) })] : replay ? [t("layer.recorded")] : []);
  const noOutline = t(replay ? "layer.zone.noOutline.replay" : "layer.zone.noOutline");

  // --- The rows, ECCC first -------------------------------------------------------------------------------------
  const zone = (): LegendRow => {
    const row = { id: "zone" as const, title: t("layer.zone"), links: badge("alert").links };
    if (!layers) return { ...row, lines: [t("layer.reduced")] };
    const z = layers.alertZone;
    const source = t(z.source === "naad_archive" ? "badge.alert.source.replay" : "badge.alert.source");
    const asked = z.checkedAt ? [t("badge.alert.checked", { when: at(z.checkedAt) })] : [];
    if (z.state === "active") return { ...row, lines: [z.outline ? t("layer.zone.active") : noOutline, ...(z.issued ? [t("badge.alert.issued", { when: at(z.issued) })] : []), ...asked, source] };
    if (z.state === "none") return { ...row, lines: [t(replay ? "layer.zone.none.replay" : "layer.zone.none"), ...asked, source] };
    return { ...row, lines: [t("layer.zone.notChecked"), source] };
  };

  const path = (): LegendRow => {
    const trace = badge("trace"); // its lines: the winds' source, then their model run or the day they were recorded
    const n = json.path.hoursTraced;
    return { id: "path", title: t("layer.path"), lines: [t(n === 1 ? "layer.path.body.one" : "layer.path.body", { town, n }), trace.lines[0], trace.lines[1]], links: trace.links };
  };

  const detections = (): LegendRow => {
    const row = { id: "detections" as const, title: t("layer.detections") };
    if (!layers) return { ...row, lines: [t("layer.reduced")], links: [] };
    const d = layers.detections;
    const within = { km: d.radiusKm, town };
    const count = d.count === 0 ? t("layer.detections.none", within) : d.count === 1 ? t("layer.detections.count.one", within) : t("layer.detections.count", { n: d.count, ...within });
    const sources = [
      ...(d.firms.ok && d.cwfis.ok ? [t("badge.fire.source.both")] : d.firms.ok ? [t("badge.fire.source.firms")] : d.cwfis.ok ? [t("badge.fire.source.cwfis")] : []),
      ...(d.firms.ok ? [] : [t("badge.fire.down.firms")]),
      ...(d.cwfis.ok ? [] : [t("badge.fire.down.cwfis")]),
    ].join(" ");
    // The older of the answers that came: the data on the map is at least that fresh.
    const fetched = [d.firms, d.cwfis].filter((s) => s.ok && s.checkedAt).map((s) => s.checkedAt!).sort()[0] ?? null;
    return {
      ...row,
      lines: [
        t("layer.detections.body", { hours: d.hours }),
        d.shown < d.count ? `${count} ${t("layer.detections.capped", { shown: d.shown })}` : count,
        ...(d.newest ? [t("layer.detections.newest", { when: at(d.newest) })] : []),
        sources,
        ...checked(fetched),
      ],
      links: [...(d.firms.ok ? [link("badge.fire.link.firms")] : []), ...(d.cwfis.ok ? [link("badge.fire.link.cwfis")] : [])],
    };
  };

  const fires = (): LegendRow => {
    const row = { id: "fires" as const, title: t("layer.fires") };
    // With no map details, the one flame there can be is the fire the answer names, when it is on Canada's list.
    if (!layers) return { ...row, lines: model.fires.length > 0 ? [t("layer.fires.body"), t("layer.fires.reduced")] : [t("layer.reduced")], links: [] };
    const f = layers.fires;
    const within = { km: layers.detections.radiusKm, town };
    // The flames the map draws: fires close together on the list share one.
    const flames = model.fires.length;
    const count = flames === 0 ? t("layer.fires.none", within) : flames === 1 ? t("layer.fires.count.one", within) : t("layer.fires.count", { n: flames, ...within });
    return {
      ...row,
      lines: f.ok ? [t("layer.fires.body"), count, t("badge.fire.source.cwfis"), ...checked(f.checkedAt)] : [t("layer.fires.body"), t("badge.fire.down.cwfis")],
      links: f.ok ? [link("badge.fire.link.cwfis")] : [],
    };
  };

  const you: LegendRow = { id: "you", title: t("layer.you"), lines: [t("layer.you.body", { town })], links: [] };
  const base: LegendRow =
    basemap === "tiles"
      ? {
          id: "base",
          title: t("layer.base"),
          lines: [t("layer.base.tiles", { date: TILES.osmDataTime.slice(0, 10) })],
          links: [{ label: t("layer.base.link.osm"), host: t("layer.base.link.osm.host"), url: t("map.credit.url") }, link("layer.base.link.protomaps")],
        }
      : { id: "base", title: t("layer.base"), lines: [t("layer.base.outline")], links: [link("layer.base.link.naturalEarth")] };
  const rows = [zone(), path(), detections(), fires(), you, base];

  // --- What the map shows, in sentences ---------------------------------------------------------------------------
  // Nothing is said to be absent when its source was not checked: the summary names each source that did not answer.
  const shown = model.detections.length;
  const hours = layers?.detections.hours ?? json.rules.hotspotHours;
  const seen = (d: NonNullable<typeof layers>["detections"]) =>
    !d.firms.ok && !d.cwfis.ok
      ? t("map.summary.detections.notChecked")
      : shown === 0
        ? t("map.summary.detections.none", { km: d.radiusKm, hours })
        : shown === 1
          ? t("map.summary.detections.one", { hours })
          : t("map.summary.detections", { n: shown, hours });
  const down = layers
    ? [...(layers.detections.firms.ok ? [] : [t("badge.fire.down.firms")]), ...(layers.detections.cwfis.ok && layers.fires.ok ? [] : [t("badge.fire.down.cwfis")])]
    : [];
  const zoneSaid = !layers ? [] : model.alertZone ? [t("map.summary.zone")] : layers.alertZone.state === "active" ? [noOutline] : layers.alertZone.state === "none" ? [] : [t("layer.zone.notChecked")];
  const summary = [
    sentence(view.map.aria),
    ...(layers ? [seen(layers.detections), ...down] : [t("map.note.reduced")]),
    ...(model.fires.length === 1 ? [t("map.summary.fires.one")] : model.fires.length > 1 ? [t("map.summary.fires", { n: model.fires.length })] : []),
    ...zoneSaid,
  ];

  const said = summary.flatMap((item) => aloud(lang, item));
  return {
    summary,
    said,
    labels: { you: t("layer.you"), fire: view.map.fireLabel, end: (hoursAgo) => view.map.edgeLabel(hoursAgo, null) },
    rows,
    voice: [...said, ...rows.flatMap((row) => aloud(lang, `${sentence(row.title)} ${row.lines[0]}`))],
  };
}

/** The note on the outline map saying why it is there in place of the detailed one. */
export function mapNote(lang: Lang, fallback: Fallback | null): string | null {
  return fallback ? translate(lang, `map.note.${fallback}` as StringKey) : null;
}
