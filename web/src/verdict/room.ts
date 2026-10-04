// How much room the verdict screen has: chosen from the height it opened with, and kept while it is read.
import { useEffect, useState } from "react";

/**
 * The layout's class names (styles.css, "07 Verdict") for a screen `height` px tall:
 * - under 980 px (every phone): the badges share one row (three, or four with New Brunswick's burn status), and the
 *   sheet at its half height is compact: a column of badges would leave none of the map showing;
 * - 740 px or less: a smaller shape and line on the card;
 * - 660 px or less: everything tighter. Also up to 740 px when `crowded`: the fire-is-close notice is on the screen,
 *   or Call 911 is the screen’s main action and its taller bar takes the room; the map must still show above the
 *   sheet at its half height.
 */
export function room(height: number, crowded: boolean): string {
  return [height < 980 && "verdict-row", height <= 740 && "verdict-short", (height <= 660 || (crowded && height <= 740)) && "verdict-tight"].filter(Boolean).join(" ");
}

/**
 * On a screen 660 px tall or less the sheet at half has no room for the map anyway: there the two chips come after
 * "Why?", so the badges and "Why?" still show above the 911 bar. Taller, the chips come first.
 */
export function chipsAfterWhy(height: number): boolean {
  return height <= 660;
}

/**
 * The height the screen opened with. A phone browser's bars slide away as the page scrolls and the screen grows taller:
 * a layout that followed the height would jump from a row of badges to a column in the middle of reading. So the height
 * is read once, and again only when the width changes (the phone was turned).
 */
export function useOpenedHeight(): number {
  const [height, setHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    let width = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      setHeight(window.innerHeight);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return height;
}
