import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { motion } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { AuthUser } from "@/types";

type AppShellProps = {
  user: AuthUser;
  onLogout: () => void;
};

export function AppShell({ user, onLogout }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [compactSidebar, setCompactSidebar] = useState(false);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[rgb(var(--bg))] text-[rgb(var(--text))]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.08),transparent_24%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.08),transparent_22%),linear-gradient(180deg,rgba(var(--bg),0.98),rgba(var(--bg),1))] dark:bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.09),transparent_22%),radial-gradient(circle_at_top_right,rgba(99,102,241,0.08),transparent_18%),linear-gradient(180deg,rgba(8,12,20,0.98),rgba(7,10,18,1))]" />
      <Sidebar
        user={user}
        open={sidebarOpen}
        compact={compactSidebar}
        onToggleCompact={() => setCompactSidebar((prev) => !prev)}
        onClose={() => setSidebarOpen(false)}
        onLogout={onLogout}
      />
      {sidebarOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden"
        />
      )}

      <Topbar
        user={user}
        compactSidebar={compactSidebar}
        onMenuClick={() => setSidebarOpen(true)}
        onLogout={onLogout}
      />

      <div className={compactSidebar ? "lg:pl-28" : "lg:pl-80"}>
        <div className="relative mx-auto w-full max-w-[1440px] px-4 pb-10 pt-5 sm:px-6 lg:px-8">
          <motion.main className="space-y-6">
            <Outlet />
          </motion.main>
        </div>
      </div>
    </div>
  );
}
