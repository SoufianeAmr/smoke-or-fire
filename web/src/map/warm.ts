// Getting the detailed map ready, once per page: MapLibre's own modules (served as they are from /vendor, see
// scripts/vendor-map.mjs), the app's tile map (its own chunk), and the basemap file's header. Started while the Loading
// screen shows, so the map is there when the verdict opens. Anything that fails here leaves the outline map in place.
import type * as MapLibre from "maplibre-gl";
import type { Lang } from "../i18n";
import { framed, openingView } from "./frame";
import type { MapModel } from "./model";
import type { TileMap, TileSource } from "./TileMap";
import TILES from "./tiles.json";

declare const __MAPLIBRE_DIR__: string;
const LIBRARY = `${import.meta.env.BASE_URL}${__MAPLIBRE_DIR__}/maplibre-gl.mjs`;
export const TILES_URL = `${import.meta.env.BASE_URL}tiles/${TILES.file}`;

export interface TileKit {
  lib: typeof MapLibre;
  TileMap: typeof TileMap;
  tiles: TileSource;
  startAhead: typeof import("./TileMap").startAhead;
}

/** Why there is no detailed map: this device cannot draw it, or it (the library, the app's map code or the basemap
 *  file) could not be loaded. */
export class NoTileMap extends Error {
  constructor(public readonly why: "webgl" | "tiles") {
    super(why);
  }
}

let drawable: boolean | null = null;
/** Whether this device can draw the detailed map: MapLibre 6 needs WebGL 2, and one that is not painfully slow. */
export function canDraw(): boolean {
  if (drawable === null) {
    try {
      const context = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
      drawable = context !== null;
      context?.getExtension("WEBGL_lose_context")?.loseContext(); // give the context back at once
    } catch {
      drawable = false;
    }
  }
  return drawable;
}

let kit: Promise<TileKit> | null = null;
let loaded: TileKit | null = null;
/** The kit, if it is already loaded: the verdict screen then puts the map on its stage without waiting a turn. */
export const readyKit = (): TileKit | null => loaded;

/** Everything the detailed map needs, loaded once. Rejects with NoTileMap; a failed load is tried again next time. */
export function tileKit(): Promise<TileKit> {
  if (kit) return kit;
  const loading = (async (): Promise<TileKit> => {
    if (!canDraw()) throw new NoTileMap("webgl");
    try {
      const [lib, mine] = await Promise.all([import(/* @vite-ignore */ LIBRARY) as Promise<typeof MapLibre>, import("./TileMap")]);
      const tiles = await mine.openTiles(TILES_URL);
      mine.register(lib, tiles);
      return { lib, TileMap: mine.TileMap, tiles, startAhead: mine.startAhead };
    } catch {
      throw new NoTileMap("tiles");
    }
  })();
  kit = loading;
  loading.then((ready) => (loaded = ready)).catch(() => {});
  loading.catch((error: unknown) => {
    // The device will not change its mind; the network may.
    if (!(error instanceof NoTileMap && error.why === "webgl")) kit = null;
  });
  return loading;
}

/** Start loading the detailed map, and its workers, ahead of the verdict. Never throws. */
export function warmMap(): void {
  tileKit()
    .then(({ lib }) => lib.prewarm())
    .catch(() => {});
}

/**
 * Start the verdict's map ahead of the verdict screen, off the screen: its tiles are fetched and its first picture is
 * drawn while the Loading screen still shows. The frame is guessed from the phone's screen (the top bar, the 911 bar
 * and the replay banner take about 180 px; the card, a little under half of what is left); the verdict screen then
 * moves the map to its own. Never throws.
 */
export function startMap(model: MapModel, lang: Lang): void {
  if (model.detail !== "full") return;
  const size = { width: Math.min(window.innerWidth, 480), height: Math.max(200, window.innerHeight - 180) };
  const { fit, marks } = framed(model);
  const view = openingView(fit, marks, size, Math.round(size.height * 0.42), []);
  tileKit()
    .then(({ lib, startAhead }) => startAhead(lib, view, size, lang))
    .catch(() => {});
}
