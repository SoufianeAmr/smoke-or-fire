// "Keep it on your phone" (Check): "Add to home screen" and "Send to someone". The home-screen icon opens the site; there
// is no service worker, so nothing is cached for use offline.
import { useState, useSyncExternalStore } from "react";
import { smsUrl } from "../data/evacuation";
import { translate, type Lang } from "../i18n";

/** The address "Send to someone" gives: the plain URL, which opens in live mode. */
export const APP_URL = "https://smoke-or-fire.vercel.app";

/** What "Send to someone" hands the phone's share sheet: the sentence, and the address. */
export const shareData = (lang: Lang): ShareData => ({ text: translate(lang, "keep.share"), url: APP_URL });

/** The text message when the browser has no share sheet: the same sentence, then the address. */
export const shareSms = (lang: Lang) => smsUrl(`${translate(lang, "keep.share")} ${APP_URL}`);

export type Platform = "iphone" | "android" | "other";

/** Whose steps "Add to home screen" shows. An iPad says "Macintosh" but has a touch screen. */
export function platformOf(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return "iphone";
  if (/Android/.test(userAgent)) return "android";
  return "other";
}

/** Opened from the home screen: the manifest's standalone display, or an iPhone's home-screen web app. */
export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches === true || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * The browser's own install prompt (Chrome, Samsung Internet), held until "Add to home screen" opens it on Android.
 * Chrome and Edge offer one on a computer too, but it would install the app on the computer, not the phone.
 */
interface InstallPrompt extends Event {
  prompt: () => Promise<unknown>;
}

let held: InstallPrompt | null = null;
let installed = false;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/**
 * Called once at start-up, before the first screen: the browser may offer its prompt before Check is shown. The prompt
 * is held rather than shown on its own, so nothing pops up over "I smell smoke".
 */
export function holdInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    held = event as InstallPrompt;
    changed();
  });
  window.addEventListener("appinstalled", () => {
    held = null;
    installed = true;
    changed();
  });
}

/**
 * Opens the browser's install prompt if it offered one; false if not. If the prompt fails, `onFail` runs (the steps are
 * shown instead). A prompt opens once: after it, the link shows the steps until the browser offers it again.
 */
export function openInstallPrompt(onFail: () => void): boolean {
  const prompt = held;
  if (!prompt) return false;
  held = null;
  changed();
  prompt.prompt().catch(onFail);
  return true;
}

/**
 * Whose steps to show, and whether "Add to home screen" is offered: not when the app is open from the home screen, or
 * once it was installed on this Android phone. Installing on a computer leaves it: the phone still needs it.
 */
export function useInstall() {
  const [standalone] = useState(isStandalone);
  const [platform] = useState(() => platformOf(navigator.userAgent, navigator.maxTouchPoints));
  const justInstalled = useSyncExternalStore(subscribe, () => installed);
  return { offered: !standalone && !(justInstalled && platform === "android"), platform };
}
