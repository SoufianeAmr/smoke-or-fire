// The burn status as the fourth source badge of the verdict (New Brunswick only): a pill in the badge row, "Burning: No
// burn", that shows on a tap what the burn card says first: the status in full, the county, what the province allows,
// until when, and where it comes from. Built from the card's own view, so the two never differ. Pure: no React, no DOM.
import { translate, type Lang, type StringKey } from "../i18n";
import { lowerFirst } from "../listen/speech";
import type { BadgeTone } from "../verdict/glance";
import type { BurnState } from "../verdict/types";
import type { Badge } from "../verdict/view";
import type { BurnView } from "./view";

// The pill's outline says the state, as the other badges' do, and its word says it too. The two restrictions fill the
// pill (red, amber); "permitted" is outlined in green, never filled; season closed is outlined; not checked is dashed.
const TONE: Record<BurnState, BadgeTone> = { no_burn: "noBurn", restricted: "restricted", permitted: "permitted", season_closed: "none", not_checked: "notChecked" };

export function burnBadge(view: BurnView, lang: Lang): Badge {
  const short = translate(lang, `badge.burn.short.${view.state}` as StringKey);
  return {
    id: "burn",
    tone: TONE[view.state],
    icon: "burn",
    burn: view.state,
    short,
    // "Burning: No burn"; French writes the word in lower case after the colon: "Brûlage : interdit".
    label: translate(lang, "badge.burn", { word: lang === "fr" ? lowerFirst(short, lang) : short }),
    // The status in full first (in bold), then the county, what the province allows and until when; last, who was asked
    // and when (the card's own source lines, without the one about its tips).
    lines: [view.word, ...(view.county ? [view.county] : []), view.detail, ...(view.until ? [view.until] : []), ...view.sources.lines.slice(0, -1)],
    links: [view.fireWatch],
  };
}

/**
 * What Listen reads at the sheet's half height, with the burn badge named after the other three: the card's script
 * names the badges of the row, and this one is in the row too. A script that does not name them is left as it is.
 */
export function withBurnBadge(voice: string[], badges: Badge[], burn: Badge): string[] {
  const last = badges[badges.length - 1];
  const at = last ? voice.findIndex((sentence) => sentence.includes(last.label)) : -1;
  return at < 0 ? voice : [...voice.slice(0, at + 1), `${burn.label}.`, ...voice.slice(at + 1)];
}
