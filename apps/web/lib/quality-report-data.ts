import "server-only"
import {
  createQualityReportRepository,
  createRecruitmentRepository,
} from "@workspace/db"
import { isIsoCalendarDate } from "@workspace/ui/lib/calendar-date"
import { redirect } from "next/navigation"
import { readAuthEnvironment } from "./auth/auth"
import type { UnifiedNavigationAccess } from "./auth/unified-navigation-access"
import { istDateValue } from "./date-time"
import { qualityReportFloors } from "./quality-reports"
import {
  productionQualityOptions,
  sharedEmployeeMasterRows,
} from "./shared-employee-master"

export type QualityReportQuery = { from?: string; to?: string; unit?: string }
export async function loadQualityReports(
  access: UnifiedNavigationAccess,
  query: QualityReportQuery
) {
  const floors = qualityReportFloors(access)
  if (!floors.length) redirect("/unauthorized")
  const from = query.from || istDateValue()
  const to = query.to || istDateValue()
  if (!isIsoCalendarDate(from) || !isIsoCalendarDate(to) || from > to)
    throw new Error("Select a valid date range; From must be on or before To.")
  const unit = query.unit || ""
  if (unit && !floors.some((floor) => floor.code === unit))
    redirect("/unauthorized")
  const repository = createQualityReportRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const recruitment = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await recruitment.organizationIdForCode("MRMPL")
    const employees = sharedEmployeeMasterRows(
      await recruitment.listPosts(organizationId)
    )
    const selectedFloors = floors.filter(
      (floor) => !unit || floor.code === unit
    )
    const data = await repository.load({
      from,
      to,
      floors: selectedFloors.map((floor) => floor.code),
      inspectors: [
        ...new Set(
          selectedFloors.flatMap((floor) =>
            productionQualityOptions(employees, floor.code).map(
              (person) => person.name
            )
          )
        ),
      ],
    })
    return { data, from, to, unit, floors }
  } finally {
    await Promise.all([repository.close(), recruitment.close()])
  }
}
