import { NextRequest, NextResponse } from "next/server";
import { launchAccess } from "@/lib/server/nova-launch/access";
import { getCapabilityRegistry } from "@/lib/server/nova-launch/capabilities";
export async function GET(request: NextRequest) {
  const a = await launchAccess(request);
  if (a instanceof NextResponse) return a;
  return NextResponse.json(
    { capabilities: getCapabilityRegistry().list(), planningOnly: true, execution: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
