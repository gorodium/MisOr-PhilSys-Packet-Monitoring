import { NextRequest } from "next/server";
import { fail } from "@/lib/api";
import { getRuntimeConfig } from "@/lib/env";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function assertRateLimit(request: NextRequest, action: string) {
  const config = getRuntimeConfig();
  const now = Date.now();
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "local";
  const key = `${ip}:${action}`;
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + config.rateLimitWindowSeconds * 1000
    });
    return null;
  }

  existing.count += 1;
  if (existing.count > config.rateLimitMax) {
    return fail("Rate limit exceeded. Try again after the current window resets.", 429);
  }

  return null;
}
