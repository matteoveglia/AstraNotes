/**
 * @fileoverview logExporter.ts
 * Utilities for exporting console logs to a file.
 * Captures logs from the last 24 hours.
 */

import { writeTextFile } from "@tauri-apps/plugin-fs";
import { downloadDir, join } from "@tauri-apps/api/path";
import { message } from "@tauri-apps/plugin-dialog";
import { isVerboseLoggingEnabled } from "./verboseLogging";

// Store for captured logs
interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  args: any[];
}

const logStore: LogEntry[] = [];
const MAX_LOG_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Override console methods to capture logs
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

// Initialize log capturing
export function initLogCapture() {
  // Override console.log
  console.log = function (...args) {
    captureLog("log", args);
    originalConsole.log.apply(console, args);
  };

  // Override console.info
  console.info = function (...args) {
    captureLog("info", args);
    originalConsole.info.apply(console, args);
  };

  // Override console.warn
  console.warn = function (...args) {
    captureLog("warn", args);
    originalConsole.warn.apply(console, args);
  };

  // Override console.error
  console.error = function (...args) {
    captureLog("error", args);
    originalConsole.error.apply(console, args);
  };

  // Override console.debug
  console.debug = function (...args) {
    if (isVerboseLoggingEnabled()) {
      captureLog("debug", args);
    }
    originalConsole.debug.apply(console, args);
  };
}

// Capture a log entry
function captureLog(level: string, args: any[]) {
  const timestamp = Date.now();

  // Convert first argument to string if possible
  let message = "";
  if (args.length > 0) {
    if (typeof args[0] === "string") {
      message = args[0];
    } else {
      try {
        message = JSON.stringify(args[0]);
      } catch (e) {
        message = String(args[0]);
      }
    }
  }

  logStore.push({
    timestamp,
    level,
    message,
    args: args.slice(1), // Store remaining args
  });

  // Clean up old logs
  const cutoffTime = Date.now() - MAX_LOG_AGE_MS;
  while (logStore.length > 0 && logStore[0].timestamp < cutoffTime) {
    logStore.shift();
  }
}

// Format log entries for export
function formatLogEntry(entry: LogEntry): string {
  const date = new Date(entry.timestamp);
  const dateStr = date.toISOString();

  let argsStr = "";
  if (entry.args.length > 0) {
    try {
      argsStr = entry.args
        .map((arg) => {
          if (typeof arg === "object") {
            return JSON.stringify(arg);
          }
          return String(arg);
        })
        .join(" ");
    } catch (e) {
      argsStr = "[Error serializing arguments]";
    }
  }

  return `[${dateStr}] [${entry.level.toUpperCase()}] ${entry.message} ${argsStr}`.trim();
}

// Export logs to a file
export async function exportLogs(): Promise<string> {
  try {
    // Format all logs
    const logLines = logStore.map(formatLogEntry);

    // Add header
    const header = `AstraNotes Log Export\nGenerated: ${new Date().toISOString()}\nContains logs from the last 24 hours\n\n`;
    const content = header + logLines.join("\n");

    // Create filename with timestamp
    const now = new Date();
    const dateStr =
      now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, "0") +
      now.getDate().toString().padStart(2, "0") +
      "_" +
      now.getHours().toString().padStart(2, "0") +
      now.getMinutes().toString().padStart(2, "0");

    const filename = `AstraNotes_logs_${dateStr}.txt`;

    // Get downloads directory and create file path
    const downloadsDir = await downloadDir();
    const filePath = await join(downloadsDir, filename);

    // Write the log file
    await writeTextFile(filePath, content);

    // Show success message
    await message(`Logs exported successfully to:\n${filePath}`, {
      title: "Logs Exported",
    });

    return filePath;
  } catch (error) {
    console.error("Error exporting logs:", error);
    await message(`Failed to export logs: ${error}`, { title: "Export Error" });
    throw error;
  }
}
