import { Rocket, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type WelcomeModalProps = {
  isOpen: boolean;
  name: string;
  role: string;
  onClose: () => void;
  onQuickTour?: () => void;
};

export function WelcomeModal({ isOpen, name, role, onClose, onQuickTour }: WelcomeModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      width="md"
      title="Welcome to IVS AttendPro"
      footer={
        <>
          {onQuickTour ? (
            <Button variant="secondary" onClick={onQuickTour}>
              Quick tour
            </Button>
          ) : null}
          <Button onClick={onClose}>Lets go</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="mx-auto grid h-28 w-28 place-items-center rounded-3xl bg-gradient-to-br from-blue-500/20 via-cyan-500/15 to-emerald-500/20 ring-1 ring-[rgb(var(--border))]">
          <svg viewBox="0 0 120 120" className="h-20 w-20" aria-hidden="true">
            <circle cx="60" cy="60" r="40" fill="#0f172a" opacity="0.08" />
            <circle cx="60" cy="48" r="18" fill="#22c55e" opacity="0.85" />
            <rect x="36" y="70" width="48" height="26" rx="13" fill="#0284c7" opacity="0.88" />
            <circle cx="54" cy="46" r="2.7" fill="#fff" />
            <circle cx="66" cy="46" r="2.7" fill="#fff" />
            <path d="M52 54c2.2 3 13.8 3 16 0" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>

        <div className="space-y-2 text-center">
          <p className="text-lg font-semibold text-[rgb(var(--text))]">Assalam o Alaikum, {name} 👋</p>
          <p className="text-sm text-[rgb(var(--muted))]">
            Youre logged in as <span className="font-semibold capitalize text-[rgb(var(--text))]">{role}</span>. Ready to manage attendance.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm">
            <Sparkles className="h-4 w-4 text-blue-500" />
            Clean dashboard controls
          </div>
          <div className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm">
            <Rocket className="h-4 w-4 text-emerald-500" />
            Fast attendance insights
          </div>
        </div>
      </div>
    </Modal>
  );
}
