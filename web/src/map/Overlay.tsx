// What the verdict draws on the map, over either basemap: the ribbon (the air traced back at three heights, a bead an
// hour), the ember dots (satellite detections, sized by fire power), a flame for each fire on Canada's official list,
// a soft dot for the person, and ECCC's alert zone as a dashed outline. One SVG, drawn from the map model through one
// view; it is redrawn only when the view settles. Hidden from screen readers: the map's summary says what it shows.
import { memo, type ReactNode } from "react";
import { FLAME } from "../verdict/marks";
import { MARK_R, type Rect } from "./frame";
import { textWidth } from "./labels";
import { project, type LatLon, type Size, type View } from "./mercator";
import type { MapModel } from "./model";
import { EMBER, emberRadius } from "./palette";

/** Drawn this far past each edge of the stage, so a finger can move the map that far before anything is missing. */
export const OVERSCAN = 256;
const LABEL_PX = 18;
const r1 = (v: number) => Math.round(v * 10) / 10;

export interface OverlayLabels {
  you: string;
  fire: string | null;
  /** The far end of the path the verdict was read from: "20 h ago". */
  end: (hoursAgo: number) => string;
}

interface Props {
  model: MapModel;
  view: View;
  size: Size;
  labels: OverlayLabels;
  /** The part of the stage labels may be written in: above the sheet, and off the map's buttons. */
  covered: number;
  buttons: Rect[];
}

type XY = [number, number];

// A label's width: measured with the page's own font where there is a page, else reckoned from its letters.
let ruler: CanvasRenderingContext2D | null | undefined;
function widthOf(text: string): number {
  if (ruler === undefined) ruler = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!ruler) return textWidth(text, LABEL_PX);
  ruler.font = `700 ${LABEL_PX}px Inter, sans-serif`;
  return Math.ceil(ruler.measureText(text).width);
}
const line = (points: XY[]) => points.map(([x, y]) => `${r1(x)},${r1(y)}`).join(" ");
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Where a label goes: the first spot around its mark that is on the free part of the stage and covers nothing. */
function place(text: string, [x, y]: XY, gap: number, size: Size, covered: number, taken: Rect[]): { x: number; y: number; box: Rect } | null {
  // A mark that is off the map's free part has no label: it would sit at the edge, beside something it does not name.
  if (x < 0 || x > size.width || y < 0 || y > size.height - covered) return null;
  const width = widthOf(text);
  const spots: XY[] = [[x + gap + 6, y + 6], [x - gap - width - 6, y + 6], [x - width / 2, y + gap + 20], [x - width / 2, y - gap - 10], [x + gap + 6, y + gap + 16], [x - gap - width - 6, y - gap - 6]];
  for (const [left, baseline] of spots) {
    const at = Math.max(8, Math.min(left, size.width - 8 - width)); // slid sideways into the frame near an edge
    const box = { x: at - 6, y: baseline - 19, width: width + 12, height: 27 };
    if (box.y < 4 || box.y + box.height > size.height - covered - 4 || taken.some((t) => overlaps(box, t))) continue;
    taken.push(box);
    return { x: at, y: baseline, box };
  }
  return null;
}

export const Overlay = memo(function Overlay({ model, view, size, labels, covered, buttons }: Props) {
  const at = (place: LatLon): XY => project(view, place);
  const seen = ([x, y]: XY, r: number) => x + r >= -OVERSCAN && x - r <= size.width + OVERSCAN && y + r >= -OVERSCAN && y - r <= size.height + OVERSCAN;
  const [ux, uy] = at(model.you);
  const focus = model.focus ? at(model.focus) : null;
  const chosen = model.trails.find((trail) => trail.chosen) ?? model.trails[0];
  const others = model.trails.filter((trail) => trail !== chosen);
  // The featured fire's own flame, when it is on Canada's list, is drawn larger and last.
  const isFocus = (fire: LatLon) => model.focus !== null && Math.abs(fire.lat - model.focus.lat) < 1e-4 && Math.abs(fire.lon - model.focus.lon) < 1e-4;

  // Big dots first, so a small one is never hidden under a large one.
  const embers = model.detections
    .map((d) => ({ xy: at(d), r: emberRadius(d.frp) }))
    .filter((e) => seen(e.xy, e.r))
    .sort((a, b) => b.r - a.r);

  // Labels: the person, the fire, then the far end of the path, each where it covers no mark, no button and no label.
  const taken: Rect[] = [...buttons, { x: ux - MARK_R, y: uy - MARK_R, width: 2 * MARK_R, height: 2 * MARK_R }];
  if (focus) taken.push({ x: focus[0] - 16, y: focus[1] - 16, width: 32, height: 32 });
  const drawn: ReactNode[] = [];
  const write = (key: string, text: string | null, anchor: XY | null, gap: number) => {
    const spot = text && anchor ? place(text, anchor, gap, size, covered, taken) : null;
    // On a plate of its own: a label stays readable over the basemap's own names.
    if (spot) {
      drawn.push(
        <g key={key} data-label={key}>
          <rect className="map-lbl-plate" x={Math.round(spot.box.x)} y={Math.round(spot.box.y)} width={Math.round(spot.box.width)} height={spot.box.height} rx="7" />
          <text className="map-lbl" x={Math.round(spot.x)} y={Math.round(spot.y)}>{text}</text>
        </g>,
      );
    }
  };
  write("you", labels.you, [ux, uy], MARK_R + 4);
  write("fire", labels.fire, focus, 20);
  const end = chosen.points[chosen.points.length - 1];
  if (end.hoursAgo > 0) write("end", labels.end(end.hoursAgo), at(end), 10);

  return (
    <svg
      className="map-overlay"
      aria-hidden="true"
      focusable="false"
      width={size.width + 2 * OVERSCAN}
      height={size.height + 2 * OVERSCAN}
      viewBox={`${-OVERSCAN} ${-OVERSCAN} ${size.width + 2 * OVERSCAN} ${size.height + 2 * OVERSCAN}`}
      style={{ left: `${-OVERSCAN}px`, top: `${-OVERSCAN}px` }}
    >
      {model.alertZone && (
        <g data-layer="zone">
          {model.alertZone.rings.map((ring, i) => {
            const points = line(ring.map(([lon, lat]) => at({ lat, lon })));
            return (
              <g key={i}>
                <polygon className="map-zone-casing" points={points} />
                <polygon className="map-zone" points={points} />
              </g>
            );
          })}
        </g>
      )}
      <g data-layer="detections">
        {embers.map((e, i) => (
          <circle key={i} className="map-ember" cx={r1(e.xy[0])} cy={r1(e.xy[1])} r={r1(e.r)} />
        ))}
      </g>
      <g data-layer="trails">
        {model.trails.map((trail) => (
          <polyline key={trail.height} className="map-ribbon-glow" points={line(trail.points.map(at))} />
        ))}
        {others.map((trail) => (
          <g key={trail.height} data-trail={trail.height}>
            <polyline className="map-trail" points={line(trail.points.map(at))} />
            {trail.points.slice(1).map((p) => {
              const [x, y] = at(p);
              return <circle key={p.hoursAgo} className="map-bead map-bead-small" cx={r1(x)} cy={r1(y)} r="2.5" />;
            })}
          </g>
        ))}
        <g data-trail={chosen.height} data-chosen="true">
          <polyline className="map-ribbon-casing" points={line(chosen.points.map(at))} />
          <polyline className="map-ribbon" points={line(chosen.points.map(at))} />
          {chosen.points.slice(1).map((p) => {
            const [x, y] = at(p);
            return <circle key={p.hoursAgo} className="map-bead" data-hours={p.hoursAgo} cx={r1(x)} cy={r1(y)} r="4" />;
          })}
        </g>
      </g>
      <g data-layer="fires">
        {[...model.fires].sort((a, b) => Number(isFocus(a)) - Number(isFocus(b))).map((fire) => {
          const [x, y] = at(fire);
          const r = isFocus(fire) ? 15 : 11;
          if (!seen([x, y], r)) return null;
          return (
            <g key={fire.id} className="map-fire" data-fire={fire.id} transform={`translate(${r1(x)} ${r1(y)})`}>
              <circle r={r} />
              <path d={FLAME} transform={`translate(${-r * 0.7} ${-r * 0.7}) scale(${(r * 1.4) / 24})`} />
            </g>
          );
        })}
      </g>
      {/* Where the featured fire is, for the frame's own check: nothing is drawn here but the fire's dots or flame. */}
      {focus && <circle data-mark="focus" cx={r1(focus[0])} cy={r1(focus[1])} r="14" style={{ fill: "none", stroke: "none" }} />}
      <g data-mark="you">
        <circle className="map-you-halo" cx={r1(ux)} cy={r1(uy)} r={MARK_R} />
        <circle className="map-you" cx={r1(ux)} cy={r1(uy)} r="9" />
      </g>
      {drawn}
    </svg>
  );
});

/** The marks of the legend, drawn as the overlay draws them. */
export function Swatch({ id }: { id: "zone" | "path" | "detections" | "fires" | "you" | "base" }) {
  return (
    <svg className="map-swatch" width="48" height="32" viewBox="0 0 48 32" aria-hidden="true">
      {id === "zone" && (
        <>
          <rect className="map-zone-casing" x="6" y="6" width="36" height="20" rx="3" />
          <rect className="map-zone" x="6" y="6" width="36" height="20" rx="3" />
        </>
      )}
      {id === "path" && (
        <>
          <polyline className="map-trail" points="4,24 22,20 44,23" />
          <polyline className="map-ribbon-casing" points="4,14 24,9 44,13" />
          <polyline className="map-ribbon" points="4,14 24,9 44,13" />
          <circle className="map-bead" cx="24" cy="9" r="4" />
        </>
      )}
      {id === "detections" && (
        <>
          <circle className="map-ember" cx="14" cy="18" r="4" />
          <circle className="map-ember" cx="32" cy="16" r="10" />
        </>
      )}
      {id === "fires" && (
        <g className="map-fire" transform="translate(24 16)">
          <circle r="13" />
          <path d={FLAME} transform="translate(-9.1 -9.1) scale(0.758)" />
        </g>
      )}
      {id === "you" && (
        <>
          <circle className="map-you-halo" cx="24" cy="16" r="15" />
          <circle className="map-you" cx="24" cy="16" r="8" />
        </>
      )}
      {id === "base" && (
        <>
          <rect x="4" y="4" width="40" height="24" rx="4" style={{ fill: EMBER.water }} />
          <path d="M4 20c8-9 14-2 22-8s10-6 18-4v16a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" style={{ fill: EMBER.land, stroke: EMBER.shore, strokeWidth: "1" }} />
        </>
      )}
    </svg>
  );
}
