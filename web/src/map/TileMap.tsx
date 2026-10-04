// The detailed basemap: MapLibre GL JS drawing the app's own PMTiles file. Loaded on its own, after the verdict screen
// (src/map/warm.ts): nothing here is needed to give the answer. It draws the basemap only; what the verdict shows is
// the overlay, which follows this map through the view it reports.
import type * as MapLibre from "maplibre-gl";
import { PMTiles, TileType } from "pmtiles";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { Lang } from "../i18n";
import { MAX_ZOOM, MIN_ZOOM } from "./frame";
import { centerOf, mercator, scaleAt, unmercator, zoomOf, type LatLon, type Size, type View } from "./mercator";
import { NAME_LAYERS, TILE_PROTOCOL, mapStyle, nameIn } from "./style";
import TILES from "./tiles.json";

export interface TileSource {
  /** One tile's bytes; undefined where the file has none (open sea, or past its edge). */
  get(z: number, x: number, y: number, signal?: AbortSignal): Promise<ArrayBuffer | undefined>;
}

/** Open the basemap file. Rejects when it is missing, cut off, or not a PMTiles archive of vector tiles. */
export async function openTiles(url: string): Promise<TileSource> {
  const archive = new PMTiles(url);
  const header = await archive.getHeader();
  if (header.tileType !== TileType.Mvt) throw new Error("the basemap is not a file of vector tiles");
  return { get: (z, x, y, signal) => archive.getZxy(z, x, y, signal).then((tile) => tile?.data) };
}

/** Answer MapLibre's tile requests from the file. Once per page: the protocol is the library's, not a map's. */
export function register(lib: typeof MapLibre, tiles: TileSource): void {
  lib.addProtocol(TILE_PROTOCOL, async (request, abort) => {
    const [z, x, y] = request.url.slice(`${TILE_PROTOCOL}://`.length).split("/").map(Number);
    // No tile there: an empty one, new each time (MapLibre hands the bytes over to its worker, and keeps none).
    return { data: (await tiles.get(z, x, y, abort.signal)) ?? new ArrayBuffer(0) };
  });
}

const [WEST, SOUTH, EAST, NORTH] = TILES.bbox;
// Two places, to read the map's own view back from it: where it puts them fixes its scale and its offset.
const A = { lat: NORTH, lon: WEST };
const B = { lat: SOUTH, lon: EAST };
const [BOX_X0, BOX_Y0] = mercator(A);
const [BOX_X1, BOX_Y1] = mercator(B);
const within = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/**
 * The map stays near what the file covers: its centre is held within the file's box plus half a screen, so some of the
 * box is always in view. (MapLibre's own `maxBounds` holds the whole picture inside its bounds, the part under the
 * sheet too: it would push the frame the map opens on down under the sheet.)
 */
function nearTheFile(lib: typeof MapLibre, container: HTMLElement): MapLibre.TransformConstrainFunction {
  return (center, zoom) => {
    const held = within(zoom, MIN_ZOOM, MAX_ZOOM);
    const scale = scaleAt(held);
    const [halfW, halfH] = [container.clientWidth / 2 / scale, container.clientHeight / 2 / scale];
    const [x, y] = mercator({ lat: center.lat, lon: center.lng });
    const [cx, cy] = [within(x, BOX_X0 - halfW, BOX_X1 + halfW), within(y, BOX_Y0 - halfH, BOX_Y1 + halfH)];
    if (cx === x && cy === y) return { center, zoom: held };
    const place = unmercator(cx, cy);
    return { center: new lib.LngLat(place.lon, place.lat), zoom: held };
  };
}

/** The view MapLibre is showing, read from where it puts two places: the overlay then sits exactly on the basemap. */
function viewOf(map: MapLibre.Map): View {
  const [a, b] = [map.project([A.lon, A.lat]), map.project([B.lon, B.lat])];
  const [[ax, ay], [bx]] = [mercator(A), mercator(B)];
  const scale = (b.x - a.x) / (bx - ax);
  return { scale, x: a.x - ax * scale, y: a.y - ay * scale };
}

/** A map that has been started, and how far it has got. */
interface Started {
  map: MapLibre.Map;
  container: HTMLDivElement;
  /** Its style is in: its names can be set. */
  styled: boolean;
  /** It has drawn a whole first picture. */
  loaded: boolean;
  /** Something it needed could not be read. */
  failed: boolean;
}

const FILL = "position:absolute;inset:0";

/** Start a map in `container`. Throws where the browser gives no WebGL 2 context. */
function start(lib: typeof MapLibre, container: HTMLDivElement, view: View, size: Size, lang: Lang): Started {
  const center = centerOf(view, size);
  const map = new lib.Map({
    container,
    style: mapStyle(lang),
    center: [center.lon, center.lat],
    zoom: zoomOf(view),
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    transformConstrain: nearTheFile(lib, container),
    // North stays up (the card's arrow says so) and the map stays flat: no turning, no tilting.
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    rollEnabled: false,
    renderWorldCopies: false,
    attributionControl: false, // the credit is the app's own, in its own type (MapStage.tsx)
    maplibreLogo: false,
    fadeDuration: 0,
    validateStyle: false,
    canvasContextAttributes: { failIfMajorPerformanceCaveat: true },
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  const started: Started = { map, container, styled: false, loaded: false, failed: false };
  map.once("style.load", () => (started.styled = true));
  map.once("load", () => (started.loaded = true));
  map.on("error", () => (started.failed = true));
  return started;
}

// --- A map started ahead of the verdict screen --------------------------------------------------------------------
// While the Loading screen shows, the map is started off the screen on the frame the verdict is expected to open on:
// its style, its first tiles and its first picture are then done before the verdict shows, and the verdict screen
// takes it as it is. One at a time; one that is not taken is given back.
const AHEAD_FOR_MS = 30_000;
let ahead: Started | null = null;
let aheadTimer = 0;

function stop(started: Started): void {
  started.map.remove();
  started.container.remove();
}
function dropAhead(): void {
  window.clearTimeout(aheadTimer);
  if (ahead) stop(ahead);
  ahead = null;
}
export function startAhead(lib: typeof MapLibre, view: View, size: Size, lang: Lang): void {
  dropAhead();
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;left:0;top:0;width:${size.width}px;height:${size.height}px;visibility:hidden;pointer-events:none;z-index:-1`;
  container.setAttribute("aria-hidden", "true");
  document.body.appendChild(container);
  try {
    ahead = start(lib, container, view, size, lang);
    aheadTimer = window.setTimeout(dropAhead, AHEAD_FOR_MS);
  } catch {
    container.remove(); // no WebGL: the verdict screen finds that out for itself, and says so
  }
}
/** The map started ahead, if there is one and nothing it needed failed. */
function takeAhead(): Started | null {
  window.clearTimeout(aheadTimer);
  const taken = ahead;
  ahead = null;
  if (!taken?.failed) return taken;
  stop(taken); // it is started again, from nothing: what failed a moment ago may not fail now
  return null;
}

export interface TileMapApi {
  /** Show this view, at once. */
  show(view: View, size: Size): void;
  /** One zoom closer (1) or farther (-1), about a place. */
  zoomBy(steps: number, about: LatLon): void;
}

interface Props {
  lib: typeof MapLibre;
  /** The view to open on. */
  view: View;
  size: Size;
  lang: Lang;
  /** The canvas's name for a screen reader, and the id of the map's summary. */
  label: string;
  describedBy: string;
  /** Where the map is now. `settled`: it has stopped moving. `byHand`: a finger, a wheel or a key moved it. */
  onView: (view: View, settled: boolean, byHand: boolean) => void;
  /** The basemap is drawn and takes gestures. */
  onReady: () => void;
  /** The browser took the map's picture back (a tab left in the background): until `onReady` comes again. */
  onPause: () => void;
  onFail: (why: "tiles" | "webgl") => void;
  api: Ref<TileMapApi>;
}

const BY_APP = { byApp: true };

export function TileMap(props: Props) {
  const wrapper = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre.Map | null>(null);
  const styled = useRef(false);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const { lib, view, size, lang } = latest.current;
    performance.mark("map:mount");
    let started = takeAhead();
    performance.mark(started?.loaded ? "map:taken-drawn" : started ? "map:taken-loading" : "map:started-here");
    if (started) {
      // Started while the Loading screen showed: it comes onto the stage as it is, at the stage's size and frame.
      started.container.style.cssText = FILL;
      started.container.removeAttribute("aria-hidden");
      wrapper.current!.appendChild(started.container);
      const center = centerOf(view, size);
      started.map.resize();
      started.map.jumpTo({ center: [center.lon, center.lat], zoom: zoomOf(view) }, BY_APP);
    } else {
      const container = document.createElement("div");
      container.style.cssText = FILL;
      wrapper.current!.appendChild(container);
      try {
        started = start(lib, container, view, size, lang);
      } catch {
        container.remove();
        latest.current.onFail("webgl");
        return;
      }
    }
    const { map, container } = started;
    mapRef.current = map;
    const canvas = map.getCanvas();
    // The canvas is the part of the map a keyboard moves: named and described in words, and not a second "region"
    // inside the map's own (MapLibre's default role for it).
    canvas.setAttribute("role", "application");
    canvas.setAttribute("aria-label", latest.current.label);
    canvas.setAttribute("aria-describedby", latest.current.describedBy);

    let gone = false; // this map has been taken down: nothing it still says is passed on
    let ready = false;
    const onStyled = () => {
      if (gone) return;
      styled.current = true;
      names(map, latest.current.lang); // the language may have changed since the map was started
    };
    if (started.styled) onStyled();
    else map.once("style.load", onStyled);
    const onLoaded = () => !gone && performance.mark("map:interactive");
    if (started.loaded) onLoaded();
    else map.once("load", onLoaded);

    const moved = (settled: boolean) => (event: { originalEvent?: unknown; byApp?: boolean }) => !gone && latest.current.onView(viewOf(map), settled, !event.byApp && event.originalEvent !== undefined);
    map.on("move", moved(false));
    map.on("moveend", moved(true));
    map.on("idle", () => {
      if (gone || ready) return;
      ready = true;
      performance.mark("map:drawn");
      latest.current.onView(viewOf(map), true, false);
      latest.current.onReady();
    });
    map.triggerRepaint(); // a map taken as it is may have nothing left to draw: its next picture says it is ready
    // Before the first picture, a tile that cannot be read means the basemap cannot be trusted to show: the outline
    // map takes over. After it, a tile that fails (the network dropped while moving) leaves that patch plain.
    map.on("error", () => !gone && !ready && latest.current.onFail("tiles"));
    const lost = () => {
      if (gone) return; // taking a map down gives its context back on purpose: that is not the device failing
      if (!ready) return latest.current.onFail("webgl");
      ready = false; // MapLibre draws again when the browser gives the context back: `idle` then says so
      latest.current.onPause();
    };
    canvas.addEventListener("webglcontextlost", lost);
    return () => {
      gone = true;
      canvas.removeEventListener("webglcontextlost", lost);
      mapRef.current = null;
      styled.current = false;
      map.remove();
      container.remove();
    };
  }, []);

  // Place names follow the app's language. Before the map's style is in, the names are set when it comes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (styled.current) names(map, props.lang);
    map.getCanvas().setAttribute("aria-label", props.label);
  }, [props.lang, props.label]);

  useImperativeHandle(
    props.api,
    () => ({
      show(view, size) {
        const center = centerOf(view, size);
        mapRef.current?.jumpTo({ center: [center.lon, center.lat], zoom: zoomOf(view) }, BY_APP);
      },
      zoomBy(steps, about) {
        const map = mapRef.current;
        if (map) map.zoomTo(map.getZoom() + steps, { around: [about.lon, about.lat] }, BY_APP);
      },
    }),
    [],
  );

  return <div ref={wrapper} className="map-tiles" />;
}

/** Write the map's place names in a language, and say on the map which one they are in. */
function names(map: MapLibre.Map, lang: Lang): void {
  for (const id of NAME_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, "text-field", nameIn(lang));
  map.getContainer().lang = lang;
}
