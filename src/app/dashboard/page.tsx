import { DashboardClient } from "@/app/dashboard/dashboard-client";
import { cookies } from "next/headers";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const isAdmin = cookieStore.get("admin_auth")?.value === "authenticated";

  return <DashboardClient isAdmin={isAdmin} />;
}

