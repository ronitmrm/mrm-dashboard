import { AnalysisError, analysisDate } from "./iso-analysis-domain"

export const riskTreatments = [
  "Not assessed",
  "Reduce",
  "Avoid",
  "Share",
  "Accept with controls",
] as const
export type RiskAssessment = {
  process: string
  cause: string
  controls: string
  likelihood: number | null
  severity: number | null
  basis: string
  treatment: (typeof riskTreatments)[number]
  monitoring: string
  frequency: string
  triggers: string
  references: string
}
export type RiskReview = {
  likelihood: number | null
  severity: number | null
  decision:
    | "Continue monitoring"
    | "Further treatment required"
    | "No longer applicable"
  acceptance: string
  authorization: string
}
function text(value: unknown) {
  const result = typeof value === "string" ? value.trim() : ""
  if (result.length > 4000)
    throw new AnalysisError("Risk details must be within 4,000 characters.")
  return result
}
function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
export function riskRating(value: unknown): number | null {
  if (value === "" || value == null) return null
  const rating = Number(value)
  if (![1, 2, 3].includes(rating))
    throw new AnalysisError(
      "Likelihood and severity use the 1–3 scale. Reassess out-of-scale source ratings."
    )
  return rating
}
export function riskScore(likelihood: number | null, severity: number | null) {
  return likelihood && severity ? likelihood * severity : null
}
export function riskPriority(
  likelihood: number | null,
  severity: number | null
) {
  const score = riskScore(likelihood, severity)
  return score === null
    ? "Not assessed"
    : severity === 3 || score >= 6
      ? "High"
      : score >= 3
        ? "Medium"
        : "Low"
}
export function parseRiskAssessment(value: unknown): RiskAssessment {
  const data = object(value)
  const treatment = data.treatment ?? "Not assessed"
  if (!riskTreatments.some((x) => x === treatment))
    throw new AnalysisError("Choose a risk treatment decision.")
  return {
    process: text(data.process),
    cause: text(data.cause),
    controls: text(data.controls),
    likelihood: riskRating(data.likelihood),
    severity: riskRating(data.severity),
    basis: text(data.basis),
    treatment: treatment as RiskAssessment["treatment"],
    monitoring: text(data.monitoring),
    frequency: text(data.frequency),
    triggers: text(data.triggers),
    references: text(data.references),
  }
}
export function requireRiskAssessment(value: RiskAssessment | null) {
  if (
    !value ||
    !value.process ||
    !value.cause ||
    !value.controls ||
    !value.likelihood ||
    !value.severity ||
    !value.basis ||
    value.treatment === "Not assessed" ||
    !value.monitoring ||
    !value.frequency ||
    !value.triggers
  )
    throw new AnalysisError(
      "Complete the process, cause, controls, ratings/basis, treatment and monitoring plan before implementing or verifying risk actions."
    )
}
export function parseRiskReview(
  value: unknown,
  nextReview: unknown,
  verifying: boolean
): RiskReview {
  const data = object(value)
  const decision = data.decision
  if (
    decision !== "Continue monitoring" &&
    decision !== "Further treatment required" &&
    decision !== "No longer applicable"
  )
    throw new AnalysisError("Choose the risk review decision.")
  if (verifying && decision !== "Continue monitoring")
    throw new AnalysisError(
      "Return ineffective work for further treatment; only verified controls can enter monitoring."
    )
  const review: RiskReview = {
    likelihood: riskRating(data.likelihood),
    severity: riskRating(data.severity),
    decision,
    acceptance: text(data.acceptance),
    authorization: text(data.authorization),
  }
  if (!review.acceptance)
    throw new AnalysisError("Record the residual risk decision and its basis.")
  if (decision !== "No longer applicable") {
    if (!review.likelihood || !review.severity || !analysisDate(nextReview))
      throw new AnalysisError("Record residual ratings and a next review date.")
    if (
      decision === "Continue monitoring" &&
      riskPriority(review.likelihood, review.severity) === "High" &&
      !review.authorization
    )
      throw new AnalysisError(
        "High residual risk needs a management authorization reference before acceptance."
      )
  }
  return review
}
