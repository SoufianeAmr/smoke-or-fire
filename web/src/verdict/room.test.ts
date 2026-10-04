// How much room the verdict screen has, by the height it opened with: which layout it takes.
import { expect, test } from "vitest";
import { chipsAfterWhy, room } from "./room";

test("a tall screen (980 px or more, a tablet or a computer): the badges one under the other, nothing made smaller", () => {
  expect([room(980, false), room(1024, false), room(1180, true)]).toEqual(["", "", ""]);
});

test("under 980 px (every phone): the three badges share one row, so the map still shows above them", () => {
  expect([room(979, false), room(932, true), room(844, false), room(800, false), room(741, false)]).toEqual(Array(5).fill("verdict-row"));
});

test("740 px or less: a smaller shape and line too", () => {
  expect([room(740, false), room(667, false), room(661, false)]).toEqual(["verdict-row verdict-short", "verdict-row verdict-short", "verdict-row verdict-short"]);
});

test("660 px or less: everything tighter", () => {
  expect([room(660, false), room(568, false), room(550, true)]).toEqual(Array(3).fill("verdict-row verdict-short verdict-tight"));
});

test("the two chips come after “Why?” on a screen 660 px tall or less, before it on a taller one", () => {
  expect([568, 640, 660, 661, 667, 844].map(chipsAfterWhy)).toEqual([true, true, true, false, false, false]);
});

test("with the fire-is-close notice on the screen, or Call 911 as its main action, a 375 × 667 phone is tightened too", () => {
  expect([room(667, true), room(740, true), room(741, true)]).toEqual(["verdict-row verdict-short verdict-tight", "verdict-row verdict-short verdict-tight", "verdict-row"]);
});
