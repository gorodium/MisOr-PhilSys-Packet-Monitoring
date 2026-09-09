"use client";

import { Activity, Bot, FileClock, LayoutDashboard, Settings, FilePlus, Menu, X, LogOut, LogIn } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState, useEffect } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/filing", label: "Matrix Filing", icon: FilePlus },
  { href: "/dashboard/requests", label: "Requests", icon: FileClock },
  { href: "/automation", label: "Automation", icon: Bot, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
  { href: "/logs", label: "Logs", icon: FileClock, adminOnly: true }
];

export function AppShell({ children, isAdmin }: { children: ReactNode, isAdmin?: boolean }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  }

  const visibleNavItems = navItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <div className="app-shell">
      {/* Mobile Top Bar */}
      <div className="mobile-topbar" style={{ display: "none", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", background: "#101820", color: "white", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="brand-mark">
            <Activity size={18} />
          </div>
          <span style={{ fontWeight: 600, fontSize: "14px" }}>PhilSys Matrix</span>
        </div>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
          style={{ background: "transparent", border: "none", color: "white", padding: "4px", cursor: "pointer" }}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Backdrop */}
      {mobileMenuOpen && (
        <div 
          className="sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 45 }}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <Link href="/dashboard" className="brand" style={{ padding: "12px 12px 24px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", marginBottom: "16px" }}>
          <span className="brand-mark">
            <Activity size={18} />
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <strong style={{ fontSize: "14px", fontWeight: 600, letterSpacing: "0.01em" }}>PhilSys Packet Matrix</strong>
            <small style={{ fontSize: "12px", color: "#94a3b8" }}>Monitoring System</small>
          </span>
        </Link>
        <nav className="nav-list" aria-label="Main navigation" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${active ? "nav-link-active" : ""}`}
                aria-current={active ? "page" : undefined}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  color: active ? "#ffffff" : "#cbd5e1",
                  background: active ? "rgba(255,255,255,0.1)" : "transparent",
                  fontWeight: active ? 600 : 400,
                  transition: "all 0.2s"
                }}
              >
                {active && (
                  <div style={{ position: "absolute", left: 0, top: "8px", bottom: "8px", width: "4px", background: "var(--accent)", borderRadius: "0 4px 4px 0" }} />
                )}
                <Icon size={18} strokeWidth={active ? 2.5 : 2} style={{ color: active ? "var(--accent)" : "inherit" }} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        
        <div style={{ marginTop: "auto", paddingTop: "24px", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
          {isAdmin ? (
            <button
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.reload();
              }}
              style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "10px 14px", background: "transparent", border: "none", color: "#94a3b8", borderRadius: "8px", cursor: "pointer", fontSize: "14px", transition: "color 0.2s" }}
              onMouseOver={(e) => e.currentTarget.style.color = "#ffffff"}
              onMouseOut={(e) => e.currentTarget.style.color = "#94a3b8"}
            >
              <LogOut size={18} />
              Log out
            </button>
          ) : (
            <Link
              href="/login"
              style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#ffffff", borderRadius: "8px", textDecoration: "none", fontSize: "14px", fontWeight: 500 }}
            >
              <LogIn size={18} />
              Log in
            </Link>
          )}
        </div>
      </aside>
      <main className="main-panel">{children}</main>

      <style dangerouslySetInnerHTML={{__html: `
        @media (max-width: 1100px) {
          .app-shell { display: flex; flex-direction: column; }
          .mobile-topbar { display: flex !important; }
          .sidebar {
            position: fixed !important;
            top: 0;
            left: 0;
            bottom: 0;
            width: 280px;
            z-index: 50;
            transform: translateX(-100%);
            transition: transform 0.3s ease;
            display: flex;
            flex-direction: column;
          }
          .sidebar-open { transform: translateX(0); }
          .nav-list { grid-template-columns: 1fr !important; }
        }
      `}} />
    </div>
  );
}
