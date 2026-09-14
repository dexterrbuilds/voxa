import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { readMigratedStorage } from "../../synq/app/lib/legacy-storage";

export type SynqTheme = "light" | "dark";

const THEME_STORAGE_KEY = "synq-theme";

type ThemeContextValue = {
  theme: SynqTheme;
  toggleTheme: () => void;
  setTheme: (theme: SynqTheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function normalizeTheme(value: string | null): SynqTheme {
  return value === "dark" ? "dark" : "light";
}

function applyTheme(theme: SynqTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<SynqTheme>("light");

  useEffect(() => {
    const savedTheme = normalizeTheme(readMigratedStorage(window.localStorage, THEME_STORAGE_KEY));
    setThemeState(savedTheme);
    applyTheme(savedTheme);
  }, []);

  const setTheme = (nextTheme: SynqTheme) => {
    setThemeState(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  };

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return context;
}
