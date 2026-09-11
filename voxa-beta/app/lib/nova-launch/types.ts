export type AccountAccess = "read" | "propose" | "request_signature" | "execute";
export type ConnectedAccount = {
  chain: "solana";
  address: string;
  kind: "watch" | "wallet" | "trading";
  access: AccountAccess[];
  // Connection is not proof of ownership or authorization to transact.
};
export type ActionType =
  | "swap"
  | "perp_open"
  | "perp_close"
  | "perp_modify"
  | "transfer"
  | "portfolio_read"
  | "position_read"
  | "token_read"
  | "wallet_read"
  | "transaction_read";
export type Action =
  | {
      type: "swap";
      params: { chain: "solana"; input: "SOL" | "USDC"; output: "SOL" | "USDC"; amount: number };
    }
  | {
      type: "perp_open";
      params: {
        venue: "simulation";
        market: "SOL";
        side: "long" | "short";
        collateral: number;
        leverage: number;
        stopLoss?: number;
        takeProfit?: number;
      };
    }
  | { type: "perp_close"; params: { positionId: string } }
  | { type: "perp_modify"; params: { positionId: string; stopLoss?: number; takeProfit?: number } }
  | { type: "transfer"; params: { recipient: string; token: string; amount: number } }
  | { type: "portfolio_read" | "position_read" | "wallet_read"; params: { address: string } }
  | { type: "token_read"; params: { mint: string } }
  | { type: "transaction_read"; params: { signature: string } };
export type Quote = {
  mode: "simulation";
  description: string;
  assumptions: string[];
  expiresAt: string;
};
export type ActionPlan = {
  id: string;
  conversationId: string;
  action: Action;
  quote: Quote;
  hash: string;
  approvalToken: string;
  status: "pending" | "cancelled" | "superseded" | "executed";
};
export type ExecutionResult = {
  mode: "simulation";
  planId: string;
  message: string;
  transactionSignature: null;
};
export type NovaBlock =
  | { type: "text" | "analysis_summary"; text: string }
  | { type: "action_plan" | "approval"; plan: ActionPlan }
  | { type: "quote"; quote: Quote }
  | { type: "execution_result"; result: ExecutionResult }
  | { type: "wallet"; account: ConnectedAccount }
  | {
      type: "token" | "transaction" | "portfolio" | "position";
      label: string;
      address: string;
      verified: false;
    }
  | { type: "error"; text: string; retryable: boolean };
export type Turn = {
  id: string;
  role: "user" | "nova";
  text: string;
  blocks: NovaBlock[];
  created_at?: string;
};
export type Conversation = { id: string; title: string; updated_at: string };
export type Intent = { action: Action } | { clarification: string } | { conversation: true };
export type NovaModelEvent =
  | { type: "text"; delta: string }
  | { type: "proposal"; action: unknown };
export interface NovaModelProvider {
  id: string;
  stream(input: {
    context: Pick<Turn, "role" | "text">[];
    prompt: string;
    signal: AbortSignal;
    actionSchemas: readonly string[];
  }): AsyncIterable<NovaModelEvent>;
}
export interface ActionAdapter {
  id: string;
  supports(action: Action): boolean;
  validate(action: unknown): Action;
  quote(action: Action): Quote;
  simulate(plan: ActionPlan, signal: AbortSignal): Promise<ExecutionResult>;
  execute(
    plan: ActionPlan,
    account: ConnectedAccount,
    signal: AbortSignal,
  ): Promise<ExecutionResult>;
}
