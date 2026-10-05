// "If you’re told to leave": it asks where you are (unless a place was chosen this session), then shows the Long Lake
// centres within 40 km of the fire (replay, Aug 25, 2025), says the evacuation doesn't apply farther away, and in live
// mode says where officials announce centres. Entry points on Emergency and the near-fire verdict notice. The two demo
// scenarios, EN and FR. Everything to act on is a large button with an icon and words; near the fire nothing opens a
// web page or a maps app; "What to take" is a list to tick, kept on the phone until the page is closed.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { answer as tap } from "./look";
import { navigations, texts } from "./navigations";
import { openWhy } from "./verdict";
import { toFrench } from "./language";

const NBSP = String.fromCharCode(0xa0);
const NAVY = "rgb(27, 42, 74)";
const WHITE = "rgb(255, 255, 255)";
const BRIDGETOWN = "44.84158,-65.29121"; // NRCan CGNDB
const sms = (body: string) => `sms:?&body=${encodeURIComponent(body)}`;
/** "Call 211 · Shelters and help", whatever the kind of space before its dot. */
const CALL_211 = { en: /^Call 211\s· Shelters and help$/, fr: /^Appeler le\s211\s· Hébergement et aide$/ };
/** The phone numbers the page tried to dial. */
const calls = (urls: string[]) => urls.filter((url) => url.startsWith("tel:"));
/** Every link in main that opens a web page or a maps app: all but a phone call, a text message, and the app's own screens. */
const linksOut = (page: Page) => page.locator('main a:not([href^="tel:"]):not([href^="sms:"]):not([href^="/"])');
/** A button: its background, its edge, its height, and how many drawings it holds. */
const look = (locator: Locator) =>
  locator.evaluate((el) => {
    const st = getComputedStyle(el);
    return { background: st.backgroundColor, edge: `${st.borderTopWidth} ${st.borderTopColor}`, height: Math.round(el.getBoundingClientRect().height), icons: el.querySelectorAll("svg").length };
  });
const OK_EN = "I’m OK. There’s a fire near me and I’m following official instructions.";
const OK_FR = "Je vais bien. Il y a un feu près de moi et je suis les consignes officielles.";

const L = {
  en: {
    cta: "I smell smoke", q1: "Do you see flames?", q2: "Which looks like your sky?", q3: "Is anything burning nearby?", emergency: "Call 911 now",
    entry: "Told to leave your home? What to do", where: "Where are you?", town: "Town or city", title: "If you’re told to leave",
    near: "Evacuation centres for the Long Lake fire (Annapolis County)", route: "Follow the route officials give. Roads may be closed.",
    away: ["About 21 km northeast of you", "Less than 1 km from you"],
    line: `Drifting smoke${NBSP}· Long Lake fire${NBSP}· 159 km SSW`,
    drifting: "DRIFTING SMOKE", headline: "Likely from the Long Lake fire", banner: `Replay${NBSP}· Bridgetown${NBSP}·`,
  },
  fr: {
    cta: "Je sens de la fumée", q1: /^Voyez-vous des flammes\s\?$/, q2: /^Quelle image ressemble à votre ciel\s\?$/, q3: /^Est-ce que quelque chose brûle près de vous\s\?$/, emergency: "Appelez le 911 maintenant",
    entry: /^On vous demande de partir\s\? Que faire$/, where: /^Où êtes-vous\s\?$/, town: "Ville ou village", title: "Si on vous demande de partir",
    near: "Centres d’évacuation pour le feu de Long Lake (comté d’Annapolis)", route: "Suivez l’itinéraire donné par les autorités. Des routes peuvent être fermées.",
    away: ["À environ 21 km au nord-est de vous", "À moins de 1 km de vous"],
    line: `Fumée qui dérive${NBSP}· Feu de Long${NBSP}Lake${NBSP}· 159 km SSO`,
    drifting: "FUMÉE QUI DÉRIVE", headline: "Elle vient probablement du feu de Long Lake", banner: `Reprise${NBSP}· Bridgetown${NBSP}·`,
  },
};

/** Open the app in a mode and language, once the mode is saved (so page.goto keeps it). */
async function start(page: Page, mode: "replay" | "live", lang: "en" | "fr" = "en") {
  await page.goto(`/?mode=${mode}`);
  await page.waitForFunction((m) => sessionStorage.getItem("smoke-or-fire")?.includes(`"mode":"${m}"`), mode);
  if (lang === "fr") await toFrench(page);
}

/** Answer "Where are you?" on the screen by searching a town. */
async function answer(page: Page, town: string) {
  await page.locator("#leave-search").fill(town);
  await page.getByRole("option", { name: new RegExp(`^${town},`) }).first().click();
}

/** The screen, in a mode and language, for a town (or with the question still open). */
async function openLeave(page: Page, mode: "replay" | "live", lang: "en" | "fr" = "en", town?: string) {
  await start(page, mode, lang);
  await page.goto("/leave");
  if (town) await answer(page, town);
}

/** A replay check for a town, so a place is chosen this session. */
async function replayCheck(page: Page, town: string, lang: "en" | "fr" = "en") {
  await start(page, "replay", lang);
  await page.goto("/location");
  await page.locator("input[type=search]").fill(town);
  await page.getByRole("option", { name: new RegExp(`^${town},`) }).first().click();
  await expect(page).toHaveURL(/\/verdict$/, { timeout: 10_000 });
}

/** Each screen of a demo has its Listen button. */
const listen = (page: Page, lang: "en" | "fr") => expect(page.getByRole("button", { name: lang === "en" ? "Listen" : "Écouter", exact: true })).toBeVisible();

async function scenario1(page: Page, lang: "en" | "fr") {
  const l = L[lang];
  await start(page, "replay", lang);
  await listen(page, lang);
  await page.getByRole("link", { name: l.cta }).click();
  // The three questions: no flames, grey haze, nothing burning nearby.
  for (const [question, key] of [[l.q1, "no"], [l.q2, "haze"], [l.q3, "nothing"]] as const) {
    await expect(page.getByRole("heading", { name: question })).toBeVisible();
    await listen(page, lang);
    await tap(page, key);
  }
  await expect(page.getByRole("heading", { name: l.where })).toBeVisible();
  await listen(page, lang);
  await page.getByLabel(l.town).fill("Monc");
  await page.getByRole("option", { name: /^Moncton,/ }).click();
  await expect(page).toHaveURL(/\/verdict$/, { timeout: 10_000 });
  // As the screen opens, the glance card: the answer in one line, as the screen's title.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(l.line);
  await listen(page, lang);
  // Behind "Why?", the band's words: its label and its headline.
  await openWhy(page);
  const label = page.locator("section[aria-labelledby=answer-h] > p:first-child");
  await expect(label).toBeVisible();
  await expect(label).toHaveText(l.drifting);
  await expect(page.locator("h2#answer-h")).toHaveText(l.headline);
}

async function scenario2(page: Page, lang: "en" | "fr") {
  const l = L[lang];
  await start(page, "replay", lang);
  await page.getByRole("link", { name: l.cta }).click();
  await expect(page.getByRole("heading", { name: l.q1 })).toBeVisible();
  await tap(page, "yes"); // flames: the first question ends it
  await expect(page.getByRole("heading", { name: l.emergency })).toBeVisible();
  await listen(page, lang);
  await page.getByRole("link", { name: l.entry }).click();

  await expect(page).toHaveURL(/\/leave$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(l.title);
  await expect(page.getByRole("heading", { name: l.where })).toBeVisible(); // "I smell smoke" started a new check: no place yet
  await listen(page, lang);
  await page.getByLabel(l.town).fill("Bridge");
  await page.getByRole("option", { name: /^Bridgetown,/ }).click();

  await expect(page.getByRole("heading", { name: l.near })).toBeVisible();
  await expect(page.getByText(l.banner)).toBeVisible();
  await expect(page.getByRole("heading", { name: l.where })).toHaveCount(0);
  await listen(page, lang);
  // Where each centre is from Bridgetown, in words beside an arrow; and the line that stands where "Get directions"
  // was. No route is handed to a maps app, and nothing here opens a web page.
  await expect(page.locator("main .leave-route")).toHaveText(l.route);
  await expect(page.locator("section[aria-labelledby=reception-h] .leave-away")).toHaveText(l.away[0]);
  await expect(page.locator("section[aria-labelledby=comfort-h] .leave-away")).toHaveText(l.away[1]);
  await expect(linksOut(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: CALL_211[lang] })).toHaveAttribute("href", "tel:211");
  const reception = page.locator("section[aria-labelledby=reception-h] .leave-away");
  await reception.scrollIntoViewIfNeeded();
  await expect(reception).toBeVisible();

  if (lang === "en") {
    await page.getByRole("link", { name: "Back" }).click();
    await expect(page.getByRole("heading", { name: l.emergency })).toBeVisible();
  }
}

for (const lang of ["en", "fr"] as const) {
  test(`Scenario 1 (${lang.toUpperCase()}): Replay → I smell smoke → No flames → Grey haze → Nothing nearby → Moncton → drifting verdict`, ({ page }) => scenario1(page, lang));
  test(`Scenario 2 (${lang.toUpperCase()}): Replay → I smell smoke → Yes → Emergency → Told to leave → Bridgetown → centres, how far and which way, and no link out`, ({ page }) => scenario2(page, lang));
}

test.describe("the demo scenarios on a small phone, 375 × 667", () => {
  test.use({ viewport: { width: 375, height: 667 } });
  for (const lang of ["en", "fr"] as const) {
    test(`Scenario 1 (${lang.toUpperCase()}) at 375 × 667`, ({ page }) => scenario1(page, lang));
    test(`Scenario 2 (${lang.toUpperCase()}) at 375 × 667`, ({ page }) => scenario2(page, lang));
  }
});

// Verdicts with the fire under 25 km away: a notice under the glance card links to this screen, for that town.
for (const [town, lang] of [["Bridgetown", "en"], ["West Dalhousie", "en"], ["Bridgetown", "fr"]] as const) {
  test(`verdict, ${town} (${lang.toUpperCase()}): the fire-is-close notice, and its link opens the centres for ${town}`, async ({ page }) => {
    await replayCheck(page, town, lang);
    const notice = page.locator("main > section").first(); // first under the card, in front of the badges and "Why?"
    await expect(notice).toContainText(lang === "en"
      ? "The fire is close to you. Follow official instructions, and call 911 if you see flames or thick smoke rising."
      : "Le feu est près de vous. Suivez les consignes des autorités et appelez le 911 si vous voyez des flammes ou de la fumée épaisse qui monte.");
    // Shown as the screen opens, with nothing tapped.
    await expect(notice).toBeVisible();
    await expect(page.locator("main .why-toggle")).toHaveAttribute("aria-expanded", "false");
    await openWhy(page); // the map and its legend are behind "Why?"
    await expect(page.getByText(lang === "en" ? `You (${town})` : `Vous (${town})`)).toBeVisible(); // named as picked, not "Lawrencetown"
    await expect(page.getByText(/\b0 km|moins de 0/)).toHaveCount(0);
    await notice.getByRole("link", { name: L[lang].entry }).click();
    await expect(page).toHaveURL(/\/leave$/);
    await expect(page.getByRole("heading", { name: L[lang].near })).toBeVisible();
    await expect(page.getByText(lang === "en" ? `You (${town})` : `Vous (${town})`)).toBeVisible();
  });
}

test("a verdict is never shown under another town's name: Change on the leave screen forgets it", async ({ page }) => {
  await replayCheck(page, "Bridgetown");
  await page.locator("main > section").first().getByRole("link", { name: L.en.entry }).click();
  await page.getByRole("button", { name: "Not in Bridgetown? Change" }).click();
  await answer(page, "Moncton");
  await expect(page.getByText(/doesn’t apply to you\.$/)).toBeVisible();
  await page.getByRole("link", { name: "Back" }).click(); // to /verdict, whose result was Bridgetown's
  await expect(page.getByText("You (Moncton)")).toHaveCount(0);
  await expect(page.getByText("The fire is close to you.", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "I smell smoke" })).toBeVisible(); // back at Check, to start a new check
});

test.describe("replay, Use my location near Bridgetown", () => {
  test.use({ geolocation: { latitude: 44.85, longitude: -65.3 }, permissions: ["geolocation"] });
  test("the verdict names the replay town it is for, as the banner does", async ({ page }) => {
    await start(page, "replay");
    await page.goto("/location");
    await page.getByRole("link", { name: "Use my location" }).click();
    await expect(page).toHaveURL(/\/verdict$/, { timeout: 10_000 });
    await expect(page.getByText(L.en.banner)).toBeVisible();
    await openWhy(page); // the map and its legend are behind "Why?"
    await expect(page.getByText("You (Bridgetown)")).toBeVisible();
    await expect(page.getByText(/Lawrencetown/)).toHaveCount(0);
  });
});

test.describe("375 × 667, verdict notice", () => {
  test.use({ viewport: { width: 375, height: 667 } });
  test("the notice link, when focused, is not hidden under the 911 bar", async ({ page }) => {
    await replayCheck(page, "Bridgetown", "fr");
    const link = page.locator("main > section").first().getByRole("link");
    await page.keyboard.press("Tab"); // start keyboard navigation, then move focus to the link
    await link.focus();
    const bar = (await page.locator('a[href="tel:911"]').locator("..").boundingBox())!;
    const box = (await link.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y);
    expect(box.y).toBeGreaterThanOrEqual(0);
  });
});

test("replay, Halifax, French: “à 128 km d’Halifax”", async ({ page }) => {
  await replayCheck(page, "Halifax", "fr");
  await page.goto("/leave");
  await expect(page.getByText("L’évacuation liée au feu de Long Lake, à 128 km d’Halifax, ne s’applique pas à vous.")).toBeVisible();
});

test("verdict, Moncton: no fire-is-close notice (the fire is 159 km away)", async ({ page }) => {
  await replayCheck(page, "Moncton");
  await openWhy(page); // all the screen says is shown: getByRole skips what is hidden
  await expect(page.getByText("The fire is close to you.", { exact: false })).toHaveCount(0);
  await expect(page.locator("main").getByRole("link", { name: L.en.entry })).toHaveCount(0);
});

test("Check has no Told to leave button, EN and FR: the screen opens from Emergency and the near-fire notice", async ({ page }) => {
  await page.goto("/?mode=replay");
  await expect(page.locator("main").getByRole("link", { name: L.en.entry })).toHaveCount(0);
  await expect(page.locator('main a[href="/leave"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.locator("main").getByRole("link", { name: L.fr.entry })).toHaveCount(0);
  await expect(page.locator('main a[href="/leave"]')).toHaveCount(0);
});

test("a place chosen this session skips the question; Change asks again", async ({ page }) => {
  await replayCheck(page, "Moncton");
  await page.goto("/leave");
  await expect(page.getByRole("heading", { name: "Where are you?" })).toHaveCount(0);
  await expect(page.getByText(/doesn’t apply to you\.$/)).toBeVisible();
  // Change is a button with a drawing, 56 px to tap: not a text link.
  const change = page.getByRole("button", { name: "Not in Moncton? Change" });
  expect(await look(change)).toEqual({ background: WHITE, edge: `2px ${NAVY}`, height: 56, icons: 1 });
  expect(await change.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe("none");
  await change.click();
  await expect(page.getByRole("heading", { name: "Where are you?" })).toBeVisible();
  await answer(page, "Bridgetown");
  await expect(page.getByRole("heading", { name: L.en.near })).toBeVisible();
});

test("replay, Moncton: the evacuation doesn’t apply, said in one line; no centres; New Brunswick’s page as an outlined button, and Call 211 as a button that dials", async ({ page }) => {
  await replayCheck(page, "Moncton");
  await page.goto("/leave");
  // One sentence where there were two.
  await expect(page.locator("main .leave-far")).toHaveText("The evacuation for the Long Lake fire, 159 km from Moncton, doesn’t apply to you.");
  await expect(page.getByText(/This evacuation was for people|in Annapolis County/)).toHaveCount(0);
  await expect(page.getByText("For your area, officials announce where to go here:", { exact: true })).toBeVisible();

  // The province's page: white with a navy edge, 64 px or taller, the mark of a page that opens outside, its name and its site.
  const official = page.getByRole("link", { name: /^New Brunswick Fire Watch/ });
  await expect(official).toHaveAttribute("href", "https://www.gnb.ca/en/emergency/fire-watch.html");
  await expect(official).toHaveAttribute("target", "_blank");
  await expect(official).toContainText("gnb.ca");
  const page1 = await look(official);
  expect([page1.background, page1.edge, page1.icons]).toEqual([WHITE, `3px ${NAVY}`, 1]);
  expect(page1.height).toBeGreaterThanOrEqual(64);
  expect(await official.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe("none");
  // The one link out on the screen.
  await expect(linksOut(page)).toHaveCount(1);

  // Call 211: filled navy, a phone and its words, under the province's page. It dials 211.
  const call = page.getByRole("link", { name: CALL_211.en });
  await expect(call).toHaveAttribute("href", "tel:211");
  const call1 = await look(call);
  expect([call1.background, call1.icons]).toEqual([NAVY, 1]);
  expect(call1.height).toBeGreaterThanOrEqual(64);
  expect((await call.boundingBox())!.y).toBeGreaterThan((await official.boundingBox())!.y);
  const asked = await navigations(page);
  await call.click();
  await expect.poll(() => calls(asked)).toEqual(["tel:211"]);

  // No centres, map or event phone lines; no other province's page; Moncton Alerts is for live mode.
  await expect(page.locator("section[aria-labelledby=reception-h], section[aria-labelledby=comfort-h]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Get directions" })).toHaveCount(0);
  await expect(page.getByRole("img", { name: /^Map/ })).toHaveCount(0);
  await expect(page.locator('a[href^="tel:1"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Emergency Info Nova Scotia|Moncton Alerts/ })).toHaveCount(0);
  await expect(page.getByText(/Officials asked/)).toHaveCount(0);
  await expect(page.locator("section[aria-labelledby=take-h] li")).toHaveCount(6);
  await expect(page.getByRole("link", { name: "Tell family you’re OK" })).toHaveAttribute("href", sms(OK_EN));
  await expect(page.getByText(/^Centres announced/)).toHaveCount(0);
});

test("replay, Moncton, French", async ({ page }) => {
  await replayCheck(page, "Moncton", "fr");
  await page.goto("/leave");
  await expect(page.locator("main .leave-far")).toHaveText("L’évacuation liée au feu de Long Lake, à 159 km de Moncton, ne s’applique pas à vous.");
  await expect(page.getByText(`Pour votre région, les autorités annoncent où aller ici${NBSP}:`, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Indice des feux du Nouveau-Brunswick/ })).toHaveAttribute("href", "https://www.gnb.ca/fr/urgence/indice-des-feux.html");
  await expect(page.getByRole("link", { name: CALL_211.fr })).toHaveAttribute("href", "tel:211"); // 211 NB is bilingual
  await expect(page.getByRole("link", { name: "Itinéraire" })).toHaveCount(0);
  await expect(linksOut(page)).toHaveCount(1);
});

test("replay, Charlottetown (P.E.I.): doesn’t apply; no provincial page could be confirmed, so the Call 211 button only", async ({ page }) => {
  await replayCheck(page, "Charlottetown");
  await page.goto("/leave");
  await expect(page.locator("main .leave-far")).toHaveText("The evacuation for the Long Lake fire, 235 km from Charlottetown, doesn’t apply to you.");
  await expect(page.locator("main section a[target=_blank]")).toHaveCount(0);
  await expect(linksOut(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: CALL_211.en })).toHaveAttribute("href", "tel:211");
});

test("replay, Bridgetown, English: map, the route line, both centres with how far and which way, phone lines as buttons, the list to tick, text, the source in plain words, and no link out", async ({ page }) => {
  await openLeave(page, "replay", "en", "Bridgetown");
  await expect(page.getByRole("heading", { name: L.en.near })).toBeVisible();

  const map = page.getByRole("img", { name: /^Map: / });
  await expect(map).toHaveAttribute("aria-label", "Map: the Long Lake fire, the reception centre in Middleton, the comfort centre in Bridgetown, and you");
  for (const kind of ["fire", "reception", "comfort", "you"]) await expect(map.locator(`.marker-${kind}`)).toHaveCount(1);
  await expect(map.locator("polyline, line")).toHaveCount(0); // no drawn route
  for (const label of ["Long Lake fire", "Middleton", "Bridgetown", "You"]) await expect(map.getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByText("You (Bridgetown)")).toBeVisible();

  const reception = page.locator("section[aria-labelledby=reception-h]");
  await expect(reception.getByRole("heading")).toHaveText("Evacuation reception centre and shelter");
  await expect(reception).toContainText("NSCC Annapolis Valley Campus");
  await expect(reception).toContainText("295 Commercial St., Middleton");
  await expect(reception).toContainText("Showers and laundry, Wi-Fi, light food, overnight accommodation");
  await expect(reception).toContainText("Register here so officials know you’re accounted for.");
  // How far, and which way: 21 km to the northeast of Bridgetown, with an arrow turned that way (north is up, as on the map).
  const away = reception.locator(".leave-away");
  await expect(away).toHaveText("About 21 km northeast of you");
  await expect(away).toHaveAttribute("data-point", "NE");
  expect(await away.locator("svg").evaluate((el) => el.style.transform)).toBe("rotate(45deg)");
  await expect(reception.locator(".leave-announced")).toHaveText("As announced in August 2025.");

  const comfort = page.locator("section[aria-labelledby=comfort-h]");
  await expect(comfort.getByRole("heading")).toHaveText("Comfort centre");
  await expect(comfort).toContainText("Bridgetown Fire Hall");
  await expect(comfort).toContainText("31 Bay Rd., Bridgetown");
  await expect(comfort).toContainText(`Charging, Wi-Fi, light food${NBSP}· 10${NBSP}a.m. to 4${NBSP}p.m. daily`);
  // In Bridgetown itself: under a kilometre, and no direction is given (both points are approximate).
  await expect(comfort.locator(".leave-away")).toHaveText("Less than 1 km from you");
  await expect(comfort.locator(".leave-away")).toHaveAttribute("data-point", "near");
  await expect(comfort.locator(".leave-announced")).toHaveText("As announced in August 2025.");

  // No route is handed to a maps app: one line instead, between the map and the centres.
  await expect(page.getByRole("link", { name: "Get directions" })).toHaveCount(0);
  const route = page.locator("main .leave-route");
  await expect(route).toHaveText("Follow the route officials give. Roads may be closed.");
  await expect(route.locator("svg")).toHaveCount(1);
  const [mapBox, routeBox, receptionBox] = [(await map.boundingBox())!, (await route.boundingBox())!, (await reception.boundingBox())!];
  expect(routeBox.y).toBeGreaterThan(mapBox.y + mapBox.height - 1);
  expect(routeBox.y + routeBox.height).toBeLessThanOrEqual(receptionBox.y);
  await expect(page.getByText("Roads near the fire may be closed. Follow officials’ directions.")).toHaveCount(0);

  // Three phone lines, each a button with a phone and its words: 211 first (filled), then the event's own (outlined).
  const call = page.getByRole("link", { name: CALL_211.en });
  await expect(call).toHaveAttribute("href", "tel:211");
  const info = page.getByRole("link", { name: /^For updates: public information line/ });
  await expect(info).toHaveAttribute("href", "tel:18338061515");
  await expect(info).toContainText(`1-833-806-1515${NBSP}· 11${NBSP}a.m. to 7${NBSP}p.m. daily`);
  const overnight = page.getByRole("link", { name: /^Overnight accommodation: Canadian Red Cross/ });
  await expect(overnight).toHaveAttribute("href", "tel:18002229597");
  expect((await look(call)).background).toBe(NAVY);
  for (const line of [info, overnight]) {
    const shown = await look(line);
    expect([shown.background, shown.edge, shown.icons]).toEqual([WHITE, `3px ${NAVY}`, 1]);
    expect(shown.height).toBeGreaterThanOrEqual(64);
    expect(await line.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe("none");
  }
  const order = await Promise.all([call, info, overnight].map(async (line) => (await line.boundingBox())!.y));
  expect(order).toEqual([...order].sort((a, b) => a - b));

  const take = page.locator("section[aria-labelledby=take-h]");
  await expect(take).toContainText("Officials asked evacuees to take their 72-hour kit and critical items (meds, wallet, keys).");
  await expect(take.locator("li")).toHaveText(["Medication", "Wallet and ID", "Keys", "Phone and charger", "Glasses and hearing aids", "Pets"]);
  await expect(take.locator("li .take-drawing svg")).toHaveCount(6);
  await expect(take.locator("p", { hasText: "Do not delay for non-essential items." })).toHaveCSS("font-weight", "700");

  // No location shared this session: the message has no last sentence.
  await expect(page.getByRole("link", { name: "Tell family you’re OK" })).toHaveAttribute("href", sms(OK_EN));
  // Who announced the centres, and when: plain words, at the end. Not a link.
  const source = page.locator("main .leave-source");
  await expect(source).toHaveText("Centres announced by the Municipality of the County of Annapolis, August 2025.");
  expect(await source.evaluate((el) => [el.tagName, el.querySelectorAll("a").length])).toEqual(["P", 0]);
  await expect(page.getByRole("link", { name: /^Centres announced/ })).toHaveCount(0);
  // Near the fire nothing opens a web page or a maps app: no province's page, no source page, no route.
  await expect(linksOut(page)).toHaveCount(0);
  await expect(page.locator("main a[target=_blank]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Fire Watch|Emergency Info/ })).toHaveCount(0);
  // Everything to tap in main is a call, a text, the town's Change button or a tick.
  expect(await page.locator("main a").evaluateAll((links) => links.map((link) => link.getAttribute("href")!.split(":")[0]))).toEqual(["tel", "tel", "tel", "sms"]);
});

test("replay, Bridgetown, French", async ({ page }) => {
  await openLeave(page, "replay", "fr", "Bridgetown");
  await expect(page.getByRole("heading", { name: L.fr.near })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Carte/ })).toHaveAttribute("aria-label", `Carte${NBSP}: le feu de Long Lake, le centre d’accueil à Middleton, le centre de réconfort à Bridgetown et vous`);

  const reception = page.locator("section[aria-labelledby=reception-h]");
  await expect(reception.getByRole("heading")).toHaveText("Centre d’accueil des personnes évacuées et hébergement");
  await expect(reception).toContainText("Douches et buanderie, Wi-Fi, collations, hébergement pour la nuit");
  await expect(reception).toContainText("Inscrivez-vous ici pour que les autorités sachent où vous êtes.");
  await expect(reception.locator(".leave-away")).toHaveText("À environ 21 km au nord-est de vous");
  await expect(reception.locator(".leave-announced")).toHaveText("Tel qu’annoncé en août 2025.");

  const comfort = page.locator("section[aria-labelledby=comfort-h]");
  await expect(comfort.getByRole("heading")).toHaveText("Centre de réconfort");
  await expect(comfort).toContainText(`Recharge, Wi-Fi, collations${NBSP}· tous les jours de 10${NBSP}h à 16${NBSP}h`);
  await expect(comfort.locator(".leave-away")).toHaveText("À moins de 1 km de vous");

  await expect(page.getByRole("link", { name: "Itinéraire" })).toHaveCount(0);
  await expect(page.locator("main .leave-route")).toHaveText("Suivez l’itinéraire donné par les autorités. Des routes peuvent être fermées.");
  await expect(page.getByRole("link", { name: CALL_211.fr })).toHaveAttribute("href", "tel:211"); // the Nova Scotia line answers in French too
  await expect(page.getByRole("link", { name: /^Pour des mises à jour\s: ligne d’information publique/ })).toHaveAttribute("href", "tel:18338061515");
  await expect(page.getByRole("link", { name: /^Hébergement pour la nuit\s: Croix-Rouge canadienne/ })).toHaveAttribute("href", "tel:18002229597");

  const take = page.locator("section[aria-labelledby=take-h]");
  await expect(take.getByRole("heading")).toHaveText("Ce qu’il faut emporter");
  await expect(take).toContainText("Les autorités ont demandé d’emporter la trousse de 72 heures et les objets essentiels (médicaments, portefeuille, clés).");
  await expect(take.locator("li")).toHaveText(["Médicaments", "Portefeuille et pièces d’identité", "Clés", "Téléphone et chargeur", "Lunettes et appareils auditifs", "Animaux de compagnie"]);
  await expect(take.locator("p", { hasText: "Ne tardez pas pour des objets non essentiels." })).toHaveCSS("font-weight", "700");

  await expect(page.getByRole("link", { name: "Dites à vos proches que vous allez bien" })).toHaveAttribute("href", sms(OK_FR));
  await expect(page.locator("main .leave-source")).toHaveText("Centres annoncés par la Municipalité du comté d’Annapolis, août 2025.");
  await expect(linksOut(page)).toHaveCount(0);
});

test("replay, West Dalhousie: the reception centre is 29 km to the northeast and the comfort centre 15 km to the north, each with its arrow", async ({ page }) => {
  await openLeave(page, "replay", "en", "West Dalhousie");
  await expect(page.getByRole("heading", { name: L.en.near })).toBeVisible();
  const [reception, comfort] = [page.locator("section[aria-labelledby=reception-h] .leave-away"), page.locator("section[aria-labelledby=comfort-h] .leave-away")];
  await expect(reception).toHaveText("About 29 km northeast of you");
  await expect(comfort).toHaveText("About 15 km north of you");
  expect(await Promise.all([reception, comfort].map((line) => line.locator("svg").evaluate((el) => el.style.transform)))).toEqual(["rotate(45deg)", "rotate(0deg)"]);
  // The arrow is a drawing beside the words, which say the same: a screen reader is given the words alone.
  expect(await reception.locator("svg").evaluate((el) => el.closest("[aria-hidden]")?.getAttribute("aria-hidden"))).toBe("true");
});

test("replay, West Dalhousie (3 km from the fire): the centres, and your dot beside the fire marker, not on it", async ({ page }) => {
  await openLeave(page, "replay", "en", "West Dalhousie");
  await expect(page.getByRole("heading", { name: L.en.near })).toBeVisible();
  await expect(page.getByText("You (West Dalhousie)")).toBeVisible();
  const centre = async (selector: string) => { const b = (await page.locator(selector).boundingBox())!; return [b.x + b.width / 2, b.y + b.height / 2]; };
  const [fx, fy] = await centre("g.marker-fire circle");
  const [ux, uy] = await centre("g.marker-you circle:last-child");
  const scale = (await page.getByRole("img", { name: /^Map/ }).boundingBox())!.width / 358; // SVG units → CSS px
  expect(Math.hypot(ux - fx, uy - fy) / scale).toBeGreaterThanOrEqual(33.5); // marker 20 + dot 12, apart
});

test("live, Moncton: Moncton Alerts first, then New Brunswick’s page and 211", async ({ page }) => {
  await openLeave(page, "live", "en", "Moncton");
  await expect(page.getByText("For a fire happening now, officials announce where to go here:", { exact: true })).toBeVisible();
  const links = page.locator("main section a[target=_blank]");
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toHaveAttribute("href", "https://www.monctonalerts.ca/");
  await expect(links.nth(0)).toContainText("Moncton reception centres appear here when the City opens them: Moncton Alerts");
  await expect(links.nth(1)).toHaveAttribute("href", "https://www.gnb.ca/en/emergency/fire-watch.html");
  // Both are outlined buttons with the mark of a page that opens outside; Call 211 comes after them.
  for (const link of await links.all()) {
    const shown = await look(link);
    expect([shown.background, shown.edge, shown.icons]).toEqual([WHITE, `3px ${NAVY}`, 1]);
    expect(shown.height).toBeGreaterThanOrEqual(64);
  }
  await expect(page.getByRole("link", { name: CALL_211.en })).toHaveAttribute("href", "tel:211");
  // Nothing from the replay's event.
  await expect(page.getByText(/doesn’t apply|Officials asked/)).toHaveCount(0);
  await expect(page.getByRole("img", { name: /^Map/ })).toHaveCount(0);
  await expect(page.locator('a[href^="tel:1"]')).toHaveCount(0);
});

test("live, Moncton, French", async ({ page }) => {
  await openLeave(page, "live", "fr", "Moncton");
  await expect(page.getByText(`Pour un feu en cours, les autorités annoncent où aller ici${NBSP}:`, { exact: true })).toBeVisible();
  const links = page.locator("main section a[target=_blank]");
  // The City's French name and site for Moncton Alerts.
  await expect(links.nth(0)).toContainText(`Les centres d’accueil de Moncton apparaissent ici quand la Ville les ouvre${NBSP}: Alertes Moncton`);
  await expect(links.nth(0)).toHaveAttribute("href", "https://www.alertesmoncton.ca/");
  await expect(links.nth(1)).toHaveAttribute("href", "https://www.gnb.ca/fr/urgence/indice-des-feux.html");
});

test.describe("375 × 667, live, Halifax", () => {
  test.use({ viewport: { width: 375, height: 667 } });
  test("Nova Scotia’s page only, 211, and the button's icon and its long site name inside the button", async ({ page }) => {
    await openLeave(page, "live", "fr", "Halifax");
    const links = page.locator("main section a[target=_blank]");
    await expect(links).toHaveCount(1);
    await expect(links.first()).toHaveAttribute("href", "https://emergencyinfo.novascotia.ca/fr");
    await expect(page.getByRole("link", { name: CALL_211.fr })).toHaveAttribute("href", "tel:211"); // English or French by phone
    const [box, icon] = [(await links.first().boundingBox())!, (await links.first().locator("svg").boundingBox())!];
    expect(icon.x).toBeGreaterThanOrEqual(box.x + 12);
    expect(icon.x + icon.width).toBeLessThanOrEqual(box.x + box.width - 12);
    // "emergencyinfo.novascotia.ca" wraps inside the button: nothing is wider than the screen.
    const words = await links.first().locator("span").evaluateAll((spans) => Math.max(...spans.map((span) => span.getBoundingClientRect().right)));
    expect(words).toBeLessThanOrEqual(box.x + box.width - 12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe("Use my location on the screen", () => {
  test.use({ geolocation: { latitude: 44.9, longitude: -65.15 }, permissions: ["geolocation"] });

  test("replay picks the nearest replay town (Bridgetown), and the text to family ends with the phone's location, not the town's", async ({ page }) => {
    await page.addInitScript(recordGeolocation);
    await openLeave(page, "replay");
    await page.getByRole("link", { name: "Use my location" }).click();
    await expect(page.getByRole("heading", { name: L.en.near })).toBeVisible();
    await expect(page.getByText(L.en.banner)).toBeVisible();
    await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"shared":{')); // saved before reloading
    const body = `${OK_EN} My location: https://maps.google.com/?q=44.9,-65.15`;
    await expect(page.getByRole("link", { name: "Tell family you’re OK" })).toHaveAttribute("href", sms(body));
    await page.reload(); // later in the session: the place and the location are remembered
    await expect(page.getByRole("heading", { name: L.en.near })).toBeVisible();
    const family = page.getByRole("link", { name: "Tell family you’re OK" });
    await expect(family).toHaveAttribute("href", sms(body));
    // Known this session: one tap opens the message, without asking the phone again.
    const asked = await navigations(page);
    await family.click();
    await expect.poll(() => texts(asked)).toEqual([sms(body)]);
    expect(await geolocationRequests(page)).toEqual([]);
  });
});

// "Tell family you’re OK" with the phone's real position: asked for on the tap when it isn't known this session.
const GPS = { latitude: 45.123456, longitude: -64.987654 }; // nowhere near Bridgetown's town point
const FAMILY = {
  en: { tap: "Tell family you’re OK", locating: "Getting your location…", send: "Send message with my location", plain: "Send message", ok: OK_EN, at: (link: string) => `${OK_EN} My location: ${link}` },
  fr: { tap: "Dites à vos proches que vous allez bien", locating: "Localisation en cours…", send: "Envoyer le message avec ma position", plain: "Envoyer le message", ok: OK_FR, at: (link: string) => `${OK_FR} Ma position${NBSP}: ${link}` },
};
const WITH_GPS = "https://maps.google.com/?q=45.123456,-64.987654";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36";

/** Record what the app asks the phone for; the browser answers as the test set it up. */
function recordGeolocation() {
  const w = window as unknown as { __geo: PositionOptions[] };
  w.__geo = [];
  const real = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
  navigator.geolocation.getCurrentPosition = (ok, fail, options) => {
    w.__geo.push(options ?? {});
    real(ok, fail, options);
  };
}
/** A phone that is slow to answer (the test answers), or that answers "timed out". */
function fakeGeolocation(answer: "later" | "timeout") {
  const w = window as unknown as { __geo: PositionOptions[]; __answer: (lat: number, lon: number) => void };
  w.__geo = [];
  const geolocation = {
    getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback, options: PositionOptions) => {
      w.__geo.push(options);
      if (answer === "later") w.__answer = (latitude, longitude) => ok({ coords: { latitude, longitude, accuracy: 5 }, timestamp: Date.now() } as GeolocationPosition);
      else setTimeout(() => fail({ code: 3, message: "Timeout expired", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError), 50);
    },
    watchPosition: () => 0,
    clearWatch: () => {},
  };
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: geolocation });
}
/** The slow phone answers now. */
const phoneAnswers = (page: Page, lat: number, lon: number) =>
  page.evaluate(([la, lo]) => (window as unknown as { __answer: (lat: number, lon: number) => void }).__answer(la, lo), [lat, lon]);
const geolocationRequests = (page: Page) => page.evaluate(() => (window as unknown as { __geo: PositionOptions[] }).__geo);
const familyLink = (page: Page, name: string) => page.locator("main").getByRole("link", { name, exact: true });

for (const lang of ["en", "fr"] as const) {
  const f = FAMILY[lang];
  test.describe(`Tell family you’re OK, with the phone's real location (${lang.toUpperCase()})`, () => {
    test.describe("GPS allowed (Android)", () => {
      test.use({ userAgent: ANDROID, geolocation: GPS, permissions: ["geolocation"] });

      test("the tap asks the phone (high accuracy, 6 s), then opens the message with its position at full precision, never the replay town's", async ({ page }) => {
        await page.addInitScript(recordGeolocation);
        await openLeave(page, "replay", lang, "Bridgetown");
        const tap = familyLink(page, f.tap);
        await expect(tap).toHaveAttribute("href", sms(f.ok)); // nothing known yet
        const asked = await navigations(page);
        await tap.click();
        await expect.poll(() => texts(asked)).toEqual([sms(f.at(WITH_GPS))]);
        expect(await geolocationRequests(page)).toEqual([{ enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }]);
        expect(decodeURIComponent(texts(asked)[0])).not.toContain(BRIDGETOWN.split(",")[0]);
        // In case the browser didn't open it: the button is now a plain link to the same message.
        await expect(familyLink(page, f.send)).toHaveAttribute("href", sms(f.at(WITH_GPS)));
        // Known for the rest of the session: later, one tap opens the message without asking again.
        await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"shared":{'));
        await page.reload();
        const again = await navigations(page);
        await familyLink(page, f.tap).click();
        await expect.poll(() => texts(again)).toEqual([sms(f.at(WITH_GPS))]);
        expect(await geolocationRequests(page)).toEqual([]);
      });
    });

    test("while the phone answers, the button says so, and another tap doesn't ask again", async ({ page }) => {
      await page.addInitScript(fakeGeolocation, "later");
      await openLeave(page, "replay", lang, "Bridgetown");
      const asked = await navigations(page);
      await familyLink(page, f.tap).click();
      const locating = familyLink(page, f.locating);
      await expect(locating).toBeVisible();
      await expect(locating).toHaveAttribute("aria-busy", "true");
      await locating.click();
      expect(await geolocationRequests(page)).toHaveLength(1);
      expect(texts(asked)).toEqual([]);
      await phoneAnswers(page, 45.12345678, -64.98765432); // as many decimals as the phone gives, all kept
      await expect.poll(() => texts(asked)).toEqual([sms(f.at("https://maps.google.com/?q=45.12345678,-64.98765432"))]);
    });

    test("leaving the screen while the phone answers: the late answer opens nothing there, and is kept for the session", async ({ page }) => {
      await page.addInitScript(fakeGeolocation, "later");
      await openLeave(page, "replay", lang, "Bridgetown");
      const asked = await navigations(page);
      await familyLink(page, f.tap).click();
      await expect(familyLink(page, f.locating)).toBeVisible();
      await page.getByRole("link", { name: lang === "en" ? "Back" : "Retour" }).click();
      await expect(page.locator("main a[href='/q1']")).toBeVisible(); // on Check now
      await phoneAnswers(page, 45.123456, -64.987654);
      await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"shared":{"lat":45.123456,"lon":-64.987654}'));
      await page.waitForTimeout(300);
      expect(texts(asked)).toEqual([]);
    });

    test("a browser that never answers (a dismissed prompt): a tap after 6 s sends without the location; a late answer sends nothing more", async ({ page }) => {
      await page.clock.install();
      await page.addInitScript(fakeGeolocation, "later");
      await openLeave(page, "replay", lang, "Bridgetown");
      const asked = await navigations(page);
      await familyLink(page, f.tap).click();
      await familyLink(page, f.locating).click(); // a double tap: still waiting
      await page.clock.fastForward(3000);
      await familyLink(page, f.locating).click(); // 3 s: still waiting
      expect(texts(asked)).toEqual([]);
      await page.clock.fastForward(3000);
      await familyLink(page, f.locating).click(); // 6 s: send without it
      await expect.poll(() => texts(asked)).toEqual([sms(f.ok)]);
      await phoneAnswers(page, 45.123456, -64.987654);
      await page.waitForTimeout(300);
      expect(texts(asked)).toEqual([sms(f.ok)]);
      await expect(familyLink(page, f.plain)).toHaveAttribute("href", sms(f.ok));
    });

    test("location denied: the message opens without the location sentence", async ({ page }) => {
      await page.addInitScript(recordGeolocation);
      await openLeave(page, "replay", lang, "Bridgetown"); // no permission given: the browser says no
      const asked = await navigations(page);
      await familyLink(page, f.tap).click();
      await expect.poll(() => texts(asked)).toEqual([sms(f.ok)]);
      expect(await geolocationRequests(page)).toHaveLength(1);
      await expect(familyLink(page, f.plain)).toHaveAttribute("href", sms(f.ok));
    });

    test("location timed out: the message opens without the location sentence", async ({ page }) => {
      await page.addInitScript(fakeGeolocation, "timeout");
      await openLeave(page, "live", lang, "Moncton");
      const asked = await navigations(page);
      await familyLink(page, f.tap).click();
      await expect.poll(() => texts(asked)).toEqual([sms(f.ok)]);
    });

    test.describe("iPhone", () => {
      test.use({ userAgent: IPHONE });

      test.describe("GPS allowed", () => {
        test.use({ geolocation: GPS, permissions: ["geolocation"] });
        test("two steps: the first tap gets the position, then Send message with my location opens it", async ({ page }) => {
          await openLeave(page, "replay", lang, "Bridgetown");
          const asked = await navigations(page);
          await familyLink(page, f.tap).click();
          const send = familyLink(page, f.send);
          await expect(send).toHaveAttribute("href", sms(f.at(WITH_GPS)));
          await page.waitForTimeout(300);
          expect(texts(asked)).toEqual([]); // Safari wouldn't open Messages after the wait
          await send.click();
          await expect.poll(() => texts(asked)).toEqual([sms(f.at(WITH_GPS))]);
        });
      });

      test("location denied: the second tap sends the message without it", async ({ page }) => {
        await openLeave(page, "replay", lang, "Bridgetown");
        const asked = await navigations(page);
        await familyLink(page, f.tap).click();
        const plain = familyLink(page, f.plain);
        await expect(plain).toHaveAttribute("href", sms(f.ok));
        expect(texts(asked)).toEqual([]);
        await plain.click();
        await expect.poll(() => texts(asked)).toEqual([sms(f.ok)]);
      });
    });
  });
}

test("opened directly (a link or bookmark), Back goes to Check", async ({ page }) => {
  await page.goto("/leave");
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "I smell smoke" })).toBeVisible();
});

// The home screen's top bar, as on the three questions and Call 911 now.
for (const lang of ["en", "fr"] as const) {
  test(`the top bar is the home screen's (${lang.toUpperCase()}): Back, Listen as words with no outline, and one link that names the other language`, async ({ page }) => {
    await openLeave(page, "replay", lang, "Moncton");
    const bar = page.locator("header.home-top");
    await expect(bar).toHaveCount(1);
    await expect(bar.getByRole("link", { name: lang === "en" ? "Back" : "Retour", exact: true })).toBeVisible();
    const listenTo = bar.getByRole("button", { name: lang === "en" ? "Listen" : "Écouter", exact: true });
    expect(await listenTo.evaluate((el) => { const st = getComputedStyle(el); return [st.borderTopWidth, st.color]; })).toEqual(["0px", NAVY]);
    expect((await listenTo.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    const other = bar.getByRole("button", { name: lang === "en" ? "Français" : "English", exact: true });
    await expect(other).toHaveAttribute("lang", lang === "en" ? "fr" : "en");
    // The pair of EN and FR pills is gone from this screen.
    await expect(page.getByRole("button", { name: "EN", exact: true })).toHaveCount(0);
    await expect(page.locator("[aria-pressed]")).toHaveCount(0);
    // Under the replay banner, above the title; and the link switches the language.
    const [banner, top, title] = [(await page.getByText(lang === "en" ? /^Replay/ : /^Reprise/).boundingBox())!, (await bar.boundingBox())!, (await page.getByRole("heading", { level: 1 }).boundingBox())!];
    expect(top.y).toBeGreaterThanOrEqual(banner.y + banner.height - 1);
    expect(title.y).toBeGreaterThanOrEqual(top.y + top.height - 1);
    await other.click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(lang === "en" ? L.fr.title : L.en.title);
  });

  test(`no small text links (${lang.toUpperCase()}): near the fire, far from it and with no event, everything to tap is 56 px or taller, with a drawing and its words, and nothing is underlined`, async ({ page }) => {
    for (const [mode, town] of [["replay", "Bridgetown"], ["replay", "Moncton"], ["live", "Moncton"]] as const) {
      await start(page, mode, lang);
      await page.goto("/leave");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // The town from the case before is still the session's: ask again.
      const change = page.locator("main .leave-change");
      if (await change.count()) await change.click();
      await answer(page, town);
      await expect(page.getByRole("link", { name: /Tell family|Dites à vos proches/ })).toBeVisible();
      const found = await page.locator("main a, main button").evaluateAll((els) =>
        els.map((el) => {
          const st = getComputedStyle(el);
          return { words: (el.textContent ?? "").trim().slice(0, 24), height: Math.round(el.getBoundingClientRect().height), icons: el.querySelectorAll("svg").length, underline: st.textDecorationLine, edged: st.borderTopWidth !== "0px" || st.backgroundColor === "rgb(27, 42, 74)" };
        }),
      );
      expect(found.length, `${mode} ${town}`).toBeGreaterThanOrEqual(3);
      expect(found.filter((one) => one.height < 56 || one.icons < 1 || one.words === "" || one.underline !== "none" || !one.edged), `${mode} ${town}`).toEqual([]);
    }
  });
}

test("the replay's explanation is one sentence, in English and French", async ({ page }) => {
  await openLeave(page, "replay", "en", "Moncton");
  const far = page.locator("main .leave-far");
  await expect(far).toHaveText(/^The evacuation for the Long Lake fire, 159 km from Moncton, doesn’t apply to you\.$/);
  expect(((await far.textContent()) ?? "").match(/[.!?]/g)).toHaveLength(1);
  await page.getByRole("button", { name: "Français", exact: true }).click();
  await expect(far).toHaveText(/^L’évacuation liée au feu de Long Lake, à 159 km de Moncton, ne s’applique pas à vous\.$/);
  expect(((await far.textContent()) ?? "").match(/[.!?]/g)).toHaveLength(1);
});

// "What to take" is a list to tick. What is ticked stays on the phone, in the page's own session, under its own name.
test.describe("What to take: a list to tick, with large boxes", () => {
  const TAKE = {
    en: ["Medication", "Wallet and ID", "Keys", "Phone and charger", "Glasses and hearing aids", "Pets"],
    fr: ["Médicaments", "Portefeuille et pièces d’identité", "Clés", "Téléphone et chargeur", "Lunettes et appareils auditifs", "Animaux de compagnie"],
  };
  const boxes = (page: Page) => page.locator("section[aria-labelledby=take-h]").getByRole("checkbox");
  const ticked = (page: Page) => boxes(page).evaluateAll((els) => els.map((el) => (el as HTMLInputElement).checked));
  /** What the browser holds: the ticks, every name in the session's storage, and anything kept longer. */
  const kept = (page: Page) => page.evaluate(() => ({ ticks: sessionStorage.getItem("smoke-or-fire-take"), names: Object.keys(sessionStorage).sort(), local: localStorage.length, cookie: document.cookie }));
  /** A box's square: its size, its edge and fill, and whether its tick shows. */
  const square = (page: Page, n: number) =>
    page.locator(".take-box").nth(n).evaluate((el) => {
      const st = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { size: [Math.round(r.width), Math.round(r.height)], edge: `${st.borderTopWidth} ${st.borderTopColor}`, fill: st.backgroundColor, tick: getComputedStyle(el.querySelector("svg")!).opacity };
    });

  for (const lang of ["en", "fr"] as const) {
    test(`${lang.toUpperCase()}: six boxes, none ticked, each named by its words, 56 px or taller to tap; the square is 40 px, white with a navy edge`, async ({ page }) => {
      await openLeave(page, "replay", lang, "Bridgetown");
      await expect(boxes(page)).toHaveCount(6);
      for (const [i, name] of TAKE[lang].entries()) {
        await expect(boxes(page).nth(i)).toHaveAccessibleName(name);
        await expect(boxes(page).nth(i)).not.toBeChecked();
        const row = (await boxes(page).nth(i).boundingBox())!;
        expect(row.height, name).toBeGreaterThanOrEqual(56);
        expect(row.width, name).toBeGreaterThanOrEqual(250); // the whole row is the box to tap
        expect(await square(page, i), name).toEqual({ size: [40, 40], edge: `3px ${NAVY}`, fill: WHITE, tick: "0" });
      }
      // The list is named by its title, and each thing keeps its drawing.
      await expect(page.locator("section[aria-labelledby=take-h]").getByRole("heading")).toHaveText(lang === "en" ? "What to take" : "Ce qu’il faut emporter");
      await expect(page.locator("section[aria-labelledby=take-h] .take-drawing svg")).toHaveCount(6);
    });
  }

  test("a tap on the words ticks the box: the square fills navy and shows a white tick (a shape, not colour alone); a second tap unticks it", async ({ page }) => {
    await openLeave(page, "replay", "en", "Bridgetown");
    // A finger on the words, well to the right of the square: the whole row is the box.
    const words = page.locator("section[aria-labelledby=take-h]").getByText("Keys", { exact: true });
    await words.scrollIntoViewIfNeeded();
    const tapWords = async () => {
      const at = (await words.boundingBox())!;
      await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
    };
    await tapWords();
    await expect(boxes(page).nth(2)).toBeChecked();
    expect(await ticked(page)).toEqual([false, false, true, false, false, false]);
    expect(await square(page, 2)).toEqual({ size: [40, 40], edge: `3px ${NAVY}`, fill: NAVY, tick: "1" });
    expect(await page.locator(".take-box").nth(2).evaluate((el) => getComputedStyle(el.querySelector("svg")!).stroke)).toBe(WHITE);
    expect(await square(page, 1)).toMatchObject({ fill: WHITE, tick: "0" });
    await tapWords();
    await expect(boxes(page).nth(2)).not.toBeChecked();
    expect(await ticked(page)).toEqual([false, false, false, false, false, false]);
    expect(await square(page, 2)).toMatchObject({ fill: WHITE, tick: "0" });
  });

  test("with a keyboard: Tab goes from Call 211 to the first box and on down the list, Space ticks, and the square shows the focus ring", async ({ page }) => {
    await openLeave(page, "replay", "en", "Moncton");
    await page.getByRole("link", { name: CALL_211.en }).focus();
    await page.keyboard.press("Tab");
    await expect(boxes(page).nth(0)).toBeFocused();
    const ring = await page.locator(".take-box").nth(0).evaluate((el) => { const st = getComputedStyle(el); return [st.outlineStyle, st.outlineWidth, st.outlineColor]; });
    expect(ring).toEqual(["solid", "3px", NAVY]);
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    await expect(boxes(page).nth(1)).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");
    expect(await ticked(page)).toEqual([true, false, true, false, false, false]);
    // After the last box, Tell family is the next stop.
    for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Tell family you’re OK" })).toBeFocused();
  });

  test("the ticks are kept on the phone until the page is closed: there after a reload, another town and another screen; under their own name; nothing is written before a tick, nothing is sent, and a new page has none", async ({ page, context }) => {
    await openLeave(page, "replay", "en", "Moncton");
    await expect(boxes(page)).toHaveCount(6);
    // Nothing is kept for the list until a box is ticked.
    expect(await kept(page)).toMatchObject({ ticks: null, names: ["smoke-or-fire"], local: 0, cookie: "" });
    const sent: string[] = [];
    page.on("request", (request) => sent.push(`${request.method()} ${request.url()}`));
    await boxes(page).nth(0).check();
    await boxes(page).nth(2).check();
    expect(await kept(page)).toEqual({ ticks: JSON.stringify(["medication", "keys"]), names: ["smoke-or-fire", "smoke-or-fire-take"], local: 0, cookie: "" });
    // The app's own entry holds none of it.
    expect(await page.evaluate(() => sessionStorage.getItem("smoke-or-fire"))).not.toMatch(/medication|keys|take/);
    await page.waitForTimeout(300);
    expect(sent, "a tick sends nothing").toEqual([]);

    await page.reload();
    await expect(boxes(page)).toHaveCount(6);
    expect(await ticked(page)).toEqual([true, false, true, false, false, false]);
    // Another town: the same list, as ticked.
    await page.getByRole("button", { name: "Not in Moncton? Change" }).click();
    await answer(page, "Bridgetown");
    await expect(page.getByRole("heading", { name: L.en.near })).toBeVisible();
    expect(await ticked(page)).toEqual([true, false, true, false, false, false]);
    // Another screen and back.
    await page.goto("/q1");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(L.en.q1);
    await page.goto("/leave");
    await expect(boxes(page)).toHaveCount(6);
    expect(await ticked(page)).toEqual([true, false, true, false, false, false]);

    // Unticked again, nothing is left behind.
    await boxes(page).nth(0).uncheck();
    await boxes(page).nth(2).uncheck();
    expect(await kept(page)).toMatchObject({ ticks: null, names: ["smoke-or-fire"] });

    // The page is closed with two boxes ticked: a new page starts with none.
    await boxes(page).nth(1).check();
    await boxes(page).nth(5).check();
    expect((await kept(page)).ticks).toBe(JSON.stringify(["wallet", "pets"]));
    await page.close();
    const fresh = await context.newPage();
    await openLeave(fresh, "replay", "en", "Moncton");
    await expect(boxes(fresh)).toHaveCount(6);
    expect(await ticked(fresh)).toEqual([false, false, false, false, false, false]);
    expect((await kept(fresh)).ticks).toBeNull();
  });
});

// The hard rules, on every version of the screen.
const VERSIONS: { name: string; mode: "replay" | "live"; lang: "en" | "fr"; town?: string }[] = [
  { name: "question", mode: "replay", lang: "en" },
  { name: "question", mode: "live", lang: "fr" },
  { name: "near (Bridgetown)", mode: "replay", lang: "en", town: "Bridgetown" },
  { name: "near (Bridgetown)", mode: "replay", lang: "fr", town: "Bridgetown" },
  { name: "far (Moncton)", mode: "replay", lang: "en", town: "Moncton" },
  { name: "far (Moncton)", mode: "replay", lang: "fr", town: "Moncton" },
  { name: "live (Moncton)", mode: "live", lang: "en", town: "Moncton" },
  { name: "live (Moncton)", mode: "live", lang: "fr", town: "Moncton" },
];
for (const v of VERSIONS) {
  test(`rules (${v.name}, ${v.mode}, ${v.lang.toUpperCase()}): no “safe”, no “don’t call 911”, one red button, 18 px text, 56 px targets`, async ({ page }) => {
    await openLeave(page, v.mode, v.lang, v.town);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (v.town) await expect(page.getByRole("link", { name: /Tell family|Dites à vos proches/ })).toBeVisible();

    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/safe|sécuri/i);
    expect(text).not.toMatch(/(do not|don’t) call|n’appelez pas|ne pas appeler|9-1-1/i);

    const red = await page.locator("a, button").evaluateAll((els) =>
      els.filter((el) => getComputedStyle(el).backgroundColor === "rgb(217, 45, 32)").map((el) => el.getAttribute("href")),
    );
    expect(red).toEqual(["tel:911"]);

    const small = await page.locator("main").evaluate((main) => {
      const found: string[] = [];
      for (const el of main.querySelectorAll("*")) {
        if (el.closest("svg")) continue;
        const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
        if (own && parseFloat(getComputedStyle(el).fontSize) < 18) found.push(`${el.textContent!.trim().slice(0, 30)} (${getComputedStyle(el).fontSize})`);
      }
      return found;
    });
    expect(small).toEqual([]);

    const targets = await page.locator("main a, main button, main input").evaluateAll((els) =>
      els.map((el) => ({ text: (el.textContent || el.getAttribute("placeholder") || "").trim().slice(0, 30), h: el.getBoundingClientRect().height })).filter((t) => t.h < 56),
    );
    expect(targets).toEqual([]);
  });
}
