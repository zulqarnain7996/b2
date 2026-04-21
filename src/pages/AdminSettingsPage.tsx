import { FormEvent, useEffect, useState } from "react";
import { useToast } from "@/components/feedback/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient } from "@/services/apiClient";

type SettingsForm = {
  shift_start_time: string;
  grace_period_mins: number;
  late_fine_pkr: number;
  absent_fine_pkr: number;
  not_marked_fine_pkr: number;
};

const initialForm: SettingsForm = {
  shift_start_time: "09:00",
  grace_period_mins: 15,
  late_fine_pkr: 0,
  absent_fine_pkr: 0,
  not_marked_fine_pkr: 0,
};

function normalizeTimeForInput(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "09:00";
  return raw.length >= 5 ? raw.slice(0, 5) : raw;
}

export function AdminSettingsPage() {
  const toast = useToast();
  const [form, setForm] = useState<SettingsForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.getAdminSettings();
      setForm({
        shift_start_time: normalizeTimeForInput(res.settings.shift_start_time),
        grace_period_mins: Number(res.settings.grace_period_mins || 0),
        late_fine_pkr: Number(res.settings.late_fine_pkr || 0),
        absent_fine_pkr: Number(res.settings.absent_fine_pkr || 0),
        not_marked_fine_pkr: Number(res.settings.not_marked_fine_pkr || 0),
      });
      setUpdatedAt(res.settings.updated_at);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load settings";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        shift_start_time: normalizeTimeForInput(form.shift_start_time),
        grace_period_mins: Number(form.grace_period_mins || 0),
        late_fine_pkr: Number(form.late_fine_pkr || 0),
        absent_fine_pkr: Number(form.absent_fine_pkr || 0),
        not_marked_fine_pkr: Number(form.not_marked_fine_pkr || 0),
      };
      const res = await apiClient.updateAdminSettings(payload);
      setForm({
        shift_start_time: normalizeTimeForInput(res.settings.shift_start_time),
        grace_period_mins: Number(res.settings.grace_period_mins || 0),
        late_fine_pkr: Number(res.settings.late_fine_pkr || 0),
        absent_fine_pkr: Number(res.settings.absent_fine_pkr || 0),
        not_marked_fine_pkr: Number(res.settings.not_marked_fine_pkr || 0),
      });
      setUpdatedAt(res.settings.updated_at);
      toast.success("Shift configuration updated.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update settings";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <PageHeader title="Shift Configuration" subtitle="Manage global shift start, grace period, and fixed attendance fines in PKR." />

      <Card title="Attendance Fine Settings" subtitle="These values are used for all new attendance records.">
        {loading ? (
          <div className="inline-flex items-center gap-2 text-sm text-[rgb(var(--muted))]">
            <Spinner /> Loading settings...
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={onSubmit}>
            {error ? <Alert variant="error">{error}</Alert> : null}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Input
                label="Shift Start Time"
                type="time"
                value={form.shift_start_time}
                onChange={(e) => setForm((prev) => ({ ...prev, shift_start_time: e.target.value }))}
                required
              />
              <Input
                label="Grace Period (mins)"
                type="number"
                min={0}
                step={1}
                value={String(form.grace_period_mins)}
                onChange={(e) => setForm((prev) => ({ ...prev, grace_period_mins: Number(e.target.value || 0) }))}
                required
              />
              <Input
                label="Late Fine (PKR)"
                type="number"
                min={0}
                step="0.01"
                value={String(form.late_fine_pkr)}
                onChange={(e) => setForm((prev) => ({ ...prev, late_fine_pkr: Number(e.target.value || 0) }))}
                required
              />
              <Input
                label="Absent Fine (PKR)"
                type="number"
                min={0}
                step="0.01"
                value={String(form.absent_fine_pkr)}
                onChange={(e) => setForm((prev) => ({ ...prev, absent_fine_pkr: Number(e.target.value || 0) }))}
                required
              />
              <Input
                label="Not Marked Fine (PKR)"
                type="number"
                min={0}
                step="0.01"
                value={String(form.not_marked_fine_pkr)}
                onChange={(e) => setForm((prev) => ({ ...prev, not_marked_fine_pkr: Number(e.target.value || 0) }))}
                required
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-[rgb(var(--muted))]">
                {updatedAt ? `Last updated: ${new Date(updatedAt).toLocaleString()}` : "Not updated yet."}
              </p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => void load()} disabled={saving}>
                  Reload
                </Button>
                <Button type="submit" loading={saving}>
                  {saving ? "Saving..." : "Save Configuration"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
