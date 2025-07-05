/**
 * @fileoverview Legacy Ftrack monolithic service (temporary shim).
 * This file re-exports the original `ftrack.ts` so existing wrapper services can
 * continue to delegate to it while we progressively migrate logic.
 * DO NOT import this file directly from application code.
 */

export * from "../ftrack"; 