import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, History } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { NoticeDetailModal } from "@/components/notices/NoticeDetailModal";
import { apiClient } from "@/services/apiClient";
import type { Notice } from "@/types";

type NoticeCategory = "upcoming" | "current" | "past";

type NoticeWithDates = Notice & {
  startsDate: Date | null;
  endsDate: Date | null;
};

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value: Date | null): string {
  if (!value) return "-";
  return value.toLocaleString();
}

export function NoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<NoticeCategory>("current");
  const [selectedNotice, setSelectedNotice] = useState<NoticeWithDates | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadNotices() {
      setLoading(true);
      try {
        const res = await apiClient.getNotices();
        if (mounted) setNotices(res.notices);
      } catch {
        if (mounted) setNotices([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadNotices();
    return () => {
      mounted = false;
    };
  }, []);

  const categorized = useMemo(() => {
    const now = new Date();
    const parsed: NoticeWithDates[] = notices.map((n) => ({
      ...n,
      startsDate: parseDate(n.starts_at),
      endsDate: parseDate(n.ends_at),
    }));

    const upcoming = parsed.filter((n) => n.startsDate && n.startsDate > now);
    const past = parsed.filter((n) => n.endsDate && n.endsDate < now);
    const current = parsed.filter((n) => {
      const startsOk = !n.startsDate || n.startsDate <= now;
      const endsOk = !n.endsDate || n.endsDate >= now;
      return startsOk && endsOk;
    });

    return { upcoming, current, past };
  }, [notices]);

  const activeList = categorized[activeCategory];

  const categoryCards: Array<{
    key: NoticeCategory;
    title: string;
    subtitle: string;
    count: number;
    icon: typeof CalendarClock;
    gradient: string;
  }> = [
    {
      key: "upcoming",
      title: "Upcoming Notices",
      subtitle: "Scheduled notices",
      count: categorized.upcoming.length,
      icon: CalendarClock,
      gradient: "from-sky-500 via-blue-500 to-indigo-500",
    },
    {
      key: "current",
      title: "Current Notices",
      subtitle: "Active right now",
      count: categorized.current.length,
      icon: CheckCircle2,
      gradient: "from-emerald-500 via-green-500 to-teal-500",
    },
    {
      key: "past",
      title: "Past Notices",
      subtitle: "Expired notices",
      count: categorized.past.length,
      icon: History,
      gradient: "from-slate-500 via-slate-600 to-slate-700",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <PageHeader title="Notices" subtitle="Browse upcoming, current, and past notices." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categoryCards.map((card) => {
          const Icon = card.icon;
          const selected = activeCategory === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setActiveCategory(card.key)}
              className={`relative overflow-hidden rounded-2xl border border-white/35 bg-gradient-to-br p-5 text-left text-white shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${card.gradient} ${
                selected ? "ring-4 ring-white/60 scale-[1.01]" : "opacity-95"
              }`}
            >
              <div className="absolute right-3 top-3 rounded-full bg-white/20 p-2">
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-white/90">{card.subtitle}</p>
              <p className="mt-1 text-xl font-semibold">{card.title}</p>
              <div className="mt-4 inline-flex items-center rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">
                {card.count} notice{card.count === 1 ? "" : "s"}
              </div>
            </button>
          );
        })}
      </div>

      <Card
        title={
          activeCategory === "upcoming"
            ? "Upcoming Notices"
            : activeCategory === "past"
              ? "Past Notices"
              : "Current Notices"
        }
        subtitle={
          activeCategory === "upcoming"
            ? "Notices that start in the future."
            : activeCategory === "past"
              ? "Notices that already ended."
              : "Notices currently active."
        }
      >
        {loading ? <p className="text-sm text-[rgb(var(--muted))]">Loading notices...</p> : null}

        {!loading && activeList.length === 0 ? (
          <EmptyState
            title={
              activeCategory === "upcoming"
                ? "No upcoming notices"
                : activeCategory === "past"
                  ? "No past notices"
                  : "No current notices"
            }
            message={
              activeCategory === "upcoming"
                ? "There are no scheduled notices right now."
                : activeCategory === "past"
                  ? "There are no ended notices to show."
                  : "There are no active notices right now."
            }
          />
        ) : null}

        {!loading && activeList.length > 0 ? (
          <div className="space-y-4">
            {activeList.map((notice) => (
              <div
                key={notice.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedNotice(notice)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedNotice(notice);
                  }
                }}
                className="theme-surface cursor-pointer rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-[rgba(var(--focus-ring),0.18)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={notice.priority}>{notice.priority}</Badge>
                  {notice.is_sticky ? <Badge variant="important">Sticky</Badge> : null}
                  <h3 className="text-lg font-semibold text-[rgb(var(--text))]">{notice.title}</h3>
                </div>

                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-[rgb(var(--text-soft))]">
                  {notice.body}
                </p>

                <p className="mt-3 text-xs text-[rgb(var(--muted))]">
                  {activeCategory === "upcoming"
                    ? `Starts: ${formatDate(notice.startsDate)}`
                    : activeCategory === "past"
                      ? `Ended: ${formatDate(notice.endsDate)}`
                      : notice.endsDate
                        ? `Ends: ${formatDate(notice.endsDate)}`
                        : "Active"}
                  {" | "}
                  Posted: {formatDate(parseDate(notice.created_at))}
                </p>
                <p className="mt-2 text-xs font-medium text-sky-700 dark:text-sky-200">Click to view details</p>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <NoticeDetailModal
        notice={selectedNotice}
        isOpen={!!selectedNotice}
        onClose={() => setSelectedNotice(null)}
      />
    </div>
  );
}
