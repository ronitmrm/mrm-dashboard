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

export function designProductName(input: {
  category?: string | null
  size?: string | null
  subcategory?: string | null
}) {
  return [input.size, input.category, input.subcategory]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ")
}

export function designTaskHref(input: {
  enquiryItemId: string
  portfolioMatchStatus: string
}) {
  const reviewHref = `/commercial/design/${input.enquiryItemId}`
  return input.portfolioMatchStatus === "New Quoted Part"
    ? `${reviewHref}/new`
    : reviewHref
}

export function designTaskSavedHref(enquiryItemId: string) {
  return `/commercial/design/${enquiryItemId}/new?saved=1`
}

export function normalizeDesignAllocatedUid(value: string | null | undefined) {
  const normalized = value?.trim()
  return !normalized || normalized.toLowerCase() === "allocated on save"
    ? null
    : normalized
}

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

export function designTaskShouldPrepareCosting(input: {
  completionRequested?: boolean
  designBomCompleted: string
  nextStageStatus: string
}) {
  return (
    (input.completionRequested ?? true) &&
    input.designBomCompleted === "Yes" &&
    ["Not Started", "Changes Required"].includes(input.nextStageStatus)
  )
}

type DesignCompletionBomLine = {
  componentSource: string
  existingProductId?: string | null
  grade?: string | null
  lineNumber: number
  manufacturingProcess?: string | null
  packagePart?: string | null
  pieceWeight?: number | null
  processRequired?: string | null
  quantity: number
}

type DesignTaskCompletionInput = {
  attachmentPurposes: readonly string[]
  bomLines: readonly DesignCompletionBomLine[]
  checkedBy?: string | null
  designBomCompleted: string
  designerName?: string | null
  fixtureApproxCost: number
  fixtureRequired: string
  gaugesRequired: string
  inspectionApproxCost: number
  internalPartCategory?: string | null
  internalPartSize?: string | null
  internalPartSubCategory?: string | null
  itemType: string
  manufacturingProcess?: string | null
  targetCompletionDate?: string | null
  toolingApproxCost: number
  toolingRequired: string
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim())
}

export function designTaskCompletionMissingFields(
  input: DesignTaskCompletionInput
) {
  const missing: string[] = []
  const requiredTextFields = [
    ["Designer", input.designerName],
    ["Target Completion", input.targetCompletionDate],
    ["Internal Part Size", input.internalPartSize],
    ["Internal Category", input.internalPartCategory],
    ["Internal Subcategory", input.internalPartSubCategory],
    ["Production Type", input.manufacturingProcess],
    ["Checked By", input.checkedBy],
  ] as const

  for (const [label, value] of requiredTextFields) {
    if (!hasText(value)) missing.push(label)
  }
  if (input.designBomCompleted !== "Yes") missing.push("BOM Complete")
  if (input.toolingRequired === "Yes" && input.toolingApproxCost <= 0) {
    missing.push("Tooling Approximate Cost")
  }
  if (input.fixtureRequired === "Yes" && input.fixtureApproxCost <= 0) {
    missing.push("Fixture Approximate Cost")
  }
  if (input.gaugesRequired === "Yes" && input.inspectionApproxCost <= 0) {
    missing.push("Inspection Approximate Cost")
  }
  if (!input.bomLines.length) {
    missing.push("BOM Line")
  }
  for (const line of input.bomLines) {
    const prefix = `BOM Line ${line.lineNumber}`
    if (line.quantity <= 0) missing.push(`${prefix} Quantity`)
    if (line.componentSource === "Existing") {
      if (!hasText(line.existingProductId)) {
        missing.push(`${prefix} Existing Product`)
      }
      continue
    }
    if (input.itemType === "Package" && !hasText(line.packagePart)) {
      missing.push(`${prefix} Package Part`)
    }
    if (!hasText(line.grade)) missing.push(`${prefix} Grade`)
    if (!hasText(line.manufacturingProcess)) {
      missing.push(`${prefix} Production Type`)
    }
    if (!line.pieceWeight || line.pieceWeight <= 0) {
      missing.push(`${prefix} 1 Piece Weight ( gm )`)
    }
    if (!hasText(line.processRequired)) {
      missing.push(`${prefix} Pricing Process Columns Required`)
    }
  }

  const attachmentPurposes = new Set(input.attachmentPurposes)
  if (!attachmentPurposes.has("internal_drawing")) {
    missing.push("Internal Drawing")
  }
  if (!attachmentPurposes.has("cad")) missing.push("CAD File")
  return missing
}

export function deriveDesignTaskState(input: {
  completionRequested?: boolean
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
  const completionRequested = input.completionRequested ?? true

  return {
    approvalStatus: "Pending",
    assemblyRequired:
      !isPortfolioMatch && input.itemType === "Package" ? "Yes" : "No",
    designBomCompleted,
    designBomRequired: isPortfolioMatch ? "No" : "Yes",
    designStatus: isPortfolioMatch
      ? "Not Required"
      : designBomCompleted === "Yes" && completionRequested
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
