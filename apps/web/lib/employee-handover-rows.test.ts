import { expect, it } from "vitest"
import type { RecruitmentPostRow } from "@workspace/db"
import { employeeHandoverRows } from "./employee-handover-rows"

it("shows both employee identities during handover and removes only the outgoing row after notice", () => {
  const post: RecruitmentPostRow = {
    id: "post", postCode: "OCMM-AS-1", vacancyCode: "OCMM-AS-1", vacancyNumber: "1",
    department: "Maintenance", departmentCode: "MM", designation: "Assistant",
    combinedRoleId: null, combinedRoleName: null, combinedVacancyCode: null,
    isPrimaryCombinedPost: false, requirementTemplateCode: null,
    employeeName: "Narendra", employeeCode: "205", status: "Occupied",
    joiningDate: "2026-09-14", lastWorkingDate: null, joiningConfirmationDue: false,
    replacementAppointments: [{
      id: "replacement", employeeName: "Narendra", employeeCode: "205", status: "Joined",
      appointedAt: "2026-09-10", completedAt: "2026-09-14",
      outgoingEmployeeName: "Dhruv", outgoingEmployeeCode: "69",
      outgoingLastWorkingDate: "2026-09-26", outgoingStillEmployed: true,
    }],
  }
  const pendingRows = employeeHandoverRows([{
    ...post, employeeName: "Dhruv", employeeCode: "69", status: "Resigned",
    lastWorkingDate: "2026-09-26",
    replacementAppointments: [{ ...post.replacementAppointments![0]!,
      status: "Pending", employeeCode: null, joiningDate: "2026-09-15",
      completedAt: null, outgoingStillEmployed: false,
    }],
  }])
  expect(pendingRows).toHaveLength(2)
  expect(pendingRows[0]).toMatchObject({ employeeName: "Dhruv", employeeCode: "69", status: "Resigned" })
  expect(pendingRows[1]).toMatchObject({
    id: "pending:replacement", postCode: "OCMM-AS-1", employeeName: "Narendra",
    employeeCode: null, status: "Appointed", joiningDate: "2026-09-15", lastWorkingDate: null,
  })
  expect(employeeHandoverRows([post]).map(({ employeeCode }) => employeeCode)).toEqual(["205", "69"])
  post.replacementAppointments![0]!.outgoingStillEmployed = false
  expect(employeeHandoverRows([post])).toEqual([post])
  expect(post.replacementAppointments).toHaveLength(1)
})
