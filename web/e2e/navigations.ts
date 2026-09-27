import type { Page } from "@playwright/test";

/** Where the page asks to go from now on. An sms: address never loads in the test browser, but the request is seen. */
export async function navigations(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.enable");
  const urls: string[] = [];
  cdp.on("Page.frameRequestedNavigation", ({ url }) => urls.push(url));
  return urls;
}

/** The text messages the page tried to open. */
export const texts = (urls: string[]) => urls.filter((url) => url.startsWith("sms:"));
