import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Camera, ChevronLeft, ChevronRight, Clock3, Wallet } from "lucide-react";
import { useToast } from "@/components/feedback/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CardSkeleton } from "@/components/ui/CardSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { apiClient, toFileUrl } from "@/services/apiClient";
import { localYmd, sameLocalDay, startOfMonthLocal } from "@/utils/date";
import type { MonthlyAttendanceCalendarDay } from "@/types";

type DayCell = {
  date: Date;
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  data: MonthlyAttendanceCalendarDay | null;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toMonthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatTime(value: string | null): string {
  if (!value) return "-";
  const [hh, mm] = value.split(":");
  const hour = Number(hh);
  if (!Number.isFinite(hour)) return value;
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${mm} ${ampm}`;
}

export function MonthlyAttendancePage() {
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return startOfMonthLocal(now.getFullYear(), now.getMonth());
  });
  const [now, setNow] = useState(() => new Date());
  const [monthDays, setMonthDays] = useState<MonthlyAttendanceCalendarDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const [selectedSelfieFile, setSelectedSelfieFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [captureStep, setCaptureStep] = useState<"picker" | "live" | "preview">("picker");
  const [cameraMessage, setCameraMessage] = useState("");

  const todayIso = useMemo(() => localYmd(now), [now]);

  useEffect(() => {
    let mounted = true;
    async function syncClock() {
      try {
        const res = await apiClient.getServerTime();
        if (!mounted) return;
        const serverNow = new Date(res.iso);
        if (Number.isNaN(serverNow.getTime())) return;
        setNow(serverNow);
        setCurrentMonth(startOfMonthLocal(serverNow.getFullYear(), serverNow.getMonth()));
      } catch {
        // Fallback to local clock when server time is unavailable.
      }
    }
    void syncClock();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
    }, 30_000);
    return () => window.clearInterval(timerId);
  }, []);

  async function loadMonth(target: Date) {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.getMyAttendanceMonth(target.getFullYear(), target.getMonth() + 1);
      setMonthDays(res.month_days);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load attendance month";
      setError(msg);
      toast.error(msg);
      setMonthDays([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMonth(currentMonth);
  }, [currentMonth]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      stopCameraStream();
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!previewOpen || captureStep !== "live" || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    void video.play().catch(() => {
      // Ignore autoplay-related errors; user can still capture after interaction.
    });
  }, [captureStep, previewOpen]);

  const monthDaysMap = useMemo(() => {
    const map = new Map<string, MonthlyAttendanceCalendarDay>();
    monthDays.forEach((day) => map.set(day.date, day));
    return map;
  }, [monthDays]);

  const calendarCells = useMemo(() => {
    const start = startOfMonthLocal(currentMonth.getFullYear(), currentMonth.getMonth());
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const leading = start.getDay();
    const totalDays = end.getDate();
    const trailing = (7 - ((leading + totalDays) % 7)) % 7;

    const cells: DayCell[] = [];

    for (let i = leading; i > 0; i -= 1) {
      const d = new Date(start);
      d.setDate(start.getDate() - i);
      const key = localYmd(d);
      cells.push({ date: d, iso: key, inMonth: false, isToday: false, data: monthDaysMap.get(key) ?? null });
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const d = startOfMonthLocal(currentMonth.getFullYear(), currentMonth.getMonth());
      d.setDate(day);
      const key = localYmd(d);
      cells.push({ date: d, iso: key, inMonth: true, isToday: key === todayIso, data: monthDaysMap.get(key) ?? null });
    }

    for (let i = 1; i <= trailing; i += 1) {
      const d = new Date(end);
      d.setDate(end.getDate() + i);
      const key = localYmd(d);
      cells.push({ date: d, iso: key, inMonth: false, isToday: false, data: monthDaysMap.get(key) ?? null });
    }

    return cells;
  }, [currentMonth, monthDaysMap, todayIso]);

  const summary = useMemo(() => {
    const present = monthDays.filter((d) => d.status === "present").length;
    const late = monthDays.filter((d) => d.fine_amount > 0).length;
    const totalFine = monthDays.reduce((acc, day) => acc + Number(day.fine_amount || 0), 0);
    return { present, late, totalFine };
  }, [monthDays]);

  const todayRecord = useMemo(() => monthDays.find((d) => d.date === todayIso) ?? null, [monthDays, todayIso]);
  const todayAlreadyPresent = todayRecord?.status === "present";
  const isViewingCurrentMonth = sameLocalDay(
    startOfMonthLocal(currentMonth.getFullYear(), currentMonth.getMonth()),
    startOfMonthLocal(now.getFullYear(), now.getMonth()),
  );
  const markPresentTooltip = !isViewingCurrentMonth
    ? "Mark Present is available only for today in the current month."
    : todayAlreadyPresent
      ? "Today's attendance is already marked."
      : "Mark attendance for today with selfie proof.";

  function goPrevMonth() {
    setCurrentMonth((prev) => startOfMonthLocal(prev.getFullYear(), prev.getMonth() - 1));
  }

  function goNextMonth() {
    setCurrentMonth((prev) => startOfMonthLocal(prev.getFullYear(), prev.getMonth() + 1));
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

  function onPickSelfie() {
    setCameraMessage("");
    setCaptureStep("picker");
    setPreviewOpen(true);
  }

  async function openLiveCamera() {
    setCameraMessage("");
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
      setCaptureStep("live");
    } catch {
      const msg = "Camera not available on this device.";
      setCameraMessage(msg);
      toast.info(msg);
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
        const stamp = Date.now();
        const file = new File([blob], `selfie_${stamp}.jpg`, { type: "image/jpeg" });
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const nextPreview = URL.createObjectURL(file);
        setSelectedSelfieFile(file);
        setPreviewUrl(nextPreview);
        setCaptureStep("preview");
        stopCameraStream();
      },
      "image/jpeg",
      0.92,
    );
  }

  async function submitManualSelfie() {
    if (!selectedSelfieFile) return;
    setUploading(true);
    setError("");
    try {
      const res = await apiClient.markAttendanceManualSelfie(selectedSelfieFile);
      toast.success(`Attendance marked at ${formatTime(res.attendance.checkin_time)}.`);
      setPreviewOpen(false);
      setSelectedSelfieFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
      setCaptureStep("picker");
      setCameraMessage("");
      stopCameraStream();
      await loadMonth(currentMonth);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to submit selfie proof.";
      if (msg.toLowerCase().includes("already marked today")) {
        toast.info("Already marked today.");
      } else {
        toast.error(msg);
      }
      setError(msg);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <PageHeader
        title="Monthly Attendance"
        subtitle="Manual check-in with selfie proof is allowed for today only."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={goPrevMonth}>
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-sm font-semibold text-[rgb(var(--text))]">
              {toMonthLabel(currentMonth)}
            </div>
            <Button variant="secondary" onClick={goNextMonth}>
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="app-card-hover">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-wide text-[rgb(var(--muted))]">Present Days</p>
              <p className="text-2xl font-semibold text-[rgb(var(--text))]">{summary.present}</p>
            </div>
          </div>
        </Card>
        <Card className="app-card-hover">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700">
              <Clock3 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-wide text-[rgb(var(--muted))]">Late/Fine Days</p>
              <p className="text-2xl font-semibold text-[rgb(var(--text))]">{summary.late}</p>
            </div>
          </div>
        </Card>
        <Card className="app-card-hover">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-blue-700">
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-wide text-[rgb(var(--muted))]">Total Fine</p>
              <p className="text-2xl font-semibold text-[rgb(var(--text))]">{summary.totalFine.toFixed(2)}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card
        title="Calendar"
        subtitle="Past and future days are view-only. Today can be marked once with selfie proof."
        actions={
          <Button
            onClick={onPickSelfie}
            disabled={todayAlreadyPresent || uploading || !isViewingCurrentMonth}
            title={markPresentTooltip}
          >
            <Camera className="h-4 w-4" />
            {!isViewingCurrentMonth
              ? "Open Current Month To Mark"
              : todayAlreadyPresent
                ? "Already Marked Today"
                : uploading
                  ? "Uploading..."
                  : "Mark Present (Selfie Proof)"}
          </Button>
        }
      >
        {loading ? (
          <div className="space-y-3">
            <CardSkeleton rows={2} />
            <CardSkeleton rows={2} />
          </div>
        ) : null}

        {!loading && monthDays.length === 0 ? (
          <EmptyState title="No month data" message="Unable to load attendance days for this month." />
        ) : null}

        {!loading && monthDays.length > 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-7 gap-2">
              {WEEKDAYS.map((w) => (
                <div key={w} className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 py-2 text-center text-xs font-semibold text-[rgb(var(--muted))]">
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
              {calendarCells.map((cell) => {
                const status = cell.data?.status ?? (cell.iso < todayIso ? "absent" : "not_marked");
                const isPresent = status === "present";
                const inMonthMuted = !cell.inMonth;
                const isDisabled = !cell.isToday;
                return (
                  <div
                    key={cell.iso}
                    className={`rounded-2xl border p-3 transition-all ${
                      cell.isToday
                        ? "border-blue-300 bg-blue-50/60 ring-2 ring-blue-200"
                        : isPresent
                          ? "border-emerald-200 bg-emerald-50/60"
                          : "border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
                    } ${inMonthMuted ? "opacity-55" : ""} ${!isDisabled ? "shadow-sm" : ""}`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-[rgb(var(--text))]">{cell.date.getDate()}</p>
                      <Badge variant={isPresent ? "success" : status === "absent" ? "warn" : "default"}>
                        {isPresent ? "Present" : status === "absent" ? "Absent" : "Not marked"}
                      </Badge>
                    </div>

                    <p className="text-xs text-[rgb(var(--muted))]">
                      {cell.data?.weekday ?? cell.date.toLocaleDateString(undefined, { weekday: "short" })}
                    </p>
                    <p className="mt-1 text-xs text-[rgb(var(--muted))]">
                      Time: {formatTime(cell.data?.checkin_time ?? null)}
                    </p>
                    <p className="mt-1 text-xs text-[rgb(var(--muted))]">
                      Source: {cell.data?.source ?? "-"}
                    </p>
                    <p className="mt-1 text-xs text-[rgb(var(--muted))]">
                      Late: {Number(cell.data?.late_minutes ?? 0)} min
                    </p>
                    {Number(cell.data?.fine_amount ?? 0) > 0 ? (
                      <p className="mt-1 text-xs font-semibold text-rose-600">
                        Fine: PKR {Number(cell.data?.fine_amount ?? 0).toFixed(2)}
                      </p>
                    ) : null}

                    {cell.data?.evidence_photo_url ? (
                      <a
                        href={toFileUrl(cell.data.evidence_photo_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block"
                      >
                        <img
                          src={toFileUrl(cell.data.evidence_photo_url)}
                          alt="Selfie evidence"
                          className="h-16 w-full rounded-lg border border-[rgb(var(--border))] object-cover"
                        />
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </Card>

      <Modal
        isOpen={previewOpen}
        title={
          captureStep === "live"
            ? "Live Camera Capture"
            : selectedSelfieFile
              ? "Selfie Proof Preview"
              : "Mark Present (Selfie Proof)"
        }
        onClose={() => {
          if (uploading) return;
          setPreviewOpen(false);
          setCaptureStep("picker");
          setCameraMessage("");
          stopCameraStream();
        }}
        width="md"
        footer={
          <>
            {captureStep === "live" ? (
              <>
                <Button onClick={captureFromVideo}>
                  <Camera className="h-4 w-4" />
                  Capture
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    stopCameraStream();
                    setCaptureStep("picker");
                  }}
                >
                  Cancel
                </Button>
              </>
            ) : selectedSelfieFile ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => void openLiveCamera()}
                  disabled={uploading}
                >
                  Retake (Camera Live)
                </Button>
                <Button onClick={() => void submitManualSelfie()} disabled={!selectedSelfieFile || uploading}>
                  {uploading ? "Submitting..." : "Submit"}
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                onClick={() => setPreviewOpen(false)}
                disabled={uploading}
              >
                Cancel
              </Button>
            )}
          </>
        }
      >
        {captureStep === "live" ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-black">
              <video ref={videoRef} className="h-72 w-full object-cover" autoPlay playsInline muted />
            </div>
            <p className="text-xs text-[rgb(var(--muted))]">Align your face clearly and tap Capture.</p>
            <canvas ref={canvasRef} className="hidden" />
          </div>
        ) : previewUrl ? (
          <img src={previewUrl} alt="Selfie preview" className="h-72 w-full rounded-xl border border-[rgb(var(--border))] object-cover" />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[rgb(var(--muted))]">
              Use the camera to capture a fresh selfie proof.
            </p>
            {cameraMessage ? <Alert variant="info">{cameraMessage}</Alert> : null}
            <div className="grid gap-3">
              <Button onClick={() => void openLiveCamera()}>
                <Camera className="h-4 w-4" />
                Open Camera
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
