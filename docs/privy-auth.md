# Privy authentication and Synq wallets

This migration changes Nova launch authentication, not transaction permissions. The
broader platform and its Supabase authentication remain dormant and intact. Privy is the
default; configure it using [the staging checklist](staging-launch-checklist.md).
Missing configuration shows an explicit setup state. Legacy Supabase forms require BOTH
`NEXT_PUBLIC_SYNQ_AUTH_PROVIDER=supabase` and `NEXT_PUBLIC_SYNQ_LEGACY_AUTH_ENABLED=true`
in non-production development. Production always selects Privy, even with these overrides.
Never silently fall back to Supabase when Privy verification fails in Privy mode.

## Supported integration

- `@privy-io/react-auth` 3.42.0 and `@privy-io/node` 0.34.0 (lockfile).
- Email OTP through Privy's supported modal. Google is optional, off unless
  `NEXT_PUBLIC_PRIVY_GOOGLE_ENABLED=true`. External wallet login is not offered.
- Next App Router client boundary is lazy-loaded only when Privy mode is enabled.
  Synq's Liquid Glass login shell remains; Privy's modal inherits theme, logo and blue accent.
- `embeddedWallets.solana.createOnLogin='all-users'`, Ethereum creation off.
  The recovery hook uses `createAdditional:false`, never signers or delegated authority.
  Server profile lookup and a pinned canonical address, not SDK browser state, determine
  ownership. Multiple ambiguous embedded wallets fail closed rather than selecting arbitrarily.

Official references: [React setup](https://docs.privy.io/basics/react/setup),
[automatic creation](https://docs.privy.io/basics/react/advanced/automatic-wallet-creation),
[wallet creation](https://docs.privy.io/wallets/wallets/create/create-a-wallet),
[access tokens](https://docs.privy.io/authentication/user-authentication/access-tokens),
[current Node SDK](https://docs.privy.io/basics/nodeJS/advanced/migrating-from-server-auth).

## Identity and RLS

`requireSynqUser` verifies the bearer using `utils().auth().verifyAccessToken`, including
Privy's signature, issuer, app audience, expiry and session ID. It checks server-side
session revocation, fetches the authoritative Privy user (`users()._get`), and resolves:

`Privy DID -> synq_users.id (UUID) -> pinned embedded Solana address`

No email matching, client UUID, claimed DID, or client wallet address establishes identity.
`synq_resolve_identity` is service-only, unique by DID and wallet, with a row lock for
canonical wallet assignment. Subsequent changes/missing pinned wallets are rejected.
New identities do not create synthetic Supabase Auth accounts.

Apply `synq/supabase-privy-identity.sql` **after** `supabase-nova-launch.sql` and
`supabase-nova-quotes.sql`, through Supabase SQL Editor. It is transactional/reapplicable.
It adds `synq_users` and `synq_revoked_sessions`, backfills existing Auth UUIDs, and changes
only the three Nova owner foreign keys to `synq_users`. Existing owner values, messages,
plans, RLS policies and approval functions remain. A trigger preserves compatibility for
new legacy Supabase signups. No production database was modified during implementation.

Nova reads use an **authenticated, owner-scoped Supabase client**. A dedicated imported
ES256 database-auth key issues server-only 60-second JWTs with the mapped UUID as `sub`
and fixed `role=authenticated`. Existing `auth.uid()` SELECT policies still apply.
These JWTs are never returned to the browser and cannot write Nova or identity tables.
The existing owner-filtered/service-only Nova write RPCs remain unchanged; this is not a
blanket conversion of platform APIs to service-role access. Server service credentials
are used only for identity/revocation and the already privileged Nova writes.

The database-auth signing key is an infrastructure credential, **not a Solana wallet key**.
Protect and rotate it like other server credentials. See
[Supabase signing keys](https://supabase.com/docs/guides/auth/signing-keys) for importing
a dedicated ES256 key. Configure its full private JWK, including the matching dashboard
`kid`, in `SUPABASE_AUTH_BRIDGE_JWK`. Supabase must trust that key before rollout; a default
Supabase-managed private key cannot be exported. Do not paste a service-role token into
this variable or expose the JWK to the client. No custom token hook is required.

Logout verifies the session and records its ID server-side before clearing Privy's local
session. It does not depend on wallet provisioning or the database-auth key. Replaying that
session is rejected. Network failure is shown and sign-out can be retried. Other sessions
are unaffected. In-flight requests already authenticated can finish; the UI cancels its
active Nova request on logout. There is no signing consequence. Revocation rows are kept;
future retention cleanup must account for Privy refresh/session lifetimes.

## Wallet and Nova behavior

The client waits for authentication and authoritative wallet resolution before opening
Nova. Provisioning uses one in-flight SDK call per DID, no additional wallets, bounded
polling and a 45-second deadline. Retry always reads server truth first. SDK initialization
also has a visible timeout message. Returning users reuse the same pinned wallet.

The wallet is user-owned in Privy's embedded architecture. Synq neither generates nor
stores seed phrases/private keys. Connecting/provisioning confers only `read` and `propose`.
No signer, signature request, transaction builder, submission, export, fund or delegation
API is exposed by Synq's wallet boundary. Privy's broader SDK contains these APIs, but
Synq does not call them. `PrivyClient` itself stays private behind auth/user-read methods.

Nova defaults to this wallet when no inspected address is supplied. Its account sheet shows
the canonical address, a copy action, and separate read-only inspection. A submitted
`kind=wallet` address must match verified ownership. `kind=watch` accepts public addresses
with read-only permissions and never updates the canonical mapping. Removing inspection
restores My wallet. Voice uses the same message request and therefore the same default;
capture, STT/TTS, wake word, LiveKit and room voice are unchanged.

Phase 2A still uses mainnet reads and Jupiter quote-only plans, with observed balance checks.
A brand-new empty wallet will show zero assets and reject unfunded quotes. No auto-funding
or airdrops occur. Embedded addresses are network-agnostic; devnet funds will not appear in
the existing mainnet read environment. Do not send funds merely to test this migration:
use fixtures first and a separately controlled test wallet for staging. Approval still ends
at **Quote approved — execution is not enabled yet**. It never moves funds.

## Existing users

Existing Supabase UUIDs and every owned Nova row remain. Signing in through Privy creates a
new identity unless a trusted operator has explicitly linked it; matching email does not
recover old history. There is no automatic linking endpoint in this release.

For old development accounts, an operator must first independently verify control of BOTH
the old authenticated Supabase account and the new authenticated Privy account. Record that
decision, back up data, then map the verified Privy DID onto the existing UUID in a controlled
SQL transaction. If a fresh Privy mapping already exists, merge its Nova rows (conversations,
messages, plans) consistently to the preserved UUID before removing that duplicate identity;
do not delete it with cascading rows still attached. Preserve the verified canonical wallet.
Test this on staging; there is deliberately no generic email-based merge script. Users who
do not migrate retain their legacy data, but see a separate Privy history. Restoring the
platform later also requires its own Privy identity adapters; this phase touches Nova only.

## Configuration and rollout

Public/build-time:
- `NEXT_PUBLIC_SYNQ_AUTH_PROVIDER=privy`
- `NEXT_PUBLIC_PRIVY_APP_ID`: Privy dashboard application ID, not a secret.
- `NEXT_PUBLIC_PRIVY_GOOGLE_ENABLED=false`: enable only after Google is configured.
- Existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Server-only:
- `PRIVY_APP_SECRET`
- `SUPABASE_AUTH_BRIDGE_JWK`
- Existing `SUPABASE_SERVICE_ROLE_KEY`
- Existing Phase 2A `NOVA_SOLANA_ENABLED`, `SOLANA_RPC_URL`, `JUPITER_API_KEY`.
- Existing Nova `GOOGLE_API_KEY`, `GEMINI_MODEL`, Deepgram and TTS variables are unchanged.

In Privy Dashboard, enable email login and user-owned Solana embedded wallets. Add exact
localhost/staging/production origins and configure Google OAuth callback/origin settings
if enabling Google. Do not add server authorization signers, delegated policies, automatic
funding or custody overrides. Customize logo/theme if needed. App ID/secret must belong to
the same app. Apply SQL, register the Supabase bridge key, set Vercel server secrets and
public build settings, then redeploy. Retain existing launch-mode platform flags as false.
Never commit `.env.local`. Use Node 22/24 LTS in deployment.

## Migration checkpoint validation (historical)

Automated: original 56 regressions unchanged, plus 11 auth/wallet tests. Real Privy ES256
verification is exercised with generated disposable test keys, including wrong audience,
issuer, expiry and forged payloads. Tests also cover owner-context forgery, revocation,
wallet pinning, failure isolation, RLS token scope, and the no-signing boundary.
`tests/privy-identity.sql` is **disposable PostgreSQL only**, not a production migration.
It includes original approval/quote tests and tests reapplication, UUID preservation,
wallet uniqueness/idempotency, owner RLS and browser denial.
The final disposable-database run also confirmed concurrent resolution returns the same
canonical UUID and wallet. Beta lint/typecheck, legacy and Privy-enabled production builds,
and SDK typecheck/build passed; the full automated total is 67 (56 unchanged + 11 new).

`tests/privy-browser-smoke.mjs` builds real UI components with an explicitly test-only
Privy SDK adapter and API fixtures. The test entry/aliases never enter Next configuration
or production bundles. Screenshots go to `/private/tmp`, not Git. This does NOT validate
real OTP delivery, wallet creation, live quotes, real hosted RLS or mobile Privy redirects.
The unmodified Nova smoke remains the legacy rollback-mode regression.
For the readiness pass, run that legacy smoke against an explicitly selected development
server, not a production legacy build. Production legacy forms are now blocked. New readiness
tests are additive; see the staging checklist for the current validation matrix.

Run from `synq`: `npm run lint`, `npx tsc --noEmit`, `npm run build`;
`node --require ./tests/register.cjs --test tests/*.test.cjs`.
SDK: `npm run typecheck`, `npm run build`, `node --test tests/adapter.test.mjs`.
Browser fixtures require Playwright and esbuild available to Node. The unchanged Nova
smoke passed against `npm start -- --port 3100` (legacy rollback build); the Privy fixture
uses `SMOKE_URL=http://localhost:3000` to load the existing preview's styles. Desktop and
mobile light/dark screenshots were inspected. Fixtures do not replace hosted auth checks.

Staging release gate: real email/optional Google, first wallet creation, same address after
logout/login and refresh, real PostgREST RLS with the imported key, cross-user rejection,
revoked-token replay, physical mobile/Safari auth and timeout recovery. No Privy credentials
were available locally. Live Privy verification has NOT been claimed.

## Dependency security

Compatible overrides: Axios 1.20.0 (prototype-pollution/request-construction advisories),
ws 8.21.0 (memory disclosure/DoS), PostCSS 8.5.28 (parser advisories). Installed memo 0.10.0
to match Solana Kit 5.5.1; the latest memo requires Kit 8 and was not forced. npm's compatible
resolution moved Next within its existing 16.x range to 16.3.5; no major framework upgrade.
Disable Next auto-generated agent rules to preserve ignored local memory files.
Final audit: 23 moderate findings, zero high/critical. These include transitive dependents
of `uuid` 8/9 (buffer bounds in v3/v5/v6) and `decode-uri-component` 0.2.2 (malformed-input
DoS), reached through Privy's x402/wagmi/MetaMask/WalletConnect connector tree. Neither
installed branch has a compatible patched release; overriding across major/0.x minor
boundaries or downgrading Privy is not a safe blanket fix. External/EVM connectors and
payment hooks are not configured, but the dependency advisories still need monitoring.
Do not apply npm's suggested breaking Privy downgrade. Track upstream patched dependencies.
Webpack may warn about the optional, unused Farcaster Solana peer; it is not enabled.

Phase 2B is intentionally deferred: transaction validation/simulation, explicit signature
confirmation, signing, submission and confirmation must be designed separately. The model
and quote approval still have no wallet execution authority.
