/**
 * @fileoverview WhatsNewModal.test.tsx
 * Tests for the WhatsNewModal component.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WhatsNewModal } from "@/components/WhatsNewModal";

// Mock the services and stores
vi.mock("@/services/githubService", () => ({
  githubService: {
    getLatestRelease: vi.fn(),
    formatReleaseNotes: vi.fn((content) => content),
  },
}));

vi.mock("@/store/whatsNewStore", () => ({
  useWhatsNewStore: vi.fn(() => ({
    cachedRelease: null,
    lastFetchedAt: null,
    setCachedRelease: vi.fn(),
    markAsShown: vi.fn(),
  })),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(() => Promise.resolve("1.0.0")),
}));

describe("WhatsNewModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders trigger button when not auto-showing", () => {
    render(<WhatsNewModal />);
    
    const triggerButton = screen.getByTitle("What's New");
    expect(triggerButton).toBeInTheDocument();
  });

  it("shows modal when autoShow is true", () => {
    render(<WhatsNewModal autoShow={true} />);
    
    expect(screen.getByText("What's New in AstraNotes")).toBeInTheDocument();
  });

  it("calls onModalShouldClose when modal is closed", async () => {
    const user = userEvent.setup();
    const onModalShouldClose = vi.fn();
    
    render(<WhatsNewModal autoShow={true} onModalShouldClose={onModalShouldClose} />);
    
    const closeButton = screen.getByRole("button", { name: /close/i });
    await user.click(closeButton);
    
    expect(onModalShouldClose).toHaveBeenCalled();
  });
}); 