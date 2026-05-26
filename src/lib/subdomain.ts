// Utility function to extract subdomain from hostname
export function getSubdomain(hostname: string): string | null {
  // For localhost, we expect format like "beta.localhost" or "test.localhost"
  if (hostname.includes("localhost")) {
    const parts = hostname.split(".");
    if (parts.length > 1) {
      return parts[0] || null;
    }
    return null;
  }

  // For production domains like "app.example.com" or "client1.myapp.com"
  const subdomainRegex = /^([^.]+)\.(.+)$/;
  const match = hostname.match(subdomainRegex);
  if (match && match[1]) {
    return match[1];
  }

  return null;
}

// Get the current subdomain from window.location in browser
export function getCurrentSubdomain(): string | null {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    return getSubdomain(hostname);
  }
  return null;
}

export function buildSubdomainUrl(subdomain: string, path = ""): string {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname.includes("localhost")) {
      return `http://${subdomain}.localhost:3000${path}`;
    } else {
      const domainParts = hostname.split(".");
      if (domainParts.length > 1) {
        const domain = domainParts.slice(1).join(".");
        return `https://${subdomain}.${domain}${path}`;
      }
    }
  }
  return `https://${subdomain}.${window?.location?.hostname?.split(".").slice(1).join(".") || "example.com"}${path}`;
}
