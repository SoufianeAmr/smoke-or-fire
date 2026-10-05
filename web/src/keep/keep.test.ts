// "Keep it on your phone": what "Send to someone" sends, and whose steps "Add to home screen" shows.
import { describe, expect, test } from "vitest";
import { APP_URL, platformOf, shareData, shareSms } from "./keep";

const NBSP = String.fromCharCode(0xa0);
const TEXT = {
  en: "Smoke or Fire? tells you where the smoke is coming from. Nothing to install:",
  fr: `Fumée ou feu${NBSP}? vous dit d’où vient la fumée. Rien à installer${NBSP}:`,
};

describe("Send to someone", () => {
  test("shares the sentence and the app's address, in English and French", () => {
    expect(APP_URL).toBe("https://smoke-or-fire.vercel.app");
    expect(shareData("en")).toEqual({ text: TEXT.en, url: "https://smoke-or-fire.vercel.app" });
    expect(shareData("fr")).toEqual({ text: TEXT.fr, url: "https://smoke-or-fire.vercel.app" });
  });

  test("without a share sheet, a text message with the same sentence, then the address", () => {
    for (const lang of ["en", "fr"] as const) {
      const url = shareSms(lang);
      expect(url.startsWith("sms:?&body=")).toBe(true);
      expect(decodeURIComponent(url.slice("sms:?&body=".length))).toBe(`${TEXT[lang]} https://smoke-or-fire.vercel.app`);
    }
  });
});

describe("Add to home screen: whose steps", () => {
  const UA = {
    iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
    iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/139.0.7258.76 Mobile/15E148 Safari/604.1",
    ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
    android: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
    samsung: "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S921W) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
    mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
    windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
  };

  test("iPhone and iPad (which says Macintosh, with a touch screen), in any browser", () => {
    expect(platformOf(UA.iphone, 5)).toBe("iphone");
    expect(platformOf(UA.iphoneChrome, 5)).toBe("iphone");
    expect(platformOf(UA.ipad, 5)).toBe("iphone");
  });

  test("Android, in Chrome or Samsung Internet", () => {
    expect(platformOf(UA.android, 5)).toBe("android");
    expect(platformOf(UA.samsung, 5)).toBe("android");
  });

  test("a computer: neither (both sets of steps are shown)", () => {
    expect(platformOf(UA.mac, 0)).toBe("other");
    expect(platformOf(UA.windows, 0)).toBe("other");
  });
});
