// How much room the verdict screen has: chosen from the height it opened with, and kept while it is read.
import { useEffect, useState } from "react";

/**
 * The layout's class names (styles.css, "07 Verdict") for a screen `height` px tall:
 * - under 800 px (most phones, in a browser with its bars): the three badges share one row;
 * - 740 px or less: a smaller shape and line on the card;
 * - 660 px or less: everything tighter. Also up to 740 px when `crowded`: the fire-is-close notice is on the screen,
 *   and takes the room of two rows of badges.
 */
export function room(height: number, crowded: boolean): string {
  return [height < 800 && "verdict-row", height <= 740 && "verdict-short", (height <= 660 || (crowded && height <= 740)) && "verdict-tight"].filter(Boolean).join(" ");
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
