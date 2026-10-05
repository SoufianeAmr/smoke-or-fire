// The first milestone: the full replay flow for Moncton, in the browser.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { answer } from "./look";
import { openWhy, sheet } from "./verdict";
import { toFrench } from "./language";

const NBSP = String.fromCharCode(0xa0);
// Health Canada, "Wildfire smoke with extreme heat".
const EN_SOURCE = "https://www.canada.ca/en/health-canada/services/publications/healthy-living/combine-wildfire-smoke-heat.html";
const FR_SOURCE = "https://www.canada.ca/fr/sante-canada/services/publications/vie-saine/effets-combines-fumee-feux-foret-chaleur.html";

test("Moncton replay: Check → Q1 flames → Q2 sky → Q3 nearby → Location → Loading → Verdict", async ({ page }) => {
  await page.goto("/?mode=replay");
  await page.getByRole("link", { name: "I smell smoke" }).click();

  // The three questions: no flames, grey haze, nothing burning nearby. The way straight through to "Where are you?".
  const question = page.getByRole("heading", { level: 1 });
  await expect(question).toHaveText("Do you see flames?");
  await answer(page, "no");
  await expect(question).toHaveText("Which looks like your sky?");
  await answer(page, "haze");
  await expect(question).toHaveText("Is anything burning nearby?");
  await answer(page, "nothing");

  await expect(page.getByRole("heading", { name: "Where are you?" })).toBeVisible();
  await page.getByLabel("Town or city").fill("Monc");
  await page.getByRole("option", { name: /Moncton, NB/ }).click();

  await expect(page.getByRole("heading", { name: "Tracing the air you’re breathing…" })).toBeVisible();
  await expect(page).toHaveURL(/\/verdict$/, { timeout: 10_000 });

  await expect(page.getByText(`Replay${NBSP}· Moncton${NBSP}· Aug 25, 2025${NBSP}·`)).toBeVisible();

  // As the verdict opens: the map, and over its foot the glance card, its line as the screen's title. One tap up
  // ("Sources and why"): the three source badges, the burn status (Moncton is in New Brunswick), and "Why?" closed.
  await expect(page.locator("section.glance")).toHaveAttribute("data-state", "drifting");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Drifting smoke${NBSP}· Long Lake fire${NBSP}· 159 km SSW`);
  await expect(page.getByRole("region", { name: "Map", exact: true })).toBeVisible();
  const badges = page.locator("main .badge");
  await expect(badges.locator(".badge-label")).toHaveText(["Satellite fire detection", "Wind trace", "ECCC air quality alert: active", "Burning: Not checked"]);
  expect(await badges.evaluateAll((els) => els.map((el) => el.getAttribute("data-badge")))).toEqual(["fire", "trace", "alert", "burn"]);
  for (const badge of await badges.all()) await expect(badge).toBeHidden();
  await page.getByRole("button", { name: "Sources and why" }).click();
  // The tap is made: wait for the sheet to say it is at half. Nothing taps its handle again.
  await expect(sheet(page)).toHaveAttribute("data-detent", "half");
  for (const badge of await badges.all()) await expect(badge).toBeVisible();
  const why = page.getByRole("button", { name: "Why?" });
  await expect(why).toHaveAttribute("aria-expanded", "false");
  // What screen 7a says is on the page, behind "Why?": none of it shows yet.
  const label = page.locator("section[aria-labelledby=answer-h] > p:first-child");
  const headline = page.locator("#answer-h");
  const confidence = page.getByText("Low confidence");
  const forward = page.getByText("Smoke from the fire, traced forward");
  await expect(page.locator("#why-all")).toBeHidden();
  for (const old of [label, headline, confidence, forward]) {
    await expect(old).toHaveCount(1);
    await expect(old).toBeHidden();
  }

  // A tap on "Why?": the band's words, as they were.
  await openWhy(page);
  await expect(why).toHaveAttribute("aria-expanded", "true");
  await expect(label).toBeVisible();
  await expect(label).toHaveText("DRIFTING SMOKE");
  await expect(headline).toHaveText("Likely from the Long Lake fire");
  await expect(confidence).toBeVisible();

  // The fire's smoke, traced forward: 24 paths that draw outward from the fire once.
  await forward.scrollIntoViewIfNeeded();
  await expect(forward).toBeVisible();
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
    await openWhy(page); // the map is behind "Why?"
    await expect(page.getByText("Smoke from the fire, traced forward")).toBeVisible();

    const fan = await page.locator("polyline.fan").first().evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).strokeDashoffset]);
    expect(fan).toEqual(["none", "0px"]);
  });
});

test("Three questions, in English and French: No goes on to the sky question, Grey haze to the nearby question, Nothing to Location; Back steps back one question at a time; /q2 opens the sky question", async ({ page }) => {
  const EN = {
    q1: "Do you see flames?", q2: "Which looks like your sky?", q3: "Is anything burning nearby?", where: "Where are you?",
    answers: ["Yes", "No", "Not sure"], back: "Back", counter: /Question \d of \d/,
  };
  const FR = {
    q1: /^Voyez-vous des flammes\s\?$/, q2: /^Quelle image ressemble à votre ciel\s\?$/, q3: /^Est-ce que quelque chose brûle près de vous\s\?$/, where: /^Où êtes-vous\s\?$/,
    answers: ["Oui", "Non", "Je ne sais pas"], back: "Retour", counter: /Question \d sur \d/,
  };
  const title = page.getByRole("heading", { level: 1 });
  const answers = page.locator("main .look-answers a[data-answer]");

  await page.goto("/?mode=replay");
  await page.getByRole("link", { name: "I smell smoke" }).click();
  for (const l of [EN, FR]) {
    if (l === FR) await page.getByRole("button", { name: "Français" }).click();
    await expect(page).toHaveURL(/\/q1$/);
    await expect(title).toHaveText(l.q1);
    // The three answers, top to bottom, and where each one leads.
    await expect(answers.locator(".look-label")).toHaveText(l.answers);
    expect(await answers.evaluateAll((els) => els.map((el) => [el.getAttribute("data-answer"), el.getAttribute("href")]))).toEqual([["yes", "/emergency"], ["no", "/q2"], ["notSure", "/emergency"]]);
    await expect(page.getByText(l.counter)).toHaveCount(0); // the progress mark is three dots, with no words

    await answer(page, "no");
    await expect(page).toHaveURL(/\/q2$/);
    await expect(title).toHaveText(l.q2);
    await expect(page.getByText(l.counter)).toHaveCount(0);
    await answer(page, "haze");
    await expect(page).toHaveURL(/\/q3$/);
    await expect(title).toHaveText(l.q3);
    await expect(page.getByText(l.counter)).toHaveCount(0);
    await answer(page, "nothing");
    await expect(page).toHaveURL(/\/location$/);
    await expect(title).toHaveText(l.where);

    // Back, one question at a time.
    for (const [address, question] of [[/\/q3$/, l.q3], [/\/q2$/, l.q2], [/\/q1$/, l.q1]] as const) {
      await page.getByRole("link", { name: l.back, exact: true }).click();
      await expect(page).toHaveURL(address);
      await expect(title).toHaveText(question);
    }
  }

  // The second question has its own address: opened directly, it is the sky question (that address used to open Check).
  await page.goto("/q2");
  await expect(title).toHaveText(FR.q2);
  await expect(page).toHaveURL(/\/q2$/);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(title).toHaveText(EN.q2);
});

test("an address the app doesn’t know opens Check", async ({ page }) => {
  await page.goto("/?mode=replay");
  await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"mode":"replay"'));
  await page.goto("/q4");
  await expect(page.getByRole("link", { name: "I smell smoke" })).toBeVisible();
  await expect(page).not.toHaveURL(/q4/);
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
  await openWhy(page); // both cards are behind "Why?"

  const caveat = "This is an area-wide reading. Smoke from a nearby source can be much stronger where you are.";
  const official = page.locator("section[aria-labelledby=todo-h] p", { hasText: "Official advice for an AQHI of" });
  await expect(official).toBeVisible();
  await expect(official.locator("xpath=following-sibling::*[1]")).toHaveText(caveat);
  await expect(page.locator("section[aria-labelledby=aqhi-h]")).toContainText(caveat);
  await expect(page.locator("section[aria-labelledby=aqhi-h]").getByText(caveat)).toBeVisible();
});

test.describe("What to do: Health Canada’s break from the smoke", () => {
  /** The town's replay verdict with "Why?" open: the What to do card, which is behind it. */
  async function replayVerdict(page: Page, town: string, lang: "en" | "fr" = "en") {
    await page.goto("/?mode=replay");
    await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"mode":"replay"'));
    if (lang === "fr") await toFrench(page);
    await page.goto("/location");
    await page.locator("input[type=search]").fill(town);
    await page.getByRole("option", { name: new RegExp(`^${town}`) }).first().click();
    await expect(page).toHaveURL(/\/verdict$/, { timeout: 10_000 });
    await openWhy(page);
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
