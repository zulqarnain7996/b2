import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Camera, Clock3 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { CameraAutoCaptureModal } from "@/components/CameraAutoCaptureModal";
import { useToast } from "@/components/feedback/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table } from "@/components/ui/Table";

type CheckInRow = {
  date: string;
  time: string;
  status: "Present" | "Late";
  lateMinutes: number;
  source: "Face Scan";
  confidence: number;
  notes: string;
};

function toDisplayDate(input = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(input);
}

function toDisplayTime(raw: string | null | undefined) {
  if (!raw) return "-";
  const [hh = "00", mm = "00"] = raw.split(":");
  const dt = new Date();
  dt.setHours(Number(hh), Number(mm), 0, 0);
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true })
    .format(dt)
    .toLowerCase();
}

export function EmployeeCheckInPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CheckInRow[]>([]);

  useEffect(() => {
    if (user && !user.employeeId) {
      const msg = "Your account is not linked to an employee ID. Ask admin to link your account.";
      setError(msg);
      toast.error(msg);
    } else {
      setError(null);
    }
  }, [toast, user]);

  const latestRow = useMemo(() => rows[0] || null, [rows]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <PageHeader
        title="Employee Check-in"
        subtitle="Verify your face to mark attendance with a guided scan."
      />

      <Card className="bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-emerald-500/10">
        <div className="space-y-4">
          <div>
              <h2 className="text-lg font-semibold text-[rgb(var(--text))]">Face Scan</h2>
              <p className="text-sm text-[rgb(var(--muted))]">
              Automatic selfie capture + 1-step liveness challenge (blink or slight head turn).
              </p>
            </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              disabled={!user?.employeeId}
              onClick={() => setCameraOpen(true)}
            >
              <Camera className="h-4 w-4" />
              Start Check-in
            </Button>
            <Button variant="secondary" onClick={() => navigate("/monthly-attendance")}>
              Manual Selfie (Fallback)
            </Button>
            <Button variant="ghost" onClick={() => navigate("/history")}>
              <Clock3 className="h-4 w-4" />
              View My History
            </Button>
          </div>

          {latestRow ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm">
              Latest:
              <Badge variant={latestRow.status === "Late" ? "warn" : "success"}>
                {latestRow.status}
              </Badge>
              <span className="text-[rgb(var(--muted))]">{latestRow.time}</span>
            </div>
          ) : null}
        </div>
      </Card>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card title="Attendance Results" subtitle="Latest scan outcomes are listed below.">
        {rows.length ? (
          <Table stickyHeader zebra hoverRows>
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Status</th>
                <th>Late Minutes</th>
                <th>Source</th>
                <th>Confidence</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.date}-${row.time}-${index}`}>
                  <td>{row.date}</td>
                  <td>{row.time}</td>
                  <td>
                    <Badge variant={row.status === "Present" ? "success" : "warn"}>{row.status}</Badge>
                  </td>
                  <td>{row.lateMinutes}</td>
                  <td>{row.source}</td>
                  <td>{row.confidence.toFixed(3)}</td>
                  <td className="max-w-[360px] truncate" title={row.notes}>{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-[rgb(var(--muted))]">
            No scan results yet. Start a face scan to record attendance.
          </p>
        )}
      </Card>

      <CameraAutoCaptureModal
        isOpen={cameraOpen}
        title="Check-in Face Scan"
        scanContext="checkin"
        onClose={() => setCameraOpen(false)}
        onCapture={async () => {}}
        onCheckinComplete={async ({ attendance, already }) => {
          const status: "Present" | "Late" = Number(attendance.late_minutes || 0) > 0 ? "Late" : "Present";
          setRows((prev) => [
            {
              date: toDisplayDate(new Date(attendance.date)),
              time: toDisplayTime(attendance.checkin_time),
              status,
              lateMinutes: Number(attendance.late_minutes || 0),
              source: "Face Scan",
              confidence: Number(attendance.confidence || 0),
              notes: attendance.note || (already ? "Already checked in today." : "Attendance marked successfully."),
            },
            ...prev,
          ]);
          if (already) {
            toast.info("Already checked in today.");
          } else {
            toast.success("Attendance marked successfully.");
          }
          setError(null);
        }}
      />

      {!user?.employeeId ? (
        <Card>
          <div className="flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300">
            <AlertCircle className="h-4 w-4" />
            Account is not linked with an employee record.
          </div>
        </Card>
      ) : null}
    </div>
  );
}
