// The verdict view from the real replay files in data/demo/ (2025-08-25 12:00 UTC).
import { describe, expect, test } from "vitest";
import bathurst from "../../../data/demo/bathurst.json";
import charlottetown from "../../../data/demo/charlottetown.json";
import edmundston from "../../../data/demo/edmundston.json";
import fredericton from "../../../data/demo/fredericton.json";
import halifax from "../../../data/demo/halifax.json";
import miramichi from "../../../data/demo/miramichi.json";
import moncton from "../../../data/demo/moncton.json";
import sackville from "../../../data/demo/sackville.json";
import type { Fire, VerdictJson } from "./types";
import { verdictView } from "./view";

const json = (data: unknown) => data as VerdictJson;
const NBSP = String.fromCharCode(0xa0);
const NBH = String.fromCharCode(0x2011); // no-break hyphen, as in N.‑É. and NOAA‑20

describe("Moncton replay (drifting, low: the three heights disagree)", () => {
  const view = verdictView(json(moncton), "en");

  test("is the drifting smoke screen, from the Long Lake fire", () => {
    expect([view.variant, view.band.label, view.band.headline, view.band.sub]).toEqual([
      "7a",
      "DRIFTING SMOKE",
      "Likely from the Long Lake fire",
      "Smoke drifting from Nova Scotia, about 159 km south-southwest of you.",
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

  test("says how many hours were traced, until the air left the area the wind data covers", () => {
    expect([view.why.items[0].title, view.why.items[0].body, verdictView(json(moncton), "fr").why.items[0].body]).toEqual([
      "We traced the air back 20 hours",
      "Using hourly winds, we followed the air arriving in Moncton backward, one hour at a time, until it left the area our wind data covers.",
      "Grâce aux vents horaires, nous avons suivi à rebours l’air qui arrive à Moncton, une heure à la fois, jusqu’à ce qu’il quitte la zone couverte par nos données de vent.",
    ]);
  });

  test("keeps the design's French wording", () => {
    const fr = verdictView(json(moncton), "fr");
    expect([fr.band.headline, fr.band.sub, fr.fireRow.kind === "fire" && fr.fireRow.subtitle]).toEqual([
      "Elle vient probablement du feu de Long Lake",
      "Fumée venue de la Nouvelle-Écosse, à environ 159 km au sud-sud-ouest de chez vous.",
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
  const archiveSighting = withLastSeen({ hoursAgo: 10, minutesAgo: 617, satellite: "Terra", instrument: "MODIS", latencyClass: "SP" });

  test("names the satellite, in minutes under an hour", () => {
    expect([verdictView(sighted40MinutesAgo, "en").why.items[1].body, verdictView(sighted40MinutesAgo, "fr").why.items[1].body]).toEqual([
      `About 6 hours ago, that air was over the Long Lake fire. NOAA${NBH}21 saw it burning 40 minutes ago.`,
      expect.stringMatching(new RegExp(` Le satellite NOAA${NBH}21 l’a vu brûler il y a 40 minutes\\.$`)),
    ]);
  });

  test("names the satellite, in hours from an hour on", () => {
    expect([verdictView(sighted5HoursAgo, "en").why.items[1].body, verdictView(sighted5HoursAgo, "fr").why.items[1].body]).toEqual([
      `About 6 hours ago, that air was over the Long Lake fire. NOAA${NBH}20 saw it burning 5 hours ago.`,
      expect.stringMatching(new RegExp(` Le satellite NOAA${NBH}20 l’a vu brûler il y a 5 heures\\.$`)),
    ]);
  });

  test("names the satellite of the newest observation, never a CWFIS report time (Moncton replay)", () => {
    // Long Lake's newest observation is Terra at 01:43 UTC; CWFIS's 07:00 rows are Terra's 00:06 detections, reported late.
    expect([verdictView(json(moncton), "en").why.items[1].body, verdictView(json(moncton), "fr").why.items[1].body]).toEqual([
      "About 6 hours ago, that air was over the Long Lake fire. Terra saw it burning 10 hours ago.",
      "Il y a environ 6 heures, cet air se trouvait au-dessus du feu de Long Lake. Le satellite Terra l’a vu brûler il y a 10 heures.",
    ]);
  });

  test("says the fire is on the official list only when it has a CWFIS record (Bathurst replay)", () => {
    expect(verdictView(json(bathurst), "en").why.items[1].body).toMatch(/ It’s on Canada’s official active fire list\.$/);
  });

  test("says nothing about sightings when a fire has no satellite observation and no CWFIS record", () => {
    const data = json(moncton);
    const fire = { ...data.closestApproach!.fire, lastSeen: null, lastSeenHoursAgo: null, cwfisIds: [] };
    const unseen = { ...data, closestApproach: { ...data.closestApproach!, fire } };
    expect(verdictView(unseen, "en").why.items[1].body).toBe("About 6 hours ago, that air was over the Long Lake fire.");
  });

  test("the map badge names the satellite of the fire’s newest detection", () => {
    expect([verdictView(sighted5HoursAgo, "en").map.badge, verdictView(sighted5HoursAgo, "fr").map.badge]).toEqual([
      `Seen by satellite NOAA${NBH}20${NBSP}· 5 hours ago`,
      `Vu par le satellite NOAA${NBH}20${NBSP}· il y a 5 heures`,
    ]);
  });

  test("the map badge says ultra real-time only for ultra real-time data", () => {
    expect([verdictView(sighted40MinutesAgo, "en").map.badge, verdictView(sighted40MinutesAgo, "fr").map.badge]).toEqual([
      `Seen by satellite NOAA${NBH}21${NBSP}· 40 minutes ago${NBSP}· ultra real-time`,
      `Vu par le satellite NOAA${NBH}21${NBSP}· il y a 40 minutes${NBSP}· ultra temps réel`,
    ]);
  });

  test("archive (SP) detections get no latency label", () => {
    expect(verdictView(archiveSighting, "en").map.badge).toBe(`Seen by satellite Terra${NBSP}· 10 hours ago`);
  });

  test("Moncton replay: the badge names Terra, the newest observation", () => {
    expect([verdictView(json(moncton), "en").map.badge, verdictView(json(moncton), "fr").map.badge]).toEqual([
      `Seen by satellite Terra${NBSP}· 10 hours ago`,
      `Vu par le satellite Terra${NBSP}· il y a 10 heures`,
    ]);
  });

  test("no map badge when no satellite observation is known (Miramichi replay)", () => {
    expect(verdictView(json(miramichi), "en").map.badge).toBeNull();
  });
});

describe("screen 7d: when the fire data was checked", () => {
  const noFires = (sources: Partial<VerdictJson["sources"]>) =>
    ({ ...json(halifax), noFiresInRange: true, nearestFire: null, closestApproach: null, sources: { ...json(halifax).sources, ...sources } }) as VerdictJson;
  const live = noFires({ checkedMinutesAgo: 4, newestDetection: { time: "2026-09-25T17:17:00Z", hoursAgo: 29, minutesAgo: 1757 } });

  test("says how long ago NASA and NRCan data was checked, and the newest satellite detection in the region", () => {
    const [en, fr] = [verdictView(live, "en").fireRow, verdictView(live, "fr").fireRow];
    expect([en.kind === "none" && en.checked, fr.kind === "none" && fr.checked]).toEqual([
      "Checked NASA and NRCan fire data 4 min ago. Newest satellite detection in the region: 29 hours ago.",
      `Données de feux de la NASA et de RNCan vérifiées il y a 4 min. Détection satellite la plus récente dans la région${NBSP}: il y a 29 heures.`,
    ]);
  });

  test("says nothing about checking when the data is recorded (replay) or a fire source is down", () => {
    const firmsDown = noFires({ checkedMinutesAgo: 4, firms: { ...json(halifax).sources.firms, ok: false } });
    const rows = [verdictView(noFires({}), "en").fireRow, verdictView(firmsDown, "en").fireRow];
    expect(rows.map((row) => row.kind === "none" && row.checked)).toEqual([null, null]);
  });
});

describe("Why item 2: the satellites that saw the fire", () => {
  test("lists them when the fire has FIRMS detections (Moncton replay)", () => {
    expect([verdictView(json(moncton), "en").why.items[1].detail, verdictView(json(moncton), "fr").why.items[1].detail]).toEqual([
      `Detected by 6 satellites in the last 24 hours: Aqua, NOAA${NBH}20, NOAA${NBH}21, Sentinel${NBH}3A, Suomi${NBSP}NPP, and Terra.`,
      `Détecté par 6 satellites au cours des 24 dernières heures${NBSP}: Aqua, NOAA${NBH}20, NOAA${NBH}21, Sentinel${NBH}3A, Suomi${NBSP}NPP et Terra.`,
    ]);
  });

  test("says 1 satellite, not 1 satellites", () => {
    const data = json(moncton);
    const detections = { total: 2, bySource: { FIRMS: 2, CWFIS: 0, both: 0 }, satellites: ["NOAA-20"] };
    const one = { ...data, closestApproach: { ...data.closestApproach!, fire: { ...data.closestApproach!.fire, detections } } };
    expect([verdictView(one, "en").why.items[1].detail, verdictView(one, "fr").why.items[1].detail]).toEqual([
      `Detected by 1 satellite in the last 24 hours: NOAA${NBH}20.`,
      `Détecté par 1 satellite au cours des 24 dernières heures${NBSP}: NOAA${NBH}20.`,
    ]);
  });

  test("adds nothing when FIRMS never saw the fire (Miramichi replay)", () => {
    expect(verdictView(json(miramichi), "en").why.items[1].detail ?? null).toBeNull();
  });
});

describe("French: the fire and the direction take the right article", () => {
  test("de + le contracts to du, and a sentence starts with Du or D’un (Charlottetown, Miramichi replays)", () => {
    const [named, unnamed] = [verdictView(json(charlottetown), "fr"), verdictView(json(miramichi), "fr")];
    expect([named.band.sub, named.twoPossibilities!.driftingLead, unnamed.band.sub, unnamed.twoPossibilities!.driftingLead]).toEqual([
      "L’air est passé près du feu de Long Lake, mais pas assez près pour en être certain.",
      `Du feu de Long Lake, N.${NBH}É.`,
      "L’air est passé près d’un feu près de Fontaine, mais pas assez près pour en être certain.",
      `D’un feu près de Fontaine, N.${NBH}B.`,
    ]);
  });

  test("the fire takes le or un after depuis and as a subject (Moncton, Halifax, Edmundston replays)", () => {
    const [moncton7a, halifax7b, edmundston7b] = [verdictView(json(moncton), "fr"), verdictView(json(halifax), "fr"), verdictView(json(edmundston), "fr")];
    expect([moncton7a.map.aria, halifax7b.map.aria, edmundston7b.map.aria, edmundston7b.why.items[1].body]).toEqual([
      `Carte${NBSP}: en environ 6 heures, l’air s’est déplacé depuis le feu de Long Lake (Nouvelle-Écosse) vers le nord-nord-est, jusqu’à Moncton`,
      `Carte${NBSP}: l’air a atteint Halifax. Aucun feu actif ne se trouve à moins de 50 km de son trajet${NBSP}; le feu de Long Lake est hors du trajet.`,
      `Carte${NBSP}: l’air a atteint Edmundston. Aucun feu actif ne se trouve à moins de 50 km de son trajet${NBSP}; un feu près de Napier est hors du trajet.`,
      "Aucun feu à moins de 50 km de chaque étape horaire. Le plus proche, un feu près de Napier, est à 112 km et hors du trajet.",
    ]);
  });

  test("vers le becomes vers l’ before est and ouest", () => {
    const data = json(moncton);
    const westOfTown = { ...data, closestApproach: { ...data.closestApproach!, fire: { ...data.closestApproach!.fire, compass: "W" } } } as VerdictJson;
    expect(verdictView(westOfTown, "fr").map.aria).toContain("vers l’est, jusqu’à Moncton");
  });
});

test("Two possibilities: a province abbreviation’s period ends the lead (Charlottetown replay)", () => {
  expect(verdictView(json(charlottetown), "en").twoPossibilities!.driftingLead).toBe("From the Long Lake fire, N.S.");
});

describe("the map description never says 1 hours or 0 hours", () => {
  const at = (data: unknown, hoursAgo: number) => {
    const v = json(data);
    return { ...v, closestApproach: { ...v.closestApproach!, hoursAgo } };
  };
  const aria = (data: VerdictJson) => [verdictView(data, "en").map.aria, verdictView(data, "fr").map.aria];

  test("drifting: about 1 hour (Bathurst replay), and less than an hour", () => {
    expect([...aria(json(bathurst)), ...aria(at(moncton, 0))]).toEqual([
      "Map: over about 1 hour, the air moved from a fire near Heath Steele in New Brunswick northeast to Bathurst",
      `Carte${NBSP}: en environ 1 heure, l’air s’est déplacé depuis un feu près de Heath Steele (Nouveau-Brunswick) vers le nord-est, jusqu’à Bathurst`,
      "Map: in less than an hour, the air moved from the Long Lake fire in Nova Scotia north-northeast to Moncton",
      `Carte${NBSP}: en moins d’une heure, l’air s’est déplacé depuis le feu de Long Lake (Nouvelle-Écosse) vers le nord-nord-est, jusqu’à Moncton`,
    ]);
  });

  test("unclear: less than an hour ago (Miramichi replay), and about 1 hour ago", () => {
    expect([...aria(json(miramichi)), ...aria(at(miramichi, 1))]).toEqual([
      "Map: the air reached Miramichi and passed 42 km from a fire near Fontaine less than an hour ago",
      `Carte${NBSP}: l’air a atteint Miramichi et est passé à 42 km d’un feu près de Fontaine il y a moins d’une heure`,
      "Map: the air reached Miramichi and passed 42 km from a fire near Fontaine about 1 hour ago",
      `Carte${NBSP}: l’air a atteint Miramichi et est passé à 42 km d’un feu près de Fontaine il y a environ 1 heure`,
    ]);
  });
});

describe("What to do: the area-wide caveat on unexplained verdicts", () => {
  const caveat = (data: VerdictJson, lang: "en" | "fr") => {
    const { todo } = verdictView(data, lang);
    return todo.kind === "advice" && todo.areaWide ? `${todo.areaWide.lead} ${todo.areaWide.text}` : null;
  };
  const noFires = { ...json(halifax), noFiresInRange: true, nearestFire: null, closestApproach: null } as VerdictJson;

  test("follows the official AQHI line on 7b (Halifax replay) and 7d, in English and French", () => {
    expect([caveat(json(halifax), "en"), caveat(json(halifax), "fr"), caveat(noFires, "en")]).toEqual([
      "This is an area-wide reading. Smoke from a nearby source can be much stronger where you are.",
      "Cette mesure couvre toute la région. La fumée d’une source proche peut être beaucoup plus forte là où vous êtes.",
      "This is an area-wide reading. Smoke from a nearby source can be much stronger where you are.",
    ]);
  });

  test("is not on drifting or unclear verdicts (Moncton, Miramichi replays)", () => {
    expect([caveat(json(moncton), "en"), caveat(json(miramichi), "en")]).toEqual([null, null]);
  });
});

describe("Why item 3: the fire’s smoke traced forward", () => {
  const noFires = { ...json(halifax), noFiresInRange: true, nearestFire: null, closestApproach: null, forward: null } as VerdictJson;

  test("says the smoke passed close when the forward trace agrees (Moncton replay)", () => {
    expect([verdictView(json(moncton), "en").why.items[2].body, verdictView(json(moncton), "fr").why.items[2].body]).toEqual([
      "Traced forward from the Long Lake fire, its smoke passed 2 km from you.",
      "Suivie vers l’avant depuis le feu de Long Lake, sa fumée est passée à 2 km de vous.",
    ]);
  });

  test("says the smoke stayed away otherwise, with the article for an unnamed fire (Fredericton replay)", () => {
    expect([verdictView(json(fredericton), "en").why.items[2].body, verdictView(json(fredericton), "fr").why.items[2].body]).toEqual([
      "Traced forward from a fire near Ramsay Lodge, its smoke stayed 117 km away from you.",
      "Suivie vers l’avant depuis un feu près de Ramsay Lodge, sa fumée est restée à 117 km de vous.",
    ]);
  });

  test("comes after item 2, and is left out when no fire is featured (7d)", () => {
    expect([verdictView(json(moncton), "en").why.items.map((item) => item.title), verdictView(noFires, "en").why.items.length]).toEqual([
      ["We traced the air back 20 hours", "It passed 19 km from an active fire", "The fire’s smoke came your way", "The three heights don’t agree"],
      3,
    ]);
  });

  test("the map legend names the forward paths, in English and French, and only when they are drawn", () => {
    expect([verdictView(json(moncton), "en").map.legend.forward, verdictView(json(moncton), "fr").map.legend.forward, verdictView(noFires, "en").map.legend.forward]).toEqual([
      "Smoke from the fire, traced forward",
      "Fumée du feu, suivie vers l’avant",
      null,
    ]);
  });

  test("has a bold title: the smoke came your way when the trace agrees (Moncton), went elsewhere otherwise (Fredericton)", () => {
    const title = (data: unknown, lang: "en" | "fr") => verdictView(json(data), lang).why.items[2].title;
    expect([title(moncton, "en"), title(moncton, "fr"), title(fredericton, "en"), title(fredericton, "fr")]).toEqual([
      "The fire’s smoke came your way",
      "La fumée du feu est venue vers vous",
      "The fire’s smoke went elsewhere",
      "La fumée du feu est allée ailleurs",
    ]);
  });
});

describe("Why item 1: the air traced back", () => {
  test("keeps the design’s sentence on 7a when the path did not reach the grid edge", () => {
    const inside = { ...json(moncton), path: { ...json(moncton).path, stoppedAtGridEdge: false } };
    expect(verdictView(inside, "en").why.items[0].body).toBe("Using hourly winds, we followed the air arriving in Moncton backward, one hour at a time.");
  });

  test("uses the grid-edge sentence on every screen when the path reached the grid edge (Halifax, Miramichi replays)", () => {
    expect([verdictView(json(halifax), "en").why.items[0].body, verdictView(json(miramichi), "fr").why.items[0].body]).toEqual([
      "Using hourly winds, we followed the air arriving in Halifax backward, one hour at a time, until it left the area our wind data covers.",
      "Grâce aux vents horaires, nous avons suivi à rebours l’air qui arrive à Miramichi, une heure à la fois, jusqu’à ce qu’il quitte la zone couverte par nos données de vent.",
    ]);
  });

  test("off 7a, says where the air came from when the path stayed inside the grid (Halifax replay)", () => {
    const inside = { ...json(halifax), path: { ...json(halifax).path, stoppedAtGridEdge: false } };
    expect(verdictView(inside, "en").why.items[0].body).toMatch(/^It reached Halifax from .+\.$/);
  });
});

describe("Why: the three heights, when they disagree on 7a and 7c", () => {
  const last = (data: unknown, lang: "en" | "fr" = "en") => {
    const items = verdictView(json(data), lang).why.items;
    return items[items.length - 1];
  };

  test("replaces the steady-wind item with each height’s distance and the confidence (Moncton replay)", () => {
    expect([last(moncton), last(moncton, "fr")]).toEqual([
      { title: "The three heights don’t agree", body: "Near the ground, the air passed 19 km from the fire; higher up, 32 and 46 km. That’s why confidence is low." },
      {
        title: "Les trois hauteurs ne concordent pas",
        body: `Près du sol, l’air est passé à 19 km du feu${NBSP}; plus haut, à 32 et 46 km. C’est pourquoi la confiance est faible.`,
      },
    ]);
  });

  test("on the unclear screen too (Miramichi replay), and says medium when confidence is medium (Sackville replay)", () => {
    expect([last(miramichi).body, last(sackville).body, last(sackville, "fr").body]).toEqual([
      "Near the ground, the air passed 42 km from the fire; higher up, 59 and 59 km. That’s why confidence is low.",
      "Near the ground, the air passed 66 km from the fire; higher up, 7 and 9 km. That’s why confidence is medium.",
      `Près du sol, l’air est passé à 66 km du feu${NBSP}; plus haut, à 7 et 9 km. C’est pourquoi la confiance est moyenne.`,
    ]);
  });

  test("keeps the steady-wind item when the heights agree (Bathurst replay)", () => {
    expect(last(bathurst).title).toBe("The wind stayed steady");
  });

  test("never shows a pressure level (hPa) on any replay screen, in English or French", () => {
    const towns = [bathurst, charlottetown, edmundston, fredericton, halifax, miramichi, moncton, sackville];
    const shown = towns.flatMap((town) => (["en", "fr"] as const).map((lang) => JSON.stringify(verdictView(json(town), lang).why)));
    expect(shown.filter((text) => text.includes("hPa"))).toEqual([]);
  });
});

test("satellite names never break across lines: no plain hyphen or space inside a name (Moncton replay)", () => {
  const view = verdictView(json(moncton), "en");
  expect([view.why.items[1].detail, view.map.badge].filter((text) => /NOAA-|Sentinel-|Suomi NPP/.test(text ?? ""))).toEqual([]);
});
