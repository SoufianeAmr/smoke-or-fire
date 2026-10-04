// How much room the verdict screen has, by the height it opened with: which layout it takes.
import { expect, test } from "vitest";
import { room } from "./room";

test("a tall phone (800 px or more): the badges one under the other, nothing made smaller", () => {
  expect([room(844, false), room(800, false), room(932, true)]).toEqual(["", "", ""]);
});

test("under 800 px: the three badges share one row", () => {
  expect([room(799, false), room(741, false)]).toEqual(["verdict-row", "verdict-row"]);
});

test("740 px or less: a smaller shape and line too", () => {
  expect([room(740, false), room(667, false), room(661, false)]).toEqual(["verdict-row verdict-short", "verdict-row verdict-short", "verdict-row verdict-short"]);
});

test("660 px or less: everything tighter", () => {
  expect([room(660, false), room(568, false), room(550, true)]).toEqual(Array(3).fill("verdict-row verdict-short verdict-tight"));
});

test("with the fire-is-close notice on the screen, a 375 × 667 phone is tightened too, so the badges show under the notice", () => {
  expect([room(667, true), room(740, true), room(741, true)]).toEqual(["verdict-row verdict-short verdict-tight", "verdict-row verdict-short verdict-tight", "verdict-row"]);
});
