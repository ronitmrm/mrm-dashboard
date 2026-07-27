export function nextDashboardPollDelay(
  pollIntervalMs: number,
  visibilityState: DocumentVisibilityState
) {
  if (pollIntervalMs <= 0 || visibilityState === "hidden") return null
  return pollIntervalMs
}
