import { FormEvent, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/feedback/ToastProvider";
import { Button } from "@/components/ui/Button";
import { CardSection } from "@/components/ui/CardSection";
import { Input } from "@/components/ui/Input";

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
    <section className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-50 via-blue-50/60 to-slate-100" />
      <div className="pointer-events-none absolute left-1/2 top-[-130px] h-[420px] w-[860px] -translate-x-1/2 rounded-full bg-blue-200/40 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-170px] left-[-160px] h-[420px] w-[420px] rounded-full bg-cyan-200/30 blur-3xl" />

      <div className="relative grid min-h-screen place-items-center px-4 py-10">
        <div className="w-full max-w-md">
          <CardSection className="rounded-3xl border border-white/80 bg-white/85 p-8 shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur-xl">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-sm font-bold text-white">
                VT
              </div>
              <h1 className="text-2xl font-semibold text-slate-900">VisionTrack Pro</h1>
              <p className="mt-1 text-sm text-slate-500">Secure attendance platform</p>
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
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <Button type="submit" loading={submitting} block size="lg">
                {submitting ? "Authenticating..." : "Sign In"}
              </Button>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button type="button" variant="secondary" size="sm" onClick={() => pickDemo("admin")}>
                  Use Admin Email
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => pickDemo("employee")}>
                  Use User Email
                </Button>
              </div>
            </form>
          </CardSection>
        </div>
      </div>
    </section>
  );
}
