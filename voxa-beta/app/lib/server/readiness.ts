import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SetupError, missingSchema } from "@/lib/setup-errors";

export function setupResponse(error: SetupError) {
  return NextResponse.json(
    { error: error.message, code: error.code },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
// Read-only probe. Never applies migrations, retries, or makes provider/quote calls.
export async function novaSchemaStatus(db: SupabaseClient) {
  try {
    const { data, error } = await db
      .rpc("nova_launch_readiness")
      .abortSignal(AbortSignal.timeout(8000));
    if (missingSchema(error) || (!error && (data?.version !== 2 || !data?.ready)))
      return setupResponse(new SetupError("database_migration_required"));
    if (error) return setupResponse(new SetupError("database_configuration"));
    return null;
  } catch {
    return setupResponse(new SetupError("database_configuration"));
  }
}
