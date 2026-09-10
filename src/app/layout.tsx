import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "MisOr PhilSys Packet Monitoring System",
  description: "Misamis Oriental PhilSys packet monitoring and Matrix ticket automation"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const isAdmin = cookieStore.get("admin_auth")?.value === "authenticated";

  return (
    <html lang="en">
      <body>
        <AppShell isAdmin={isAdmin}>{children}</AppShell>
      </body>
    </html>
  );
}
