import { expect, it } from "vitest"
import type { RecruitmentPostRow } from "@workspace/db"
import { employeeAssignmentForPost, employeeHandoverRows, employeeLettersForPost } from "./employee-handover-rows"

const letterPost = {
  id: "post", appointedApplicationId: "current-application", status: "Appointed",
  employeeName: "Current Employee", employeeCode: null, joiningDate: "2026-10-22",
}
const currentOffer = {
  applicationId: letterPost.appointedApplicationId, postId: letterPost.id,
  employeeName: letterPost.employeeName, employeeCode: null,
  joiningDate: letterPost.joiningDate, letterType: "offer" as const,
}

it("shows only the current appointment's offers and joined term's letters", () => {
  const formerOffer = { ...currentOffer, applicationId: "former-application", employeeName: "Former Employee" }
  const appointment = { ...currentOffer, employeeCode: "100", letterType: "appointment" as const }
  const earlierTerm = { ...appointment, joiningDate: "2024-01-01" }
  expect(employeeLettersForPost(letterPost, [formerOffer, currentOffer])).toEqual([currentOffer])
  expect(employeeLettersForPost(
    { ...letterPost, employeeCode: "100", status: "Occupied" },
    [earlierTerm, appointment, currentOffer]
  )).toEqual([appointment, currentOffer])
})

it("shows no employment letters when the post is vacant", () => {
  expect(employeeLettersForPost({ ...letterPost, status: "Vacant" }, [currentOffer])).toEqual([])
})

it("matches Employee Data and probation to the displayed joined term", () => {
  const post = { postCode: "HR-AS-1", employeeCode: "65", joiningDate: "2026-09-01", lastWorkingDate: null, status: "Occupied" }
  const earlier = { id: "earlier-term", postCode: post.postCode, employeeCode: "65", joinedOn: "2022-09-01", endedOn: "2024-01-01" }
  const current = { ...earlier, id: "current-term", joinedOn: post.joiningDate, endedOn: null, probationDueOn: "2026-10-01" }
  expect(employeeAssignmentForPost(post, [earlier, current])).toBe(current)
  expect(employeeAssignmentForPost({ ...post, joiningDate: null }, [earlier, current])).toBe(current)
  expect(employeeAssignmentForPost({ ...post, status: "Appointed" }, [current])).toBeUndefined()
})

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
    id: "pending:replacement", sourcePostId: "post", postCode: "OCMM-AS-1", employeeName: "Narendra",
    employeeCode: null, status: "Appointed", joiningDate: "2026-09-15", lastWorkingDate: null,
  })
  expect(employeeHandoverRows([post]).map(({ employeeCode }) => employeeCode)).toEqual(["205", "69"])
  post.replacementAppointments![0]!.outgoingStillEmployed = false
  expect(employeeHandoverRows([post])).toEqual([post])
  expect(post.replacementAppointments).toHaveLength(1)
})
