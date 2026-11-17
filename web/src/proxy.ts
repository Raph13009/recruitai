import { NextResponse, type NextRequest } from "next/server";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session-token";

/**
 * Optimistic check only: visitors with no (or an expired) session cookie are sent to the sign-in
 * page before the recruiter space renders. The signature and the account are verified next to the
 * data, in lib/auth/dal.ts, on every page, Server Action and Route Handler.
 */
export function proxy(request: NextRequest) {
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/recruiter/:path*"],
};
