import "@testing-library/jest-dom";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "fake-indexeddb/auto";

// Automatically clean up after each test
afterEach(() => {
	cleanup();
});
