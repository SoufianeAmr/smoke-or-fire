// The map of the verdict screen: a basemap, the overlay on it, and the map's buttons.
//
// The basemap is the outline map at first (bundled outlines, drawn at once). The detailed map (MapLibre over the app's
// own tiles) takes its place once it is loaded and drawn. If it cannot be (no WebGL, the tiles or the library did not
// load, or the engine sent no map details), the outline map stays, with the same overlay, and a note says why.
//
// One view places everything. While the map moves under a finger, the overlay is carried by a CSS transform and
// nothing is redrawn; it is drawn again, once, when the map comes to rest.
import { geoMercator } from "d3-geo";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useApp, useT } from "../app/state";
import type { VerdictJson } from "../verdict/types";
import type { VerdictView } from "../verdict/view";
import { Basemap } from "./basemap";
import { MAX_ZOOM, MIN_ZOOM, framed, inTheClear, openingView, type Rect } from "./frame";
import { LegendIcon, MinusIcon, PlusIcon, RecentreIcon } from "./icons";
import { between, project, sameView, unproject, zoomOf, zoomed, type Size, type View } from "./mercator";
import type { MapModel } from "./model";
import { Overlay } from "./Overlay";
import { mapNote, mapText, type Basemap as BasemapKind, type Fallback } from "./text";
import type { TileMapApi } from "./TileMap";
import { NoTileMap, readyKit, tileKit, type TileKit } from "./warm";

/** The outline map's outlines are coarse: past this zoom they are only straight lines. */
const OUTLINE_MAX_ZOOM = 9;
/** How much map must show above the sheet for the Legend button (one row of buttons), for the map's credit under it,
 *  and for the second row (Recentre, zoom). With less, they are left out rather than laid over one another. */
const ROOM_FOR_TOP = 84;
const ROOM_FOR_CREDIT = 118;
const ROOM_FOR_BOTTOM = 144;
/** A detailed map that has not drawn its first picture after this long is not coming (a network that neither answers
 *  nor fails): the outline map stays, and a note says so. */
const DRAW_WITHIN_MS = 20_000;
/** What stands on the map besides the Legend button: 2, the credit and the zoom buttons; 1, the credit; 0, neither. */
type Extras = 0 | 1 | 2;

interface Props {
  json: VerdictJson;
  view: VerdictView;
  model: MapModel;
  /** How much of the stage's bottom the sheet covers, in px. */
  covered: number;
  /** Nothing of the map shows (the sheet or the legend is over it): nothing in it takes focus. */
  hidden: boolean;
  legendOpen: boolean;
  onLegend: () => void;
  /** Which basemap is drawn, for the legend. */
  onBasemap: (basemap: BasemapKind) => void;
}

const sameRects = (a: Rect[], b: Rect[]) => a.length === b.length && a.every((r, i) => r.x === b[i].x && r.y === b[i].y && r.width === b[i].width && r.height === b[i].height);

export function MapStage({ json, view, model, covered: coveredNow, hidden, legendOpen, onLegend, onBasemap }: Props) {
  const { lang } = useApp();
  // While nothing of the map shows (the sheet or the legend is over it), it is left as it was: no new frame, and no
  // tiles fetched for a view nobody sees. The detailed map is not started before the map has shown once.
  const [covered, setCovered] = useState(coveredNow);
  if (!hidden && covered !== coveredNow) setCovered(coveredNow);
  const [seen, setSeen] = useState(!hidden);
  if (!hidden && !seen) setSeen(true);
  const t = useT();
  const stage = useRef<HTMLElement>(null);
  const carried = useRef<HTMLDivElement>(null);
  const tileMap = useRef<TileMapApi>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [kit, setKit] = useState<TileKit | null>(() => (model.detail === "reduced" ? null : readyKit()));
  const [fallback, setFallback] = useState<Fallback | null>(model.detail === "reduced" ? "reduced" : null);
  const [drawn, setDrawn] = useState(false); // the detailed map has drawn its first picture
  const [camera, setCamera] = useState<View | null>(null);
  const [moved, setMoved] = useState(false); // the person has moved the map: it no longer follows the opening frame

  // The stage's size, as it is laid out.
  useLayoutEffect(() => {
    const el = stage.current!;
    performance.mark("map:stage"); // the map's place is on the screen (e2e/perf.spec.ts times the rest from the verdict)
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setSize((was) => (was && was.width === width && was.height === height ? was : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The detailed map, when this device can draw it and the engine sent what it shows.
  useEffect(() => {
    if (model.detail === "reduced") {
      setFallback("reduced");
      return;
    }
    let showing = true;
    setFallback(null);
    tileKit()
      .then((ready) => showing && setKit(ready))
      .catch((error: unknown) => showing && setFallback(error instanceof NoTileMap ? error.why : "tiles"));
    return () => {
      showing = false;
    };
  }, [model.detail]);
  const basemap: BasemapKind = drawn && !fallback ? "tiles" : "outline";
  useEffect(() => onBasemap(basemap), [basemap, onBasemap]);

  const free = size ? size.height - covered : 0;
  const text = useMemo(() => mapText(json, view, model, lang, basemap), [json, view, model, lang, basemap]);
  const note = mapNote(lang, fallback);

  // What stands on the map with the Legend button. The marks come first: where the credit or the zoom buttons would
  // leave no way to show the person and the fire whole, they give way (the credit is in the legend; the map still
  // zooms with two fingers or the keyboard). Each new layout starts with everything.
  const layout = `${size?.width}x${size?.height}/${covered}/${lang}/${note ?? ""}/${basemap}`;
  const [fit, setFit] = useState<{ layout: string; extras: Extras }>({ layout, extras: 2 });
  const fitted: Extras = fit.layout === layout ? fit.extras : 2;
  const extras: Extras = moved ? 2 : fitted; // once the person has moved the map, the frame is theirs
  const showCredit = basemap === "tiles" && !moved && extras >= 1 && free >= ROOM_FOR_CREDIT;
  const showBottom = free >= ROOM_FOR_BOTTOM;
  const hasCamera = camera !== null; // the foot of the map (credit, zoom) is drawn once there is a view

  // Where the map's buttons are, so the frame and the labels keep clear of them.
  const [measured, setMeasured] = useState<{ layout: string; extras: Extras; moved: boolean; rects: Rect[] }>({ layout: "", extras: 2, moved: false, rects: [] });
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el || !size) return;
    const origin = el.getBoundingClientRect();
    const rects = [...el.querySelectorAll("[data-avoid]")].map((button) => {
      const box = button.getBoundingClientRect();
      return { x: Math.round(box.x - origin.x), y: Math.round(box.y - origin.y), width: Math.round(box.width), height: Math.round(box.height) };
    });
    setMeasured((was) => (was.layout === layout && was.extras === extras && was.moved === moved && sameRects(was.rects, rects) ? was : { layout, extras, moved, rects }));
  }, [size, layout, extras, moved, showCredit, showBottom, hasCamera]);
  const buttons = measured.rects;

  // The frame the map opens on, and comes back to: the person and the fire, whole above the sheet.
  const frame = useMemo(() => framed(model), [model]);
  const home = useMemo(() => (size ? openingView(frame.fit, frame.marks, size, covered, buttons) : null), [frame, size, covered, buttons]);
  useLayoutEffect(() => {
    if (!home || !size || moved || hidden || measured.layout !== layout || measured.extras !== fitted || measured.moved || fitted === 0) return;
    if (frame.marks.every((mark) => inTheClear(home, mark, size, covered, buttons))) return;
    // A button gives way only where that lets the marks show: on a stage that could not hold them bare, it stays.
    const bare = openingView(frame.fit, frame.marks, size, covered, []);
    if (frame.marks.every((mark) => inTheClear(bare, mark, size, covered, []))) setFit({ layout, extras: (fitted - 1) as Extras });
  }, [home, size, moved, hidden, measured, layout, fitted, frame, covered, buttons]);

  const applied = useRef<View | null>(null);
  useLayoutEffect(() => {
    if (!home || !size || moved || hidden || applied.current === home) return;
    applied.current = home;
    setCamera((was) => (was && sameView(was, home) ? was : home));
    tileMap.current?.show(home, size);
  }, [home, size, moved, hidden]);

  // While the map moves, the overlay is carried by a transform; when it rests, it is drawn again through the new view.
  const shown = useRef<View | null>(null); // the view the overlay is drawn through
  const live = useRef<View | null>(null); // where the detailed map is right now
  const carry = useCallback(() => {
    if (!carried.current || !shown.current || !live.current) return;
    const move = between(shown.current, live.current);
    const still = sameView(shown.current, live.current);
    carried.current.style.transform = still ? "" : `matrix(${move.scale},0,0,${move.scale},${move.x},${move.y})`;
    // A layer of its own only while it is carried: at rest the overlay costs no picture memory of its own.
    carried.current.style.willChange = still ? "" : "transform";
  }, []);
  const onView = useCallback(
    (now: View, settled: boolean, byHand: boolean) => {
      live.current = now;
      if (!settled) return carry();
      setCamera((was) => (was && sameView(was, now) ? was : now));
      if (byHand) setMoved(true);
    },
    [carry],
  );
  useLayoutEffect(() => {
    shown.current = camera;
    if (!drawn) live.current = camera;
    carry();
  }, [camera, drawn, carry]);

  const latest = useRef({ camera, size });
  latest.current = { camera, size };
  const onReady = useCallback(() => {
    performance.mark("map:shown");
    setDrawn(true);
    // The outline map may have been zoomed while the detailed one loaded: it opens where the person left it.
    const { camera: now, size: frameSize } = latest.current;
    if (now && frameSize) tileMap.current?.show(now, frameSize);
  }, []);
  const onPause = useCallback(() => setDrawn(false), []); // the outline map shows until the detailed one is drawn again
  const onFail = useCallback((why: "tiles" | "webgl") => {
    setFallback(why);
    setKit(null);
    setDrawn(false);
  }, []);

  const waiting = seen && !drawn && !fallback;
  useEffect(() => {
    if (!waiting) return;
    const late = window.setTimeout(() => onFail("tiles"), DRAW_WITHIN_MS);
    return () => window.clearTimeout(late);
  }, [waiting, onFail]);

  const zoom = (steps: 1 | -1) => {
    if (!camera || !size) return;
    setMoved(true);
    // About the person while their dot is on the map: closer to their place, or farther from it, with no drag needed
    // to keep it in view. Once they have moved the map off it, about the middle of what shows.
    const you = project(camera, model.you);
    const onTheMap = you[0] >= 0 && you[0] <= size.width && you[1] >= 0 && you[1] <= free;
    const about: [number, number] = onTheMap ? you : [size.width / 2, Math.max(1, free) / 2];
    if (basemap === "tiles") return tileMap.current?.zoomBy(steps, unproject(camera, about));
    const to = Math.max(MIN_ZOOM, Math.min(OUTLINE_MAX_ZOOM, zoomOf(camera) + steps));
    setCamera(zoomed(camera, 2 ** (to - zoomOf(camera)), about));
  };
  const recentre = () => {
    applied.current = null;
    setMoved(false);
  };
  const closest = basemap === "tiles" ? MAX_ZOOM : OUTLINE_MAX_ZOOM;
  const summary = text.summary.join(" ");
  const outline = useMemo(
    () =>
      size && camera && basemap === "outline" ? (
        <svg className="map-outline" viewBox={`0 0 ${size.width} ${size.height}`} width={size.width} height={size.height} role="img" aria-label={summary}>
          <Basemap projection={geoMercator().scale(camera.scale / (2 * Math.PI)).translate([camera.x + camera.scale / 2, camera.y + camera.scale / 2])} width={size.width} height={size.height} lang={lang} labels="verdict" avoid={[]} labelClass="map-place" />
        </svg>
      ) : null,
    [size, camera, basemap, lang, summary],
  );

  return (
    <section ref={stage} className="map-stage" aria-label={t("map.region")} data-basemap={basemap} data-fallback={fallback ?? undefined} data-moved={moved || undefined} inert={hidden}>
      {outline}
      {/* Under the outline map until it has drawn its first picture (styles.css): it is never seen half-drawn. */}
      {kit && size && camera && !fallback && seen && (
        <kit.TileMap lib={kit.lib} view={camera} size={size} lang={lang} label={t("map.canvas")} describedBy="map-summary" onView={onView} onReady={onReady} onPause={onPause} onFail={onFail} api={tileMap} />
      )}
      <div ref={carried} className="map-carried">
        {size && camera && <Overlay model={model} view={camera} size={size} labels={text.labels} covered={covered} buttons={buttons} />}
      </div>
      {/* What the map shows, in words: the detailed map's canvas points here; the outline map carries it as its name. */}
      <p id="map-summary" hidden>{summary}</p>
      {free >= ROOM_FOR_TOP && (
        <div className="map-head">
          {note && <p className="map-note" data-avoid role="status">{note}</p>}
          <button type="button" data-avoid className="map-button press" onClick={onLegend} aria-haspopup="dialog" aria-expanded={legendOpen}>
            <LegendIcon size={24} />
            {t("map.legend")}
          </button>
        </div>
      )}
      {(showCredit || showBottom) && camera && (
        <div className="map-bottom" style={{ bottom: `${covered + 12}px` }}>
          {/* The map's credit, in a corner of the map. Once the map has been moved, Recentre takes its corner (the
              credit is then in the legend, one tap away at the map's other corner). */}
          {moved && showBottom ? (
            <button type="button" data-avoid className="map-button press" onClick={recentre}>
              <RecentreIcon size={24} />
              {t("map.recentre")}
            </button>
          ) : showCredit ? (
            <a className="map-credit" href={t("map.credit.url")} target="_blank" rel="noopener noreferrer">
              <span data-avoid>{t("map.credit")}</span>
            </a>
          ) : (
            <span />
          )}
          {showBottom && extras === 2 && (
            <div data-avoid className="map-zoom">
              <button type="button" className="map-button press" aria-label={t("map.zoomOut")} disabled={zoomOf(camera) <= MIN_ZOOM + 0.01} onClick={() => zoom(-1)}>
                <MinusIcon size={26} />
              </button>
              <button type="button" className="map-button press" aria-label={t("map.zoomIn")} disabled={zoomOf(camera) >= closest - 0.01} onClick={() => zoom(1)}>
                <PlusIcon size={26} />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
