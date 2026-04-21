import { toFileUrl } from "../services/apiClient";

type AvatarProps = {
  name: string;
  src?: string;
  size?: number;
};

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function Avatar({ name, src, size = 44 }: AvatarProps) {
  const resolved = src ? toFileUrl(src) : "";

  return (
    <div
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] ring-2 ring-[rgb(var(--surface-elevated))]"
      aria-label={`Avatar for ${name}`}
      title={name}
    >
      {resolved ? (
        <img src={resolved} alt={name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="text-xs font-semibold text-[rgb(var(--text-soft))]">{initialsFromName(name)}</span>
      )}
    </div>
  );
}
