import { useLayoutEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { AppProvider } from "./app/state";
import { Check } from "./screens/Check";
import { Emergency } from "./screens/Emergency";
import { HowItWorks } from "./screens/HowItWorks";
import { Leave } from "./screens/Leave";
import { LocationOff } from "./screens/LocationOff";
import { NoData } from "./screens/NoData";
import { Location } from "./screens/Location";
import { Loading } from "./screens/Loading";
import { Q1Flames } from "./screens/Q1Flames";
import { Verdict } from "./screens/Verdict";

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
        <Routes>
          <Route path="/" element={<Check />} />
          <Route path="/q1" element={<Q1Flames />} />
          <Route path="/location" element={<Location />} />
          <Route path="/loading" element={<Loading />} />
          <Route path="/verdict" element={<Verdict />} />
          <Route path="/emergency" element={<Emergency />} />
          <Route path="/leave" element={<Leave />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/location-off" element={<LocationOff />} />
          <Route path="/no-data" element={<NoData />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
