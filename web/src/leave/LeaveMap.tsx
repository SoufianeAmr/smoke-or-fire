// Map on "If you’re told to leave", near an active event: large markers for the fire, the two centres and you. Same
// basemap and label style as the verdict map. No route is drawn: the screen says to follow the route officials give.
import { geoMercator } from "d3-geo";
import type { CSSProperties } from "react";
import { useApp, useT } from "../app/state";
import { CoffeeIcon, HouseIcon } from "../components/icons";
import { centreOf, type CentreType, type EvacuationEvent, type LatLon } from "../data/evacuation";
import { Basemap, round } from "../map/basemap";
import { circleBox, placeLabel, type Box } from "../map/labels";
import { FLAME } from "../verdict/marks";

const W = 358;
const H = 240;
const R = 20; // marker radius (the verdict map's fire is 14)
const YOU_R = 12; // your dot, inside a halo of 2 × YOU_R (the verdict map's is 9 in 18)
const INSET = { x: 56, top: 40, bottom: 36 }; // room around the fitted points for the markers and their labels

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

export function LeaveMap({ event, user }: { event: EvacuationEvent; user: LatLon & { name?: string } }) {
  const { lang } = useApp();
  const t = useT();
  const reception = centreOf(event, "reception");
  const comfort = centreOf(event, "comfort");
  const markers = [
    { kind: "fire" as const, at: event.fire, label: t("fire.title.named", { name: event.fire.name }) },
    ...[reception, comfort].flatMap((c) => (c ? [{ kind: c.type, at: c as LatLon, label: c.town }] : [])),
  ];
  // Fit the markers and you, with room for the markers and their labels.
  const fitted = [...markers.map((m) => m.at), user];
  const projection = geoMercator().fitExtent([[INSET.x, INSET.top], [W - INSET.x, H - INSET.bottom]], { type: "MultiPoint", coordinates: fitted.map((p) => [p.lon, p.lat]) });
  const xy = (p: LatLon) => projection([p.lon, p.lat]) as [number, number];

  const frame = { width: W, height: H };
  const taken: Box[] = markers.map((m) => { const [x, y] = xy(m.at); return circleBox(x, y, R + 2); });
  const around = (gap: number): ((w: number) => [number, number])[] => [
    () => [gap, 6], (w) => [-gap - w, 6], (w) => [-w / 2, gap + 16], (w) => [-w / 2, -gap - 6], () => [gap - 4, 24], (w) => [4 - gap - w, 24], () => [gap - 4, -12], (w) => [4 - gap - w, -12],
  ];

  // You. Next to a marker (West Dalhousie is 3 km from the fire), the dot moves out to the marker's edge on your
  // side, so neither hides the other; the shift is about a marker's width.
  let you = { x: xy(user)[0], y: xy(user)[1] };
  for (const m of markers) {
    const [mx, my] = xy(m.at);
    const [dx, dy] = [you.x - mx, you.y - my];
    const d = Math.hypot(dx, dy);
    const clear = R + YOU_R + 2;
    if (d < clear) you = d > 0.5 ? { x: mx + (dx / d) * clear, y: my + (dy / d) * clear } : { x: mx, y: my - clear };
  }
  taken.push(circleBox(you.x, you.y, 2 * YOU_R));

  const labels = markers.map((m) => {
    const at = placeLabel(m.label, xy(m.at), around(R + 6), taken, frame);
    return at && { ...at, text: m.label };
  });
  const youText = t("leave.map.you");
  const youLabel = placeLabel(youText, [you.x, you.y], around(2 * YOU_R + 2), taken, frame); // clear of the halo

  const aria = t("leave.map.aria.you", { fire: event.fire.name, reception: reception?.town ?? "", comfort: comfort?.town ?? "" });
  const legendYou = user.name ? t("legend.you", { town: user.name }) : youText;

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
        <g className="marker marker-you">
          <circle cx={round(you.x)} cy={round(you.y)} r={2 * YOU_R} style={{ fill: "#1B2A4A", opacity: "0.16" }} />
          <circle cx={round(you.x)} cy={round(you.y)} r={YOU_R} style={{ fill: "#1B2A4A", stroke: "#FFFFFF", strokeWidth: "3" }} />
        </g>
        {labels.map((l) => l && <text key={l.text} className="lbl" x={Math.round(l.x)} y={Math.round(l.y)}>{l.text}</text>)}
        {youLabel && <text className="lbl" x={Math.round(youLabel.x)} y={Math.round(youLabel.y)}>{youText}</text>}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 18px", padding: "14px 20px 16px", fontSize: "18px", lineHeight: "1.3" }}>
        <span style={LEGEND_ITEM}><MarkerBadge kind="fire" size={28} />{t("legend.fire")}</span>
        <span style={LEGEND_ITEM}><MarkerBadge kind="reception" size={28} />{t("leave.legend.reception")}</span>
        <span style={LEGEND_ITEM}><MarkerBadge kind="comfort" size={28} />{t("leave.legend.comfort")}</span>
        <span style={LEGEND_ITEM}>
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" style={{ flexShrink: "0" }}>
            <circle cx="14" cy="14" r="9" style={{ fill: "#1B2A4A", stroke: "#FFFFFF", strokeWidth: "3" }} />
          </svg>
          {legendYou}
        </span>
      </div>
    </section>
  );
}

const LEGEND_ITEM: CSSProperties = { display: "flex", alignItems: "center", gap: "8px" };
