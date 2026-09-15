import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  const adminError = await requireAdminApi();
  if (adminError) return adminError;

  try {
    const { requestId, userId } = await request.json();

    if (!requestId || !userId) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash("changeme", 10);

    // Run in transaction: resolve request and update user password
    await prisma.$transaction([
      prisma.passwordResetRequest.update({
        where: { id: requestId },
        data: { status: "RESOLVED" }
      }),
      prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          forcePasswordChange: true
        }
      })
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to reset password" }, { status: 500 });
  }
}
