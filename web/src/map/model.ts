// What the map draws, read from the engine's answer. Live and replay answers go through this one function: a replay
// file is the engine's own answer, saved.
//
// The engine's "map" key (version 1, engine/smoke_engine/schemas/map.v1.schema.json) gives everything: the three
// trails, the detections, the official fires, ECCC's alert zone, and each layer's source and time. It comes over the
// network, so it is checked here before anything is drawn. Without it (an older engine, a null, a version this app
// does not know, or anything out of shape) the map shows what the rest of the answer says, the paths and the fire the
// verdict features, and says so. Pure: no React, no DOM.
import type { EngineMap, Fire, Height, VerdictJson } from "../verdict/types";
import type { LatLon } from "./mercator";

export const MAP_VERSION = 1;

export interface MapModel {
  /** "full": the engine's map key. "reduced": no map key, so no detections, no other fires and no alert zone. */
  detail: "full" | "reduced";
  you: LatLon;
  focus: LatLon | null;
  trails: EngineMap["trails"];
  detections: EngineMap["detections"];
  fires: EngineMap["fires"];
  alertZone: EngineMap["alertZone"];
  /** Each layer's source and time; null when the engine sent no map key. */
  layers: EngineMap["layers"] | null;
}

/** The fire the screen features: the one on the air's path for drifting and unclear, else the nearest; none in range, none. */
export function featuredFire(json: VerdictJson): Fire | null {
  if (json.verdict === "drifting" || json.verdict === "unclear") return json.closestApproach?.fire ?? null;
  return json.noFiresInRange ? null : json.nearestFire;
}

export function readMap(json: VerdictJson): MapModel {
  return checked(json.map) ?? reduced(json);
}

const HEIGHTS: Height[] = ["100m", "925hPa", "850hPa"];
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isLat = (v: unknown) => isNumber(v) && v >= -90 && v <= 90;
const isLon = (v: unknown) => isNumber(v) && v >= -180 && v <= 180;
const isPlace = (v: unknown) => isObject(v) && isLat(v.lat) && isLon(v.lon);
const isTime = (v: unknown) => typeof v === "string" && TIME.test(v);
const isTimeOrNull = (v: unknown) => v === null || isTime(v);
const isCount = (v: unknown) => isNumber(v) && Number.isInteger(v) && v >= 0;
const isSource = (v: unknown) => isObject(v) && typeof v.ok === "boolean" && isTimeOrNull(v.checkedAt);
const every = (v: unknown, each: (item: unknown) => boolean) => Array.isArray(v) && v.every(each);

/** The engine's map key as a model, or null when it is missing or not version 1 as the schema describes it. Fields a
 *  newer engine adds are ignored. */
function checked(map: unknown): MapModel | null {
  if (!isObject(map) || map.version !== MAP_VERSION) return null;
  const layers = map.layers;
  const ok =
    isPlace(map.you) &&
    (map.focus === null || isPlace(map.focus)) &&
    Array.isArray(map.trails) && map.trails.length > 0 &&
    every(map.trails, (t) => isObject(t) && HEIGHTS.includes(t.height as Height) && typeof t.chosen === "boolean" && Array.isArray(t.points) && t.points.length > 0 && every(t.points, (p) => isPlace(p) && isCount((p as Record<string, unknown>).hoursAgo))) &&
    every(map.detections, (d) => isPlace(d) && isObject(d) && isTime(d.time) && typeof d.observed === "boolean" && (d.frp === null || (isNumber(d.frp) && d.frp >= 0)) && ["FIRMS", "CWFIS", "both"].includes(d.by as string)) &&
    every(map.fires, (f) => isPlace(f) && isObject(f) && typeof f.id === "string" && (f.stage === null || typeof f.stage === "string") && (f.sizeHa === null || isNumber(f.sizeHa)) && (f.name === null || typeof f.name === "string")) &&
    (map.alertZone === null || (isObject(map.alertZone) && Array.isArray(map.alertZone.rings) && map.alertZone.rings.length > 0 && every(map.alertZone.rings, (ring) => Array.isArray(ring) && ring.length >= 4 && every(ring, (p) => Array.isArray(p) && p.length >= 2 && isLon(p[0]) && isLat(p[1]))))) &&
    isObject(layers) &&
    isObject(layers.trails) && layers.trails.source === "open_meteo_gfs" && typeof layers.trails.model === "string" && isTimeOrNull(layers.trails.run) && isTimeOrNull(layers.trails.recordedAt) &&
    isObject(layers.detections) && isCount(layers.detections.hours) && isNumber(layers.detections.radiusKm) && isCount(layers.detections.count) && isCount(layers.detections.shown) && isTimeOrNull(layers.detections.newest) && isSource(layers.detections.firms) && isSource(layers.detections.cwfis) &&
    isObject(layers.fires) && layers.fires.source === "nrcan_cwfis" && typeof layers.fires.ok === "boolean" && isTimeOrNull(layers.fires.checkedAt) && isCount(layers.fires.count) &&
    isObject(layers.alertZone) && ["eccc_geomet", "naad_archive"].includes(layers.alertZone.source as string) && ["active", "none", "not_checked"].includes(layers.alertZone.state as string) && isTimeOrNull(layers.alertZone.issued) && isTimeOrNull(layers.alertZone.checkedAt) && typeof layers.alertZone.outline === "boolean";
  if (!ok) return null;
  const key = map as unknown as EngineMap;
  return { detail: "full", you: key.you, focus: key.focus, trails: key.trails, detections: key.detections, fires: key.fires, alertZone: key.alertZone, layers: key.layers };
}

/** No map key: the three paths the answer always carries, the person, and the featured fire (a flame only if it is on
 *  Canada's official list). No detections, no other fires, no alert zone. */
function reduced(json: VerdictJson): MapModel {
  const fire = featuredFire(json);
  const trails = HEIGHTS.filter((height) => json.heights.paths[height]).map((height) => ({
    height,
    chosen: height === json.heights.chosen,
    points: json.heights.paths[height].points.map(({ lat, lon, hoursAgo }) => ({ lat, lon, hoursAgo })),
  }));
  return {
    detail: "reduced",
    you: { lat: json.location.lat, lon: json.location.lon },
    focus: fire ? { lat: fire.lat, lon: fire.lon } : null,
    trails,
    detections: [],
    fires: fire && fire.cwfisIds.length > 0 ? [{ id: fire.cwfisIds[0], lat: fire.lat, lon: fire.lon, stage: fire.stage, sizeHa: fire.sizeHa, name: fire.name }] : [],
    alertZone: null,
    layers: null,
  };
}
