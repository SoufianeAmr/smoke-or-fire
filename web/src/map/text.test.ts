// What the map says in words, from the real replay files in data/demo/ (2025-08-25 12:00 UTC).
import { describe, expect, test } from "vitest";
import halifax from "../../../data/demo/halifax.json";
import moncton from "../../../data/demo/moncton.json";
import bathurst from "../../../data/demo/bathurst.json";
import type { Lang } from "../i18n";
import type { EngineMap, VerdictJson } from "../verdict/types";
import { verdictView } from "../verdict/view";
import { readMap } from "./model";
import { mapNote, mapText, type Basemap } from "./text";

const NBSP = String.fromCharCode(0xa0);
const json = (data: unknown) => data as VerdictJson;
const text = (answer: VerdictJson, lang: Lang = "en", basemap: Basemap = "tiles") => mapText(answer, verdictView(answer, lang), readMap(answer), lang, basemap);
const row = (answer: VerdictJson, id: string, lang: Lang = "en", basemap: Basemap = "tiles") => text(answer, lang, basemap).rows.find((r) => r.id === id)!;
/** The answer as a live engine would give it: fetched just now, with the winds' model run. */
const live = (answer: VerdictJson, layers: (l: EngineMap["layers"]) => EngineMap["layers"] = (l) => l): VerdictJson => ({
  ...answer,
  mode: "live",
  wind: { ...answer.wind, run: "2026-10-03T18:00:00Z", recordedAt: null },
  map: { ...answer.map!, layers: layers(answer.map!.layers) },
});

describe("the legend: every layer says who it comes from, when, and gives a link", () => {
  test("ECCC's layer comes first, then the air's path, the detections, the official fires, the person and the basemap", () => {
    expect(text(json(moncton)).rows.map((r) => [r.id, r.title])).toEqual([
      ["zone", "ECCC alert zone"],
      ["path", "The air’s path"],
      ["detections", "Satellite fire detections"],
      ["fires", "Fires on Canada’s official list"],
      ["you", "You"],
      ["base", "The map underneath"],
    ]);
  });

  test("Moncton replay, ECCC's alert zone: what the outline is, when the alert was issued, and ECCC as the source", () => {
    const zone = row(json(moncton), "zone");
    expect(zone.lines).toEqual([
      "Dashed outline: ECCC’s forecast zone under the air quality alert.",
      "Issued 2025-08-25, 04:50 (Atlantic time).",
      "Data source: Environment and Climate Change Canada. For the replay, converted from the copy of ECCC’s messages kept by the NAAD System archive.",
    ]);
    expect(zone.links.map((l) => l.host)).toEqual(["alertsarchive.pelmorex.com"]);
  });

  test("the air's path: the winds' source and when they were recorded", () => {
    const path = row(json(moncton), "path");
    expect(path.lines).toEqual([
      "Thick line: the air that reached Moncton, traced back 20 hours. Thin lines: the same trace at two other heights. Each bead is one hour.",
      "Hourly winds from the GFS weather model (NOAA), through Open-Meteo.",
      "Recorded winds for the replay, downloaded 2026-09-26.",
    ]);
    expect(path.links).toEqual([{ label: "Open-Meteo", host: "open-meteo.com", url: "https://open-meteo.com/en/docs/gfs-api" }]);
  });

  test("the detections: how many, the newest time a satellite saw one, FIRMS and CWFIS, and that the data is recorded", () => {
    const detections = row(json(moncton), "detections");
    expect(detections.lines).toEqual([
      "Orange dots: where a satellite saw fire in the last 24 hours. A bigger dot means more heat was measured.",
      "498 detections within 500 km of Moncton.",
      "Newest one seen by a satellite: 2025-08-25, 03:29 (Atlantic time).",
      "Sources: NASA FIRMS and Natural Resources Canada (CWFIS).",
      "Recorded data for the replay.",
    ]);
    expect(detections.links.map((l) => l.url)).toEqual(["https://firms.modaps.eosdis.nasa.gov/map/", "https://cwfis.cfs.nrcan.gc.ca/interactive-map"]);
  });

  test("the official fires: what the flame is, how many, and Canada's list as the source", () => {
    const fires = row(json(moncton), "fires");
    expect(fires.lines).toEqual([
      "Flame: a fire on Canada’s official active fire list that is out of control or being held.",
      "11 within 500 km of Moncton.",
      "Source: Natural Resources Canada (CWFIS).",
      "Recorded data for the replay.",
    ]);
    expect(fires.links.map((l) => l.host)).toEqual(["cwfis.cfs.nrcan.gc.ca"]);
  });

  test("the person: the place that was checked, and that the map never asks for a location", () => {
    expect(row(json(moncton), "you").lines).toEqual(["Dark dot: Moncton, the place that was checked. The map never asks for your location."]);
  });

  test("the basemap: OpenStreetMap with its data's date, a link to its copyright, and Protomaps; Natural Earth on the outline map", () => {
    const tiles = row(json(moncton), "base");
    expect(tiles.lines).toEqual(["Roads, towns and coastlines from OpenStreetMap, as of 2026-09-28. The map is kept on this site: no other site learns what you look at."]);
    expect(tiles.links).toEqual([
      { label: "OpenStreetMap: copyright and licence", host: "openstreetmap.org", url: "https://www.openstreetmap.org/copyright" },
      { label: "Protomaps, who built the map tiles", host: "protomaps.com", url: "https://protomaps.com" },
    ]);
    const outline = row(json(moncton), "base", "en", "outline");
    expect([outline.lines, outline.links.map((l) => l.host)]).toEqual([["Province and coast outlines from Natural Earth (public domain)."], ["naturalearthdata.com"]]);
  });

  test("live: when each source was checked, and the winds' newest model run", () => {
    const answer = live(json(moncton), (l) => ({
      ...l,
      detections: { ...l.detections, firms: { ok: true, checkedAt: "2026-10-03T19:24:00Z" }, cwfis: { ok: true, checkedAt: "2026-10-03T19:18:00Z" } },
      fires: { ...l.fires, checkedAt: "2026-10-03T19:18:00Z" },
      alertZone: { source: "eccc_geomet", state: "active", issued: "2026-10-03T12:31:43Z", checkedAt: "2026-10-03T19:30:01Z", outline: true },
    }));
    // The older of the two fire sources' answers: what is on the map is at least that fresh.
    expect(row(answer, "detections").lines.at(-1)).toBe("Checked: 2026-10-03, 16:18 (Atlantic time).");
    expect(row(answer, "fires").lines.at(-1)).toBe("Checked: 2026-10-03, 16:18 (Atlantic time).");
    expect(row(answer, "path").lines[2]).toBe("Newest model run in these winds: 2026-10-03, 15:00 (Atlantic time).");
    expect(row(answer, "zone").lines).toEqual([
      "Dashed outline: ECCC’s forecast zone under the air quality alert.",
      "Issued 2026-10-03, 09:31 (Atlantic time).",
      "Checked with ECCC: 2026-10-03, 16:30 (Atlantic time).",
      "Data source: Environment and Climate Change Canada.",
    ]);
  });

  test("never a guess: none in effect, not checked, an alert whose zone could not be drawn, and a fire source that is down", () => {
    expect(row(json(halifax), "zone").lines[0]).toBe("No zone to draw: no ECCC air quality alert is in effect here.");
    const zone = (state: "active" | "not_checked", outline: boolean) =>
      row(live(json(moncton), (l) => ({ ...l, alertZone: { source: "eccc_geomet", state, issued: state === "active" ? "2026-10-03T12:31:43Z" : null, checkedAt: null, outline } })), "zone").lines;
    expect(zone("not_checked", false)).toEqual(["Not checked: ECCC’s alerts could not be read, so no zone is drawn.", "Data source: Environment and Climate Change Canada."]);
    expect(zone("active", false)[0]).toBe("An ECCC air quality alert is active here. Its zone could not be drawn.");

    const down = live(json(moncton), (l) => ({ ...l, detections: { ...l.detections, firms: { ok: false, checkedAt: null } }, fires: { ...l.fires, ok: false, checkedAt: null } }));
    expect(row(down, "detections").lines[3]).toBe("Source: Natural Resources Canada (CWFIS). NASA FIRMS: not checked.");
    expect(row(down, "detections").links.map((l) => l.host)).toEqual(["cwfis.cfs.nrcan.gc.ca"]);
    expect(row(down, "fires").lines).toEqual(["Flame: a fire on Canada’s official active fire list that is out of control or being held.", "Natural Resources Canada (CWFIS): not checked."]);
  });

  test("more detections than the map carries: it says how many there are and how many it shows", () => {
    const answer = live(json(moncton), (l) => ({ ...l, detections: { ...l.detections, count: 5200, shown: 4000 } }));
    expect(row(answer, "detections").lines[1]).toBe("5200 detections within 500 km of Moncton. The map shows the newest 4000.");
  });

  test("in French, as an equal", () => {
    expect(text(json(moncton), "fr").rows.map((r) => r.title)).toEqual(["Zone d’alerte d’ECCC", "Le trajet de l’air", "Détections de feux par satellite", "Feux de la liste officielle du Canada", "Vous", "Le fond de carte"]);
    expect(row(json(moncton), "detections", "fr").lines.slice(0, 3)).toEqual([
      `Points orange${NBSP}: les endroits où un satellite a vu du feu dans les 24 dernières heures. Plus le point est gros, plus la chaleur mesurée est forte.`,
      "498 détections à moins de 500 km de Moncton.",
      `La plus récente vue par un satellite${NBSP}: 2025-08-25, 3 h 29 (heure de l’Atlantique).`,
    ]);
    expect(row(json(moncton), "zone", "fr").lines.slice(0, 2)).toEqual([`Contour en tirets${NBSP}: la zone de prévision d’ECCC visée par l’alerte sur la qualité de l’air.`, "Émise le 2025-08-25, 4 h 50 (heure de l’Atlantique)."]);
  });
});

describe("what the map shows, in sentences", () => {
  test("Moncton: the air's path as the old map described it, then the detections, the official fires and ECCC's zone", () => {
    const answer = json(moncton);
    expect(text(answer).summary).toEqual([
      `${verdictView(answer, "en").map.aria}.`,
      "498 satellite fire detections from the last 24 hours are shown as orange dots.",
      "11 fires on Canada’s official list are shown with a flame.",
      "A dashed outline shows ECCC’s forecast zone under the air quality alert.",
    ]);
    expect(text(answer).summary[0]).toMatch(/^Map: over about 6 hours, the air moved from the Long Lake fire in Nova Scotia north-northeast to Moncton\.$/);
  });

  test("Halifax: no alert in effect, so no zone is spoken of", () => {
    expect(text(json(halifax)).summary.some((s) => /zone/i.test(s))).toBe(false);
  });

  test("no detection at all says so, in words", () => {
    const answer = json(halifax);
    const empty: VerdictJson = { ...answer, map: { ...answer.map!, detections: [], fires: [], layers: { ...answer.map!.layers, detections: { ...answer.map!.layers.detections, count: 0, shown: 0, newest: null }, fires: { ...answer.map!.layers.fires, count: 0 } } } };
    expect(text(empty).summary[1]).toBe("No satellite saw fire within 500 km in the last 24 hours.");
    expect(row(empty, "detections").lines[1]).toBe("None within 500 km of Halifax.");
    expect(row(empty, "fires").lines[1]).toBe("None within 500 km of Halifax.");
  });

  test("every sentence ends as a sentence, and none tells anyone not to call 911", () => {
    for (const lang of ["en", "fr"] as const) {
      for (const answer of [moncton, halifax, bathurst].map(json)) {
        const said = text(answer, lang);
        expect(said.summary.filter((s) => !/[.!?]$/.test(s))).toEqual([]);
        expect([...said.summary, ...said.voice, ...said.rows.flatMap((r) => r.lines)].filter((s) => /safe|sécuri|(do not|don’t|never|no need to) call|ne (pas|jamais) appeler/i.test(s))).toEqual([]);
      }
    }
  });

  test("Listen in the legend: the summary, then each layer by name with what its mark is", () => {
    const said = text(json(moncton));
    expect(said.voice.slice(0, said.summary.length)).toEqual(said.summary);
    expect(said.voice.slice(said.summary.length)).toEqual(said.rows.map((r) => `${r.title}. ${r.lines[0]}`));
  });
});

describe("the labels on the map", () => {
  test("the person, the fire by its name, and the far end of the path in hours", () => {
    const { labels } = text(json(moncton));
    expect([labels.you, labels.fire, labels.end(20), labels.end(1)]).toEqual(["You", "Long Lake fire", "20 h ago", "1 h ago"]);
    expect(text(json(moncton), "fr").labels.you).toBe("Vous");
  });
});

describe("no map details from the engine (an older engine)", () => {
  const { map, ...old } = json(moncton);
  const said = mapText(old, verdictView(old, "en"), readMap(old), "en", "outline");

  test("the summary says what is missing, and the rows that have nothing say so instead of a number", () => {
    expect(said.summary[1]).toBe("Simple map: the fire detections and the alert zone are not on it right now. The air’s path is.");
    const lines = (id: string) => said.rows.find((r) => r.id === id)!.lines;
    expect([lines("zone"), lines("detections"), lines("fires")]).toEqual([
      ["Not on the map right now: no details were received for it."],
      ["Not on the map right now: no details were received for it."],
      ["Not on the map right now: no details were received for it."],
    ]);
    // The air's path is still sourced from the answer itself.
    expect(lines("path")[1]).toBe("Hourly winds from the GFS weather model (NOAA), through Open-Meteo.");
  });

  test("Bathurst's fire is on Canada's list: its flame is explained", () => {
    const { map: _, ...older } = json(bathurst);
    expect(mapText(older, verdictView(older, "en"), readMap(older), "en", "outline").rows.find((r) => r.id === "fires")!.lines).toEqual([
      "Flame: a fire on Canada’s official active fire list that is out of control or being held.",
    ]);
  });
});

describe("the note on the outline map", () => {
  test("says, in plain words, why the simple map is there; nothing when the detailed map is", () => {
    expect([mapNote("en", null), mapNote("en", "tiles"), mapNote("en", "webgl"), mapNote("fr", "reduced")]).toEqual([
      null,
      "Simple map: the detailed map could not be loaded. It shows the same things.",
      "Simple map: this device cannot draw the detailed map. It shows the same things.",
      `Carte simple${NBSP}: les détections de feux et la zone d’alerte n’y sont pas pour l’instant. Le trajet de l’air y est.`,
    ]);
  });
});
