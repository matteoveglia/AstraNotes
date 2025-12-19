/**
 * @fileoverview Minimal smoke tests for NoteStatusPanel.tsx
 */
import React from "react";
import {
	render,
	act,
	fireEvent,
	screen,
	cleanup,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi, describe, it, expect, afterEach } from "vitest";
import { NoteStatusPanel } from "@/components/NoteStatusPanel";
import { ftrackStatusService } from "@/services/ftrack/FtrackStatusService";

// Mock ftrackStatusService
vi.mock("@/services/ftrack/FtrackStatusService", () => ({
	ftrackStatusService: {
		fetchStatusPanelData: vi.fn().mockResolvedValue({
			versionId: "v1",
			versionStatusId: "vs1",
			parentId: "p1",
			parentStatusId: "ps1",
			parentType: "Shot",
			projectId: "proj1",
		}),
		getStatusesForEntity: vi.fn().mockResolvedValue([]),
		updateEntityStatus: vi.fn().mockResolvedValue(undefined),
	},
}));

// Mock toast
vi.mock("@/components/ui/toast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

// Mock motion and DismissableLayer
vi.mock("motion/react", () => ({
	motion: { div: (props: any) => <div {...props} /> },
}));
vi.mock("@radix-ui/react-dismissable-layer", () => ({
	DismissableLayer: ({ children }: any) => <>{children}</>,
}));

// Mock select components
vi.mock("@/components/ui/select", () => ({
	Select: () => <div data-testid="select-placeholder" />,
	SelectTrigger: () => <div />,
	SelectValue: () => <div />,
	SelectContent: () => <div />,
	SelectItem: () => <div />,
}));

afterEach(() => cleanup());

describe("NoteStatusPanel", () => {
	it("calls fetchStatusPanelData and getStatusesForEntity on mount", async () => {
		await act(async () => {
			render(<NoteStatusPanel assetVersionId="v1" />);
		});
		expect(ftrackStatusService.fetchStatusPanelData).toHaveBeenCalledWith("v1");
		expect(ftrackStatusService.getStatusesForEntity).toHaveBeenCalled();
	});

	it("calls onClose when close button is clicked", async () => {
		const onClose = vi.fn();
		await act(async () => {
			render(<NoteStatusPanel assetVersionId="v1" onClose={onClose} />);
		});
		const closeBtn = screen.getByLabelText("Close");
		fireEvent.click(closeBtn);
		expect(onClose).toHaveBeenCalled();
	});
});
