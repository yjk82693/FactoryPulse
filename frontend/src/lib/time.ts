export function relativeTime(iso: string, now = Date.now()): string {
  const delta = Math.max(0, now - Date.parse(iso));
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function localTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function elapsedMs(startedAt: string | null, now = Date.now()): number | null {
  if (!startedAt) {
    return null;
  }
  return Math.max(0, now - Date.parse(startedAt));
}
