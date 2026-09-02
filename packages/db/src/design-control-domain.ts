const processDefinitions = [
  { aliases: ["machining", "m/c", "machine"], field: "machiningCost", label: "Machining", storageField: "machining_cost" },
  { aliases: ["washing", "wash"], field: "washing", label: "Washing", storageField: "washing" },
  { aliases: ["checking", "inspection", "quality checking"], field: "checking", label: "Checking", storageField: "checking" },
  { aliases: ["marking", "mark"], field: "marking", label: "Marking", storageField: "marking" },
  { aliases: ["plating", "plate"], field: "plating", label: "Plating", storageField: "plating" },
  { aliases: ["annealing", "anneling"], field: "annealing", label: "Annealing", storageField: "annealing" },
  { aliases: ["deburring", "debbring"], field: "deburring", label: "Deburring", storageField: "deburring" },
  { aliases: ["buffing", "buff"], field: "buffing", label: "Buffing", storageField: "buffing" },
  { aliases: ["sealant", "sealing"], field: "sealant", label: "Sealant", storageField: "sealant" },
  {
    aliases: ["assembly", "package process", "package assembly"],
    field: "assemblyOperationCost",
    label: "Package Assembly",
    storageField: "assembly_operation_cost",
  },
] as const

export const designProcessPriceFields = processDefinitions.map(
  ({ field }) => field
)

function normalizedProcess(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

function canonicalProcess(value: string) {
  const normalized = normalizedProcess(value)
  const definition = processDefinitions.find(({ aliases, label }) =>
    [label, ...aliases].some((candidate) =>
      normalizedProcess(candidate) === normalized
    )
  )
  return normalizedProcess(definition?.label ?? value)
}

export function designProcessSelection(input: {
  processesRequired?: readonly string[] | null
}) {
  return new Set(
    (input.processesRequired ?? [])
      .map(canonicalProcess)
      .filter(Boolean)
      .sort()
  )
}

export function processesRequiredFromPayload(
  sourcePayload: Readonly<Record<string, unknown>> | null | undefined
) {
  const value = sourcePayload?.processesRequired
  return Array.isArray(value)
    ? value.filter((process): process is string => typeof process === "string")
    : []
}

function selectedProcessAllowsField(
  selectedProcesses: ReadonlySet<string>,
  definition: (typeof processDefinitions)[number]
) {
  const candidates = [definition.label, ...definition.aliases].map(
    normalizedProcess
  )
  return candidates.some((candidate) => selectedProcesses.has(candidate))
}

export function assertApplicableProcessPrices(input: {
  current: Readonly<Record<string, number | null | undefined>>
  next: Readonly<Record<string, number | null | undefined>>
  selectedProcesses: ReadonlySet<string>
}) {
  for (const definition of processDefinitions) {
    const current = Number(input.current[definition.field] ?? 0)
    const next = Number(input.next[definition.field] ?? current)
    if (
      next !== current &&
      !selectedProcessAllowsField(input.selectedProcesses, definition)
    ) {
      throw new Error(
        `${definition.label} is not selected in the released Design BOM.`
      )
    }
  }
}

export function processFieldIsApplicable(
  field: string,
  selectedProcesses: ReadonlySet<string>
) {
  const definition = processDefinitions.find(
    (candidate) =>
      candidate.field === field || candidate.storageField === field
  )
  return definition
    ? selectedProcessAllowsField(selectedProcesses, definition)
    : true
}

export function drawingRevisionLabel(revision: number) {
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error("Drawing revision must be a non-negative integer.")
  }
  return String(revision).padStart(2, "0")
}

const costDriverKeys = [
  "processesRequired",
  "weight100Pcs",
  "casting",
  "materialGradeId",
  "category",
  "subcategory",
  "productionType",
  "productType",
  "rodTypeId",
  "rodSize",
] as const

function comparable(value: unknown) {
  if (Array.isArray(value)) return JSON.stringify([...value].sort())
  return JSON.stringify(value ?? null)
}

export function classifyDesignCostImpact(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>
) {
  const drivers = costDriverKeys.filter(
    (key) => comparable(before[key]) !== comparable(after[key])
  )
  return { costImpacting: drivers.length > 0, drivers: [...drivers] }
}

export function engineeringChangeStatusAfterApproval(costImpacting: boolean) {
  return costImpacting ? "Pending Product Costing" : "Completed"
}
