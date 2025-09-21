// import { scan } from "react-scan"; // Enable for performance profiling
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AppProvider from "./components/AppProvider";
import "./index.css";
import * as Sentry from "@sentry/react";
import { initLogCapture } from "./lib/logExporter";
import { initializeUpdateChecker } from "./lib/updater";
// Initialize log capturing
initLogCapture();

// Initialize update checker
initializeUpdateChecker();

// import { scan } from "react-scan";
// scan({ // Enable for performance profiling
//   enabled: true,
// });

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
    // Filter out API credential errors from Sentry logging
    const errorMessage = event.exception?.values?.[0]?.value || "";
    const errorType = event.exception?.values?.[0]?.type || "";

    // Check if this is an API credential related error
    const isCredentialError =
      errorMessage.includes("credentials") ||
      errorMessage.includes("API key") ||
      errorMessage.includes("api key") ||
      errorMessage.includes("apiKey") ||
      errorMessage.includes("Invalid username") ||
      errorMessage.includes("authentication") ||
      errorMessage.includes("auth") ||
      errorMessage.includes("ftrack-user") ||
      errorMessage.includes("Missing API authentication") ||
      errorType === "AuthenticationError" ||
      (event.tags && event.tags.component === "auth") ||
      (event.fingerprint &&
        event.fingerprint.some(
          (fp) => typeof fp === "string" && fp.includes("credential"),
        ));

    // Also check breadcrumbs and extra data for credential information
    const hasSensitiveData =
      event.breadcrumbs?.some(
        (breadcrumb) =>
          breadcrumb.message?.includes("API key") ||
          breadcrumb.message?.includes("credentials") ||
          breadcrumb.message?.includes("apiKey"),
      ) ||
      Object.values(event.extra || {}).some(
        (value) =>
          typeof value === "string" &&
          (value.includes("API key") ||
            value.includes("credentials") ||
            value.includes("apiKey")),
      );

    if (isCredentialError || hasSensitiveData) {
      console.log("Filtering out credential error from Sentry:", {
        message: errorMessage,
        type: errorType,
      });
      return null; // Don't send to Sentry
    }

    if (event.exception) {
      console.log("Sending error to Sentry:", event);
    }
    return event;
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
);
