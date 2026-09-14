# Synq naming migration

Synq is the platform; Nova is its flagship on-chain agent. This is a local naming
migration only. No Supabase or Vercel connection, SQL application, deployment, signing,
transaction construction, broadcast or funds movement is part of it.

## Canonical layout and contracts

- `synq/`: the Next.js Nova application (formerly `voxa-beta/`).
- `synq-agent/`: disabled Python LiveKit worker. Existing deployment binding is retained.
- `src/components/synq/`, `src/routes/synq/`: dormant marketing prototype, not Nova.
- `packages/sdk/`: private `@synq/sdk`, implemented by `SynqAgent`, `createSynqAgent`,
  `SynqMessage*`/`SynqVoice*` types and `SYNQ_*` constants.
- Canonical wire: `synq-agent`, `synq.handshake`, `synq.message`, `synq.voice`;
  endpoints `/synq/handshake`, `/synq/message`, optional `/synq/voice`;
  request header `X-Synq-Request-Id`.

## Deprecated compatibility, not current branding

The old SDK is private and all in-repo dependents were migrated. Existing externally
copied adapters cannot be assumed absent, so wire and source compatibility are explicit:

- `packages/sdk/src/legacy.ts` retains old exported classes, functions, types and constants.
  Legacy message factories emit their original dialect; canonical factories emit Synq.
  The Fetch handler accepts both, returning the legacy protocol only for a legacy handshake.
- `packages/sdk-legacy/` is a private local bridge named `@voxa/sdk`. Consumers that need it
  can point that dependency at this folder after building `packages/sdk`. Nothing is published.
  Its handshake helper preserves the old result. New examples depend only on `@synq/sdk`.
- Server protocol compatibility is centralized in `synq/app/lib/agents/protocol-compatibility.ts`.
  Registered `/synq/` endpoints explicitly opt into the canonical dialect. Existing `/voxa/`
  and custom-path registrations retain the old dialect until their endpoint is deliberately
  updated. There is no retry of a user message in a second dialect, preventing duplicate work.
  Handshake responses accept both supported protocol identifiers without weakening verification.
- Incoming request IDs prefer the canonical header, then the deprecated header. Canonical
  endpoints receive only the canonical header; old/custom endpoints receive both with the
  same ID. No second request or duplicate telemetry is emitted.
- Existing LiveKit participant metadata includes deprecated aliases for old observers;
  canonical keys are primary. The worker's existing cloud subdomain remains a deployment
  identifier only; no cloud re-link or redeployment occurred.
- Historical SQL policy names occur only in guarded rename clauses. Fresh schemas get Synq
  names; old policies are renamed without changing predicates or creating duplicates.
  Nova tables, immutable plans, RPC names and UUID ownership are unchanged. No new migration
  is required for Nova; none was applied. Dormant schemas still need their separate RLS audit.
- Historical Git paths and negative-brand assertions remain in regression tests. They are
  not active directory assumptions. The historical voice comparison permits exactly the
  reviewed fallback logger brand substitution and otherwise compares every byte.

## Browser state

`synq/app/lib/legacy-storage.ts` migrates theme, dormant room session state, dormant Supabase
session/PKCE state and SDK waitlist drafts to canonical `synq-*` / `synq.*` keys.
Canonical values win. An old key is removed only after successful persistence; a failed
write never deletes the source. Early theme initialization uses the same one-time behavior
to avoid a dark-mode flash. No tokens are printed or sent elsewhere. Old tabs should be
closed/reloaded during upgrade; old application versions are not kept in cross-tab sync.
Wake-worker cache names and in-memory singleton/log names are canonical and may repopulate.

## Environment and deployment

No old-brand-prefixed environment-variable names were found. Provider credentials and
existing Synq flags remain unchanged. No private env values were changed or committed.
Set `VITE_BETA_URL` for the marketing CTA, `NEXT_PUBLIC_APP_URL` for Nova metadata and
`NEXT_PUBLIC_MARKETING_URL` for dormant docs links. Local defaults are ports 3000 and 5173;
they are not production defaults. Rebuild after public URL changes. Future Vercel project
root is `synq`, not repository root; marketing still builds from repository root.
No remote project settings, domains, DNS or infrastructure identifiers were renamed.

## Audit and validation

Initial inventory: 535 matching lines, 240 legacy-named tracked paths. Categories:
branding 67, internal/storage 25, paths 27, config 10, protocol 22, SQL 24, SDK 66,
docs/tests/examples 273, committed lock metadata 21. Excludes dependencies/builds/caches.

Run `node scripts/check-naming.cjs --report` from repository root for **every retained
occurrence**, with file, current line, context and reason. `scripts/naming-exceptions.json`
uses exact trimmed-line hashes/counts, not broad source-file exemptions. Unexpected names,
new occurrences and stale exceptions fail the guard. This audit covers tracked and
non-ignored untracked text including locks; generated/vendor/binary/private env and Git
internals are excluded. Local memory files remain ignored/untracked, not deployment input.
No claim of zero total legacy strings is made: only intentional compatibility/history remains.

App checks: `cd synq`, lint, `npx tsc --noEmit`, production build, all `tests/*.test.cjs`.
SDK: typecheck/build and `node --test tests/*.test.mjs`. Build the three TypeScript examples.
Browser checks remain fixture-only: Nova, Privy, Phase 2A and readiness/planner smoke scripts.
Legacy Nova smoke requires explicit development-only legacy auth flags; production always
uses Privy. All signing/execution prohibitions and staging blockers remain unchanged.

Validated after the directory move: app lint/typecheck/production build, marketing build,
SDK typecheck/build, and all three TypeScript example builds pass. Regression total is
96 (89 baseline + 5 app naming/storage tests + 2 SDK compatibility tests). Nova, Privy,
Phase 2A and readiness/DEXTER browser fixtures pass, including desktop/mobile light/dark.
The initial Nova browser attempt timed out during cold dev compilation; the warmed run
passed unchanged. The app-local shared storage helper also passes the production build.

Final source audit: 107 retained occurrences on 99 lines, zero unexpected active branding.
This includes compatibility guards/tests, historical references and two immutable lockfile
hash substrings. An additional 17 occurrences remain in two ignored historical room SQL
files, outside deployable source. Generate the full per-occurrence report with
`node scripts/check-naming.cjs --report-file /tmp/synq-naming-audit.json`.
No dependency versions or integrity hashes were changed. Real auth, providers, hosted RLS
and physical mobile testing remain staging requirements; fixtures do not establish them.
