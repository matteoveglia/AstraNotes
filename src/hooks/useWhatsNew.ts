/**
 * @fileoverview useWhatsNew.ts
 * Custom hook for managing What's New modal display logic.
 * Determines when to show the modal based on version changes and update state.
 */

import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useWhatsNewStore } from "@/store/whatsNewStore";
import { useUpdateStore } from "@/store/updateStore";

export const useWhatsNew = () => {
	const [shouldShowModal, setShouldShowModal] = useState(false);
	const [isCheckingVersion, setIsCheckingVersion] = useState(true);

	const {
		shouldShowForVersion,
		shouldShowOnNextStart,
		setShouldShowOnNextStart,
	} = useWhatsNewStore();

	const { resetUpdateState } = useUpdateStore();

	useEffect(() => {
		checkShouldShowModal();
	}, []);

	const checkShouldShowModal = async () => {
		setIsCheckingVersion(true);
		try {
			// Get current app version
			const currentVersion = await getVersion();

			// Check if we should show the modal
			const shouldShow =
				shouldShowForVersion(currentVersion) || shouldShowOnNextStart;

			if (shouldShow) {
				setShouldShowModal(true);
				// Reset the "show on next start" flag since we're showing it now
				setShouldShowOnNextStart(false);
				// Reset update state since we're showing the What's New modal
				resetUpdateState();
			}
		} catch (error) {
			console.error("Failed to check version for What's New modal:", error);
		} finally {
			setIsCheckingVersion(false);
		}
	};

	const hideModal = () => {
		setShouldShowModal(false);
	};

	const showModal = () => {
		setShouldShowModal(true);
	};

	return {
		shouldShowModal,
		isCheckingVersion,
		hideModal,
		showModal,
	};
};
