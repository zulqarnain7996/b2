import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Camera, Clock3 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useToast } from "@/components/feedback/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table } from "@/components/ui/Table";
import { apiClient, toFileUrl } from "@/services/apiClient";
import type { AttendanceRecord } from "@/types";

type CheckInRow = {
  id: string;
  date: string;
  time: string;
  status: "Present" | "Late";
  lateMinutes: number;
  fineAmount: number;
  source: "face" | "manual" | "unknown";
  confidence: number;
  notes: string;
  evidencePhotoUrl?: string | null;
  createdAt?: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function toDisplayDate(input: string | Date = new Date()) {
  const value = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(value);
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

function mapAttendanceRow(row: AttendanceRecord): CheckInRow {
  const status: "Present" | "Late" = Number(row.lateMinutes || 0) > 0 ? "Late" : "Present";
  return {
    id: row.id,
    date: toDisplayDate(row.date),
    time: toDisplayTime(row.checkInTime),
    status,
    lateMinutes: Number(row.lateMinutes || 0),
    fineAmount: Number(row.fineAmount || 0),
    source: row.source || "unknown",
    confidence: Number(row.confidence || 0),
    notes: row.note || (row.source === "manual" ? "Photo attendance saved successfully." : "Attendance recorded."),
    evidencePhotoUrl: row.evidencePhotoUrl || null,
    createdAt: row.createdAt,
  };
}

export function EmployeeCheckInPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [captureStep, setCaptureStep] = useState<"live" | "preview">("live");
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cameraMessage, setCameraMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CheckInRow[]>([]);
  const [todayMarked, setTodayMarked] = useState(false);
  const [loadingToday, setLoadingToday] = useState(false);
  const [selectedRow, setSelectedRow] = useState<CheckInRow | null>(null);

  useEffect(() => {
    if (user && !user.employeeId) {
      const msg = "Your account is not linked to an employee ID. Ask admin to link your account.";
      setError(msg);
      toast.error(msg);
    } else {
      setError(null);
    }
  }, [toast, user]);

  useEffect(() => {
    return () => {
      stopCameraStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!cameraOpen || captureStep !== "live" || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    void video.play().catch(() => {
      // Ignore autoplay errors; user can still capture after interaction.
    });
  }, [cameraOpen, captureStep]);

  useEffect(() => {
    if (!user?.employeeId) return;
    void loadTodayAttendance();
  }, [user?.employeeId]);

  const latestRow = useMemo(() => rows[0] || null, [rows]);

  async function loadTodayAttendance() {
    setLoadingToday(true);
    try {
      const res = await apiClient.getMyTodayAttendance();
      const todayRow = res.record && String(res.record.date || "") === todayIsoDate() ? res.record : null;
      if (todayRow) {
        setRows([mapAttendanceRow(todayRow)]);
        setTodayMarked(true);
      } else {
        setRows([]);
        setTodayMarked(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load today's attendance";
      setError(msg);
    } finally {
      setLoadingToday(false);
    }
  }

  function stopCameraStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function openCamera() {
    if (!user?.employeeId || todayMarked) return;
    setCameraMessage("");
    setCaptureStep("live");
    setCapturedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = "Camera not available on this device.";
      setCameraMessage(msg);
      toast.info(msg);
      return;
    }

    try {
      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      const msg = "Camera not available on this device.";
      setCameraMessage(msg);
      toast.info(msg);
    }
  }

  function closeCameraModal() {
    if (submitting) return;
    setCameraOpen(false);
    setCaptureStep("live");
    stopCameraStream();
    setCapturedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
    }
  }

  function captureFromVideo() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const width = video.videoWidth || 960;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error("Failed to capture image. Please try again.");
          return;
        }
        const file = new File([blob], `checkin_${Date.now()}.jpg`, { type: "image/jpeg" });
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setCapturedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
        setCaptureStep("preview");
        stopCameraStream();
      },
      "image/jpeg",
      0.92,
    );
  }

  async function submitCheckIn() {
    if (!capturedFile) return;
    setSubmitting(true);
    setCameraMessage("");
    setError(null);
    try {
      const res = await apiClient.markAttendanceManualSelfie(capturedFile, {
        device_info: navigator.userAgent,
      });
      const row: AttendanceRecord = {
        id: res.attendance.id,
        employeeId: res.attendance.employee_id,
        date: res.attendance.date,
        checkInTime: res.attendance.checkin_time,
        status: res.attendance.status,
        lateMinutes: Number(res.attendance.late_minutes || 0),
        source: res.attendance.source,
        evidencePhotoUrl: res.attendance.evidence_photo_url,
        fineAmount: Number(res.attendance.fine_amount || 0),
        confidence: Number(res.attendance.confidence || 0),
        createdAt: res.attendance.created_at ?? undefined,
        deviceInfo: res.attendance.device_info,
        deviceIp: res.attendance.device_ip,
      };
      setRows([mapAttendanceRow(row)]);
      setTodayMarked(true);
      setCameraOpen(false);
      setCapturedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl("");
      }
      toast.success("Attendance marked successfully.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to submit check-in.";
      if (msg.toLowerCase().includes("already marked today")) {
        setTodayMarked(true);
        setCameraOpen(false);
        setCapturedFile(null);
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
          setPreviewUrl("");
        }
        toast.info("Already checked in today.");
        await loadTodayAttendance();
      } else {
        setError(msg);
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <PageHeader
        title="Employee Check-in"
        subtitle="Capture a live photo to mark today's attendance."
      />

      <Card className="bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-emerald-500/10">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[rgb(var(--text))]">Photo Check-in</h2>
            <p className="text-sm text-[rgb(var(--muted))]">
              Open your camera, take one fresh photo, and save attendance for today.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              disabled={!user?.employeeId || todayMarked}
              onClick={() => void openCamera()}
            >
              <Camera className="h-4 w-4" />
              {todayMarked ? "Already Checked In Today" : "Check In"}
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

      {todayMarked ? (
        <div className="rounded-2xl border border-emerald-300/70 bg-[linear-gradient(180deg,rgba(236,253,245,0.98),rgba(220,252,231,0.92))] px-4 py-3 text-sm font-medium text-emerald-900 shadow-[0_10px_24px_rgba(34,197,94,0.10)] dark:border-emerald-400/30 dark:bg-[linear-gradient(180deg,rgba(22,101,52,0.34),rgba(6,78,59,0.24))] dark:text-emerald-100">
          Today's attendance is already marked.
        </div>
      ) : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      {cameraMessage ? <Alert variant="info">{cameraMessage}</Alert> : null}

      <Card title="Today's Attendance" subtitle="Your latest check-in result for today.">
        {loadingToday ? (
          <p className="text-sm text-[rgb(var(--muted))]">Loading today's attendance...</p>
        ) : rows.length ? (
          <Table stickyHeader zebra hoverRows>
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Status</th>
                <th>Late Minutes</th>
                <th>Fine (PKR)</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="cursor-pointer" onClick={() => setSelectedRow(row)}>
                  <td>{row.date}</td>
                  <td>{row.time}</td>
                  <td>
                    <Badge variant={row.status === "Present" ? "success" : "warn"}>{row.status}</Badge>
                  </td>
                  <td>{row.lateMinutes}</td>
                  <td>{row.fineAmount.toFixed(2)}</td>
                  <td className="max-w-[360px] truncate" title={row.notes}>{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-[rgb(var(--muted))]">
            No attendance saved for today yet. Use Check In to capture a live photo.
          </p>
        )}
      </Card>

      <Modal
        isOpen={cameraOpen}
        title={captureStep === "live" ? "Live Photo Check-in" : "Photo Preview"}
        onClose={closeCameraModal}
        width="md"
        footer={
          captureStep === "live" ? (
            <>
              <Button onClick={captureFromVideo}>
                <Camera className="h-4 w-4" />
                Capture
              </Button>
              <Button variant="secondary" onClick={closeCameraModal}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => void openCamera()}
                disabled={submitting}
              >
                Retake
              </Button>
              <Button onClick={() => void submitCheckIn()} disabled={!capturedFile || submitting}>
                {submitting ? "Submitting..." : "Submit Check-in"}
              </Button>
            </>
          )
        }
      >
        {captureStep === "live" ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-black">
              <video ref={videoRef} className="h-72 w-full object-cover" autoPlay playsInline muted />
            </div>
            <p className="text-xs text-[rgb(var(--muted))]">Align your face clearly and capture a fresh photo.</p>
            <canvas ref={canvasRef} className="hidden" />
          </div>
        ) : previewUrl ? (
          <img src={previewUrl} alt="Check-in preview" className="h-72 w-full rounded-xl border border-[rgb(var(--border))] object-cover" />
        ) : (
          <p className="text-sm text-[rgb(var(--muted))]">No photo preview available.</p>
        )}
      </Modal>

      <Modal
        isOpen={!!selectedRow}
        title="Attendance Details"
        onClose={() => setSelectedRow(null)}
        width="lg"
        footer={
          <Button variant="secondary" onClick={() => setSelectedRow(null)}>
            Close
          </Button>
        }
      >
        {!selectedRow ? null : (
          <div className="grid gap-5 md:grid-cols-[1.1fr_1fr]">
            <div>
              {selectedRow.evidencePhotoUrl ? (
                <img
                  src={toFileUrl(selectedRow.evidencePhotoUrl)}
                  alt="Attendance evidence"
                  className="h-64 w-full rounded-2xl border border-[rgb(var(--border))] object-cover"
                />
              ) : (
                <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-[rgb(var(--border))] text-sm text-[rgb(var(--muted))]">
                  {selectedRow.source === "face" ? "Face attendance without selfie evidence." : "No evidence photo available."}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant={selectedRow.status === "Present" ? "success" : "warn"}>{selectedRow.status}</Badge>
                <Badge variant={selectedRow.source === "manual" ? "important" : "normal"}>{selectedRow.source}</Badge>
              </div>

              <div className="grid gap-2 text-sm">
                <div className="flex justify-between gap-4 border-b border-[rgb(var(--border))] py-1.5">
                  <span className="text-[rgb(var(--muted))]">Date</span>
                  <span className="font-medium text-[rgb(var(--text))]">{selectedRow.date}</span>
                </div>
                <div className="flex justify-between gap-4 border-b border-[rgb(var(--border))] py-1.5">
                  <span className="text-[rgb(var(--muted))]">Time</span>
                  <span className="font-medium text-[rgb(var(--text))]">{selectedRow.time}</span>
                </div>
                <div className="flex justify-between gap-4 border-b border-[rgb(var(--border))] py-1.5">
                  <span className="text-[rgb(var(--muted))]">Late Minutes</span>
                  <span className="font-medium text-[rgb(var(--text))]">{selectedRow.lateMinutes}</span>
                </div>
                <div className="flex justify-between gap-4 border-b border-[rgb(var(--border))] py-1.5">
                  <span className="text-[rgb(var(--muted))]">Fine (PKR)</span>
                  <span className="font-medium text-[rgb(var(--text))]">{selectedRow.fineAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between gap-4 border-b border-[rgb(var(--border))] py-1.5">
                  <span className="text-[rgb(var(--muted))]">Source</span>
                  <span className="font-medium capitalize text-[rgb(var(--text))]">{selectedRow.source}</span>
                </div>
                <div className="flex justify-between gap-4 border-b border-[rgb(var(--border))] py-1.5">
                  <span className="text-[rgb(var(--muted))]">Confidence</span>
                  <span className="font-medium text-[rgb(var(--text))]">{selectedRow.confidence.toFixed(3)}</span>
                </div>
                <div className="flex justify-between gap-4 py-1.5">
                  <span className="text-[rgb(var(--muted))]">Recorded</span>
                  <span className="font-medium text-[rgb(var(--text))]">{selectedRow.createdAt ? toDisplayDate(selectedRow.createdAt) : "-"}</span>
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Notes</div>
                <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 text-sm text-[rgb(var(--text))]">
                  {selectedRow.notes || "No notes available."}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

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
