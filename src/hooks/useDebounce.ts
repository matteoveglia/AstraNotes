/**
 * @fileoverview useDebounce.ts
 * Generic debounce hook for handling rapid state changes.
 * Delays updates to prevent excessive re-renders and API calls.
 * Useful for search inputs and form validation.
 */

import { useState, useEffect } from "react";

export function useDebounce<T>(value: T, delay: number): T {
	const [debouncedValue, setDebouncedValue] = useState<T>(value);

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedValue(value);
		}, delay);

		return () => {
			clearTimeout(timer);
		};
	}, [value, delay]);

	return debouncedValue;
}
