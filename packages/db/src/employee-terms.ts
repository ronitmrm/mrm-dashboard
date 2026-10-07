type Assignment = {
  id: string
  employeeCode: string | null
  joinedOn: string | null
  endedOn: string | null
}

export function groupEmployeeTerms<T extends Assignment>(assignments: T[]) {
  const byCode = new Map<string, T[]>()
  for (const assignment of assignments) {
    const code = assignment.employeeCode?.trim()
    if (!code) continue
    const rows = byCode.get(code) ?? []
    rows.push(assignment)
    byCode.set(code, rows)
  }
  const groups: Array<{
    anchorId: string
    employeeCode: string
    joinedOn: string | null
    endedOn: string | null
    assignments: T[]
  }> = []
  for (const [employeeCode, rows] of byCode) {
    rows.sort((left, right) =>
      (left.joinedOn ?? "9999-12-31").localeCompare(right.joinedOn ?? "9999-12-31") ||
      left.id.localeCompare(right.id)
    )
    let current: (typeof groups)[number] | null = null
    for (const assignment of rows) {
      const overlaps = current && assignment.joinedOn && (
        current.endedOn === null ||
        assignment.joinedOn < current.endedOn ||
        assignment.joinedOn === current.joinedOn
      )
      const undatedCurrent = current && !assignment.joinedOn && !assignment.endedOn && current.endedOn === null
      if (!overlaps && !undatedCurrent) {
        current = {
          anchorId: assignment.id,
          employeeCode,
          joinedOn: assignment.joinedOn,
          endedOn: assignment.endedOn,
          assignments: [],
        }
        groups.push(current)
      }
      current!.assignments.push(assignment)
      if (current!.endedOn !== null) {
        current!.endedOn = assignment.endedOn === null
          ? null
          : current!.endedOn! > assignment.endedOn ? current!.endedOn : assignment.endedOn
      }
    }
  }
  return groups
}
