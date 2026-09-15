import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi();
  if (adminError) return adminError;

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        forcePasswordChange: true,
        createdAt: true,
        _count: {
          select: { filingRequests: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    
    // Get pending password reset requests
    const resets = await prisma.passwordResetRequest.findMany({
      where: { status: "PENDING" },
      include: {
        user: {
          select: { username: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json({ success: true, users, resets });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const adminError = await requireAdminApi();
  if (adminError) return adminError;

  try {
    const { username, role } = await request.json();

    if (!username || username.trim().length < 3) {
      return NextResponse.json({ success: false, error: "Username must be at least 3 characters" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json({ success: false, error: "Username already exists" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash("changeme", 10);

    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        passwordHash,
        role: role === "ADMIN" ? "ADMIN" : "EMPLOYEE",
        forcePasswordChange: true
      }
    });

    return NextResponse.json({ success: true, user: { id: user.id, username: user.username } });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to create user" }, { status: 500 });
  }
}
