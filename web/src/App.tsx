import { lazy, Suspense, useLayoutEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { AppProvider } from "./app/state";
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
import { Verdict } from "./screens/Verdict";

// The dispatch board is for call takers, at a desk: it loads only when its address is opened, so the public app never
// carries it. No public screen links to it.
const Dispatch = lazy(() => import("./screens/Dispatch"));

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
            <Route path="/verdict" element={<Verdict />} />
            <Route path="/emergency" element={<Emergency />} />
            <Route path="/leave" element={<Leave />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/location-off" element={<LocationOff />} />
            <Route path="/no-data" element={<NoData />} />
            <Route path="/dispatch" element={<Suspense fallback={null}><Dispatch /></Suspense>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Trail>
      </BrowserRouter>
    </AppProvider>
  );
}
