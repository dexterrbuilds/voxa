import { NextRequest, NextResponse } from "next/server";
import { launchAccess, storageError, uuid } from "@/lib/server/nova-launch/access";
import { verifyPlan } from "@/lib/server/nova-launch/plans";
import { simulationAdapter } from "@/lib/nova-launch/actions";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const a = await launchAccess(request);
  if (a instanceof NextResponse) return a;
  const body = await request.json().catch(() => null);
  if (
    !body ||
    !uuid.test(body.id) ||
    !uuid.test(body.approvalToken) ||
    typeof body.hash !== "string" ||
    !["approve", "cancel"].includes(body.operation)
  )
    return NextResponse.json({ error: "Invalid approval." }, { status: 400 });
  const { data: record, error } = await a.db
    .from("nova_action_plans")
    .select("plan,status")
    .eq("id", body.id)
    .eq("owner_id", a.user.id)
    .maybeSingle();
  if (error) return storageError();
  if (!record) return NextResponse.json({ error: "Plan unavailable." }, { status: 404 });
  try {
    verifyPlan(record.plan);
    if (body.operation === "approve" && record.status !== "executed")
      await simulationAdapter.simulate(record.plan, request.signal);
    const { data, error: rpcError } = await a.db.rpc("nova_launch_approve", {
      p_owner: a.user.id,
      p_id: body.id,
      p_hash: body.hash,
      p_token: body.approvalToken,
      p_cancel: body.operation === "cancel",
    });
    if (rpcError)
      return NextResponse.json(
        { error: "This approval is expired, changed or no longer available. Request a new plan." },
        { status: 409 },
      );
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "This plan cannot be approved. Request a new simulation." },
      { status: 409 },
    );
  }
}
