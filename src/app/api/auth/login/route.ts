import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  // Simple hardcoded password for now, or match from env
  const adminPassword = (process.env.ADMIN_PASSWORD || "admin123").trim();
  const validUsername = "admin";

  console.log(`Login attempt: user='${username}', pass='${password}'`);
  console.log(`Expected: user='${validUsername}', pass='${adminPassword}'`);

  if (username?.trim() === validUsername && password === adminPassword) {
    const response = NextResponse.json({ success: true });
    response.cookies.set("admin_auth", "authenticated", {
      path: "/",
      httpOnly: false,
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 30 // 30 days
    });
    return response;
  }

  return NextResponse.json({ success: false, error: "Invalid username or password" }, { status: 401 });
}
