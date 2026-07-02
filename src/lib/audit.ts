import { RunStatus } from "@prisma/client";
import { RequestActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function writeAuditLog(input: {
  action: string;
  status: RunStatus;
  message: string;
  actor?: RequestActor;
  metadata?: unknown;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        actor: input.actor?.actor,
        role: input.actor?.role,
        status: input.status,
        message: input.message,
        metadata: input.metadata === undefined ? undefined : JSON.parse(JSON.stringify(input.metadata))
      }
    });
  } catch (error) {
    console.error("Failed to write audit log", error);
  }
}
