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
  detections: { total: number; bySource: { FIRMS: number; CWFIS: number; both: number } };
}

export interface ClosestApproach {
  km: number;
  hoursAgo: number;
  time: string;
  lat: number;
  lon: number;
  fire: Fire;
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
  aqhi: {
    value: number;
    display: string;
    segments: number;
    category: AqhiCategory;
    observedAt: string;
    station: { id: string; nameEn: string; nameFr: string; km: number };
  } | null;
  sources: {
    cwfis: { ok: boolean; newestDetection: string | null };
    firms: { ok: boolean; newestDetection: string | null; satellitesUsed: string[]; countsByLatencyClass: Record<LatencyClass, number> };
  };
}
