import { DashboardClient } from "@/app/dashboard/dashboard-client";
import { verifySession } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await verifySession();
  const isAdmin = session?.role === "ADMIN";

  return <DashboardClient isAdmin={isAdmin} />;
}

