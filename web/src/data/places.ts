// Live mode: every Maritimes community (NRCan CGNDB), built by scripts/build-data.mjs and loaded on first use.
import { useEffect, useState } from "react";
import type { Mode, Place } from "../app/state";
import { REPLAY_TOWNS } from "./replay";

type Row = [name: string, lat: number, lon: number, type: string, county: string, province: string];
type Community = Place & { type: string };

// Named like the engine names a spot (smoke_engine/places.py town_name).
const TOWN_TYPES = new Set(["CITY", "TOWN", "VILG"]);
const TOWN_WITHIN_KM = 25;

let communities: Promise<Community[]> | null = null;

/** All Maritimes communities, cities and towns first. */
export function loadCommunities(): Promise<Community[]> {
  communities ??= import("./places.json").then((m) =>
    (m.default as Row[]).map(([name, lat, lon, type, county, province]) => ({ name, lat, lon, type, county, province })),
  );
  return communities;
}

/** The places the town search offers: the replay towns, or every community in live mode. */
export function usePlaces(mode: Mode): Place[] {
  const [live, setLive] = useState<Place[]>([]);
  useEffect(() => {
    if (mode !== "live") return;
    let cancelled = false;
    loadCommunities().then((list) => !cancelled && setLive(list));
    return () => {
      cancelled = true;
    };
  }, [mode]);
  return mode === "live" ? live : REPLAY_TOWNS;
}

/** The spot (lat, lon), named after the nearest city, town or village within 25 km, else the nearest community. */
export function placeAt(list: Community[], lat: number, lon: number): Place {
  const km = (c: Community) => Math.hypot((c.lat - lat) * 111.2, (c.lon - lon) * 111.2 * Math.cos((lat * Math.PI) / 180));
  const nearest = (candidates: Community[]) => candidates.reduce((best, c) => (km(c) < km(best) ? c : best));
  const town = nearest(list.filter((c) => TOWN_TYPES.has(c.type)));
  const named = km(town) <= TOWN_WITHIN_KM ? town : nearest(list);
  return { name: named.name, province: named.province, county: named.county, lat, lon };
}
