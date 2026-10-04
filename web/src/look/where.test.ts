// "Where you are", on Call 911 now: what the screen can give a person to read to the dispatcher. The phone's own
// position while it is fresh, else the town they typed (live mode), else nothing.
import { describe, expect, test } from "vitest";
import { ACCURATE_M, FRESH_MS, NEAR_KM, coordinateLines, isFresh, nameFor, nearLine, nearestWithin, ofTown, whereNow, type Fix, type Spot } from "./where";

const NBSP = String.fromCharCode(0xa0);
const MINUTE = 60 * 1000;
const NOW = Date.UTC(2026, 9, 3, 15, 0, 0);

// Where the place list (NRCan CGNDB) puts them.
const MONCTON: Spot = { name: "Moncton", province: "NB", lat: 46.09948, lon: -64.7998 };
const DIEPPE: Spot = { name: "Dieppe", province: "NB", lat: 46.07833, lon: -64.68861 };
const RIVERVIEW: Spot = { name: "Riverview", province: "NB", lat: 46.05444, lon: -64.81722 };
const SPOTS = [DIEPPE, RIVERVIEW, MONCTON];
// Downtown Moncton: 2 km from Moncton's point, 5 km from Riverview's, 7 km from Dieppe's.
const DOWNTOWN = { lat: 46.0878, lon: -64.7782 };
// Woods some 75 km to the north-west: far from all three.
const WOODS = { lat: 46.5, lon: -65.6 };

/** The point `km` due north of a spot: one degree of latitude is 111.2 km. */
const north = (spot: { lat: number; lon: number }, km: number) => ({ lat: spot.lat + km / 111.2, lon: spot.lon });

describe("a fresh position", () => {
  const taken = (msAgo: number): Fix => ({ ...DOWNTOWN, at: NOW - msAgo });

  test("fresh for ten minutes by its own time, to the millisecond", () => {
    expect(FRESH_MS).toBe(600000);
    expect([0, MINUTE, 10 * MINUTE].map((ago) => isFresh(taken(ago), NOW))).toEqual([true, true, true]);
    expect([10 * MINUTE + 1, 11 * MINUTE, 24 * 60 * MINUTE].map((ago) => isFresh(taken(ago), NOW))).toEqual([false, false, false]);
  });

  test("never fresh: a position with no time, and no position at all", () => {
    expect([isFresh(DOWNTOWN, NOW), isFresh({ ...DOWNTOWN, accuracy: 12 }, NOW), isFresh(null, NOW), isFresh(undefined, NOW)]).toEqual([false, false, false, false]);
  });

  test("a time ahead of the clock: half a minute is the clocks disagreeing, more than a minute is not fresh", () => {
    expect([30 * 1000, MINUTE + 1, 5 * MINUTE].map((ahead) => isFresh(taken(-ahead), NOW))).toEqual([true, false, false]);
  });
});

describe("the coordinates to read out", () => {
  test("two lines, four decimals, north and west in words, a no-break space before the word", () => {
    expect(coordinateLines(46.0878, -64.7782, "en")).toEqual([`46.0878°${NBSP}north`, `64.7782°${NBSP}west`]);
  });

  test("in French: a decimal comma, nord and ouest", () => {
    expect(coordinateLines(46.0878, -64.7782, "fr")).toEqual([`46,0878°${NBSP}nord`, `64,7782°${NBSP}ouest`]);
  });

  test("south and east, with no minus sign", () => {
    expect(coordinateLines(-33.8688, 151.2093, "en")).toEqual([`33.8688°${NBSP}south`, `151.2093°${NBSP}east`]);
    expect(coordinateLines(-33.8688, 151.2093, "fr")).toEqual([`33,8688°${NBSP}sud`, `151,2093°${NBSP}est`]);
  });

  test("rounded to four decimals, the zeros kept: 64.99996 reads 65.0000", () => {
    expect(coordinateLines(45.5, -64.99996, "en")).toEqual([`45.5000°${NBSP}north`, `65.0000°${NBSP}west`]);
    expect(coordinateLines(45.5, -64.99996, "fr")).toEqual([`45,5000°${NBSP}nord`, `65,0000°${NBSP}ouest`]);
  });
});

describe("the nearest community", () => {
  const nearest = <S extends Spot>(list: S[], at: { lat: number; lon: number }, km?: number) => nearestWithin(list, at.lat, at.lon, km);

  test("a community 3 km away is the one, the list’s own entry", () => {
    expect(NEAR_KM).toBe(10);
    const city = { ...MONCTON, type: "CITY", county: "Westmorland" };
    expect(nearest([MONCTON], north(MONCTON, 3))).toBe(MONCTON);
    expect(nearest([city], north(city, 3))).toBe(city);
  });

  test("the nearer of two, wherever it sits in the list", () => {
    expect(nearest([DIEPPE, MONCTON], DOWNTOWN)).toBe(MONCTON);
    expect(nearest([MONCTON, DIEPPE], DOWNTOWN)).toBe(MONCTON);
    // 1 km from Dieppe's point, 8 km from Moncton's.
    expect(nearest([MONCTON, DIEPPE], { lat: 46.08, lon: -64.7 })).toBe(DIEPPE);
    expect(nearest([DIEPPE, MONCTON], { lat: 46.08, lon: -64.7 })).toBe(DIEPPE);
  });

  test("none within 10 km: nothing, rather than a community far away", () => {
    expect([9.9, 10.1, 12].map((km) => nearest([MONCTON], north(MONCTON, km)))).toEqual([MONCTON, null, null]);
    expect(nearest(SPOTS, WOODS)).toBeNull();
  });

  test("an empty list: nothing", () => {
    expect(nearest([], DOWNTOWN)).toBeNull();
  });

  test("another distance can be asked for", () => {
    expect(nearest([MONCTON], north(MONCTON, 12), 15)).toBe(MONCTON);
    expect(nearest([MONCTON], north(MONCTON, 3), 2)).toBeNull();
  });

  test("east to west a degree is shorter this far north: a tenth of a degree is 7.7 km, where it is 11.1 km north to south", () => {
    expect(nearest([MONCTON], { lat: MONCTON.lat, lon: MONCTON.lon + 0.1 })).toBe(MONCTON);
    expect(nearest([MONCTON], { lat: MONCTON.lat, lon: MONCTON.lon + 0.14 })).toBeNull(); // 10.8 km
    expect(nearest([MONCTON], { lat: MONCTON.lat + 0.1, lon: MONCTON.lon })).toBeNull();
  });
});

describe("the community that names the spot", () => {
  // Where the place list puts them: a neighbourhood 1 km from downtown Moncton, the city's own point 2 km away.
  const POINT_PARK: Spot = { name: "Point Park", province: "NB", lat: 46.0933, lon: -64.7677, type: "UNP" };
  const CITY: Spot = { ...MONCTON, type: "CITY" };
  const named = (list: Spot[], at: { lat: number; lon: number }) => nameFor(list, at.lat, at.lon);

  test("a city, town or village within 10 km comes before a nearer neighbourhood: downtown Moncton is Moncton", () => {
    expect(nearestWithin([POINT_PARK, CITY], DOWNTOWN.lat, DOWNTOWN.lon)).toBe(POINT_PARK);
    expect(named([POINT_PARK, CITY], DOWNTOWN)).toBe(CITY);
    expect(named([CITY, POINT_PARK], DOWNTOWN)).toBe(CITY);
    expect(named([POINT_PARK, { ...CITY, type: "TOWN" }], DOWNTOWN)?.name).toBe("Moncton");
    expect(named([POINT_PARK, { ...CITY, type: "VILG" }], DOWNTOWN)?.name).toBe("Moncton");
  });

  test("no city, town or village within 10 km: the nearest community of any kind", () => {
    const hamlet: Spot = { ...north(CITY, 12), name: "Lutes Mountain", province: "NB", type: "UNP" };
    expect(named([CITY, hamlet], north(CITY, 13))).toBe(hamlet);
    expect(named([POINT_PARK], DOWNTOWN)).toBe(POINT_PARK);
    // A list that does not say what kind each place is.
    expect(named(SPOTS, DOWNTOWN)).toBe(MONCTON);
  });

  test("nothing within 10 km: no name", () => {
    expect(named([CITY, POINT_PARK], WOODS)).toBeNull();
    expect(named([], DOWNTOWN)).toBeNull();
  });

  test("what the screen shows uses it", () => {
    const shared: Fix = { ...DOWNTOWN, at: NOW - MINUTE, accuracy: 12 };
    expect(whereNow({ shared, place: null, mode: "live", now: NOW, lang: "en", list: [POINT_PARK, CITY] })).toMatchObject({ kind: "fix", near: CITY });
  });
});

describe("naming it", () => {
  test("French “de” before a town: elided before a vowel and before Halifax, kept before a sounded h", () => {
    expect(["Moncton", "Edmundston", "Halifax", "Hampton"].map((town) => ofTown(town))).toEqual(["de Moncton", "d’Edmundston", "d’Halifax", "de Hampton"]);
  });

  test("Near Moncton, NB; in French, the province as French writes it", () => {
    expect([nearLine("en", MONCTON), nearLine("fr", MONCTON)]).toEqual(["Near Moncton, NB", "Près de Moncton, N.-B."]);
  });

  test("French elides here too: Près d’Edmundston, Près d’Halifax", () => {
    expect(nearLine("fr", { name: "Edmundston", province: "NB" })).toBe("Près d’Edmundston, N.-B.");
    expect([nearLine("en", { name: "Halifax", province: "NS" }), nearLine("fr", { name: "Halifax", province: "NS" })]).toEqual(["Near Halifax, NS", "Près d’Halifax, N.-É."]);
  });

  test("the third province: Prince Edward Island", () => {
    const charlottetown = { name: "Charlottetown", province: "PE" };
    expect([nearLine("en", charlottetown), nearLine("fr", charlottetown)]).toEqual(["Near Charlottetown, PE", "Près de Charlottetown, Î.-P.-É."]);
  });
});

describe("what the screen shows", () => {
  /** A position from the phone, `minutesAgo` old; downtown Moncton unless said otherwise. */
  const fix = (minutesAgo: number, accuracy?: number, point = DOWNTOWN): Fix => ({ ...point, at: NOW - minutesAgo * MINUTE, accuracy });
  // A town picked from the search in live mode, and one picked in replay.
  const TYPED = { name: "Moncton", province: "NB", county: "Westmorland", lat: 46.09948, lon: -64.7998, source: "search" } as const;
  const REPLAY = { name: "Dieppe", province: "NB", county: "Westmorland", lat: 46.07833, lon: -64.68861, source: "search", replayFile: "dieppe.json" } as const;
  const DOWNTOWN_EN: [string, string] = [`46.0878°${NBSP}north`, `64.7782°${NBSP}west`];
  /** Live mode, English, the community list loaded, nothing typed, nothing from the phone: unless said otherwise. */
  const show = (input: Partial<Parameters<typeof whereNow>[0]>) => whereNow({ shared: null, place: null, mode: "live", now: NOW, lang: "en", list: SPOTS, ...input });

  test("a fresh, accurate position: the nearest community, and the phone’s coordinates (not the community’s)", () => {
    expect(show({ shared: fix(2, 12) })).toEqual({ kind: "fix", near: MONCTON, coords: DOWNTOWN_EN });
    expect(show({ shared: fix(2, 12), lang: "fr" })).toEqual({ kind: "fix", near: MONCTON, coords: [`46,0878°${NBSP}nord`, `64,7782°${NBSP}ouest`] });
  });

  test("coordinates only when the phone is sure to 100 m: a coarse position (2.5 km) names the community and gives no numbers", () => {
    expect(ACCURATE_M).toBe(100);
    expect(show({ shared: fix(2, 2500) })).toEqual({ kind: "fix", near: MONCTON, coords: null });
    expect(show({ shared: fix(2, 100) })).toEqual({ kind: "fix", near: MONCTON, coords: DOWNTOWN_EN });
    expect(show({ shared: fix(2, 101) })).toEqual({ kind: "fix", near: MONCTON, coords: null });
    // A phone that does not say how sure it is.
    expect(show({ shared: fix(2) })).toEqual({ kind: "fix", near: MONCTON, coords: null });
  });

  test("a name only when the phone is sure to 10 km: unsure by more, it can’t say which community is near", () => {
    expect(show({ shared: fix(2, 10000) })).toEqual({ kind: "fix", near: MONCTON, coords: null });
    expect(show({ shared: fix(2, 10001) })).toEqual({ kind: "fix", near: null, coords: null });
    expect(show({ shared: fix(2, 30000) })).toEqual({ kind: "fix", near: null, coords: null });
  });

  test("no community within 10 km: the coordinates alone", () => {
    expect(show({ shared: fix(2, 12, WOODS) })).toEqual({ kind: "fix", near: null, coords: [`46.5000°${NBSP}north`, `65.6000°${NBSP}west`] });
  });

  test("the community list not loaded yet, or never: the coordinates alone", () => {
    expect(show({ shared: fix(2, 12), list: null })).toEqual({ kind: "fix", near: null, coords: DOWNTOWN_EN });
  });

  test("fresh, but too coarse and with no community to name: still the phone’s answer, with nothing to read out", () => {
    // The screen then says the location is not available. The typed town does not stand in for it.
    expect(show({ shared: fix(2, 2500, WOODS), place: TYPED })).toEqual({ kind: "fix", near: null, coords: null });
    expect(show({ shared: fix(2, 2500), list: null, place: TYPED })).toEqual({ kind: "fix", near: null, coords: null });
  });

  test("the phone’s position comes before a typed town, and counts in replay as in live", () => {
    expect(show({ shared: fix(2, 12), place: TYPED })).toEqual({ kind: "fix", near: MONCTON, coords: DOWNTOWN_EN });
    expect(show({ shared: fix(2, 12), place: REPLAY, mode: "replay" })).toEqual({ kind: "fix", near: MONCTON, coords: DOWNTOWN_EN });
  });

  test("ten minutes old is still shown; a moment older is not, and the typed town takes its place", () => {
    const stale: Fix = { ...DOWNTOWN, at: NOW - 10 * MINUTE - 1, accuracy: 12 };
    expect(show({ shared: fix(10, 12), place: TYPED })).toEqual({ kind: "fix", near: MONCTON, coords: DOWNTOWN_EN });
    expect(show({ shared: stale, place: TYPED })).toEqual({ kind: "town", name: "Moncton", province: "NB" });
    expect(show({ shared: stale })).toEqual({ kind: "unknown" });
  });

  test("a position with no time (the one Tell family keeps) is never shown", () => {
    const untimed: Fix = { ...DOWNTOWN, accuracy: 12 };
    expect(show({ shared: untimed, place: TYPED })).toEqual({ kind: "town", name: "Moncton", province: "NB" });
    expect(show({ shared: untimed })).toEqual({ kind: "unknown" });
  });

  test("live, nothing from the phone: the town the person typed, with no coordinates", () => {
    expect(show({ place: TYPED })).toEqual({ kind: "town", name: "Moncton", province: "NB" });
    expect(show({ place: TYPED, list: null })).toEqual({ kind: "town", name: "Moncton", province: "NB" });
  });

  test("a replay town is never shown as the person’s location", () => {
    expect(show({ place: REPLAY, mode: "replay" })).toEqual({ kind: "unknown" });
    expect(show({ place: TYPED, mode: "replay" })).toEqual({ kind: "unknown" });
    // Nor one that carries a replay file, whatever the mode says.
    expect(show({ place: REPLAY })).toEqual({ kind: "unknown" });
    expect(show({ place: REPLAY, mode: "replay", shared: { ...DOWNTOWN, at: NOW - 11 * MINUTE, accuracy: 12 } })).toEqual({ kind: "unknown" });
  });

  test("a place the phone found earlier, with no fresh position now: nothing, for the person may have moved", () => {
    expect(show({ place: { ...TYPED, source: "gps" } })).toEqual({ kind: "unknown" });
    expect(show({ place: { ...TYPED, source: "gps" }, shared: { ...DOWNTOWN, at: NOW - 11 * MINUTE, accuracy: 12 } })).toEqual({ kind: "unknown" });
    // A place that does not say how it was picked is not taken as typed.
    expect(show({ place: { name: "Moncton", province: "NB" } })).toEqual({ kind: "unknown" });
  });

  test("nothing known: only the button", () => {
    expect(show({})).toEqual({ kind: "unknown" });
    expect(show({ list: null })).toEqual({ kind: "unknown" });
    expect(show({ mode: "replay" })).toEqual({ kind: "unknown" });
  });
});
