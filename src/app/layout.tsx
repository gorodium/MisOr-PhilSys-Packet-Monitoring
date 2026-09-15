import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { verifySession } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "MisOr PhilSys Packet Monitoring System",
  description: "Misamis Oriental PhilSys packet monitoring and Matrix ticket automation"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await verifySession();
  const isAdmin = session?.role === "ADMIN";

  return (
    <html lang="en">
      <body>
        <AppShell isAdmin={isAdmin}>{children}</AppShell>
      </body>
    </html>
  );
}
