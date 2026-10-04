// The dispatch board (/dispatch) in the browser, at a desk: 1366 × 768, by keyboard first.
// Replay: type a place, the answer and its sources, the three questions with the public app's routing, the copy for
// call notes, and surge mode's messages and images. Live: the engine answered by the test, and "not checked".
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { TEST_ENGINE_URL } from "./engine";
import { PATHS } from "./look";

test.use({ viewport: { width: 1366, height: 768 } });

const NBSP = String.fromCharCode(0xa0);
const BANNER = "Decision support only. Your dispatch protocol governs.";
const MONCTON = JSON.parse(readFileSync(new URL("../../data/demo/moncton.json", import.meta.url), "utf8"));
const EN_MESSAGE =
  "The smoke in Moncton today comes from the Long Lake fire in Nova Scotia, 159 km away. If you see flames or smoke from a building or vehicle, call 911. " +
  "Environment Canada: special air quality statement in effect for Moncton and Southeast New Brunswick.";
const FR_MESSAGE =
  "La fumée à Moncton aujourd’hui vient du feu de Long Lake en Nouvelle-Écosse, à 159 km. Si vous voyez des flammes ou de la fumée qui sort d’un bâtiment ou d’un véhicule, appelez le 911. " +
  `Environnement Canada${NBSP}: bulletin spécial sur la qualité de l’air en vigueur pour Moncton et sud-est du Nouveau-Brunswick.`;
// Any wording that tells a call taker not to send anyone.
const NO_RESPONSE = /(do not|don’t|never|no need to) (respond|dispatch|send|go)|no response|stand down|ne (pas|jamais) (répondre|répartir|envoyer|intervenir)|aucune intervention/i;

const placeBox = (page: Page) => page.getByRole("combobox");
const card = (page: Page) => page.locator(".d-known");
const result = (page: Page) => page.locator(".d-result");
const fact = (page: Page, id: string) => page.locator(`.d-facts > li[data-fact="${id}"]`);

/** Open the board in replay and type a town: Enter takes the first match. */
async function check(page: Page, typed: string) {
  await placeBox(page).fill(typed);
  await placeBox(page).press("Enter");
  await expect(card(page).or(page.locator(".d-error"))).toBeVisible();
}
async function openReplay(page: Page, typed?: string) {
  await page.goto("/dispatch?mode=replay");
  await expect(page.getByRole("heading", { level: 1, name: "Dispatch board" })).toBeVisible();
  if (typed) await check(page, typed);
}
/** Click the answers of one path through the questions. */
async function answer(page: Page, keys: string[]) {
  for (const key of keys) await page.locator(`.d-answers button[data-answer="${key}"]`).click();
}
/**
 * The browser's clipboard, stood in for: what the page copies is kept on the page, and read back here. The real one
 * belongs to the whole machine, and a test must not write to it.
 */
async function standInClipboard(page: Page) {
  await page.addInitScript(() => {
    const copied: string[] = [];
    Object.assign(window, { __copied: copied });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: (text: string) => (copied.push(text), Promise.resolve()) } });
  });
}
const lastCopied = (page: Page) => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied.at(-1) ?? null);
const pixel = (canvas: Locator, x: number, y: number) =>
  canvas.evaluate((el, [px, py]) => Array.from((el as HTMLCanvasElement).getContext("2d")!.getImageData(px, py, 1, 1).data.slice(0, 3)), [x, y]);

test("replay by keyboard: type a place, Enter, and the answer with its sources is there within two seconds", async ({ page }) => {
  await openReplay(page);
  // The banner, on the page before anything is typed; the replay says it is recorded data.
  await expect(page.locator(".d-banner")).toHaveText(BANNER);
  await expect(page.locator(".d-replay")).toHaveText(`Replay${NBSP}· Aug 25, 2025. Recorded data, not today’s.`);
  await expect(page).toHaveTitle(`Dispatch board${NBSP}· Smoke or Fire?`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");

  // The place box has the keyboard as the page opens. Typing lists the matches; Enter takes the first.
  await expect(placeBox(page)).toBeFocused();
  await expect(placeBox(page)).toHaveAccessibleName("Caller’s town or city");
  await page.keyboard.type("monc");
  await expect(placeBox(page)).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("option")).toHaveText(["Moncton, NBWestmorland County"]);
  const started = Date.now();
  await page.keyboard.press("Enter");
  await expect(card(page)).toBeVisible();
  expect(Date.now() - started).toBeLessThan(2000);

  // The known-smoke card: the public card's line, shape and colour, the place and when it was checked, how sure.
  await expect(card(page)).toHaveAttribute("data-state", "drifting");
  await expect(card(page).getByRole("heading", { level: 3 })).toHaveText(`Drifting smoke${NBSP}· Long Lake fire${NBSP}· 159 km SSW`);
  await expect(card(page).locator(".glance-shape")).toHaveAttribute("data-shape", "circle");
  expect(await card(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(232, 89, 12)");
  await expect(card(page).locator(".d-known-for")).toHaveText(`Moncton, NB${NBSP}· checked 2025-08-25, 09:00 (Atlantic time)`);
  await expect(card(page).locator(".d-known-sure")).toHaveText("Low confidence. We traced the air at three heights above the ground, and they don’t agree.");
  await expect(card(page).getByRole("img", { name: "toward the south-southwest" })).toBeVisible();
  // A screen reader is told the answer when it arrives.
  await expect(page.locator("p.d-sr[role=status]")).toHaveText(`Moncton, NB: Drifting smoke${NBSP}· Long Lake fire${NBSP}· 159 km SSW`);

  // The facts, each with what was found, who says so and when, and a link: fire and distance, ECCC's alert, burn
  // status, the wind trace.
  await expect(page.locator(".d-facts > li h4")).toHaveText(["Satellite fire detection", "ECCC air quality alert: active", "Burn status: ban in effect", "Wind trace"]);
  await expect(fact(page, "fire").locator(".d-fact-headline")).toHaveText(`Long Lake fire${NBSP}· 159 km SSW of Moncton`);
  await expect(fact(page, "fire")).toContainText("West Dalhousie, N.S. Terra saw it burning 10 hours ago. Detected: 2025-08-24, 22:43 (Atlantic time). Sources: NASA FIRMS and Natural Resources Canada (CWFIS).");
  await expect(fact(page, "alert")).toContainText("Special air quality statement. Moncton and Southeast New Brunswick. Issued 2025-08-25, 04:50 (Atlantic time). Valid until at least 2025-08-25, 20:50 (Atlantic time).");
  await expect(fact(page, "alert")).toContainText("Air quality reading (AQHI): 10+, very high risk. Station: Moncton. Observed: 2025-08-25, 08:00 (Atlantic time). Data source: Environment and Climate Change Canada.");
  await expect(fact(page, "burn")).toContainText("A burn ban is in effect in New Brunswick. Source: Government of New Brunswick, news release of 2025-08-25.");
  await expect(fact(page, "burn").getByRole("link", { name: /The news release/ })).toHaveAttribute("href", "https://www.gnb.ca/en/news/n-b.2025.08.most-restrictions-on-crown-land-to-be-lifted-tonight.html");
  await expect(fact(page, "alert").getByRole("link")).toHaveAttribute("href", MONCTON.alerts.airQuality.alert.url);
  for (const li of await page.locator(".d-facts > li").all()) {
    expect(await li.getByRole("link").count()).toBeGreaterThan(0);
    for (const link of await li.getByRole("link").all()) {
      await expect(link).toHaveAttribute("href", /^https:\/\//);
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  }

  // Enter moved the keyboard on to the first question, and answered nothing. The numbers answer: 2, 2, 5 is
  // "No", "Grey haze", "Nothing".
  await expect(result(page)).toHaveCount(0);
  await expect(page.locator('.d-answers button[data-answer="yes"]')).toBeFocused();
  await expect(page.locator('li[data-question="1"]')).toHaveAttribute("data-state", "current");
  await page.keyboard.press("2");
  await expect(page.locator('li[data-question="2"]')).toHaveAttribute("data-state", "current");
  await expect(page.locator('.d-answers button[data-answer="column"]')).toBeFocused();
  await page.keyboard.press("2");
  await expect(page.locator('.d-answers button[data-answer="firePit"]')).toBeFocused();
  await page.keyboard.press("5");
  await expect(result(page)).toHaveAttribute("data-kind", "noFire");
  await expect(result(page).getByRole("heading")).toBeFocused();
  await expect(result(page).getByRole("heading")).toHaveText("Result: Caller reports no fire nearby");
  await expect(result(page).locator("p")).toHaveText("This fits the known smoke from the Long Lake fire, 159 km away.");
  // The answer for the place is still on the screen beside it.
  await expect(card(page)).toBeInViewport();
  await expect(result(page)).toBeInViewport();
  expect(await page.locator("body").innerText()).not.toMatch(NO_RESPONSE);
});

test("the place box: arrow keys move through the matches, Escape closes them, a place that does not match says so", async ({ page }) => {
  await openReplay(page);
  await page.keyboard.type("s");
  await expect(page.getByRole("option")).toHaveText([/^Sackville, NB/, /^Sussex, NB/, /^Saint John, NB/]);
  await expect(page.getByRole("option").nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(placeBox(page)).toHaveAttribute("aria-activedescendant", "d-place-0");
  await page.keyboard.press("ArrowDown");
  await expect(placeBox(page)).toHaveAttribute("aria-activedescendant", "d-place-1");
  await expect(page.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp"); // from the first, round to the last
  await expect(placeBox(page)).toHaveAttribute("aria-activedescendant", "d-place-2");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(placeBox(page)).toHaveValue("s");
  await page.keyboard.press("Escape"); // closed already: the box is emptied
  await expect(placeBox(page)).toHaveValue("");

  // The pointer picks too.
  await placeBox(page).fill("sus");
  await page.getByRole("option", { name: /Sussex/ }).click();
  await expect(card(page).locator(".d-known-for")).toContainText("Sussex, NB");
  await expect(placeBox(page)).toHaveValue("Sussex");

  // Riverview is not one of the replay's towns: the page says which ones it has, and the answer on screen stays.
  await placeBox(page).fill("Riverview");
  await expect(page.locator(".d-none")).toHaveText(/^No place matches\. The replay has these towns: Moncton, Dieppe, Sackville, .*West Dalhousie\.$/);
  await placeBox(page).press("Enter");
  await expect(card(page).locator(".d-known-for")).toContainText("Sussex, NB");
});

test("the three questions end where the public app's routing ends them: any yes or not sure is Dispatch", async ({ page }) => {
  await openReplay(page, "Monc");
  for (const path of PATHS) {
    await answer(page, path.answers);
    const where = path.answers.join(" → ");
    // New Brunswick had a burn ban on Aug 25, 2025: a neighbour's fire pit is Dispatch too.
    const kind = path.ends === "/location" ? "noFire" : "dispatch";
    await expect(result(page), where).toHaveAttribute("data-kind", kind);
    if (path.ends === "/emergency") {
      await expect(result(page).getByRole("heading"), where).toHaveText("Result: Dispatch");
      await expect(result(page).locator("p"), where).toHaveText("A yes or a not sure: there may be a fire near the caller.");
      expect(await result(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(217, 45, 32)");
      await expect(result(page).locator(".glance-shape")).toHaveAttribute("data-shape", "triangle");
    }
    if (path.ends === "/nearby-fire") await expect(result(page).locator("p"), where).toHaveText("A fire pit or bonfire, and a burn ban is in effect in New Brunswick.");
    // A yes or a not sure ends the questions: the ones after it are not asked.
    await expect(page.locator("li[data-question]"), where).toHaveCount(path.answers.length);
    await expect(page.locator(".d-answers"), where).toHaveCount(0);
    expect(await page.locator(".d-script").innerText(), where).not.toMatch(NO_RESPONSE);
    await page.getByRole("button", { name: "New call" }).click();
    await expect(result(page)).toHaveCount(0);
  }
});

test("Change takes an answer back; New call starts the questions again and returns to the place box", async ({ page }) => {
  await openReplay(page, "Monc");
  await answer(page, ["no", "haze"]);
  await expect(page.locator('li[data-question="2"] .d-given')).toContainText("Answer: Grey haze");
  await expect(page.locator('li[data-question="3"]')).toHaveAttribute("data-state", "current");

  // Change on question 1: it is asked again, with the keyboard on its answers, and question 2's answer is gone.
  await page.getByRole("button", { name: "Change the answer to question 1" }).click();
  await expect(page.locator('li[data-question="1"]')).toHaveAttribute("data-state", "current");
  await expect(page.locator('.d-answers button[data-answer="yes"]')).toBeFocused();
  await expect(page.locator('li[data-question="2"]')).toHaveAttribute("data-state", "waiting");
  await expect(page.locator(".d-given")).toHaveCount(0);

  // A yes: Dispatch. Changing it brings the question back, and the result goes.
  await answer(page, ["yes"]);
  await expect(result(page)).toHaveAttribute("data-kind", "dispatch");
  await page.getByRole("button", { name: "Change the answer to question 1" }).click();
  await expect(result(page)).toHaveCount(0);
  await answer(page, ["no", "smell", "nothing"]);
  await expect(result(page)).toHaveAttribute("data-kind", "noFire");

  // New call: no answers, the place box has the keyboard with its text selected, and the answer stays for the next
  // caller from the same town. Enter checks the town again.
  await page.getByRole("button", { name: "New call" }).click();
  await expect(result(page)).toHaveCount(0);
  await expect(page.locator('li[data-question="1"]')).toHaveAttribute("data-state", "current");
  await expect(placeBox(page)).toBeFocused();
  expect(await placeBox(page).evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 7]);
  await expect(card(page)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(card(page).locator(".d-known-for")).toContainText("Moncton, NB");
  await expect(page.locator('.d-answers button[data-answer="yes"]')).toBeFocused();
  // Typing over the selection checks another town.
  await page.getByRole("button", { name: "New call" }).click();
  await page.keyboard.type("fred");
  await page.keyboard.press("Enter");
  await expect(card(page)).toHaveAttribute("data-state", "unexplained");
  await expect(card(page).getByRole("heading", { level: 3 })).toHaveText(`Unexplained smoke${NBSP}· No known fire upwind`);
});

test("a held key answers one question only, and Enter on the place answers none", async ({ page }) => {
  await openReplay(page, "Monc");
  await expect(page.locator('.d-answers button[data-answer="yes"]')).toBeFocused();
  // Enter held down on "No": question 2 is asked, and its first answer is not pressed by the repeats.
  await page.keyboard.press("Tab");
  await expect(page.locator('.d-answers button[data-answer="no"]')).toBeFocused();
  await page.keyboard.down("Enter");
  await page.keyboard.down("Enter"); // the key repeating
  await page.keyboard.down("Enter");
  await page.keyboard.up("Enter");
  await expect(page.locator('li[data-question="2"]')).toHaveAttribute("data-state", "current");
  await expect(result(page)).toHaveCount(0);
  // A number held down: the same.
  await page.keyboard.down("2");
  await page.keyboard.down("2");
  await page.keyboard.up("2");
  await expect(page.locator('li[data-question="3"]')).toHaveAttribute("data-state", "current");
  await expect(result(page)).toHaveCount(0);
});

test("Copy for call notes: plain text with every source and time, and the caller's answers", async ({ page }) => {
  await standInClipboard(page);
  await openReplay(page, "Monc");
  await answer(page, ["no", "haze", "nothing"]);
  await page.getByRole("button", { name: "Copy for call notes" }).click();
  await expect(page.locator(".d-notes .d-status")).toHaveText("Copied. Paste it into your call notes.");
  const copied = (await lastCopied(page))!;
  const lines = copied.split("\n");
  expect(lines.slice(0, 6)).toEqual([
    "Smoke check · Smoke or Fire?",
    "Place: Moncton, NB",
    "Checked: 2025-08-25, 09:00 (Atlantic time)",
    "Replay of Aug 25, 2025: recorded data, not today’s.",
    "Answer: Drifting smoke · Long Lake fire · 159 km SSW",
    "Low confidence. We traced the air at three heights above the ground, and they don’t agree.",
  ]);
  for (const line of [
    "- Long Lake fire · 159 km SSW of Moncton",
    "- Detected: 2025-08-24, 22:43 (Atlantic time).",
    "- Sources: NASA FIRMS and Natural Resources Canada (CWFIS).",
    "- NASA fire map: https://firms.modaps.eosdis.nasa.gov/map/",
    "- Canada’s fire map: https://cwfis.cfs.nrcan.gc.ca/interactive-map",
    "ECCC air quality alert: active",
    "- Issued 2025-08-25, 04:50 (Atlantic time).",
    `- The archived message: ${MONCTON.alerts.airQuality.alert.url}`,
    "Burn status: ban in effect",
    "- Source: Government of New Brunswick, news release of 2025-08-25.",
    "- The news release: https://www.gnb.ca/en/news/n-b.2025.08.most-restrictions-on-crown-land-to-be-lifted-tonight.html",
    "- Recorded winds for the replay, downloaded 2026-09-26.",
    "- Open-Meteo: https://open-meteo.com/en/docs/gfs-api",
    "- Do you see flames? No",
    "- Is anything burning nearby? Nothing",
    "Result: Caller reports no fire nearby. This fits the known smoke from the Long Lake fire, 159 km away.",
  ]) expect(lines).toContain(line);
  expect(lines.at(-1)).toBe(BANNER);
  expect(copied).not.toMatch(/[  ‑]/); // plain spaces and hyphens for a call-taking system

  // "See the notes" shows what was copied, word for word.
  const show = page.getByRole("button", { name: "See the notes" });
  await expect(show).toHaveAttribute("aria-expanded", "false");
  await show.click();
  await expect(show).toHaveAttribute("aria-expanded", "true");
  expect((await page.getByLabel("Call notes").inputValue()).split("\n")).toEqual(lines);
  await expect(page.getByLabel("Call notes")).toHaveAttribute("readonly", "");
  // Another answer changes the notes: "Copied" no longer stands.
  await page.getByRole("button", { name: "Change the answer to question 3" }).click();
  await expect(page.locator(".d-notes .d-status")).toHaveText("");
});

test("Copy for call notes where the browser refuses: the notes open, selected, ready for Ctrl+C", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) } }));
  await openReplay(page, "Monc");
  await page.getByRole("button", { name: "Copy for call notes" }).click();
  await expect(page.locator(".d-notes .d-status")).toHaveText("The browser did not allow the copy. The notes are selected below: press Ctrl+C.");
  const notes = page.getByLabel("Call notes");
  await expect(notes).toBeVisible();
  await expect(notes).toBeFocused();
  expect(await notes.evaluate((el: HTMLTextAreaElement) => el.selectionEnd - el.selectionStart === el.value.length && el.value.length > 500)).toBe(true);
});

test("surge mode: a known smoke event drafts the message in English and French with its image, and posts nothing", async ({ page }) => {
  await standInClipboard(page);
  const requests: { method: string; url: string }[] = [];
  page.on("request", (request) => requests.push({ method: request.method(), url: request.url() }));
  await openReplay(page, "Monc");

  // Not marked: no message, no image.
  const mark = page.getByRole("button", { name: "Mark as a known smoke event" });
  await expect(mark).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".d-draft")).toHaveCount(0);
  await expect(card(page).locator(".d-known-mark")).toHaveCount(0);

  await mark.click();
  await expect(mark).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".d-marked")).toHaveText("Marked for Moncton: Long Lake fire.");
  await expect(card(page).locator(".d-known-mark")).toHaveText("Marked: known smoke event");
  await expect(page.getByText("Nothing is posted for you. Read each message, change what you need, then copy the text and download the image to post them yourself.")).toBeVisible();

  // Both languages, side by side, whatever the board's language: each in a box that can be typed in.
  const en = page.getByLabel("Message in English");
  const fr = page.getByLabel("Message in French");
  await expect(en).toHaveValue(EN_MESSAGE);
  await expect(fr).toHaveValue(FR_MESSAGE);
  await expect(en).toHaveAttribute("lang", "en");
  await expect(fr).toHaveAttribute("lang", "fr");
  await expect(en).toBeEditable();
  await expect(page.locator('.d-draft[data-lang="en"] .d-hint')).toHaveText(`${EN_MESSAGE.length} characters`);

  // The image: 1200 × 675, the card in the drifting-smoke orange on the left, the map on the right, and the 911
  // sentence on navy across the bottom. Described in words for a screen reader, and for the post's alt text.
  for (const [code, canvas] of [["en", page.locator('.d-draft[data-lang="en"] canvas')], ["fr", page.locator('.d-draft[data-lang="fr"] canvas')]] as const) {
    expect(await canvas.evaluate((el: HTMLCanvasElement) => [el.width, el.height])).toEqual([1200, 675]);
    await expect.poll(() => pixel(canvas, 12, 12)).toEqual([232, 89, 12]);
    expect(await pixel(canvas, 12, 660)).toEqual([27, 42, 74]);
    expect(await pixel(canvas, 1190, 660)).toEqual([27, 42, 74]);
    // The map: land, water and ink, none of it the card's orange or the page's cream.
    const mapColours = await canvas.evaluate((el: HTMLCanvasElement) => {
      const data = el.getContext("2d")!.getImageData(540, 20, 640, 500).data;
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i += 4 * 97) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      return [...seen];
    });
    expect(mapColours).toContain("216,227,238"); // water
    expect(mapColours).toContain("239,231,218"); // land
    expect(mapColours).not.toContain("232,89,12");
    await expect(canvas).toHaveAttribute("role", "img");
    await expect(canvas).toHaveAttribute("aria-label", code === "en" ? /^Drifting smoke.*A map shows the smoke’s path from the Long Lake fire to Moncton\. If you see flames or smoke from a building or vehicle, call 911\.$/ : /^Fumée qui dérive.*appelez le 911\.$/);
  }
  await expect(page.locator('.d-draft[data-lang="en"] .d-alt')).toContainText("Image description, for the post’s alt text: Drifting smoke");

  // The message can be changed; the first draft is one button away.
  await expect(page.getByRole("button", { name: "Back to the first draft" })).toHaveCount(0);
  await en.fill("Smoke over Moncton this morning is from the Long Lake fire in Nova Scotia. See flames? Call 911.");
  await page.locator('.d-draft[data-lang="en"]').getByRole("button", { name: "Copy the text" }).click();
  await expect(page.locator('.d-draft[data-lang="en"] .d-status')).toHaveText("Copied.");
  expect(await lastCopied(page)).toBe("Smoke over Moncton this morning is from the Long Lake fire in Nova Scotia. See flames? Call 911.");
  await expect(fr).toHaveValue(FR_MESSAGE);

  // Unmarked, then marked again: the message is as the person left it.
  await mark.click();
  await expect(mark).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".d-draft")).toHaveCount(0);
  await expect(card(page).locator(".d-known-mark")).toHaveCount(0);
  await mark.click();
  await expect(en).toHaveValue("Smoke over Moncton this morning is from the Long Lake fire in Nova Scotia. See flames? Call 911.");
  await page.getByRole("button", { name: "Back to the first draft" }).click();
  await expect(en).toHaveValue(EN_MESSAGE);
  await expect(page.getByRole("button", { name: "Back to the first draft" })).toHaveCount(0);

  // The image is saved by the person's own click, as a PNG named for the town, the day and the language.
  for (const [code, name] of [["en", "smoke-moncton-2025-08-25-en.png"], ["fr", "fumee-moncton-2025-08-25-fr.png"]] as const) {
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator(`.d-draft[data-lang="${code}"]`).getByRole("button", { name: "Download the image" }).click()]);
    expect(download.suggestedFilename()).toBe(name);
    const file = readFileSync(await download.path());
    expect(file.subarray(1, 4).toString()).toBe("PNG");
    expect([file.readUInt32BE(16), file.readUInt32BE(20)]).toEqual([1200, 675]);
  }

  // Nothing was posted, and nothing left for anywhere but this site and its typeface: no request carries the message.
  expect(requests.filter((r) => r.method !== "GET")).toEqual([]);
  const hosts = [...new Set(requests.filter((r) => !r.url.startsWith("blob:") && !r.url.startsWith("data:")).map((r) => new URL(r.url).host))];
  expect(hosts.filter((host) => ![new URL(page.url()).host, "fonts.googleapis.com", "fonts.gstatic.com"].includes(host))).toEqual([]);
  // No form, and no link to a social network: copying and downloading are the only ways out.
  await expect(page.locator("form")).toHaveCount(0);
  const linked = await page.locator("a[href^='http']").evaluateAll((links) => links.map((a) => new URL((a as HTMLAnchorElement).href).hostname));
  expect(linked.filter((host) => /(^|\.)(twitter\.com|x\.com|facebook\.com|instagram\.com|linkedin\.com|threads\.net|bsky\.app)$/.test(host))).toEqual([]);
});

test("surge mode: the mark shows on another town's answer for the same fire, and the message can be drafted again for it", async ({ page }) => {
  await openReplay(page, "Monc");
  await page.getByRole("button", { name: "Mark as a known smoke event" }).click();
  await page.getByLabel("Message in English").fill("My own words.");

  // The next caller is in Dieppe: same fire. The card says the event is marked; the message is still Moncton's, as
  // edited, until the person asks for Dieppe's.
  await check(page, "Diep");
  await expect(card(page).locator(".d-known-for")).toContainText("Dieppe, NB");
  await expect(card(page).locator(".d-known-mark")).toHaveText("Marked: known smoke event");
  await expect(page.locator(".d-marked")).toHaveText("Marked for Moncton: Long Lake fire.");
  await expect(page.getByLabel("Message in English")).toHaveValue("My own words.");
  await page.getByRole("button", { name: "Draft again for Dieppe" }).click();
  await expect(page.locator(".d-marked")).toHaveText("Marked for Dieppe: Long Lake fire.");
  await expect(page.getByLabel("Message in English")).toHaveValue(/^The smoke in Dieppe today comes from the Long Lake fire in Nova Scotia, 158 km away\. If you see flames or smoke from a building or vehicle, call 911\./);
  await expect(page.getByRole("button", { name: /^Draft again/ })).toHaveCount(0);

  // Bathurst's smoke is from another fire: its card carries no mark.
  await check(page, "Bath");
  await expect(card(page).locator(".d-known-for")).toContainText("Bathurst, NB");
  await expect(card(page).locator(".d-known-mark")).toHaveCount(0);
});

test("surge mode drafts nothing when the trace names no known fire, or when the fire is close", async ({ page }) => {
  await openReplay(page);
  const surge = page.locator(".d-surge");
  await expect(surge.locator(".d-why")).toHaveText("A draft needs an answer first: type the caller’s town.");
  await expect(surge.getByRole("button")).toHaveCount(0);

  // Fredericton: unexplained smoke. Saint John: unclear.
  for (const [typed, town] of [["Fred", "Fredericton"], ["Saint", "Saint John"]]) {
    await check(page, typed);
    await expect(surge.locator(".d-why")).toHaveText(`No draft for ${town}: the trace does not link the smoke there to a known fire.`);
    await expect(surge.getByRole("button")).toHaveCount(0);
  }
  // Bridgetown is 17 km from the Long Lake fire: the card says the fire is close, and no message about distant smoke
  // is drafted.
  await check(page, "Bridg");
  await expect(card(page).locator(".d-known-note")).toHaveText("This fire is close to the caller’s town: 17 km.");
  await expect(surge.locator(".d-why")).toHaveText("No draft for Bridgetown: the fire is close (17 km). People there need official instructions, not a message about distant smoke.");
  await expect(surge.getByRole("button")).toHaveCount(0);
  await expect(page.locator(".d-draft")).toHaveCount(0);
});

test("unexplained smoke and unclear: the result never reads as a no", async ({ page }) => {
  await openReplay(page, "Fred");
  await expect(page.locator(".d-facts > li h4")).toHaveText(["Fire detections: none near the air’s path", "ECCC air quality alert: none in effect", "Burn status: ban in effect", "Wind trace"]);
  await expect(fact(page, "fire")).toHaveAttribute("data-tone", "none");
  await answer(page, ["no", "haze", "nothing"]);
  await expect(result(page).getByRole("heading")).toHaveText("Result: Caller reports no fire nearby");
  await expect(result(page).locator("p")).toHaveText("No known fire explains this smoke. A new fire can take hours to show up in satellite data.");
  await page.getByRole("button", { name: "New call" }).click();
  await check(page, "Saint");
  await answer(page, ["no", "smell", "nothing"]);
  await expect(result(page).locator("p")).toHaveText("The trace is unclear: it may be smoke from the Long Lake fire, or something close by.");
  expect(await page.locator("body").innerText()).not.toMatch(NO_RESPONSE);
});

test("French: the board, the script, the result and the notes; the two messages stay in their own languages", async ({ page }) => {
  await standInClipboard(page);
  await openReplay(page, "Monc");
  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator(".d-banner")).toHaveText("Aide à la décision seulement. Votre protocole de répartition prévaut.");
  await expect(page.locator(".d-replay")).toHaveText(`Reprise${NBSP}· 25 août 2025. Données enregistrées, pas celles d’aujourd’hui.`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tableau de répartition");
  await expect(page).toHaveTitle(`Tableau de répartition${NBSP}· Fumée ou feu${NBSP}?`);
  await expect(placeBox(page)).toHaveAccessibleName("Ville ou village de la personne qui appelle");
  await expect(card(page).getByRole("heading", { level: 3 })).toHaveText(`Fumée qui dérive${NBSP}· Feu de Long${NBSP}Lake${NBSP}· 159 km SSO`);
  await expect(card(page).locator(".d-known-for")).toHaveText(`Moncton, N.-B.${NBSP}· vérifié le 2025-08-25, 9 h 00 (heure de l’Atlantique)`);
  await expect(page.locator(".d-facts > li h4")).toHaveText(["Détection satellite du feu", `Alerte de qualité de l’air d’ECCC${NBSP}: en vigueur`, `Brûlage${NBSP}: interdiction en vigueur`, "Trajet du vent"]);
  await expect(fact(page, "burn").getByRole("link", { name: /Le communiqué/ })).toHaveAttribute("href", /^https:\/\/www\.gnb\.ca\/fr\/nouvelles\//);
  await expect(page.locator(".d-question")).toContainText([`Voyez-vous des flammes${NBSP}?`, `À quoi ressemble le ciel${NBSP}:`, `Est-ce que quelque chose brûle près de vous${NBSP}?`]);

  await answer(page, ["notSure"]);
  await expect(result(page).getByRole("heading")).toHaveText(`Résultat${NBSP}: Répartir`);
  await expect(result(page).locator("p")).toHaveText(`Un oui ou un «${NBSP}je ne sais pas${NBSP}»${NBSP}: il y a peut-être un feu près de la personne qui appelle.`);

  await page.getByRole("button", { name: "Copier pour les notes d’appel" }).click();
  await expect(page.locator(".d-notes .d-status")).toHaveText("Copié. Collez-le dans vos notes d’appel.");
  const copied = (await lastCopied(page))!;
  expect(copied).toContain("Lieu : Moncton, N.-B.\nVérifié : 2025-08-25, 9 h 00 (heure de l’Atlantique)");
  expect(copied).toContain("- Voyez-vous des flammes ? Je ne sais pas\nRésultat : Répartir.");
  expect(copied.split("\n").at(-1)).toBe("Aide à la décision seulement. Votre protocole de répartition prévaut.");

  await page.getByRole("button", { name: "Marquer comme épisode de fumée connu" }).click();
  await expect(page.getByLabel("Message en anglais")).toHaveValue(EN_MESSAGE);
  await expect(page.getByLabel("Message en français")).toHaveValue(FR_MESSAGE);
  await expect(page.locator(".d-marked")).toHaveText(`Marqué pour Moncton${NBSP}: Feu de Long${NBSP}Lake.`);
  expect(await page.locator("body").innerText()).not.toMatch(NO_RESPONSE);
});

test("nothing about a call is stored: no place, answer or draft in the browser's storage, and a reload starts empty", async ({ page, context }) => {
  await openReplay(page, "Monc");
  await answer(page, ["no", "haze", "nothing"]);
  await page.getByRole("button", { name: "Mark as a known smoke event" }).click();
  await page.getByLabel("Message in English").fill("A draft that must not be kept anywhere.");
  await expect(page.getByText("Nothing about a call is stored or sent: the place, the answers and the drafts stay on this screen, and are gone when it closes.")).toBeVisible();

  const stored = await page.evaluate(() => ({ session: { ...sessionStorage }, local: { ...localStorage }, cookie: document.cookie }));
  // The app keeps the language and live-or-replay for the tab, as on every screen, and no place.
  expect(Object.keys(stored.session)).toEqual(["smoke-or-fire"]);
  expect(JSON.parse(stored.session["smoke-or-fire"])).toEqual({ mode: "replay", lang: "en", place: null, shared: null });
  expect(stored.local).toEqual({});
  expect(stored.cookie).toBe("");
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(async () => (indexedDB.databases ? (await indexedDB.databases()).length : 0))).toBe(0);
  expect(JSON.stringify(stored)).not.toMatch(/Moncton|haze|draft|smoke in/i);

  await page.reload();
  await expect(placeBox(page)).toHaveValue("");
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator(".d-given")).toHaveCount(0);
  await expect(page.locator(".d-draft")).toHaveCount(0);
  await expect(page.locator(".d-empty")).toHaveText("Type the caller’s town to see the answer here.");
});

test("live: the engine is asked about the town; burn status is not checked; a failure says not checked, never no fire", async ({ page }) => {
  const live = { ...MONCTON, mode: "live", time: new Date().toISOString().replace(/\.\d+Z$/, "Z"), wind: { ...MONCTON.wind, run: "2026-10-03T18:00:00Z", recordedAt: null } };
  const asked: URLSearchParams[] = [];
  let fail = true;
  await page.route(`${TEST_ENGINE_URL}/verdict**`, (route: Route) => {
    const query = new URL(route.request().url()).searchParams;
    asked.push(query);
    if (fail) return route.fulfill({ status: 503, json: { error: "wind not loaded" }, headers: { "access-control-allow-origin": "*" } });
    return route.fulfill({ json: { ...live, location: { ...live.location, lat: Number(query.get("lat")), lon: Number(query.get("lon")) } }, headers: { "access-control-allow-origin": "*" } });
  });
  await page.goto("/dispatch?mode=live");
  await expect(page.locator(".d-banner")).toHaveText(BANNER);
  await expect(page.locator(".d-replay")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Live", exact: true })).toHaveAttribute("aria-pressed", "true");

  // Live covers every Maritimes community. The engine does not answer: not checked, and that is not "no fire".
  await placeBox(page).fill("Shedi");
  await expect(page.getByRole("option").first()).toHaveText(/^Shediac, NB/);
  await placeBox(page).press("Enter");
  await expect(page.locator(".d-error")).toContainText("Not checked");
  await expect(page.locator(".d-error")).toContainText("That does not mean there is no fire.");
  await expect(card(page)).toHaveCount(0);
  // The questions do not wait for the answer: no flames, haze, nothing burning, with the source not checked.
  await answer(page, ["no", "haze", "nothing"]);
  await expect(result(page).locator("p")).toHaveText("The smoke’s source could not be checked. That does not mean there is no fire.");

  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(card(page).getByRole("heading", { level: 3 })).toHaveText(`Drifting smoke${NBSP}· Long Lake fire${NBSP}· 159 km SSW`);
  expect(asked).toHaveLength(2);
  expect([asked[1].get("mode"), Number(asked[1].get("lat")).toFixed(1), Number(asked[1].get("lon")).toFixed(1)]).toEqual(["live", "46.2", "-64.5"]);
  await expect(card(page).locator(".d-known-for")).toContainText("Shediac, NB");
  await expect(result(page).locator("p")).toHaveText("This fits the known smoke from the Long Lake fire, 159 km away.");

  // No curated record covers today: burn status is not checked, with New Brunswick's own page to look at. A fire pit
  // then keeps the public app's two conditions.
  await expect(fact(page, "burn")).toHaveAttribute("data-tone", "notChecked");
  await expect(fact(page, "burn").locator("h4")).toHaveText("Burn status: not checked");
  await expect(fact(page, "burn")).toContainText("The board does not check burn bans for this day. That does not mean burning is allowed.");
  await expect(fact(page, "burn").getByRole("link")).toHaveAttribute("href", "https://www.gnb.ca/en/emergency/fire-watch.html");
  expect(await fact(page, "burn").locator(".d-fact-icon").evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe("dashed");
  await page.getByRole("button", { name: "Change the answer to question 3" }).click();
  await answer(page, ["firePit"]);
  await expect(result(page)).toHaveAttribute("data-kind", "firePit");
  await expect(result(page).getByRole("heading")).toHaveText("Result: Fire pit or bonfire nearby");
  await expect(result(page).locator("p")).toHaveText("Dispatch if it is out of control, or if burning is banned. Burn status: not checked.");

  // Switching to the replay starts the board again: another day's answer is never left on the screen.
  await page.getByRole("button", { name: /^Replay/ }).click();
  await expect(page.locator(".d-replay")).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  await expect(result(page)).toHaveCount(0);
  await expect(placeBox(page)).toHaveValue("");
});

test("the first public screen has no link to the board; the board links back, with when to call 911", async ({ page }) => {
  // No public screen's code names the board's address either (src/dispatch/board.test.ts).
  await page.goto("/?mode=replay");
  await expect(page.getByRole("link", { name: "I smell smoke" })).toBeVisible();
  await expect(page.locator('a[href*="dispatch"]')).toHaveCount(0);
  await openReplay(page);
  await expect(page.getByText("Not a call taker? If you see flames or a smoke column, call 911.")).toBeVisible();
  await page.getByRole("link", { name: "Open the public app" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Smoke or Fire?" })).toBeVisible();
  await expect(page).toHaveTitle(/^Smoke or Fire\?/);
  expect(await page.locator('meta[name="robots"]').count()).toBe(0);
});

test("one h1, headings in order, Listen on the page, and a name on every control", async ({ page }) => {
  await openReplay(page, "Monc");
  await answer(page, ["yes"]);
  await page.getByRole("button", { name: "Mark as a known smoke event" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const levels = await page.locator("h1, h2, h3, h4").evaluateAll((els) => els.map((el) => Number(el.tagName[1])));
  levels.forEach((level, i) => expect(level - (levels[i - 1] ?? 0), `heading ${i}`).toBeLessThanOrEqual(1));
  await expect(page.getByRole("button", { name: "Listen" })).toBeVisible();
  const unnamed = await page.locator("button, a, input, textarea").evaluateAll((els) =>
    els.filter((el) => !(el.getAttribute("aria-label") || el.textContent?.trim() || (el as HTMLInputElement).labels?.length)).map((el) => el.outerHTML.slice(0, 80)),
  );
  expect(unnamed).toEqual([]);
});

// 1366 × 768 at 200% zoom is 683 × 384; 1280 wide at 400% is 320 (WCAG 1.4.10).
for (const [name, width, height] of [["a desk screen", 1366, 768], ["200% zoom", 683, 384], ["a phone", 390, 844], ["400% zoom", 320, 256]] as const) {
  test(`${name} (${width} × ${height}): no sideways scrolling, and every word 18 px or more`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openReplay(page, "Monc");
    for (const lang of ["en", "fr"] as const) {
      if (lang === "fr") await page.getByRole("button", { name: "Français" }).click();
      const states = [
        () => answer(page, ["no", "haze"]),
        () => answer(page, ["firePit"]),
        () => page.locator(".d-mark").click(),
        () => page.locator(".d-notes button[aria-controls]").click(),
      ];
      for (const next of states) {
        await next();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        const small = await page.locator(".dispatch").evaluate((root) => {
          const found: string[] = [];
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const el = node.parentElement!;
            if (!node.textContent?.trim() || el.closest("[hidden]")) continue;
            if (parseFloat(getComputedStyle(el).fontSize) < 18) found.push(`${getComputedStyle(el).fontSize} ${node.textContent.trim().slice(0, 40)}`);
          }
          return found;
        });
        expect(small).toEqual([]);
      }
      // Back to the start for the next language.
      await page.locator(".d-mark").click();
      await page.locator(".d-notes button[aria-controls]").click();
      await page.locator(".d-script-head button").click();
    }
  });
}
