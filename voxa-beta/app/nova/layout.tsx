import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Nova | Synq",
  description:
    "Understand on-chain concepts and explore simulated action plans with Nova. No funds move.",
  openGraph: {
    title: "Nova | Synq",
    description: "A conversation. A clearer next move. Simulation only.",
  },
};

export default function NovaLayout({ children }: { children: ReactNode }) {
  return children;
}
