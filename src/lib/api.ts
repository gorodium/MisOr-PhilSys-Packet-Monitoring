import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return fail("Validation failed.", 422, error.flatten());
  }

  if (error instanceof Error) {
    return fail(error.message, 500);
  }

  return fail("Unexpected server error.", 500);
}
