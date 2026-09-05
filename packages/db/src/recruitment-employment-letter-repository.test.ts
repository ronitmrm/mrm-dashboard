import type { Pool } from "pg"
import { describe, expect, it, vi } from "vitest"

import { createRecruitmentEmploymentLetterRepository } from "./recruitment-employment-letter-repository"

describe("recruitment employment letter repository", () => {
  it("lists only offer letters linked to the selected candidate", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          application_id: "application-1",
          department: "Human Resources",
          designation: "HOD",
          details: {},
          employee_code: null,
          employee_name: "Harsh Maniar",
          file_available: true,
          id: "letter-1",
          issued_on: "2026-09-04",
          joining_date: "2026-09-15",
          last_working_date: null,
          letter_type: "offer",
          post_code: "HR-HO-2",
          post_id: "post-1",
          reference_number: "MRMPL-HR-202627-OL-1",
        },
      ],
    })
    const repository = createRecruitmentEmploymentLetterRepository({
      pool: { query } as unknown as Pool,
    })

    await expect(
      repository.listForCandidate("organization-1", "candidate-1")
    ).resolves.toEqual([
      expect.objectContaining({
        id: "letter-1",
        letterType: "offer",
        referenceNumber: "MRMPL-HR-202627-OL-1",
      }),
    ])
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(
        /application\.candidate_id = \$2[\s\S]*letter\.letter_type = 'offer'/
      ),
      ["organization-1", "candidate-1"]
    )
  })
})
