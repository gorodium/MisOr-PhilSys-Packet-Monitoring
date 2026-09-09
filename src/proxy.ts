import { NextRequest, NextResponse } from "next/server";

function readBooleanEnv(name: string, fallback = false) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function defaultRole() {
  return process.env.APP_DEFAULT_ROLE ?? (process.env.NODE_ENV === "production" ? "viewer" : "admin");
}

export function proxy(request: NextRequest) {
  const authCookie = request.cookies.get("admin_auth")?.value;
  if (authCookie === "authenticated") {
    return NextResponse.next();
  }

  const trustedAuthHeader = readBooleanEnv("TRUSTED_AUTH_HEADER");
  if (trustedAuthHeader) {
    const roleHeader = process.env.AUTH_ROLE_HEADER ?? "x-philsys-role";
    const role = request.headers.get(roleHeader);
    if (role?.toLowerCase() === "admin") {
      return NextResponse.next();
    }
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/automation/:path*", "/settings/:path*", "/logs/:path*"]
};
