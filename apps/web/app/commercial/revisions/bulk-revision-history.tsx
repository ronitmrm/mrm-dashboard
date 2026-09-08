import Link from "next/link"
import { notFound } from "next/navigation"
import {
  bulkRevisionFields,
  createCommercialRevisionsRepository,
} from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { StatusBadge } from "@workspace/ui/components/badge"
import {
  SectionCard,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import {
  OperationalTable,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@workspace/ui/components/table"
import { Input } from "@workspace/ui/components/input"
import { PageHeader } from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

type Origin = "product" | "customer"
const basePath = (origin: Origin) => `/commercial/${origin}-bulk-revision`
const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 6 })
function inputValue(fieldName: string, value: string | null) {
  const field = Object.entries(bulkRevisionFields).find(
    ([name]) => name === fieldName
  )?.[1]
  if (!field) return "—"
  if (value === null) return "Not recorded"
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return "Not recorded"
  return field.valueType === "percent"
    ? `${number.format(numeric * 100)}%`
    : number.format(numeric)
}
function date(value: string | null) {
  return value
    ? new Date(value).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not recorded"
}
function Pages({
  page,
  total,
  size,
  href,
}: {
  page: number
  total: number
  size: number
  href: (page: number) => string
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
      <span>
        {total} records · Page {page} of {Math.max(1, Math.ceil(total / size))}
      </span>
      {page > 1 && (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page - 1)}>Previous</Link>
        </Button>
      )}
      {page * size < total && (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page + 1)}>Next</Link>
        </Button>
      )}
    </div>
  )
}

export async function BulkRevisionHistory({
  origin,
  page = 1,
}: {
  origin: Origin
  page?: number
}) {
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const history = await repository
    .listCompletedBulkRevisionHistory("MRMPL", origin, page)
    .finally(() => repository.close())
  return (
    <SectionCard id="revision-history">
      <CardHeader>
        <CardTitle>Completed Revision History</CardTitle>
        <CardDescription>
          Read-only records of revisions initiated here, including completion in
          Customer Parameter Costing. Filters apply to this page of history.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <OperationalTable
          excelFilters
          filterStorageKey={`${origin}-bulk-revision-history:${history.page}`}
        >
          <TableHeader>
            <TableRow>
              {[
                "Revision",
                "Customer",
                "Reason",
                "Effective",
                "Completed",
                "Parameter Changes",
                "Published Prices",
                "Details",
              ].map((label) => (
                <TableHead key={label}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.revisionNumber}</TableCell>
                <TableCell>
                  {row.companyName ??
                    (origin === "product"
                      ? "All affected customers"
                      : "All customers")}
                </TableCell>
                <TableCell className="min-w-64 whitespace-normal">
                  {row.reason}
                </TableCell>
                <TableCell>{row.effectiveOn}</TableCell>
                <TableCell>{date(row.completedAt)}</TableCell>
                <TableCell>{row.requestedChangeCount}</TableCell>
                <TableCell>{row.revisedPriceCount}</TableCell>
                <TableCell>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`${basePath(origin)}/history/${row.id}`}>
                      View {row.revisionNumber}
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {history.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  No completed revisions.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </OperationalTable>
        <Pages
          page={history.page}
          total={history.total}
          size={50}
          href={(next) =>
            `${basePath(origin)}?historyPage=${next}#revision-history`
          }
        />
      </CardContent>
    </SectionCard>
  )
}

export async function BulkRevisionHistoryDetail({
  origin,
  revisionId,
  page,
  query,
}: {
  origin: Origin
  revisionId: string
  page?: number
  query?: string
}) {
  await requireCapability(
    commercialCapabilities.revisions.read,
    basePath(origin)
  )
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      revisionId
    )
  )
    notFound()
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const history = await repository
    .getCompletedBulkRevisionHistory("MRMPL", origin, revisionId, {
      page,
      query,
    })
    .finally(() => repository.close())
  if (!history) notFound()
  const { revision, stages, changes } = history
  return (
    <div className="grid gap-4">
      <PageHeader
        title={`${revision.revisionNumber} · Revision History`}
        badge={<StatusBadge value="Completed · Read Only" tone="positive" />}
        description={revision.reason}
        actions={
          <Button asChild variant="outline">
            <Link href={`${basePath(origin)}#revision-history`}>
              Back To {origin === "product" ? "Product" : "Customer"} Bulk
              Revision
            </Link>
          </Button>
        }
      />
      <SectionCard>
        <CardHeader>
          <CardTitle>Publication</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p>
            Initiated from {origin === "product" ? "Product" : "Customer"} Bulk
            Revision{revision.companyName ? ` · ${revision.companyName}` : ""}
          </p>
          <p>
            Effective {revision.effectiveOn} · Completed{" "}
            {date(revision.completedAt)} (IST)
          </p>
          <p>
            {revision.requestedChangeCount} parameter changes ·{" "}
            {revision.revisedPriceCount} published customer price revisions
          </p>
        </CardContent>
      </SectionCard>
      <SectionCard>
        <CardHeader>
          <CardTitle>Requested Parameter Changes</CardTitle>
          <CardDescription>
            Original values come from saved stage evidence or earlier quote
            snapshots. “Not recorded” means historical evidence is unavailable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OperationalTable>
            <TableHeader>
              <TableRow>
                {[
                  "Parameter",
                  "Before Revision",
                  "Requested Value",
                  "Selected",
                  "Skipped",
                  "Notes",
                ].map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {stages.map((stage) => (
                <TableRow key={stage.id}>
                  <TableCell>{stage.fieldLabel}</TableCell>
                  <TableCell>
                    {[
                      ...new Set(
                        stage.oldValues.map((value) =>
                          inputValue(stage.fieldName, value)
                        )
                      ),
                    ].join(", ")}
                  </TableCell>
                  <TableCell>
                    {inputValue(stage.fieldName, stage.newValue)}
                  </TableCell>
                  <TableCell>{stage.selectedCount}</TableCell>
                  <TableCell>{stage.skippedCount}</TableCell>
                  <TableCell className="whitespace-normal">
                    {stage.notes ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
              {stages.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>No saved parameter stages.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>
      <SectionCard>
        <CardHeader>
          <CardTitle>Product And Customer Price Details</CardTitle>
          <CardDescription>
            Includes requested changes, customer decisions and derived parent
            prices. Search covers the full revision.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form className="flex gap-2">
            <Input
              name="q"
              aria-label="Search revision history"
              placeholder="Product UID, customer part, customer or parameter"
              defaultValue={query}
            />
            <Button type="submit">Search</Button>
          </form>
          <OperationalTable>
            <TableHeader>
              <TableRow>
                {[
                  "UID",
                  "Linked Customer",
                  "Linked Customer Part",
                  "Parameter / Decision",
                  "Before Input",
                  "Requested Input",
                  "Earlier Price (USD)",
                  "Published Price (USD)",
                ].map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {changes.rows.map((change) => (
                <TableRow key={change.id}>
                  <TableCell>{change.uid ?? "—"}</TableCell>
                  <TableCell>{change.companyName ?? "—"}</TableCell>
                  <TableCell>{change.customerPartCode ?? "—"}</TableCell>
                  <TableCell>{change.decision ?? change.fieldLabel}</TableCell>
                  <TableCell>
                    {inputValue(change.fieldName, change.oldParameterValue)}
                  </TableCell>
                  <TableCell>
                    {inputValue(change.fieldName, change.newValue)}
                  </TableCell>
                  <TableCell>
                    {change.previousPrice === null
                      ? "—"
                      : number.format(Number(change.previousPrice))}
                  </TableCell>
                  <TableCell>
                    {change.publishedPrice === null
                      ? "—"
                      : number.format(Number(change.publishedPrice))}
                  </TableCell>
                </TableRow>
              ))}
              {changes.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    No matching history records.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </OperationalTable>
          <Pages
            page={changes.page}
            total={changes.total}
            size={100}
            href={(next) =>
              `?page=${next}&q=${encodeURIComponent(query ?? "")}`
            }
          />
        </CardContent>
      </SectionCard>
    </div>
  )
}
