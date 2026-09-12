# Nova Phase 2A: Solana Reads and Quote-Only Swaps

Phase 2A extends Nova Launch Mode, not the dormant platform. It reads public Solana
mainnet state and obtains Jupiter swap quotes. **No transaction construction, signature
request, signing, submission, broadcast, delegated authority or private-key storage exists
in this path.** Approval records review, never a trade. Perpetuals/positions remain Phase 1
simulations, explicitly labeled. Rooms, LiveKit, wake word, STT/TTS and SDK are preserved.

## Rollout

1. Existing Supabase auth and `supabase-nova-launch.sql` must already be installed.
2. Run `voxa-beta/supabase-nova-quotes.sql` in Supabase SQL Editor. It is idempotent and
   replaces only `nova_launch_approve`; it adds no tables, columns or browser permissions.
   Apply it AFTER the base launch SQL, including when reapplying the base later.
3. Set these server-only environment variables in the beta/Vercel project:
   - `NOVA_SOLANA_ENABLED=true` (default false for migration-safe rollout).
   - `SOLANA_RPC_URL`: dedicated HTTPS Solana **mainnet** endpoint. Query credentials stay
     server-side. Production has no public fallback; development may use
     `https://api.mainnet-beta.solana.com`, which is rate-limited and not an SLA.
   - `JUPITER_API_KEY`: Jupiter API key for production V2 `/order` quote-only access.
     Development permits a best-effort keyless quote request. This is not a promise of
     ongoing public access; production still fails closed without a key.
4. Keep existing Supabase URL/anon key/service role, Gemini and optional Deepgram/TTS
   configuration. `NOVA_MODEL_PROVIDER=gemini` remains the default compatible provider.
5. Deploy/restart the beta. `/api/nova/capabilities` exposes only authenticated capability
   booleans, not provider settings. Keep `NEXT_PUBLIC_SYNQ_PLATFORM_ENABLED=false` and
   marketing's `VITE_SYNQ_PLATFORM_ENABLED=false`; dormant pages remain hidden.

There is no new public environment variable. No new migration table or auth change is
required. Rollback: set the server flag false and redeploy; retain the compatible SQL.
Previously saved quote objects stay review-only. Never run SQL under `tests/` in Supabase.

## Read architecture

`app/lib/server/nova-launch/chain/solana.ts` implements `SolanaDataProvider` behind a
server-only service. Replace the provider via `getSolanaProvider`, not UI/RPC call sites.
Its fixed method allowlist is `getBalance`, `getTokenAccountsByOwner`, `getAccountInfo`,
`getTransaction`, `getSignaturesForAddress`. Arbitrary RPC method names are rejected.

- SOL uses lamports; SPL and Token-2022 accounts are queried independently with native
  balance in parallel. Exact decimal strings/BigInt are used, never floating token amounts.
  Portfolio aggregation is limited to 200 token accounts, explicitly marked partial.
- Token mint decoding validates token-program ownership, mint type and decimals. SOL/USDC
  have fixed canonical mints/decimals. Other mints may expose unverified Token-2022 metadata;
  classic off-chain metadata is not fetched. Symbols/names can be unavailable. No fabricated
  fiat value, safety rating, verification badge or investment-quality claim is added.
- Recent activity is at most 10 confirmed signatures, not full history or proof of initiation.
- Transactions normalize status, time, slot, fee, bounded signers/programs and net SOL/token
  changes. Unknown instructions are labeled unknown. Partial summaries are labeled.
  Memos, raw logs, arbitrary parsed program text and huge RPC payloads are discarded.

Inputs use canonical base58 decode/length checks (32-byte public address, 64-byte signature).
Malformed inputs fail before RPC. A syntactically valid public address need not be an
existing account. Native JSON RPC integers beyond JavaScript's safe integer range are
rejected rather than rounded; SPL amounts remain exact strings up to u64 and 18 decimals.

## Wallet and model boundary

The existing injected Solana wallet connection obtains only a public key. It does not
request signatures. The account sheet distinguishes **Connected wallet (read-only)** from
**Address being inspected (no ownership claimed)**. No proof of control is inferred from
either. Browser context is stripped down to address/kind; client-supplied permission or
private-key fields are ignored. Only public identifiers reach read/quote services.

The same text message route serves manual/voice input. It tries deterministic common
requests first; the model's optional `extractIntent` supplies advisory routing only for
other wording. Identifiers and quantities must occur in the user's prompt. Mints, decimals,
balances, slippage and quote values come from deterministic code, never model guesses.
Owner-scoped context remains 12 messages/12k characters. Reference follow-ups inspect only
the last four user messages; current explicit account context takes precedence.

Transaction explanation receives only `TransactionFacts` via optional
`NovaModelProvider.explainTransaction`. Gemini uses a separate instructions/data boundary,
no tools, 350 output tokens and a 10-second timeout; its interpretation is labeled separately
from observed facts. Missing/failing explanation degrades to deterministic facts. Unknown
program behavior is not guessed. Token names/memos/metadata never enter this model input.
Model output is still fallible prose, never action state or authority.

## Quote adapter

`SwapQuoteProvider` is provider-neutral. `SolanaSwapAdapter` implements the existing
`ActionAdapter` supports/validate/quote/simulate/execute contract. `execute` always throws.
Its `simulate` method records the review workflow only, not Solana transaction simulation.

Jupiter V2 is selected for current aggregator routing and its documented quote-only
contract: [GET /swap/v2/order](https://developers.jup.ag/docs/api-reference/swap/order).
No `taker`, `payer` or `receiver` is sent. Only fixed input/output mints, atomic amount,
ExactIn and validated slippage are sent to this fixed endpoint. A nonempty `transaction`
or `taker` in the response is rejected, not passed onward. All unknown response fields,
including upstream request IDs/transaction-building capabilities, are discarded.

Returned mint/amount/mode/slippage must exactly match. Normalized quotes retain exact
output/minimum units, human amounts, percentage-point price impact (if supplied), bounded
route labels, supplied provider fee, acquisition time and expiry. Minimum output must be
consistent with slippage. Network fees, rent and execution feasibility are NOT estimated.
Fees/routes can be unavailable; this is not a promise a later transaction will succeed.

Only SOL and USDC tickers resolve canonically. Every other ticker asks for the exact mint;
there is no fabricated token search/selection list. Arbitrary mint metadata claiming `SOL`
cannot override mint identity. Unknown mints display their exact address in quote identity.

Amounts must be positive, finite decimal strings with valid precision/u64 bounds. Percentage
and `half my SOL` requests require an observed balance. Known insufficient balances are
rejected. SOL quotes reserve a conservative **0.005 SOL planning buffer**, explicitly not
an execution-fee estimate. Percentage-of-SOL requests clamp to the remaining available
balance; half of 10 SOL remains 5 SOL. Absolute quotes without a wallet are allowed and
clearly say no balance was checked. Partial SPL portfolios cannot authorize a balance check.

Default slippage is 50 bps (0.5%). Explicit slippage is limited to 1-100 bps (0.01%-1%).
Above-default values get a warning. The model cannot silently select it.

## Immutable review lifecycle

User intent -> deterministic resolution/validation -> real quote -> normalized `quote_only`
object -> existing immutable plan -> explicit UI review -> **execution-disabled result**.

Quote TTL is at most 30 seconds, shorter if the provider supplies an earlier expiry.
The existing canonical SHA-256 hash binds ID, conversation, exact action and entire quote.
An expiring plan has its own one-time approval token. The owner-scoped, row-locked SQL
routine checks owner/hash/token/status/expiry. New prompts supersede pending plans.
Conversation text (`okay`, `yes`, `do it`) never invokes approval.

Refresh loads the old plan with BOTH owner and conversation filters, checks its hash,
rechecks the observed balance, gets a new quote and issues a new ID/hash/token. No quote
is silently replaced underneath an approval. Expired cards disable approval and offer
Refresh; the server and SQL also reject stale approvals. Duplicate matching approvals
return the stored review result, not another operation; changed-token replays fail.

Success says **"Quote approved — execution is not enabled yet. No funds moved."** Its
`transactionSignature` is always null. The legacy DB status `executed` means the review/
simulation terminal state, NOT an on-chain execution. Existing simulation results persist.

## Limits, caching and observability

- Existing overall limit: 60 Nova API requests/user/minute. Additional per-process limits:
  12 quotes/user/minute; 30 reads/user/kind/minute. Distributed enforcement is future work.
- HTTP: 8-second total deadline, at most two attempts (429/5xx only), 250 ms abortable retry
  delay, no redirects, 4 MiB response cap, caller cancellation. No infinite retries.
- Provider-local cache: max 128 entries; portfolio/recent 5 seconds, token 60 seconds,
  transaction 30 seconds. Cloned cache values cannot mutate other requests. No quote cache.
- Structured logs contain operation/provider/request ID/status/HTTP status/latency only.
  API failure logs classify input/token-resolution/quote/transaction errors without raw
  URLs, credentials, account addresses, provider bodies or conversation text.

## Validation and exact reproduction

From `voxa-beta`:

```sh
npm run lint
npx tsc --noEmit
npm run build
node --require ./tests/register.cjs --test tests/runtime.test.cjs tests/routes.test.cjs tests/nova-launch.test.cjs tests/nova-launch-routes.test.cjs tests/solana-read-quotes.test.cjs tests/solana-routes.test.cjs
node tests/solana-live-smoke.cjs
# With Playwright installed/available; keep local server running:
SMOKE_URL=http://localhost:3000 node tests/nova-launch-smoke.mjs
SMOKE_URL=http://localhost:3000 node tests/solana-browser-smoke.mjs
```

SDK: `node --test tests/adapter.test.mjs` from `packages/sdk`. Browser fixtures require
Playwright (or the host's bundled package through NODE_PATH). They intercept auth/storage
and use real read/quote normalization code with synthetic provider responses; they are NOT
live Supabase, Gemini or Jupiter validation. Original smoke exercises flag-off behavior.
The new smoke exercises portfolio/token/transaction/activity/quote cards, review, expiry,
requote, insufficient balance and ambiguity across desktop/mobile light/dark. Screenshots
belong in `/private/tmp`, never Git. SQL test `tests/nova-quotes.sql` runs original launch
checks plus quote checks in a fresh disposable PostgreSQL DB only, with fake auth roles.

Final automated count: **56 passing tests** (25 unchanged beta regressions + 3 unchanged
SDK regressions + 28 Phase 2A tests: 22 read/quote/intent checks and 6 route checks).
Beta lint/typecheck/production build and SDK typecheck/build pass. Both Nova browser suites
and the disposable PostgreSQL migration/security suite pass separately from that count.

Live checks during implementation succeeded against public mainnet: native balance
(public program account) 1,339 ms; portfolio (public mint address, not a user wallet)
1,892 ms; USDC mint 581 ms; recent signatures 443 ms; a returned transaction 377 ms.
These are single cold observations, not performance guarantees. Fixture HTTP reads were
roughly 0-14 ms, excluding the intentional retry/timeout checks. They are not network latency.
Jupiter also returned a real keyless V2 quote, validated through the actual provider
normalizer in **385 ms**, with no taker or transaction payload. A production-key request
is still untested because credentials were unavailable. Browser approval flows and
failure scenarios remain fixture-validated; they are not live authenticated deployment tests.

## Staging and next boundary

Before enabling production: apply SQL in staging, supply a dedicated mainnet RPC and
Jupiter key, check actual provider response compatibility, real wallet/token portfolios,
quote latency/expiry/requote, concurrent Supabase approvals, and real voice-to-read flow.
Verify actual Phantom/Solflare behavior and physical iOS keyboard/audio/performance.
Never use fixture balances or outputs as live evidence. No production migration performed.

Deferred: fiat prices, broad off-chain metadata, full/archival history, token-symbol search,
distributed rate limits, simulation of transaction feasibility, real perpetuals/transfers.
Phase 2B should begin with independently reviewed Solana/Jupiter transaction validation and
wallet-signature boundaries, not simply enabling `execute`. A fresh quote is not permission
to sign. A future builder must validate exact instructions/accounts/amounts/fees and bind
the signature request to the reviewed immutable plan. None is implemented in Phase 2A.
