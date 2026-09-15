import { NextRequest, NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { fail } from "@/lib/api";

const secretKey = process.env.JWT_SECRET || "default_secret_key_change_me_in_production";
const key = new TextEncoder().encode(secretKey);

export type AppRole = "ADMIN" | "EMPLOYEE";

export type SessionPayload = {
  userId: string;
  username: string;
  role: AppRole;
  forcePasswordChange: boolean;
};

export async function createSession(payload: SessionPayload) {
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 1 week
  const session = await new SignJWT(payload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);

  const cookieStore = await cookies();
  cookieStore.set("session", session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires,
    sameSite: "lax",
    path: "/",
  });
}

export async function verifySession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  
  if (!session) return null;
  
  try {
    const { payload } = await jwtVerify(session, key, {
      algorithms: ["HS256"],
    });
    return payload as SessionPayload;
  } catch (error) {
    return null;
  }
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}

export async function requireAdminApi() {
  const session = await verifySession();
  if (!session) return fail("Unauthorized", 401);
  if (session.role !== "ADMIN") return fail("Forbidden", 403);
  return null;
}

export async function requireAuthApi() {
  const session = await verifySession();
  if (!session) return fail("Unauthorized", 401);
  return session;
}
