// "Best time to air out your home": what the tile and the screen say, from the engine's smokeForecast.
import { describe, expect, test } from "vitest";
import moncton from "../../../data/demo/moncton.json";
import en from "./strings.en.json"; // this feature's own words (they ship with its files)
import fr from "./strings.fr.json";
import type { SmokeForecast, VerdictJson } from "../verdict/types";
import { ECCC_COLOURS, airOutView, pattern } from "./view";

const NBSP = String.fromCharCode(0xa0);
const BREAKS = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const RULES = { hours: 48, minWindowHours: 3, maxLevel: 1, breaks: BREAKS };
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");
const run = (level: number, count: number) => Array.from({ length: count }, () => level);

/**
 * The engine's forecast for hourly `levels` from `first` (UTC), with the best time at the hours `window`
 * [first index, last index, level]. Day: 11:00 to 21:00 UTC, as in Moncton in early October.
 */
function forecast(levels: number[], window: [number, number, number] | null, first = "2026-10-04T06:00:00Z"): SmokeForecast {
  const hours = levels.map((level, i) => {
    const time = new Date(Date.parse(first) + i * HOUR);
    return { time: iso(time.getTime()), ugm3: level * 10, level, day: time.getUTCHours() >= 11 && time.getUTCHours() <= 21 };
  });
  return {
    state: window ? "window" : "none",
    source: "eccc_geomet",
    layer: "RAQDPS.Sfc_PM2.5-WildfireSmokePlume",
    run: "2026-10-04T00:00:00Z",
    checkedAt: "2026-10-04T06:24:36Z",
    window: window && { start: hours[window[0]].time, end: hours[window[1]].time, level: window[2], fromNow: window[0] === 0, toEnd: window[1] === levels.length - 1 },
    hours,
    rules: RULES,
  };
}
const NOT_AVAILABLE: SmokeForecast = { state: "not_available", source: "eccc_geomet", layer: "RAQDPS.Sfc_PM2.5-WildfireSmokePlume", run: null, checkedAt: null, window: null, hours: [], rules: RULES };
const live = (smokeForecast?: SmokeForecast) => ({ ...(moncton as unknown as VerdictJson), mode: "live", smokeForecast }) as VerdictJson;
/** A window of low smoke over the hours `from` to `to` (indexes from 06:00 UTC, 3 a.m. on Sunday in Moncton), in smoke. */
const windowAt = (from: number, to: number, level = 0, first?: string) =>
  forecast([...run(4, from), ...run(level, to - from + 1), ...run(4, 47 - to)], [from, to, level], first);

// MSC GeoMet's answer for Moncton on Oct 4, 2026 (data/samples/smoke-forecast-moncton.json), as the engine reads it:
// clear for 2 hours, light smoke from 6 to 10 a.m., clear from 11 a.m. to the last hour.
const SAMPLE = forecast([...run(0, 3), ...run(1, 5), ...run(0, 40)], [8, 47, 0]);

describe("the answer, in one line", () => {
  test.each([
    // Sunday 3 a.m. is hour 0; Monday 5 a.m. is hour 26.
    ["the same half of a day", windowAt(26, 29), "Mon 5 to 8 a.m.", "lun. 5 h à 8 h"],
    ["across noon", windowAt(7, 11), "Sun 10 a.m. to 2 p.m.", "dim. 10 h à 14 h"],
    ["to noon", windowAt(5, 9), "Sun 8 a.m. to noon", "dim. 8 h à midi"],
    ["from noon", windowAt(9, 12), "Sun noon to 3 p.m.", "dim. midi à 15 h"],
    ["an afternoon", windowAt(10, 15), "Sun 1 to 6 p.m.", "dim. 13 h à 18 h"],
    ["overnight", windowAt(19, 27), "Sun 10 p.m. to Mon 6 a.m.", "dim. 22 h à lun. 6 h"],
    ["to midnight: the day it started on", windowAt(17, 21), "Sun 8 p.m. to midnight", "dim. 20 h à minuit"],
    ["from midnight: the new day", windowAt(21, 26), "Mon 12 a.m. to 5 a.m.", "lun. 0 h à 5 h"],
    ["two days long", windowAt(4, 40), "Sun 7 a.m. to Mon 7 p.m.", "dim. 7 h à lun. 19 h"],
  ])("%s", (_, smoke, english, french) => {
    const spaced = (text: string) => text.replace(new RegExp(NBSP, "g"), " ");
    expect([spaced(airOutView(live(smoke), "en").answer), spaced(airOutView(live(smoke), "fr").answer)]).toEqual([english, french]);
  });

  test("a time and its unit stay on one line", () => {
    expect([airOutView(live(windowAt(26, 29)), "en").answer, airOutView(live(windowAt(26, 29)), "fr").answer]).toEqual([`Mon 5 to 8${NBSP}a.m.`, `lun. 5${NBSP}h à 8${NBSP}h`]);
  });

  test("a window that lasts to the forecast’s last hour has no end to give: From …", () => {
    expect([airOutView(live(SAMPLE), "en").answer, airOutView(live(SAMPLE), "fr").answer]).toEqual([`From Sun 11${NBSP}a.m.`, `À partir de dim. 11${NBSP}h`]);
  });

  test("a window that starts now is said with its condition: the person smells smoke", () => {
    const clearNow = forecast([...run(0, 6), ...run(3, 42)], [0, 5, 0]);
    expect([airOutView(live(clearNow), "en").answer, airOutView(live(clearNow), "fr").answer]).toEqual(["Now, if the smell is gone", "Maintenant, si l’odeur est partie"]);
  });

  test("no useful window: keep windows closed", () => {
    const smoky = forecast(run(3, 48), null);
    const view = airOutView(live(smoky), "en");
    expect([view.state, view.answer, airOutView(live(smoky), "fr").answer]).toEqual(["none", "Keep windows closed for now", "Gardez les fenêtres fermées pour l’instant"]);
  });

  test.each([
    ["the engine could not read the forecast", live(NOT_AVAILABLE)],
    ["an older engine says nothing of a forecast", live(undefined)],
    ["the replay has none recorded", moncton as unknown as VerdictJson],
    // Never a strip without its hours, whatever the state says.
    ["a window with no hours", live({ ...SAMPLE, hours: [] })],
  ])("%s: forecast not available, and no strip", (_, json) => {
    const view = airOutView(json, "en");
    expect([view.state, view.answer, view.strip, airOutView(json, "fr").answer]).toEqual(["notAvailable", "Forecast not available", null, "Prévision non disponible"]);
  });

  test("the title is the label and the answer, with the French space before the colon", () => {
    expect([airOutView(live(windowAt(26, 29)), "en").title, airOutView(live(windowAt(26, 29)), "fr").title]).toEqual([
      `Best time to air out your home: Mon 5 to 8${NBSP}a.m.`,
      `Meilleur moment pour aérer votre maison${NBSP}: lun. 5${NBSP}h à 8${NBSP}h`,
    ]);
  });
});

// On the verdict's sheet at its half height the same answer is a chip: one of two in a row, so the map stays in view.
describe("the chip: a short label and the answer in a few words", () => {
  const plain = (text: string) => text.replace(/\s/g, " ");
  const chip = (smoke: SmokeForecast | undefined, lang: "en" | "fr" = "en", json = live(smoke)) => { const c = airOutView(json, lang).chip; return [c.label, plain(c.answer)]; };

  test("a best time is given as on the tile: the day and the hours", () => {
    expect(chip(windowAt(26, 29))).toEqual(["When to air out", "Mon 5 to 8 a.m."]);
    expect(chip(windowAt(26, 29), "fr")).toEqual(["Quand aérer", "lun. 5 h à 8 h"]);
  });

  test("the chip’s time is the tile’s own answer, whatever the window", () => {
    for (const smoke of [windowAt(26, 29), windowAt(0, 5), windowAt(20, 47)]) {
      for (const lang of ["en", "fr"] as const) expect(airOutView(live(smoke), lang).chip.answer).toBe(airOutView(live(smoke), lang).answer);
    }
  });

  test("no useful window, and no forecast: two words, never a guess", () => {
    const none = forecast(run(4, 48), null);
    expect([chip(none), chip(none, "fr")]).toEqual([["When to air out", "Not now"], ["Quand aérer", "Pas maintenant"]]);
    expect([chip(NOT_AVAILABLE), chip(NOT_AVAILABLE, "fr"), chip(undefined)]).toEqual([["When to air out", "Not available"], ["Quand aérer", "Non disponible"], ["When to air out", "Not available"]]);
  });
});

describe("under the answer", () => {
  test("a window later: what the forecast shows then, and that a forecast can be wrong", () => {
    expect(airOutView(live(windowAt(26, 29)), "en").lines).toEqual([
      "The forecast shows no smoke here then.",
      "A forecast can be wrong. If you see or smell smoke then, keep windows closed.",
    ]);
  });

  test("a window in ECCC’s lowest class says it is not smoke-free", () => {
    expect(airOutView(live(windowAt(26, 29, 1)), "en").lines[0]).toBe("The forecast shows the least smoke here then: a little, not none.");
  });

  test("a window from now: until when, and what to do if the smoke is still there", () => {
    const clearNow = forecast([...run(0, 6), ...run(3, 42)], [0, 5, 0]);
    expect(airOutView(live(clearNow), "en").lines).toEqual([
      `The forecast shows no smoke here until Sun 8${NBSP}a.m.`,
      "Still smell smoke? Keep windows closed. A forecast can be wrong, and smoke from close by is not in it.",
    ]);
  });

  test("no smoke in the whole forecast: for the next 48 hours, the engine’s number", () => {
    const [clear, light] = [forecast(run(0, 48), [0, 47, 0]), forecast(run(1, 48), [0, 47, 1])];
    expect([airOutView(live(clear), "en").lines[0], airOutView(live(light), "en").lines[0]]).toEqual([
      "The forecast shows no smoke here for the next 48 hours.",
      "The forecast shows only a little smoke here for the next 48 hours.",
    ]);
  });

  test("no window: how long the smoke lasts and the break the rule needs, both the engine’s numbers", () => {
    const smoky = { ...forecast(run(3, 48), null), rules: { ...RULES, hours: 36, minWindowHours: 4 } };
    expect(airOutView(live(smoky), "en").lines).toEqual([
      "The forecast shows smoke here through the next 36 hours, with no break of 4 hours or more.",
      "Check again later: the forecast is updated twice a day.",
    ]);
  });

  test("not available, live: it could not be read, which is not clear air", () => {
    expect(airOutView(live(NOT_AVAILABLE), "en").lines).toEqual(["The smoke forecast could not be read just now. That does not mean the air is clear."]);
  });

  test("not available, replay: forecasts are kept about two days", () => {
    expect(airOutView(moncton as unknown as VerdictJson, "en").lines).toEqual([
      "This is a replay of Aug 25, 2025. Smoke forecasts are kept for about two days, so there is none for that day.",
    ]);
  });
});

describe("the strip", () => {
  const strip = airOutView(live(SAMPLE), "en").strip!;

  test("one row for each Atlantic day: today, tomorrow, then the weekday", () => {
    // 48 hours from Sunday 3 a.m. end on Tuesday at 2 a.m.
    expect([strip.rows.map((row) => row.name), airOutView(live(SAMPLE), "fr").strip!.rows.map((row) => row.name)]).toEqual([
      ["Today", "Tomorrow", "Tuesday"],
      ["Aujourd’hui", "Demain", "Mardi"],
    ]);
  });

  test("each row has 24 clock hours, with a bar where the forecast has one", () => {
    const filled = strip.rows.map((row) => row.cells.map((bars) => bars.length).join(""));
    expect(filled).toEqual(["0".repeat(3) + "1".repeat(21), "1".repeat(24), "1".repeat(3) + "0".repeat(21)]);
  });

  test("a bar has its level", () => {
    expect(strip.rows[0].cells.slice(3, 12).map((bars) => bars[0].level)).toEqual([0, 0, 0, 1, 1, 1, 1, 1, 0]);
  });

  test("the best time’s bars are marked, row by row", () => {
    expect(strip.rows.map((row) => row.best)).toEqual([{ from: 11, to: 23 }, { from: 0, to: 23 }, { from: 0, to: 2 }]);
    expect(strip.rows[0].cells.map((bars) => (bars[0]?.best ? "b" : ".")).join("")).toBe(".".repeat(11) + "b".repeat(13));
  });

  test("day and night, as stretches of the hours the forecast covers", () => {
    // The sun is up for the hours 8 a.m. to 6 p.m. (11:00 to 21:00 UTC).
    expect(strip.rows.map((row) => row.sky)).toEqual([
      [{ from: 3, to: 7, day: false }, { from: 8, to: 18, day: true }, { from: 19, to: 23, day: false }],
      [{ from: 0, to: 7, day: false }, { from: 8, to: 18, day: true }, { from: 19, to: 23, day: false }],
      [{ from: 0, to: 2, day: false }],
    ]);
  });

  test("the clock under each row: 6 a.m., noon and 6 p.m.", () => {
    // With a plain space: "6 a.m." may go on two lines under its mark when the text is made larger.
    expect([strip.ticks.map((tick) => tick.hour), strip.ticks.map((tick) => tick.label), airOutView(live(SAMPLE), "fr").strip!.ticks.map((tick) => tick.label)]).toEqual([
      [6, 12, 18],
      ["6 a.m.", "noon", "6 p.m."],
      ["6 h", "midi", "18 h"],
    ]);
  });

  test("it is plainly a forecast, with who made it, its model run and when it was read", () => {
    expect(strip.by).toEqual([
      "A forecast, not a measurement: Environment and Climate Change Canada’s FireWork model.",
      "Model run: 2026-10-03, 21:00 (Atlantic time).",
      "Read from ECCC: 2026-10-04, 03:24 (Atlantic time).",
      "Hours are in Atlantic time.",
    ]);
  });

  test("a recorded forecast says so, in place of when it was read", () => {
    const recorded = airOutView(live({ ...SAMPLE, source: "recorded", checkedAt: null }), "en").strip!;
    expect(recorded.by[2]).toBe("Recorded with the replay.");
  });

  test("the title and the picture’s name carry the engine’s number of hours", () => {
    expect([strip.title, strip.aria]).toEqual([
      "Smoke forecast, next 48 hours",
      "Chart: the smoke forecast for the next 48 hours, hour by hour. Best time to air out your home: From Sun 11 a.m.",
    ]);
  });

  test("the legend names the best time only when there is one", () => {
    expect([strip.legend.best, airOutView(live(forecast(run(3, 48), null)), "en").strip!.legend.best]).toEqual(["Best time to air out", null]);
  });

  test("the same forecast in words: each stretch of hours at one level, with ECCC’s numbers", () => {
    const spaced = (items: string[]) => items.map((item) => item.replace(new RegExp(NBSP, "g"), " "));
    expect(spaced(strip.list.items)).toEqual([
      "Sun 3 to 5 a.m.: no smoke",
      "Sun 6 to 10 a.m.: smoke level 1 of 11 (1 to 10 µg/m³)",
      "Sun 11 a.m. to Tue 2 a.m.: no smoke",
    ]);
    expect(spaced(airOutView(live(SAMPLE), "fr").strip!.list.items)).toEqual([
      "dim. 3 h à 5 h : aucune fumée",
      "dim. 6 h à 10 h : fumée de niveau 1 sur 11 (1 à 10 µg/m³)",
      "dim. 11 h à mar. 2 h : aucune fumée",
    ]);
  });

  test("the highest class has no upper bound, and one hour alone is said alone", () => {
    const items = airOutView(live(forecast([11, ...run(5, 47)], null)), "en").strip!.list.items.map((item) => item.replace(new RegExp(NBSP, "g"), " "));
    expect(items).toEqual(["Sun 3 a.m.: smoke level 11 of 11 (100 µg/m³ or more)", "Sun 4 a.m. to Tue 2 a.m.: smoke level 5 of 11 (40 to 50 µg/m³)"]);
  });
});

describe("the clocks change", () => {
  test("the night they go back, the hour said twice has two bars in its place", () => {
    // Nov 1, 2026, from midnight: 1 a.m. Atlantic Daylight Time (04:00 UTC), then 1 a.m. Atlantic Standard Time (05:00 UTC).
    const rows = airOutView(live(forecast(run(0, 48), [0, 47, 0], "2026-11-01T03:00:00Z")), "en").strip!.rows;
    expect(rows[0].cells.slice(0, 4).map((bars) => bars.length)).toEqual([1, 2, 1, 1]);
  });

  test("the night they go forward, the hour that does not exist has none", () => {
    // Mar 14, 2027, from midnight: 1 a.m. Atlantic Standard Time (05:00 UTC), then 3 a.m. Atlantic Daylight Time (06:00 UTC).
    const rows = airOutView(live(forecast(run(0, 48), [0, 47, 0], "2027-03-14T04:00:00Z")), "en").strip!.rows;
    expect(rows[0].cells.slice(0, 5).map((bars) => bars.length)).toEqual([1, 1, 0, 1, 1]);
  });
});

describe("ECCC’s scale", () => {
  test("one colour for each class of ECCC’s legend above “no smoke”", () => {
    expect(ECCC_COLOURS).toHaveLength(BREAKS.length);
  });

  test("no green: smoke is never all clear (DESIGN-LOCK hard rule)", () => {
    const green = ECCC_COLOURS.filter((hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return g > r && g > b;
    });
    expect(green).toEqual([]);
  });

  test("a pattern for each family of colours, so a level is never told by colour alone", () => {
    expect(Array.from({ length: 12 }, (_, level) => pattern(level))).toEqual([
      "none", "dots", "dots", "dots", "lines", "lines", "lines", "cross", "cross", "cross", "cross", "solid",
    ]);
  });
});

describe("sources and links", () => {
  test("ECCC’s maps, ECCC’s legend and Health Canada’s advice, in the language of the screen", () => {
    expect(airOutView(live(SAMPLE), "en").links.map((link) => [link.host, link.url])).toEqual([
      ["weather.gc.ca", "https://weather.gc.ca/firework/index_e.html"],
      ["geo.weather.gc.ca", "https://geo.weather.gc.ca/geomet?version=1.3.0&service=WMS&request=GetLegendGraphic&sld_version=1.1.0&layer=RAQDPS.Sfc_PM2.5-WildfireSmokePlume&format=image/png&STYLE=PM2.5_0to100ugm3_Dis"],
      ["canada.ca", "https://www.canada.ca/en/services/health/healthy-living/environment/air-quality/wildfire-smoke/protecting-your-physical-mental-health.html"],
    ]);
    expect(airOutView(live(SAMPLE), "fr").links.map((link) => link.url)).toEqual([
      "https://meteo.gc.ca/firework/index_f.html",
      "https://geo.weather.gc.ca/geomet?version=1.3.0&service=WMS&request=GetLegendGraphic&sld_version=1.1.0&layer=RAQDPS.Sfc_PM2.5-WildfireSmokePlume&format=image/png&STYLE=PM2.5_0to100ugm3_Dis&lang=fr",
      "https://www.canada.ca/fr/services/sante/vie-saine/environnement/qualite-air/fumee-feux-foret/protegez-votre-sante-physique-mentale.html",
    ]);
  });

  test("the legend’s link names the layer the engine reads", () => {
    expect(en["airout.link.legend.url"]).toContain(`layer=${SAMPLE.layer}&`);
  });

  test("with no forecast there is no legend to link, but ECCC’s maps still are", () => {
    expect(airOutView(live(NOT_AVAILABLE), "en").links.map((link) => link.host)).toEqual(["weather.gc.ca", "canada.ca"]);
  });

  test("the rule is said in one sentence, with the engine’s number, as the app’s reading and not ECCC’s advice", () => {
    const smoky = { ...SAMPLE, rules: { ...RULES, minWindowHours: 4 } };
    expect([airOutView(live(smoky), "en").rule, airOutView(live(NOT_AVAILABLE), "en").rule]).toEqual([
      "How the best time is chosen: the first 4 hours or more in a row with the least smoke in ECCC’s forecast. It is this app’s reading of the forecast, not advice from ECCC.",
      null,
    ]);
  });

  test("what the forecast leaves out is said, and 911 with it", () => {
    for (const text of [en["airout.limits"], fr["airout.limits"]]) expect(text).toMatch(/911/);
  });
});

describe("Listen", () => {
  const said = (smoke: SmokeForecast | undefined, lang: "en" | "fr" = "en", json = live(smoke)) => airOutView(json, lang).voice.map((sentence) => sentence.replace(new RegExp(NBSP, "g"), " "));

  test("a window: the time in full words, the caution, how to read the chart, who made the forecast, then 911", () => {
    expect(said(windowAt(26, 29))).toEqual([
      "Here’s the best time to air out your home: Monday, from 5 to 8 a.m.",
      "That’s when the forecast shows the least smoke where you are.",
      "A forecast can be wrong, so if you see or smell smoke then, keep your windows closed.",
      "Under the answer, a chart shows the smoke forecast hour by hour.",
      "Taller bars mean more smoke.",
      "A sun marks the day, and a moon the night.",
      "The forecast comes from Environment and Climate Change Canada.",
      "And if you ever see flames or thick smoke rising, tap the red button at the bottom to call nine-one-one.",
    ]);
  });

  test("the time, as a person would say it", () => {
    expect([said(SAMPLE)[0], said(windowAt(19, 27))[0], said(windowAt(7, 11), "fr")[0], said(SAMPLE, "fr")[0]]).toEqual([
      "Here’s the best time to air out your home: from Sunday at 11 a.m. on.",
      "Here’s the best time to air out your home: from Sunday at 10 p.m. to Monday at 6 a.m.",
      "Voici le meilleur moment pour aérer votre maison : dimanche, de 10 h à 14 h.",
      "Voici le meilleur moment pour aérer votre maison : à partir de dimanche à 11 h.",
    ]);
  });

  test("from now: now, if the smell is gone", () => {
    expect(said(forecast(run(0, 48), [0, 47, 0])).slice(0, 3)).toEqual([
      "The forecast shows little or no smoke where you are right now.",
      "So the best time to air out your home is now, if the smell is gone.",
      "If you still smell smoke, keep your windows closed.",
    ]);
  });

  test("no window: keep your windows closed, for the engine’s number of hours", () => {
    expect(said(forecast(run(3, 48), null)).slice(0, 2)).toEqual([
      "For now, keep your windows closed.",
      "The forecast shows smoke where you are through the next 48 hours, with no real break.",
    ]);
  });

  test("not available: said plainly, with no chart to describe, and 911 last", () => {
    expect([said(NOT_AVAILABLE), said(undefined, "en", moncton as unknown as VerdictJson)]).toEqual([
      [
        "I couldn’t read the smoke forecast just now.",
        "That doesn’t mean the air is clear.",
        "You can check again in a little while.",
        "And if you ever see flames or thick smoke rising, tap the red button at the bottom to call nine-one-one.",
      ],
      [
        "This is a replay of August 25, 2025.",
        "There’s no smoke forecast for that day: forecasts are kept for only about two days.",
        "And if you ever see flames or thick smoke rising, tap the red button at the bottom to call nine-one-one.",
      ],
    ]);
  });
});

describe("the strings", () => {
  const mine = (table: Record<string, string>) => Object.entries(table).filter(([key]) => key.startsWith("airout.") || key.startsWith("voice.airout."));

  test("the first view says smoke, never PM2.5: only the list’s note on the numbers names it", () => {
    const named = [...mine(en), ...mine(fr)].filter(([key, text]) => !key.endsWith(".url") && /PM\s?2[.,]5/i.test(text)).map(([key]) => key);
    expect(named).toEqual(["airout.list.numbers", "airout.list.numbers"]);
  });

  test("the voice spells 911 out, as on every screen", () => {
    expect([...mine(en), ...mine(fr)].filter(([key, text]) => key.startsWith("voice.") && /\d{3}/.test(text.replace(/2025/g, ""))).map(([key]) => key)).toEqual([]);
  });
});
