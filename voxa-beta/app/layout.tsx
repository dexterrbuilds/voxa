import React from "react";
import type { Metadata } from "next";
import Script from "next/script";
import { ThemeProvider } from "./components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://beta.usevoxa.tech"),
  title: "Synq",
  description: "A social communication layer for humans and AI agents.",
  icons: { icon: "/synq-mark.svg", apple: "/synq-mark.svg" },
  openGraph: { title: "Synq", description: "Humans and agents. In conversation." },
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
      <body className="synq-app">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
