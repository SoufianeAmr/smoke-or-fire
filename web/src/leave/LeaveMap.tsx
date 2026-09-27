// Map on "If you’re told to leave" (replay): large markers for the fire and the two centres, and you when your
// location is known. Same basemap and label style as the verdict map. No route is drawn: "Get directions"
// hands the address to the phone's maps app.
import { geoMercator } from "d3-geo";
import type { CSSProperties } from "react";
import { useApp, useT } from "../app/state";
import type { StringKey } from "../i18n";
import { CoffeeIcon, HouseIcon } from "../components/icons";
import { centreOf, type CentreType, type EvacuationEvent, type LatLon } from "../data/evacuation";
import { Basemap, round } from "../map/basemap";
import { circleBox, placeLabel, type Box } from "../map/labels";
import { FLAME } from "../verdict/VerdictMap";

const W = 358;
const H = 240;
const R = 20; // marker radius (the verdict map's fire is 14)
const YOU_R = 12; // your dot, inside a halo of 2 × YOU_R (the verdict map's is 9 in 18)
const EDGE = 22; // how far from the frame an off-map arrow sits
// Room around the fitted points: for the markers and labels, and, when an arrow sits at the edge, for the arrow
// (EDGE + its 14 px length) plus a marker's radius, so the two never touch.
const INSET = { x: 56, top: 40, bottom: 36, arrow: 62 };
/** You are drawn on the map within this distance of the fire; farther, an arrow at the map's edge points your way. */
const ON_MAP_KM = 60;
const ARROW = "M-12 -10L14 0L-12 10L-5 0Z"; // notched, so the tip reads at any angle
const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export type MarkerKind = "fire" | CentreType;

const COLOURS: Record<MarkerKind, { fill: string; ring: string; icon: string }> = {
  fire: { fill: "#1A1D21", ring: "#FFFFFF", icon: "#FFFFFF" },
  reception: { fill: "#1B2A4A", ring: "#FFFFFF", icon: "#FFFFFF" },
  comfort: { fill: "#FFFFFF", ring: "#1B2A4A", icon: "#1B2A4A" },
};

/** A marker's disc and icon, centred on (0, 0). */
function Glyph({ kind, r }: { kind: MarkerKind; r: number }) {
  const c = COLOURS[kind];
  const s = Math.round(r * 1.15);
  return (
    <>
      <circle r={r} style={{ fill: c.fill, stroke: c.ring, strokeWidth: kind === "comfort" ? "3" : "2.5" }} />
      {kind === "fire" ? (
        <svg x={-s / 2} y={-s / 2} width={s} height={s} viewBox="0 0 24 24">
          <path d={FLAME} style={{ fill: c.icon }} />
        </svg>
      ) : (
        <g transform={`translate(${-s / 2} ${-s / 2})`} style={{ color: c.icon }}>
          {kind === "reception" ? <HouseIcon size={s} /> : <CoffeeIcon size={s} />}
        </g>
      )}
    </>
  );
}

/** The map marker on its own, e.g. beside a centre's title, so the card and the map match. */
export function MarkerBadge({ kind, size }: { kind: MarkerKind; size: number }) {
  const half = size / 2;
  return (
    <svg width={size} height={size} viewBox={`${-half} ${-half} ${size} ${size}`} aria-hidden="true" style={{ flexShrink: "0", display: "block" }}>
      <Glyph kind={kind} r={half - 2} />
    </svg>
  );
}

const km = (a: LatLon, b: LatLon) => Math.hypot((a.lat - b.lat) * 111.2, (a.lon - b.lon) * 111.2 * Math.cos((a.lat * Math.PI) / 180));

/** The 16-point compass direction from a to b, e.g. "NE". */
function compass(a: LatLon, b: LatLon): string {
  const bearing = (Math.atan2((b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180), b.lat - a.lat) * 180) / Math.PI;
  return POINTS[Math.round((bearing + 360) / 22.5) % 16];
}

function ArrowSwatch({ angle }: { angle: number }) {
  return (
    <svg width="28" height="28" viewBox="-14 -14 28 28" aria-hidden="true" style={{ flexShrink: "0" }}>
      <path d={ARROW} transform={`rotate(${Math.round(angle)})`} style={ARROW_STYLE} />
    </svg>
  );
}

export function LeaveMap({ event, user }: { event: EvacuationEvent; user: (LatLon & { name?: string }) | null }) {
  const { lang } = useApp();
  const t = useT();
  const reception = centreOf(event, "reception");
  const comfort = centreOf(event, "comfort");
  const markers = [
    { kind: "fire" as const, at: event.fire, label: t("fire.title.named", { name: event.fire.name }) },
    ...[reception, comfort].flatMap((c) => (c ? [{ kind: c.type, at: c as LatLon, label: c.town }] : [])),
  ];
  const onMap = user !== null && km(user, event.fire) <= ON_MAP_KM;

  // Fit the markers (and you, when near) with room for the markers and their labels.
  const fitted = [...markers.map((m) => m.at), ...(onMap && user ? [user] : [])];
  const arrow = user !== null && !onMap;
  const inset = arrow ? { x: INSET.arrow, top: INSET.arrow, bottom: INSET.arrow } : INSET;
  const projection = geoMercator().fitExtent([[inset.x, inset.top], [W - inset.x, H - inset.bottom]], { type: "MultiPoint", coordinates: fitted.map((p) => [p.lon, p.lat]) });
  const xy = (p: LatLon) => projection([p.lon, p.lat]) as [number, number];

  const frame = { width: W, height: H };
  const taken: Box[] = markers.map((m) => { const [x, y] = xy(m.at); return circleBox(x, y, R + 2); });
  const around = (gap: number): ((w: number) => [number, number])[] => [
    () => [gap, 6], (w) => [-gap - w, 6], (w) => [-w / 2, gap + 16], (w) => [-w / 2, -gap - 6], () => [gap - 4, 24], (w) => [4 - gap - w, 24], () => [gap - 4, -12], (w) => [4 - gap - w, -12],
  ];

  // You: a dot on the map, or an arrow at its edge pointing your way.
  let you: { x: number; y: number; angle: number | null } | null = null;
  if (user) {
    const [ux, uy] = xy(user);
    if (onMap) {
      you = { x: ux, y: uy, angle: null };
      taken.push(circleBox(ux, uy, 2 * YOU_R));
    } else {
      const [cx, cy] = [W / 2, H / 2];
      const [dx, dy] = [ux - cx, uy - cy];
      const tx = dx > 0 ? (W - EDGE - cx) / dx : dx < 0 ? (EDGE - cx) / dx : Infinity;
      const ty = dy > 0 ? (H - EDGE - cy) / dy : dy < 0 ? (EDGE - cy) / dy : Infinity;
      const s = Math.min(tx, ty);
      you = { x: cx + s * dx, y: cy + s * dy, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
      taken.push(circleBox(you.x, you.y, 16));
    }
  }

  const labels = markers.map((m) => {
    const at = placeLabel(m.label, xy(m.at), around(R + 6), taken, frame);
    return at && { ...at, text: m.label };
  });
  const youText = t("leave.map.you");
  const youLabel = you && placeLabel(youText, [you.x, you.y], around(you.angle === null ? 2 * YOU_R + 2 : 18), taken, frame); // clear of the halo or arrow

  const names = { fire: event.fire.name, reception: reception?.town ?? "", comfort: comfort?.town ?? "" };
  const aria = !user
    ? t("leave.map.aria", names)
    : onMap
      ? t("leave.map.aria.you", names)
      : t("leave.map.aria.youOff", { ...names, direction: t(`compass.at.${compass(event.fire, user)}` as StringKey) });
  const legendYou = user?.name ? t("legend.you", { town: user.name }) : youText;

  return (
    <section style={{ background: "#FFFFFF", borderRadius: "18px", overflow: "hidden", boxShadow: "0 1px 2px rgba(26, 29, 33, 0.06), 0 8px 24px rgba(26, 29, 33, 0.07)" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={aria} style={{ display: "block" }}>
        <Basemap projection={projection} width={W} height={H} lang={lang} labels="verdict" avoid={taken} />
        {markers.map((m) => {
          const [x, y] = xy(m.at);
          return (
            <g key={m.kind} className={`marker marker-${m.kind}`} transform={`translate(${round(x)} ${round(y)})`}>
              <Glyph kind={m.kind} r={R} />
            </g>
          );
        })}
        {you && you.angle === null && (
          <g className="marker marker-you">
            <circle cx={round(you.x)} cy={round(you.y)} r={2 * YOU_R} style={{ fill: "#1B2A4A", opacity: "0.16" }} />
            <circle cx={round(you.x)} cy={round(you.y)} r={YOU_R} style={{ fill: "#1B2A4A", stroke: "#FFFFFF", strokeWidth: "3" }} />
          </g>
        )}
        {you && you.angle !== null && (
          <path className="marker marker-you" d={ARROW} transform={`translate(${round(you.x)} ${round(you.y)}) rotate(${Math.round(you.angle)})`} style={ARROW_STYLE} />
        )}
        {labels.map((l) => l && <text key={l.text} className="lbl" x={Math.round(l.x)} y={Math.round(l.y)}>{l.text}</text>)}
        {youLabel && <text className="lbl" x={Math.round(youLabel.x)} y={Math.round(youLabel.y)}>{youText}</text>}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 18px", padding: "14px 20px 16px", fontSize: "18px", lineHeight: "1.3" }}>
        <span style={LEGEND_ITEM}><MarkerBadge kind="fire" size={28} />{t("legend.fire")}</span>
        <span style={LEGEND_ITEM}><MarkerBadge kind="reception" size={28} />{t("leave.legend.reception")}</span>
        <span style={LEGEND_ITEM}><MarkerBadge kind="comfort" size={28} />{t("leave.legend.comfort")}</span>
        {user && (
          <span style={LEGEND_ITEM}>
            {you?.angle != null ? (
              <ArrowSwatch angle={you.angle} />
            ) : (
              <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" style={{ flexShrink: "0" }}>
                <circle cx="14" cy="14" r="9" style={{ fill: "#1B2A4A", stroke: "#FFFFFF", strokeWidth: "3" }} />
              </svg>
            )}
            {legendYou}
          </span>
        )}
      </div>
    </section>
  );
}

const LEGEND_ITEM: CSSProperties = { display: "flex", alignItems: "center", gap: "8px" };
const ARROW_STYLE: CSSProperties = { fill: "#1B2A4A", stroke: "#FFFFFF", strokeWidth: "2", strokeLinejoin: "round" };
