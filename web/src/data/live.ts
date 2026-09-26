// Live mode: GET /verdict from the engine at VITE_ENGINE_URL. Any failure rejects, and the app shows screen 9b.
import { ENGINE_URL, type Place } from "../app/state";
import type { VerdictJson } from "../verdict/types";

// A free Render service that has gone to sleep takes about a minute to answer again.
const TIMEOUT_MS = 60_000;

export async function loadLiveVerdict(place: Place): Promise<VerdictJson> {
  if (!ENGINE_URL) throw new Error("this build has no engine URL (VITE_ENGINE_URL)");
  const query = new URLSearchParams({ lat: String(place.lat), lon: String(place.lon), mode: "live" });
  const response = await fetch(`${ENGINE_URL.replace(/\/+$/, "")}/verdict?${query}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`the engine answered ${response.status}`);
  const json = await response.json();
  if (typeof json?.verdict !== "string") throw new Error("the engine's answer has no verdict");
  return json as VerdictJson;
}
