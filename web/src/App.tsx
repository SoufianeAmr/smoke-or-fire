import { Suspense, lazy, useLayoutEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { AppProvider, useApp } from "./app/state";
import { Boundary } from "./components/Boundary";
import { Screen } from "./components/Screen";
import { Sticky911 } from "./components/Sticky911";
import { Trail } from "./app/trail";
import { Check } from "./screens/Check";
import { Emergency } from "./screens/Emergency";
import { HowItWorks } from "./screens/HowItWorks";
import { Leave } from "./screens/Leave";
import { LocationOff } from "./screens/LocationOff";
import { NoData } from "./screens/NoData";
import { Location } from "./screens/Location";
import { Loading } from "./screens/Loading";
import { NearbyFire } from "./screens/NearbyFire";
import { Q1Flames } from "./screens/Q1Flames";
import { Q2Sky } from "./screens/Q2Sky";
import { Q3Nearby } from "./screens/Q3Nearby";
import { loadVerdictScreen } from "./screens/verdictScreen";

// The verdict screen (and the map on it) is its own file, fetched while the Loading screen shows: the first screens
// do not carry it.
const Verdict = lazy(() => loadVerdictScreen().then((screen) => ({ default: screen.Verdict })));

/**
 * The verdict's route. With no answer to show (a reload, a restored tab) it goes back to the start at once, without
 * waiting for the verdict's file. While that file comes, Call 911 is on the screen. If the screen cannot be had, or
 * breaks, the person gets the "we can't check right now" screen: what to do, and Try again.
 */
function VerdictRoute() {
  const { result } = useApp();
  if (!result) return <Navigate to="/" replace />;
  return (
    <Boundary fallback={<Navigate to="/no-data" replace />}>
      <Suspense fallback={<Screen><Sticky911 /></Screen>}>
        <Verdict />
      </Suspense>
    </Boundary>
  );
}

// "Protect your home" is a file of its own too, fetched when its button on the verdict is pressed: the first screens
// do not carry it, and stay as light as they were.
const Protect = lazy(() => import("./protect/Protect").then((screen) => ({ default: screen.Protect })));

/** Its route: as the verdict's. With no check made it goes back to the start at once, without waiting for the file. */
function ProtectRoute() {
  const { result } = useApp();
  if (!result) return <Navigate to="/" replace />;
  return (
    <Boundary fallback={<Navigate to="/no-data" replace />}>
      <Suspense fallback={<Screen><Sticky911 /></Screen>}>
        <Protect />
      </Suspense>
    </Boundary>
  );
}

// "Best time to air out your home" likewise: its 48-hour strip is fetched when its tile on the verdict is pressed.
const AirOut = lazy(() => import("./screens/AirOut").then((screen) => ({ default: screen.AirOut })));

/** Its route: as protect's. */
function AirOutRoute() {
  const { result } = useApp();
  if (!result) return <Navigate to="/" replace />;
  return (
    <Boundary fallback={<Navigate to="/no-data" replace />}>
      <Suspense fallback={<Screen><Sticky911 /></Screen>}>
        <AirOut />
      </Suspense>
    </Boundary>
  );
}


/** Each screen opens at its top, as the screen files do. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Trail>
          <Routes>
            <Route path="/" element={<Check />} />
            <Route path="/q1" element={<Q1Flames />} />
            <Route path="/q2" element={<Q2Sky />} />
            <Route path="/q3" element={<Q3Nearby />} />
            <Route path="/nearby-fire" element={<NearbyFire />} />
            <Route path="/location" element={<Location />} />
            <Route path="/loading" element={<Loading />} />
            <Route path="/verdict" element={<VerdictRoute />} />
            <Route path="/protect" element={<ProtectRoute />} />
            <Route path="/air-out" element={<AirOutRoute />} />
            <Route path="/emergency" element={<Emergency />} />
            <Route path="/leave" element={<Leave />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/location-off" element={<LocationOff />} />
            <Route path="/no-data" element={<NoData />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Trail>
      </BrowserRouter>
    </AppProvider>
  );
}
