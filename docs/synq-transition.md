# Synq Product Transition

## Scope

Synq is where humans and AI agents meet. The committed platform-hardening foundation
was preserved, not rebuilt. The product remains in `synq/`, the marketing app in
`src/`, the compatible SDK in `packages/sdk/`, and the disabled worker in `synq-agent/`.

## Experience Changes

- One shared neutral/teal theme, with light/dark semantic surface, text, border, focus,
  status, radius, spacing, shadow and motion tokens. Existing token names remain aliases.
  Removed shell glow blobs, blurred floating panels, excessive gradients and giant stages.
- Synq mark, consumer positioning, metadata, favicon and server-rendered OpenGraph PNG.
  Consumer pages emphasize people and agents; developer pages explain the runtime.
- Shared route-aware navigation and mobile menu. Room headers retain Invite/Leave without
  distracting developer navigation. The lobby leads with Start Room; login keeps the form visible.
- Participant-first rooms with human/agent identity, speaking emphasis, voice availability,
  agent state and a main-column conversation area. Fixed safe-area voice controls remain.
  Planned agents are compact disclosure entries, not large disabled room cards.
- Shared `ConversationLog` for room text and Sandbox. New replies follow at the bottom;
  when reading older messages, New activity brings the reader back without forced scrolling.
  No artificial delays. Completed NDJSON replies still arrive independently, not token-by-token.
- Connection/confirmation onboarding with explicit Use detected details. Runtime sources remain
  framework-neutral and untrusted. Optional metadata, profile editing, future permissions and
  analytics collapse. Existing lifecycle-specific next actions remain.
- Compact featured discovery, identity-led cards, builder attribution, capability/search filters,
  Clear filters, honest availability, simplified agent/profile pages and branded recovery states.
- Example snippets describe the working adapter, not imaginary public APIs or Zoom access.

## Compatibility Inventory

Current canonical names (updated by the later naming migration):

| Category | Preserved contract |
| --- | --- |
| Package/API | `@synq/sdk`, `SynqAgent`, `createSynqAgent`, exported `Synq*` types |
| Implementation | `SynqAgent`, `createSynqAgent`, `SynqAdapterOptions` |
| Wire | `synq-agent`, `synq.handshake`, `synq.message`, `synq.voice` |
| Request identity | `X-Synq-Request-Id` in browser, API routes and outbound adapter calls |
| Routes | `/api/agents/*`, `/synq/handshake`, `/synq/message`, legacy mock `/synq/*` |
| Data | Existing SQL/RPC names, `user_id = nova`, room identifiers and stored user content |
| Browser | `synq-theme`, auth/room storage keys, singleton globals, wake-worker caches |
| Deployment | `synq`, `synq-agent`, explicit deployment URL configuration |
| History | Historical SQL migrations, protocol tests and integration examples |

A broad display-copy replacement initially changed the request-ID header. It was restored
before completion. Tests check replay protection and the exact legacy outbound header.
The later naming migration makes `synq.*` canonical with deprecated dialect support;
see [the current compatibility contract](synq-naming-migration.md).
User-authored stored room names/messages are never silently rewritten.

Temporary `/private/tmp/synq-*.cjs` files were implementation helpers only, outside Git.
Screenshots are outside Git except the explicitly authored marketing room image in `public/`.
That image is a representative UI capture with controlled test participants, not a live call claim.

## Security and Nova

SSRF/DNS pinning, redirect/body bounds, owner isolation, review/verification, room membership,
permission-filtered memory, duplicate request/invite guards, endpoint privacy and service-only
analytics writes remain unchanged. Public pages still have no public install/invite actions.

Nova Path A provider/recording/activation logic is unchanged. Changes in RoomVoice are styling;
Gemini and the disabled Path B worker only replace the product name in the identity sentence.
No STT/model/TTS configuration, prompt policy, mic state machine or dispatch flags changed.

## Rollout

1. No new SQL for the rebrand. If the preceding hardening migration is not deployed yet,
   apply `synq/supabase-agent-analytics-server-writes.sql` alongside that server code.
2. No new secrets/flags. Keep existing Supabase, LiveKit and provider configuration.
3. `NEXT_PUBLIC_APP_URL` (already supported) controls the canonical social image origin;
   default is localhost. Configure the real domain before building; no domain was invented.
4. Deploy marketing at repository root and the product from `synq/`.
5. SDK consumers use canonical names; legacy endpoints retain their deprecated dialect.
6. Path B remains off. No LiveKit worker redeployment is necessary for the active Path A flow.

## Validation

### Checkpoint Results (2026-09-10)

- PASS: beta `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- PASS: marketing `npx tsc --noEmit`, `npm run build`; source ESLint was also clean.
- PASS: SDK `npm run typecheck`, `npm run build`, and three adapter/alias tests.
- PASS: eleven runtime/API tests, including the preceding hardening regressions,
  legacy request-ID forwarding/replay, public DTO privacy and reserved brand usernames.
- PASS: research, code-assistant and OpenClaw TypeScript example builds; Fetch adapter
  `node --check server.mjs`.
- PASS: beta controlled-browser smoke suite on the production build, including auth gates,
  fixture session refresh, discovery, explicit detection/prefill, registration, multi-agent
  replies, retry/reset, room invite/message/cancellation and phone/desktop overflow checks.
- PASS: marketing browser suite for homepage, navigation, product, developer docs/access,
  image loading, theme persistence and phone/desktop overflow. Screenshots reviewed in
  both themes. Browser runs use Chromium, not physical Safari/iOS devices.
- PASS: disposable PostgreSQL analytics test during this pass (2026-09-09): migration
  reapplication, service-only writes, browser/anonymous denial and owner-scoped reads.
- Nova diff reviewed: recording, wake-word, silence detection, memory, provider selection
  and human microphone control are unchanged. Only visual classes and product identity
  wording changed. Live voice/provider regression remains a staging check, not a local claim.

The `synq` username and historical brand username are reserved to protect product identity. No existing
profile data is rewritten; check for a pre-existing claimed brand username in staging.
Generated build/browser files and local AGENTS/CLAUDE memory are excluded from the commit.
No launch rescope is included in this checkpoint.

Run beta lint/typecheck/build; SDK typecheck/build and adapter tests; runtime/API tests;
marketing build; builds for the existing TypeScript examples. Browser fixtures cover navigation,
auth/session refresh, discovery, planned detail/unavailable profile, explicit metadata prefill,
registration, multi-agent sandbox, retry/reset, room invite/message/cancel and responsive themes.
Public DTO tests check that profile/agent display data excludes private operational fields.
The outbound transport test checks the legacy request header; SDK alias tests check identity.

Browser screenshots are inspected at phone and desktop sizes. The fixture browser tests do not
prove real Supabase multi-device delivery, endpoint ownership, microphone permissions or audio.
The analytics SQL fixture is for a disposable PostgreSQL database only, never production.

## Staging Checklist

- Two real accounts: room join, participant agreement, reconnect/offline recovery and leave.
- Real LiveKit on phone/laptop: permissions, human mic choice, mute, playback and reconnection.
- Repeated Nova wake/manual prompts: silence auto-send, memory follow-up, multilingual response,
  audible Gemini/TTS result, human mic unaffected. Test unavailable Picovoice fallback.
- Public HTTPS adapter: detection, explicit prefill, review/verification, sandbox, gated room use,
  slower/failing/cancelled endpoint, memory permission combinations and owner isolation.
- Real opted-in public developer profile/approved agent and OpenGraph on the deployed domain.
- Confirm analytics service writes and owner reads against deployed RLS/migration.

## Deferred

Durable distributed request leases/rate limits, signed sandbox expiry, authenticated endpoint
ownership, true token streaming, shared external-agent audio, atomic room lifecycle/multi-tab
presence and cross-platform connectors remain separate work. Rebrand does not enable publishing,
public installs, billing, new voice grants or a domain migration.

Recommended next phase: staging multi-device validation, then durable sessions/idempotency and
endpoint ownership. Preserve the current protocol while expanding agent interoperability.
