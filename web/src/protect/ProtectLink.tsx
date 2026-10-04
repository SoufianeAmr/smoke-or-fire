// The verdict's one button to "Protect your home from smoke" (/protect). Quiet at low risk, as "Why?" is; filled navy
// from moderate up. It says nothing of the band itself: the screen it opens does, in words.
import { Link } from "react-router";
import { useApp } from "../app/state";
import { ChevronRightIcon } from "../components/icons";
import content from "./content.json";
import { HomeIcon } from "./icons";
import { toneOf } from "./view";
import "./protect.css";

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
