import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useThemeStore } from "@/store/themeStore";

/**
 * Synchronises application theme with the OS/window chrome
 * and with Tailwind's dark class.
 *
 * This is purely side-effectful; it exposes no return value.
 */
export function useThemeManager(): void {
  const theme = useThemeStore((state) => state.theme);

  // On mount: seed the theme from the OS and subscribe to theme changes
  useEffect(() => {
    const win = getCurrentWindow();

    const shouldSeedFromOs = (() => {
      if (typeof window === "undefined") {
        return true;
      }
      try {
        const raw = window.localStorage.getItem("theme-storage");
        if (!raw) {
          return true;
        }
        const parsed = JSON.parse(raw) as {
          state?: { theme?: unknown };
        };
        const storedTheme = parsed?.state?.theme;
        return storedTheme !== "light" && storedTheme !== "dark";
      } catch {
        return true;
      }
    })();

    if (shouldSeedFromOs) {
      win
        .theme()
        .then((osTheme) => {
          if (osTheme === "light" || osTheme === "dark") {
            useThemeStore.getState().setTheme(osTheme);
          }
        })
        .catch(() => {
          // ignore – some platforms might not support theme() yet
        });
    }

    let unlisten: (() => void) | undefined;
    win
      .onThemeChanged(({ payload }) => {
        useThemeStore.getState().setTheme(payload);
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      unlisten?.();
    };
  }, []);

  // Each time the theme changes, apply Tailwind dark class and Tauri window chrome theme.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");

    getCurrentWindow()
      .setTheme(theme)
      .catch(() => {
        /* ignore */
      });
  }, [theme]);
}
