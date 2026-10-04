// The three questions before the trace (Q1 flames, Q2 sky, Q3 nearby): how the browser tests answer them.
import type { Page } from "@playwright/test";

/** Every tap path a person can take, and the screen it ends on. A Yes or Not sure ends the questions at once. */
export const PATHS: { answers: string[]; ends: "/emergency" | "/nearby-fire" | "/location" }[] = [
  { answers: ["yes"], ends: "/emergency" },
  { answers: ["notSure"], ends: "/emergency" },
  { answers: ["no", "column"], ends: "/emergency" },
  { answers: ["no", "notSure"], ends: "/emergency" },
  ...(["haze", "smell"] as const).flatMap((sky) => [
    { answers: ["no", sky, "firePit"], ends: "/nearby-fire" as const },
    { answers: ["no", sky, "mulch"], ends: "/emergency" as const },
    { answers: ["no", sky, "people"], ends: "/emergency" as const },
    { answers: ["no", sky, "other"], ends: "/emergency" as const },
    { answers: ["no", sky, "nothing"], ends: "/location" as const },
    { answers: ["no", sky, "notSure"], ends: "/emergency" as const },
  ]),
];

/** Tap one answer on the question in front. An answer ignores taps for a moment after its screen appears: wait for it. */
export async function answer(page: Page, key: string) {
  await page.locator(`main .look-answers[data-ready="true"] a[data-answer="${key}"]`).click();
}

/** No flames, grey haze, nothing burning nearby: the way straight through the questions to "Where are you?". */
export async function toLocation(page: Page) {
  for (const key of ["no", "haze", "nothing"]) await answer(page, key);
}
