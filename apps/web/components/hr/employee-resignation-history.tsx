import type { RecruitmentEmployeeAssignmentRow } from "@workspace/db"
import { formatCalendarDate } from "@workspace/ui/lib/calendar-date"

import { RecordDetails } from "../ui/golden-patterns"
import { formatIstDateTime } from "../../lib/date-time"

export function EmployeeResignationHistory({ history }: {
  history: RecruitmentEmployeeAssignmentRow["resignationHistory"]
}) {
  return history?.length ? (
    <div className="grid min-w-64 gap-4">
      {history.map((entry, index) => (
        <RecordDetails key={`${entry.recordedAt}-${index}`} items={[
          { label: entry.type, value: formatIstDateTime(entry.recordedAt) },
          { label: "Planned Last Working Date", value: formatCalendarDate(entry.lastWorkingDate ?? "Not recorded") },
          { label: "Reason", value: entry.note ?? "—" },
        ]} />
      ))}
    </div>
  ) : null
}
