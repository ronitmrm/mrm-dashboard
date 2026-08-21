export const designStatuses = [
  "Pending Design",
  "In Progress",
  "Need Clarification",
  "Changes Required",
  "Design Complete",
  "Not Required",
] as const

export const designPortfolioDecisions = [
  "Pending",
  "New Quoted Part",
  "Matches Existing Portfolio",
] as const

export function designTaskStatusAfterStart(status: string) {
  if (status === "Pending Design") return "In Progress"
  if (status === "In Progress" || status === "Changes Required") {
    return status
  }

  throw new Error(
    `Design work cannot start from the current status: ${status}.`
  )
}

export function designTaskIsOpen(designStatus: string) {
  return !["Design Complete", "Not Required"].includes(designStatus)
}

export function designTaskIsEditable(input: {
  designStatus: string
  nextStageStatus: string
}) {
  return (
    designTaskIsOpen(input.designStatus) ||
    ["Not Started", "Changes Required"].includes(input.nextStageStatus)
  )
}

export function deriveDesignTaskState(input: {
  designBomCompleted: string
  existingNextStageStatus: string
  itemType: string
  portfolioMatchStatus: string
}) {
  const isPortfolioMatch =
    input.portfolioMatchStatus === "Matches Existing Portfolio"
  const designBomCompleted = isPortfolioMatch
    ? "Yes"
    : input.designBomCompleted === "Yes"
      ? "Yes"
      : "No"

  return {
    approvalStatus: "Pending",
    assemblyRequired:
      !isPortfolioMatch && input.itemType === "Package" ? "Yes" : "No",
    designBomCompleted,
    designBomRequired: isPortfolioMatch ? "No" : "Yes",
    designStatus: isPortfolioMatch
      ? "Not Required"
      : designBomCompleted === "Yes"
        ? "Design Complete"
        : input.portfolioMatchStatus === "New Quoted Part"
          ? "In Progress"
          : "Pending Design",
    isPortfolioMatch,
    nextStageStatus: isPortfolioMatch
      ? "Product Costing Complete"
      : input.existingNextStageStatus,
  }
}
