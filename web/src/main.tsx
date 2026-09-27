import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { holdInstallPrompt } from "./keep/keep";
import "./styles.css";

holdInstallPrompt();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
