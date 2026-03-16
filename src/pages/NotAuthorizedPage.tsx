import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

export function NotAuthorizedPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeader title="403 - Not Authorized" subtitle="You do not have permission to access this page." />
      <Card>
        <p className="text-sm text-slate-600">If you believe this is an error, contact your administrator.</p>
      </Card>
    </div>
  );
}
