import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // We start with the incoming response and may modify it
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Create a Supabase client that can read/write cookies
  // in this middleware context
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: Always call getUser() in middleware.
  // This refreshes the session if it has expired.
  // Never use getSession() in middleware — it does not validate the JWT.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // ── Auth pages (login, register) ──────────────────────────
  // If the user is already logged in, redirect them away
  // from the login/register pages to their dashboard
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (isAuthPage && user) {
    const role = user.user_metadata?.role as string | undefined;
    const destination =
      role === "recruiter" ? "/recruiter/dashboard" : "/candidate/dashboard";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  // ── Protected pages ────────────────────────────────────────
  // If the user is NOT logged in and tries to access a
  // protected route, send them to login
  const isProtected =
    pathname.startsWith("/recruiter") || pathname.startsWith("/candidate");

  if (isProtected && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // ── Role-based access ──────────────────────────────────────
  // Prevent candidates from accessing recruiter pages and vice versa
  if (isProtected && user) {
    const role = user.user_metadata?.role as string | undefined;

    if (pathname.startsWith("/recruiter") && role !== "recruiter") {
      return NextResponse.redirect(
        new URL("/candidate/dashboard", request.url),
      );
    }

    if (pathname.startsWith("/candidate") && role !== "candidate") {
      return NextResponse.redirect(
        new URL("/recruiter/dashboard", request.url),
      );
    }
  }

  // Allow the request through unchanged
  return supabaseResponse;
}

// Tell Next.js which routes this middleware should run on.
// The negative lookaheads exclude static files and Next.js internals.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
