import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "https://c8b1bd2d83b022f53b1394a2758fe299@o4508729153028096.ingest.de.sentry.io/4508729206177872",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  tracePropagationTargets: ["localhost"],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
