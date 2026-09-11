# Nova Launch Mode

Synq is the underlying platform. Nova is the first-party launch interface for understanding
on-chain concepts and rehearsing structured actions. This release **does not execute trades**.
It preserves the rebrand checkpoint and the broader platform rather than deleting capability.

## Experience

Marketing opens a Nova landing page. After authentication the beta opens `/nova`.
Users can create, rename and restore conversations, stream text, record a short prompt,
listen to replies and add a read-only Solana address. History lives in Supabase, not local
storage. The latest 100 conversations and 100 messages of an opened conversation are displayed.
The model receives at most 12 recent messages / 12,000 characters (2,000 per message).
This is conversation memory, not cross-conversation memory or transaction authorization.

Voice uses a separate MediaRecorder stream, existing silence thresholds (2 seconds after
speech, 15-second default maximum), existing multilingual Deepgram STT and existing TTS.
Both text and voice then enter the same conversation route. Voice replies play locally in
this private assistant surface; no hidden rooms or new LiveKit sessions are created.
Optional local wake detection reuses the existing flag/key/worker. Manual recording works
without Picovoice. The old room Path A and Path B files are unchanged.

## Architecture

### Glacier presentation

The launch-only `app/glacier.css` material system is shared by Nova, authentication,
loading and the marketing launch page. It defines separate light/dark glacier palettes,
surface/elevated/control/subtle materials, luminous edges and focus/motion tokens.
The abstract Nova prism is a small local SVG asset; no remote asset dependency is added.
Backdrop layers are limited to floating chrome/composer and open sheets. Repeated action
objects use the elevated tint without per-message backdrop filtering. Reduced motion,
reduced transparency and no-backdrop-filter fallbacks are provided.

History remains an on-demand sheet, with focus containment, Escape-to-close and an account
shortcut. Amount summaries are display-only; the same immutable plans, approval tokens,
handlers and simulation disclaimers are preserved. Voice illumination reads the existing
state only. No new environment variables, SQL, provider calls or execution paths are added.

`tests/nova-launch-smoke.mjs` covers desktop/mobile light/dark screenshots, drawer behavior,
approval controls, reduced viewport/composer layout, reduced motion and primary-control
contrast. `tests/nova-marketing-smoke.mjs` covers the matching public surface. Screenshots
are temporary artifacts, not committed. Browser fixtures do not validate live providers or
physical iOS keyboard/performance behavior; those remain staging/device checks.

### Application boundaries

- `app/lib/nova-launch/types.ts`: response blocks, typed actions, account capabilities,
  model-provider and execution-adapter contracts.
- `actions.ts`: strict validation, narrow intent recognition, bounded context, simulation adapter.
- `app/lib/server/nova-launch/plans.ts`: expiring plans and canonical SHA-256 hashing.
- `model.ts`: Gemini streaming implementation of `NovaModelProvider`. Uses current runtime
  UTC, bounded context, multilingual instructions and existing Google Search grounding.
- `/api/nova/conversations`: authenticated create/list/load/rename.
- `/api/nova/message`: authenticated NDJSON stream and DELETE cancellation.
- `/api/nova/actions`: dedicated authenticated approval/cancellation, not a chat tool.
- `/api/nova/audio`: owner-scoped transcription or TTS of a saved Nova reply.
- `app/nova`: conversation UI, history, account surface and simulation approval cards.

## Deterministic Actions

`intent -> structured parameters -> validation -> simulated quote/plan -> explicit approval
-> stored simulation result`.

Launch-capable requests:

- `Swap 1 SOL to USDC` (SOL/USDC in either direction).
- `Open a 3x SOL long with 100 USDC`.
- `Open SOL short with 100 USDC at 3x`.

Only strictly matched inputs produce plans. The schemas reject arbitrary instructions,
unknown fields, unsupported venues, missing parameters and invalid numeric values.
Amounts/collateral are positive and capped at 1,000,000 simulation units; leverage is 1-20x.
Unknown or incomplete action requests ask for clarification. General conversation uses the
model, but its prose/proposal events cannot approve or execute anything.
Structured intent recognition is currently English and narrow; multilingual conversation/STT
does not imply multilingual transaction planning. There are no live balances or blockchain reads.

Types anticipate close/modify position, transfer and portfolio/position/token/wallet/transaction
reads, but these are not executable. Text, analysis summary, action/approval and simulation-result
blocks render now. Other blocks reserve contracts, not claims of functioning integrations.

## Approval Security

Plans expire after five minutes. SHA-256 binds the plan ID, conversation ID, exact action
parameters and quote. Canonical sorted object keys survive PostgreSQL jsonb reordering; arrays
retain order. An independent random approval token is stored beside the immutable plan.

Only an explicit **Approve simulation** interaction submits the exact ID/hash/token.
`okay`, `yes` and `do it` are ordinary messages, never authorization. A new prompt supersedes
pending plans in that conversation. Modify cancels the old plan before filling the composer.
Changed content/hash, wrong tokens, wrong owners, expired or cancelled plans fail closed.

The service-only SQL RPC locks the conversation and plan rows in a consistent order. Approval
consumes the pending state atomically and persists one result. Replays with the exact valid
credentials return that stored result; they cannot execute again. Replays with another token
fail even after completion. Duplicate prompt IDs are rejected. Current request IDs prevent
cancelled/superseded model responses from being persisted. Another conversation's prompt
cannot change this conversation's plans. No approval state comes from model memory.

Browser roles can SELECT only their own rows, never INSERT/UPDATE plans/results or call
the mutation RPCs. Every API verifies the Supabase bearer user and applies owner filters before
service-role operations. Approval errors are sanitized; secrets/tokens/conversations are not logged.

## Simulation and Adapter Boundary

`ActionAdapter` separates `supports`, `validate`, `quote`, `simulate`, and `execute`.
The current adapter is provider-neutral and workflow-only: no fabricated price, fees, output
amount or liquidation estimate. Its quote is explicitly a dry-run description. `simulate`
checks expiry/cancellation and returns `mode: simulation`, `transactionSignature: null`.
`execute` always rejects, regardless of account capabilities. The SQL approval RPC persists
only a simulation result, with no outbound network call or signer.

For a real adapter, add asynchronous quote/validation capabilities as necessary and a separate
execution ledger/signature-confirmation lifecycle. **Do not replace this simulation RPC with
an unguarded network submission.** Real execution needs quote integrity, slippage/fee/chain
checks, wallet ownership, expiry, signature review, transaction simulation, durable idempotency,
on-chain confirmation and an independent security review.

## Model and Account Boundaries

`NovaModelProvider` accepts messages/context, an AbortSignal and action schema awareness,
and yields text or proposed actions. Only Gemini is implemented; OpenAI, Anthropic, Grok or
DeepSeek can later implement the same contract without changing the conversation UI or
approval lifecycle. `NOVA_MODEL_PROVIDER=gemini` selects it; unknown configuration fails closed.
The working room Gemini provider remains untouched. No model picker or arbitrary tool execution.

`ConnectedAccount` distinguishes watch addresses, connected wallets and future trading accounts,
with separate read/propose/request_signature/execute capability names. This UI only creates
read/propose context. Address input checks format, not ownership. Connection uses an injected
Solana provider's public key; no signing methods are invoked. Account context is browser-local,
is not a grant of authority, and is not automatically sent to the model or persisted. Pasting
an address into a message does send that text to the model. Never paste credentials or seed phrases.
Wallet Standard/mobile deep links, wallet balances and ownership proofs are intentionally deferred.

## Deployment and Re-Enabling Platform Features

1. Apply `voxa-beta/supabase-nova-launch.sql` in Supabase SQL Editor. It adds three tables,
   indexes, owner-read RLS and service-only mutation RPCs. Reapplying preserves data.
   It does not change room, agent, analytics or SDK schemas. Do not run test SQL on Supabase.
2. Configure existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   server-only `SUPABASE_SERVICE_ROLE_KEY`. Public URL is the project origin, not `/rest/v1`.
3. Keep existing server-only `GOOGLE_API_KEY`, `GEMINI_MODEL`, `DEEPGRAM_API_KEY` and TTS
   settings (`NOVA_TTS_PROVIDER`, voice/speed, provider credentials). No new provider key required.
4. Optional beta defaults: `NEXT_PUBLIC_SYNQ_PLATFORM_ENABLED=false`,
   `NOVA_MODEL_PROVIDER=gemini`. Marketing: `VITE_SYNQ_PLATFORM_ENABLED=false`.
5. Deploy the beta and marketing separately with their existing roots/domains. Supabase auth
   redirect allowlists remain necessary. No LiveKit agent redeployment is required for this phase.

| Preserved surface | Launch behavior | Restoration |
| --- | --- | --- |
| Beta `/`, `/room/*`, `/rooms/*` | Redirect to `/nova` | Beta platform flag true + rebuild |
| `/agents/*` | Redirect to `/nova` | Same beta flag |
| `/developers/*`, including sandbox and public profiles | Redirect to `/nova` | Same beta flag |
| Marketing product/developer/docs/waitlist pages | Redirect to marketing `/` | Marketing platform flag true + rebuild |
| APIs, admin, schemas, SDK, agent runtime | Preserved | Existing auth/admin/review/verification gates still apply |

Feature gates are centralized in beta `product-features.ts` + `proxy.ts`, and marketing's
root route selection. Page gating is not an API authorization mechanism. Existing authenticated
API access is intentionally preserved, not made public. External-agent room/voice flags remain
separate and default-off. Use a separate internal deployment for private platform access;
there is no per-user bypass for dormant pages. Restore both app flags for the old public journey.
Legacy `voxa.*`, `@voxa/sdk`, `X-Voxa-Request-Id`, DB/env/storage identifiers remain unchanged.

## Validation and Staging

Unit/API tests cover schemas, intent, canonical hashes, cancellation, bounded context,
provider substitution, owner filters and byte-identical legacy Nova files. Disposable
PostgreSQL tests cover idempotent migration, data preservation, owner/anonymous/browser
permissions, service mutations, explicit approval, cancelled/expired plans, wrong hashes/tokens,
new-prompt invalidation, cross-conversation isolation and persisted duplicate results.

```sh
# beta
npm run lint
npx tsc --noEmit
npm run build
node --require ./tests/register.cjs --test tests/runtime.test.cjs tests/routes.test.cjs tests/nova-launch.test.cjs tests/nova-launch-routes.test.cjs
npm start -- --port 3100
# With Playwright installed/resolvable:
node tests/nova-launch-smoke.mjs
# Empty disposable PostgreSQL database ONLY:
psql -d YOUR_DISPOSABLE_DB -f tests/nova-launch.sql
# SDK
npm run typecheck
npm run build
node --test tests/adapter.test.mjs
# marketing
npx tsc --noEmit
npm run build
```

Browser tests use isolated auth/provider/data fixtures, not production services. They exercise
login/session refresh, real page redirects, history, text NDJSON, swap/perp cards, approve/cancel/
modify/stale handling, voice capture, read-only address context and desktop/mobile themes.
Screenshots are stored outside Git. Physical mobile keyboard behavior is not proven by viewport
resizing. Staging must test real Supabase RLS/refresh/history, simultaneous requests across server
instances, actual Gemini grounding/streaming, multilingual STT, TTS/autoplay, Safari permissions,
optional Picovoice and preserved room LiveKit voice on a platform-enabled deployment.

Known limits: rate limiting is per process; provider STT/TTS work may continue after client
cancellation even though late UI updates are discarded; response audio is capped at 6,000 text
characters; no retention/deletion UI yet; conversation history is bounded in the UI. Production
rollout needs retention/privacy policy and distributed abuse controls. No live-provider test or
deployment is implied by fixture success.

Recommended first real integration: a read-only Solana account/transaction adapter with strict
RPC validation, followed by a quote-only SOL/USDC swap adapter. Real signing or perpetual trading
requires a separate scoped phase and security review. Neither is enabled here.

### Local Checkpoint Results

- Beta lint, standalone typecheck and production build passed.
- Marketing typecheck/build and SDK typecheck/build passed.
- 28 Node regression tests passed: the original 14 plus 14 launch tests (25 beta, 3 SDK).
- PostgreSQL 16: migration applied twice on empty tables and again after data/results existed;
  data preservation, owner read isolation, browser/anonymous write denial, service mutation,
  expiry, cancellation, replay, idempotency and cross-conversation checks passed.
- Both Playwright fixture suites passed. Desktop 1440px and mobile 390px screenshots were
  inspected in light/dark modes; a reduced viewport checked composer placement. Recording used
  Chromium's fake microphone, with actual MediaRecorder lifecycle and fixture STT/TTS responses.
- Finalization fixed JSONB key-order hashing, repeated AudioContext cleanup, the requested
  leading-leverage perpetual syntax and explicit USDC/x units on approval cards.
- No live Supabase migration, provider deployment, wallet signature or chain transaction occurred.

Changed file groups: new launch routes, contracts/helpers, provider/plan services, Nova UI,
page proxy/config, additive SQL and focused tests; marketing route selection/landing,
beta navigation/login copy, env example and READMEs. SDK and existing room/provider/runtime
files are not modified. Local AGENTS.md/CLAUDE.md stay ignored and are excluded from the commit.
