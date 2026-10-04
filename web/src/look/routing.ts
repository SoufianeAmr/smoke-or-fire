// The three questions before the trace, and where each answer leads. Pure: no React, no DOM.
// A Yes or a Not sure goes to Call 911 now. Only "no flames", then "haze" or "I only smell it", then "nothing burning"
// goes on to the trace. A neighbour's fire pit has its own short screen.

export type Q1Answer = "yes" | "no" | "notSure";
export type Q2Answer = "column" | "haze" | "smell" | "notSure";
export type Q3Answer = "firePit" | "mulch" | "people" | "other" | "nothing" | "notSure";
export type End = "/emergency" | "/nearby-fire" | "/location";

// The answers, in the order they are shown.
export const Q1_ANSWERS: readonly Q1Answer[] = ["yes", "no", "notSure"];
export const Q2_ANSWERS: readonly Q2Answer[] = ["column", "haze", "smell", "notSure"];
export const Q3_ANSWERS: readonly Q3Answer[] = ["firePit", "mulch", "people", "other", "nothing", "notSure"];

export const ROUTES = {
  q1: { yes: "/emergency", no: "/q2", notSure: "/emergency" },
  q2: { column: "/emergency", haze: "/q3", smell: "/q3", notSure: "/emergency" },
  q3: { firePit: "/nearby-fire", mulch: "/emergency", people: "/emergency", other: "/emergency", nothing: "/location", notSure: "/emergency" },
} as const;

/** Where the three answers end. A Yes or Not sure ends the questions at once: later answers are never asked. */
export function outcome(q1: Q1Answer, q2: Q2Answer, q3: Q3Answer): End {
  const first = ROUTES.q1[q1];
  if (first !== "/q2") return first;
  const second = ROUTES.q2[q2];
  if (second !== "/q3") return second;
  return ROUTES.q3[q3];
}
