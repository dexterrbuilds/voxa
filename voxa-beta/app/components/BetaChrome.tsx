"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { motion } from "framer-motion";
import { ThemeToggle } from "./ThemeToggle";
import { platformEnabled } from "@/lib/product-features";

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
    <Link href="/" className="synq-wordmark" aria-label="Synq home">
      <img src="/synq-mark.svg" alt="" width={30} height={30} />
      <span>Synq</span>
    </Link>
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
      <div className="relative z-10">{children}</div>
    </main>
  );
}

export function BetaHeader({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const inRoom = /^\/room\/.+/.test(pathname);
  const links = [
    { href: "/", label: "Rooms", active: pathname === "/" || pathname.startsWith("/room") },
    { href: "/agents", label: "Agents", active: pathname.startsWith("/agents") },
    {
      href: "/developers/agents",
      label: "Developers",
      active: pathname.startsWith("/developers") && !pathname.startsWith("/developers/sandbox"),
    },
    ...(pathname.startsWith("/developers")
      ? [
          {
            href: "/developers/sandbox",
            label: "Sandbox",
            active: pathname.startsWith("/developers/sandbox"),
          },
        ]
      : []),
  ];
  const navigation = (
    platformEnabled ? links : [{ href: "/nova", label: "Nova", active: pathname === "/nova" }]
  ).map((link) => (
    <Link
      key={link.href}
      href={link.href}
      aria-current={link.active ? "page" : undefined}
      onClick={() => setOpen(false)}
    >
      {link.label}
    </Link>
  ));
  return (
    <div className="synq-header">
      <header className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
        <BrandMark />
        {!inRoom && (
          <nav aria-label="Main navigation" className="synq-nav hidden md:flex">
            {navigation}
          </nav>
        )}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {children}
          {!inRoom && (
            <button
              type="button"
              className="synq-icon-button md:hidden"
              aria-label={open ? "Close navigation" : "Open navigation"}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          )}
        </div>
      </header>
      {open && !inRoom && (
        <nav
          aria-label="Mobile navigation"
          className="synq-nav flex flex-wrap border-t border-[var(--border)] px-4 py-2 md:hidden"
        >
          {navigation}
        </nav>
      )}
    </div>
  );
}

export function BetaCard({ children, className }: BetaCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className={joinClasses("beta-glass p-6", className)}
    >
      {children}
    </motion.div>
  );
}

export function BetaPanel({ children, className }: BetaCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className={joinClasses("beta-premium-card", className)}
    >
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

export function BetaEyebrow({ children }: { children: ReactNode }) {
  return <div className="text-xs font-semibold text-[var(--electric)]">{children}</div>;
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
