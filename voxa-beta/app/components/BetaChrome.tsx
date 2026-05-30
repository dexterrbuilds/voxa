"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ThemeToggle } from "./ThemeToggle";

type BetaShellProps = {
  children: ReactNode;
  className?: string;
};

type BetaCardProps = {
  children: ReactNode;
  className?: string;
};

type BetaButtonProps = {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "electric" | "glass" | "quiet";
};

type BetaStatProps = {
  label: string;
  value: string;
};

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <div className="relative grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-[oklch(0.72_0.2_245)] to-[oklch(0.78_0.18_235)] shadow-[0_0_20px_-4px_oklch(0.72_0.20_245/0.7)]">
        <div className="h-2 w-2 rounded-sm bg-[oklch(0.13_0.015_260)]" />
      </div>
      <span className="text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
        Voxa
      </span>
    </div>
  );
}

export function BetaShell({ children, className }: BetaShellProps) {
  return (
    <main
      className={joinClasses(
        "beta-page-shell beta-noise relative min-h-screen overflow-hidden text-[var(--foreground)]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="beta-grid-bg beta-radial-fade absolute inset-0 animate-[beta-grid-pan_24s_linear_infinite] opacity-80" />
        <div className="absolute left-1/2 top-[-18rem] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-[oklch(0.72_0.2_245/0.18)] blur-[150px]" />
        <div className="absolute bottom-[-20rem] right-[-10rem] h-[40rem] w-[40rem] rounded-full bg-[oklch(0.65_0.22_250/0.16)] blur-[150px]" />
        <div className="absolute bottom-[10%] left-[-12rem] h-[30rem] w-[30rem] rounded-full bg-[oklch(0.78_0.18_220/0.09)] blur-[130px]" />
      </div>
      <div className="relative z-10">{children}</div>
    </main>
  );
}

export function BetaHeader({ children }: { children?: ReactNode }) {
  return (
    <div className="border-b border-[var(--hairline-border)] bg-[var(--header-bg)] backdrop-blur-2xl">
      <header className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <BrandMark />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {children}
        </div>
      </header>
    </div>
  );
}

export function BetaCard({ children, className }: BetaCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={joinClasses(
        "beta-glass rounded-xl p-6 shadow-[0_24px_80px_-48px_oklch(0.72_0.20_245/0.65)]",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

export function BetaPanel({ children, className }: BetaCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={joinClasses("beta-premium-card", className)}
    >
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

export function BetaEyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center rounded-full border border-[var(--glass-border)] bg-[var(--subtle-fill)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-[oklch(0.72_0.2_245)]">
      {children}
    </div>
  );
}

export function BetaButton({
  children,
  className,
  disabled,
  href,
  onClick,
  type = "button",
  variant = "electric",
}: BetaButtonProps) {
  const buttonClassName = joinClasses(
    variant === "electric" && "beta-button-electric",
    variant === "glass" && "beta-button-glass",
    variant === "quiet" &&
      "inline-flex min-h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]",
    disabled && "pointer-events-none opacity-50",
    className,
  );

  if (href) {
    return (
      <a className={buttonClassName} href={href}>
        {children}
      </a>
    );
  }

  return (
    <button className={buttonClassName} disabled={disabled} onClick={onClick} type={type}>
      {children}
    </button>
  );
}

export function BetaStat({ label, value }: BetaStatProps) {
  return (
    <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--subtle-fill)] p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
        {label}
      </div>
      <div className="mt-2 text-sm font-medium text-[var(--foreground)]">{value}</div>
    </div>
  );
}
