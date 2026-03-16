import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, DatabaseBackup, Download, RefreshCw, Upload } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useToast } from "@/components/feedback/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { apiClient } from "@/services/apiClient";

const LAST_BACKUP_KEY = "ivs_last_backup_download_at";

const restoreFlow = [
  { key: "validating_backup_zip", label: "Validating backup" },
  { key: "backing_up_current_state", label: "Backing up current state" },
  { key: "restoring_database", label: "Restoring database" },
  { key: "restoring_uploads", label: "Restoring files" },
  { key: "done", label: "Done" },
];

export function AdminBackupRestorePage() {
  const { logout } = useAuth();
  const toast = useToast();

  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [restoreSteps, setRestoreSteps] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [lastBackup, setLastBackup] = useState<string>(() => localStorage.getItem(LAST_BACKUP_KEY) || "");

  const doneStepSet = useMemo(() => new Set(restoreSteps), [restoreSteps]);

  async function onDownloadBackup() {
    const ok = window.confirm("Generate and download a fresh backup now?");
    if (!ok) return;
    setDownloading(true);
    setError("");
    try {
      await apiClient.downloadBackup();
      const now = new Date().toISOString();
      localStorage.setItem(LAST_BACKUP_KEY, now);
      setLastBackup(now);
      toast.success("Backup downloaded.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Backup download failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setDownloading(false);
    }
  }

  async function onRestoreNow() {
    if (!selectedFile || !confirmed || restoring) return;
    const ok = window.confirm("This will overwrite current database and uploads. Continue restore?");
    if (!ok) return;

    setRestoring(true);
    setUploadProgress(0);
    setRestoreSteps([]);
    setError("");
    try {
      setRestoreSteps(["validating_backup_zip"]);
      const res = await apiClient.restoreBackup(selectedFile, (pct) => setUploadProgress(pct));
      setRestoreSteps(res.steps || ["done"]);
      toast.success("Restore completed. You will be logged out.");
      setTimeout(() => {
        logout();
        window.location.assign("/login");
      }, 900);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Restore failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <PageHeader title="Backup & Restore" subtitle="Secure backup and recovery for database and uploads." />

      <Card
        title="Download Backup"
        subtitle="Includes MySQL data (db.sql) and uploads/ files in a single zip."
        actions={
          <Button onClick={onDownloadBackup} loading={downloading}>
            <Download className="h-4 w-4" />
            Download Backup
          </Button>
        }
      >
        <div className="space-y-2 text-sm text-[rgb(var(--muted))]">
          <p>Backup package contents:</p>
          <ul className="list-disc pl-5">
            <li>`db.sql` (all tables)</li>
            <li>`uploads/` (employee and attendance evidence files)</li>
          </ul>
          <p>
            Last backup downloaded:{" "}
            <span className="font-semibold text-[rgb(var(--text))]">
              {lastBackup ? new Date(lastBackup).toLocaleString() : "Never"}
            </span>
          </p>
        </div>
      </Card>

      <Card title="Restore Backup (Danger Zone)" subtitle="Restoring will replace current data and files.">
        <div className="space-y-4">
          <Alert variant="error">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <span>Restoring will overwrite current database records and uploads.</span>
            </div>
          </Alert>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-[rgb(var(--text))]">Backup zip file (.zip)</span>
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-[rgb(var(--text))]">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="h-4 w-4 rounded border-[rgb(var(--border))]"
            />
            I understand this will replace current data.
          </label>

          <div className="flex items-center gap-2">
            <Button
              variant="danger"
              onClick={onRestoreNow}
              disabled={!selectedFile || !confirmed || restoring}
              loading={restoring}
            >
              <Upload className="h-4 w-4" />
              Restore Now
            </Button>
            {restoring ? (
              <span className="inline-flex items-center gap-1 text-sm text-[rgb(var(--muted))]">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Uploading... {uploadProgress}%
              </span>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3">
            <p className="mb-2 text-sm font-semibold text-[rgb(var(--text))]">Restore Progress</p>
            <ul className="space-y-1.5 text-sm">
              {restoreFlow.map((s) => (
                <li key={s.key} className="flex items-center gap-2">
                  <CheckCircle2 className={`h-4 w-4 ${doneStepSet.has(s.key) ? "text-emerald-500" : "text-slate-400"}`} />
                  <span className={doneStepSet.has(s.key) ? "font-medium text-[rgb(var(--text))]" : "text-[rgb(var(--muted))]"}>
                    {s.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {error ? <Alert variant="error">{error}</Alert> : null}
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 text-sm text-[rgb(var(--muted))]">
          <DatabaseBackup className="h-4 w-4" />
          Admin-only operation. Keep backup files in a secure location.
        </div>
      </Card>
    </div>
  );
}
