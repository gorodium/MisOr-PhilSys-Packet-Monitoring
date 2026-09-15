import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();

    if (!username) {
      return NextResponse.json({ success: false, error: "Username is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { username }
    });

    if (!user) {
      // Don't leak whether user exists or not
      return NextResponse.json({ success: true, message: "If the username exists, a reset request has been sent to the administrator." });
    }

    // Check if there's already a pending request
    const existingReq = await prisma.passwordResetRequest.findFirst({
      where: { userId: user.id, status: "PENDING" }
    });

    if (!existingReq) {
      await prisma.passwordResetRequest.create({
        data: {
          userId: user.id,
          status: "PENDING"
        }
      });
    }

    return NextResponse.json({ success: true, message: "If the username exists, a reset request has been sent to the administrator." });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
