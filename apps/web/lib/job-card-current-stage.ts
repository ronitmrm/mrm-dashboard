type Row = Record<string, unknown>
const text = (value: unknown) => String(value ?? "").trim()
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0

export function jobCardCurrentStage({ analytics, sessions, setupTimings, selectedRoute, receipts, planRows }: {
  analytics: Row
  sessions: Row[]
  setupTimings: Row[]
  selectedRoute: Row | undefined
  receipts: Row[]
  planRows: Row[]
}) {
  return number(analytics.completionPercent) >= 100
    ? "Production complete"
    : sessions.some((row) => text(row.status) === "open") || planRows.some((row) => text(row.runningStatus).toLowerCase() === "running")
      ? "Production running"
      : number(analytics.operationGoodPieces) > 0 || number(analytics.actualGoodPieces) > 0
        ? "Production"
        : setupTimings.some((row) => row.qualityApprovedAt)
          ? "Ready for production"
          : setupTimings.some((row) => row.settingCompletedAt)
            ? "Awaiting quality approval"
            : setupTimings.some((row) => row.settingStartedAt)
              ? "Setup in progress"
              : !selectedRoute
                ? "Part readiness"
                : receipts.length === 0
                  ? "Awaiting raw material"
                  : "Ready for setup"
}
