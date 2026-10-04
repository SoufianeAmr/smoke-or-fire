// How the detailed basemap is drawn: Protomaps' layers of OpenStreetMap (tile schema 4), in the app's own colours.
// Quiet on purpose, so what the verdict draws over it stands out: land, water, the towns' built-up areas, the main
// roads, the borders, and place names. No green (forests and parks are left as plain land), and no third party: the
// tiles are the app's own file and the names are drawn with the page's own font (no "glyphs" address, so MapLibre
// draws each letter itself).
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import type { Lang } from "../i18n";
import { EMBER } from "./palette";
import TILES from "./tiles.json";

/** The address MapLibre asks tiles from: answered by the app from the PMTiles file (TileMap.tsx). */
export const TILE_PROTOCOL = "sofmap";

/** A place's name in the app's language where OpenStreetMap has one, else its local name. */
export const nameIn = (lang: Lang): ExpressionSpecification => ["coalesce", ["get", `name:${lang}`], ["get", "name"]];
/** The layers that carry names: their text changes with the language. */
export const NAME_LAYERS = ["water-names", "regions", "villages", "towns", "cities"];

// MapLibre reads the weight out of the first name and draws with the first family the page has: Inter, at 600.
const FONT = ["Inter Semibold", "Inter"];
const kind = (...kinds: string[]): ExpressionSpecification => ["in", ["get", "kind"], ["literal", kinds]];
const detail = (...kinds: string[]): ExpressionSpecification => ["in", ["get", "kind_detail"], ["literal", kinds]];
const grows = (from: [number, number], to: [number, number]): ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], from[0], from[1], to[0], to[1]];

/** A name layer: 18 px, 7:1 or more against the land and the water (palette.test.ts), with a halo of what it is on. */
const names = (id: string, sourceLayer: string, filter: ExpressionSpecification, lang: Lang, more: { minzoom?: number; maxzoom?: number; water?: boolean; spaced?: boolean }): LayerSpecification => ({
  id,
  type: "symbol",
  source: "base",
  "source-layer": sourceLayer,
  filter,
  ...(more.minzoom === undefined ? {} : { minzoom: more.minzoom }),
  ...(more.maxzoom === undefined ? {} : { maxzoom: more.maxzoom }),
  layout: {
    "text-field": nameIn(lang),
    "text-font": FONT,
    "text-size": 18,
    "text-max-width": 7,
    "text-padding": 6,
    "text-letter-spacing": more.spaced ? 0.08 : 0,
    // Where two names would touch, the larger place keeps its name.
    "symbol-sort-key": ["coalesce", ["get", "min_zoom"], 20],
  },
  paint: {
    "text-color": more.water ? EMBER.waterLabel : EMBER.placeLabel,
    "text-halo-color": more.water ? EMBER.water : EMBER.land,
    "text-halo-width": 2,
  },
});

export function mapStyle(lang: Lang): StyleSpecification {
  return {
    version: 8,
    sources: {
      base: { type: "vector", tiles: [`${TILE_PROTOCOL}://{z}/{x}/{y}`], minzoom: TILES.minzoom, maxzoom: TILES.maxzoom, bounds: TILES.bbox as [number, number, number, number] },
    },
    layers: [
      { id: "sea", type: "background", paint: { "background-color": EMBER.water } },
      { id: "land", type: "fill", source: "base", "source-layer": "earth", paint: { "fill-color": EMBER.land } },
      { id: "built-up", type: "fill", source: "base", "source-layer": "landuse", filter: kind("residential", "industrial", "commercial"), paint: { "fill-color": EMBER.town } },
      { id: "water", type: "fill", source: "base", "source-layer": "water", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": EMBER.water, "fill-outline-color": EMBER.shore } },
      { id: "rivers", type: "line", source: "base", "source-layer": "water", minzoom: 8, filter: ["all", ["==", ["geometry-type"], "LineString"], kind("river")], paint: { "line-color": EMBER.shore, "line-width": grows([8, 0.6], [12, 1.6]) } },
      { id: "roads", type: "line", source: "base", "source-layer": "roads", minzoom: 8, filter: ["all", kind("major_road"), ["!", detail("trunk_link", "primary_link", "secondary_link", "tertiary_link")]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": EMBER.road, "line-width": grows([8, 0.6], [12, 2.2]) } },
      { id: "highways-edge", type: "line", source: "base", "source-layer": "roads", minzoom: 5, filter: ["all", kind("highway"), ["!", detail("motorway_link")]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": EMBER.border, "line-width": grows([5, 1.4], [12, 4.6]) } },
      { id: "highways", type: "line", source: "base", "source-layer": "roads", minzoom: 5, filter: ["all", kind("highway"), ["!", detail("motorway_link")]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": EMBER.road, "line-width": grows([5, 0.7], [12, 3]) } },
      { id: "borders", type: "line", source: "base", "source-layer": "boundaries", filter: kind("country", "region"), paint: { "line-color": EMBER.border, "line-width": ["case", ["==", ["get", "kind"], "country"], 2.2, 1.5] } },
      names("water-names", "water", ["all", ["==", ["geometry-type"], "Point"], kind("ocean", "sea", "bay", "strait", "gulf")], lang, { minzoom: 5, water: true, spaced: true }),
      names("regions", "places", kind("region"), lang, { maxzoom: 7.5, spaced: true }),
      names("villages", "places", ["all", kind("locality"), detail("village")], lang, { minzoom: 10.5 }),
      names("towns", "places", ["all", kind("locality"), detail("town")], lang, { minzoom: 7 }),
      names("cities", "places", ["all", kind("locality"), detail("city")], lang, {}),
    ],
  };
}
