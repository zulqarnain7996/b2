import { useEffect, useRef } from "react";
import { useAuth } from "@/auth/AuthContext";
import { useToast } from "./ToastProvider";
import { apiClient } from "@/services/apiClient";

export function AdminRealtimeNotifier() {
  const { isAdmin, isAuthenticated } = useAuth();
  const toast = useToast();
  const lastCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return;

    let active = true;

    async function check() {
      try {
        const res = await apiClient.getTodayAttendance();
        const nextCount = res.records.length;
        if (lastCountRef.current !== null && nextCount > lastCountRef.current) {
          const diff = nextCount - lastCountRef.current;
          toast.info(`${diff} new check-in${diff > 1 ? "s" : ""} recorded.`);
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Face Attendance", {
              body: `${diff} new check-in${diff > 1 ? "s" : ""} recorded.`,
            });
          }
        }
        lastCountRef.current = nextCount;
      } catch {
        // Silent polling fallback.
      }
    }

    void check();
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    const timer = window.setInterval(() => {
      if (active) void check();
    }, 20000);

    return () => {
      active = false;
      window.clearInterval(timer);
      lastCountRef.current = null;
    };
  }, [isAdmin, isAuthenticated, toast]);

  return null;
}
