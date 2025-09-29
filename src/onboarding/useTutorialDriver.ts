import { useEffect, useRef } from "react";
import { onboardingSteps } from "@/onboarding/tutorialSteps";
import { useOnboardingStore } from "@/store/onboardingStore";
import {
  subscribeOnboardingEvents,
  emitOnboardingEvent,
} from "@/onboarding/events";
import { useAppModeStore } from "@/store/appModeStore";
import { switchAppMode } from "@/services/appMode/switchAppMode";

// Lazy load driver.js at runtime to avoid hard dependency during build
async function loadDriver(): Promise<any | null> {
  try {
    const mod: any = await import("driver.js");
    await import("driver.js/dist/driver.css");
    // driver.js v1 exports default class Driver
    return mod?.driver || mod?.default || mod;
  } catch (e) {
    console.warn("[Onboarding] driver.js not available:", e);
    return null;
  }
}

export function useTutorialDriver() {
  const isActive = useOnboardingStore((s) => s.isActive);
  const startRequested = useOnboardingStore((s) => s.startRequested);
  const currentStepIndex = useOnboardingStore((s) => s.currentStepIndex);
  const resumeStepIndex = useOnboardingStore((s) => s.resumeStepIndex);
  const resumeOpenSettings = useOnboardingStore((s) => s.resumeOpenSettings);
  const resumeShouldAutoStart = useOnboardingStore(
    (s) => s.resumeShouldAutoStart,
  );
  const setShouldOpenSettingsModal = useOnboardingStore(
    (s) => s.setShouldOpenSettingsModal,
  );
  const consumeResume = useOnboardingStore((s) => s.consumeResume);
  const cancelStartRequest = useOnboardingStore((s) => s.cancelStartRequest);
  const start = useOnboardingStore((s) => s.start);
  const advance = useOnboardingStore((s) => s.advance);
  const complete = useOnboardingStore((s) => s.complete);
  const appMode = useAppModeStore((s) => s.appMode);

  const driverRef = useRef<any | null>(null);
  const switchingToDemoRef = useRef(false);

  // Initialize driver when onboarding is active
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let destroyed = false;

    async function init() {
      if (!isActive && !startRequested) return;
      const Driver = await loadDriver();
      if (!Driver || destroyed) return;

      // Build steps for driver.js
      const steps = onboardingSteps.map((s) => ({
        element: s.selector,
        popover: {
          title: s.title,
          description: s.description,
          side: "right",
          align: "start",
        },
      }));

      const drv = Driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        overlayOpacity: 0.45,
        showButtons: ["next", "previous", "close"],
        steps,
        onNextClick: () => {
          advance();
          return true;
        },
        onPrevClick: () => {
          back();
          return true;
        },
        onCloseClick: () => {
          skip();
          return true;
        },
      });
      driverRef.current = drv;

      // Move to current step
      try {
        drv.drive(currentStepIndex);
      } catch {}

      // Wire event subscriptions to auto-advance
      unsub = subscribeOnboardingEvents((event) => {
        const onboardingState = useOnboardingStore.getState();
        const stepIndex = onboardingState.currentStepIndex;
        const waiting = onboardingSteps[stepIndex]?.waitFor?.event;
        if (waiting && waiting === event) {
          try {
            drv.moveNext?.();
          } catch {}
          advance();
          if (stepIndex + 1 >= onboardingSteps.length) {
            complete();
          }
        }
      });
    }

    init();

    return () => {
      destroyed = true;
      if (unsub) unsub();
      try {
        driverRef.current?.destroy?.();
      } catch {}
      driverRef.current = null;
    };
  }, [isActive, startRequested]);

  // Ensure driver shows correct step when index changes
  useEffect(() => {
    const drv = driverRef.current;
    if (!drv || !isActive) return;
    try {
      drv.drive(currentStepIndex);
    } catch {}
  }, [currentStepIndex, isActive]);

  // Auto-start if a start is requested
  useEffect(() => {
    if (
      !isActive &&
      resumeStepIndex !== null &&
      resumeOpenSettings &&
      appMode === "demo"
    ) {
      setShouldOpenSettingsModal(true);
    }
  }, [
    appMode,
    isActive,
    resumeStepIndex,
    resumeOpenSettings,
    setShouldOpenSettingsModal,
  ]);

  useEffect(() => {
    if (resumeShouldAutoStart && appMode !== "demo") {
      if (!switchingToDemoRef.current) {
        switchingToDemoRef.current = true;
        (async () => {
          try {
            await switchAppMode("demo");
            emitOnboardingEvent("demoModeEnabled");
          } catch (error) {
            console.error("[Onboarding] Failed to auto-switch to demo mode", error);
          } finally {
            switchingToDemoRef.current = false;
          }
        })();
      }
      return;
    }

    if (
      resumeShouldAutoStart &&
      resumeStepIndex !== null &&
      resumeStepIndex >= 0 &&
      resumeStepIndex < onboardingSteps.length &&
      !isActive &&
      appMode === "demo"
    ) {
      start(resumeStepIndex);
      consumeResume();
    }
  }, [
    resumeShouldAutoStart,
    resumeStepIndex,
    isActive,
    appMode,
    start,
    consumeResume,
  ]);
  useEffect(() => {
    if (startRequested && !isActive) {
      if (appMode !== "demo") {
        const onboardingState = useOnboardingStore.getState();
        onboardingState.scheduleResume(0, { autoStart: true, openSettings: true });
        cancelStartRequest();
        if (!switchingToDemoRef.current) {
          switchingToDemoRef.current = true;
          (async () => {
            try {
              await switchAppMode("demo");
              emitOnboardingEvent("demoModeEnabled");
            } catch (error) {
              console.error(
                "[Onboarding] Failed to auto-switch to demo mode",
                error,
              );
              onboardingState.requestStart();
            } finally {
              switchingToDemoRef.current = false;
            }
          })();
        }
        return;
      }

      const targetStep = resumeStepIndex ?? currentStepIndex ?? 0;
      start(targetStep);
      if (resumeStepIndex !== null) {
        consumeResume();
      }
    }
  }, [
    startRequested,
    isActive,
    start,
    resumeStepIndex,
    currentStepIndex,
    appMode,
    cancelStartRequest,
    consumeResume,
  ]);
}
