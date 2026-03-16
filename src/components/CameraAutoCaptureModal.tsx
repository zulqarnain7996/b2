import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Sparkles } from "lucide-react";
import { apiClient } from "@/services/apiClient";
import { Button } from "./ui/Button";

type CameraAutoCaptureModalProps = {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onCapture: (imageBase64: string) => void | Promise<void>;
  onCheckinComplete?: (result: {
    attendance: {
      id: string;
      employee_id: number;
      date: string;
      checkin_time: string | null;
      status: string;
      late_minutes: number;
      fine_amount: number;
      confidence: number;
      source: "face" | "manual";
      note?: string | null;
    };
    already: boolean;
  }) => void | Promise<void>;
  scanContext?: "enroll" | "checkin";
};

const DETECT_INTERVAL_MS = 170;
const FRAME_WIDTH = 640;
const FINAL_CAPTURE_WIDTH = 1280;
const ENROLL_HOLD_MS = 700;
const NO_FACE_TIMEOUT_MS = 2000;

function isCentered(bbox: [number, number, number, number], frameW: number, frameH: number) {
  const [x1, y1, x2, y2] = bbox;
  const cx = ((x1 + x2) / 2) / frameW;
  const cy = ((y1 + y2) / 2) / frameH;
  return Math.abs(cx - 0.5) <= 0.18 && Math.abs(cy - 0.5) <= 0.2;
}

function challengeLabel(challenge: string | null) {
  if (challenge === "blink") return "Blink once";
  if (challenge === "turn_head_left") return "Turn your head slightly left";
  if (challenge === "turn_head_right") return "Turn your head slightly right";
  return "Center your face";
}

export function CameraAutoCaptureModal({
  isOpen,
  title,
  onClose,
  onCapture,
  onCheckinComplete,
  scanContext = "checkin",
}: CameraAutoCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const submittedRef = useRef(false);
  const lastTickRef = useRef(0);
  const lastFaceSeenAtRef = useRef(0);
  const holdMsRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const challengeRef = useRef<string | null>(null);
  const challengeStartedAtRef = useRef<number | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [statusText, setStatusText] = useState("Starting camera...");
  const [instruction, setInstruction] = useState("Center your face");
  const [errorText, setErrorText] = useState("");
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;

    async function boot() {
      resetState();
      stopLoop();

      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorText("Camera is not supported in this browser.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (!mounted) return;
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await waitForVideo(video);
        if (!mounted) return;

        setCameraReady(true);
        lastFaceSeenAtRef.current = Date.now();
        setStatusText("Center your face");

        if (scanContext === "checkin") {
          const start = await apiClient.checkinStart({ device_info: navigator.userAgent });
          sessionIdRef.current = start.session_id;
          challengeRef.current = start.challenge_type;
          setInstruction("Center your face");
        } else {
          setInstruction("Center your face");
        }

        startLoop();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unable to open camera.";
        if (msg.toLowerCase().includes("permission")) {
          setErrorText("No camera permission. Please allow camera access.");
        } else {
          setErrorText(msg);
        }
      }
    }

    void boot();

    return () => {
      mounted = false;
      stopLoop();
      stopCamera();
      sessionIdRef.current = null;
    };
  }, [isOpen, scanContext]);

  function resetState() {
    busyRef.current = false;
    submittedRef.current = false;
    lastTickRef.current = 0;
    holdMsRef.current = 0;
    challengeStartedAtRef.current = null;
    setCameraReady(false);
    setStatusText("Starting camera...");
    setInstruction("Center your face");
    setErrorText("");
    setProgress(0);
    setSubmitting(false);
  }

  async function waitForVideo(video: HTMLVideoElement) {
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      await video.play();
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Camera stream is not ready."));
      }, 6000);

      const onReady = () => {
        if (video.videoWidth <= 0 || video.videoHeight <= 0) return;
        cleanup();
        resolve();
      };

      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener("loadedmetadata", onReady);
        video.removeEventListener("canplay", onReady);
      };

      video.addEventListener("loadedmetadata", onReady);
      video.addEventListener("canplay", onReady);
      void video.play().catch(() => {
        // Safari/Chrome can require gesture on some setups; retry via events above.
      });
    });
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function stopLoop() {
    if (loopRef.current) {
      window.clearTimeout(loopRef.current);
      loopRef.current = null;
    }
    busyRef.current = false;
  }

  function frameToBase64(maxWidth: number, quality: number) {
    const video = videoRef.current;
    if (!video) return null;
    const sourceW = video.videoWidth;
    const sourceH = video.videoHeight;
    if (!sourceW || !sourceH) return null;

    const targetW = Math.min(maxWidth, sourceW);
    const targetH = Math.round((sourceH / sourceW) * targetW);
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, targetW, targetH);
    return { imageBase64: canvas.toDataURL("image/jpeg", quality), width: targetW, height: targetH };
  }

  async function finalizeEnrollCapture() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    stopLoop();
    setSubmitting(true);
    setStatusText("Capturing...");
    try {
      const finalFrame = frameToBase64(FINAL_CAPTURE_WIDTH, 0.9);
      if (!finalFrame) throw new Error("Unable to capture frame.");
      await Promise.resolve(onCapture(finalFrame.imageBase64));
      onClose();
    } catch (err) {
      submittedRef.current = false;
      setSubmitting(false);
      setErrorText(err instanceof Error ? err.message : "Capture failed.");
      startLoop();
    }
  }

  async function finalizeCheckin() {
    if (submittedRef.current || !sessionIdRef.current) return;
    submittedRef.current = true;
    stopLoop();
    setSubmitting(true);
    setInstruction("Verified");
    setStatusText("Marking attendance...");
    try {
      const result = await apiClient.checkinComplete({ session_id: sessionIdRef.current });
      if (onCheckinComplete) {
        await Promise.resolve(onCheckinComplete({ attendance: result.attendance, already: result.already }));
      }
      onClose();
    } catch (err) {
      submittedRef.current = false;
      setSubmitting(false);
      setErrorText(err instanceof Error ? err.message : "Failed to mark attendance.");
      startLoop();
    }
  }

  function startLoop() {
    const tick = async () => {
      if (!isOpen || submittedRef.current) return;
      loopRef.current = window.setTimeout(tick, DETECT_INTERVAL_MS);

      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const frame = frameToBase64(FRAME_WIDTH, 0.75);
        if (!frame) {
          setStatusText("Waiting for camera frames...");
          return;
        }

        if (scanContext === "enroll") {
          const res = await apiClient.validateFaceScan(frame.imageBase64);
          if (res.ok && res.bbox && isCentered(res.bbox, frame.width, frame.height)) {
            const now = Date.now();
            const dt = lastTickRef.current ? Math.max(80, now - lastTickRef.current) : 120;
            holdMsRef.current += dt;
            lastTickRef.current = now;
            setStatusText("Hold still...");
            setProgress(Math.min(100, Math.round((holdMsRef.current / ENROLL_HOLD_MS) * 100)));
            if (holdMsRef.current >= ENROLL_HOLD_MS) {
              await finalizeEnrollCapture();
            }
          } else {
            const now = Date.now();
            holdMsRef.current = Math.max(0, holdMsRef.current - 140);
            setProgress(Math.min(100, Math.round((holdMsRef.current / ENROLL_HOLD_MS) * 100)));
            if (res.ok) {
              setStatusText("Center your face");
              lastFaceSeenAtRef.current = now;
              setErrorText("");
            } else {
              const elapsed = now - lastFaceSeenAtRef.current;
              if (elapsed >= NO_FACE_TIMEOUT_MS) {
                setErrorText("No face detected. Improve lighting and center your face.");
              } else {
                setErrorText("");
              }
              setStatusText("Searching for face...");
            }
          }
          return;
        }

        if (!sessionIdRef.current) {
          setErrorText("Check-in session not started.");
          return;
        }

        const response = await apiClient.checkinFrame({
          session_id: sessionIdRef.current,
          imageBase64: frame.imageBase64,
          timestamp: Date.now(),
        });

        setInstruction(response.instruction || challengeLabel(response.challenge_type));
        setStatusText(response.guidance_text || "Processing...");

        if (!response.ok) {
          if (response.state === "retry") {
            challengeStartedAtRef.current = null;
            setProgress(15);
            setErrorText(`${response.guidance_text} Retries left: ${response.retries_left}`);
            return;
          }
          if (response.state === "failed") {
            setErrorText(`${response.guidance_text} Retries left: 0`);
            stopLoop();
            return;
          }
          const elapsed = Date.now() - lastFaceSeenAtRef.current;
          if (elapsed >= NO_FACE_TIMEOUT_MS) {
            setErrorText(response.guidance_text || "No face detected.");
          } else {
            setErrorText("");
          }
          return;
        }

        setErrorText("");
        lastFaceSeenAtRef.current = Date.now();

        if (response.state === "aligning") {
          const hold = Number(response.hold_ms || 0);
          setProgress(Math.min(35, Math.round((hold / ENROLL_HOLD_MS) * 35)));
          challengeStartedAtRef.current = null;
        } else if (response.state === "challenge") {
          if (!challengeStartedAtRef.current) challengeStartedAtRef.current = Date.now();
          const elapsed = Date.now() - challengeStartedAtRef.current;
          const phaseProgress = Math.min(57, Math.round((elapsed / 3000) * 57));
          setProgress((prev) => Math.max(prev, 35 + phaseProgress));
        } else if (response.state === "verified" && response.verified) {
          setProgress(100);
          await finalizeCheckin();
        }
      } catch (err) {
        const raw = err instanceof Error ? err.message : "Scan failed.";
        const lower = raw.toLowerCase();
        if (lower.includes("failed to fetch")) {
          setErrorText("Backend not reachable. Verify API URL/CORS and server status.");
        } else if (lower.includes("not found")) {
          setErrorText("Check-in endpoint not found. Confirm backend routes are updated.");
        } else {
          setErrorText(raw);
        }
      } finally {
        busyRef.current = false;
      }
    };

    loopRef.current = window.setTimeout(tick, DETECT_INTERVAL_MS);
  }

  const ringCircumference = 2 * Math.PI * 50;
  const ringOffset = ringCircumference * (1 - progress / 100);
  const success = progress >= 100 && !errorText;

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            aria-label="Close camera modal"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/50"
            style={{ WebkitTapHighlightColor: "transparent" }}
          />

          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            onClick={(event) => event.stopPropagation()}
            className="relative w-full max-w-4xl overflow-hidden rounded-3xl bg-[rgb(var(--surface))] text-[rgb(var(--text))] shadow-2xl ring-1 ring-[rgb(var(--border))]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Face Attendance</div>
                <div className="text-lg font-bold text-[rgb(var(--text))]">{title}</div>
              </div>
              <Button variant="secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
            </div>

            <div className="p-5">
              <div className="relative h-[58vh] w-full overflow-hidden rounded-2xl bg-black">
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                  playsInline
                  muted
                />

                <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <svg width="280" height="280" viewBox="0 0 120 120" className="drop-shadow-[0_8px_20px_rgba(0,0,0,0.35)]">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="4" />
                    <motion.circle
                      cx="60"
                      cy="60"
                      r="50"
                      fill="none"
                      stroke={success ? "#34d399" : "#22d3ee"}
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringOffset}
                      initial={false}
                      animate={{ strokeDashoffset: ringOffset }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      transform="rotate(-90 60 60)"
                    />
                  </svg>
                </div>

                <div
                  className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/70"
                  style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.26)" }}
                />

                <div className="pointer-events-none absolute inset-x-3 bottom-3">
                  <div className="rounded-2xl border border-white/30 bg-black/45 px-4 py-3 text-white backdrop-blur-md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2.5">
                        {success ? (
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                        ) : (
                          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" />
                        )}
                        <div>
                          <p className="text-base font-bold sm:text-lg">{instruction}</p>
                          <p className="mt-1 text-xs text-white/85">{errorText || statusText}</p>
                        </div>
                      </div>
                      <div className="rounded-full border border-white/40 bg-white/10 px-3 py-1 text-sm font-semibold">
                        {cameraReady ? `${progress}%` : "..."}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
