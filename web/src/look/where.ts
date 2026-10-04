// Where the person is, as something to read out to the 911 dispatcher (the Call 911 now screen). Pure: no React, no DOM.
import { translate, type Lang, type StringKey } from "../i18n";

/** A phone position: when it was taken (the fix's own time, in ms) and how accurate it is (metres). */
export interface Fix {
  lat: number;
  lon: number;
  at?: number;
  accuracy?: number;
}

export interface Spot {
  name: string;
  province: string;
  lat: number;
  lon: number;
  /** The place list's kind: CITY, TOWN, VILG, or a smaller community. */
  type?: string;
}

/** A position counts as where the person is for ten minutes. */
export const FRESH_MS = 600000;
/** Coordinates are shown only when the phone is sure of them within this many metres. */
export const ACCURATE_M = 100;
/** A community names the spot only when it is this close. */
export const NEAR_KM = 10;
// A phone's clock can run a little ahead of the page's.
const CLOCK_SKEW_MS = 60000;

/** Taken at most 10 minutes ago, by its own timestamp. A fix with no time is never fresh; one from the future is not either. */
export function isFresh(fix: Fix | null | undefined, now: number): boolean {
  if (!fix || typeof fix.at !== "number") return false;
  const age = now - fix.at;
  return age <= FRESH_MS && age >= -CLOCK_SKEW_MS;
}

const DEGREES: Record<Lang, Intl.NumberFormat> = {
  en: new Intl.NumberFormat("en-CA", { minimumFractionDigits: 4, maximumFractionDigits: 4, useGrouping: false }),
  fr: new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 4, maximumFractionDigits: 4, useGrouping: false }),
};

/** Two lines to read out: "46.0878° north", "64.7782° west" (French "46,0878° nord", "64,7782° ouest"). */
export function coordinateLines(lat: number, lon: number, lang: Lang): [string, string] {
  const line = (value: number, positive: StringKey, negative: StringKey) =>
    translate(lang, value < 0 ? negative : positive, { deg: DEGREES[lang].format(Math.abs(value)) });
  return [line(lat, "emergency.where.north", "emergency.where.south"), line(lon, "emergency.where.east", "emergency.where.west")];
}

// As placeAt measures (data/places.ts): flat, which is close enough over a few kilometres.
const kmFrom = (spot: Spot, lat: number, lon: number) => Math.hypot((spot.lat - lat) * 111.2, (spot.lon - lon) * 111.2 * Math.cos((lat * Math.PI) / 180));

/** The nearest community of any kind within `km`, else null: a far-off town never names the spot. */
export function nearestWithin<S extends Spot>(list: S[], lat: number, lon: number, km: number = NEAR_KM): S | null {
  let nearest: S | null = null;
  let distance = Infinity;
  for (const spot of list) {
    const d = kmFrom(spot, lat, lon);
    if (d < distance) {
      nearest = spot;
      distance = d;
    }
  }
  return distance <= km ? nearest : null;
}

// The kinds a dispatcher knows by name, as placeAt names a spot (data/places.ts).
const TOWN_TYPES = new Set(["CITY", "TOWN", "VILG"]);

/**
 * The community that names the spot: the nearest city, town or village within 10 km (downtown Moncton is "Moncton",
 * though a small neighbourhood is nearer), else the nearest community of any kind within 10 km, else none.
 */
export function nameFor<S extends Spot>(list: S[], lat: number, lon: number): S | null {
  return nearestWithin(list.filter((spot) => TOWN_TYPES.has(spot.type ?? "")), lat, lon) ?? nearestWithin(list, lat, lon);
}

/** "de Moncton" / "d’Edmundston" / "d’Halifax": French elides "de" before a vowel or a silent h. Only Halifax is listed:
 *  some place names start with a sounded h, which keeps "de". */
export const ofTown = (town: string) => (/^([aeiouyàâäéèêëîïôöùûü]|halifax\b)/i.test(town) ? `d’${town}` : `de ${town}`);

// "NB" / "N.-B."; a province the strings don't have keeps its code.
const province = (lang: Lang, code: string) => translate(lang, `province.${code}` as StringKey) || code;

/** "Near Moncton, NB" / "Près de Moncton, N.-B." */
export const nearLine = (lang: Lang, spot: { name: string; province: string }) =>
  translate(lang, "emergency.where.near", { town: spot.name, ofTown: ofTown(spot.name), province: province(lang, spot.province) });

/** "Moncton, NB" / "Moncton, N.-B." */
export const townLine = (lang: Lang, town: { name: string; province: string }) =>
  translate(lang, "emergency.where.town", { town: town.name, province: province(lang, town.province) });

/** What the Call 911 now screen can show: the phone's own position, a town the person typed, or nothing. */
export type Where =
  | { kind: "fix"; near: Spot | null; coords: [string, string] | null }
  | { kind: "town"; name: string; province: string }
  | { kind: "unknown" };

/**
 * A fresh phone position comes first: the nearest community when one is close (and the phone is sure to 10 km), and
 * the coordinates when the phone is sure of them. Otherwise a town the person typed in live mode, by name only (its coordinates are the town's, not the
 * person's). A replay town is never where the person is. `list` is null until the communities have loaded.
 */
export function whereNow(input: {
  shared: Fix | null;
  place: { name: string; province: string; source?: "search" | "gps"; replayFile?: string } | null;
  mode: "live" | "replay";
  now: number;
  lang: Lang;
  list: Spot[] | null;
}): Where {
  const { shared, place, mode, now, lang, list } = input;
  if (shared && isFresh(shared, now)) {
    // A position the phone is unsure of by more than those 10 km cannot say which community is near.
    const vague = typeof shared.accuracy === "number" && shared.accuracy > NEAR_KM * 1000;
    return {
      kind: "fix",
      near: list && !vague ? nameFor(list, shared.lat, shared.lon) : null,
      coords: typeof shared.accuracy === "number" && shared.accuracy <= ACCURATE_M ? coordinateLines(shared.lat, shared.lon, lang) : null,
    };
  }
  if (mode === "live" && place && place.source === "search" && !place.replayFile) return { kind: "town", name: place.name, province: place.province };
  return { kind: "unknown" };
}
