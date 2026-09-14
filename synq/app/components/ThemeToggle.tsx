"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-sm backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-[oklch(0.72_0.2_245/0.45)] hover:text-[var(--electric)]"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
