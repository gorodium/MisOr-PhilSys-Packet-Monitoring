import { RunStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function writeAuditLog(input: {
  action: string;
  status: RunStatus;
  message: string;
  actor?: any;
  metadata?: unknown;
}) {
  try {
    const actorStr = typeof input.actor === "string" ? input.actor : input.actor?.actor;
    const roleStr = typeof input.actor === "string" ? undefined : input.actor?.role;
    
    await prisma.auditLog.create({
      data: {
        action: input.action,
        actor: actorStr,
        role: roleStr,
        status: input.status,
        message: input.message,
        metadata: input.metadata === undefined ? undefined : JSON.parse(JSON.stringify(input.metadata))
      }
    });
  } catch (error) {
    console.error("Failed to write audit log", error);
  }
}
