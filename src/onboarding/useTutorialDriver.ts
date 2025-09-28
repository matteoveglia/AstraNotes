import { useEffect, useRef } from "react";
import { onboardingSteps } from "@/onboarding/tutorialSteps";
import { useOnboardingStore } from "@/store/onboardingStore";
import { subscribeOnboardingEvents } from "@/onboarding/events";

// Lazy load driver.js at runtime to avoid hard dependency during build
async function loadDriver(): Promise<any | null> {
  try {
    const mod: any = await import("driver.js");
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
  const start = useOnboardingStore((s) => s.start);
  const advance = useOnboardingStore((s) => s.advance);
  const complete = useOnboardingStore((s) => s.complete);

  const driverRef = useRef<any | null>(null);

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
          side: "bottom",
        },
      }));

      const drv = Driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        overlayOpacity: 0.45,
        steps,
      });
      driverRef.current = drv;

      // Move to current step
      try {
        drv.drive(currentStepIndex);
      } catch {}

      // Wire event subscriptions to auto-advance
      unsub = subscribeOnboardingEvents((event) => {
        const waiting = onboardingSteps[currentStepIndex]?.waitFor?.event;
        if (waiting && waiting === event) {
          try {
            drv.moveNext?.();
          } catch {}
          advance();
          if (currentStepIndex + 1 >= onboardingSteps.length) {
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
    if (!drv) return;
    try {
      drv.drive(currentStepIndex);
    } catch {}
  }, [currentStepIndex]);

  // Auto-start if a start is requested
  useEffect(() => {
    if (startRequested && !isActive) {
      start(0);
    }
  }, [startRequested, isActive, start]);
}
