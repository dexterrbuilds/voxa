import { NextRequest, NextResponse } from "next/server";
import { isDormantRoute, platformEnabled } from "./app/lib/product-features";

export function proxy(request: NextRequest) {
  if (
    !platformEnabled &&
    (request.nextUrl.pathname === "/" || isDormantRoute(request.nextUrl.pathname))
  ) {
    return NextResponse.redirect(new URL("/nova", request.url));
  }
  return NextResponse.next();
}
export const config = {
  matcher: ["/", "/room/:path*", "/rooms/:path*", "/agents/:path*", "/developers/:path*"],
};
