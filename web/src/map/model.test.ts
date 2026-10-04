// The map model from the real replay files in data/demo/, and the contract with the engine: the schema the engine's
// own tests hold its "map" key to (engine/smoke_engine/schemas/map.v1.schema.json).
import Ajv2020 from "ajv/dist/2020";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { EngineMap, VerdictJson } from "../verdict/types";
import { MAP_VERSION, featuredFire, readMap } from "./model";

const read = (url: URL) => JSON.parse(readFileSync(url, "utf8"));
const demo = (town: string): VerdictJson => read(new URL(`../../../data/demo/${town}.json`, import.meta.url));
const TOWNS = readdirSync(new URL("../../../data/demo/", import.meta.url)).filter((file) => file !== "index.json").map((file) => file.replace(".json", ""));
const schema = read(new URL("../../../engine/smoke_engine/schemas/map.v1.schema.json", import.meta.url));
const valid = new Ajv2020({ allErrors: true }).compile(schema);
/** The Moncton answer with its map key changed. */
const withMap = (change: (map: EngineMap) => unknown): VerdictJson => {
  const answer = demo("moncton");
  return { ...answer, map: change(structuredClone(answer.map!)) as EngineMap };
};

describe("the contract: version 1 of the engine's map key", () => {
  test("the app reads the version the schema describes", () => {
    expect([MAP_VERSION, schema.properties.version.const]).toEqual([1, 1]);
  });

  test("every replay town's map matches the schema, and the app reads it in full", () => {
    expect(TOWNS.length).toBe(14);
    expect(TOWNS.filter((town) => !valid(demo(town).map)).map((town) => `${town}: ${JSON.stringify(valid.errors)}`)).toEqual([]);
    expect(TOWNS.filter((town) => readMap(demo(town)).detail !== "full")).toEqual([]);
  });

  // What the schema refuses, the app refuses too: it then draws from the rest of the answer.
  const BROKEN: Record<string, (map: EngineMap) => unknown> = {
    "another version": (map) => ({ ...map, version: 2 }),
    "no version": ({ version, ...rest }) => rest,
    "no layers": ({ layers, ...rest }) => rest,
    "a layer with no source": (map) => ({ ...map, layers: { ...map.layers, fires: { ok: true, checkedAt: null, count: 0 } } }),
    "a layer with no time": (map) => ({ ...map, layers: { ...map.layers, trails: { source: "open_meteo_gfs", model: "gfs025" } } }),
    "no trail": (map) => ({ ...map, trails: [] }),
    "a trail with no point": (map) => ({ ...map, trails: [{ ...map.trails[0], points: [] }] }),
    "a detection nowhere on Earth": (map) => ({ ...map, detections: [{ ...map.detections[0], lat: 123 }] }),
    "a detection with words for a place": (map) => ({ ...map, detections: [{ ...map.detections[0], lon: "west" }] }),
    "a detection with no time": (map) => ({ ...map, detections: [{ ...map.detections[0], time: "this morning" }] }),
    "a detection with negative power": (map) => ({ ...map, detections: [{ ...map.detections[0], frp: -1 }] }),
    "a fire with no id": (map) => ({ ...map, fires: [{ ...map.fires[0], id: null }] }),
    "a zone that is not a ring": (map) => ({ ...map, alertZone: { rings: [[[-65, 46], [-64, 46]]] } }),
    "an alert state never heard of": (map) => ({ ...map, layers: { ...map.layers, alertZone: { ...map.layers.alertZone, state: "maybe" } } }),
    "a list instead of the map": () => [],
    "null": () => null,
  };
  for (const [what, change] of Object.entries(BROKEN)) {
    test(`${what}: refused by the schema and by the app`, () => {
      const answer = withMap(change);
      expect([valid(answer.map), readMap(answer).detail]).toEqual([false, "reduced"]);
    });
  }

  test("a field a newer engine adds is ignored: the map is still read in full", () => {
    const answer = withMap((map) => ({ ...map, wind: { arrows: [] }, layers: { ...map.layers, roads: { source: "someone" } } }));
    expect(readMap(answer).detail).toBe("full");
  });
});

describe("Moncton replay, Aug 25, 2025", () => {
  const model = readMap(demo("moncton"));

  test("the person, the Long Lake fire as the focus, and the three heights with the chosen one marked", () => {
    expect(model.you).toEqual({ lat: 46.09948, lon: -64.7998 });
    expect(model.focus).toEqual({ lat: 44.7024, lon: -65.2034 });
    expect(model.trails.map((t) => [t.height, t.chosen, t.points.length])).toEqual([["100m", true, 21], ["925hPa", false, 14], ["850hPa", false, 19]]);
    expect(model.trails.every((t) => t.points.every((p, i) => p.hoursAgo === i))).toBe(true);
  });

  test("498 detections with their power, the official fires, and ECCC's zone around Moncton", () => {
    expect([model.detections.length, model.detections.filter((d) => d.frp === null).length, model.fires.length]).toEqual([498, 0, 11]);
    expect(model.alertZone!.rings.map((ring) => ring.length)).toEqual([24]);
    expect(model.layers!.alertZone).toEqual({ source: "naad_archive", state: "active", issued: "2025-08-25T07:50:39Z", checkedAt: null, outline: true });
  });
});

describe("no map key (an older engine): the map shows what the rest of the answer says", () => {
  const without = (town: string): VerdictJson => {
    const { map, ...rest } = demo(town);
    return rest;
  };

  test("Moncton: the three paths, the person and the fire the verdict features; no detections, no other fires, no zone", () => {
    const model = readMap(without("moncton"));
    expect(model.detail).toBe("reduced");
    expect([model.you, model.focus]).toEqual([{ lat: 46.09948, lon: -64.7998 }, { lat: 44.7024, lon: -65.2034 }]);
    expect(model.trails.map((t) => [t.height, t.chosen, t.points.length])).toEqual([["100m", true, 21], ["925hPa", false, 14], ["850hPa", false, 19]]);
    expect(model.trails[0].points[0]).toEqual({ lat: 46.0995, lon: -64.7998, hoursAgo: 0 });
    // Long Lake is not on Canada's official list in the recorded data: no flame is claimed for it.
    expect([model.detections, model.fires, model.alertZone, model.layers]).toEqual([[], [], null, null]);
  });

  test("the paths are the same ones the map key gives", () => {
    for (const town of TOWNS) expect(readMap(without(town)).trails).toEqual(readMap(demo(town)).trails);
  });

  test("Bathurst: its fire is on Canada's official list, so it keeps its flame", () => {
    const answer = without("bathurst");
    const fire = featuredFire(answer)!;
    expect(readMap(answer).fires).toEqual([{ id: fire.cwfisIds[0], lat: fire.lat, lon: fire.lon, stage: fire.stage, sizeHa: fire.sizeHa, name: null }]);
  });

  test("the featured fire: on the air's path for drifting and unclear, the nearest for unexplained, none with no fire in range", () => {
    const halifax = demo("halifax");
    expect(featuredFire(demo("moncton"))!.name).toBe("Long Lake");
    expect(featuredFire(demo("miramichi"))).toEqual(demo("miramichi").closestApproach!.fire);
    expect(featuredFire(halifax)).toEqual(halifax.nearestFire);
    expect(featuredFire({ ...halifax, noFiresInRange: true, nearestFire: null, closestApproach: null })).toBeNull();
    expect(readMap({ ...without("halifax"), noFiresInRange: true, nearestFire: null, closestApproach: null }).focus).toBeNull();
  });
});
