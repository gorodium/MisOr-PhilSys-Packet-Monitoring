import { prisma } from "@/lib/prisma";

export type ActivityType =
  | "FILING_REQUEST"
  | "TICKET_FILED"
  | "RESTORATION"
  | "UNRECOVERABLE"
  | "MATRIX_REPLY"
  | "REFILE"
  | "MANUAL_UPLOAD";

export async function writeActivity(input: {
  type: ActivityType;
  actor: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.activityLog.create({
      data: {
        type: input.type,
        actor: input.actor,
        message: input.message,
        metadata: (input.metadata ?? {}) as any,
      },
    });
  } catch (error) {
    console.error("Failed to write activity log:", error);
  }
}
