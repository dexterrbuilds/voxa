import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type VoxaTheme = "light" | "dark";

const THEME_STORAGE_KEY = "voxa-theme";

type ThemeContextValue = {
  theme: VoxaTheme;
  toggleTheme: () => void;
  setTheme: (theme: VoxaTheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function normalizeTheme(value: string | null): VoxaTheme {
  return value === "dark" ? "dark" : "light";
}

function applyTheme(theme: VoxaTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<VoxaTheme>("light");

  useEffect(() => {
    const savedTheme = normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
    setThemeState(savedTheme);
    applyTheme(savedTheme);
  }, []);

  const setTheme = (nextTheme: VoxaTheme) => {
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
