import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MonolithFallbackBanner } from "@/components/MonolithFallbackBanner";
import { useSettings } from "@/store/settingsStore";

const renderWithFlag = (flag: boolean) => {
  const current = useSettings.getState().settings;
  useSettings.getState().setSettings({ ...current, useMonolithFallback: flag });
  return render(<MonolithFallbackBanner />);
};

describe("MonolithFallbackBanner", () => {
  it("renders when flag true", () => {
    renderWithFlag(true);
    expect(screen.getByText(/monolith fallback/i)).toBeInTheDocument();
  });

  it("does not render when flag false", () => {
    renderWithFlag(false);
    expect(screen.queryByText(/monolith fallback/i)).toBeNull();
  });
});
