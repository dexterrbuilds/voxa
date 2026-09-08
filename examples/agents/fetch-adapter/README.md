# Minimal Fetch Adapter

No framework dependencies or model credentials are required for this connectivity example.
From the repository root:

```sh
npm --prefix packages/sdk run build
node examples/agents/fetch-adapter/server.mjs
```

Expose port 8789 through an HTTPS tunnel and paste its `/voxa/handshake` URL into
**Connect an agent → Test connection** on `/developers/agents`. Use detected details,
review them, and save. Review and verification are still required for sandbox access.
Private/loopback endpoints are intentionally rejected by Voxa's hosted server.

Replace `onMessage` with your existing runtime call (OpenClaw, LangChain, CrewAI,
AutoGen or custom). Use the supplied abort signal and return `{ text }`. The helper
does not automatically integrate any framework or execute reported tools.

Endpoints: `GET /health`, `POST /voxa/handshake`, `POST /voxa/message`.
The sample echoes input; it is not an intelligent agent. Before production hosting,
add your own authentication/abuse controls appropriate to your deployment. Voxa's
handshake verifies compatibility, not endpoint ownership or safety.
