import { cookies } from "next/headers";
import { HistoryClient } from "./history-client";

export default async function FilingHistoryPage() {
  const cookieStore = await cookies();
  const isAdmin = cookieStore.get("admin_auth")?.value === "authenticated";
  
  return <HistoryClient isAdmin={isAdmin} />;
}
