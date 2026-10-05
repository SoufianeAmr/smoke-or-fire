// "If you’re told to leave": evacuation centres officials announced during past fires (evacuation-events.json,
// hand-curated from official sources). An event shows only on the dates it was active: the replay's Aug 25, 2025,
// or today in live mode. Nothing is looked up at runtime, and no route is planned or handed to a maps app: each
// centre's card says how far it is and which way, and the screen says to follow the route officials give.
import type { Mode } from "../app/state";
import { translate, type Lang } from "../i18n";
import demo from "../../../data/demo/index.json";
import fireNames from "../../../data/places/fire-names.json";
import data from "./evacuation-events.json";

export type CentreType = "reception" | "comfort";
export type Service = "showers-laundry" | "wifi" | "light-food" | "overnight" | "charging";

export interface LatLon {
  lat: number;
  lon: number;
}

/** 24-hour "HH:MM" opening hours. */
export type Hours = { open: string; close: string; days: "daily" };

export interface Centre extends LatLon {
  type: CentreType;
  name: string;
  /** As the source writes it, e.g. "295 Commercial St., Middleton". */
  address: string;
  town: string;
  /** The address with its province, as a maps app takes it. Kept in the data; the screen hands out no route. */
  destination: string;
  services: Service[];
  /** Null when the source gives none. */
  hours: Hours | null;
  /** Evacuees register here. */
  register: boolean;
}

export interface EvacuationEvent {
  id: string;
  fire: LatLon & { name: string };
  active: { from: string; to: string };
  /** Who announced the centres, and when (YYYY-MM). */
  authority: Record<Lang, string>;
  announced: string;
  /** Where the evacuation was, e.g. "Annapolis County". */
  area: Record<Lang, string>;
  /** The centres show only within this distance of the fire. */
  radiusKm: number;
  /** The official page that announced the centres. */
  source: string;
  centres: Centre[];
  /** The public information line (staffed hours) and the overnight accommodation line. */
  phones: { information: { number: string; hours: Hours }; overnight: string };
}

/** The replay's check date (data/demo/index.json), as YYYY-MM-DD. */
export const REPLAY_DATE = demo.time.slice(0, 10);

export const EVENTS: EvacuationEvent[] = data.events.map((event) => {
  if (!fireNames.fires.some((f) => f.name === event.fire.name)) throw new Error(`${event.id}: no fire named ${event.fire.name} in data/places/fire-names.json`);
  return {
    id: event.id,
    fire: event.fire,
    active: event.active,
    authority: event.authority,
    area: event.area,
    radiusKm: event.radiusKm,
    announced: event.announced,
    source: event.source,
    centres: event.centres.map((c) => ({ ...c, type: c.type as CentreType, services: c.services as Service[], hours: c.hours as Hours | null })),
    phones: { information: { number: event.phones.information.number, hours: event.phones.information.hours as Hours }, overnight: event.phones.overnight.number },
  };
});

/** Today's date in Atlantic time, as YYYY-MM-DD. */
export function todayAtlantic(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** The event active on a date (YYYY-MM-DD, both ends of its dates included), if any. */
export function activeEvent(date: string, events = EVENTS): EvacuationEvent | null {
  return events.find((e) => e.active.from <= date && date <= e.active.to) ?? null;
}

/** Replay shows what was announced on its check date; live mode, what is announced today. */
export function eventFor(mode: Mode, now = new Date()): EvacuationEvent | null {
  return activeEvent(mode === "replay" ? REPLAY_DATE : todayAtlantic(now));
}

export const centreOf = (event: EvacuationEvent, type: CentreType) => event.centres.find((c) => c.type === type) ?? null;

/** Great-circle distance in km. */
export function kmBetween(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** The event's centres apply to someone within its radius of the fire. */
export const isNear = (event: EvacuationEvent, place: LatLon) => kmBetween(place, event.fire) <= event.radiusKm;

/** Which way b lies from a: the first heading of the great circle between them, in degrees clockwise from north. */
export function bearingTo(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const [lat1, lat2, dLon] = [a.lat * rad, b.lat * rad, (b.lon - a.lon) * rad];
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/** The eight compass points, clockwise from north, as the strings name them (compass.at.NE). */
export const COMPASS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type Compass8 = (typeof COMPASS_8)[number];

/**
 * How far a centre is from a place, and which way, for its card: whole kilometres in a straight line, the nearest of
 * the eight compass points, and the angle to turn an arrow to. Under 1 km there is no direction (null): the centre's
 * point and the place's are both approximate. No route is planned, here or anywhere: the screen says to follow the
 * route officials give.
 */
export function awayFrom(from: LatLon, to: LatLon): { km: number; point: Compass8; deg: number } | null {
  const km = kmBetween(from, to);
  if (km < 1) return null;
  const index = Math.round(bearingTo(from, to) / 45) % 8;
  return { km: Math.round(km), point: COMPASS_8[index], deg: index * 45 };
}

/** "1-833-806-1515" → "tel:18338061515". */
export const telUrl = (number: string) => `tel:${number.replace(/\D/g, "")}`;

/** A link that opens a point in any browser or maps app, at full precision: the person chooses who gets it. */
export const mapLink = ({ lat, lon }: LatLon) => `https://maps.google.com/?q=${lat},${lon}`;

/** A text message with the body filled in, recipient left empty. "sms:?&body=" opens it on iPhone and Android. */
export const smsUrl = (body: string) => `sms:?&body=${encodeURIComponent(body)}`;

/** The text to family: "I’m OK…", then "My location: {link}" when the phone's own position is known. */
export const familyMessage = (lang: Lang, at: LatLon | null) =>
  [translate(lang, "leave.family.sms"), at && translate(lang, "leave.family.location", { mapLink: mapLink(at) })].filter(Boolean).join(" ");

/** "2025-08" → "August 2025" / "août 2025". */
export const monthName = (month: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-CA", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));

/** "10:00" → "10 a.m." / "10 h"; "16:30" → "4:30 p.m." / "16 h 30" (no-break spaces). */
export function clockTime(hhmm: string, lang: Lang): string {
  const [h, m] = hhmm.split(":").map(Number);
  const minutes = String(m).padStart(2, "0");
  if (lang === "fr") return `${h}\u00a0h${m ? `\u00a0${minutes}` : ""}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${minutes}` : ""}\u00a0${h < 12 ? "a.m." : "p.m."}`;
}
