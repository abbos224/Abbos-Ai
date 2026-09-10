/** Shared display formatters for real numbers/dates shown across Analytics screens — extracted
 * once a second real caller (VideoAnalyticsScreen) needed the exact same formatting as
 * AnalyticsScreen, matching this app's own established extraction threshold (pull out once reuse
 * is real, not preemptively). */

// The BCP-47 locale used by every date formatter below. Kept as a module-level value (not a
// param threaded through ~7 screens) and updated by LanguageContext whenever the app language
// changes, so `toLocaleDateString` follows the app's language rather than the device's.
let dateLocale: string | undefined;

export function setDateLocale(locale: string | undefined): void {
  dateLocale = locale;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** A short weekday + day label (calendar section headers, schedule chips). */
export function formatDayLabel(iso: string): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(dateLocale, { weekday: 'short', month: 'short', day: 'numeric' });
}
