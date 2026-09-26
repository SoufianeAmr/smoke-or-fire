// The verdict view from the real replay files in data/demo/ (2025-08-25 12:00 UTC).
import { describe, expect, test } from "vitest";
import halifax from "../../../data/demo/halifax.json";
import miramichi from "../../../data/demo/miramichi.json";
import moncton from "../../../data/demo/moncton.json";
import type { Fire, VerdictJson } from "./types";
import { verdictView } from "./view";

const json = (data: unknown) => data as VerdictJson;

describe("Moncton replay (drifting, low: the three heights disagree)", () => {
  const view = verdictView(json(moncton), "en");

  test("is the drifting smoke screen, from the Long Lake fire", () => {
    expect([view.variant, view.band.label, view.band.headline, view.band.sub]).toEqual([
      "7a",
      "DRIFTING SMOKE",
      "Likely from the Long Lake fire",
      "Smoke drifting from Nova Scotia, about 158 km south-southwest of you.",
    ]);
  });

  test("says the heights disagree as the reason for low confidence", () => {
    expect([view.confidence.chip, view.confidence.text]).toEqual([
      "Low confidence",
      "We traced the air at three heights above the ground, and they don’t agree.",
    ]);
  });

  test("gives the official advice for an AQHI of 10+", () => {
    expect([view.aqhi.display, view.aqhi.segments, view.todo.kind === "advice" && view.todo.official]).toEqual([
      "10+",
      11,
      "Official advice for an AQHI of 10+ (very high risk).",
    ]);
  });

  test("says how many hours were traced and that the wind data ended", () => {
    expect(view.why.items[0].title).toBe("We traced the air back 20 hours");
    expect(view.why.items[0].body.endsWith("Our wind data ends there.")).toBe(true);
  });

  test("keeps the design's French wording", () => {
    const fr = verdictView(json(moncton), "fr");
    expect([fr.band.headline, fr.band.sub, fr.fireRow.kind === "fire" && fr.fireRow.subtitle]).toEqual([
      "Elle vient probablement du feu de Long Lake",
      "Fumée venue de la Nouvelle-Écosse, à environ 158 km au sud-sud-ouest de chez vous.",
      "West Dalhousie (N.‑É.)",
    ]);
  });
});

test("Miramichi replay is the unclear screen, from an unnamed fire", () => {
  const view = verdictView(json(miramichi), "en");
  expect([view.variant, view.band.sub, view.fireRow.kind === "fire" && view.fireRow.title]).toEqual([
    "7c",
    "The air passed near a fire near Fontaine, but not close enough to be sure.",
    "Fire near Fontaine",
  ]);
});

test("Halifax replay is the unexplained screen, with Long Lake as the nearest fire", () => {
  const view = verdictView(json(halifax), "en");
  expect([view.variant, view.fireRow.kind === "nearest" && view.fireRow.title, view.why.items[1].body]).toEqual([
    "7b",
    "Long Lake fire, N.S.",
    "No fire within 50 km of any hourly step. The nearest, Long Lake, is 128 km away and off the path.",
  ]);
});

test("no fire within 500 km is the no-fires screen", () => {
  const none = { ...json(halifax), noFiresInRange: true, nearestFire: null, closestApproach: null };
  const view = verdictView(none, "en");
  expect([view.variant, view.fireRow.kind === "none" && view.fireRow.title, view.why.items[1].title]).toEqual([
    "7d",
    "None reported within 500 km",
    "No active fires in the region",
  ]);
});

test("a missing AQHI shows no reading, never a number", () => {
  const view = verdictView({ ...json(moncton), aqhi: null }, "en");
  expect([view.aqhi.display, view.aqhi.risk, view.todo.kind === "noReading" && view.todo.general]).toEqual([
    "–",
    "No recent reading",
    "No air quality reading from the last 2 hours.",
  ]);
});

describe("the last satellite sighting of the fire (Why item 2, map badge)", () => {
  const withLastSeen = (lastSeen: Record<string, unknown>) => {
    const data = json(moncton);
    const fire = { ...data.closestApproach!.fire, lastSeen: { time: "2025-08-25T11:20:00Z", instrument: "VIIRS", ...lastSeen } } as Fire;
    return { ...data, closestApproach: { ...data.closestApproach!, fire } };
  };
  const sighted40MinutesAgo = withLastSeen({ hoursAgo: 1, minutesAgo: 40, satellite: "NOAA-21", latencyClass: "URT" });
  const sighted5HoursAgo = withLastSeen({ hoursAgo: 5, minutesAgo: 300, satellite: "NOAA-20", latencyClass: "NRT" });

  test("names the satellite, in minutes under an hour", () => {
    expect([verdictView(sighted40MinutesAgo, "en").why.items[1].body, verdictView(sighted40MinutesAgo, "fr").why.items[1].body]).toEqual([
      "About 6 hours ago, that air was over the Long Lake fire. NOAA-21 saw it burning 40 minutes ago.",
      expect.stringMatching(/ Le satellite NOAA-21 l’a vu brûler il y a 40 minutes\.$/),
    ]);
  });

  test("names the satellite, in hours from an hour on", () => {
    expect([verdictView(sighted5HoursAgo, "en").why.items[1].body, verdictView(sighted5HoursAgo, "fr").why.items[1].body]).toEqual([
      "About 6 hours ago, that air was over the Long Lake fire. NOAA-20 saw it burning 5 hours ago.",
      expect.stringMatching(/ Le satellite NOAA-20 l’a vu brûler il y a 5 heures\.$/),
    ]);
  });

  test("keeps the satellites sentence when no satellite is named (Moncton replay)", () => {
    expect(verdictView(json(moncton), "en").why.items[1].body).toBe(
      "About 6 hours ago, that air was over the Long Lake fire. Satellites saw it burning in the last 5 hours.",
    );
  });

  test("shows a FIRMS badge on the map card", () => {
    expect([verdictView(sighted40MinutesAgo, "en").map.badge, verdictView(sighted5HoursAgo, "fr").map.badge]).toEqual([
      "📡 VIIRS NOAA-21 • Ultra Real-Time (detected 40 min ago)",
      "📡 VIIRS NOAA-20 • Quasi temps réel (détecté il y a 5 h)",
    ]);
  });

  test("shows no badge when the last sighting is not from FIRMS (Moncton replay)", () => {
    expect(verdictView(json(moncton), "en").map.badge).toBeNull();
  });
});
