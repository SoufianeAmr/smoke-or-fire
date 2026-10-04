// The ember palette: every colour the map uses, with the checks that keep it readable. No green anywhere (smoke is
// never "all clear"), and no mark is told from another by colour alone: each has its own shape. Pure: no React, no DOM.

export const EMBER = {
  // The basemap, quiet: the colours of the outline map, so both basemaps look alike.
  land: "#EFE7DA",
  water: "#D8E3EE",
  shore: "#BCCADA",
  border: "#C4B6A0",
  road: "#FFFFFF",
  town: "#E4D9C6",
  placeLabel: "#454036",
  waterLabel: "#2F4763",
  // The answer, on top. The ribbon is the hero: the darkest, widest mark on the map.
  ribbon: "#1B2A4A",
  ribbonCasing: "#FFFFFF",
  bead: "#FFFFFF",
  ember: "#E8590C",
  emberEdge: "#7A2E06",
  flame: "#1A1D21",
  flameInk: "#FFFFFF",
  you: "#1B2A4A",
  alert: "#1A1D21",
  alertCasing: "#FFFFFF",
  label: "#1A1D21",
  labelHalo: "#FFFFFF",
} as const;

export type EmberColour = keyof typeof EMBER;

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const toLinear = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));

/** WCAG relative luminance of a "#RRGGBB" colour. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export type ColourBlindness = "protan" | "deutan" | "tritan";

// Machado, Oliveira and Fernandes (2009), "A physiologically-based model for simulation of color vision deficiency",
// severity 1.0: no working L, M or S cones. Applied to linear RGB.
const MACHADO: Record<ColourBlindness, number[][]> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

/** The colour as someone with that colour blindness sees it. */
export function simulate(hex: string, kind: ColourBlindness): string {
  const linear = channels(hex).map(toLinear);
  const seen = MACHADO[kind].map((row) => Math.max(0, Math.min(1, row[0] * linear[0] + row[1] * linear[1] + row[2] * linear[2])));
  return "#" + seen.map((v) => fromLinear(v).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Whether green leads the colour (the one hue the app never uses). */
export function isGreen(hex: string): boolean {
  const [r, g, b] = channels(hex);
  return g > r + 8 && g > b + 8;
}

// An ember's size is its fire radiative power: the dot's area grows with the megawatts, up to EMBER_FULL_MW.
export const EMBER_MIN_R = 3.5;
export const EMBER_MAX_R = 12;
export const EMBER_FULL_MW = 1000;

/** The radius of a detection's dot, in px. No power reported: the smallest dot. */
export function emberRadius(frp: number | null): number {
  if (frp === null || !(frp > 0)) return EMBER_MIN_R;
  return EMBER_MIN_R + (EMBER_MAX_R - EMBER_MIN_R) * Math.sqrt(Math.min(frp, EMBER_FULL_MW) / EMBER_FULL_MW);
}
