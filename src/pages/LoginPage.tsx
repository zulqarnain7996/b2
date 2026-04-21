import { FormEvent, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Building2, LockKeyhole, ScanFace, Sparkles } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/feedback/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const quickItems = [
  { icon: <ScanFace className="h-4 w-4" />, label: "Face attendance" },
  { icon: <Building2 className="h-4 w-4" />, label: "Staff operations" },
  { icon: <LockKeyhole className="h-4 w-4" />, label: "Secure access" },
];

export function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const suggestedAdmin = useMemo(() => "admin@visiontrack.pro", []);
  const suggestedEmployee = useMemo(() => "john@visiontrack.pro", []);

  if (!loading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) return;

    setSubmitting(true);
    setError("");

    try {
      await login(email.trim(), password);
      toast.success("Signed in successfully.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Login failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function pickDemo(which: "admin" | "employee") {
    setError("");
    setPassword("");
    setEmail(which === "admin" ? suggestedAdmin : suggestedEmployee);
  }

  return (
    <section className="relative h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_20%,rgba(34,211,238,0.18),transparent_22%),radial-gradient(circle_at_84%_18%,rgba(59,130,246,0.22),transparent_24%),radial-gradient(circle_at_52%_82%,rgba(14,165,233,0.10),transparent_22%),linear-gradient(135deg,#050b14_0%,#081523_32%,#0b1d33_62%,#07111d_100%)]" />

      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 top-12 h-80 w-80 rounded-full bg-cyan-400/16 blur-3xl"
        animate={{ x: [0, 26, 0], y: [0, -14, 0], scale: [1, 1.06, 1] }}
        transition={{ duration: 12, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-4rem] top-[-4rem] h-[26rem] w-[26rem] rounded-full bg-blue-500/18 blur-3xl"
        animate={{ x: [0, -22, 0], y: [0, 18, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 14, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-8rem] left-[34%] h-72 w-72 rounded-full bg-sky-400/10 blur-3xl"
        animate={{ y: [0, -24, 0], x: [0, 10, 0] }}
        transition={{ duration: 16, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40"
        animate={{ backgroundPosition: ["0% 0%", "100% 100%"] }}
        transition={{ duration: 22, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
        style={{
          backgroundImage:
            "linear-gradient(125deg, rgba(255,255,255,0.02) 0%, transparent 36%, rgba(56,189,248,0.06) 50%, transparent 68%, rgba(255,255,255,0.02) 100%)",
          backgroundSize: "220% 220%",
        }}
      />

      <div className="pointer-events-none absolute inset-0 opacity-[0.14]">
        <div className="h-full w-full bg-[linear-gradient(rgba(148,163,184,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.18)_1px,transparent_1px)] bg-[size:38px_38px]" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_50%,rgba(2,6,23,0.48)_100%)]" />

      <div className="relative mx-auto flex h-full max-w-7xl items-center px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid w-full items-center gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="relative"
          >
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-200 backdrop-blur-xl">
                <Sparkles className="h-3.5 w-3.5" />
                by Iqra Virtual School
              </div>

              <div className="mt-6 flex items-center gap-4">
                <div className="grid h-16 w-16 place-items-center rounded-[24px] bg-gradient-to-br from-blue-600 via-sky-500 to-cyan-400 text-lg font-bold text-white shadow-[0_24px_52px_rgba(37,99,235,0.45)]">
                  IVS
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">IVS AttendPro</p>
                  <p className="mt-1 text-sm text-slate-400">Smart attendance. Clear operations.</p>
                </div>
              </div>

              <h1 className="mt-8 text-4xl font-semibold leading-[0.98] tracking-[-0.05em] text-white sm:text-5xl lg:text-[4.4rem]">
                A sharper login experience for school teams.
              </h1>

              <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">
                Secure access to daily attendance, reporting, and staff workflows in one refined school operations portal.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                {quickItems.map((item) => (
                  <div
                    key={item.label}
                    className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/7 px-4 py-2.5 text-sm font-medium text-slate-200 backdrop-blur-xl"
                  >
                    <span className="text-sky-300">{item.icon}</span>
                    {item.label}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 34, scale: 0.93 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.14, ease: "easeOut" }}
            className="flex justify-center lg:justify-end"
          >
            <div className="relative w-full max-w-[440px] overflow-hidden rounded-[34px] border border-white/14 bg-white/10 p-6 shadow-[0_32px_90px_rgba(2,6,23,0.55)] backdrop-blur-2xl sm:p-7">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_34%)]" />
              <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/70 to-transparent" />

              <div className="relative">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Secure Sign In</p>
                    <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white">Welcome back</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300">Enter your credentials to continue into IVS AttendPro.</p>
                  </div>
                  <div className="hidden rounded-[20px] border border-white/10 bg-white/8 p-3 text-sky-200 sm:block">
                    <Building2 className="h-5 w-5" />
                  </div>
                </div>

                <form onSubmit={onSubmit} className="mt-7 space-y-4">
                  <Input
                    label="Email Address"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />

                  <Input
                    label="Password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />

                  {error ? (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-950/25 px-3 py-2 text-sm text-rose-200">
                      {error}
                    </div>
                  ) : null}

                  <Button
                    type="submit"
                    loading={submitting}
                    block
                    size="lg"
                    className="h-12 rounded-2xl text-sm font-semibold shadow-[0_18px_44px_rgba(37,99,235,0.32)]"
                  >
                    {submitting ? "Authenticating..." : "Sign In to IVS AttendPro"}
                  </Button>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Button type="button" variant="secondary" size="sm" onClick={() => pickDemo("admin")} className="rounded-xl">
                      Admin Demo
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => pickDemo("employee")} className="rounded-xl">
                      Staff Demo
                    </Button>
                  </div>
                </form>

                <div className="mt-6 flex items-center gap-2 text-sm text-slate-400">
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  Protected school access
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
