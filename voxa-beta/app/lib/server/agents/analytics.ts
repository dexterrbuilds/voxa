import type { SupabaseClient } from "@supabase/supabase-js";

export type AgentAnalyticsMetric =
  | "sandbox_sessions_started"
  | "sandbox_messages_sent"
  | "room_invites"
  | "room_messages_sent";

export type AgentAnalyticsRecord = {
  agent_id: string;
  owner_user_id: string;
  sandbox_sessions_started: number;
  sandbox_messages_sent: number;
  room_invites: number;
  room_messages_sent: number;
  last_active_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type AgentAnalyticsSummary = {
  sandboxSessionsStarted: number;
  sandboxMessagesSent: number;
  roomInvites: number;
  roomMessagesSent: number;
  lastActiveAt: string | null;
};

export const emptyAgentAnalytics: AgentAnalyticsSummary = {
  sandboxSessionsStarted: 0,
  sandboxMessagesSent: 0,
  roomInvites: 0,
  roomMessagesSent: 0,
  lastActiveAt: null,
};

function mapAnalytics(record?: AgentAnalyticsRecord | null): AgentAnalyticsSummary {
  if (!record) {
    return { ...emptyAgentAnalytics };
  }

  return {
    sandboxSessionsStarted: Number(record.sandbox_sessions_started ?? 0),
    sandboxMessagesSent: Number(record.sandbox_messages_sent ?? 0),
    roomInvites: Number(record.room_invites ?? 0),
    roomMessagesSent: Number(record.room_messages_sent ?? 0),
    lastActiveAt: record.last_active_at ?? null,
  };
}

function isAnalyticsUnavailable(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code = (error as { code?: string }).code;
  const message = (error as { message?: string }).message ?? "";
  return (
    code === "PGRST205" ||
    code === "PGRST204" ||
    code === "42883" ||
    code === "42703" ||
    /agent_analytics|increment_agent_analytics/i.test(message)
  );
}

export async function loadAgentAnalyticsMap(
  supabase: SupabaseClient,
  ownerUserId: string,
  agentIds: string[],
): Promise<Map<string, AgentAnalyticsSummary>> {
  const analytics = new Map<string, AgentAnalyticsSummary>();
  const uniqueAgentIds = [...new Set(agentIds.filter(Boolean))];

  for (const agentId of uniqueAgentIds) {
    analytics.set(agentId, { ...emptyAgentAnalytics });
  }

  if (uniqueAgentIds.length === 0) {
    return analytics;
  }

  const { data, error } = await supabase
    .from("agent_analytics")
    .select(
      "agent_id, owner_user_id, sandbox_sessions_started, sandbox_messages_sent, room_invites, room_messages_sent, last_active_at",
    )
    .eq("owner_user_id", ownerUserId)
    .in("agent_id", uniqueAgentIds)
    .returns<AgentAnalyticsRecord[]>();

  if (error) {
    if (!isAnalyticsUnavailable(error)) {
      console.warn("Could not load agent analytics.", error.message);
    }
    return analytics;
  }

  for (const record of data ?? []) {
    analytics.set(record.agent_id, mapAnalytics(record));
  }

  return analytics;
}

export async function loadAgentAnalytics(
  supabase: SupabaseClient,
  ownerUserId: string,
  agentId: string,
): Promise<AgentAnalyticsSummary> {
  const analytics = await loadAgentAnalyticsMap(supabase, ownerUserId, [agentId]);
  return analytics.get(agentId) ?? { ...emptyAgentAnalytics };
}

export async function recordAgentAnalytics(
  supabase: SupabaseClient,
  params: {
    agentId: string;
    metric: AgentAnalyticsMetric;
    ownerUserId: string;
    amount?: number;
  },
) {
  const { error } = await supabase.rpc("increment_agent_analytics", {
    p_agent_id: params.agentId,
    p_owner_user_id: params.ownerUserId,
    p_metric: params.metric,
    p_amount: params.amount ?? 1,
  });

  if (error && !isAnalyticsUnavailable(error)) {
    console.warn(`Could not record ${params.metric} for agent ${params.agentId}.`, error.message);
  }
}

export async function recordAgentAnalyticsBatch(
  supabase: SupabaseClient,
  params: {
    agentIds: string[];
    metric: AgentAnalyticsMetric;
    ownerUserId: string;
    amount?: number;
  },
) {
  const uniqueAgentIds = [...new Set(params.agentIds.filter(Boolean))];
  await Promise.all(
    uniqueAgentIds.map((agentId) =>
      recordAgentAnalytics(supabase, {
        agentId,
        metric: params.metric,
        ownerUserId: params.ownerUserId,
        amount: params.amount,
      }),
    ),
  );
}
