// Map card of screens 7a–7d: map, legend and fire row (design/screens/07*.html).
import type { CSSProperties, ReactNode } from "react";
import { useApp } from "../app/state";
import { FlameIcon, SatelliteIcon } from "../components/icons";
import { Basemap, frameProjection, round } from "../map/basemap";
import { circleBox, placeLabel, textBox, type Box } from "../map/labels";
import type { Height, PathPoint, VerdictJson } from "./types";
import type { VerdictView } from "./view";

const W = 358;
const H = 220;
const ARROW = "M-5 -4.5L5 0L-5 4.5Z";
const FAN_OPACITY = "0.5"; // 35% was too faint at 390 × 844, on the map and in the legend
const FLAME = "M12 21.5c3.9 0 6.5-2.6 6.5-6.3 0-3-1.8-5.3-3.4-7-.4 1.6-1.2 2.6-2.3 3.2.4-3.2-1-6.3-3.8-8.9.2 3.4-1.5 5.4-3 7.3-1.2 1.6-2 3.2-2 5.4 0 3.7 2.6 6.3 6.5 6.3z";

type XY = [number, number];
const pts = (list: XY[]) => list.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
const inside = ([x, y]: XY) => x >= 0 && x <= W && y >= 0 && y <= H;

/** An arrow at each listed hourly point of the path, pointing toward its newer neighbour (the way the air moved). */
function arrows(path: XY[], hours: number[]): ReactNode[] {
  return hours.map((i) => {
    const [p, toward] = [path[i], path[i - 1]];
    const angle = (Math.atan2(toward[1] - p[1], toward[0] - p[0]) * 180) / Math.PI;
    return <path key={i} className="arr" d={ARROW} transform={`translate(${round(p[0])} ${round(p[1])}) rotate(${Math.round(angle)})`} />;
  });
}

export function VerdictMap({ json, view }: { json: VerdictJson; view: VerdictView }) {
  const { lang } = useApp();
  const user = json.location;
  const fire = view.fire;
  const approach = json.closestApproach;
  const projection = frameProjection(user, W, H, fire ? [fire] : []);
  const xy = (p: { lat: number; lon: number }): XY => projection([p.lon, p.lat]) as XY;
  const project = (points: PathPoint[]) => points.map(xy); // newest (the user) first

  const chosen = json.heights.chosen;
  const path = project(json.path.points);
  const others = (Object.keys(json.heights.paths) as Height[]).filter((h) => h !== chosen).map((h) => project(json.heights.paths[h].points));
  // The fire's smoke traced forward, under the air paths. Each path is cut one point after it last leaves
  // the map, so every path draws its visible part outward from the fire over the same 1.5 s.
  const fan = (json.forward && fire ? json.forward.paths : []).flatMap((p) => {
    const line = p.points.map(xy);
    let last = 0;
    line.forEach((q, i) => { if (inside(q)) last = i; });
    const shown = line.slice(0, last + 2);
    const length = shown.slice(1).reduce((sum, q, i) => sum + Math.hypot(q[0] - shown[i][0], q[1] - shown[i][1]), 0);
    return length > 0 ? [{ points: shown, length }] : [];
  });
  const [ux, uy] = xy(user);
  const pxPerKm = Math.abs(xy({ lat: user.lat, lon: user.lon })[1] - xy({ lat: user.lat + 1, lon: user.lon })[1]) / 111.2;

  // 7a: the path is split at the closest approach; the part older than it is faded.
  let flow = path;
  let faded: XY[] | null = null;
  let lastArrow = path.length - 2; // arrows on the hourly points between the user and the path's end
  if (view.variant === "7a" && approach) {
    const exact = (Date.parse(json.time) - Date.parse(approach.time)) / 3600000;
    const cut = json.path.points.findIndex((p) => p.hoursAgo > exact);
    if (cut > 0) {
      const at = xy(approach);
      flow = [...path.slice(0, cut), at];
      faded = [at, ...path.slice(cut)];
      lastArrow = cut - 1;
    }
  }
  const approachXY = view.variant === "7c" && approach ? xy(approach) : null;
  const arrowHours = Array.from({ length: Math.max(0, lastArrow) }, (_, k) => k + 1).filter(
    (i) => !(approachXY && Math.hypot(path[i][0] - approachXY[0], path[i][1] - approachXY[1]) < 10),
  );

  // Labels: the screens' positions first (e.g. fire name below-right of the fire, "8 h ago" to its
  // left), then other spots around the marker, skipping any that would cover a marker or label.
  const frame = { width: W, height: H };
  const fireXY = fire ? xy(fire) : null;
  const you = { x: ux + 16, y: uy + 5 };
  const taken: Box[] = [circleBox(ux, uy, 18), textBox(view.map.you, you.x, you.y)];
  if (fireXY) taken.push(circleBox(fireXY[0], fireXY[1], 15));
  if (approachXY) taken.push(circleBox(approachXY[0], approachXY[1], 7));
  const around = (gap: number): ((w: number) => [number, number])[] => [
    () => [gap, 20], (w) => [-gap - w, 20], () => [gap, -8], (w) => [-gap - w, -8], (w) => [-w / 2, 36], (w) => [-w / 2, -24],
  ];
  const place = (text: string | null, anchor: [number, number] | null, candidates: ((w: number) => [number, number])[]) =>
    text && anchor ? (() => { const at = placeLabel(text, anchor, candidates, taken, frame); return at && { ...at, text }; })() : null;

  const fireLabel = place(view.map.fireLabel, fireXY, around(19));
  const hoursLabel = place(view.map.approachLabel, fireXY, [(w) => [-19 - w, -6], () => [19, -6], ...around(19)]);
  const kmLabel = place(view.map.approachKm, approachXY, [() => [38, 2], (w) => [-12 - w, 6], () => [12, -8], (w) => [-12 - w, -8], ...around(12)]);

  // Edge label (7b, 7c, 7d): the oldest point of the path still inside the map.
  let edge: { x: number; y: number; text: string } | null = null;
  if (view.variant !== "7a") {
    let last = 0;
    path.forEach((p, i) => { if (inside(p)) last = i; });
    if (last > 0) {
      const point = json.path.points[last];
      const [px, py] = path[last];
      const toward = py < H / 2 ? 35 : -18; // below a point near the top, above one near the bottom
      edge = place(view.map.edgeLabel(point.hoursAgo, point.area), [px, py], [
        (w) => [Math.max(6 - px, Math.min(4, W - 6 - w - px)), toward], (w) => [-w - 10, toward], () => [10, toward], ...around(12),
      ]);
    }
  }

  return (
    <section aria-labelledby="fire-h" style={{ background: "#FFFFFF", borderRadius: "18px", overflow: "hidden", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={view.map.aria} style={{ display: "block" }}>
        <Basemap projection={projection} width={W} height={H} lang={lang} labels="verdict" avoid={taken} />
        {(view.variant === "7b" || view.variant === "7d") && (
          <polyline className="corridor" points={pts([...path].reverse())} style={{ strokeWidth: String(round(2 * json.rules.searchKm * pxPerKm)) }} />
        )}
        {fan.length > 0 && (
          <g style={{ opacity: FAN_OPACITY }}>
            {fan.map((line, i) => (
              <polyline key={i} className="fan" points={pts(line.points)} style={{ "--len": `${Math.ceil(line.length) + 1}px` } as CSSProperties} />
            ))}
          </g>
        )}
        {others.map((other, i) => (
          <polyline key={i} className="trail" points={pts([...other].reverse())} style={{ opacity: "0.3", strokeWidth: "1.75" }} />
        ))}
        {approachXY && fireXY && <line className="near" x1={round(fireXY[0])} y1={round(fireXY[1])} x2={round(approachXY[0])} y2={round(approachXY[1])} />}
        {faded && <polyline className="trail" points={pts([...faded].reverse())} style={{ opacity: "0.35" }} />}
        <polyline className="trail flow" points={pts([...flow].reverse())} />
        {arrows(path, arrowHours)}
        {approachXY && <circle cx={round(approachXY[0])} cy={round(approachXY[1])} r="6" style={{ fill: "#FFFFFF", stroke: "#1A1D21", strokeWidth: "2.5" }} />}
        {edge && <text className="lbl" x={Math.round(edge.x)} y={Math.round(edge.y)}>{edge.text}</text>}
        {kmLabel && <text className="lbl" x={Math.round(kmLabel.x)} y={Math.round(kmLabel.y)}>{kmLabel.text}</text>}
        {fireXY && (
          <>
            <circle cx={round(fireXY[0])} cy={round(fireXY[1])} r="14" style={{ fill: "#1A1D21", stroke: "#FFFFFF", strokeWidth: "2.5" }} />
            <svg x={round(fireXY[0] - 10)} y={round(fireXY[1] - 10)} width="20" height="20" viewBox="0 0 24 24">
              <path d={FLAME} style={{ fill: "#FFFFFF" }} />
            </svg>
          </>
        )}
        {hoursLabel && <text className="lbl" x={Math.round(hoursLabel.x)} y={Math.round(hoursLabel.y)}>{hoursLabel.text}</text>}
        {fireLabel && <text className="lbl" x={Math.round(fireLabel.x)} y={Math.round(fireLabel.y)}>{fireLabel.text}</text>}
        <circle cx={round(ux)} cy={round(uy)} r="18" style={{ fill: "#1B2A4A", opacity: "0.14" }} />
        <circle cx={round(ux)} cy={round(uy)} r="9" style={{ fill: "#1B2A4A", stroke: "#FFFFFF", strokeWidth: "3" }} />
        <text className="lbl" x={Math.round(you.x)} y={Math.round(you.y)}>{view.map.you}</text>
      </svg>
      <Legend view={view} />
      <FireRow view={view} />
      {view.map.badge && (
        <p style={{ margin: "0", padding: "0 20px 16px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "4px 10px", borderRadius: "8px", background: "#F3EEE6", color: "#4F5561", fontSize: "16px", lineHeight: "1.35" }}>
            <SatelliteIcon size={18} />
            {view.map.badge}
          </span>
        </p>
      )}
      {view.fireRow.kind === "none" && view.fireRow.checked && (
        <p style={{ margin: "0", padding: "0 20px 16px", fontSize: "16px", lineHeight: "1.45", color: "#4F5561" }}>{view.fireRow.checked}</p>
      )}
    </section>
  );
}

const LEGEND_ITEM: CSSProperties = { display: "flex", alignItems: "center", gap: "8px" };

function Legend({ view }: { view: VerdictView }) {
  const l = view.map.legend;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", padding: "12px 20px 14px", fontSize: "16px" }}>
      <span style={LEGEND_ITEM}>
        <svg width="30" height="10" viewBox="0 0 30 10" aria-hidden="true">
          <line x1="2" y1="5" x2="28" y2="5" style={{ stroke: "#1B2A4A", strokeWidth: "3.5", strokeLinecap: "round", strokeDasharray: "9 7" }} />
        </svg>
        {l.path}
      </span>
      <span style={LEGEND_ITEM}>
        <svg width="30" height="10" viewBox="0 0 30 10" aria-hidden="true">
          <line x1="2" y1="5" x2="28" y2="5" style={{ stroke: "#1B2A4A", strokeWidth: "1.75", strokeLinecap: "round", strokeDasharray: "9 7", opacity: "0.3" }} />
        </svg>
        {l.otherHeights}
      </span>
      {l.forward && (
        <span style={LEGEND_ITEM}>
          <svg width="30" height="10" viewBox="0 0 30 10" aria-hidden="true">
            <line x1="2" y1="5" x2="28" y2="5" style={{ stroke: "#8A8F98", strokeWidth: "1.5", strokeLinecap: "round", opacity: FAN_OPACITY }} />
          </svg>
          {l.forward}
        </span>
      )}
      <span style={LEGEND_ITEM}>
        <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">
          <path d={ARROW} style={{ fill: "#1B2A4A" }} />
        </svg>
        {l.hour}
      </span>
      {l.corridor && (
        <span style={LEGEND_ITEM}>
          <svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true">
            <rect x="0" y="0" width="30" height="16" rx="8" style={{ fill: "#1B2A4A", fillOpacity: "0.1" }} />
          </svg>
          {l.corridor}
        </span>
      )}
      {l.closest && (
        <span style={LEGEND_ITEM}>
          <svg width="30" height="14" viewBox="0 0 30 14" aria-hidden="true">
            <line x1="2" y1="7" x2="20" y2="7" style={{ stroke: "#1A1D21", strokeWidth: "1.75", strokeDasharray: "3 4", strokeLinecap: "round" }} />
            <circle cx="24" cy="7" r="4.5" style={{ fill: "#FFFFFF", stroke: "#1A1D21", strokeWidth: "2" }} />
          </svg>
          {l.closest}
        </span>
      )}
      {l.fire && (
        <span style={LEGEND_ITEM}>
          <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden="true">
            <circle cx="11" cy="11" r="10" style={{ fill: "#1A1D21" }} />
            <svg x="4" y="4" width="14" height="14" viewBox="0 0 24 24">
              <path d={FLAME} style={{ fill: "#FFFFFF" }} />
            </svg>
          </svg>
          {l.fire}
        </span>
      )}
      <span style={LEGEND_ITEM}>
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="7.5" style={{ fill: "#1B2A4A", stroke: "#FFFFFF", strokeWidth: "2.5" }} />
        </svg>
        {l.you}
      </span>
    </div>
  );
}

function FireRow({ view }: { view: VerdictView }) {
  const row = view.fireRow;
  const secondary: CSSProperties = { fontSize: "16px", color: "#4F5561" };
  const title: CSSProperties = { fontSize: "22px", fontWeight: "700", lineHeight: "1.25" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 20px 18px", borderTop: "1px solid #EEE7DC" }}>
      <span style={{ flexShrink: "0", width: "48px", height: "48px", borderRadius: "50%", background: "#1A1D21", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <FlameIcon size={26} />
      </span>
      <span style={{ flexGrow: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
        {row.kind === "fire" ? (
          <>
            <span id="fire-h" style={title}>{row.title}</span>
            <span style={secondary}>{row.subtitle}</span>
          </>
        ) : (
          <>
            <span style={secondary}>{row.label}</span>
            <span id="fire-h" style={title}>{row.title}</span>
          </>
        )}
      </span>
      {row.kind !== "none" && (
        <span style={{ flexShrink: "0", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
          <span style={{ fontSize: "22px", fontWeight: "800", lineHeight: "1.25" }}>{row.km}</span>
          <span style={secondary}>{row.side}</span>
        </span>
      )}
    </div>
  );
}
