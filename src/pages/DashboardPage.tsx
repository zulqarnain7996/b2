import { Activity, Clock3, ShieldCheck, Users } from "lucide-react";
import { CardSection } from "@/components/ui/CardSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/auth/AuthContext";
import type { ComponentType } from "react";

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <CardSection className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
        </div>
        <span className="rounded-xl bg-blue-50 p-2 text-blue-600">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </CardSection>
  );
}

export function DashboardPage() {
  const { user, isAdmin } = useAuth();

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Welcome, ${user?.name ?? "User"}`}
        subtitle="This dashboard will show live attendance and activity widgets in the next step."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {isAdmin ? (
          <>
            <StatCard label="Today's Check-ins" value="--" icon={Activity} />
            <StatCard label="On-time / Late" value="-- / --" icon={Clock3} />
            <StatCard label="Total Employees" value="--" icon={Users} />
            <StatCard label="Recent Alerts" value="--" icon={ShieldCheck} />
          </>
        ) : (
          <>
            <StatCard label="My Last Check-in" value="--" icon={Clock3} />
            <StatCard label="This Week Attendance" value="--" icon={Activity} />
            <StatCard label="Attendance Health" value="--" icon={ShieldCheck} />
            <StatCard label="Quick Status" value="Ready" icon={Users} />
          </>
        )}
      </div>

      <CardSection>
        <h3 className="text-lg font-semibold text-slate-900">Quick Actions</h3>
        <p className="mt-1 text-sm text-slate-600">
          Use the left navigation to open check-in, history, and admin pages.
        </p>
      </CardSection>
    </div>
  );
}
