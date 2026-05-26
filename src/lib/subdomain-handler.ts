// Utility functions for subdomain handling
export function getSubdomainFromHost(hostname: string): string | null {
  if (!hostname) return null;

  const parts = hostname.split(".");

  // For localhost: "beta.localhost" -> "beta"
  // For production: "beta.example.com" -> "beta"
  if (parts.length > 2) {
    return parts[0] || null;
  }

  return null;
}

export function isSubdomainRequest(hostname: string): boolean {
  if (!hostname) return false;
  const parts = hostname.split(".");
  return parts.length > 2;
}

export function getSubdomainBase(hostname: string): string {
  if (!hostname) return "";
  const parts = hostname.split(".");
  if (parts.length > 2) {
    return parts.slice(1).join(".");
  }
  return hostname;
}

export function buildSubdomainUrl(
  subdomain: string,
  path: string = "",
  isLocalhost: boolean = false,
): string {
  if (isLocalhost) {
    return `http://${subdomain}.localhost:3000${path}`;
  } else {
    // For production, we'll let the platform handle routing
    return `/${path}`;
  }
}

// Client-side subdomain detection
export function detectSubdomain(): string | null {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    return getSubdomainFromHost(hostname);
  }
  return null;
}
