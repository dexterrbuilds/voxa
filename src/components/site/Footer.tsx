import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BETA_APP_URL } from "@/lib/links";

const cols = [
  {
    title: "Product",
    links: [
      { to: "/product", label: "Overview" },
      { to: "/use-cases", label: "Use Cases" },
      { to: "/product", label: "Rooms" },
    ],
  },
  {
    title: "Developers",
    links: [
      { to: "/developers", label: "Documentation" },
      { to: "/developers", label: "SDKs" },
      { to: "/developers", label: "API Reference" },
    ],
  },
  {
    title: "Company",
    links: [
      { to: "/", label: "About" },
      { to: "/waitlist", label: "Contact" },
      { to: "/", label: "Privacy" },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="relative mt-32 border-t border-white/[0.06]">
      <div className="mx-auto max-w-7xl px-6 py-16 grid grid-cols-2 md:grid-cols-5 gap-10">
        <div className="col-span-2">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-electric to-electric-glow grid place-items-center">
              <div className="h-2 w-2 rounded-sm bg-background" />
            </div>
            <span className="font-semibold tracking-tight">Voxa</span>
          </Link>
          <p className="mt-4 text-sm text-muted-foreground max-w-sm leading-relaxed">
            The runtime layer for real-time AI participation across meetings, calls, and voice
            environments.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <div className="text-xs uppercase tracking-wider text-muted-foreground/70 font-medium">
              {c.title}
            </div>
            <ul className="mt-4 space-y-2.5">
              {c.links.map((l, i) => (
                <li key={i}>
                  <Link
                    to={l.to}
                    className="text-sm text-foreground/80 hover:text-foreground transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-7xl px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div>© {new Date().getFullYear()} Voxa, Inc. All rights reserved.</div>
          <div className="flex items-center gap-3">
            <span>Conversational infrastructure for autonomous agents.</span>
            <Button asChild variant="electric" size="sm">
              <a href={BETA_APP_URL}>Use Voxa</a>
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
}
