import { describe, expect, test } from "vitest";
import { EMBER, EMBER_FULL_MW, EMBER_MAX_R, EMBER_MIN_R, contrast, emberRadius, isGreen, simulate, type ColourBlindness, type EmberColour } from "./palette";

const KINDS: ColourBlindness[] = ["protan", "deutan", "tritan"];
const round = (v: number) => Math.round(v * 100) / 100;

// What a label is read against: its own halo on the overlay, the land and the water on the basemap.
const LABELS: [EmberColour, EmberColour][] = [["label", "labelHalo"], ["placeLabel", "land"], ["placeLabel", "water"], ["waterLabel", "water"]];
// What a mark is seen against. An ember is told from the land by its dark edge; its fill is the brand orange.
const MARKS: [EmberColour, EmberColour][] = [
  ["ribbon", "land"], ["ribbon", "water"], ["emberEdge", "land"], ["emberEdge", "water"], ["flame", "land"], ["flame", "water"],
  ["you", "land"], ["you", "water"], ["alert", "land"], ["alert", "water"],
  // Marks that lie on one another. The ribbon crosses the embers inside its white casing: the casing against the ember,
  // and the ribbon against its casing. Then the flame's ink on its disc, and the bead on the ribbon.
  ["ribbonCasing", "ember"], ["ribbon", "ribbonCasing"], ["flameInk", "flame"], ["bead", "ribbon"],
];

describe("the ember palette", () => {
  test("contrast is WCAG's: black on white is 21, a colour on itself is 1", () => {
    expect([round(contrast("#000000", "#FFFFFF")), contrast("#E8590C", "#E8590C")]).toEqual([21, 1]);
  });

  test("every label is 7:1 or more against what it is read on", () => {
    expect(LABELS.filter(([ink, ground]) => contrast(EMBER[ink], EMBER[ground]) < 7).map((pair) => pair.join(" on "))).toEqual([]);
  });

  test("every mark is 3:1 or more against what it is seen on", () => {
    expect(MARKS.filter(([mark, ground]) => contrast(EMBER[mark], EMBER[ground]) < 3).map((pair) => pair.join(" on "))).toEqual([]);
  });

  test("no green anywhere", () => {
    expect((Object.keys(EMBER) as EmberColour[]).filter((name) => isGreen(EMBER[name]))).toEqual([]);
  });

  test("the ribbon is the hero: nothing drawn on the map is darker against the land but the fire's own disc and the alert's line, both thin", () => {
    const against = (name: EmberColour) => contrast(EMBER[name], EMBER.land);
    expect(against("ribbon")).toBeGreaterThan(against("emberEdge"));
    expect(against("ribbon")).toBeGreaterThan(against("placeLabel"));
    expect(against("ribbon")).toBeGreaterThan(10);
  });
});

describe("colour blindness (Machado 2009, full severity)", () => {
  test("the simulation leaves greys alone and moves the orange", () => {
    for (const kind of KINDS) {
      expect(simulate("#FFFFFF", kind)).toBe("#FFFFFF");
      expect(simulate("#000000", kind)).toBe("#000000");
      expect(simulate(EMBER.ember, kind)).not.toBe(EMBER.ember);
    }
  });

  for (const kind of KINDS) {
    test(`${kind}: every label still 7:1, every mark still 3:1`, () => {
      const seen = (name: EmberColour) => simulate(EMBER[name], kind);
      expect(LABELS.filter(([ink, ground]) => contrast(seen(ink), seen(ground)) < 7).map((pair) => pair.join(" on "))).toEqual([]);
      expect(MARKS.filter(([mark, ground]) => contrast(seen(mark), seen(ground)) < 3).map((pair) => pair.join(" on "))).toEqual([]);
    });

    test(`${kind}: no colour turns green`, () => {
      expect((Object.keys(EMBER) as EmberColour[]).filter((name) => isGreen(simulate(EMBER[name], kind)))).toEqual([]);
    });
  }
});

test("why the ribbon has a white casing: with no red cones (protan) the navy ribbon and the orange embers are under 3:1", () => {
  const seen = (name: EmberColour) => simulate(EMBER[name], "protan");
  expect(round(contrast(EMBER.ribbon, EMBER.ember))).toBe(3.97);
  expect(contrast(seen("ribbon"), seen("ember"))).toBeLessThan(3);
  expect(contrast(seen("ribbonCasing"), seen("ember"))).toBeGreaterThan(4.5);
});

describe("an ember's size is its fire power", () => {
  test("no power reported, or none: the smallest dot", () => {
    expect([emberRadius(null), emberRadius(0), emberRadius(Number.NaN)]).toEqual([EMBER_MIN_R, EMBER_MIN_R, EMBER_MIN_R]);
  });

  test("more power is never a smaller dot, and the dot stops growing at the full size", () => {
    const sizes = [0.5, 5, 29.4, 223.5, 999, EMBER_FULL_MW, 4409.2].map(emberRadius);
    expect(sizes.every((r, i) => i === 0 || r >= sizes[i - 1])).toBe(true);
    expect([sizes[5], sizes[6]]).toEqual([EMBER_MAX_R, EMBER_MAX_R]);
  });

  test("the dot's area, above the smallest, grows with the megawatts: four times the power, twice the added radius", () => {
    const added = (frp: number) => emberRadius(frp) - EMBER_MIN_R;
    expect(added(400) / added(100)).toBeCloseTo(2, 6);
  });

  test("the smallest dot can still be seen and the largest does not hide the map", () => {
    expect([EMBER_MIN_R >= 3, EMBER_MAX_R <= 14]).toEqual([true, true]);
  });
});
