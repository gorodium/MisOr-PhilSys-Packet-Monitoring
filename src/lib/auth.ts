import { NextRequest } from "next/server";
import { fail } from "@/lib/api";
import { getRuntimeConfig } from "@/lib/env";

export type AppRole = "admin" | "viewer";

export type RequestActor = {
  actor: string;
  role: AppRole;
};

function normalizeRole(value: string | null | undefined): AppRole {
  return value?.toLowerCase() === "admin" ? "admin" : "viewer";
}

export function getRequestActor(request: NextRequest): RequestActor {
  const config = getRuntimeConfig();
  const trustedRole = config.trustedAuthHeader ? request.headers.get(config.authRoleHeader) : null;

  return {
    actor: request.headers.get("x-philsys-actor") ?? "internal-user",
    role: normalizeRole(trustedRole ?? config.defaultRole)
  };
}

export function requireAdmin(request: NextRequest) {
  const actor = getRequestActor(request);
  if (actor.role !== "admin") {
    return fail("Admin permission is required for this operation.", 403);
  }

  return null;
}
