export type RecruitmentInterviewQuestion = {
  id: string
  prompt: string
}

export const recruitmentInterviewRounds = [
  {
    name: "Screening Round",
    questions: [
      {
        id: "relevant_experience",
        prompt: "Relevant experience for the position",
      },
      {
        id: "communication_clarity",
        prompt: "Communication clarity and confidence",
      },
      {
        id: "role_understanding",
        prompt: "Understanding of the role and responsibilities",
      },
      {
        id: "availability_suitability",
        prompt: "Notice period, salary, and availability suitability",
      },
      {
        id: "screening_recommendation",
        prompt: "Overall screening recommendation",
      },
    ],
  },
  {
    name: "Technical Round",
    questions: [
      {
        id: "technical_knowledge",
        prompt: "Technical knowledge required for the position",
      },
      {
        id: "practical_problem_solving",
        prompt: "Practical problem-solving ability",
      },
      {
        id: "process_equipment_knowledge",
        prompt: "Knowledge of relevant processes, tools, or equipment",
      },
      {
        id: "quality_safety_awareness",
        prompt: "Quality and safety awareness",
      },
      {
        id: "independent_working",
        prompt: "Ability to perform the work independently",
      },
    ],
  },
  {
    name: "HR Round",
    questions: [
      {
        id: "team_fit",
        prompt: "Team and organization fit",
      },
      {
        id: "reliability_discipline",
        prompt: "Reliability and work discipline",
      },
      {
        id: "motivation_retention",
        prompt: "Motivation and long-term intent",
      },
      {
        id: "policy_shift_acceptance",
        prompt: "Acceptance of policies, shift, and work location",
      },
      {
        id: "final_hiring_recommendation",
        prompt: "Final hiring recommendation",
      },
    ],
  },
] as const

export type RecruitmentInterviewRoundName =
  (typeof recruitmentInterviewRounds)[number]["name"]

const legacyRoundAliases = new Map<string, RecruitmentInterviewRoundName>([
  ["Screening Round", "Screening Round"],
  ["Department Round", "Technical Round"],
  ["Management Round", "Technical Round"],
  ["Technical Round", "Technical Round"],
  ["Final HR Round", "HR Round"],
  ["HR Round", "HR Round"],
])

export function canonicalRecruitmentInterviewRound(
  roundName: string | null | undefined
): RecruitmentInterviewRoundName | null {
  return legacyRoundAliases.get(String(roundName ?? "").trim()) ?? null
}

export function recruitmentInterviewRound(
  roundName: string | null | undefined
) {
  const canonical = canonicalRecruitmentInterviewRound(roundName)
  return (
    recruitmentInterviewRounds.find((round) => round.name === canonical) ?? null
  )
}

export function nextRecruitmentInterviewRound(
  interviews: ReadonlyArray<{ roundName: string; status: string }>
) {
  const approvedRounds = new Set(
    interviews
      .filter((interview) => interview.status === "Approved")
      .map((interview) =>
        canonicalRecruitmentInterviewRound(interview.roundName)
      )
      .filter(
        (roundName): roundName is RecruitmentInterviewRoundName =>
          roundName !== null
      )
  )
  return (
    recruitmentInterviewRounds.find(
      (round) => !approvedRounds.has(round.name)
    ) ?? null
  )
}

export function scoreRecruitmentInterview(
  roundName: string,
  rawScores: Record<string, unknown>
) {
  const round = recruitmentInterviewRound(roundName)
  if (!round) throw new Error("Interview round is invalid.")

  const questionScores: Record<string, number> = {}
  for (const question of round.questions) {
    const score = Number(rawScores[question.id])
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new Error(`Score is required for: ${question.prompt}.`)
    }
    questionScores[question.id] = score
  }
  const values = Object.values(questionScores)
  const overall = Number(
    (values.reduce((sum, score) => sum + score, 0) / values.length).toFixed(1)
  )
  return { overall, questionScores, round }
}
