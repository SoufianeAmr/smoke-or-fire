// Live checks through the deployed site against the real engine (playwright.real.config.ts).
// The browser calls the engine from the site's origin, so these also prove CORS.
// The engine's host puts it to sleep when idle. While it comes back the host answers with its own 502, 503 or 504,
// then the engine answers 503 "warming" until its first wind grid is loaded; the app keeps asking for up to three
// minutes. That is not a failure here; anything else is. Each answer is read by the app's own rule
// (src/data/answer.ts), so this test and the app cannot disagree about what "waking" means.
import { expect, test, type Page } from "@playwright/test";
import { readAnswer, type Answer } from "../src/data/answer";
import { toLocation } from "./look";
import { openWhy } from "./verdict";

const VERDICT_LABEL = /^(DRIFTING SMOKE|UNCLEAR|UNEXPLAINED SMOKE)$/;

/** The glance card of one of the three verdicts, its ECCC alert badge in one of its three states (never none of them),
 *  and behind "Why?" the verdict's label. */
async function expectVerdict(page: Page) {
  await expect(page.locator("section.glance")).toHaveAttribute("data-state", /^(drifting|unclear|unexplained)$/);
  await expect(page.locator("h1#verdict-h")).toBeVisible();
  await expect(page.locator('main .badge[data-badge="alert"]')).toHaveAttribute("data-tone", /^(active|none|notChecked)$/);
  await openWhy(page);
  await expect(page.getByText(VERDICT_LABEL)).toBeVisible();
}

/** How long the app keeps asking a waking engine (WAKE_BUDGET_MS in src/data/live.ts), and a little for the screens around it. */
const WAKE_BUDGET_MS = 180_000;
const VERDICT_WITHIN_MS = WAKE_BUDGET_MS + 15_000;

/** One answer of the engine to GET /verdict, as the browser received it, and what the app reads in it. */
type Seen = { status: number; read: Answer };

/** The app's reading of an answer: its status, its body as text, and its Retry-After. */
async function seen(status: number, body: string, retryAfter: string | null = null): Promise<Seen> {
  // (A status that carries no body cannot be given one.)
  const response = new Response([204, 205, 304].includes(status) ? null : body, { status, headers: retryAfter === null ? {} : { "retry-after": retryAfter } });
  return { status, read: await readAnswer(response) };
}

/** The engine's GET /verdict answers to this page, in the order they came. Read once the verdict is on the screen. */
function engineAnswers(page: Page) {
  const answers: Promise<Seen>[] = [];
  page.on("response", (r) => {
    if (!(/\/verdict\?/.test(r.url()) && r.url().includes("mode=live"))) return;
    answers.push(r.text().catch(() => "").then((body) => seen(r.status(), body, r.headers()["retry-after"] ?? null)));
  });
  return () => Promise.all(answers);
}

/** An answer in words: its status, and what the app reads in it. */
const said = ({ status, read }: Seen) => (read.kind === "verdict" ? `${status}, a verdict` : `${status}, which the app reads as ${read.kind === "waking" ? "waking" : "no data"} (${read.reason})`);

/**
 * What is wrong with the engine's answers to one check, in words; none when they are as they should be. The last is
 * the verdict: 200. Before it there may be answers the app reads as "waking", and only those: the engine's own 503
 * "warming" after a start, or the host's 502, 503 or 504 (or a page that is not the engine's) before the engine is
 * up. Anything else before the verdict (the engine's own no-data answer, any other status, a second verdict), no
 * verdict at the end, or no answer at all, is wrong.
 */
function wrongAnswers(answers: Seen[]): string[] {
  if (answers.length === 0) return ["the engine was never asked, or never answered"];
  const [last, before] = [answers[answers.length - 1], answers.slice(0, -1)];
  return [
    ...before.flatMap((a, i) => (a.read.kind === "waking" ? [] : [`answer ${i + 1} of ${answers.length} is ${said(a)}: before the verdict, only an engine that is waking up is expected`])),
    ...(last.status !== 200 ? [`the last answer is ${said(last)}, not 200`] : last.read.kind !== "verdict" ? [`the last answer is ${said(last)}, not a verdict`] : []),
  ];
}

/** The answers are as they should be; what came before the verdict is noted with the test. */
async function expectVerdictAnswered(read: () => Promise<Seen[]>) {
  const answers = await read();
  test.info().annotations.push({ type: "engine answers", description: answers.map((a) => (a.read.kind === "waking" ? `${a.status} (${a.read.reason})` : String(a.status))).join(", ") });
  expect(wrongAnswers(answers)).toEqual([]);
}

// The rule itself, with no network: what passes and what does not. The answers are made as the engine and its host
// send them, and read by the app's own rule.
test("the engine’s answers to a check: waking any number of times, as the app reads it, then 200; anything else is wrong", async () => {
  const verdict = () => seen(200, JSON.stringify({ verdict: "drifting" }));
  const warming = () => seen(503, JSON.stringify({ error: "wind_data_unavailable", status: "warming" }), "15");
  const hostPage = (status: number) => seen(status, "<html><body>Service waking up</body></html>");
  const check = async (...answers: Promise<Seen>[]) => wrongAnswers(await Promise.all(answers));

  // An engine that is awake, and the cold start seen on Oct 4, 2026: six times warming, then the verdict.
  expect(await check(verdict())).toEqual([]);
  expect(await check(...Array.from({ length: 6 }, warming), verdict())).toEqual([]);
  // A deeper cold start: the host's own 502, 503 or 504 before the engine is up, then the engine warming. As the
  // app treats them, so does this test.
  expect(await check(hostPage(502), hostPage(503), hostPage(504), warming(), warming(), verdict())).toEqual([]);
  expect(await check(seen(503, ""), seen(502, "Bad Gateway", "5"), seen(200, "<html>not the engine</html>"), verdict())).toEqual([]);

  // Not waking: the engine's own no-data answers, and any other status. Each is named with what the app reads in it.
  expect(await check(seen(503, JSON.stringify({ error: "wind_data_unavailable" })), verdict())).toEqual([
    "answer 1 of 2 is 503, which the app reads as no data (wind_data_unavailable): before the verdict, only an engine that is waking up is expected",
  ]);
  for (const status of [400, 404, 422, 429, 500]) expect(await check(hostPage(status), verdict()), String(status)).toHaveLength(1);
  expect(await check(seen(500, JSON.stringify({ status: "warming" })), verdict())).toHaveLength(1); // warming is a 503
  expect(await check(warming(), seen(200, JSON.stringify({ detail: "no verdict here" })), verdict())).toHaveLength(1);
  // One verdict, the last: a verdict before it is wrong too.
  expect(await check(verdict(), verdict())).toEqual(["answer 1 of 2 is 200, a verdict: before the verdict, only an engine that is waking up is expected"]);

  // The last answer must be 200, and a verdict; with no answer at all there is nothing to show.
  expect(await check(warming(), warming())).toEqual(["the last answer is 503, which the app reads as waking (the engine is warming up), not 200"]);
  expect(await check(warming(), hostPage(502))).toEqual(["the last answer is 502, which the app reads as waking (502 from the gateway, not the engine), not 200"]);
  expect(await check(warming(), hostPage(500))).toHaveLength(1);
  expect(await check(seen(200, "<html>not the engine</html>"))).toEqual(["the last answer is 200, which the app reads as waking (200 without JSON: not the engine's answer), not a verdict"]);
  expect(await check()).toEqual(["the engine was never asked, or never answered"]);
});
async function openLive(page: Page) {
  await page.goto("/?mode=live");
  await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes(`"mode":"live"`));
}

test("Live check for Fredericton gets its verdict from the real engine", async ({ page }) => {
  const answers = engineAnswers(page);
  await openLive(page);
  await page.getByRole("link", { name: "I smell smoke" }).click();
  await expect(page.getByRole("heading", { name: "Do you see flames?" })).toBeVisible();
  await toLocation(page); // no flames, grey haze, nothing burning nearby
  await page.getByLabel("Town or city").fill("Frederict");
  await page.getByRole("option", { name: /^Fredericton, NB/ }).click();

  await expect(page).toHaveURL(/\/verdict$/, { timeout: VERDICT_WITHIN_MS });
  await expectVerdict(page);
  await expect(page.getByRole("link", { name: "Exit" })).toHaveCount(0); // live: no replay banner
  await expectVerdictAnswered(answers);
});

test.describe("Live: Use my location", () => {
  test.use({ geolocation: { latitude: 46.09, longitude: -64.78 }, permissions: ["geolocation"] });

  test("gets a verdict for the reported spot from the real engine", async ({ page }) => {
    const answers = engineAnswers(page);
    await openLive(page);
    await page.goto("/location");
    await page.getByRole("link", { name: "Use my location" }).click();

    await expect(page).toHaveURL(/\/verdict$/, { timeout: VERDICT_WITHIN_MS });
    await expectVerdict(page);
    await expectVerdictAnswered(answers);
  });
});
