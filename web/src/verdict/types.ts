// The engine's GET /verdict answer (engine/smoke_engine/app.py). data/demo/*.json hold the same shape.

export type Verdict = "drifting" | "unclear" | "unexplained";
export type Confidence = "high" | "medium" | "low";
export type Height = "100m" | "925hPa" | "850hPa";
export type AqhiCategory = "low" | "moderate" | "high" | "very_high";
/** NASA FIRMS: ultra real-time, real-time, near real-time, standard processing. */
export type LatencyClass = "URT" | "RT" | "NRT" | "SP";

/** ECCC's air-quality alert for the spot. "not_checked": the engine could not tell; never a guess. */
export type AlertState = "active" | "none" | "not_checked";

/** One alert, in ECCC's own words. `expires` is this bulletin's expiry, renewed while the alert lasts. */
export interface AirQualityAlert {
  code: string | null;
  nameEn: string | null;
  nameFr: string | null;
  colourEn: string | null;
  colourFr: string | null;
  zoneEn: string | null;
  zoneFr: string | null;
  issued: string;
  expires: string;
  /** The recorded message (replay); null live. */
  url: string | null;
}

/** New Brunswick's burn category for the county of the spot. "not_checked": the engine could not tell; never a guess. */
export type BurnState = "no_burn" | "restricted" | "permitted" | "season_closed" | "not_checked";

/** Is burning allowed today (engine/smoke_engine/burn.py). Informational only: it never changes the verdict. */
export interface Burn {
  state: BurnState;
  /** "Westmorland", "Saint John"; null when the county could not be told for certain. */
  county: string | null;
  /** The end of the category's validity, the province's next 2 p.m. update; null unless a category is given. */
  validUntil: string | null;
  /** When the engine asked the province; null when it did not answer, and in the replay. */
  checkedAt: string | null;
  /** The replay has none: the province keeps no past categories. */
  source: "gnb_burn_categories" | "none_recorded";
  /** Why it is not checked. */
  reason: string | null;
}

export interface PathPoint {
  hoursAgo: number;
  time: string;
  lat: number;
  lon: number;
  area: string | null;
  windFromDeg: number;
}

export interface Path {
  hoursTraced: number;
  stoppedAtGridEdge: boolean;
  points: PathPoint[];
  origin: { hoursAgo: number; area: string | null; km: number; compass: string };
}

/** The newest satellite detection of a fire. latencyClass is set when it came from NASA FIRMS. */
export interface LastSeen {
  time: string;
  hoursAgo: number;
  minutesAgo: number;
  satellite: string | null;
  instrument: string | null;
  latencyClass: LatencyClass | null;
}

export interface Fire {
  id: string;
  cwfisIds: string[];
  name: string | null;
  locality: string | null;
  nearCommunity: string | null;
  province: string | null;
  lat: number;
  lon: number;
  km: number;
  compass: string;
  lastSeen: LastSeen | null;
  lastSeenHoursAgo: number | null;
  sizeHa: number | null;
  stage: string | null;
  /** Detections in the last 24 hours; satellites names each satellite that saw the fire, from either source. */
  detections: { total: number; bySource: { FIRMS: number; CWFIS: number; both: number }; satellites: string[] };
}

export interface ClosestApproach {
  km: number;
  hoursAgo: number;
  time: string;
  lat: number;
  lon: number;
  fire: Fire;
}

/** The featured fire's smoke, released every hour over the 24 hours before the check and followed forward. */
export interface Forward {
  closestKm: number;
  closestReleasedAt: string;
  closestHeight: Height;
  /** The smoke passed within 25 km of the user. Informational only: it never changes the verdict. */
  agrees: boolean;
  /** The closest height's paths, oldest release first; each starts at the fire. */
  paths: { height: Height; releasedAt: string; points: { lat: number; lon: number; time: string }[] }[];
}

/**
 * The engine's "map" key, version 1 (engine/smoke_engine/schemas/map.v1.schema.json): what the map draws, and where each
 * layer comes from. Informational: it never changes a verdict. Read it through src/map/model.ts, which checks it.
 */
export interface EngineMap {
  version: 1;
  you: { lat: number; lon: number };
  /** The fire the verdict features; null with no fire in range. */
  focus: { lat: number; lon: number } | null;
  /** The air traced backward, one trail per height; each point is one hour older than the one before. */
  trails: { height: Height; chosen: boolean; points: { lat: number; lon: number; hoursAgo: number }[] }[];
  /** `observed`: the time is when a satellite saw it; false, when CWFIS reported it. `frp`: megawatts, or null. */
  detections: { lat: number; lon: number; time: string; observed: boolean; frp: number | null; by: "FIRMS" | "CWFIS" | "both" }[];
  /** Fires on Canada's official active fire list. */
  fires: { id: string; lat: number; lon: number; stage: string | null; sizeHa: number | null; name: string | null }[];
  /** The outline of ECCC's forecast zone under the active alert, as closed rings of [lon, lat]. */
  alertZone: { rings: [number, number][][] } | null;
  layers: {
    trails: { source: "open_meteo_gfs"; model: string; run: string | null; recordedAt: string | null };
    detections: { hours: number; radiusKm: number; count: number; shown: number; newest: string | null; firms: { ok: boolean; checkedAt: string | null }; cwfis: { ok: boolean; checkedAt: string | null } };
    fires: { source: "nrcan_cwfis"; ok: boolean; checkedAt: string | null; count: number };
    alertZone: { source: "eccc_geomet" | "naad_archive"; state: AlertState; issued: string | null; checkedAt: string | null; outline: boolean };
  };
}

export interface VerdictJson {
  mode: "live" | "replay";
  time: string;
  location: { lat: number; lon: number; name: string | null; province: string | null };
  verdict: Verdict;
  confidence: Confidence;
  noFiresInRange: boolean;
  rules: {
    hoursBack: number;
    highConfidenceKm: number;
    driftingKm: number;
    searchKm: number;
    fireRadiusKm: number;
    unsteadyDeg: number;
    hotspotHours: number;
    heights: Height[];
  };
  path: Path;
  wind: {
    level: Height;
    model: string;
    /** The newest model run in the live winds; null when the engine has none, and in replay. Absent from an older engine. */
    run?: string | null;
    /** When the replay's winds were downloaded; null live. */
    recordedAt?: string | null;
    steady: boolean;
    spreadDeg: number;
    biggestShift: { time: string; hoursAgo: number; fromDeg: number; toDeg: number } | null;
  };
  closestApproach: ClosestApproach | null;
  nearestFire: Fire | null;
  heights: {
    chosen: Height;
    agree: boolean;
    results: Record<Height, { verdict: Verdict; confidence: Confidence; closestApproachKm: number | null; steady: boolean }>;
    paths: Record<Height, Path>;
  };
  /** Null when no fire is featured (7d). */
  forward: Forward | null;
  aqhi: {
    value: number;
    display: string;
    segments: number;
    category: AqhiCategory;
    observedAt: string;
    station: { id: string; nameEn: string; nameFr: string; km: number };
  } | null;
  /** Absent from an older engine: read as not checked. Replay reads ECCC's recorded messages (the NAAD System archive copy). */
  alerts?: {
    airQuality: { state: AlertState; source: "eccc_geomet" | "naad_archive"; checkedAt: string | null; alert: AirQualityAlert | null };
  };
  /** Null outside New Brunswick, and absent from an older engine: the burn card is not shown. */
  burn?: Burn | null;
  sources: {
    cwfis: { ok: boolean; checkedAt: string | null; newestDetection: string | null };
    firms: { ok: boolean; checkedAt: string | null; newestDetection: string | null; satellitesUsed: string[]; countsByLatencyClass: Record<LatencyClass, number> };
    /** Minutes since the older fire source answer was fetched (rounded up). Null for recorded replay data. */
    checkedMinutesAgo: number | null;
    /** The newest detection from either source, at or before the check, even if older than 24 hours. */
    newestDetection: { time: string; hoursAgo: number; minutesAgo: number } | null;
  };
  /** Absent from an older engine, null when the engine could not build it: the map then shows what the rest says. */
  map?: EngineMap | null;
}
