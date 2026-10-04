// The glance card's look, by the engine's verdict: each state has its own icon, shape and colour, so none is told
// by colour alone. Colours are the band colours of screens 7a–7d (DESIGN-LOCK tokens). Pure: no React, no DOM.
import type { Verdict } from "./types";

export type GlanceShape = "circle" | "diamond" | "triangle";
export type GlanceIcon = "wind" | "question" | "exclamation";

/** `background` is the card's; `ink` its text; `mark` the icon, drawn on the white shape. */
export const GLANCE: Record<Verdict, { shape: GlanceShape; icon: GlanceIcon; background: string; ink: string; mark: string }> = {
  drifting: { shape: "circle", icon: "wind", background: "#E8590C", ink: "#1A1D21", mark: "#1A1D21" },
  unclear: { shape: "diamond", icon: "question", background: "#F79009", ink: "#1A1D21", mark: "#1A1D21" },
  unexplained: { shape: "triangle", icon: "exclamation", background: "#D92D20", ink: "#FFFFFF", mark: "#D92D20" },
};

/** A badge's state, told by its outline and by a word in its label: filled, outlined, or dashed. */
export type BadgeTone = "active" | "none" | "notChecked" | "noBurn" | "restricted" | "permitted";
