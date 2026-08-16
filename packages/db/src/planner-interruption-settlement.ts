export type PlannerInterruptionSession = {
  hasOpenDowntime: boolean
  measurementMethod: "counter" | "weight"
  sessionReference: string
}

export function plannerInterruptionRequirement({
  keepsWorkOnMachine,
  session,
}: {
  keepsWorkOnMachine: boolean
  session: PlannerInterruptionSession | null
}) {
  if (!session) return { blocked: false } as const

  if (keepsWorkOnMachine) {
    return session.hasOpenDowntime
      ? ({ blocked: false } as const)
      : ({
          blocked: true,
          message: `Start downtime on Production Session ${session.sessionReference} at the actual interruption time, then retry this Planner Action.`,
        } as const)
  }

  const method = session.measurementMethod === "counter"
    ? "Machine Counter"
    : "Weight"
  return {
    blocked: true,
    message: `Close Production Session ${session.sessionReference} using ${method} at the actual interruption time, then retry this Planner Action.`,
  } as const
}
