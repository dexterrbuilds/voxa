const MAX_FIELD_LENGTH = 4000;

function sanitizeText(value, maxLength = MAX_FIELD_LENGTH) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return {
    serviceRoleKey,
    url: url?.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, ""),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  let body = {};

  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    return res.status(400).json({ error: "invalid_json" });
  }
  const payload = {
    agent_idea: sanitizeText(body.agentIdea),
    company: sanitizeText(body.company, 500),
    email: sanitizeText(body.email, 320).toLowerCase(),
    name: sanitizeText(body.name, 500),
    source: sanitizeText(body.source || "developers/access", 200),
    x_handle: sanitizeText(body.xHandle, 200),
  };

  if (!payload.name || !payload.email || !payload.x_handle || !payload.agent_idea) {
    return res.status(400).json({ error: "missing_required_fields" });
  }

  if (!isValidEmail(payload.email)) {
    return res.status(400).json({ error: "invalid_email" });
  }

  const { serviceRoleKey, url } = getSupabaseConfig();

  if (!url || !serviceRoleKey) {
    console.warn("Developer access submission failed: missing Supabase server env vars.");
    return res.status(503).json({ error: "storage_not_configured" });
  }

  try {
    const response = await fetch(`${url}/rest/v1/developer_access_requests`, {
      body: JSON.stringify({
        ...payload,
        metadata: {
          userAgent: req.headers["user-agent"] || null,
        },
      }),
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      method: "POST",
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("Developer access submission failed.", {
        details,
        status: response.status,
      });
      return res.status(502).json({ error: "storage_failed" });
    }

    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error("Developer access submission crashed.", {
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "submission_failed" });
  }
}
