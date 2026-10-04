// The verdict screen's own file (and through it, the map's): fetched while the Loading screen shows, so the first
// screens do not carry it. A fetch that fails is tried again, a moment apart: the network may be back.
const TRIES = 3;
const WAIT_MS = 700;

export function loadVerdictScreen(tries = TRIES): Promise<typeof import("./Verdict")> {
  return import("./Verdict").catch((error: unknown) => {
    if (tries <= 1) throw error;
    return new Promise((again) => setTimeout(again, WAIT_MS)).then(() => loadVerdictScreen(tries - 1));
  });
}
