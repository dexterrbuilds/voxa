"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BetaShell } from "@/components/BetaChrome";
import { useAuth } from "@/lib/auth";
import { platformEnabled } from "@/lib/product-features";
import Loading from "../loading";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (initialized && !user) {
      const nextPath = pathname || "/";
      router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
    }
  }, [initialized, pathname, router, user]);

  if (!initialized) {
    if (!platformEnabled) return <Loading />;
    return (
      <BetaShell>
        <div className="grid min-h-screen place-items-center">
          <div className="beta-status-pill">Opening Synq</div>
        </div>
      </BetaShell>
    );
  }

  if (!user) {
    return null;
  }

  return children;
}
