import React, { useMemo } from "react";
import { Play, RotateCcw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { onboardingSteps } from "@/onboarding/tutorialSteps";
import { cn } from "@/lib/utils";
import { useOnboardingStore } from "@/store/onboardingStore";

export const TutorialControls: React.FC = () => {
  const isActive = useOnboardingStore((s) => s.isActive);
  const startRequested = useOnboardingStore((s) => s.startRequested);
  const currentStepIndex = useOnboardingStore((s) => s.currentStepIndex);
  const resumeStepIndex = useOnboardingStore((s) => s.resumeStepIndex);
  const back = useOnboardingStore((s) => s.back);
  const skip = useOnboardingStore((s) => s.skip);
  const start = useOnboardingStore((s) => s.start);
  const consumeResume = useOnboardingStore((s) => s.consumeResume);
  const cancelStartRequest = useOnboardingStore((s) => s.cancelStartRequest);
  const advance = useOnboardingStore((s) => s.advance);

  const showResume = !isActive && (resumeStepIndex !== null || startRequested);
  const showControls = isActive || showResume;

  const totalSteps = onboardingSteps.length;

  const effectiveStepIndex = useMemo(() => {
    if (isActive) {
      return currentStepIndex ?? 0;
    }
    if (resumeStepIndex !== null) {
      return resumeStepIndex;
    }
    return currentStepIndex ?? 0;
  }, [isActive, currentStepIndex, resumeStepIndex]);

  if (!showControls) {
    return null;
  }

  const handleResume = () => {
    if (isActive) return;
    const target = resumeStepIndex ?? currentStepIndex ?? 0;
    start(target);
    cancelStartRequest();
    if (resumeStepIndex !== null) {
      consumeResume();
    }
  };

  const handleExit = () => {
    skip();
    cancelStartRequest();
    consumeResume();
  };

  const stepNumber = Math.min(effectiveStepIndex + 1, totalSteps);
  const stepTitle = onboardingSteps[effectiveStepIndex]?.title ?? "Tutorial";

  return (
    <div
      className={cn(
        "hidden lg:flex items-center gap-2 rounded-md border border-zinc-300/80 bg-white/75 px-3 py-1 text-sm shadow-sm",
        "dark:border-zinc-700/80 dark:bg-zinc-900/80",
      )}
      data-onboarding-target="tutorial-toolbar"
    >
      <div className="flex flex-col">
        <span className="font-medium text-zinc-700 dark:text-zinc-200">
          Step {stepNumber} / {totalSteps}
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {stepTitle}
        </span>
      </div>

      {isActive ? (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => back()}
            disabled={(currentStepIndex ?? 0) <= 0}
            className="flex items-center gap-1"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Back
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => advance()}
            disabled={effectiveStepIndex >= totalSteps - 1}
            className="flex items-center gap-1"
          >
            Next
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExit}
            className="flex items-center gap-1 text-red-600 hover:text-red-700 dark:text-red-400"
          >
            <XCircle className="h-3.5 w-3.5" />
            Exit
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={handleResume}
          className="flex items-center gap-1"
        >
          <Play className="h-3.5 w-3.5" />
          Resume
        </Button>
      )}
    </div>
  );
};
