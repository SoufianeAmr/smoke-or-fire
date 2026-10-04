// How long the map takes to be there on a slowed-down phone, and how it moves under a finger. Numbers, not pass or
// fail on a shared machine: printed, and written to test-results/map-perf.json. Run with `npm run e2e:perf`.
//
// The phone: a mid-range one on a slow connection, as Lighthouse's mobile profile has it (the processor four times
// slower, 1.6 Mbit/s down, 750 kbit/s up, 150 ms each way). The site: the test build, served here as the host serves
// it (gzip for scripts, byte ranges for the tiles), which `vite preview` does not do.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const DIST = fileURLToPath(new URL("../dist-e2e/", import.meta.url));
const OUT = fileURLToPath(new URL("../test-results/", import.meta.url));
const PHONE = { cpu: 4, latency: 150, down: (1.6 * 1024 * 1024) / 8, up: (750 * 1024) / 8 };
const BUDGET_MS = 1500;
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json", ".pmtiles": "application/octet-stream" };

let server: Server;
let site: string;
test.beforeAll(async () => {
  const zipped = new Map<string, Buffer>();
  server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    let file = join(DIST, path);
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, "index.html"); // every other address is the app
    const type = TYPES[extname(file)] ?? "application/octet-stream";
    const range = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? "");
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      const size = statSync(file).size;
      const bytes = Buffer.alloc(to - from + 1);
      const fd = openSync(file, "r");
      readSync(fd, bytes, 0, bytes.length, from);
      closeSync(fd);
      response.writeHead(206, { "content-type": type, "content-range": `bytes ${from}-${to}/${size}`, "content-length": bytes.length, "accept-ranges": "bytes", etag: `"${size}"` });
      return response.end(bytes);
    }
    if (/javascript|css|html|json/.test(type)) {
      if (!zipped.has(file)) zipped.set(file, gzipSync(readFileSync(file), { level: 9 }));
      const body = zipped.get(file)!;
      response.writeHead(200, { "content-type": type, "content-encoding": "gzip", "content-length": body.length, "cache-control": "no-cache" });
      return response.end(body);
    }
    response.writeHead(200, { "content-type": type, "accept-ranges": "bytes" });
    response.end(readFileSync(file));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  site = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(() => new Promise((done) => server.close(done)));

async function slowPhone(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: PHONE.latency, downloadThroughput: PHONE.down, uploadThroughput: PHONE.up });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: PHONE.cpu });
}
/** One check. `interactive`: MapLibre has drawn a whole first picture and is on the stage. `shown`: the detailed map
 *  has taken the outline map's place on the screen, and takes gestures (it is out of sight and reach until then). Both
 *  from the moment the verdict screen showed. */
async function check(page: Page, town: string) {
  page.setDefaultNavigationTimeout(60_000);
  await page.goto(`${site}/location`);
  await page.locator("input[type=search]").fill(town);
  await page.getByRole("option", { name: new RegExp(`^${town},`) }).first().click();
  await page.waitForFunction(() => performance.getEntriesByName("map:shown").length > 0, null, { timeout: 90_000 });
  return page.evaluate(() => {
    const at = (name: string) => performance.getEntriesByName(name).at(-1)?.startTime ?? NaN;
    return { interactive: Math.round(at("map:interactive") - at("verdict:shown")), shown: Math.round(at("map:shown") - at("verdict:shown")) };
  });
}
/** A first visit: nothing in the browser's cache. */
async function firstVisit(browser: Browser, town: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await slowPhone(page);
  await page.goto(`${site}/?mode=replay`);
  await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"mode":"replay"'));
  const first = await check(page, town);
  // A second check in the same visit, another town: the map's code is already in the page.
  await page.goto(`${site}/?mode=replay`);
  const second = await check(page, "Halifax");
  const machine = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return { renderer: info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unknown", cores: navigator.hardwareConcurrency, browser: navigator.userAgent };
  });
  await context.close();
  return { first, second, machine };
}
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const save = (name: string, value: unknown) => {
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, "map-perf.json");
  const all = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  writeFileSync(file, JSON.stringify({ ...all, [name]: value }, null, 1));
};

test("the map is there within 1.5 s of the verdict, on a slowed-down phone", async ({ browser }, info) => {
  test.setTimeout(600_000);
  const runs = [];
  for (let i = 0; i < 5; i++) runs.push(await firstVisit(browser, "Moncton"));
  const result = {
    phone: "CPU 4x slower, 1.6 Mbit/s down, 750 kbit/s up, 150 ms latency",
    machine: runs[0].machine,
    firstCheck: { interactiveMs: runs.map((r) => r.first.interactive), shownMs: runs.map((r) => r.first.shown), medianInteractiveMs: median(runs.map((r) => r.first.interactive)), medianShownMs: median(runs.map((r) => r.first.shown)) },
    secondCheck: { interactiveMs: runs.map((r) => r.second.interactive), shownMs: runs.map((r) => r.second.shown), medianInteractiveMs: median(runs.map((r) => r.second.interactive)), medianShownMs: median(runs.map((r) => r.second.shown)) },
    budgetMs: BUDGET_MS,
  };
  save(process.env.PERF_GL === "software" ? "mapReadySoftwareGL" : "mapReady", result);
  console.log(JSON.stringify(result, null, 1));
  info.annotations.push({ type: "map ready", description: `first check: interactive ${result.firstCheck.medianInteractiveMs} ms, shown ${result.firstCheck.medianShownMs} ms after the verdict (median of 5); second check: ${result.secondCheck.medianInteractiveMs} ms / ${result.secondCheck.medianShownMs} ms` });
  // The budget is held to the later of the two: the map on the screen, taking gestures.
  expect(result.firstCheck.medianShownMs).toBeLessThanOrEqual(BUDGET_MS);
});

test("dragging the map: frame by frame, with nothing redrawn in the overlay", async ({ browser }, info) => {
  test.setTimeout(300_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${site}/?mode=replay`);
  await page.waitForFunction(() => sessionStorage.getItem("smoke-or-fire")?.includes('"mode":"replay"'));
  await check(page, "Moncton");
  await slowPhone(page);
  const box = (await page.locator(".map-stage").boundingBox())!;
  const from = { x: box.x + box.width * 0.3, y: box.y + 150 };
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __changes: number; __stop: boolean };
    w.__frames = [];
    w.__changes = 0;
    w.__stop = false;
    new MutationObserver((list) => { w.__changes += list.length; }).observe(document.querySelector(".map-overlay")!, { subtree: true, childList: true, attributes: true });
    let last = performance.now();
    const tick = (now: number) => { w.__frames.push(now - last); last = now; if (!w.__stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Back and forth for about two seconds.
  for (let i = 0; i < 4; i++) await page.mouse.move(from.x + (i % 2 ? 0 : 140), from.y + (i % 2 ? 0 : 60), { steps: 30 });
  const during = await page.evaluate(() => { const w = window as unknown as { __frames: number[]; __changes: number; __stop: boolean }; w.__stop = true; return { frames: w.__frames.slice(2), changes: w.__changes }; });
  await page.mouse.up();
  const sorted = [...during.frames].sort((a, b) => a - b);
  const result = {
    phone: "CPU 4x slower",
    frames: sorted.length,
    medianFrameMs: Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10,
    p95FrameMs: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10,
    worstFrameMs: Math.round(sorted[sorted.length - 1] * 10) / 10,
    overlayChangesWhileDragging: during.changes,
  };
  save(process.env.PERF_GL === "software" ? "dragSoftwareGL" : "drag", result);
  console.log(JSON.stringify(result, null, 1));
  info.annotations.push({ type: "drag", description: JSON.stringify(result) });
  await context.close();
  expect(result.overlayChangesWhileDragging).toBe(0);
});
