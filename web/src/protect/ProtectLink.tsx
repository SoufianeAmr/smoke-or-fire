// The verdict's one button to "Protect your home from smoke" (/protect). Quiet at low risk, as "Why?" is; filled navy
// from moderate up. It says nothing of the band itself: the screen it opens does, in words.
import { Link } from "react-router";
import { useApp } from "../app/state";
import { ChevronRightIcon } from "../components/icons";
import content from "./content.json";
import { HomeIcon } from "./icons";
import { toneOf } from "./view";
import "./protect.css";

/**
 * The same way in, as a chip: one of the two in the sheet's row at its half height, where the map must stay in view.
 * Its words are the first words of the button's name, which stays its name for a screen reader. `quiet`: nothing
 * explains the smoke, Call 911 is the screen's main action, and the chip never competes with it.
 */
export function ProtectChip({ quiet }: { quiet: boolean }) {
  const { lang, result } = useApp();
  if (!result) return null;
  return (
    <Link to="/protect" className="chip protect-chip press" data-tone={quiet ? "calm" : toneOf(result)} aria-label={content.strings.title[lang]}>
      {content.strings.chip[lang]}
    </Link>
  );
}

/** Shown with a verdict: the engine's answer says how loud it is. */
export function ProtectLink() {
  const { lang, result } = useApp();
  if (!result) return null;
  return (
    <Link to="/protect" className="protect-link press" data-tone={toneOf(result)}>
      <HomeIcon size={30} />
      <span className="protect-link-name">{content.strings.title[lang]}</span>
      <ChevronRightIcon size={24} />
    </Link>
  );
}
