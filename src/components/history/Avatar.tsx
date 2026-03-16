import { cn } from "@/lib/utils";
import { toFileUrl } from "@/services/apiClient";

type AvatarProps = {
  name?: string | null;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

function initialsFromName(name?: string | null) {
  if (!name) return "NA";
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "NA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function Avatar({ name, photoUrl, size = "md", className }: AvatarProps) {
  const dims = {
    sm: "h-9 w-9 text-xs",
    md: "h-12 w-12 text-sm",
    lg: "h-16 w-16 text-base",
  }[size];
  const src = photoUrl ? toFileUrl(photoUrl) : "";

  if (src) {
    return (
      <img
        src={src}
        alt={name || "Profile"}
        className={cn("rounded-2xl border border-[rgb(var(--border))] object-cover shadow-sm", dims, className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "grid place-items-center rounded-2xl border border-[rgb(var(--border))] font-semibold text-[rgb(var(--text))] shadow-sm",
        dims,
        className,
      )}
      style={{ background: "color-mix(in srgb, rgb(var(--surface)) 82%, rgb(var(--primary)) 18%)" }}
      aria-label={name || "Profile"}
      title={name || "Profile"}
    >
      {initialsFromName(name)}
    </div>
  );
}
