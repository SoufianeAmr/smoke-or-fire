// The static map drawn in screens 05, 06 and 07: real N.B., N.S., P.E.I., Quebec and Maine outlines
// (data/places/areas.geojson) in the screens' projection, colours and labels.
import { geoMercator, geoPath, type GeoProjection } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import topo from "../data/maritimes.topo.json";
import type { Lang } from "../i18n";
import { isFree, textBox, type Box } from "./labels";

// Mercator scale that reproduces the screen files: Moncton at (186, 48), ~72 px per degree of
// longitude, the head of Minas Basin at (292, 124) (screens: 294, 125).
export const MAP_SCALE = 4140;
export const USER_XY: [number, number] = [186, 48];

export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * The screens' projection centred on the user at (186, 48). If a point that must be seen (the fire)
 * falls outside the frame, the map moves just enough to show it, and zooms out only if the user and
 * that point cannot both fit.
 */
export function frameProjection(user: LatLon, width: number, height: number, keep: LatLon[] = [], margin = 28): GeoProjection {
  const projection = geoMercator().scale(MAP_SCALE).center([user.lon, user.lat]).translate(USER_XY);
  if (!keep.length) return projection;
  const points = [user, ...keep].map((p) => projection([p.lon, p.lat])!);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const room = [width - 2 * margin, height - 2 * margin];
  const zoom = Math.min(1, room[0] / Math.max(maxX - minX, 1), room[1] / Math.max(maxY - minY, 1));
  if (zoom < 1) {
    projection.scale(MAP_SCALE * zoom);
    const scaled = [user, ...keep].map((p) => projection([p.lon, p.lat])!);
    const cx = (Math.min(...scaled.map((p) => p[0])) + Math.max(...scaled.map((p) => p[0]))) / 2;
    const cy = (Math.min(...scaled.map((p) => p[1])) + Math.max(...scaled.map((p) => p[1]))) / 2;
    const [tx, ty] = projection.translate();
    return projection.translate([tx + width / 2 - cx, ty + height / 2 - cy]);
  }
  const dx = Math.max(margin - minX, 0) - Math.max(maxX - (width - margin), 0);
  const dy = Math.max(margin - minY, 0) - Math.max(maxY - (height - margin), 0);
  return projection.translate([USER_XY[0] + dx, USER_XY[1] + dy]);
}

const topology = topo as unknown as Topology<{ land: GeometryCollection }>;
const landShapes = feature(topology, topology.objects.land);
const coast = mesh(topology, topology.objects.land, (a, b) => a === b);
const borders = mesh(topology, topology.objects.land, (a, b) => a !== b);

type LabelSet = "location" | "loading" | "verdict";

// Province label positions from the screen files (05, 06, 07a), as places on the map.
const LABELS: Record<LabelSet, { en: string; fr: string; at: LatLon }[]> = {
  location: [
    { en: "N.B.", fr: "N.-B.", at: { lat: 45.637, lon: -66.516 } },
    { en: "P.E.I.", fr: "Î.-P.-É.", at: { lat: 46.31, lon: -63.333 } },
    { en: "N.S.", fr: "N.-É.", at: { lat: 45.482, lon: -63.942 } },
  ],
  loading: [
    { en: "N.B.", fr: "N.-B.", at: { lat: 45.637, lon: -66.516 } },
    { en: "P.E.I.", fr: "Î.-P.-É.", at: { lat: 46.31, lon: -63.333 } },
    { en: "N.S.", fr: "N.-É.", at: { lat: 44.838, lon: -63.886 } },
  ],
  verdict: [
    { en: "N.B.", fr: "N.-B.", at: { lat: 45.637, lon: -66.516 } },
    { en: "P.E.I.", fr: "Î.-P.-É.", at: { lat: 46.31, lon: -63.333 } },
    { en: "N.S.", fr: "N.-É.", at: { lat: 44.838, lon: -63.831 } },
  ],
};

/** Water, land, coastline, province borders and province labels (left out where they would cover `avoid`). */
export function Basemap({ projection, width, height, lang, labels, avoid = [] }: { projection: GeoProjection; width: number; height: number; lang: Lang; labels: LabelSet; avoid?: Box[] }) {
  const path = geoPath(projection);
  return (
    <>
      <rect x="0" y="0" width={width} height={height} style={{ fill: "#D8E3EE" }} />
      <path className="land" d={path(landShapes) ?? ""} style={{ stroke: "none" }} />
      <path className="land" d={path(coast) ?? ""} style={{ fill: "none" }} />
      <path className="border" d={path(borders) ?? ""} />
      {LABELS[labels].map((label) => {
        const [x, y] = projection([label.at.lon, label.at.lat])!;
        if (x < 0 || x > width - 30 || y < 18 || y > height - 4) return null;
        if (!isFree(textBox(label[lang], x, y), avoid)) return null;
        return (
          <text key={label.en} className="lbl-m" x={Math.round(x)} y={Math.round(y)}>
            {label[lang]}
          </text>
        );
      })}
    </>
  );
}

export const round = (v: number) => Math.round(v * 10) / 10;
