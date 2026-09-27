// The first milestone: the full replay flow for Moncton, in the browser.
import { expect, test, type Locator, type Page } from "@playwright/test";

const NBSP = String.fromCharCode(0xa0);
// Health Canada, "Wildfire smoke with extreme heat".
const EN_SOURCE = "https://www.canada.ca/en/health-canada/services/publications/healthy-living/combine-wildfire-smoke-heat.html";
const FR_SOURCE = "https://www.canada.ca/fr/sante-canada/services/publications/vie-saine/effets-combines-fumee-feux-foret-chaleur.html";

test("Moncton replay: Check → Q1 → Location → Loading → Verdict", async ({ page }) => {
  await page.goto("/?mode=replay");
  await page.getByRole("link", { name: "I smell smoke" }).click();

  await expect(page.getByRole("heading", { name: "Do you see flames or a smoke column?" })).toBeVisible();
  await page.getByRole("link", { name: /Just smoke or haze/ }).click();

  await expect(page.getByRole("heading", { name: "Where are you?" })).toBeVisible();
  await page.getByLabel("Town or city").fill("Monc");
  await page.getByRole("option", { name: /Moncton, NB/ }).click();

  await expect(page.getByRole("heading", { name: "Tracing the air you’re breathing…" })).toBeVisible();
  await expect(page).toHaveURL(/\/verdict$/, { timeout: 10_000 });

  await expect(page.getByText(`Replay${NBSP}· Moncton${NBSP}· Aug 25, 2025${NBSP}·`)).toBeVisible();
  await expect(page.getByText("DRIFTING SMOKE")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Likely from the Long Lake fire");
  await expect(page.getByText("Low confidence")).toBeVisible();

  // The fire's smoke, traced forward: 24 paths that draw outward from the fire once.
  await expect(page.getByText("Smoke from the fire, traced forward")).toBeVisible();
  await expect(page.locator("polyline.fan")).toHaveCount(24);
  const fan = await page.locator("polyline.fan").first().evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationIterationCount]);
  expect(fan).toEqual(["fan", "1"]);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the fire’s smoke, traced forward, is drawn at once", async ({ page }) => {
    await page.goto("/?mode=replay");
    await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"mode":"replay"'));
    await page.goto("/location");
    await page.locator("input[type=search]").fill("Monc");
    await page.getByRole("option", { name: /Moncton, NB/ }).click();
    await expect(page).toHaveURL(/\/verdict$/, { timeout: 10_000 });

    const fan = await page.locator("polyline.fan").first().evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).strokeDashoffset]);
    expect(fan).toEqual(["none", "0px"]);
  });
});

test("Q1 is the only question: Yes goes to Emergency, No straight to Location, in English and French", async ({ page }) => {
  await page.goto("/?mode=replay");
  await page.getByRole("link", { name: "I smell smoke" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Do you see flames or a smoke column?");
  await expect(page.getByText(/Question \d of \d/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Yes\s*I see flames or a smoke column$/ })).toHaveAttribute("href", "/emergency");
  await page.getByRole("link", { name: /^No\s*Just smoke or haze$/ }).click();
  await expect(page).toHaveURL(/\/location$/);
  await page.getByRole("link", { name: "Back" }).click(); // back to the question
  await expect(page).toHaveURL(/\/q1$/);

  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Voyez-vous des flammes ou une colonne de fumée\s\?$/);
  await expect(page.getByText(/Question \d sur \d/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Oui\s*Je vois des flammes ou une colonne de fumée$/ })).toHaveAttribute("href", "/emergency");
  await page.getByRole("link", { name: /^Non\s*Seulement de la fumée ou un voile$/ }).click();
  await expect(page.getByRole("heading", { name: /^Où êtes-vous\s\?$/ })).toBeVisible();

  // The second question is gone: its old address opens Check.
  await page.goto("/q2");
  await expect(page.getByRole("link", { name: "Je sens de la fumée" })).toBeVisible();
  await expect(page).not.toHaveURL(/q2/);
});

test("the loading counter reads Heure {n} sur 24 in French", async ({ page }) => {
  await page.goto("/?mode=replay");
  await page.getByRole("button", { name: "Français" }).click();
  await page.goto("/location");
  await page.locator("input[type=search]").fill("Monc");
  await page.getByRole("option", { name: /Moncton/ }).click();
  const chip = page.locator(".hours");
  await expect(chip).toBeAttached();
  const label = await chip.evaluate((el) => getComputedStyle(el, "::before").content);
  expect(label).toContain("Heure ");
  expect(label).toContain(" sur 24");
});

test("Halifax replay (unexplained): the area-wide caveat follows the official AQHI line and stays in the Air quality card", async ({ page }) => {
  await page.goto("/?mode=replay");
  await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"mode":"replay"')); // before leaving the page
  await page.goto("/location");
  await page.locator("input[type=search]").fill("Halifax");
  await page.getByRole("option", { name: /^Halifax/ }).first().click();
  await expect(page).toHaveURL(/\/verdict$/, { timeout: 10_000 });

  const caveat = "This is an area-wide reading. Smoke from a nearby source can be much stronger where you are.";
  const official = page.locator("section[aria-labelledby=todo-h] p", { hasText: "Official advice for an AQHI of" });
  await expect(official.locator("xpath=following-sibling::*[1]")).toHaveText(caveat);
  await expect(page.locator("section[aria-labelledby=aqhi-h]")).toContainText(caveat);
});

test.describe("What to do: Health Canada’s break from the smoke", () => {
  async function replayVerdict(page: Page, town: string, lang: "en" | "fr" = "en") {
    await page.goto("/?mode=replay");
    await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"mode":"replay"'));
    if (lang === "fr") await page.getByRole("button", { name: "Français" }).click();
    await page.goto("/location");
    await page.locator("input[type=search]").fill(town);
    await page.getByRole("option", { name: new RegExp(`^${town}`) }).first().click();
    await expect(page).toHaveURL(/\/verdict$/, { timeout: 10_000 });
    return page.locator("section[aria-labelledby=todo-h]");
  }
  /** Where each text starts in the card, in reading order. */
  const positions = (card: Locator, texts: string[]) => card.evaluate((el, texts) => texts.map((text) => el.textContent!.indexOf(text)), texts);

  test("Moncton replay (AQHI 10+): after the official AQHI line, before the 811 line, with map searches around Moncton", async ({ page }) => {
    const card = await replayVerdict(page, "Moncton");
    const windows = "Keep windows and doors closed as much as possible. When there’s an extreme heat event occurring with a wildfire smoke event, prioritize keeping cool.";
    const text = "Can’t keep the air clean and cool at home? Health Canada suggests a break from the smoke in public spaces with air conditioning and filtered air. Libraries and community centres often have both.";
    await expect(card.getByText(windows)).toBeVisible();
    await expect(card.getByText(text)).toBeVisible();
    const library = card.getByRole("link", { name: "Find a library near me" });
    await expect(library).toHaveAttribute("href", "https://www.google.com/maps/search/library/@46.099,-64.8,13z");
    await expect(card.getByRole("link", { name: "Find a community centre near me" })).toHaveAttribute("href", "https://www.google.com/maps/search/community%20centre/@46.099,-64.8,13z");
    await expect(card.getByText("Check opening hours before you go.")).toBeVisible();
    await expect(card.getByRole("link", { name: "Source: Health Canada" })).toHaveAttribute("href", EN_SOURCE);

    const [official, closed, advice, nurse] = await positions(card, ["Official advice for an AQHI of 10+", windows, text, "Not an emergency"]);
    expect(official).toBeGreaterThan(-1);
    expect([official < closed, closed < advice, advice < nurse]).toEqual([true, true, true]);
    // The 811 line is unchanged.
    await expect(card.getByRole("link", { name: "Not an emergency but feeling unwell? Call 811 to talk to a nurse" })).toHaveAttribute("href", "tel:811");

    // Outlined navy buttons, never red, 56 px tall at least.
    const look = await library.evaluate((el) => { const s = getComputedStyle(el); return [s.borderTopColor, s.borderTopWidth, s.backgroundColor, s.color]; });
    expect(look).toEqual(["rgb(27, 42, 74)", "2px", "rgba(0, 0, 0, 0)", "rgb(27, 42, 74)"]);
    expect((await library.boundingBox())!.height).toBeGreaterThanOrEqual(56);
  });

  test("Moncton replay in French: the French text, searching in French", async ({ page }) => {
    const card = await replayVerdict(page, "Moncton", "fr");
    const windows = "À l’intérieur, gardez les fenêtres et les portes fermées autant que possible. En cas d’épisode de chaleur extrême et de fumée de feux de forêt, la priorité est de demeurer au frais.";
    const text = `Vous n’arrivez pas à garder l’air propre et frais chez vous${NBSP}? Santé Canada suggère une pause de la fumée dans des espaces publics climatisés à l’air filtré. Les bibliothèques et les centres communautaires en offrent souvent.`;
    await expect(card.getByText(windows)).toBeVisible();
    await expect(card.getByText(text)).toBeVisible();
    await expect(card.getByRole("link", { name: "Trouver une bibliothèque près de moi" })).toHaveAttribute("href", "https://www.google.com/maps/search/biblioth%C3%A8que/@46.099,-64.8,13z");
    await expect(card.getByRole("link", { name: "Trouver un centre communautaire près de moi" })).toHaveAttribute("href", "https://www.google.com/maps/search/centre%20communautaire/@46.099,-64.8,13z");
    await expect(card.getByText("Vérifiez les heures d’ouverture avant d’y aller.")).toBeVisible();
    await expect(card.getByRole("link", { name: `Source${NBSP}: Santé Canada` })).toHaveAttribute("href", FR_SOURCE);
    const [official, closed, advice, nurse] = await positions(card, ["Conseil officiel pour une cote de 10+", windows, text, "Pas une urgence"]);
    expect(official).toBeGreaterThan(-1);
    expect([official < closed, closed < advice, advice < nurse]).toEqual([true, true, true]);
  });

  test("hidden on a low-AQHI unexplained verdict (Halifax replay, AQHI 2); the 811 line stays", async ({ page }) => {
    const card = await replayVerdict(page, "Halifax");
    await expect(card.getByText("Official advice for an AQHI of 2 (low risk).")).toBeVisible();
    await expect(card.getByText("Health Canada")).toHaveCount(0);
    await expect(card.getByRole("link", { name: /near me/ })).toHaveCount(0);
    await expect(card.getByRole("link", { name: "Not an emergency but feeling unwell? Call 811 to talk to a nurse" })).toBeVisible();
  });
});
