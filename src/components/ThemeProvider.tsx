"use client";

import { useEffect } from "react";

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Apply saved theme on mount
    fetch("/api/settings")
      .then(r => r.json())
      .then((s: { theme?: string }) => {
        const theme = s.theme ?? "dark";
        document.documentElement.setAttribute("data-theme", theme);
      })
      .catch(() => {});

    // Listen for theme changes from settings page
    function onStorage(e: StorageEvent) {
      if (e.key === "dv_theme") {
        document.documentElement.setAttribute("data-theme", e.newValue ?? "dark");
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return <>{children}</>;
}
