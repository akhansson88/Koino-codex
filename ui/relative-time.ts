const timeFormatter = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" });
const dateFormatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

function localStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayDifference(from: Date, to: Date) {
  return Math.round((localStartOfDay(to) - localStartOfDay(from)) / 86400000);
}

export function formatRelativeTime(value: string, currentDate = new Date()) {
  const date = new Date(value);
  const created = date.getTime();
  if (Number.isNaN(created)) return "";

  const dayDiff = dayDifference(date, currentDate);
  if (dayDiff === 0) {
    const seconds = Math.max(0, Math.floor((currentDate.getTime() - created) / 1000));
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `Today at ${timeFormatter.format(date)}`;
  }

  if (dayDiff === 1) return `Yesterday at ${timeFormatter.format(date)}`;
  return dateFormatter.format(date);
}
