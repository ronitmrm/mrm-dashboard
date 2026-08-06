import { describe, expect, test } from "vitest"

import {
  canonicalRecruitmentInterviewRound,
  nextRecruitmentInterviewRound,
  recruitmentInterviewRounds,
  scoreRecruitmentInterview,
} from "./recruitment-interview-workflow"

describe("recruitment interview workflow", () => {
  test("defines exactly three ordered rounds with five questions each", () => {
    expect(recruitmentInterviewRounds.map((round) => round.name)).toEqual([
      "Screening Round",
      "Technical Round",
      "HR Round",
    ])
    expect(
      recruitmentInterviewRounds.every((round) => round.questions.length === 5)
    ).toBe(true)
  })

  test("only advances after the current round is approved", () => {
    expect(nextRecruitmentInterviewRound([])?.name).toBe("Screening Round")
    expect(
      nextRecruitmentInterviewRound([
        { roundName: "Screening Round", status: "Hold" },
      ])?.name
    ).toBe("Screening Round")
    expect(
      nextRecruitmentInterviewRound([
        { roundName: "Screening Round", status: "Approved" },
      ])?.name
    ).toBe("Technical Round")
  })

  test("recognizes approved legacy round names without losing progress", () => {
    expect(canonicalRecruitmentInterviewRound("Department Round")).toBe(
      "Technical Round"
    )
    expect(
      nextRecruitmentInterviewRound([
        { roundName: "Screening Round", status: "Approved" },
        { roundName: "Management Round", status: "Approved" },
      ])?.name
    ).toBe("HR Round")
  })

  test("calculates the overall score from every required question", () => {
    const result = scoreRecruitmentInterview("Screening Round", {
      availability_suitability: "3",
      communication_clarity: "4",
      relevant_experience: "5",
      role_understanding: "4",
      screening_recommendation: "5",
    })

    expect(result.overall).toBe(4.2)
    expect(result.questionScores.relevant_experience).toBe(5)
  })

  test("rejects an incomplete assessment", () => {
    expect(() =>
      scoreRecruitmentInterview("Technical Round", {
        technical_knowledge: 5,
      })
    ).toThrow(/Score is required/)
  })
})
