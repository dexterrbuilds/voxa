import { randomUUID } from "node:crypto";
import {
  solanaAddress,
  solanaSignature,
  displayAmount,
  SOL_MINT,
  USDC_MINT,
  type Portfolio,
  type TokenInfo,
  type Activity,
  type TransactionFacts,
  type Holding,
} from "@/lib/nova-launch/solana";
import { ChainError, readJson, object, integer, units, safeLabel } from "./transport";

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const METHODS = [
  "getBalance",
  "getTokenAccountsByOwner",
  "getAccountInfo",
  "getTransaction",
  "getSignaturesForAddress",
] as const;
export interface SolanaDataProvider {
  balance(address: string, signal: AbortSignal): Promise<{ lamports: string; slot: number }>;
  portfolio(address: string, signal: AbortSignal): Promise<Portfolio>;
  token(mint: string, signal: AbortSignal): Promise<TokenInfo>;
  recent(address: string, signal: AbortSignal): Promise<Activity[]>;
  transaction(signature: string, signal: AbortSignal): Promise<TransactionFacts>;
}
function time(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 100000000000
    ? new Date(value * 1000).toISOString()
    : null;
}
function canonical(mint: string) {
  return mint === SOL_MINT
    ? { symbol: "SOL", name: "Solana", decimals: 9 }
    : mint === USDC_MINT
      ? { symbol: "USDC", name: "USD Coin", decimals: 6 }
      : null;
}
export class RpcSolanaProvider implements SolanaDataProvider {
  private cache = new Map<string, { until: number; value: unknown }>();
  constructor(
    private endpoint: string,
    private fetcher: typeof fetch = fetch,
    private timeoutMs = 8000,
  ) {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.hash)
      throw new Error("SOLANA_RPC_URL must be a server-configured HTTPS endpoint.");
  }
  private async rpc(method: (typeof METHODS)[number], params: unknown[], signal: AbortSignal) {
    if (!METHODS.includes(method))
      throw new ChainError("read_only", "Only read-only Solana requests are permitted.");
    const id = randomUUID();
    const response = object(
      await readJson(
        this.endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        },
        signal,
        "solana",
        method,
        this.fetcher,
        this.timeoutMs,
      ),
    );
    if (response.error || response.id !== id)
      throw new ChainError("rpc_error", "Solana data is temporarily unavailable.");
    return response.result;
  }
  private async cached<T>(
    key: string,
    ttl: number,
    signal: AbortSignal,
    read: () => Promise<T>,
  ): Promise<T> {
    signal.throwIfAborted();
    const saved = this.cache.get(key);
    if (saved && saved.until > Date.now()) return structuredClone(saved.value) as T;
    const value = await read();
    signal.throwIfAborted();
    if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { until: Date.now() + ttl, value: structuredClone(value) });
    return value;
  }
  async balance(address: string, signal: AbortSignal) {
    solanaAddress(address);
    const data = object(
      await this.rpc("getBalance", [address, { commitment: "confirmed" }], signal),
    );
    return { lamports: String(integer(data.value)), slot: integer(object(data.context).slot) };
  }
  async portfolio(address: string, signal: AbortSignal): Promise<Portfolio> {
    solanaAddress(address);
    return this.cached(`portfolio:${address}`, 5000, signal, async () => {
      const [balance, ...accounts] = await Promise.all([
        this.balance(address, signal),
        ...[TOKEN_PROGRAM, TOKEN_2022].map((programId) =>
          this.rpc(
            "getTokenAccountsByOwner",
            [address, { programId }, { encoding: "jsonParsed", commitment: "confirmed" }],
            signal,
          ),
        ),
      ]);
      const native = balance as { lamports: string; slot: number };
      const grouped = new Map<string, Holding>();
      let count = 0;
      let omitted = false;
      for (const response of accounts) {
        const value = object(response).value;
        if (!Array.isArray(value))
          throw new ChainError("bad_response", "Token balances are unavailable.");
        for (const row of value) {
          count++;
          if (count > 200) continue;
          const info = object(object(object(object(row).account).data).parsed).info;
          const parsed = object(info),
            amount = object(parsed.tokenAmount),
            mint = solanaAddress(parsed.mint);
          if (parsed.owner !== address)
            throw new ChainError("bad_response", "Token account owner mismatch.");
          const decimals = integer(amount.decimals);
          if (decimals > 18) {
            omitted = true;
            continue;
          }
          const raw = units(amount.amount),
            known = canonical(mint);
          if (known && decimals !== known.decimals)
            throw new ChainError("bad_response", "Token decimal mismatch.");
          const existing = grouped.get(mint);
          if (existing && decimals !== existing.decimals)
            throw new ChainError("bad_response", "Token decimal mismatch.");
          const total = BigInt(raw) + BigInt(existing?.atomic || "0");
          if (total > 0n)
            grouped.set(mint, {
              mint,
              atomic: total.toString(),
              amount: displayAmount(total, decimals),
              decimals,
              symbol: known?.symbol || null,
              name: known?.name || null,
            });
        }
      }
      return {
        address,
        sol: displayAmount(native.lamports, 9),
        ...native,
        tokens: [...grouped.values()],
        observedAt: new Date().toISOString(),
        tokenAccounts: count,
        partial: count > 200 || omitted,
      };
    });
  }
  async token(mint: string, signal: AbortSignal): Promise<TokenInfo> {
    solanaAddress(mint);
    return this.cached(`token:${mint}`, 60000, signal, async () => {
      const account = object(
        object(
          await this.rpc(
            "getAccountInfo",
            [mint, { encoding: "jsonParsed", commitment: "confirmed" }],
            signal,
          ),
        ).value,
      );
      if (![TOKEN_PROGRAM, TOKEN_2022].includes(String(account.owner)))
        throw new ChainError("not_token", "That address is not a supported Solana token mint.");
      const parsed = object(object(account.data).parsed),
        info = object(parsed.info);
      if (parsed.type !== "mint")
        throw new ChainError("not_token", "That address is a token account, not a mint.");
      const decimals = integer(info.decimals);
      if (decimals > 18)
        throw new ChainError("precision", "This token's precision is not supported yet.");
      const known = canonical(mint);
      if (known && known.decimals !== decimals)
        throw new ChainError("bad_response", "Canonical token decimal mismatch.");
      const extension = Array.isArray(info.extensions)
        ? info.extensions.find((e) => object(e).extension === "tokenMetadata")
        : null;
      const metadata = extension ? object(object(extension).state) : {};
      return {
        mint,
        decimals,
        supply: displayAmount(units(info.supply), decimals),
        program: String(account.owner),
        symbol: known?.symbol || safeLabel(metadata.symbol, 16),
        name: known?.name || safeLabel(metadata.name),
        metadataSource: known ? "canonical" : extension ? "on-chain-untrusted" : "unavailable",
      };
    });
  }
  async recent(address: string, signal: AbortSignal): Promise<Activity[]> {
    solanaAddress(address);
    return this.cached(`recent:${address}`, 5000, signal, async () => {
      const rows = await this.rpc(
        "getSignaturesForAddress",
        [address, { limit: 10, commitment: "confirmed" }],
        signal,
      );
      if (!Array.isArray(rows))
        throw new ChainError("bad_response", "Recent activity is unavailable.");
      return rows.slice(0, 10).map((row) => {
        const r = object(row);
        return {
          signature: solanaSignature(r.signature),
          slot: integer(r.slot),
          time: time(r.blockTime),
          status: r.err ? "failed" : r.err === null ? "success" : "unknown",
        };
      });
    });
  }
  async transaction(signature: string, signal: AbortSignal): Promise<TransactionFacts> {
    solanaSignature(signature);
    return this.cached(`transaction:${signature}`, 30000, signal, async () => {
      const data = await this.rpc(
        "getTransaction",
        [
          signature,
          { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
        ],
        signal,
      );
      if (!data)
        throw new ChainError(
          "not_found",
          "This transaction is not available from the provider yet. Check the signature or try again.",
        );
      return normalizeTransaction(signature, data);
    });
  }
}
export function normalizeTransaction(signature: string, input: unknown): TransactionFacts {
  solanaSignature(signature);
  const data = object(input),
    tx = object(data.transaction),
    msg = object(tx.message),
    meta = object(data.meta);
  const keys = (Array.isArray(msg.accountKeys) ? msg.accountKeys : []).map((k) => object(k));
  const addresses = keys.map((k) => solanaAddress(k.pubkey));
  if (
    !Array.isArray(meta.preBalances) ||
    !Array.isArray(meta.postBalances) ||
    meta.preBalances.length !== addresses.length ||
    meta.postBalances.length !== addresses.length
  )
    throw new ChainError("bad_response", "Transaction balances are incomplete.");
  const post = meta.postBalances;
  const solChanges = meta.preBalances.flatMap((v, i) => {
    const delta = BigInt(integer(post[i])) - BigInt(integer(v));
    return delta === 0n ? [] : [{ address: addresses[i], change: displayAmount(delta, 9) }];
  });
  const tokens = new Map<
    string,
    { mint: string; owner: string | null; account: string; raw: bigint; decimals: number }
  >();
  for (const [rows, sign] of [
    [meta.preTokenBalances, -1n],
    [meta.postTokenBalances, 1n],
  ] as const) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const r = object(row),
        mint = solanaAddress(r.mint),
        index = integer(r.accountIndex),
        amount = object(r.uiTokenAmount);
      const decimals = integer(amount.decimals);
      if (decimals > 18 || !addresses[index]) continue;
      const key = `${index}:${mint}`,
        previous = tokens.get(key);
      if (previous && previous.decimals !== decimals)
        throw new ChainError("bad_response", "Transaction token decimals disagree.");
      tokens.set(key, {
        mint,
        owner: typeof r.owner === "string" ? solanaAddress(r.owner) : null,
        account: addresses[index],
        raw: (previous?.raw || 0n) + sign * BigInt(units(amount.amount)),
        decimals,
      });
    }
  }
  const outer = Array.isArray(msg.instructions) ? msg.instructions : [];
  const inner = Array.isArray(meta.innerInstructions)
    ? meta.innerInstructions.flatMap((g) =>
        Array.isArray(object(g).instructions) ? (object(g).instructions as unknown[]) : [],
      )
    : [];
  const programs = new Set<string>(),
    instructions = new Set<string>();
  for (const raw of [...outer, ...inner].slice(0, 100)) {
    const instruction = object(raw),
      program = solanaAddress(instruction.programId);
    programs.add(program);
    const parsed =
      instruction.parsed && typeof instruction.parsed === "object"
        ? object(instruction.parsed)
        : {};
    const type = String(parsed.type);
    if (
      [TOKEN_PROGRAM, TOKEN_2022, "11111111111111111111111111111111"].includes(program) &&
      [
        "transfer",
        "transferChecked",
        "createAccount",
        "closeAccount",
        "mintTo",
        "burn",
        "approve",
        "revoke",
      ].includes(type)
    )
      instructions.add(type);
    else instructions.add("Unidentified instruction (program address shown)");
  }
  return {
    signature,
    slot: integer(data.slot),
    time: time(data.blockTime),
    status: meta.err ? "failed" : meta.err === null ? "success" : "unknown",
    feeSol: displayAmount(integer(meta.fee).toString(), 9),
    signers: keys
      .filter((k) => k.signer === true)
      .map((k) => String(k.pubkey))
      .slice(0, 16),
    programs: [...programs].slice(0, 16),
    instructions: [...instructions],
    solChanges: solChanges.slice(0, 24),
    tokenChanges: [...tokens.values()]
      .filter((t) => t.raw !== 0n)
      .slice(0, 24)
      .map((t) => ({
        mint: t.mint,
        owner: t.owner,
        account: t.account,
        change: displayAmount(t.raw, t.decimals),
      })),
    partial:
      keys.filter((key) => key.signer === true).length > 16 ||
      solChanges.length > 24 ||
      tokens.size > 24 ||
      programs.size > 16 ||
      outer.length + inner.length > 100,
  };
}
let provider: RpcSolanaProvider | undefined;
let endpoint: string | undefined;
export function getSolanaProvider(): SolanaDataProvider {
  const url =
    process.env.SOLANA_RPC_URL ||
    (process.env.NODE_ENV !== "production" ? "https://api.mainnet-beta.solana.com" : "");
  if (!url) throw new ChainError("not_configured", "Solana data is not configured yet.");
  if (!provider || endpoint !== url) {
    provider = new RpcSolanaProvider(url);
    endpoint = url;
  }
  return provider;
}
