// The share image of surge mode: the card and the map, drawn on a canvas so it can be saved as a picture. 1200 × 675,
// in the app's own colours and type (never an official site's look): the card on the left, the map with the air's
// path on the right, and when to call 911 across the bottom, so the picture never travels without it.
import { geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import topo from "../data/maritimes.topo.json";
import { frameProjection } from "../map/basemap";
import { circleBox, placeLabel, textBox, type Box } from "../map/labels";
import { GLANCE } from "../verdict/glance";
import type { VerdictJson } from "../verdict/types";
import { FLAME } from "../verdict/marks";
import type { ShareImage } from "./board";

export const SHARE_WIDTH = 1200;
export const SHARE_HEIGHT = 675;

const BAND = 132; // the 911 sentence and the sources, across the bottom
const TOP = SHARE_HEIGHT - BAND;
const CARD = 520; // the card's width; the map takes the rest
const PAD = 44;
// The map is drawn in the verdict map's own units (358 wide, 16 px labels), then scaled to its place.
const MAP_UNITS = 358;
const MAP_SCALE = (SHARE_WIDTH - CARD) / MAP_UNITS;
const MAP_HEIGHT = TOP / MAP_SCALE;

const NAVY = "#1B2A4A";
const INK = "#1A1D21";
const FAMILY = "Inter, 'Helvetica Neue', Arial, sans-serif";
const font = (weight: number, px: number) => `${weight} ${px}px ${FAMILY}`;

const topology = topo as unknown as Topology<{ land: GeometryCollection }>;
const land = feature(topology, topology.objects.land);
const coast = mesh(topology, topology.objects.land, (a, b) => a === b);
const borders = mesh(topology, topology.objects.land, (a, b) => a !== b);
// Province labels, placed as on the verdict map (map/basemap.tsx).
const PROVINCES = [
  { en: "N.B.", fr: "N.-B.", lat: 45.637, lon: -66.516 },
  { en: "P.E.I.", fr: "Î.-P.-É.", lat: 46.31, lon: -63.333 },
  { en: "N.S.", fr: "N.-É.", lat: 44.838, lon: -63.831 },
];

type Ctx = CanvasRenderingContext2D;
type XY = [number, number];

/** The text on as many lines as it needs to fit `width`. A no-break space never breaks. */
function wrap(ctx: Ctx, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(" ")) {
    const last = lines[lines.length - 1];
    if (last !== undefined && ctx.measureText(`${last} ${word}`).width <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/** The largest size, from `max` down to `min`, at which the text fits `width` on `maxLines` lines or fewer. */
function fit(ctx: Ctx, text: string, weight: number, max: number, min: number, width: number, maxLines: number): { px: number; lines: string[] } {
  for (let px = max; ; px -= 2) {
    ctx.font = font(weight, px);
    const lines = wrap(ctx, text, width);
    if (px <= min || (lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= width))) return { px, lines };
  }
}

/** The card: the drifting-smoke shape (wind lines in a white circle), the line's parts one under the other, the arrow
 *  from the town toward the fire, then the town and the day. */
function drawCard(ctx: Ctx, image: ShareImage) {
  const look = GLANCE.drifting;
  ctx.fillStyle = look.background;
  ctx.fillRect(0, 0, CARD, TOP);

  const r = 60;
  const [cx, cy] = [PAD + r, PAD + r];
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(3, 3);
  ctx.translate(-12, -12);
  ctx.strokeStyle = look.mark;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const d of ["M3 8h10a3 3 0 1 0-3-3", "M3 12h15a3 3 0 1 1-3 3", "M3 16h7"]) ctx.stroke(new Path2D(d));
  ctx.restore();

  // The parts, smaller together until they leave room for the town and the day under them.
  const width = CARD - 2 * PAD;
  const top = PAD + 2 * r + 34;
  const room = TOP - 84 - top;
  ctx.fillStyle = look.ink;
  ctx.textBaseline = "alphabetic";
  let blocks: { px: number; lines: string[] }[] = [];
  let height = 0;
  for (let scale = 1; scale > 0.5; scale -= 0.08) {
    blocks = image.parts.map((part, i) => fit(ctx, part, 800, Math.round((i === 0 ? 62 : 50) * scale), 26, width - (i === image.parts.length - 1 && image.arrowDeg !== null ? 60 : 0), 2));
    height = blocks.reduce((sum, b) => sum + b.lines.length * b.px * 1.14 + 12, 0);
    if (height <= room) break;
  }
  // In the middle of the room between the shape and the town.
  let y = top + Math.max(0, (room - height) / 2);
  blocks.forEach((block, i) => {
    ctx.font = font(800, block.px);
    for (const line of block.lines) {
      y += block.px * 1.14;
      ctx.fillText(line, PAD, y - block.px * 0.22);
    }
    if (i === blocks.length - 1 && image.arrowDeg !== null) {
      // Beside the distance: up is north.
      const lastLine = block.lines[block.lines.length - 1];
      const size = block.px * 0.42;
      ctx.save();
      ctx.translate(PAD + ctx.measureText(lastLine).width + 16 + size, y - block.px * 0.22 - block.px * 0.34);
      ctx.rotate((image.arrowDeg * Math.PI) / 180);
      ctx.strokeStyle = look.ink;
      ctx.lineWidth = block.px * 0.13;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(0, size);
      ctx.lineTo(0, -size);
      ctx.moveTo(-size * 0.66, -size * 0.34);
      ctx.lineTo(0, -size);
      ctx.lineTo(size * 0.66, -size * 0.34);
      ctx.stroke();
      ctx.restore();
    }
    y += 12;
  });

  const where = fit(ctx, image.where, 600, 28, 20, width, 1);
  ctx.font = font(600, where.px);
  ctx.fillText(where.lines.join(" "), PAD, TOP - 36);
}

/** The map: land and borders, the fire's smoke traced forward, the air's path back from the town, the fire, the town. */
function drawMap(ctx: Ctx, json: VerdictJson, image: ShareImage) {
  const fire = json.closestApproach!.fire;
  const user = json.location;
  const [W, H] = [MAP_UNITS, MAP_HEIGHT];
  const projection = frameProjection(user, W, H, [fire], 44);
  const xy = (p: { lat: number; lon: number }) => projection([p.lon, p.lat]) as XY;
  const line = (points: XY[]) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  };

  ctx.save();
  ctx.translate(CARD, 0);
  ctx.beginPath();
  ctx.rect(0, 0, SHARE_WIDTH - CARD, TOP);
  ctx.clip();
  ctx.scale(MAP_SCALE, MAP_SCALE);

  ctx.fillStyle = "#D8E3EE";
  ctx.fillRect(0, 0, W, H);
  const path = geoPath(projection, ctx);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  path(land);
  ctx.fillStyle = "#EFE7DA";
  ctx.fill();
  ctx.beginPath();
  path(coast);
  ctx.strokeStyle = "#BCCADA";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  path(borders);
  ctx.strokeStyle = "#C4B6A0";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // The fire's smoke, traced forward: the grey fan under the air's path.
  ctx.strokeStyle = "#8A8F98";
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.5;
  for (const forward of json.forward?.paths ?? []) line(forward.points.map(xy));
  ctx.globalAlpha = 1;

  // The air's path back from the town, dashed; the part older than its closest approach to the fire is faded.
  const points = json.path.points;
  const approach = json.closestApproach!;
  const exact = (Date.parse(json.time) - Date.parse(approach.time)) / 3600000;
  const cut = points.findIndex((p) => p.hoursAgo > exact);
  const [newer, older] = cut > 0 ? [[...points.slice(0, cut).map(xy), xy(approach)], [xy(approach), ...points.slice(cut).map(xy)]] : [points.map(xy), []];
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 3.5;
  ctx.setLineDash([9, 7]);
  ctx.globalAlpha = 0.35;
  if (older.length > 1) line(older);
  ctx.globalAlpha = 1;
  line(newer);
  ctx.setLineDash([]);

  const [fx, fy] = xy(fire);
  const [ux, uy] = xy(user);
  ctx.fillStyle = INK;
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(fx, fy, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.translate(fx - 10, fy - 10);
  ctx.scale(20 / 24, 20 / 24);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill(new Path2D(FLAME));
  ctx.restore();

  ctx.fillStyle = NAVY;
  ctx.globalAlpha = 0.14;
  ctx.beginPath();
  ctx.arc(ux, uy, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(ux, uy, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Labels: the town and the fire by name, clear of both marks and of each other; province names where there is room.
  const label = (text: string, x: number, y: number, fill: string, weight: number, halo: boolean) => {
    ctx.font = font(weight, 16);
    if (halo) {
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 4;
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  };
  const frame = { width: W, height: H };
  const taken: Box[] = [circleBox(ux, uy, 18), circleBox(fx, fy, 15)];
  const around = (gap: number): ((w: number) => [number, number])[] => [() => [gap, 6], (w) => [-gap - w, 6], (w) => [-w / 2, gap + 16], (w) => [-w / 2, -gap - 4]];
  const town = placeLabel(image.townLabel, [ux, uy], around(22), taken, frame);
  const fireName = placeLabel(image.fireLabel, [fx, fy], around(19), taken, frame);
  for (const p of PROVINCES) {
    const [x, y] = xy(p);
    const text = p[image.lang];
    const box = textBox(text, x, y);
    if (x < 4 || box.x1 > W - 4 || box.y0 < 4 || y > H - 6 || taken.some((t) => box.x0 < t.x1 && t.x0 < box.x1 && box.y0 < t.y1 && t.y0 < box.y1)) continue;
    label(text, x, y, "#5A5347", 600, false);
  }
  if (fireName) label(image.fireLabel, fireName.x, fireName.y, INK, 700, true);
  if (town) label(image.townLabel, town.x, town.y, INK, 700, true);
  ctx.restore();
}

/** Across the bottom, white on navy: when to call 911, then the sources. */
function drawBand(ctx: Ctx, image: ShareImage) {
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, TOP, SHARE_WIDTH, BAND);
  ctx.fillStyle = "#FFFFFF";
  const width = SHARE_WIDTH - 2 * PAD;
  // One line where the sentence fits one; otherwise two, a little smaller, so they clear the sources under them.
  let call = fit(ctx, image.call, 800, 34, 30, width, 1);
  if (call.lines.length > 1) call = fit(ctx, image.call, 800, 30, 22, width, 2);
  ctx.font = font(800, call.px);
  const lineHeight = call.px * 1.2;
  // One line or two, in the middle of the room above the sources.
  let y = TOP + (BAND - 34 - call.lines.length * lineHeight) / 2 + call.px;
  for (const line of call.lines) {
    ctx.fillText(line, PAD, y);
    y += lineHeight;
  }
  const sources = fit(ctx, image.sources, 500, 18, 13, width, 1);
  ctx.font = font(500, sources.px);
  ctx.globalAlpha = 0.85;
  ctx.fillText(sources.lines.join(" "), PAD, SHARE_HEIGHT - 16);
  ctx.globalAlpha = 1;
}

/** The app's typeface, if the browser can get it; the picture is drawn either way. */
async function typeface() {
  if (!document.fonts) return;
  const wanted = [500, 600, 700, 800].map((weight) => document.fonts.load(font(weight, 32)));
  await Promise.race([Promise.all(wanted).catch(() => undefined), new Promise((done) => setTimeout(done, 1500))]);
}

/** Draw the share image for a drifting-smoke answer. */
export async function drawShare(canvas: HTMLCanvasElement, json: VerdictJson, image: ShareImage): Promise<void> {
  await typeface();
  canvas.width = SHARE_WIDTH;
  canvas.height = SHARE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#FAF6F0";
  ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT);
  drawMap(ctx, json, image);
  drawCard(ctx, image);
  drawBand(ctx, image);
}

/** Save the canvas as a PNG file, by the person's own click. Nothing is sent anywhere. */
export function downloadPng(canvas: HTMLCanvasElement, fileName: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}
