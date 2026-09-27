// "If you’re told to leave": evacuation centres officials announced during past fires (evacuation-events.json,
// hand-curated from official sources). An event shows only on the dates it was active: the replay's Aug 25, 2025,
// or today in live mode. Nothing is looked up at runtime, and no route is planned here: "Get directions" hands
// the address to the phone's maps app.
import type { Mode } from "../app/state";
import type { Lang } from "../i18n";
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
  /** The address handed to the maps app, with the province. */
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

/** Google Maps directions to the address; the phone's maps app plans the route. */
export const directionsUrl = (centre: Centre) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(centre.destination)}`;

/** "1-833-806-1515" → "tel:18338061515". */
export const telUrl = (number: string) => `tel:${number.replace(/\D/g, "")}`;

/** A link that opens a point in any browser or maps app. */
export const mapLink = ({ lat, lon }: LatLon) => `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(5)},${lon.toFixed(5)}`;

/** A text message with the body filled in, recipient left empty. "sms:?&body=" opens it on iPhone and Android. */
export const smsUrl = (body: string) => `sms:?&body=${encodeURIComponent(body)}`;

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
