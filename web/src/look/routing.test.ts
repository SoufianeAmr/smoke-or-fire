// The three questions before the trace (Q1 flames, Q2 sky, Q3 nearby): where each answer leads, and where every one
// of the 72 combinations of answers ends.
import { describe, expect, test } from "vitest";
import { Q1_ANSWERS, Q2_ANSWERS, Q3_ANSWERS, ROUTES, outcome, type Q1Answer, type Q2Answer, type Q3Answer } from "./routing";

// The answers in the order the screens show them. Written out here, not read from the module.
const Q1: Q1Answer[] = ["yes", "no", "notSure"];
const Q2: Q2Answer[] = ["column", "haze", "smell", "notSure"];
const Q3: Q3Answer[] = ["firePit", "mulch", "people", "other", "nothing", "notSure"];

/** Where three answers end, from the rules as they were decided. Never read from the table being tested. */
function ends(q1: Q1Answer, q2: Q2Answer, q3: Q3Answer): string {
  // Flames, or can't tell: Call 911 now, whatever the later answers would have been.
  if (q1 !== "no") return "/emergency";
  // A column rising from one spot, or can't tell.
  if (q2 === "column" || q2 === "notSure") return "/emergency";
  // Grey haze, or only the smell: what is burning nearby decides.
  if (q3 === "firePit") return "/nearby-fire";
  if (q3 === "nothing") return "/location";
  // Mulch or brush, people in danger, something else, or can't tell.
  return "/emergency";
}

const COMBINATIONS = Q1.flatMap((q1) => Q2.flatMap((q2) => Q3.map((q3) => ({ q1, q2, q3, end: ends(q1, q2, q3) }))));

describe("the table the screens link from", () => {
  test("each answer leads to the next question, or to the screen it ends on", () => {
    expect(ROUTES).toEqual({
      q1: { yes: "/emergency", no: "/q2", notSure: "/emergency" },
      q2: { column: "/emergency", haze: "/q3", smell: "/q3", notSure: "/emergency" },
      q3: { firePit: "/nearby-fire", mulch: "/emergency", people: "/emergency", other: "/emergency", nothing: "/location", notSure: "/emergency" },
    });
  });

  test("the answers are listed in the order they are shown", () => {
    expect([[...Q1_ANSWERS], [...Q2_ANSWERS], [...Q3_ANSWERS]]).toEqual([Q1, Q2, Q3]);
  });

  test("every route is a bare path: no ? and no # carry an answer along", () => {
    const routes: string[] = Object.values(ROUTES).flatMap((answers) => Object.values(answers));
    expect(routes).toHaveLength(13); // 3 + 4 + 6 answers
    expect(routes.filter((route) => !/^\/[a-z0-9-]+$/.test(route))).toEqual([]);
  });

  test("16 ways through: the sky is asked only after No, and nearby only after Grey haze or I only smell it", () => {
    const paths = Q1.flatMap((q1) =>
      ROUTES.q1[q1] !== "/q2"
        ? [`${q1} → ${ROUTES.q1[q1]}`]
        : Q2.flatMap((q2) => (ROUTES.q2[q2] !== "/q3" ? [`${q1}, ${q2} → ${ROUTES.q2[q2]}`] : Q3.map((q3) => `${q1}, ${q2}, ${q3} → ${ROUTES.q3[q3]}`))),
    );
    expect(paths).toEqual([
      "yes → /emergency",
      "no, column → /emergency",
      "no, haze, firePit → /nearby-fire",
      "no, haze, mulch → /emergency",
      "no, haze, people → /emergency",
      "no, haze, other → /emergency",
      "no, haze, nothing → /location",
      "no, haze, notSure → /emergency",
      "no, smell, firePit → /nearby-fire",
      "no, smell, mulch → /emergency",
      "no, smell, people → /emergency",
      "no, smell, other → /emergency",
      "no, smell, nothing → /location",
      "no, smell, notSure → /emergency",
      "no, notSure → /emergency",
      "notSure → /emergency",
    ]);
  });
});

describe("where three answers end", () => {
  for (const { q1, q2, q3, end } of COMBINATIONS) {
    test(`${q1} + ${q2} + ${q3} → ${end}`, () => {
      expect(outcome(q1, q2, q3)).toBe(end);
    });
  }

  test("72 combinations: 2 go on to Where are you?, 2 to Nearby fire, 68 to Call 911 now", () => {
    expect(COMBINATIONS).toHaveLength(72);
    const counts: Record<string, number> = {};
    for (const { q1, q2, q3 } of COMBINATIONS) counts[outcome(q1, q2, q3)] = (counts[outcome(q1, q2, q3)] ?? 0) + 1;
    expect(counts).toEqual({ "/location": 2, "/nearby-fire": 2, "/emergency": 68 });
  });

  test("the only ways past Call 911 now: no flames, haze or only the smell, then nothing burning or a neighbour’s fire pit", () => {
    const reaching = (end: string) => COMBINATIONS.filter(({ q1, q2, q3 }) => outcome(q1, q2, q3) === end).map(({ q1, q2, q3 }) => `${q1} + ${q2} + ${q3}`);
    expect(reaching("/location")).toEqual(["no + haze + nothing", "no + smell + nothing"]);
    expect(reaching("/nearby-fire")).toEqual(["no + haze + firePit", "no + smell + firePit"]);
  });

  test("following the table one answer at a time ends where outcome() says", () => {
    for (const { q1, q2, q3 } of COMBINATIONS) {
      const first = ROUTES.q1[q1];
      const second = first === "/q2" ? ROUTES.q2[q2] : first;
      const last = second === "/q3" ? ROUTES.q3[q3] : second;
      expect(outcome(q1, q2, q3), `${q1} + ${q2} + ${q3}`).toBe(last);
    }
  });
});
