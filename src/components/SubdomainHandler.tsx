import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

interface SubdomainHandlerProps {
  children: React.ReactNode;
}

export function SubdomainHandler({ children }: SubdomainHandlerProps) {
  const [subdomain, setSubdomain] = useState<string | null>(null);
  const [isSubdomain, setIsSubdomain] = useState(false);

  useEffect(() => {
    // Get the current hostname
    const hostname = window.location.hostname;
    const parts = hostname.split(".");

    // Check if this is a subdomain
    if (parts.length > 2) {
      const sub = parts[0];
      setSubdomain(sub);
      setIsSubdomain(true);
    } else {
      setSubdomain(null);
      setIsSubdomain(false);
    }
  }, []);

  return <>{children}</>;
}
