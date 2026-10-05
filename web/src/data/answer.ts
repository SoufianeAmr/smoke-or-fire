// One answer of the engine to GET /verdict, as the app reads it: a verdict, a real no-data answer, or "waking" (the
// engine is not answering yet). Used by the live check (./live) and, so the two can never disagree about what waking
// means, by the test against the real engine (e2e/real-engine.spec.ts). Nothing of the browser or of the app's state
// is used here: a Response in, what it means out.
import type { VerdictJson } from "../verdict/types";

/** The longest pause the engine's own Retry-After can ask for. */
const RETRY_AFTER_MAX_MS = 15_000;

/** One answer, read: a verdict; a real no-data answer; or "waking": the engine is not answering yet. */
export type Answer = { kind: "verdict"; json: VerdictJson } | { kind: "noData"; reason: string } | { kind: "waking"; reason: string; retryAfterMs: number | null };

/**
 * What one response means. The engine's own answers are JSON: a verdict, or a 503 with its error ("wind_data_unavailable",
 * "fire_data_unavailable"), which says "warming" while its first wind grid loads after a start. A gateway status
 * without that JSON, or a page that is not JSON at all, is Render's while the service comes back: not an answer.
 */
export async function readAnswer(response: Response): Promise<Answer> {
  const status = response.status;
  let json: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(await response.text());
    json = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  if (response.ok) {
    if (json && typeof json.verdict === "string") return { kind: "verdict", json: json as unknown as VerdictJson };
    if (json) return { kind: "noData", reason: "the engine's answer has no verdict" };
    return { kind: "waking", reason: `${status} without JSON: not the engine's answer`, retryAfterMs: null };
  }
  if (status === 502 || status === 503 || status === 504) {
    const retryAfter = response.headers.get("retry-after");
    const retryAfterMs = retryAfter && /^\d+$/.test(retryAfter) ? Math.min(Number(retryAfter) * 1000, RETRY_AFTER_MAX_MS) : null;
    if (json?.status === "warming") return { kind: "waking", reason: "the engine is warming up", retryAfterMs };
    if (json && typeof json.error === "string") return { kind: "noData", reason: json.error };
    return { kind: "waking", reason: `${status} from the gateway, not the engine`, retryAfterMs };
  }
  return { kind: "noData", reason: `the engine answered ${status}` };
}
