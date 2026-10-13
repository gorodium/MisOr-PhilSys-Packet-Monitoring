import { HistoryClient } from "./history-client";
import { verifySession } from "@/lib/auth";

export default async function FilingHistoryPage() {
  const session = await verifySession();
  const isAdmin = session?.role === "ADMIN";
  
  return <HistoryClient isAdmin={isAdmin} />;
}
