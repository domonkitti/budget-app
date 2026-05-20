import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Auth middleware — currently a passthrough.
//
// To add auth:
//  1. Install a session library (e.g. next-auth, jose)
//  2. Validate the session/JWT in this function
//  3. Redirect to /login if the session is invalid:
//     if (!session) return NextResponse.redirect(new URL("/login", request.url))
export function middleware(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  // Apply to all routes except Next.js internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
