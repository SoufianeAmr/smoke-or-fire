// Replay mode: the 12 towns and their recorded verdicts from data/demo/, bundled into the app.
// Replay never calls the engine.
import type { Place } from "../app/state";
import type { VerdictJson } from "../verdict/types";
import towns from "./replay-towns.json";

export const REPLAY_TOWNS: Place[] = towns;

// The towns' verdicts; index.json lists them and is not one.
const files = import.meta.glob<VerdictJson>(["../../../data/demo/*.json", "!../../../data/demo/index.json"], { import: "default" });

export async function loadReplayVerdict(place: Place): Promise<VerdictJson> {
  const load = files[`../../../data/demo/${place.replayFile}`];
  if (!load) throw new Error(`No replay file for ${place.name}`);
  return load();
}

/** The replay town closest to a point ("Use my location" in replay). */
export function nearestReplayTown(lat: number, lon: number): Place {
  const km = (p: Place) => Math.hypot((p.lat - lat) * 111.2, (p.lon - lon) * 111.2 * Math.cos((lat * Math.PI) / 180));
  return REPLAY_TOWNS.reduce((best, town) => (km(town) < km(best) ? town : best));
}

/** Towns whose name starts with, or has a word starting with, the typed text (accents ignored). */
export function searchPlaces(places: Place[], query: string, limit = 6): Place[] {
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase(); // drop accent marks
  const q = fold(query.trim());
  if (!q) return [];
  return places.filter((p) => fold(p.name).split(/[\s-]+/).some((word) => word.startsWith(q)) || fold(p.name).startsWith(q)).slice(0, limit);
}
