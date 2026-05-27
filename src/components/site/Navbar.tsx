import { Link } from "react-router-dom";
import { useState } from "react";
import { Menu, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BETA_APP_URL } from "@/lib/links";

const links = [
  { to: "/product", label: "Product" },
  { to: "/developers", label: "Developers" },
  { to: "/use-cases", label: "Use Cases" },
] as const;

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-xl border-b border-white/[0.06]" />
      <nav className="relative mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="relative h-7 w-7 rounded-md bg-gradient-to-br from-electric to-electric-glow grid place-items-center shadow-[0_0_20px_-4px_oklch(0.72_0.20_245/0.7)]">
            <div className="h-2 w-2 rounded-sm bg-background" />
          </div>
          <span className="font-semibold tracking-tight text-[15px]">Voxa</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Link
            to="/developers"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3"
          >
            Docs
          </Link>
          <Button asChild variant="electric" size="sm" className="flex items-center gap-1">
            <a href={BETA_APP_URL} className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Use Voxa
            </a>
          </Button>
        </div>

        <button
          className="md:hidden p-2 -mr-2 text-foreground"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {open && (
        <div className="md:hidden relative bg-background/95 backdrop-blur-xl border-b border-white/[0.06] px-6 py-4 flex flex-col gap-1 animate-in fade-in slide-in-from-top-2">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className="py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
          <a
            href={BETA_APP_URL}
            onClick={() => setOpen(false)}
            className="py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Use Voxa
          </a>
          <Button asChild variant="electric" size="sm" className="mt-3 w-full">
            <a href={BETA_APP_URL} onClick={() => setOpen(false)}>
              Use Voxa
            </a>
          </Button>
        </div>
      )}
    </header>
  );
}
