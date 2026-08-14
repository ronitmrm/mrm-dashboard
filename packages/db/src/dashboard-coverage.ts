import type { ProductionFloorCode } from "./production-floors"

type JsonRecord = Record<string, unknown>

export type CoverageFacts = {
  available: number
  limit: number
  returned: number
  truncated: boolean
}

export type GroupedSourceCoverage = CoverageFacts & {
  groups: Record<string, CoverageFacts>
  truncatedGroups: string[]
}

export type SourceCoverage = {
  corrections: CoverageFacts & {
    truncatedGroups: string[]
  }
  dataEntries: GroupedSourceCoverage
  physicalRows: GroupedSourceCoverage
}

export type SourceCoverageByFloor = Record<ProductionFloorCode, SourceCoverage>

function record(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

function count(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function facts(value: unknown): CoverageFacts {
  const input = record(value)
  const available = count(input.available)
  const returned = count(input.returned)
  return {
    available,
    limit: count(input.limit),
    returned,
    truncated: available > returned,
  }
}

function grouped(value: unknown): GroupedSourceCoverage {
  const input = record(value)
  const groups = Object.fromEntries(
    Object.entries(record(input.groups)).map(([group, value]) => [
      group,
      facts(value),
    ])
  )
  const truncatedGroups = Object.entries(groups)
    .filter(([, value]) => value.truncated)
    .map(([group]) => group)
  return {
    ...facts(input),
    groups,
    truncated: truncatedGroups.length > 0,
    truncatedGroups,
  }
}

export function normalizeSourceCoverage(value: unknown): SourceCoverage {
  const input = record(value)
  const corrections = facts(input.corrections)
  return {
    corrections: {
      ...corrections,
      truncatedGroups: corrections.truncated ? ["corrections"] : [],
    },
    dataEntries: grouped(input.dataEntries),
    physicalRows: grouped(input.physicalRows),
  }
}
