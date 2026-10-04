// "I have asthma or COPD": off by default, kept on the device only, forgotten on demand. And the feature's code has no
// way to send it anywhere.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { AT_RISK_KEY, forgetAtRisk, readAtRisk, saveAtRisk } from "./atRisk";

/** A device's storage, as a browser gives it. */
function storage(initial: Record<string, string> = {}) {
  const kept = new Map(Object.entries(initial));
  return {
    kept,
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
}
/** Storage that refuses everything: a private window, or storage switched off. */
const refusing = () => {
  const refuse = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  return { getItem: refuse, setItem: refuse, removeItem: refuse };
};

describe("the at-risk switch on the device", () => {
  test("off by default: a device that holds nothing reads as off, and reading stores nothing", () => {
    const device = storage();
    expect(readAtRisk(device)).toBe(false);
    expect([...device.kept]).toEqual([]);
  });

  test("on: one entry, under one key, with nothing in it but that the switch is on", () => {
    const device = storage({ "smoke-or-fire": '{"mode":"replay","lang":"en"}' });
    expect(saveAtRisk(device)).toBe(true);
    expect(readAtRisk(device)).toBe(true);
    expect(AT_RISK_KEY).toBe("smoke-or-fire.protect.at-risk");
    expect(device.kept.get(AT_RISK_KEY)).toBe("on");
    // The app's own entry is left as it was.
    expect([...device.kept.keys()].sort()).toEqual(["smoke-or-fire", AT_RISK_KEY]);
    expect(device.kept.get("smoke-or-fire")).toBe('{"mode":"replay","lang":"en"}');
  });

  test("forget: the entry is removed, not set to off; the device then reads as off", () => {
    const device = storage();
    saveAtRisk(device);
    expect(forgetAtRisk(device)).toBe(true);
    expect([...device.kept]).toEqual([]);
    expect(readAtRisk(device)).toBe(false);
    // Forgetting what was never kept is fine.
    expect(forgetAtRisk(device)).toBe(true);
  });

  test("only the app’s own value counts: anything else under the key reads as off", () => {
    for (const value of ["", "off", "true", "1", "ON", '{"atRisk":true}']) expect(readAtRisk(storage({ [AT_RISK_KEY]: value })), value).toBe(false);
  });

  test("a device that refuses storage: reads as off, and says it kept nothing, without failing", () => {
    expect(readAtRisk(refusing())).toBe(false);
    expect(saveAtRisk(refusing())).toBe(false);
    expect(forgetAtRisk(refusing())).toBe(false);
    expect([readAtRisk(null), saveAtRisk(null), forgetAtRisk(null)]).toEqual([false, false, false]);
  });
});

// A tripwire, not a proof: it reads the code for the usual ways out. The proof is in the browser (e2e/protect.spec.ts),
// where the same visit with the switch on and off sends the same requests.
describe("a tripwire: the code the switch passes through has none of the usual ways out", () => {
  const folder = new URL("./", import.meta.url);
  // This folder, and the two shared files the switch's words pass through on their way to Listen.
  const passedThrough = ["../listen/ListenButton.tsx", "../components/TopBar.tsx"];
  const code = [
    ...readdirSync(folder).filter((name) => /\.(ts|tsx|css)$/.test(name) && !/\.test\.ts$/.test(name)),
    ...passedThrough,
  ].map((name) => [name, readFileSync(new URL(name, folder), "utf8")] as const);

  test("no request, beacon, socket, image or frame loaded by code, new window, cookie, message to another window, share or clipboard", () => {
    const ways = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|RTCPeerConnection|new Image\b|\.src\s*=|window\.open|\burl\(|\.cookie\b|postMessage|BroadcastChannel|navigator\.share|clipboard|indexedDB|sessionStorage|import\s*\(/;
    expect(code.length).toBeGreaterThanOrEqual(9);
    expect(code.filter(([, text]) => ways.test(text)).map(([name]) => name)).toEqual([]);
  });

  test("the device’s storage is touched in one file only, and the key is named in one place", () => {
    expect(code.filter(([, text]) => /localStorage/.test(text)).map(([name]) => name)).toEqual(["atRisk.ts"]);
    expect(code.filter(([, text]) => text.includes("smoke-or-fire.protect")).map(([name]) => name)).toEqual(["atRisk.ts"]);
  });

  test("no address is built from it: the only links are the sources’ own pages and the app’s screens", () => {
    // Links come from sources.json and the app's strings; no file of the feature puts a value into an address.
    const builds = /new URL\(|URLSearchParams|encodeURIComponent|location\.(href|search|hash|assign|replace)|history\.(push|replace)State|[?&]\w+=\$\{/;
    expect(code.filter(([, text]) => builds.test(text)).map(([name]) => name)).toEqual([]);
  });
});
