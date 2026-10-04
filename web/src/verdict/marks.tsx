// Marks other screens draw too (the leave map's flame, How it works' icons). Kept apart from the verdict's own files,
// so those screens do not carry the verdict's code with them: the verdict screen is loaded on its own.

export const FLAME = "M12 21.5c3.9 0 6.5-2.6 6.5-6.3 0-3-1.8-5.3-3.4-7-.4 1.6-1.2 2.6-2.3 3.2.4-3.2-1-6.3-3.8-8.9.2 3.4-1.5 5.4-3 7.3-1.2 1.6-2 3.2-2 5.4 0 3.7 2.6 6.3 6.5 6.3z";

const WIND_ICON = (
  <>
    <path d="M3 8h10a3 3 0 1 0-3-3" />
    <path d="M3 12h15a3 3 0 1 1-3 3" />
    <path d="M3 16h7" />
  </>
);
const WARNING_ICON = (
  <>
    <path d="M12 3.5L2.5 20h19L12 3.5z" />
    <path d="M12 10v4.5" />
    <path d="M12 17.3h.01" />
  </>
);
export const VERDICT_ICONS = { wind: WIND_ICON, warning: WARNING_ICON };
