type Row = Record<string, unknown>

export type CarriedDowntimeRow = {
  carryResolvedAt: string
  endedAt: string
  eventId: string
  machineNumber: string
  reasonCode: string
  reasonName: string
  session: Row
  startedAt: string
  state: "carried" | "open"
}

function text(value: unknown) {
  return String(value ?? "").trim()
}

function rows(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Row =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item)
      )
    : []
}

type Candidate = CarriedDowntimeRow & {
  endOutcome: string
  sortTime: string
}

export function carriedDowntimeRows(sessions: readonly Row[]) {
  const byMachine = new Map<string, Candidate[]>()

  for (const session of sessions) {
    const machineNumber = text(session.machineNumber)
    const key = machineNumber.toLocaleLowerCase("en-IN")
    if (!key) continue
    for (const event of rows(session.downtimeEvents)) {
      const candidate: Candidate = {
        carryResolvedAt: text(event.carryResolvedAt),
        endedAt: text(event.endedAt),
        endOutcome: text(event.endOutcome),
        eventId: text(event.id),
        machineNumber,
        reasonCode: text(event.reasonCode),
        reasonName: text(event.reasonName),
        session,
        sortTime: text(event.startedAt),
        startedAt: text(event.startedAt),
        state: event.endedAt ? "carried" : "open",
      }
      byMachine.set(key, [...(byMachine.get(key) ?? []), candidate])
    }
  }

  const carried: CarriedDowntimeRow[] = []
  for (const events of byMachine.values()) {
    let active: Candidate | undefined
    for (const event of events.sort((left, right) =>
      left.sortTime.localeCompare(right.sortTime)
    )) {
      if (
        event.endOutcome === "shift_end_unresolved" &&
        !event.carryResolvedAt
      ) {
        active = { ...event, state: "carried" }
      } else if (!event.endedAt && active) {
        active = { ...event, state: "open" }
      } else if (event.endOutcome === "resolved" && active) {
        active = undefined
      }
    }
    if (active) carried.push(active)
  }

  return carried.sort((left, right) =>
    left.machineNumber.localeCompare(right.machineNumber, "en-IN", {
      numeric: true,
    })
  )
}
