import { createContext, useContext, useEffect, useState } from "react";

interface SubdomainContextType {
  subdomain: string | null;
  isSubdomain: boolean;
  hostname: string;
}

const SubdomainContext = createContext<SubdomainContextType | undefined>(undefined);

export function SubdomainProvider({ children }: { children: React.ReactNode }) {
  const [subdomain, setSubdomain] = useState<string | null>(null);
  const [hostname, setHostname] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      setHostname(host);
      const detectedSubdomain = getSubdomainFromHost(host);
      setSubdomain(detectedSubdomain);
    }
  }, []);

  return (
    <SubdomainContext.Provider
      value={{
        subdomain,
        isSubdomain: !!subdomain,
        hostname,
      }}
    >
      {children}
    </SubdomainContext.Provider>
  );
}

export function useSubdomain(): SubdomainContextType {
  const context = useContext(SubdomainContext);
  if (context === undefined) {
    throw new Error("useSubdomain must be used within a SubdomainProvider");
  }
  return context;
}

// Helper function to get subdomain from host
function getSubdomainFromHost(hostname: string): string | null {
  const parts = hostname.split(".");
  if (parts.length > 2) {
    return parts[0] || null;
  }
  return null;
}
