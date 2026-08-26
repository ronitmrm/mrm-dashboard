import type { ArtifactLedgerFilters } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MetricCard,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { SearchableSelect } from "@workspace/ui/components/searchable-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  ExternalLink,
  FileArchive,
  FileDown,
  Files,
  HardDrive,
  Search,
} from "lucide-react"

import { ArtifactDeleteControl } from "./artifact-delete-control"

type Ledger = Awaited<
  ReturnType<
    ReturnType<
      (typeof import("@workspace/db"))["createArtifactLedgerRepository"]
    >["list"]
  >
>

export type ArtifactLedgerViewFilters = Omit<
  ArtifactLedgerFilters,
  "organizationId"
>

function byteSize(value: number) {
  if (value >= 1024 ** 3) {
    return `${Number((value / 1024 ** 3).toFixed(1))} GB`
  }
  if (value >= 1024 ** 2) {
    return `${Number((value / 1024 ** 2).toFixed(1))} MB`
  }
  if (value >= 1024) return `${Number((value / 1024).toFixed(1))} KB`
  return `${value} B`
}

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function ledgerHref(filters: ArtifactLedgerViewFilters, page: number) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries({ ...filters, page })) {
    if (value !== undefined && value !== "" && key !== "organizationId") {
      params.set(key, String(value))
    }
  }
  return `/administration/artifacts?${params.toString()}`
}

function lifecycleVariant(state: Ledger["rows"][number]["lifecycleState"]) {
  if (state === "deleted") return "destructive" as const
  if (state === "superseded") return "secondary" as const
  return "outline" as const
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value))
}

export function ArtifactLedgerView({
  canDelete,
  filters,
  ledger,
}: {
  canDelete: boolean
  filters: ArtifactLedgerViewFilters
  ledger: Ledger
}) {
  const previousPage = Math.max(1, ledger.page - 1)
  const nextPage = Math.min(ledger.totalPages, ledger.page + 1)

  return (
    <div className="grid gap-4">
      <section className="grid gap-1">
        <div className="flex items-center gap-2">
          <FileArchive className="size-5 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-semibold tracking-tight">Artifacts</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Canonical uploaded and generated files for your Organization, with
          audited lifecycle history.
        </p>
      </section>

      <section
        aria-label="Artifact storage summary"
        className="grid gap-2 sm:grid-cols-3"
      >
        <MetricCard
          description={`${ledger.totals.livePhysicalObjects} live physical object${ledger.totals.livePhysicalObjects === 1 ? "" : "s"}`}
          icon={<HardDrive className="size-4" aria-hidden="true" />}
          label="Unique live storage"
          value={`${byteSize(ledger.totals.uniqueLiveBytes)} of ${byteSize(ledger.totals.allowanceBytes)}`}
        />
        <MetricCard
          description="Uploaded and generated records"
          icon={<Files className="size-4" aria-hidden="true" />}
          label="Logical Artifacts"
          value={ledger.totals.logicalArtifacts.toLocaleString("en-IN")}
        />
        <MetricCard
          description={`${ledger.totalArtifacts.toLocaleString("en-IN")} match the current filters`}
          icon={<Search className="size-4" aria-hidden="true" />}
          label="Filtered results"
          value={`${ledger.page} / ${ledger.totalPages}`}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Search and filters</CardTitle>
          <CardDescription>
            Search filenames or linked business records. Filters and paging run
            on the server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-4" method="get">
            <label className="grid gap-1 text-xs font-medium md:col-span-2">
              Search
              <Input
                defaultValue={filters.search}
                name="search"
                placeholder="Filename, quote, enquiry, PO, candidate..."
                type="search"
              />
            </label>
            <FilterSelect
              label="Module"
              name="module"
              options={[
                ["commercial", "Commercial"],
                ["hr", "HR"],
                ["store", "Store"],
              ]}
              value={filters.module}
            />
            <label className="grid gap-1 text-xs font-medium">
              Purpose
              <Input
                defaultValue={filters.purpose}
                name="purpose"
                placeholder="e.g. issued_quote_pdf"
              />
            </label>
            <FilterSelect
              label="Origin"
              name="origin"
              options={[
                ["uploaded", "Uploaded"],
                ["generated", "Generated"],
                ["legacy", "Legacy"],
              ]}
              value={filters.origin}
            />
            <FilterSelect
              label="State"
              name="state"
              options={[
                ["current", "Current"],
                ["superseded", "Superseded"],
                ["deleted", "Deleted"],
              ]}
              value={filters.state}
            />
            <label className="grid gap-1 text-xs font-medium">
              Media type
              <Input
                defaultValue={filters.mediaType}
                name="mediaType"
                placeholder="application/pdf"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              From
              <Input
                defaultValue={filters.dateFrom}
                name="dateFrom"
                type="date"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              To
              <Input defaultValue={filters.dateTo} name="dateTo" type="date" />
            </label>
            <input name="pageSize" type="hidden" value={ledger.pageSize} />
            <div className="flex items-end gap-2 md:col-span-3">
              <Button type="submit">Apply filters</Button>
              <Button asChild type="button" variant="outline">
                <a href="/administration/artifacts">Reset</a>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Artifact ledger</CardTitle>
          <CardDescription>
            Logical records remain visible across current, superseded, and
            deleted lifecycle states.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 px-0">
          <Table className="min-w-[1120px]">
            <TableHeader>
              <TableRow>
                <TableHead>Artifact</TableHead>
                <TableHead>Lifecycle</TableHead>
                <TableHead>Business usages</TableHead>
                <TableHead>Physical storage</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.rows.map((artifact) => (
                <TableRow key={artifact.id}>
                  <TableCell className="max-w-72 whitespace-normal">
                    <div className="grid gap-1">
                      <span className="font-medium">{artifact.fileName}</span>
                      <span className="text-xs text-muted-foreground">
                        {artifact.mediaType ?? "Unknown media type"} ·{" "}
                        {byteSize(artifact.byteSize)}
                      </span>
                      <code
                        className="truncate text-[10px] text-muted-foreground"
                        title={artifact.sha256}
                      >
                        SHA-256 {artifact.sha256}
                      </code>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex max-w-44 flex-wrap gap-1">
                      <Badge
                        variant={lifecycleVariant(artifact.lifecycleState)}
                      >
                        {label(artifact.lifecycleState)}
                      </Badge>
                      <Badge variant="outline">{label(artifact.origin)}</Badge>
                      <Badge variant="outline">
                        Provider {label(artifact.providerState)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-96 whitespace-normal">
                    <ul className="grid gap-2">
                      {artifact.usages.map((usage) => (
                        <li
                          className="grid gap-0.5"
                          key={`${usage.targetSchema}.${usage.targetTable}:${usage.targetId}:${usage.purpose}`}
                        >
                          <span className="font-medium">
                            {usage.businessRecord}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {label(usage.module)} · {label(usage.purpose)} · v
                            {usage.version}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="grid gap-1">
                      <span className="font-medium tabular-nums">
                        {artifact.physicalReferenceCount} logical reference
                        {artifact.physicalReferenceCount === 1 ? "" : "s"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {artifact.modules.map(label).join(", ")} ·{" "}
                        {artifact.purposes.map(label).join(", ")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="grid gap-1">
                      <span>{dateTime(artifact.createdAt)}</span>
                      <span className="text-xs text-muted-foreground">
                        {artifact.actorName ?? artifact.actorEmail ?? "System"}
                      </span>
                      {artifact.deletedAt ? (
                        <span className="text-xs text-muted-foreground">
                          Deleted {dateTime(artifact.deletedAt)} by{" "}
                          {artifact.deletedByName ??
                            artifact.deletedByEmail ??
                            "System"}
                          {artifact.deletionReason
                            ? ` · ${artifact.deletionReason}`
                            : ""}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {artifact.publicUrl ? (
                        <>
                          <Button asChild size="xs" variant="outline">
                            <a
                              href={artifact.publicUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <ExternalLink aria-hidden="true" />
                              {artifact.previewKind === "none"
                                ? "Open"
                                : "Preview"}
                            </a>
                          </Button>
                          <Button asChild size="xs" variant="ghost">
                            <a
                              download={artifact.fileName}
                              href={artifact.publicUrl}
                            >
                              <FileDown aria-hidden="true" />
                              Download
                            </a>
                          </Button>
                        </>
                      ) : (
                        <Badge variant="secondary">Unavailable</Badge>
                      )}
                      {canDelete && artifact.lifecycleState !== "deleted" ? (
                        <ArtifactDeleteControl
                          artifactId={artifact.id}
                          fileName={artifact.fileName}
                          issued={artifact.purposes.some((purpose) =>
                            [
                              "issued_quote_pdf",
                              "issued_pi_pdf",
                              "issued_pi_xlsx",
                              "issued_store_purchase_order_pdf",
                            ].includes(purpose)
                          )}
                        />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {ledger.rows.length === 0 ? (
                <TableRow>
                  <TableCell className="h-28 text-center" colSpan={6}>
                    No Artifacts match these filters.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between gap-3 px-6">
            <p className="text-xs text-muted-foreground">
              Page {ledger.page} of {ledger.totalPages} ·{" "}
              {ledger.totalArtifacts.toLocaleString("en-IN")} result
              {ledger.totalArtifacts === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              {ledger.page <= 1 ? (
                <Button disabled size="sm" variant="outline">
                  Previous
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <a href={ledgerHref(filters, previousPage)}>Previous</a>
                </Button>
              )}
              {ledger.page >= ledger.totalPages ? (
                <Button disabled size="sm" variant="outline">
                  Next
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <a href={ledgerHref(filters, nextPage)}>Next</a>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function FilterSelect({
  label: selectLabel,
  name,
  options,
  value,
}: {
  label: string
  name: string
  options: readonly (readonly [string, string])[]
  value?: string
}) {
  return (
    <label className="grid gap-1 text-xs font-medium">
      {selectLabel}
      <SearchableSelect
        aria-label={selectLabel}
        defaultValue={value ?? ""}
        name={name}
      >
        <option value="">All</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </SearchableSelect>
    </label>
  )
}
