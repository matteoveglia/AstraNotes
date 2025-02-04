import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  tracePropagationTargets: ["localhost", /^https:\/\/[^/]*\.sentry\.io\/.*/],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  environment: import.meta.env.MODE,
  allowUrls: [window.location.origin],
  beforeSend(event) {
    if (event.exception) {
      console.log("Sending error to Sentry:", event);
    }
    return event;
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
