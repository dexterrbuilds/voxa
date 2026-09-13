# Nova capability planning foundation

This adds deterministic **planning-only** graphs alongside the existing single-action
immutable plans. It does not replace Phase 2A, invent another swap adapter, or add a runner.

## Registry and providers

`app/lib/server/nova-launch/capabilities.ts` owns a closed registry. Descriptors expose id,
name, description, category, provider IDs, strict input/output field schemas, fixed risk,
read-only/state-changing classification, approval/signature requirements and enablement.
Request/model JSON cannot register entries, override policy or enable providers.

Implemented capabilities: portfolio.read, activity.read, token.inspect, transaction.inspect,
swap.quote, enabled by the existing server-side `NOVA_SOLANA_ENABLED` flag. This means
implemented/allowed, not a health guarantee; existing adapters still validate configuration,
inputs, balances, quotes and rates. `/api/nova/planning` exposes safe registry metadata behind
the same authentication/schema preflight. Existing `/api/nova/capabilities` contract is unchanged.

Future disabled: swap.execute, transfer.execute, token.launch, token.buy, token.distribute,
token.airdrop, token.lock, perp.open/close, lend.deposit/withdraw, portfolio.verify, state.verify,
report. Solana RPC/Jupiter are implemented read/quote providers. ClawPump, Streamflow, Kamino,
Meteora, Phoenix and cross-provider verification are metadata only. No vendor APIs were
integrated or validated. Their names are future integration intent, not availability claims.

Schemas use a deliberately small closed field vocabulary, reusing Phase 2A base58/exact-unit
validation. Unknown fields are rejected. Decimal/percent/duration/recipient counts are bounded.
Future token-specific decimal/balance/venue checks must occur with real observed state before
any actionable quote; a graph schema is not transaction validation.

## Planner

`planner.ts` accepts a bounded objective and 1–12 steps with IDs, capability/provider IDs,
inputs and explicit dependency IDs. It rejects duplicate/unknown/circular dependencies,
topologically orders the graph, and validates typed artifact references against the declared
outputs of direct dependencies. Result artifacts start empty; a reference is not an observed mint.

Each step includes normalized inputs, dependencies, provider display metadata, status, fixed
risk, approval/signing requirements and output declarations. A graph binds owner UUID,
conversation UUID, steps, policy, expiry and mode to SHA-256 using the SAME canonical
serialization as existing action plans. Any mutation changes the digest. Content hashes are
not authorization credentials; future approvals must bind to trusted persisted exact content.
Verification also checks fixed policy even if a caller recomputes a hash.

Only draft (demonstration) and validated (dependency/schema check) states are emitted. Other
typed states describe a future lifecycle, not current execution: awaiting_approval, approved,
executing, partially_completed, completed, failed, cancelled, expired. `requirePlanExecution`
always rejects, including read steps. Existing individual read/quote flows remain the only
working provider paths; there is no graph auto-run loop, autonomous retry, or replan execution.

Risk is server-assigned: READ, QUOTE, LOW_RISK_ACTION, ASSET_TRANSFER, TOKEN_LAUNCH,
LEVERAGED_POSITION, ADMINISTRATIVE. Current read steps need no approval; quotes retain the
existing immutable review approval; future state changes require approval AND a wallet
signature but remain disabled. Natural language assent cannot approve. This graph has no
approval token or approval button and is never inserted in `nova_action_plans`.

## Non-executing DEXTER example

Send exactly **Show the DEXTER planning demo** in Nova. This explicit demo command bypasses
model/provider calls, builds a server-owned seven-step graph and saves a `capability_plan`
block through existing owner-scoped `nova_launch_turn`. The Glass card renders it in history.
It is not general intent recognition or an executable response to arbitrary token-launch requests.

1. ClawPump/Pump.fun token.launch -> declared mint
2. token.buy -> 2 SOL, depends on launch
3. portfolio.verify -> observed-balance placeholder, depends on buy
4. token.distribute -> **5% total split equally** among three illustrative public identifiers
5. Streamflow token.lock -> 20%, six months, depends on distribution
6. state.verify -> future final balance/lock evidence
7. report -> future facts-only summary

Allocation bases, valid human recipients, venue support, lock contract, price and fees need
future clarification/validation. The fixture's public identifiers are NOT real recipients to
fund. No mint, transaction, balance verification or lock result is fabricated. The card states
execution is unavailable and output references are awaiting evidence.

## Future integration boundary

Add a reviewed provider adapter behind a capability, not protocol conditionals in UI/model.
ClawPump would resolve token.launch/token.buy and normalize mint/venue/transaction evidence;
Streamflow would validate the explicit lock request and normalize lock evidence. Neither has
an SDK import, endpoint request, credential or operational method today. Existing `ActionAdapter`
and its supports/validate/quote/simulate/execute contract stay intact; execute still rejects.

Phase 2B requires a separately approved design: authoritative account state, protocol-specific
validation, simulation, per-step immutable approval, user-visible signature request, idempotency,
submission/confirmation, cancellation boundaries and resumable evidence. A connected Privy
wallet, a valid graph, or a quote review never grants those powers.

See [staging-launch-checklist.md](staging-launch-checklist.md) before attempting live configuration.

## Readiness validation

89 automated tests passed: 67 unchanged baseline + 22 readiness tests (86 beta, 3 SDK).
Beta lint/typecheck/production build and SDK typecheck/build passed. Nova launch, Phase 2A,
Privy auth/wallet and readiness/plan browser fixtures passed; desktop/mobile screenshots
were inspected. Legacy browser suites used the two explicit legacy development flags,
then the normal Privy-default preview was restored. No tests were weakened or rewritten.
Development cold compilation required a Phase 2A rerun; the warmed run passed unchanged.

No SQL, including disposable tests, was applied during readiness. Hosted migration/RLS,
real Privy provisioning/email, live quotes and physical mobile auth remain staging gates.
Existing optional Farcaster peer warnings in webpack dev and moderate upstream Privy
connector advisories remain unchanged; production compilation succeeds.
