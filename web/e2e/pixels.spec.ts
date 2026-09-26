// Screens with no engine data, compared pixel by pixel with design/screens/*.html at 390 × 844.
// A small difference is allowed. These are reported, never blocking: run with `npm run e2e:pixels`.
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const TOLERANCE = 0.02; // at most 2% of pixels may differ
const design = (file: string) => new URL(`../../design/screens/${file}`, import.meta.url).href;

const SCREENS: { name: string; file: string; route: string; setup?: (page: Page) => Promise<void> }[] = [
  { name: "01 Check", file: "01-check.html", route: "/?mode=replay" },
  { name: "02 Q1", file: "02-q1-flames.html", route: "/q1" },
  { name: "03 Q2", file: "03-q2-describe.html", route: "/q2" },
  { name: "04 Emergency", file: "04-emergency.html", route: "/emergency" },
  { name: "08 How it works", file: "08-how-it-works.html", route: "/how-it-works" },
];

// A screen file opened directly still has the design tool's markup. Apply what the tool does for a
// preview: sc-camel-* attributes become the real (camelCase) ones, and each <sc-if> shows its
// content when its hint-placeholder-val is true and hides it otherwise.
function renderScreenFile() {
  document.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith("sc-camel-") && !attr.name.startsWith("sc-camel-on-")) {
        const name = attr.name.slice(9).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
        el.setAttribute(name, attr.value);
      }
    }
  });
  document.querySelectorAll("sc-if").forEach((el) => {
    if (/true/.test(el.getAttribute("hint-placeholder-val") ?? "")) el.replaceWith(...el.childNodes);
    else el.remove();
  });
}

async function shot(page: Page, url: string, setup?: (page: Page) => Promise<void>) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  if (url.startsWith("file:")) await page.evaluate(renderScreenFile);
  await page.evaluate(() => document.fonts.ready);
  if (setup) await setup(page);
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
  return PNG.sync.read(await page.screenshot());
}

for (const screen of SCREENS) {
  test(`${screen.name} matches the screen file`, async ({ page, baseURL }, info) => {
    await page.goto(`${baseURL}/?mode=replay`); // replay mode, as in the screen files
    const expected = await shot(page, design(screen.file));
    const actual = await shot(page, `${baseURL}${screen.route}`, screen.setup);
    const { width, height } = expected;
    const diff = new PNG({ width, height });
    const changed = pixelmatch(expected.data, actual.data, diff.data, width, height, { threshold: 0.1 });
    const ratio = changed / (width * height);
    const out = fileURLToPath(new URL(`../test-results/pixels-${screen.file.replace(".html", "")}`, import.meta.url));
    writeFileSync(`${out}-diff.png`, PNG.sync.write(diff));
    writeFileSync(`${out}-app.png`, PNG.sync.write(actual));
    writeFileSync(`${out}-design.png`, PNG.sync.write(expected));
    info.annotations.push({ type: "pixel difference", description: `${(ratio * 100).toFixed(2)}%` });
    console.log(`${screen.name}: ${(ratio * 100).toFixed(2)}% of pixels differ`);
    expect(ratio).toBeLessThan(TOLERANCE);
  });
}
