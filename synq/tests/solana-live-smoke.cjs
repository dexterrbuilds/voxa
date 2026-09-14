// Optional real mainnet read/quote check. No transaction-building/signing APIs.
require("@next/env").loadEnvConfig(process.cwd());
require("./register.cjs");
const { getSolanaProvider } = require("../app/lib/server/nova-launch/chain/solana.ts");
const { getSwapAdapter } = require("../app/lib/server/nova-launch/chain/quotes.ts");
const { USDC_MINT, SOL_MINT } = require("../app/lib/nova-launch/solana.ts");
(async () => {
  const data = getSolanaProvider(),
    signal = AbortSignal.timeout(60000);
  let signatures = [];
  const checks = [
    [
      "SOL balance (public program account)",
      () => data.balance("11111111111111111111111111111111", signal),
    ],
    ["Portfolio (public mint address, not a user wallet)", () => data.portfolio(USDC_MINT, signal)],
    ["USDC mint", () => data.token(USDC_MINT, signal)],
    [
      "Recent activity",
      async () => {
        signatures = await data.recent(USDC_MINT, signal);
        return signatures;
      },
    ],
    [
      "Transaction",
      () =>
        signatures.length
          ? data.transaction(signatures[0].signature, signal)
          : Promise.reject(new Error("No recent signature available")),
    ],
  ];
  if (process.argv.includes("--quote-only")) checks.length = 0;
  if (process.env.JUPITER_API_KEY || process.env.NODE_ENV !== "production")
    checks.push([
      "Jupiter V2 quote only",
      () =>
        getSwapAdapter().quote(
          {
            type: "swap",
            params: {
              chain: "solana",
              input: "SOL",
              output: "USDC",
              inputMint: SOL_MINT,
              outputMint: USDC_MINT,
              inputDecimals: 9,
              outputDecimals: 6,
              amount: "1",
              slippageBps: 50,
            },
          },
          signal,
        ),
    ]);
  else console.log("Jupiter live quote SKIPPED: production JUPITER_API_KEY unavailable.");
  for (const [operation, run] of checks) {
    const start = performance.now();
    try {
      await run();
      console.log(
        JSON.stringify({
          operation,
          result: "live_success",
          elapsedMs: Math.round(performance.now() - start),
        }),
      );
    } catch (e) {
      process.exitCode = 1;
      console.log(
        JSON.stringify({
          operation,
          result: "live_unavailable",
          code: e.code || "unavailable",
          elapsedMs: Math.round(performance.now() - start),
        }),
      );
    }
  }
})();
