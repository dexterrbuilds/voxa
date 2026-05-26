import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

interface UseSubdomainProps {
  hostname?: string;
}

export function useSubdomain(hostname?: string) {
  const [subdomain, setSubdomain] = useState<string | null>(null);
  const [isSubdomain, setIsSubdomain] = useState(false);

  useEffect(() => {
    const host = hostname || (typeof window !== "undefined" ? window.location.hostname : "");
    if (host) {
      const parts = host.split(".");
      if (parts.length > 2) {
        const sub = parts[0];
        setSubdomain(sub);
        setIsSubdomain(true);
      }
    }
  }, [hostname]);

  return { subdomain, isSubdomain };
}

// Utility function to check if current domain is a subdomain
export function isSubdomainRequest(hostname: string = window.location.hostname): boolean {
  const parts = hostname.split(".");
  return parts.length > 2;
}

// Utility function to get subdomain name
export function getSubdomainName(hostname: string = window.location.hostname): string | null {
  const parts = hostname.split(".");
  if (parts.length > 2) {
    return parts[0];
  }
  return null;
}
