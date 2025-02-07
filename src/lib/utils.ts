/**
 * @fileoverview utils.ts
 * General utility functions for class name manipulation.
 * Combines Tailwind classes using clsx and tailwind-merge.
 * Provides consistent class name handling across components.
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
