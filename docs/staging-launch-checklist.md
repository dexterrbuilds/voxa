# Synq staging launch checklist

This is the single rollout checklist for the Privy/Nova launch. **No SQL was applied,
no live Privy account was tested, and no funds were moved in this readiness pass.**
All signing, transaction building/submission, token launching, lending, locking and
perpetual execution remain disabled. Do not turn on the dormant platform for this rollout.

## 1. Prepare the environment

- Use a separate Supabase staging project and Privy staging application. Back up existing
  database data and record currently applied scripts before any migration.
- Privy Dashboard: enable email login, user-owned Solana embedded wallets and exact
  localhost/staging origins. Enable Google only after OAuth configuration. Do not configure
  delegated/server wallet signers or automatic funding. An external wallet is not required.
- Privy is the default even with no auth selector. Production always uses Privy. An absent
  public app ID shows the Glass login shell, disabled Continue button and explicit setup message.
- Legacy Supabase forms require BOTH `NEXT_PUBLIC_SYNQ_AUTH_PROVIDER=supabase` and
  `NEXT_PUBLIC_SYNQ_LEGACY_AUTH_ENABLED=true` in **non-production** development. Production
  ignores these overrides. Fixture SDK adapters live only in tests and are never production aliases.

## 2. Configure variables, without committing values

Public client/build-time:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Required public application identifier |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required project/client configuration; not service credentials |
| `NEXT_PUBLIC_SYNQ_AUTH_PROVIDER=privy` | Documents intended provider; unset also means Privy |
| `NEXT_PUBLIC_PRIVY_GOOGLE_ENABLED=false` | Optional, only true after dashboard setup |
| `NEXT_PUBLIC_SYNQ_PLATFORM_ENABLED=false` | Keep rooms/directory/developers dormant |
| `VITE_SYNQ_PLATFORM_ENABLED=false` | Same launch mode for the separate marketing app |
| `NEXT_PUBLIC_APP_URL` | Exact future Nova deployment origin for metadata |
| `NEXT_PUBLIC_MARKETING_URL` | Exact future marketing origin for dormant docs links |
| `VITE_BETA_URL` | Exact future Nova origin for marketing CTAs; localhost fallback is development only |

Server-only:

| Variable | Purpose |
| --- | --- |
| `PRIVY_APP_SECRET` | Required; same app as the public ID |
| `SUPABASE_SERVICE_ROLE_KEY` | Required for existing owner-checked writes/identity resolution |
| `SUPABASE_AUTH_BRIDGE_JWK` | Required private ES256 database-auth JWK, imported/trusted in Supabase, including matching `kid`; NEVER a wallet key |
| `GOOGLE_API_KEY` | Required for conversational text; missing key does not disable deterministic reads/planning demo |
| `NOVA_MODEL_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.1-flash-lite` | Current supported model implementation, no user-facing picker |
| `NOVA_SOLANA_ENABLED=true` | Enable Phase 2A only after migrations/configuration |
| `SOLANA_RPC_URL` | Dedicated HTTPS mainnet RPC required for production reads |
| `JUPITER_API_KEY` | Required production quote access, never transaction construction |

Optional voice: server-only `DEEPGRAM_API_KEY`, `DEEPGRAM_MODEL=nova-3`,
`DEEPGRAM_LANGUAGE=multi`, `NOVA_TTS_PROVIDER`, `NOVA_TTS_VOICE`, `NOVA_TTS_SPEED`,
`OPENAI_API_KEY`/`OPENAI_TTS_MODEL` for configured fallback. Text still works without voice.
Existing public silence/wake settings are unchanged; leave wake disabled unless configured.
Legacy room LiveKit credentials are not required for Nova launch voice.

Development-only: the two legacy auth selectors above; public RPC/keyless quotes are
best-effort development fallbacks, not a staging substitute. No fixture env enables a
production authentication bypass. `NODE_ENV=production` is managed by Next at build/start.

Run `cd synq` then `node scripts/check-configuration.cjs` for a **names-only** local
audit. It reads `.env.local` using Next's loader and does not contact any provider or DB.
Optional missing groups do not crash the application. The script uses the repository's
TypeScript test loader and is a local development tool, not part of the production bundle.
At runtime, auth/database errors are safe 503 setup responses; optional model/chain errors
stay confined to the requested capability. Never prefix any private credential with NEXT_PUBLIC.

## 3. Apply exactly this Nova staging order later

Supabase SQL Editor, in the intended **staging** project, run each current file completely:

1. `synq/supabase-nova-launch.sql`
2. `synq/supabase-nova-quotes.sql` (includes the new service-only read-only readiness probe)
3. `synq/supabase-privy-identity.sql`

Prerequisites: Supabase's `auth.users`, `auth.uid()`, `auth.role()`, standard roles and UUID
support. No room/agent schema is required for this Nova-only chain. No new planner table is
needed: planning-only blocks use existing `nova_messages.blocks`, never approval rows.

Do NOT run `tests/*.sql`: they are disposable test databases, not deploy migrations.
Do NOT bulk-run every SQL file. See [migration audit](migration-readiness.md) for dormant files.
No Supabase CLI migration-directory workflow is configured; do not invent a `db push` command.

Reapply the complete three-file sequence if needed. Do not reapply launch alone after quotes:
it replaces the approval routine with the older simulation-only version. Scripts preserve
rows; identity changes three owner FK targets while preserving UUID values, existing RLS
and owner-checked functions. It never links by email. The quotes script is transactional;
readiness routine version 2 attests that this ordered extension was installed, not that the
deployment has passed end-to-end security tests. Check policies/privileges separately.

If any script fails, stop and investigate. Unique-index conflicts must be resolved without
deleting user data. Keep staging traffic disabled until all three finish. Roll back application
code if necessary; do not drop identity tables, restore old owner FKs over Privy UUIDs, or delete
new conversations. Recover from backups/forward fixes. Existing-user linking still requires
independent proof of both accounts; see [Privy migration](privy-auth.md).

## 4. Deploy

- Vercel project root: `synq`, Next.js framework, `npm run build`, default output.
  Use supported Node LTS (22/24). Add the public variables before building and server values
  to the same staging environment. Rebuild after public flag/app-ID changes.
- Configure Supabase to trust the imported ES256 auth bridge key. Verify real PostgREST reads
  accept the short-lived UUID token and RLS hides other owners. Do not send bridge tokens
  or private JWKs to the browser. Privy token verification is not a replacement for RLS.
- Keep platform flags false, external agents default-off, and all execution disabled.
  Existing domain/API/protocol identifiers remain unchanged; no DNS migration is needed.

## 5. Real account and wallet acceptance checks

- Open `/login`: Welcome to Synq + Continue with email, no password registration.
- Complete real email OTP (and Google if enabled). Wallet preparation must finish or show
  a bounded retry/setup error. Missing schema stops server resolution; no automated migration.
- Confirm one canonical embedded Solana wallet appears in Nova. Log out, log in and refresh:
  the same Synq UUID/address/history must return. Test concurrent tabs and interrupted provisioning.
- Confirm logout revokes the session; old bearer requests fail. Test a second user cannot
  read the first user's conversations/plans or claim their wallet. Inspecting another public
  address remains read-only and never replaces the owned wallet.
- Confirm initial zero balance via `What do I own?`. Do not assume new wallets contain funds.

## 6. Phase 2A and planner checks

- Start with reads/fixtures. Only if needed, manually fund the confirmed staging test wallet
  with a deliberately small amount on the configured **mainnet**. Funding is your separate
  wallet action, not Synq automation; devnet funds cannot test mainnet balances/quotes.
- Read portfolio, tokens, recent activity and a known transaction. Compare observed facts
  with independent chain data. Never paste keys/seed phrases.
- Request `Swap 0.01 SOL to USDC`, within observed available balance/reserve. Review quote,
  slippage/expiry, approve, then confirm **execution is not enabled** and no signature prompt.
- Expire a quote, reject stale review, refresh to a new plan/hash, test duplicate review and
  another user's plan rejection. Test provider outage and insufficient balances.
- Send `Show the DEXTER planning demo`: seven dependent steps, example labels, no approval or
  execution control. This does NOT contact ClawPump, Pump.fun or Streamflow and supplies no mint.
- Test voice/text, stop/cancel, history, mobile keyboard, wallet sheet, light/dark, physical
  Safari auth/session refresh. Fixture screenshots are not proof of hosted/mobile auth.

## 7. Release gate

Run beta lint/typecheck/build, SDK checks, all regression suites, Nova/auth/Phase2A/planner
browser fixtures, then the real checks above. All 67 baseline tests remain unchanged.
No DB migration or live Privy verification was performed during this readiness pass.
Known upstream moderate Privy connector advisories remain documented in `privy-auth.md`.

Only after this checklist passes should a separately approved Phase 2B introduce transaction
validation/simulation and explicit user signature flows. Planning, quotes and conversational
"yes" never grant signing authority. **This release cannot move funds.**
