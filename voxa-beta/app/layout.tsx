import React from "react";
import type { Metadata } from "next";
import Script from "next/script";
import { ThemeProvider } from "./components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voxa",
  description: "Private cinematic voice platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const themeScript = `
    (function () {
      try {
        var theme = localStorage.getItem("voxa-theme") === "dark" ? "dark" : "light";
        document.documentElement.dataset.theme = theme;
        document.documentElement.classList.toggle("dark", theme === "dark");
      } catch (error) {
        document.documentElement.dataset.theme = "light";
      }
    })();
  `;

  return (
    <html data-scroll-behavior="smooth" lang="en" suppressHydrationWarning>
      <head>
        <Script
          dangerouslySetInnerHTML={{ __html: themeScript }}
          id="voxa-theme-init"
          strategy="beforeInteractive"
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
