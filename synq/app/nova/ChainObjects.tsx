"use client";
import type { ChainBlock, LiveQuote, ResolvedSwapParams } from "@/lib/nova-launch/solana";

function Identifier({ value, kind = "address" }: { value: string; kind?: "address" | "tx" }) {
  return (
    <a
      className="nova-address nova-chain-address"
      href={`https://explorer.solana.com/${kind}/${encodeURIComponent(value)}`}
      target="_blank"
      rel="noreferrer"
    >
      {value}
    </a>
  );
}
export function ChainObject({ block }: { block: ChainBlock }) {
  return (
    <section className="nova-plan glass-elevated nova-chain-object">
      <div className="nova-kicker">Solana mainnet · observed data</div>
      {block.type === "portfolio" && (
        <>
          <h3>Wallet portfolio</h3>
          <Identifier value={block.data.address} />
          <p className="nova-plan-amount">
            {block.data.sol} <span>SOL</span>
          </p>
          <p className="nova-muted">
            Observed {new Date(block.data.observedAt).toLocaleString()} · Slot {block.data.slot}
          </p>
          <dl>
            {block.data.tokens.map((token) => (
              <div key={token.mint}>
                <dt>
                  {token.symbol || "Unknown token"}
                  <Identifier value={token.mint} />
                </dt>
                <dd>{token.amount}</dd>
              </div>
            ))}
          </dl>
          {!block.data.tokens.length && (
            <p className="nova-muted">No non-zero SPL token balances returned.</p>
          )}
          <p className="nova-muted">
            {block.data.partial
              ? "Partial list: account limits or unsupported token precision. "
              : ""}
            No fiat valuation. Metadata does not establish token safety.
          </p>
        </>
      )}
      {block.type === "token" && (
        <>
          <h3>Token mint</h3>
          <p className="nova-plan-amount">{block.data.symbol || "Unknown token"}</p>
          {block.data.name && <p>{block.data.name}</p>}
          <Identifier value={block.data.mint} />
          <dl>
            <div>
              <dt>Decimals</dt>
              <dd>{block.data.decimals}</dd>
            </div>
            <div>
              <dt>Supply</dt>
              <dd>{block.data.supply}</dd>
            </div>
            <div>
              <dt>Metadata</dt>
              <dd>
                {block.data.metadataSource === "canonical"
                  ? "Canonical mint mapping"
                  : block.data.metadataSource === "on-chain-untrusted"
                    ? "Unverified on-chain text"
                    : "Unavailable"}
              </dd>
            </div>
          </dl>
          <p className="nova-muted">
            Observed {new Date(block.observedAt).toLocaleString()}. A name or symbol is not a safety
            assessment.
          </p>
        </>
      )}
      {block.type === "transaction" && (
        <>
          <h3>Transaction facts</h3>
          <Identifier value={block.data.signature} kind="tx" />
          <dl>
            <div>
              <dt>Status</dt>
              <dd>{block.data.status}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>
                {block.data.time ? new Date(block.data.time).toLocaleString() : "Unavailable"}
              </dd>
            </div>
            <div>
              <dt>Fee</dt>
              <dd>{block.data.feeSol} SOL</dd>
            </div>
          </dl>
          <details>
            <summary>Balance changes and programs</summary>
            <h4>Net SOL changes</h4>
            <dl>
              {block.data.solChanges.map((change) => (
                <div key={change.address}>
                  <dt>
                    <Identifier value={change.address} />
                  </dt>
                  <dd>{change.change} SOL</dd>
                </div>
              ))}
            </dl>
            <h4>Net token changes</h4>
            <dl>
              {block.data.tokenChanges.map((change) => (
                <div key={change.account + change.mint}>
                  <dt>
                    <Identifier value={change.mint} />
                  </dt>
                  <dd>{change.change}</dd>
                </div>
              ))}
            </dl>
            <h4>Signers</h4>
            {block.data.signers.map((key) => (
              <Identifier key={key} value={key} />
            ))}
            <h4>Programs</h4>
            {block.data.programs.map((key) => (
              <Identifier key={key} value={key} />
            ))}
            <p className="nova-muted">{block.data.instructions.join(", ")}</p>
          </details>
          <p className="nova-muted">
            {block.data.partial ? "Bounded summary; view the explorer for all accounts. " : ""}
            Balance changes include fees and rent; unknown program behavior is not inferred.
          </p>
        </>
      )}
      {block.type === "activity" && (
        <>
          <h3>Recent activity</h3>
          <Identifier value={block.address} />
          <ol className="nova-activity-list">
            {block.items.map((item) => (
              <li key={item.signature}>
                <Identifier value={item.signature} kind="tx" />
                <span>
                  {item.status} ·{" "}
                  {item.time ? new Date(item.time).toLocaleString() : `Slot ${item.slot}`}
                </span>
              </li>
            ))}
          </ol>
          <p className="nova-muted">
            Latest {block.items.length} returned signatures. Address involvement does not establish
            transaction initiation.
          </p>
        </>
      )}
    </section>
  );
}
export function QuoteFacts({ quote, params }: { quote: LiveQuote; params: ResolvedSwapParams }) {
  return (
    <>
      <dl>
        <div>
          <dt>Expected receive</dt>
          <dd>
            {quote.expectedOutput} {params.outputMint === params.output ? "tokens" : params.output}
          </dd>
        </div>
        <div>
          <dt>Minimum receive</dt>
          <dd>{quote.minimumOutput}</dd>
        </div>
        <div>
          <dt>Price impact</dt>
          <dd>{quote.priceImpactPct === null ? "Unavailable" : `${quote.priceImpactPct}%`}</dd>
        </div>
        <div>
          <dt>Slippage</dt>
          <dd>{quote.slippageBps / 100}%</dd>
        </div>
      </dl>
      {quote.slippageBps > 50 && (
        <p className="nova-quote-warning">Slippage is above the 0.5% default.</p>
      )}
      <details>
        <summary>Tokens, route and quote details</summary>
        <h4>Input mint</h4>
        <Identifier value={params.inputMint} />
        <h4>Output mint</h4>
        <Identifier value={params.outputMint} />
        <p className="nova-muted">
          Source: {quote.source} · {quote.route.join(" → ") || "Route details unavailable"}
        </p>
        <p className="nova-muted">
          Provider fee: {quote.feeBps === null ? "not supplied" : `${quote.feeBps / 100}%`}. Network
          fees and rent are not estimated.
        </p>
        <p className="nova-muted">Quoted {new Date(quote.acquiredAt).toLocaleString()}</p>
        {params.observedAddress ? (
          <>
            <Identifier value={params.observedAddress} />
            <p className="nova-muted">
              Balance checked {new Date(params.observedAt!).toLocaleString()}. Public observation
              only; not proof of ownership.
            </p>
          </>
        ) : (
          <p className="nova-muted">No wallet balance checked.</p>
        )}
        {quote.assumptions.map((text) => (
          <p key={text} className="nova-muted">
            {text}
          </p>
        ))}
      </details>
    </>
  );
}
