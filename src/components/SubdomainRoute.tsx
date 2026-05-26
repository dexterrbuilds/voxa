import { useSubdomain } from "@/lib/subdomain-utils";

interface SubdomainRouteProps {
  children: React.ReactNode;
  subdomain: string;
}

export function SubdomainRoute({ children, subdomain }: SubdomainRouteProps) {
  const { isSubdomain, subdomain: currentSubdomain } = useSubdomain();

  // If we're on the correct subdomain, render the children
  if (isSubdomain && currentSubdomain === subdomain) {
    return <>{children}</>;
  }

  // If we're not on the correct subdomain, redirect or show appropriate content
  return null;
}
