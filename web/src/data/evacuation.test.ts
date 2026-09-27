import { describe, expect, test } from "vitest";
import halifax from "../../../data/demo/halifax.json";
import moncton from "../../../data/demo/moncton.json";
import fireNames from "../../../data/places/fire-names.json";
import data from "./evacuation-events.json";
import { EVENTS, REPLAY_DATE, activeEvent, clockTime, directionsUrl, eventFor, familyMessage, isNear, kmBetween, mapLink, monthName, smsUrl, telUrl, todayAtlantic } from "./evacuation";

const SOURCE_2204 = "https://annapoliscounty.ca/government/news-media-releases/2204-west-dalhousie-wildfires-evacuees-registration";

describe("evacuation-events.json", () => {
  test("every event and centre cites its sources, and every centre has what the screen shows", () => {
    const urls = (value: unknown): string[] => (typeof value === "string" ? (/^https?:/.test(value) ? [value] : []) : Array.isArray(value) ? value.flatMap(urls) : value && typeof value === "object" ? Object.values(value).flatMap(urls) : []);
    for (const event of data.events) {
      expect(urls(event).length).toBeGreaterThan(0);
      expect(urls(event).filter((u) => !u.startsWith("https://"))).toEqual([]);
      expect(event.active.from <= event.active.to).toBe(true);
      for (const centre of event.centres) {
        expect(centre.source).toMatch(/^https:\/\//);
        expect(centre.sources).toContain(centre.source);
        expect(centre.name && centre.address && centre.town && centre.destination && centre.services.length).toBeTruthy();
        expect(centre.destination.startsWith(centre.address)).toBe(true);
        expect(centre.geocode.geocoder).toMatch(/NRCan Geolocation Service/);
        expect(centre.geocode.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  test("Long Lake, as the County of Annapolis announced it", () => {
    const event = activeEvent("2025-08-25")!;
    expect(event.id).toBe("long-lake-2025");
    expect(event.source).toBe(SOURCE_2204);
    expect(event.centres.map((c) => [c.type, c.name, c.address, c.services, c.hours])).toEqual([
      ["reception", "NSCC Annapolis Valley Campus", "295 Commercial St., Middleton", ["showers-laundry", "wifi", "light-food", "overnight"], null],
      ["comfort", "Bridgetown Fire Hall", "31 Bay Rd., Bridgetown", ["charging", "wifi", "light-food"], { open: "10:00", close: "16:00", days: "daily" }],
    ]);
    expect(event.centres.map((c) => c.register)).toEqual([true, false]);
    expect(event.phones).toEqual({ information: { number: "1-833-806-1515", hours: { open: "11:00", close: "19:00", days: "daily" } }, overnight: "1-800-222-9597" });
    expect(data.events[0].take.quote).toBe("Take your 72-hour kit and critical items (meds, wallet, keys).");
  });

  test("each centre lies within 3 km of its town, and the fire is where the replay's verdicts put it", () => {
    const TOWNS: Record<string, [number, number]> = { Middleton: [44.94, -65.07], Bridgetown: [44.84, -65.29] }; // CGNDB, rounded
    for (const centre of EVENTS[0].centres) {
      const [lat, lon] = TOWNS[centre.town];
      expect(Math.hypot((centre.lat - lat) * 111.2, (centre.lon - lon) * 111.2 * Math.cos((lat * Math.PI) / 180))).toBeLessThan(3);
    }
    // The same point the verdict map draws for Aug 25, 2025, under a name from fire-names.json.
    const replayFire = ({ name, lat, lon }: { name: string; lat: number; lon: number }) => ({ name, lat, lon });
    expect(EVENTS[0].fire).toEqual(replayFire(moncton.closestApproach!.fire));
    expect(EVENTS[0].fire).toEqual(replayFire(halifax.nearestFire!));
    expect(fireNames.fires.map((f) => f.name)).toContain(EVENTS[0].fire.name);
  });
});

describe("which event shows", () => {
  test("replay shows the centres announced on its check date, Aug 25, 2025", () => {
    expect(REPLAY_DATE).toBe("2025-08-25");
    expect(eventFor("replay")?.id).toBe("long-lake-2025");
  });

  test("an event shows from its first to its last day, and not outside them", () => {
    expect(["2025-08-24", "2025-08-25", "2025-09-02", "2025-09-03"].map((d) => activeEvent(d)?.id ?? null)).toEqual([null, "long-lake-2025", "long-lake-2025", null]);
  });

  test("live mode shows an event only if one is active today, in Atlantic time", () => {
    expect(eventFor("live", new Date("2026-09-27T15:00:00Z"))).toBeNull();
    expect(eventFor("live", new Date("2025-08-25T15:00:00Z"))?.id).toBe("long-lake-2025");
    expect(todayAtlantic(new Date("2025-09-04T02:30:00Z"))).toBe("2025-09-03"); // 11:30 p.m. ADT
  });

  test("the centres apply within the event's radius of the fire (40 km, in the data), not farther", () => {
    expect(data.events[0].radiusKm).toBe(40);
    const towns = { "West Dalhousie": [44.71904, -65.22563], Bridgetown: [44.84158, -65.29121], Halifax: [44.6474, -63.59065], Moncton: [46.09948, -64.7998] }; // CGNDB
    const at = ([lat, lon]: number[]) => ({ lat, lon });
    expect(Object.values(towns).map((p) => Math.round(kmBetween(at(p), EVENTS[0].fire)))).toEqual([3, 17, 128, 159]);
    expect(Object.values(towns).map((p) => isNear(EVENTS[0], at(p)))).toEqual([true, true, false, false]);
    expect(isNear(EVENTS[0], EVENTS[0].centres[0])).toBe(true); // the reception centre itself, 29 km away
  });
});

describe("links", () => {
  test("Get directions hands the encoded address to Google Maps, which plans the route", () => {
    expect(EVENTS[0].centres.map((c) => directionsUrl(c))).toEqual([
      "https://www.google.com/maps/dir/?api=1&destination=295%20Commercial%20St.%2C%20Middleton%2C%20NS",
      "https://www.google.com/maps/dir/?api=1&destination=31%20Bay%20Rd.%2C%20Bridgetown%2C%20NS",
    ]);
  });

  test("in replay the route starts at the chosen town", () => {
    const bridgetown = { lat: 44.84158, lon: -65.29121 };
    expect(directionsUrl(EVENTS[0].centres[0], bridgetown)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=295%20Commercial%20St.%2C%20Middleton%2C%20NS&origin=44.84158,-65.29121",
    );
  });

  test("phone numbers dial as digits", () => {
    expect([telUrl("1-833-806-1515"), telUrl("1-800-222-9597")]).toEqual(["tel:18338061515", "tel:18002229597"]);
  });

  test("the text to family is prefilled, with an empty recipient", () => {
    const body = familyMessage("fr", { lat: 46.2, lon: -64.55 });
    const url = smsUrl(body);
    expect(url.startsWith("sms:?&body=")).toBe(true);
    expect(decodeURIComponent(url.slice("sms:?&body=".length))).toBe(body);
    // Spaces, # and the link's ? and & are encoded, so no message is cut short.
    expect(url.slice("sms:?&body=".length)).not.toMatch(/[ #?&]/);
  });

  test("the text to family: the phone's position at full precision, as a maps.google.com link; none when unknown", () => {
    const NBSP = String.fromCharCode(0xa0);
    const at = { lat: 45.12345678, lon: -64.98765432 };
    expect(mapLink(at)).toBe("https://maps.google.com/?q=45.12345678,-64.98765432");
    expect(familyMessage("en", at)).toBe("I’m OK. There’s a fire near me and I’m following official instructions. My location: https://maps.google.com/?q=45.12345678,-64.98765432");
    expect(familyMessage("fr", at)).toBe(`Je vais bien. Il y a un feu près de moi et je suis les consignes officielles. Ma position${NBSP}: https://maps.google.com/?q=45.12345678,-64.98765432`);
    expect(familyMessage("en", null)).toBe("I’m OK. There’s a fire near me and I’m following official instructions.");
    expect(familyMessage("fr", null)).toBe("Je vais bien. Il y a un feu près de moi et je suis les consignes officielles.");
  });
});

describe("wording", () => {
  test("opening hours and the month, in English and French", () => {
    expect(["10:00", "16:00", "12:00", "16:30"].map((h) => clockTime(h, "en"))).toEqual(["10 a.m.", "4 p.m.", "12 p.m.", "4:30 p.m."]);
    expect(["10:00", "16:00", "16:30"].map((h) => clockTime(h, "fr"))).toEqual(["10 h", "16 h", "16 h 30"]);
    expect([monthName("2025-08", "en"), monthName("2025-08", "fr")]).toEqual(["August 2025", "août 2025"]);
  });

  test("nothing the screen shows from the data says safe", () => {
    // Shown: the fire's name, the centres' names, addresses and towns, the authority, the phone numbers.
    const shown = EVENTS.flatMap((e) => [e.fire.name, ...Object.values(e.authority), ...Object.values(e.area), e.phones.information.number, e.phones.overnight, ...e.centres.flatMap((c) => [c.name, c.address, c.town])]);
    expect(shown.filter((s) => /safe|sécuri/i.test(s))).toEqual([]);
  });
});
