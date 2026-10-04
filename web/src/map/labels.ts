// Place map labels (16px bold, or the size given) so they stay inside the frame and do not cover markers or each other.
// The screen files place labels by hand for one sample; real data needs this to keep them readable.

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const CHAR_PX = 9.6; // average advance of 16px bold Inter

export const textWidth = (text: string, size = 16) => (text.length * CHAR_PX * size) / 16;

/** The box an SVG <text> at (x, y) covers (y is the baseline). */
export const textBox = (text: string, x: number, y: number, size = 16): Box => ({ x0: x, y0: y - (14 * size) / 16, x1: x + textWidth(text, size), y1: y + (4 * size) / 16 });

export const circleBox = (x: number, y: number, r: number): Box => ({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * The first candidate position (dx, dy from the anchor; dx may use the text width) whose text box
 * fits the frame and misses every taken box. The chosen box is added to `taken`. Null if none fits.
 */
export function placeLabel(
  text: string,
  anchor: [number, number],
  candidates: ((width: number) => [number, number])[],
  taken: Box[],
  frame: { width: number; height: number },
): { x: number; y: number } | null {
  const width = textWidth(text);
  for (const candidate of candidates) {
    const [dx, dy] = candidate(width);
    // Slide sideways into the frame rather than giving up on a position near an edge.
    const x = Math.max(4, Math.min(anchor[0] + dx, frame.width - 4 - width));
    const y = anchor[1] + dy;
    const box = textBox(text, x, y);
    if (box.y0 < 2 || box.y1 > frame.height - 2) continue;
    if (taken.some((t) => overlaps(box, t))) continue;
    taken.push(box);
    return { x, y };
  }
  return null;
}

export const isFree = (box: Box, taken: Box[]) => !taken.some((t) => overlaps(box, t));
