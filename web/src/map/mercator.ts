// Web Mercator and the map's view: where a place on Earth falls on the screen. The overlay, the outline map and the
// tile map all go through this one view, so what is drawn over a basemap sits exactly on it. Pure: no React, no DOM.

export interface LatLon {
  lat: number;
  lon: number;
}
export interface Size {
  width: number;
  height: number;
}
/** Room kept clear on each side of the frame, in px (the sheet at the bottom, the buttons, a marker's own size). */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
/** A place on the screen is its Mercator point (the world as a unit square) times `scale`, plus (x, y). North is up. */
export interface View {
  scale: number;
  x: number;
  y: number;
}

/** The whole world is 512 px wide at zoom 0, as MapLibre counts it. */
const WORLD_PX = 512;
const MAX_LAT = 85.051129;

/** The world as a unit square: (0, 0) is its north-west corner, (1, 1) its south-east one. */
export function mercator({ lat, lon }: LatLon): [number, number] {
  const phi = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180;
  return [(lon + 180) / 360, 0.5 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / (2 * Math.PI)];
}

export function unmercator(x: number, y: number): LatLon {
  return { lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI, lon: x * 360 - 180 };
}

export function project(view: View, place: LatLon): [number, number] {
  const [x, y] = mercator(place);
  return [x * view.scale + view.x, y * view.scale + view.y];
}

export function unproject(view: View, [sx, sy]: [number, number]): LatLon {
  return unmercator((sx - view.x) / view.scale, (sy - view.y) / view.scale);
}

export const zoomOf = (view: View) => Math.log2(view.scale / WORLD_PX);
export const scaleAt = (zoom: number) => WORLD_PX * 2 ** zoom;

/** The view with `center` in the middle of the frame at `zoom`. */
export function viewAt(center: LatLon, zoom: number, size: Size): View {
  const scale = scaleAt(zoom);
  const [x, y] = mercator(center);
  return { scale, x: size.width / 2 - x * scale, y: size.height / 2 - y * scale };
}

export const centerOf = (view: View, size: Size): LatLon => unproject(view, [size.width / 2, size.height / 2]);

/**
 * The view that shows every place inside the frame less its insets, as close as `maxZoom` allows and never farther out
 * than `minZoom`; what it shows is centred in that room. One place alone is centred at `maxZoom`.
 */
export function fitView(places: LatLon[], size: Size, insets: Insets, maxZoom: number, minZoom = 0): View {
  const points = places.map(mercator);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // A frame smaller than its insets still shows something: 40 px of room each way.
  const room = [Math.max(40, size.width - insets.left - insets.right), Math.max(40, size.height - insets.top - insets.bottom)];
  const fit = Math.min(maxX > minX ? room[0] / (maxX - minX) : Infinity, maxY > minY ? room[1] / (maxY - minY) : Infinity);
  const scale = Math.max(scaleAt(minZoom), Math.min(scaleAt(maxZoom), fit));
  return {
    scale,
    x: insets.left + (size.width - insets.left - insets.right) / 2 - ((minX + maxX) / 2) * scale,
    y: insets.top + (size.height - insets.top - insets.bottom) / 2 - ((minY + maxY) / 2) * scale,
  };
}

/** The same view, `factor` times closer (or farther, under 1) about the screen point `about`. */
export function zoomed(view: View, factor: number, about: [number, number]): View {
  return { scale: view.scale * factor, x: about[0] - (about[0] - view.x) * factor, y: about[1] - (about[1] - view.y) * factor };
}

/**
 * What was drawn through `drawn`, scaled by `scale` and moved by (x, y), lands where `now` puts it: the transform that
 * carries the overlay along while a finger moves the map, with nothing redrawn.
 */
export function between(drawn: View, now: View): View {
  const scale = now.scale / drawn.scale;
  return { scale, x: now.x - drawn.x * scale, y: now.y - drawn.y * scale };
}

/** Two views that put everything in the same place, to a hundredth of a pixel over a phone's screen. */
export const sameView = (a: View, b: View) => Math.abs(a.scale / b.scale - 1) < 1e-5 && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
