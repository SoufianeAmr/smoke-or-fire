// Live mode while the engine wakes up. A free Render service sleeps when idle and takes about a minute to come back;
// its disk is wiped, so the engine's first wind grid takes about two more minutes. In that time the engine is "not
// answering yet": no response, a gateway page, or its own "warming" answer. Loading keeps asking, with backoff, for up
// to three minutes, a whole cold start, and says so. "No data" is kept for a real answer from the engine.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import moncton from "../../../data/demo/moncton.json";
import type { Place } from "../app/state";
import { ATTEMPT_TIMEOUT_MS, LiveError, SAY_WAKING_AFTER_MS, WAKE_BUDGET_MS, forgetWake, loadLiveVerdict, readAnswer, wakeEngine } from "./live";

const SHEDIAC: Place = { name: "Shediac", province: "NB", county: "Westmorland", lat: 46.22127, lon: -64.53977 };
const URL = "https://engine.test";
const VERDICT = { ...moncton, mode: "live" };

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const html = (status: number) => new Response("<html><body>Please wait while the service starts</body></html>", { status, headers: { "content-type": "text/html" } });
const never: () => AbortSignal = () => new AbortController().signal;

/** A fetch that answers from `answers` in order: a Response, or an Error to reject with. Out of answers, it fails. */
function engine(answers: (Response | Error)[]) {
  const asked: string[] = [];
  const fetch = vi.fn(async (input: string | URL | Request) => {
    asked.push(String(input));
    const next = answers.shift();
    if (!next) throw new TypeError("Failed to fetch");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof globalThis.fetch;
  return { fetch, asked };
}

describe("reading one answer from the engine", () => {
  test("a verdict", async () => {
    expect(await readAnswer(json(200, VERDICT))).toMatchObject({ kind: "verdict", json: { verdict: "drifting" } });
  });

  test("the engine's own no-data answer: a 503 with its error, and no warming", async () => {
    expect(await readAnswer(json(503, { error: "wind_data_unavailable" }))).toEqual({ kind: "noData", reason: "wind_data_unavailable" });
    expect(await readAnswer(json(503, { error: "fire_data_unavailable" }))).toEqual({ kind: "noData", reason: "fire_data_unavailable" });
  });

  test("the engine warming up after a cold start: a 503 that says so, with its Retry-After", async () => {
    expect(await readAnswer(json(503, { error: "wind_data_unavailable", status: "warming" }, { "retry-after": "15" }))).toEqual({ kind: "waking", reason: "the engine is warming up", retryAfterMs: 15_000 });
    // A Retry-After longer than the backoff allows is capped; one that is not a number of seconds is ignored.
    const pause = async (response: Response) => {
      const answer = await readAnswer(response);
      return answer.kind === "waking" ? answer.retryAfterMs : answer.kind;
    };
    expect(await pause(json(503, { status: "warming" }, { "retry-after": "120" }))).toBe(15_000);
    expect(await pause(json(503, { status: "warming" }, { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }))).toBe(null);
  });

  test("Render's page while the service spins up: a gateway status without the engine's JSON", async () => {
    for (const status of [502, 503, 504]) {
      expect((await readAnswer(html(status))).kind).toBe("waking");
    }
    // A loading page served with 200 is not an answer either: no JSON at all.
    expect((await readAnswer(html(200))).kind).toBe("waking");
  });

  test("any other answer from the engine is a real one: no data", async () => {
    expect((await readAnswer(json(422, { detail: "lat/lon is outside the area the engine covers" }))).kind).toBe("noData");
    expect((await readAnswer(json(500, { detail: "Internal Server Error" }))).kind).toBe("noData");
    expect((await readAnswer(json(200, { status: "ok" }))).kind).toBe("noData"); // JSON, but no verdict
  });
});

describe("loading a live verdict", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("the engine answers at once: the verdict, one request, and nothing said about waking", async () => {
    const { fetch, asked } = engine([json(200, VERDICT)]);
    const waking = vi.fn();
    const verdict = await loadLiveVerdict(SHEDIAC, waking, { fetch, url: URL, timeoutSignal: never });
    await vi.advanceTimersByTimeAsync(SAY_WAKING_AFTER_MS + 1000);

    expect(verdict.verdict).toBe("drifting");
    expect(asked).toEqual([`${URL}/verdict?lat=46.22127&lon=-64.53977&mode=live`]);
    expect(waking).not.toHaveBeenCalled();
  });

  test("Render's gateway page twice, then the engine: the verdict after 1 s and 2 s of backoff, and waking said once", async () => {
    const { fetch, asked } = engine([html(502), html(503), json(200, VERDICT)]);
    const waking = vi.fn();
    const loading = loadLiveVerdict(SHEDIAC, waking, { fetch, url: URL, timeoutSignal: never });
    await vi.advanceTimersByTimeAsync(0);
    expect(asked).toHaveLength(1);
    expect(waking).toHaveBeenCalledTimes(1); // said as soon as the first attempt failed
    await vi.advanceTimersByTimeAsync(999);
    expect(asked).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(asked).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(asked).toHaveLength(3);

    expect((await loading).verdict).toBe("drifting");
    expect(waking).toHaveBeenCalledTimes(1);
  });

  test("no response at all (the network, or the attempt's time ran out), then the engine: the verdict", async () => {
    const { fetch } = engine([new TypeError("Failed to fetch"), new DOMException("The operation was aborted due to timeout", "TimeoutError"), json(200, VERDICT)]);
    const loading = loadLiveVerdict(SHEDIAC, undefined, { fetch, url: URL, timeoutSignal: never });
    await vi.advanceTimersByTimeAsync(5000);
    expect((await loading).verdict).toBe("drifting");
  });

  test("the engine warming up: its Retry-After sets the pause", async () => {
    const { fetch, asked } = engine([json(503, { error: "wind_data_unavailable", status: "warming" }, { "retry-after": "15" }), json(200, VERDICT)]);
    const loading = loadLiveVerdict(SHEDIAC, undefined, { fetch, url: URL, timeoutSignal: never });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(asked).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(asked).toHaveLength(2);
    expect((await loading).verdict).toBe("drifting");
  });

  test("a request held while the service spins up: waking is said after 10 s, before any answer", async () => {
    let answer: (response: Response) => void = () => {};
    const held = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    const fetch = vi.fn(() => held) as unknown as typeof globalThis.fetch;
    const waking = vi.fn();
    const loading = loadLiveVerdict(SHEDIAC, waking, { fetch, url: URL, timeoutSignal: never });
    await vi.advanceTimersByTimeAsync(SAY_WAKING_AFTER_MS - 1);
    expect(waking).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(waking).toHaveBeenCalledTimes(1);
    answer(json(200, VERDICT));
    expect((await loading).verdict).toBe("drifting");
  });

  test("each attempt gets at most 30 s, and never more than what is left of the three minutes", async () => {
    const limits: number[] = [];
    const timeoutSignal = (ms: number) => {
      limits.push(ms);
      return never();
    };
    const { fetch } = engine([html(502), html(502), html(502)]);
    const loading = loadLiveVerdict(SHEDIAC, undefined, { fetch, url: URL, timeoutSignal });
    loading.catch(() => {});
    await vi.advanceTimersByTimeAsync(WAKE_BUDGET_MS + 1000);
    expect(limits[0]).toBe(ATTEMPT_TIMEOUT_MS);
    expect(Math.max(...limits)).toBeLessThanOrEqual(ATTEMPT_TIMEOUT_MS);
    expect(Math.min(...limits)).toBeGreaterThan(0);
  });

  test("the engine's own no-data answer ends it at once: one request, no waiting", async () => {
    const { fetch, asked } = engine([json(503, { error: "fire_data_unavailable" }), json(200, VERDICT)]);
    const waking = vi.fn();
    const loading = loadLiveVerdict(SHEDIAC, waking, { fetch, url: URL, timeoutSignal: never });
    await expect(loading).rejects.toMatchObject({ kind: "noData" });
    expect(asked).toHaveLength(1);
    expect(waking).not.toHaveBeenCalled();
  });

  test("still no answer after three minutes (a whole cold start): it gives up, saying the engine did not answer", async () => {
    expect(WAKE_BUDGET_MS).toBe(180_000);
    const { fetch, asked } = engine([]); // every attempt: Failed to fetch
    const loading = loadLiveVerdict(SHEDIAC, undefined, { fetch, url: URL, timeoutSignal: never });
    const outcome = loading.then(
      () => "verdict",
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(WAKE_BUDGET_MS - 1);
    expect(await Promise.race([outcome, Promise.resolve("still trying")])).toBe("still trying");
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await outcome;
    expect(error).toBeInstanceOf(LiveError);
    expect((error as LiveError).kind).toBe("notAnswering");
    // Backoff of 1, 2, 4, then 8 s between attempts: at 0, 1, 3 and 7 s, then every 8 s from 15 s to 175 s.
    expect(asked.length).toBe(25);
  });

  test("leaving Loading stops the asking: no more requests for a person who is no longer there", async () => {
    const { fetch, asked } = engine([html(502), html(502), html(502), json(200, VERDICT)]);
    const leaving = new AbortController();
    const loading = loadLiveVerdict(SHEDIAC, undefined, { fetch, url: URL, timeoutSignal: never, signal: leaving.signal });
    const outcome = loading.then(
      () => "verdict",
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(1500); // attempts at 0 and 1 s; the next is due at 3 s
    expect(asked).toHaveLength(2);
    leaving.abort();
    await vi.advanceTimersByTimeAsync(WAKE_BUDGET_MS);
    expect(asked).toHaveLength(2);
    expect(await outcome).toBeInstanceOf(LiveError);
  });

  test("a build without an engine URL cannot check live: no request", async () => {
    const { fetch, asked } = engine([json(200, VERDICT)]);
    await expect(loadLiveVerdict(SHEDIAC, undefined, { fetch, url: "", timeoutSignal: never })).rejects.toMatchObject({ kind: "noData" });
    expect(asked).toEqual([]);
  });
});

describe("waking the engine early", () => {
  afterEach(() => forgetWake());

  test("one quiet GET /health per app open, however many screens ask", async () => {
    const { fetch, asked } = engine([json(200, { status: "ok" }), json(200, { status: "ok" })]);
    wakeEngine({ fetch, url: URL });
    wakeEngine({ fetch, url: URL });
    await vi.waitFor(() => expect(asked).toEqual([`${URL}/health`]));
  });

  test("a failed ping is swallowed: nothing to show, nothing thrown", async () => {
    const { fetch } = engine([new TypeError("Failed to fetch")]);
    expect(() => wakeEngine({ fetch, url: URL })).not.toThrow();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  test("no engine URL: no ping", () => {
    const { fetch } = engine([]);
    wakeEngine({ fetch, url: "" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
