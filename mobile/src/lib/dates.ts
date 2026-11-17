/** The phone's date as "2026-11-14". */
export function localTodayIso(now: Date = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** The phone's time zone, e.g. "Europe/Bucharest", sent to the server in X-Time-Zone. */
export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
