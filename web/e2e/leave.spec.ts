// "If you’re told to leave": in replay, the centres the County of Annapolis announced for the Long Lake fire
// (Aug 25, 2025); in live mode, where officials announce centres. Entry points on Check and Emergency.
import { expect, test, type Page } from "@playwright/test";

const NBSP = String.fromCharCode(0xa0);
const SOURCE = "https://annapoliscounty.ca/government/news-media-releases/2204-west-dalhousie-wildfires-evacuees-registration";
const directions = (address: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
const sms = (body: string) => `sms:?&body=${encodeURIComponent(body)}`;

/** Open the screen in a mode and language, once the mode is saved (so page.goto keeps it). */
async function openLeave(page: Page, mode: "replay" | "live", lang: "en" | "fr" = "en") {
  await page.goto(`/?mode=${mode}`);
  await page.waitForFunction((m) => sessionStorage.getItem("smoke-or-fire")?.includes(`"mode":"${m}"`), mode);
  if (lang === "fr") await page.getByRole("button", { name: "Français" }).click();
  await page.goto("/leave");
}

test("demo path: Replay → I smell smoke → Yes (flames) → Emergency → Told to leave your home?", async ({ page }) => {
  await page.goto("/?mode=replay");
  await page.getByRole("link", { name: "I smell smoke" }).click();
  await page.getByRole("link", { name: /I see flames/ }).click();
  await expect(page.getByRole("heading", { name: "Call 911 now" })).toBeVisible();
  await page.getByRole("link", { name: "Told to leave your home? What to do" }).click();

  await expect(page).toHaveURL(/\/leave$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("If you’re told to leave");
  await expect(page.getByRole("heading", { name: "Evacuation reception centre and shelter" })).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(250, 246, 240)"); // not the red Emergency page
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Call 911 now" })).toBeVisible();
});

test("Check: an outlined navy button below the mode toggle opens the screen", async ({ page }) => {
  await page.goto("/?mode=replay");
  const button = page.getByRole("link", { name: "Told to leave your home? What to do" });
  const toggle = page.getByRole("group", { name: "Data mode" });
  expect((await button.boundingBox())!.y).toBeGreaterThan((await toggle.boundingBox())!.y + (await toggle.boundingBox())!.height);
  expect((await button.boundingBox())!.width).toBeGreaterThan(330);
  await expect(button).toHaveCSS("border-top-color", "rgb(27, 42, 74)");
  await expect(button).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await button.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("If you’re told to leave");
});

test.describe("375 × 667", () => {
  test.use({ viewport: { width: 375, height: 667 } });
  test("the Check button does not push I smell smoke off the screen", async ({ page }) => {
    await page.goto("/?mode=replay");
    const cta = (await page.getByRole("link", { name: "I smell smoke" }).boundingBox())!;
    expect(cta.y + cta.height).toBeLessThanOrEqual(667);
    await expect(page.getByRole("link", { name: "Told to leave your home? What to do" })).toBeAttached();
  });
});

test("replay, English: map, both centres with addresses and directions, phone lines, grab list, text, source", async ({ page }) => {
  await openLeave(page, "replay");
  await expect(page.getByText("Leave right away when officials tell you to. Follow emergency alerts and local radio.")).toBeVisible();

  // Map: large markers for the fire and both centres; no route drawn; nobody located yet.
  const map = page.getByRole("img", { name: /^Map: / });
  await expect(map).toHaveAttribute("aria-label", "Map: the Long Lake fire, the reception centre in Middleton and the comfort centre in Bridgetown");
  for (const kind of ["fire", "reception", "comfort"]) await expect(map.locator(`.marker-${kind}`)).toHaveCount(1);
  await expect(map.locator(".marker-you, polyline, line")).toHaveCount(0);
  for (const label of ["Long Lake fire", "Middleton", "Bridgetown"]) await expect(map.getByText(label, { exact: true })).toBeVisible();

  const reception = page.locator("section[aria-labelledby=reception-h]");
  await expect(reception.getByRole("heading")).toHaveText("Evacuation reception centre and shelter");
  await expect(reception).toContainText("NSCC Annapolis Valley Campus");
  await expect(reception).toContainText("295 Commercial St., Middleton");
  await expect(reception).toContainText("Showers and laundry, Wi-Fi, light food, overnight accommodation");
  await expect(reception).toContainText("Register here so officials know you’re accounted for.");
  await expect(reception.getByRole("link", { name: "Get directions" })).toHaveAttribute("href", directions("295 Commercial St., Middleton, NS"));

  const comfort = page.locator("section[aria-labelledby=comfort-h]");
  await expect(comfort.getByRole("heading")).toHaveText("Comfort centre");
  await expect(comfort).toContainText("Bridgetown Fire Hall");
  await expect(comfort).toContainText("31 Bay Rd., Bridgetown");
  await expect(comfort).toContainText(`Charging, Wi-Fi, light food${NBSP}· 10${NBSP}a.m. to 4${NBSP}p.m. daily`);
  await expect(comfort).not.toContainText("Register here");
  await expect(comfort.getByRole("link", { name: "Get directions" })).toHaveAttribute("href", directions("31 Bay Rd., Bridgetown, NS"));

  await expect(page.getByText("Roads near the fire may be closed. Follow officials’ directions.")).toBeVisible();
  const info = page.getByRole("link", { name: /^For updates: public information line/ });
  await expect(info).toHaveAttribute("href", "tel:18338061515");
  await expect(info).toContainText(`1-833-806-1515${NBSP}· 11${NBSP}a.m. to 7${NBSP}p.m. daily`);
  await expect(page.getByRole("link", { name: /^Overnight accommodation: Canadian Red Cross/ })).toHaveAttribute("href", "tel:18002229597");

  const take = page.locator("section[aria-labelledby=take-h]");
  // The officials' own words; the six rows are the app's checklist (official kit lists, see evacuation-events.json).
  await expect(take).toContainText("Officials asked evacuees to take their 72-hour kit and critical items (meds, wallet, keys).");
  await expect(take.locator("li")).toHaveText(["Medication", "Wallet and ID", "Keys", "Phone and charger", "Glasses and hearing aids", "Pets"]);
  await expect(take.locator("li svg")).toHaveCount(6);
  await expect(take.locator("p", { hasText: "Do not delay for non-essential items." })).toHaveCSS("font-weight", "700");

  // No location shared this session: the message has no last sentence.
  await expect(page.getByRole("link", { name: "Tell family you’re OK" })).toHaveAttribute("href", sms("I’m OK. There’s a fire near me and I’m following official instructions."));

  const source = page.getByRole("link", { name: "Centres announced by the Municipality of the County of Annapolis, August 2025." });
  await expect(source).toHaveAttribute("href", SOURCE);
});

test("replay, French", async ({ page }) => {
  await openLeave(page, "replay", "fr");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Si on vous demande de partir");
  await expect(page.getByText("Partez dès que les autorités vous le demandent. Suivez les alertes d’urgence et la radio locale.")).toBeVisible();
  await expect(page.getByRole("img", { name: /^Carte/ })).toHaveAttribute("aria-label", `Carte${NBSP}: le feu de Long Lake, le centre d’accueil à Middleton et le centre de réconfort à Bridgetown`);

  const reception = page.locator("section[aria-labelledby=reception-h]");
  await expect(reception.getByRole("heading")).toHaveText("Centre d’accueil des personnes évacuées et hébergement");
  await expect(reception).toContainText("295 Commercial St., Middleton");
  await expect(reception).toContainText("Douches et buanderie, Wi-Fi, collations, hébergement pour la nuit");
  await expect(reception).toContainText("Inscrivez-vous ici pour que les autorités sachent où vous êtes.");
  await expect(reception.getByRole("link", { name: "Itinéraire" })).toHaveAttribute("href", directions("295 Commercial St., Middleton, NS"));

  const comfort = page.locator("section[aria-labelledby=comfort-h]");
  await expect(comfort.getByRole("heading")).toHaveText("Centre de réconfort");
  await expect(comfort).toContainText(`Recharge, Wi-Fi, collations${NBSP}· tous les jours de 10${NBSP}h à 16${NBSP}h`);
  await expect(comfort.getByRole("link", { name: "Itinéraire" })).toHaveAttribute("href", directions("31 Bay Rd., Bridgetown, NS"));

  await expect(page.getByText("Des routes près du feu peuvent être fermées. Suivez les consignes des autorités.")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Pour des mises à jour\s: ligne d’information publique/ })).toHaveAttribute("href", "tel:18338061515");
  await expect(page.getByRole("link", { name: /^Hébergement pour la nuit\s: Croix-Rouge canadienne/ })).toHaveAttribute("href", "tel:18002229597");

  const take = page.locator("section[aria-labelledby=take-h]");
  await expect(take.getByRole("heading")).toHaveText("Ce qu’il faut emporter");
  await expect(take).toContainText("Les autorités ont demandé d’emporter la trousse de 72 heures et les objets essentiels (médicaments, portefeuille, clés).");
  await expect(take.locator("li")).toHaveText(["Médicaments", "Portefeuille et pièces d’identité", "Clés", "Téléphone et chargeur", "Lunettes et appareils auditifs", "Animaux de compagnie"]);
  await expect(take.locator("p", { hasText: "Ne tardez pas pour des objets non essentiels." })).toHaveCSS("font-weight", "700");

  await expect(page.getByRole("link", { name: "Dites à vos proches que vous allez bien" })).toHaveAttribute("href", sms("Je vais bien. Il y a un feu près de moi et je suis les consignes officielles."));
  await expect(page.getByRole("link", { name: "Centres annoncés par la Municipalité du comté d’Annapolis, août 2025." })).toHaveAttribute("href", SOURCE);
});

test("live: no centres announced, so it says where officials announce them", async ({ page }) => {
  await openLeave(page, "live");
  await expect(page.getByText("For a fire happening now, officials announce where to go here:", { exact: true })).toBeVisible();
  // gnb.ca/en/topic/laws-safety/…/fire-watch.html and novascotia.ca/alerts/ redirect to these.
  await expect(page.getByRole("link", { name: /^New Brunswick Fire Watch/ })).toHaveAttribute("href", "https://www.gnb.ca/en/emergency/fire-watch.html");
  await expect(page.getByRole("link", { name: /^Emergency Info Nova Scotia/ })).toHaveAttribute("href", "https://emergencyinfo.novascotia.ca/");
  await expect(page.getByRole("link", { name: "Shelters and help: call 211" })).toHaveAttribute("href", "tel:211");

  // Nothing from the replay's event: no map, no centres, no event phone lines, no "Officials asked…" line.
  await expect(page.getByRole("img", { name: /^Map: / })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Get directions" })).toHaveCount(0);
  await expect(page.locator('a[href^="tel:1"]')).toHaveCount(0);
  await expect(page.getByText(/Officials asked/)).toHaveCount(0);
  await expect(page.locator("section[aria-labelledby=take-h] li")).toHaveCount(6);
  await expect(page.getByRole("link", { name: "Tell family you’re OK" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Centres announced/ })).toHaveCount(0);
});

test("live, French", async ({ page }) => {
  await openLeave(page, "live", "fr");
  await expect(page.getByText(`Pour un feu en cours, les autorités annoncent où aller ici${NBSP}:`, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Indice des feux du Nouveau-Brunswick/ })).toHaveAttribute("href", "https://www.gnb.ca/fr/urgence/indice-des-feux.html");
  await expect(page.getByRole("link", { name: /^Situations d’urgence en Nouvelle-Écosse/ })).toHaveAttribute("href", "https://emergencyinfo.novascotia.ca/fr");
  // 211 Nova Scotia has interpretation but no French service; the French line says so.
  await expect(page.getByRole("link", { name: /^Hébergement et aide\s: composez le 211 \(N\.‑É\.\s: service en anglais, avec interprétation\)$/ })).toHaveAttribute("href", "tel:211");
  await expect(page.locator("section[aria-labelledby=take-h] li").first()).toHaveText("Médicaments");
});

test.describe("location shared this session", () => {
  test.use({ geolocation: { latitude: 44.9, longitude: -65.15 }, permissions: ["geolocation"] });

  test("the text to family ends with a link to it, and the map shows you", async ({ page }) => {
    await page.goto("/?mode=replay");
    await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"mode":"replay"'));
    await page.goto("/location");
    await page.getByRole("link", { name: "Use my location" }).click();
    await expect(page).toHaveURL(/\/(loading|verdict)$/, { timeout: 10_000 });
    await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"shared":{')); // saved before leaving the page
    await page.goto("/leave");

    const body = "I’m OK. There’s a fire near me and I’m following official instructions. My location: https://www.google.com/maps/search/?api=1&query=44.90000,-65.15000";
    await expect(page.getByRole("link", { name: "Tell family you’re OK" })).toHaveAttribute("href", sms(body));
    // You are where the phone is (27 km from the fire), not in the replay town the check used (Saint John).
    await expect(page.locator("circle.marker-you, g.marker-you")).toHaveCount(1);
    await expect(page.getByRole("img", { name: /and you$/ })).toBeVisible();
    await expect(page.getByText("You", { exact: true })).toHaveCount(2); // map label and legend

    // Opened again later in the session: still there.
    await page.reload();
    await expect(page.getByRole("link", { name: "Tell family you’re OK" })).toHaveAttribute("href", sms(body));
  });

});

// Replay towns are all 90 km or more from the fire: an arrow at the map's edge points toward the town.
// Moncton, Dieppe and Sackville put it at the top edge, above the Middleton marker.
for (const town of ["Moncton", "Dieppe", "Sackville"]) {
  test(`${town}: the arrow at the map's edge points your way without covering a marker`, async ({ page }) => {
    await page.goto("/?mode=replay");
    await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"mode":"replay"'));
    await page.goto("/location");
    await page.locator("input[type=search]").fill(town);
    await page.getByRole("option", { name: new RegExp(`^${town}, NB`) }).click();
    await expect(page).toHaveURL(/\/verdict$/, { timeout: 10_000 });
    await page.goto("/leave");

    const map = page.getByRole("img", { name: /^Map: / });
    await expect(map).toHaveAttribute("aria-label", /\. You are off the map, to the (north|north-northeast|northeast)\.$/);
    const arrow = (await map.locator("path.marker-you").boundingBox())!;
    for (const marker of await map.locator("g.marker").all()) {
      const box = (await marker.boundingBox())!;
      const apart = arrow.x + arrow.width <= box.x || box.x + box.width <= arrow.x || arrow.y + arrow.height <= box.y || box.y + box.height <= arrow.y;
      expect(apart, `arrow clear of ${await marker.getAttribute("class")}`).toBe(true);
    }
    await expect(map.locator("text", { hasText: /^You$/ })).toHaveCount(1); // labelled on the map
    await expect(page.getByText(`You (${town})`)).toBeVisible(); // and in the legend
    // A searched town is not a shared location: the text to family has no location.
    await expect(page.getByRole("link", { name: "Tell family you’re OK" })).toHaveAttribute("href", sms("I’m OK. There’s a fire near me and I’m following official instructions."));
  });
}

test("opened directly (a link or bookmark), Back goes to Check", async ({ page }) => {
  await page.goto("/leave");
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "I smell smoke" })).toBeVisible();
});

test.describe("375 × 667, live", () => {
  test.use({ viewport: { width: 375, height: 667 } });
  test("the official links keep their icon inside the card", async ({ page }) => {
    await openLeave(page, "live");
    for (const name of [/^New Brunswick Fire Watch/, /^Emergency Info Nova Scotia/]) {
      const link = page.getByRole("link", { name });
      const [box, icon] = [(await link.boundingBox())!, (await link.locator("svg").boundingBox())!];
      expect(icon.x + icon.width).toBeLessThanOrEqual(box.x + box.width - 12);
    }
  });
});

// The hard rules, on every version of the screen.
for (const mode of ["replay", "live"] as const) {
  for (const lang of ["en", "fr"] as const) {
    test(`rules (${mode}, ${lang.toUpperCase()}): no “safe”, no “don’t call 911”, one red button, 18 px text, 56 px targets`, async ({ page }) => {
      await openLeave(page, mode, lang);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

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

      const targets = await page.locator("main a, main button").evaluateAll((els) =>
        els.map((el) => ({ text: el.textContent!.trim().slice(0, 30), h: el.getBoundingClientRect().height })).filter((t) => t.h < 56),
      );
      expect(targets).toEqual([]);
    });
  }
}
