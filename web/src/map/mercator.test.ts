import { describe, expect, test } from "vitest";
import { between, centerOf, fitView, mercator, project, scaleAt, unproject, viewAt, zoomed, zoomOf, type LatLon, type View } from "./mercator";

const MONCTON = { lat: 46.09948, lon: -64.7998 };
const LONG_LAKE = { lat: 44.7024, lon: -65.2034 };
const PHONE = { width: 390, height: 600 };
const near = (a: number[], b: number[], within = 1e-6) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= within);

describe("Web Mercator", () => {
  test("the world is a unit square: 0°, 0° in its middle, the date line at its sides, about 85° north at its top", () => {
    expect(mercator({ lat: 0, lon: 0 })).toEqual([0.5, 0.5]);
    expect(near(mercator({ lat: 85.051129, lon: -180 }), [0, 0], 1e-7)).toBe(true);
    expect(near(mercator({ lat: -85.051129, lon: 180 }), [1, 1], 1e-7)).toBe(true);
    // North is up: Moncton is above Long Lake, and to its right (east).
    expect([mercator(MONCTON)[1] < mercator(LONG_LAKE)[1], mercator(MONCTON)[0] > mercator(LONG_LAKE)[0]]).toEqual([true, true]);
  });

  test("a place goes to the screen and back", () => {
    const view = viewAt(MONCTON, 7, PHONE);
    const back = unproject(view, project(view, LONG_LAKE));
    expect(near([back.lat, back.lon], [LONG_LAKE.lat, LONG_LAKE.lon], 1e-9)).toBe(true);
  });
});

describe("a view", () => {
  test("the whole world is 512 px wide at zoom 0, and twice that one zoom closer", () => {
    expect([scaleAt(0), scaleAt(1), zoomOf(viewAt(MONCTON, 6.5, PHONE))]).toEqual([512, 1024, 6.5]);
  });

  test("viewAt puts its centre in the middle of the frame", () => {
    const view = viewAt(MONCTON, 7, PHONE);
    expect(near(project(view, MONCTON), [195, 300], 1e-9)).toBe(true);
    const center = centerOf(view, PHONE);
    expect(near([center.lat, center.lon], [MONCTON.lat, MONCTON.lon], 1e-9)).toBe(true);
  });

  test("at this latitude one px is about 425 m at zoom 7", () => {
    const view = viewAt(MONCTON, 7, PHONE);
    const [x0] = project(view, MONCTON);
    const [x1] = project(view, { lat: MONCTON.lat, lon: MONCTON.lon + 1 }); // one degree east: 77.2 km here
    expect(Math.round((77.2 / (x1 - x0)) * 1000)).toBeGreaterThan(410);
    expect(Math.round((77.2 / (x1 - x0)) * 1000)).toBeLessThan(440);
  });
});

describe("fitView: the frame the map opens on", () => {
  const insets = { top: 40, right: 48, bottom: 220, left: 48 }; // the sheet covers the bottom 220 px
  const inside = (view: View, place: LatLon) => {
    const [x, y] = project(view, place);
    return x >= insets.left - 1e-6 && x <= PHONE.width - insets.right + 1e-6 && y >= insets.top - 1e-6 && y <= PHONE.height - insets.bottom + 1e-6;
  };

  test("the person and the fire are both inside the room left by the insets, and one of the two pairs of sides is touched", () => {
    const view = fitView([MONCTON, LONG_LAKE], PHONE, insets, 10);
    expect([inside(view, MONCTON), inside(view, LONG_LAKE)]).toEqual([true, true]);
    const [a, b] = [project(view, MONCTON), project(view, LONG_LAKE)];
    const spans = [Math.abs(a[0] - b[0]) / (PHONE.width - insets.left - insets.right), Math.abs(a[1] - b[1]) / (PHONE.height - insets.top - insets.bottom)];
    expect(Math.max(...spans)).toBeCloseTo(1, 6);
    // And what it shows sits in the middle of that room.
    expect((a[1] + b[1]) / 2).toBeCloseTo(insets.top + (PHONE.height - insets.top - insets.bottom) / 2, 6);
  });

  test("a fire next door does not zoom past the limit: both are centred at the closest zoom allowed", () => {
    const nextDoor = { lat: MONCTON.lat + 0.002, lon: MONCTON.lon + 0.002 };
    const view = fitView([MONCTON, nextDoor], PHONE, insets, 10);
    expect(zoomOf(view)).toBe(10);
    expect([inside(view, MONCTON), inside(view, nextDoor)]).toEqual([true, true]);
  });

  test("one place alone is centred in the room, at the closest zoom allowed", () => {
    const view = fitView([MONCTON], PHONE, insets, 8);
    expect(zoomOf(view)).toBe(8);
    expect(near(project(view, MONCTON), [195, 40 + (600 - 40 - 220) / 2], 1e-9)).toBe(true);
  });

  test("places a continent apart stop at the farthest zoom allowed", () => {
    expect(zoomOf(fitView([MONCTON, { lat: 49.3, lon: -123.1 }], PHONE, insets, 10, 4))).toBe(4);
  });

  test("a frame smaller than its insets still gives a view", () => {
    const view = fitView([MONCTON, LONG_LAKE], { width: 320, height: 120 }, insets, 10, 4);
    expect([Number.isFinite(view.scale), Number.isFinite(view.x), Number.isFinite(view.y), view.scale > 0]).toEqual([true, true, true, true]);
  });
});

describe("moving the overlay with the map", () => {
  test("between: what was drawn in one view, scaled and moved, lands where the other view puts it", () => {
    const drawn = viewAt(MONCTON, 7, PHONE);
    for (const now of [viewAt({ lat: 45.5, lon: -65.4 }, 7, PHONE), viewAt(MONCTON, 8.3, PHONE), viewAt(LONG_LAKE, 5.2, PHONE)]) {
      const t = between(drawn, now);
      for (const place of [MONCTON, LONG_LAKE, { lat: 47.3, lon: -66.1 }]) {
        const [x, y] = project(drawn, place);
        expect(near([x * t.scale + t.x, y * t.scale + t.y], project(now, place), 1e-6)).toBe(true);
      }
    }
  });

  test("between a view and itself is no move at all", () => {
    const view = viewAt(MONCTON, 7, PHONE);
    expect(between(view, view)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  test("zoomed: one step closer about a point keeps that point where it was", () => {
    const view = viewAt(MONCTON, 7, PHONE);
    const closer = zoomed(view, 2, [100, 150]);
    expect(zoomOf(closer)).toBe(8);
    const place = unproject(view, [100, 150]);
    expect(near(project(closer, place), [100, 150], 1e-6)).toBe(true);
  });
});
