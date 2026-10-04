// The frame the map opens on, for every replay town (data/demo/, 2025-08-25 12:00 UTC) on the phones the app is tested on.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { VerdictJson } from "../verdict/types";
import { MIN_ZOOM, OPEN_MAX_ZOOM, framed, inTheClear, openingView, type Rect } from "./frame";
import { project, zoomOf, type Size } from "./mercator";
import { readMap } from "./model";

const demo = (town: string): VerdictJson => JSON.parse(readFileSync(new URL(`../../../data/demo/${town}.json`, import.meta.url), "utf8"));
const TOWNS = readdirSync(new URL("../../../data/demo/", import.meta.url)).filter((file) => file !== "index.json").map((file) => file.replace(".json", ""));

/** The stage between the top bar and the 911 bar, the part of it under the sheet at peek, and the map's buttons as the
 *  screen opens: Legend at the top left, the map credit at the top right, the zoom buttons just above the sheet on the
 *  right. (Recentre shows only once the map has been moved.) */
const stage = (width: number, height: number, covered: number): { size: Size; covered: number; buttons: Rect[] } => ({
  size: { width, height },
  covered,
  buttons: [
    { x: 12, y: 12, width: 124, height: 56 },
    { x: width - 12 - 160, y: 12, width: 160, height: 30 },
    { x: width - 12 - 120, y: height - covered - 68, width: 120, height: 56 },
  ],
});
const STAGES = {
  "390 × 844 (replay banner, slim bar)": stage(390, 664, 290),
  "375 × 667": stage(375, 495, 230),
  "375 × 550 (a small phone in a browser with its bars)": stage(375, 378, 200),
  "320 × 568": stage(320, 396, 200),
};

describe("the frame the map opens on", () => {
  for (const [name, { size, covered, buttons }] of Object.entries(STAGES)) {
    test(`${name}: the person and the fire are whole above the sheet and under no button, in every replay town`, () => {
      const hidden = TOWNS.flatMap((town) => {
        const { fit, marks } = framed(readMap(demo(town)));
        const view = openingView(fit, marks, size, covered, buttons);
        return marks.filter((mark) => !inTheClear(view, mark, size, covered, buttons)).map((mark) => `${town}: ${JSON.stringify(mark)} at ${project(view, mark).map(Math.round)}`);
      });
      expect(hidden).toEqual([]);
    });
  }

  test("Moncton: the person is above the fire (it lies south-southwest), and the two fill the free part of the stage", () => {
    const { size, covered, buttons } = STAGES["390 × 844 (replay banner, slim bar)"];
    const model = readMap(demo("moncton"));
    const view = openingView([model.you, model.focus!], [model.you, model.focus!], size, covered, buttons);
    const [you, fire] = [project(view, model.you), project(view, model.focus!)];
    expect([you[1] < fire[1], you[0] > fire[0]]).toEqual([true, true]);
    expect(fire[1] - you[1]).toBeGreaterThan(0.5 * (size.height - covered)); // not a postage stamp
    expect(zoomOf(view)).toBeGreaterThan(5.5);
  });

  test("a fire a few km away (Bridgetown, West Dalhousie) does not zoom past a town and its surroundings", () => {
    const { size, covered, buttons } = STAGES["375 × 667"];
    for (const town of ["bridgetown", "west-dalhousie"]) {
      const { fit, marks } = framed(readMap(demo(town)));
      expect(zoomOf(openingView(fit, marks, size, covered, buttons))).toBe(OPEN_MAX_ZOOM);
    }
  });

  test("with no fire in range the frame holds the whole path the verdict was read from", () => {
    const { size, covered, buttons } = STAGES["390 × 844 (replay banner, slim bar)"];
    const halifax = demo("halifax");
    const model = readMap({ ...halifax, noFiresInRange: true, nearestFire: null, closestApproach: null, map: { ...halifax.map!, focus: null } });
    const { fit, marks } = framed(model);
    expect([marks, fit.length]).toEqual([[model.you], model.trails.find((t) => t.chosen)!.points.length + 1]);
    const view = openingView(fit, marks, size, covered, buttons);
    const outside = fit.map((place) => project(view, place)).filter(([x, y]) => x < 0 || x > size.width || y < 0 || y > size.height - covered);
    expect(outside).toEqual([]);
    expect(inTheClear(view, model.you, size, covered, buttons)).toBe(true);
  });

  test("with no fire in range and too little map for the whole path, the person is still whole above the sheet, in every replay town", () => {
    // 7d on a 375 × 667 phone: the taller call-first bar and a four-line card leave about 145 px of map.
    const { size, covered, buttons } = stage(375, 454, 309);
    const lost = TOWNS.flatMap((town) => {
      const json = demo(town);
      const model = readMap({ ...json, noFiresInRange: true, nearestFire: null, closestApproach: null, map: { ...json.map!, focus: null } });
      const { fit, marks } = framed(model);
      const view = openingView(fit, marks, size, covered, buttons);
      const held = inTheClear(view, model.you, size, covered, buttons) && zoomOf(view) >= MIN_ZOOM - 1e-9;
      return held ? [] : [`${town}: the person at ${project(view, model.you).map(Math.round)}, zoom ${zoomOf(view).toFixed(2)}`];
    });
    expect(lost).toEqual([]);
  });

  test("a stage with no room clear of its buttons still keeps the person inside the free part", () => {
    const size = { width: 200, height: 300 };
    const covered = 200;
    const everywhere: Rect[] = [{ x: 0, y: 0, width: 200, height: 100 }];
    const model = readMap(demo("moncton"));
    const far = { lat: model.you.lat - 9, lon: model.you.lon - 14 }; // cannot be held with the person from zoom 4
    const [x, y] = project(openingView([model.you, far], [model.you, far], size, covered, everywhere), model.you);
    expect([x >= 0 && x <= size.width, y >= 0 && y <= size.height - covered]).toEqual([true, true]);
  });

  test("a mark that would sit under a button moves the frame until it is clear of it", () => {
    const { size, covered } = STAGES["375 × 667"];
    const model = readMap(demo("moncton"));
    const marks = [model.you, model.focus!];
    const free = openingView(marks, marks, size, covered, []);
    const [x, y] = project(free, model.focus!);
    const button: Rect = { x: x - 40, y: y - 20, width: 120, height: 56 }; // a button right where the fire would be
    const moved = openingView(marks, marks, size, covered, [button]);
    expect([inTheClear(free, model.focus!, size, covered, [button]), inTheClear(moved, model.focus!, size, covered, [button])]).toEqual([false, true]);
    expect(inTheClear(moved, model.you, size, covered, [button])).toBe(true);
  });
});
