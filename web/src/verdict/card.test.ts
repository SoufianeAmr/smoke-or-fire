// The glance card, its source badges and what Listen says of them, from the real replay files in data/demo/
// (2025-08-25 12:00 UTC) and from live answers made of them.
import { describe, expect, test } from "vitest";
import bathurst from "../../../data/demo/bathurst.json";
import bridgetown from "../../../data/demo/bridgetown.json";
import charlottetown from "../../../data/demo/charlottetown.json";
import dieppe from "../../../data/demo/dieppe.json";
import edmundston from "../../../data/demo/edmundston.json";
import fredericton from "../../../data/demo/fredericton.json";
import halifax from "../../../data/demo/halifax.json";
import miramichi from "../../../data/demo/miramichi.json";
import moncton from "../../../data/demo/moncton.json";
import sackville from "../../../data/demo/sackville.json";
import saintJohn from "../../../data/demo/saint-john.json";
import sussex from "../../../data/demo/sussex.json";
import truro from "../../../data/demo/truro.json";
import westDalhousie from "../../../data/demo/west-dalhousie.json";
import { GLANCE } from "./glance";
import type { VerdictJson } from "./types";
import { verdictView } from "./view";

const json = (data: unknown) => data as VerdictJson;
const NBSP = String.fromCharCode(0xa0);
const LANGS = ["en", "fr"] as const;
const TOWNS = [moncton, dieppe, sackville, sussex, saintJohn, fredericton, miramichi, bathurst, edmundston, charlottetown, truro, halifax, bridgetown, westDalhousie].map(json);
// 7d: live, with no fire within 500 km. The fire sources were checked 7 minutes before.
const noFires = json({
  ...halifax, mode: "live", noFiresInRange: true, nearestFire: null, closestApproach: null, forward: null,
  sources: { ...halifax.sources, checkedMinutesAgo: 7 },
});
const withFire = (data: typeof moncton, fire: Partial<VerdictJson["nearestFire"]>) =>
  json({ ...data, closestApproach: { ...data.closestApproach, fire: { ...data.closestApproach.fire, ...fire } } });
/** A live answer: checked now, with the winds' newest model run and ECCC's answer about alerts. */
const live = (data: unknown, airQuality: unknown, wind: object = { run: "2026-10-03T18:00:00Z", recordedAt: null }) => {
  const d = json(data);
  return json({ ...d, mode: "live", wind: { ...d.wind, ...wind }, alerts: airQuality === undefined ? undefined : { airQuality } });
};
const WARNING = {
  code: "AQW", nameEn: "air quality warning", nameFr: "avertissement de qualité de l'air", colourEn: "yellow", colourFr: "jaune",
  zoneEn: "Moncton and Southeast New Brunswick", zoneFr: "Moncton et sud-est du Nouveau-Brunswick",
  issued: "2026-10-03T12:31:43Z", expires: "2026-10-04T04:31:43Z", url: null,
};
const ACTIVE = { state: "active", source: "eccc_geomet", checkedAt: "2026-10-03T19:30:01Z", alert: WARNING };
const NONE = { state: "none", source: "eccc_geomet", checkedAt: "2026-10-03T19:30:01Z", alert: null };
const NOT_CHECKED = { state: "not_checked", source: "eccc_geomet", checkedAt: null, alert: null };
const words = (line: string) => line.split(/\s+/).filter((word) => word !== "·").length;
const badge = (data: VerdictJson, id: string, lang: "en" | "fr" = "en") => verdictView(data, lang).badges.find((b) => b.id === id)!;

describe("the card’s line", () => {
  test("drifting smoke: the state, the fire and how far and which way it is", () => {
    expect([verdictView(json(moncton), "en").card.parts, verdictView(json(moncton), "fr").card.parts]).toEqual([
      ["Drifting smoke", "Long Lake fire", "159 km SSW"],
      ["Fumée qui dérive", `Feu de Long${NBSP}Lake`, "159 km SSO"],
    ]);
  });

  test("is one line, its parts joined by a dot that never starts a line", () => {
    expect(verdictView(json(moncton), "en").card.line).toBe(`Drifting smoke${NBSP}· Long Lake fire${NBSP}· 159 km SSW`);
  });

  test("an unnamed fire is named by the nearest community", () => {
    expect([verdictView(json(bathurst), "en").card.parts, verdictView(json(bathurst), "fr").card.parts]).toEqual([
      ["Drifting smoke", "Fire near Heath Steele", "52 km SW"],
      ["Fumée qui dérive", "Feu près de Heath Steele", "52 km SO"],
    ]);
  });

  test("a fire under 1 km away: no direction", () => {
    const near = withFire(moncton, { km: 0 });
    expect([verdictView(near, "en").card.parts[2], verdictView(near, "fr").card.parts[2]]).toEqual([`<${NBSP}1 km`, `<${NBSP}1 km`]);
  });

  test("unclear: maybe that fire, and look outside", () => {
    expect([verdictView(json(charlottetown), "en").card.parts, verdictView(json(miramichi), "en").card.parts, verdictView(json(charlottetown), "fr").card.parts, verdictView(json(miramichi), "fr").card.parts]).toEqual([
      ["Unclear", "Maybe the Long Lake fire", "Look outside"],
      ["Unclear", "Maybe a fire near Fontaine", "Look outside"],
      ["Incertain", "Peut-être le feu de Long Lake", "Regardez dehors"],
      ["Incertain", "Peut-être un feu près de Fontaine", "Regardez dehors"],
    ]);
  });

  test("nothing explains it: no known fire upwind, or none known within 500 km (a new fire may not be known yet)", () => {
    expect([verdictView(json(halifax), "en").card.parts, verdictView(noFires, "en").card.parts, verdictView(json(halifax), "fr").card.parts, verdictView(noFires, "fr").card.parts]).toEqual([
      ["Unexplained smoke", "No known fire upwind"],
      ["Unexplained smoke", "No known fire within 500 km"],
      ["Fumée inexpliquée", "Aucun feu connu en amont du vent"],
      ["Fumée inexpliquée", "Aucun feu connu à moins de 500 km"],
    ]);
  });

  test("about 8 words: 8 in English with a named fire, never more than 9; French runs to 11", () => {
    const lines = (lang: "en" | "fr") => [...TOWNS, noFires].map((d) => verdictView(d, lang).card.line);
    expect([words(verdictView(json(moncton), "en").card.line), Math.max(...lines("en").map(words)), Math.max(...lines("fr").map(words))]).toEqual([8, 9, 11]);
  });

  test("Call 911 is the main action only when nothing explains the smoke", () => {
    expect([moncton, miramichi, halifax, noFires].map((d) => verdictView(json(d), "en").card.callFirst)).toEqual([false, false, true, true]);
  });

  test("never says not to call, in any state or language", () => {
    const said = LANGS.flatMap((lang) => [...TOWNS, noFires].flatMap((d) => { const v = verdictView(d, lang); return [v.card.line, ...v.badges.flatMap((b) => [b.label, ...b.lines])]; }));
    expect(said.filter((s) => /safe|sécuri|(do not|don’t|never|no need to) call|ne (pas|jamais) appeler|n’appelez (pas|jamais)/i.test(s))).toEqual([]);
  });
});

describe("each verdict the engine returns has its own icon, shape and colour", () => {
  test("three states, no two alike in any of the three", () => {
    const states = ["drifting", "unclear", "unexplained"] as const;
    expect([Object.keys(GLANCE), ...(["icon", "shape", "background"] as const).map((key) => new Set(states.map((s) => GLANCE[s][key])).size)]).toEqual([[...states], 3, 3, 3]);
  });

  test("orange circle with wind lines, amber diamond with a question mark, red triangle with an exclamation mark", () => {
    expect((["drifting", "unclear", "unexplained"] as const).map((s) => [GLANCE[s].background, GLANCE[s].shape, GLANCE[s].icon])).toEqual([
      ["#E8590C", "circle", "wind"],
      ["#F79009", "diamond", "question"],
      ["#D92D20", "triangle", "exclamation"],
    ]);
  });

  test("the card’s state is the engine’s verdict", () => {
    expect([moncton, miramichi, halifax, noFires].map((d) => verdictView(json(d), "en").card.state)).toEqual(["drifting", "unclear", "unexplained", "unexplained"]);
  });
});

describe("the arrow beside the distance", () => {
  test("points from the person toward the fire, by the engine’s compass, and says so in words", () => {
    expect([verdictView(json(moncton), "en").card.arrow, verdictView(json(bathurst), "en").card.arrow, verdictView(json(westDalhousie), "en").card.arrow]).toEqual([
      { deg: 202.5, label: "toward the south-southwest" },
      { deg: 225, label: "toward the southwest" },
      { deg: 135, label: "toward the southeast" },
    ]);
  });

  test("in French, “vers le sud-sud-ouest”, and “vers l’est”, “vers l’ouest-nord-ouest” before a vowel", () => {
    const toward = (compass: string) => verdictView(withFire(moncton, { compass }), "fr").card.arrow?.label;
    expect(["SSW", "E", "WNW", "N"].map(toward)).toEqual(["vers le sud-sud-ouest", "vers l’est", "vers l’ouest-nord-ouest", "vers le nord"]);
  });

  test("every one of the 16 directions turns the arrow 22.5 degrees more, clockwise from north", () => {
    const all = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    expect(all.map((compass) => verdictView(withFire(moncton, { compass }), "en").card.arrow?.deg)).toEqual(all.map((_, i) => i * 22.5));
  });

  test("no arrow without a distance and a direction: under 1 km, unclear, unexplained", () => {
    expect([withFire(moncton, { km: 0 }), json(miramichi), json(halifax), noFires].map((d) => verdictView(d, "en").card.arrow)).toEqual([null, null, null, null]);
  });
});

describe("the badges", () => {
  test("three, in the same order on every verdict: the fire detection, the wind trace, ECCC’s alert", () => {
    expect([...TOWNS, noFires].map((d) => verdictView(d, "en").badges.map((b) => b.id).join(" "))).toEqual(Array(15).fill("fire trace alert"));
  });

  test("the fire, seen by a satellite: which one, when, and both sources with their links", () => {
    expect(badge(json(moncton), "fire")).toEqual({
      id: "fire",
      tone: "active",
      icon: "satellite",
      short: "Fire",
      label: "Satellite fire detection",
      lines: ["Terra saw it burning 10 hours ago.", "Detected: 2025-08-24, 22:43 (Atlantic time).", "Sources: NASA FIRMS and Natural Resources Canada (CWFIS)."],
      links: [
        { label: "NASA fire map", host: "firms.modaps.eosdis.nasa.gov", url: "https://firms.modaps.eosdis.nasa.gov/map/" },
        { label: "Canada’s fire map", host: "cwfis.cfs.nrcan.gc.ca", url: "https://cwfis.cfs.nrcan.gc.ca/interactive-map" },
      ],
    });
  });

  test("and in French", () => {
    const fire = badge(json(moncton), "fire", "fr");
    expect([fire.label, fire.lines, fire.links.map((l) => l.url)]).toEqual([
      "Détection satellite du feu",
      ["Le satellite Terra l’a vu brûler il y a 10 heures.", `Détecté${NBSP}: 2025-08-24, 22 h 43 (heure de l’Atlantique).`, `Sources${NBSP}: NASA FIRMS et Ressources naturelles Canada (SCIFV).`],
      ["https://firms.modaps.eosdis.nasa.gov/map/", "https://cwfis.cfs.nrcan.gc.ca/carte-interactive"],
    ]);
  });

  test("a fire no satellite saw is on Canada’s official list: said so, with no detection time made up", () => {
    const fire = badge(json(bathurst), "fire");
    expect([fire.tone, fire.icon, fire.label, fire.lines, fire.links.map((l) => l.host)]).toEqual([
      "active",
      "flame",
      "Official active fire list",
      ["It’s on Canada’s official active fire list.", "Source: Natural Resources Canada (CWFIS)."],
      ["cwfis.cfs.nrcan.gc.ca"],
    ]);
  });

  test("a fire known only from CWFIS hotspots (FIRMS down): a satellite detection with no time to give, never “on the official list”", () => {
    const hotspotsOnly = withFire(moncton, { lastSeen: null, lastSeenHoursAgo: null, cwfisIds: [], detections: { total: 3, bySource: { FIRMS: 0, CWFIS: 3, both: 0 }, satellites: [] } });
    const fire = badge(hotspotsOnly, "fire");
    expect([fire.tone, fire.icon, fire.label, fire.lines, fire.links.map((l) => l.host)]).toEqual([
      "active",
      "satellite",
      "Satellite fire detection",
      ["Satellite hotspots reported here in the last 24 hours.", "Source: Natural Resources Canada (CWFIS)."],
      ["cwfis.cfs.nrcan.gc.ca"],
    ]);
    expect(badge(hotspotsOnly, "fire", "fr").lines[0]).toBe("Points chauds satellites signalés ici au cours des 24 dernières heures.");
  });

  test("ECCC’s zone name starts with a capital, as its alert name does (French zones come in lower case)", () => {
    expect([badge(json(bridgetown), "alert", "fr").lines.slice(0, 2), badge(json(bridgetown), "alert").lines.slice(0, 2)]).toEqual([
      ["Avertissement de qualité de l'air", "Comté d'Annapolis"],
      ["Air quality warning", "Annapolis County"],
    ]);
  });

  test("a fire only one source saw names that source alone", () => {
    const onlyFirms = withFire(moncton, { detections: { total: 4, bySource: { FIRMS: 4, CWFIS: 0, both: 0 }, satellites: ["Terra"] } });
    expect([badge(onlyFirms, "fire").lines.at(-1), badge(onlyFirms, "fire").links.map((l) => l.host)]).toEqual(["Source: NASA FIRMS.", ["firms.modaps.eosdis.nasa.gov"]]);
  });

  test("nothing explains it: no detection near the path, the nearest fire, and the newest detection in the region", () => {
    const fire = badge(json(halifax), "fire");
    expect([fire.tone, fire.label, fire.lines]).toEqual([
      "none",
      "Fire detections: none near the air’s path",
      [
        "No fire within 50 km of any hourly step. The nearest, Long Lake, is 128 km away and off the path.",
        "Newest satellite detection in the region: 5 hours ago.",
        "Sources: NASA FIRMS and Natural Resources Canada (CWFIS).",
      ],
    ]);
  });

  test("no fire in range (live): none within 500 km, and how long ago the fire data was checked", () => {
    const fire = badge(noFires, "fire");
    expect([fire.tone, fire.label, fire.lines, badge(noFires, "fire", "fr").label]).toEqual([
      "none",
      "Fire detections: none within 500 km",
      ["No fires are reported within 500 km of you right now.", "Checked NASA and NRCan fire data 7 min ago. Newest satellite detection in the region: 5 hours ago.", "Sources: NASA FIRMS and Natural Resources Canada (CWFIS)."],
      `Détections de feux${NBSP}: aucune à moins de 500 km`,
    ]);
  });

  test("a fire source that did not answer is named as not checked", () => {
    const firmsDown = json({ ...halifax, sources: { ...halifax.sources, firms: { ...halifax.sources.firms, ok: false } } });
    const cwfisDown = json({ ...halifax, sources: { ...halifax.sources, cwfis: { ...halifax.sources.cwfis, ok: false } } });
    expect([badge(firmsDown, "fire").lines.at(-1), badge(cwfisDown, "fire").lines.at(-1), badge(firmsDown, "fire", "fr").lines.at(-1)]).toEqual([
      "Source: Natural Resources Canada (CWFIS). NASA FIRMS: not checked.",
      "Source: NASA FIRMS. Natural Resources Canada (CWFIS): not checked.",
      `Source${NBSP}: Ressources naturelles Canada (SCIFV). NASA FIRMS${NBSP}: non vérifié.`,
    ]);
  });

  test("the trace in replay: the wind’s source, when the recorded winds were downloaded, and how far back", () => {
    expect([badge(json(moncton), "trace"), badge(json(moncton), "trace", "fr").lines]).toEqual([
      {
        id: "trace",
        tone: "active",
        icon: "wind",
        short: "Wind",
        label: "Wind trace",
        lines: ["Hourly winds from the GFS weather model (NOAA), through Open-Meteo.", "Recorded winds for the replay, downloaded 2026-09-26.", "Traced back 20 hours from Moncton."],
        links: [{ label: "Open-Meteo", host: "open-meteo.com", url: "https://open-meteo.com/en/docs/gfs-api" }],
      },
      ["Vents horaires du modèle météo GFS (NOAA), obtenus par Open-Meteo.", "Vents enregistrés pour la reprise, téléchargés le 2026-09-26.", "Trajet retracé sur 20 heures depuis Moncton."],
    ]);
  });

  test("the trace, live: the newest model run in the winds, or “not checked” when the engine has none", () => {
    const lines = (wind?: object) => badge(live(moncton, NONE, wind), "trace").lines[1];
    expect([lines(), lines({ run: null, recordedAt: null }), lines({ run: undefined, recordedAt: undefined })]).toEqual([
      "Newest model run in these winds: 2026-10-03, 15:00 (Atlantic time).",
      "Model run: not checked.",
      "Model run: not checked.",
    ]);
  });

  test("ECCC’s alert, active in the replay: ECCC’s own name and zone, its times, and the archived message", () => {
    expect(badge(json(moncton), "alert")).toEqual({
      id: "alert",
      tone: "active",
      icon: "bell",
      short: "Alert",
      label: "ECCC air quality alert: active",
      lines: [
        "Special air quality statement",
        "Moncton and Southeast New Brunswick",
        "Issued 2025-08-25, 04:50 (Atlantic time).",
        "Valid until at least 2025-08-25, 20:50 (Atlantic time).",
        "Data source: Environment and Climate Change Canada. For the replay, converted from the copy of ECCC’s messages kept by the NAAD System archive.",
      ],
      links: [{ label: "The archived message", host: "alertsarchive.pelmorex.com", url: "https://alertsarchive.pelmorex.com/archive/2025-08-25/2025-08-25T07_51_32_18Iurn%263oid%2632.49.0.1.124.3033216116.2025_001.xml" }],
    });
  });

  test("and in French, in ECCC’s French", () => {
    const alert = badge(json(moncton), "alert", "fr");
    expect([alert.label, alert.lines.slice(0, 4), alert.links[0].label]).toEqual([
      `Alerte de qualité de l’air d’ECCC${NBSP}: en vigueur`,
      ["Bulletin spécial sur la qualité de l'air", "Moncton et sud-est du Nouveau-Brunswick", "Émise le 2025-08-25, 4 h 50 (heure de l’Atlantique).", "Valide au moins jusqu’au 2025-08-25, 20 h 50 (heure de l’Atlantique)."],
      "Le message archivé",
    ]);
  });

  test("active, live: the colour ECCC gives, when ECCC answered, and ECCC’s page for the place", () => {
    const alert = badge(live(moncton, ACTIVE), "alert");
    expect([alert.tone, alert.lines, alert.links, badge(live(moncton, ACTIVE), "alert", "fr").links[0]]).toEqual([
      "active",
      [
        "Air quality warning (yellow)",
        "Moncton and Southeast New Brunswick",
        "Issued 2026-10-03, 09:31 (Atlantic time).",
        "Valid until at least 2026-10-04, 01:31 (Atlantic time).",
        "Checked with ECCC: 2026-10-03, 16:30 (Atlantic time).",
        "Data source: Environment and Climate Change Canada.",
      ],
      // The spot, rounded to about 1 km: enough for ECCC to find the forecast zone.
      [{ label: "ECCC alerts for this place", host: "weather.gc.ca", url: "https://weather.gc.ca/en/location/index.html?coords=46.10,-64.80" }],
      { label: "Alertes d’ECCC pour cet endroit", host: "meteo.gc.ca", url: "https://meteo.gc.ca/fr/location/index.html?coords=46.10,-64.80" },
    ]);
  });

  test("none in effect: said as ECCC’s answer at a time, live and in the replay", () => {
    const liveNone = badge(live(moncton, NONE), "alert");
    const replayNone = badge(json(halifax), "alert");
    expect([liveNone.tone, liveNone.label, liveNone.lines, replayNone.tone, replayNone.lines, replayNone.links]).toEqual([
      "none",
      "ECCC air quality alert: none in effect",
      ["No air quality alert from ECCC is in effect for this place.", "Checked with ECCC: 2026-10-03, 16:30 (Atlantic time).", "Data source: Environment and Climate Change Canada."],
      "none",
      [
        "No air quality alert from ECCC was in effect for this place at the replay time: 2025-08-25, 09:00 (Atlantic time).",
        "Data source: Environment and Climate Change Canada. For the replay, converted from the copy of ECCC’s messages kept by the NAAD System archive.",
      ],
      [{ label: "NAAD System archive", host: "alertsarchive.pelmorex.com", url: "https://alertsarchive.pelmorex.com/en.php" }],
    ]);
  });

  test("not checked: when the engine could not check, and when an older engine says nothing about alerts", () => {
    const notChecked = badge(live(moncton, NOT_CHECKED), "alert");
    const olderEngine = badge(live(moncton, undefined), "alert");
    expect([notChecked, olderEngine.tone, olderEngine.label, badge(live(moncton, NOT_CHECKED), "alert", "fr").label]).toEqual([
      {
        id: "alert",
        tone: "notChecked",
        icon: "bell",
        short: "Not checked",
        label: "ECCC air quality alert: not checked",
        lines: ["The alerts could not be checked just now. That does not mean there is none.", "Data source: Environment and Climate Change Canada."],
        links: [{ label: "ECCC alerts for this place", host: "weather.gc.ca", url: "https://weather.gc.ca/en/location/index.html?coords=46.10,-64.80" }],
      },
      "notChecked",
      "ECCC air quality alert: not checked",
      `Alerte de qualité de l’air d’ECCC${NBSP}: non vérifiée`,
    ]);
  });

  test("each state has its own word on the badge, the same three in both languages", () => {
    const labels = (lang: "en" | "fr") => [ACTIVE, NONE, NOT_CHECKED].map((state) => badge(live(moncton, state), "alert", lang).label);
    expect([labels("en").map((l) => l.split(": ")[1]), labels("fr").map((l) => l.split(`${NBSP}: `)[1])]).toEqual([
      ["active", "none in effect", "not checked"],
      ["en vigueur", "aucune en vigueur", "non vérifiée"],
    ]);
  });

  test("every replay town’s alert badge is what ECCC’s recorded messages say for its own zone", () => {
    // By replay town: the engine names the spot after its nearest town (Sackville is in Tantramar).
    const towns = { Moncton: moncton, Dieppe: dieppe, Sackville: sackville, Sussex: sussex, "Saint John": saintJohn, Bridgetown: bridgetown, "West Dalhousie": westDalhousie, Fredericton: fredericton, Miramichi: miramichi, Bathurst: bathurst, Edmundston: edmundston, Charlottetown: charlottetown, Truro: truro, Halifax: halifax };
    expect(Object.fromEntries(Object.entries(towns).map(([town, d]) => [town, badge(json(d), "alert").tone]))).toEqual({
      Moncton: "active", Dieppe: "active", Sackville: "active", Sussex: "active", "Saint John": "active", Bridgetown: "active", "West Dalhousie": "active",
      Fredericton: "none", Miramichi: "none", Bathurst: "none", Edmundston: "none", Charlottetown: "none", Truro: "none", Halifax: "none",
    });
  });

  test("each badge has one short word for a small phone, and it says the state: Fire or None, Wind, Alert or None or Not checked", () => {
    const shorts = (lang: "en" | "fr") =>
      // found (Moncton), nothing near the path (Halifax), no fire in range, the alert not checked, an older engine
      [json(moncton), json(halifax), noFires, live(moncton, NOT_CHECKED), live(moncton, undefined)].map((d) => verdictView(d, lang).badges.map((b) => b.short));
    expect([shorts("en"), shorts("fr")]).toEqual([
      [["Fire", "Wind", "Alert"], ["None", "Wind", "None"], ["None", "Wind", "None"], ["Fire", "Wind", "Not checked"], ["Fire", "Wind", "Not checked"]],
      [["Feu", "Vent", "Alerte"], ["Aucune", "Vent", "Aucune"], ["Aucune", "Vent", "Aucune"], ["Feu", "Vent", "Non vérifiée"], ["Feu", "Vent", "Non vérifiée"]],
    ]);
  });

  test("the word follows the badge’s state on every verdict: the badge’s own word only when something was found", () => {
    const all = LANGS.flatMap((lang) => [...TOWNS, noFires, live(moncton, ACTIVE), live(moncton, NONE), live(moncton, NOT_CHECKED)].flatMap((d) => verdictView(d, lang).badges.map((b) => [lang, b] as const)));
    const expected = (lang: "en" | "fr", b: { id: string; tone: string }) =>
      b.tone === "none" ? { en: "None", fr: "Aucune" }[lang] : b.tone === "notChecked" ? { en: "Not checked", fr: "Non vérifiée" }[lang] : { fire: { en: "Fire", fr: "Feu" }, trace: { en: "Wind", fr: "Vent" }, alert: { en: "Alert", fr: "Alerte" } }[b.id as "fire"][lang];
    expect(all.filter(([lang, b]) => b.short !== expected(lang, b)).map(([lang, b]) => [lang, b.id, b.tone, b.short])).toEqual([]);
  });

  test("the short word is in the badge’s full name, which is what a screen reader says", () => {
    const all = LANGS.flatMap((lang) => [...TOWNS, noFires, live(moncton, ACTIVE), live(moncton, NOT_CHECKED)].flatMap((d) => verdictView(d, lang).badges));
    expect(all.filter((b) => !b.label.toLowerCase().includes(b.short.toLowerCase())).map((b) => [b.short, b.label])).toEqual([]);
  });

  test("every badge shows a source and at least one link, in every state", () => {
    const all = LANGS.flatMap((lang) => [...TOWNS, noFires, live(moncton, ACTIVE), live(moncton, NONE), live(moncton, NOT_CHECKED), live(moncton, undefined)].flatMap((d) => verdictView(d, lang).badges));
    expect(all.filter((b) => b.lines.length < 2 || b.links.length < 1 || b.links.some((l) => !l.url.startsWith("https://") || /[{}]/.test(l.url)) || b.lines.some((l) => /[{}]/.test(l)))).toEqual([]);
  });
});

describe("what Listen says of the card", () => {
  test("drifting (Moncton): the line in spoken words, the three badges by name, Why?, then 911", () => {
    expect(verdictView(json(moncton), "en").card.voice).toEqual([
      "Drifting smoke, most likely from the Long Lake fire, about 159 kilometres south-southwest of you.",
      "Under the answer are its sources.",
      "Tap one to see where it comes from: Satellite fire detection.",
      "Wind trace.",
      "ECCC air quality alert: active.",
      "For the details and what to do, tap the Why button.",
      "And if you ever see flames or a smoke column, tap the red button at the bottom to call nine-one-one.",
    ]);
  });

  test("and in French", () => {
    expect(verdictView(json(moncton), "fr").card.voice).toEqual([
      "De la fumée qui dérive, venue probablement du feu de Long Lake, à environ 159 kilomètres au sud-sud-ouest de vous.",
      "Sous la réponse, il y a ses sources.",
      `Touchez-en une pour voir d’où elle vient${NBSP}: Détection satellite du feu.`,
      "Trajet du vent.",
      `Alerte de qualité de l’air d’ECCC${NBSP}: en vigueur.`,
      "Pour les détails et quoi faire, touchez le bouton Pourquoi.",
      "Et si vous voyez des flammes ou une colonne de fumée, touchez le bouton rouge en bas pour appeler le neuf-un-un.",
    ]);
  });

  test("near the fire (Bridgetown): the notice, which stays on the card, is said before the sources", () => {
    expect(verdictView(json(bridgetown), "en").card.voice.slice(0, 4)).toEqual([
      "Drifting smoke, most likely from the Long Lake fire, about 17 kilometres south-southeast of you.",
      "The fire is close to you.",
      "Please follow official instructions.",
      "If you’ve been told to leave, tap: Told to leave your home? What to do.",
    ]);
  });

  test("under 1 km: no direction", () => {
    expect([verdictView(withFire(moncton, { km: 0 }), "en").card.voice[0], verdictView(withFire(moncton, { km: 0 }), "fr").card.voice[0]]).toEqual([
      "Drifting smoke, most likely from the Long Lake fire, less than one kilometre from you.",
      "De la fumée qui dérive, venue probablement du feu de Long Lake, à moins d’un kilomètre de vous.",
    ]);
  });

  test("unclear (Miramichi): maybe that fire or something close by, and look outside", () => {
    expect([verdictView(json(miramichi), "en").card.voice.slice(0, 3), verdictView(json(miramichi), "fr").card.voice.slice(0, 3)]).toEqual([
      ["It’s unclear.", "It may be smoke from a fire near Fontaine, or something close by.", "Please take a look outside."],
      ["C’est incertain.", "C’est peut-être de la fumée venue d’un feu près de Fontaine, ou quelque chose de proche.", "Regardez dehors."],
    ]);
  });

  test("nothing explains it: look outside, and the last sentence sends to the big red button", () => {
    const en = verdictView(json(halifax), "en").card.voice;
    const fr = verdictView(json(halifax), "fr").card.voice;
    expect([en.slice(0, 3), en.at(-1), fr.slice(0, 3), fr.at(-1)]).toEqual([
      ["Unexplained smoke.", "I found no known fire where your air came from.", "Please take a look outside."],
      "If you see flames or a smoke column, tap the big red button at the bottom to call nine-one-one.",
      ["De la fumée inexpliquée.", "Je n’ai trouvé aucun feu connu là d’où vient votre air.", "Regardez dehors."],
      "Si vous voyez des flammes ou une colonne de fumée, touchez le grand bouton rouge en bas pour appeler le neuf-un-un.",
    ]);
  });

  test("no fire in range: says so, with the distance in words", () => {
    expect([verdictView(noFires, "en").card.voice[1], verdictView(noFires, "fr").card.voice[1]]).toEqual([
      "No fire is reported within 500 kilometres of you.",
      "Aucun feu n’est signalé à moins de 500 kilomètres de vous.",
    ]);
  });

  test("an alert that was not checked is said as not checked, never as active", () => {
    const said = verdictView(live(moncton, NOT_CHECKED), "en").card.voice;
    expect([said.includes("ECCC air quality alert: not checked."), said.some((s) => /active/.test(s))]).toEqual([true, false]);
  });

  test("on every verdict: each badge is named as on screen, Why? is named, and nine-one-one comes last", () => {
    for (const lang of LANGS) {
      for (const data of [...TOWNS, noFires, live(moncton, NOT_CHECKED)]) {
        const view = verdictView(data, lang);
        const said = view.card.voice;
        expect([view.badges.filter((b) => !said.some((s) => s.endsWith(`${b.label}.`))), said.some((s) => s.includes(view.card.why.replace(/\s*[?!.]+$/, ""))), /nine-one-one|neuf-un-un/.test(said.at(-1)!)], `${lang} ${data.location.name}`).toEqual([[], true, true]);
      }
    }
  });

  test("the button is named without its question mark, so no sentence ends with two punctuation marks", () => {
    const said = LANGS.flatMap((lang) => [...TOWNS, noFires, live(moncton, NOT_CHECKED)].flatMap((d) => verdictView(d, lang).card.voice));
    expect(said.filter((s) => /[.?!…]\s*[.?!]$/.test(s))).toEqual([]);
    expect([verdictView(json(moncton), "en").card.why, verdictView(json(moncton), "fr").card.why]).toEqual(["Why?", `Pourquoi${NBSP}?`]); // on the screen, as before
  });

  test("what is behind Why? keeps its own script, word for word", () => {
    expect(verdictView(json(moncton), "en").voice.slice(0, 3)).toEqual([
      "Okay, here’s what I found.",
      "The smoke you’re smelling is most likely drifting from the Long Lake fire, about 159 kilometres south-southwest of you.",
      "So it’s most likely smoke carried by the wind from far away.",
    ]);
  });
});
