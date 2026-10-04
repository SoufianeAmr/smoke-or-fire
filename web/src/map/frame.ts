// The frame the map opens on, and comes back to with "Recentre": the person and the fire the verdict features, both
// whole above the sheet and clear of the map's buttons. Pure: no React, no DOM.
import { fitView, mercator, project, scaleAt, type Insets, type LatLon, type Size, type View } from "./mercator";
import type { MapModel } from "./model";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The map never shows less than about the Maritimes, nor closer than two zooms past its tiles (which stop at 10). */
export const MIN_ZOOM = 4;
export const MAX_ZOOM = 12;
/** It never opens closer than a town and its surroundings, however near the fire is. */
export const OPEN_MAX_ZOOM = 9;
/** The room a mark takes around its place: the person's dot with its halo, the fire's flame. */
export const MARK_R = 18;
const AIR = 14;

/** What the frame must hold: the person and the featured fire; with no fire, the path the verdict was read from. */
export function framed(model: MapModel): { fit: LatLon[]; marks: LatLon[] } {
  if (model.focus) return { fit: [model.you, model.focus], marks: [model.you, model.focus] };
  const chosen = model.trails.find((trail) => trail.chosen) ?? model.trails[0];
  return { fit: [model.you, ...(chosen?.points ?? [])], marks: [model.you] };
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const markBox = ([x, y]: [number, number]): Rect => ({ x: x - MARK_R, y: y - MARK_R, width: 2 * MARK_R, height: 2 * MARK_R });

/**
 * The view that holds `fit` in the part of the stage the sheet leaves free (`covered` px at the bottom are under it),
 * with every mark whole and under no button. First the closest view that fits, centred. If a mark would then sit under
 * a button, the same places are slid around the free part, and shown from a little farther each time, until every mark
 * is clear; of the views that work at that distance, the one nearest the centre is kept. On a stage too small to hold
 * everything even from the farthest zoom, the first mark (the person) comes before the rest: see `holding`.
 */
export function openingView(fit: LatLon[], marks: LatLon[], size: Size, covered: number, buttons: Rect[]): View {
  const pad = MARK_R + AIR;
  const whole: Insets = { top: pad, right: pad, bottom: covered + pad, left: pad };
  const centred = fitView(fit, size, whole, OPEN_MAX_ZOOM, MIN_ZOOM);
  const clear = (view: View) => marks.every((mark) => inTheClear(view, mark, size, covered, buttons));
  if (clear(centred)) return centred;

  const points = fit.map(mercator);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const room = { width: size.width - 2 * pad, height: size.height - covered - 2 * pad };
  const STEPS = 8; // places to try each way across the free part
  for (let farther = 0; farther <= 30; farther++) {
    const scale = centred.scale / 2 ** (farther / 10);
    if (scale < scaleAt(MIN_ZOOM)) break;
    const slack = { x: room.width - (maxX - minX) * scale, y: room.height - (maxY - minY) * scale };
    if (slack.x < 0 || slack.y < 0) continue;
    let best: { view: View; off: number } | null = null;
    for (let i = 0; i <= STEPS; i++) {
      for (let j = 0; j <= STEPS; j++) {
        const view = { scale, x: pad + (slack.x * i) / STEPS - minX * scale, y: pad + (slack.y * j) / STEPS - minY * scale };
        const off = Math.hypot(slack.x * (i / STEPS - 0.5), slack.y * (j / STEPS - 0.5));
        if ((best === null || off < best.off) && clear(view)) best = { view, off };
      }
    }
    if (best) return best.view;
  }
  return holding(centred, marks[0], size, covered, buttons);
}

/**
 * The same view, slid as little as it takes for one mark to be whole in the free part of the stage and under no
 * button: what cannot be held then runs off the edge, never the mark. Where no place is clear of the buttons, the mark
 * is at least inside the free part.
 */
export function holding(view: View, mark: LatLon, size: Size, covered: number, buttons: Rect[]): View {
  const pad = MARK_R + AIR;
  const [px, py] = project(view, mark);
  const [x0, y0] = [Math.min(pad, size.width / 2), Math.min(pad, (size.height - covered) / 2)];
  const [x1, y1] = [Math.max(x0, size.width - pad), Math.max(y0, size.height - covered - pad)];
  const slid = (x: number, y: number): View => ({ scale: view.scale, x: view.x + x - px, y: view.y + y - py });
  const nearest = slid(Math.max(x0, Math.min(px, x1)), Math.max(y0, Math.min(py, y1)));
  if (inTheClear(nearest, mark, size, covered, buttons)) return nearest;
  const STEPS = 8;
  let best: { view: View; off: number } | null = null;
  for (let i = 0; i <= STEPS; i++) {
    for (let j = 0; j <= STEPS; j++) {
      const [x, y] = [x0 + ((x1 - x0) * i) / STEPS, y0 + ((y1 - y0) * j) / STEPS];
      const off = Math.hypot(x - px, y - py);
      if ((best === null || off < best.off) && inTheClear(slid(x, y), mark, size, covered, buttons)) best = { view: slid(x, y), off };
    }
  }
  return best?.view ?? nearest;
}

/** Whether a mark is whole inside the part of the stage the sheet leaves free, and under no button. */
export function inTheClear(view: View, place: LatLon, size: Size, covered: number, buttons: Rect[]): boolean {
  const box = markBox(project(view, place));
  return box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width && box.y + box.height <= size.height - covered && !buttons.some((button) => overlaps(box, button));
}
