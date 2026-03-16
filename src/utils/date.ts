export function localYmd(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfMonthLocal(year: number, monthIndex0: number): Date {
  return new Date(year, monthIndex0, 1);
}

export function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const topbarDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

export function formatTopbarDateTime(now: Date): string {
  const parts = topbarDateTimeFormatter.formatToParts(now);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  const weekday = map.get("weekday") ?? "";
  const day = map.get("day") ?? "";
  const month = map.get("month") ?? "";
  const year = map.get("year") ?? "";
  const hour = map.get("hour") ?? "";
  const minute = map.get("minute") ?? "";
  const dayPeriod = (map.get("dayPeriod") ?? "").toLowerCase();
  return `${weekday}, ${day} ${month} ${year} ${hour}:${minute} ${dayPeriod}`.trim();
}
