// api/subdomain.js
export default function handler(req, res) {
  const { host } = req.headers;
  const subdomain = getSubdomain(host);

  // For Vercel, we want to handle all subdomains dynamically
  // This function will be called for any subdomain request
  if (subdomain) {
    // Handle subdomain routing
    return handleSubdomainRequest(req, res, subdomain);
  }

  // Fallback to main app
  return handleMainApp(req, res);
}

function getSubdomain(host) {
  const parts = host.split(".");
  if (parts.length > 2) {
    return parts[0];
  }
  return null;
}

function handleSubdomainRequest(req, res, subdomain) {
  // Handle the specific subdomain request
  // This would route to the appropriate subdomain handler
  res.status(200).json({
    message: `Handling request for ${subdomain} subdomain`,
    subdomain: subdomain,
  });
}

function handleMainApp(req, res) {
  res.status(200).json({ message: "Main app" });
}
