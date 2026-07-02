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
  const trustedAuthHeader = readBooleanEnv("TRUSTED_AUTH_HEADER");
  const roleHeader = process.env.AUTH_ROLE_HEADER ?? "x-philsys-role";
  const role = trustedAuthHeader ? request.headers.get(roleHeader) ?? defaultRole() : defaultRole();

  if (role.toLowerCase() !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/automation/:path*", "/settings/:path*", "/logs/:path*"]
};

