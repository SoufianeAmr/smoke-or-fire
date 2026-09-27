// The engine's GET /verdict answer (engine/smoke_engine/app.py). data/demo/*.json hold the same shape.

export type Verdict = "drifting" | "unclear" | "unexplained";
export type Confidence = "high" | "medium" | "low";
export type Height = "100m" | "925hPa" | "850hPa";
export type AqhiCategory = "low" | "moderate" | "high" | "very_high";
/** NASA FIRMS: ultra real-time, real-time, near real-time, standard processing. */
export type LatencyClass = "URT" | "RT" | "NRT" | "SP";

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
  sources: {
    cwfis: { ok: boolean; checkedAt: string | null; newestDetection: string | null };
    firms: { ok: boolean; checkedAt: string | null; newestDetection: string | null; satellitesUsed: string[]; countsByLatencyClass: Record<LatencyClass, number> };
    /** Minutes since the older fire source answer was fetched (rounded up). Null for recorded replay data. */
    checkedMinutesAgo: number | null;
    /** The newest detection from either source, at or before the check, even if older than 24 hours. */
    newestDetection: { time: string; hoursAgo: number; minutesAgo: number } | null;
  };
}
