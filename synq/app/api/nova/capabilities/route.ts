import { NextRequest, NextResponse } from "next/server";
import { launchAccess } from "@/lib/server/nova-launch/access";
import { solanaEnabled } from "@/lib/server/nova-launch/chain/service";
export async function GET(request: NextRequest) {
  const a = await launchAccess(request);
  if (a instanceof NextResponse) return a;
  return NextResponse.json(
    { solanaReads: solanaEnabled(), quoteOnly: solanaEnabled(), execution: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
