/**
 * @fileoverview menu.ts
 * Utility functions for handling context menus and other menu-related functionality.
 */

import type React from "react";

/**
 * Interface for menu items to be shown in a context menu
 */
export interface MenuOption {
	label: string;
	action: () => void;
	disabled?: boolean;
	icon?: React.ReactNode;
}

/**
 * Shows a context menu at the specified position with the given options
 *
 * @param e - The mouse event that triggered the context menu
 * @param options - Array of menu options to display
 * @returns void
 */
export const showContextMenu = (
	e: React.MouseEvent<HTMLElement> | MouseEvent,
	options: MenuOption[],
): void => {
	e.preventDefault();

	// Return early if no options are provided or if options is undefined
	if (
		!options ||
		options.length === 0 ||
		!options.some((option) => !option.disabled)
	) {
		return;
	}

	// Implementation for showing context menu
	// This is a placeholder for now as the actual implementation
	// might depend on the UI library or custom implementation
	console.log(
		"Context menu shown at",
		e.clientX,
		e.clientY,
		"with options:",
		options,
	);

	// Here you would typically:
	// 1. Create a menu element
	// 2. Position it at e.clientX, e.clientY
	// 3. Render the options
	// 4. Handle clicks on options
	// 5. Close menu when clicking outside
};
