export function parseValidTimestamp(iso: string | null | undefined): number | null {
  if (!iso || iso.trim().length === 0) {
    return null;
  }
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const parsed = parseValidTimestamp(iso);
  if (parsed === null) {
    return "";
  }
  const delta = Math.max(0, now - parsed);
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
