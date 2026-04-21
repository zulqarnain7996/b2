import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/Button";
import { NoticeDetailModal } from "@/components/notices/NoticeDetailModal";
import { apiClient } from "@/services/apiClient";
import type { Notice } from "@/types";

export function LoginNoticeGate() {
  const { user, loginEventKey, refreshEventKey } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const completedTriggerRef = useRef<string | null>(null);
  const [queue, setQueue] = useState<Notice[]>([]);
  const activeNotice = useMemo(() => queue[0] ?? null, [queue]);

  useEffect(() => {
    if (user?.id) return;
    completedTriggerRef.current = null;
    setQueue([]);
  }, [user?.id]);

  useEffect(() => {
    const trigger = loginEventKey ? "login" : refreshEventKey ? "refresh" : null;
    const triggerEventKey = loginEventKey || refreshEventKey;
    const fetchKey = user?.id && trigger && triggerEventKey ? `${user.id}:${trigger}:${triggerEventKey}` : null;
    if (!user?.id || !trigger || !fetchKey || location.pathname === "/change-password") return;
    if (completedTriggerRef.current === fetchKey) return;
    let cancelled = false;
    if (import.meta.env.DEV) {
      console.debug("[LoginNoticeGate] fetching pending notices", {
        userId: user.id,
        role: user.role,
        trigger,
        triggerEventKey,
        path: location.pathname,
      });
    }
    apiClient
      .getLoginNotices(trigger)
      .then((res) => {
        if (cancelled) return;
        if (import.meta.env.DEV) {
          console.debug("[LoginNoticeGate] received notices", {
            userId: user.id,
            role: user.role,
            trigger,
            triggerEventKey,
            noticeCount: (res.notices || []).length,
            noticeIds: (res.notices || []).map((notice) => notice.id),
            payload: res,
          });
        }
        setQueue(res.notices || []);
        completedTriggerRef.current = fetchKey;
      })
      .catch((error) => {
        if (cancelled) return;
        if (import.meta.env.DEV) {
          console.debug("[LoginNoticeGate] fetch failed", {
            userId: user.id,
            trigger,
            triggerEventKey,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        setQueue([]);
      });
    return () => {
      cancelled = true;
    };
  }, [location.pathname, loginEventKey, refreshEventKey, user?.id, user?.role]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug("[LoginNoticeGate] modal state", {
        userId: user?.id ?? null,
        loginEventKey,
        refreshEventKey,
        queueSize: queue.length,
        activeNoticeId: activeNotice?.id ?? null,
        isOpen: !!activeNotice,
      });
    }
  }, [activeNotice?.id, loginEventKey, queue.length, refreshEventKey, user?.id]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug("[LoginNoticeGate] queue updated", {
        userId: user?.id ?? null,
        loginEventKey,
        refreshEventKey,
        noticeCount: queue.length,
        noticeIds: queue.map((notice) => notice.id),
      });
    }
  }, [queue, loginEventKey, refreshEventKey, user?.id]);

  async function resolveNotice(action: "seen" | "dismiss" | "acknowledge") {
    if (!activeNotice) return;
    try {
      if (action === "dismiss") {
        await apiClient.dismissNotice(activeNotice.id);
      } else if (action === "acknowledge") {
        await apiClient.acknowledgeNotice(activeNotice.id);
      } else {
        await apiClient.markNoticeSeen(activeNotice.id);
      }
      setQueue((prev) => prev.slice(1));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update notice state");
    }
  }

  if (!activeNotice) return null;

  const showAcknowledge = !!activeNotice.requires_acknowledgement;
  const showDismiss = !!activeNotice.is_dismissible && !activeNotice.repeat_every_login && !showAcknowledge;
  const closeLabel = activeNotice.repeat_every_login ? "Close" : "OK";

  return (
    <NoticeDetailModal
      notice={activeNotice}
      isOpen={!!activeNotice}
      onClose={() => {
        if (showAcknowledge) return;
        void resolveNotice(showDismiss ? "dismiss" : "seen");
      }}
      footer={
        <>
          {showDismiss ? (
            <Button variant="secondary" onClick={() => void resolveNotice("dismiss")}>
              Dismiss
            </Button>
          ) : null}
          {showAcknowledge ? (
            <Button onClick={() => void resolveNotice("acknowledge")}>
              Acknowledge
            </Button>
          ) : (
            <Button onClick={() => void resolveNotice("seen")}>
              {closeLabel}
            </Button>
          )}
        </>
      }
    />
  );
}
