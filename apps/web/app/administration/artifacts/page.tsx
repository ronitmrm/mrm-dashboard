import type { ArtifactLedgerFilters } from "@workspace/db"

import { readArtifactLedger } from "@/lib/artifact-ledger-server"
import { canDeleteArtifacts } from "@/lib/artifact-deletion-server"

import {
  ArtifactLedgerView,
  type ArtifactLedgerViewFilters,
} from "./artifact-ledger-view"

export const dynamic = "force-dynamic"

type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function pageNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function enumValue<const Values extends readonly string[]>(
  value: string | undefined,
  values: Values
) {
  return values.includes(value ?? "") ? (value as Values[number]) : undefined
}

function artifactLedgerFilters(
  searchParams: SearchParams
): ArtifactLedgerViewFilters {
  return {
    dateFrom: first(searchParams.dateFrom)?.trim() || undefined,
    dateTo: first(searchParams.dateTo)?.trim() || undefined,
    mediaType: first(searchParams.mediaType)?.trim() || undefined,
    module: first(searchParams.module)?.trim() || undefined,
    origin: enumValue(first(searchParams.origin), [
      "generated",
      "legacy",
      "uploaded",
    ] as const),
    page: pageNumber(first(searchParams.page), 1),
    pageSize: Math.min(pageNumber(first(searchParams.pageSize), 25), 100),
    purpose: first(searchParams.purpose)?.trim() || undefined,
    search: first(searchParams.search)?.trim() || undefined,
    state: enumValue(first(searchParams.state), [
      "current",
      "deleted",
      "superseded",
    ] as const),
  } satisfies Omit<ArtifactLedgerFilters, "organizationId">
}

export default async function ArtifactLedgerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const filters = artifactLedgerFilters(await searchParams)
  const [ledger, canDelete] = await Promise.all([
    readArtifactLedger(filters),
    canDeleteArtifacts(),
  ])

  return (
    <ArtifactLedgerView
      canDelete={canDelete}
      filters={filters}
      ledger={ledger}
    />
  )
}
