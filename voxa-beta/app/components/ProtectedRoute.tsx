"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BetaShell } from "@/components/BetaChrome";
import { useAuth } from "@/lib/auth";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      const nextPath = pathname || "/";
      router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
    }
  }, [loading, pathname, router, user]);

  if (loading) {
    return (
      <BetaShell>
        <div className="grid min-h-screen place-items-center">
          <div className="beta-status-pill">Opening Voxa</div>
        </div>
      </BetaShell>
    );
  }

  if (!user) {
    return null;
  }

  return children;
}
