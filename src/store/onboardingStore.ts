import { create } from "zustand";
import { persist } from "zustand/middleware";

const FLOW_VERSION = 1;

interface OnboardingState {
  hasCompleted: boolean;
  currentStepIndex: number;
  isActive: boolean;
  isReplaying: boolean;
  flowVersion: number;
  lastCompletedStepIndex: number | null;
  startRequested: boolean;
  shouldOpenSettingsModal: boolean;
  start(stepIndex?: number): void;
  advance(): void;
  back(): void;
  skip(): void;
  complete(): void;
  setStep(index: number): void;
  markStepCompleted(index: number): void;
  requestStart(): void;
  cancelStartRequest(): void;
  resetProgress(): void;
  setShouldOpenSettingsModal(value: boolean): void;
}

interface PersistedState {
  hasCompleted: boolean;
  currentStepIndex: number;
  isActive: boolean;
  isReplaying: boolean;
  flowVersion: number;
  lastCompletedStepIndex: number | null;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      hasCompleted: false,
      currentStepIndex: 0,
      isActive: false,
      isReplaying: false,
      flowVersion: FLOW_VERSION,
      lastCompletedStepIndex: null,
      startRequested: false,
      shouldOpenSettingsModal: false,
      start(stepIndex = 0) {
        const state = get();
        set({
          isActive: true,
          isReplaying: state.hasCompleted,
          currentStepIndex: stepIndex,
          startRequested: false,
        });
      },
      advance() {
        const state = get();
        set({
          currentStepIndex: state.currentStepIndex + 1,
        });
      },
      back() {
        const state = get();
        set({
          currentStepIndex: Math.max(0, state.currentStepIndex - 1),
        });
      },
      skip() {
        set({
          isActive: false,
          isReplaying: false,
          hasCompleted: true,
          startRequested: false,
          shouldOpenSettingsModal: false,
        });
      },
      complete() {
        set({
          isActive: false,
          isReplaying: false,
          hasCompleted: true,
          currentStepIndex: 0,
          lastCompletedStepIndex: null,
          startRequested: false,
          shouldOpenSettingsModal: false,
        });
      },
      setStep(index) {
        set({ currentStepIndex: index });
      },
      markStepCompleted(index) {
        set({ lastCompletedStepIndex: index });
      },
      requestStart() {
        set({ startRequested: true });
      },
      cancelStartRequest() {
        set({ startRequested: false });
      },
      resetProgress() {
        set({
          hasCompleted: false,
          currentStepIndex: 0,
          isActive: false,
          isReplaying: false,
          flowVersion: FLOW_VERSION,
          lastCompletedStepIndex: null,
          startRequested: false,
          shouldOpenSettingsModal: false,
        });
      },
      setShouldOpenSettingsModal(value) {
        set({ shouldOpenSettingsModal: value });
      },
    }),
    {
      name: "onboarding-storage",
      version: FLOW_VERSION,
      partialize: ({
        hasCompleted,
        currentStepIndex,
        isActive,
        isReplaying,
        flowVersion,
        lastCompletedStepIndex,
      }: OnboardingState): PersistedState => ({
        hasCompleted,
        currentStepIndex,
        isActive,
        isReplaying,
        flowVersion,
        lastCompletedStepIndex,
      }),
      migrate: (persisted: PersistedState | undefined, _v: number) => {
        if (!persisted) return persisted as any;
        if (persisted.flowVersion !== FLOW_VERSION) {
          return {
            hasCompleted: false,
            currentStepIndex: 0,
            isActive: false,
            isReplaying: false,
            flowVersion: FLOW_VERSION,
            lastCompletedStepIndex: null,
          } as PersistedState;
        }
        return persisted;
      },
    },
  ),
);
