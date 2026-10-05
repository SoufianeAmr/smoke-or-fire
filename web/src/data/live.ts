// Live mode: GET /verdict from the engine at VITE_ENGINE_URL, with patience while a sleeping engine wakes up.
//
// The engine runs as a free Render service: it sleeps when idle, takes about a minute to come back, and its disk is
// wiped, so its first wind grid takes about two more minutes. In that time it is "not answering yet": no response, a
// gateway page, or its own "warming" answer. Loading keeps asking, with backoff, for up to three minutes (a whole cold
// start, measured), and says so. "No data" (screen 9b) is kept for a real answer from the engine: its own error, or
// anything it says that is not a verdict.
import { ENGINE_URL, type Place } from "../app/state";
import type { VerdictJson } from "../verdict/types";
import { readAnswer, type Answer } from "./answer";

// How one answer is read (a verdict, no data, or waking) is in ./answer: the real-engine test uses the same rule.
export { readAnswer, type Answer } from "./answer";

/** How long Loading keeps asking an engine that is not answering yet, in all: a whole cold start, about a minute for
 *  Render to bring the service back and two for its first wind grid. */
export const WAKE_BUDGET_MS = 180_000;
/** One request's time to answer. Render holds a request while the service comes back, for up to about a minute. */
export const ATTEMPT_TIMEOUT_MS = 30_000;
/** With no answer by then, Loading says the engine is waking up, even while a request is still held. */
export const SAY_WAKING_AFTER_MS = 10_000;
/** The pause before the next try, after each failed one; the last one repeats. */
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000];

/** Why a live check gave no verdict: the engine's own no-data answer, or no answer at all within the budget. */
export type LiveFailure = "noData" | "notAnswering";

export class LiveError extends Error {
  constructor(
    readonly kind: LiveFailure,
    message: string,
  ) {
    super(message);
    this.name = "LiveError";
  }
}

/** What a test can stand in for: the browser's fetch, the engine's address, and a request's time limit. */
export interface LiveDeps {
  fetch?: typeof globalThis.fetch;
  url?: string;
  timeoutSignal?: (ms: number) => AbortSignal;
  /** Aborted when the person leaves Loading: no more asking for them. */
  signal?: AbortSignal;
}

const base = (url: string) => url.replace(/\/+$/, "");
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const browserFetch: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, init);

/**
 * The verdict for `place`, asking again while the engine is not answering yet. `onWaking` is called once, the first
 * time the engine fails to answer or after 10 seconds without one, so the screen can say so. Rejects with a LiveError:
 * "noData" for the engine's own no-data answer (at once), "notAnswering" after three minutes without any.
 */
export async function loadLiveVerdict(place: Place, onWaking?: () => void, deps: LiveDeps = {}): Promise<VerdictJson> {
  const { fetch = browserFetch, url = ENGINE_URL, timeoutSignal = (ms) => AbortSignal.timeout(ms), signal } = deps;
  if (!url) throw new LiveError("noData", "this build has no engine URL (VITE_ENGINE_URL)");
  const query = new URLSearchParams({ lat: String(place.lat), lon: String(place.lon), mode: "live" });
  const address = `${base(url)}/verdict?${query}`;
  const started = Date.now();
  const left = () => WAKE_BUDGET_MS - (Date.now() - started);
  let said = false;
  const waking = () => {
    if (said) return;
    said = true;
    onWaking?.();
  };
  const sayLater = setTimeout(waking, SAY_WAKING_AFTER_MS);
  try {
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw new LiveError("noData", "the check was left");
      const remaining = left();
      if (remaining <= 0) throw new LiveError("notAnswering", `no answer from the engine in ${WAKE_BUDGET_MS / 1000} s`);
      let answer: Answer;
      try {
        answer = await readAnswer(await fetch(address, { signal: timeoutSignal(Math.min(ATTEMPT_TIMEOUT_MS, remaining)) }));
      } catch (error) {
        // No response: the network, or the request's time ran out while Render holds it.
        answer = { kind: "waking", reason: error instanceof Error ? error.message : String(error), retryAfterMs: null };
      }
      if (answer.kind === "verdict") return answer.json;
      if (answer.kind === "noData") throw new LiveError("noData", answer.reason);
      waking();
      const pause = answer.retryAfterMs ?? BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      await wait(Math.max(0, Math.min(pause, left())));
    }
  } finally {
    clearTimeout(sayLater);
  }
}

let woken = false;

/**
 * One quiet GET /health as the app opens in live mode, so a sleeping engine is usually awake by the time someone has
 * answered the three questions. Once per app open; nothing is shown, and a failure is nobody's concern here.
 */
export function wakeEngine({ fetch = browserFetch, url = ENGINE_URL }: Pick<LiveDeps, "fetch" | "url"> = {}): void {
  if (!url || woken) return;
  woken = true;
  fetch(`${base(url)}/health`, { signal: AbortSignal.timeout(WAKE_BUDGET_MS) }).catch(() => {});
}

/** Tests only: forget that the engine was woken. */
export function forgetWake(): void {
  woken = false;
}
